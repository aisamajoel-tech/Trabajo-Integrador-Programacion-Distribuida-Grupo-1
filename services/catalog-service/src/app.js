const express = require('express');
const { SERVICE_NAME } = require('./config/env');
const logger = require('./config/logger');
const { setupSwagger } = require('./config/swagger');
const librosRoutes = require('./routes/librosRoutes');

const app = express();

app.use(express.json());

// Middleware de trazabilidad y registro de peticiones HTTP
app.use((req, res, next) => {
  const inicio = Date.now();
  res.on('finish', () => {
    const duracion = Date.now() - inicio;
    const meta = {
      endpoint: `${req.method} ${req.originalUrl}`,
      statusCode: res.statusCode,
      duracionMs: duracion,
      requestId: req.headers['x-request-id'] || undefined
    };

    const msg = `${req.method} ${req.originalUrl} -> Status: ${res.statusCode} (${duracion}ms)`;
    if (res.statusCode >= 500) {
      logger.error(msg, meta);
    } else if (res.statusCode >= 400) {
      logger.warn(msg, meta);
    } else {
      logger.info(msg, meta);
    }
  });
  next();
});

// Documentación interactiva OpenAPI / Swagger UI (/api-docs)
setupSwagger(app);

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Verificar salud del microservicio
 *     description: Endpoint de salud utilizado por Docker Compose healthcheck y monitoreo.
 *     tags:
 *       - Salud
 *     responses:
 *       200:
 *         description: Servicio activo y operativo.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
const healthHandler = (req, res) => {
  res.status(200).json({
    service: SERVICE_NAME,
    status: 'ok'
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Montaje de rutas de catálogo
app.use('/api/libros', librosRoutes);

// Manejador de rutas no encontradas (404)
app.use((req, res) => {
  logger.warn(`Ruta no encontrada: ${req.method} ${req.originalUrl}`, {
    endpoint: `${req.method} ${req.originalUrl}`
  });
  res.status(404).json({
    error: 'Ruta no encontrada en catalog-service.',
    codigo: 'RUTA_NO_ENCONTRADA'
  });
});

// Manejador centralizado de errores no controlados (500)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Error interno en catalog-service', {
    endpoint: `${req.method} ${req.originalUrl}`,
    error: err.message,
    stack: err.stack
  });
  res.status(500).json({
    error: 'Error interno en el servicio de catálogo.',
    codigo: 'ERROR_INTERNO'
  });
});

module.exports = app;
