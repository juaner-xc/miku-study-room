@echo off
cd /d "%~dp0"
if not exist "%~dp0MikuDeskLayer.exe" (
  echo Please extract the complete ZIP before installing.
  pause
  exit /b 1
)
start "" "%~dp0MikuDeskLayer.exe" --install
