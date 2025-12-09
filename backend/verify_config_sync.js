/**
 * GEO平台配置同步验证脚本
 * 用于验证AI_REQUEST_TIMEOUT_MS等关键配置在本地和生产环境的一致性
 */

const fs = require('fs');
const path = require('path');

// 需要验证的关键配置项
const CRITICAL_CONFIGS = [
    'AI_REQUEST_TIMEOUT_MS',
    'CONTENT_QUEUE_TIMEOUT_MS',
    'OCR_TIMEOUT_MS',
    'REDIS_CONNECT_TIMEOUT',
    'JWT_SECRET',
    'NODE_ENV',
    'PORT'
];

// 配置文件路径
const CONFIG_FILES = [
    '.env',
    '.env.production',
    '.env.backup'
];

/**
 * 读取配置文件并解析环境变量
 */
function readConfigFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return { exists: false, config: {} };
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const config = {};

        content.split('\n').forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#') && line.includes('=')) {
                const [key, ...valueParts] = line.split('=');
                config[key.trim()] = valueParts.join('=').trim();
            }
        });

        return { exists: true, config };
    } catch (error) {
        console.error(`❌ 读取文件失败 ${filePath}:`, error.message);
        return { exists: false, config: {}, error: error.message };
    }
}

/**
 * 验证配置值的一致性
 */
function validateConfigConsistency() {
    console.log('🔍 开始验证GEO平台配置一致性...\n');

    const results = {};
    let hasIssues = false;

    // 读取所有配置文件
    const fileConfigs = {};
    CONFIG_FILES.forEach(file => {
        const { exists, config, error } = readConfigFile(file);
        if (exists) {
            fileConfigs[file] = config;
            console.log(`📁 已读取: ${file}`);
        } else {
            console.log(`⚠️  文件不存在: ${file}`);
        }
    });

    // 验证关键配置项
    console.log('\n📋 关键配置项验证:');
    CRITICAL_CONFIGS.forEach(configKey => {
        console.log(`\n🔧 ${configKey}:`);

        const values = {};
        Object.keys(fileConfigs).forEach(file => {
            if (fileConfigs[file][configKey]) {
                values[file] = fileConfigs[file][configKey];
                console.log(`   ${file}: ${fileConfigs[file][configKey]}`);
            }
        });

        // 检查一致性
        const uniqueValues = [...new Set(Object.values(values))];
        if (uniqueValues.length > 1) {
            console.log(`   ⚠️  配置不一致! 发现 ${uniqueValues.length} 个不同值`);
            hasIssues = true;
            results[configKey] = { status: 'inconsistent', values };
        } else if (uniqueValues.length === 1) {
            console.log(`   ✅ 配置一致: ${uniqueValues[0]}`);
            results[configKey] = { status: 'consistent', value: uniqueValues[0] };
        } else {
            console.log(`   ❓ 配置未找到`);
            results[configKey] = { status: 'missing' };
        }
    });

    return { results, hasIssues, fileConfigs };
}

/**
 * 生成配置同步报告
 */
function generateSyncReport(validationResult) {
    const { results, hasIssues, fileConfigs } = validationResult;

    console.log('\n' + '='.repeat(60));
    console.log('📊 GEO平台配置同步报告');
    console.log('='.repeat(60));

    const summary = {
        total: CRITICAL_CONFIGS.length,
        consistent: 0,
        inconsistent: 0,
        missing: 0
    };

    Object.values(results).forEach(result => {
        summary[result.status]++;
    });

    console.log(`\n📈 总体状况:`);
    console.log(`   总配置项: ${summary.total}`);
    console.log(`   ✅ 一致: ${summary.consistent}`);
    console.log(`   ⚠️  不一致: ${summary.inconsistent}`);
    console.log(`   ❓ 缺失: ${summary.missing}`);

    if (hasIssues) {
        console.log('\n🚨 发现配置问题，需要处理:');

        Object.entries(results).forEach(([key, result]) => {
            if (result.status === 'inconsistent') {
                console.log(`\n❌ ${key}:`);
                Object.entries(result.values).forEach(([file, value]) => {
                    console.log(`   ${file}: ${value}`);
                });
                console.log(`   💡 建议: 统一所有配置文件中的值`);
            }
        });
    } else {
        console.log('\n✅ 所有关键配置项都保持一致！');
    }

    // 检查特定的AI_REQUEST_TIMEOUT_MS配置
    console.log('\n🎯 AI_REQUEST_TIMEOUT_MS 专项检查:');
    const timeoutConfig = results['AI_REQUEST_TIMEOUT_MS'];
    if (timeoutConfig && timeoutConfig.status === 'consistent') {
        const timeoutValue = parseInt(timeoutConfig.value);
        if (timeoutValue === 120000) {
            console.log(`   ✅ 配置正确: ${timeoutValue}ms (2分钟)`);
        } else if (timeoutValue < 120000) {
            console.log(`   ⚠️  配置值偏低: ${timeoutValue}ms，建议更新为120000ms`);
        } else {
            console.log(`   ℹ️  配置值较高: ${timeoutValue}ms`);
        }
    } else if (timeoutConfig && timeoutConfig.status === 'inconsistent') {
        console.log(`   ❌ 配置不一致，需要统一为120000ms`);
    } else {
        console.log(`   ❓ 配置缺失，需要设置为120000ms`);
    }

    return { summary, hasIssues };
}

/**
 * 生成修复建议
 */
function generateFixSuggestions(validationResult) {
    const { results, hasIssues } = validationResult;

    if (!hasIssues) {
        console.log('\n🎉 配置完美！无需修复。');
        return;
    }

    console.log('\n🔧 修复建议:');
    console.log('\n1. 📋 更新Render Dashboard (生产环境):');
    console.log('   - 登录Render Dashboard');
    console.log('   - 进入Environment选项卡');
    console.log('   - 更新以下配置:');

    Object.entries(results).forEach(([key, result]) => {
        if (result.status === 'inconsistent' || result.status === 'missing') {
            let suggestedValue = '120000'; // 默认建议值
            if (key.includes('TIMEOUT')) {
                suggestedValue = '120000';
            } else if (key === 'NODE_ENV') {
                suggestedValue = 'production';
            } else if (key === 'PORT') {
                suggestedValue = '4000';
            }
            console.log(`     ${key} = ${suggestedValue}`);
        }
    });

    console.log('\n2. 📁 同步本地配置文件:');
    console.log('   - 更新backend/.env文件');
    console.log('   - 更新backend/.env.production文件');
    console.log('   - 提交到版本控制');

    console.log('\n3. ✅ 验证更新:');
    console.log('   - 重新运行此脚本验证');
    console.log('   - 测试相关功能');
    console.log('   - 监控服务日志');
}

/**
 * 主执行函数
 */
function main() {
    console.log('🚀 GEO平台配置同步验证工具');
    console.log(`📅 执行时间: ${new Date().toLocaleString()}`);

    // 执行验证
    const validationResult = validateConfigConsistency();

    // 生成报告
    const report = generateSyncReport(validationResult);

    // 生成修复建议
    generateFixSuggestions(validationResult);

    // 设置退出码
    if (validationResult.hasIssues) {
        console.log('\n❌ 验证完成，发现配置问题需要修复');
        process.exit(1);
    } else {
        console.log('\n✅ 验证完成，所有配置正常');
        process.exit(0);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = {
    validateConfigConsistency,
    generateSyncReport,
    generateFixSuggestions
};