require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: true,
});

async function testAuth() {
  try {
    console.log('🔍 检查管理员账号...');
    const result = await pool.query(
      'SELECT id, username, email, role, password FROM users WHERE email = $1',
      ['lml1140490403@163.com']
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      console.log('✅ 用户存在:', {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      });
      console.log('🔐 密码哈希长度:', user.password.length);

      // 测试原始密码
      const isValid = await bcrypt.compare('aa10101100', user.password);
      console.log('🔑 原始密码验证结果:', isValid);

      // 测试可能的密码变体
      const testPasswords = ['aa10101100', 'admin123', '123456', 'password'];
      for (const pwd of testPasswords) {
        const valid = await bcrypt.compare(pwd, user.password);
        if (valid) {
          console.log(`✅ 找到正确密码: ${pwd}`);
          break;
        }
      }

    } else {
      console.log('❌ 用户不存在');
    }

    // 检查所有用户
    console.log('\n📋 所有用户列表:');
    const allUsers = await pool.query(
      'SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    console.log('用户数量:', allUsers.rows.length);
    allUsers.rows.forEach(user => {
      console.log(`- ${user.username} (${user.email}) - ${user.role} - 创建时间: ${user.created_at}`);
    });

  } catch (err) {
    console.error('❌ 错误:', err.message);
  } finally {
    await pool.end();
  }
}

testAuth();