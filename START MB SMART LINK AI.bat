@echo off
cd /d "I:\MB Smart Link AI"
set PID=
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5500 ^| findstr LISTENING') do set PID=%%a
if not defined PID start "MB Smart Link AI Server" /min node server.cjs
timeout /t 1 /nobreak >nul
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://127.0.0.1:5500/"
exit
