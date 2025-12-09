require('dotenv').config();
const { Redis } = require('ioredis');

console.log('=== Redis 连接测试 ===');

// 从环境变量读取Redis配置
const REDIS_URL = process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

console.log('Redis配置:');
if (REDIS_URL) {
  console.log('URL:', REDIS_URL);
} else {
  console.log('Host:', REDIS_HOST);
  console.log('Port:', REDIS_PORT);
  console.log('Password存在:', !!REDIS_PASSWORD);
}

async function testRedisConnection() {
  let redis;
  try {
    // 创建Redis连接
    if (REDIS_URL) {
      redis = new Redis(REDIS_URL, {
        connectTimeout: 10000,
        lazyConnect: true,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
        family: 4, // 强制使用IPv4
        keepAlive: 30000,
        tls: {}, // Enable TLS for Upstash Redis Cloud
      });
    } else {
      redis = new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        password: REDIS_PASSWORD,
        connectTimeout: 10000,
        lazyConnect: true,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
        family: 4,
        keepAlive: 30000,
      });
    }

    // 监听连接事件
    redis.on('connect', () => {
      console.log('✅ Redis连接成功');
    });

    redis.on('error', (err) => {
      console.error('❌ Redis连接错误:', err.message);
    });

    redis.on('close', () => {
      console.log('Redis连接关闭');
    });

    // 尝试连接
    await redis.connect();

    // 测试基本操作
    const testKey = 'test:connection';
    const testValue = `test-${Date.now()}`;

    await redis.set(testKey, testValue, 'EX', 60); // 设置60秒过期
    const retrievedValue = await redis.get(testKey);

    if (retrievedValue === testValue) {
      console.log('✅ Redis读写测试通过');
    } else {
      console.log('❌ Redis读写测试失败');
      console.log('期望值:', testValue);
      console.log('实际值:', retrievedValue);
    }

    // 检查BullMQ队列相关键
    const queueKeys = await redis.keys('bull:content-generation:*');
    console.log('\n=== BullMQ队列检查 ===');
    if (queueKeys.length > 0) {
      console.log('找到的队列键:', queueKeys);

      // 检查队列状态
      for (const key of queueKeys) {
        const waiting = await redis.lrange(`${key}:waiting`, 0, -1);
        const active = await redis.lrange(`${key}:active`, 0, -1);
        const completed = await redis.lrange(`${key}:completed`, 0, -1);
        const failed = await redis.lrange(`${key}:failed`, 0, -1);

        console.log(`队列 ${key}:`);
        console.log(`  等待中: ${waiting.length} 个任务`);
        console.log(`  进行中: ${active.length} 个任务`);
        console.log(`  已完成: ${completed.length} 个任务`);
        console.log(`  失败: ${failed.length} 个任务`);
      }
    } else {
      console.log('未找到BullMQ队列相关键');
    }

    // 清理测试键
    await redis.del(testKey);

    return { success: true };

  } catch (error) {
    console.error('❌ Redis连接失败');
    console.error('错误详情:', error.message);
    console.error('错误堆栈:', error.stack);
    return { success: false, error: error.message };
  } finally {
    if (redis) {
      await redis.disconnect();
    }
  }
}

// 运行测试
testRedisConnection().then(result => {
  console.log('\n=== 测试结果 ===');
  if (result.success) {
    console.log('✅ Redis连接正常');
  } else {
    console.log('❌ Redis连接失败');
    console.log('🔍 错误原因:', result.error);
  }
  process.exit(result.success ? 0 : 1);
}).catch(err => {
  console.error('Redis测试执行失败:', err);
  process.exit(1);
});