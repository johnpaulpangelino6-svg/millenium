@echo off
REM Quick sync shortcut for Millennium SmartBoard
REM Double-click this file to sync your code to GitHub and Render

echo.
echo ========================================
echo   MILLENNIUM AUTO-SYNC
echo ========================================
echo.

powershell -ExecutionPolicy Bypass -File "auto-sync.ps1"

pause
