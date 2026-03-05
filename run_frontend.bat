@echo off
cd /d "%~dp0frontend"

set "NPM_CMD="
where npm >nul 2>&1 && set "NPM_CMD=npm"
if not defined NPM_CMD if exist "C:\Program Files\nodejs\npm.cmd" set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
if not defined NPM_CMD if exist "C:\Program Files (x86)\nodejs\npm.cmd" set "NPM_CMD=C:\Program Files (x86)\nodejs\npm.cmd"
if not defined NPM_CMD if exist "%APPDATA%\nvm\current\npm.cmd" set "NPM_CMD=%APPDATA%\nvm\current\npm.cmd"

if not defined NPM_CMD (
  echo [Error] npm not found. Please install Node.js and add it to PATH.
  echo.
  echo Download: https://nodejs.org/  ^(choose LTS^)
  echo After install, close this window, open a NEW terminal, then run this script again.
  echo.
  pause
  exit /b 1
)

echo Installing frontend dependencies...
call "%NPM_CMD%" install
if errorlevel 1 (
  echo Failed to run npm install.
  pause
  exit /b 1
)

echo.
echo Starting frontend at http://localhost:5173
echo.
call "%NPM_CMD%" run dev
pause
