# GEO优化平台 - 云端部署指南

## 🌐 部署架构概览

### 当前部署状态
- **后端**: Render 云服务
- **前端**: Vercel 云服务
- **数据库**: Neon PostgreSQL
- **缓存**: Upstash Redis Cloud

### 访问地址
- **前端应用**: https://geo-optimization-frontend-axe0myyxb-se7en7788s-projects.vercel.app
- **后端API**: https://geo-backend-vp34.onrender.com/api
- **健康检查**: https://geo-backend-vp34.onrender.com/api/health

## 🛠️ 环境配置

### 后端环境变量 (Render)
```
# PostgreSQL数据库
DB_USER=neondb_owner
DB_PASSWORD=npg_kMNl9QOit6GF
DB_HOST=ep-floral-lake-a1uuf65r-pooler.ap-southeast-1.aws.neon.tech
DB_PORT=5432
DB_DATABASE=neondb
DB_SSL=true

# 服务器配置
PORT=4000
JWT_SECRET=geo_optimization_jwt_secret_32VHgtlzJhor6CVRC9y9cJQs8vGqWC0p7VFsS2WwcQhETvHsHrH8SEUpy0Do7U3
ALLOW_USER_REGISTRATION=false

# OCR服务
OCR_ENABLED=true
OCR_PROVIDER=deepseek
OCR_BASE_URL=https://api.siliconflow.cn
OCR_API_KEY=sk-liqwafvqmhxntyxerblzxrkudctwqnejaprxybyqlvtldyqo
OCR_MODEL=deepseek-ai/DeepSeek-OCR
OCR_ENDPOINT=/v1/chat/completions
OCR_TIMEOUT_MS=90000

# Redis缓存
REDIS_URL=redis://default:ATN5AAIncDJlOWY4OGM4ODE4YTQ0MDc4Yjc2Nzc4Yjk2OWRhNTNiYXAyMTMxNzc@smooth-sawfish-13177.upstash.io:6379

# AI服务
AI_API_BASE_URL=https://smmspvcbawuk.ap-northeast-1.clawcloudrun.com/v1beta
AI_API_KEY=sk-seven
CHAT_COMPLETION_MODEL=gemini-2.5-pro
AI_CHAT_COMPLETION_PATH=models/gemini-2.5-pro:generateContent
AI_USE_RESPONSE_FORMAT=false
AI_PROVIDER=gemini
AI_REQUEST_TIMEOUT_MS=120000

# 嵌入服务
EMBEDDING_API_BASE_URL=https://api.siliconflow.cn
EMBEDDING_API_KEY=sk-liqwafvqmhxntyxerblzxrkudctwqnejaprxybyqlvtldyqo
EMBEDDING_MODEL=BAAI/bge-m3

# 队列配置
CONTENT_QUEUE_TIMEOUT_MS=120000
```

### 前端环境变量 (Vercel)
```
REACT_APP_API_BASE_URL=https://geo-backend-vp34.onrender.com/api
```

## 🔧 故障排除指南

### 1. Redis连接问题
**症状**: `Error: connect ETIMEDOUT`

**解决方案**:
```bash
# 测试Redis连接
node -e "
const Redis = require('ioredis');
const redis = new Redis('redis://default:YOUR_KEY@smooth-sawfish-13177.upstash.io:6379');
redis.ping().then(console.log).catch(console.error);
"
```

### 2. 登录认证问题
**症状**: "登录失败，请重试"

**检查步骤**:
1. 验证环境变量是否正确配置
2. 检查JWT_SECRET是否设置
3. 测试API端点:
```bash
curl -X POST "https://geo-backend-vp34.onrender.com/api/auth/login" \
     -H "Content-Type: application/json" \
     -d '{"email":"lml1140490403@163.com","password":"Zwj#1234567890"}'
```

### 3. 前端API连接问题
**症状**: `ERR_CONNECTION_REFUSED`

**解决方案**:
1. 检查 `REACT_APP_API_BASE_URL` 环境变量
2. 确保指向正确的后端URL
3. 清除浏览器缓存

### 4. 数据库连接问题
**症状**: 数据库相关API失败

**检查项目**:
- PostgreSQL连接字符串
- SSL配置
- 网络连接

## 🌍 自定义域名配置

### Vercel域名设置
1. 访问 Vercel Dashboard
2. 选择项目 → Settings → Domains
3. 添加自定义域名
4. 配置DNS记录:
```
类型: CNAME
名称: geo (或您的子域名)
值: cname.vercel-dns.com
```

### 多子域名配置
支持多个前端项目在同一域名下:
```
geo.yourdomain.com → GEO优化平台
app.yourdomain.com → 其他应用
```

## 🚀 部署流程

### 新部署步骤
1. **准备环境变量**
   - 复制上述配置到对应平台
   - 更新敏感信息（API密钥等）

2. **后端部署 (Render)**
   ```bash
   git add .
   git commit -m "Update configuration"
   git push origin main
   # Render会自动部署
   ```

3. **前端部署 (Vercel)**
   ```bash
   cd frontend
   vercel --prod
   ```

### 更新现有部署
1. 修改代码或配置
2. Git推送触发自动部署
3. 监控部署状态

## 📊 监控和维护

### 健康检查
```bash
# 后端健康状态
curl https://geo-backend-vp34.onrender.com/api/health

# 前端可访问性
curl -I https://geo-optimization-frontend-axe0myyxb-se7en7788s-projects.vercel.app
```

### 日志查看
- **Render**: Dashboard → Logs
- **Vercel**: Dashboard → Functions → Logs

### 性能监控
- API响应时间监控
- 数据库查询性能
- Redis缓存命中率

## 🔒 安全配置

### 环境变量安全
- 使用强密码和随机密钥
- 定期轮换API密钥
- 不要在代码中硬编码敏感信息

### 网络安全
- 启用HTTPS
- 配置适当的CORS策略
- 实施API限流

## 📞 技术支持

### 常用问题
1. **部署失败**: 检查环境变量配置
2. **功能异常**: 查看服务日志
3. **性能问题**: 监控数据库和缓存状态

### 联系方式
- 查看项目文档: agents.md
- GitHub Issues: 项目仓库
- 部署平台支持: Render/Vercel文档

---
**最后更新**: 2025-12-02
**版本**: v2.0.0