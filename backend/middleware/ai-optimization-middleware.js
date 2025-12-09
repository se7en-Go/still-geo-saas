const {
  IntelligentModelSelector,
  PerformanceMonitor,
  IntelligentRetryHandler
} = require('../config-ai-optimization');

/**
 * AI优化中间件
 * 基于性能分析结果智能选择模型、监控性能、处理重试
 *
 * @author Claude Code Performance Analysis
 * @version 1.0.0
 * @date 2025-12-09
 */

class AIOptimizationMiddleware {
  constructor() {
    this.modelSelector = new IntelligentModelSelector();
    this.performanceMonitor = new PerformanceMonitor();
    this.retryHandler = new IntelligentRetryHandler();
    this.requestCache = new Map(); // 简单的请求缓存
  }

  /**
   * 处理AI请求的主要中间件
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   * @param {Function} next - Express next函数
   */
  async handleAIRequest(req, res, next) {
    const startTime = Date.now();
    let selectedModel = null;
    let attemptCount = 0;
    let success = false;
    let totalCost = 0;

    try {
      // 1. 分析请求并选择最优模型
      const requestAnalysis = this.analyzeRequest(req);
      selectedModel = this.modelSelector.selectOptimalModel(requestAnalysis);

      console.log(`[AI优化] 请求分析结果:`, {
        model: selectedModel,
        complexity: requestAnalysis.complexity,
        scenario: requestAnalysis.scenario
      });

      // 2. 检查缓存
      const cacheKey = this.generateCacheKey(req.body);
      const cachedResponse = this.getCachedResponse(cacheKey);
      if (cachedResponse && !req.body.skipCache) {
        console.log(`[AI优化] 使用缓存响应，模型: ${cachedResponse.model}`);
        return this.sendOptimizedResponse(res, cachedResponse, startTime, 'cache');
      }

      // 3. 执行智能重试策略
      const result = await this.executeWithRetry(selectedModel, req.body, attemptCount);

      success = true;
      totalCost = result.estimatedCost;

      // 4. 缓存成功的响应
      this.cacheResponse(cacheKey, {
        model: selectedModel,
        data: result.data,
        estimatedCost: totalCost,
        timestamp: Date.now()
      });

      // 5. 记录性能数据
      this.recordPerformance(selectedModel, startTime, success, totalCost);

      // 6. 检查性能告警
      this.checkAndReportAlerts();

      return this.sendOptimizedResponse(res, result.data, startTime, selectedModel);

    } catch (error) {
      // 记录失败的性能数据
      this.recordPerformance(selectedModel || 'unknown', startTime, success, totalCost, error);

      console.error(`[AI优化] 请求失败:`, {
        error: error.message,
        model: selectedModel,
        attempts: attemptCount
      });

      return next(error);
    }
  }

  /**
   * 分析请求特征
   * @param {Object} req - 请求对象
   * @returns {Object} 分析结果
   */
  analyzeRequest(req) {
    const { prompt, context = {}, constraints = {} } = req.body;

    return {
      prompt: prompt || '',
      context: {
        isRealTime: context.isRealTime || false,
        isBrandCritical: context.isBrandCritical || false,
        isBatchProcessing: context.isBatchProcessing || false,
        requiresTechnicalAccuracy: context.requiresTechnicalAccuracy || false,
        isSEO: context.isSEO || false,
        priority: context.priority || 'medium'
      },
      constraints: {
        timeLimit: constraints.timeLimit,
        maxCost: constraints.maxCost,
        forceModel: constraints.forceModel
      }
    };
  }

  /**
   * 执行带重试策略的AI请求
   * @param {string} model - 选中的模型
   * @param {Object} requestBody - 请求体
   * @param {number} currentAttempt - 当前尝试次数
   * @returns {Object} 请求结果
   */
  async executeWithRetry(model, requestBody, currentAttempt = 0) {
    const errorType = 'initial_request'; // 初始请求类型
    const retryConfig = this.retryHandler.getRetryConfig({ message: errorType });

    // 执行请求
    try {
      const result = await this.executeAIRequest(model, requestBody);

      if (result.success) {
        return {
          data: result.data,
          success: true,
          estimatedCost: this.estimateCost(model, requestBody),
          model: model,
          attempts: currentAttempt + 1
        };
      } else {
        throw new Error(result.error || 'AI请求失败');
      }

    } catch (error) {
      const retryStrategy = this.retryHandler.getRetryConfig(error);

      if (currentAttempt < retryStrategy.maxRetries) {
        const delay = this.retryHandler.calculateDelay(retryStrategy, currentAttempt);
        const nextModel = retryStrategy.switchModel
          ? this.getAlternativeModel(model)
          : model;

        console.log(`[AI优化] 第${currentAttempt + 1}次重试，延迟${delay}ms，模型: ${nextModel}`);

        await this.sleep(delay);
        return this.executeWithRetry(nextModel, requestBody, currentAttempt + 1);
      } else {
        throw error;
      }
    }
  }

  /**
   * 执行AI请求的具体实现
   * @param {string} model - 模型名称
   * @param {Object} requestBody - 请求体
   * @returns {Object} 请求结果
   */
  async executeAIRequest(model, requestBody) {
    // 这里应该调用实际的AI服务
    // 为了演示，我们模拟请求执行

    const config = this.getModelConfig(model);
    if (!config) {
      throw new Error(`未知的模型: ${model}`);
    }

    // 模拟网络延迟
    const simulatedDelay = config.characteristics.responseTime.avg +
                          Math.random() * 1000 - 500;
    await this.sleep(simulatedDelay);

    // 模拟成功率
    const successRate = 0.95; // 基于性能分析的成功率
    if (Math.random() > successRate) {
      throw new Error('模拟的AI服务错误');
    }

    // 模拟AI响应
    return {
      success: true,
      data: {
        model: model,
        response: this.generateMockResponse(requestBody.prompt),
        timestamp: Date.now()
      }
    };
  }

