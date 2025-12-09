# 多个Vercel项目的DNS配置方案

## 推荐配置：使用子域名

### 方案A: 按功能分区
```
# GEO优化项目
geo.yourdomain.com → CNAME → cname.vercel-dns.com

# 另一个前端项目
app.yourdomain.com → CNAME → cname.vercel-dns.com

# 主站点（可选）
www.yourdomain.com → CNAME → cname.vercel-dns.com
```

### 方案B: 按项目分区
```
# GEO优化项目
geopt.yourdomain.com → CNAME → cname.vercel-dns.com

# 另一个前端项目
project-b.yourdomain.com → CNAME → cname.vercel-dns.com
```

## Vercel项目配置步骤

### 1. 在Vercel中分别配置域名
- GEO项目: 添加 `geo.yourdomain.com`
- 另一个项目: 添加 `app.yourdomain.com`

### 2. DNS记录设置（以阿里云为例）
```
记录类型: CNAME
主机记录: geo
记录值: cname.vercel-dns.com
TTL: 600

记录类型: CNAME
主机记录: app
记录值: cname.vercel-dns.com
TTL: 600
```

### 3. TXT记录处理
每个子域名会有独立的 `_vercel` TXT记录，不会冲突：
```
geo._vercel.yourdomain.com → verification-code-1
app._vercel.yourdomain.com → verification-code-2
```

## 注意事项
1. 子域名之间不会产生冲突
2. 每个子域名需要单独的SSL证书（Vercel自动处理）
3. DNS生效时间: 几分钟到几小时
4. 建议使用HTTPS进行访问

## 测试方法
设置完成后，分别访问：
- https://geo.yourdomain.com (应该显示GEO优化应用)
- https://app.yourdomain.com (应该显示另一个应用)