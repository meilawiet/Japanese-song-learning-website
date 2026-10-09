@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows.ps1 setup
if errorlevel 1 pause
