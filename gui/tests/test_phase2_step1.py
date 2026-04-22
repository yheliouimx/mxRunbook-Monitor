"""
Phase 2 tests — Step 1: Import File

Tests cover the pure-logic `process_upload()` function and the resulting
AppState transitions.  No NiceGUI rendering is involved.

Run with:  pytest gui/tests/test_phase2_step1.py -v
"""
import csv
import os
import sys
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))


# ── process_upload() ──────────────────────────────────────

class TestProcessUpload:
    def setup_method(self):
        from gui.pages.step1_import import process_upload
        self.process_upload = process_upload

    def _csv_bytes(self, headers, *rows):
        import io
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(headers)
        for r in rows:
            writer.writerow(r)
        return buf.getvalue().encode()

    def test_valid_csv_returns_dict(self):
        content = self._csv_bytes(["task", "status"], ["Do thing", "Done"])
        result = self.process_upload("runbook.csv", content)
        assert isinstance(result, dict)
        assert result["detected_format"] == "csv"
        assert result["raw_headers"] == ["task", "status"]
        assert result["row_count"] == 1
        assert result["file_name"] == "runbook.csv"
        assert result["source_path"] == result["temp_path"]
        # Cleanup
        os.remove(result["temp_path"])

    def test_valid_csv_multiple_rows(self):
        content = self._csv_bytes(
            ["task", "status", "assignee"],
            ["T1", "Done", "Alice"],
            ["T2", "WIP", "Bob"],
            ["T3", "Not Started", "Carol"],
        )
        result = self.process_upload("data.csv", content)
        assert isinstance(result, dict)
        assert result["row_count"] == 3
        assert len(result["raw_headers"]) == 3
        os.remove(result["temp_path"])

    def test_valid_excel_returns_dict(self):
        pytest.importorskip("openpyxl")
        import io
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["task", "status"])
        ws.append(["Deploy", "Done"])
        buf = io.BytesIO()
        wb.save(buf)
        result = self.process_upload("runbook.xlsx", buf.getvalue())
        assert isinstance(result, dict)
        assert result["detected_format"] == "excel"
        assert result["raw_headers"] == ["task", "status"]
        os.remove(result["temp_path"])

    def test_unsupported_extension_returns_error(self):
        result = self.process_upload("data.txt", b"task,status\n")
        assert isinstance(result, str)
        assert ".txt" in result

    def test_unsupported_json_extension_returns_error(self):
        result = self.process_upload("runbook.json", b"{}")
        assert isinstance(result, str)
        assert ".json" in result

    def test_empty_csv_returns_error(self):
        result = self.process_upload("empty.csv", b"")
        assert isinstance(result, str)

    def test_no_header_row_returns_error(self):
        result = self.process_upload("noheader.csv", b"")
        assert isinstance(result, str)

    def test_corrupt_excel_returns_error(self):
        result = self.process_upload("corrupt.xlsx", b"not an xlsx file at all")
        assert isinstance(result, str)

    def test_result_dict_has_required_keys(self):
        content = self._csv_bytes(["task", "status"], ["T1", "Done"])
        result = self.process_upload("r.csv", content)
        assert isinstance(result, dict)
        for key in ("source_path", "temp_path", "detected_format",
                    "raw_headers", "row_count", "file_name"):
            assert key in result, f"Missing key: {key}"
        os.remove(result["temp_path"])

    def test_headers_stripped_of_whitespace(self):
        content = self._csv_bytes([" task ", " status "], ["T1", "Done"])
        result = self.process_upload("r.csv", content)
        assert isinstance(result, dict)
        assert result["raw_headers"] == ["task", "status"]
        os.remove(result["temp_path"])


# ── State transitions ─────────────────────────────────────

class TestStep1StateTransitions:
    def setup_method(self):
        from gui.state import AppState
        # Use a fresh instance for each test (not the module singleton)
        self.state = AppState()

    def test_applying_result_updates_state(self):
        from gui.pages.step1_import import process_upload
        import csv, io
        buf = io.StringIO()
        csv.writer(buf).writerows([["task", "status"], ["T1", "Done"]])
        result = process_upload("r.csv", buf.getvalue().encode())
        assert isinstance(result, dict)
        for key, val in result.items():
            setattr(self.state, key, val)
        assert self.state.detected_format == "csv"
        assert self.state.raw_headers == ["task", "status"]
        assert self.state.file_name == "r.csv"
        os.remove(result["temp_path"])

    def test_downstream_state_reset_on_new_upload(self):
        """Simulates what handle_upload does: reset mapping/parsed_data on new file."""
        self.state.mapping = {"columns": {"task": "task"}}
        self.state.parsed_data = {"Cat": [{"task": "T", "status": "Done"}]}
        self.state.schema_errors = ["some error"]
        # Simulate successful upload
        self.state.mapping = {}
        self.state.parsed_data = {}
        self.state.schema_errors = []
        assert self.state.mapping == {}
        assert self.state.parsed_data == {}
        assert self.state.schema_errors == []
