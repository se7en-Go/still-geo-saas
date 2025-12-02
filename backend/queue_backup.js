const { Queue, QueueEvents } = require('bullmq');
const { config } = require('./config');
const logger = require('./logger');

// Redis连接配置 - 支持完整URL和单独参数
const connection = config.redis.url
  ? {
      url: config.redis.url,
      connectTimeout: config.redis.connectTimeout,
      lazyConnect: config.redis.lazyConnect,
      retryDelayOnFailover: config.redis.retryDelayOnFailover,
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      enableOfflineQueue: false,
    }
  : {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      connectTimeout: config.redis.connectTimeout,
      lazyConnect: config.redis.lazyConnect,
      enableOfflineQueue: false,
    };

const queueName = 'content-generation';

// 如果Redis不可用，创建内存队列作为fallback
let contentQueue, events;

try {
  events = new QueueEvents(queueName, { connection });
  contentQueue = new Queue(queueName, {
    connection,
    defaultJobOptions: {
      attempts: config.queue.attempts,
      backoff: {
        type: 'exponential',
        delay: config.queue.backoffMs,
      },
      removeOnComplete: false,
      removeOnFail: false,
      timeout: config.queue.timeoutMs,
    },
  });

  events.on('failed', ({ jobId, failedReason, attemptsMade }) => {
    logger.error('Content job failed', { jobId, failedReason, attemptsMade });
  });

  events.on('stalled', ({ jobId }) => {
    logger.warn('Content job stalled', { jobId });
  });

  events.on('completed', ({ jobId }) => {
    logger.info('Content job completed', { jobId });
  });

  contentQueue.on('error', (err) => {
    logger.error('Content queue encountered an error', { error: err.message });
  });

  events.on('error', (err) => {
    logger.error('Queue events stream error', { error: err.message });
  });

} catch (error) {
  logger.error('Failed to initialize Redis queue, using fallback', { error: error.message });

  // 创建内存队列作为fallback
  contentQueue = {
    add: async (name, data, options = {}) => {
      logger.info('Queue fallback: job would be added', { name, data });
      return { id: Date.now().toString() };
    },
    getWorkers: () => Promise.resolve([]),
    process: () => {},
    close: async () => {}
  };

  events = {
    on: () => {},
    close: async () => {}
  };
}

module.exports = { contentQueue, queueEvents: events };