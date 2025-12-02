require('dotenv').config();
const { validateEnvironment, config } = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');

async function startServices() {
  try {
    const warnings = validateEnvironment();
    warnings.forEach((message) => logger.warn(message));
  } catch (err) {
    logger.error('Environment validation failed', { error: err.message });
    process.exit(1);
  }

  // Use Railway PORT or fallback to config
  const port = process.env.PORT || config.server.port;

  // Start Express API
  const app = createApp();
  const server = app.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
  });

  // Start Worker
  logger.info('Starting BullMQ Worker...');
  require('./worker');

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

startServices().catch((err) => {
  logger.error('Failed to start services', { error: err.message });
  process.exit(1);
});