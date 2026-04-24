"""
Phase 7 — End-to-end integration test: Excel path (7.3)

Exercises the full bridge pipeline on minimal .xlsx fixtures created
with openpyxl.  No NiceGUI imports; no mocks.

Run with:  pytest gui/tests/test_integration_excel.py -v
"""
import io
import json
import os
import sys
import tempfile
from datetime import date as dt_date, time as dt_time
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

import pytest

openpyxl = pytest.importorskip("openpyxl")


# ── Fixture helpers ───────────────────────────────────────

def _make_xlsx(rows: list[list], sheet_name: str = "Sheet") -> str:
    """Build a minimal .xlsx from a list-of-rows and write to a temp file."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_name
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
        f.write(buf.getvalue())
        return f.name


# ── Full pipeline tests ───────────────────────────────────

class TestExcelFullPipeline:
    def test_minimal_xlsx_produces_valid_runbook(self):
        from gui import bridge
        from adapter.schema import validate

        tmp = _make_xlsx([
            ["Task", "Status", "Assignee"],
            ["Deploy app", "Completed", "Alice"],
            ["Run smoke tests", "Completed", "Bob"],
            ["Notify stakeholders", "Not Started", "Carol"],
        ])
        try:
            fmt = bridge.detect_format(tmp)
            assert fmt == "excel"

            headers, row_count = bridge.read_headers(tmp, fmt)
            assert "Task" in headers
            assert "Status" in headers
            assert row_count == 3

            mapping = bridge.autodetect(headers)
            data = bridge.run_convert(tmp, fmt, mapping)

            tasks = [t for k, v in data.items()
                     if not k.startswith("_") for t in v]
            assert len(tasks) == 3

            errors = bridge.run_validate(data)
            assert errors == [], f"Schema errors: {errors}"

            with tempfile.TemporaryDirectory() as d:
                out = os.path.join(d, "runbook.json")
                bridge.write_runbook(data, out)
                with open(out, encoding="utf-8") as f:
                    on_disk = json.load(f)
            assert validate(on_disk) == []
        finally:
            os.remove(tmp)

    def test_xlsx_with_category_column(self):
        from gui import bridge

        tmp = _make_xlsx([
            ["Phase", "Task", "Status"],
            ["Pre-flight", "Check connectivity", "Completed"],
            ["Pre-flight", "Verify backups", "Completed"],
            ["Cutover", "Stop services", "Not Started"],
        ])
        try:
            headers, _ = bridge.read_headers(tmp, "excel")
            mapping = bridge.autodetect(headers)
            assert mapping.get("category_column") == "Phase"

            data = bridge.run_convert(tmp, "excel", mapping)
            assert "Pre-flight" in data
            assert "Cutover" in data

            errors = bridge.run_validate(data)
            assert errors == []
        finally:
            os.remove(tmp)

    def test_xlsx_date_object_plus_time_string(self):
        """Date column (Python date) + time-string column → full ISO datetime."""
        from gui import bridge

        tmp = _make_xlsx([
            ["Task", "Status", "Date", "Start", "End"],
            ["Deploy", "Completed", dt_date(2026, 4, 15), "09:00:00", "09:30:00"],
        ])
        try:
            headers, _ = bridge.read_headers(tmp, "excel")
            mapping = bridge.autodetect(headers)
            mapping["columns"]["startDate"] = "Date"
            mapping["columns"]["endDate"] = "Date"
            mapping["columns"]["startTime"] = "Start"
            mapping["columns"]["endTime"] = "End"

            data = bridge.run_convert(tmp, "excel", mapping)
            tasks = [t for v in data.values() if isinstance(v, list) for t in v]
            assert len(tasks) == 1
            assert tasks[0]["startTime"].startswith("2026-04-15")
            assert tasks[0]["endTime"].startswith("2026-04-15")

            errors = bridge.run_validate(data)
            assert errors == []
        finally:
            os.remove(tmp)

    def test_xlsx_runbook_date_anchor(self):
        """runbook_date in mapping combines with bare time cells."""
        from gui import bridge

        tmp = _make_xlsx([
            ["Task", "Status", "Start", "End"],
            ["Deploy", "Completed", "09:00:00", "09:30:00"],
        ])
        try:
            mapping = {
                "columns": {
                    "task": "Task", "status": "Status",
                    "startTime": "Start", "endTime": "End",
                },
                "runbook_date": "2026-04-15",
            }
            data = bridge.run_convert(tmp, "excel", mapping)
            tasks = [t for v in data.values() if isinstance(v, list) for t in v]
            assert tasks[0]["startTime"] == "2026-04-15T09:00:00"
            assert tasks[0]["endTime"]   == "2026-04-15T09:30:00"

            errors = bridge.run_validate(data)
            assert errors == []
        finally:
            os.remove(tmp)

    def test_xlsx_bare_times_without_anchor_are_schema_valid(self):
        """Bare HH:MM:SS times pass schema validation (no date anchor needed)."""
        from gui import bridge

        tmp = _make_xlsx([
            ["Task", "Status", "Start", "End"],
            ["Deploy", "Completed", "09:00:00", "09:30:00"],
            ["Verify", "Completed", "09:30:00", "10:00:00"],
        ])
        try:
            mapping = {
                "columns": {"task": "Task", "status": "Status",
                            "startTime": "Start", "endTime": "End"},
            }
            data = bridge.run_convert(tmp, "excel", mapping)
            errors = bridge.run_validate(data)
            assert errors == [], f"Unexpected schema errors: {errors}"
        finally:
            os.remove(tmp)

    def test_xlsx_output_json_is_schema_valid_end_to_end(self):
        """Full pipeline: xlsx → convert → validate → write → re-validate on disk."""
        from gui import bridge
        from adapter.schema import validate

        tmp = _make_xlsx([
            ["Phase", "Task", "Status", "Assignee",
             "Start Time", "End Time"],
            ["Pre-flight", "Check VPN", "Completed", "Alice",
             "2026-04-15T08:00:00", "2026-04-15T08:30:00"],
            ["Pre-flight", "Verify DB", "Completed", "Bob",
             "2026-04-15T08:30:00", "2026-04-15T09:00:00"],
            ["Cutover", "Deploy", "Not Started", "Carol",
             "2026-04-15T09:00:00", "2026-04-15T10:00:00"],
        ])
        try:
            headers, _ = bridge.read_headers(tmp, "excel")
            mapping = bridge.autodetect(headers)
            data = bridge.run_convert(tmp, "excel", mapping)
            assert bridge.run_validate(data) == []

            with tempfile.TemporaryDirectory() as d:
                out = os.path.join(d, "runbook.json")
                bridge.write_runbook(data, out)
                with open(out, encoding="utf-8") as f:
                    on_disk = json.load(f)

            assert validate(on_disk) == []
            assert "Pre-flight" in on_disk
            assert "Cutover" in on_disk
        finally:
            os.remove(tmp)
