# GitHub Actions Keepalive 服务指南

## 📋 概述

本指南详细说明了GEO优化平台使用的GitHub Actions后端保活服务，确保Render免费 tier 服务不会因15分钟无活动而休眠。

## 🎯 工作流文件

### 主要工作流
- **文件**: `.github/workflows/production-backend-keepalive.yml`
- **功能**: 生产级后端保活服务
- **调度**: 每14分钟在特定分钟执行 `2,16,30,44,58 * * * *`

### 备份工作流
- **文件**: `.github/workflows/backend-keepalive.yml.backup`
- **用途**: 原始工作流的备份副本

## 🔧 配置说明

### 环境变量
```yaml
env:
  BACKEND_URL: 'https://geo-backend-vp34.onrender.com'
  HEALTH_ENDPOINT: '/api/health'
  LOGIN_ENDPOINT: '/api/auth/login'
  USER_AGENT: 'GEO-Production-KeepAlive/2.1'
  TIMEOUT_BASE: 30
  MAX_RETRIES: 5
  WORKFLOW_ID: 'keepalive-${{ github.run_number }}-${{ github.run_attempt }}'
  LOG_LEVEL: 'info'
```

### 调度配置
```yaml
schedule:
  - cron: '2,16,30,44,58 * * * *'  # 每14分钟，在指定分钟执行
```

## 🚀 执行阶段

### 阶段1: 初始化和状态检查
- 设置执行环境和参数
- 执行初始健康检查
- 确定服务当前状态

### 阶段2: 智能唤醒服务
根据服务状态实施多重唤醒策略：

#### 策略1: 根路径轻量级探测
- **目标**: 快速检查服务响应
- **超时**: 连接8秒，总时间15秒
- **重试**: 2次，间隔3秒

#### 策略2: API健康检查
- **目标**: 验证API端点功能
- **超时**: 连接10秒，总时间25秒
- **端点**: `/api/health`

#### 策略3: 多端点并发唤醒（前3次尝试）
- **目标**: 并发访问多个端点加速唤醒
- **端点**: `/`, `/api`, `/api/auth/login`
- **方式**: 后台并发执行

#### 策略4: 强力持续唤醒（前2次尝试）
- **目标**: 连续发送请求强制唤醒
- **次数**: 3次连续请求
- **间隔**: 2秒

### 阶段3: 功能验证
- 基础连接测试
- API根目录测试
- 登录端点测试

### 阶段4: 状态报告
- 生成综合执行报告
- 创建状态徽章信息
- 失败时提供诊断建议

### 阶段5: 清理和归档
- 归档执行记录
- 生成性能统计

### 阶段6: 外部监控和告警
- 执行结果统计
- 性能指标收集
- 状态告警检查
- 创建执行报告

## 📊 监控指标

### 关键指标
- **成功率**: 各阶段执行成功率
- **响应时间**: 健康检查响应时间
- **唤醒时间**: 总唤醒执行时间

### 性能评估
- **优秀**: 响应时间 < 5秒
- **良好**: 响应时间 5-10秒
- **需优化**: 响应时间 > 10秒

### 告警条件
- 成功率 < 60%
- 响应时间 > 10秒
- 任何阶段执行失败

## 🔍 故障排除

### 常见问题

#### 1. Cron不执行
**可能原因**:
- GitHub Actions队列延迟
- Cron表达式问题
- 权限配置错误

**解决方案**:
- 检查workflow语法
- 验证cron表达式
- 使用手动触发测试

#### 2. 服务唤醒失败
**可能原因**:
- Render服务完全停止
- 网络连接问题
- 超时设置不合理

**解决方案**:
- 检查Render控制台
- 调整超时参数
- 验证服务URL正确性

#### 3. 健康检查失败
**可能原因**:
- API端点不存在
- 数据库连接问题
- 环境变量配置错误

**解决方案**:
- 验证API端点
- 检查服务日志
- 确认环境配置

### 调试命令

#### 手动测试服务
```bash
# 测试根路径
curl -I https://geo-backend-vp34.onrender.com/

# 测试健康检查
curl -I https://geo-backend-vp34.onrender.com/api/health

# 测试登录端点
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test"}' \
  https://geo-backend-vp34.onrender.com/api/auth/login
```

#### 验证cron表达式
```bash
# 使用在线工具验证
# https://crontab.guru/#2,16,30,44,58_*_*_*_*
```

## 🚀 手动触发

### GitHub Web界面
1. 访问：https://github.com/se7en-Go/still-geo-saas/actions
2. 选择 "🛡️ 生产级后端保活服务" 工作流
3. 点击 "Run workflow"
4. 选择执行策略（standard/aggressive/minimal）
5. 可选启用调试模式

### GitHub CLI
```bash
# 触发工作流
gh workflow run production-backend-keepalive.yml \
  --field strategy=standard \
  --field debug_mode=false
```

## 📈 性能优化建议

### 短期优化
1. **监控执行历史**：观察工作流是否按预期执行
2. **调整cron时间**：根据实际需要微调执行时间
3. **优化超时设置**：根据服务响应特点调整参数

### 长期优化
1. **升级Render服务**：考虑升级到付费版彻底解决休眠问题
2. **增加监控告警**：集成Slack、邮件等通知方式
3. **实施多区域部署**：提高服务可用性

## 📞 支持和联系方式

- **GitHub Issues**: https://github.com/se7en-Go/still-geo-saas/issues
- **前端应用**: https://still-geo.gocdn.dpdns.org/
- **后端API**: https://geo-backend-vp34.onrender.com/api
- **Render控制台**: https://dashboard.render.com

## 📚 相关文档

- [OpenSpec修复提案](../openspec/changes/fix-github-actions-keepalive/proposal.md)
- [开发环境设置指南](./DEVELOPMENT_SETUP.md)
- [项目状态文档](../agents.md)
- [SPARC执行指南](./SPARC_EXECUTION_GUIDE.md)

---

**最后更新**: 2025-12-12
**维护者**: GEO优化团队