/**
 * Script reproducible de inicialización de datos de prueba (TP6 / TP7 - Grupo 1)
 * Responsable: Joel Aisama (@aisamajoel-tech) — Issues #11 y #26
 *
 * Regla arquitectónica y de seguridad (TP7):
 * 1. Nunca accede directamente a las bases de datos (`db_auth`, `db_catalog`, `db_inventory`).
 * 2. Se autentica contra `auth-service` (`POST /api/auth/login`) con el usuario `ADMIN` inicial
 *    (`admin@libreria.com`) y registra/autentica un usuario `USER` de prueba (`cliente@libreria.com`).
 *    (Si `auth-service` aún no está levantado en una prueba parcial, firma un token temporal compatible con `JWT_SECRET`).
 * 3. Crea las 5 obras en `catalog-service` (`POST /api/libros`) e inicializa su stock en
 *    `inventory-service` (`POST /api/inventario`) enviando `Authorization: Bearer <token_admin>`.
 */

const crypto = require('crypto');

const AUTH_SERVICE_URL = (process.env.AUTH_SERVICE_URL || 'http://localhost:3004').replace(/\/$/, '');
const CATALOG_SERVICE_URL = (process.env.CATALOG_SERVICE_URL || 'http://localhost:3001').replace(/\/$/, '');
const INVENTORY_SERVICE_URL = (process.env.INVENTORY_SERVICE_URL || 'http://localhost:3002').replace(/\/$/, '');
const HTTP_TIMEOUT_MS = parseInt(process.env.HTTP_TIMEOUT_MS, 10) || 5000;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@libreria.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin1234!';
const USER_EMAIL = process.env.USER_EMAIL || 'cliente@libreria.com';
const USER_PASSWORD = process.env.USER_PASSWORD || 'Cliente123!';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_grupo1_cambiar_en_entorno_real_2026';
const JWT_ISSUER = process.env.JWT_ISSUER || 'auth-service-grupo1';

const LIBROS_SEMILLA = [
  {
    titulo: 'Cien años de soledad',
    autor: 'Gabriel García Márquez',
    año: 1967,
    genero: 'Novela',
    isbn: '978-0307474728',
    stockInicial: 1
  },
  {
    titulo: 'Don Quijote de la Mancha',
    autor: 'Miguel de Cervantes',
    año: 1605,
    genero: 'Novela',
    isbn: '978-8424115104',
    stockInicial: 5
  },
  {
    titulo: '1984',
    autor: 'George Orwell',
    año: 1949,
    genero: 'Ficción',
    isbn: '978-0451524935',
    stockInicial: 2
  },
  {
    titulo: 'Rayuela',
    autor: 'Julio Cortázar',
    año: 1963,
    genero: 'Novela',
    isbn: '978-8437604572',
    stockInicial: 4
  },
  {
    titulo: 'El Aleph',
    autor: 'Jorge Luis Borges',
    año: 1949,
    genero: 'Ficción',
    isbn: '978-8420633114',
    stockInicial: 3
  }
];

