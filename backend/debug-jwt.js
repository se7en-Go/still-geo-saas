/**
 * JWT调试工具
 * 用于分析和验证JWT token
 */

const jwt = require('jsonwebtoken');
const { config } = require('./config');

console.log('=== JWT Debug Tool ===');
console.log('JWT Secret:', config.auth.jwtSecret ? '已配置' : '未配置');
console.log('JWT Expiry:', config.auth.jwtExpiry);

// 测试token生成和验证
function testJWTFlow() {
  console.log('\n=== 测试JWT流程 ===');

  try {
    // 生成测试token
    const testPayload = {
      user: {
        id: 1,
        username: 'testuser',
        role: 'admin'
      }
    };

    const testToken = jwt.sign(testPayload, config.auth.jwtSecret, {
      expiresIn: config.auth.jwtExpiry
    });

    console.log('✅ Token生成成功');
    console.log('Token长度:', testToken.length);
    console.log('Token前缀:', testToken.substring(0, 50) + '...');

    // 验证token
    const decoded = jwt.verify(testToken, config.auth.jwtSecret);
    console.log('✅ Token验证成功');
    console.log('解码结果:', JSON.stringify(decoded, null, 2));

    return testToken;
  } catch (error) {
    console.error('❌ JWT流程测试失败:', error.message);
    return null;
  }
}

// 分析传入的token
function analyzeToken(token) {
  if (!token) {
    console.log('\n❌ 没有提供token进行分析');
    return;
  }

  console.log('\n=== Token分析 ===');
  console.log('Token长度:', token.length);
  console.log('Token格式:', token.split('.').length === 3 ? '✅ 正确JWT格式' : '❌ 无效JWT格式');

  try {
    // 解码头部和载荷（不验证签名）
    const [header, payload] = token.split('.');
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64').toString());
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());

    console.log('\n📋 Token头部:', JSON.stringify(decodedHeader, null, 2));
    console.log('\n📋 Token载荷:', JSON.stringify(decodedPayload, null, 2));

    // 检查过期时间
    if (decodedPayload.exp) {
      const now = Math.floor(Date.now() / 1000);
      const isExpired = decodedPayload.exp < now;
      const expiryTime = new Date(decodedPayload.exp * 1000);

      console.log('\n⏰ 过期时间检查:');
      console.log('过期时间:', expiryTime.toISOString());
      console.log('当前时间:', new Date().toISOString());
      console.log('是否过期:', isExpired ? '❌ 已过期' : '✅ 未过期');
    }

    // 验证签名
    try {
      const decoded = jwt.verify(token, config.auth.jwtSecret);
      console.log('\n✅ Token签名验证成功');
      console.log('用户信息:', JSON.stringify(decoded.user, null, 2));
    } catch (verifyError) {
      console.log('\n❌ Token签名验证失败:');
      console.log('错误类型:', verifyError.name);
      console.log('错误信息:', verifyError.message);
    }

  } catch (decodeError) {
    console.log('\n❌ Token解码失败:', decodeError.message);
  }
}

// 主执行流程
function main() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    // 分析传入的token
    const token = args[0];
    analyzeToken(token);
  } else {
    // 生成并分析测试token
    console.log('生成测试token...');
    const testToken = testJWTFlow();

    if (testToken) {
      analyzeToken(testToken);
      console.log('\n🔧 使用方法:');
      console.log('node debug-jwt.js <your-token-here>');
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { testJWTFlow, analyzeToken };