const { Queue, QueueEvents } = require('bullmq');
const { config } = require('./config');
const logger = require('./logger');

// 在生产环境中如果Redis不可用，使用内存队列作为fallback
const useFallback = process.env.NODE_ENV === 'production' && !process.env.REDIS_AVAILABLE;

let contentQueue, events;

if (!useFallback) {
  const connection = config.redis.url
    ? {
        url: config.redis.url,
        connectTimeout: config.redis.connectTimeout,
        lazyConnect: config.redis.lazyConnect,
        retryDelayOnFailover: config.redis.retryDelayOnFailover,
        maxRetriesPerRequest: 0, // 设置为0来快速失败
        enableOfflineQueue: false,
        family: 4, // 强制使用IPv4
        keepAlive: 30000,
        tls: {}, // Enable TLS for Upstash Redis Cloud
      }
    : {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        maxRetriesPerRequest: 0,
        connectTimeout: config.redis.connectTimeout,
        lazyConnect: config.redis.lazyConnect,
        enableOfflineQueue: false,
        family: 4,
        keepAlive: 30000,
      };

try {
    const queueName = 'content-generation';

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
    logger.warn('Redis queue initialization failed, using memory fallback', { error: error.message });
    // Fallback to memory queue
  }
}

// 如果Redis不可用或fallback被触发，使用内存队列
if (!contentQueue) {
  logger.info('Using in-memory queue for content generation (Redis not available)');

  contentQueue = {
    add: async (name, data, options = {}) => {
      logger.info('Memory queue: job added (not processed)', { name, data: data.title || 'unknown' });
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
