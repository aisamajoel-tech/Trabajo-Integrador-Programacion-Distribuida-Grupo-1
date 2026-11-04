/**
 * Prueba de punta a punta de orders-service (con auth-service, catalog-service e inventory-service levantados).
 *
 * TP7: todas las llamadas protegidas usan JWT obtenido en auth-service:
 *  - token ADMIN  -> crear el libro (catalog) y crear/reponer stock (inventory);
 *  - token USER   -> comprar (orders), que propaga el mismo Bearer a inventory.
 *
 *  1. Compra simple: una orden CONFIRMADA (201).
 *  2. Rechazos: libro inexistente (404) y stock insuficiente (409).
 *  3. Compras simultáneas a través de orders: nunca se confirman más órdenes que unidades
 *     y el stock final cuadra con las órdenes CONFIRMADAS.
 *
 * Uso:
 *   npm run test:compra
 *   ORDERS_SERVICE_URL=http://localhost:3003 COMPRADORES=15 STOCK_INICIAL=4 npm run test:compra
 *
 * Variables opcionales: ORDERS_SERVICE_URL (3003), CATALOG_SERVICE_URL (3001),
 * INVENTORY_SERVICE_URL (3002), AUTH_SERVICE_URL (3004), COMPRADORES (15), STOCK_INICIAL (4),
 * ADMIN_EMAIL / ADMIN_PASSWORD y USER_EMAIL / USER_PASSWORD (mismos valores por defecto que el seed).
 * Sale con código 1 si algo no cuadra.
 */
require('dotenv').config();
const crypto = require('crypto');

const url = (v, def) => (process.env[v] || def).replace(/\/$/, '');
const ORDERS = url('ORDERS_SERVICE_URL', 'http://localhost:3003');
const CATALOG = url('CATALOG_SERVICE_URL', 'http://localhost:3001');
const INVENTORY = url('INVENTORY_SERVICE_URL', 'http://localhost:3002');
const AUTH = url('AUTH_SERVICE_URL', 'http://localhost:3004');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@libreria.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin1234!';
const USER_EMAIL = process.env.USER_EMAIL || 'cliente@libreria.com';
const USER_PASSWORD = process.env.USER_PASSWORD || 'Cliente123!';
const COMPRADORES = parseInt(process.env.COMPRADORES, 10) || 15;
const STOCK_INICIAL = parseInt(process.env.STOCK_INICIAL, 10) || 4;
const LINEA = '━'.repeat(64);

// Tokens que se completan en login(): { admin, user, userId }
const sesion = {};

