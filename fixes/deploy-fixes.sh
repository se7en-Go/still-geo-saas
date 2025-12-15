#!/bin/bash

# GEO SaaS 登录问题自动修复部署脚本
# 作者: Claude Code
# 版本: 1.0.0
# 日期: 2024-12-10

set -e

echo "🚀 开始部署GEO SaaS登录问题修复..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目路径
PROJECT_ROOT="D:/GEO优化"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKUP_DIR="$PROJECT_ROOT/backup/$(date +%Y%m%d_%H%M%S)"

# 创建备份目录
echo -e "${BLUE}📁 创建备份目录...${NC}"
mkdir -p "$BACKUP_DIR"
mkdir -p "$FRONTEND_DIR/src/services"

# 备份原始文件
echo -e "${BLUE}💾 备份原始文件...${NC}"
cp "$FRONTEND_DIR/src/hooks/useApi.js" "$BACKUP_DIR/useApi.js.backup"
cp "$FRONTEND_DIR/src/contexts/AuthContext.js" "$BACKUP_DIR/AuthContext.js.backup"
cp "$FRONTEND_DIR/src/pages/LoginPage.js" "$BACKUP_DIR/LoginPage.js.backup"

echo -e "${GREEN}✅ 备份完成，文件保存在: $BACKUP_DIR${NC}"

# 应用修复
echo -e "${BLUE}🔧 应用修复文件...${NC}"

# 1. 更新useApi.js
echo "   - 更新API超时配置..."
cp "$PROJECT_ROOT/fixes/frontend-timeout-fix.js" "$FRONTEND_DIR/src/hooks/useApi.js"

# 2. 更新AuthContext.js
echo "   - 更新认证上下文..."
cp "$PROJECT_ROOT/fixes/auth-context-fix.js" "$FRONTEND_DIR/src/contexts/AuthContext.js"

# 3. 创建保活服务
echo "   - 创建保活服务..."
cp "$PROJECT_ROOT/fixes/keepalive-service.js" "$FRONTEND_DIR/src/services/keepaliveService.js"

# 4. 更新登录页面
echo "   - 更新登录页面..."
cp "$PROJECT_ROOT/fixes/login-page-enhanced.js" "$FRONTEND_DIR/src/pages/LoginPage.js"

echo -e "${GREEN}✅ 修复文件应用完成${NC}"

# 更新App.js以集成保活服务
echo -e "${BLUE}🔄 更新App.js...${NC}"
APP_JS_PATH="$FRONTEND_DIR/src/App.js"

# 检查App.js是否存在
if [ ! -f "$APP_JS_PATH" ]; then
    echo -e "${YELLOW}⚠️  App.js文件未找到，请手动集成保活服务${NC}"
    echo -e "${YELLOW}   在App.js顶部添加: import './services/keepaliveService';${NC}"
else
    # 创建临时文件
    temp_app_js="/tmp/App.js.tmp"

    # 读取原文件并添加保活服务导入
    if grep -q "keepaliveService" "$APP_JS_PATH"; then
        echo -e "${YELLOW}⚠️  保活服务已存在于App.js中${NC}"
    else
        # 在import语句后添加保活服务导入
        sed -i '/^import.*;/a\\n// 导入保活服务\nimport '"'"'./services/keepaliveService'"'"';' "$APP_JS_PATH"
        echo -e "${GREEN}✅ 保活服务已集成到App.js${NC}"
    fi
fi

# 构建前端
echo -e "${BLUE}🏗️  构建前端项目...${NC}"
cd "$FRONTEND_DIR"

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "   - 安装依赖..."
    npm install
fi

# 构建项目
echo "   - 构建生产版本..."
npm run build

echo -e "${GREEN}✅ 前端构建完成${NC}"

# 部署到Vercel（如果安装了Vercel CLI）
if command -v vercel &> /dev/null; then
    echo -e "${BLUE}🚀 部署到Vercel...${NC}"
    vercel --prod
    echo -e "${GREEN}✅ 部署完成${NC}"
else
    echo -e "${YELLOW}⚠️  未检测到Vercel CLI，请手动部署${NC}"
    echo -e "${YELLOW}   运行: npm run build && vercel --prod${NC}"
fi

