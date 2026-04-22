"""
Phase 5 tests — Step 4: Export

Tests cover the pure-logic functions in step4_export.py:
default_output_path, do_export.
No NiceGUI rendering involved.

Run with:  pytest gui/tests/test_phase5_step4.py -v
"""
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))


# ── default_output_path() ─────────────────────────────────

class TestDefaultOutputPath:
    def setup_method(self):
        from gui.state import state
        state.reset()

    def test_returns_source_dir_when_source_set(self):
        from gui.state import state
        from gui.pages.step4_export import default_output_path
        state.source_path = "/tmp/uploads/runbook.csv"
        result = default_output_path()
        assert result == "/tmp/uploads/runbook.json"

    def test_returns_cwd_when_no_source(self):
        from gui.state import state
        from gui.pages.step4_export import default_output_path
        state.source_path = None
        result = default_output_path()
        assert result.endswith("runbook.json")
        assert Path(result).name == "runbook.json"

    def test_filename_is_always_runbook_json(self):
        from gui.state import state
        from gui.pages.step4_export import default_output_path
        state.source_path = "/some/path/data.xlsx"
        result = default_output_path()
        assert Path(result).name == "runbook.json"

    def test_preserves_source_directory(self):
        from gui.state import state
        from gui.pages.step4_export import default_output_path
        state.source_path = "/data/project/input.csv"
        result = default_output_path()
        assert str(Path(result).parent) == "/data/project"


# ── do_export() ───────────────────────────────────────────

class TestDoExport:
    def setup_method(self):
        from gui.state import state
        state.reset()

    def test_returns_error_when_no_parsed_data(self):
        from gui.state import state
        from gui.pages.step4_export import do_export
        state.parsed_data = {}
        result = do_export("/tmp/out.json")
        assert isinstance(result, str)
        assert "Steps 1" in result or "No data" in result

    def test_returns_error_when_empty_path(self):
        from gui.state import state
        from gui.pages.step4_export import do_export
        state.parsed_data = {"Cat": [{"task": "T", "status": "Done"}]}
        result = do_export("   ")
        assert isinstance(result, str)
        assert "empty" in result.lower() or "path" in result.lower()

    def test_successful_export_returns_none(self):
        from gui.state import state
        from gui.pages.step4_export import do_export
        state.parsed_data = {"Cat": [{"task": "T", "status": "Done"}]}

        with patch("gui.bridge.write_runbook", return_value="/tmp/runbook.json"):
            result = do_export("/tmp/runbook.json")

        assert result is None

    def test_successful_export_updates_state(self):
        from gui.state import state
        from gui.pages.step4_export import do_export
        state.parsed_data = {"Cat": [{"task": "T", "status": "Done"}]}

        with patch("gui.bridge.write_runbook", return_value="/abs/runbook.json"):
            do_export("/abs/runbook.json")

        assert state.save_success is True
        assert state.saved_path == "/abs/runbook.json"
        assert state.output_path == "/abs/runbook.json"

    def test_bridge_error_returns_string(self):
        from gui.state import state
        from gui.pages.step4_export import do_export
        state.parsed_data = {"Cat": [{"task": "T", "status": "Done"}]}

        with patch("gui.bridge.write_runbook", side_effect=RuntimeError("disk full")):
            result = do_export("/tmp/runbook.json")

        assert isinstance(result, str)
        assert "disk full" in result

    def test_bridge_error_does_not_set_save_success(self):
        from gui.state import state
        from gui.pages.step4_export import do_export
        state.parsed_data = {"Cat": [{"task": "T", "status": "Done"}]}

        with patch("gui.bridge.write_runbook", side_effect=RuntimeError("oops")):
            do_export("/tmp/runbook.json")

        assert state.save_success is False

    def test_real_write_creates_file(self):
        """Integration: do_export actually writes a JSON file to disk."""
        from gui.state import state
        from gui.pages.step4_export import do_export
        import json

        state.parsed_data = {
            "Phase 1": [{"task": "Deploy app", "status": "Completed"}]
        }

        with tempfile.TemporaryDirectory() as tmp_dir:
            out_path = os.path.join(tmp_dir, "runbook.json")
            result = do_export(out_path)
            assert result is None, f"Expected None, got: {result}"
            assert os.path.exists(out_path)
            with open(out_path, encoding="utf-8") as f:
                data = json.load(f)
            assert "Phase 1" in data
            assert data["Phase 1"][0]["task"] == "Deploy app"

    def test_real_write_merged_with_existing(self):
        """Integration: existing runbook.json _issues are preserved on merge."""
        from gui.state import state
        from gui.pages.step4_export import do_export
        import json

        state.parsed_data = {
            "Phase 1": [{"task": "Deploy", "status": "Completed"}]
        }

        with tempfile.TemporaryDirectory() as tmp_dir:
            out_path = os.path.join(tmp_dir, "runbook.json")
            # Write an existing file with _issues
            existing = {"_issues": [{"id": "1", "text": "Old issue"}], "_health": "Red"}
            with open(out_path, "w") as f:
                json.dump(existing, f)

            result = do_export(out_path)
            assert result is None

            with open(out_path, encoding="utf-8") as f:
                merged = json.load(f)

            assert "_issues" in merged
            assert merged["_issues"][0]["text"] == "Old issue"
            assert "Phase 1" in merged


# ── Page importable ───────────────────────────────────────

def test_step4_importable():
    from gui.pages import step4_export
    assert callable(step4_export.default_output_path)
    assert callable(step4_export.do_export)
    assert callable(step4_export.render)
