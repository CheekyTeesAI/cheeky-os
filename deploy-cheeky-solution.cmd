@echo off
REM Launcher for deploy-cheeky-solution.ps1
SET scriptDir=%~dp0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%scriptDir%deploy-cheeky-solution.ps1" %*
