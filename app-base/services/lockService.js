const crypto = require('crypto');
const redis = require('redis');

let redisClient = null;
let isConnected = false;

const DEFAULT_TTL_MS = parseInt(process.env.LOCK_TTL_MS, 10) || 5000;

/**
 * Inicializa el cliente de Redis / Memurai
 */
async function initRedis() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT, 10) || 6379;

  redisClient = redis.createClient({
    socket: {
      host,
      port,
      connectTimeout: 2000,
      reconnectStrategy: (retries) => {
        if (retries > 2) {
          // Detener intentos continuos si no está disponible para no saturar la consola
          return false;
        }
        return 1000;
      }
    }
  });

  redisClient.on('error', (err) => {
    isConnected = false;
  });

  redisClient.on('ready', () => {
    console.log('✅ Conexión establecida y lista con Redis/Memurai (puerto 6379).');
    isConnected = true;
  });

  try {
    await redisClient.connect();
  } catch (error) {
    console.warn(`⚠️ No se pudo conectar a Redis/Memurai en ${host}:${port} (${error.message}).`);
    console.log('ℹ️ Nota: Los endpoints CRUD y HTTPS funcionarán normalmente. Para probar el Lock con Redis, asegúrate de iniciar Memurai o Redis.');
  }

  return redisClient;
}

function estaConectado() {
  return isConnected;
}

/**
 * Adquiere un lock para un recurso específico con TTL y token único
 * Granularidad: lock:libro:<id>
 */
async function adquirirLock(recursoId, ttlMs = DEFAULT_TTL_MS) {
  if (!isConnected || !redisClient) {
    throw new Error('El servicio Redis/Memurai no está conectado. Inicia Memurai o Redis en localhost:6379.');
  }

  const key = `lock:libro:${recursoId}`;
  const token = crypto.randomUUID();

  const resultado = await redisClient.set(key, token, {
    NX: true,
    PX: ttlMs
  });

  if (resultado === 'OK') {
    return {
      exitoso: true,
      token,
      key,
      ttlMs
    };
  }

  return {
    exitoso: false,
    token: null,
    key,
    ttlMs
  };
}

/**
 * Libera el lock verificando de forma atómica que el token coincida con el propietario
 */
async function liberarLock(recursoId, token) {
  if (!isConnected || !redisClient || !token) {
    return false;
  }

  const key = `lock:libro:${recursoId}`;

  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  try {
    const resultado = await redisClient.eval(luaScript, {
      keys: [key],
      arguments: [token]
    });
    return resultado === 1;
  } catch (error) {
    console.error(`Error liberando lock para ${key}:`, error.message);
    return false;
  }
}

/**
 * Consulta el estado actual de un lock y su TTL restante
 */
async function obtenerEstadoLock(recursoId) {
  if (!isConnected || !redisClient) {
    return { bloqueado: false, advertencia: 'Redis/Memurai no conectado' };
  }

  const key = `lock:libro:${recursoId}`;
  const valor = await redisClient.get(key);
  const pttl = await redisClient.pTTL(key);

  return {
    bloqueado: !!valor,
    key,
    token: valor,
    ttlRestanteMs: pttl > 0 ? pttl : 0
  };
}

module.exports = {
  initRedis,
  estaConectado,
  adquirirLock,
  liberarLock,
  obtenerEstadoLock
};
