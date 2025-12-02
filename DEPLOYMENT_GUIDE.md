# 🚀 GEO 优化平台部署指南

## 📋 部署方案概览

### 推荐方案：Railway 全栈部署
- **后端**: Railway (Node.js + PostgreSQL + Redis)  
- **前端**: Railway (Nginx + React)
- **优势**: 统一管理，免费额度充足，内网通信

---

## 🔧 手动部署步骤

### 1. 初始化 Railway 项目
```bash
cd D:/GEO优化

# 创建新项目
railway init --name "geo-optimization-platform"
```

### 2. 添加数据库服务
```bash
# 添加 PostgreSQL
railway add postgres

# 添加 Redis  
railway add redis
```

### 3. 配置环境变量
```bash
# 基础配置
railway variables set NODE_ENV=production
railway variables set PORT=65535
railway variables set ALLOW_USER_REGISTRATION=false
railway variables set JWT_EXPIRES_IN=7d

# 前端配置 (如果部署前端)
railway variables set REACT_APP_API_URL=https://your-backend-url.railway.app
```

### 4. 部署项目
```bash
# 部署当前项目
railway up

# 查看部署状态
railway status

# 查看日志
railway logs
```

---

## ⚙️ 关键配置说明

### 后端配置
- **Dockerfile**: 已配置，支持健康检查
- **数据库**: Railway 自动提供 `DATABASE_URL` 
- **Redis**: Railway 自动提供 `REDIS_URL`
- **文件上传**: 需要配置云存储（推荐 Cloudinary）

### 前端配置  
- **Dockerfile**: 多阶段构建，优化包大小
- **Nginx**: 配置了 SPA 路由和 API 代理
- **环境变量**: 需要设置 `REACT_APP_API_URL`

---

## 🔑 重要环境变量

### 后端必需变量
```bash
# Railway 自动提供
DATABASE_URL=          # PostgreSQL 连接字符串
REDIS_URL=            # Redis 连接字符串

# 需要手动配置
JWT_SECRET=           # JWT 签名密钥
AI_API_KEY=          # AI 服务 API 密钥
OCR_API_KEY=         # OCR 服务 API 密钥
```

### 前端必需变量
```bash
REACT_APP_API_URL=   # 后端 API 地址
```

---

## 🌐 域名配置

### 获取项目域名
```bash
# 查看项目域名
railway domains

# 或打开项目控制台
railway open
```

### 自定义域名（可选）
```bash
# 添加自定义域名
railway domain add yourdomain.com
```

---

## 💾 数据库迁移

### 初始化数据库
```bash
# 连接到数据库
railway connect postgres

# 在 psql 中执行
\i db_setup.sql
```

### 创建管理员用户
```bash
# 运行创建脚本
railway run node create_admin.js
```

---

## 📊 监控和日志

### 查看应用状态
```bash
# 查看部署状态
railway status

# 查看实时日志
railway logs

# 查看健康检查
curl https://your-app-url.railway.app/api/health
```

### 性能监控
- 访问 Railway 控制台查看详细指标
- 设置错误告警
- 监控资源使用情况

---

## 🔄 更新部署

### 更新代码
```bash
# 修改代码后重新部署
railway up

# 强制重新部署（不使用缓存）
railway up --force
```

### 回滚部署
```bash
# 查看部署历史
railway deployments

# 回滚到指定版本
railway rollback <deployment-id>
```

---

## 🚨 故障排除

### 常见问题
1. **数据库连接失败**: 检查 `DATABASE_URL` 环境变量
2. **Redis 连接失败**: 检查 `REDIS_URL` 环境变量  
3. **构建失败**: 检查 Node.js 版本和依赖
4. **健康检查失败**: 确认 `/api/health` 端点可访问

### 调试命令
```bash
# SSH 连接到容器
railway ssh

# 在容器内执行命令
railway run <command>

# 查看构建日志
railway logs --build
```

---

## 💰 成本控制

### 免费额度
- **Railway**: $5/月 信用额度
- **包含**: 
  - 500 小时运行时间
  - PostgreSQL 数据库
  - Redis 缓存
  - 100GB 带宽

### 优化建议
- 启用自动休眠（无访问时停止）
- 优化镜像大小
- 使用 CDN 加速静态资源
- 监控资源使用情况

---

## 🎯 生产环境优化

### 安全配置
- 设置强密码和密钥
- 启用 HTTPS（Railway 自动提供）
- 配置 CORS 策略
- 限制文件上传类型和大小

### 性能优化
- 启用 Redis 缓存
- 数据库索引优化
- 图片压缩和 CDN
- API 响应缓存

### 备份策略
- 定期数据库备份
- 代码版本管理
- 配置文件备份
- 灾难恢复计划

---

## 📞 技术支持

### 有用链接
- [Railway 文档](https://docs.railway.com/)
- [Railway CLI 文档](https://docs.railway.com/guides/cli)
- [项目 GitHub](https://github.com/your-username/geo-optimization)

### 获取帮助
```bash
# 查看 CLI 帮助
railway --help
railway <command> --help

# 打开文档
railway docs
```

---

*最后更新: 2025-12-02*