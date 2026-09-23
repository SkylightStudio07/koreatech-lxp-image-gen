@echo off
setlocal
cd /d "%~dp0"

node scripts\build-extension.js
if errorlevel 1 (
  echo Could not build the Chrome connector. Check Node.js installation.
  pause
  exit /b 1
)

start "" explorer.exe "%~dp0extension"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open-chrome.ps1" -Url "chrome://extensions"
if errorlevel 1 (
  echo Google Chrome could not be opened. Open chrome://extensions manually.
  pause
  exit /b 1
)
echo.
echo In Chrome, turn on Developer mode, choose Load unpacked, and select the opened extension folder.
echo Approve the extension and its site access. This is a one-time setup for this Chrome profile.
echo Pin the extension if you want one-click status access.
echo After loading, run start-school-image.bat. The connector starts automatically on chat page loads and refreshes.
pause
