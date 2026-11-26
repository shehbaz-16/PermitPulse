@echo off
setlocal
cd /d "%~dp0"

set "PORTABLE_NODE=%LOCALAPPDATA%\node-portable\node-v26.13.1-win-x64"
if exist "%PORTABLE_NODE%\node.exe" set "PATH=%PORTABLE_NODE%;%PATH%"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js / npm was not found. Install Node 18+ from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install || (pause & exit /b 1)
)

start "" http://localhost:3000
echo PermitPulse Ontario is starting at http://localhost:3000  (close this window to stop it)
call npm start
pause
