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
        # Date columns (optional — use when date and time are in separate Excel columns)
        # e.g. startDate: "Start Date", startTime: "Start Time" → merged into "2026-04-15T09:00:00"
        # Per-task dates take priority over the global runbook_date anchor.
        "startDate":    None,  # e.g. "Start Date"
        "endDate":      None,  # e.g. "End Date"
        # v2 fields (optional — set to None to skip, or map to Excel column name)
        "taskId":       None,  # e.g. "Task ID"
        "system":       None,  # e.g. "Impacted System"
        "party":        None,  # e.g. "Responsible Party" — expected: Client/Murex/Joint
    },
    "category_column": None,
    "default_category": "Tasks",
    "status_mapping": {},
    "sheet": None,       # None = first sheet
    "runbook_date": None, # ISO date string "YYYY-MM-DD" to anchor time-only cells
    "category_date_format": None,  # e.g. "DD Month YYYY" — see _format_category
    "category_date_source": None,  # source format: "YYYY-MM-DD" or "YYYY-DD-MM" (default: auto)
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
    cat_date_fmt = m.get("category_date_format")    # e.g. "DD Month YYYY"
    cat_date_src = m.get("category_date_source")    # e.g. "YYYY-MM-DD" or "YYYY-DD-MM"

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
            raw_cat = row[header_idx[cat_col]]
            category = _format_category(raw_cat, default_cat, cat_date_fmt, cat_date_src)
        else:
            category = default_cat
        if not category:
            category = default_cat

        raw_status = get_val("status")
        status = status_map.get(raw_status, raw_status) if raw_status else "Not Started"

        task_text = get_val("task").replace("\n", " ").strip()
        if not task_text:
            continue

        # Resolve per-task date anchors (override global runbook_date if date columns are mapped)
        task_start_anchor = _resolve_date(get_raw("startDate")) or anchor
        task_end_anchor   = _resolve_date(get_raw("endDate"))   or anchor

        end_time = _resolve_time(get_raw("endTime"), task_end_anchor)
        task = {
            "item":         (get_val("item") or "").replace("\n", " ").strip() or None,
            "task":         task_text,
            "status":       status,
            "startTime":    _resolve_time(get_raw("startTime"), task_start_anchor),
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
    return _sort_categories(result, default_cat)


def _sort_categories(result: OrderedDict, default_cat: str) -> OrderedDict:
    """Sort categories chronologically (date categories first), non-dates and
    default/Uncategorized always last — preserving task order within each category."""
    date_keys = []
    other_keys = []
    tail_keys = []  # default_cat and "Uncategorized" always go last

    for key in result:
        low = key.strip().lower()
        if low in (default_cat.lower(), "uncategorized"):
            tail_keys.append(key)
        elif _try_parse_date_string(key, None) is not None:
            date_keys.append(key)
        else:
            other_keys.append(key)

    def date_sort_key(k):
        d = _try_parse_date_string(k, None)
        return d if d else date.min

    date_keys.sort(key=date_sort_key)

    sorted_result = OrderedDict()
    for k in date_keys + other_keys + tail_keys:
        sorted_result[k] = result[k]
    return sorted_result


# ---- Date format tokens → Python strftime ----
_DATE_FORMAT_MAP = {
    "DD":    "%d",
    "Month": "%B",      # full month name: April
    "Mon":   "%b",      # abbreviated: Apr
    "MM":    "%m",
    "YYYY":  "%Y",
    "YY":    "%y",
}


def _token_to_strftime(fmt: str) -> str:
    """Convert a simple date format string like 'DD Month YYYY' to strftime."""
    result = fmt
    # Replace longest tokens first to avoid partial matches
    for token, code in sorted(_DATE_FORMAT_MAP.items(), key=lambda t: -len(t[0])):
        result = result.replace(token, code)
    return result


# Source format patterns for parsing category date strings
_SOURCE_FORMATS = {
    "YYYY-MM-DD": "%Y-%m-%d",
    "YYYY-DD-MM": "%Y-%d-%m",
    "DD-MM-YYYY": "%d-%m-%Y",
    "MM-DD-YYYY": "%m-%d-%Y",
    "DD/MM/YYYY": "%d/%m/%Y",
    "MM/DD/YYYY": "%m/%d/%Y",
}


def _format_category(raw_val, default_cat: str, date_fmt: str | None,
                     date_src: str | None) -> str:
    """Format a raw category cell value, converting dates to human-readable form.

    If ``date_fmt`` is set (e.g. "DD Month YYYY") and the cell contains a date,
    the category name becomes "10 April 2026" instead of "2026-04-10 00:00:00".
    """
    if raw_val is None:
        return default_cat

    # openpyxl returns date columns as datetime objects
    if isinstance(raw_val, datetime):
        if date_fmt:
            return raw_val.strftime(_token_to_strftime(date_fmt))
        # No format specified — still clean up the "00:00:00" noise
        if raw_val.hour == 0 and raw_val.minute == 0 and raw_val.second == 0:
            return raw_val.strftime("%d %B %Y")  # sensible default
        return raw_val.strftime("%d %B %Y %H:%M")

    if isinstance(raw_val, date) and not isinstance(raw_val, datetime):
        if date_fmt:
            return raw_val.strftime(_token_to_strftime(date_fmt))
        return raw_val.strftime("%d %B %Y")

    # String value — try to parse as a date if date_fmt is requested
    text = str(raw_val).strip()
    if not text:
        return default_cat

    if date_fmt:
        parsed_date = _try_parse_date_string(text, date_src)
        if parsed_date:
            return parsed_date.strftime(_token_to_strftime(date_fmt))

    return text


def _try_parse_date_string(text: str, date_src: str | None) -> date | None:
    """Try to parse a date string using the source format or common patterns."""
    # If source format is specified, try it first
    if date_src and date_src in _SOURCE_FORMATS:
        try:
            # Strip time component if present (e.g. "2026-04-10 00:00:00")
            date_part = text.split(" ")[0] if " " in text else text
            return datetime.strptime(date_part, _SOURCE_FORMATS[date_src]).date()
        except ValueError:
            pass

    # Auto-detect: try common formats including human-readable outputs
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y",
                "%d-%m-%Y", "%Y-%m-%dT%H:%M:%S",
                "%d %B %Y", "%d %b %Y"):  # e.g. "10 April 2026", "10 Apr 2026"
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _resolve_date(val) -> "date | None":
    """Extract a date object from an Excel cell value (date, datetime, or string).
    Used to get the per-task date anchor from a dedicated 'Start Date'/'End Date' column.
    """
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        return _try_parse_date_string(val.strip(), None)
    return None


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
        if not v or v.lower() in ("nan", "nat", "none", "null", "n/a", "?", "tbd",
                                    "tbc", "hh:mm", "hh:mm:ss", "-", "--", "n.a."):
            return None
        # Try to parse as a real datetime / time before accepting the string
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S",
                    "%Y-%m-%d %H:%M", "%H:%M:%S", "%H:%M"):
            try:
                parsed = datetime.strptime(v, fmt)
                if "%Y" not in fmt:
                    # time-only string — attach anchor if available
                    if anchor:
                        return datetime.combine(anchor, parsed.time()).strftime("%Y-%m-%dT%H:%M:%S")
                    return parsed.strftime("%H:%M:%S")
                return parsed.strftime("%Y-%m-%dT%H:%M:%S")
            except ValueError:
                continue
        # Unparseable non-empty string — discard rather than pass garbage downstream
        return None

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
