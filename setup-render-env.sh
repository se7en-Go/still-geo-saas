#!/bin/bash

# Render CLI 环境变量配置脚本
# 使用方法: ./setup-render-env.sh <service-id>

SERVICE_ID=${1:-"srv-d4n9l93uibrs73981sn0"}  # 您的 Render 服务 ID

echo "🚀 正在为服务 $SERVICE_ID 配置环境变量..."

# 数据库配置
render secrets set DB_USER="neondb_owner" --service $SERVICE_ID
render secrets set DB_PASSWORD="npg_kMNl9QOit6GF" --service $SERVICE_ID
render secrets set DB_HOST="ep-floral-lake-a1uuf65r-pooler.ap-southeast-1.aws.neon.tech" --service $SERVICE_ID
render secrets set DB_PORT="5432" --service $SERVICE_ID
render secrets set DB_DATABASE="neondb" --service $SERVICE_ID
render secrets set DB_SSL="true" --service $SERVICE_ID

# 服务器配置
render secrets set PORT="4000" --service $SERVICE_ID
render secrets set JWT_SECRET="your_jwt_secret" --service $SERVICE_ID
render secrets set ALLOW_USER_REGISTRATION="false" --service $SERVICE_ID

# OCR 深度搜尋 API 配置
render secrets set OCR_ENABLED="true" --service $SERVICE_ID
render secrets set OCR_PROVIDER="deepseek" --service $SERVICE_ID
render secrets set OCR_BASE_URL="https://api.siliconflow.cn" --service $SERVICE_ID
render secrets set OCR_API_KEY="sk-liqwafvqmhxntyxerblzxrkudctwqnejaprxybyqlvtldyqo" --service $SERVICE_ID
render secrets set OCR_MODEL="deepseek-ai/DeepSeek-OCR" --service $SERVICE_ID
render secrets set OCR_ENDPOINT="/v1/chat/completions" --service $SERVICE_ID
render secrets set OCR_TIMEOUT_MS="90000" --service $SERVICE_ID

# Redis 配置
render secrets set REDIS_URL="redis://default:ATN5AAIncDJlOWY4OGM4ODE4YTQ0MDc4Yjc2Nzc4Yjk2OWRhNTNiYXAyMTMxNzc@smooth-sawfish-13177.upstash.io:6379" --service $SERVICE_ID

# 主要 AI 服务配置
render secrets set AI_API_BASE_URL="https://smmspvcbawuk.ap-northeast-1.clawcloudrun.com/v1beta" --service $SERVICE_ID
render secrets set AI_API_KEY="sk-seven" --service $SERVICE_ID
render secrets set CHAT_COMPLETION_MODEL="gemini-2.5-pro" --service $SERVICE_ID
render secrets set AI_CHAT_COMPLETION_PATH="models/gemini-2.5-pro:generateContent" --service $SERVICE_ID
render secrets set AI_USE_RESPONSE_FORMAT="false" --service $SERVICE_ID
render secrets set AI_PROVIDER="gemini" --service $SERVICE_ID
render secrets set AI_REQUEST_TIMEOUT_MS="120000" --service $SERVICE_ID

# 嵌入服务配置
render secrets set EMBEDDING_API_BASE_URL="https://api.siliconflow.cn" --service $SERVICE_ID
render secrets set EMBEDDING_API_KEY="sk-liqwafvqmhxntyxerblzxrkudctwqnejaprxybyqlvtldyqo" --service $SERVICE_ID
render secrets set EMBEDDING_MODEL="BAAI/bge-m3" --service $SERVICE_ID

# 队列配置
render secrets set CONTENT_QUEUE_TIMEOUT_MS="120000" --service $SERVICE_ID

echo "✅ 所有环境变量已配置完成！"
echo "🔄 请触发重新部署以应用新的环境变量"
echo "💡 您可以在 Render Dashboard 中验证配置"