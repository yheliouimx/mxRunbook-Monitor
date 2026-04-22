"""
gui/pages/step1_import.py

Phase 2 — Step 1: Import File
User uploads a CSV or Excel file; format is detected, headers are read,
and AppState is populated so Step 2 can run auto-detect.
"""
import os
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

_ACCEPTED = {".csv", ".xlsx", ".xls"}


# ── Pure logic (no NiceGUI dependency — fully testable) ───

def process_upload(name: str, content: bytes) -> dict | str:
    """
    Validate and parse an uploaded file.

    Returns a dict of state fields on success, or an error string on failure.
    The caller is responsible for writing these fields to AppState and cleaning
    up any previous temp file.
    """
    suffix = Path(name).suffix.lower()
    if suffix not in _ACCEPTED:
        return (
            f"Unsupported file type '{suffix}'. "
            "Please upload a .csv, .xlsx, or .xls file."
        )
    try:
        tmp_path = bridge.bytes_to_temp_file(content, suffix)
        fmt = bridge.detect_format(tmp_path)
        headers, row_count = bridge.read_headers(tmp_path, fmt)
        if not headers:
            return "File has no header row or all header cells are empty."
        return {
            "source_path": tmp_path,
            "temp_path":   tmp_path,
            "detected_format": fmt,
            "raw_headers": headers,
            "row_count":   row_count,
            "file_name":   name,
        }
    except RuntimeError as err:
        return str(err)


# ── NiceGUI page ──────────────────────────────────────────

def render(stepper) -> None:  # noqa: ARG001 — stepper reserved for future use
    step_header(1, "Import File", "Upload your CSV or Excel runbook source")

    with glass_card():

        # ── Refreshable file-status panel ─────────────
        @ui.refreshable
        def file_status() -> None:
            if not state.file_name:
                with ui.column().classes("items-center w-full").style(
                    "gap: 10px; padding: 20px 0; color: var(--color-text-dim);"
                ):
                    ui.icon("cloud_upload").style("font-size: 3rem;")
                    ui.label("No file loaded yet")
                return

            with ui.row().classes("items-center").style("gap: 12px;"):
                ui.icon("check_circle").style("color: var(--color-success);")
                ui.label(state.file_name).style(
                    "color: var(--color-text-primary); font-weight: 500;"
                )
                fmt = state.detected_format or ""
                if fmt:
                    badge_cls = "badge-info" if fmt == "csv" else "badge-success"
                    ui.label(fmt.upper()).classes(badge_cls)

            if state.raw_headers:
                with ui.row().style(
                    "gap: 16px; color: var(--color-text-secondary); "
                    "font-size: 0.85rem; margin-top: 6px;"
                ):
                    ui.label(f"{len(state.raw_headers)} columns detected")
                    ui.label("·").style("color: var(--color-text-dim);")
                    ui.label(f"{state.row_count} data rows")

        # ── Upload handler (closure over file_status) ─
        def handle_upload(e) -> None:
            # Remove previous temp file
            if state.temp_path:
                try:
                    os.remove(state.temp_path)
                except OSError:
                    pass

            content = e.content.read() if hasattr(e.content, "read") else e.content
            result = process_upload(e.name, content)

            if isinstance(result, str):
                state.source_path = None
                state.file_name = None
                state.upload_error = result
                ui.notify(result, type="negative", position="top")
                file_status.refresh()
                return

            # Apply state update and reset all downstream state
            for key, val in result.items():
                setattr(state, key, val)
            state.upload_error = None
            state.mapping = {}
            state.parsed_data = {}
            state.schema_errors = []
            state.quality_report = {}

            ui.notify(f"Loaded: {e.name}", type="positive", position="top")
            file_status.refresh()

        # ── Render ─────────────────────────────────────
        file_status()

        ui.upload(
            on_upload=handle_upload,
            auto_upload=True,
            max_files=1,
        ).props(
            'accept=".csv,.xlsx,.xls" flat label="Browse or drop file" color="primary"'
        ).classes("w-full q-mt-md upload-zone")

        ui.label(".csv  ·  .xlsx  ·  .xls  supported").style(
            "color: var(--color-text-dim); font-size: 0.8rem; "
            "text-align: center; margin-top: 8px; display: block;"
        )
