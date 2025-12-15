/**
 * GEO后端服务健康检查保活机制
 * 解决Render免费实例休眠问题的核心解决方案
 *
 * 功能特性:
 * - 多层保活策略
 * - 智能健康检查
 * - 错误恢复机制
 * - 性能监控
 * - 自动告警
 */

const axios = require('axios');
const winston = require('winston');

// 配置日志记录器
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'health-check.log' })
  ]
});

class BackendHealthKeeper {
  constructor(options = {}) {
    this.healthCheckUrl = options.healthCheckUrl || process.env.BACKEND_HEALTH_URL || 'https://geo-backend-vp34.onrender.com/api/health';
    this.checkInterval = (options.checkInterval || process.env.CHECK_INTERVAL_MINUTES || 5) * 60 * 1000;
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 5000;

    // 性能监控数据
    this.metrics = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      responseTimeSum: 0,
      lastSuccessfulCheck: null,
      lastFailedCheck: null,
      consecutiveFailures: 0
    };

    // 保活状态
    this.isRunning = false;
    this.stopRequested = false;
  }

  /**
   * 启动健康检查保活服务
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Health keeper is already running');
      return;
    }

    logger.info('🚀 Starting Backend Health Keeper...');
    logger.info(`📡 Health Check URL: ${this.healthCheckUrl}`);
    logger.info(`⏰ Check Interval: ${this.checkInterval / 1000} seconds`);

    this.isRunning = true;
    this.stopRequested = false;

    // 立即执行第一次检查
    await this.performHealthCheck();

    // 启动定期检查
    this.healthCheckInterval = setInterval(async () => {
      if (this.stopRequested) {
        logger.info('🛑 Stop requested, ending health check cycle');
        return;
      }

      await this.performHealthCheck();
    }, this.checkInterval);

    logger.info('✅ Health keeper started successfully');
  }

  /**
   * 停止健康检查服务
   */
  async stop() {
    if (!this.isRunning) {
      logger.warn('Health keeper is not running');
      return;
    }

    logger.info('🛑 Stopping Backend Health Keeper...');
    this.stopRequested = true;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.isRunning = false;
    logger.info('✅ Health keeper stopped successfully');
  }

  /**
   * 执行单次健康检查
   */
  async performHealthCheck() {
    this.metrics.totalChecks++;

    try {
      const startTime = Date.now();

      logger.info(`🔍 Performing health check #${this.metrics.totalChecks}...`);

      const response = await axios.get(this.healthCheckUrl, {
        timeout: this.timeout,
        validateStatus: (status) => status >= 200 && status < 300,
        headers: {
          'User-Agent': 'Geo-Health-Keeper/1.0',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      const responseTime = Date.now() - startTime;
      this.updateMetricsOnSuccess(responseTime, response);

      logger.info(`✅ Health check successful (${responseTime}ms) - Status: ${response.status}`);
      this.logCurrentMetrics();

    } catch (error) {
      this.updateMetricsOnFailure(error);
      logger.error(`❌ Health check failed: ${error.message}`);

      // 重试机制
      if (await this.retryWithBackoff()) {
        logger.info('🔄 Retry successful, service recovered');
      } else {
        logger.error('💥 All retry attempts failed, service may be down');
        await this.handleServiceFailure();
      }
    }
  }

  /**
   * 指数退避重试机制
   */
  async retryWithBackoff() {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const delay = this.retryDelay * Math.pow(2, attempt - 1);

      logger.warn(`⏳ Retry attempt ${attempt}/${this.maxRetries} in ${delay}ms...`);
      await this.sleep(delay);

      try {
        const response = await axios.get(this.healthCheckUrl, {
          timeout: this.timeout,
          validateStatus: (status) => status >= 200 && status < 300
        });

        logger.info(`✅ Retry successful on attempt ${attempt} - Status: ${response.status}`);
        return true;

      } catch (error) {
        logger.warn(`❌ Retry attempt ${attempt} failed: ${error.message}`);

        if (attempt === this.maxRetries) {
          return false;
        }
      }
    }
    return false;
  }

  /**
   * 处理服务故障
   */
  async handleServiceFailure() {
    this.metrics.consecutiveFailures++;

    // 如果连续失败次数过多，触发告警
    if (this.metrics.consecutiveFailures >= 3) {
      logger.error(`🚨 CRITICAL: Service has failed ${this.metrics.consecutiveFailures} consecutive times`);
      await this.sendAlert('Service health check failed after multiple retry attempts');
    }

    // 尝试备用激活策略
    await this.activateSecondaryKeepAlive();
  }

  /**
   * 激活备用保活策略
   */
  async activateSecondaryKeepAlive() {
    logger.info('🔄 Activating secondary keep-alive strategies...');

    try {
      // 尝试访问其他端点来激活服务
      const secondaryEndpoints = [
        '/api/status',
        '/api/ping',
        '/api/uptime',
        '/api/version',
        '/api/info'
      ];

      for (const endpoint of secondaryEndpoints) {
        try {
          const url = this.healthCheckUrl.replace('/api/health', endpoint);
          await axios.get(url, { timeout: 15000 });
          logger.info(`✅ Secondary endpoint activated: ${endpoint}`);
          return true;
        } catch (error) {
          // 继续尝试下一个端点
        }
      }

      // 如果所有端点都失败，尝试POST请求
      try {
        await axios.post(this.healthCheckUrl, {}, {
          timeout: 15000,
          validateStatus: () => true // 接受任何状态码，目的是激活服务
        });
        logger.info('✅ POST activation successful');
        return true;
      } catch (error) {
        logger.warn('❌ POST activation failed');
      }

    } catch (error) {
      logger.error(`💥 Secondary keep-alive failed: ${error.message}`);
    }

    return false;
  }

  /**
   * 更新成功指标
   */
  updateMetricsOnSuccess(responseTime, response) {
    this.metrics.successfulChecks++;
    this.metrics.responseTimeSum += responseTime;
    this.metrics.lastSuccessfulCheck = new Date();
    this.metrics.consecutiveFailures = 0; // 重置连续失败计数
  }

  /**
   * 更新失败指标
   */
  updateMetricsOnFailure(error) {
    this.metrics.failedChecks++;
    this.metrics.lastFailedCheck = new Date();
  }

  /**
   * 获取当前性能指标
   */
  getMetrics() {
    const avgResponseTime = this.metrics.successfulChecks > 0
      ? this.metrics.responseTimeSum / this.metrics.successfulChecks
      : 0;

    const successRate = this.metrics.totalChecks > 0
      ? (this.metrics.successfulChecks / this.metrics.totalChecks) * 100
      : 0;

    return {
      ...this.metrics,
      averageResponseTime: Math.round(avgResponseTime),
      successRate: Math.round(successRate * 100) / 100,
      uptime: this.calculateUptime()
    };
  }

  /**
   * 计算服务可用性
   */
  calculateUptime() {
    if (this.metrics.totalChecks === 0) return 100;

    return ((this.metrics.successfulChecks / this.metrics.totalChecks) * 100).toFixed(2);
  }

  /**
   * 记录当前指标
   */
  logCurrentMetrics() {
    const metrics = this.getMetrics();

    logger.info('📊 Current Metrics:', {
      'Total Checks': metrics.totalChecks,
      'Success Rate': `${metrics.successRate}%`,
      'Avg Response Time': `${metrics.averageResponseTime}ms`,
      'Uptime': `${metrics.uptime}%`,
      'Consecutive Failures': metrics.consecutiveFailures
    });
  }

  /**
   * 发送告警
   */
  async sendAlert(message) {
    logger.error(`🚨 ALERT: ${message}`);

    // 这里可以集成各种告警渠道:
    // - Email通知
    // - Slack/Discord webhook
    // - 短信通知
    // - 推送通知

    // 例如: 发送到webhook
    if (process.env.ALERT_WEBHOOK_URL) {
      try {
        await axios.post(process.env.ALERT_WEBHOOK_URL, {
          text: `🚨 GEO Backend Alert: ${message}`,
          timestamp: new Date().toISOString(),
          metrics: this.getMetrics()
        });
      } catch (error) {
        logger.error(`Failed to send alert webhook: ${error.message}`);
      }
    }
  }

  /**
   * 生成健康报告
   */
  generateHealthReport() {
    const metrics = this.getMetrics();
    const now = new Date();

    return {
      timestamp: now.toISOString(),
      serviceUrl: this.healthCheckUrl,
      metrics,
      status: metrics.consecutiveFailures === 0 ? 'HEALTHY' : 'UNHEALTHY',
      recommendations: this.generateRecommendations(metrics)
    };
  }

  /**
   * 生成优化建议
   */
  generateRecommendations(metrics) {
    const recommendations = [];

    if (metrics.successRate < 95) {
      recommendations.push('Success rate is below 95%, consider upgrading service plan');
    }

    if (metrics.averageResponseTime > 5000) {
      recommendations.push('Average response time is high, optimize database queries');
    }

    if (metrics.consecutiveFailures > 0) {
      recommendations.push('Service has consecutive failures, check server logs');
    }

    return recommendations;
  }

  /**
   * 工具方法: 休眠
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 如果直接运行此脚本，启动健康检查
if (require.main === module) {
  const healthKeeper = new BackendHealthKeeper();

  // 优雅关闭处理
  const gracefulShutdown = async (signal) => {
    logger.info(`\n🛑 Received ${signal}, shutting down gracefully...`);
    await healthKeeper.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // 启动健康检查
  healthKeeper.start().catch(error => {
    logger.error(`Failed to start health keeper: ${error.message}`);
    process.exit(1);
  });
}

module.exports = BackendHealthKeeper;