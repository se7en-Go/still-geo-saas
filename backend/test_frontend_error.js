const express = require('express');
const cors = require('cors');

// 模拟前端错误的Express应用
const app = express();

app.use(cors({
  origin: ['http://localhost:3000', 'https://geo-optimization-frontend-axe0myyxb-se7en7788s-projects.vercel.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-auth-token', 'Authorization'],
  exposedHeaders: ['x-auth-token'],
}));

app.use(express.json());

// 模拟登录端点，返回密码作为错误消息
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  console.log('收到登录请求:', { email, password });

  // 故意返回密码作为错误消息来模拟问题
  res.status(401).json({
    error: password, // 这里是问题所在！
    message: 'Login failed'
  });
});

// 正常的健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = 4001;
app.listen(PORT, () => {
  console.log(`🔍 测试服务器运行在端口 ${PORT}`);
  console.log(`测试URL: http://localhost:${PORT}/api/health`);

  // 立即测试登录请求
  testLogin();
});

async function testLogin() {
  const axios = require('axios');

  console.log('\n🧪 测试模拟的登录错误...');

  try {
    const response = await axios.post(`http://localhost:${PORT}/api/auth/login`, {
      email: 'lml1140490403@163.com',
      password: 'Zwj#1234567890'
    });

    console.log('响应:', response.data);
  } catch (error) {
    if (error.response) {
      console.log('❌ 错误响应:', error.response.data);
      console.log('   状态码:', error.response.status);

      // 模拟前端错误显示
      if (error.response.data.error) {
        console.log('\n💡 前端可能显示的错误消息:', error.response.data.error);
        console.log('   这解释了为什么用户看到"Zwj#1234567890"作为错误消息!');
      }
    }
  }

  setTimeout(() => {
    console.log('\n🔍 分析完成，关闭测试服务器...');
    process.exit(0);
  }, 2000);
}