@echo off
echo Killing Node processes...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM npm.cmd 2>nul
echo Clearing npm cache...
npm cache clean --force
echo Done. Machine cleared.
pause
