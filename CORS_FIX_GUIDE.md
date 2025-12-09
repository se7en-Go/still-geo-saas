# 自定义域名登录问题修复指南

## 🚨 问题诊断结果

**根本原因**：后端CORS配置没有包含自定义域名 `still-geo.gocdn.dpdns.org`

### 问题分析
- ✅ 网络连接正常
- ✅ 前端配置正确
- ✅ 后端服务正常
- ❌ CORS配置缺失自定义域名

## 🔧 解决方案

### 1. 已修复的文件

#### `backend/app.js` CORS配置更新
```javascript
// 修复前
origin: [
  'https://geo-optimization-frontend-axe0myyxb-se7en7788s-projects.vercel.app',  // 旧域名
  'https://geo-backend-vp34.onrender.com',  // 错误配置
  /\.vercel\.app$/,
]

// 修复后
const corsOrigins = process.env.NODE_ENV === 'production'
  ? [
      'https://geo-optimization-frontend-bvmg40kfj-se7en7788s-projects.vercel.app',  // 当前域名
      'https://still-geo.gocdn.dpdns.org',  // ✅ 新增自定义域名
      /\.vercel\.app$/,
      ...(process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',') : [])
    ]
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];
```

### 2. 部署步骤

#### 步骤1：提交代码更改
```bash
git add backend/app.js
git commit -m "修复自定义域名CORS配置 - 添加still-geo.gocdn.dpdns.org支持"
git push origin main
```

#### 步骤2：等待Render自动部署
- Render会在收到push后自动重新部署
- 等待部署完成（通常3-5分钟）

#### 步骤3：验证修复
```bash
# 测试CORS预检请求
curl -X OPTIONS "https://geo-backend-vp34.onrender.com/api/auth/login" \
  -H "Origin: https://still-geo.gocdn.dpdns.org" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v
```

**期望结果**：应看到 `access-control-allow-origin: https://still-geo.gocdn.dpdns.org`

#### 步骤4：测试登录功能
访问 `https://still-geo.gocdn.dpdns.org` 并尝试登录

### 3. 可选的环境变量配置

#### 在Render Dashboard添加环境变量
```
CORS_ALLOWED_ORIGINS=https://still-geo.gocdn.dpdns.org,https://your-other-domain.com
```

### 4. 故障排除

#### 如果修复后仍有问题

1. **检查部署状态**
   - 访问Render Dashboard查看部署日志
   - 确认代码已成功部署

2. **清除浏览器缓存**
   - Ctrl+F5 或 Cmd+Shift+R 强制刷新
   - 或清除浏览器缓存后重试

3. **检查浏览器开发者工具**
   - F12 -> Network 标签
   - 查看CORS请求的响应头
   - 查看Console是否有错误信息

4. **验证域名解析**
   ```bash
   nslookup still-geo.gocdn.dpdns.org
   ```

### 5. 长期维护

#### 添加更多自定义域名的步骤

1. 更新 `backend/app.js` 中的域名列表
2. 或者使用环境变量 `CORS_ALLOWED_ORIGINS`
3. 重新部署后端服务

#### 生产环境CORS最佳实践

```javascript
// 推荐的生产环境CORS配置
const corsOrigins = process.env.NODE_ENV === 'production'
  ? [
      // 主生产域名
      process.env.FRONTEND_URL,
      // 自定义域名
      process.env.CUSTOM_DOMAINS?.split(',') || [],
      // Vercel子域名支持
      /\.vercel\.app$/,
    ].filter(Boolean) // 过滤空值
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];
```

## 📋 验证清单

部署完成后，请确认：

- [ ] 代码已提交并推送
- [ ] Render部署成功
- [ ] CORS预检请求返回正确的Origin头
- [ ] 自定义域名可以正常登录
- [ ] Vercel域名仍然可以正常登录
- [ ] 浏览器控制台无CORS错误

## 🆘 紧急联系

如果修复后仍有问题，请检查：
1. Render部署日志
2. 浏览器网络请求详情
3. 域名DNS解析是否正确

---

**修复完成时间**：2025-12-09
**影响范围**：自定义域名登录功能
**预计解决时间**：部署完成后立即生效