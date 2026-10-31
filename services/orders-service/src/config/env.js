require('dotenv').config();

const entero = (valor, porDefecto) => {
  const n = parseInt(valor, 10);
  return Number.isNaN(n) ? porDefecto : n;
};
const sinBarraFinal = (url) => (url || '').replace(/\/$/, '');

/**
 * Toda la configuración se lee de variables de entorno: nunca hay hosts, puertos
 * ni URLs de otros servicios escritos en el código. El mismo código corre en local
 * (.env) y en Docker Compose cambiando solo estas variables.
 */
const env = {
  SERVICE_NAME: process.env.SERVICE_NAME || 'orders-service',
  PORT: entero(process.env.PORT, 3003),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/db_orders',
  CATALOG_SERVICE_URL: sinBarraFinal(process.env.CATALOG_SERVICE_URL || 'http://localhost:3001'),
  INVENTORY_SERVICE_URL: sinBarraFinal(process.env.INVENTORY_SERVICE_URL || 'http://localhost:3002'),
  HTTP_TIMEOUT_MS: entero(process.env.HTTP_TIMEOUT_MS, 3000),
  // Cada cuánto se reintenta la compensación de órdenes cuyo descuento quedó en duda (ms)
  COMPENSACION_INTERVALO_MS: entero(process.env.COMPENSACION_INTERVALO_MS, 30000),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  DB_RETRY_INTERVAL_MS: entero(process.env.DB_RETRY_INTERVAL_MS, 5000)
};

module.exports = env;
