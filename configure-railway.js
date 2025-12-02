#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 配置 GEO 后端部署到 Railway...\n');

// 需要用户提供的配置信息
const requiredConfigs = [
  {
    name: 'NEON_DATABASE_URL',
    description: 'Neon PostgreSQL 数据库连接字符串',
    example: 'postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/dbname'
  },
  {
    name: 'REDIS_URL', 
    description: 'Redis 服务器连接字符串',
    example: 'redis://:password@192.168.1.100:6379'
  },
  {
    name: 'JWT_SECRET',
    description: 'JWT 签名密钥 (建议使用长随机字符串)',
    example: 'your-super-secure-jwt-secret-key-here-minimum-32-characters'
  },
  {
    name: 'AI_API_KEY',
    description: 'AI 服务 API 密钥 (DeepSeek 或其他)',
    example: 'sk-xxx'
  }
];

console.log('📋 请准备以下配置信息:\n');
requiredConfigs.forEach((config, index) => {
  console.log(`${index + 1}. ${config.name}`);
  console.log(`   描述: ${config.description}`);
  console.log(`   示例: ${config.example}\n`);
});

// 创建环境变量设置脚本
const envScript = `#!/bin/bash

echo "🔧 配置 Railway 环境变量..."

# 基础配置
railway variables --set "NODE_ENV=production"
railway variables --set "PORT=65535"
railway variables --set "ALLOW_USER_REGISTRATION=false"
railway variables --set "JWT_EXPIRES_IN=7d"

# 数据库配置 (请替换为你的实际值)
railway variables --set "DATABASE_URL=你的NEON数据库连接字符串"
railway variables --set "REDIS_URL=你的Redis连接字符串"
railway variables --set "JWT_SECRET=你的JWT密钥"

# AI 服务配置
railway variables --set "AI_API_KEY=你的AI密钥"
railway variables --set "AI_MODEL=deepseek-chat"

# 文件上传配置
railway variables --set "UPLOAD_DIR=/app/uploads"
railway variables --set "MAX_FILE_SIZE=10485760"

echo "✅ 环境变量配置完成!"
echo "🚀 现在可以运行: railway up"
`;

// 写入配置文件
fs.writeFileSync(path.join(__dirname, 'set-railway-env.sh'), envScript);

console.log('✅ 配置脚本已创建: set-railway-env.sh\n');

console.log('📝 配置步骤:');
console.log('1. 获取你的 Neon 数据库连接字符串');
console.log('2. 准备好本地 Redis 的连接信息');
console.log('3. 运行: bash set-railway-env.sh');
console.log('4. 手动在 Railway 控制台中设置实际的环境变量值\n');

console.log('💡 获取 Neon 连接字符串:');
console.log('   1. 访问 https://neon.tech/console');
console.log('   2. 选择你的项目');
console.log('   3. 在 Connection Details 中复制连接字符串\n');

console.log('🔗 本地 Redis 连接格式:');
console.log('   redis://:密码@IP地址:端口\n');

console.log('⚠️  安全提醒:');
console.log('   - JWT_SECRET 使用至少32位的随机字符串');
console.log('   - 不要在代码中硬编码敏感信息');
console.log('   - Railway 控制台是设置敏感信息的安全地方\n');

console.log('🚀 配置完成后运行部署:');
console.log('   cd backend');
console.log('   railway up');