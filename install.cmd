@echo off
setlocal
cd /d "%~dp0"
echo Ora installer
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
set EXITCODE=%ERRORLEVEL%
echo.
if not "%EXITCODE%"=="0" (
  echo Installation stopped with an error.
) else (
  echo Installation finished.
)
echo.
pause
exit /b %EXITCODE%
