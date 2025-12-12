#!/usr/bin/env node

require('dotenv').config();
const { contentQueue } = require('./queue-fixed');
const { config } = require('./config');
const logger = require('./logger');

async function testQueueHealth() {
  console.log('🔍 测试队列系统健康状况...\n');

  try {
    // 测试1: 检查队列初始化
    console.log('1. 检查队列初始化状态...');
    if (contentQueue) {
      console.log('   ✅ 队列初始化成功');
    } else {
      console.log('   ❌ 队列初始化失败');
      return false;
    }

    // 测试2: 检查Redis连接
    console.log('2. 检查Redis连接...');
    try {
      const client = contentQueue.client;
      if (client) {
        const pong = await client.ping();
        console.log(`   ✅ Redis连接正常: ${pong}`);
      } else {
        console.log('   ⚠️  Redis客户端未初始化');
      }
    } catch (err) {
      console.log(`   ❌ Redis连接失败: ${err.message}`);
    }

    // 测试3: 检查队列统计
    console.log('3. 检查队列统计...');
    try {
      const counts = await contentQueue.getJobCounts();
      console.log('   📊 队列统计:');
      console.log(`      - 等待中: ${counts.waiting || 0}`);
      console.log(`      - 活跃中: ${counts.active || 0}`);
      console.log(`      - 已完成: ${counts.completed || 0}`);
      console.log(`      - 失败: ${counts.failed || 0}`);
    } catch (err) {
      console.log(`   ❌ 获取队列统计失败: ${err.message}`);
    }

    // 测试4: 检查Worker状态
    console.log('4. 检查Worker状态...');
    try {
      const workers = await contentQueue.getWorkers();
      console.log(`   👷 活跃Worker数量: ${workers.length}`);

      if (workers.length > 0) {
        console.log('   ✅ 有Worker在运行');
      } else {
        console.log('   ⚠️  没有检测到Worker进程');
        console.log('   💡 提示: Worker进程可能需要手动启动');
      }
    } catch (err) {
      console.log(`   ❌ 检查Worker状态失败: ${err.message}`);
    }

    // 测试5: 检查配置一致性
    console.log('5. 检查配置一致性...');
    const configChecks = [
      { key: 'REDIS_URL', name: 'Redis URL' },
      { key: 'AI_API_BASE_URL', name: 'AI API Base URL' },
      { key: 'AI_API_KEY', name: 'AI API Key', hideValue: true },
      { key: 'CHAT_COMPLETION_MODEL', name: 'Chat Model' },
    ];

    configChecks.forEach(({ key, name, hideValue }) => {
      const value = process.env[key];
      if (value) {
        const displayValue = hideValue ? '***已配置***' : value;
        console.log(`   ✅ ${name}: ${displayValue}`);
      } else {
        console.log(`   ❌ ${name}: 未配置`);
      }
    });

    console.log('\n🎯 建议的下一步行动:');
    console.log('1. 如果没有检测到Worker，检查Render控制台的Worker进程状态');
    console.log('2. 访问 /api/health/system 端点检查完整系统健康状态');
    console.log('3. 访问 /api/health/worker 端点检查详细Worker状态');
    console.log('4. 访问 /api/health/ai 端点检查AI服务连接');
    console.log('5. 查看应用日志获取详细的错误信息');

    return true;

  } catch (err) {
    console.error(`❌ 测试失败: ${err.message}`);
    console.error(err.stack);
    return false;
  }
}

async function createTestJob() {
  console.log('\n🧪 创建测试任务...');

  try {
    const testJob = await contentQueue.add('test-job', {
      keyword: '测试内容生成',
      userId: 'test-user',
      testMode: true,
      timestamp: new Date().toISOString(),
    });

    console.log(`   ✅ 测试任务创建成功: ${testJob.id}`);

    // 等待几秒钟检查任务状态
    console.log('   ⏳ 等待任务处理...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 检查任务状态
    const job = await contentQueue.getJob(testJob.id);
    if (job) {
      const state = await job.getState();
      const progress = job.progress;

      console.log(`   📋 任务状态: ${state}`);
      console.log(`   📊 进度: ${JSON.stringify(progress)}`);

      if (state === 'completed') {
        console.log('   🎉 测试任务处理成功！');
      } else if (state === 'failed') {
        console.log('   ❌ 测试任务处理失败');
      } else {
        console.log(`   ⏳ 任务仍在处理中 (${state})`);
      }

      // 清理测试任务
      await job.remove();
      console.log('   🧹 测试任务已清理');
    } else {
      console.log('   ❌ 无法找到测试任务');
    }

  } catch (err) {
    console.error(`❌ 创建测试任务失败: ${err.message}`);
  }
}

async function main() {
  console.log('🚀 GEO SaaS 队列系统诊断工具');
  console.log('=====================================\n');

  const healthOk = await testQueueHealth();

  if (healthOk) {
    console.log('\n✅ 系统健康检查通过，创建测试任务验证功能...');
    await createTestJob();
  } else {
    console.log('\n❌ 系统健康检查失败，请先修复配置问题');
  }

  console.log('\n🏁 诊断完成');
  process.exit(0);
}

// 处理未捕获的异常
process.on('unhandledRejection', (err) => {
  console.error('❌ 未处理的Promise拒绝:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ 未捕获的异常:', err);
  process.exit(1);
});

main();