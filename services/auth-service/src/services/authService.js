const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');
const logger = require('../config/logger');
const {
  BCRYPT_ROUNDS,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_ISSUER,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_NOMBRE
} = require('../config/env');

class ErrorAuth extends Error {
  constructor(status, codigo, mensaje, extra = {}) {
    super(mensaje);
    this.name = 'ErrorAuth';
    this.status = status;
    this.codigo = codigo;
    this.extra = extra;
  }
}

/**
 * Bootstrap idempotente del usuario ADMIN inicial configurado por variables de entorno.
 * Permite que un clon limpio del repositorio disponga de un administrador inicial sin
 * permitir que cualquier cliente anónimo se auto-asigne el rol ADMIN en /register.
 */
async function asegurarAdminInicial() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;

  const emailNormalizado = ADMIN_EMAIL.trim().toLowerCase();
  const existente = await Usuario.findOne({ email: emailNormalizado });
  if (existente) {
    if (existente.role !== 'ADMIN') {
      existente.role = 'ADMIN';
      await existente.save();
    }
    logger.info('Usuario ADMIN inicial ya presente en db_auth', {
      operacion: 'auth.bootstrap.admin',
      email: emailNormalizado,
      usuarioId: existente._id.toString()
    });
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
  const admin = await Usuario.create({
    email: emailNormalizado,
    nombre: ADMIN_NOMBRE || 'Administrador Librería',
    passwordHash,
    role: 'ADMIN',
    activo: true
  });

  logger.info('Usuario ADMIN inicial creado exitosamente en db_auth', {
    operacion: 'auth.bootstrap.admin.created',
    email: emailNormalizado,
    usuarioId: admin._id.toString(),
    role: admin.role
  });
}

/**
 * Registra un nuevo usuario en db_auth (Sección 6.2).
 * - Hashea la contraseña con bcrypt (nunca guarda ni devuelve texto plano ni hash).
 * - Impide emails duplicados (409 USUARIO_YA_EXISTE).
 * - Por defecto asigna rol USER. Si se solicita explícitamente `role: 'ADMIN'`, solo lo permite
 *   cuando `solicitante` es un ADMIN autenticado (Sección 7: prohibido aceptar roles libremente).
 */
async function registrarUsuario({ email, password, nombre, role }, solicitante = null) {
  const emailNormalizado = String(email || '').trim().toLowerCase();
  const nombreLimpio = String(nombre || emailNormalizado.split('@')[0] || '').trim();

  let rolAsignado = 'USER';
  if (role !== undefined && role !== null && String(role).trim() !== '') {
    const rolPedido = String(role).trim().toUpperCase();
    if (!['USER', 'ADMIN'].includes(rolPedido)) {
      throw new ErrorAuth(400, 'ROL_INVALIDO', 'El rol especificado no es válido. Valores permitidos: USER, ADMIN.');
    }
    if (rolPedido === 'ADMIN') {
      if (!solicitante || solicitante.role !== 'ADMIN') {
        logger.warn('Intento rechazado de auto-asignación de rol ADMIN sin privilegios', {
          operacion: 'auth.register.role_escalation_blocked',
          emailIntentado: emailNormalizado
        });
        throw new ErrorAuth(
          403,
          'ROL_NO_PERMITIDO',
          'No se permite auto-asignar el rol ADMIN en el registro público. Requiere autorización de un ADMIN.'
        );
      }
      rolAsignado = 'ADMIN';
    }
  }

  const previo = await Usuario.findOne({ email: emailNormalizado });
  if (previo) {
    logger.warn('Intento de registro con email ya existente', {
      operacion: 'auth.register.duplicate',
      email: emailNormalizado
    });
    throw new ErrorAuth(409, 'USUARIO_YA_EXISTE', 'Ya existe un usuario registrado con ese email.');
  }

  const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);

  try {
    const creado = await Usuario.create({
      email: emailNormalizado,
      nombre: nombreLimpio,
      passwordHash,
      role: rolAsignado,
      activo: true
    });

    logger.info('Usuario registrado exitosamente', {
      operacion: 'auth.register.success',
      usuarioId: creado._id.toString(),
      email: creado.email,
      role: creado.role
    });

    return creado.toJSON();
  } catch (err) {
    if (err.code === 11000) {
      throw new ErrorAuth(409, 'USUARIO_YA_EXISTE', 'Ya existe un usuario registrado con ese email.');
    }
    throw err;
  }
}

