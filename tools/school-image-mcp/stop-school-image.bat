@echo off
setlocal
cd /d "%~dp0"
node scripts\stop-bridge.js
timeout /t 2 /nobreak >nul
