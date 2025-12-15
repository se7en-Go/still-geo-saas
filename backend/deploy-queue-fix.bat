@echo off
setlocal enabledelayedexpansion

:: GEO SaaS 队列修复部署脚本 (Windows版本)
:: 用于部署内容生成队列修复到Render生产环境

echo 🚀 开始部署GEO SaaS队列修复...
echo ================================

:: 检查Git是否可用
echo 1. 检查Git安装...
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Git未安装或不在PATH中
    pause
    exit /b 1
)
echo    ✅ Git已安装

:: 验证关键文件存在
echo 2. 验证修复文件...
set "files_ok=1"
if exist "worker.js" (
    echo    ✅ worker.js 存在
) else (
    echo    ❌ worker.js 缺失
    set "files_ok=0"
)

if exist "queue-fixed.js" (
    echo    ✅ queue-fixed.js 存在
) else (
    echo    ❌ queue-fixed.js 缺失
    set "files_ok=0"
)

if exist "routes\health.js" (
    echo    ✅ routes\health.js 存在
) else (
    echo    ❌ routes\health.js 缺失
    set "files_ok=0"
)

if exist "app.js" (
    echo    ✅ app.js 存在
) else (
    echo    ❌ app.js 缺失
    set "files_ok=0"
)

if exist "test-queue-fix.js" (
    echo    ✅ test-queue-fix.js 存在
) else (
    echo    ❌ test-queue-fix.js 缺失
    set "files_ok=0"
)

if !files_ok! equ 0 (
    echo ❌ 必要文件缺失，无法继续部署
    pause
    exit /b 1
)

:: 检查Git仓库状态
echo 3. 检查Git仓库状态...
git rev-parse --git-dir >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 不在Git仓库中
    pause
    exit /b 1
)
echo    ✅ Git仓库状态正常

:: 添加修改的文件到Git
echo 4. 提交代码更改...
git add worker.js
git add routes\health.js
git add app.js
git add test-queue-fix.js
git add openspec\changes\fix-content-generation-queue\

:: 检查是否有待提交的更改
git diff --staged --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo ℹ️  没有新的更改需要提交
) else (
    echo 📝 提交修复代码...
    git commit -m "🔧 修复内容生成队列处理问题

- 统一worker.js和queue-fixed.js的Redis连接配置
- 增强Worker错误处理和启动验证
- 添加AI服务重试机制和指数退避
- 实现全面的健康检查端点 (/api/health/*)
- 改进错误日志和调试信息
- 添加队列系统诊断测试工具

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

    if %errorlevel% neq 0 (
        echo ❌ Git提交失败
        pause
        exit /b 1
    )
    echo    ✅ 代码提交成功
)

:: 推送到远程仓库
echo 5. 推送到远程仓库...
git push origin main

if %errorlevel% neq 0 (
    echo ❌ 代码推送失败
    pause
    exit /b 1
)
echo    ✅ 代码推送成功

echo.
echo 🎯 部署后的验证步骤:
echo 1. 在Render控制台检查部署状态
echo 2. 等待部署完成后，运行健康检查:
echo    curl https://your-render-url/api/health/system
echo 3. 检查Worker状态:
echo    curl https://your-render-url/api/health/worker
echo 4. 验证AI服务连接:
echo    curl https://your-render-url/api/health/ai
echo 5. 测试内容生成功能
echo.

echo 🔗 有用的链接:
echo - Render Dashboard: https://dashboard.render.com
echo - 服务日志: 查看Render控制台的日志选项卡
echo - 服务指标: 查看Render控制台的指标选项卡
echo.

echo 📋 修复总结:
echo ✅ 统一队列配置
echo ✅ 增强错误处理
echo ✅ 添加重试机制
echo ✅ 实现健康检查
echo ✅ 改进监控能力
echo.

echo ⏳ 等待Render部署完成...
echo 部署通常需要2-5分钟。请检查Render控制台确认部署状态。

echo.
echo 🚀 部署命令执行完成！
echo ================================
pause