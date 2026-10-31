const { HTTP_TIMEOUT_MS, SERVICE_NAME } = require('../config/env');
const logger = require('../config/logger');

/**
 * Llamada HTTP a otro microservicio con fetch nativo y timeout explícito.
 *
 * Nunca lanza: devuelve un resultado que distingue (consigna, sección 15.2):
 *  - { ok: true,  status, data }                      -> el servicio respondió (2xx, 4xx o 5xx)
 *  - { ok: false, fallo: 'TIMEOUT' | 'SIN_CONEXION' } -> no hubo respuesta
 *
 * TIMEOUT y SIN_CONEXION se separan porque no significan lo mismo:
 *  - SIN_CONEXION (conexión rechazada, DNS): el pedido nunca llegó al destino.
 *  - TIMEOUT: el pedido pudo haber llegado y procesarse; solo se perdió la respuesta.
 */
async function llamar({ dependencia, metodo, url, body, requestId }) {
  const inicio = Date.now();
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': requestId
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (res.status >= 500) {
      logger.error(`${dependencia} respondió con error ${res.status}`, {
        origen: SERVICE_NAME,
        dependencia,
        causa: `HTTP ${res.status}`,
        codigoRemoto: data?.codigo,
        requestId,
        duracionMs: Date.now() - inicio
      });
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    const esTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    const codigoRed = err.cause?.code; // ECONNREFUSED, ENOTFOUND, EAI_AGAIN, ECONNRESET...
    const fallo = esTimeout ? 'TIMEOUT' : 'SIN_CONEXION';

    logger.error(`${dependencia} no disponible (${fallo})`, {
      origen: SERVICE_NAME,
      dependencia,
      causa: esTimeout ? `timeout de ${HTTP_TIMEOUT_MS} ms` : codigoRed || err.message,
      url,
      requestId,
      duracionMs: Date.now() - inicio
    });
    return { ok: false, fallo, causa: esTimeout ? 'timeout' : codigoRed || err.message };
  }
}

module.exports = { llamar };
