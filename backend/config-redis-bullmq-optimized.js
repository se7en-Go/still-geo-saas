/**
 * BullMQ优化的Redis配置
 * 专门针对BullMQ队列系统和Upstash Redis Cloud优化
 */

const { config } = require('./config');
const logger = require('./logger');

/**
 * 创建BullMQ兼容的Redis连接配置
 * 根据BullMQ官方要求设置maxRetriesPerRequest: null
 */
function createBullMQConnection() {
  const useFallback = process.env.NODE_ENV === 'production' &&
                      process.env.REDIS_AVAILABLE === 'false';

  if (useFallback) {
    logger.warn('Using memory fallback for BullMQ - Redis not available');
    return null;
  }

  // 基础连接配置
  const baseConfig = {
    // BullMQ关键配置：必须设置为null
    maxRetriesPerRequest: null,

    // 连接超时设置
    connectTimeout: 30000,
    commandTimeout: 5000,

    // 连接管理
    lazyConnect: true,
    enableOfflineQueue: false,
    enableReadyCheck: false, // BullMQ推荐关闭

    // 网络优化
    family: 4,
    keepAlive: 30000,

    // 重连策略
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: null, // 再次强调必须为null

    // 缓冲区优化
    maxMemoryPolicy: 'noeviction',

    // Upstash特定优化
    ...(config.redis.url && config.redis.url.includes('upstash') && {
      tls: {},
      // Upstash连接池优化
      enableAutoPipelining: true,
      maxRetriesPerRequest: null, // 确保在所有配置分支中都设置
    })
  };

  // 使用REDIS_URL（推荐方式）
  if (config.redis.url) {
    return {
      url: config.redis.url,
      ...baseConfig,
      // URL连接时额外配置
      ...(config.redis.url.includes('upstash') && {
        tls: {
          rejectUnauthorized: false,
          servername: new URL(config.redis.url).hostname
        }
      })
    };
  }

  // 使用参数连接（备用方式）
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    ...baseConfig
  };
}

/**
 * 创建生产者专用的连接配置
 * 生产者需要快速失败而不是无限重试
 */
function createProducerConnection() {
  const baseConnection = createBullMQConnection();

  if (!baseConnection) {
    return null;
  }

  return {
    ...baseConnection,
    // 生产者专用配置：设置有限重试以快速失败
    maxRetriesPerRequest: process.env.NODE_ENV === 'production' ? 1 : 3,
    // 更短的超时时间
    connectTimeout: 10000,
    commandTimeout: 3000
  };
}

/**
 * 创建消费者专用的连接配置
 * 消费者需要持续运行和容错能力
 */
function createConsumerConnection() {
  const baseConnection = createBullMQConnection();

  if (!baseConnection) {
    return null;
  }

  return {
    ...baseConnection,
    // 消费者专用配置：确保maxRetriesPerRequest为null以支持无限重试
    maxRetriesPerRequest: null,
    // 更长的超时时间
    connectTimeout: 30000,
    commandTimeout: 10000,
    // 消费者特定优化
    lazyConnect: true,
    enableOfflineQueue: true // 消费者可以离线排队
  };
}

/**
 * 创建QueueEvents专用连接配置
 * QueueEvents需要阻塞连接
 */
function createQueueEventsConnection() {
  const baseConnection = createBullMQConnection();

  if (!baseConnection) {
    return null;
  }

  return {
    ...baseConnection,
    // QueueEvents必须保持null以支持阻塞连接
    maxRetriesPerRequest: null,
    // 事件监听器优化
    lazyConnect: true,
    enableReadyCheck: false,
    // 阻塞连接设置
    blockingTimeout: 5000,
    // 持久连接优化
    keepAlive: 60000
  };
}

/**
 * 验证BullMQ Redis配置的有效性
 */
function validateBullMQConfig(connectionConfig) {
  if (!connectionConfig) {
    return { valid: false, error: 'Connection config is null' };
  }

  // 验证关键BullMQ配置
  if (connectionConfig.maxRetriesPerRequest !== null) {
    return {
      valid: false,
      error: `maxRetriesPerRequest must be null for BullMQ, got: ${connectionConfig.maxRetriesPerRequest}`
    };
  }

  if (connectionConfig.enableReadyCheck !== false) {
    logger.warn('enableReadyCheck should be false for optimal BullMQ performance');
  }

  if (connectionConfig.keyPrefix) {
    return {
      valid: false,
      error: 'keyPrefix is not compatible with BullMQ, use prefix option instead'
    };
  }

  return { valid: true };
}

/**
 * 获取连接配置的详细信息
 */
function getConnectionInfo(connectionConfig) {
  if (!connectionConfig) {
    return { type: 'fallback', details: 'Using memory fallback' };
  }

  const isUrlConnection = !!connectionConfig.url;
  const isUpstash = isUrlConnection && connectionConfig.url.includes('upstash');

  return {
    type: isUrlConnection ? 'url' : 'parameters',
    provider: isUpstash ? 'upstash' : 'custom',
    host: connectionConfig.host || new URL(connectionConfig.url).hostname,
    port: connectionConfig.port || new URL(connectionConfig.url).port,
    tls: !!connectionConfig.tls,
    bullMQOptimized: connectionConfig.maxRetriesPerRequest === null,
    config: {
      maxRetriesPerRequest: connectionConfig.maxRetriesPerRequest,
      enableReadyCheck: connectionConfig.enableReadyCheck,
      lazyConnect: connectionConfig.lazyConnect,
      connectTimeout: connectionConfig.connectTimeout
    }
  };
}

module.exports = {
  createBullMQConnection,
  createProducerConnection,
  createConsumerConnection,
  createQueueEventsConnection,
  validateBullMQConfig,
  getConnectionInfo
};