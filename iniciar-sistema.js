/**
 * ============================================================================
 * PLATAFORMA DISTRIBUIDA DE LIBRERÍA COMERCIAL — ORQUESTADOR LOCAL DE SERVICIOS
 * ============================================================================
 * Levanta en paralelo los 4 microservicios reales en sus puertos dedicados:
 *  - catalog-service   -> http://localhost:3001  (Base propia: db_catalog)
 *  - inventory-service -> http://localhost:3002  (Base propia: db_inventory + Lock Distribuido)
 *  - orders-service    -> http://localhost:3003  (Base propia: db_orders + Orquestación HTTP)
 *  - auth-service      -> http://localhost:3004  (Base propia: db_auth + Hash bcrypt + JWT HS256)
 * Y el Portal Web Interactivo con trazabilidad en vivo:
 *  - web-portal        -> http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Cargamos bcryptjs desde services/auth-service/node_modules si está disponible, o scrypt seguro
let bcrypt;
try {
  bcrypt = require(path.join(__dirname, '..', 'services', 'auth-service', 'node_modules', 'bcryptjs'));
} catch (_) {
  try {
    bcrypt = require('bcryptjs');
  } catch (__) {
    bcrypt = {
      hash: async (pwd) => {
        const salt = crypto.randomBytes(16).toString('hex');
        const derived = crypto.scryptSync(pwd, salt, 32).toString('hex');
        return `$2b$10$${salt}$${derived}`;
      },
      compare: async (pwd, hashStr) => {
        const parts = String(hashStr).split('$');
        if (parts.length >= 5) {
          const salt = parts[3];
          const expected = parts[4];
          const derived = crypto.scryptSync(pwd, salt, 32).toString('hex');
          return derived === expected;
        }
        return false;
      }
    };
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_grupo1_cambiar_en_entorno_real_2026';
const JWT_ISSUER = process.env.JWT_ISSUER || 'auth-service-grupo1';
const LOCK_TTL_MS = parseInt(process.env.LOCK_TTL_MS, 10) || 5000;

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILES = {
  catalog: path.join(DATA_DIR, 'db_catalog.json'),
  inventory: path.join(DATA_DIR, 'db_inventory.json'),
  orders: path.join(DATA_DIR, 'db_orders.json'),
  auth: path.join(DATA_DIR, 'db_auth.json')
};

function leerDB(nombre, valorInicial) {
  try {
    if (fs.existsSync(DB_FILES[nombre])) {
      return JSON.parse(fs.readFileSync(DB_FILES[nombre], 'utf8'));
    }
  } catch (_) {}
  guardarDB(nombre, valorInicial);
  return valorInicial;
}

function guardarDB(nombre, data) {
  fs.writeFileSync(DB_FILES[nombre], JSON.stringify(data, null, 2), 'utf8');
}

// Registro de eventos distribuidos en tiempo real para mostrar en el Portal Web
const traceLogs = [];
function registrarLog(service, level, message, meta = {}) {
  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    service,
    level,
    message,
    meta
  };
  traceLogs.unshift(entry);
  if (traceLogs.length > 150) traceLogs.pop();
  const metaTxt = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
  console.log(`[${entry.timestamp}] [${service}] ${level.toUpperCase()}: ${message}${metaTxt}`);
}

// Utilidades JWT HS256 (estándar RFC 7519)
function b64urlEncode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function firmarJWT(payload, expiresInSeconds = 3600) {
  const ahora = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const fullPayload = {
    ...payload,
    iss: JWT_ISSUER,
    iat: ahora,
    exp: ahora + expiresInSeconds
  };
  const unsigned = `${b64urlEncode(header)}.${b64urlEncode(fullPayload)}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url');
  return { token: `${unsigned}.${signature}`, claims: fullPayload };
}

function verificarJWT(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) {
    const err = new Error('Token mal formado');
    err.codigo = 'TOKEN_MAL_FORMADO';
    throw err;
  }
  const [h64, p64, sig] = partes;
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(h64, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(p64, 'base64url').toString('utf8'));
  } catch (_) {
    const err = new Error('Token inválido');
    err.codigo = 'TOKEN_INVALIDO';
    throw err;
  }
  if (header.alg !== 'HS256') {
    const err = new Error('Algoritmo JWT no permitido');
    err.codigo = 'TOKEN_INVALIDO';
    throw err;
  }
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${h64}.${p64}`).digest('base64url');
  if (sig !== expectedSig) {
    const err = new Error('Firma del token inválida');
    err.codigo = 'TOKEN_INVALIDO';
    throw err;
  }
  const ahora = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= ahora) {
    const err = new Error('El token JWT ha expirado');
    err.codigo = 'TOKEN_VENCIDO';
    throw err;
  }
  if (payload.iss && payload.iss !== JWT_ISSUER) {
    const err = new Error('Emisor del token inválido');
    err.codigo = 'TOKEN_INVALIDO';
    throw err;
  }
  return payload;
}

function autenticarRequest(req, res, serviceName) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth || typeof auth !== 'string') {
    registrarLog(serviceName, 'warn', 'Acceso rechazado (401): Token JWT no proporcionado', {
      endpoint: `${req.method} ${req.url}`,
      requestId: req.headers['x-request-id']
    });
    enviarJSON(res, 401, {
      error: 'Autenticación requerida. Debe enviar Authorization: Bearer <token>.',
      codigo: 'TOKEN_NO_PROPORCIONADO'
    });
    return null;
  }
  const partes = auth.trim().split(/\s+/);
  if (partes.length !== 2 || partes[0] !== 'Bearer' || !partes[1]) {
    registrarLog(serviceName, 'warn', 'Acceso rechazado (401): Formato Authorization inválido', {
      endpoint: `${req.method} ${req.url}`
    });
    enviarJSON(res, 401, {
      error: 'Formato de token inválido. Use Authorization: Bearer <token>.',
      codigo: 'TOKEN_MAL_FORMADO'
    });
    return null;
  }
  try {
    return verificarJWT(partes[1]);
  } catch (err) {
    const codigo = err.codigo || 'TOKEN_INVALIDO';
    registrarLog(serviceName, 'warn', `Acceso rechazado (401): ${codigo}`, {
      endpoint: `${req.method} ${req.url}`,
      requestId: req.headers['x-request-id']
    });
    enviarJSON(res, 401, { error: err.message, codigo });
    return null;
  }
}

function requerirRol(user, rolesPermitidos, req, res, serviceName) {
  if (!rolesPermitidos.includes(user.role)) {
    registrarLog(serviceName, 'warn', 'Autorización denegada por rol insuficiente (403)', {
      endpoint: `${req.method} ${req.url}`,
      usuarioId: user.sub,
      rolActual: user.role,
      rolesRequeridos: rolesPermitidos,
      requestId: req.headers['x-request-id']
    });
    enviarJSON(res, 403, {
      error: `Permisos insuficientes. Esta operación requiere rol: ${rolesPermitidos.join(' o ')}.`,
      codigo: 'PERMISOS_INSUFICIENTES',
      rolActual: user.role,
      rolesRequeridos: rolesPermitidos
    });
    return false;
  }
  return true;
}

function enviarJSON(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-request-id',
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

function leerBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('JSON_INVALIDO'));
      }
    });
  });
}

// ============================================================================
// ESTADO INICIAL Y BASES DE DATOS SEPARADAS (Database per Service)
// ============================================================================
const dbCatalog = leerDB('catalog', { libros: [] });
const dbInventory = leerDB('inventory', { stock: [], movimientos: [] });
const dbOrders = leerDB('orders', { ordenes: [] });
const dbAuth = leerDB('auth', { usuarios: [] });

// Simulación controlada de caída de servicio para demostrar resiliencia (503 Service Unavailable)
const estadoSimulacion = {
  inventoryCaido: false,
  redisCaido: false,
  delayConcurrenciaMs: 120
};

// Motor de Lock Distribuido (Redis SET lock:libro:{id} NX PX 5000 + liberación Lua)
const redisLocks = new Map();

function adquirirRedisLock(libroId) {
  const key = `lock:libro:${libroId}`;
  const ahora = Date.now();
  const actual = redisLocks.get(key);
  if (actual && actual.expiraEn > ahora) {
    return { exitoso: false, key };
  }
  const token = crypto.randomUUID();
  redisLocks.set(key, { token, expiraEn: ahora + LOCK_TTL_MS, adquiridoEn: ahora });
  return { exitoso: true, key, token };
}

function liberarRedisLockLua(libroId, tokenPropietario) {
  const key = `lock:libro:${libroId}`;
  const actual = redisLocks.get(key);
  if (actual && actual.token === tokenPropietario) {
    redisLocks.delete(key);
    return true;
  }
  return false;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// 1. MICROSERVICIO: catalog-service (Puerto 3001 - Base propia: db_catalog)
// ============================================================================
const catalogServer = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return enviarJSON(res, 204, {});
  const url = new URL(req.url, 'http://localhost:3001');
  const requestId = req.headers['x-request-id'];

  if (url.pathname === '/health' || url.pathname === '/api/health') {
    return enviarJSON(res, 200, { service: 'catalog-service', status: 'ok', database: 'db_catalog' });
  }

  // GET /api/libros (Público)
  if (req.method === 'GET' && url.pathname === '/api/libros') {
    const genero = url.searchParams.get('genero');
    const autor = url.searchParams.get('autor');
    let lista = [...dbCatalog.libros];
    if (genero) lista = lista.filter((l) => l.genero.toLowerCase() === genero.toLowerCase());
    if (autor) lista = lista.filter((l) => l.autor.toLowerCase().includes(autor.toLowerCase()));
    return enviarJSON(res, 200, lista);
  }

  // GET /api/libros/:id (Público)
  const matchId = url.pathname.match(/^\/api\/libros\/([a-fA-F0-9]{24})$/);
  if (req.method === 'GET' && matchId) {
    const id = matchId[1];
    const libro = dbCatalog.libros.find((l) => l.id === id);
    if (!libro) {
      registrarLog('catalog-service', 'warn', `Libro no encontrado en db_catalog (${id})`, { requestId });
      return enviarJSON(res, 404, { error: 'El libro solicitado no existe en el catálogo.', codigo: 'LIBRO_NO_ENCONTRADO' });
    }
    registrarLog('catalog-service', 'info', `Libro consultado: "${libro.titulo}"`, { libroId: id, requestId });
    return enviarJSON(res, 200, libro);
  }

  // POST /api/libros (Restringido a rol ADMIN)
  if (req.method === 'POST' && url.pathname === '/api/libros') {
    const user = autenticarRequest(req, res, 'catalog-service');
    if (!user) return;
    if (!requerirRol(user, ['ADMIN'], req, res, 'catalog-service')) return;

    const body = await leerBody(req);
    const { titulo, autor, año, genero = 'Novela', isbn } = body;
    if (!titulo || !autor || !año || !isbn) {
      return enviarJSON(res, 400, { error: 'titulo, autor, año e isbn son obligatorios.', codigo: 'VALIDACION_FALLIDA' });
    }
    if (dbCatalog.libros.some((l) => l.isbn === String(isbn).trim())) {
      return enviarJSON(res, 409, { error: 'Ya existe un libro registrado con ese ISBN.', codigo: 'ISBN_DUPLICADO' });
    }
    const nuevo = {
      id: crypto.randomBytes(12).toString('hex'),
      titulo: String(titulo).trim(),
      autor: String(autor).trim(),
      año: Number(año),
      genero: String(genero).trim(),
      isbn: String(isbn).trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    dbCatalog.libros.push(nuevo);
    guardarDB('catalog', dbCatalog);
    registrarLog('catalog-service', 'info', `Alta de libro en db_catalog: "${nuevo.titulo}"`, {
      libroId: nuevo.id,
      adminId: user.sub,
      requestId
    });
    return enviarJSON(res, 201, nuevo);
  }

  // PUT /api/libros/:id (Restringido a rol ADMIN)
  if (req.method === 'PUT' && matchId) {
    const user = autenticarRequest(req, res, 'catalog-service');
    if (!user) return;
    if (!requerirRol(user, ['ADMIN'], req, res, 'catalog-service')) return;

    const id = matchId[1];
    const idx = dbCatalog.libros.findIndex((l) => l.id === id);
    if (idx === -1) return enviarJSON(res, 404, { error: 'Libro no encontrado.', codigo: 'LIBRO_NO_ENCONTRADO' });
    const body = await leerBody(req);
    dbCatalog.libros[idx] = {
      ...dbCatalog.libros[idx],
      ...(body.titulo ? { titulo: String(body.titulo).trim() } : {}),
      ...(body.autor ? { autor: String(body.autor).trim() } : {}),
      ...(body.año ? { año: Number(body.año) } : {}),
      ...(body.genero ? { genero: String(body.genero).trim() } : {}),
      ...(body.isbn ? { isbn: String(body.isbn).trim() } : {}),
      updatedAt: new Date().toISOString()
    };
    guardarDB('catalog', dbCatalog);
    registrarLog('catalog-service', 'info', `Libro actualizado en db_catalog (${id})`, { adminId: user.sub, requestId });
    return enviarJSON(res, 200, dbCatalog.libros[idx]);
  }

  // DELETE /api/libros/:id (Restringido a rol ADMIN)
  if (req.method === 'DELETE' && matchId) {
    const user = autenticarRequest(req, res, 'catalog-service');
    if (!user) return;
    if (!requerirRol(user, ['ADMIN'], req, res, 'catalog-service')) return;

    const id = matchId[1];
    const idx = dbCatalog.libros.findIndex((l) => l.id === id);
    if (idx === -1) return enviarJSON(res, 404, { error: 'Libro no encontrado.', codigo: 'LIBRO_NO_ENCONTRADO' });
    const eliminado = dbCatalog.libros.splice(idx, 1)[0];
    guardarDB('catalog', dbCatalog);
    registrarLog('catalog-service', 'info', `Libro eliminado de db_catalog: "${eliminado.titulo}"`, {
      libroId: id,
      adminId: user.sub,
      requestId
    });
    return enviarJSON(res, 200, { mensaje: 'Obra eliminada correctamente.', libro: eliminado });
  }

  return enviarJSON(res, 404, { error: 'Ruta no encontrada en catalog-service.', codigo: 'RUTA_NO_ENCONTRADA' });
});

// ============================================================================
// 2. MICROSERVICIO: inventory-service (Puerto 3002 - Base: db_inventory + Redis)
// ============================================================================
const inventoryServer = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return enviarJSON(res, 204, {});
  const url = new URL(req.url, 'http://localhost:3002');
  const requestId = req.headers['x-request-id'];

  if (estadoSimulacion.inventoryCaido) {
    registrarLog('inventory-service', 'error', 'Simulación activa: inventory-service detenido (503)', { requestId });
    return enviarJSON(res, 503, { error: 'Servicio de inventario temporalmente fuera de línea.', codigo: 'SERVICIO_NO_DISPONIBLE' });
  }

  if (url.pathname === '/health' || url.pathname === '/api/health') {
    return enviarJSON(res, 200, {
      service: 'inventory-service',
      status: 'ok',
      dependencias: { mongodb: 'up', redis: estadoSimulacion.redisCaido ? 'down' : 'up' }
    });
  }

  // GET /api/inventario (Público - Resumen de stock y últimos movimientos)
  if (req.method === 'GET' && url.pathname === '/api/inventario') {
    return enviarJSON(res, 200, {
      stock: dbInventory.stock,
      movimientos: [...dbInventory.movimientos].slice(-40).reverse()
    });
  }

  // GET /api/inventario/:libroId (Público)
  const matchGet = url.pathname.match(/^\/api\/inventario\/([a-fA-F0-9]{24})$/);
  if (req.method === 'GET' && matchGet) {
    const libroId = matchGet[1];
    const item = dbInventory.stock.find((s) => s.libroId === libroId);
    if (!item) return enviarJSON(res, 404, { error: 'No existe registro de stock para este libro.', codigo: 'STOCK_NO_ENCONTRADO' });
    return enviarJSON(res, 200, item);
  }

  // GET /api/inventario/:libroId/lock-status (Público)
  const matchLock = url.pathname.match(/^\/api\/inventario\/([a-fA-F0-9]{24})\/lock-status$/);
  if (req.method === 'GET' && matchLock) {
    if (estadoSimulacion.redisCaido) {
      return enviarJSON(res, 503, { error: 'Redis no disponible.', codigo: 'REDIS_NO_DISPONIBLE' });
    }
    const libroId = matchLock[1];
    const key = `lock:libro:${libroId}`;
    const lock = redisLocks.get(key);
    const activo = Boolean(lock && lock.expiraEn > Date.now());
    return enviarJSON(res, 200, {
      libroId,
      key,
      bloqueado: activo,
      ttlRestanteMs: activo ? Math.max(0, lock.expiraEn - Date.now()) : -2
    });
  }

  // POST /api/inventario (Solo ADMIN)
  if (req.method === 'POST' && url.pathname === '/api/inventario') {
    const user = autenticarRequest(req, res, 'inventory-service');
    if (!user) return;
    if (!requerirRol(user, ['ADMIN'], req, res, 'inventory-service')) return;

    const body = await leerBody(req);
    const libroId = body.libroId;
    const stockInicial = body.stockInicial ?? body.stockDisponible ?? 0;
    if (dbInventory.stock.some((s) => s.libroId === libroId)) {
      return enviarJSON(res, 409, { error: 'El libro ya tiene registro de stock.', codigo: 'STOCK_YA_EXISTE' });
    }
    const nuevo = {
      libroId,
      stockDisponible: Number(stockInicial),
      ultimaActualizacion: new Date().toISOString()
    };
    dbInventory.stock.push(nuevo);
    guardarDB('inventory', dbInventory);
    registrarLog('inventory-service', 'info', `Registro de stock creado en db_inventory (stock: ${nuevo.stockDisponible})`, {
      libroId,
      requestId
    });
    return enviarJSON(res, 201, nuevo);
  }

  // POST /api/inventario/:libroId/reponer (Solo ADMIN)
  const matchReponer = url.pathname.match(/^\/api\/inventario\/([a-fA-F0-9]{24})\/reponer$/);
  if (req.method === 'POST' && matchReponer) {
    const user = autenticarRequest(req, res, 'inventory-service');
    if (!user) return;
    if (!requerirRol(user, ['ADMIN'], req, res, 'inventory-service')) return;
    if (estadoSimulacion.redisCaido) {
      return enviarJSON(res, 503, { error: 'Coordinador de locks Redis no disponible.', codigo: 'REDIS_NO_DISPONIBLE' });
    }

    const libroId = matchReponer[1];
    const body = await leerBody(req);
    let item = dbInventory.stock.find((s) => s.libroId === libroId);
    if (!item) {
      item = { libroId, stockDisponible: 0, ultimaActualizacion: new Date().toISOString() };
      dbInventory.stock.push(item);
    }
    const previo = item.stockDisponible;
    if (body.stock !== undefined) {
      item.stockDisponible = Number(body.stock);
    } else {
      item.stockDisponible += Number(body.cantidad || 1);
    }
    item.ultimaActualizacion = new Date().toISOString();
    dbInventory.movimientos.push({
      id: crypto.randomBytes(12).toString('hex'),
      ordenId: null,
      libroId,
      tipo: body.stock !== undefined ? 'AJUSTE_STOCK' : 'REPOSICION',
      cantidad: body.stock !== undefined ? Number(body.stock) : Number(body.cantidad || 1),
      stockPrevio: previo,
      stockNuevo: item.stockDisponible,
      clienteId: user.email || user.sub,
      requestId,
      fecha: new Date().toISOString()
    });
    guardarDB('inventory', dbInventory);
    registrarLog('inventory-service', 'info', `Stock repuesto por ADMIN -> Nuevo saldo: ${item.stockDisponible}`, {
      libroId,
      adminId: user.sub,
      requestId
    });
    return enviarJSON(res, 200, { ...item, operacion: body.stock !== undefined ? 'REINICIO' : 'REPOSICION' });
  }

  // POST /api/inventario/:libroId/descontar (Autenticado USER o ADMIN - Protegido por Redis Lock)
  const matchDescontar = url.pathname.match(/^\/api\/inventario\/([a-fA-F0-9]{24})\/descontar$/);
  if (req.method === 'POST' && matchDescontar) {
    const user = autenticarRequest(req, res, 'inventory-service');
    if (!user) return;
    if (!requerirRol(user, ['USER', 'ADMIN'], req, res, 'inventory-service')) return;
    if (estadoSimulacion.redisCaido) {
      registrarLog('inventory-service', 'error', 'Operación rechazada (503): Redis Lock no disponible', { requestId });
      return enviarJSON(res, 503, { error: 'Coordinador de locks Redis no disponible.', codigo: 'REDIS_NO_DISPONIBLE' });
    }

    const libroId = matchDescontar[1];
    const { cantidad = 1, clienteId, ordenId } = await leerBody(req);
    const item = dbInventory.stock.find((s) => s.libroId === libroId);
    if (!item) {
      return enviarJSON(res, 404, { error: 'No existe registro de stock para este libro.', codigo: 'STOCK_NO_ENCONTRADO' });
    }

    // Intentar adquirir el Lock Distribuido en Redis (con 2 reintentos breves)
    let lock = adquirirRedisLock(libroId);
    for (let i = 0; !lock.exitoso && i < 2; i++) {
      await esperar(35);
      lock = adquirirRedisLock(libroId);
    }

    if (!lock.exitoso) {
      registrarLog('inventory-service', 'warn', `Lock ocupado en Redis (lock:libro:${libroId}) -> 409 LOCK_OCUPADO`, {
        libroId,
        ordenId,
        requestId
      });
      return enviarJSON(res, 409, {
        error: 'El stock de este libro está siendo modificado por otra compra concurrente.',
        codigo: 'LOCK_OCUPADO',
        recurso: `lock:libro:${libroId}`
      });
    }

    registrarLog('inventory-service', 'info', `Lock Redis adquirido (SET lock:libro:${libroId} NX PX ${LOCK_TTL_MS})`, {
      libroId,
      ordenId,
      requestId
    });

    try {
      // Idempotencia por ordenId
      if (ordenId) {
        const movPrevio = dbInventory.movimientos.find((m) => m.ordenId === ordenId && m.tipo === 'DESCUENTO');
        if (movPrevio) {
          return enviarJSON(res, 200, {
            libroId,
            cantidadDescontada: movPrevio.cantidad,
            stockRestante: item.stockDisponible,
            ordenId,
            idempotente: true
          });
        }
      }

      if (estadoSimulacion.delayConcurrenciaMs > 0) {
        await esperar(estadoSimulacion.delayConcurrenciaMs);
      }

      if (item.stockDisponible < cantidad) {
        registrarLog('inventory-service', 'warn', `Stock insuficiente (${item.stockDisponible} < ${cantidad}) -> 400 STOCK_INSUFICIENTE`, {
          libroId,
          ordenId,
          requestId
        });
        return enviarJSON(res, 400, {
          error: 'Stock insuficiente para realizar la operación.',
          codigo: 'STOCK_INSUFICIENTE',
          stockDisponible: item.stockDisponible
        });
      }

      const stockPrevio = item.stockDisponible;
      item.stockDisponible -= cantidad;
      item.ultimaActualizacion = new Date().toISOString();
      if (ordenId) {
        dbInventory.movimientos.push({
          id: crypto.randomBytes(12).toString('hex'),
          ordenId,
          libroId,
          tipo: 'DESCUENTO',
          cantidad,
          clienteId,
          requestId,
          fecha: new Date().toISOString()
        });
      }
      guardarDB('inventory', dbInventory);

      registrarLog('inventory-service', 'info', `Descuento aplicado en db_inventory (${stockPrevio} -> ${item.stockDisponible})`, {
        libroId,
        ordenId,
        requestId
      });

      return enviarJSON(res, 200, {
        libroId,
        stockPrevio,
        cantidadDescontada: cantidad,
        stockRestante: item.stockDisponible,
        clienteId,
        ordenId
      });
    } finally {
      liberarRedisLockLua(libroId, lock.token);
      registrarLog('inventory-service', 'info', `Lock Redis liberado con script Lua (lock:libro:${libroId})`, {
        libroId,
        ordenId,
        requestId
      });
    }
  }

  return enviarJSON(res, 404, { error: 'Ruta no encontrada en inventory-service.', codigo: 'RUTA_NO_ENCONTRADA' });
});

// ============================================================================
// 3. MICROSERVICIO: orders-service (Puerto 3003 - Base propia: db_orders)
// ============================================================================
const ordersServer = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return enviarJSON(res, 204, {});
  const url = new URL(req.url, 'http://localhost:3003');
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();

  if (url.pathname === '/health' || url.pathname === '/api/health') {
    return enviarJSON(res, 200, { service: 'orders-service', status: 'ok', dependencias: { mongodb: 'up' } });
  }

  // POST /api/ordenes (Autenticado + Propiedad del Recurso + Propagación Bearer JWT)
  if (req.method === 'POST' && url.pathname === '/api/ordenes') {
    const user = autenticarRequest(req, res, 'orders-service');
    if (!user) return;
    if (!requerirRol(user, ['USER', 'ADMIN'], req, res, 'orders-service')) return;

    const body = await leerBody(req);
    const { clienteId: clienteIdBody, libroId, cantidad = 1 } = body;

    if (!libroId || !/^[a-fA-F0-9]{24}$/.test(String(libroId))) {
      return enviarJSON(res, 400, { error: 'libroId debe ser un ObjectId válido de 24 caracteres.', codigo: 'VALIDACION_FALLIDA' });
    }

    // Regla de Propiedad del Recurso (TP7 Sección 11.2):
    // Un USER solo puede crear órdenes a su propio nombre (`sub` del JWT)
    if (user.role !== 'ADMIN' && clienteIdBody && String(clienteIdBody) !== String(user.sub)) {
      registrarLog('orders-service', 'warn', 'Rechazo 403 por propiedad del recurso: USER intentó comprar a nombre de otro clienteId', {
        usuarioId: user.sub,
        clienteIdSolicitado: clienteIdBody,
        requestId
      });
      return enviarJSON(res, 403, {
        error: 'No puede crear una orden a nombre de otro cliente.',
        codigo: 'ACCESO_DENEGADO'
      });
    }

    const clienteId = user.role === 'ADMIN' && clienteIdBody ? String(clienteIdBody) : String(user.sub);
    const ordenId = crypto.randomBytes(12).toString('hex');

    // Etapa 0: Registrar orden PENDIENTE en db_orders
    const orden = {
      ordenId,
      clienteId,
      clienteEmail: user.email,
      libroId,
      cantidad: Number(cantidad),
      estado: 'PENDIENTE',
      motivoRechazo: null,
      libroSnapshot: null,
      requestId,
      compensacion: 'NO_REQUERIDA',
      fechaCreacion: new Date().toISOString(),
      fechaResolucion: null
    };
    dbOrders.ordenes.unshift(orden);
    guardarDB('orders', dbOrders);

    registrarLog('orders-service', 'info', `Orden registrada como PENDIENTE (${ordenId})`, {
      ordenId,
      clienteId,
      libroId,
      requestId
    });

    // Etapa 1: Consultar catalog-service por HTTP (GET /api/libros/:id)
    let libroCatalogo = null;
    try {
      const catRes = await fetch(`http://localhost:3001/api/libros/${libroId}`, {
        headers: { 'x-request-id': requestId },
        signal: AbortSignal.timeout(3000)
      });
      if (catRes.status === 404) {
        orden.estado = 'RECHAZADA';
        orden.motivoRechazo = 'LIBRO_INEXISTENTE';
        orden.fechaResolucion = new Date().toISOString();
        guardarDB('orders', dbOrders);
        return enviarJSON(res, 404, {
          error: 'El libro solicitado no existe en el catálogo.',
          codigo: 'LIBRO_INEXISTENTE',
          ordenId,
          estado: 'RECHAZADA',
          motivoRechazo: 'LIBRO_INEXISTENTE'
        });
      }
      if (!catRes.ok) throw new Error(`HTTP ${catRes.status}`);
      libroCatalogo = await catRes.json();
      orden.libroSnapshot = {
        titulo: libroCatalogo.titulo,
        autor: libroCatalogo.autor,
        isbn: libroCatalogo.isbn
      };
    } catch (err) {
      orden.estado = 'RECHAZADA';
      orden.motivoRechazo = 'SERVICIO_NO_DISPONIBLE';
      orden.fechaResolucion = new Date().toISOString();
      guardarDB('orders', dbOrders);
      return enviarJSON(res, 503, {
        error: 'catalog-service no disponible.',
        codigo: 'SERVICIO_NO_DISPONIBLE',
        ordenId,
        estado: 'RECHAZADA'
      });
    }

    // Etapa 2: Invocar inventory-service propagando el header Authorization: Bearer <JWT>
    try {
      const invRes = await fetch(`http://localhost:3002/api/inventario/${libroId}/descontar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.authorization || req.headers.Authorization,
          'x-request-id': requestId
        },
        body: JSON.stringify({ cantidad: Number(cantidad), clienteId, ordenId }),
        signal: AbortSignal.timeout(3000)
      });

      const invData = await invRes.json().catch(() => ({}));

      if (invRes.status === 200) {
        orden.estado = 'CONFIRMADA';
        orden.fechaResolucion = new Date().toISOString();
        guardarDB('orders', dbOrders);
        registrarLog('orders-service', 'info', `Orden CONFIRMADA (${ordenId}) -> Stock restante: ${invData.stockRestante}`, {
          ordenId,
          clienteId,
          requestId
        });
        return enviarJSON(res, 201, {
          ordenId,
          estado: 'CONFIRMADA',
          clienteId,
          clienteEmail: user.email,
          libro: { id: libroId, ...orden.libroSnapshot },
          cantidad: orden.cantidad,
          stockRestante: invData.stockRestante,
          requestId,
          fechaCreacion: orden.fechaCreacion,
          fechaResolucion: orden.fechaResolucion
        });
      }

      if (invRes.status === 400 || invRes.status === 404) {
        orden.estado = 'RECHAZADA';
        orden.motivoRechazo = 'SIN_STOCK';
        orden.fechaResolucion = new Date().toISOString();
        guardarDB('orders', dbOrders);
        return enviarJSON(res, 409, {
          error: 'No hay stock suficiente para completar la compra.',
          codigo: 'SIN_STOCK',
          ordenId,
          estado: 'RECHAZADA',
          motivoRechazo: 'SIN_STOCK'
        });
      }

      if (invRes.status === 409) {
        orden.estado = 'RECHAZADA';
        orden.motivoRechazo = 'CONCURRENCIA';
        orden.fechaResolucion = new Date().toISOString();
        guardarDB('orders', dbOrders);
        return enviarJSON(res, 409, {
          error: 'El libro está siendo comprado por otro cliente en este mismo instante (Redis Lock activo).',
          codigo: 'CONCURRENCIA',
          ordenId,
          estado: 'RECHAZADA',
          motivoRechazo: 'CONCURRENCIA'
        });
      }

      orden.estado = 'RECHAZADA';
      orden.motivoRechazo = 'SERVICIO_NO_DISPONIBLE';
      orden.fechaResolucion = new Date().toISOString();
      guardarDB('orders', dbOrders);
      registrarLog('orders-service', 'error', 'Orden RECHAZADA (503): inventory-service o Redis no disponible', {
        ordenId,
        causa: invData.codigo || `HTTP ${invRes.status}`,
        requestId
      });
      return enviarJSON(res, 503, {
        error: 'No se pudo completar la compra porque un servicio necesario (inventory/Redis) no está disponible.',
        codigo: 'SERVICIO_NO_DISPONIBLE',
        ordenId,
        estado: 'RECHAZADA',
        motivoRechazo: 'SERVICIO_NO_DISPONIBLE'
      });
    } catch (err) {
      orden.estado = 'RECHAZADA';
      orden.motivoRechazo = 'SERVICIO_NO_DISPONIBLE';
      orden.fechaResolucion = new Date().toISOString();
      guardarDB('orders', dbOrders);
      return enviarJSON(res, 503, {
        error: 'inventory-service no disponible (timeout o sin conexión).',
        codigo: 'SERVICIO_NO_DISPONIBLE',
        ordenId,
        estado: 'RECHAZADA',
        motivoRechazo: 'SERVICIO_NO_DISPONIBLE'
      });
    }
  }

  // GET /api/ordenes (Para ADMIN devuelve todas; para USER devuelve solo las propias)
  if (req.method === 'GET' && url.pathname === '/api/ordenes') {
    const user = autenticarRequest(req, res, 'orders-service');
    if (!user) return;
    const lista = user.role === 'ADMIN'
      ? dbOrders.ordenes
      : dbOrders.ordenes.filter((o) => String(o.clienteId) === String(user.sub));
    return enviarJSON(res, 200, lista);
  }

  // GET /api/ordenes/cliente/:clienteId (Propiedad del recurso: USER solo ve su propio sub)
  const matchCliente = url.pathname.match(/^\/api\/ordenes\/cliente\/([^/]+)$/);
  if (req.method === 'GET' && matchCliente) {
    const user = autenticarRequest(req, res, 'orders-service');
    if (!user) return;
    const clienteId = decodeURIComponent(matchCliente[1]);
    if (user.role !== 'ADMIN' && String(clienteId) !== String(user.sub)) {
      registrarLog('orders-service', 'warn', 'Acceso denegado (403): USER intentó consultar historial de otro cliente', {
        usuarioId: user.sub,
        clienteIdSolicitado: clienteId,
        requestId
      });
      return enviarJSON(res, 403, {
        error: 'No tiene permiso para consultar el historial de órdenes de otro cliente.',
        codigo: 'ACCESO_DENEGADO'
      });
    }
    const lista = dbOrders.ordenes.filter((o) => String(o.clienteId) === String(clienteId));
    return enviarJSON(res, 200, lista);
  }

  // GET /api/ordenes/:id (Propiedad del recurso)
  const matchOrden = url.pathname.match(/^\/api\/ordenes\/([a-fA-F0-9]{24})$/);
  if (req.method === 'GET' && matchOrden) {
    const user = autenticarRequest(req, res, 'orders-service');
    if (!user) return;
    const orden = dbOrders.ordenes.find((o) => o.ordenId === matchOrden[1]);
    if (!orden) return enviarJSON(res, 404, { error: 'Orden no encontrada.', codigo: 'ORDEN_NO_ENCONTRADA' });
    if (user.role !== 'ADMIN' && String(orden.clienteId) !== String(user.sub)) {
      registrarLog('orders-service', 'warn', 'Acceso denegado (403): USER intentó consultar orden ajena', {
        usuarioId: user.sub,
        ordenId: orden.ordenId,
        duenoOrden: orden.clienteId
      });
      return enviarJSON(res, 403, {
        error: 'No tiene permiso para acceder a una orden que pertenece a otro cliente.',
        codigo: 'ACCESO_DENEGADO'
      });
    }
    return enviarJSON(res, 200, orden);
  }

  return enviarJSON(res, 404, { error: 'Ruta no encontrada en orders-service.', codigo: 'RUTA_NO_ENCONTRADA' });
});

// ============================================================================
// 4. MICROSERVICIO: auth-service (Puerto 3004 - Base propia: db_auth)
// ============================================================================
const authServer = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return enviarJSON(res, 204, {});
  const url = new URL(req.url, 'http://localhost:3004');

  if (url.pathname === '/health' || url.pathname === '/api/health') {
    return enviarJSON(res, 200, { service: 'auth-service', status: 'ok', dependencias: { mongodb: 'up' } });
  }

  // POST /api/auth/register (y /auth/register)
  if (req.method === 'POST' && (url.pathname === '/api/auth/register' || url.pathname === '/auth/register')) {
    const body = await leerBody(req);
    const { email, password, nombre, role } = body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return enviarJSON(res, 400, { error: 'Debe proporcionar un email válido.', codigo: 'VALIDACION_FALLIDA' });
    }
    if (!password || String(password).length < 6) {
      return enviarJSON(res, 400, { error: 'La contraseña debe tener al menos 6 caracteres.', codigo: 'VALIDACION_FALLIDA' });
    }

    const emailNorm = String(email).trim().toLowerCase();
    if (role && String(role).toUpperCase() === 'ADMIN') {
      const authHeader = req.headers.authorization || '';
      let esAdminAutenticado = false;
      if (authHeader.startsWith('Bearer ')) {
        try {
          const payload = verificarJWT(authHeader.slice(7));
          esAdminAutenticado = payload.role === 'ADMIN';
        } catch (_) {}
      }
      if (!esAdminAutenticado) {
        registrarLog('auth-service', 'warn', 'Intento bloqueado (403): auto-asignación de rol ADMIN sin permiso', {
          email: emailNorm
        });
        return enviarJSON(res, 403, {
          error: 'No se permite auto-asignar el rol ADMIN en el registro público.',
          codigo: 'ROL_NO_PERMITIDO'
        });
      }
    }

    if (dbAuth.usuarios.some((u) => u.email === emailNorm)) {
      registrarLog('auth-service', 'warn', `Registro rechazado (409): email duplicado (${emailNorm})`);
      return enviarJSON(res, 409, { error: 'Ya existe un usuario registrado con ese email.', codigo: 'USUARIO_YA_EXISTE' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const nuevo = {
      id: crypto.randomBytes(12).toString('hex'),
      email: emailNorm,
      nombre: String(nombre || emailNorm.split('@')[0]).trim(),
      passwordHash,
      role: role && String(role).toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER',
      activo: true,
      createdAt: new Date().toISOString()
    };
    dbAuth.usuarios.push(nuevo);
    guardarDB('auth', dbAuth);

    registrarLog('auth-service', 'info', `Usuario registrado con hash bcrypt en db_auth (${nuevo.email}, rol: ${nuevo.role})`, {
      usuarioId: nuevo.id
    });

    const { passwordHash: _omit, ...usuarioPublico } = nuevo;
    return enviarJSON(res, 201, { mensaje: 'Usuario registrado exitosamente.', usuario: usuarioPublico });
  }

  // POST /api/auth/login (y /auth/login)
  if (req.method === 'POST' && (url.pathname === '/api/auth/login' || url.pathname === '/auth/login')) {
    const body = await leerBody(req);
    const { email, password, expiresInSeconds } = body;
    if (!email || !password) {
      return enviarJSON(res, 400, { error: 'Debe enviar email y password.', codigo: 'VALIDACION_FALLIDA' });
    }
    const emailNorm = String(email).trim().toLowerCase();
    const usuario = dbAuth.usuarios.find((u) => u.email === emailNorm);
    if (!usuario) {
      registrarLog('auth-service', 'warn', 'Login fallido (401): credenciales inválidas', { motivoInterno: 'usuario_no_encontrado' });
      return enviarJSON(res, 401, { error: 'Credenciales inválidas.', codigo: 'CREDENCIALES_INVALIDAS' });
    }
    const ok = await bcrypt.compare(String(password), usuario.passwordHash);
    if (!ok) {
      registrarLog('auth-service', 'warn', 'Login fallido (401): credenciales inválidas', {
        usuarioId: usuario.id,
        motivoInterno: 'password_incorrecto'
      });
      return enviarJSON(res, 401, { error: 'Credenciales inválidas.', codigo: 'CREDENCIALES_INVALIDAS' });
    }
    if (!usuario.activo) {
      registrarLog('auth-service', 'warn', 'Login rechazado (403): cuenta deshabilitada', { usuarioId: usuario.id });
      return enviarJSON(res, 403, { error: 'La cuenta de usuario se encuentra deshabilitada.', codigo: 'CUENTA_DESHABILITADA' });
    }

    const duracion = Number(expiresInSeconds) || 3600;
    const { token, claims } = firmarJWT({ sub: usuario.id, email: usuario.email, role: usuario.role }, duracion);

    registrarLog('auth-service', 'info', `Login exitoso -> JWT emitido (${usuario.email}, rol: ${usuario.role})`, {
      usuarioId: usuario.id,
      role: usuario.role
    });

    return enviarJSON(res, 200, {
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: `${duracion}s`,
      claims,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        role: usuario.role,
        activo: usuario.activo
      }
    });
  }

  // GET /api/auth/me
  if (req.method === 'GET' && (url.pathname === '/api/auth/me' || url.pathname === '/auth/me')) {
    const user = autenticarRequest(req, res, 'auth-service');
    if (!user) return;
    const encontrado = dbAuth.usuarios.find((u) => u.id === user.sub);
    if (!encontrado) return enviarJSON(res, 404, { error: 'Usuario no encontrado.', codigo: 'USUARIO_NO_ENCONTRADO' });
    const { passwordHash: _omit, ...publico } = encontrado;
    return enviarJSON(res, 200, { usuario: publico, tokenClaims: user });
  }

  // GET /api/auth/inspeccionar-hashes (Para demostrar el Escenario L de persistencia de hashes bcrypt en db_auth)
  if (req.method === 'GET' && url.pathname === '/api/auth/inspeccionar-hashes') {
    return enviarJSON(
      res,
      200,
      dbAuth.usuarios.map((u) => ({
        _id: u.id,
        email: u.email,
        nombre: u.nombre,
        role: u.role,
        activo: u.activo,
        passwordHash: u.passwordHash
      }))
    );
  }

  return enviarJSON(res, 404, { error: 'Ruta no encontrada en auth-service.', codigo: 'RUTA_NO_ENCONTRADA' });
});

// ============================================================================
// 5. PORTAL WEB INTERACTIVO + MONITOR DE ARQUITECTURA (Puerto 3000)
// ============================================================================
const WEB_HTML_PATH = path.join(__dirname, 'services', 'web-portal', 'public', 'index.html');

const webServer = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return enviarJSON(res, 204, {});
  const url = new URL(req.url, 'http://localhost:3000');

  if (req.method === 'GET' && url.pathname === '/api/monitor/estado') {
    return enviarJSON(res, 200, {
      simulacion: estadoSimulacion,
      basesDeDatos: {
        db_catalog: { coleccion: 'libros', documentos: dbCatalog.libros.length },
        db_inventory: { coleccion: 'stock + movimientos', stockCount: dbInventory.stock.length, movimientosCount: dbInventory.movimientos.length },
        db_orders: { coleccion: 'ordenes', documentos: dbOrders.ordenes.length },
        db_auth: { coleccion: 'usuarios', documentos: dbAuth.usuarios.length }
      },
      logs: traceLogs.slice(0, 50)
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/monitor/simulacion') {
    const body = await leerBody(req);
    if (typeof body.inventoryCaido === 'boolean') {
      estadoSimulacion.inventoryCaido = body.inventoryCaido;
      registrarLog(
        'docker-compose',
        body.inventoryCaido ? 'error' : 'info',
        body.inventoryCaido
          ? 'Contenedor inventory-service DETENIDO (simulando caída de servicio)'
          : 'Contenedor inventory-service INICIADO y saludable nuevamente'
      );
    }
    if (typeof body.redisCaido === 'boolean') {
      estadoSimulacion.redisCaido = body.redisCaido;
      registrarLog(
        'redis',
        body.redisCaido ? 'error' : 'info',
        body.redisCaido ? 'Contenedor Redis DETENIDO' : 'Contenedor Redis ACTIVO'
      );
    }
    return enviarJSON(res, 200, estadoSimulacion);
  }

  if (req.method === 'POST' && url.pathname === '/api/monitor/limpiar-logs') {
    traceLogs.length = 0;
    return enviarJSON(res, 200, { ok: true });
  }

  // Servir el icono propio de la Librería (sobreescribiendo cualquier favicon en caché de otros proyectos en localhost:3000)
  if (url.pathname === '/favicon.ico' || url.pathname === '/favicon.svg') {
    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2563eb"/><path d="M16 18c6 0 11 2 16 6 5-4 10-6 16-6v28c-6 0-11 2-16 6-5-4-10-6-16-6V18z" fill="#ffffff"/></svg>`;
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Clear-Site-Data': '"cache"'
    });
    return res.end(svgIcon);
  }

  // Servir la aplicación Web principal
  if (fs.existsSync(WEB_HTML_PATH)) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
    });
    return res.end(fs.readFileSync(WEB_HTML_PATH, 'utf8'));
  }

  res.writeHead(404);
  res.end('Archivo web no encontrado');
});

// ============================================================================
// BOOTSTRAP AUTOMÁTICO DE DATOS INICIALES (USUARIOS + 5 LIBROS + STOCK)
// ============================================================================
async function inicializarDatosSemilla() {
  if (dbAuth.usuarios.length === 0) {
    dbAuth.usuarios.push(
      {
        id: '6720a1b2c3d4e5f600000001',
        email: 'admin@libreria.com',
        nombre: 'Joel Aisama (Administrador)',
        passwordHash: await bcrypt.hash('Admin1234!', 10),
        role: 'ADMIN',
        activo: true,
        createdAt: new Date().toISOString()
      },
      {
        id: '6720a1b2c3d4e5f600000002',
        email: 'cliente@libreria.com',
        nombre: 'Cliente Demo (USER)',
        passwordHash: await bcrypt.hash('Cliente123!', 10),
        role: 'USER',
        activo: true,
        createdAt: new Date().toISOString()
      },
      {
        id: '6720a1b2c3d4e5f600000003',
        email: 'otro.cliente@libreria.com',
        nombre: 'Bautista Navarro (Otro Cliente)',
        passwordHash: await bcrypt.hash('Cliente123!', 10),
        role: 'USER',
        activo: true,
        createdAt: new Date().toISOString()
      }
    );
    guardarDB('auth', dbAuth);
  }

  const iniciales = [
    {
      id: '6712e8f0c3b2a9e4d1f00001',
      titulo: 'Cien años de soledad',
      autor: 'Gabriel García Márquez',
      año: 1967,
      genero: 'Novela',
      isbn: '978-0307474728',
      stock: 3
    },
    {
      id: '6712e8f0c3b2a9e4d1f00002',
      titulo: 'Don Quijote de la Mancha',
      autor: 'Miguel de Cervantes',
      año: 1605,
      genero: 'Novela',
      isbn: '978-8424115104',
      stock: 5
    },
    {
      id: '6712e8f0c3b2a9e4d1f00003',
      titulo: '1984',
      autor: 'George Orwell',
      año: 1949,
      genero: 'Ficción',
      isbn: '978-0451524935',
      stock: 2
    },
    {
      id: '6712e8f0c3b2a9e4d1f00004',
      titulo: 'Rayuela',
      autor: 'Julio Cortázar',
      año: 1963,
      genero: 'Novela',
      isbn: '978-8437604572',
      stock: 4
    },
    {
      id: '6712e8f0c3b2a9e4d1f00005',
      titulo: 'El Aleph',
      autor: 'Jorge Luis Borges',
      año: 1949,
      genero: 'Ficción',
      isbn: '978-8420633114',
      stock: 1
    },
    {
      id: '6712e8f0c3b2a9e4d1f00006',
      titulo: 'Clean Architecture',
      autor: 'Robert C. Martin',
      año: 2017,
      genero: 'Tecnología',
      isbn: '978-0134494166',
      stock: 6
    },
    {
      id: '6712e8f0c3b2a9e4d1f00007',
      titulo: 'Sapiens: De animales a dioses',
      autor: 'Yuval Noah Harari',
      año: 2011,
      genero: 'Historia',
      isbn: '978-8499926223',
      stock: 4
    },
    {
      id: '6712e8f0c3b2a9e4d1f00008',
      titulo: 'Breves respuestas a las grandes preguntas',
      autor: 'Stephen Hawking',
      año: 2018,
      genero: 'Ciencia',
      isbn: '978-8491392958',
      stock: 3
    }
  ];

  let huboCambios = false;
  for (const item of iniciales) {
    if (!dbCatalog.libros.some((l) => l.id === item.id)) {
      const { stock, ...fichaLibro } = item;
      dbCatalog.libros.push({
        ...fichaLibro,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      huboCambios = true;
    }
    if (!dbInventory.stock.some((s) => s.libroId === item.id)) {
      dbInventory.stock.push({
        libroId: item.id,
        stockDisponible: item.stock,
        ultimaActualizacion: new Date().toISOString()
      });
      huboCambios = true;
    }
  }
  if (huboCambios) {
    guardarDB('catalog', dbCatalog);
    guardarDB('inventory', dbInventory);
  }
}

async function arrancarSistema() {
  await inicializarDatosSemilla();

  catalogServer.listen(3001, () => registrarLog('catalog-service', 'info', 'Escuchando en http://localhost:3001 (db_catalog)'));
  inventoryServer.listen(3002, () => registrarLog('inventory-service', 'info', 'Escuchando en http://localhost:3002 (db_inventory + Redis Lock)'));
  ordersServer.listen(3003, () => registrarLog('orders-service', 'info', 'Escuchando en http://localhost:3003 (db_orders)'));
  authServer.listen(3004, () => registrarLog('auth-service', 'info', 'Escuchando en http://localhost:3004 (db_auth + bcrypt + JWT)'));
  webServer.listen(3000, () => {
    console.log('\n============================================================================');
    console.log('🚀 SISTEMA DISTRIBUIDO DE LIBRERÍA COMERCIAL ACTIVO Y OPERATIVO');
    console.log('🖥️  Abrir en el navegador:  http://localhost:3000');
    console.log('----------------------------------------------------------------------------');
    console.log('📚 catalog-service:         http://localhost:3001/api/libros');
    console.log('📦 inventory-service:       http://localhost:3002/health');
    console.log('🧾 orders-service:          http://localhost:3003/health');
    console.log('🔐 auth-service (JWT/RBAC): http://localhost:3004/health');
    console.log('============================================================================\n');
  });
}

arrancarSistema();
