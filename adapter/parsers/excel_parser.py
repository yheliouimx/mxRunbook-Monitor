"""Excel (.xlsx/.xls) parser with column mapping support."""
from collections import OrderedDict

try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False


DEFAULT_MAPPING = {
    "columns": {
        "task": "task",
        "status": "status",
        "startTime": "startTime",
        "endTime": "endTime",
        "item": "item",
        "assignee": "assignee"
    },
    "category_column": None,
    "default_category": "Tasks",
    "status_mapping": {},
    "sheet": None  # None = first sheet
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

    wb = openpyxl.load_workbook(source_path, read_only=True, data_only=True)
    ws = wb[sheet_name] if sheet_name and sheet_name in wb.sheetnames else wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return OrderedDict()

    # First row is headers
    headers = [str(h).strip() if h else "" for h in rows[0]]
    header_idx = {h: i for i, h in enumerate(headers) if h}

    result = OrderedDict()

    for row in rows[1:]:
        def get_val(field_key):
            col_name = cols.get(field_key, "")
            if col_name and col_name in header_idx:
                val = row[header_idx[col_name]]
                return str(val).strip() if val is not None else ""
            return ""

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

        task_text = get_val("task")
        if not task_text:
            continue

        task = {
            "item": get_val("item") or None,
            "task": task_text,
            "status": status,
            "startTime": _clean_time(get_val("startTime")),
            "endTime": _clean_time(get_val("endTime")),
            "assignee": get_val("assignee") or None
        }

        result.setdefault(category, []).append(task)

    wb.close()
    return result


def _clean_time(val: str) -> str | None:
    """Clean a time value — return None for empty/invalid."""
    if not val:
        return None
    if val.lower() in ("nan", "nat", "none", "null", "n/a"):
        return None
    return val
