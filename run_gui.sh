#!/usr/bin/env bash
# run_gui.sh — Runbook Converter GUI launcher (Mac / Linux)
# Double-click or run:  bash run_gui.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Python detection ──────────────────────────────────────
PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" &>/dev/null; then
        version=$("$candidate" -c "import sys; print(sys.version_info[:2])" 2>/dev/null)
        if "$candidate" -c "import sys; assert sys.version_info >= (3,8)" 2>/dev/null; then
            PYTHON="$candidate"
            break
        fi
    fi
done

if [ -z "$PYTHON" ]; then
    echo "ERROR: Python 3.8 or later is required but was not found."
    echo "       Download it from https://www.python.org/downloads/"
    exit 1
fi

echo "Using $($PYTHON --version)"

# ── Install / upgrade GUI dependencies ───────────────────
echo "Installing dependencies from gui/requirements.txt..."
"$PYTHON" -m pip install -r gui/requirements.txt --quiet --upgrade

# ── Launch ────────────────────────────────────────────────
echo "Starting Runbook Converter at http://localhost:8080 ..."
echo "(Press Ctrl+C to stop)"
"$PYTHON" gui/app.py
