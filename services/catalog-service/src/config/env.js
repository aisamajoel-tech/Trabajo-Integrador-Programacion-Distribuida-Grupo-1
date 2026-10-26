require('dotenv').config();

const env = {
  SERVICE_NAME: process.env.SERVICE_NAME || 'catalog-service',
  PORT: parseInt(process.env.PORT, 10) || 3001,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/db_catalog',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  DB_RETRY_INTERVAL_MS: parseInt(process.env.DB_RETRY_INTERVAL_MS, 10) || 5000
};

module.exports = env;
