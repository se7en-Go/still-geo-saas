#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

// 测试配置
const BACKEND_URL = 'https://geo-backend-vp34.onrender.com';
const TEST_USER = {
  email: 'test@example.com',
  password: 'testpassword123'
};

let authToken = null;

// 测试登录获取token
async function login() {
  console.log('🔐 测试用户登录...');

  try {
    const response = await axios.post(`${BACKEND_URL}/api/auth/login`, {
      email: TEST_USER.email,
      password: TEST_USER.password
    });

    if (response.data.token) {
      authToken = response.data.token;
      console.log('✅ 登录成功，获取到token');
      return true;
    } else {
      console.log('❌ 登录失败：未获取到token');
      return false;
    }
  } catch (error) {
    console.log('❌ 登录请求失败:', error.response?.data?.message || error.message);
    return false;
  }
}

// 测试创建内容生成任务
async function testCreateContentJob() {
  console.log('📝 测试创建内容生成任务...');

  try {
    const response = await axios.post(
      `${BACKEND_URL}/api/content/generate`,
      {
        keyword: 'SEO优化策略',
        ruleId: null,
        userId: 'test-user'
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.jobId) {
      console.log(`✅ 任务创建成功，Job ID: ${response.data.jobId}`);
      return response.data.jobId;
    } else {
      console.log('❌ 任务创建失败：未获取到jobId');
      return null;
    }
  } catch (error) {
    console.log('❌ 创建任务请求失败:', error.response?.data?.message || error.message);
    return null;
  }
}

// 监控任务进度
async function monitorJobProgress(jobId, maxAttempts = 12) {
  console.log(`📊 监控任务进度 (Job ID: ${jobId})...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/content/jobs/${jobId}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );

      const job = response.data;
      const progress = job.progress || {};

      console.log(`  尝试 ${attempt}/${maxAttempts}: 状态=${job.state}, 进度=${progress.stage || 'unknown'}(${progress.percent || 0}%)`);

      // 检查是否完成
      if (job.state === 'completed') {
        console.log('🎉 任务完成！');
        if (job.result) {
          console.log(`   - 标题: ${job.result.title || '无标题'}`);
          console.log(`   - 元描述: ${job.result.meta_description || '无描述'}`);
          console.log(`   - 内容长度: ${job.result.body ? job.result.body.length : 0} 字符`);
        }
        return true;
      }

      // 检查是否失败
      if (job.state === 'failed') {
        console.log('❌ 任务失败');
        console.log('   错误信息:', job.error || '未知错误');
        return false;
      }

      // 检查是否卡住（长时间停留在同一状态）
      if (attempt > 3 && job.state === 'waiting' && progress.percent === 10) {
        console.log('⚠️  任务可能卡在10%等待状态');
        console.log('   这是我们正在修复的问题！');

        // 继续等待，但记录状态
        if (attempt === maxAttempts) {
          console.log('❌ 任务在10%卡住，修复可能尚未完全生效');
          return false;
        }
      }

    } catch (error) {
      console.log(`❌ 检查任务进度失败 (尝试 ${attempt}):`, error.response?.data?.message || error.message);
    }

    // 等待10秒再检查
    console.log('   等待10秒...');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  console.log('⏰ 监控超时');
  return false;
}

// 测试系统健康状态
async function testSystemHealth() {
  console.log('🏥 测试系统健康状态...');

  try {
    const response = await axios.get(`${BACKEND_URL}/api/health`);

    if (response.data.status === 'OK') {
      console.log('✅ 基础健康检查正常');
      console.log(`   - 服务: ${response.data.service}`);
      console.log(`   - 时间戳: ${response.data.timestamp}`);
      return true;
    } else {
      console.log('❌ 健康检查异常');
      return false;
    }
  } catch (error) {
    console.log('❌ 健康检查失败:', error.message);
    return false;
  }
}

// 主测试函数
async function runTest() {
  console.log('🧪 GEO SaaS 内容生成修复验证测试');
  console.log('======================================\n');

  // 测试1: 基础健康检查
  const healthOk = await testSystemHealth();
  if (!healthOk) {
    console.log('\n❌ 基础健康检查失败，停止测试');
    return;
  }

  console.log('\n');

  // 测试2: 登录获取token
  const loginOk = await login();
  if (!loginOk) {
    console.log('\n❌ 登录失败，停止测试');
    return;
  }

  console.log('\n');

  // 测试3: 创建内容生成任务
  const jobId = await testCreateContentJob();
  if (!jobId) {
    console.log('\n❌ 创建任务失败，停止测试');
    return;
  }

  console.log('\n');

  // 测试4: 监控任务进度
  const success = await monitorJobProgress(jobId);

  console.log('\n📋 测试总结:');
  if (success) {
    console.log('🎉 测试成功！内容生成功能正常工作');
    console.log('   ✅ 任务能够正常创建和处理');
    console.log('   ✅ 进度能够正常更新');
    console.log('   ✅ AI服务正常响应');
  } else {
    console.log('⚠️  测试发现问题');
    console.log('   🔍 可能原因:');
    console.log('      1. 部署尚未完成');
    console.log('      2. 新的健康检查端点还未生效');
    console.log('      3. 队列修复部分生效但需要更多时间');
    console.log('   💡 建议:');
    console.log('      - 等待部署完全完成');
    console.log('      - 检查Render控制台的部署日志');
    console.log('      - 重试此测试');
  }

  console.log('\n🏁 测试完成');
}

// 错误处理
process.on('unhandledRejection', (err) => {
  console.error('❌ 未处理的Promise拒绝:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ 未捕获的异常:', err);
  process.exit(1);
});

// 运行测试
runTest();