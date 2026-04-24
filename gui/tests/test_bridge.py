"""
Phase 7 — bridge API contract tests (7.1)

Verifies the public surface of gui/bridge.py as a standalone spec.
All calls go through the real adapter layer; no mocks.

Run with:  pytest gui/tests/test_bridge.py -v
"""
import json
import os
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))


# ── detect_format ─────────────────────────────────────────

class TestDetectFormat:
    def test_csv_extension(self):
        from gui import bridge
        assert bridge.detect_format("data.csv") == "csv"

    def test_xlsx_extension(self):
        from gui import bridge
        assert bridge.detect_format("runbook.xlsx") == "excel"

    def test_xls_extension(self):
        from gui import bridge
        assert bridge.detect_format("runbook.xls") == "excel"

    def test_json_extension(self):
        from gui import bridge
        assert bridge.detect_format("runbook.json") == "json"

    def test_case_insensitive(self):
        from gui import bridge
        assert bridge.detect_format("DATA.CSV") == "csv"
        assert bridge.detect_format("RUNBOOK.XLSX") == "excel"


# ── autodetect ────────────────────────────────────────────

class TestAutodetect:
    def test_returns_dict_with_required_keys(self):
        from gui import bridge
        result = bridge.autodetect(["Task", "Status", "Assignee"])
        assert isinstance(result, dict)
        assert "columns" in result
        assert "status_mapping" in result

    def test_columns_maps_task_and_status(self):
        from gui import bridge
        result = bridge.autodetect(["Task Description", "Status", "Owner"])
        cols = result["columns"]
        assert cols.get("task") is not None
        assert cols.get("status") is not None

    def test_status_mapping_has_canonical_values(self):
        from gui import bridge
        result = bridge.autodetect(["Task", "Status"])
        sm = result["status_mapping"]
        assert isinstance(sm, dict)
        assert len(sm) > 0
        # All values should be canonical runbook statuses
        canonical = {"Not Started", "In Progress", "Completed", "Blocking", "Unneeded"}
        for canonical_val in sm.values():
            assert canonical_val in canonical, f"Non-canonical status: {canonical_val!r}"

    def test_empty_headers_returns_empty_columns(self):
        from gui import bridge
        result = bridge.autodetect([])
        assert result["columns"] == {} or all(v is None for v in result["columns"].values())

    def test_detects_start_date_end_date(self):
        from gui import bridge
        result = bridge.autodetect(["Task", "Status", "Start Date", "Start Time", "End Date", "End Time"])
        cols = result["columns"]
        assert cols.get("startDate") == "Start Date"
        assert cols.get("endDate") == "End Date"


# ── run_validate ──────────────────────────────────────────

class TestRunValidate:
    def test_valid_runbook_returns_empty_list(self):
        from gui import bridge
        data = {
            "Phase 1": [
                {"task": "Deploy app", "status": "Completed",
                 "startTime": "2026-04-15T09:00:00", "endTime": "2026-04-15T09:30:00"}
            ]
        }
        errors = bridge.run_validate(data)
        assert errors == []

    def test_missing_task_field_returns_error(self):
        from gui import bridge
        data = {"Cat": [{"status": "Done"}]}
        errors = bridge.run_validate(data)
        assert any("task" in e for e in errors)

    def test_missing_status_field_returns_error(self):
        from gui import bridge
        data = {"Cat": [{"task": "Do something"}]}
        errors = bridge.run_validate(data)
        assert any("status" in e for e in errors)

    def test_invalid_datetime_format_returns_error(self):
        from gui import bridge
        data = {"Cat": [{"task": "T", "status": "Done", "startTime": "not-a-date"}]}
        errors = bridge.run_validate(data)
        assert any("startTime" in e for e in errors)

    def test_bare_time_is_valid(self):
        from gui import bridge
        data = {"Cat": [{"task": "T", "status": "Done", "startTime": "09:00:00"}]}
        errors = bridge.run_validate(data)
        assert errors == []

    def test_reserved_keys_ignored(self):
        from gui import bridge
        data = {
            "_issues": [{"id": "1"}],
            "_health": "Green",
            "Cat": [{"task": "T", "status": "Done"}],
        }
        errors = bridge.run_validate(data)
        assert errors == []


# ── run_quality ───────────────────────────────────────────

class TestRunQuality:
    def test_returns_dict_with_three_keys(self):
        from gui import bridge
        data = {"Cat": [{"task": "T", "status": "Done"}]}
        report = bridge.run_quality(data)
        assert "errors" in report
        assert "warnings" in report
        assert "info" in report

    def test_empty_data_has_error(self):
        from gui import bridge
        report = bridge.run_quality({})
        assert len(report["errors"]) > 0

    def test_clean_data_has_no_errors(self):
        from gui import bridge
        data = {
            "Phase 1": [
                {"task": "Deploy", "status": "Completed",
                 "startTime": "2026-04-15T09:00:00", "endTime": "2026-04-15T09:30:00",
                 "assignee": "Alice"},
                {"task": "Verify", "status": "Completed",
                 "startTime": "2026-04-15T09:30:00", "endTime": "2026-04-15T10:00:00",
                 "assignee": "Bob"},
            ]
        }
        report = bridge.run_quality(data)
        assert report["errors"] == []

    def test_bare_time_produces_warning(self):
        from gui import bridge
        data = {"Cat": [{"task": "T", "status": "Done", "startTime": "09:00:00"}]}
        report = bridge.run_quality(data)
        assert any("no date component" in w for w in report["warnings"])


# ── write_runbook ─────────────────────────────────────────

class TestWriteRunbook:
    def test_writes_parseable_json(self):
        from gui import bridge
        data = {"Phase 1": [{"task": "Deploy", "status": "Completed"}]}
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "runbook.json")
            bridge.write_runbook(data, out)
            with open(out, encoding="utf-8") as f:
                parsed = json.load(f)
        assert parsed["Phase 1"][0]["task"] == "Deploy"

    def test_returns_absolute_path(self):
        from gui import bridge
        data = {"Cat": [{"task": "T", "status": "Done"}]}
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "runbook.json")
            returned = bridge.write_runbook(data, out)
        assert os.path.isabs(returned)

    def test_merges_underscore_keys_from_existing(self):
        from gui import bridge
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "runbook.json")
            existing = {"_issues": [{"id": "x"}], "_health": "Red",
                        "Cat": [{"task": "Old", "status": "Done"}]}
            with open(out, "w") as f:
                json.dump(existing, f)

            new_data = {"Cat": [{"task": "New", "status": "Done"}]}
            bridge.write_runbook(new_data, out)

            with open(out, encoding="utf-8") as f:
                merged = json.load(f)

        assert merged["_issues"][0]["id"] == "x"
        assert merged["_health"] == "Red"
        assert merged["Cat"][0]["task"] == "New"

    def test_creates_parent_directory(self):
        from gui import bridge
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "nested", "dir", "runbook.json")
            bridge.write_runbook({"Cat": [{"task": "T", "status": "Done"}]}, out)
            assert os.path.exists(out)
