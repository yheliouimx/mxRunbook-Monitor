"""
Phase 4 tests — Step 3: Preview & Validate

Tests cover the pure-logic functions in step3_preview.py:
run_pipeline, summary_stats, flat_rows, on_enter.
No NiceGUI rendering involved.

Run with:  pytest gui/tests/test_phase4_step3.py -v
"""
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))


def _fresh_state():
    from gui.state import AppState
    return AppState()


# ── summary_stats() ───────────────────────────────────────

class TestSummaryStats:
    def test_empty_data_returns_zeros(self):
        from gui.pages.step3_preview import summary_stats
        assert summary_stats({}) == (0, 0)

    def test_single_category(self):
        from gui.pages.step3_preview import summary_stats
        data = {"Cat A": [{"task": "T1", "status": "Done"}]}
        assert summary_stats(data) == (1, 1)

    def test_multiple_categories(self):
        from gui.pages.step3_preview import summary_stats
        data = {
            "Pre-flight": [{"task": "T1", "status": "Done"}, {"task": "T2", "status": "WIP"}],
            "Cutover":    [{"task": "T3", "status": "Not Started"}],
        }
        assert summary_stats(data) == (2, 3)

    def test_ignores_underscore_keys(self):
        from gui.pages.step3_preview import summary_stats
        data = {
            "_issues": [],
            "_health": "Green",
            "Tasks": [{"task": "T", "status": "Done"}],
        }
        cats, tasks = summary_stats(data)
        assert cats == 1
        assert tasks == 1

    def test_ignores_non_list_values(self):
        from gui.pages.step3_preview import summary_stats
        data = {"NotAList": "string value", "Real": [{"task": "T", "status": "X"}]}
        cats, tasks = summary_stats(data)
        assert cats == 1
        assert tasks == 1


# ── flat_rows() ────────────────────────────────────────────

class TestFlatRows:
    def test_empty_data_returns_empty_list(self):
        from gui.pages.step3_preview import flat_rows
        assert flat_rows({}) == []

    def test_single_task_row(self):
        from gui.pages.step3_preview import flat_rows
        data = {"Cat": [{"task": "Deploy", "status": "Done"}]}
        rows = flat_rows(data)
        assert len(rows) == 1
        assert rows[0]["task"] == "Deploy"
        assert rows[0]["status"] == "Done"
        assert rows[0]["category"] == "Cat"
        assert rows[0]["num"] == 1

    def test_num_increments_per_category(self):
        from gui.pages.step3_preview import flat_rows
        data = {
            "A": [{"task": "T1", "status": "X"}, {"task": "T2", "status": "X"}],
        }
        rows = flat_rows(data)
        assert rows[0]["num"] == 1
        assert rows[1]["num"] == 2

    def test_optional_fields_default_to_empty_string(self):
        from gui.pages.step3_preview import flat_rows
        data = {"Cat": [{"task": "T", "status": "X"}]}
        row = flat_rows(data)[0]
        assert row["startTime"] == ""
        assert row["endTime"]   == ""
        assert row["assignee"]  == ""

    def test_optional_fields_populated(self):
        from gui.pages.step3_preview import flat_rows
        data = {
            "Cat": [{
                "task": "T", "status": "Done",
                "startTime": "2024-01-01T08:00", "endTime": "2024-01-01T09:00",
                "assignee": "Alice",
            }]
        }
        row = flat_rows(data)[0]
        assert row["startTime"] == "2024-01-01T08:00"
        assert row["endTime"]   == "2024-01-01T09:00"
        assert row["assignee"]  == "Alice"

    def test_ignores_underscore_keys(self):
        from gui.pages.step3_preview import flat_rows
        data = {"_issues": [], "Tasks": [{"task": "T", "status": "X"}]}
        rows = flat_rows(data)
        assert len(rows) == 1
        assert rows[0]["category"] == "Tasks"

    def test_row_has_required_keys(self):
        from gui.pages.step3_preview import flat_rows
        data = {"Cat": [{"task": "T", "status": "X"}]}
        row = flat_rows(data)[0]
        for key in ("category", "num", "task", "status", "startTime", "endTime", "assignee"):
            assert key in row, f"Missing key: {key}"


