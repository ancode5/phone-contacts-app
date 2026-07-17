@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 apply-github-storage-patch.py
) else (
  python apply-github-storage-patch.py
)
if errorlevel 1 (
  echo.
  echo Патч не применён. Прочитайте сообщение об ошибке выше.
  pause
  exit /b 1
)
echo.
echo Запускаю проверку TypeScript...
call npm run typecheck
if errorlevel 1 (
  echo.
  echo TypeScript нашёл ошибку. Не выполняйте git push и пришлите текст ошибки.
  pause
  exit /b 1
)
echo.
echo Проверяю production-сборку...
call npm run build
if errorlevel 1 (
  echo.
  echo Сборка завершилась ошибкой. Не выполняйте git push и пришлите текст ошибки.
  pause
  exit /b 1
)
echo.
echo Готово. Следуйте файлу GITHUB-DATA-STORAGE-INSTRUCTIONS.md
pause
