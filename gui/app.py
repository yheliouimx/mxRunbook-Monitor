"""
gui/app.py

NiceGUI entry point for the Runbook Converter wizard.
Run with:  python gui/app.py   (from any directory)
"""
import multiprocessing
import sys
from pathlib import Path

# Required for PyInstaller + NiceGUI on Windows (must be called before any
# multiprocessing code runs).
multiprocessing.freeze_support()

# When run as a script, Python adds gui/ to sys.path instead of the repo root,
# so `from gui.xxx` would fail.  This ensures the repo root is always present.
_REPO_ROOT = str(Path(__file__).parent.parent)
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from nicegui import ui

from gui.theme import apply_theme
from gui.state import state
from gui.pages import step1_import as _step1
from gui.pages import step2_mapping as _step2
from gui.pages import step3_preview as _step3
from gui.pages import step4_export as _step4


# ── Page builder ──────────────────────────────────────────

@ui.page("/")
def index() -> None:
    apply_theme()

    with ui.column().classes("items-center").style(
        "min-height: 100vh; padding: 32px 16px; "
        "background: var(--color-surface); width: 100%;"
    ):
        # ── Header ────────────────────────────────────────
        with ui.column().classes("items-center q-mb-lg").style("gap: 4px;"):
            ui.label("Runbook Converter").style(
                "font-size: 1.8rem; font-weight: 700; "
                "color: var(--color-text-emphasis); letter-spacing: -0.5px;"
            )
            ui.label("Import · Map · Preview · Export").style(
                "font-size: 0.9rem; color: var(--color-text-secondary);"
            )

        # ── Stepper ───────────────────────────────────────
        with ui.card().classes("glass-card w-full").style("max-width: 900px; padding: 0;"):
            with ui.stepper().props("vertical flat animated").style(
                "width: 100%; background: transparent;"
            ) as stepper:

                # ── Step 1 ────────────────────────────────
                with ui.step("Import File"):
                    _step1.render(stepper)
                    with ui.stepper_navigation():
                        def _to_mapping():
                            if hasattr(_step2, "on_enter"):
                                _step2.on_enter()
                            stepper.next()

                        ui.button(
                            "Next", icon="arrow_forward",
                            on_click=_to_mapping,
                        ).props("unelevated").classes("primary-btn").bind_enabled_from(
                            state, "source_path",
                            backward=lambda v: v is not None,
                        )

                # ── Step 2 ────────────────────────────────
                with ui.step("Column Mapping"):
                    _step2.render(stepper)
                    with ui.stepper_navigation():
                        ui.button("Back", icon="arrow_back", on_click=stepper.previous).props("flat")

                        def _to_preview():
                            if hasattr(_step3, "on_enter"):
                                _step3.on_enter()
                            stepper.next()

                        ui.button(
                            "Next", icon="arrow_forward",
                            on_click=_to_preview,
                        ).props("unelevated").classes("primary-btn").bind_enabled_from(
                            state, "mapping",
                            backward=lambda v: (
                                bool(v)
                                and v.get("columns", {}).get("task") is not None
                                and v.get("columns", {}).get("status") is not None
                            ),
                        )

                # ── Step 3 ────────────────────────────────
                with ui.step("Preview & Validate"):
                    _step3.render(stepper)
                    with ui.stepper_navigation():
                        ui.button("Back", icon="arrow_back", on_click=stepper.previous).props("flat")
                        ui.button(
                            "Next", icon="arrow_forward",
                            on_click=stepper.next,
                        ).props("unelevated").classes("primary-btn").bind_enabled_from(
                            state, "schema_errors",
                            backward=lambda v: not v,
                        )

                # ── Step 4 ────────────────────────────────
                with ui.step("Export"):
                    _step4.render(stepper)
                    with ui.stepper_navigation():
                        ui.button("Back", icon="arrow_back", on_click=stepper.previous).props("flat")


# ── Entry point ───────────────────────────────────────────

if __name__ in ("__main__", "__mp_main__"):
    ui.run(
        title="Runbook Converter",
        native=True,
        window_size=(1280, 900),
        reload=False,
        dark=True,
        favicon="🗂️",
    )
