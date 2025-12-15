require('dotenv').config();
const { validateEnvironment, config } = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');

// 根据环境变量决定启动模式
const serviceMode = process.env.SERVICE_MODE || (process.env.NODE_ENV === 'production' ? 'api' : 'full');

async function startAPIServer() {
  try {
    const warnings = validateEnvironment();
    warnings.forEach((message) => logger.warn(message));
  } catch (err) {
    logger.error('Environment validation failed', { error: err.message });
    process.exit(1);
  }

  const port = process.env.PORT || config.server.port;
  const app = createApp();
  const server = app.listen(port, () => {
    logger.info(`API Server is running on port ${port}`);
  });

  // 简单的健康检查端点（避免与routes/health.js冲突）
  app.get('/api/health/simple', (req, res) => {
    res.json({
      status: 'OK',
      service: 'geo-backend-api',
      mode: serviceMode,
      timestamp: new Date().toISOString()
    });
  });

  // Graceful shutdown
  const gracefulShutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(() => {
      logger.info('API Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

async function startWorker() {
  try {
    const warnings = validateEnvironment();
    warnings.forEach((message) => logger.warn(message));
  } catch (err) {
    logger.error('Environment validation failed', { error: err.message });
    process.exit(1);
  }

  logger.info('Starting BullMQ Worker...');
  try {
    // 优先使用修复后的队列配置
    require('./queue-fixed');
    require('./worker');
    logger.info('Worker started successfully');
  } catch (error) {
    logger.error('Failed to start worker', { error: error.message });
    process.exit(1);
  }

  // Worker健康检查
  const healthCheck = async () => {
    try {
      const { getQueueHealth } = require('./queue-fixed');
      const health = await getQueueHealth();
      logger.info('Worker health check', health);
    } catch (error) {
      logger.warn('Worker health check failed', { error: error.message });
    }
  };

  // 每5分钟检查一次健康状态
  setInterval(healthCheck, 5 * 60 * 1000);

  // Worker进程退出处理
  const gracefulShutdown = (signal) => {
    logger.info(`${signal} received, shutting down worker gracefully`);

    // 清理队列连接
    try {
      const { contentQueue, queueEvents } = require('./queue-fixed');
      if (contentQueue && typeof contentQueue.close === 'function') {
        contentQueue.close();
      }
      if (queueEvents && typeof queueEvents.close === 'function') {
        queueEvents.close();
      }
    } catch (error) {
      logger.warn('Error closing queue connections', { error: error.message });
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

async function startFullStack() {
  // 开发模式同时启动API和Worker
  logger.info('Starting in full stack mode (API + Worker)');

  await startAPIServer();

  // 延迟启动Worker避免端口冲突
  setTimeout(() => {
    require('./worker');
    logger.info('Worker started in full stack mode');
  }, 2000);
}

// 启动逻辑
async function start() {
  logger.info(`Starting service in mode: ${serviceMode}`);

  switch (serviceMode) {
    case 'api':
      await startAPIServer();
      break;
    case 'worker':
      await startWorker();
      break;
    case 'full':
    default:
      await startFullStack();
      break;
  }
}

// 错误处理
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
  process.exit(1);
});

start().catch((err) => {
  logger.error('Failed to start services', { error: err.message });
  process.exit(1);
});