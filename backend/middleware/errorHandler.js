const logger = require('../logger');

const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational || false;
  const message = isOperational ? err.message : 'Server Error';

  logger.error('Request failed', {
    statusCode,
    path: req.originalUrl,
    method: req.method,
    message: err.message,
    stack: err.stack,
    meta: err.meta,
  });

  res.status(statusCode).json({ error: message });
};

module.exports = errorHandler;
