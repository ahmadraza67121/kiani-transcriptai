@echo off
title Kiani TranscriptAI
color 0A
cd /d "%~dp0"

echo.
echo  ============================================
echo     KIANI TRANSCRIPTAI
echo     YouTube Transcript Extractor
echo  ============================================
echo.

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Node.js nahi mila!
    echo.
    echo  Node.js install karein:
    echo  https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  [OK] Node.js: %NODE_VER%

:: Check .env file
if not exist ".env" (
    echo  [INFO] .env file bana rahe hain...
    echo DATABASE_URL=> ".env"
    echo  [OK] .env file ban gayi
)

:: Set environment variable to disable slow filesystem warning
set NEXT_TELEMETRY_DISABLED=1
set WATCHPACK_POLLING=true

:: Install dependencies
if not exist "node_modules" (
    echo.
    echo  [INFO] Dependencies install ho rahi hain...
    echo  [INFO] Pehli baar 2-3 minute lag sakte hain...
    echo.
    call npm install
    echo.
    echo  [OK] Dependencies install ho gayi!
)

echo.
echo  ============================================
echo.
echo     APP START HO RAHI HAI...
echo.
echo     Browser mein kholein:
echo     http://localhost:3000
echo.
echo     Band karne ke liye: Ctrl + C dabayein
echo.
echo  ============================================
echo.

:: Start in dev mode
call npx next dev

pause
