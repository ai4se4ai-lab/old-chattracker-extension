@echo off
REM Start Cursor Chat Auto-Detector (Windows Batch)
REM This script starts the auto-detector in the background

setlocal

set "SCRIPT_DIR=%~dp0"
set "DETECTOR_SCRIPT=%SCRIPT_DIR%cursor-chat-auto-detector.js"
set "LOG_FILE=%SCRIPT_DIR%auto-detector.log"
set "PID_FILE=%SCRIPT_DIR%auto-detector.pid"

REM Check if Node.js is available
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed or not in PATH
    echo    Please install Node.js from https://nodejs.org/
    exit /b 1
)

REM Check if already running
if exist "%PID_FILE%" (
    for /f %%i in (%PID_FILE%) do set PID=%%i
    tasklist /FI "PID eq %PID%" 2>NUL | find /I /N "node.exe">NUL
    if "%ERRORLEVEL%"=="0" (
        echo ⚠️  Auto-detector is already running (PID: %PID%)
        echo    Stop it first: stop-auto-detector.bat
        exit /b 1
    ) else (
        REM PID file exists but process is dead, remove it
        del "%PID_FILE%"
    )
)

REM Start the detector
echo 🚀 Starting Cursor Chat Auto-Detector...
echo    Log file: %LOG_FILE%
echo    PID file: %PID_FILE%

REM Start in background using start command
start /B "" node "%DETECTOR_SCRIPT%" > "%LOG_FILE%" 2>&1

REM Get the PID (Windows doesn't easily give us the PID, so we'll use a workaround)
REM We'll write a marker and find the process
timeout /t 1 /nobreak >nul
for /f "tokens=2" %%i in ('tasklist /FI "IMAGENAME eq node.exe" /FO LIST ^| findstr /I "PID"') do (
    echo %%i > "%PID_FILE%"
    goto :found
)

:found
echo ✅ Auto-detector started
echo.
echo 📋 Commands:
echo    View logs: type "%LOG_FILE%"
echo    Stop: stop-auto-detector.bat
echo    Status: tasklist /FI "IMAGENAME eq node.exe"

endlocal

