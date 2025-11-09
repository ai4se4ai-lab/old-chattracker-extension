# Install dependencies for Cursor Chat Auto-Detector

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "📦 Installing dependencies for Cursor Chat Auto-Detector..." -ForegroundColor Green
Write-Host ""

# Check if package.json exists
$packageJson = Join-Path $ScriptDir "package.json"
if (-not (Test-Path $packageJson)) {
    Write-Host "⚠️  package.json not found. Creating it..." -ForegroundColor Yellow
    $packageJsonContent = @{
        name = "cursor-chat-hook"
        version = "1.0.0"
        description = "Hook script for capturing Cursor chat events"
        main = "cursor-chat-hook.js"
    } | ConvertTo-Json
    $packageJsonContent | Out-File -FilePath $packageJson -Encoding UTF8
}

# Install clipboardy
Write-Host "Installing clipboardy..." -ForegroundColor Cyan
Set-Location $ScriptDir
npm install clipboardy

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Dependencies installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now start the auto-detector:" -ForegroundColor Cyan
    Write-Host "   .\start-auto-detector.ps1" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    Write-Host "   Try manually: cd .hook && npm install clipboardy" -ForegroundColor Yellow
}

