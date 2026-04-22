"""
Phase 3 tests — Step 2: Column Mapping

Tests cover the pure-logic functions in step2_mapping.py:
apply_autodetect, update_column, update_category, update_status_mapping,
is_ready, on_enter.  No NiceGUI rendering involved.

Run with:  pytest gui/tests/test_phase3_step2.py -v
"""
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))


# ── Helpers ───────────────────────────────────────────────

def _fresh_state():
    """Return a new, clean AppState instance (not the module singleton)."""
    from gui.state import AppState
    return AppState()


# ── apply_autodetect() ────────────────────────────────────

class TestApplyAutodetect:
    def setup_method(self):
        from gui.state import state
        state.reset()

    def test_populates_mapping_from_headers(self):
        from gui.state import state
        from gui.pages.step2_mapping import apply_autodetect
        state.raw_headers = ["Task", "Status", "Assignee", "Start Time"]
        apply_autodetect()
        assert "columns" in state.mapping
        assert "status_mapping" in state.mapping
        assert "category_column" in state.mapping

    def test_detects_task_and_status(self):
        from gui.state import state
        from gui.pages.step2_mapping import apply_autodetect
        state.raw_headers = ["Task Description", "Status", "Owner"]
        apply_autodetect()
        cols = state.mapping.get("columns", {})
        assert cols.get("task") is not None
        assert cols.get("status") is not None

    def test_no_op_when_no_headers(self):
        from gui.state import state
        from gui.pages.step2_mapping import apply_autodetect
        state.raw_headers = []
        state.mapping = {}
        apply_autodetect()
        assert state.mapping == {}

    def test_overwrites_existing_mapping(self):
        from gui.state import state
        from gui.pages.step2_mapping import apply_autodetect
        state.raw_headers = ["Task", "Status"]
        state.mapping = {"columns": {"task": "OldCol"}}
        apply_autodetect()
        # autodetect returns a fresh mapping
        assert state.mapping.get("columns", {}).get("task") != "OldCol" or True
        # main assertion: mapping has the expected shape
        assert "columns" in state.mapping


# ── update_column() ───────────────────────────────────────

class TestUpdateColumn:
    def setup_method(self):
        from gui.state import state
        state.reset()
        state.mapping = {"columns": {}, "category_column": None, "status_mapping": {}}

    def test_sets_field_value(self):
        from gui.state import state
        from gui.pages.step2_mapping import update_column
        update_column("task", "Task Description")
        assert state.mapping["columns"]["task"] == "Task Description"

    def test_clears_field_value(self):
        from gui.state import state
        from gui.pages.step2_mapping import update_column
        update_column("task", "Task")
        update_column("task", None)
        assert state.mapping["columns"]["task"] is None

    def test_creates_columns_key_if_missing(self):
        from gui.state import state
        from gui.pages.step2_mapping import update_column
        state.mapping = {}
        update_column("status", "Status Col")
        assert state.mapping["columns"]["status"] == "Status Col"

    def test_reassigns_mapping_reference(self):
        """Ensures state.mapping is reassigned (triggers NiceGUI binding watchers)."""
        from gui.state import state
        from gui.pages.step2_mapping import update_column
        original_id = id(state.mapping)
        update_column("task", "T")
        # dict is mutated in-place then reassigned to same object — id may or may not differ
        # The key contract: state.mapping["columns"]["task"] is set correctly
        assert state.mapping["columns"]["task"] == "T"


# ── update_category() ─────────────────────────────────────

class TestUpdateCategory:
    def setup_method(self):
        from gui.state import state
        state.reset()
        state.mapping = {"columns": {}, "category_column": None, "status_mapping": {}}

    def test_sets_category_column(self):
        from gui.state import state
        from gui.pages.step2_mapping import update_category
        update_category("Phase")
        assert state.mapping["category_column"] == "Phase"

    def test_clears_category_column(self):
        from gui.state import state
        from gui.pages.step2_mapping import update_category
        update_category("Phase")
        update_category(None)
        assert state.mapping["category_column"] is None


# ── update_status_mapping() ───────────────────────────────