async function request(method, fullUrl, body, token) {
  const res = await fetch(fullUrl, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': `test-${crypto.randomUUID()}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function login() {
  const admin = await request('POST', `${AUTH}/api/auth/login`, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (admin.status !== 200) throw new Error(`Login ADMIN falló (HTTP ${admin.status}): ${JSON.stringify(admin.data)}`);
  sesion.admin = admin.data.accessToken;

  // Registro idempotente del USER de prueba (201 la primera vez, 409 si ya existía)
  await request('POST', `${AUTH}/api/auth/register`, { email: USER_EMAIL, password: USER_PASSWORD, nombre: 'Cliente de prueba' });
  const user = await request('POST', `${AUTH}/api/auth/login`, { email: USER_EMAIL, password: USER_PASSWORD });
  if (user.status !== 200) throw new Error(`Login USER falló (HTTP ${user.status}): ${JSON.stringify(user.data)}`);
  sesion.user = user.data.accessToken;
  sesion.userId = user.data.usuario.id;
  console.log(`   Login ADMIN ${ADMIN_EMAIL} -> 200 · Login USER ${USER_EMAIL} -> 200 (sub ${sesion.userId})`);
}

// La compra la hace el USER: la orden queda a nombre del `sub` de su token
const comprar = (libroId, cantidad) => request('POST', `${ORDERS}/api/ordenes`, { libroId, cantidad }, sesion.user);

async function prepararLibro() {
  const isbn = `978${String(Date.now()).slice(-10)}`;
  const libro = await request('POST', `${CATALOG}/api/libros`, {
    titulo: 'Libro de prueba de órdenes',
    autor: 'Grupo 1',
    año: 2026,
    genero: 'Otro',
    isbn
  }, sesion.admin);
  if (libro.status !== 201) throw new Error(`No se pudo crear el libro (HTTP ${libro.status}): ${JSON.stringify(libro.data)}`);
  const libroId = libro.data.id || libro.data._id;

  const stock = await request('POST', `${INVENTORY}/api/inventario`, { libroId, stockInicial: 0 }, sesion.admin);
  if (stock.status !== 201) throw new Error(`No se pudo crear el stock (HTTP ${stock.status}): ${JSON.stringify(stock.data)}`);
  return libroId;
}

async function fijarStock(libroId, stock) {
  const r = await request('POST', `${INVENTORY}/api/inventario/${libroId}/reponer`, { stock }, sesion.admin);
  if (r.status !== 200) throw new Error(`No se pudo fijar el stock (HTTP ${r.status})`);
}

const stockActual = async (libroId) => (await request('GET', `${INVENTORY}/api/inventario/${libroId}`)).data.stockDisponible;

function check(condicion, texto) {
  console.log(`   ${condicion ? '✅' : '❌'} ${texto}`);
  return condicion;
}

async function main() {
  console.log(LINEA);
  console.log('🧪 PRUEBA DE COMPRAS — orders-service');
  console.log(`   auth: ${AUTH} · orders: ${ORDERS} · catalog: ${CATALOG} · inventory: ${INVENTORY}`);
  console.log(LINEA);

  for (const [nombre, base] of [['auth', AUTH], ['orders', ORDERS], ['catalog', CATALOG], ['inventory', INVENTORY]]) {
    const h = await request('GET', `${base}/health`);
    console.log(`   ${nombre}/health -> ${h.status} ${JSON.stringify(h.data)}`);
  }

  await login();
  const libroId = await prepararLibro();
  console.log(`   Libro de prueba: ${libroId}\n`);
  const resultados = [];

  console.log(LINEA);
  console.log('🟢 PRUEBA 1: compra simple');
  console.log(LINEA);
  await fijarStock(libroId, 2);
  const ok = await comprar(libroId, 1);
  console.log(`   POST /api/ordenes -> ${ok.status} ${ok.data?.estado} (ordenId ${ok.data?.ordenId})`);
  resultados.push(check(ok.status === 201 && ok.data?.estado === 'CONFIRMADA', 'Orden CONFIRMADA con 201'));
  resultados.push(check(ok.data?.clienteId === sesion.userId, 'La orden quedó a nombre del sub del token USER'));
  const consulta = await request('GET', `${ORDERS}/api/ordenes/${ok.data?.ordenId}`, null, sesion.user);
  resultados.push(check(consulta.status === 200 && consulta.data?.libroSnapshot?.titulo, 'GET /api/ordenes/:id devuelve la orden con libroSnapshot'));
  const sinToken = await request('POST', `${ORDERS}/api/ordenes`, { libroId, cantidad: 1 });
  resultados.push(check(sinToken.status === 401, `Compra sin token -> ${sinToken.status} (401 esperado)`));

  console.log(`\n${LINEA}`);
  console.log('🟠 PRUEBA 2: rechazos');
  console.log(LINEA);
  const inexistente = await comprar('6712e8f0c3b2a9e4d1f0ffff', 1);
  console.log(`   Libro inexistente -> ${inexistente.status} ${inexistente.data?.motivoRechazo}`);
  resultados.push(check(inexistente.status === 404 && inexistente.data?.motivoRechazo === 'LIBRO_INEXISTENTE', '404 LIBRO_INEXISTENTE'));
  const sinStock = await comprar(libroId, 50);
  console.log(`   Pedir 50 unidades -> ${sinStock.status} ${sinStock.data?.motivoRechazo}`);
  resultados.push(check(sinStock.status === 409 && sinStock.data?.motivoRechazo === 'SIN_STOCK', '409 SIN_STOCK'));
  const invalida = await comprar(libroId, 0);
  resultados.push(check(invalida.status === 400, `Body inválido -> ${invalida.status} (no se crea orden)`));

  console.log(`\n${LINEA}`);
  console.log(`🟢 PRUEBA 3: ${COMPRADORES} compras simultáneas con ${STOCK_INICIAL} unidades`);
  console.log(LINEA);
  await fijarStock(libroId, STOCK_INICIAL);
  const t0 = Date.now();
  const respuestas = await Promise.all(
    Array.from({ length: COMPRADORES }, () => comprar(libroId, 1))
  );
  const porMotivo = respuestas.reduce((acc, r) => {
    const clave = r.status === 201 ? 'CONFIRMADA' : r.data?.motivoRechazo || `HTTP ${r.status}`;
    return { ...acc, [clave]: (acc[clave] || 0) + 1 };
  }, {});
  const confirmadas = porMotivo.CONFIRMADA || 0;
  const final = await stockActual(libroId);
  console.log(`   Duración: ${Date.now() - t0} ms · resultados: ${JSON.stringify(porMotivo)}`);
  console.log(`   Stock inicial: ${STOCK_INICIAL} · órdenes CONFIRMADAS: ${confirmadas} · stock final: ${final}`);
  resultados.push(check(confirmadas <= STOCK_INICIAL, 'Nunca se confirman más órdenes que unidades'));
  resultados.push(check(final === STOCK_INICIAL - confirmadas && final >= 0, 'El stock final cuadra con las órdenes confirmadas'));

  const historial = await request('GET', `${ORDERS}/api/ordenes/cliente/${sesion.userId}`, null, sesion.user);
  resultados.push(check(historial.status === 200 && historial.data.length >= COMPRADORES, 'Cada intento quedó registrado como orden (historial del USER)'));

  const todoOk = resultados.every(Boolean);
  console.log(`\n${LINEA}`);
  console.log(todoOk ? '✅ RESULTADO: todas las verificaciones pasaron.' : '❌ RESULTADO: alguna verificación falló.');
  console.log(LINEA);
  process.exit(todoOk ? 0 : 1);
}

main().catch((err) => {
  console.error(`❌ Error ejecutando la prueba: ${err.message}`);
  console.error('   ¿Están levantados auth-service, orders-service, catalog-service e inventory-service?');
  process.exit(1);
});
