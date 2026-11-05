@echo off
rem The weekly full backup of production, as Windows Task Scheduler runs it.
rem
rem Registered as the task "Vardenia weekly backup" (see backups/README.md,
rem "Running it every week"). It runs backup:weekly from the repo, writes the
rem whole output to backups\weekly\logs\, and on a failure leaves
rem "LAST RUN FAILED.txt" in backups\weekly and shows a message on screen, so a
rem backup that silently stopped working does not go unnoticed for months.

setlocal
set "REPO=%~dp0.."
for %%I in ("%REPO%\..\backups\weekly") do set "OUT=%%~fI"
if not exist "%OUT%\logs" mkdir "%OUT%\logs"

for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set "STAMP=%%d"
set "LOG=%OUT%\logs\%STAMP%.log"

cd /d "%REPO%"
call pnpm.cmd -s --filter @vardenia/web backup:weekly > "%LOG%" 2>&1

if errorlevel 1 (
  > "%OUT%\LAST RUN FAILED.txt" echo The weekly backup of %STAMP% failed. See logs\%STAMP%.log
  msg "%USERNAME%" /TIME:86400 "The Vardenia weekly backup failed. Details: %LOG%"
  exit /b 1
)

if exist "%OUT%\LAST RUN FAILED.txt" del "%OUT%\LAST RUN FAILED.txt"
exit /b 0
