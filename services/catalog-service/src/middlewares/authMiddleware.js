const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_ISSUER } = require('../config/env');
const logger = require('../config/logger');

/**
 * Middleware reutilizable de validación de JWT (TP7 - Sección 9).
 * Valida el token de manera autocontenida (stateless) sin consultar db_auth:
 * - Sin token           -> 401 TOKEN_NO_PROPORCIONADO
 * - Token mal formado   -> 401 TOKEN_MAL_FORMADO
 * - Firma inválida      -> 401 TOKEN_INVALIDO
 * - Token vencido       -> 401 TOKEN_VENCIDO
 * - Token válido        -> adjunta `req.user` y continúa con `next()`
 */
function autenticarJWT(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || typeof authHeader !== 'string') {
    logger.warn('Acceso denegado en catalog-service: token JWT ausente', {
      operacion: 'auth.jwt.missing',
      endpoint: `${req.method} ${req.originalUrl}`,
      requestId: req.headers['x-request-id']
    });
    return res.status(401).json({
      error: 'Autenticación requerida. Debe enviar el encabezado Authorization: Bearer <token>.',
      codigo: 'TOKEN_NO_PROPORCIONADO'
    });
  }

  const partes = authHeader.trim().split(/\s+/);
  if (partes.length !== 2 || partes[0] !== 'Bearer' || !partes[1]) {
    logger.warn('Acceso denegado en catalog-service: formato Authorization inválido', {
      operacion: 'auth.jwt.malformed',
      endpoint: `${req.method} ${req.originalUrl}`,
      requestId: req.headers['x-request-id']
    });
    return res.status(401).json({
      error: 'Formato de token inválido. Utilice el esquema Authorization: Bearer <token>.',
      codigo: 'TOKEN_MAL_FORMADO'
    });
  }

  const token = partes[1];

  try {
    const opcionesVerificacion = {
      algorithms: ['HS256']
    };
    if (JWT_ISSUER) {
      opcionesVerificacion.issuer = JWT_ISSUER;
    }

    const payload = jwt.verify(token, JWT_SECRET, opcionesVerificacion);
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

    logger.warn(`Acceso denegado en catalog-service: ${codigo}`, {
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
 * Middleware reutilizable de autorización basada en roles (RBAC - Sección 11).
 * Si el token es válido pero el rol del usuario no está entre los permitidos -> 403 Forbidden.
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
      logger.warn('Autorización denegada en catalog-service por rol insuficiente (403)', {
        operacion: 'auth.rbac.forbidden',
        endpoint: `${req.method} ${req.originalUrl}`,
        usuarioId: req.user.sub,
        rolActual: req.user.role,
        rolesRequeridos: rolesPermitidos,
        requestId: req.headers['x-request-id']
      });
      return res.status(403).json({
        error: `Permisos insuficientes. Esta operación sobre el catálogo requiere rol: ${rolesPermitidos.join(' o ')}.`,
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
  requerirRol
};
