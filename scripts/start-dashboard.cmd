@echo off
setlocal
cd /d "%~dp0..\dashboard"
start "" /min powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:4174'"
call npm.cmd run dev -- --port 4174
if errorlevel 1 pause
