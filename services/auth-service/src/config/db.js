const mongoose = require('mongoose');
const logger = require('./logger');
const { MONGODB_URI, DB_RETRY_INTERVAL_MS } = require('./env');

let isConnected = false;
let retryTimeout = null;
let onConnectedCallback = null;

function registrarCallbackConexion(fn) {
  onConnectedCallback = fn;
}

mongoose.connection.on('connected', async () => {
  isConnected = true;
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  logger.info('Conexión establecida exitosamente con MongoDB (db_auth)', {
    operacion: 'db.connect',
    uri: MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')
  });
  if (typeof onConnectedCallback === 'function') {
    try {
      await onConnectedCallback();
    } catch (err) {
      logger.error('Error ejecutando bootstrap tras conexión a db_auth', {
        operacion: 'db.bootstrap.error',
        error: err.message
      });
    }
  }
});

mongoose.connection.on('error', (err) => {
  isConnected = false;
  logger.error('Error en la conexión de MongoDB (db_auth)', {
    operacion: 'db.error',
    error: err.message
  });
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn('Desconectado de MongoDB (db_auth). Programando reconexión automática...', {
    operacion: 'db.disconnected',
    reintentoEnMs: DB_RETRY_INTERVAL_MS
  });
  programarReintento();
});

function programarReintento() {
  if (retryTimeout) return;
  retryTimeout = setTimeout(async () => {
    retryTimeout = null;
    if (!estaConectadoMongo()) {
      await connectDB();
    }
  }, DB_RETRY_INTERVAL_MS);
}

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 3000
    });
    return mongoose.connection;
  } catch (error) {
    isConnected = false;
    logger.warn('MongoDB (db_auth) aún no disponible. El servicio seguirá activo y reintentará la conexión.', {
      operacion: 'db.connect.retry',
      error: error.message,
      reintentoEnMs: DB_RETRY_INTERVAL_MS
    });
    programarReintento();
    return null;
  }
}

function estaConectadoMongo() {
  return isConnected && mongoose.connection.readyState === 1;
}

module.exports = {
  connectDB,
  estaConectadoMongo,
  registrarCallbackConexion
};
