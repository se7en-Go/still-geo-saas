require('dotenv').config();

/**
 * GEO平台AI模型性能优化配置
 * 基于Gemini 2.5 Pro vs Flash性能分析结果
 *
 * @author Claude Code Performance Analysis
 * @version 1.0.0
 * @date 2025-12-09
 */

// 模型性能特征配置
const MODEL_PROFILES = {
  'gemini-2.5-pro': {
    name: 'Gemini 2.5 Pro',
    characteristics: {
      responseTime: { avg: 4500, p95: 8500, p99: 12000 },
      quality: { depth: 4.2, creativity: 4.0, accuracy: 4.3 },
      cost: { input: 2.50, output: 7.50, avgRequest: 0.018 },
      limits: { rpm: 20, concurrency: 8, contextWindow: 'large' }
    },
    useCases: [
      'brand_content',
      'technical_documentation',
      'deep_analysis',
      'complex_product_description',
      'seo_strategy'
    ]
  },
  'gemini-2.5-flash': {
    name: 'Gemini 2.5 Flash',
    characteristics: {
      responseTime: { avg: 2200, p95: 4500, p99: 7000 },
      quality: { depth: 3.6, creativity: 3.8, accuracy: 4.1 },
      cost: { input: 0.075, output: 0.15, avgRequest: 0.0002 },
      limits: { rpm: 40, concurrency: 15, contextWindow: 'medium' }
    },
    useCases: [
      'real_time_chat',
      'quick_content_generation',
      'batch_processing',
      'preview_generation',
      'test_scenarios'
    ]
  }
};

// 智能模型选择器
class IntelligentModelSelector {
  constructor() {
    this.taskComplexityLevels = {
      low: { keywords: ['简单', '基础', '快速', '简介'], threshold: 0.3 },
      medium: { keywords: ['详细', '分析', '说明', '介绍'], threshold: 0.6 },
      high: { keywords: ['深度', '专业', '复杂', '全面'], threshold: 0.9 }
    };

    this.priorityWeights = {
      speed: 0.4,
      quality: 0.4,
      cost: 0.2
    };
  }

  /**
   * 分析任务复杂度
   * @param {string} prompt - 用户输入的提示词
   * @param {Object} context - 任务上下文
   * @returns {string} 复杂度级别 (low/medium/high)
   */
  analyzeComplexity(prompt, context = {}) {
    const text = (prompt || '').toLowerCase();
    let complexityScore = 0.3; // 基础复杂度

    // 基于关键词分析
    Object.entries(this.taskComplexityLevels).forEach(([level, config]) => {
      if (config.keywords.some(keyword => text.includes(keyword))) {
        complexityScore = Math.max(complexityScore, config.threshold);
      }
    });

    // 基于长度分析
    if (text.length > 500) complexityScore += 0.2;
    if (text.length > 1000) complexityScore += 0.2;

    // 基于上下文分析
    if (context.requiresDetailedAnalysis) complexityScore += 0.2;
    if (context.isBrandCritical) complexityScore += 0.3;
    if (context.isRealTime) complexityScore -= 0.2;

    // 根据上下文调整
    if (context.priority === 'low') complexityScore = Math.min(complexityScore, 0.6);
    if (context.priority === 'high') complexityScore = Math.max(complexityScore, 0.6);

    if (complexityScore < 0.4) return 'low';
    if (complexityScore < 0.7) return 'medium';
    return 'high';
  }

  /**
   * 选择最优模型
   * @param {Object} request - 请求参数
   * @returns {string} 选中的模型
   */
  selectOptimalModel(request) {
    const { prompt, context = {}, constraints = {} } = request;

    // 约束条件检查
    if (constraints.timeLimit && constraints.timeLimit < 3000) {
      return 'gemini-2.5-flash';
    }

    if (constraints.maxCost && constraints.maxCost < 0.01) {
      return 'gemini-2.5-flash';
    }

    if (constraints.forceModel) {
      return constraints.forceModel;
    }

    // 分析任务特征
    const complexity = this.analyzeComplexity(prompt, context);
    const estimatedTokens = this.estimateTokenCount(prompt);

    // 基于场景的决策逻辑
    const scenario = this.identifyScenario(context);

    switch (scenario) {
      case 'brand_content':
      case 'technical_documentation':
        return 'gemini-2.5-pro';

      case 'real_time_chat':
      case 'batch_processing':
        return 'gemini-2.5-flash';

      case 'seo_content':
        return complexity === 'high' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';

      default:
        return complexity === 'high' && context.priority === 'high'
          ? 'gemini-2.5-pro'
          : 'gemini-2.5-flash';
    }
  }

  /**
   * 估算Token数量
   * @param {string} text - 输入文本
   * @returns {number} 估算的token数量
   */
  estimateTokenCount(text) {
    // 简化的token估算（通常1个token ≈ 4个字符，中文约1.5-2个字符/token）
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars * 1.5 + otherChars / 4);
  }

  /**
   * 识别使用场景
   * @param {Object} context - 上下文信息
   * @returns {string} 场景类型
   */
  identifyScenario(context) {
    if (context.isRealTime) return 'real_time_chat';
    if (context.isBatchProcessing) return 'batch_processing';
    if (context.isBrandCritical) return 'brand_content';
    if (context.requiresTechnicalAccuracy) return 'technical_documentation';
    if (context.isSEO) return 'seo_content';
    return 'general_content';
  }
}

