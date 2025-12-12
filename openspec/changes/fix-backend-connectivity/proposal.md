# Change: Fix Backend Service Connectivity Issues

## Why
GEO后端服务(geo-backend-vp34.onrender.com)当前完全无法访问，导致GitHub Actions保活服务和用户登录都失败。本地curl测试也显示exit code 28超时错误，说明服务本身处于不可用状态。

## What Changes
- **诊断服务状态**: 确认Render服务是否真正在运行
- **验证服务URL**: 检查后端URL配置是否正确
- **修复服务部署**: 如果服务未运行，需要重新部署
- **优化保活策略**: 实现更可靠的保活机制
- **添加降级方案**: 当主服务不可用时的备用方案

## Impact
- **Affected specs**: `infrastructure/deployment`, `service/availability`, `monitoring/health-checks`
- **Affected code**: GitHub Actions工作流、后端部署配置、前端API连接
- **User Impact**: 当前完全无法登录系统，需要紧急修复
- **Service Availability**: 当前0%可用性，需要恢复到99%+

**Priority**: CRITICAL - 系统完全不可用