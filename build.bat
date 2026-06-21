@echo off
chcp 65001 >nul
echo ==========================================
echo   楼房管理系统 - 打包为 EXE
echo ==========================================
echo.

:: 检查 Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Python，请先安装 Python 3.8+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [1/2] 安装 PyInstaller...
pip install pyinstaller -q

echo [2/2] 打包中...
pyinstaller --onefile --windowed --name "楼房管理系统" --clean house_management.py

echo.
echo ==========================================
echo   打包完成！
echo   EXE 文件: dist\楼房管理系统.exe
echo ==========================================
echo.
echo 提示：双击 dist 文件夹中的 "楼房管理系统.exe" 即可运行。
echo 首次运行后，数据文件 housing_data.json 会自动创建在 exe 同目录下。
echo.
pause
