"""
Phase 7 — End-to-end integration test: CSV path (7.2)

Exercises the full bridge pipeline on a minimal CSV fixture:
  read_headers → autodetect → run_convert → run_validate → write_runbook

No NiceGUI imports; no mocks — this is the same code path as the GUI wizard.

Run with:  pytest gui/tests/test_integration_csv.py -v
"""
import json
import os
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

import pytest


# ── Fixture helpers ───────────────────────────────────────

def _write_csv(content: str) -> str:
    """Write CSV text to a temp file; caller must delete."""
    with tempfile.NamedTemporaryFile(
        suffix=".csv", delete=False, mode="w", encoding="utf-8"
    ) as f:
        f.write(content)
        return f.name


# ── Full pipeline tests ───────────────────────────────────

class TestCSVFullPipeline:
    def test_minimal_three_row_csv_produces_valid_runbook(self):
        from gui import bridge
        from adapter.schema import validate

        tmp = _write_csv(
            "Task,Status,Assignee\n"
            "Deploy app,Completed,Alice\n"
            "Run smoke tests,Completed,Bob\n"
            "Notify stakeholders,Not Started,Carol\n"
        )
        try:
            fmt = bridge.detect_format(tmp)
            assert fmt == "csv"

            headers, row_count = bridge.read_headers(tmp, fmt)
            assert headers == ["Task", "Status", "Assignee"]
            assert row_count == 3

            mapping = bridge.autodetect(headers)
            data = bridge.run_convert(tmp, fmt, mapping)

            assert isinstance(data, dict)
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

    def test_csv_with_category_column(self):
        from gui import bridge

        tmp = _write_csv(
            "Phase,Task,Status\n"
            "Pre-flight,Check connectivity,Completed\n"
            "Pre-flight,Verify backups,Completed\n"
            "Cutover,Stop services,Not Started\n"
        )
        try:
            headers, _ = bridge.read_headers(tmp, "csv")
            mapping = bridge.autodetect(headers)
            # category_column should auto-detect "Phase"
            assert mapping.get("category_column") == "Phase"

            data = bridge.run_convert(tmp, "csv", mapping)
            assert "Pre-flight" in data
            assert "Cutover" in data
            assert len(data["Pre-flight"]) == 2
            assert len(data["Cutover"]) == 1

            errors = bridge.run_validate(data)
            assert errors == []
        finally:
            os.remove(tmp)

    def test_csv_with_full_iso_datetimes(self):
        from gui import bridge

        tmp = _write_csv(
            "Task,Status,Start Time,End Time\n"
            "Deploy,Completed,2026-04-15T09:00:00,2026-04-15T09:30:00\n"
            "Verify,Completed,2026-04-15T09:30:00,2026-04-15T10:00:00\n"
        )
        try:
            headers, _ = bridge.read_headers(tmp, "csv")
            mapping = bridge.autodetect(headers)
            data = bridge.run_convert(tmp, "csv", mapping)
            errors = bridge.run_validate(data)
            assert errors == []

            tasks = [t for v in data.values() if isinstance(v, list) for t in v]
            assert any(t.get("startTime", "").startswith("2026") for t in tasks)
        finally:
            os.remove(tmp)

    def test_csv_date_plus_time_columns_produce_full_iso(self):
        """startDate + startTime columns are merged into a single ISO datetime."""
        from gui import bridge

        tmp = _write_csv(
            "Task,Status,Date,Start,End\n"
            "Deploy,Completed,2026-04-15,09:00:00,09:30:00\n"
        )
        try:
            headers, _ = bridge.read_headers(tmp, "csv")
            mapping = bridge.autodetect(headers)
            # Manually wire startDate/endDate since "Date" may not auto-detect both
            mapping["columns"]["startDate"] = "Date"
            mapping["columns"]["endDate"] = "Date"
            mapping["columns"]["startTime"] = "Start"
            mapping["columns"]["endTime"] = "End"

            data = bridge.run_convert(tmp, "csv", mapping)
            tasks = [t for v in data.values() if isinstance(v, list) for t in v]
            assert len(tasks) == 1
            assert tasks[0]["startTime"] == "2026-04-15T09:00:00"
            assert tasks[0]["endTime"] == "2026-04-15T09:30:00"

            errors = bridge.run_validate(data)
            assert errors == []
        finally:
            os.remove(tmp)

    def test_csv_status_mapping_applied(self):
        """Source status values are mapped to canonical values via status_mapping."""
        from gui import bridge

        tmp = _write_csv(
            "Task,Status\n"
            "Deploy,Done\n"
            "Verify,WIP\n"
            "Notify,Pending\n"
        )
        try:
            mapping = bridge.autodetect(["Task", "Status"])
            data = bridge.run_convert(tmp, "csv", mapping)
            tasks = [t for v in data.values() if isinstance(v, list) for t in v]

            statuses = {t["task"]: t["status"] for t in tasks}
            assert statuses["Deploy"] == "Completed"
            assert statuses["Verify"] == "In Progress"
            assert statuses["Notify"] == "Not Started"
        finally:
            os.remove(tmp)

    def test_pipeline_quality_report_has_expected_structure(self):
        from gui import bridge

        tmp = _write_csv("Task,Status\nDeploy,Completed\nVerify,Completed\n")
        try:
            mapping = bridge.autodetect(["Task", "Status"])
            data = bridge.run_convert(tmp, "csv", mapping)
            report = bridge.run_quality(data)
            assert set(report.keys()) >= {"errors", "warnings", "info"}
            assert isinstance(report["errors"], list)
            assert isinstance(report["warnings"], list)
            assert isinstance(report["info"], list)
        finally:
            os.remove(tmp)
