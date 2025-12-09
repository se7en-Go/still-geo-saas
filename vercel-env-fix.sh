#!/bin/bash

# 设置 Vercel 环境变量脚本
echo "🚀 正在为 Vercel 项目设置环境变量..."

# 设置 API 端点
vercel env add REACT_APP_API_BASE_URL production
# 当提示输入值时，输入: https://geo-backend-vp34.onrender.com/api

# 重新部署
vercel --prod

echo "✅ 环境变量设置完成，正在重新部署..."
echo "🔄 部署完成后，请测试登录功能"