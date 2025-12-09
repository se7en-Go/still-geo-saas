require('dotenv').config();
const db = require('./db');

console.log('=== 表结构检查 ===');

async function checkTableStructure() {
  try {
    console.log('检查 generated_content 表结构...');

    const result = await db.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'generated_content'
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `);

    console.log('generated_content 表字段:');
    result.rows.forEach(row => {
      console.log(`- ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default})`);
    });

    // 检查最近的记录
    console.log('\n=== 最近的内容生成记录 ===');
    const recentContent = await db.query(`
      SELECT id, title, rule_id, created_at
      FROM generated_content
      ORDER BY created_at DESC
      LIMIT 5
    `);

    if (recentContent.rows.length > 0) {
      recentContent.rows.forEach(row => {
        console.log(`ID: ${row.id}, 标题: ${row.title || '无'}, 规则ID: ${row.rule_id}, 创建时间: ${row.created_at}`);
      });
    } else {
      console.log('暂无内容生成记录');
    }

    return { success: true };

  } catch (error) {
    console.error('❌ 表结构检查失败');
    console.error('错误详情:', error.message);
    return { success: false, error: error.message };
  }
}

checkTableStructure().then(result => {
  console.log('\n=== 检查结果 ===');
  if (result.success) {
    console.log('✅ 表结构检查完成');
  } else {
    console.log('❌ 表结构检查失败');
    console.log('🔍 错误原因:', result.error);
  }
  process.exit(result.success ? 0 : 1);
}).catch(err => {
  console.error('表结构检查执行失败:', err);
  process.exit(1);
});