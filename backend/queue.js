const { Queue, QueueEvents } = require('bullmq');
const { config } = require('./config');
const logger = require('./logger');

let contentQueue, events;

// 创建优化的Redis连接配置
function createRedisConnection() {
  if (config.redis.url) {
    return {
      url: config.redis.url,
      connectTimeout: 10000, // 10秒连接超时
      lazyConnect: true,
      retryDelayOnFailover: 2000,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      family: 4, // 强制使用IPv4
      keepAlive: 30000,
      tls: {}, // Upstash Redis Cloud需要TLS
    };
  }

  return {
    host: config.redis.host || 'localhost',
    port: config.redis.port || 6379,
    password: config.redis.password,
    connectTimeout: 10000,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    family: 4,
    keepAlive: 30000,
  };
}

// 初始化队列系统
async function initializeQueue() {
  const connection = createRedisConnection();
  const queueName = 'content-generation';

  try {
    // 首先创建队列事件监听器
    events = new QueueEvents(queueName, { connection });

    // 创建队列
    contentQueue = new Queue(queueName, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 10, // 保留最近10个完成的任务
        removeOnFail: 5,      // 保留最近5个失败的任务
        timeout: 120000,      // 2分钟超时
      },
    });

    // 设置事件监听器
    events.on('failed', ({ jobId, failedReason, attemptsMade }) => {
      logger.error('Content job failed', { jobId, failedReason, attemptsMade });
    });

    events.on('stalled', ({ jobId }) => {
      logger.warn('Content job stalled', { jobId });
    });

    events.on('completed', ({ jobId }) => {
      logger.info('Content job completed', { jobId });
    });

    events.on('error', (err) => {
      logger.error('Queue events stream error', { error: err.message });
    });

    contentQueue.on('error', (err) => {
      logger.error('Content queue encountered an error', { error: err.message });
    });

    logger.info('Content queue initialized successfully', { queueName });

    return true;
  } catch (error) {
    logger.error('Failed to initialize Redis queue', { error: error.message });
    return false;
  }
}

// 创建内存队列作为fallback
function createMemoryQueue() {
  logger.warn('Using memory fallback queue for content generation');

  const jobs = new Map();
  let jobIdCounter = 1;

  contentQueue = {
    add: async (name, data, options = {}) => {
      const jobId = (jobIdCounter++).toString();
      jobs.set(jobId, { ...data, status: 'queued', createdAt: new Date() });
      logger.info('Memory queue: job added', { jobId, name, title: data.title || 'unknown' });

      // 模拟异步处理
      setTimeout(() => {
        const job = jobs.get(jobId);
        if (job) {
          job.status = 'completed';
          job.completedAt = new Date();
          jobs.set(jobId, job);
          logger.info('Memory queue: job completed', { jobId });
        }
      }, 1000);

      return { id: jobId };
    },

    getJob: async (jobId) => {
      return jobs.get(jobId);
    },

    getJobs: async (types) => {
      const allJobs = Array.from(jobs.entries()).map(([id, job]) => ({ id, ...job }));
      return allJobs;
    },

    getJobCounts: async () => {
      const counts = { active: 0, completed: 0, failed: 0, waiting: 0 };
      jobs.forEach(job => {
        if (job.status === 'queued') counts.waiting++;
        else if (job.status === 'active') counts.active++;
        else if (job.status === 'completed') counts.completed++;
        else if (job.status === 'failed') counts.failed++;
      });
      return counts;
    },

    getWorkers: () => Promise.resolve([]),

    close: async () => {
      jobs.clear();
    }
  };

  events = {
    on: () => {},
    close: async () => {}
  };
}

// 初始化队列系统
(async () => {
  const redisInitialized = await initializeQueue();

  if (!redisInitialized || !contentQueue) {
    createMemoryQueue();
  }
})();

module.exports = { contentQueue, queueEvents: events };