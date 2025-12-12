const express = require('express');
const { auth } = require('../middleware/auth');
const { contentQueue, queueEvents } = require('../queue-fixed');
const { config } = require('../config');
const logger = require('../logger');
const db = require('../db');

const router = express.Router();

// Worker状态跟踪 - 简单实现
let workerStatus = {
  isRunning: false,
  lastSeen: null,
  processedJobs: 0,
  failedJobs: 0,
};

// 公开的健康检查端点（不需要认证）
router.get('/system', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: {
        database: 'unknown',
        redis: 'unknown',
        worker: workerStatus.isRunning ? 'healthy' : 'unhealthy',
        queue: 'unknown',
      }
    };

    // 检查数据库连接
    try {
      await db.query('SELECT 1');
      health.services.database = 'healthy';
    } catch (err) {
      health.services.database = 'unhealthy';
      health.status = 'degraded';
    }

    // 检查Redis和队列连接
    try {
      if (contentQueue) {
        const counts = await contentQueue.getJobCounts();
        health.services.queue = 'healthy';
        health.queue = {
          waiting: counts.waiting || 0,
          active: counts.active || 0,
          completed: counts.completed || 0,
          failed: counts.failed || 0,
        };
      } else {
        health.services.queue = 'unhealthy';
        health.status = 'degraded';
      }
    } catch (err) {
      health.services.redis = 'unhealthy';
      health.services.queue = 'unhealthy';
      health.status = 'degraded';
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: err.message,
    });
  }
});

// Worker特定的健康检查（需要认证）
router.get('/worker', auth, async (req, res) => {
  try {
    const workerHealth = {
      status: workerStatus.isRunning ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      lastSeen: workerStatus.lastSeen,
      processedJobs: workerStatus.processedJobs,
      failedJobs: workerStatus.failedJobs,
    };

    // 获取详细的队列统计信息
    if (contentQueue) {
      try {
        const workers = await contentQueue.getWorkers();
        const counts = await contentQueue.getJobCounts();

        workerHealth.queue = {
          activeWorkers: workers.length,
          jobCounts: counts,
        };
      } catch (err) {
        workerHealth.queue = {
          error: 'Failed to get queue stats',
          details: err.message,
        };
      }
    } else {
      workerHealth.queue = {
        error: 'Queue not initialized',
      };
    }

    const statusCode = workerHealth.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(workerHealth);
  } catch (err) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: err.message,
    });
  }
});

// AI服务健康检查
router.get('/ai', auth, async (req, res) => {
  try {
    const aiHealth = {
      status: 'unknown',
      timestamp: new Date().toISOString(),
      config: {
        provider: config.ai.provider,
        baseUrl: config.ai.baseUrl ? 'configured' : 'not configured',
        chatModel: config.ai.chatModel,
        hasApiKey: !!config.ai.apiKey,
        timeout: config.ai.requestTimeoutMs,
      }
    };

    // 简单的连接测试
    if (config.ai.baseUrl && config.ai.apiKey) {
      try {
        const axios = require('axios');
        const testUrl = config.ai.baseUrl.replace(/\/$/, '');

        // 根据provider选择测试端点
        let testEndpoint = '';
        if (config.ai.provider === 'gemini') {
          testEndpoint = '/models';
        } else {
          testEndpoint = '/models';
        }

        const response = await axios.get(
          `${testUrl}${testEndpoint}`,
          {
            headers: config.ai.provider === 'gemini'
              ? { 'x-goog-api-key': config.ai.apiKey }
              : { 'Authorization': `Bearer ${config.ai.apiKey}` },
            timeout: 5000,
          }
        );

        aiHealth.status = 'healthy';
        aiHealth.connectionTest = {
          success: true,
          responseTime: response.headers['x-response-time'] || 'unknown',
        };
      } catch (err) {
        aiHealth.status = 'unhealthy';
        aiHealth.connectionTest = {
          success: false,
          error: err.message,
        };
      }
    } else {
      aiHealth.status = 'not_configured';
    }

    const statusCode = aiHealth.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(aiHealth);
  } catch (err) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: err.message,
    });
  }
});

// 更新Worker状态的辅助函数
router.updateWorkerStatus = (status) => {
  workerStatus = {
    ...workerStatus,
    ...status,
    lastSeen: new Date().toISOString(),
  };
};

// Worker可以通过这个端点报告状态
router.post('/worker/heartbeat', auth, (req, res) => {
  const { processedJobs, failedJobs, status } = req.body;

  router.updateWorkerStatus({
    isRunning: status === 'running',
    processedJobs: processedJobs || 0,
    failedJobs: failedJobs || 0,
  });

  res.json({ status: 'received', timestamp: new Date().toISOString() });
});

module.exports = { router, updateWorkerStatus: router.updateWorkerStatus };