const http = require('http');
const app = require('./src/app');
const { PORT, SERVICE_NAME, LOCK_TTL_MS } = require('./src/config/env');
const { connectDB } = require('./src/config/db');
const { initRedis } = require('./src/config/redis');
const logger = require('./src/config/logger');

async function iniciarServicio() {
  logger.info(`Iniciando ${SERVICE_NAME}...`, { operacion: 'startup' });

  // Ninguna dependencia caída impide arrancar: MongoDB y Redis se reintentan solos
  // y, mientras tanto, los endpoints que los necesitan responden 503.
  await connectDB();
  initRedis();

  const server = http.createServer(app);
  server.listen(PORT, () => {
    logger.info(`${SERVICE_NAME} escuchando en el puerto ${PORT}`, { operacion: 'listen', port: PORT, lockTtlMs: LOCK_TTL_MS });
    logger.info(`Healthcheck: /health · Swagger UI: /api-docs`, { operacion: 'startup.info' });
  });
}

iniciarServicio();
