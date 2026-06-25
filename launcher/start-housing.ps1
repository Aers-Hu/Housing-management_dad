# ============================================================
# 房屋管家 · 本机主库一键启动（Windows / PowerShell）
#
# 作用：在你这台电脑上同时拉起并守护两个进程
#   1) Node 主库服务（监听 127.0.0.1:9091，数据库在 %APPDATA%\HouseApp）
#   2) frpc 隧道客户端（把本机 9091 经云服务器暴露给手机）
# 任一进程崩溃会自动重启。关闭本窗口即全部停止。
#
# 首次使用前：
#   - 已安装 Node 24+（命令行能跑 `node --version`）
#   - server 目录已 `pnpm install && pnpm run build`
#   - 已把 frpc.exe 放到本文件夹，并按 frpc.toml.example 配好 frpc.toml
#     （若暂时只在本机/局域网用，可不配 frpc，见下方 $EnableTunnel）
# ============================================================

$ErrorActionPreference = 'Stop'

# ---- 可按需修改的配置 ----
$Port         = 9091           # 主库服务端口
$TokenSecret  = ''             # 留空则用 server\.env 里的；强烈建议在 .env 配置
$EnableTunnel = $true          # 是否同时启动 frpc 隧道；只在本机用可设为 $false
# --------------------------------

$Root      = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ServerDir = Join-Path (Split-Path -Parent $Root) 'server'
$DistEntry = Join-Path $ServerDir 'dist\index.js'
$FrpcExe   = Join-Path $Root 'frpc.exe'
$FrpcConf  = Join-Path $Root 'frpc.toml'
$LogDir    = Join-Path $Root 'logs'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (-not (Test-Path $DistEntry)) {
  Write-Host "[错误] 未找到 $DistEntry" -ForegroundColor Red
  Write-Host "请先在 server 目录执行：pnpm install && pnpm run build" -ForegroundColor Yellow
  Read-Host "按回车退出"
  exit 1
}

Write-Host "==================== 房屋管家 · 本机主库 ====================" -ForegroundColor Cyan
Write-Host "主库服务： http://127.0.0.1:$Port"
Write-Host "数据库位置：%APPDATA%\HouseApp\housing.db"
Write-Host "隧道(frpc)：$(if ($EnableTunnel) { '启用' } else { '关闭（仅本机/局域网）' })"
Write-Host "日志目录： $LogDir"
Write-Host "（关闭此窗口即停止全部服务）`n"

# 启动 Node 主库服务（带自动重启）
$serverJob = Start-Job -Name 'housing-server' -ScriptBlock {
  param($entry, $serverDir, $port, $secret, $logDir)
  $env:NODE_ENV = 'production'
  $env:PORT     = $port
  if ($secret) { $env:TOKEN_SECRET = $secret }
  while ($true) {
    $log = Join-Path $logDir 'server.log'
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 启动主库服务..." | Out-File -Append $log
    Push-Location $serverDir
    node $entry *>> $log
    Pop-Location
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 主库服务退出，3 秒后重启" | Out-File -Append $log
    Start-Sleep -Seconds 3
  }
} -ArgumentList $DistEntry, $ServerDir, $Port, $TokenSecret, $LogDir

# 启动 frpc 隧道（带自动重启）
$frpcJob = $null
if ($EnableTunnel) {
  if ((Test-Path $FrpcExe) -and (Test-Path $FrpcConf)) {
    $frpcJob = Start-Job -Name 'housing-frpc' -ScriptBlock {
      param($exe, $conf, $logDir)
      while ($true) {
        $log = Join-Path $logDir 'frpc.log'
        "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 启动 frpc 隧道..." | Out-File -Append $log
        & $exe -c $conf *>> $log
        "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] frpc 退出，5 秒后重启" | Out-File -Append $log
        Start-Sleep -Seconds 5
      }
    } -ArgumentList $FrpcExe, $FrpcConf, $LogDir
  } else {
    Write-Host "[提示] 未找到 frpc.exe 或 frpc.toml，跳过隧道。手机需联网同步时请按指南配置。" -ForegroundColor Yellow
  }
}

Write-Host "服务已在后台运行。本窗口保持打开即守护进程；关闭窗口将停止服务。`n" -ForegroundColor Green

# 守护：本窗口存活期间，把子作业的新日志回显到控制台
try {
  while ($true) {
    Receive-Job -Job $serverJob -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[SERVER] $_" }
    if ($frpcJob) { Receive-Job -Job $frpcJob -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[FRPC] $_" } }
    Start-Sleep -Seconds 2
  }
} finally {
  Write-Host "`n正在停止服务..." -ForegroundColor Yellow
  Stop-Job  $serverJob, $frpcJob -ErrorAction SilentlyContinue
  Remove-Job $serverJob, $frpcJob -Force -ErrorAction SilentlyContinue
}