# ── run_pipeline() ────────────────────────────────────────

class TestRunPipeline:
    def setup_method(self):
        from gui.state import state
        state.reset()

    def test_returns_error_when_no_source(self):
        from gui.pages.step3_preview import run_pipeline
        from gui.state import state
        state.source_path = None
        state.mapping = {}
        result = run_pipeline()
        assert isinstance(result, str)

    def test_returns_error_when_no_mapping(self):
        from gui.pages.step3_preview import run_pipeline
        from gui.state import state
        state.source_path = "/some/file.csv"
        state.mapping = {}
        result = run_pipeline()
        assert isinstance(result, str)

    def test_successful_pipeline_populates_state(self):
        from gui.pages.step3_preview import run_pipeline
        from gui.state import state

        state.source_path = "/fake/runbook.csv"
        state.detected_format = "csv"
        state.mapping = {"columns": {"task": "Task", "status": "Status"}}

        fake_data = {"Phase 1": [{"task": "Deploy", "status": "Done"}]}
        fake_errors = []
        fake_quality = {"errors": [], "warnings": [], "info": ["1 category, 1 task"]}

        with patch("gui.bridge.run_convert", return_value=fake_data) as mc, \
             patch("gui.bridge.run_validate", return_value=fake_errors) as mv, \
             patch("gui.bridge.run_quality",  return_value=fake_quality) as mq:
            result = run_pipeline()

        assert result is None
        assert state.parsed_data == fake_data
        assert state.schema_errors == []
        assert state.quality_report == fake_quality
        assert state.processing is False

    def test_pipeline_error_sets_schema_errors(self):
        from gui.pages.step3_preview import run_pipeline
        from gui.state import state

        state.source_path = "/fake/runbook.csv"
        state.detected_format = "csv"
        state.mapping = {"columns": {"task": "Task", "status": "Status"}}

        with patch("gui.bridge.run_convert", side_effect=RuntimeError("parse failed")):
            result = run_pipeline()

        assert isinstance(result, str)
        assert "parse failed" in result
        assert state.schema_errors == ["parse failed"]
        assert state.parsed_data == {}
        assert state.processing is False

    def test_schema_errors_populated_from_validate(self):
        from gui.pages.step3_preview import run_pipeline
        from gui.state import state

        state.source_path = "/fake/runbook.csv"
        state.detected_format = "csv"
        state.mapping = {"columns": {"task": "Task", "status": "Status"}}

        fake_data = {"Cat": [{"task": "T", "status": "X"}]}
        fake_errors = ["'Cat[0]' field 'startTime' is not valid"]
        fake_quality = {"errors": [], "warnings": [], "info": []}

        with patch("gui.bridge.run_convert", return_value=fake_data), \
             patch("gui.bridge.run_validate", return_value=fake_errors), \
             patch("gui.bridge.run_quality",  return_value=fake_quality):
            result = run_pipeline()

        assert result is None   # pipeline itself succeeded
        assert state.schema_errors == fake_errors


# ── on_enter() ────────────────────────────────────────────

class TestOnEnter:
    def setup_method(self):
        from gui.state import state
        state.reset()

    def test_on_enter_calls_run_pipeline(self):
        from gui.pages.step3_preview import on_enter

        with patch("gui.pages.step3_preview.run_pipeline", return_value=None) as mock_pipe:
            on_enter()

        mock_pipe.assert_called_once()

    def test_on_enter_calls_do_refresh(self):
        from gui.pages import step3_preview

        called = []
        step3_preview._do_refresh = lambda: called.append(True)

        with patch("gui.pages.step3_preview.run_pipeline", return_value=None):
            step3_preview.on_enter()

        assert called


# ── Page importable ───────────────────────────────────────

def test_step3_importable():
    from gui.pages import step3_preview
    assert callable(step3_preview.run_pipeline)
    assert callable(step3_preview.summary_stats)
    assert callable(step3_preview.flat_rows)
    assert callable(step3_preview.on_enter)
    assert callable(step3_preview.render)