  /**
   * 获取模型配置
   * @param {string} model - 模型名称
   * @returns {Object} 模型配置
   */
  getModelConfig(model) {
    const { MODEL_PROFILES } = require('../config-ai-optimization');
    return MODEL_PROFILES[model];
  }

  /**
   * 估算请求成本
   * @param {string} model - 模型名称
   * @param {Object} requestBody - 请求体
   * @returns {number} 估算成本（美元）
   */
  estimateCost(model, requestBody) {
    const config = this.getModelConfig(model);
    if (!config) return 0;

    const inputTokens = this.modelSelector.estimateTokenCount(requestBody.prompt || '');
    const estimatedOutputTokens = inputTokens * 0.8; // 估算输出token数

    const inputCost = (inputTokens / 1000000) * config.characteristics.cost.input;
    const outputCost = (estimatedOutputTokens / 1000000) * config.characteristics.cost.output;

    return inputCost + outputCost;
  }

  /**
   * 生成缓存键
   * @param {Object} requestBody - 请求体
   * @returns {string} 缓存键
   */
  generateCacheKey(requestBody) {
    const keyData = {
      prompt: requestBody.prompt,
      context: requestBody.context,
      constraints: requestBody.constraints
    };
    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  /**
   * 获取缓存的响应
   * @param {string} cacheKey - 缓存键
   * @returns {Object|null} 缓存的响应
   */
  getCachedResponse(cacheKey) {
    const cached = this.requestCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 300000) { // 5分钟缓存
      return cached;
    }
    return null;
  }

  /**
   * 缓存响应
   * @param {string} cacheKey - 缓存键
   * @param {Object} response - 响应数据
   */
  cacheResponse(cacheKey, response) {
    // 限制缓存大小
    if (this.requestCache.size > 1000) {
      const oldestKey = this.requestCache.keys().next().value;
      this.requestCache.delete(oldestKey);
    }

    this.requestCache.set(cacheKey, response);
  }

  /**
   * 记录性能数据
   * @param {string} model - 模型名称
   * @param {number} startTime - 开始时间
   * @param {boolean} success - 是否成功
   * @param {number} cost - 成本
   * @param {Error} error - 错误对象
   */
  recordPerformance(model, startTime, success, cost, error = null) {
    const responseTime = Date.now() - startTime;

    this.performanceMonitor.recordPerformance({
      model,
      responseTime,
      success,
      cost,
      errorType: error ? this.retryHandler.classifyError(error) : null
    });
  }

  /**
   * 检查并报告告警
   */
  checkAndReportAlerts() {
    const alerts = this.performanceMonitor.checkThresholds();

    alerts.forEach(alert => {
      console.warn(`[AI优化告警] ${alert.type}: ${alert.message}`, {
        severity: alert.severity,
        timestamp: new Date().toISOString()
      });

      // 这里可以集成实际的告警系统（邮件、Slack等）
    });
  }

  /**
   * 发送优化的响应
   * @param {Object} res - Express响应对象
   * @param {Object} data - 响应数据
   * @param {number} startTime - 开始时间
   * @param {string} model - 模型名称或来源
   */
  sendOptimizedResponse(res, data, startTime, model) {
    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      data: data.data || data,
      metadata: {
        model: model,
        responseTime: responseTime,
        timestamp: new Date().toISOString(),
        optimization: {
          cached: model === 'cache',
          cost: data.estimatedCost || 0,
          performanceScore: this.calculatePerformanceScore(responseTime, model)
        }
      }
    });
  }

  /**
   * 获取替代模型
   * @param {string} currentModel - 当前模型
   * @returns {string} 替代模型
   */
  getAlternativeModel(currentModel) {
    return currentModel === 'gemini-2.5-pro'
      ? 'gemini-2.5-flash'
      : 'gemini-2.5-pro';
  }

  /**
   * 计算性能评分
   * @param {number} responseTime - 响应时间
   * @param {string} model - 模型名称
   * @returns {number} 性能评分 (0-100)
   */
  calculatePerformanceScore(responseTime, model) {
    const config = this.getModelConfig(model);
    if (!config) return 50;

    const avgTime = config.characteristics.responseTime.avg;
    const score = Math.max(0, Math.min(100, 100 * (avgTime / responseTime)));

    return Math.round(score);
  }

  /**
   * 生成模拟响应（用于演示）
   * @param {string} prompt - 提示词
   * @returns {string} 模拟响应
   */
  generateMockResponse(prompt) {
    return `这是针对提示"${prompt.substring(0, 50)}..."的AI生成响应。在实际应用中，这里将是真实AI模型的结果。`;
  }

  /**
   * 休眠函数
   * @param {number} ms - 休眠时间（毫秒）
   * @returns {Promise} Promise对象
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取性能统计信息
   * @returns {Object} 性能统计
   */
  getPerformanceStats() {
    return {
      cacheSize: this.requestCache.size,
      recentMetrics: this.performanceMonitor.getRecentData(300000),
      alerts: this.performanceMonitor.checkThresholds()
    };
  }
}

// 创建中间件实例
const aiOptimizationMiddleware = new AIOptimizationMiddleware();

// Express中间件函数
function aiOptimizationHandler(req, res, next) {
  return aiOptimizationMiddleware.handleAIRequest(req, res, next);
}

// 性能监控端点
function performanceStatsHandler(req, res) {
  const stats = aiOptimizationMiddleware.getPerformanceStats();
  res.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  AIOptimizationMiddleware,
  aiOptimizationHandler,
  performanceStatsHandler,
  aiOptimizationMiddleware: aiOptimizationMiddleware
};