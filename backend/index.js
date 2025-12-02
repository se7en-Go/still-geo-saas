require('dotenv').config();
const { validateEnvironment, config } = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');

try {
  const warnings = validateEnvironment();
  warnings.forEach((message) => logger.warn(message));
} catch (err) {
  logger.error('Environment validation failed', { error: err.message });
  process.exit(1);
}

const app = createApp();

app.listen(config.server.port, () => {
  logger.info(`Server is running on port ${config.server.port}`);
});
