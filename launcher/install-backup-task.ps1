# Install daily backup scheduled task for HouseApp
# Called by: 安装定时备份.bat

$taskName   = "HouseApp_DailyBackup"
$backupBat  = "D:\HouseApp\housemanagement\launcher\备份数据库.bat"
$workDir    = "D:\HouseApp\housemanagement\launcher"

Write-Host "================================================"
Write-Host "  HouseApp - Install Daily Backup Task"
Write-Host "================================================"
Write-Host ""

# Step 1: Remove old task if exists
Write-Host "[1/3] Removing old task (if any)..."
$null = cmd /c "schtasks /Delete /TN `"$taskName`" /F 2>nul"

# Step 2: Create new task
Write-Host "[2/3] Creating scheduled task..."
$createResult = cmd /c "schtasks /Create /TN `"$taskName`" /TR `"`"$backupBat`"`" /SC DAILY /ST 03:00 /F 2>&1"

if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Task created successfully!"
    Write-Host "  Name    : $taskName"
    Write-Host "  Schedule: Daily at 03:00 AM"
    Write-Host "  Run     : $backupBat"
} else {
    Write-Host "  [ERROR] Failed to create task."
    Write-Host "  $createResult"
    Write-Host ""
    Write-Host "  Try: right-click on this bat file -> Run as Administrator"
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Step 3: Test run
Write-Host ""
Write-Host "[3/3] Testing backup now..."
$testResult = cmd /c "`"$backupBat`" 2>&1"
Write-Host $testResult

Write-Host ""
Write-Host "================================================"
Write-Host "  Setup complete!"
Write-Host "  Database will be backed up daily at 3:00 AM."
Write-Host "  Backups are kept for 14 days."
Write-Host "  Location: $workDir\backups\"
Write-Host "================================================"
Write-Host ""
Read-Host "Press Enter to exit"
