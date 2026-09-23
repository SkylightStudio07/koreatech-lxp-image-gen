@echo off
setlocal
cd /d "%~dp0"

rem Keep an existing healthy bridge; otherwise start one in its own terminal.
node scripts\doctor.js >nul 2>nul
if errorlevel 1 start "School Image MCP Bridge" /D "%~dp0" "%ComSpec%" /k node src\broker.js

rem Wait briefly until the bridge has written its local connection files.
for /L %%i in (1,1,20) do (
  node scripts\doctor.js >nul 2>nul
  if not errorlevel 1 goto :bridge_ready
  timeout /t 1 /nobreak >nul
)

echo Could not start the local bridge. Check the School Image MCP Bridge window and Node.js installation.
pause
exit /b 1

:bridge_ready
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -LiteralPath '%~dp0.local\connect-bookmarklet.txt' -Raw | Set-Clipboard"
if errorlevel 1 (
  echo Could not copy the connection code to the clipboard.
  pause
  exit /b 1
)

start "" "https://ai.koreatech.ac.kr/AiCA/chat"
echo.
echo Bridge is ready and the current connection code is copied.
echo In the logged-in school tab, click your saved connection bookmark.
echo On first use, create a Chrome bookmark and paste the copied code into its URL field first.
echo If Chrome asks to allow local network access, choose Allow.
echo Keep this bridge window and the school chat tab open while using Claude Code.
pause
