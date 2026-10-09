@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
rem 原网站启动逻辑已完整移到英文文件名的脚本，避免 CMD 误读中文调用目标。
call "start-uta-website.cmd"
exit /b %errorlevel%
