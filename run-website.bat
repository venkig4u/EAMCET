@echo off
title EAMCET Website - Dev Server
cd /d "%~dp0"
cd /d "Website"

:: Ensure Node.js is in PATH if installed in standard directory
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    if exist "C:\Program Files\nodejs\npm.cmd" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    )
)

echo ===================================================
echo            EAMCET Website Launcher
echo ===================================================
echo.

:: Check if port 3001 is occupied by a stale process and free it
netstat -ano | findstr :3001 | findstr LISTENING >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Freeing port 3001...
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do (
        taskkill /F /PID %%a >nul 2>nul
    )
)

echo Opening http://localhost:3001 in your browser...
start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3001"

echo Starting Next.js development server on port 3001...
echo (Press Ctrl+C in this window to stop the server)
echo.

call npm run dev -- -p 3001

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Server encountered an error or failed to start.
    pause
)
