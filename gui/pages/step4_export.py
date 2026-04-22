"""
gui/pages/step4_export.py

Phase 5 — Step 4: Export
User sets output path (default: source_dir/runbook.json), saves, sees
success state with open-folder link.  "Start over" resets AppState and
reloads the page.
"""
import os
import platform
import subprocess
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


# ── Pure logic (no NiceGUI dependency — fully testable) ───

def default_output_path() -> str:
    """Return the default export path: same dir as source, named runbook.json."""
    if state.source_path:
        return str(Path(state.source_path).parent / "runbook.json")
    return str(Path.cwd() / "runbook.json")


def do_export(output_path: str) -> str | None:
    """
    Write state.parsed_data to output_path via bridge.write_runbook().
    Mutates state.saved_path, state.save_success, state.output_path.
    Returns None on success, error string on failure.
    """
    if not state.parsed_data:
        return "No data to export. Complete Steps 1–3 first."
    if not output_path or not output_path.strip():
        return "Output path cannot be empty."
    try:
        saved = bridge.write_runbook(state.parsed_data, output_path.strip())
        state.saved_path = saved
        state.save_success = True
        state.output_path = saved
        return None
    except RuntimeError as exc:
        state.save_success = False
        return str(exc)


# ── NiceGUI page ──────────────────────────────────────────

def render(stepper) -> None:  # noqa: ARG001
    step_header(4, "Export", "Save the converted runbook to disk")

    with glass_card():

        @ui.refreshable
        def export_ui() -> None:

            # ── Success state ──────────────────────────────
            if state.save_success and state.saved_path:
                with ui.column().classes("items-center w-full").style(
                    "gap: 18px; padding: 28px 0;"
                ):
                    ui.icon("check_circle").style(
                        "font-size: 4rem; color: var(--color-success);"
                    )
                    ui.label("Runbook saved successfully!").style(
                        "font-size: 1.2rem; font-weight: 600; "
                        "color: var(--color-text-emphasis);"
                    )

                    # Saved path pill
                    with ui.row().classes("items-center").style(
                        "gap: 8px; background: var(--color-surface-alt); "
                        "border-radius: 6px; padding: 10px 16px; max-width: 100%;"
                    ):
                        ui.icon("description").style("color: var(--color-info); flex-shrink: 0;")
                        ui.label(state.saved_path).style(
                            "color: var(--color-text-secondary); font-family: monospace; "
                            "font-size: 0.85rem; word-break: break-all;"
                        )

                    with ui.row().style("gap: 12px;"):
                        ui.button(
                            "Open folder",
                            icon="folder_open",
                            on_click=lambda: _open_folder(
                                str(Path(state.saved_path).parent)
                            ),
                        ).props("unelevated").classes("primary-btn")

                        ui.button(
                            "Start over",
                            icon="refresh",
                            on_click=_do_start_over,
                        ).props("flat")
                return

            # ── Export form ────────────────────────────────
            ui.label("Output file path").style(
                "color: var(--color-text-secondary); font-size: 0.88rem; margin-bottom: 2px;"
            )

            path_input = ui.input(
                value=default_output_path(),
                placeholder="/path/to/runbook.json",
            ).classes("w-full").props("outlined dense")

            ui.label(
                ".json format · existing runbook.json will be merged (preserves _issues, _health)"
            ).style(
                "color: var(--color-text-dim); font-size: 0.78rem; margin-top: 2px;"
            )

            error_label = ui.label("").style(
                "color: var(--color-danger); font-size: 0.85rem; "
                "margin-top: 4px; min-height: 1.1em;"
            )

            ui.separator().style("margin: 14px 0; border-color: var(--color-border);")

            def _save() -> None:
                error_label.text = ""
                err = do_export(path_input.value)
                if err:
                    error_label.text = err
                    ui.notify(err, type="negative", position="top")
                else:
                    ui.notify(f"Saved: {state.saved_path}", type="positive", position="top")
                    export_ui.refresh()

            with ui.row().style("gap: 12px; align-items: center;"):
                ui.button(
                    "Save runbook.json",
                    icon="save",
                    on_click=_save,
                ).props("unelevated").classes("primary-btn")

                ui.button(
                    "Start over",
                    icon="refresh",
                    on_click=_do_start_over,
                ).props("flat")

        export_ui()


def _do_start_over() -> None:
    """Reset all state and reload the wizard from the beginning."""
    state.reset()
    ui.navigate.to("/")


def _open_folder(folder_path: str) -> None:
    """Open the OS file manager at the given directory (best-effort)."""
    try:
        system = platform.system()
        if system == "Windows":
            os.startfile(folder_path)  # type: ignore[attr-defined]
        elif system == "Darwin":
            subprocess.Popen(["open", folder_path])
        else:
            subprocess.Popen(["xdg-open", folder_path])
    except Exception:
        pass
