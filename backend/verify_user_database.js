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

async function verifyDatabase() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(60));
    console.log('🔍 数据库用户账号验证报告');
    console.log('='.repeat(60));
    console.log(`📅 检查时间: ${new Date().toLocaleString('zh-CN')}`);
    console.log(`🎯 目标邮箱: ${TARGET_EMAIL}`);
    console.log('');

    // 1. 检查数据库连接
    console.log('1️⃣ 数据库连接状态');
    console.log('-'.repeat(30));
    const connectionTest = await client.query('SELECT NOW() as current_time, version() as version');
    console.log(`✅ 连接成功`);
    console.log(`📊 数据库时间: ${connectionTest.rows[0].current_time}`);
    console.log(`🔧 PostgreSQL版本: ${connectionTest.rows[0].version.split(' ')[1]}`);
    console.log('');

    // 2. 检查users表结构
    console.log('2️⃣ users表结构分析');
    console.log('-'.repeat(30));
    const tableStructure = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    console.log('📋 表字段:');
    tableStructure.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultValue = col.column_default ? ` DEFAULT ${col.column_default}` : '';
      console.log(`   • ${col.column_name}: ${col.data_type} ${nullable}${defaultValue}`);
    });
    console.log('');

    // 3. 检查索引
    console.log('3️⃣ users表索引分析');
    console.log('-'.repeat(30));
    const indexes = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'users'
      ORDER BY indexname
    `);

    if (indexes.rows.length > 0) {
      console.log('📊 现有索引:');
      indexes.rows.forEach(idx => {
        console.log(`   • ${idx.indexname}`);
        console.log(`     ${idx.indexdef}`);
      });
    } else {
      console.log('⚠️  未找到索引');
    }
    console.log('');

    // 4. 检查目标用户是否存在
    console.log('4️⃣ 用户账号存在性验证');
    console.log('-'.repeat(30));
    const userQuery = await client.query(
      'SELECT id, username, email, role, created_at FROM users WHERE email = $1',
      [TARGET_EMAIL]
    );

    if (userQuery.rows.length === 0) {
      console.log(`❌ 用户 ${TARGET_EMAIL} 不存在于数据库中`);

      // 检查所有用户
      const allUsers = await client.query('SELECT email, username, role, created_at FROM users ORDER BY created_at');
      console.log(`\n📊 数据库中共有 ${allUsers.rows.length} 个用户:`);
      allUsers.rows.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.email} (${user.username}) - ${user.role} - ${user.created_at}`);
      });
    } else {
      const user = userQuery.rows[0];
      console.log(`✅ 找到用户记录:`);
      console.log(`   📧 邮箱: ${user.email}`);
      console.log(`   👤 用户名: ${user.username}`);
      console.log(`   🆔 ID: ${user.id}`);
      console.log(`   🔐 角色: ${user.role}`);
      console.log(`   📅 创建时间: ${user.created_at}`);

      // 5. 检查密码字段
      console.log(`\n5️⃣ 密码字段分析`);
      console.log('-'.repeat(30));
      const passwordQuery = await client.query(
        'SELECT password FROM users WHERE email = $1',
        [TARGET_EMAIL]
      );

      const passwordHash = passwordQuery.rows[0].password;
      console.log(`🔐 密码哈希值: ${passwordHash}`);
      console.log(`📏 哈希长度: ${passwordHash.length} 字符`);

      // 分析bcrypt格式
      if (passwordHash.startsWith('$2b$') || passwordHash.startsWith('$2a$') || passwordHash.startsWith('$2y$')) {
        console.log('✅ 密码使用bcrypt加密');
        const parts = passwordHash.split('$');
        console.log(`🔧 算法版本: $${parts[1]}$`);
        console.log(`🔢 成本因子: ${parts[2]}`);

        // 测试密码验证
        const testPasswords = ['123456', 'admin123', 'password', '12345678'];
        console.log('\n🧪 密码验证测试:');
        for (const testPwd of testPasswords) {
          const isValid = await bcrypt.compare(testPwd, passwordHash);
          console.log(`   • "${testPwd}": ${isValid ? '✅ 匹配' : '❌ 不匹配'}`);
        }
      } else {
        console.log('⚠️  密码未使用标准bcrypt格式');
      }
    }

    // 6. 数据完整性检查
    console.log(`\n6️⃣ 数据完整性检查`);
    console.log('-'.repeat(30));

    // 检查重复邮箱
    const duplicateEmails = await client.query(`
      SELECT email, COUNT(*) as count
      FROM users
      GROUP BY email
      HAVING COUNT(*) > 1
    `);

    if (duplicateEmails.rows.length > 0) {
      console.log('⚠️  发现重复邮箱:');
      duplicateEmails.rows.forEach(dup => {
        console.log(`   • ${dup.email}: ${dup.count} 条记录`);
      });
    } else {
      console.log('✅ 无重复邮箱');
    }

    // 检查重复用户名
    const duplicateUsernames = await client.query(`
      SELECT username, COUNT(*) as count
      FROM users
      GROUP BY username
      HAVING COUNT(*) > 1
    `);

    if (duplicateUsernames.rows.length > 0) {
      console.log('⚠️  发现重复用户名:');
      duplicateUsernames.rows.forEach(dup => {
        console.log(`   • ${dup.username}: ${dup.count} 条记录`);
      });
    } else {
      console.log('✅ 无重复用户名');
    }

    // 7. 性能检查
    console.log(`\n7️⃣ 查询性能分析`);
    console.log('-'.repeat(30));

    const startTime = Date.now();
    const perfTest = await client.query('SELECT COUNT(*) as total_users FROM users');
    const queryTime = Date.now() - startTime;

    console.log(`⚡ 用户总数查询耗时: ${queryTime}ms`);
    console.log(`👥 总用户数: ${perfTest.rows[0].total_users}`);

    // 检查邮箱索引性能
    const emailIndexStart = Date.now();
    const emailSearch = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [TARGET_EMAIL]
    );
    const emailIndexTime = Date.now() - emailIndexStart;

    console.log(`⚡ 邮箱查询耗时: ${emailIndexTime}ms`);
    console.log(`📊 建议在email字段上创建索引以提升查询性能`);

  } catch (error) {
    console.error('❌ 数据库验证失败:', error.message);
    console.error('🔧 错误详情:', error);
  } finally {
    client.release();
    await pool.end();
    console.log('\n' + '='.repeat(60));
    console.log('🏁 数据库验证完成');
    console.log('='.repeat(60));
  }
}

// 运行验证
verifyDatabase().catch(console.error);