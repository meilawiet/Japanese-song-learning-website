@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "server\.venv\Scripts\python.exe" (
  echo.
  echo [UTA] Python virtual environment was not found.
  echo Please complete the one-time setup steps in README.md first.
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo.
  echo [UTA] Node.js and npm were not found.
  echo Please install Node.js, then run the setup steps in README.md once.
  echo.
  pause
  exit /b 1
)

netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  start "" "http://localhost:5173"
  exit /b 0
)

echo [UTA] Starting the local learning site...
start "UTA local server - keep this window open" /d "%~dp0" cmd /k npm.cmd run dev

:waitForWeb
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if not errorlevel 1 goto openBrowser

if not defined UTA_WAIT_SECONDS set UTA_WAIT_SECONDS=0
set /a UTA_WAIT_SECONDS+=1
if %UTA_WAIT_SECONDS% GEQ 15 goto openBrowser
timeout /t 1 /nobreak >nul
goto waitForWeb

:openBrowser
start "" "http://localhost:5173"
exit /b 0
