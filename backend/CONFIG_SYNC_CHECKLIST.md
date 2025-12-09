# GEO平台配置同步检查清单
## AI_REQUEST_TIMEOUT_MS配置更新验证

### 🔍 更新前检查
- [ ] 确认当前生产环境配置值
- [ ] 确认本地.env文件当前值
- [ ] 备份当前配置（截图或文件）

### ⚡ 生产环境更新（Render Dashboard）
- [ ] 登录Render Dashboard
- [ ] 选择GEO后端服务
- [ ] 进入Environment选项卡
- [ ] 更新AI_REQUEST_TIMEOUT_MS = 120000
- [ ] 点击Save Changes保存
- [ ] 等待自动重新部署完成
- [ ] 验证部署状态：success

### 📁 本地环境同步
- [ ] 更新backend/.env文件中的AI_REQUEST_TIMEOUT_MS
- [ ] 更新backend/.env.production文件（如存在）
- [ ] 检查其他相关配置文件
- [ ] 提交到版本控制：git add . && git commit -m "Update AI_REQUEST_TIMEOUT_MS to 120000"

### ✅ 更新后验证
- [ ] 检查Render服务日志是否正常
- [ ] 测试AI服务功能是否正常
- [ ] 验证超时配置是否生效
- [ ] 监控错误日志是否减少

### 📋 记录更新
- [ ] 更新日期：2025-12-09
- [ ] 更新人：[您的姓名]
- [ ] 更新原因：优化AI请求超时处理
- [ ] 影响范围：AI内容生成服务

---

**⚠️ 重要提醒：**
- Render Dashboard的环境变量优先级最高
- 生产环境配置值只取决于Render Dashboard
- 本地.env文件主要用于开发和版本控制参考
- 务必保持本地配置与生产环境的一致性