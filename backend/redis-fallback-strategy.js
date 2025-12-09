const logger = require('./logger');
const { createUpstashConnection, validateRedisConnection } = require('./config-redis-production');
const Redis = require('ioredis');

/**
 * Advanced Redis Fallback Strategy for Production
 * Provides multiple levels of fallback with monitoring and recovery
 */

class RedisFallbackManager {
  constructor() {
    this.currentStrategy = 'redis';
    this.redisClient = null;
    this.fallbackData = new Map();
    this.healthCheckInterval = null;
    this.connectionAttempts = 0;
    this.lastSuccessfulConnection = null;
    this.isReconnecting = false;

    // Configuration
    this.maxRetries = parseInt(process.env.REDIS_MAX_RETRIES) || 5;
    this.retryDelay = parseInt(process.env.REDIS_RETRY_DELAY) || 30000; // 30 seconds
    this.healthCheckInterval = parseInt(process.env.REDIS_HEALTH_CHECK_INTERVAL) || 60000; // 1 minute
    this.fallbackMode = process.env.REDIS_FALLBACK_MODE || 'memory'; // 'memory' or 'disabled'

    this.metrics = {
      totalOperations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      fallbackOperations: 0,
      connectionErrors: 0,
      reconnectionAttempts: 0
    };
  }

  async initialize() {
    logger.info('Initializing Redis fallback manager', {
      fallbackMode: this.fallbackMode,
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay
    });

    if (this.fallbackMode === 'disabled') {
      logger.info('Redis fallback is disabled');
      this.currentStrategy = 'redis';
      return await this.initializeRedisOnly();
    }

    return await this.initializeWithFallback();
  }

  async initializeRedisOnly() {
    const connection = createUpstashConnection();

    if (!validateRedisConnection(connection)) {
      throw new Error('Redis connection configuration is invalid and fallback is disabled');
    }

    this.redisClient = new Redis(connection);
    await this.setupRedisClient();
    this.currentStrategy = 'redis';

    return this.redisClient;
  }

  async initializeWithFallback() {
    try {
      // Try to connect to Redis first
      await this.tryRedisConnection();
      this.startHealthCheck();
      logger.info('Redis initialized successfully with fallback enabled');
      return this.redisClient;

    } catch (error) {
      logger.warn('Redis connection failed, initializing fallback mode', {
        error: error.message,
        fallbackMode: this.fallbackMode
      });

      this.currentStrategy = 'fallback';
      return this.initializeFallback();
    }
  }

  async tryRedisConnection() {
    const connection = createUpstashConnection();

    if (!validateRedisConnection(connection)) {
      throw new Error('Invalid Redis connection configuration');
    }

    this.redisClient = new Redis(connection);
    await this.setupRedisClient();
    this.currentStrategy = 'redis';
    this.lastSuccessfulConnection = Date.now();
    this.connectionAttempts = 0;

    logger.info('Redis connection established successfully');
  }

  setupRedisClient() {
    return new Promise((resolve, reject) => {
      this.redisClient.on('connect', () => {
        logger.info('Redis client connected');
        resolve();
      });

      this.redisClient.on('ready', () => {
        logger.info('Redis client ready');
        this.lastSuccessfulConnection = Date.now();
        this.connectionAttempts = 0;
      });

      this.redisClient.on('error', (error) => {
        this.metrics.connectionErrors++;
        logger.error('Redis client error', {
          error: error.message,
          currentStrategy: this.currentStrategy
        });

        if (this.fallbackMode !== 'disabled') {
          this.handleRedisError(error);
        }
      });

      this.redisClient.on('close', () => {
        logger.warn('Redis client connection closed');
      });

      // Test connection
      this.redisClient.ping()
        .then(() => resolve())
        .catch(reject);
    });
  }

  initializeFallback() {
    if (this.fallbackMode === 'memory') {
      logger.info('Initializing in-memory fallback storage');
      return {
        get: (key) => this.memoryFallbackGet(key),
        set: (key, value, ttl) => this.memoryFallbackSet(key, value, ttl),
        del: (key) => this.memoryFallbackDel(key),
        exists: (key) => this.memoryFallbackExists(key),
        ping: () => Promise.resolve('pong'),
        quit: () => Promise.resolve()
      };
    } else {
      throw new Error('Unsupported fallback mode: ' + this.fallbackMode);
    }
  }

  async handleRedisError(error) {
    if (this.isReconnecting) {
      return;
    }

    this.isReconnecting = true;
    logger.warn('Handling Redis error, attempting recovery', {
      error: error.message,
      connectionAttempts: this.connectionAttempts
    });

    if (this.connectionAttempts < this.maxRetries) {
      this.connectionAttempts++;
      this.metrics.reconnectionAttempts++;

      logger.info(`Attempting Redis reconnection (${this.connectionAttempts}/${this.maxRetries})`);

      setTimeout(async () => {
        try {
          await this.tryRedisConnection();
          this.currentStrategy = 'redis';
          logger.info('Redis reconnection successful');
        } catch (reconnectError) {
          logger.error('Redis reconnection failed', {
            error: reconnectError.message,
            attempt: this.connectionAttempts
          });

          if (this.currentStrategy !== 'fallback') {
            this.currentStrategy = 'fallback';
            logger.warn('Switching to fallback mode due to connection failure');
          }
        }
        this.isReconnecting = false;
      }, this.retryDelay);
    } else {
      logger.error('Max Redis connection attempts reached, staying in fallback mode');
      this.currentStrategy = 'fallback';
      this.isReconnecting = false;
    }
  }

  startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      if (this.currentStrategy === 'redis' && this.redisClient) {
        try {
          await this.redisClient.ping();
          // Connection is healthy
        } catch (error) {
          logger.warn('Health check failed', { error: error.message });
          await this.handleRedisError(error);
        }
      }
    }, this.healthCheckInterval);
  }

  // Memory fallback operations
  memoryFallbackGet(key) {
    this.metrics.totalOperations++;
    const item = this.fallbackData.get(key);

    if (!item) {
      this.metrics.cacheMisses++;
      return null;
    }

    if (item.expires && Date.now() > item.expires) {
      this.fallbackData.delete(key);
      this.metrics.cacheMisses++;
      return null;
    }

    this.metrics.cacheHits++;
    this.metrics.fallbackOperations++;
    return item.value;
  }

  memoryFallbackSet(key, value, ttl = null) {
    this.metrics.totalOperations++;
    this.metrics.fallbackOperations++;

    const item = {
      value,
      expires: ttl ? Date.now() + (ttl * 1000) : null,
      createdAt: Date.now()
    };

    this.fallbackData.set(key, item);

    // Cleanup expired items periodically
    if (this.fallbackData.size % 100 === 0) {
      this.cleanupExpiredItems();
    }

    return 'OK';
  }

  memoryFallbackDel(key) {
    this.metrics.totalOperations++;
    this.metrics.fallbackOperations++;
    const deleted = this.fallbackData.delete(key);
    return deleted ? 1 : 0;
  }

  memoryFallbackExists(key) {
    this.metrics.totalOperations++;
    const item = this.fallbackData.get(key);

    if (!item) {
      return 0;
    }

    if (item.expires && Date.now() > item.expires) {
      this.fallbackData.delete(key);
      return 0;
    }

    return 1;
  }

  cleanupExpiredItems() {
    const now = Date.now();
    let deleted = 0;

    for (const [key, item] of this.fallbackData.entries()) {
      if (item.expires && now > item.expires) {
        this.fallbackData.delete(key);
        deleted++;
      }
    }

    if (deleted > 0) {
      logger.debug(`Cleaned up ${deleted} expired fallback items`);
    }
  }

  // Public API methods
  async get(key) {
    if (this.currentStrategy === 'redis' && this.redisClient) {
      try {
        return await this.redisClient.get(key);
      } catch (error) {
        logger.warn('Redis get failed, trying fallback', { error: error.message });
        await this.handleRedisError(error);
      }
    }

    return this.memoryFallbackGet(key);
  }

  async set(key, value, ttl = null) {
    if (this.currentStrategy === 'redis' && this.redisClient) {
      try {
        if (ttl) {
          return await this.redisClient.set(key, value, 'EX', ttl);
        }
        return await this.redisClient.set(key, value);
      } catch (error) {
        logger.warn('Redis set failed, using fallback', { error: error.message });
        await this.handleRedisError(error);
      }
    }

    return this.memoryFallbackSet(key, value, ttl);
  }

  async del(key) {
    if (this.currentStrategy === 'redis' && this.redisClient) {
      try {
        return await this.redisClient.del(key);
      } catch (error) {
        logger.warn('Redis del failed, using fallback', { error: error.message });
        await this.handleRedisError(error);
      }
    }

    return this.memoryFallbackDel(key);
  }

  async exists(key) {
    if (this.currentStrategy === 'redis' && this.redisClient) {
      try {
        return await this.redisClient.exists(key);
      } catch (error) {
        logger.warn('Redis exists failed, using fallback', { error: error.message });
        await this.handleRedisError(error);
      }
    }

    return this.memoryFallbackExists(key);
  }

  async ping() {
    if (this.currentStrategy === 'redis' && this.redisClient) {
      try {
        return await this.redisClient.ping();
      } catch (error) {
        await this.handleRedisError(error);
      }
    }

    return 'pong'; // Fallback always responds with pong
  }

  getStatus() {
    return {
      currentStrategy: this.currentStrategy,
      fallbackMode: this.fallbackMode,
      connectionAttempts: this.connectionAttempts,
      lastSuccessfulConnection: this.lastSuccessfulConnection,
      isReconnecting: this.isReconnecting,
      fallbackDataSize: this.fallbackData.size,
      metrics: { ...this.metrics },
      health: {
        redisConnected: this.currentStrategy === 'redis' && this.redisClient && this.redisClient.status === 'ready',
        fallbackActive: this.currentStrategy === 'fallback'
      }
    };
  }

  async forceFallback() {
    logger.info('Manually switching to fallback mode');
    this.currentStrategy = 'fallback';

    if (this.redisClient) {
      await this.redisClient.quit().catch(() => {});
      this.redisClient = null;
    }
  }

  async forceRedis() {
    logger.info('Manually attempting to switch back to Redis');

    try {
      await this.tryRedisConnection();
      logger.info('Successfully switched back to Redis');
      return true;
    } catch (error) {
      logger.error('Failed to switch back to Redis', { error: error.message });
      return false;
    }
  }

  async shutdown() {
    logger.info('Shutting down Redis fallback manager');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (this.redisClient) {
      await this.redisClient.quit().catch(() => {});
    }
  }
}

// Singleton instance
let fallbackManager = null;

function getRedisManager() {
  if (!fallbackManager) {
    fallbackManager = new RedisFallbackManager();
  }
  return fallbackManager;
}

module.exports = {
  RedisFallbackManager,
  getRedisManager
};