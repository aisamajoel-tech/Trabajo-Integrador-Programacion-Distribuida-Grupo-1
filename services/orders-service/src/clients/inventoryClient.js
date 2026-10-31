const { INVENTORY_SERVICE_URL } = require('../config/env');
const { llamar } = require('./httpClient');

/**
 * Cliente de inventory-service. Usa solo su interfaz pública; no sabe que existe Redis.
 *
 * descontar() devuelve uno de:
 *  - 'DESCONTADO'     200
 *  - 'SIN_STOCK'      400 (stock insuficiente) o 404 (el libro no tiene registro de stock)
 *  - 'CONCURRENCIA'   409 (lock ocupado)
 *  - 'NO_DISPONIBLE'  503 o sin conexión: el descuento NO se aplicó
 *  - 'INCIERTO'       timeout u otro 5xx: no se sabe si se aplicó -> hay que compensar
 */
async function descontar(libroId, { cantidad, clienteId, ordenId }, requestId) {
  const r = await llamar({
    dependencia: 'inventory-service',
    metodo: 'POST',
    url: `${INVENTORY_SERVICE_URL}/api/inventario/${encodeURIComponent(libroId)}/descontar`,
    body: { cantidad, clienteId, ordenId },
    requestId
  });

  if (!r.ok) return { resultado: r.fallo === 'TIMEOUT' ? 'INCIERTO' : 'NO_DISPONIBLE', causa: r.causa };
  if (r.status === 200) return { resultado: 'DESCONTADO', data: r.data };
  if (r.status === 400 || r.status === 404) return { resultado: 'SIN_STOCK', data: r.data };
  if (r.status === 409) return { resultado: 'CONCURRENCIA', data: r.data };
  if (r.status === 503) return { resultado: 'NO_DISPONIBLE', causa: r.data?.codigo || 'HTTP 503' };
  return { resultado: 'INCIERTO', causa: `HTTP ${r.status}` };
}

/**
 * Compensación: pide devolver el descuento hecho para esta orden.
 * Inventario solo devuelve unidades si ese ordenId realmente descontó (es seguro reintentar).
 * Devuelve true si inventario respondió 200 (revertido o "no había nada que revertir").
 */
async function revertir(libroId, ordenId, requestId) {
  const r = await llamar({
    dependencia: 'inventory-service',
    metodo: 'POST',
    url: `${INVENTORY_SERVICE_URL}/api/inventario/${encodeURIComponent(libroId)}/revertir`,
    body: { ordenId },
    requestId
  });
  return { exito: r.ok && r.status === 200, data: r.data, causa: r.causa || (r.ok ? `HTTP ${r.status}` : undefined) };
}

module.exports = { descontar, revertir };
