@echo off
REM build_gui.bat — Windows build script for RunbookConverter.exe
REM
REM Usage:
REM   build_gui.bat              fast build, standard size (~60-80 MB)
REM   set UPX=1 & build_gui.bat  slower build, ~20%% smaller (needs upx.exe in PATH)
REM
REM Output: dist\RunbookConverter.exe

setlocal enabledelayedexpansion

REM ── Locate Python ──────────────────────────────────────
where python >nul 2>&1
if errorlevel 1 (
    echo ERROR: python not found in PATH. Install Python 3.8+ and try again.
    pause & exit /b 1
)
python -c "import sys; assert sys.version_info >= (3,8), 'need 3.8+'" 2>nul
if errorlevel 1 (
    echo ERROR: Python 3.8 or newer is required.
    pause & exit /b 1
)

REM ── Install runtime dependencies ───────────────────────
echo Installing runtime dependencies...
python -m pip install -r gui\requirements.txt --quiet --upgrade
if errorlevel 1 ( echo ERROR: pip install failed. & pause & exit /b 1 )

REM ── Install build tools ────────────────────────────────
echo Installing PyInstaller...
python -m pip install -r gui\requirements-build.txt --quiet --upgrade
if errorlevel 1 ( echo ERROR: pip install (build) failed. & pause & exit /b 1 )

REM ── Build ──────────────────────────────────────────────
echo Building RunbookConverter.exe ...
python -m PyInstaller runbook_converter.spec --noconfirm
if errorlevel 1 ( echo ERROR: PyInstaller failed. & pause & exit /b 1 )

echo.
echo Build complete.  Executable: dist\RunbookConverter.exe
pause
