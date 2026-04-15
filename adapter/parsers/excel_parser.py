"""Excel (.xlsx/.xls) parser with column mapping support."""
from collections import OrderedDict
from datetime import date, datetime, time, timedelta

try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False


DEFAULT_MAPPING = {
    "columns": {
        # Core fields (always required)
        "task":         "task",
        "status":       "status",
        "startTime":    "startTime",
        "endTime":      "endTime",
        "item":         "item",
        "assignee":     "assignee",
        # v2 fields (optional — set to None to skip, or map to Excel column name)
        "taskId":       None,  # e.g. "Task ID"
        "system":       None,  # e.g. "Impacted System"
        "party":        None,  # e.g. "Responsible Party" — expected: Client/Murex/Joint
    },
    "category_column": None,
    "default_category": "Tasks",
    "status_mapping": {},
    "sheet": None,       # None = first sheet
    "runbook_date": None # ISO date string "YYYY-MM-DD" to anchor time-only cells
}


def parse(source_path: str, mapping: dict | None = None) -> OrderedDict:
    """Parse an Excel file into runbook format using column mapping.

    Requires openpyxl: pip install openpyxl
    """
    if not HAS_OPENPYXL:
        raise ImportError(
            "openpyxl is required for Excel parsing. "
            "Install it with: pip install openpyxl"
        )

    m = {**DEFAULT_MAPPING, **(mapping or {})}
    cols = m["columns"]
    cat_col = m.get("category_column")
    default_cat = m.get("default_category", "Tasks")
    status_map = m.get("status_mapping", {})
    sheet_name = m.get("sheet")

    # Anchor date for resolving time-only cells (e.g. "09:00:00" → full ISO datetime)
    raw_anchor = m.get("runbook_date")
    anchor: date | None = None
    if raw_anchor:
        try:
            anchor = date.fromisoformat(str(raw_anchor).strip())
        except (ValueError, TypeError):
            raise ValueError(
                f"Invalid runbook_date '{raw_anchor}' in mapping — "
                f"must be ISO format YYYY-MM-DD (e.g. '2026-04-15')"
            )

    try:
        wb = openpyxl.load_workbook(source_path, read_only=True, data_only=True)
    except PermissionError:
        raise PermissionError(
            f"\n\n  \u274c Cannot open '{source_path}'.\n"
            f"  The file appears to be locked — please close it in Excel (or any other\n"
            f"  application that has it open) and run the script again.\n"
        ) from None
    ws = wb[sheet_name] if sheet_name and sheet_name in wb.sheetnames else wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return OrderedDict()

    # First row is headers
    headers = [str(h).strip() if h else "" for h in rows[0]]
    header_idx = {h: i for i, h in enumerate(headers) if h}

    # Validate category_column exists before iterating rows
    if cat_col and cat_col not in header_idx:
        available = ", ".join(f"'{h}'" for h in headers if h)
        raise ValueError(
            f"category_column '{cat_col}' not found in sheet headers. "
            f"Available columns: {available}"
        )

    result = OrderedDict()

    for row in rows[1:]:
        def get_val(field_key):
            col_name = cols.get(field_key, "")
            if col_name and col_name in header_idx:
                val = row[header_idx[col_name]]
                return str(val).strip() if val is not None else ""
            return ""

        def get_raw(field_key):
            """Return the raw cell value (not coerced to str) for time fields."""
            col_name = cols.get(field_key, "")
            if col_name and col_name in header_idx:
                return row[header_idx[col_name]]
            return None

        # Category
        if cat_col and cat_col in header_idx:
            category = (str(row[header_idx[cat_col]]).strip()
                        if row[header_idx[cat_col]] else default_cat)
        else:
            category = default_cat
        if not category:
            category = default_cat

        raw_status = get_val("status")
        status = status_map.get(raw_status, raw_status) if raw_status else "Not Started"

        task_text = get_val("task").replace("\n", " ").strip()
        if not task_text:
            continue

        end_time = _resolve_time(get_raw("endTime"), anchor)
        task = {
            "item":         (get_val("item") or "").replace("\n", " ").strip() or None,
            "task":         task_text,
            "status":       status,
            "startTime":    _resolve_time(get_raw("startTime"), anchor),
            "endTime":      end_time,
            # estimatedEnd is frozen at import time (original planned end — never edited by dashboard)
            "estimatedEnd": end_time,
            "assignee":     (get_val("assignee") or "").replace("\n", " ").strip() or None,
            # v2 fields — only written when column is mapped
            "taskId":  (get_val("taskId") or "").replace("\n", " ").strip() or None,
            "system":  (get_val("system") or "").replace("\n", " ").strip() or None,
            "party":   (get_val("party") or "").replace("\n", " ").strip() or None,
        }

        result.setdefault(category, []).append(task)

    wb.close()
    return result


def _resolve_time(val, anchor: date | None) -> str | None:
    """Convert a raw openpyxl cell value to a JS-parseable ISO datetime string.

    openpyxl returns time cells as one of:
      - datetime.time          → e.g. time(9, 0)         from a time-only Excel cell
      - datetime.datetime      → e.g. datetime(1900,1,1,3,45) from a post-midnight time
                                 (Excel stores times as fractions of day 0 = 1900-01-00)
      - str                    → already a string (rare, fallback)
      - None                   → empty cell

    When ``anchor`` is provided (a date from mapping["runbook_date"]):
      - time-only cells  → anchor + that time  → "2026-04-15T09:00:00"
      - 1900-epoch cells → anchor + (day-1) offset + that time
        (day=1 → +0 days, day=2 → +1 day, used for post-midnight overflow)
    Without anchor the best we can do is return an ISO string that at least
    includes the time component (JS can still sort/display HH:MM).
    """
    if val is None:
        return None

    # Already a string (e.g. "09:00:00" or "2026-04-15T09:00:00")
    if isinstance(val, str):
        v = val.strip()
        if not v or v.lower() in ("nan", "nat", "none", "null", "n/a"):
            return None
        return v

    # datetime.time — time-only Excel cell (e.g. 09:00)
    if isinstance(val, time):
        if anchor:
            return datetime.combine(anchor, val).strftime("%Y-%m-%dT%H:%M:%S")
        # No anchor — return a time string; JS formatTimeShort will still parse HH:MM
        return val.strftime("%H:%M:%S")

    # datetime.datetime — may be a 1900-epoch overflow (post-midnight times)
    if isinstance(val, datetime):
        if val.year == 1900:
            # Excel epoch artifact: day component encodes overflow days
            # day=1 → same day, day=2 → +1 day, day=10 → +9 days, etc.
            day_offset = val.day - 1
            if anchor:
                resolved_date = anchor + timedelta(days=day_offset)
                return datetime.combine(resolved_date, val.time()).strftime("%Y-%m-%dT%H:%M:%S")
            # No anchor — synthesise a relative ISO by using today + offset
            # so JS can at least sort correctly within the session
            return val.strftime("1900-01-{:02d}T%H:%M:%S".format(val.day))
        # Normal datetime — format as ISO
        return val.strftime("%Y-%m-%dT%H:%M:%S")

    # date without time component
    if isinstance(val, date):
        return datetime(val.year, val.month, val.day).strftime("%Y-%m-%dT%H:%M:%S")

    # Fallback: stringify and clean
    v = str(val).strip()
    return v if v and v.lower() not in ("nan", "nat", "none", "null", "n/a") else None
