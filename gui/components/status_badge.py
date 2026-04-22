"""gui/components/status_badge.py — Colour-coded status pill."""
from nicegui import ui

# Maps canonical status values to badge CSS class
_STATUS_CLASS: dict[str, str] = {
    "Completed":   "badge-success",
    "Done":        "badge-success",
    "In Progress": "badge-warning",
    "WIP":         "badge-warning",
    "Not Started": "badge-neutral",
    "Pending":     "badge-neutral",
    "Blocking":    "badge-danger",
    "Blocked":     "badge-danger",
    "Unneeded":    "badge-info",
    "N/A":         "badge-info",
}

# Shorthand aliases used elsewhere in the UI (format/quality badges)
VARIANT_CLASS: dict[str, str] = {
    "success": "badge-success",
    "warning": "badge-warning",
    "danger":  "badge-danger",
    "info":    "badge-info",
    "neutral": "badge-neutral",
    "csv":     "badge-info",
    "excel":   "badge-success",
}


def status_badge(text: str, variant: str | None = None) -> ui.label:
    """
    Render an inline badge.

    :param text:    Display text (e.g. "Completed", "CSV", "3 errors").
    :param variant: Optional explicit variant key from VARIANT_CLASS.
                    If omitted the badge class is inferred from text.
    """
    if variant:
        css = VARIANT_CLASS.get(variant, "badge-neutral")
    else:
        css = _STATUS_CLASS.get(text, "badge-neutral")
    return ui.label(text).classes(css)
