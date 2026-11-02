/**
 * Prueba de concurrencia de inventory-service (adaptada de app-base/test-concurrencia.js).
 *
 * Lanza compras SIMULTÁNEAS contra POST /api/inventario/:libroId/descontar y verifica
 * que el lock distribuido en Redis evita la sobreventa:
 *   - nunca se aceptan más descuentos que unidades disponibles;
 *   - el stock final nunca es negativo y cuadra con los descuentos aceptados.
 *
 * Uso (con el servicio levantado):
 *   npm run test:concurrencia
 *   INVENTORY_SERVICE_URL=http://localhost:3002 COMPRADORES=20 STOCK_INICIAL=5 npm run test:concurrencia
 *
 * TP7: las operaciones de escritura requieren JWT. El script inicia sesión en auth-service
 * con el ADMIN inicial (para alta y reposición) y con un USER (para descontar), y además
 * verifica los rechazos de seguridad: sin token -> 401 y USER reponiendo stock -> 403.
 * Si auth-service no responde, firma tokens locales con JWT_SECRET (solo para pruebas).
 *
 * Variables opcionales:
 *   INVENTORY_SERVICE_URL  URL base del servicio (por defecto http://localhost:3002)
 *   AUTH_SERVICE_URL       URL de auth-service (por defecto http://localhost:3004)
 *   ADMIN_EMAIL / ADMIN_PASSWORD, USER_EMAIL / USER_PASSWORD  credenciales de prueba
 *   JWT_SECRET / JWT_ISSUER  solo para el token local de respaldo
 *   LIBRO_ID               libro a usar; si no se indica se crea un registro de prueba
 *   STOCK_INICIAL          unidades al empezar la prueba 2 (por defecto 5)
 *   COMPRADORES            compras simultáneas de la prueba 2 (por defecto 20)
 *
 * Sale con código 1 si detecta sobreventa, así puede usarse como verificación automática.
 */
require('dotenv').config();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const BASE = (process.env.INVENTORY_SERVICE_URL || 'http://localhost:3002').replace(/\/$/, '');
const AUTH = (process.env.AUTH_SERVICE_URL || 'http://localhost:3004').replace(/\/$/, '');
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@libreria.com', password: process.env.ADMIN_PASSWORD || 'Admin1234!' };
const USER = { email: process.env.USER_EMAIL || 'cliente@libreria.com', password: process.env.USER_PASSWORD || 'Cliente123!' };
const STOCK_INICIAL = parseInt(process.env.STOCK_INICIAL, 10) || 5;
const COMPRADORES = parseInt(process.env.COMPRADORES, 10) || 20;
const LINEA = '━'.repeat(64);

const tokens = { admin: null, user: null };

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json', 'x-request-id': crypto.randomUUID() };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

/** Login en auth-service; si el USER no existe lo registra. Si auth no responde, token local. */
async function obtenerToken({ email, password }, rol) {
  try {
    let login = await request('POST', `${AUTH}/api/auth/login`, { email, password });
    if (login.status === 401 && rol === 'USER') {
      await request('POST', `${AUTH}/api/auth/register`, { email, password, nombre: 'Cliente de prueba' });
      login = await request('POST', `${AUTH}/api/auth/login`, { email, password });
    }
    if (login.status === 200 && login.data?.accessToken) {
      console.log(`   Login ${rol} en auth-service -> 200 (${email})`);
      return login.data.accessToken;
    }
    throw new Error(`login ${rol} respondió HTTP ${login.status}`);
  } catch (err) {
    console.warn(`   ⚠️ auth-service no disponible para ${rol} (${err.message}). Se usa un token local de respaldo.`);
    return jwt.sign(
      { sub: crypto.randomBytes(12).toString('hex'), email, role: rol },
      process.env.JWT_SECRET || 'dev_jwt_secret_grupo1_cambiar_en_entorno_real_2026',
      { algorithm: 'HS256', expiresIn: '15m', issuer: process.env.JWT_ISSUER || 'auth-service-grupo1' }
    );
  }
}

async function prepararLibro() {
  const libroId = process.env.LIBRO_ID || crypto.randomBytes(12).toString('hex');
  const alta = await request('POST', '/api/inventario', { libroId, stockInicial: 0 }, tokens.admin);
  if (alta.status !== 201 && alta.status !== 409) {
    throw new Error(`No se pudo preparar el stock de prueba (HTTP ${alta.status}): ${JSON.stringify(alta.data)}`);
  }
  return libroId;
}

async function fijarStock(libroId, stock) {
  const res = await request('POST', `/api/inventario/${libroId}/reponer`, { stock }, tokens.admin);
  if (res.status !== 200) throw new Error(`No se pudo fijar el stock (HTTP ${res.status}): ${JSON.stringify(res.data)}`);
}

async function compraSimultanea(libroId, cantidadCompradores) {
  const t0 = Date.now();
  const respuestas = await Promise.all(
    Array.from({ length: cantidadCompradores }, (_, i) =>
      request('POST', `/api/inventario/${libroId}/descontar`, { cantidad: 1, clienteId: `cliente-${i + 1}` }, tokens.user)
    )
  );
  const duracionMs = Date.now() - t0;

  const porStatus = respuestas.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  const final = (await request('GET', `/api/inventario/${libroId}`)).data;
  return { respuestas, porStatus, duracionMs, stockFinal: final.stockDisponible };
}

