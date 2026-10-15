require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const express = require('express');

const { connectDB, estaConectadoMongo } = require('./config/db');
const { setupSwagger } = require('./config/swagger');
const librosRoutes = require('./routes/libros');
const lockService = require('./services/lockService');
const logger = require('./utils/logger');
const Libro = require('./models/Libro');

const app = express();
const PORT_HTTP = process.env.PORT_HTTP || 3000;
const PORT_HTTPS = process.env.PORT_HTTPS || 3443;

// Middleware para procesar JSON en el cuerpo de las peticiones
app.use(express.json());

// Middleware de registro de peticiones HTTP con Winston
app.use((req, res, next) => {
  const inicio = Date.now();
  res.on('finish', () => {
    const duracion = Date.now() - inicio;
    const logInfo = `${req.method} ${req.originalUrl} -> Status: ${res.statusCode} (${duracion}ms)`;
    if (res.statusCode >= 500) {
      logger.error(logInfo);
    } else if (res.statusCode >= 400) {
      logger.warn(logInfo);
    } else {
      logger.info(logInfo);
    }
  });
  next();
});

// Configuración de OpenAPI / Swagger UI (/api-docs y /api-docs.json)
setupSwagger(app);

// Montaje de las rutas principales de la API
app.use('/api/libros', librosRoutes);

// Endpoint de verificación de estado y salud del sistema
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    protocol: req.protocol,
    secure: req.secure,
    mongoConectado: estaConectadoMongo(),
    redisConectado: lockService.estaConectado(),
    documentacionSwagger: '/api-docs',
    timestamp: new Date().toISOString()
  });
});

// Manejo de rutas no definidas (404 Not Found)
app.use((req, res) => {
  logger.warn(`Ruta no encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

// Manejador centralizado de errores (500 Internal Server Error)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Error no previsto en el servidor:', { stack: err.stack, mensaje: err.message });
  res.status(500).json({
    error: 'Error interno del servidor o de la capa de persistencia.',
    detalle: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

/**
 * Inserta libros de prueba iniciales si la base de datos está vacía
 */
async function sembrarDatosIniciales() {
  try {
    const cantidad = await Libro.countDocuments();
    if (cantidad === 0) {
      logger.info('📚 Colección vacía detectada. Sembrando libros iniciales en MongoDB...');
      await Libro.insertMany([
        {
          titulo: 'Cien años de soledad',
          autor: 'Gabriel García Márquez',
          año: 1967,
          stock: 1,
          genero: 'Novela',
          isbn: '978-0307474728'
        },
        {
          titulo: 'Don Quijote de la Mancha',
          autor: 'Miguel de Cervantes',
          año: 1605,
          stock: 5,
          genero: 'Novela',
          isbn: '978-8424115104'
        },
        {
          titulo: '1984',
          autor: 'George Orwell',
          año: 1949,
          stock: 2,
          genero: 'Ficción',
          isbn: '978-0451524935'
        }
      ]);
      logger.info('✅ 3 libros iniciales sembrados exitosamente en MongoDB.');
    }
  } catch (error) {
    logger.warn('No se pudieron sembrar datos iniciales (MongoDB posiblemente desconectado):', { error: error.message });
  }
}

// Inicialización de Servicios
async function iniciarServidor() {
  logger.info('Iniciando servicios del sistema...');

  // 1. Conectar a MongoDB mediante Mongoose
  await connectDB();
  await sembrarDatosIniciales();

  // 2. Conectar a Redis / Memurai
  await lockService.initRedis();

  // 3. Iniciar Servidor HTTP tradicional
  http.createServer(app).listen(PORT_HTTP, () => {
    logger.info(`🌐 Servidor HTTP iniciado en:  http://localhost:${PORT_HTTP}`);
    logger.info(`📖 Documentación Swagger UI en: http://localhost:${PORT_HTTP}/api-docs`);
  });

  // 4. Iniciar Servidor HTTPS con Certificado Digital X.509
  const keyPath = path.resolve(process.env.SSL_KEY_PATH || './certs/server.key');
  const certPath = path.resolve(process.env.SSL_CERT_PATH || './certs/server.cert');

  try {
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      logger.warn('Certificados SSL no encontrados en ./certs/. Generando automáticamente...');
      require('./scripts/generate-cert');
    }

    const sslOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };

    https.createServer(sslOptions, app).listen(PORT_HTTPS, () => {
      logger.info(`🔒 Servidor HTTPS iniciado en: https://localhost:${PORT_HTTPS}`);
      logger.info(`📖 Swagger UI Seguro en:       https://localhost:${PORT_HTTPS}/api-docs`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
  } catch (sslError) {
    logger.error('Error iniciando servidor HTTPS:', { error: sslError.message });
  }
}

iniciarServidor();
