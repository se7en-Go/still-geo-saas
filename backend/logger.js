const path = require('path');
const winston = require('winston');
const { config, ensureDirectories } = require('./config');

const { logDir } = ensureDirectories();

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'geo-backend' },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, ...meta }) => {
        const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${level}: ${message}${metaString}`;
      })
    ),
  }));
}

module.exports = logger;
