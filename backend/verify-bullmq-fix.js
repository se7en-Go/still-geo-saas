
const fs = require('fs');
const path = require('path');

console.log('🔍 验证BullMQ Redis配置修复...');

// 验证 config.js
const configPath = path.join(__dirname, 'config.js');
const configContent = fs.readFileSync(configPath, 'utf8');

if (configContent.includes('maxRetriesPerRequest: null')) {
    console.log('✅ config.js: maxRetriesPerRequest = null ✓');
} else {
    console.log('❌ config.js: 配置不正确');
}

// 验证 queue-fixed.js
const queuePath = path.join(__dirname, 'queue-fixed.js');
const queueContent = fs.readFileSync(queuePath, 'utf8');

if (queueContent.includes('maxRetriesPerRequest: null')) {
    console.log('✅ queue-fixed.js: maxRetriesPerRequest = null ✓');
} else {
    console.log('❌ queue-fixed.js: 配置不正确');
}

console.log('\n🚀 修复完成！请重启服务并检查Render logs，BullMQ警告应该已消除。');
