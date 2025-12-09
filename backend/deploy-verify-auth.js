/**
 * 部署后认证验证脚本
 * 验证生产环境的认证配置
 */

const axios = require('axios');

const PRODUCTION_API = 'https://geo-backend-vp34.onrender.com/api';
const PRODUCTION_FRONTEND = 'https://geo-optimization-frontend-axe0myyxb-se7en7788s-projects.vercel.app';

async function verifyProductionAuth() {
  console.log('🚀 生产环境认证验证开始\n');

  try {
    // 1. 验证后端可访问性
    console.log('1️⃣ 验证后端服务...');
    const healthResponse = await axios.get(`${PRODUCTION_API}/health`);
    console.log('✅ 后端服务正常:', healthResponse.data.status);

    // 2. 验证CORS配置
    console.log('\n2️⃣ 验证CORS配置...');
    const corsResponse = await axios.options(`${PRODUCTION_API}/auth/me`, {
      headers: {
        'Origin': PRODUCTION_FRONTEND,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'x-auth-token'
      }
    });

    const corsOrigin = corsResponse.headers['access-control-allow-origin'];
    if (corsOrigin === PRODUCTION_FRONTEND || corsOrigin === '*') {
      console.log('✅ CORS配置正确:', corsOrigin);
    } else {
      console.log('❌ CORS配置可能有问题:', corsOrigin);
    }

    console.log('允许的方法:', corsResponse.headers['access-control-allow-methods']);
    console.log('允许的头部:', corsResponse.headers['access-control-allow-headers']);

    // 3. 验证登录端点
    console.log('\n3️⃣ 验证登录端点...');
    try {
      const loginResponse = await axios.post(`${PRODUCTION_API}/auth/login`, {
        email: 'admin@example.com',
        password: 'admin123'
      }, {
        timeout: 10000
      });

      const { token, user } = loginResponse.data;
      console.log('✅ 登录功能正常');
      console.log('用户角色:', user.role);

      // 4. 验证token验证
      console.log('\n4️⃣ 验证token验证...');
      try {
        const authResponse = await axios.get(`${PRODUCTION_API}/auth/me`, {
          headers: { 'x-auth-token': token },
          timeout: 10000
        });
        console.log('✅ Token验证正常');
        console.log('用户ID:', authResponse.data.id);
      } catch (authError) {
        console.log('❌ Token验证失败:', authError.response?.data?.error || authError.message);
      }

    } catch (loginError) {
      console.log('❌ 登录失败:', loginError.response?.data?.error || loginError.message);

      if (loginError.response?.status === 401) {
        console.log('💡 提示: 可能需要检查数据库中的用户凭据');
      }
    }

  } catch (error) {
    console.error('\n❌ 验证过程中出现错误:');
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('响应数据:', error.response.data);
    } else if (error.request) {
      console.error('网络连接错误:', error.message);
      console.log('💡 提示: 请检查后端服务是否正在运行');
    } else {
      console.error('其他错误:', error.message);
    }
  }
}

// 验证前端配置
async function verifyFrontendConfig() {
  console.log('\n📱 验证前端配置...');

  try {
    // 检查前端是否能访问
    const frontendResponse = await axios.get(PRODUCTION_FRONTEND, {
      maxRedirects: 0,
      validateStatus: (status) => status < 400
    });
    console.log('✅ 前端服务可访问');

  } catch (frontendError) {
    console.log('❌ 前端访问问题:', frontendError.message);
  }
}

// 生成修复建议
function generateFixSuggestions() {
  console.log('\n🔧 修复建议:');
  console.log('1. 确保后端环境变量JWT_SECRET已正确设置');
  console.log('2. 确保数据库中有有效的用户账户');
  console.log('3. 检查CORS配置是否包含生产域名');
  console.log('4. 验证前端环境变量REACT_APP_API_BASE_URL是否正确');
  console.log('5. 确认部署后重启了后端服务');
}

// 主函数
async function main() {
  await verifyProductionAuth();
  await verifyFrontendConfig();
  generateFixSuggestions();
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { verifyProductionAuth, verifyFrontendConfig };