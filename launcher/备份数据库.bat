@echo off
REM ============================================================
REM 房屋管家 · 备份数据库（双击运行）
REM 调用同目录的 backup-db.ps1，把 housing.db 复制到 backups 目录
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup-db.ps1"
pause
