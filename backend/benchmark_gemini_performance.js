require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 性能基准测试配置
const BENCHMARK_CONFIG = {
  iterations: 50, // 每个模型测试次数
  concurrentRequests: 3, // 并发请求数
  timeoutMs: 120000, // 请求超时时间
  outputDir: './benchmark_results',
  testPrompts: [
    {
      category: '简单问答',
      complexity: 'low',
      prompt: '请简要回答：什么是SEO优化？',
      expectedLength: '50-200字'
    },
    {
      category: '内容创作',
      complexity: 'medium',
      prompt: '请为电商网站写一个关于"冬季护肤品"的产品描述，要求包含功效、适用人群和使用建议。',
      expectedLength: '300-500字'
    },
    {
      category: '技术分析',
      complexity: 'high',
      prompt: '分析React和Vue在前端开发中的优劣势，并给出适用场景建议。要求结构化回答，包含对比表格。',
      expectedLength: '500-800字'
    },
    {
      category: '代码生成',
      complexity: 'high',
      prompt: '请生成一个完整的Node.js Express中间件，用于API请求限流，要求包含注释和错误处理。',
      expectedLength: '代码'
    }
  ]
};

// 模型配置
const MODELS = {
  'gemini-2.5-pro': {
    name: 'Gemini 2.5 Pro',
    path: '/models/gemini-2.5-pro:generateContent',
    expectedCharacteristics: {
      responseTime: 'slower',
      quality: 'higher',
      cost: 'higher'
    }
  },
  'gemini-2.5-flash': {
    name: 'Gemini 2.5 Flash',
    path: '/models/gemini-2.5-flash:generateContent',
    expectedCharacteristics: {
      responseTime: 'faster',
      quality: 'good',
      cost: 'lower'
    }
  }
};

// 创建AI客户端
function createAIClient() {
  return axios.create({
    baseURL: process.env.AI_API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.AI_API_KEY || '',
    },
    params: { key: process.env.AI_API_KEY },
    timeout: BENCHMARK_CONFIG.timeoutMs,
  });
}

// 计算统计指标
function calculateStats(measurements) {
  const sorted = measurements.sort((a, b) => a - b);
  const sum = measurements.reduce((a, b) => a + b, 0);
  const mean = sum / measurements.length;

  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  // 计算标准差
  const variance = measurements.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / measurements.length;
  const stdDev = Math.sqrt(variance);

  return {
    count: measurements.length,
    mean: Math.round(mean),
    min: Math.min(...measurements),
    max: Math.max(...measurements),
    p50: Math.round(p50),
    p95: Math.round(p95),
    p99: Math.round(p99),
    stdDev: Math.round(stdDev)
  };
}

// 分析响应质量
function analyzeResponseQuality(response, expectedLength) {
  const extractedText = extractMessagePayload(response);
  if (!extractedText) {
    return {
      length: 0,
      wordCount: 0,
      coherence: 0,
      relevance: 0,
      formatCorrectness: false,
      quality: 'poor'
    };
  }

  const length = extractedText.length;
  const wordCount = extractedText.split(/\s+/).filter(word => word.length > 0).length;

  // 简单的连贯性评估（检查是否有完整句子）
  const sentences = extractedText.split(/[。！？.!?]/).filter(s => s.trim().length > 0);
  const coherence = sentences.length > 0 ? Math.min(1, sentences.reduce((acc, s) => acc + s.length, 0) / extractedText.length) : 0;

  // 格式正确性（基于Gemini响应结构）
  const formatCorrectness = !!(response.candidates && Array.isArray(response.candidates) && response.candidates.length > 0);

  // 质量评分（综合评估）
  let quality = 'poor';
  if (formatCorrectness && coherence > 0.7 && length > 50) {
    quality = length > 200 ? 'excellent' : 'good';
  } else if (formatCorrectness && coherence > 0.5) {
    quality = 'fair';
  }

  return {
    length,
    wordCount,
    coherence: Math.round(coherence * 100) / 100,
    relevance: Math.min(1, wordCount / 50), // 简化的相关性评分
    formatCorrectness,
    quality
  };
}

// 提取消息内容（复用自test_ai_connection.js）
function extractMessagePayload(data) {
  if (typeof data?.content === 'string' && data.content.trim()) {
    return data.content;
  }
  if (typeof data?.result === 'string' && data.result.trim()) {
    return data.result;
  }
  if (typeof data?.text === 'string' && data.text.trim()) {
    return data.text;
  }
  const openAiStyle = data?.choices?.[0]?.message?.content;
  if (typeof openAiStyle === 'string' && openAiStyle.trim()) {
    return openAiStyle;
  }

  if (Array.isArray(data?.candidates)) {
    const concatenated = data.candidates
      .flatMap((candidate) => candidate?.content?.parts || [])
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();

    if (concatenated) {
      return concatenated;
    }
  }

  return null;
}

