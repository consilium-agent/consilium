@echo off
rem Starts the CONSILIUM desk on http://127.0.0.1:5120 (if it is not running yet) and opens it.
cd /d "%~dp0"
netstat -ano | findstr /r /c:"127.0.0.1:5120 .*LISTENING" >nul
if errorlevel 1 (
  echo Starting CONSILIUM desk...
  start "CONSILIUM desk" /min cmd /c "node server\server.mjs > data\server.log 2>&1"
  ping -n 4 127.0.0.1 >nul
) else (
  echo CONSILIUM desk is already running.
)
start "" http://127.0.0.1:5120/
