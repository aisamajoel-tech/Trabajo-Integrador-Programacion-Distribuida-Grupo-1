require('dotenv').config();

const env = {
  SERVICE_NAME: process.env.SERVICE_NAME || 'auth-service',
  PORT: parseInt(process.env.PORT, 10) || 3004,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/db_auth',
  JWT_SECRET: process.env.JWT_SECRET || 'dev_jwt_secret_grupo1_cambiar_en_entorno_real_2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1h',
  JWT_ISSUER: process.env.JWT_ISSUER || 'auth-service-grupo1',
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@libreria.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin1234!',
  ADMIN_NOMBRE: process.env.ADMIN_NOMBRE || 'Administrador Librería',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  DB_RETRY_INTERVAL_MS: parseInt(process.env.DB_RETRY_INTERVAL_MS, 10) || 5000
};

module.exports = env;
