/**
 * Configuración central del Sistema de Librería Comercial (Arquitectura MVC + Microservicios)
 */
const path = require('path');

module.exports = {
  PORTS: {
    WEB_PORTAL: Number(process.env.PORT_WEB || 3000),
    CATALOG_SERVICE: Number(process.env.PORT_CATALOG || 3001),
    INVENTORY_SERVICE: Number(process.env.PORT_INVENTORY || 3002),
    ORDERS_SERVICE: Number(process.env.PORT_ORDERS || 3003),
    AUTH_SERVICE: Number(process.env.PORT_AUTH || 3004)
  },
  JWT: {
    SECRET: process.env.JWT_SECRET || 'tp7_libreria_secreto_compartido_2026_grupo1_uch',
    ISSUER: process.env.JWT_ISSUER || 'libreria-auth-service',
    EXPIRES_IN_SECONDS: 3600
  },
  REDIS_LOCK: {
    TTL_MS: 5000,
    RETRY_DELAY_MS: 35,
    MAX_RETRIES: 2
  },
  PATHS: {
    DATA_DIR: path.join(__dirname, '..', '..', 'data'),
    VIEW_TIENDA: path.join(__dirname, '..', '..', 'services', 'web-portal', 'public', 'index.html')
  }
};
