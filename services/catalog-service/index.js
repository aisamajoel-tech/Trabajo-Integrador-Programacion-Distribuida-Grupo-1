const http = require('http');
const app = require('./src/app');
const { PORT, SERVICE_NAME } = require('./src/config/env');
const { connectDB } = require('./src/config/db');
const logger = require('./src/config/logger');

async function iniciarServicio() {
  logger.info(`Iniciando ${SERVICE_NAME}...`, { operacion: 'startup' });

  // Conectar a MongoDB (con reintento automático si aún no está listo)
  await connectDB();

  const server = http.createServer(app);

  server.listen(PORT, () => {
    logger.info(`${SERVICE_NAME} escuchando en http://localhost:${PORT}`, {
      operacion: 'listen',
      port: PORT
    });
    logger.info(`Healthcheck disponible en http://localhost:${PORT}/health`, {
      operacion: 'healthcheck.info'
    });
    logger.info(`Documentación Swagger UI en http://localhost:${PORT}/api-docs`, {
      operacion: 'swagger.info'
    });
  });
}

iniciarServicio();
