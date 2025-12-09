# JWT配置同步检查清单

## 🎯 概述
此检查清单用于确保GEO平台的JWT配置在所有环境中保持一致，防止"jwt malformed"错误。

## 📋 环境变量同步检查

### ✅ 1. 本地开发环境
```bash
# 检查文件: backend/.env
JWT_SECRET=geo_optimization_jwt_secret_32VHgtlzJhor6CVRC9y9cJQs8vGqWC0p7VFsS2WwcQhETvHsHrH8SEUpy0Do7U3
JWT_EXPIRY=24h
ALLOW_USER_REGISTRATION=false
```

### ✅ 2. 生产环境 (Render)
```bash
# 检查Render Dashboard > Environment Variables
JWT_SECRET=pMtz436O/xT3+wRFEpGjC5w+gb1SRYB4WIuZXOlwMpnkAY8lrQYhQybaP9qGpu6MXzWljr4Kq+8HmF879LJ6rA==
JWT_EXPIRY=24h
ALLOW_USER_REGISTRATION=false
```

### ✅ 3. 配置文件验证
- [ ] `.env` 文件格式正确
- [ ] `.env.production` 文件最新
- [ ] `.env.production.secure` 安全配置已应用
- [ ] 没有重复的JWT_SECRET定义
- [ ] 所有环境变量都已设置

## 🔍 配置一致性检查

### ✅ JWT Secret强度验证
- [ ] 长度 > 32字符
- [ ] 包含大小写字母、数字、特殊字符
- [ ] 不是默认值或示例值
- [ ] 各环境使用相同的强随机Secret

### ✅ Token格式验证
- [ ] 生成的token包含3个部分（header.payload.signature）
- [ ] token长度合理（通常100-200字符）
- [ ] 不包含无效前缀（如"test_token", "invalid_token"）

## 🚀 部署前检查步骤

### ✅ 1. 配置文件备份
```bash
# 备份当前配置
cp backend/.env backend/.env.backup.$(date +%s)
cp backend/.env.production backend/.env.production.backup.$(date +%s)
```

### ✅ 2. 环境变量验证
```bash
# 验证本地配置
cd backend && node check_jwt_status.js
```

### ✅ 3. Token生成测试
```bash
# 测试token生成和验证
node test-auth.js
```

### ✅ 4. 前端清理
```javascript
// 在浏览器控制台执行
localStorage.clear();
sessionStorage.clear();
```

## 🔄 定期维护检查

### ✅ 每月检查项目
- [ ] JWT Secret是否需要轮换（建议3-6个月）
- [ ] 检查配置文件是否有未提交的更改
- [ ] 验证生产环境配置是否与本地同步
- [ ] 检查是否有新的环境变量需要添加

### ✅ 部署后验证
- [ ] 用户登录功能正常
- [ ] 跨环境认证一致
- [ ] 错误日志中无JWT相关错误
- [ ] Token过期时间设置合理

## 🚨 故障排除检查点

### ✅ 当出现"jwt malformed"错误时
1. **检查token长度**：
   - 正常JWT token通常 > 100字符
   - 如果token长度 < 20字符，说明存储的是无效值

2. **检查token格式**：
   - JWT token应包含2个点(.)分隔符
   - 格式: `header.payload.signature`

3. **检查JWT Secret**：
   - 确认所有环境使用相同的JWT_SECRET
   - 验证secret没有被重置或更改

4. **清理前端缓存**：
   ```javascript
   // 在浏览器控制台执行
   localStorage.removeItem('geo_auth');
   localStorage.clear();
   ```

## 📊 配置状态监控

### ✅ 监控指标
- JWT验证失败次数
- 用户登录失败率
- 跨环境认证成功率
- Token过期刷新频率

### ✅ 告警设置
- JWT验证失败率 > 5%
- "jwt malformed"错误出现
- 配置文件变更检测
- 环境变量不一致检测

## 🛠️ 工具和脚本

### ✅ 可用检查工具
1. `backend/check_jwt_status.js` - JWT配置状态检查
2. `frontend/clear_invalid_tokens.js` - 前端token清理
3. `backend/test-auth.js` - 认证功能测试
4. `backend/debug-jwt.js` - JWT调试工具

### ✅ 自动化检查脚本
```bash
#!/bin/bash
# 配置同步检查脚本

echo "🔍 开始JWT配置同步检查..."

# 1. 检查本地配置
echo "📋 检查本地配置..."
cd backend && node check_jwt_status.js

# 2. 检查配置文件
echo "📁 检查配置文件..."
ls -la .env*

# 3. 验证JWT Secret
if [ -f ".env" ]; then
  JWT_SECRET=$(grep "JWT_SECRET=" .env | cut -d'=' -f2)
  echo "🔑 JWT Secret长度: ${#JWT_SECRET}"

  if [ ${#JWT_SECRET} -lt 32 ]; then
    echo "❌ JWT Secret长度不足！"
    exit 1
  fi
fi

echo "✅ JWT配置同步检查完成！"
```

## 📞 紧急联系方式

如果在配置同步过程中遇到问题：
1. 参考故障排除检查点
2. 使用备份配置文件恢复
3. 联系技术支持团队
4. 查看详细错误日志

---

**检查清单版本**: 1.0
**最后更新**: 2025-12-09
**适用版本**: GEO平台 v2.0+