# Stop Cursor Chat Auto-Detector (PowerShell)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $ScriptDir "auto-detector.pid"

if (-not (Test-Path $PidFile)) {
    Write-Host "⚠️  Auto-detector is not running (no PID file found)" -ForegroundColor Yellow
    exit 1
}

$pid = Get-Content $PidFile

try {
    $process = Get-Process -Id $pid -ErrorAction Stop
    Write-Host "🛑 Stopping auto-detector (PID: $pid)..." -ForegroundColor Yellow
    
    Stop-Process -Id $pid -Force
    
    # Wait a bit
    Start-Sleep -Seconds 2
    
    # Check if still running
    $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "⚠️  Process still running, forcing kill..." -ForegroundColor Yellow
        Stop-Process -Id $pid -Force
    }
    
    Remove-Item $PidFile
    Write-Host "✅ Auto-detector stopped" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Auto-detector process not found (PID: $pid)" -ForegroundColor Yellow
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    exit 1
}

