@echo off
echo 启动GEO后端保活服务...
echo 请保持此窗口打开，服务会自动运行
echo 按Ctrl+C停止服务
echo.
cd /d "D:\GEO优化"
node wakeup-backend.js
pause