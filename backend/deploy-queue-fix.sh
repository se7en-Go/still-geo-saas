#!/bin/bash

# GEO SaaS 队列修复部署脚本
# 用于部署内容生成队列修复到Render生产环境

set -e  # 遇到错误立即退出

echo "🚀 开始部署GEO SaaS队列修复..."
echo "================================="

# 检查必要的环境变量
echo "1. 检查环境配置..."
if [ -z "$RENDER_SERVICE_NAME" ]; then
    echo "⚠️  RENDER_SERVICE_NAME 未设置，使用默认值"
    export RENDER_SERVICE_NAME="geo-backend"
fi

if [ -z "$RENDER_SERVICE_ID" ]; then
    echo "❌ RENDER_SERVICE_ID 未设置"
    echo "请设置Render服务的ID"
    exit 1
fi

# 验证关键文件存在
echo "2. 验证修复文件..."
REQUIRED_FILES=(
    "worker.js"
    "queue-fixed.js"
    "routes/health.js"
    "app.js"
    "test-queue-fix.js"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file 存在"
    else
        echo "   ❌ $file 缺失"
        exit 1
    fi
done

# 检查Git状态
echo "3. 检查Git状态..."
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ 不在Git仓库中"
    exit 1
fi

# 添加修改的文件到Git
echo "4. 提交代码更改..."
git add worker.js
git add routes/health.js
git add app.js
git add test-queue-fix.js
git add openspec/changes/fix-content-generation-queue/

# 检查是否有待提交的更改
if git diff --staged --quiet; then
    echo "ℹ️  没有新的更改需要提交"
else
    echo "📝 提交修复代码..."
    git commit -m "🔧 修复内容生成队列处理问题

- 统一worker.js和queue-fixed.js的Redis连接配置
- 增强Worker错误处理和启动验证
- 添加AI服务重试机制和指数退避
- 实现全面的健康检查端点 (/api/health/*)
- 改进错误日志和调试信息
- 添加队列系统诊断测试工具

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"
fi

# 推送到远程仓库
echo "5. 推送到远程仓库..."
git push origin main

# 验证推送成功
if [ $? -eq 0 ]; then
    echo "   ✅ 代码推送成功"
else
    echo "   ❌ 代码推送失败"
    exit 1
fi

echo ""
echo "🎯 部署后的验证步骤:"
echo "1. 在Render控制台检查部署状态"
echo "2. 等待部署完成后，运行健康检查:"
echo "   curl https://your-render-url/api/health/system"
echo "3. 检查Worker状态:"
echo "   curl https://your-render-url/api/health/worker"
echo "4. 验证AI服务连接:"
echo "   curl https://your-render-url/api/health/ai"
echo "5. 测试内容生成功能"
echo ""

echo "🔗 有用的链接:"
echo "- Render Dashboard: https://dashboard.render.com"
echo "- 服务日志: https://dashboard.render.com/web/$RENDER_SERVICE_ID/logs"
echo "- 服务指标: https://dashboard.render.com/web/$RENDER_SERVICE_ID/metrics"
echo ""

echo "📋 修复总结:"
echo "✅ 统一队列配置"
echo "✅ 增强错误处理"
echo "✅ 添加重试机制"
echo "✅ 实现健康检查"
echo "✅ 改进监控能力"
echo ""

echo "⏳ 等待Render部署完成..."
echo "部署通常需要2-5分钟。请检查Render控制台确认部署状态。"

echo ""
echo "🚀 部署命令执行完成！"
echo "================================="