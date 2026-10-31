const express = require('express');
const { SERVICE_NAME } = require('./config/env');
const logger = require('./config/logger');
const { setupSwagger } = require('./config/swagger');
const { estaConectadoMongo } = require('./config/db');
const { estaConectadoRedis } = require('./config/redis');
const inventarioRoutes = require('./routes/inventarioRoutes');

const app = express();

app.use(express.json());

// Registro de cada petición: endpoint, status, duración y x-request-id
app.use((req, res, next) => {
  const inicio = Date.now();
  res.on('finish', () => {
    const duracionMs = Date.now() - inicio;
    const meta = {
      endpoint: `${req.method} ${req.originalUrl}`,
      statusCode: res.statusCode,
      duracionMs,
      requestId: req.headers['x-request-id'] || undefined
    };
    const msg = `${req.method} ${req.originalUrl} -> Status: ${res.statusCode} (${duracionMs}ms)`;
    if (res.statusCode >= 500) logger.error(msg, meta);
    else if (res.statusCode >= 400) logger.warn(msg, meta);
    else logger.info(msg, meta);
  });
  next();
});

// JSON mal formado -> 400 con el formato de error acordado
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.', codigo: 'JSON_INVALIDO' });
  }
  return next(err);
});

setupSwagger(app);

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Verificar salud del microservicio
 *     description: >
 *       Usado por el healthcheck de Docker Compose. Responde 200 si el proceso está vivo
 *       e informa el estado de sus dependencias (sin datos sensibles).
 *     tags: [Salud]
 *     responses:
 *       200:
 *         description: Servicio activo.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
const healthHandler = (req, res) => {
  res.status(200).json({
    service: SERVICE_NAME,
    status: 'ok',
    dependencias: {
      mongodb: estaConectadoMongo() ? 'up' : 'down',
      redis: estaConectadoRedis() ? 'up' : 'down'
    }
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.use('/api/inventario', inventarioRoutes);

// 404 de rutas inexistentes
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada en inventory-service.', codigo: 'RUTA_NO_ENCONTRADA' });
});

// Errores no controlados -> 500 con el formato acordado
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Error interno en inventory-service', {
    endpoint: `${req.method} ${req.originalUrl}`,
    error: err.message,
    stack: err.stack
  });
  res.status(500).json({ error: 'Error interno en el servicio de inventario.', codigo: 'ERROR_INTERNO' });
});

module.exports = app;
