require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const logger = require('./logger');

// 重置管理员密码的脚本
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: true,
});

const resetAdminPassword = async () => {
  const client = await pool.connect();
  try {
    // 新的管理员密码
    const newPassword = 'admin123456';

    // 哈希新密码
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 更新密码
    const result = await client.query(
      'UPDATE users SET password = $1 WHERE email = $2 RETURNING id, username, email, role',
      [hashedPassword, 'lml1140490403@163.com']
    );

    if (result.rows.length > 0) {
      logger.info('管理员密码重置成功', { user: result.rows[0] });
      console.log('✅ 管理员密码重置成功');
      console.log('📧 邮箱: lml1140490403@163.com');
      console.log('🔑 新密码: admin123456');
      console.log('👤 用户名: seven');
      console.log('🎭 角色: admin');
    } else {
      console.log('❌ 未找到管理员账号');
    }

    // 验证新密码
    const verifyResult = await client.query(
      'SELECT password FROM users WHERE email = $1',
      ['lml1140490403@163.com']
    );

    if (verifyResult.rows.length > 0) {
      const isValid = await bcrypt.compare(newPassword, verifyResult.rows[0].password);
      console.log('🔐 新密码验证结果:', isValid ? '✅ 有效' : '❌ 无效');
    }

  } catch (err) {
    logger.error('重置管理员密码失败', { error: err.message });
    console.error('❌ 错误:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
};

resetAdminPassword();