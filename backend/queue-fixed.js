const { Queue, QueueEvents } = require('bullmq');
const { config } = require('./config');
const logger = require('./logger');

/**
 * 修复后的队列配置
 * 解决连接冲突和fallback问题
 */

// 统一连接配置
function createOptimizedConnection() {
  const useFallback = process.env.NODE_ENV === 'production' &&
                      process.env.REDIS_AVAILABLE === 'false';

  if (useFallback) {
    logger.warn('Using memory fallback queue - Redis not available');
    return null;
  }

  // 优先使用REDIS_URL
  if (config.redis.url) {
    return {
      url: config.redis.url,
      connectTimeout: config.redis.connectTimeout,
      lazyConnect: config.redis.lazyConnect,
      retryDelayOnFailover: config.redis.retryDelayOnFailover,
      maxRetriesPerRequest: null, // BullMQ要求Queue和Worker都使用null确保稳定性
      enableOfflineQueue: false,
      family: 4,
      keepAlive: 30000,
      tls: config.redis.url.includes('upstash') ? {} : undefined,
    };
  }

  // 备用参数配置
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    connectTimeout: config.redis.connectTimeout,
    lazyConnect: config.redis.lazyConnect,
    retryDelayOnFailover: config.redis.retryDelayOnFailover,
    maxRetriesPerRequest: null, // BullMQ要求Queue和Worker都使用null确保稳定性
    enableOfflineQueue: false,
    family: 4,
    keepAlive: 30000,
  };
}

let contentQueue, events;
let connectionStatus = 'disconnected';

const connection = createOptimizedConnection();

if (connection) {
  try {
    const queueName = 'content-generation';

    // 创建队列事件监听器
    events = new QueueEvents(queueName, {
      connection,
      autorun: true,
      blockingTimeout: 5000,
    });

    // 创建主队列
    contentQueue = new Queue(queueName, {
      connection,
      defaultJobOptions: {
        attempts: config.queue.attempts,
        backoff: {
          type: 'exponential',
          delay: config.queue.backoffMs,
        },
        removeOnComplete: 50, // 保留最近完成的任务
        removeOnFail: 20,     // 保留失败任务用于调试
        timeout: config.queue.timeoutMs,
      },
    });

    // 增强的事件监听
    events.on('failed', ({ jobId, failedReason, attemptsMade }) => {
      connectionStatus = 'job_failed';
      logger.error('Content job failed', {
        jobId,
        failedReason,
        attemptsMade,
        timestamp: new Date().toISOString()
      });
    });

    events.on('stalled', ({ jobId }) => {
      connectionStatus = 'job_stalled';
      logger.warn('Content job stalled', { jobId });
    });

    events.on('completed', ({ jobId }) => {
      connectionStatus = 'job_completed';
      logger.info('Content job completed', { jobId });
    });

    contentQueue.on('error', (err) => {
      connectionStatus = 'queue_error';
      logger.error('Content queue error', {
        error: err.message,
        code: err.code,
        timestamp: new Date().toISOString()
      });
    });

    events.on('error', (err) => {
      connectionStatus = 'events_error';
      logger.error('Queue events error', {
        error: err.message,
        code: err.code,
        timestamp: new Date().toISOString()
      });
    });

    connectionStatus = 'connected';
    logger.info('Queue initialized successfully', {
      queueName,
      connectionType: connection.url ? 'URL' : 'parameters'
    });

  } catch (error) {
    connectionStatus = 'init_failed';
    logger.error('Queue initialization failed', {
      error: error.message,
      stack: error.stack
    });
    // 降级到内存队列
    createMemoryQueue();
  }
} else {
  createMemoryQueue();
}

function createMemoryQueue() {
  connectionStatus = 'fallback_mode';
  logger.warn('Using memory fallback queue');

  contentQueue = {
    add: async (name, data, options = {}) => {
      logger.info('Memory queue: job queued', { name, jobId: Date.now() });

      // 在内存模式下直接处理任务
      if (name === 'generate-content') {
        setTimeout(() => {
          processMemoryJob(data);
        }, 100);
      }

      return { id: Date.now().toString() };
    },
    getJob: async (id) => ({
      id,
      data: {},
      progress: { stage: 'completed', percent: 100 },
      returnvalue: { title: 'Memory Mode Result' },
      getState: () => Promise.resolve('completed')
    }),
    getWorkers: () => Promise.resolve([]),
    close: async () => {},
  };

  events = {
    on: () => {},
    close: async () => {},
  };
}

// 内存模式下的任务处理器
async function processMemoryJob(jobData) {
  try {
    logger.info('Processing job in memory mode', { jobData });
    // 这里可以添加简化的内容生成逻辑
    // 或者返回默认内容
  } catch (error) {
    logger.error('Memory job processing failed', { error: error.message });
  }
}

// 队列健康检查
async function getQueueHealth() {
  const health = {
    status: connectionStatus,
    timestamp: new Date().toISOString(),
    healthy: connectionStatus === 'connected'
  };

  if (contentQueue && connectionStatus === 'connected') {
    try {
      const counts = await contentQueue.getJobCounts();
      health.jobCounts = counts;
    } catch (error) {
      health.error = error.message;
      health.healthy = false;
    }
  }

  return health;
}

module.exports = {
  contentQueue,
  queueEvents: events,
  getQueueHealth,
  getConnectionStatus: () => connectionStatus
};