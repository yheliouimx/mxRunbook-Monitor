"""
gui/pages/step2_mapping.py

Phase 3 — Step 2: Column Mapping
Auto-detects column assignments from headers; user can adjust via dropdowns.
Required fields (task, status) must be mapped before Next is enabled.
"""
import sys
from pathlib import Path

_REPO_ROOT = str(Path(__file__).parent.parent.parent)
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from nicegui import ui
from gui.state import state
from gui import bridge
from gui.components.glass_card import glass_card
from gui.components.step_header import step_header

# ── Constants ─────────────────────────────────────────────

RUNBOOK_FIELDS = [
    # (field_key, required, display_label)
    ("task",         True,  "Task Description"),
    ("status",       True,  "Status"),
    ("startTime",    False, "Start Time"),
    ("startDate",    False, "Start Date ↑"),   # date column paired with Start Time
    ("endTime",      False, "End Time"),
    ("endDate",      False, "End Date ↑"),     # date column paired with End Time
    ("assignee",     False, "Assignee"),
    ("item",         False, "Item / Reference"),
    ("system",       False, "System"),
    ("party",        False, "Party"),
    ("taskId",       False, "Task ID"),
    ("estimatedEnd", False, "Estimated End"),
    ("comment",      False, "Comment"),
]

CANONICAL_STATUSES = [
    "Not Started", "In Progress", "Completed", "Blocking", "Unneeded",
]

# Module-level refresh handle.
# Single-user desktop tool — one session at a time, so a module-level
# callable is safe. For multi-user deployments, replace with
# per-client storage (e.g. app.storage.client).
_do_refresh: callable = lambda: None


# ── Pure logic (no NiceGUI dependency — fully testable) ───

def apply_autodetect() -> None:
    """Run auto-detect on current headers and assign result to state.mapping."""
    if not state.raw_headers:
        return
    state.mapping = bridge.autodetect(state.raw_headers)


def update_column(field: str, value: str | None) -> None:
    """Set a single field's column assignment and trigger binding watchers."""
    m = state.mapping
    m.setdefault("columns", {})[field] = value
    state.mapping = m          # reassign to notify NiceGUI bind_enabled_from


def update_category(value: str | None) -> None:
    m = state.mapping
    m["category_column"] = value
    state.mapping = m


def update_status_mapping(source: str, canonical: str) -> None:
    m = state.mapping
    m.setdefault("status_mapping", {})[source] = canonical
    state.mapping = m


def update_runbook_date(value: str | None) -> None:
    """Set (or clear) the anchor date used to complete bare HH:MM[:SS] time cells."""
    m = state.mapping
    if value and value.strip():
        m["runbook_date"] = value.strip()
    else:
        m.pop("runbook_date", None)
    state.mapping = m


def is_ready() -> bool:
    """True when both required fields (task, status) have a column assigned."""
    cols = state.mapping.get("columns", {})
    return cols.get("task") is not None and cols.get("status") is not None


def on_enter() -> None:
    """
    Called by app.py when the user advances from Step 1 to Step 2.
    Runs auto-detect if mapping is empty, then refreshes the mapping UI.
    """
    if not state.mapping:
        apply_autodetect()
    _do_refresh()


# ── NiceGUI page ──────────────────────────────────────────

