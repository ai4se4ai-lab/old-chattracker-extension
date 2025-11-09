@echo off
REM Stop Cursor Chat Auto-Detector (Windows Batch)

setlocal

set "SCRIPT_DIR=%~dp0"
set "PID_FILE=%SCRIPT_DIR%auto-detector.pid"

if not exist "%PID_FILE%" (
    echo ⚠️  Auto-detector is not running (no PID file found)
    exit /b 1
)

for /f %%i in (%PID_FILE%) do set PID=%%i

tasklist /FI "PID eq %PID%" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo 🛑 Stopping auto-detector (PID: %PID%)...
    taskkill /PID %PID% /F >nul 2>&1
    
    timeout /t 2 /nobreak >nul
    
    REM Check if still running
    tasklist /FI "PID eq %PID%" 2>NUL | find /I /N "node.exe">NUL
    if "%ERRORLEVEL%"=="0" (
        echo ⚠️  Process still running, forcing kill...
        taskkill /PID %PID% /F >nul 2>&1
    )
    
    del "%PID_FILE%"
    echo ✅ Auto-detector stopped
) else (
    echo ⚠️  Auto-detector process not found (PID: %PID%)
    del "%PID_FILE%"
    exit /b 1
)

endlocal

