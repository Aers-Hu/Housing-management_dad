@echo off
REM ============================================================
REM 注册开机自启：把「一键启动.bat」加入当前用户启动项
REM 取消方法：Win+R 输入 shell:startup，删除「房屋管家主库.lnk」
REM ============================================================
chcp 65001 >nul
set "TARGET=%~dp0一键启动.bat"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\房屋管家主库.lnk"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%LNK%'); $s.TargetPath='%TARGET%'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Description='房屋管家本机主库自启'; $s.Save()"

if exist "%LNK%" (
  echo [成功] 已注册开机自启。
  echo 快捷方式：%LNK%
) else (
  echo [失败] 未能创建启动项，请手动把「一键启动.bat」放到 shell:startup。
)
pause
