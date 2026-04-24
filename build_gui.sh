#!/usr/bin/env bash
# build_gui.sh — Mac/Linux build script for RunbookConverter
# Requires Python 3.8+.  Run from the repo root.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Locate Python ──────────────────────────────────────────
PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" &>/dev/null; then
        if "$candidate" -c "import sys; assert sys.version_info >= (3,8)" 2>/dev/null; then
            PYTHON="$candidate"
            break
        fi
    fi
done
if [ -z "$PYTHON" ]; then
    echo "ERROR: Python 3.8+ not found. Install it and retry."
    exit 1
fi

# ── Install runtime dependencies ──────────────────────────
echo "Installing runtime dependencies..."
"$PYTHON" -m pip install -r gui/requirements.txt --quiet --upgrade

# ── Install build tools ───────────────────────────────────
echo "Installing PyInstaller..."
"$PYTHON" -m pip install -r gui/requirements-build.txt --quiet --upgrade

# ── Build ─────────────────────────────────────────────────
echo "Building RunbookConverter..."
"$PYTHON" -m PyInstaller runbook_converter.spec --noconfirm

echo ""
echo "Build complete.  Executable: dist/RunbookConverter"
