# ============================================================
# 房屋管家 · 本机数据库备份（Windows / PowerShell）
#
# 作用：把主库数据库 housing.db 复制到 backups 目录，文件名带日期，
# 并只保留最近 N 份，自动删除更早的备份。
#
# 用法：
#   - 手动：双击 备份数据库.bat，或右键本文件「用 PowerShell 运行」
#   - 自动：用「任务计划程序」每天定时运行 备份数据库.bat（见 README）
# ============================================================

$ErrorActionPreference = 'Stop'

# ---- 配置 ----
$KeepDays = 14   # 保留最近多少份备份
# ---------------

# 数据库位置：与 server/src/db/index.ts 默认一致（%APPDATA%\HouseApp）
# 若你在 .env 里改过 DB_PATH，请把下面这行改成你的实际路径
$DbPath = Join-Path $env:APPDATA 'HouseApp\housing.db'

$Root      = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BackupDir = Join-Path $Root 'backups'
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

if (-not (Test-Path $DbPath)) {
  Write-Host "[错误] 找不到数据库文件：$DbPath" -ForegroundColor Red
  Write-Host "若你改过 DB_PATH，请编辑本脚本顶部的 `$DbPath。" -ForegroundColor Yellow
  exit 1
}

$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $BackupDir "housing-$stamp.db"

# 同时复制 -wal / -shm（若存在），保证备份是完整状态
Copy-Item $DbPath $target -Force
foreach ($suffix in @('-wal', '-shm')) {
  $extra = "$DbPath$suffix"
  if (Test-Path $extra) { Copy-Item $extra "$target$suffix" -Force }
}
Write-Host "[成功] 已备份到：$target" -ForegroundColor Green

# 清理超过保留期的旧备份
$cutoff = (Get-Date).AddDays(-$KeepDays)
Get-ChildItem $BackupDir -Filter 'housing-*.db*' | Where-Object { $_.LastWriteTime -lt $cutoff } | ForEach-Object {
  Remove-Item $_.FullName -Force
  Write-Host "已清理旧备份：$($_.Name)"
}

Write-Host "完成。保留最近 $KeepDays 天的备份。"
