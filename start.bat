@echo off
title Shotcraft - local server
cd /d "%~dp0"

set PY=
where py >nul 2>nul && set PY=py
if "%PY%"=="" (where python >nul 2>nul && set PY=python)
if "%PY%"=="" (
  echo Python was not found. Install it from https://www.python.org/downloads/
  pause
  exit /b 1
)

echo.
echo   Shotcraft is running at:  http://localhost:8123
echo   Keep this window open. Press Ctrl+C to stop.
echo.

start "" http://localhost:8123
%PY% -m http.server 8123 --bind 127.0.0.1
pause
