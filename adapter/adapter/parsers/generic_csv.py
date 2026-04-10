"""Generic CSV parser with column mapping support."""
import csv
from collections import OrderedDict


DEFAULT_MAPPING = {
    "columns": {
        "task": "task",
        "status": "status",
        "startTime": "startTime",
        "endTime": "endTime",
        "item": "item",
        "assignee": "assignee"
    },
    "category_column": None,  # if None, all tasks go under a single category
    "default_category": "Tasks",
    "status_mapping": {}
}


def parse(source_path: str, mapping: dict | None = None) -> OrderedDict:
    """Parse a CSV file into runbook format using column mapping.

    Args:
        source_path: Path to the CSV file
        mapping: Column mapping dict (see DEFAULT_MAPPING for structure)

    Returns:
        OrderedDict of category -> list of task dicts
    """
    m = {**DEFAULT_MAPPING, **(mapping or {})}
    cols = m["columns"]
    cat_col = m.get("category_column")
    default_cat = m.get("default_category", "Tasks")
    status_map = m.get("status_mapping", {})
    cat_map = m.get("category_mapping", {})

    result = OrderedDict()

    # Try encodings in order of likelihood
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            with open(source_path, "r", encoding=encoding) as f:
                rows = list(csv.DictReader(f))
            break
        except (UnicodeDecodeError, UnicodeError):
            continue
    else:
        raise ValueError(f"Could not decode {source_path} with any supported encoding")

    for row in rows:
        # Determine category
        if cat_col and cat_col in row:
            category = (row[cat_col] or default_cat).strip()
        else:
            category = default_cat

        if not category:
            category = default_cat

        # Normalize: collapse whitespace, fix common encoding artifacts
        category = _clean_text(category)
        # Apply explicit category mapping if provided
        category = cat_map.get(category, category)

        # Map columns
        raw_status = (row.get(cols.get("status", ""), "") or "").strip()
        status = status_map.get(raw_status, raw_status) if raw_status else "Not Started"

        task = {
            "item": (row.get(cols.get("item", ""), "") or "").strip() or None,
            "task": _clean_text((row.get(cols.get("task", ""), "") or "").strip()),
            "status": status,
            "startTime": _clean_time(row.get(cols.get("startTime", ""), "")),
            "endTime": _clean_time(row.get(cols.get("endTime", ""), "")),
            "assignee": (row.get(cols.get("assignee", ""), "") or "").strip() or None
        }

        if not task["task"]:
            continue  # skip empty rows

        result.setdefault(category, []).append(task)

    return result


def _clean_text(val: str) -> str:
    """Normalize text: fix encoding artifacts, collapse whitespace."""
    import re
    val = val.replace('\xa0', ' ')
    val = val.replace('\u2011', '-').replace('\u2010', '-')
    val = val.replace('\u2013', '-').replace('\u2014', '-')
    val = re.sub(r'\s+', ' ', val)
    return val.strip()


def _clean_time(val: str | None) -> str | None:
    """Clean a time value — return None for empty/invalid."""
    if not val or not val.strip():
        return None
    v = val.strip()
    if v.lower() in ("nan", "nat", "none", "null", "n/a", ""):
        return None
    return v
