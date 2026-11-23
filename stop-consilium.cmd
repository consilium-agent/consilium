@echo off
rem Stops only the process listening on port 5120 (the CONSILIUM desk).
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"127.0.0.1:5120 .*LISTENING"') do (
  echo Stopping CONSILIUM desk, PID %%p
  taskkill /PID %%p /F >nul
)
