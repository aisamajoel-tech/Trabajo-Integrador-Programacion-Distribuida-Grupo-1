const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_ISSUER } = require('../config/env');
const logger = require('../config/logger');

/**
 * Extrae y verifica el token Bearer si fue enviado (útil para endpoints que admiten
 * comportamiento público y comportamiento administrado cuando viene un token ADMIN).
 */
function extraerTokenBearer(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return { presente: false };
  }
  const partes = authHeader.trim().split(/\s+/);
  if (partes.length !== 2 || partes[0] !== 'Bearer' || !partes[1]) {
    return { presente: true, malFormado: true };
  }
  return { presente: true, token: partes[1] };
}

function verificarJwt(token) {
  return jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER
  });
}

/**
 * Middleware reutilizable de autenticación JWT (Sección 9):
 * - Sin token           -> 401 TOKEN_NO_PROPORCIONADO
 * - Token mal formado   -> 401 TOKEN_MAL_FORMADO
 * - Firma inválida      -> 401 TOKEN_INVALIDO
 * - Token vencido       -> 401 TOKEN_VENCIDO
 * - Token válido        -> adjunta `req.user` y llama a `next()`
 */
function autenticarJWT(req, res, next) {
  const extraido = extraerTokenBearer(req);

  if (!extraido.presente) {
    logger.warn('Acceso denegado: token JWT no proporcionado', {
      operacion: 'auth.jwt.missing',
      endpoint: `${req.method} ${req.originalUrl}`,
      requestId: req.headers['x-request-id']
    });
    return res.status(401).json({
      error: 'Autenticación requerida. Debe enviar el encabezado Authorization: Bearer <token>.',
      codigo: 'TOKEN_NO_PROPORCIONADO'
    });
  }

  if (extraido.malFormado) {
    logger.warn('Acceso denegado: formato de encabezado Authorization inválido', {
      operacion: 'auth.jwt.malformed',
      endpoint: `${req.method} ${req.originalUrl}`,
      requestId: req.headers['x-request-id']
    });
    return res.status(401).json({
      error: 'Formato de token inválido. Utilice el esquema Authorization: Bearer <token>.',
      codigo: 'TOKEN_MAL_FORMADO'
    });
  }

  try {
    const payload = verificarJwt(extraido.token);
    req.user = {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      iss: payload.iss,
      iat: payload.iat,
      exp: payload.exp
    };
    return next();
  } catch (err) {
    const esVencido = err.name === 'TokenExpiredError';
    const codigo = esVencido ? 'TOKEN_VENCIDO' : 'TOKEN_INVALIDO';
    const mensaje = esVencido
      ? 'El token JWT ha expirado. Inicie sesión nuevamente.'
      : 'El token JWT es inválido o su firma no pudo verificarse.';

    logger.warn(`Acceso denegado: ${codigo}`, {
      operacion: 'auth.jwt.invalid',
      endpoint: `${req.method} ${req.originalUrl}`,
      motivo: err.name,
      requestId: req.headers['x-request-id']
    });

    return res.status(401).json({
      error: mensaje,
      codigo
    });
  }
}

/**
 * Middleware reutilizable de autorización basada en roles (RBAC - Sección 11):
 * - Si la identidad es válida pero no posee uno de los roles permitidos -> 403 PERMISOS_INSUFICIENTES
 */
function requerirRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        error: 'Autenticación requerida.',
        codigo: 'TOKEN_NO_PROPORCIONADO'
      });
    }

    if (!rolesPermitidos.includes(req.user.role)) {
      logger.warn('Autorización denegada por rol insuficiente (403)', {
        operacion: 'auth.rbac.forbidden',
        endpoint: `${req.method} ${req.originalUrl}`,
        usuarioId: req.user.sub,
        rolActual: req.user.role,
        rolesRequeridos: rolesPermitidos,
        requestId: req.headers['x-request-id']
      });
      return res.status(403).json({
        error: `Permisos insuficientes. Esta operación requiere rol: ${rolesPermitidos.join(' o ')}.`,
        codigo: 'PERMISOS_INSUFICIENTES',
        rolActual: req.user.role,
        rolesRequeridos: rolesPermitidos
      });
    }

    return next();
  };
}

module.exports = {
  autenticarJWT,
  requerirRol,
  extraerTokenBearer,
  verificarJwt
};
