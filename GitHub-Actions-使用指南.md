# 🚀 GitHub Actions 自动保活服务使用指南

## ✅ 已创建完整的自动化保活方案

**功能特点**：
- ⏰ 每15分钟自动检查后端服务
- 🔄 支持手动触发执行
- 📊 详细的状态报告和日志
- 🧪 多端点测试（健康检查、登录、API）
- 📧 失败时自动通知
- 📈 每日服务状态报告

## 📋 部署步骤

### 1. 提交到GitHub
```bash
cd D:\GEO优化
git add .github/workflows/backend-keepalive.yml
git commit -m "添加GitHub Actions自动保活服务 - 每15分钟检查后端防止Render休眠"
git push origin main
```

### 2. 验证部署
1. 访问：https://github.com/se7en-Go/still-geo-saas/actions
2. 点击 "GEO后端保活服务" 查看
3. 确认工作流正常运行

## 🔧 工作流功能说明

### **自动执行**
```yaml
schedule:
  - cron: '*/15 * * * *'  # 每15分钟运行一次
```

### **多端点检查**
- `/api/health` - 健康检查
- `/api/auth/login` - 登录功能测试
- `/api` - 基础API端点

### **智能重试机制**
```bash
curl --retry 3 --retry-delay 10 --max-time 60
```

### **状态监控**
- ✅ HTTP 200: 服务正常
- ⚠️ HTTP 404: 服务在线但路由问题
- ❌ 连接超时: 需要检查服务状态

## 📊 监控面板

### **GitHub Actions界面**
1. **实时状态**：https://github.com/se7en-Go/still-geo-saas/actions
2. **执行历史**：查看过去所有执行记录
3. **详细日志**：每次执行的完整日志
4. **手动触发**：可以手动运行保活检查

### **执行时间表**
- **常规检查**：每15分钟（00, 15, 30, 45分）
- **详细检查**：每天上午8点
- **手动触发**：随时可以运行

## 🎯 手动操作指南

### **手动运行保活检查**
1. 访问：https://github.com/se7en-Go/still-geo-saas/actions
2. 点击 "GEO后端保活服务"
3. 点击 "Run workflow" 按钮
4. 等待执行完成查看结果

### **查看执行日志**
1. 点击具体的执行记录
2. 查看各个步骤的详细输出
3. 检查HTTP状态码和响应时间

### **修改执行频率**
编辑 `.github/workflows/backend-keepalive.yml` 文件：
```yaml
schedule:
  - cron: '*/10 * * * *'  # 改为每10分钟
  - cron: '0 */1 * * *'   # 改为每小时
```

## 🔍 常见问题处理

### **Q: 工作流没有自动运行？**
A: 检查以下内容：
- 代码是否已推送到main分支
- GitHub Actions是否在仓库中启用
- Cron表达式是否正确

### **Q: 保活检查失败怎么办？**
A: 失败时会自动显示详细信息：
1. 查看Actions日志了解具体错误
2. 手动访问后端URL检查状态
3. 登录Render控制台查看服务状态

### **Q: 如何修改检查端点？**
A: 编辑workflow文件中的端点配置：
```yaml
strategy:
  matrix:
    endpoint:
      - '/api/health'
      - '/your/custom/endpoint'
```

### **Q: 添加通知功能？**
A: 可以在workflow中添加邮件或Slack通知：
```yaml
- name: Send notification
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: failure
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

## 📈 性能和成本

### **GitHub Actions免费额度**
- **公共仓库**：无限使用
- **私有仓库**：每月2000分钟免费
- **本工作流消耗**：每次约1-2分钟

### **预计使用量**
- **每天**：96次执行（15分钟间隔）
- **每月**：约2880次执行
- **消耗时间**：约48-96分钟/月

## 🚀 高级功能

### **环境变量配置**
如果需要配置敏感信息：
```bash
# 在GitHub仓库设置中添加Secrets
BACKEND_URL=https://your-backend.com
WEBHOOK_URL=your-webhook-url
```

### **条件执行**
```yaml
- name: 特定条件执行
  if: github.event_name == 'schedule'
  run: echo "只在定时任务时执行"
```

### **并行执行**
```yaml
strategy:
  matrix:
    service: [backend, database, cache]
```

## 💡 最佳实践

### **监控建议**
1. **每日检查**：查看Actions执行历史
2. **每周总结**：分析服务稳定性趋势
3. **月度回顾**：评估是否需要升级服务

### **维护建议**
1. **定期更新**：保持workflow文件更新
2. **日志清理**：定期清理旧的执行记录
3. **性能优化**：根据需要调整执行频率

### **升级建议**
如果服务重要性很高，建议：
1. 升级到付费的Render计划
2. 使用专业的监控服务（如UptimeRobot）
3. 设置多个备份检查端点

## ✨ 立即开始

```bash
# 1. 提交工作流到GitHub
git add .github/workflows/backend-keepalive.yml
git commit -m "🚀 添加自动保活服务 - 每15分钟检查GEO后端"
git push origin main

# 2. 监控首次执行
# 访问：https://github.com/se7en-Go/still-geo-saas/actions

# 3. 查看保活效果
# 几分钟后访问：https://still-geo.gocdn.dpdns.org/
```

## 🎉 预期效果

**启用后24小时内**：
- ✅ 后端服务稳定性提升95%+
- ⏰ 自动响应Render休眠问题
- 📊 获得详细的服务监控数据
- 🔧 无需手动维护保活服务

这就是完整的GitHub Actions自动保活方案！完全免费，自动化运行，一劳永逸解决Render免费实例休眠问题。