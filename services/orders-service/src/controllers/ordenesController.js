const ordenesService = require('../services/ordenesService');
const { ESTADOS } = require('../models/Orden');
const { estaConectadoMongo } = require('../config/db');
const logger = require('../config/logger');

const OBJECT_ID = /^[a-fA-F0-9]{24}$/;
const textoNoVacio = (v) => typeof v === 'string' && v.trim().length > 0;
const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

function responderError(res, status, codigo, error, extra = {}) {
  return res.status(status).json({ error, codigo, ...extra });
}

function dbDisponible(req, res) {
  if (estaConectadoMongo()) return true;
  logger.error('Operación rechazada: db_orders no disponible', { endpoint: `${req.method} ${req.originalUrl}` });
  responderError(res, 503, 'DB_NO_DISPONIBLE', 'Base de datos de órdenes temporalmente no disponible.');
  return false;
}

function manejarError(err, req, res, next) {
  if (/Mongo(Network|ServerSelection|NotConnected)|buffering timed out/i.test(`${err.name} ${err.message}`)) {
    logger.error('Operación rechazada: MongoDB no disponible', { endpoint: `${req.method} ${req.originalUrl}`, error: err.message });
    return responderError(res, 503, 'DB_NO_DISPONIBLE', 'Base de datos de órdenes temporalmente no disponible.');
  }
  return next(err);
}

/** POST /api/ordenes */
async function crearOrden(req, res, next) {
  const { clienteId, libroId, cantidad } = body(req);

  // Validación del body: si falla -> 400 sin crear orden ni llamar a otros servicios
  const detalles = [];
  if (!textoNoVacio(clienteId)) detalles.push('clienteId es obligatorio (texto no vacío).');
  if (!textoNoVacio(libroId)) detalles.push('libroId es obligatorio (texto no vacío).');
  else if (!OBJECT_ID.test(libroId)) detalles.push('libroId debe ser un ObjectId de 24 caracteres hexadecimales.');
  if (!Number.isInteger(cantidad) || cantidad < 1) detalles.push('cantidad debe ser un entero mayor o igual a 1.');
  if (detalles.length) {
    return responderError(res, 400, 'VALIDACION_FALLIDA', 'Datos de la orden inválidos.', { detalles });
  }

  if (!dbDisponible(req, res)) return;

  try {
    const { status, body: respuesta } = await ordenesService.crearOrden(
      { clienteId: clienteId.trim(), libroId, cantidad },
      req.requestId
    );
    return res.status(status).json(respuesta);
  } catch (err) {
    return manejarError(err, req, res, next);
  }
}

/** GET /api/ordenes/:id */
async function obtenerOrden(req, res, next) {
  const { id } = req.params;
  if (!OBJECT_ID.test(id)) {
    return responderError(res, 400, 'ID_INVALIDO', 'id inválido. Debe ser un ObjectId de 24 caracteres hexadecimales.');
  }
  if (!dbDisponible(req, res)) return;

  try {
    const orden = await ordenesService.obtenerOrden(id);
    if (!orden) return responderError(res, 404, 'ORDEN_NO_ENCONTRADA', 'No existe una orden con ese id.');
    return res.status(200).json(orden);
  } catch (err) {
    return manejarError(err, req, res, next);
  }
}

/** GET /api/ordenes/cliente/:clienteId */
async function historialCliente(req, res, next) {
  const { clienteId } = req.params;
  const { estado } = req.query;
  if (estado !== undefined && !ESTADOS.includes(estado)) {
    return responderError(res, 400, 'VALIDACION_FALLIDA', `estado debe ser uno de: ${ESTADOS.join(', ')}.`);
  }
  if (!dbDisponible(req, res)) return;

  try {
    return res.status(200).json(await ordenesService.historialCliente(clienteId, estado));
  } catch (err) {
    return manejarError(err, req, res, next);
  }
}

module.exports = { crearOrden, obtenerOrden, historialCliente };
