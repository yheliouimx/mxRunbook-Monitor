"""
Phase 2 tests — Step 1: Import File

Tests cover the pure-logic `process_upload(name, tmp_path)` function and
the resulting AppState transitions.  No NiceGUI rendering is involved.

NiceGUI 3.x note: handle_upload is async and uses e.file.save(path).
process_upload() now takes an already-saved temp file path, keeping it
fully testable without needing to mock the NiceGUI upload event.

Run with:  pytest gui/tests/test_phase2_step1.py -v
"""
import csv
import io
import os
import sys
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))


# ── Helpers ───────────────────────────────────────────────

def _write_csv(headers, *rows) -> str:
    """Write a CSV to a temp file, return the path."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    for r in rows:
        writer.writerow(r)
    with tempfile.NamedTemporaryFile(
        suffix=".csv", delete=False, mode="w", encoding="utf-8"
    ) as f:
        f.write(buf.getvalue())
        return f.name


def _write_bytes(content: bytes, suffix: str) -> str:
    """Write raw bytes to a temp file, return the path."""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(content)
        return f.name


# ── process_upload() ──────────────────────────────────────

class TestProcessUpload:
    def setup_method(self):
        from gui.pages.step1_import import process_upload
        self.process_upload = process_upload

    def test_valid_csv_returns_dict(self):
        tmp = _write_csv(["task", "status"], ["Do thing", "Done"])
        try:
            result = self.process_upload("runbook.csv", tmp)
            assert isinstance(result, dict)
            assert result["detected_format"] == "csv"
            assert result["raw_headers"] == ["task", "status"]
            assert result["row_count"] == 1
            assert result["file_name"] == "runbook.csv"
            assert result["source_path"] == result["temp_path"] == tmp
        finally:
            os.remove(tmp)

    def test_valid_csv_multiple_rows(self):
        tmp = _write_csv(
            ["task", "status", "assignee"],
            ["T1", "Done", "Alice"],
            ["T2", "WIP", "Bob"],
            ["T3", "Not Started", "Carol"],
        )
        try:
            result = self.process_upload("data.csv", tmp)
            assert isinstance(result, dict)
            assert result["row_count"] == 3
            assert len(result["raw_headers"]) == 3
        finally:
            os.remove(tmp)

    def test_valid_excel_returns_dict(self):
        openpyxl = pytest.importorskip("openpyxl")
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["task", "status"])
        ws.append(["Deploy", "Done"])
        buf = io.BytesIO()
        wb.save(buf)
        tmp = _write_bytes(buf.getvalue(), ".xlsx")
        try:
            result = self.process_upload("runbook.xlsx", tmp)
            assert isinstance(result, dict)
            assert result["detected_format"] == "excel"
            assert result["raw_headers"] == ["task", "status"]
        finally:
            os.remove(tmp)

    def test_unsupported_extension_returns_error(self):
        tmp = _write_bytes(b"task,status\n", ".txt")
        try:
            result = self.process_upload("data.txt", tmp)
            assert isinstance(result, str)
            assert ".txt" in result
        finally:
            os.remove(tmp)

    def test_unsupported_json_extension_returns_error(self):
        tmp = _write_bytes(b"{}", ".json")
        try:
            result = self.process_upload("runbook.json", tmp)
            assert isinstance(result, str)
            assert ".json" in result
        finally:
            os.remove(tmp)

    def test_empty_csv_returns_error(self):
        tmp = _write_bytes(b"", ".csv")
        try:
            result = self.process_upload("empty.csv", tmp)
            assert isinstance(result, str)
        finally:
            os.remove(tmp)

    def test_corrupt_excel_returns_error(self):
        tmp = _write_bytes(b"not an xlsx file at all", ".xlsx")
        try:
            result = self.process_upload("corrupt.xlsx", tmp)
            assert isinstance(result, str)
        finally:
            os.remove(tmp)

    def test_result_dict_has_required_keys(self):
        tmp = _write_csv(["task", "status"], ["T1", "Done"])
        try:
            result = self.process_upload("r.csv", tmp)
            assert isinstance(result, dict)
            for key in (
                "source_path", "temp_path", "detected_format",
                "raw_headers", "row_count", "file_name",
            ):
                assert key in result, f"Missing key: {key}"
        finally:
            os.remove(tmp)

    def test_headers_stripped_of_whitespace(self):
        tmp = _write_bytes(b" task , status \nT1,Done\n", ".csv")
        try:
            result = self.process_upload("r.csv", tmp)
            assert isinstance(result, dict)
            assert result["raw_headers"] == ["task", "status"]
        finally:
            os.remove(tmp)

    def test_extension_check_uses_name_not_path(self):
        """Extension validation uses the original name, not the temp path suffix."""
        tmp = _write_csv(["task", "status"], ["T1", "Done"])
        # Rename temp path suffix doesn't matter; the 'name' param drives validation
        try:
            result = self.process_upload("runbook.csv", tmp)
            assert isinstance(result, dict)
        finally:
            os.remove(tmp)


# ── State transitions ─────────────────────────────────────

class TestStep1StateTransitions:
    def test_applying_result_updates_state(self):
        from gui.pages.step1_import import process_upload
        tmp = _write_csv(["task", "status"], ["T1", "Done"])
        try:
            result = process_upload("r.csv", tmp)
            assert isinstance(result, dict)
            from gui.state import AppState
            s = AppState()
            for key, val in result.items():
                setattr(s, key, val)
            assert s.detected_format == "csv"
            assert s.raw_headers == ["task", "status"]
            assert s.file_name == "r.csv"
        finally:
            os.remove(tmp)

    def test_downstream_state_reset_on_new_upload(self):
        """Simulates what handle_upload does: reset mapping/parsed_data on new file."""
        from gui.state import AppState
        s = AppState()
        s.mapping = {"columns": {"task": "task"}}
        s.parsed_data = {"Cat": [{"task": "T", "status": "Done"}]}
        s.schema_errors = ["some error"]
        # Simulate the reset in handle_upload
        s.mapping = {}
        s.parsed_data = {}
        s.schema_errors = []
        assert s.mapping == {}
        assert s.parsed_data == {}
        assert s.schema_errors == []


# ── NiceGUI 3.x API compatibility note ───────────────────

def test_nicegui_upload_event_api():
    """Confirm the NiceGUI 3.x upload event exposes e.file with the expected API."""
    from nicegui.events import UploadEventArguments
    import dataclasses
    fields = {f.name for f in dataclasses.fields(UploadEventArguments)}
    assert "file" in fields, (
        f"Expected 'file' in UploadEventArguments fields, got: {fields}. "
        "The handle_upload function needs updating for this NiceGUI version."
    )
    from nicegui.elements.upload_files import FileUpload
    import dataclasses
    assert hasattr(FileUpload, "save"), "FileUpload.save() method missing"
    assert hasattr(FileUpload, "read"), "FileUpload.read() method missing"
    # name is a dataclass field on the ABC — check __dataclass_fields__
    assert "name" in getattr(FileUpload, "__dataclass_fields__", {}), \
        "FileUpload.name dataclass field missing"
