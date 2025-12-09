// Redis配置修复 - 解决BullMQ警告
const { config } = require('./config');

/**
 * BullMQ兼容的Redis连接配置
 * 解决maxRetriesPerRequest警告问题
 */

function createBullMQCompatibleConnection() {
  // 基础连接配置
  const baseConfig = config.redis.url ? {
    url: config.redis.url,
    connectTimeout: config.redis.connectTimeout,
    lazyConnect: config.redis.lazyConnect,
    retryDelayOnFailover: config.redis.retryDelayOnFailover,
    // BullMQ要求的关键配置
    maxRetriesPerRequest: null, // BullMQ要求必须为null
    enableOfflineQueue: false,
    family: 4,
    keepAlive: 30000,
    // Upstash Redis TLS配置
    tls: config.redis.url.includes('upstash') ? {} : undefined,
  } : {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    connectTimeout: config.redis.connectTimeout,
    lazyConnect: config.redis.lazyConnect,
    retryDelayOnFailover: config.redis.retryDelayOnFailover,
    // BullMQ要求的关键配置
    maxRetriesPerRequest: null, // BullMQ要求必须为null
    enableOfflineQueue: false,
    family: 4,
    keepAlive: 30000,
  };

  return baseConfig;
}

// Worker专用配置（与BullMQ兼容）
function createWorkerConnection() {
  const connection = createBullMQCompatibleConnection();

  // Worker特定的配置优化
  return {
    ...connection,
    // Worker连接池配置
    maxRetriesPerRequest: null, // 确保为null
    enableOfflineQueue: false,
    // 生产环境优化
    ...(process.env.NODE_ENV === 'production' && {
      commandTimeout: 5000,
      enableReadyCheck: true,
      maxLoadingTimeout: 5000,
    }),
  };
}

// Queue专用配置
function createQueueConnection() {
  const connection = createBullMQCompatibleConnection();

  return {
    ...connection,
    // Queue特定的配置
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: config.queue.attempts,
      backoff: {
        type: 'exponential',
        delay: config.queue.backoffMs,
      },
    },
  };
}

// 验证连接配置
function validateConnectionConfig(connection) {
  if (!connection) {
    return false;
  }

  // 确保BullMQ关键字段
  if (connection.maxRetriesPerRequest !== null) {
    console.warn('Warning: maxRetriesPerRequest should be null for BullMQ compatibility');
    return false;
  }

  return true;
}

module.exports = {
  createBullMQCompatibleConnection,
  createWorkerConnection,
  createQueueConnection,
  validateConnectionConfig,
};