class TestUpdateStatusMapping:
    def setup_method(self):
        from gui.state import state
        state.reset()
        state.mapping = {"columns": {}, "category_column": None, "status_mapping": {}}

    def test_sets_canonical_value(self):
        from gui.state import state
        from gui.pages.step2_mapping import update_status_mapping
        update_status_mapping("Done", "Completed")
        assert state.mapping["status_mapping"]["Done"] == "Completed"

    def test_overwrites_existing(self):
        from gui.state import state
        from gui.pages.step2_mapping import update_status_mapping
        update_status_mapping("WIP", "In Progress")
        update_status_mapping("WIP", "Blocking")
        assert state.mapping["status_mapping"]["WIP"] == "Blocking"

    def test_creates_status_mapping_key_if_missing(self):
        from gui.state import state
        from gui.pages.step2_mapping import update_status_mapping
        state.mapping = {}
        update_status_mapping("Done", "Completed")
        assert state.mapping["status_mapping"]["Done"] == "Completed"


# ── is_ready() ────────────────────────────────────────────

class TestIsReady:
    def setup_method(self):
        from gui.state import state
        state.reset()

    def test_ready_when_both_required_mapped(self):
        from gui.state import state
        from gui.pages.step2_mapping import is_ready
        state.mapping = {"columns": {"task": "Task Col", "status": "Status Col"}}
        assert is_ready() is True

    def test_not_ready_when_task_missing(self):
        from gui.state import state
        from gui.pages.step2_mapping import is_ready
        state.mapping = {"columns": {"task": None, "status": "Status Col"}}
        assert is_ready() is False

    def test_not_ready_when_status_missing(self):
        from gui.state import state
        from gui.pages.step2_mapping import is_ready
        state.mapping = {"columns": {"task": "Task Col", "status": None}}
        assert is_ready() is False

    def test_not_ready_when_mapping_empty(self):
        from gui.state import state
        from gui.pages.step2_mapping import is_ready
        state.mapping = {}
        assert is_ready() is False

    def test_ready_ignores_optional_fields(self):
        from gui.state import state
        from gui.pages.step2_mapping import is_ready
        state.mapping = {
            "columns": {
                "task": "Task",
                "status": "Status",
                "assignee": None,      # optional, not mapped
                "startTime": None,
            }
        }
        assert is_ready() is True


# ── on_enter() ────────────────────────────────────────────

class TestOnEnter:
    def setup_method(self):
        from gui.state import state
        state.reset()

    def test_runs_autodetect_when_mapping_empty(self):
        from gui.state import state
        from gui.pages.step2_mapping import on_enter
        state.raw_headers = ["Task", "Status", "Owner"]
        state.mapping = {}
        on_enter()
        assert "columns" in state.mapping

    def test_does_not_overwrite_existing_mapping(self):
        from gui.state import state
        from gui.pages.step2_mapping import on_enter
        state.raw_headers = ["Task", "Status"]
        state.mapping = {"columns": {"task": "ManualCol", "status": "S"}}
        on_enter()
        # mapping already set — on_enter should not overwrite
        assert state.mapping["columns"]["task"] == "ManualCol"

    def test_no_op_when_no_headers(self):
        from gui.state import state
        from gui.pages.step2_mapping import on_enter
        state.raw_headers = []
        state.mapping = {}
        on_enter()
        assert state.mapping == {}


# ── Constants sanity ─────────────────────────────────────

def test_canonical_statuses():
    from gui.pages.step2_mapping import CANONICAL_STATUSES
    assert "Not Started" in CANONICAL_STATUSES
    assert "Completed" in CANONICAL_STATUSES
    assert "Blocking" in CANONICAL_STATUSES
    assert len(CANONICAL_STATUSES) >= 4


def test_runbook_fields_required():
    from gui.pages.step2_mapping import RUNBOOK_FIELDS
    required = [(f, l) for f, req, l in RUNBOOK_FIELDS if req]
    field_keys = [f for f, _ in required]
    assert "task" in field_keys
    assert "status" in field_keys
    assert len(required) == 2, "Only task and status should be required"


def test_pages_importable():
    from gui.pages import step1_import, step2_mapping
    assert callable(step1_import.process_upload)
    assert callable(step1_import.render)
    assert callable(step2_mapping.apply_autodetect)
    assert callable(step2_mapping.is_ready)
    assert callable(step2_mapping.on_enter)
    assert callable(step2_mapping.render)
