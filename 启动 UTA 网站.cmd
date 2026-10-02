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

if exist ".tools\node-v24.21.0-win-x64\npm.cmd" set "PATH=%~dp0.tools\node-v24.21.0-win-x64;%PATH%"
if exist ".tools\node-v24.21.0-win-arm64\npm.cmd" set "PATH=%~dp0.tools\node-v24.21.0-win-arm64;%PATH%"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo.
  echo [UTA] Node.js and npm were not found.
  echo Please run the UTA setup launcher in this folder first.
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
if %UTA_WAIT_SECONDS% GEQ 30 goto startupFailed
timeout /t 1 /nobreak >nul
goto waitForWeb

:startupFailed
echo.
echo [UTA] The web service did not start within 30 seconds.
echo Check the "UTA local server" window for the actual error.
echo.
pause
exit /b 1

:openBrowser
start "" "http://localhost:5173"
exit /b 0
