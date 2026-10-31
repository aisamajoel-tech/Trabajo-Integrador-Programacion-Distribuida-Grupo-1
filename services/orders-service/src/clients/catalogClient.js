const { CATALOG_SERVICE_URL } = require('../config/env');
const { llamar } = require('./httpClient');

/**
 * Cliente de catalog-service. Usa solo su interfaz pública: GET /api/libros/:id.
 *
 * Devuelve uno de:
 *  - { resultado: 'EXISTE', libro: { titulo, autor, isbn } }
 *  - { resultado: 'NO_EXISTE' }        (404, o 400 por id inválido)
 *  - { resultado: 'NO_DISPONIBLE' }    (timeout, sin conexión o 5xx)
 */
async function obtenerLibro(libroId, requestId) {
  const r = await llamar({
    dependencia: 'catalog-service',
    metodo: 'GET',
    url: `${CATALOG_SERVICE_URL}/api/libros/${encodeURIComponent(libroId)}`,
    requestId
  });

  if (!r.ok || r.status >= 500) return { resultado: 'NO_DISPONIBLE', causa: r.causa || `HTTP ${r.status}` };
  if (r.status === 404 || r.status === 400) return { resultado: 'NO_EXISTE' };
  if (r.status === 200 && r.data) {
    const { titulo, autor, isbn } = r.data;
    return { resultado: 'EXISTE', libro: { titulo, autor, isbn } };
  }
  return { resultado: 'NO_DISPONIBLE', causa: `respuesta inesperada HTTP ${r.status}` };
}

module.exports = { obtenerLibro };
