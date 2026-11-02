const authService = require('../services/authService');
const { ErrorAuth } = authService;
const { estaConectadoMongo } = require('../config/db');
const { extraerTokenBearer, verificarJwt } = require('../middlewares/authMiddleware');
const logger = require('../config/logger');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;

function verificarDisponibilidadDB(req, res) {
  if (!estaConectadoMongo()) {
    logger.error('Operación rechazada: db_auth no disponible', {
      operacion: 'db.unavailable',
      endpoint: `${req.method} ${req.originalUrl}`
    });
    res.status(503).json({
      error: 'Base de datos de identidad temporalmente no disponible.',
      codigo: 'DB_NO_DISPONIBLE'
    });
    return false;
  }
  return true;
}

function manejarErrorController(err, req, res, next) {
  if (err instanceof ErrorAuth) {
    return res.status(err.status).json({
      error: err.mensaje || err.message,
      codigo: err.codigo,
      ...err.extra
    });
  }
  if (err.name === 'ValidationError') {
    const detalles = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      error: 'Datos de entrada inválidos.',
      codigo: 'VALIDACION_FALLIDA',
      detalles
    });
  }
  return next(err);
}

/**
 * POST /api/auth/register (y alias /auth/register)
 */
async function register(req, res, next) {
  if (!verificarDisponibilidadDB(req, res)) return;

  const { email, password, nombre, role } = req.body || {};
  const errores = [];

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    errores.push('Debe proporcionar un email válido (ej. usuario@dominio.com).');
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    errores.push('La contraseña es obligatoria y debe tener al menos 6 caracteres.');
  }
  if (nombre !== undefined && (typeof nombre !== 'string' || nombre.trim().length < 2)) {
    errores.push('El nombre, si se incluye, debe tener al menos 2 caracteres.');
  }

  if (errores.length > 0) {
    return res.status(400).json({
      error: 'Datos de registro inválidos.',
      codigo: 'VALIDACION_FALLIDA',
      detalles: errores
    });
  }

  // Si el cliente envía un token Bearer válido (por ejemplo un ADMIN creando otro ADMIN), lo verificamos
  let solicitante = null;
  const extraido = extraerTokenBearer(req);
  if (extraido.presente && !extraido.malFormado) {
    try {
      solicitante = verificarJwt(extraido.token);
    } catch (_) {
      solicitante = null;
    }
  }

  try {
    const usuario = await authService.registrarUsuario({ email, password, nombre, role }, solicitante);
    return res.status(201).json({
      mensaje: 'Usuario registrado exitosamente.',
      usuario
    });
  } catch (err) {
    return manejarErrorController(err, req, res, next);
  }
}

/**
 * POST /api/auth/login (y alias /auth/login)
 */
async function login(req, res, next) {
  if (!verificarDisponibilidadDB(req, res)) return;

  const { email, password } = req.body || {};
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({
      error: 'Debe enviar email y password en el cuerpo de la solicitud.',
      codigo: 'VALIDACION_FALLIDA'
    });
  }

  try {
    const resultado = await authService.loginUsuario({ email, password });
    return res.status(200).json(resultado);
  } catch (err) {
    return manejarErrorController(err, req, res, next);
  }
}

/**
 * GET /api/auth/me (y alias /auth/me)
 */
async function me(req, res, next) {
  if (!verificarDisponibilidadDB(req, res)) return;

  try {
    const perfil = await authService.obtenerPerfil(req.user.sub);
    return res.status(200).json({
      usuario: perfil,
      tokenClaims: req.user
    });
  } catch (err) {
    return manejarErrorController(err, req, res, next);
  }
}

/**
 * PATCH /api/auth/usuarios/:id/estado (Solo ADMIN)
 */
async function actualizarEstado(req, res, next) {
  if (!verificarDisponibilidadDB(req, res)) return;

  const { id } = req.params;
  if (!OBJECT_ID_REGEX.test(String(id || ''))) {
    return res.status(400).json({
      error: 'El identificador de usuario no es un ObjectId válido.',
      codigo: 'ID_INVALIDO'
    });
  }

  const { activo, role } = req.body || {};
  if (typeof activo !== 'boolean' && role === undefined) {
    return res.status(400).json({
      error: 'Debe indicar al menos `activo` (boolean) o `role` (USER | ADMIN).',
      codigo: 'VALIDACION_FALLIDA'
    });
  }

  try {
    const usuario = await authService.actualizarEstadoUsuario(id, { activo, role }, req.user.sub);
    return res.status(200).json({
      mensaje: 'Usuario actualizado correctamente.',
      usuario
    });
  } catch (err) {
    return manejarErrorController(err, req, res, next);
  }
}

module.exports = {
  register,
  login,
  me,
  actualizarEstado
};
