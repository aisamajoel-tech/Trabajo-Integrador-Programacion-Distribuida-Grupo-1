const express = require('express');
const { SERVICE_NAME } = require('./config/env');
const logger = require('./config/logger');
const { setupSwagger } = require('./config/swagger');
const { estaConectadoMongo } = require('./config/db');
const authRoutes = require('./routes/authRoutes');

const app = express();

app.use(express.json());

// Registro de cada petición sin exponer contraseñas ni tokens en logs (Sección 17)
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

// JSON mal formado -> 400 controlado
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'El cuerpo de la petición no es un JSON válido.',
      codigo: 'JSON_INVALIDO'
    });
  }
  return next(err);
});

setupSwagger(app);

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Verificar salud del microservicio de autenticación
 *     description: Endpoint de salud utilizado por Docker Compose healthcheck. Nunca expone secretos.
 *     tags:
 *       - Salud
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
      mongodb: estaConectadoMongo() ? 'up' : 'down'
    }
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Soportamos tanto /api/auth/* (convención REST del proyecto) como /auth/* (ejemplo de la consigna)
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada en auth-service.',
    codigo: 'RUTA_NO_ENCONTRADA'
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Error interno en auth-service', {
    endpoint: `${req.method} ${req.originalUrl}`,
    error: err.message
  });
  res.status(500).json({
    error: 'Error interno en el servicio de autenticación.',
    codigo: 'ERROR_INTERNO'
  });
});

module.exports = app;
