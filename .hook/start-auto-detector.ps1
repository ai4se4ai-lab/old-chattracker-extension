# Start Cursor Chat Auto-Detector (PowerShell)
# This script starts the auto-detector in the background

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DetectorScript = Join-Path $ScriptDir "cursor-chat-auto-detector.js"
$LogFile = Join-Path $ScriptDir "auto-detector.log"
$PidFile = Join-Path $ScriptDir "auto-detector.pid"

# Check if Node.js is available
try {
    $nodeVersion = node --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Node.js is not installed or not in PATH" -ForegroundColor Red
        Write-Host "   Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "   Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check if already running
if (Test-Path $PidFile) {
    $pid = Get-Content $PidFile
    $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "⚠️  Auto-detector is already running (PID: $pid)" -ForegroundColor Yellow
        Write-Host "   Stop it first: bash $ScriptDir\stop-auto-detector.ps1" -ForegroundColor Yellow
        exit 1
    } else {
        # PID file exists but process is dead, remove it
        Remove-Item $PidFile
    }
}

# Start the detector
Write-Host "🚀 Starting Cursor Chat Auto-Detector..." -ForegroundColor Green
Write-Host "   Log file: $LogFile" -ForegroundColor Gray
Write-Host "   PID file: $PidFile" -ForegroundColor Gray

# Start in background using Start-Process
$process = Start-Process -FilePath "node" `
    -ArgumentList "`"$DetectorScript`"" `
    -NoNewWindow `
    -PassThru `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError $LogFile

# Save PID
$process.Id | Out-File -FilePath $PidFile -Encoding ASCII

$processId = $process.Id
Write-Host "✅ Auto-detector started (PID: $processId)" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Commands:" -ForegroundColor Cyan
Write-Host "   View logs: Get-Content $LogFile -Wait -Tail 50" -ForegroundColor Gray
Write-Host "   Stop: .\stop-auto-detector.ps1" -ForegroundColor Gray
Write-Host "   Status: Get-Process -Id $processId" -ForegroundColor Gray

