const http = require('http');
const app = require('./src/app');
const env = require('./src/config/env');
const { connectDB, estaConectadoMongo } = require('./src/config/db');
const { procesarCompensacionesPendientes } = require('./src/services/ordenesService');
const logger = require('./src/config/logger');

const { PORT, SERVICE_NAME, CATALOG_SERVICE_URL, INVENTORY_SERVICE_URL, HTTP_TIMEOUT_MS, COMPENSACION_INTERVALO_MS } = env;

async function iniciarServicio() {
  logger.info(`Iniciando ${SERVICE_NAME}...`, { operacion: 'startup' });

  // Si MongoDB no está listo el servicio arranca igual y reintenta solo.
  await connectDB();

  const server = http.createServer(app);
  server.listen(PORT, () => {
    logger.info(`${SERVICE_NAME} escuchando en el puerto ${PORT}`, {
      operacion: 'listen',
      port: PORT,
      catalogo: CATALOG_SERVICE_URL,
      inventario: INVENTORY_SERVICE_URL,
      timeoutMs: HTTP_TIMEOUT_MS
    });
    logger.info('Healthcheck: /health · Swagger UI: /api-docs', { operacion: 'startup.info' });
  });

  // Reintento periódico de compensaciones pendientes (descuentos que quedaron en duda)
  const timer = setInterval(async () => {
    if (!estaConectadoMongo()) return;
    try {
      await procesarCompensacionesPendientes();
    } catch (err) {
      logger.warn('No se pudieron procesar las compensaciones pendientes', { error: err.message });
    }
  }, COMPENSACION_INTERVALO_MS);
  timer.unref();
}

iniciarServicio();
