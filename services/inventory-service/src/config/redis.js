const { createClient } = require('redis');
const logger = require('./logger');
const { REDIS_URL } = require('./env');

let cliente = null;
let listo = false;

const urlSegura = () => REDIS_URL.replace(/\/\/([^:@/]*):([^@]+)@/, '//$1:***@');

/**
 * Crea el cliente de Redis a partir de REDIS_URL (en el monolito eran REDIS_HOST + REDIS_PORT).
 *
 * - Reintenta la conexión indefinidamente con espera creciente (hasta 5 s), así el servicio
 *   arranca aunque Redis todavía no esté listo (por ejemplo, al levantar Docker Compose).
 * - disableOfflineQueue: si Redis está caído, los comandos fallan en el acto en lugar de
 *   quedar encolados; el controlador lo traduce a un 503 controlado.
 */
function initRedis() {
  if (cliente) return cliente;

  cliente = createClient({
    url: REDIS_URL,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: (intentos) => Math.min((intentos + 1) * 500, 5000)
    }
  });

  cliente.on('ready', () => {
    listo = true;
    logger.info('Conexión lista con Redis/Memurai', { operacion: 'redis.ready', url: urlSegura() });
  });

  cliente.on('end', () => {
    listo = false;
  });

  let ultimoError = null;
  cliente.on('error', (err) => {
    const estabaListo = listo;
    listo = false;
    // Evita llenar la consola con el mismo error en cada reintento
    if (estabaListo || err.message !== ultimoError) {
      logger.warn('Redis/Memurai no disponible. Se reintentará la conexión.', {
        operacion: 'redis.error',
        error: err.message
      });
    }
    ultimoError = err.message;
  });

  cliente.connect().catch((err) => {
    logger.error('No se pudo iniciar el cliente de Redis', { operacion: 'redis.connect', error: err.message });
  });

  return cliente;
}

function obtenerCliente() {
  return cliente;
}

function estaConectadoRedis() {
  return listo && cliente !== null && cliente.isReady;
}

module.exports = { initRedis, obtenerCliente, estaConectadoRedis };
