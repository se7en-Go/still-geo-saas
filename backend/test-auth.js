/**
 * 认证系统测试脚本
 * 测试完整的认证流程
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');
const { config } = require('./config');

const API_BASE = 'http://localhost:4000/api';

async function testAuthFlow() {
  console.log('🔐 认证系统测试开始\n');

  try {
    // 1. 测试健康检查
    console.log('1️⃣ 测试服务器连接...');
    const healthResponse = await axios.get(`${API_BASE}/health`);
    console.log('✅ 服务器连接正常:', healthResponse.data.status);

    // 2. 测试登录
    console.log('\n2️⃣ 测试用户登录...');
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });

    const { token, user } = loginResponse.data;
    console.log('✅ 登录成功');
    console.log('用户信息:', JSON.stringify(user, null, 2));
    console.log('Token长度:', token.length);

    // 3. 分析JWT token
    console.log('\n3️⃣ 分析JWT Token...');
    try {
      const decoded = jwt.verify(token, config.auth.jwtSecret);
      console.log('✅ Token验证成功');
      console.log('解码结果:', JSON.stringify(decoded, null, 2));
    } catch (jwtError) {
      console.log('❌ Token验证失败:', jwtError.message);
    }

    // 4. 测试受保护的API端点
    console.log('\n4️⃣ 测试受保护的API端点...');
    const protectedResponse = await axios.get(`${API_BASE}/auth/me`, {
      headers: { 'x-auth-token': token }
    });
    console.log('✅ 受保护端点访问成功');
    console.log('用户数据:', JSON.stringify(protectedResponse.data, null, 2));

    // 5. 测试无效token
    console.log('\n5️⃣ 测试无效token...');
    try {
      await axios.get(`${API_BASE}/auth/me`, {
        headers: { 'x-auth-token': 'invalid-token' }
      });
      console.log('❌ 无效token测试失败 - 应该返回401');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ 无效token正确被拒绝');
      } else {
        console.log('❌ 无效token处理异常:', error.message);
      }
    }

    // 6. 测试无token访问
    console.log('\n6️⃣ 测试无token访问...');
    try {
      await axios.get(`${API_BASE}/auth/me`);
      console.log('❌ 无token测试失败 - 应该返回401');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ 无token正确被拒绝');
      } else {
        console.log('❌ 无token处理异常:', error.message);
      }
    }

    console.log('\n🎉 所有认证测试完成！');

  } catch (error) {
    console.error('\n❌ 测试过程中出现错误:');
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应数据:', error.response.data);
    } else if (error.request) {
      console.error('网络错误:', error.message);
    } else {
      console.error('其他错误:', error.message);
    }
  }
}

// 测试CORS配置
async function testCORS() {
  console.log('\n🌐 CORS配置测试\n');

  const testOrigin = 'https://geo-optimization-frontend-axe0myyxb-se7en7788s-projects.vercel.app';

  try {
    const response = await axios.options(`${API_BASE}/auth/me`, {
      headers: {
        'Origin': testOrigin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'x-auth-token'
      }
    });

    console.log('✅ CORS预检请求成功');
    console.log('Access-Control-Allow-Origin:', response.headers['access-control-allow-origin']);
    console.log('Access-Control-Allow-Methods:', response.headers['access-control-allow-methods']);
    console.log('Access-Control-Allow-Headers:', response.headers['access-control-allow-headers']);

  } catch (error) {
    console.log('❌ CORS预检请求失败:');
    if (error.response) {
      console.log('状态码:', error.response.status);
      console.log('响应头:', error.response.headers);
    }
  }
}

// 主函数
async function main() {
  await testAuthFlow();
  await testCORS();
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testAuthFlow, testCORS };