const { contentQueue } = require('./queue-fixed');
const { Worker } = require('bullmq');
const { config } = require('./config');
const logger = require('./logger');

async function diagnoseQueueSystem() {
  console.log('🔍 诊断队列系统状态...\n');

  try {
    // 1. 检查队列状态
    console.log('📋 队列状态:');
    if (contentQueue) {
      const counts = await contentQueue.getJobCounts();
      console.log('  ✅ 队列已连接');
      console.log(`  📊 任务统计: ${JSON.stringify(counts)}`);

      const workers = await contentQueue.getWorkers();
      console.log(`  👷 Worker数量: ${workers.length}`);
    } else {
      console.log('  ❌ 队列未连接');
    }

    // 2. 检查Worker状态
    console.log('\n👷 Worker状态:');

    // 创建与worker相同的连接配置
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

    const connection = createWorkerConnection();

    if (connection) {
      const testWorker = new Worker('content-generation', async () => {}, {
        connection,
        concurrency: 1
      });

      testWorker.on('ready', () => {
        console.log('  ✅ Worker可以连接到Redis');
        testWorker.close();
      });

      testWorker.on('error', (err) => {
        console.log(`  ❌ Worker连接失败: ${err.message}`);
        testWorker.close();
      });

      // 3秒后强制关闭
      setTimeout(() => {
        testWorker.close();
      }, 3000);
    } else {
      console.log('  ⚠️  使用内存队列模式（Redis不可用）');
    }

    // 3. 环境配置检查
    console.log('\n⚙️  环境配置:');
    console.log(`  NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`  REDIS_URL: ${process.env.REDIS_URL ? '已配置' : '未配置'}`);
    console.log(`  AI_PROVIDER: ${process.env.AI_PROVIDER || '未配置'}`);
    console.log(`  AI_BASE_URL: ${process.env.AI_BASE_URL || '未配置'}`);
    console.log(`  REDIS_AVAILABLE: ${process.env.REDIS_AVAILABLE || '未设置'}`);

  } catch (error) {
    console.error('❌ 诊断失败:', error.message);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  diagnoseQueueSystem();
}

module.exports = { diagnoseQueueSystem };