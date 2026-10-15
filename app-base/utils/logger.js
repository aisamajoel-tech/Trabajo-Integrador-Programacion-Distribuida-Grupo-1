const fs = require('fs');
const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');

// Crear directorio de logs si no existe
const logDir = path.resolve(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logLevel = process.env.LOG_LEVEL || 'info';
const maxFileSize = process.env.LOG_MAX_SIZE || '20m';
const maxFilesDays = process.env.LOG_MAX_FILES || '14d';

// Formato personalizado para archivos (JSON estructurado)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Formato legible para la consola
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// Transporte rotativo para eventos generales (INFO, WARN, etc.)
const dailyRotateGeneral = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, 'application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: maxFileSize,
  maxFiles: maxFilesDays,
  level: logLevel,
  format: fileFormat
});

// Transporte rotativo exclusivo para errores (ERROR)
const dailyRotateError = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: maxFileSize,
  maxFiles: '30d', // Retención mayor para errores
  level: 'error',
  format: fileFormat
});

// Creación de la instancia centralizada del logger
const logger = winston.createLogger({
  level: logLevel,
  transports: [
    dailyRotateGeneral,
    dailyRotateError,
    new winston.transports.Console({
      format: consoleFormat
    })
  ],
  exitOnError: false
});

module.exports = logger;
