const { config } = require('./config');
const logger = require('./logger');

/**
 * Production-ready Redis configuration for Upstash
 * Handles TLS, connection pooling, and fallback strategies
 */

function createUpstashConnection() {
  // For production, prioritize REDIS_URL (Upstash format)
  if (process.env.REDIS_URL) {
    logger.info('Using REDIS_URL for Redis connection (Upstash format)');

    return {
      url: process.env.REDIS_URL,
      // Upstash-specific TLS configuration
      tls: process.env.REDIS_TLS !== 'false',
      // Connection settings for cloud environment
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT) || 60000,
      lazyConnect: process.env.REDIS_LAZY_CONNECT !== 'false',
      retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY_ON_FAILOVER) || 300,
      maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES_PER_REQUEST) || 3,
      // Cloud-specific optimizations
      enableOfflineQueue: false, // Prevent memory buildup during outages
      family: 4, // Force IPv4 for better cloud compatibility
      keepAlive: 30000, // Maintain connection health
      // Upstash-specific settings
      commandTimeout: 5000,
      enableReadyCheck: true,
      maxLoadingTimeout: 5000,
    };
  }

  // Fallback to individual connection parameters
  if (process.env.REDIS_HOST) {
    logger.info('Using individual Redis parameters for connection');

    return {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      // TLS configuration for Upstash
      tls: process.env.REDIS_TLS !== 'false',
      // Connection settings
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT) || 60000,
      lazyConnect: process.env.REDIS_LAZY_CONNECT !== 'false',
      retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY_ON_FAILOVER) || 300,
      maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES_PER_REQUEST) || 3,
      // Cloud optimizations
      enableOfflineQueue: false,
      family: 4,
      keepAlive: 30000,
      commandTimeout: 5000,
      enableReadyCheck: true,
      maxLoadingTimeout: 5000,
    };
  }

  // No valid configuration found
  logger.warn('No valid Redis configuration found');
  return null;
}

function createMemoryFallbackConnection() {
  logger.warn('Redis not available - using in-memory fallback');
  return null;
}

function isRedisAvailable() {
  // Check if Redis is marked as available
  if (process.env.REDIS_AVAILABLE === 'false') {
    return false;
  }

  // Check for valid Redis configuration
  if (process.env.REDIS_URL) {
    return true;
  }

  if (process.env.REDIS_HOST &&
      process.env.REDIS_HOST !== '127.0.0.1' &&
      !process.env.REDIS_HOST.startsWith('192.168.')) {
    return true;
  }

  return false;
}

function validateRedisConnection(connection) {
  if (!connection) {
    return false;
  }

  // For Upstash URLs, validate format
  if (connection.url) {
    const upstashPattern = /^redis:\/\/[^:]+:[^@]+@[^:]+:\d+$/;
    return upstashPattern.test(connection.url);
  }

  // For individual parameters, validate required fields
  if (connection.host && connection.port) {
    // Reject local IPs in production
    if (process.env.NODE_ENV === 'production') {
      const localIpPatterns = [
        /^192\.168\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^127\./
      ];

      for (const pattern of localIpPatterns) {
        if (pattern.test(connection.host)) {
          logger.error(`Local IP detected in production: ${connection.host}`);
          return false;
        }
      }
    }

    return true;
  }

  return false;
}

function createQueueConnection() {
  const redisConnection = createUpstashConnection();

  if (!validateRedisConnection(redisConnection)) {
    if (process.env.REDIS_FALLBACK_ENABLED !== 'false') {
      logger.warn('Invalid Redis connection, falling back to memory queue');
      return null;
    }
    throw new Error('Redis configuration is invalid and fallback is disabled');
  }

  return redisConnection;
}

module.exports = {
  createUpstashConnection,
  createMemoryFallbackConnection,
  isRedisAvailable,
  validateRedisConnection,
  createQueueConnection,
};