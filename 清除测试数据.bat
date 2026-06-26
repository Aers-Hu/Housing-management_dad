@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   清除测试数据（保留管理员账号 GmAersMess）
echo ============================================================
echo.
echo 请先确认已关闭服务端进程，然后按提示输入 CLEAR 确认。
echo.
python clear_test_data.py
echo.
pause
