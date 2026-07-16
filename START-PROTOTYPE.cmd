@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto error
)

echo.
echo Open after start: http://localhost:5173/oauth-test
echo Stop the server with Ctrl+C.
echo.
call npm run dev
exit /b 0

:error
echo.
echo Failed to install dependencies.
pause
exit /b 1