/**
 * Autentica credenciales y emite un access token JWT firmado (Secciones 7 y 8).
 * - Usuario inexistente o password incorrecta -> 401 CREDENCIALES_INVALIDAS (mensaje genérico).
 * - Cuenta deshabilitada (`activo === false`) -> 403 CUENTA_DESHABILITADA.
 * - Credenciales válidas -> 200 OK + JWT firmado (claims: sub, email, role, iss, iat, exp).
 * - Nunca imprime la contraseña ni el JWT completo en los logs (Sección 17).
 */
async function loginUsuario({ email, password }) {
  const emailNormalizado = String(email || '').trim().toLowerCase();

  const usuario = await Usuario.findOne({ email: emailNormalizado }).select('+passwordHash');
  if (!usuario) {
    logger.warn('Login fallido: credenciales inválidas', {
      operacion: 'auth.login.failed',
      motivoInterno: 'usuario_no_encontrado'
    });
    throw new ErrorAuth(401, 'CREDENCIALES_INVALIDAS', 'Credenciales inválidas.');
  }

  const passwordCoincide = await bcrypt.compare(String(password), usuario.passwordHash);
  if (!passwordCoincide) {
    logger.warn('Login fallido: credenciales inválidas', {
      operacion: 'auth.login.failed',
      usuarioId: usuario._id.toString(),
      motivoInterno: 'password_incorrecto'
    });
    throw new ErrorAuth(401, 'CREDENCIALES_INVALIDAS', 'Credenciales inválidas.');
  }

  if (!usuario.activo) {
    logger.warn('Login rechazado: cuenta deshabilitada', {
      operacion: 'auth.login.disabled',
      usuarioId: usuario._id.toString()
    });
    throw new ErrorAuth(403, 'CUENTA_DESHABILITADA', 'La cuenta de usuario se encuentra deshabilitada.');
  }

  const usuarioId = usuario._id.toString();
  const payload = {
    sub: usuarioId,
    email: usuario.email,
    role: usuario.role
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: JWT_EXPIRES_IN,
    issuer: JWT_ISSUER
  });

  const decodificado = jwt.decode(accessToken);

  logger.info('Login exitoso y emisión de JWT', {
    operacion: 'auth.login.success',
    usuarioId,
    role: usuario.role,
    exp: decodificado?.exp
  });

  return {
    accessToken,
    tokenType: 'Bearer',
    expiresIn: JWT_EXPIRES_IN,
    claims: {
      sub: usuarioId,
      email: usuario.email,
      role: usuario.role,
      iss: decodificado?.iss,
      iat: decodificado?.iat,
      exp: decodificado?.exp
    },
    usuario: {
      id: usuarioId,
      email: usuario.email,
      nombre: usuario.nombre,
      role: usuario.role,
      activo: usuario.activo
    }
  };
}

/**
 * Obtiene el perfil del usuario autenticado (GET /api/auth/me).
 */
async function obtenerPerfil(usuarioId) {
  const usuario = await Usuario.findById(usuarioId);
  if (!usuario) {
    throw new ErrorAuth(404, 'USUARIO_NO_ENCONTRADO', 'El usuario asociado al token ya no existe.');
  }
  return usuario.toJSON();
}

/**
 * Permite a un ADMIN habilitar/deshabilitar una cuenta (`activo`) o actualizar su rol.
 */
async function actualizarEstadoUsuario(usuarioId, { activo, role }, adminId) {
  const cambios = {};
  if (typeof activo === 'boolean') cambios.activo = activo;
  if (role !== undefined) {
    const rolNormalizado = String(role).trim().toUpperCase();
    if (!['USER', 'ADMIN'].includes(rolNormalizado)) {
      throw new ErrorAuth(400, 'ROL_INVALIDO', 'El rol debe ser USER o ADMIN.');
    }
    cambios.role = rolNormalizado;
  }

  const actualizado = await Usuario.findByIdAndUpdate(usuarioId, { $set: cambios }, { new: true, runValidators: true });
  if (!actualizado) {
    throw new ErrorAuth(404, 'USUARIO_NO_ENCONTRADO', 'Usuario no encontrado.');
  }

  logger.info('Estado/rol de usuario actualizado por ADMIN', {
    operacion: 'auth.user.update_state',
    usuarioId,
    adminId,
    cambios
  });

  return actualizado.toJSON();
}

module.exports = {
  ErrorAuth,
  asegurarAdminInicial,
  registrarUsuario,
  loginUsuario,
  obtenerPerfil,
  actualizarEstadoUsuario
};
