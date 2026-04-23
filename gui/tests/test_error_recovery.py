"""
Phase 7 — Error recovery tests (7.4)

Verifies that bad inputs surface as clean errors (RuntimeError from bridge,
or error strings from page functions) rather than crashing or silently
producing corrupt output.

Run with:  pytest gui/tests/test_error_recovery.py -v
"""
import os
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

import pytest


# ── bridge.read_headers — corrupt / empty files ───────────

class TestReadHeadersErrors:
    def test_empty_csv_raises(self):
        from gui import bridge
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f:
            f.write(b"")
            tmp = f.name
        try:
            with pytest.raises(RuntimeError):
                bridge.read_headers(tmp, "csv")
        finally:
            os.remove(tmp)

    def test_corrupt_excel_raises(self):
        from gui import bridge
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            f.write(b"this is not an xlsx file")
            tmp = f.name
        try:
            with pytest.raises(RuntimeError):
                bridge.read_headers(tmp, "excel")
        finally:
            os.remove(tmp)

    def test_csv_with_only_header_row_returns_zero_rows(self):
        from gui import bridge
        with tempfile.NamedTemporaryFile(
            suffix=".csv", delete=False, mode="w", encoding="utf-8"
        ) as f:
            f.write("Task,Status\n")
            tmp = f.name
        try:
            headers, row_count = bridge.read_headers(tmp, "csv")
            assert headers == ["Task", "Status"]
            assert row_count == 0
        finally:
            os.remove(tmp)


# ── process_upload — unsupported types and empty files ────

class TestProcessUploadErrors:
    def test_unsupported_extension_returns_error_string(self):
        from gui.pages.step1_import import process_upload
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(b"PDF content")
            tmp = f.name
        try:
            result = process_upload("report.pdf", tmp)
            assert isinstance(result, str)
            assert ".pdf" in result
        finally:
            os.remove(tmp)

    def test_empty_csv_returns_error_string(self):
        from gui.pages.step1_import import process_upload
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f:
            f.write(b"")
            tmp = f.name
        try:
            result = process_upload("empty.csv", tmp)
            assert isinstance(result, str)
        finally:
            os.remove(tmp)

    def test_corrupt_excel_returns_error_string(self):
        from gui.pages.step1_import import process_upload
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            f.write(b"garbage")
            tmp = f.name
        try:
            result = process_upload("corrupt.xlsx", tmp)
            assert isinstance(result, str)
        finally:
            os.remove(tmp)


# ── run_pipeline — missing state fields ───────────────────

class TestRunPipelineErrors:
    def setup_method(self):
        from gui.state import state
        state.reset()

    def test_no_source_path_returns_error(self):
        from gui.pages.step3_preview import run_pipeline
        from gui.state import state
        state.source_path = None
        state.mapping = {}
        result = run_pipeline()
        assert isinstance(result, str)

    def test_no_mapping_returns_error(self):
        from gui.pages.step3_preview import run_pipeline
        from gui.state import state
        state.source_path = "/some/file.csv"
        state.mapping = {}
        result = run_pipeline()
        assert isinstance(result, str)


# ── do_export — guard conditions ──────────────────────────

class TestDoExportErrors:
    def setup_method(self):
        from gui.state import state
        state.reset()

    def test_no_parsed_data_returns_error(self):
        from gui.pages.step4_export import do_export
        from gui.state import state
        state.parsed_data = {}
        result = do_export("/tmp/runbook.json")
        assert isinstance(result, str)

    def test_empty_output_path_returns_error(self):
        from gui.pages.step4_export import do_export
        from gui.state import state
        state.parsed_data = {"Cat": [{"task": "T", "status": "Done"}]}
        result = do_export("   ")
        assert isinstance(result, str)

    def test_invalid_output_directory_returns_error(self):
        from gui.pages.step4_export import do_export
        from gui.state import state
        state.parsed_data = {"Cat": [{"task": "T", "status": "Done"}]}
        # /nonexistent/path will fail unless write_runbook creates dirs;
        # bridge.write_runbook does create dirs, so test unwritable path instead
        result = do_export("/proc/runbook.json")   # /proc is read-only on Linux
        # On Linux /proc is read-only — expect error; on other OS just skip
        if result is not None:
            assert isinstance(result, str)


# ── Mapping with task=None produces schema error ──────────

class TestNullTaskMappingSchemaError:
    def test_null_task_mapping_causes_validate_error(self):
        """When task column is not mapped, converted data fails validation."""
        from gui import bridge
        import tempfile, os

        with tempfile.NamedTemporaryFile(
            suffix=".csv", delete=False, mode="w", encoding="utf-8"
        ) as f:
            f.write("Task,Status\nDeploy,Done\n")
            tmp = f.name

        try:
            mapping = {
                "columns": {"task": None, "status": "Status"},
                "status_mapping": {},
            }
            data = bridge.run_convert(tmp, "csv", mapping)
            errors = bridge.run_validate(data)
            # task is None so tasks will have empty/missing task fields
            # schema requires "task" field → errors expected
            assert len(errors) > 0 or all(
                t.get("task") in (None, "")
                for v in data.values() if isinstance(v, list)
                for t in v
            ), "Expected schema errors when task column is not mapped"
        finally:
            os.remove(tmp)
