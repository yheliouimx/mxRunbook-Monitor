@echo off
REM run_gui.bat — Runbook Converter GUI launcher (Windows)
REM Double-click this file to install dependencies and open the wizard.

cd /d "%~dp0"

REM ── Python detection ─────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python was not found.
    echo        Download it from https://www.python.org/downloads/
    echo        Make sure to tick "Add Python to PATH" during install.
    pause
    exit /b 1
)

python -c "import sys; assert sys.version_info >= (3,8), 'need 3.8+'" 2>nul
if errorlevel 1 (
    echo ERROR: Python 3.8 or later is required.
    for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo        Found: %%v
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo Using %%v

REM ── Install / upgrade GUI dependencies ──────────────────
echo Installing dependencies from gui\requirements.txt...
python -m pip install -r gui\requirements.txt --quiet --upgrade
if errorlevel 1 (
    echo ERROR: pip install failed. Check your internet connection and try again.
    pause
    exit /b 1
)

REM ── Launch ───────────────────────────────────────────────
echo Starting Runbook Converter at http://localhost:8080 ...
echo (Close this window or press Ctrl+C to stop)
python gui\app.py
if errorlevel 1 (
    echo.
    echo The app exited with an error. See message above.
    pause
)
