const crypto = require('crypto');
const express = require('express');
const { SERVICE_NAME } = require('./config/env');
const logger = require('./config/logger');
const { setupSwagger } = require('./config/swagger');
const { estaConectadoMongo } = require('./config/db');
const ordenesRoutes = require('./routes/ordenesRoutes');

const app = express();

app.use(express.json());

// x-request-id: se usa el que llega o se genera uno; se devuelve en la respuesta
// y se propaga a catálogo e inventario para correlacionar los logs de los tres servicios.
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
});

// Registro de cada petición: endpoint, status, duración y requestId
app.use((req, res, next) => {
  const inicio = Date.now();
  res.on('finish', () => {
    const duracionMs = Date.now() - inicio;
    const meta = {
      endpoint: `${req.method} ${req.originalUrl}`,
      statusCode: res.statusCode,
      duracionMs,
      requestId: req.requestId
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
 *       Usado por el healthcheck de Docker Compose. Responde 200 si el proceso está vivo.
 *       No consulta a catálogo ni a inventario: que ellos estén caídos no hace "unhealthy" a orders.
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
    dependencias: { mongodb: estaConectadoMongo() ? 'up' : 'down' }
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.use('/api/ordenes', ordenesRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada en orders-service.', codigo: 'RUTA_NO_ENCONTRADA' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Error interno en orders-service', {
    endpoint: `${req.method} ${req.originalUrl}`,
    error: err.message,
    stack: err.stack,
    requestId: req.requestId
  });
  res.status(500).json({ error: 'Error interno en el servicio de órdenes.', codigo: 'ERROR_INTERNO' });
});

module.exports = app;