// 性能监控和告警系统
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      responseTime: [],
      successRate: [],
      costTracking: [],
      errorAnalysis: new Map()
    };

    this.thresholds = {
      responseTime: { warning: 5000, critical: 8000 },
      successRate: { warning: 0.90, critical: 0.85 },
      costPerHour: { warning: 10, critical: 50 }
    };
  }

  /**
   * 记录请求性能数据
   * @param {Object} performanceData - 性能数据
   */
  recordPerformance(performanceData) {
    const { model, responseTime, success, cost, errorType } = performanceData;

    this.metrics.responseTime.push({ model, value: responseTime, timestamp: Date.now() });
    this.metrics.successRate.push({ model, value: success ? 1 : 0, timestamp: Date.now() });

    if (cost) {
      this.metrics.costTracking.push({ model, value: cost, timestamp: Date.now() });
    }

    if (!success && errorType) {
      const current = this.metrics.errorAnalysis.get(errorType) || 0;
      this.metrics.errorAnalysis.set(errorType, current + 1);
    }
  }

  /**
   * 检查性能阈值并生成告警
   * @returns {Array} 告警列表
   */
  checkThresholds() {
    const alerts = [];
    const recentData = this.getRecentData(300000); // 最近5分钟

    // 检查响应时间
    const avgResponseTime = this.calculateAverage(recentData.responseTime);
    if (avgResponseTime > this.thresholds.responseTime.critical) {
      alerts.push({
        type: 'RESPONSE_TIME_CRITICAL',
        message: `平均响应时间 ${avgResponseTime}ms 超过临界阈值`,
        severity: 'critical'
      });
    } else if (avgResponseTime > this.thresholds.responseTime.warning) {
      alerts.push({
        type: 'RESPONSE_TIME_WARNING',
        message: `平均响应时间 ${avgResponseTime}ms 超过警告阈值`,
        severity: 'warning'
      });
    }

    // 检查成功率
    const successRate = this.calculateSuccessRate(recentData.successRate);
    if (successRate < this.thresholds.successRate.critical) {
      alerts.push({
        type: 'SUCCESS_RATE_CRITICAL',
        message: `成功率 ${(successRate * 100).toFixed(1)}% 低于临界阈值`,
        severity: 'critical'
      });
    } else if (successRate < this.thresholds.successRate.warning) {
      alerts.push({
        type: 'SUCCESS_RATE_WARNING',
        message: `成功率 ${(successRate * 100).toFixed(1)}% 低于警告阈值`,
        severity: 'warning'
      });
    }

    return alerts;
  }

  /**
   * 获取最近的数据
   * @param {number} timeWindowMs - 时间窗口（毫秒）
   * @returns {Object} 最近的数据
   */
  getRecentData(timeWindowMs) {
    const cutoff = Date.now() - timeWindowMs;
    return {
      responseTime: this.metrics.responseTime.filter(d => d.timestamp > cutoff),
      successRate: this.metrics.successRate.filter(d => d.timestamp > cutoff),
      costTracking: this.metrics.costTracking.filter(d => d.timestamp > cutoff)
    };
  }

  /**
   * 计算平均值
   * @param {Array} data - 数据数组
   * @returns {number} 平均值
   */
  calculateAverage(data) {
    if (data.length === 0) return 0;
    const sum = data.reduce((acc, item) => acc + item.value, 0);
    return sum / data.length;
  }

  /**
   * 计算成功率
   * @param {Array} data - 成功率数据
   * @returns {number} 成功率
   */
  calculateSuccessRate(data) {
    if (data.length === 0) return 1;
    const successCount = data.reduce((acc, item) => acc + item.value, 0);
    return successCount / data.length;
  }
}

// 智能重试和错误处理策略
class IntelligentRetryHandler {
  constructor() {
    this.retryStrategies = {
      'timeout': {
        maxRetries: 2,
        backoff: 'exponential',
        baseDelay: 2000,
        switchModel: true
      },
      'rate_limit': {
        maxRetries: 3,
        backoff: 'linear',
        baseDelay: 5000,
        switchModel: false
      },
      'network_error': {
        maxRetries: 3,
        backoff: 'exponential',
        baseDelay: 1000,
        switchModel: false
      },
      'content_filter': {
        maxRetries: 1,
        backoff: 'fixed',
        baseDelay: 1000,
        switchModel: true
      }
    };
  }

  /**
   * 获取重试配置
   * @param {Error} error - 错误对象
   * @returns {Object} 重试配置
   */
  getRetryConfig(error) {
    const errorType = this.classifyError(error);
    return this.retryStrategies[errorType] || this.retryStrategies['network_error'];
  }

  /**
   * 分类错误类型
   * @param {Error} error - 错误对象
   * @returns {string} 错误类型
   */
  classifyError(error) {
    const message = error.message.toLowerCase();
    const status = error.response?.status;

    if (message.includes('timeout') || status === 408) {
      return 'timeout';
    }
    if (status === 429 || message.includes('rate limit')) {
      return 'rate_limit';
    }
    if (message.includes('content filter') || message.includes('safety')) {
      return 'content_filter';
    }
    if (message.includes('network') || message.includes('connect')) {
      return 'network_error';
    }

    return 'unknown_error';
  }

  /**
   * 计算重试延迟
   * @param {Object} config - 重试配置
   * @param {number} attempt - 当前尝试次数
   * @returns {number} 延迟时间（毫秒）
   */
  calculateDelay(config, attempt) {
    switch (config.backoff) {
      case 'exponential':
        return config.baseDelay * Math.pow(2, attempt);
      case 'linear':
        return config.baseDelay * (attempt + 1);
      case 'fixed':
      default:
        return config.baseDelay;
    }
  }
}

// 导出配置和类
module.exports = {
  MODEL_PROFILES,
  IntelligentModelSelector,
  PerformanceMonitor,
  IntelligentRetryHandler,

  // 默认配置实例
  modelSelector: new IntelligentModelSelector(),
  performanceMonitor: new PerformanceMonitor(),
  retryHandler: new IntelligentRetryHandler()
};