"""
Tests for startDate/endDate mapping fields.

Verifies that:
- autodetect.py detects common date-column names for startDate / endDate
- RUNBOOK_FIELDS exposes both fields in the GUI
- The parser correctly combines a mapped date column with time-only cells

Run with:  pytest gui/tests/test_startdate_enddate_mapping.py -v
"""
import io
import os
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))


# ── autodetect detects date columns ───────────────────────

class TestAutodetectDateColumns:
    def _detect(self, headers):
        from adapter.autodetect import autodetect_mapping
        return autodetect_mapping(headers)

    def test_detects_start_date_column(self):
        m = self._detect(["Task", "Status", "Start Date", "Start Time", "End Time"])
        assert m["columns"].get("startDate") == "Start Date"

    def test_detects_end_date_column(self):
        m = self._detect(["Task", "Status", "Start Time", "End Date", "End Time"])
        assert m["columns"].get("endDate") == "End Date"

    def test_generic_date_column_autodetects_as_start_date(self):
        # A column called "Date" is a substring of "start date" so it auto-maps
        # to startDate.  The user can then manually set endDate to the same
        # column in the GUI if both times share the same date.
        m = self._detect(["Task", "Status", "Date", "Start Time", "End Time"])
        assert m["columns"].get("startDate") == "Date"
        # endDate is left unset — user maps manually (can reuse the same column)
        assert m["columns"].get("endDate") is None

    def test_start_time_not_stolen_by_start_date(self):
        """'Start Time' must go to startTime, not startDate."""
        m = self._detect(["Task", "Status", "Start Time", "Start Date", "End Time"])
        assert m["columns"].get("startTime") == "Start Time"
        assert m["columns"].get("startDate") == "Start Date"

    def test_end_time_not_stolen_by_end_date(self):
        m = self._detect(["Task", "Status", "Start Time", "End Time", "End Date"])
        assert m["columns"].get("endTime") == "End Time"
        assert m["columns"].get("endDate") == "End Date"

    def test_detect_runbook_date_alias(self):
        m = self._detect(["Task", "Status", "Runbook Date", "Start Time"])
        assert m["columns"].get("startDate") == "Runbook Date"


# ── RUNBOOK_FIELDS contains startDate / endDate ───────────

class TestRunbookFieldsContainDates:
    def test_startdate_in_runbook_fields(self):
        from gui.pages.step2_mapping import RUNBOOK_FIELDS
        keys = [f for f, _, _ in RUNBOOK_FIELDS]
        assert "startDate" in keys

    def test_enddate_in_runbook_fields(self):
        from gui.pages.step2_mapping import RUNBOOK_FIELDS
        keys = [f for f, _, _ in RUNBOOK_FIELDS]
        assert "endDate" in keys

    def test_startdate_is_not_required(self):
        from gui.pages.step2_mapping import RUNBOOK_FIELDS
        for field, required, _ in RUNBOOK_FIELDS:
            if field == "startDate":
                assert required is False

    def test_startdate_after_starttime(self):
        """startDate must appear after startTime in the list (for UI pairing)."""
        from gui.pages.step2_mapping import RUNBOOK_FIELDS
        keys = [f for f, _, _ in RUNBOOK_FIELDS]
        assert keys.index("startDate") == keys.index("startTime") + 1

    def test_enddate_after_endtime(self):
        from gui.pages.step2_mapping import RUNBOOK_FIELDS
        keys = [f for f, _, _ in RUNBOOK_FIELDS]
        assert keys.index("endDate") == keys.index("endTime") + 1


# ── update_column works for startDate / endDate ───────────

class TestUpdateColumnDateFields:
    def setup_method(self):
        from gui.state import state
        state.reset()
        state.mapping = {"columns": {}, "category_column": None, "status_mapping": {}}

    def test_sets_start_date_column(self):
        from gui.state import state
        from gui.pages.step2_mapping import update_column
        update_column("startDate", "Date")
        assert state.mapping["columns"]["startDate"] == "Date"

    def test_sets_end_date_column(self):
        from gui.state import state
        from gui.pages.step2_mapping import update_column
        update_column("endDate", "Date")
        assert state.mapping["columns"]["endDate"] == "Date"

    def test_same_column_for_both_dates(self):
        """A single 'Date' column can be mapped to both startDate and endDate."""
        from gui.state import state
        from gui.pages.step2_mapping import update_column
        update_column("startDate", "Date")
        update_column("endDate", "Date")
        assert state.mapping["columns"]["startDate"] == "Date"
        assert state.mapping["columns"]["endDate"] == "Date"


# ── Parser integration: date column + time column → full ISO ─

class TestParserDateTimeMerge:
    def test_excel_date_column_merges_with_time_column(self):
        """Mapping startDate → 'Date' col + startTime → 'Start' col produces full ISO."""
        openpyxl = __import__("openpyxl")
        from datetime import date as dt_date

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["Task", "Status", "Date", "Start", "End"])
        # openpyxl stores these as Python native types when read back
        ws.append(["Deploy app", "Done", dt_date(2026, 4, 15), "09:00:00", "09:30:00"])

        buf = io.BytesIO()
        wb.save(buf)

        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            f.write(buf.getvalue())
            tmp = f.name

        try:
            from adapter.parsers.excel_parser import parse
            mapping = {
                "columns": {
                    "task":      "Task",
                    "status":    "Status",
                    "startDate": "Date",
                    "endDate":   "Date",
                    "startTime": "Start",
                    "endTime":   "End",
                },
            }
            result = parse(tmp, mapping)
            tasks = result.get("Tasks", [])
            assert len(tasks) == 1
            assert tasks[0]["startTime"].startswith("2026-04-15"), (
                f"Expected full ISO datetime, got: {tasks[0]['startTime']!r}"
            )
            assert tasks[0]["endTime"].startswith("2026-04-15"), (
                f"Expected full ISO datetime, got: {tasks[0]['endTime']!r}"
            )
        finally:
            os.remove(tmp)

    def test_csv_date_column_merges_with_time_column(self):
        """CSV parser: startDate + startTime columns produce full ISO datetime."""
        with tempfile.NamedTemporaryFile(
            suffix=".csv", delete=False, mode="w", encoding="utf-8"
        ) as f:
            f.write("Task,Status,Date,Start,End\n")
            f.write("Deploy app,Done,2026-04-15,09:00:00,09:30:00\n")
            tmp = f.name

        try:
            from adapter.parsers.generic_csv import parse
            mapping = {
                "columns": {
                    "task":      "Task",
                    "status":    "Status",
                    "startDate": "Date",
                    "endDate":   "Date",
                    "startTime": "Start",
                    "endTime":   "End",
                },
            }
            result = parse(tmp, mapping)
            tasks = result.get("Tasks", [])
            assert len(tasks) == 1
            assert tasks[0]["startTime"] == "2026-04-15T09:00:00", (
                f"Unexpected: {tasks[0]['startTime']!r}"
            )
            assert tasks[0]["endTime"] == "2026-04-15T09:30:00", (
                f"Unexpected: {tasks[0]['endTime']!r}"
            )
        finally:
            os.remove(tmp)
