@echo off
setlocal
cd /d "%~dp0"
title PHILLY BADLANDZ V15 - SMOOTH FIGHTERS - PORT 3124
color 0C
set "PORT=3124"
echo.
echo  ========================================================
echo   PHILLY BADLANDZ - PHOTO-MATCHED FULL-BODY FIGHTERS
echo                  VERSION 15 - PORT 3124
echo  ========================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
echo Node.js LTS is required from https://nodejs.org/
 start "" https://nodejs.org/
 pause
 exit /b 1
)
if not exist node_modules (
echo Installing required packages...
 call npm install
 if errorlevel 1 (echo Dependency install failed.& pause & exit /b 1)
)
echo Checking port 3124 for an older server...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-RestMethod -Uri 'http://127.0.0.1:3124/health' -TimeoutSec 1; if ($r.version -ne 'V15-SMOOTH-ARCADE') { Write-Host 'PORT 3124 IS USED BY ANOTHER GAME: close it before starting V15.' -ForegroundColor Red; exit 44 } else { Write-Host 'V15 is already running. Opening the browser...' -ForegroundColor Green; exit 45 } } catch { exit 0 }"
if errorlevel 45 (
 start "" http://localhost:3124/motion-check.html
 goto :finish
)
if errorlevel 44 (
echo Please close the program occupying port 3124, then retry.
 pause
 exit /b 1
)
echo Starting the V15 fighting server at http://localhost:3124/
echo PHOTO CHECK: http://localhost:3124/motion-check.html
echo.
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0OPEN_GAME_FULLSCREEN.ps1"
node server.js
:finish
echo.
echo Server stopped, or was already open.
pause
