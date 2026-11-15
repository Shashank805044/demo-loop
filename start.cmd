@echo off
rem Double-click to start the app. Bypass is scoped to this one script run.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
pause
