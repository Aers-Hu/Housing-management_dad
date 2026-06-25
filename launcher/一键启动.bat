@echo off
REM ============================================================
REM 房屋管家 · 本机主库一键启动（双击运行）
REM 绕过 PowerShell 执行策略限制，调用同目录的 start-housing.ps1
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-housing.ps1"
pause
