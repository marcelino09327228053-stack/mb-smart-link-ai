@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)
echo Chrome will open automatically when the server is ready.
echo Keep this window open while using the AI listener.
node server.cjs --open
pause
