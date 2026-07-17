@echo off
setlocal
cd /d "%~dp0"

if not exist "package.json" (
  echo ERROR: Extract this archive into the project root next to package.json.
  pause
  exit /b 1
)

if not exist "patch-files\src\App.tsx" (
  echo ERROR: Patch files are missing.
  pause
  exit /b 1
)

if not exist "src\App.tsx.before-storage-final.bak" copy /Y "src\App.tsx" "src\App.tsx.before-storage-final.bak" >nul

xcopy /E /I /Y "patch-files\src" "src" >nul
if errorlevel 1 (
  echo ERROR: Could not copy patch files.
  pause
  exit /b 1
)

echo Files copied.
call npm run typecheck
if errorlevel 1 (
  echo ERROR: TypeScript check failed.
  pause
  exit /b 1
)

call npm run build
if errorlevel 1 (
  echo ERROR: Production build failed.
  pause
  exit /b 1
)

echo SUCCESS: Patch installed and build passed.
echo Run: npm run dev
pause
