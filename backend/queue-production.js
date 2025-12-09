const { Queue, QueueEvents } = require('bullmq');
const { config } = require('./config');
const {
  isRedisAvailable,
  createQueueConnection,
  validateRedisConnection
} = require('./config-redis-production');
const logger = require('./logger');

/**
 * Production-ready queue configuration with Upstash Redis support
 * Includes proper TLS, fallback handling, and connection validation
 */

let contentQueue, events;
let connectionStatus = 'initializing';

// Check Redis availability and configuration
const redisAvailable = isRedisAvailable();
const useFallback = !redisAvailable && process.env.REDIS_FALLBACK_ENABLED !== 'false';

logger.info('Queue initialization', {
  redisAvailable,
  useFallback,
  nodeEnv: process.env.NODE_ENV,
  redisUrl: process.env.REDIS_URL ? 'configured' : 'not configured',
  redisHost: process.env.REDIS_HOST || 'not configured'
});

if (!useFallback && redisAvailable) {
  // Use production-ready Redis connection
  const connection = createQueueConnection();

  if (!validateRedisConnection(connection)) {
    logger.error('Invalid Redis connection configuration');
    connectionStatus = 'invalid_config';
  } else {
    try {
      const queueName = 'content-generation';

      logger.info('Initializing Redis queue', {
        connectionType: connection.url ? 'URL-based' : 'parameter-based',
        host: connection.host || 'from URL',
        tlsEnabled: !!connection.tls
      });

      // Initialize queue events with proper connection
      events = new QueueEvents(queueName, {
        connection,
        // Additional settings for production
        autorun: true,
        blockingTimeout: 5000,
      });

      // Initialize main queue with enhanced settings
      contentQueue = new Queue(queueName, {
        connection,
        defaultJobOptions: {
          attempts: config.queue.attempts,
          backoff: {
            type: 'exponential',
            delay: config.queue.backoffMs,
          },
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 50, // Keep last 50 failed jobs for debugging
          timeout: config.queue.timeoutMs,
          // Production-specific job options
          delay: 0,
          priority: 0,
        },
        // Queue settings for production
        settings: {
          stalledInterval: 30000, // Check for stalled jobs every 30 seconds
          maxStalledCount: 3, // Max stalled count before marking job failed
        },
      });

      // Enhanced event handlers for production monitoring
      events.on('failed', ({ jobId, failedReason, attemptsMade, prev }) => {
        connectionStatus = 'job_failed';
        logger.error('Content job failed', {
          jobId,
          failedReason,
          attemptsMade,
          previousAttempts: prev ? prev - 1 : 0,
          timestamp: new Date().toISOString()
        });
      });

      events.on('stalled', ({ jobId }) => {
        connectionStatus = 'job_stalled';
        logger.warn('Content job stalled', {
          jobId,
          timestamp: new Date().toISOString()
        });
      });

      events.on('completed', ({ jobId, returnvalue }) => {
        connectionStatus = 'job_completed';
        logger.info('Content job completed', {
          jobId,
          timestamp: new Date().toISOString()
        });
      });

      events.on('progress', ({ jobId, data }) => {
        logger.debug('Job progress', { jobId, progress: data });
      });

      contentQueue.on('error', (err) => {
        connectionStatus = 'queue_error';
        logger.error('Content queue encountered an error', {
          error: err.message,
          stack: err.stack,
          timestamp: new Date().toISOString()
        });
      });

      events.on('error', (err) => {
        connectionStatus = 'events_error';
        logger.error('Queue events stream error', {
          error: err.message,
          stack: err.stack,
          timestamp: new Date().toISOString()
        });
      });

      // Connection success handlers
      contentQueue.on('waiting', () => {
        connectionStatus = 'waiting';
        logger.info('Queue is waiting for jobs');
      });

      contentQueue.on('active', () => {
        connectionStatus = 'active';
        logger.info('Queue is processing jobs');
      });

      connectionStatus = 'connected';
      logger.info('Redis queue initialized successfully', {
        queueName,
        connectionType: connection.url ? 'URL' : 'parameters',
        tlsEnabled: !!connection.tls
      });

    } catch (error) {
      connectionStatus = 'init_failed';
      logger.error('Redis queue initialization failed', {
        error: error.message,
        stack: error.stack,
        fallbackEnabled: process.env.REDIS_FALLBACK_ENABLED !== 'false'
      });
    }
  }
}

// Enhanced fallback handling
if (!contentQueue) {
  connectionStatus = 'fallback_mode';
  logger.warn('Using in-memory queue for content generation', {
    reason: useFallback ? 'Redis not available' : 'Redis initialization failed',
    redisAvailable,
    useFallback
  });

  contentQueue = {
    add: async (name, data, options = {}) => {
      logger.info('Memory queue: job added (not processed)', {
        name,
        data: data.title || 'unknown',
        timestamp: new Date().toISOString()
      });
      return { id: Date.now().toString() };
    },
    getWorkers: () => Promise.resolve([]),
    process: () => {},
    close: async () => {},
    pause: () => {},
    resume: () => {},
    getJobCounts: () => Promise.resolve({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0
    })
  };

  events = {
    on: () => {},
    close: async () => {},
    emit: () => {}
  };
}

// Health check function
async function getQueueHealth() {
  const health = {
    status: connectionStatus,
    redisAvailable,
    useFallback,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };

  if (contentQueue && connectionStatus === 'connected') {
    try {
      const counts = await contentQueue.getJobCounts();
      health.jobCounts = counts;
      health.healthy = true;
    } catch (error) {
      health.healthy = false;
      health.error = error.message;
    }
  } else {
    health.healthy = useFallback; // Healthy if fallback is intentional
  }

  return health;
}

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down queue gracefully');

  if (events && typeof events.close === 'function') {
    await events.close().catch(() => {});
  }

  if (contentQueue && typeof contentQueue.close === 'function') {
    await contentQueue.close().catch(() => {});
  }

  logger.info('Queue shutdown complete');
}

// Handle process termination
process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

module.exports = {
  contentQueue,
  queueEvents: events,
  getQueueHealth,
  shutdown,
  getConnectionStatus: () => connectionStatus
};