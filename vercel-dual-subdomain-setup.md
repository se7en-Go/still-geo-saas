# Vercel 双子域名配置示例

## 完整的DNS记录配置

### 记录1: GEO优化项目
```
类型: CNAME
名称: geo
值: cname.vercel-dns.com
TTL: 600
```

### 记录2: GEO项目验证
```
类型: TXT
名称: geo._vercel
值: vercel-verification-string-abc123
TTL: 600
```

### 记录3: 另一个前端项目
```
类型: CNAME
名称: app
值: cname.vercel-dns.com
TTL: 600
```

### 记录4: 另一个项目验证
```
类型: TXT
名称: app._vercel
值: vercel-verification-string-xyz789
TTL: 600
```

## Vercel项目配置

### 项目1: geo-optimization-frontend
1. 访问 Vercel Dashboard
2. 选择 geo-optimization-frontend 项目
3. Settings → Domains → Add
4. 输入: `geo.yourdomain.com`
5. Vercel自动添加TXT验证记录

### 项目2: another-frontend-project
1. 选择另一个前端项目
2. Settings → Domains → Add
3. 输入: `app.yourdomain.com`
4. Vercel自动添加TXT验证记录

## 验证步骤

### 1. DNS传播检查
```bash
# 检查CNAME记录
nslookup geo.yourdomain.com
nslookup app.yourdomain.com

# 检查TXT记录
nslookup -type=TXT geo._vercel.yourdomain.com
nslookup -type=TXT app._vercel.yourdomain.com
```

### 2. HTTPS访问测试
```bash
curl -I https://geo.yourdomain.com
curl -I https://app.yourdomain.com
```

### 3. 功能测试
- 访问 https://geo.yourdomain.com → 应该显示GEO优化应用
- 访问 https://app.yourdomain.com → 应该显示另一个应用

## 常见问题解答

### Q: 两个TXT记录会冲突吗？
A: 完全不会。每个子域名有独立的验证记录。

### Q: SSL证书会有问题吗？
A: 不会。Vercel会为每个子域名签发独立的SSL证书。

### Q: 一个域名可以有多少个子域名指向Vercel？
A: 理论上没有限制，实际使用中几十个子域名都没问题。

## 推荐的子域名命名方案

### 方案A: 按功能命名
- geo.yourdomain.com (GEO优化)
- cms.yourdomain.com (内容管理)
- api.yourdomain.com (API服务)

### 方案B: 按项目命名
- geopt.yourdomain.com (GEO优化)
- project-b.yourdomain.com (项目B)
- dashboard.yourdomain.com (仪表板)

### 方案C: 简洁命名
- app.yourdomain.com (主应用)
- geo.yourdomain.com (GEO优化)
- admin.yourdomain.com (管理后台)