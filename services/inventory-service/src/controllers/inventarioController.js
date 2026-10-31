const inventarioService = require('../services/inventarioService');
const { RedisNoDisponibleError } = require('../services/lockService');
const { estaConectadoMongo } = require('../config/db');
const logger = require('../config/logger');

const { ErrorNegocio } = inventarioService;
const OBJECT_ID = /^[a-fA-F0-9]{24}$/;
const esEnteroDesde = (valor, minimo) => Number.isInteger(valor) && valor >= minimo;

const requestIdDe = (req) => req.headers['x-request-id'];
const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

function responderError(res, status, codigo, error, extra = {}) {
  return res.status(status).json({ error, codigo, ...extra });
}

/**
 * Traduce cualquier error a una respuesta controlada.
 * Redis caído -> 503 REDIS_NO_DISPONIBLE (nunca 500).
 */
function manejarError(err, req, res, next, endpoint) {
  if (err instanceof ErrorNegocio) {
    return responderError(res, err.status, err.codigo, err.message, err.extra);
  }

  if (err instanceof RedisNoDisponibleError) {
    logger.error('Operación rechazada: Redis/Memurai no disponible', {
      endpoint,
      dependencia: 'redis',
      causa: err.detalle,
      requestId: requestIdDe(req)
    });
    return responderError(res, 503, 'REDIS_NO_DISPONIBLE', err.message);
  }

  if (err.name === 'ValidationError') {
    const detalles = Object.values(err.errors).map((e) => e.message);
    return responderError(res, 400, 'VALIDACION_FALLIDA', 'Datos de entrada inválidos.', { detalles });
  }

  // Errores de conexión con MongoDB a mitad de una operación
  if (/Mongo(Network|ServerSelection|NotConnected)|buffering timed out/i.test(`${err.name} ${err.message}`)) {
    logger.error('Operación rechazada: MongoDB no disponible', { endpoint, error: err.message });
    return responderError(res, 503, 'DB_NO_DISPONIBLE', 'Base de datos de inventario temporalmente no disponible.');
  }

  logger.error('Error inesperado en inventory-service', { endpoint, error: err.message, stack: err.stack });
  return next(err);
}

/** Validaciones comunes: libroId con formato ObjectId y MongoDB disponible */
function validarBase(req, res, libroId) {
  if (!OBJECT_ID.test(String(libroId || ''))) {
    responderError(
      res,
      400,
      'ID_INVALIDO',
      'libroId inválido. Debe ser un ObjectId de 24 caracteres hexadecimales.'
    );
    return false;
  }
  if (!estaConectadoMongo()) {
    logger.error('Operación rechazada: db_inventory no disponible', { endpoint: `${req.method} ${req.originalUrl}` });
    responderError(res, 503, 'DB_NO_DISPONIBLE', 'Base de datos de inventario temporalmente no disponible.');
    return false;
  }
  return true;
}

async function crearStock(req, res, next) {
  const endpoint = 'POST /api/inventario';
  const { libroId } = body(req);
  // `stockInicial` es el nombre del contrato; se acepta `stockDisponible` como alias
  const stockInicial = body(req).stockInicial ?? body(req).stockDisponible ?? 0;

  if (!validarBase(req, res, libroId)) return;
  if (!esEnteroDesde(stockInicial, 0)) {
    return responderError(res, 400, 'VALIDACION_FALLIDA', 'stockInicial debe ser un entero mayor o igual a 0.');
  }

  try {
    const creado = await inventarioService.crearStock({ libroId, stockInicial }, requestIdDe(req));
    return res.status(201).json(creado);
  } catch (err) {
    return manejarError(err, req, res, next, endpoint);
  }
}

async function consultarStock(req, res, next) {
  const { libroId } = req.params;
  if (!validarBase(req, res, libroId)) return;

  try {
    return res.status(200).json(await inventarioService.consultarStock(libroId));
  } catch (err) {
    return manejarError(err, req, res, next, `GET /api/inventario/${libroId}`);
  }
}

async function descontarStock(req, res, next) {
  const { libroId } = req.params;
  const { cantidad = 1, clienteId, ordenId } = body(req);
  if (!validarBase(req, res, libroId)) return;

  if (!esEnteroDesde(cantidad, 1)) {
    return responderError(res, 400, 'VALIDACION_FALLIDA', 'cantidad debe ser un entero mayor o igual a 1.');
  }
  if (ordenId !== undefined && (typeof ordenId !== 'string' || !ordenId.trim())) {
    return responderError(res, 400, 'VALIDACION_FALLIDA', 'ordenId, si se envía, debe ser un texto no vacío.');
  }

  // clienteId del body (contrato) o del header x-client-id (compatibilidad con el monolito)
  const cliente = clienteId || req.headers['x-client-id'];

  try {
    const resultado = await inventarioService.descontarStock(
      libroId,
      { cantidad, clienteId: cliente, ordenId },
      requestIdDe(req)
    );
    return res.status(200).json(resultado);
  } catch (err) {
    return manejarError(err, req, res, next, `POST /api/inventario/${libroId}/descontar`);
  }
}

async function reponerStock(req, res, next) {
  const { libroId } = req.params;
  const { cantidad, stock } = body(req);
  if (!validarBase(req, res, libroId)) return;

  if (stock !== undefined && !esEnteroDesde(stock, 0)) {
    return responderError(res, 400, 'VALIDACION_FALLIDA', 'stock debe ser un entero mayor o igual a 0.');
  }
  if (stock === undefined && !esEnteroDesde(cantidad, 1)) {
    return responderError(
      res,
      400,
      'VALIDACION_FALLIDA',
      'Enviar { cantidad } (entero ≥ 1) para reponer o { stock } (entero ≥ 0) para fijar el saldo.'
    );
  }

  try {
    return res.status(200).json(await inventarioService.reponerStock(libroId, { cantidad, stock }, requestIdDe(req)));
  } catch (err) {
    return manejarError(err, req, res, next, `POST /api/inventario/${libroId}/reponer`);
  }
}

async function revertirDescuento(req, res, next) {
  const { libroId } = req.params;
  const { ordenId } = body(req);
  if (!validarBase(req, res, libroId)) return;

  if (typeof ordenId !== 'string' || !ordenId.trim()) {
    return responderError(res, 400, 'VALIDACION_FALLIDA', 'ordenId es obligatorio para revertir un descuento.');
  }

  try {
    return res.status(200).json(await inventarioService.revertirDescuento(libroId, { ordenId }, requestIdDe(req)));
  } catch (err) {
    return manejarError(err, req, res, next, `POST /api/inventario/${libroId}/revertir`);
  }
}

async function estadoLock(req, res, next) {
  const { libroId } = req.params;
  if (!OBJECT_ID.test(String(libroId))) {
    return responderError(res, 400, 'ID_INVALIDO', 'libroId inválido. Debe ser un ObjectId de 24 caracteres hexadecimales.');
  }

  try {
    return res.status(200).json(await inventarioService.estadoLock(libroId));
  } catch (err) {
    return manejarError(err, req, res, next, `GET /api/inventario/${libroId}/lock-status`);
  }
}

module.exports = {
  crearStock,
  consultarStock,
  descontarStock,
  reponerStock,
  revertirDescuento,
  estadoLock
};