// 执行单个请求测试
async function runSingleTest(model, promptData, aiClient) {
  const startTime = Date.now();

  try {
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: promptData.prompt }],
        },
      ],
    };

    const response = await aiClient.post(model.path, payload);
    const endTime = Date.now();

    const responseTime = endTime - startTime;
    const quality = analyzeResponseQuality(response.data, promptData.expectedLength);

    return {
      success: true,
      responseTime,
      quality,
      statusCode: response.status,
      dataSize: JSON.stringify(response.data).length
    };

  } catch (error) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    return {
      success: false,
      responseTime,
      error: error.message,
      statusCode: error.response?.status || null,
      quality: { quality: 'poor' }
    };
  }
}

// 执行并发测试
async function runConcurrentTests(model, promptData, concurrency = 3) {
  const aiClient = createAIClient();
  const promises = [];

  for (let i = 0; i < concurrency; i++) {
    promises.push(runSingleTest(model, promptData, aiClient));
  }

  const results = await Promise.all(promises);
  return results;
}

// 执行完整基准测试
async function runBenchmark() {
  console.log('🚀 开始Gemini模型性能基准测试\n');

  // 确保输出目录存在
  if (!fs.existsSync(BENCHMARK_CONFIG.outputDir)) {
    fs.mkdirSync(BENCHMARK_CONFIG.outputDir, { recursive: true });
  }

  const benchmarkResults = {
    timestamp: new Date().toISOString(),
    config: BENCHMARK_CONFIG,
    results: {}
  };

  // 测试每个模型
  for (const [modelKey, model] of Object.entries(MODELS)) {
    console.log(`📊 测试模型: ${model.name} (${modelKey})`);

    const modelResults = {
      model: modelKey,
      prompts: {}
    };

    // 测试每种类型的提示
    for (const promptData of BENCHMARK_CONFIG.testPrompts) {
      console.log(`  📝 测试场景: ${promptData.category} (${promptData.complexity} complexity)`);

      const promptResults = {
        category: promptData.category,
        complexity: promptData.complexity,
        tests: []
      };

      // 执行多次测试
      for (let i = 0; i < BENCHMARK_CONFIG.iterations; i++) {
        if (i % 10 === 0) {
          console.log(`    进度: ${i}/${BENCHMARK_CONFIG.iterations}`);
        }

        // 每隔几次使用并发测试
        const useConcurrent = i % 5 === 0;
        const concurrency = useConcurrent ? BENCHMARK_CONFIG.concurrentRequests : 1;

        const testResults = await runConcurrentTests(model, promptData, concurrency);

        testResults.forEach((result, index) => {
          promptResults.tests.push({
            iteration: i * concurrency + index,
            ...result,
            concurrent: useConcurrent
          });
        });

        // 避免请求过于频繁
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 计算统计指标
      const successfulTests = promptResults.tests.filter(t => t.success);
      const failedTests = promptResults.tests.filter(t => !t.success);

      const responseTimes = successfulTests.map(t => t.responseTime);
      const responseTimeStats = calculateStats(responseTimes);

      const qualityDistribution = successfulTests.reduce((acc, test) => {
        acc[test.quality.quality] = (acc[test.quality.quality] || 0) + 1;
        return acc;
      }, {});

      modelResults.prompts[promptData.category] = {
        ...promptResults,
        summary: {
          totalTests: promptResults.tests.length,
          successful: successfulTests.length,
          failed: failedTests.length,
          successRate: Math.round((successfulTests.length / promptResults.tests.length) * 100),
          responseTimeStats,
          qualityDistribution,
          averageQuality: Object.keys(qualityDistribution).reduce((acc, quality) => {
            const weights = { excellent: 4, good: 3, fair: 2, poor: 1 };
            return acc + (weights[quality] || 0) * qualityDistribution[quality];
          }, 0) / successfulTests.length
        }
      };
    }

    benchmarkResults.results[modelKey] = modelResults;
    console.log(`  ✅ ${model.name} 测试完成\n`);
  }

  // 保存结果
  const resultFile = path.join(BENCHMARK_CONFIG.outputDir, `gemini_benchmark_${Date.now()}.json`);
  fs.writeFileSync(resultFile, JSON.stringify(benchmarkResults, null, 2));

  console.log(`📄 详细结果已保存到: ${resultFile}`);

  // 生成报告
  generateReport(benchmarkResults);
}

// 生成性能对比报告
function generateReport(results) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 GEMINI模型性能对比报告');
  console.log('='.repeat(80));

  const proResults = results.results['gemini-2.5-pro'];
  const flashResults = results.results['gemini-2.5-flash'];

  if (!proResults || !flashResults) {
    console.log('❌ 缺少完整的测试数据');
    return;
  }

  console.log('\n🎯 总体对比');
  console.log('-'.repeat(40));

  // 计算总体指标
  const calculateOverallStats = (modelResults) => {
    const allTests = Object.values(modelResults.prompts).flatMap(p => p.tests);
    const successful = allTests.filter(t => t.success);
    const responseTimes = successful.map(t => t.responseTime);

    return {
      totalTests: allTests.length,
      successRate: Math.round((successful.length / allTests.length) * 100),
      avgResponseTime: calculateStats(responseTimes),
      qualityScores: successful.map(t => {
        const weights = { excellent: 4, good: 3, fair: 2, poor: 1 };
        return weights[t.quality.quality] || 1;
      })
    };
  };

  const proStats = calculateOverallStats(proResults);
  const flashStats = calculateOverallStats(flashResults);

  console.log(`Gemini 2.5 Pro:`);
  console.log(`  成功率: ${proStats.successRate}%`);
  console.log(`  平均响应时间: ${proStats.avgResponseTime.mean}ms`);
  console.log(`  P95响应时间: ${proStats.avgResponseTime.p95}ms`);
  console.log(`  平均质量评分: ${(proStats.qualityScores.reduce((a,b) => a+b, 0) / proStats.qualityScores.length).toFixed(2)}/4.0`);

  console.log(`\nGemini 2.5 Flash:`);
  console.log(`  成功率: ${flashStats.successRate}%`);
  console.log(`  平均响应时间: ${flashStats.avgResponseTime.mean}ms`);
  console.log(`  P95响应时间: ${flashStats.avgResponseTime.p95}ms`);
  console.log(`  平均质量评分: ${(flashStats.qualityScores.reduce((a,b) => a+b, 0) / flashStats.qualityScores.length).toFixed(2)}/4.0`);

  // 性能提升计算
  const speedImprovement = ((proStats.avgResponseTime.mean - flashStats.avgResponseTime.mean) / proStats.avgResponseTime.mean * 100).toFixed(1);
  const qualityDifference = ((proStats.qualityScores.reduce((a,b) => a+b, 0) / proStats.qualityScores.length) - (flashStats.qualityScores.reduce((a,b) => a+b, 0) / flashStats.qualityScores.length)).toFixed(2);

  console.log(`\n📈 性能对比分析:`);
  console.log(`  响应速度提升: Flash比Pro快 ${speedImprovement}%`);
  console.log(`  质量评分差异: Pro比Flash高 ${qualityDifference} 分`);

  console.log('\n🎯 分类场景对比');
  console.log('-'.repeat(40));

  for (const category of Object.keys(proResults.prompts)) {
    const proCategory = proResults.prompts[category];
    const flashCategory = flashResults.prompts[category];

    console.log(`\n${category}:`);
    console.log(`  Pro  - 成功率: ${proCategory.summary.successRate}%, 平均响应: ${proCategory.summary.responseTimeStats.mean}ms`);
    console.log(`  Flash - 成功率: ${flashCategory.summary.successRate}%, 平均响应: ${flashCategory.summary.responseTimeStats.mean}ms`);
  }

  console.log('\n💡 建议');
  console.log('-'.repeat(40));

  if (parseFloat(speedImprovement) > 20) {
    console.log('✅ Flash模型在响应速度上有显著优势，适合实时应用');
  }

  if (parseFloat(qualityDifference) > 0.5) {
    console.log('✅ Pro模型在内容质量上表现更好，适合高质量内容生成');
  }

  if (proStats.successRate > flashStats.successRate + 5) {
    console.log('⚠️  Pro模型成功率更高，稳定性更好');
  } else if (flashStats.successRate > proStats.successRate + 5) {
    console.log('⚠️  Flash模型成功率更高，稳定性更好');
  }

  console.log('\n🏆 推荐使用场景:');
  console.log('📱 实时聊天、快速响应场景 → 使用 Gemini 2.5 Flash');
  console.log('📝 长文创作、高质量内容 → 使用 Gemini 2.5 Pro');
  console.log('🧪 开发测试、成本敏感场景 → 使用 Gemini 2.5 Flash');
  console.log('🎯 生产环境、质量优先 → 根据具体需求权衡');
}

// 运行基准测试
if (require.main === module) {
  runBenchmark().catch(error => {
    console.error('❌ 基准测试失败:', error.message);
    process.exit(1);
  });
}

module.exports = { runBenchmark, BENCHMARK_CONFIG, MODELS };