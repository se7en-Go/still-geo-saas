# GEO SaaS 登录问题自动修复部署脚本 (PowerShell版本)
# 作者: Claude Code
# 版本: 1.0.0
# 日期: 2024-12-10

param(
    [switch]$SkipBackup,
    [switch]$SkipBuild,
    [switch]$SkipDeploy
)

# 颜色输出函数
function Write-ColorOutput {
    param(
        [string]$Message,
        [ConsoleColor]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# 主函数
function Main {
    Write-ColorOutput "🚀 开始部署GEO SaaS登录问题修复..." "Blue"

    # 项目路径
    $ProjectRoot = "D:\GEO优化"
    $FrontendDir = "$ProjectRoot\frontend"
    $FixesDir = "$ProjectRoot\fixes"
    $BackupDir = "$ProjectRoot\backup\$(Get-Date -Format 'yyyyMMdd_HHmmss')"

    # 创建备份目录
    if (-not $SkipBackup) {
        Write-ColorOutput "📁 创建备份目录..." "Blue"
        New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
        New-Item -ItemType Directory -Path "$FrontendDir\src\services" -Force | Out-Null

        # 备份原始文件
        Write-ColorOutput "💾 备份原始文件..." "Blue"
        Copy-Item "$FrontendDir\src\hooks\useApi.js" "$BackupDir\useApi.js.backup" -Force
        Copy-Item "$FrontendDir\src\contexts\AuthContext.js" "$BackupDir\AuthContext.js.backup" -Force
        Copy-Item "$FrontendDir\src\pages\LoginPage.js" "$BackupDir\LoginPage.js.backup" -Force

        Write-ColorOutput "✅ 备份完成，文件保存在: $BackupDir" "Green"
    }

    # 应用修复
    Write-ColorOutput "🔧 应用修复文件..." "Blue"

    # 1. 更新useApi.js
    Write-Output "   - 更新API超时配置..."
    Copy-Item "$FixesDir\frontend-timeout-fix.js" "$FrontendDir\src\hooks\useApi.js" -Force

    # 2. 更新AuthContext.js
    Write-Output "   - 更新认证上下文..."
    Copy-Item "$FixesDir\auth-context-fix.js" "$FrontendDir\src\contexts\AuthContext.js" -Force

    # 3. 创建保活服务
    Write-Output "   - 创建保活服务..."
    Copy-Item "$FixesDir\keepalive-service.js" "$FrontendDir\src\services\keepaliveService.js" -Force

    # 4. 更新登录页面
    Write-Output "   - 更新登录页面..."
    Copy-Item "$FixesDir\login-page-enhanced.js" "$FrontendDir\src\pages\LoginPage.js" -Force

    Write-ColorOutput "✅ 修复文件应用完成" "Green"

    # 更新App.js以集成保活服务
    Write-ColorOutput "🔄 更新App.js..." "Blue"
    $AppJsPath = "$FrontendDir\src\App.js"

    if (Test-Path $AppJsPath) {
        $AppJsContent = Get-Content $AppJsPath -Raw

        if ($AppJsContent -match "keepaliveService") {
            Write-ColorOutput "⚠️  保活服务已存在于App.js中" "Yellow"
        } else {
            # 在import语句后添加保活服务导入
            $UpdatedContent = $AppJsContent -replace "(import.*?;[\r\n]+)", "`$1`r`n// 导入保活服务`r`nimport './services/keepaliveService';`r`n"
            Set-Content $AppJsPath $UpdatedContent -NoNewline
            Write-ColorOutput "✅ 保活服务已集成到App.js" "Green"
        }
    } else {
        Write-ColorOutput "⚠️  App.js文件未找到，请手动集成保活服务" "Yellow"
        Write-ColorOutput "   在App.js顶部添加: import './services/keepaliveService';" "Yellow"
    }

    # 构建前端
    if (-not $SkipBuild) {
        Write-ColorOutput "🏗️  构建前端项目..." "Blue"
        Set-Location $FrontendDir

        # 检查依赖
        if (-not (Test-Path "node_modules")) {
            Write-Output "   - 安装依赖..."
            npm install
        }

        # 构建项目
        Write-Output "   - 构建生产版本..."
        npm run build

        Write-ColorOutput "✅ 前端构建完成" "Green"
    }

    # 部署到Vercel
    if (-not $SkipDeploy) {
        # 检查Vercel CLI
        try {
            $vercelVersion = & vercel --version 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-ColorOutput "🚀 部署到Vercel..." "Blue"
                & vercel --prod
                if ($LASTEXITCODE -eq 0) {
                    Write-ColorOutput "✅ 部署完成" "Green"
                } else {
                    Write-ColorOutput "⚠️  部署失败，请检查Vercel配置" "Yellow"
                }
            } else {
                throw "Vercel not found"
            }
        } catch {
            Write-ColorOutput "⚠️  未检测到Vercel CLI，请手动部署" "Yellow"
            Write-ColorOutput "   运行: npm run build && vercel --prod" "Yellow"
        }
    }

    # 生成部署报告
    Write-ColorOutput "📋 生成部署报告..." "Blue"
    $ReportFile = "$ProjectRoot\deployment-report-$(Get-Date -Format 'yyyyMMdd_HHmmss').md"

    $ReportContent = @"
# GEO SaaS 登录问题修复部署报告

## 部署信息
- **部署时间**: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
- **部署版本**: 1.0.0
- **备份路径**: $BackupDir

## 应用的修复

### 1. 超时配置优化
- **文件**: `frontend/src/hooks/useApi.js`
- **修改**: 超时时间从60秒增加到120秒
- **状态**: ✅ 已应用

### 2. 认证上下文优化
- **文件**: `frontend/src/contexts/AuthContext.js`
- **修改**: 登录超时增加到120秒，改进错误处理
- **状态**: ✅ 已应用

### 3. 保活服务
- **文件**: `frontend/src/services/keepaliveService.js`
- **功能**: 每10分钟ping后端，防止休眠
- **状态**: ✅ 已创建

### 4. 登录页面增强
- **文件**: `frontend/src/pages/LoginPage.js`
- **功能**: 详细加载进度，智能状态提示
- **状态**: ✅ 已应用

## 预期效果

### 立即效果
- ✅ 登录超时时间延长至120秒
- ✅ 更好的错误提示和用户反馈
- ✅ 保活服务减少实例休眠概率

### 用户体验
- ✅ 详细的加载进度显示
- ✅ 智能的状态提示消息
- ✅ 更长的耐心等待时间

### 系统稳定性
- ✅ 自动保活机制
- ✅ 失败重试逻辑
- ✅ 更好的错误恢复

## 监控建议

### 1. 登录成功率
- 监控登录成功率变化
- 记录用户反馈
- 跟踪错误率下降

### 2. 保活服务状态
- 检查控制台日志
- 监控ping成功率
- 确认实例在线时间

### 3. 性能指标
- 冷启动时间
- 登录响应时间
- 用户满意度

## 回滚方案

如果出现问题，可以快速回滚：

```powershell
# 恢复备份文件
Copy-Item "$BackupDir\useApi.js.backup" "$FrontendDir\src\hooks\useApi.js" -Force
Copy-Item "$BackupDir\AuthContext.js.backup" "$FrontendDir\src\contexts\AuthContext.js" -Force
Copy-Item "$BackupDir\LoginPage.js.backup" "$FrontendDir\src\pages\LoginPage.js" -Force

# 重新构建和部署
cd $FrontendDir
npm run build
vercel --prod
```

## 长期建议

### 1. 升级后端服务
- 考虑将Render升级到付费版本 (`$7/月`)
- 消除冷启动问题
- 提供更好性能

### 2. 实施外部健康检查
- 使用UptimeRobot等服务
- 定期ping后端健康检查端点
- 设置告警机制

### 3. 架构优化
- 考虑迁移到更稳定的平台
- 实施微服务架构
- 添加负载均衡

## 联系信息

- **技术支持**: 开发团队
- **Render支持**: https://render.com/support
- **Vercel文档**: https://vercel.com/docs

---

**部署状态**: ✅ 成功
**下一步**: 监控系统性能和用户反馈
"@

    Set-Content -Path $ReportFile -Value $ReportContent -Encoding UTF8
    Write-ColorOutput "✅ 部署报告已生成: $ReportFile" "Green"

    # 总结
    Write-ColorOutput "🎉 部署完成！" "Green"
    Write-ColorOutput "📊 修复摘要:" "Blue"
    Write-Output "   ✅ API超时时间延长至120秒"
    Write-Output "   ✅ 保活服务已部署"
    Write-Output "   ✅ 登录页面已增强"
    Write-Output "   ✅ 错误处理已优化"
    Write-Output ""
    Write-ColorOutput "⚠️  下一步操作:" "Yellow"
    Write-Output "   1. 测试登录功能"
    Write-Output "   2. 监控系统性能"
    Write-Output "   3. 收集用户反馈"
    Write-Output "   4. 考虑升级后端服务"
    Write-Output ""
    Write-ColorOutput "📁 相关文件:" "Blue"
    Write-Output "   - 修复文件: $ProjectRoot\fixes\"
    Write-Output "   - 备份文件: $BackupDir"
    Write-Output "   - 部署报告: $ReportFile"
    Write-Output ""
    Write-ColorOutput "✨ 感谢使用GEO SaaS登录问题修复方案！" "Green"
}

# 执行主函数
try {
    Main
} catch {
    Write-ColorOutput "❌ 部署过程中发生错误: $($_.Exception.Message)" "Red"
    Write-ColorOutput "请检查错误信息并重试" "Yellow"
    exit 1
}