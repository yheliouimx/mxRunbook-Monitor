"""
gui/pages/step3_preview.py

Phase 4 — Step 3: Preview & Validate
Runs conversion + validation + quality check on entry, shows summary bar,
quality report, and a paginated task table.  Blocks Next when schema_errors
is non-empty.
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

_PAGE_SIZE = 25

_STATUS_COLORS = {
    "Completed":   "var(--color-success)",
    "In Progress": "var(--color-info)",
    "Not Started": "var(--color-text-dim)",
    "Blocking":    "var(--color-danger)",
    "Unneeded":    "var(--color-text-dim)",
}

# Module-level refresh handle (single-user desktop tool)
_do_refresh: callable = lambda: None


# ── Pure logic (no NiceGUI dependency — fully testable) ───

def run_pipeline() -> str | None:
    """
    Convert → validate → quality check using current AppState.
    Mutates state.parsed_data, state.schema_errors, state.quality_report.
    Returns None on success, error string on failure.
    """
    if not state.source_path or not state.mapping:
        return "No source file or mapping available."
    try:
        state.processing = True
        data = bridge.run_convert(state.source_path, state.detected_format, state.mapping)
        errors = bridge.run_validate(data)
        quality = bridge.run_quality(data)
        state.parsed_data = dict(data)
        state.schema_errors = errors
        state.quality_report = quality
        state.processing = False
        return None
    except RuntimeError as exc:
        state.processing = False
        state.schema_errors = [str(exc)]
        state.quality_report = {}
        state.parsed_data = {}
        return str(exc)


def summary_stats(data: dict) -> tuple[int, int]:
    """Return (num_categories, num_tasks) from a parsed_data dict."""
    categories = {k: v for k, v in data.items() if not k.startswith("_") and isinstance(v, list)}
    return len(categories), sum(len(v) for v in categories.values())


def flat_rows(data: dict) -> list[dict]:
    """Flatten parsed_data to a list of row dicts for the table display."""
    rows = []
    for cat, tasks in data.items():
        if cat.startswith("_") or not isinstance(tasks, list):
            continue
        for i, task in enumerate(tasks):
            rows.append({
                "category":  cat,
                "num":       i + 1,
                "task":      task.get("task", ""),
                "status":    task.get("status", ""),
                "startTime": task.get("startTime") or "",
                "endTime":   task.get("endTime") or "",
                "assignee":  task.get("assignee") or "",
            })
    return rows


def on_enter() -> None:
    """Called by app.py when the user advances from Step 2. Runs pipeline and refreshes UI."""
    run_pipeline()
    _do_refresh()


# ── NiceGUI page ──────────────────────────────────────────

def render(stepper) -> None:  # noqa: ARG001
    global _do_refresh

    step_header(3, "Preview & Validate", "Review data and fix issues before exporting")

    with glass_card():

        @ui.refreshable
        def preview_ui() -> None:

            # ── Spinner while converting ──────────────────
            if state.processing:
                with ui.column().classes("items-center w-full").style(
                    "gap: 16px; padding: 32px 0;"
                ):
                    ui.spinner(size="lg")
                    ui.label("Processing…").style("color: var(--color-text-secondary);")
                return

            # ── Waiting state (user hasn't advanced yet) ──
            if not state.parsed_data and not state.schema_errors:
                with ui.column().classes("items-center w-full").style(
                    "gap: 10px; padding: 32px 0;"
                ):
                    ui.icon("pending_actions").style(
                        "font-size: 3rem; color: var(--color-text-dim);"
                    )
                    ui.label("Advance from Step 2 to run the preview.").style(
                        "color: var(--color-text-dim);"
                    )
                return

            num_cats, num_tasks = summary_stats(state.parsed_data)
            num_errs  = len(state.schema_errors)
            num_warns = len(state.quality_report.get("warnings", []))

            # ── Summary bar ───────────────────────────────
            with ui.row().classes("items-center").style(
                "gap: 24px; flex-wrap: wrap; margin-bottom: 14px;"
            ):
                _stat_chip(str(num_cats),  "categories", "category")
                _stat_chip(str(num_tasks), "tasks",      "assignment")
                _stat_chip(
                    str(num_errs), "errors", "error",
                    "var(--color-danger)" if num_errs else "var(--color-success)",
                )
                _stat_chip(
                    str(num_warns), "warnings", "warning_amber",
                    "var(--color-warning)" if num_warns else "var(--color-text-dim)",
                )

            # ── Schema error banner (blocks Next) ─────────
            if state.schema_errors:
                with ui.row().classes("items-center w-full").style(
                    "gap: 10px; background: var(--color-danger-bg); "
                    "border-radius: 8px; padding: 12px 16px; margin-bottom: 10px;"
                ):
                    ui.icon("block").style("color: var(--color-danger); font-size: 1.4rem;")
                    with ui.column().style("gap: 3px;"):
                        ui.label("Schema errors detected — fix source data or mapping before exporting").style(
                            "color: var(--color-danger); font-weight: 600; font-size: 0.9rem;"
                        )
                        for err in state.schema_errors[:5]:
                            ui.label(f"• {err}").style(
                                "color: var(--color-danger); font-size: 0.82rem;"
                            )
                        if len(state.schema_errors) > 5:
                            ui.label(
                                f"… and {len(state.schema_errors) - 5} more"
                            ).style("color: var(--color-danger); font-size: 0.82rem;")

            # ── Quality report (collapsible) ──────────────
            report = state.quality_report
            if report:
                has_issues = bool(report.get("errors") or report.get("warnings"))
                with ui.expansion(
                    "Quality report", icon="fact_check", value=has_issues
                ).classes("w-full").style(
                    "color: var(--color-text-secondary); margin-bottom: 10px;"
                ):
                    for section, icon_name, color in (
                        ("errors",   "error",         "var(--color-danger)"),
                        ("warnings", "warning_amber",  "var(--color-warning)"),
                        ("info",     "info",            "var(--color-info)"),
                    ):
                        items = report.get(section, [])
                        if not items:
                            continue
                        ui.label(f"{section.upper()} ({len(items)})").style(
                            f"color: {color}; font-weight: 600; font-size: 0.78rem; "
                            "margin: 8px 0 4px; text-transform: uppercase; letter-spacing: .04em;"
                        )
                        for item in items:
                            with ui.row().classes("items-start").style(
                                "gap: 6px; margin-bottom: 2px;"
                            ):
                                ui.icon(icon_name).style(
                                    f"color: {color}; font-size: 0.9rem; margin-top: 1px; flex-shrink: 0;"
                                )
                                ui.label(item).style(
                                    "color: var(--color-text-secondary); font-size: 0.83rem; flex: 1;"
                                )

            # ── Paginated task table ───────────────────────
            rows = flat_rows(state.parsed_data)
            if not rows:
                return

            ui.separator().style("margin: 12px 0; border-color: var(--color-border);")
            ui.label(f"{len(rows)} tasks total").style(
                "color: var(--color-text-dim); font-size: 0.8rem; margin-bottom: 6px;"
            )

            total_pages = max(1, (len(rows) + _PAGE_SIZE - 1) // _PAGE_SIZE)
            page_state = [0]   # mutable so inner closures can update it

            @ui.refreshable
            def table_ui() -> None:
                start = page_state[0] * _PAGE_SIZE
                page_rows = rows[start: start + _PAGE_SIZE]

                # Header row
                with ui.row().classes("w-full").style(
                    "background: var(--color-surface-alt); border-radius: 6px 6px 0 0; "
                    "padding: 6px 10px; gap: 0; border-bottom: 1px solid var(--color-border);"
                ):
                    for lbl, flex in (
                        ("Category", "2"), ("#", "0.4"), ("Task", "4"),
                        ("Status", "1.5"), ("Start", "1.5"), ("End", "1.5"), ("Assignee", "1.5"),
                    ):
                        ui.label(lbl).style(
                            f"flex: {flex}; color: var(--color-text-dim); "
                            "font-size: 0.74rem; font-weight: 600; text-transform: uppercase; "
                            "letter-spacing: .04em;"
                        )

                # Data rows
                for i, row in enumerate(page_rows):
                    alt = "var(--color-surface-alt)" if i % 2 else "transparent"
                    status_color = _STATUS_COLORS.get(row["status"], "var(--color-text-secondary)")
                    with ui.row().classes("w-full").style(
                        f"background: {alt}; padding: 5px 10px; gap: 0; "
                        "border-top: 1px solid var(--color-border);"
                    ):
                        for val, flex in (
                            (row["category"], "2"),
                            (str(row["num"]), "0.4"),
                            (row["task"],    "4"),
                        ):
                            ui.label(val).style(
                                f"flex: {flex}; color: var(--color-text-primary); "
                                "font-size: 0.84rem; overflow: hidden; "
                                "text-overflow: ellipsis; white-space: nowrap;"
                            )
                        ui.label(row["status"]).style(
                            f"flex: 1.5; color: {status_color}; "
                            "font-size: 0.84rem; font-weight: 500;"
                        )
                        for val, flex in (
                            (row["startTime"] or "—", "1.5"),
                            (row["endTime"]   or "—", "1.5"),
                            (row["assignee"]  or "—", "1.5"),
                        ):
                            ui.label(val).style(
                                f"flex: {flex}; color: var(--color-text-secondary); "
                                "font-size: 0.82rem;"
                            )

                # Pagination controls
                if total_pages > 1:
                    with ui.row().classes("items-center justify-center w-full").style(
                        "gap: 10px; margin-top: 8px;"
                    ):
                        def _prev():
                            if page_state[0] > 0:
                                page_state[0] -= 1
                                table_ui.refresh()

                        def _next():
                            if page_state[0] < total_pages - 1:
                                page_state[0] += 1
                                table_ui.refresh()

                        ui.button(icon="chevron_left", on_click=_prev).props(
                            f"flat round dense {'disabled' if page_state[0] == 0 else ''}"
                        )
                        ui.label(
                            f"Page {page_state[0] + 1} of {total_pages}"
                        ).style("color: var(--color-text-secondary); font-size: 0.85rem;")
                        ui.button(icon="chevron_right", on_click=_next).props(
                            f"flat round dense "
                            f"{'disabled' if page_state[0] >= total_pages - 1 else ''}"
                        )

            table_ui()

        _do_refresh = preview_ui.refresh
        preview_ui()


def _stat_chip(
    value: str,
    label: str,
    icon_name: str,
    color: str = "var(--color-text-primary)",
) -> None:
    with ui.row().classes("items-center").style(f"gap: 6px; color: {color};"):
        ui.icon(icon_name).style(f"font-size: 1.1rem; color: {color};")
        ui.label(value).style(f"font-size: 1.3rem; font-weight: 700; color: {color};")
        ui.label(label).style(f"font-size: 0.8rem; color: {color}; opacity: 0.85;")
