@echo off
chcp 65001 >nul
rem 统一使用 UTF-8 代码页，避免中文注释和脚本文件名被 CMD 误读。
setlocal EnableExtensions
cd /d "%~dp0"

rem 先打开电脑网页；歌曲保存在浏览器里，必须由网页读取。
call "start-uta-website.cmd"
rem 网页启动失败时保留窗口并显示原因，避免双击运行后直接闪退。
if errorlevel 1 (
  echo.
  echo [UTA] The website did not start. Check the message above.
  echo [UTA] Press any key to close this window.
  pause >nul
  exit /b 1
)

if not exist "server\.venv\Scripts\python.exe" (
  echo [UTA] Please install the website first.
  pause
  exit /b 1
)

rem 恢复 USB 调试传歌：让手机的 localhost:8765 指向电脑上的临时传歌服务。
if exist "D:\ruanjiankaifa\AndroidSdk\platform-tools\adb.exe" (
  "D:\ruanjiankaifa\AndroidSdk\platform-tools\adb.exe" reverse tcp:8765 tcp:8765 >nul 2>nul
)

echo.
echo [UTA] Phone transfer is running on port 8765.
echo [UTA] Keep this window open until transfer is complete.
echo [UTA] Use the computer website to start sharing, then connect from the phone.
echo.
server\.venv\Scripts\python.exe -m uvicorn transfer_app:app --app-dir server --host 0.0.0.0 --port 8765
pause