function generarJwtFallbackAdmin() {
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const ahora = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({
    sub: '000000000000000000000001',
    email: ADMIN_EMAIL,
    role: 'ADMIN',
    iss: JWT_ISSUER,
    iat: ahora,
    exp: ahora + 3600
  });
  const firma = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${firma}`;
}

async function prepararUsuariosYObtenerTokenAdmin() {
  try {
    // 1. Login del usuario ADMIN inicial (creado por bootstrap en auth-service)
    const resLoginAdmin = await fetch(`${AUTH_SERVICE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    });

    let adminToken = null;
    if (resLoginAdmin.ok) {
      const dataAdmin = await resLoginAdmin.json();
      adminToken = dataAdmin.accessToken;
      console.log(`  [Auth] 200 Login ADMIN exitoso -> ${ADMIN_EMAIL} (rol: ${dataAdmin.usuario?.role || 'ADMIN'})`);
    }

    // 2. Asegurar usuario de prueba con rol USER (idempotente)
    const resRegUser = await fetch(`${AUTH_SERVICE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: USER_EMAIL,
        password: USER_PASSWORD,
        nombre: 'Cliente Demo TP7'
      }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    });

    if (resRegUser.status === 201) {
      console.log(`  [Auth] 201 Usuario USER registrado -> ${USER_EMAIL}`);
    } else if (resRegUser.status === 409) {
      console.log(`  [Auth] 409 Usuario USER ya existente -> ${USER_EMAIL}`);
    }

    if (adminToken) return adminToken;
  } catch (err) {
    console.warn(`  [Auth] auth-service no disponible en ${AUTH_SERVICE_URL} (${err.message}). Usando token ADMIN local de respaldo.`);
  }

  return generarJwtFallbackAdmin();
}

async function crearLibroEnCatalogo(libro, requestId, adminToken) {
  const { titulo, autor, año, genero, isbn } = libro;
  const url = `${CATALOG_SERVICE_URL}/api/libros`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      'x-request-id': requestId
    },
    body: JSON.stringify({ titulo, autor, año, genero, isbn }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
  });

  if (res.status === 201) {
    const creado = await res.json();
    const id = creado.id || creado._id;
    console.log(`  [Catálogo]  201 Created -> "${titulo}" (ID: ${id})`);
    return id;
  }

  if (res.status === 409) {
    const listRes = await fetch(url, {
      headers: { 'x-request-id': requestId },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    });
    if (listRes.ok) {
      const lista = await listRes.json();
      const existente = lista.find((item) => item.isbn === isbn);
      if (existente) {
        const id = existente.id || existente._id;
        console.log(`  [Catálogo]  409 Ya registrado -> "${titulo}" (ID recuperado: ${id})`);
        return id;
      }
    }
  }

  const detalle = await res.text();
  throw new Error(`Fallo en catalog-service (${res.status}): ${detalle}`);
}

async function inicializarStockEnInventario(libroId, stockInicial, titulo, requestId, adminToken) {
  const urlAlta = `${INVENTORY_SERVICE_URL}/api/inventario`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
    'x-request-id': requestId
  };

  try {
    const res = await fetch(urlAlta, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        libroId,
        stockInicial,
        stockDisponible: stockInicial
      }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    });

    if (res.ok || res.status === 201) {
      console.log(`  [Inventario] ${res.status} Stock inicializado -> "${titulo}" (Stock: ${stockInicial})`);
      return true;
    }

    const urlReponer = `${INVENTORY_SERVICE_URL}/api/inventario/${libroId}/reponer`;
    const resReponer = await fetch(urlReponer, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        cantidad: stockInicial,
        stock: stockInicial
      }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    });

    if (resReponer.ok) {
      console.log(`  [Inventario] 200 Stock repuesto -> "${titulo}" (Cantidad: ${stockInicial})`);
      return true;
    }

    const texto = await res.text();
    console.warn(`  [Inventario] Advertencia (${res.status}) para "${titulo}": ${texto}`);
    return false;
  } catch (err) {
    console.warn(`  [Inventario] No disponible en ${INVENTORY_SERVICE_URL} (${err.message}). Se omitió carga de stock para "${titulo}".`);
    return false;
  }
}

async function ejecutarSeed() {
  console.log('===================================================================');
  console.log('🌱 INICIANDO CARGA DE DATOS DE PRUEBA (SEED) — TP6/TP7 GRUPO 1');
  console.log(`🔐 Auth Service URL:      ${AUTH_SERVICE_URL}`);
  console.log(`📚 Catalog Service URL:   ${CATALOG_SERVICE_URL}`);
  console.log(`📦 Inventory Service URL: ${INVENTORY_SERVICE_URL}`);
  console.log('===================================================================\n');

  console.log('▶ Preparando identidades de prueba (ADMIN y USER)...');
  const adminToken = await prepararUsuariosYObtenerTokenAdmin();
  console.log('');

  const resultados = [];

  for (const item of LIBROS_SEMILLA) {
    const requestId = `seed-${crypto.randomUUID()}`;
    console.log(`▶ Procesando obra: "${item.titulo}" (${item.isbn})`);

    try {
      const libroId = await crearLibroEnCatalogo(item, requestId, adminToken);
      const stockOk = await inicializarStockEnInventario(libroId, item.stockInicial, item.titulo, requestId, adminToken);
      resultados.push({
        titulo: item.titulo,
        isbn: item.isbn,
        libroId,
        stockInicial: item.stockInicial,
        inventarioSincronizado: stockOk
      });
    } catch (error) {
      console.error(`  ❌ Error procesando "${item.titulo}": ${error.message}`);
    }
    console.log('');
  }

  console.log('===================================================================');
  console.log(`✅ PROCESO FINALIZADO: ${resultados.length}/${LIBROS_SEMILLA.length} obras catalogadas.`);
  console.table(resultados);
}

ejecutarSeed().catch((err) => {
  console.error('❌ Error fatal en el script de seed:', err.message);
  process.exit(1);
});
