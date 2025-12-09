const axios = require('axios');

async function diagnoseLogin() {
  const API_BASE = 'https://geo-backend-vp34.onrender.com/api';

  console.log('🔍 诊断GEO平台登录问题...');
  console.log('=====================================\n');

  // 1. 测试基本连接
  console.log('1. 测试服务器连接...');
  try {
    const healthResponse = await axios.get(`${API_BASE}/health`, {
      timeout: 10000
    });
    console.log('✅ 服务器连接正常:', healthResponse.data);
  } catch (error) {
    console.log('❌ 服务器连接失败:', error.message);
    if (error.response) {
      console.log('   状态码:', error.response.status);
    }
    return;
  }

  // 2. 测试登录请求
  console.log('\n2. 测试登录请求...');
  const loginData = {
    email: 'lml1140490403@163.com',
    password: 'Zwj#1234567890'
  };

  try {
    console.log('   发送登录请求...');
    console.log('   URL:', `${API_BASE}/auth/login`);
    console.log('   数据:', { email: loginData.email, password: '***' });

    const loginResponse = await axios.post(`${API_BASE}/auth/login`, loginData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log('✅ 登录成功!');
    console.log('   Token:', loginResponse.data.token ? '已生成' : '未生成');
    console.log('   用户信息:', loginResponse.data.user);

  } catch (error) {
    console.log('❌ 登录失败!');

    if (error.response) {
      console.log('   状态码:', error.response.status);
      console.log('   错误信息:', error.response.data);

      // 分析具体错误
      if (error.response.status === 401) {
        if (error.response.data.error === 'Invalid credentials.') {
          console.log('\n🔍 密码验证失败分析:');
          console.log('   - 用户邮箱可能不存在');
          console.log('   - 密码可能不正确');
          console.log('   - 数据库中的密码哈希可能损坏');
        }
      }
    } else if (error.request) {
      console.log('   网络错误 - 请求未到达服务器');
      console.log('   错误:', error.message);
    } else {
      console.log('   请求配置错误:', error.message);
    }
  }

  // 3. 测试CORS
  console.log('\n3. 测试CORS配置...');
  try {
    const corsResponse = await axios.options(`${API_BASE}/auth/login`, {
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      },
      timeout: 10000
    });
    console.log('✅ CORS配置正常');
    if (corsResponse.headers['access-control-allow-origin']) {
      console.log('   允许的源:', corsResponse.headers['access-control-allow-origin']);
    }
  } catch (error) {
    console.log('❌ CORS配置可能有问题:', error.message);
  }

  console.log('\n=====================================');
  console.log('诊断完成');
}

// 运行诊断
diagnoseLogin().catch(console.error);