@echo off
setlocal
cd /d "%~dp0"
echo Ora uninstaller
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall.ps1"
set EXITCODE=%ERRORLEVEL%
echo.
if not "%EXITCODE%"=="0" (
  echo Uninstallation stopped with an error. Review the message above.
) else (
  echo Uninstallation finished.
)
echo.
pause
exit /b %EXITCODE%
