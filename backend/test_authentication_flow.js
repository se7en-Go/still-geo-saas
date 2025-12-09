require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Database connection using the same configuration as the app
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const TARGET_EMAIL = 'lml1140490403@163.com';

async function testAuthenticationFlow() {
  const client = await pool.connect();

  try {
    console.log('🔐 用户认证流程测试');
    console.log('='.repeat(50));

    // 1. 获取用户信息
    console.log('\n1️⃣ 获取用户信息...');
    const userResult = await client.query('SELECT * FROM public.users WHERE email = $1', [TARGET_EMAIL]);

    if (userResult.rows.length === 0) {
      console.log('❌ 用户不存在');
      return;
    }

    const user = userResult.rows[0];
    console.log('✅ 用户找到:', {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      created_at: user.created_at
    });

    // 2. 密码验证逻辑测试
    console.log('\n2️⃣ 密码验证逻辑测试...');
    const storedHash = user.password;
    console.log('📋 存储的哈希:', storedHash);

    // 测试常见密码
    const testPasswords = [
      '123456',
      'admin',
      'password',
      'admin123',
      '12345678',
      'seven',
      'seven123',
      'lml1140490403',
      'lml1140490403@163.com',
      'test'
    ];

    console.log('\n🧪 密码匹配测试:');
    let passwordFound = false;
    for (const testPwd of testPasswords) {
      try {
        const isMatch = await bcrypt.compare(testPwd, storedHash);
        console.log(`   • "${testPwd}": ${isMatch ? '✅ 匹配' : '❌ 不匹配'}`);
        if (isMatch) {
          passwordFound = true;
          console.log(`\n🎉 找到匹配密码: "${testPwd}"`);
          break;
        }
      } catch (error) {
        console.log(`   • "${testPwd}": ❌ 验证错误 - ${error.message}`);
      }
    }

    if (!passwordFound) {
      console.log('\n⚠️  未找到匹配的常见密码');
      console.log('💡 建议: 需要通过密码重置功能或查看原始设置来获取正确密码');
    }

    // 3. 模拟完整登录流程
    console.log('\n3️⃣ 模拟登录流程...');

    // 检查用户账号是否被禁用或锁定
    const accountStatus = {
      exists: true,
      isActive: true,  // 假设没有disabled字段
      role: user.role,
      canLogin: user.role === 'admin' || user.role === 'user'
    };

    console.log('📊 账号状态:', accountStatus);

    if (accountStatus.canLogin) {
      console.log('✅ 账号可以登录');
      if (passwordFound) {
        console.log('✅ 登录流程可以成功完成');
      } else {
        console.log('⚠️  登录流程需要正确的密码');
      }
    } else {
      console.log('❌ 账号无权限登录');
    }

    // 4. 密码安全分析
    console.log('\n4️⃣ 密码安全分析...');

    if (storedHash.startsWith('$2b$10$')) {
      console.log('✅ 使用标准bcrypt加密');
      console.log('✅ 成本因子为10 (推荐值)');
      console.log('✅ 加密强度足够');
    } else {
      console.log('⚠️  密码加密格式需要检查');
    }

    // 5. 建议和解决方案
    console.log('\n5️⃣ 建议和解决方案...');

    if (!passwordFound) {
      console.log('🔧 密码重置选项:');
      console.log('   1. 使用应用程序的"忘记密码"功能');
      console.log('   2. 运行 reset_admin_password.js 脚本');
      console.log('   3. 直接在数据库中更新密码哈希');

      // 提供密码重置示例
      console.log('\n📝 密码重置示例:');
      console.log('   新密码: "admin123"');
      const newPasswordHash = await bcrypt.hash('admin123', 10);
      console.log(`   新哈希: ${newPasswordHash}`);

      console.log('\n🔧 SQL更新命令:');
      console.log(`   UPDATE users SET password = '${newPasswordHash}' WHERE email = '${TARGET_EMAIL}';`);
    }

  } catch (error) {
    console.error('❌ 认证测试失败:', error.message);
    console.error('🔧 错误详情:', error);
  } finally {
    client.release();
    await pool.end();
    console.log('\n🏁 认证流程测试完成');
  }
}

// 运行测试
testAuthenticationFlow().catch(console.error);