#!/usr/bin/env node

/**
 * JWT Secret 安全修复脚本
 * 解决JWT_SECRET配置不一致导致的登录问题
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('🔒 JWT Secret 安全修复工具');
console.log('================================');

// 生成强随机JWT Secret
function generateSecureJWTSecret() {
  return crypto.randomBytes(64).toString('base64');
}

// 备份当前配置
function backupCurrentConfig() {
  const envPath = path.join(__dirname, '../.env');
  const backupPath = path.join(__dirname, '../.env.backup.' + Date.now());

  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, backupPath);
    console.log(`✅ 已备份当前配置到: ${backupPath}`);
    return backupPath;
  }
  return null;
}

// 修复.env文件
function fixEnvFile(newSecret) {
  const envPath = path.join(__dirname, '../.env');

  if (!fs.existsSync(envPath)) {
    console.log('❌ .env文件不存在');
    return false;
  }

  // 读取当前内容
  let content = fs.readFileSync(envPath, 'utf8');

  // 移除所有JWT_SECRET行
  const lines = content.split('\n');
  const filteredLines = lines.filter(line => !line.startsWith('JWT_SECRET='));

  // 在服务器配置部分添加新的JWT_SECRET
  const serverSectionIndex = filteredLines.findIndex(line => line.startsWith('# Server Configuration'));
  if (serverSectionIndex !== -1) {
    filteredLines.splice(serverSectionIndex + 2, 0, `JWT_SECRET=${newSecret}`);
  } else {
    // 如果没找到服务器配置部分，在开头添加
    filteredLines.unshift(`JWT_SECRET=${newSecret}`);
  }

  // 写回文件
  fs.writeFileSync(envPath, filteredLines.join('\n'));
  console.log('✅ 已修复.env文件中的JWT_SECRET配置');

  return true;
}

// 生成生产环境配置
function generateProductionConfig(newSecret) {
  const productionConfig = `# Production Environment Variables for Render Deployment
# JWT Secret 安全修复版本 - ${new Date().toISOString()}

# ===========================================
# PRODUCTION JWT CONFIGURATION (SECURED)
# ===========================================
JWT_SECRET=${newSecret}
JWT_EXPIRY=24h
ALLOW_USER_REGISTRATION=false

# ===========================================
# REDIS CONFIGURATION FOR UPSTASH
# ===========================================
REDIS_URL=redis://default:ATN5AAIncDJlOWY4OGM4ODE4YTQ0MDc4Yjc2Nzc4Yjk2OWRhNTNiYXAyMTMxNzc@smooth-sawfish-13177.upstash.io:6379
REDIS_HOST=smooth-sawfish-13177.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=ATN5AAIncDJlOWY4OGM4ODE4YTQ0MDc4Yjc2Nzc4Yjk2OWRhNTNiYXAyMTMxNzc
REDIS_TLS=true

# ===========================================
# FALLBACK CONFIGURATION
# ===========================================
REDIS_AVAILABLE=true
REDIS_FALLBACK_ENABLED=true

# ===========================================
# CONNECTION SETTINGS
# ===========================================
REDIS_CONNECT_TIMEOUT=60000
REDIS_RETRY_DELAY_ON_FAILOVER=300
REDIS_MAX_RETRIES_PER_REQUEST=3
REDIS_LAZY_CONNECT=true

# ===========================================
# PRODUCTION SETTINGS
# ===========================================
NODE_ENV=production
REDIS_CLOUD_PROVIDER=upstash
PORT=4000

# ===========================================
# DATABASE CONFIGURATION
# ===========================================
DB_USER=neondb_owner
DB_PASSWORD=npg_kMNl9QOit6GF
DB_HOST=ep-floral-lake-a1uuf65r-pooler.ap-southeast-1.aws.neon.tech
DB_PORT=5432
DB_DATABASE=neondb
DB_SSL=true

# ===========================================
# AI SERVICES
# ===========================================
OCR_ENABLED=true
OCR_PROVIDER=deepseek
OCR_BASE_URL=https://api.siliconflow.cn
OCR_API_KEY=sk-liqwafvqmhxntyxerblzxrkudctwqnejaprxybyqlvtldyqo
OCR_MODEL=deepseek-ai/DeepSeek-OCR
OCR_ENDPOINT=/v1/chat/completions
OCR_TIMEOUT_MS=90000

AI_API_BASE_URL=https://smmspvcbawuk.ap-northeast-1.clawcloudrun.com/v1beta
AI_API_KEY=sk-seven
CHAT_COMPLETION_MODEL=gemini-2.5-flash
AI_CHAT_COMPLETION_PATH=models/gemini-2.5-flash:generateContent
AI_USE_RESPONSE_FORMAT=false
AI_PROVIDER=gemini
AI_REQUEST_TIMEOUT_MS=120000

EMBEDDING_API_BASE_URL=https://api.siliconflow.cn
EMBEDDING_API_KEY=sk-liqwafvqmhxntyxerblzxrkudctwqnejaprxybyqlvtldyqo
EMBEDDING_MODEL=BAAI/bge-m3

CONTENT_QUEUE_TIMEOUT_MS=120000`;

  const prodPath = path.join(__dirname, '../.env.production.secure');
  fs.writeFileSync(prodPath, productionConfig);
  console.log('✅ 已生成安全的生产环境配置: .env.production.secure');

  return prodPath;
}

// 验证修复
function validateFix(newSecret) {
  // 检查长度
  if (newSecret.length < 32) {
    console.log('❌ JWT Secret长度不足32字符');
    return false;
  }

  // 检查是否包含默认值
  if (newSecret.includes('your_jwt_secret')) {
    console.log('❌ JWT Secret包含不安全的默认值');
    return false;
  }

  console.log('✅ JWT Secret安全性验证通过');
  return true;
}

// 主修复流程
async function main() {
  try {
    console.log('\n📋 执行安全修复流程...');

    // 1. 生成新的安全Secret
    const newSecret = generateSecureJWTSecret();
    console.log(`🔑 生成新的JWT Secret: ${newSecret.substring(0, 20)}...`);

    // 2. 备份当前配置
    backupCurrentConfig();

    // 3. 验证新Secret
    if (!validateFix(newSecret)) {
      process.exit(1);
    }

    // 4. 修复本地.env文件
    fixEnvFile(newSecret);

    // 5. 生成生产环境配置
    const prodPath = generateProductionConfig(newSecret);

    console.log('\n🎉 JWT Secret安全修复完成!');
    console.log('================================');
    console.log('📋 后续步骤:');
    console.log('1. 将新的JWT_SECRET设置到Render环境变量中');
    console.log(`2. 新的Secret: ${newSecret}`);
    console.log(`3. 生产配置文件: ${prodPath}`);
    console.log('4. 重启所有服务实例');
    console.log('5. 通知用户可能需要重新登录');

  } catch (error) {
    console.error('❌ 修复过程中发生错误:', error.message);
    process.exit(1);
  }
}

// 执行修复
if (require.main === module) {
  main();
}

module.exports = {
  generateSecureJWTSecret,
  backupCurrentConfig,
  fixEnvFile,
  generateProductionConfig,
  validateFix
};