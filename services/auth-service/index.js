const http = require('http');
const app = require('./src/app');
const { PORT, SERVICE_NAME } = require('./src/config/env');
const { connectDB, registrarCallbackConexion } = require('./src/config/db');
const { asegurarAdminInicial } = require('./src/services/authService');
const logger = require('./src/config/logger');

async function iniciarServicio() {
  logger.info(`Iniciando ${SERVICE_NAME}...`, { operacion: 'startup' });

  registrarCallbackConexion(asegurarAdminInicial);
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
