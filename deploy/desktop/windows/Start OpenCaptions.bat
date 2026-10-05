@echo off
rem OpenCaptions without the launcher (if Windows or an antivirus blocks "Start OpenCaptions.exe"): double-click
rem this file inside the app folder. Same as the launcher: data in %LOCALAPPDATA%\OpenCaptions\data.
title OpenCaptions
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   OpenCaptions needs Node.js, a free program. Opening its download page...
  echo   Install the LTS version, then open OpenCaptions again.
  echo.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)
if not defined DATA_DIR set "DATA_DIR=%LOCALAPPDATA%\OpenCaptions\data"
if not defined GLOSSARY set "GLOSSARY=%DATA_DIR%\glossary.json"
if not defined SCHEDULE set "SCHEDULE=%DATA_DIR%\schedule.json"
node scripts\start.js %*
if errorlevel 1 pause
