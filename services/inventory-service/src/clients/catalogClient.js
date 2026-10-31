const { CATALOG_SERVICE_URL, HTTP_TIMEOUT_MS } = require('../config/env');
const logger = require('../config/logger');

/**
 * Cliente HTTP mínimo hacia catalog-service.
 *
 * Se usa SOLO en el alta de stock (POST /api/inventario) para no crear stock de libros
 * inexistentes. Nunca se consulta la base del catálogo: se usa su API pública.
 * Si CATALOG_SERVICE_URL no está definida, la verificación se omite (ver README).
 *
 * Devuelve: 'EXISTE' | 'NO_EXISTE' | 'NO_DISPONIBLE' | 'OMITIDA'
 */
async function verificarLibro(libroId, requestId) {
  if (!CATALOG_SERVICE_URL) return 'OMITIDA';

  const url = `${CATALOG_SERVICE_URL}/api/libros/${libroId}`;
  try {
    const res = await fetch(url, {
      headers: requestId ? { 'x-request-id': requestId } : {},
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    });

    if (res.ok) return 'EXISTE';
    if (res.status === 404 || res.status === 400) return 'NO_EXISTE';

    logger.error('catalog-service respondió con error al verificar libro', {
      dependencia: 'catalog-service',
      statusRemoto: res.status,
      libroId,
      requestId
    });
    return 'NO_DISPONIBLE';
  } catch (err) {
    logger.error('catalog-service no disponible al verificar libro', {
      dependencia: 'catalog-service',
      causa: err.name === 'TimeoutError' ? 'timeout' : err.message,
      libroId,
      requestId
    });
    return 'NO_DISPONIBLE';
  }
}

module.exports = { verificarLibro };
