@echo off
rem Double-click to start OpenCaptions on Windows. It opens the dashboard in your browser; keep this window open.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   OpenCaptions needs Node.js, a free program. Opening its download page...
  echo   Install the LTS version, then double-click "Start OpenCaptions" again.
  echo.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)
node scripts\start.js %*
if errorlevel 1 pause
