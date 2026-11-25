@echo off
chcp 65001 >nul
title 小六壬占卜 · 本地服务
cd /d "%~dp0"

set "NODE=G:\DSH数据\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE%" set "NODE=node"

echo.
echo   小六壬占卜 · 本机已启动
echo   ------------------------------------------
echo   手机连同一个 Wi-Fi，用微信打开下面链接：
echo.
"%NODE%" -e "const os=require('os');for(const l of Object.values(os.networkInterfaces()))for(const n of l||[])if(n.family==='IPv4'&&!n.internal)console.log('     http://'+n.address+':8000/')"
echo.
echo   ------------------------------------------
echo   关掉这个窗口即停止服务。
echo.
"%NODE%" serve.mjs 8000
pause
