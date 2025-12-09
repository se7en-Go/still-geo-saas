require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { config } = require('./config');

const testAuth = async () => {
  console.log('🔍 认证系统诊断测试');
  console.log('==================');

  // 1. 检查环境变量
  console.log('\n📋 环境变量检查:');
  console.log('JWT_SECRET:', config.auth.jwtSecret ? '✅ 已设置' : '❌ 未设置');
  console.log('JWT_EXPIRY:', config.auth.jwtExpiry);
  console.log('ALLOW_USER_REGISTRATION:', config.auth.allowRegistration);

  // 2. 测试密码哈希
  console.log('\n🔐 密码哈希测试:');
  const testPassword = 'Zwj#1234567890';
  const hash = await bcrypt.hash(testPassword, 10);
  console.log('原密码:', testPassword);
  console.log('哈希值:', hash);

  const isMatch = await bcrypt.compare(testPassword, hash);
  console.log('密码验证:', isMatch ? '✅ 成功' : '❌ 失败');

  // 3. 测试JWT token
  console.log('\n🎫 JWT Token测试:');
  const payload = {
    user: {
      id: 1,
      username: 'seven',
      role: 'admin',
    },
  };

  try {
    const token = jwt.sign(payload, config.auth.jwtSecret, {
      expiresIn: config.auth.jwtExpiry,
    });
    console.log('Token生成: ✅ 成功');
    console.log('Token前缀:', token.substring(0, 50) + '...');

    const decoded = jwt.verify(token, config.auth.jwtSecret);
    console.log('Token验证: ✅ 成功');
    console.log('解码内容:', JSON.stringify(decoded, null, 2));
  } catch (error) {
    console.log('Token测试: ❌ 失败 -', error.message);
  }

  // 4. 数据库连接测试
  console.log('\n🗄️ 数据库连接测试:');
  const { Pool } = require('pg');
  const pool = new Pool({
    user: config.db.user,
    host: config.db.host,
    database: config.db.database,
    password: config.db.password,
    port: config.db.port,
    ssl: config.db.ssl === false ? false : { rejectUnauthorized: false },
  });

  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM users');
    console.log('数据库连接: ✅ 成功');
    console.log('用户数量:', result.rows[0].count);

    // 检查admin用户
    const adminResult = await pool.query('SELECT id, username, email, role FROM users WHERE email = $1', ['lml1140490403@163.com']);
    if (adminResult.rows.length > 0) {
      console.log('Admin用户: ✅ 存在');
      console.log('用户信息:', adminResult.rows[0]);
    } else {
      console.log('Admin用户: ❌ 不存在');
    }
  } catch (error) {
    console.log('数据库连接: ❌ 失败 -', error.message);
  } finally {
    await pool.end();
  }
};

testAuth().catch(console.error);