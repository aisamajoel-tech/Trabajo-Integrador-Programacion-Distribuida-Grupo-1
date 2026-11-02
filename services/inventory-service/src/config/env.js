require('dotenv').config();

const entero = (valor, porDefecto) => {
  const n = parseInt(valor, 10);
  return Number.isNaN(n) ? porDefecto : n;
};

/**
 * Toda la configuración se lee de variables de entorno (nunca hay hosts,
 * puertos ni URLs escritos en el código). El mismo código corre en local
 * (.env) y en Docker Compose cambiando solo estas variables.
 */
const env = {
  SERVICE_NAME: process.env.SERVICE_NAME || 'inventory-service',
  PORT: entero(process.env.PORT, 3002),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/db_inventory',
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  LOCK_TTL_MS: entero(process.env.LOCK_TTL_MS, 5000),
  LOCK_REINTENTOS: entero(process.env.LOCK_REINTENTOS, 3),
  LOCK_ESPERA_MS: entero(process.env.LOCK_ESPERA_MS, 50),
  ARTIFICIAL_DELAY_MS: entero(process.env.ARTIFICIAL_DELAY_MS, 0),
  // TP7: validación local (stateless) del JWT emitido por auth-service.
  // El secreto llega por variable de entorno; el valor por defecto es solo para desarrollo.
  JWT_SECRET: process.env.JWT_SECRET || 'dev_jwt_secret_grupo1_cambiar_en_entorno_real_2026',
  JWT_ISSUER: process.env.JWT_ISSUER || 'auth-service-grupo1',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  DB_RETRY_INTERVAL_MS: entero(process.env.DB_RETRY_INTERVAL_MS, 5000),
  // Opcional: si está definida, el alta de stock verifica que el libro exista en el catálogo.
  CATALOG_SERVICE_URL: (process.env.CATALOG_SERVICE_URL || '').replace(/\/$/, ''),
  HTTP_TIMEOUT_MS: entero(process.env.HTTP_TIMEOUT_MS, 3000)
};

module.exports = env;
