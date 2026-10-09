@echo off
setlocal

echo Garmin Intelligence prerequisite check
echo.

where node.exe >nul 2>nul
if errorlevel 1 (
  echo [MISSING] node.exe
) else (
  for /f "delims=" %%V in ('node.exe --version') do echo [OK] node.exe -^> %%V
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [MISSING] npm.cmd
) else (
  for /f "delims=" %%V in ('npm.cmd --version') do echo [OK] npm.cmd -^> %%V
)

where npx.cmd >nul 2>nul
if errorlevel 1 (
  echo [MISSING] npx.cmd
) else (
  for /f "delims=" %%V in ('npx.cmd --version') do echo [OK] npx.cmd -^> %%V
)

if exist "%USERPROFILE%\.garmin-mcp" (
  echo [OK] Garmin token directory exists ^(contents hidden^)
) else (
  echo [INFO] Garmin token directory does not exist yet
)

echo.
echo Never paste Garmin credentials, MFA codes, cookies, or tokens into chat or Git.
