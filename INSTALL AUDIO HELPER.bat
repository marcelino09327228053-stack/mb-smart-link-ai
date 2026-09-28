@echo off
cd /d "%~dp0"
python -m venv windows-helper\.venv
if errorlevel 1 goto failed
windows-helper\.venv\Scripts\python.exe -m pip install --only-binary=:all: -r windows-helper\requirements.txt
if errorlevel 1 goto failed
echo Installed. Restart Knowledge Hub; its server starts the helper silently.
pause
exit /b 0
:failed
echo Installation failed. Use supported Windows Python 3.10-3.14 and check internet access.
pause
exit /b 1
