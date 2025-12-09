# GEO优化平台 - 故障排除指南

## 🔍 常见问题诊断

### 快速诊断清单
- [ ] 网络连接是否正常
- [ ] 环境变量是否正确配置
- [ ] 服务是否正在运行
- [ ] 日志中是否有错误信息
- [ ] 数据库连接是否正常

## 🚨 后端问题

### 1. Redis连接超时
**错误信息**: `Error: connect ETIMEDOUT at Socket.<anonymous>`

**原因分析**:
- 使用本地Redis IP进行云端部署
- Redis服务器不可达
- 网络配置问题

**解决方案**:
```bash
# 1. 检查Redis配置
node -e "
require('dotenv').config();
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);
redis.ping().then(() => console.log('✅ Redis连接正常'))
                   .catch(err => console.error('❌ Redis连接失败:', err.message));
"

# 2. 更新环境变量 (Render Dashboard)
REDIS_URL=redis://default:YOUR_KEY@smooth-sawfish-13177.upstash.io:6379

# 3. 重新部署应用
```

**测试命令**:
```bash
curl -X GET "https://geo-backend-vp34.onrender.com/api/health"
```

### 2. 数据库连接失败
**错误信息**: `ECONNREFUSED`, `password authentication failed`

**诊断步骤**:
```bash
# 测试数据库连接
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@host:5432/db'
});

pool.query('SELECT NOW()')
  .then(() => console.log('✅ 数据库连接正常'))
  .catch(err => console.error('❌ 数据库连接失败:', err.message));
"
```

### 3. JWT认证失败
**错误信息**: `Token is not valid`, `jwt malformed`

**检查项目**:
```bash
# 1. 验证JWT_SECRET是否设置
echo $JWT_SECRET

# 2. 测试登录API
curl -X POST "https://geo-backend-vp34.onrender.com/api/auth/login" \
     -H "Content-Type: application/json" \
     -d '{"email":"lml1140490403@163.com","password":"Zwj#1234567890"}'

# 3. 验证返回的token
# 将返回的token复制到以下命令测试
curl -X GET "https://geo-backend-vp34.onrender.com/api/auth/me" \
     -H "x-auth-token: YOUR_JWT_TOKEN"
```

### 4. 队列服务异常
**错误信息**: `Queue events stream error`, `Content queue encountered an error`

**解决方案**:
```bash
# 1. 检查Redis状态
curl -X GET "https://geo-backend-vp34.onrender.com/api/health"

# 2. 重启队列服务
# 在Render Dashboard中重启应用

# 3. 检查环境变量
# 确保 REDIS_URL 正确配置
```

## 🌐 前端问题

### 1. API连接失败
**错误信息**: `ERR_CONNECTION_REFUSED`, `net::ERR_CONNECTION_REFUSED`

**诊断步骤**:
```bash
# 1. 检查环境变量
# 在Vercel Dashboard中验证 REACT_APP_API_BASE_URL

# 2. 测试后端连接
curl -I "https://geo-backend-vp34.onrender.com/api/health"

# 3. 检查前端网络请求
# 在浏览器开发者工具中查看Network标签
```

**修复方案**:
1. 在Vercel Dashboard设置环境变量:
```
REACT_APP_API_BASE_URL=https://geo-backend-vp34.onrender.com/api
```

2. 重新部署前端:
```bash
cd frontend
vercel --prod
```

### 2. 登录页面无响应
**可能原因**:
- CORS配置问题
- API端点错误
- 前端缓存问题

**解决方案**:
```bash
# 1. 清除浏览器缓存
# Chrome: Ctrl+Shift+R (Windows) 或 Cmd+Shift+R (Mac)

# 2. 检查CORS配置
# 后端app.js中应包含:
app.use(cors({
  origin: ['https://geo-optimization-frontend-*.vercel.app'],
  credentials: true
}));

# 3. 检查控制台错误
# 按F12查看Console和Network标签
```

### 3. 静态资源加载失败
**错误信息**: 404 Not Found for static files