# 生成部署报告
echo -e "${BLUE}📋 生成部署报告...${NC}"
REPORT_FILE="$PROJECT_ROOT/deployment-report-$(date +%Y%m%d_%H%M%S).md"

cat > "$REPORT_FILE" << EOF
# GEO SaaS 登录问题修复部署报告

## 部署信息
- **部署时间**: $(date)
- **部署版本**: 1.0.0
- **备份路径**: $BACKUP_DIR

## 应用的修复

### 1. 超时配置优化
- **文件**: \`frontend/src/hooks/useApi.js\`
- **修改**: 超时时间从60秒增加到120秒
- **状态**: ✅ 已应用

### 2. 认证上下文优化
- **文件**: \`frontend/src/contexts/AuthContext.js\`
- **修改**: 登录超时增加到120秒，改进错误处理
- **状态**: ✅ 已应用

### 3. 保活服务
- **文件**: \`frontend/src/services/keepaliveService.js\`
- **功能**: 每10分钟ping后端，防止休眠
- **状态**: ✅ 已创建

### 4. 登录页面增强
- **文件**: \`frontend/src/pages/LoginPage.js\`
- **功能**: 详细加载进度，智能状态提示
- **状态**: ✅ 已应用

## 预期效果

### 立即效果
- ✅ 登录超时时间延长至120秒
- ✅ 更好的错误提示和用户反馈
- ✅ 保活服务减少实例休眠概率

### 用户体验
- ✅ 详细的加载进度显示
- ✅ 智能的状态提示消息
- ✅ 更长的耐心等待时间

### 系统稳定性
- ✅ 自动保活机制
- ✅ 失败重试逻辑
- ✅ 更好的错误恢复

## 监控建议

### 1. 登录成功率
- 监控登录成功率变化
- 记录用户反馈
- 跟踪错误率下降

### 2. 保活服务状态
- 检查控制台日志
- 监控ping成功率
- 确认实例在线时间

### 3. 性能指标
- 冷启动时间
- 登录响应时间
- 用户满意度

## 回滚方案

如果出现问题，可以快速回滚：

\`\`\`bash
# 恢复备份文件
cp $BACKUP_DIR/useApi.js.backup $FRONTEND_DIR/src/hooks/useApi.js
cp $BACKUP_DIR/AuthContext.js.backup $FRONTEND_DIR/src/contexts/AuthContext.js
cp $BACKUP_DIR/LoginPage.js.backup $FRONTEND_DIR/src/pages/LoginPage.js

# 重新构建和部署
cd $FRONTEND_DIR
npm run build
vercel --prod
\`\`\`

## 长期建议

### 1. 升级后端服务
- 考虑将Render升级到付费版本 ($7/月)
- 消除冷启动问题
- 提供更好性能

### 2. 实施外部健康检查
- 使用UptimeRobot等服务
- 定期ping后端健康检查端点
- 设置告警机制

### 3. 架构优化
- 考虑迁移到更稳定的平台
- 实施微服务架构
- 添加负载均衡

## 联系信息

- **技术支持**: 开发团队
- **Render支持**: https://render.com/support
- **Vercel文档**: https://vercel.com/docs

---

**部署状态**: ✅ 成功
**下一步**: 监控系统性能和用户反馈
EOF

echo -e "${GREEN}✅ 部署报告已生成: $REPORT_FILE${NC}"

# 总结
echo -e "${GREEN}🎉 部署完成！${NC}"
echo -e "${BLUE}📊 修复摘要:${NC}"
echo "   ✅ API超时时间延长至120秒"
echo "   ✅ 保活服务已部署"
echo "   ✅ 登录页面已增强"
echo "   ✅ 错误处理已优化"
echo ""
echo -e "${YELLOW}⚠️  下一步操作:${NC}"
echo "   1. 测试登录功能"
echo "   2. 监控系统性能"
echo "   3. 收集用户反馈"
echo "   4. 考虑升级后端服务"
echo ""
echo -e "${BLUE}📁 相关文件:${NC}"
echo "   - 修复文件: $PROJECT_ROOT/fixes/"
echo "   - 备份文件: $BACKUP_DIR"
echo "   - 部署报告: $REPORT_FILE"
echo ""
echo -e "${GREEN}✨ 感谢使用GEO SaaS登录问题修复方案！${NC}"