function informar({ porStatus, duracionMs, stockFinal }, stockInicial, compradores) {
  const aceptadas = porStatus[200] || 0;
  console.log(`   Compras lanzadas a la vez: ${compradores} · duración total: ${duracionMs} ms`);
  console.log(`   200 aceptadas: ${aceptadas} · 400 sin stock: ${porStatus[400] || 0} · 409 lock ocupado: ${porStatus[409] || 0}`);
  const otros = Object.keys(porStatus).filter((s) => !['200', '400', '409'].includes(s));
  if (otros.length) console.log(`   Otros status: ${otros.map((s) => `${s} x${porStatus[s]}`).join(', ')}`);
  console.log(`   Stock inicial: ${stockInicial} · stock final: ${stockFinal}`);

  const sinSobreventa = aceptadas <= stockInicial && stockFinal >= 0 && stockFinal === stockInicial - aceptadas;
  console.log(sinSobreventa ? '   ✅ SIN SOBREVENTA: el stock cuadra con las compras aceptadas.' : '   ❌ SOBREVENTA O INCONSISTENCIA DETECTADA');
  return sinSobreventa;
}

async function main() {
  console.log(LINEA);
  console.log('🧪 PRUEBA DE SEGURIDAD Y CONCURRENCIA — inventory-service (JWT + Redis Lock)');
  console.log(`   Servicio: ${BASE}`);
  console.log(LINEA);

  const health = await request('GET', '/health');
  console.log(`   /health -> ${health.status} ${JSON.stringify(health.data)}`);
  if (health.data?.dependencias?.redis !== 'up' || health.data?.dependencias?.mongodb !== 'up') {
    console.error('   ⚠️ MongoDB o Redis no están disponibles. Levantalos antes de correr la prueba.');
    process.exit(1);
  }

  tokens.admin = await obtenerToken(ADMIN, 'ADMIN');
  tokens.user = await obtenerToken(USER, 'USER');

  const libroId = await prepararLibro();
  console.log(`   Libro de prueba: ${libroId}\n`);

  console.log(LINEA);
  console.log('🔐 PRUEBA 0: seguridad JWT / RBAC');
  console.log(LINEA);
  const sinToken = await request('POST', `/api/inventario/${libroId}/descontar`, { cantidad: 1 });
  const userRepone = await request('POST', `/api/inventario/${libroId}/reponer`, { cantidad: 1 }, tokens.user);
  const tokenFalso = await request('POST', `/api/inventario/${libroId}/descontar`, { cantidad: 1 }, 'token.invalido.x');
  const consultaPublica = await request('GET', `/api/inventario/${libroId}`);
  const seg = [
    [sinToken.status === 401, `descontar sin token -> ${sinToken.status} ${sinToken.data?.codigo || ''} (esperado 401)`],
    [tokenFalso.status === 401, `descontar con token inválido -> ${tokenFalso.status} ${tokenFalso.data?.codigo || ''} (esperado 401)`],
    [userRepone.status === 403, `USER intenta reponer -> ${userRepone.status} ${userRepone.data?.codigo || ''} (esperado 403)`],
    [consultaPublica.status === 200, `GET público sin token -> ${consultaPublica.status} (esperado 200)`]
  ];
  seg.forEach(([ok, texto]) => console.log(`   ${ok ? '✅' : '❌'} ${texto}`));
  const ok0 = seg.every(([ok]) => ok);
  console.log('');

  console.log(LINEA);
  console.log('🟢 PRUEBA 1: dos clientes compran el ÚLTIMO ejemplar al mismo tiempo');
  console.log(LINEA);
  await fijarStock(libroId, 1);
  const p1 = await compraSimultanea(libroId, 2);
  p1.respuestas.forEach((r, i) => console.log(`   Cliente ${i + 1}: HTTP ${r.status} ${r.data?.codigo || ''}`));
  const ok1 = informar(p1, 1, 2);

  console.log(`\n${LINEA}`);
  console.log(`🟢 PRUEBA 2: ${COMPRADORES} compras simultáneas con ${STOCK_INICIAL} unidades`);
  console.log(LINEA);
  await fijarStock(libroId, STOCK_INICIAL);
  const p2 = await compraSimultanea(libroId, COMPRADORES);
  const ok2 = informar(p2, STOCK_INICIAL, COMPRADORES);

  const lock = await request('GET', `/api/inventario/${libroId}/lock-status`);
  console.log(`\n   lock-status al terminar: bloqueado=${lock.data?.bloqueado} (el lock se liberó)`);

  console.log(`\n${LINEA}`);
  console.log(ok0 && ok1 && ok2 ? '✅ RESULTADO: seguridad correcta y sin sobreventa en ninguna prueba.' : '❌ RESULTADO: alguna verificación falló.');
  console.log(LINEA);
  process.exit(ok0 && ok1 && ok2 ? 0 : 1);
}

main().catch((err) => {
  console.error(`❌ Error ejecutando la prueba: ${err.message}`);
  console.error(`   ¿Está inventory-service levantado en ${BASE}?`);
  process.exit(1);
});
