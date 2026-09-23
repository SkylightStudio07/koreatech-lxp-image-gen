@echo off
setlocal
cd /d "%~dp0"

node scripts\launch-bridge.js
if errorlevel 1 (
  echo.
  echo Failed to start the local bridge. If you are upgrading, close the old bridge window first.
  echo See .local\broker.log for details.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open-chrome.ps1" -Url "https://ai.koreatech.ac.kr/AiCA/chat"
if errorlevel 1 (
  echo Google Chrome could not be opened. Open https://ai.koreatech.ac.kr/AiCA/chat manually.
  pause
  exit /b 1
)

echo School Image MCP is starting. Check the Chrome extension icon for connection status.
timeout /t 2 /nobreak >nul
