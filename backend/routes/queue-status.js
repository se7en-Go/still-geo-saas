const express = require('express');
const { contentQueue } = require('../queue-fixed');
const { Worker } = require('bullmq');
const { config } = require('../config');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Worker连接配置（与worker.js保持一致）
function createWorkerConnection() {
  const useFallback = process.env.NODE_ENV === 'production' &&
                      process.env.REDIS_AVAILABLE === 'false';

  if (useFallback) {
    return null;
  }

  if (config.redis.url) {
    return {
      url: config.redis.url,
      connectTimeout: config.redis.connectTimeout,
      lazyConnect: config.redis.lazyConnect,
      retryDelayOnFailover: config.redis.retryDelayOnFailover,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      family: 4,
      keepAlive: 30000,
      tls: config.redis.url.includes('upstash') ? {} : undefined,
    };
  }

  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    connectTimeout: config.redis.connectTimeout,
    lazyConnect: config.redis.lazyConnect,
    retryDelayOnFailover: config.redis.retryDelayOnFailover,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    family: 4,
    keepAlive: 30000,
  };
}

// 获取队列健康状态
router.get('/health', auth, async (req, res, next) => {
  try {
    const status = {
      timestamp: new Date().toISOString(),
      queue: {
        connected: false,
        jobCounts: null,
        workers: 0
      },
      worker: {
        connected: false,
        status: 'unknown'
      },
      redis: {
        configured: !!config.redis.url,
        version: 'unknown'
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        redisAvailable: process.env.REDIS_AVAILABLE
      }
    };

    // 检查队列状态
    if (contentQueue) {
      status.queue.connected = true;
      status.queue.jobCounts = await contentQueue.getJobCounts();

      try {
        const workers = await contentQueue.getWorkers();
        status.queue.workers = workers.length;
      } catch (err) {
        console.warn('Failed to get workers:', err.message);
      }
    }

    // 检查Worker连接状态
    try {
      const connection = createWorkerConnection();
      if (connection) {
        const testWorker = new Worker('content-generation', async () => {}, {
          connection,
          concurrency: 1
        });

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            testWorker.close();
            reject(new Error('Worker connection timeout'));
          }, 3000);

          testWorker.on('ready', () => {
            clearTimeout(timeout);
            status.worker.connected = true;
            status.worker.status = 'ready';
            testWorker.close();
            resolve();
          });

          testWorker.on('error', (err) => {
            clearTimeout(timeout);
            status.worker.status = `error: ${err.message}`;
            testWorker.close();
            resolve();
          });
        });
      } else {
        status.worker.status = 'using_fallback_memory_queue';
      }
    } catch (err) {
      status.worker.status = `failed: ${err.message}`;
    }

    // 判断整体健康状态
    const isHealthy = status.queue.connected && (
      status.worker.connected || status.worker.status === 'using_fallback_memory_queue'
    );

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      ...status
    });

  } catch (error) {
    next(error);
  }
});

// 获取详细的队列统计信息
router.get('/stats', auth, async (req, res, next) => {
  try {
    const stats = {
      timestamp: new Date().toISOString(),
      queue: null,
      recentJobs: [],
      errorLogs: []
    };

    if (contentQueue) {
      // 获取任务计数
      stats.queue = await contentQueue.getJobCounts();

      // 获取最近的任务
      const [completed, failed, active] = await Promise.all([
        contentQueue.getCompleted(0, 10),
        contentQueue.getFailed(0, 10),
        contentQueue.getActive(0, 10)
      ]);

      stats.recentJobs = [
        ...completed.map(job => ({
          id: job.id,
          status: 'completed',
          timestamp: job.finishedOn,
          duration: job.finishedOn - job.timestamp
        })),
        ...failed.map(job => ({
          id: job.id,
          status: 'failed',
          timestamp: job.finishedOn,
          error: job.failedReason
        })),
        ...active.map(job => ({
          id: job.id,
          status: 'active',
          timestamp: job.timestamp,
          progress: job.progress
        }))
      ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
    }

    res.json(stats);

  } catch (error) {
    next(error);
  }
});

// 手动触发队列测试（仅用于调试）
router.post('/test', auth, async (req, res, next) => {
  try {
    const testJob = await contentQueue.add('test-job', {
      type: 'test',
      timestamp: new Date().toISOString(),
      userId: req.user.id
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      }
    });

    res.json({
      message: 'Test job created successfully',
      jobId: testJob.id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;