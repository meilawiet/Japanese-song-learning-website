@echo off
setlocal EnableExtensions
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1" %*
if errorlevel 1 (
  echo.
  echo [UTA] Setup did not finish. See the message above; retry after fixing it.
  pause
  exit /b 1
)
echo.
echo [UTA] Setup finished. Double-click the UTA start launcher in this folder.
pause
