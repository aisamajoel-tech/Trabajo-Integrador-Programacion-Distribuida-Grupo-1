const crypto = require('crypto');
const { obtenerCliente, estaConectadoRedis } = require('../config/redis');
const { LOCK_TTL_MS, LOCK_REINTENTOS, LOCK_ESPERA_MS } = require('../config/env');

/**
 * Lock distribuido sobre Redis/Memurai (migrado de app-base/services/lockService.js).
 *
 * - Adquisición atómica: SET lock:libro:{id} <token> NX PX <LOCK_TTL_MS>
 * - Liberación atómica con script Lua: solo borra la clave si el token es del dueño.
 * - Granularidad: un lock por libro, así compras de libros distintos no se bloquean entre sí.
 */

const SCRIPT_LIBERAR = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

/** Error que el controlador traduce a 503 REDIS_NO_DISPONIBLE */
class RedisNoDisponibleError extends Error {
  constructor(detalle) {
    super('El servicio de coordinación (Redis/Memurai) no está disponible.');
    this.name = 'RedisNoDisponibleError';
    this.detalle = detalle;
  }
}

const claveLock = (libroId) => `lock:libro:${libroId}`;
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clienteListo() {
  const cliente = obtenerCliente();
  if (!cliente || !estaConectadoRedis()) {
    throw new RedisNoDisponibleError('Cliente Redis desconectado');
  }
  return cliente;
}

/**
 * Intenta tomar el lock una vez. Devuelve { exitoso, token, key, ttlMs }.
 */
async function intentarLock(libroId, ttlMs = LOCK_TTL_MS) {
  const cliente = clienteListo();
  const key = claveLock(libroId);
  const token = crypto.randomUUID();

  let resultado;
  try {
    resultado = await cliente.set(key, token, { NX: true, PX: ttlMs });
  } catch (err) {
    throw new RedisNoDisponibleError(err.message);
  }

  return resultado === 'OK'
    ? { exitoso: true, token, key, ttlMs }
    : { exitoso: false, token: null, key, ttlMs };
}

/**
 * Toma el lock con reintentos breves (LOCK_REINTENTOS veces, espera creciente de LOCK_ESPERA_MS).
 * Si sigue ocupado después de los reintentos, devuelve exitoso = false (el controlador responde 409).
 */
async function adquirirLock(libroId, ttlMs = LOCK_TTL_MS) {
  let intento = await intentarLock(libroId, ttlMs);
  for (let i = 1; !intento.exitoso && i <= LOCK_REINTENTOS; i += 1) {
    await esperar(LOCK_ESPERA_MS * i);
    intento = await intentarLock(libroId, ttlMs);
  }
  return intento;
}

/**
 * Libera el lock solo si el token coincide con el propietario (script Lua atómico).
 * Nunca lanza: si Redis cayó en el medio, el TTL termina liberando la clave.
 */
async function liberarLock(libroId, token) {
  const cliente = obtenerCliente();
  if (!cliente || !estaConectadoRedis() || !token) return false;

  try {
    const resultado = await cliente.eval(SCRIPT_LIBERAR, {
      keys: [claveLock(libroId)],
      arguments: [token]
    });
    return resultado === 1;
  } catch {
    return false;
  }
}

/**
 * Diagnóstico: indica si hay un lock activo y su TTL restante en ms.
 */
async function obtenerEstadoLock(libroId) {
  const cliente = clienteListo();
  const key = claveLock(libroId);
  try {
    const [valor, pttl] = await Promise.all([cliente.get(key), cliente.pTTL(key)]);
    return {
      bloqueado: Boolean(valor),
      key,
      token: valor,
      ttlRestanteMs: pttl > 0 ? pttl : 0
    };
  } catch (err) {
    throw new RedisNoDisponibleError(err.message);
  }
}

module.exports = {
  adquirirLock,
  liberarLock,
  obtenerEstadoLock,
  RedisNoDisponibleError
};
