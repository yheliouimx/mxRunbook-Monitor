"""
Phase 1 foundation tests.

Covers: state.py, bridge.py, and component importability.
No NiceGUI rendering (UI tests require a running server).

Run with:  pytest gui/tests/test_phase1_foundation.py -v
"""
import csv
import json
import os
import sys
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))


# ── state.py ─────────────────────────────────────────────

class TestAppState:
    def setup_method(self):
        from gui.state import AppState
        self.AppState = AppState

    def test_defaults(self):
        s = self.AppState()
        assert s.current_step == 1
        assert s.source_path is None
        assert s.raw_headers == []
        assert s.mapping == {}
        assert s.parsed_data == {}
        assert s.schema_errors == []
        assert s.quality_report == {}
        assert s.processing is False
        assert s.save_success is False

    def test_reset_clears_all_fields(self):
        s = self.AppState()
        s.current_step = 3
        s.source_path = "/tmp/test.csv"
        s.raw_headers = ["task", "status"]
        s.mapping = {"columns": {"task": "task"}}
        s.parsed_data = {"Cat": [{"task": "T1", "status": "Done"}]}
        s.schema_errors = ["error 1"]
        s.quality_report = {"errors": [], "warnings": [], "info": []}
        s.save_success = True
        s.reset()
        assert s.current_step == 1
        assert s.source_path is None
        assert s.raw_headers == []
        assert s.mapping == {}
        assert s.schema_errors == []
        assert s.save_success is False

    def test_reset_removes_temp_file(self):
        s = self.AppState()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as f:
            f.write(b"task,status\nDo thing,Done\n")
            tmp = f.name
        s.temp_path = tmp
        assert os.path.exists(tmp)
        s.reset()
        assert not os.path.exists(tmp)

    def test_singleton_is_shared(self):
        from gui.state import state as s1
        from gui.state import state as s2
        assert s1 is s2


# ── bridge.py ────────────────────────────────────────────

class TestBridgeDetectFormat:
    def test_csv_extension(self, tmp_path):
        from gui.bridge import detect_format
        p = tmp_path / "data.csv"
        p.write_text("task,status\n")
        assert detect_format(str(p)) == "csv"

    def test_xlsx_extension(self, tmp_path):
        from gui.bridge import detect_format
        p = tmp_path / "data.xlsx"
        p.write_bytes(b"PK")       # minimal magic bytes
        result = detect_format(str(p))
        assert result == "excel"

    def test_json_extension(self, tmp_path):
        from gui.bridge import detect_format
        p = tmp_path / "data.json"
        p.write_text("{}")
        assert detect_format(str(p)) == "json"


class TestBridgeReadHeaders:
    def test_csv_headers_and_row_count(self, tmp_path):
        from gui.bridge import read_headers
        p = tmp_path / "data.csv"
        p.write_text("task,status,assignee\nDo thing,Done,Alice\nOther,WIP,Bob\n")
        headers, count = read_headers(str(p), "csv")
        assert headers == ["task", "status", "assignee"]
        assert count == 2

    def test_csv_strips_whitespace(self, tmp_path):
        from gui.bridge import read_headers
        p = tmp_path / "data.csv"
        p.write_text(" task , status \nDo thing,Done\n")
        headers, _ = read_headers(str(p), "csv")
        assert headers == ["task", "status"]

    def test_csv_empty_raises(self, tmp_path):
        from gui.bridge import read_headers
        p = tmp_path / "empty.csv"
        p.write_text("")
        with pytest.raises(RuntimeError, match="no header row"):
            read_headers(str(p), "csv")

    def test_excel_headers(self, tmp_path):
        pytest.importorskip("openpyxl")
        import openpyxl
        from gui.bridge import read_headers
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["task", "status", "assignee"])
        ws.append(["Do thing", "Done", "Alice"])
        ws.append(["Other task", "WIP", "Bob"])
        path = str(tmp_path / "data.xlsx")
        wb.save(path)
        headers, count = read_headers(path, "excel")
        assert headers == ["task", "status", "assignee"]
        assert count == 2


class TestBridgeAutodetect:
    def test_returns_mapping_shape(self):
        from gui.bridge import autodetect
        result = autodetect(["Task Description", "Status", "Assignee", "Start Time"])
        assert "columns" in result
        assert "status_mapping" in result
        assert "category_column" in result

    def test_detects_task_and_status(self):
        from gui.bridge import autodetect
        result = autodetect(["Task", "Status", "Owner"])
        assert result["columns"].get("task") == "Task"
        assert result["columns"].get("status") == "Status"


class TestBridgeValidate:
    def test_valid_data_returns_empty(self):
        from gui.bridge import run_validate
        data = {"Category A": [{"task": "Do thing", "status": "Done"}]}
        assert run_validate(data) == []

    def test_missing_task_field(self):
        from gui.bridge import run_validate
        data = {"Cat": [{"status": "Done"}]}
        errors = run_validate(data)
        assert any("task" in e for e in errors)

    def test_missing_status_field(self):
        from gui.bridge import run_validate
        data = {"Cat": [{"task": "Do thing"}]}
        errors = run_validate(data)
        assert any("status" in e for e in errors)


class TestBridgeQuality:
    def test_returns_expected_keys(self):
        from gui.bridge import run_quality
        data = {"Cat": [{"task": "Do thing", "status": "Done"}]}
        result = run_quality(data)
        assert "errors" in result
        assert "warnings" in result
        assert "info" in result

    def test_empty_data_has_error(self):
        from gui.bridge import run_quality
        result = run_quality({})
        assert result["errors"]


class TestBridgeWriteRunbook:
    def test_writes_valid_json(self, tmp_path):
        from gui.bridge import write_runbook
        data = {"Cat": [{"task": "T1", "status": "Done"}]}
        out = str(tmp_path / "runbook.json")
        path = write_runbook(data, out)
        assert os.path.exists(path)
        with open(path) as f:
            loaded = json.load(f)
        assert "Cat" in loaded

    def test_merge_preserves_underscore_metadata(self, tmp_path):
        from gui.bridge import write_runbook
        # merge_preserved_keys only preserves _-prefixed keys (_issues, _health, etc.)
        # Per-task field merge (comment by taskId) is a Phase 5 enhancement.
        existing = {
            "Cat": [{"task": "T1", "status": "Done"}],
            "_issues": ["some issue"],
            "_health": "green",
        }
        out = str(tmp_path / "runbook.json")
        with open(out, "w") as f:
            json.dump(existing, f)
        new_data = {"Cat": [{"task": "T1", "status": "In Progress"}]}
        write_runbook(new_data, out)
        with open(out) as f:
            loaded = json.load(f)
        assert loaded.get("_issues") == ["some issue"]
        assert loaded.get("_health") == "green"


# ── components importability ──────────────────────────────

def test_components_importable():
    from gui.components.glass_card import glass_card
    from gui.components.status_badge import status_badge, VARIANT_CLASS
    from gui.components.step_header import step_header
    assert callable(glass_card)
    assert callable(status_badge)
    assert callable(step_header)
    assert "success" in VARIANT_CLASS


def test_status_badge_variant_mapping():
    from gui.components.status_badge import _STATUS_CLASS, VARIANT_CLASS
    assert _STATUS_CLASS["Completed"] == "badge-success"
    assert _STATUS_CLASS["Blocking"] == "badge-danger"
    assert VARIANT_CLASS["csv"] == "badge-info"
    assert VARIANT_CLASS["excel"] == "badge-success"


def test_app_importable():
    """app.py must be importable without starting a server."""
    import importlib
    mod = importlib.import_module("gui.app")
    assert hasattr(mod, "index")
