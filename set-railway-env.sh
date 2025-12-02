#!/bin/bash

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
