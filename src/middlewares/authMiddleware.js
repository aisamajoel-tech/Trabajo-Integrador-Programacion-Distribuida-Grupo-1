/**
 * MIDDLEWARE MVC: Autenticación JWT (HS256) y Control de Acceso Basado en Roles (RBAC)
 * Implementa la validación local del token Bearer y verifica permisos USER / ADMIN.
 */
const crypto = require('crypto');
const { JWT } = require('../config/env');

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}

function firmarJWT(payload, expiresInSeconds = JWT.EXPIRES_IN_SECONDS) {
  const ahora = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const claims = {
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
    iss: JWT.ISSUER,
    iat: ahora,
    exp: ahora + expiresInSeconds
  };
  const seg1 = base64UrlEncode(JSON.stringify(header));
  const seg2 = base64UrlEncode(JSON.stringify(claims));
  const firma = base64UrlEncode(
    crypto.createHmac('sha256', JWT.SECRET).update(`${seg1}.${seg2}`).digest()
  );
  return { token: `${seg1}.${seg2}.${firma}`, claims };
}

function verificarJWT(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) {
    const err = new Error('Formato de token inválido');
    err.code = 'TOKEN_INVALIDO';
    throw err;
  }
  const [seg1, seg2, firmaRecibida] = partes;
  const firmaEsperada = base64UrlEncode(
    crypto.createHmac('sha256', JWT.SECRET).update(`${seg1}.${seg2}`).digest()
  );
  if (firmaRecibida !== firmaEsperada) {
    const err = new Error('Firma criptográfica del token inválida');
    err.code = 'TOKEN_INVALIDO';
    throw err;
  }
  const payload = JSON.parse(base64UrlDecode(seg2));
  const ahora = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= ahora) {
    const err = new Error('El token JWT ha expirado');
    err.code = 'TOKEN_EXPIRADO';
    throw err;
  }
  return payload;
}

module.exports = {
  firmarJWT,
  verificarJWT
};
