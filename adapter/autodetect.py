"""
adapter/autodetect.py

Auto-detect column mapping from spreadsheet/CSV headers.

Normalises each header to lowercase, strips whitespace, then checks against
a table of known aliases for each runbook field.  The result is a dict in the
same format as mapping.yml so it can be written to file or passed directly
to the parsers.

Usage (CLI, via convert.py --auto-detect):
    python adapter/convert.py --auto-detect --source runbook.xlsx
    python adapter/convert.py --auto-detect --source runbook.csv > mapping.yml
"""

# ── Alias tables ──────────────────────────────────────────
# Each key is the canonical runbook field name.
# Values are lowercased substrings / exact matches to recognise.
# Order matters: first match wins when a header could fit multiple fields.

FIELD_ALIASES: dict[str, list[str]] = {
    # ── Core fields ──
    "task": [
        "task", "activity", "activities", "action", "step",
        "description", "work item", "workitem", "title", "name",
    ],
    "status": [
        "status", "state", "progress", "completion", "statut",
    ],
    "category": [
        "category", "phase", "section", "group", "workstream",
        "stream", "area", "domain", "chapter",
    ],
    "startTime": [
        "start time", "starttime", "start", "begin", "begins",
        "scheduled start", "planned start", "exp start", "expected start",
        "debut",
    ],
    "endTime": [
        "end time", "endtime", "end", "finish", "finishes",
        "scheduled end", "planned end", "exp end", "expected end",
        "fin",
    ],
    "assignee": [
        "assignee", "owner", "responsible", "resource", "who",
        "team member", "contact", "lead", "poc",
    ],
    "item": [
        "item", "id", "ref", "reference", "ticket", "no.", "no",
        "number", "#", "seq", "sequence number",
    ],
    # ── v2 / optional fields ──
    "taskId": [
        "task id", "taskid", "task#", "task no", "task number",
        "seq", "sequence",
    ],
    "system": [
        "system", "application", "app", "component", "tool",
        "platform", "module", "service",
    ],
    "party": [
        "party", "owner type", "responsible party", "side",
        "client / murex", "team type",
    ],
    "estimatedEnd": [
        "estimated end", "estimatedend", "planned end", "target end",
        "due", "due date", "target", "eta",
    ],
    "comment": [
        "comment", "comments", "note", "notes", "remark", "remarks",
        "details", "observation",
    ],
}

# Canonical status values → common source-side labels
DEFAULT_STATUS_MAPPING: dict[str, str] = {
    "Done":        "Completed",
    "WIP":         "In Progress",
    "In Progress": "In Progress",
    "Pending":     "Not Started",
    "Not Started": "Not Started",
    "Blocked":     "Blocking",
    "Blocking":    "Blocking",
    "N/A":         "Unneeded",
    "Not Needed":  "Unneeded",
}


# ── Matching logic ────────────────────────────────────────

def _normalise(header: str) -> str:
    """Lowercase, strip, collapse multiple spaces."""
    return " ".join(header.lower().strip().split())


def _score(norm_header: str, aliases: list[str]) -> int:
    """
    Return a match score for a normalised header against an alias list.
    Exact match → 2, substring match → 1, no match → 0.
    """
    for alias in aliases:
        if norm_header == alias:
            return 2
        if alias in norm_header or norm_header in alias:
            return 1
    return 0


def autodetect_mapping(headers: list[str]) -> dict:
    """
    Given a list of column header strings, return a mapping dict.

    The dict has the same structure as mapping.yml:
      columns:       {field: source_column_name | None}
      category_column: source_column_name | None
      status_mapping: {source_value: canonical_value}

    Unmatched fields are set to None (omitted from output YAML).
    """
    norm_headers = [_normalise(h) for h in headers]

    # For each field, find the best-scoring header
    columns: dict[str, str | None] = {}
    category_column: str | None = None

    # Track which original headers have already been claimed
    claimed: set[int] = set()

    # Process fields in definition order (category first for clarity)
    ordered_fields = ["category"] + [f for f in FIELD_ALIASES if f != "category"]

    for field in ordered_fields:
        aliases = FIELD_ALIASES[field]
        best_score = 0
        best_idx = -1

        for i, norm in enumerate(norm_headers):
            if i in claimed:
                continue
            s = _score(norm, aliases)
            if s > best_score:
                best_score = s
                best_idx = i

        if best_score > 0 and best_idx >= 0:
            original = headers[best_idx]
            if field == "category":
                category_column = original
            else:
                columns[field] = original
            claimed.add(best_idx)
        else:
            if field != "category":
                columns[field] = None

    return {
        "columns": columns,
        "category_column": category_column,
        "default_category": "Tasks",
        "status_mapping": DEFAULT_STATUS_MAPPING,
    }


def format_yaml(mapping: dict) -> str:
    """Render the mapping dict as a human-readable YAML string (no PyYAML needed)."""
    lines = ["columns:"]
    for field, col in mapping["columns"].items():
        if col is not None:
            lines.append(f'  {field}: "{col}"')
        else:
            lines.append(f"  {field}: null  # not detected — set manually if needed")

    lines.append("")
    cat = mapping.get("category_column")
    lines.append(f'category_column: {f\'"{cat}"\' if cat else "null  # not detected"}')
    lines.append(f'default_category: "{mapping.get("default_category", "Tasks")}"')

    lines.append("")
    lines.append("status_mapping:")
    for src, canonical in mapping.get("status_mapping", {}).items():
        lines.append(f'  "{src}": "{canonical}"')

    lines.append("")
    lines.append("# category_mapping:  # uncomment to normalise category name typos")
    lines.append("#   'Deplymnt': 'Deployment'")
    lines.append("")
    lines.append("# runbook_date: '2026-04-15'  # uncomment to anchor time-only Excel cells")

    return "\n".join(lines)
