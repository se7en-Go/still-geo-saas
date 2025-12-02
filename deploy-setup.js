#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 开始配置 GEO 优化项目部署到 Railway...\n');

// 1. 创建 .env.production 文件模板
const envTemplate = `# Railway 生产环境配置
NODE_ENV=production
PORT=65535

# 数据库配置 (Railway 会自动提供)
DATABASE_URL=
POSTGRES_HOST=
POSTGRES_PORT=
POSTGRES_DB=
POSTGRES_USER=
POSTGRES_PASSWORD=

# Redis 配置 (Railway 会自动提供)
REDIS_URL=
REDIS_HOST=
REDIS_PORT=

# JWT 配置
JWT_SECRET=
JWT_EXPIRES_IN=7d

# AI 服务配置
AI_API_KEY=
AI_MODEL=deepseek-chat

# OCR 配置
OCR_API_KEY=

# 文件上传配置
UPLOAD_DIR=/app/uploads
MAX_FILE_SIZE=10485760

# 其他配置
ALLOW_USER_REGISTRATION=false
CORS_ORIGIN=*`;

// 2. 创建部署脚本
const deployScript = `#!/bin/bash

echo "🚀 开始部署 GEO 优化项目到 Railway..."

# 初始化 Railway 项目
echo "📝 初始化 Railway 项目..."
railway init --name "geo-optimization-platform"

# 添加 PostgreSQL 数据库
echo "🐘 添加 PostgreSQL 数据库..."
railway add postgres

# 添加 Redis 数据库
echo "🔴 添加 Redis 数据库..."
railway add redis

# 设置环境变量
echo "⚙️ 配置环境变量..."
railway variables set NODE_ENV=production
railway variables set PORT=65535
railway variables set ALLOW_USER_REGISTRATION=false
railway variables set JWT_EXPIRES_IN=7d

# 部署项目
echo "🚀 部署到 Railway..."
railway up

echo "✅ 部署完成！"
echo "🌐 项目将在以下地址可访问:"
railway domains
`;

// 写入文件
fs.writeFileSync(path.join(__dirname, '.env.production'), envTemplate);
fs.writeFileSync(path.join(__dirname, 'deploy.sh'), deployScript);

console.log('✅ 配置文件已创建:');
console.log('  - .env.production (环境变量模板)');
console.log('  - deploy.sh (部署脚本)');
console.log('\n📋 下一步步骤:');
console.log('  1. 在命令行中运行: bash deploy.sh');
console.log('  2. 或手动执行以下命令:');
console.log('     railway init --name "geo-optimization-platform"');
console.log('     railway add postgres');
console.log('     railway add redis');
console.log('     railway up');

console.log('\n⚠️  重要提醒:');
console.log('  - Railway 会自动提供 DATABASE_URL 和 REDIS_URL');
console.log('  - 你需要在 Railway 控制台配置 AI API 密钥');
console.log('  - 文件上传建议使用 Cloudinary 等云存储服务');