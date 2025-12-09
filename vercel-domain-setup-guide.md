# Vercel 自定义域名设置指南

## 推荐的域名格式
- `geo-optimization.com`
- `geo-saas.com`
- `your-geo-app.com`

## 设置步骤

### 1. Vercel Dashboard 设置
1. 访问 https://vercel.com/dashboard
2. 选择 `geo-optimization-frontend` 项目
3. 点击 "Settings" → "Domains"
4. 点击 "Add" 输入您的域名

### 2. DNS 配置示例
根据您的域名注册商，添加以下记录：

#### 阿里云/腾讯云等国内服务商
```
记录类型: CNAME
主机记录: geo (或 @, 或 www)
记录值: cname.vercel-dns.com
TTL: 600
```

#### Cloudflare
```
类型: CNAME
名称: geo (或 www)
目标: cname.vercel-dns.com
代理状态: 已代理 (橙色云朵)
```

### 3. 验证设置
- DNS生效后，访问您的自定义域名
- 应该能正常显示GEO优化应用
- 登录功能应该完全正常

## 当前部署信息
- Vercel项目: geo-optimization-frontend
- 原始URL: https://geo-optimization-frontend-axe0myyxb-se7en7788s-projects.vercel.app
- 状态: ✅ 部署成功，登录功能正常

## 注意事项
1. 域名必须先在域名注册商处购买
2. DNS生效可能需要几分钟到24小时
3. 确保域名没有与其他服务冲突
4. 建议同时添加 www 和非 www 版本