@echo off
setlocal
cd /d "%~dp0\.."

echo ============================================
echo    Pocket Dev-C++  -  Local preview
echo ============================================
echo.
set "PY="
where python >nul 2>nul
if not errorlevel 1 set "PY=python"
if not defined PY (
  where py >nul 2>nul
  if not errorlevel 1 set "PY=py"
)
if not defined PY goto :nopython

echo This PC:   http://localhost:8080
echo.
echo iPad (same WiFi as this PC):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo    http://%%b:8080
)
echo.
echo Notes:
echo   - if iPad cannot open it, allow python through Windows Firewall
echo   - keep this window open while testing
echo   - stop the server: Ctrl+C
echo.
start "" http://localhost:8080
echo ============ server running ============
%PY% -m http.server 8080
goto :eof

:nopython
echo [ERROR] Python not found.
echo   Option 1: install Python from https://www.python.org/downloads/ (check "Add to PATH")
echo   Option 2: with Node.js:  npx --yes http-server -p 8080
echo.
pause
