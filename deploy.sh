#!/bin/bash

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
