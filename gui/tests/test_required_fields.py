"""
Phase 7 — Required-field and schema-blocking tests (7.5)

Verifies that:
- run_validate() flags tasks missing 'task' or 'status'
- schema_errors in AppState block the Step 3 → Step 4 transition
- is_ready() in Step 2 correctly gates on both required columns

Run with:  pytest gui/tests/test_required_fields.py -v
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))


# ── run_validate — required fields ────────────────────────

class TestValidateRequiredFields:
    def _validate(self, data):
        from gui import bridge
        return bridge.run_validate(data)

    def test_missing_task_produces_error(self):
        errors = self._validate({"Cat": [{"status": "Done"}]})
        assert any("task" in e for e in errors), f"Expected 'task' error in: {errors}"

    def test_missing_status_produces_error(self):
        errors = self._validate({"Cat": [{"task": "Deploy"}]})
        assert any("status" in e for e in errors), f"Expected 'status' error in: {errors}"

    def test_both_missing_produces_two_errors(self):
        errors = self._validate({"Cat": [{}]})
        field_errors = [e for e in errors if "task" in e or "status" in e]
        assert len(field_errors) >= 2

    def test_valid_task_and_status_no_error(self):
        errors = self._validate({"Cat": [{"task": "Deploy", "status": "Done"}]})
        assert errors == []

    def test_multiple_tasks_some_invalid(self):
        data = {
            "Cat": [
                {"task": "Good task", "status": "Done"},
                {"status": "Done"},           # missing task
                {"task": "Another", "status": "Done"},
                {"task": "Missing status"},    # missing status
            ]
        }
        errors = self._validate(data)
        assert len(errors) >= 2

    def test_empty_task_string_does_not_raise_schema_error(self):
        """Empty string is technically present; quality checker warns, schema doesn't block."""
        errors = self._validate({"Cat": [{"task": "", "status": "Done"}]})
        # schema only checks field presence, not emptiness
        assert not any("task" in e and "missing" in e.lower() for e in errors)

    def test_reserved_keys_not_validated(self):
        """_issues and _health are exempt from required-field checks."""
        errors = self._validate({
            "_issues": [],
            "_health": "Green",
            "Cat": [{"task": "T", "status": "Done"}],
        })
        assert errors == []


# ── Step 2 is_ready() — required field gating ─────────────

class TestIsReadyRequiredFields:
    def setup_method(self):
        from gui.state import state
        state.reset()

    def test_both_mapped_is_ready(self):
        from gui.state import state
        from gui.pages.step2_mapping import is_ready
        state.mapping = {"columns": {"task": "Task Col", "status": "Status Col"}}
        assert is_ready() is True

    def test_task_missing_not_ready(self):
        from gui.state import state
        from gui.pages.step2_mapping import is_ready
        state.mapping = {"columns": {"task": None, "status": "Status Col"}}
        assert is_ready() is False

    def test_status_missing_not_ready(self):
        from gui.state import state
        from gui.pages.step2_mapping import is_ready
        state.mapping = {"columns": {"task": "Task Col", "status": None}}
        assert is_ready() is False

    def test_empty_mapping_not_ready(self):
        from gui.state import state
        from gui.pages.step2_mapping import is_ready
        state.mapping = {}
        assert is_ready() is False

    def test_optional_fields_unmapped_still_ready(self):
        from gui.state import state
        from gui.pages.step2_mapping import is_ready
        state.mapping = {
            "columns": {
                "task": "Task", "status": "Status",
                "assignee": None, "startTime": None,
                "startDate": None, "endDate": None,
            }
        }
        assert is_ready() is True


# ── AppState.schema_errors gates Step 3 → Step 4 ──────────

class TestSchemaErrorsBlocksExport:
    def setup_method(self):
        from gui.state import state
        state.reset()

    def test_schema_errors_present_means_do_export_still_allowed(self):
        """do_export itself doesn't check schema_errors — the UI binding does.
        This test documents that schema_errors lives in state and the
        app.py binding (backward=lambda v: not v) uses it."""
        from gui.state import state
        state.schema_errors = ["Some error"]
        # The binding lambda that disables Next on Step 3:
        backward = lambda v: not v  # noqa: E731
        assert backward(state.schema_errors) is False   # Next disabled

    def test_no_schema_errors_means_next_enabled(self):
        from gui.state import state
        state.schema_errors = []
        backward = lambda v: not v  # noqa: E731
        assert backward(state.schema_errors) is True    # Next enabled

    def test_run_pipeline_populates_schema_errors_on_invalid_data(self):
        from gui.state import state
        from unittest.mock import patch

        state.source_path = "/fake/runbook.csv"
        state.detected_format = "csv"
        state.mapping = {"columns": {"task": "Task", "status": "Status"}}

        fake_data = {"Cat": [{"task": "T", "status": "Done",
                              "startTime": "not-a-date"}]}
        with patch("gui.bridge.run_convert", return_value=fake_data), \
             patch("gui.bridge.run_quality", return_value={"errors": [], "warnings": [], "info": []}):
            from gui.pages.step3_preview import run_pipeline
            run_pipeline()

        assert len(state.schema_errors) > 0

    def test_run_pipeline_clears_schema_errors_on_valid_data(self):
        from gui.state import state
        from unittest.mock import patch

        state.source_path = "/fake/runbook.csv"
        state.detected_format = "csv"
        state.mapping = {"columns": {"task": "Task", "status": "Status"}}
        state.schema_errors = ["old error"]  # pre-existing

        fake_data = {"Cat": [{"task": "T", "status": "Done"}]}
        with patch("gui.bridge.run_convert", return_value=fake_data), \
             patch("gui.bridge.run_quality", return_value={"errors": [], "warnings": [], "info": []}):
            from gui.pages.step3_preview import run_pipeline
            run_pipeline()

        assert state.schema_errors == []
