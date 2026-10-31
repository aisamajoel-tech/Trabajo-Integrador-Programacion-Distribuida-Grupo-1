const fs = require('fs');
const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');
const { SERVICE_NAME, LOG_LEVEL } = require('./env');

// Crear directorio de logs si no existe
const logDir = path.resolve(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const svc = service || SERVICE_NAME;
    const metaStr = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${svc}] ${level}: ${message}${metaStr}`;
  })
);

const dailyRotateGeneral = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, `${SERVICE_NAME}-%DATE%.log`),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  level: LOG_LEVEL,
  format: fileFormat
});

const dailyRotateError = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, `${SERVICE_NAME}-error-%DATE%.log`),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
  format: fileFormat
});

const logger = winston.createLogger({
  level: LOG_LEVEL,
  defaultMeta: { service: SERVICE_NAME },
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
