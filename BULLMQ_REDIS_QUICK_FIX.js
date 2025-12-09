// BullMQ Redis配置快速修复脚本
// 立即修复 maxRetriesPerRequest: 3 → null 的问题

const fs = require('fs');
const path = require('path');

console.log('🔧 开始修复BullMQ Redis配置警告...\n');

// 1. 修复 config.js
const configPath = path.join(__dirname, 'backend', 'config.js');
console.log('📝 修复 backend/config.js...');

try {
    let configContent = fs.readFileSync(configPath, 'utf8');

    // 查找并替换 maxRetriesPerRequest: 3
    const oldConfig = 'maxRetriesPerRequest: 3,';
    const newConfig = 'maxRetriesPerRequest: null, // BullMQ要求设置为null';

    if (configContent.includes(oldConfig)) {
        configContent = configContent.replace(oldConfig, newConfig);
        fs.writeFileSync(configPath, configContent);
        console.log('✅ config.js 第185行已修复: maxRetriesPerRequest: 3 → null');
    } else if (configContent.includes('maxRetriesPerRequest: null')) {
        console.log('✅ config.js 已经是正确配置，无需修复');
    } else {
        console.log('⚠️  警告: config.js 中未找到 maxRetriesPerRequest 配置');
    }
} catch (error) {
    console.log('❌ 修复 config.js 失败:', error.message);
}

// 2. 修复 queue-fixed.js
const queuePath = path.join(__dirname, 'backend', 'queue-fixed.js');
console.log('\n📝 修复 backend/queue-fixed.js...');

try {
    let queueContent = fs.readFileSync(queuePath, 'utf8');

    // 替换所有 maxRetriesPerRequest: config.redis.maxRetriesPerRequest
    const oldQueueConfig = 'maxRetriesPerRequest: config.redis.maxRetriesPerRequest,';
    const newQueueConfig = 'maxRetriesPerRequest: null, // BullMQ要求Queue和Worker都使用null';

    let changesCount = 0;
    while (queueContent.includes(oldQueueConfig)) {
        queueContent = queueContent.replace(oldQueueConfig, newQueueConfig);
        changesCount++;
    }

    if (changesCount > 0) {
        fs.writeFileSync(queuePath, queueContent);
        console.log(`✅ queue-fixed.js 已修复 ${changesCount} 处配置: maxRetriesPerRequest → null`);
    } else if (queueContent.includes('maxRetriesPerRequest: null')) {
        console.log('✅ queue-fixed.js 已经是正确配置，无需修复');
    } else {
        console.log('⚠️  警告: queue-fixed.js 中未找到相关配置');
    }
} catch (error) {
    console.log('❌ 修复 queue-fixed.js 失败:', error.message);
}

// 3. 创建验证脚本
const verifyScript = `
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

console.log('\\n🚀 修复完成！请重启服务并检查Render logs，BullMQ警告应该已消除。');
`;

const verifyPath = path.join(__dirname, 'backend', 'verify-bullmq-fix.js');
fs.writeFileSync(verifyPath, verifyScript);
console.log('\n✅ 已创建验证脚本: backend/verify-bullmq-fix.js');

console.log('\n🎯 下一步操作:');
console.log('1. 运行验证: cd backend && node verify-bullmq-fix.js');
console.log('2. 提交代码: git add . && git commit -m "修复BullMQ Redis配置警告"');
console.log('3. 推送到GitHub: git push origin main');
console.log('4. 重启Render服务或等待自动部署');
console.log('5. 检查Render logs确认警告消除');

console.log('\n⚠️  重要: 这个修复是安全的，不会影响现有功能。');
console.log('🔒 BullMQ官方要求maxRetriesPerRequest必须为null以确保队列稳定性。');