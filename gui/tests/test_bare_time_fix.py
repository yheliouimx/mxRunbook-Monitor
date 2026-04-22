"""
Tests for bare-time tolerance (schema.py + step2_mapping.update_runbook_date).

Context: Excel/CSV files often store date and time in separate columns so
time fields contain only HH:MM:SS strings.  These should be accepted by the
schema validator (not treated as errors) and routed through the quality
checker as warnings.  When the user sets ``runbook_date`` in the mapping the
parser combines it with bare times to produce full ISO datetimes.

Run with:  pytest gui/tests/test_bare_time_fix.py -v
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))


# ── schema.validate — bare time strings ───────────────────

class TestSchemaValidateBareTime:
    def _validate(self, data):
        from adapter.schema import validate
        return validate(data)

    def test_bare_time_hh_mm_ss_is_valid(self):
        errors = self._validate({
            "Phase 1": [{"task": "Deploy", "status": "Done", "startTime": "09:00:00"}]
        })
        assert errors == [], f"Expected no errors, got: {errors}"

    def test_bare_time_hh_mm_is_valid(self):
        errors = self._validate({
            "Phase 1": [{"task": "Deploy", "status": "Done", "startTime": "09:35"}]
        })
        assert errors == []

    def test_bare_time_end_time_is_valid(self):
        errors = self._validate({
            "Phase 1": [{"task": "Deploy", "status": "Done",
                         "startTime": "09:00:00", "endTime": "09:45:00"}]
        })
        assert errors == []

    def test_bare_time_estimated_end_is_valid(self):
        errors = self._validate({
            "Phase 1": [{
                "task": "Deploy", "status": "Done",
                "startTime": "09:00:00", "endTime": "09:30:00",
                "estimatedEnd": "09:45:00",
            }]
        })
        assert errors == []

    def test_full_iso_datetime_still_valid(self):
        errors = self._validate({
            "Phase 1": [{"task": "T", "status": "Done",
                         "startTime": "2026-04-15T09:00:00"}]
        })
        assert errors == []

    def test_full_iso_date_only_still_valid(self):
        errors = self._validate({
            "Phase 1": [{"task": "T", "status": "Done", "startTime": "2026-04-15"}]
        })
        assert errors == []

    def test_garbage_string_still_invalid(self):
        errors = self._validate({
            "Phase 1": [{"task": "T", "status": "Done", "startTime": "not-a-time"}]
        })
        assert any("startTime" in e for e in errors)

    def test_real_world_runbook_bare_times(self):
        """Reproduces the exact error strings seen in the user's Excel runbook."""
        errors = self._validate({
            "Murex": [{"task": "Start Murex", "status": "Not Started",
                       "startTime": "09:00:00"}],
            "Deploy the migration interface": [
                {"task": "Deploy interface", "status": "Not Started",
                 "startTime": "09:35:00", "endTime": "09:45:00",
                 "estimatedEnd": "09:45:00"}
            ],
            "Purge export interface consumer": [
                {"task": "Purge consumer", "status": "Not Started",
                 "startTime": "09:45:00"}
            ],
        })
        assert errors == [], f"Expected no errors, got: {errors}"


# ── quality.check — bare times become warnings, not errors ─

class TestQualityBareTimeWarnings:
    def _quality(self, data):
        from adapter.quality import check
        return check(data)

    def test_bare_time_produces_warning_not_error(self):
        report = self._quality({
            "Phase 1": [{"task": "Deploy", "status": "Done", "startTime": "09:00:00"}]
        })
        # Should be a warning (informational), not a blocking error
        warnings_text = " ".join(report.get("warnings", []))
        assert "09:00:00" in warnings_text
        assert report["errors"] == []

    def test_full_iso_produces_no_bare_time_warning(self):
        report = self._quality({
            "Phase 1": [{"task": "Deploy", "status": "Done",
                         "startTime": "2026-04-15T09:00:00",
                         "endTime":   "2026-04-15T09:30:00"}]
        })
        assert not any("no date component" in w for w in report.get("warnings", []))


# ── update_runbook_date() ─────────────────────────────────

class TestUpdateRunbookDate:
    def setup_method(self):
        from gui.state import state
        state.reset()
        state.mapping = {"columns": {}, "category_column": None, "status_mapping": {}}

    def test_sets_runbook_date(self):
        from gui.state import state
        from gui.pages.step2_mapping import update_runbook_date
        update_runbook_date("2026-04-15")
        assert state.mapping["runbook_date"] == "2026-04-15"

    def test_clears_runbook_date_on_empty_string(self):
        from gui.state import state
        from gui.pages.step2_mapping import update_runbook_date
        update_runbook_date("2026-04-15")
        update_runbook_date("")
        assert "runbook_date" not in state.mapping

    def test_clears_runbook_date_on_none(self):
        from gui.state import state
        from gui.pages.step2_mapping import update_runbook_date
        update_runbook_date("2026-04-15")
        update_runbook_date(None)
        assert "runbook_date" not in state.mapping

    def test_strips_whitespace(self):
        from gui.state import state
        from gui.pages.step2_mapping import update_runbook_date
        update_runbook_date("  2026-04-15  ")
        assert state.mapping["runbook_date"] == "2026-04-15"

    def test_reassigns_mapping_reference(self):
        from gui.state import state
        from gui.pages.step2_mapping import update_runbook_date
        update_runbook_date("2026-04-15")
        assert state.mapping.get("runbook_date") == "2026-04-15"


# ── Integration: bare times + runbook_date → full ISO ─────

class TestBareTimeWithAnchorDate:
    def test_excel_parser_resolves_bare_time_with_anchor(self):
        """With runbook_date set, bare HH:MM:SS → full ISO datetime string."""
        import io
        import tempfile
        import os
        openpyxl = __import__("openpyxl")

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["Task", "Status", "Start", "End"])
        # Time-only cells (stored as Python time objects by openpyxl when reading,
        # but we simulate the string path here)
        ws.append(["Deploy", "Done", "09:00:00", "09:30:00"])

        buf = io.BytesIO()
        wb.save(buf)

        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            f.write(buf.getvalue())
            tmp = f.name

        try:
            from adapter.parsers.excel_parser import parse
            mapping = {
                "columns": {
                    "task": "Task", "status": "Status",
                    "startTime": "Start", "endTime": "End",
                },
                "runbook_date": "2026-04-15",
            }
            result = parse(tmp, mapping)
            tasks = result.get("Tasks", [])
            assert len(tasks) == 1
            # With anchor date, startTime should include the date component
            start = tasks[0].get("startTime", "")
            assert start.startswith("2026-04-15"), (
                f"Expected full ISO datetime, got: {start!r}"
            )
        finally:
            os.remove(tmp)

    def test_excel_parser_bare_time_no_anchor_passes_through(self):
        """Without runbook_date, bare times pass through as HH:MM:SS strings."""
        import io
        import tempfile
        import os
        openpyxl = __import__("openpyxl")

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["Task", "Status", "Start"])
        ws.append(["Deploy", "Done", "09:00:00"])

        buf = io.BytesIO()
        wb.save(buf)

        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            f.write(buf.getvalue())
            tmp = f.name

        try:
            from adapter.parsers.excel_parser import parse
            mapping = {
                "columns": {"task": "Task", "status": "Status", "startTime": "Start"},
            }
            result = parse(tmp, mapping)
            tasks = result.get("Tasks", [])
            assert len(tasks) == 1
            start = tasks[0].get("startTime", "")
            # Bare time passes through — schema now accepts it, quality will warn
            assert start in ("09:00:00", "09:00"), f"Unexpected: {start!r}"
        finally:
            os.remove(tmp)