def render(stepper) -> None:  # noqa: ARG001
    global _do_refresh

    step_header(2, "Column Mapping", "Match your spreadsheet columns to runbook fields")

    with glass_card():
        # ── Toolbar: description + re-detect button ───
        with ui.row().classes("items-center justify-between w-full q-mb-sm"):
            ui.label("Map each runbook field to a column in your file").style(
                "color: var(--color-text-secondary); font-size: 0.9rem;"
            )

            def redetect() -> None:
                apply_autodetect()
                mapping_ui.refresh()
                ui.notify("Auto-detect refreshed", type="info", position="top")

            ui.button("Auto-detect again", icon="auto_fix_high", on_click=redetect).props(
                "flat size=sm"
            ).style("color: var(--color-text-secondary);")

        # ── Refreshable mapping UI ────────────────────
        @ui.refreshable
        def mapping_ui() -> None:
            cols   = state.mapping.get("columns", {})
            options = [None] + list(state.raw_headers)

            # ── Column-to-field mapping table ──────────
            with ui.grid(columns=3).classes("w-full").style("gap: 8px; align-items: center;"):
                # Header row
                for heading in ("Runbook field", "Your column", ""):
                    ui.label(heading).style(
                        "color: var(--color-text-dim); font-size: 0.78rem; "
                        "font-weight: 600; text-transform: uppercase; letter-spacing: .04em;"
                    )

                for field, required, label in RUNBOOK_FIELDS:
                    # Col 1 — field label + required badge
                    with ui.row().classes("items-center").style("gap: 6px;"):
                        ui.label(label).style(
                            "color: var(--color-text-primary); font-size: 0.9rem;"
                        )
                        if required:
                            ui.label("required").classes("badge-danger").style(
                                "font-size: 0.68rem;"
                            )

                    # Col 2 — dropdown
                    current = cols.get(field)

                    def _on_change(e, f=field):
                        update_column(f, e.value)
                        mapping_ui.refresh()

                    ui.select(
                        options=options,
                        value=current,
                        on_change=_on_change,
                    ).props("dense options-dense clearable").style("min-width: 200px;")

                    # Col 3 — status indicator / hint
                    if required and current is None:
                        with ui.row().classes("items-center").style("gap: 4px;"):
                            ui.icon("warning_amber").style("color: var(--color-warning); font-size: 1rem;")
                            ui.label("required").style(
                                "color: var(--color-warning-text); font-size: 0.78rem;"
                            )
                    elif current is not None:
                        ui.icon("check_circle").style(
                            "color: var(--color-success); font-size: 1rem;"
                        )
                    elif field in ("startDate", "endDate"):
                        ui.label("date column — combined with time above").style(
                            "color: var(--color-text-dim); font-size: 0.76rem; font-style: italic;"
                        )
                    else:
                        ui.label("")   # empty cell keeps grid aligned

            ui.separator().style("margin: 14px 0; border-color: var(--color-border);")

            # ── Category column ─────────────────────────
            with ui.row().classes("items-center").style("gap: 12px;"):
                ui.label("Category column").style(
                    "color: var(--color-text-primary); font-size: 0.9rem; min-width: 160px;"
                )
                cat_val = state.mapping.get("category_column")

                def _on_cat(e):
                    update_category(e.value)

                ui.select(
                    options=[None] + list(state.raw_headers),
                    value=cat_val,
                    on_change=_on_cat,
                ).props("dense options-dense clearable").style("min-width: 200px;")

                ui.label("Optional — groups tasks into collapsible sections").style(
                    "color: var(--color-text-dim); font-size: 0.8rem;"
                )

            # ── Runbook date (anchor for time-only cells) ─
            with ui.row().classes("items-center").style("gap: 12px; margin-top: 6px;"):
                ui.label("Runbook date").style(
                    "color: var(--color-text-primary); font-size: 0.9rem; min-width: 160px;"
                )
                date_val = state.mapping.get("runbook_date", "")

                def _on_date(e):
                    update_runbook_date(e.value)

                ui.input(
                    value=date_val or "",
                    placeholder="YYYY-MM-DD  (e.g. 2026-04-15)",
                    on_change=_on_date,
                ).props("dense clearable").style("min-width: 200px;")

                with ui.row().classes("items-center").style("gap: 4px;"):
                    ui.icon("info_outline").style(
                        "color: var(--color-text-dim); font-size: 1rem;"
                    )
                    ui.label(
                        "Optional — fills the date part when time cells contain only HH:MM:SS"
                    ).style("color: var(--color-text-dim); font-size: 0.8rem;")

            # ── Required-field warning banner ───────────
            missing = [
                lbl
                for fld, req, lbl in RUNBOOK_FIELDS
                if req and cols.get(fld) is None
            ]
            if missing:
                ui.separator().style("margin: 14px 0; border-color: var(--color-border);")
                with ui.row().classes("items-center").style(
                    "gap: 10px; background: var(--color-warning-bg); "
                    "border-radius: 8px; padding: 10px 14px;"
                ):
                    ui.icon("warning").style("color: var(--color-warning);")
                    ui.label(
                        f"Map required field(s) to continue: {', '.join(missing)}"
                    ).style("color: var(--color-warning-text); font-size: 0.88rem;")

            # ── Status value mapping (collapsible) ──────
            status_map = state.mapping.get("status_mapping", {})
            if status_map:
                ui.separator().style("margin: 14px 0; border-color: var(--color-border);")
                with ui.expansion("Status value mapping", icon="tune").classes(
                    "w-full"
                ).style("color: var(--color-text-secondary);"):
                    ui.label(
                        "Map each source value to a canonical runbook status."
                    ).style(
                        "color: var(--color-text-dim); font-size: 0.82rem; margin-bottom: 10px;"
                    )
                    with ui.grid(columns=3).style("gap: 8px; align-items: center;"):
                        for src_val, canonical in list(status_map.items()):
                            ui.label(src_val).style(
                                "color: var(--color-text-secondary); font-size: 0.88rem;"
                            )
                            ui.icon("arrow_right_alt").style("color: var(--color-text-dim);")

                            def _on_status(e, s=src_val):
                                update_status_mapping(s, e.value)

                            ui.select(
                                options=CANONICAL_STATUSES,
                                value=canonical,
                                on_change=_on_status,
                            ).props("dense options-dense").style("min-width: 160px;")

        # Register the refresh handle and do first render
        _do_refresh = mapping_ui.refresh
        mapping_ui()
