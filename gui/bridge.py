"""
gui/bridge.py

Thin wrappers around adapter/ functions. All adapter imports are isolated here.
No business logic — just translate between the GUI's needs and the adapter API.
"""
from __future__ import annotations

import csv
import json
import os
import sys
import tempfile
from collections import OrderedDict
from pathlib import Path

# ── Adapter import ────────────────────────────────────────
# adapter/ lives one level above gui/
_ADAPTER_DIR = str(Path(__file__).parent.parent / "adapter")
if _ADAPTER_DIR not in sys.path:
    sys.path.insert(0, _ADAPTER_DIR)

try:
    from convert import convert as _convert, detect_format as _detect_format, merge_preserved_keys as _merge_preserved_keys
    from autodetect import autodetect_mapping as _autodetect_mapping
    from schema import validate as _validate
    from quality import check as _quality_check
    _ADAPTER_OK = True
except ImportError as _err:
    _ADAPTER_OK = False
    _ADAPTER_ERR = str(_err)


def _require_adapter() -> None:
    if not _ADAPTER_OK:
        raise RuntimeError(f"Adapter not available: {_ADAPTER_ERR}")


# ── Public API ────────────────────────────────────────────

def detect_format(source_path: str) -> str:
    """Return 'csv', 'excel', or 'json' for the given file path."""
    _require_adapter()
    try:
        return _detect_format(source_path)
    except Exception as exc:
        raise RuntimeError(f"Cannot detect format for '{os.path.basename(source_path)}': {exc}") from exc


def read_headers(source_path: str, fmt: str) -> tuple[list[str], int]:
    """
    Read column headers and approximate row count from a CSV or Excel file.
    Returns (headers, row_count).
    """
    try:
        if fmt == "csv":
            return _read_csv_headers(source_path)
        elif fmt == "excel":
            return _read_excel_headers(source_path)
        else:
            raise RuntimeError(f"Unsupported format for header reading: '{fmt}'")
    except PermissionError as exc:
        raise RuntimeError(f"File is locked or in use: {exc}") from exc
    except Exception as exc:
        raise RuntimeError(f"Cannot read headers: {exc}") from exc


def _read_csv_headers(path: str) -> tuple[list[str], int]:
    encodings = ["utf-8", "utf-8-sig", "latin-1", "cp1252"]
    for enc in encodings:
        try:
            with open(path, newline="", encoding=enc) as f:
                reader = csv.reader(f)
                headers = next(reader, [])
                if not headers:
                    raise RuntimeError("CSV file has no header row")
                row_count = sum(1 for _ in reader)
            return [h.strip() for h in headers if h.strip()], row_count
        except UnicodeDecodeError:
            continue
    raise RuntimeError("Could not decode CSV file (tried utf-8, latin-1, cp1252)")


def _read_excel_headers(path: str) -> tuple[list[str], int]:
    try:
        import openpyxl
    except ImportError as exc:
        raise RuntimeError("openpyxl is required to read Excel files") from exc

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    if not rows:
        raise RuntimeError("Excel file is empty")

    header_row = [str(c).strip() for c in rows[0] if c is not None]
    if not header_row:
        raise RuntimeError("Excel file has no header row or all header cells are empty")

    row_count = sum(
        1 for r in rows[1:]
        if any(c is not None for c in r)
    )
    return header_row, row_count


def autodetect(headers: list[str]) -> dict:
    """Run auto-detection on the given header list. Returns a mapping dict."""
    _require_adapter()
    try:
        return _autodetect_mapping(headers)
    except Exception as exc:
        raise RuntimeError(f"Auto-detect failed: {exc}") from exc


def run_convert(source_path: str, fmt: str, mapping: dict) -> dict:
    """Convert source file to runbook dict using the given mapping."""
    _require_adapter()
    try:
        result = _convert(source_path, fmt, mapping)
        return dict(result)
    except PermissionError as exc:
        raise RuntimeError(f"File is locked or in use: {exc}") from exc
    except Exception as exc:
        raise RuntimeError(f"Conversion failed: {exc}") from exc


def run_validate(data: dict) -> list[str]:
    """Validate runbook dict against schema. Returns list of error strings."""
    _require_adapter()
    try:
        return _validate(data)
    except Exception as exc:
        raise RuntimeError(f"Validation failed: {exc}") from exc


def run_quality(data: dict) -> dict:
    """Run quality checks. Returns dict with 'errors', 'warnings', 'info' lists."""
    _require_adapter()
    try:
        return _quality_check(data)
    except Exception as exc:
        raise RuntimeError(f"Quality check failed: {exc}") from exc


def write_runbook(data: dict, output_path: str) -> str:
    """
    Write runbook JSON to output_path, merging with existing file if present.
    Returns the absolute path of the written file.
    """
    _require_adapter()
    try:
        output_path = os.path.abspath(output_path)
        if os.path.exists(output_path):
            existing = _merge_preserved_keys(output_path, OrderedDict(data))
            payload = dict(existing)
        else:
            payload = data

        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        return output_path
    except PermissionError as exc:
        raise RuntimeError(f"Cannot write to '{output_path}': file is locked or in use") from exc
    except Exception as exc:
        raise RuntimeError(f"Failed to write runbook: {exc}") from exc


def bytes_to_temp_file(data: bytes, suffix: str) -> str:
    """Write raw upload bytes to a temp file and return its path."""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(data)
        return f.name
