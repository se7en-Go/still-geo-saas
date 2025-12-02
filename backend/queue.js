const { Queue, QueueEvents } = require('bullmq');
const { config } = require('./config');
const logger = require('./logger');

const connection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null,
};

const queueName = 'content-generation';

const events = new QueueEvents(queueName, { connection });
events.on('failed', ({ jobId, failedReason, attemptsMade }) => {
  logger.error('Content job failed', { jobId, failedReason, attemptsMade });
});
events.on('stalled', ({ jobId }) => {
  logger.warn('Content job stalled', { jobId });
});
events.on('completed', ({ jobId }) => {
  logger.info('Content job completed', { jobId });
});
const contentQueue = new Queue(queueName, {
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

contentQueue.on('error', (err) => {
  logger.error('Content queue encountered an error', { error: err.message });
});

events.on('error', (err) => {
  logger.error('Queue events stream error', { error: err.message });
});

module.exports = { contentQueue, queueEvents: events };
