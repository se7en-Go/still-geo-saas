require('dotenv').config();
const db = require('./db');

console.log('=== 数据库连接测试 ===');

async function testDatabaseConnection() {
  try {
    console.log('测试数据库连接...');

    // 测试基本连接
    const result = await db.query('SELECT NOW() as current_time, version() as version');
    console.log('✅ 数据库连接成功');
    console.log('当前时间:', result.rows[0].current_time);
    console.log('数据库版本:', result.rows[0].version);

    // 测试内容生成表是否存在
    const tablesResult = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('generated_content', 'generation_rules', 'content_generation_jobs')
    `);

    console.log('\n=== 表结构检查 ===');
    console.log('存在的表:', tablesResult.rows.map(row => row.table_name));

    // 检查是否有内容生成记录
    const contentCount = await db.query('SELECT COUNT(*) as count FROM generated_content');
    const rulesCount = await db.query('SELECT COUNT(*) as count FROM generation_rules');

    console.log('内容生成记录数:', contentCount.rows[0].count);
    console.log('生成规则数:', rulesCount.rows[0].count);

    // 检查最近的错误日志
    console.log('\n=== 最近的内容生成记录 ===');
    const recentContent = await db.query(`
      SELECT id, title, rule_id, created_at, fallback_reason
      FROM generated_content
      ORDER BY created_at DESC
      LIMIT 5
    `);

    if (recentContent.rows.length > 0) {
      recentContent.rows.forEach(row => {
        console.log(`ID: ${row.id}, 标题: ${row.title || '无'}, 规则ID: ${row.rule_id}, 创建时间: ${row.created_at}`);
        if (row.fallback_reason) {
          console.log(`  ⚠️  备用原因: ${row.fallback_reason}`);
        }
      });
    } else {
      console.log('暂无内容生成记录');
    }

    return { success: true };

  } catch (error) {
    console.error('❌ 数据库连接失败');
    console.error('错误详情:', error.message);
    console.error('错误堆栈:', error.stack);
    return { success: false, error: error.message };
  }
}

// 运行测试
testDatabaseConnection().then(result => {
  console.log('\n=== 测试结果 ===');
  if (result.success) {
    console.log('✅ 数据库连接和表结构正常');
  } else {
    console.log('❌ 数据库测试失败');
    console.log('🔍 错误原因:', result.error);
  }
  process.exit(result.success ? 0 : 1);
}).catch(err => {
  console.error('数据库测试执行失败:', err);
  process.exit(1);
});