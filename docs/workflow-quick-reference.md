# 🛡️ GEO后端保活工作流 - 快速参考卡片

## 🚀 快速操作

### 手动触发工作流
```bash
# GitHub仓库 → Actions → "生产级后端保活服务" → "Run workflow"
```

### 检查服务状态
```bash
# 快速健康检查
curl -I https://geo-backend-vp34.onrender.com/api/health

# 完整服务检查
curl -X POST https://geo-backend-vp34.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test123"}'
```

### 本地唤醒脚本
```bash
cd "D:\GEO优化"
node wakeup-backend.js
# 或双击 start-keepalive.bat
```

## 📊 工作流状态

| 状态 | 描述 | 操作 |
|------|------|------|
| ✅ 成功 | 所有检查通过 | 无需操作 |
| ⚠️ 部分成功 | 部分检查失败 | 查看日志 |
| ❌ 失败 | 唤醒失败 | 手动检查服务 |

## 🎯 执行策略

| 策略 | 描述 | 用途 |
|------|------|------|
| 📋 Standard | 标准模式（推荐） | 日常保活 |
| 🚀 Aggressive | 激进模式（8次尝试） | 问题排查 |
| ⚡ Minimal | 最小模式（3次尝试） | 快速检查 |

## 🔧 关键配置

### 工作流文件位置
```
.github/workflows/production-backend-keepalive.yml
```

### 重要端点
```
健康检查: /api/health
登录测试: /api/auth/login
API根目录: /api
前端地址: https://still-geo.gocdn.dpdns.org/
后端API: https://geo-backend-vp34.onrender.com
```

### 执行时间表
```
自动执行: 每14分钟
手动触发: 随时可用
```

## 🚨 故障排除速查

### 问题：连接超时
```bash
# 检查服务状态
curl -v https://geo-backend-vp34.onrender.com/api/health --connect-timeout 60

# 查看GitHub Actions日志
Actions → "生产级后端保活服务" → 查看最新执行
```

### 问题：404错误
```bash
# 验证端点存在
curl https://geo-backend-vp34.onrender.com/api/
curl https://geo-backend-vp34.onrender.com/api/health
```

### 问题：登录测试失败
```bash
# 测试认证端点
curl -X POST https://geo-backend-vp34.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "lml1140490403@163.com", "password": "Zwj#1234567890"}'
```

## 📈 监控信息

### 执行ID格式
```
keepalive-YYYYMMDD-HHMMSS-NNN
# 示例: keepalive-20241211-143022-123
```

### 状态徽章
```markdown
✅ 在线: https://img.shields.io/badge/GEO%20Backend-✅%20在线-brightgreen
⚠️ 检查: https://img.shields.io/badge/GEO%20Backend-⚠️%20检查-orange
❌ 离线: https://img.shields.io/badge/GEO%20Backend-❌%20离线-red
```

### 重要链接
- 🏠 用户前端: https://still-geo.gocdn.dpdns.org/
- 🔧 后端API: https://geo-backend-vp34.onrender.com
- 📊 Render控制台: https://dashboard.render.com
- 📈 GitHub Actions: https://github.com/your-repo/actions

## 🛠️ 常用命令

### 检查工作流历史
```bash
# 在GitHub仓库页面
Actions → "生产级后端保活服务" → 查看执行历史
```

### 查看服务日志
```bash
# 登录Render控制台
1. 访问 https://dashboard.render.com
2. 找到 geo-backend-vp34 服务
3. 点击 "Logs" 查看实时日志
```

### 本地测试脚本
```bash
# 完整测试
node wakeup-backend.js

# 仅健康检查
curl https://geo-backend-vp34.onrender.com/api/health

# 仅登录测试
curl -X POST https://geo-backend-vp34.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "healthcheck@example.com", "password": "test123"}'
```

## 📋 检查清单

### 日常检查 (每日)
- [ ] 工作流是否正常执行
- [ ] 服务是否在线
- [ ] 用户是否可以正常登录

### 故障检查 (有问题时)
- [ ] GitHub Actions执行状态
- [ ] Render服务状态
- [ ] 服务日志错误信息
- [ ] 网络连接状态
- [ ] 环境变量配置

### 维护检查 (每周)
- [ ] 工作流执行历史
- [ ] 性能指标趋势
- [ ] 错误模式分析
- [ ] 配置文件更新

## 🎮 快捷键

### GitHub界面
- `Ctrl/Cmd + K`: 快速搜索
- `g + A`: 跳转到Actions页面
- `g + I`: 跳转到Issues页面
- `g + P`: 跳转到Pull Requests

### 终端命令
- `curl -I`: 仅检查HTTP头
- `curl -v`: 详细输出
- `curl -s`: 静默模式
- `curl -w`: 自定义输出格式

## 📞 联系信息

### 技术支持
- 📧 项目Issues: GitHub仓库Issues页面
- 📚 文档: `/docs/production-workflow-architecture.md`
- 🔧 本地脚本: `wakeup-backend.js`

### 相关文档
- 📖 完整架构文档: `docs/production-workflow-architecture.md`
- 📋 快速参考: `docs/workflow-quick-reference.md` (当前文件)
- 🛠️ 安装指南: `README-SPARC-FIX.md`

---

**版本**: v2.0.0 | **更新**: 2024年12月 | **维护**: GEO优化团队