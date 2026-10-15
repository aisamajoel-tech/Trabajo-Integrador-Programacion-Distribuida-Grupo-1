const mongoose = require('mongoose');
const logger = require('../utils/logger');

let isConnected = false;

/**
 * Conecta a MongoDB utilizando Mongoose y la variable de entorno MONGODB_URI
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/biblioteca_db';

  mongoose.connection.on('connected', () => {
    isConnected = true;
    logger.info(`✅ Conexión establecida exitosamente con MongoDB en: ${uri}`);
  });

  mongoose.connection.on('error', (err) => {
    isConnected = false;
    logger.error('❌ Error en la conexión de MongoDB:', { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    logger.warn('⚠️ Desconectado de MongoDB.');
  });

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000
    });
    return mongoose.connection;
  } catch (error) {
    logger.error('❌ No se pudo conectar a MongoDB al iniciar la aplicación:', { error: error.message });
    logger.info('ℹ️ Asegúrate de tener MongoDB ejecutándose localmente o mediante Docker (docker compose up -d).');
    return null;
  }
}

function estaConectadoMongo() {
  return isConnected && mongoose.connection.readyState === 1;
}

module.exports = {
  connectDB,
  estaConectadoMongo
};
