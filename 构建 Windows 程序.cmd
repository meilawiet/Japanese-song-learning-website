@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 build
if errorlevel 1 pause
