@echo off
setlocal EnableExtensions
title SHIFT HAPPENS - LAN server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is not installed. Install it, then run this file again.
  goto :end
)

rem Build once. The LAN build bundles everything, so dist\ runs with no node_modules and no internet.
if exist "dist\server\index.js" goto :built
if not exist "node_modules" (
  echo Installing dependencies - this step needs internet, once...
  call npm install
  if errorlevel 1 goto :end
)
echo Building the game...
call npm run build:lan
if errorlevel 1 goto :end
:built

if "%PORT%"=="" set "PORT=3000"
rem Listen on every network this laptop is on. To limit it to the hotspot: set HOST=192.168.137.1 before running.
if "%HOST%"=="" set "HOST=0.0.0.0"
set "NODE_ENV=production"
set "SH_DEV="

rem Let the other laptops in: inbound TCP on the game port, local subnet only. Needs admin, once.
netsh advfirewall firewall show rule name="SHIFT HAPPENS LAN" >nul 2>nul
if not errorlevel 1 goto :fw_ok
netsh advfirewall firewall add rule name="SHIFT HAPPENS LAN" dir=in action=allow protocol=TCP localport=%PORT% remoteip=localsubnet profile=any >nul 2>nul
if not errorlevel 1 goto :fw_ok
echo.
echo  WARNING: could not add the firewall rule. Close this window, right-click
echo  START_LAN_GAME.bat and pick "Run as administrator" once, or other laptops may not connect.
:fw_ok

rem Windows Mobile Hotspot gives the host 192.168.137.1
set "LANIP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue).Where({$_.IPAddress -like '192.168.137.*'})[0].IPAddress"`) do set "LANIP=%%i"

echo.
echo  ==========================================================
echo   SHIFT HAPPENS - LAN game
if defined LANIP (
  echo   All 3 players open:  http://%LANIP%:%PORT%
) else (
  echo   Hotspot address not found. Use a "players open" address below.
)
echo   Use Chrome or Edge. Keep this window open while playing.
echo  ==========================================================
echo.

node dist\server\index.js
echo.
echo Server stopped. If it says EADDRINUSE, port %PORT% is busy: close the other server or set PORT=3001.

:end
echo.
pause