**检查项目**:
```bash
# 1. 验证构建产物
ls -la frontend/build/static/

# 2. 检查路由配置
# 确保React Router配置正确

# 3. 重新构建前端
cd frontend
npm run build
vercel --prod
```

## 🔧 环境配置问题

### 1. 环境变量未生效
**检查方法**:
```bash
# 后端环境变量检查
node -e "
require('dotenv').config();
console.log('DB_HOST:', process.env.DB_HOST);
console.log('REDIS_URL:', process.env.REDIS_URL);
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '✅' : '❌ Missing');
"

# 前端环境变量检查
echo "REACT_APP_API_BASE_URL: $REACT_APP_API_BASE_URL"
```

### 2. 域名配置问题
**常见错误**:
- DNS解析失败
- SSL证书问题
- CNAME记录错误

**诊断命令**:
```bash
# DNS查询
nslookup geo.yourdomain.com

# SSL证书检查
curl -I https://geo.yourdomain.com

# HTTP状态检查
curl -v https://geo.yourdomain.com
```

## 🐛 调试工具和技巧

### 1. 后端调试
```javascript
// 添加调试日志
const logger = require('./logger');

// 在关键位置添加日志
logger.info('用户登录尝试', { email, timestamp });
logger.error('数据库查询失败', { query, error });

// 使用debug模块
const debug = require('debug')('app:auth');
debug('处理登录请求');
```

### 2. 前端调试
```javascript
// React DevTools Profiler
import { Profiler } from 'react';

const ProfileWrapper = ({ children }) => (
  <Profiler id="LoginComponent" onRender={(id, phase, actualDuration) => {
    console.log(`${id} ${phase} took ${actualDuration}ms`);
  }}>
    {children}
  </Profiler>
);

// 网络请求监控
const useApiDebug = () => {
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = (...args) => {
      console.log('API Request:', args[0]);
      return originalFetch(...args)
        .then(response => {
          console.log('API Response:', response.status);
          return response;
        });
    };
  }, []);
};
```

### 3. 数据库调试
```bash
# 连接数据库检查
psql "postgresql://user:pass@host:5432/db" -c "\dt"

# 查询用户表
psql "postgresql://user:pass@host:5432/db" -c "SELECT * FROM users LIMIT 5;"

# 检查Redis连接
redis-cli -u redis://default:key@host:6379 ping
```

## 📊 性能问题

### 1. API响应慢
**监控工具**:
```javascript
// 添加响应时间中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});
```

### 2. 数据库查询优化
```sql
-- 查看慢查询
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- 分析表索引
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE tablename = 'users';
```

## 🚨 紧急恢复程序

### 1. 服务完全宕机
**恢复步骤**:
```bash
# 1. 检查服务状态
curl -I "https://geo-backend-vp34.onrender.com/api/health"

# 2. 查看服务日志
# 在Render Dashboard中查看最新日志

# 3. 重启服务
# 在Render Dashboard中点击"Restart"

# 4. 回滚到上一个稳定版本
git log --oneline
git revert HEAD
git push origin main
```

### 2. 数据丢失
**恢复步骤**:
```bash
# 1. 检查数据库备份
# 在Neon Dashboard中查看备份

# 2. 从备份恢复
# 联系Neon支持进行数据恢复

# 3. 重建管理员账号
node create_admin.js
```

## 📞 寻求帮助

### 日志收集
```bash
# 收集后端日志
tail -100 logs/combined.log

# 收集前端错误
# 在浏览器控制台截图错误信息

# 收集环境信息
node -e "console.log({
  node: process.version,
  platform: process.platform,
  env: Object.keys(process.env).filter(k => k.includes('RENDER') || k.includes('VERCEL'))
})"
```

### 联系方式
- **技术文档**: 查看 `docs/` 目录下的详细文档
- **GitHub Issues**: 在项目仓库创建Issue
- **团队协作**: 使用Claude Flow进行问题分析和解决

---

**最后更新**: 2025-12-02
**版本**: v2.0.0