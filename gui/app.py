"""
gui/app.py

NiceGUI entry point for the Runbook Converter wizard.
Run with:  python gui/app.py   (from any directory)
Opens at:  http://localhost:8080
"""
import sys
from pathlib import Path

# When run as a script, Python adds gui/ to sys.path instead of the repo root,
# so `from gui.xxx` would fail.  This ensures the repo root is always present.
_REPO_ROOT = str(Path(__file__).parent.parent)
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from nicegui import ui

from gui.theme import apply_theme
from gui.state import state

# ── Step page imports (added phase by phase) ──────────────
# Each module exposes a render(stepper) function that fills
# the step's content area.  Import lazily so missing modules
# don't break the shell during early phases.

def _try_import(module_name: str):
    try:
        import importlib
        return importlib.import_module(module_name)
    except ImportError:
        return None


_step1 = _try_import("gui.pages.step1_import")
_step2 = _try_import("gui.pages.step2_mapping")
_step3 = _try_import("gui.pages.step3_preview")
_step4 = _try_import("gui.pages.step4_export")


# ── Placeholder shown when a page module is not yet built ─

def _placeholder(n: int, label: str) -> None:
    with ui.column().classes("items-center q-pa-xl").style("gap: 16px; width: 100%;"):
        ui.label(f"Step {n} — {label}").style(
            "font-size: 1.4rem; font-weight: 600; color: var(--color-text-primary);"
        )
        ui.label("Coming in a future phase.").style(
            "color: var(--color-text-secondary); font-size: 0.95rem;"
        )


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
                    if _step1:
                        _step1.render(stepper)
                    else:
                        _placeholder(1, "Import File")
                    with ui.stepper_navigation():
                        ui.button(
                            "Next", icon="arrow_forward",
                            on_click=stepper.next,
                        ).props("unelevated").classes("primary-btn").bind_enabled_from(
                            state, "source_path",
                            backward=lambda v: v is not None,
                        )

                # ── Step 2 ────────────────────────────────
                with ui.step("Column Mapping"):
                    if _step2:
                        _step2.render(stepper)
                    else:
                        _placeholder(2, "Column Mapping")
                    with ui.stepper_navigation():
                        ui.button("Back", icon="arrow_back", on_click=stepper.previous).props("flat")
                        ui.button(
                            "Next", icon="arrow_forward",
                            on_click=stepper.next,
                        ).props("unelevated").classes("primary-btn").bind_enabled_from(
                            state, "mapping",
                            backward=lambda v: bool(v),
                        )

                # ── Step 3 ────────────────────────────────
                with ui.step("Preview & Validate"):
                    if _step3:
                        _step3.render(stepper)
                    else:
                        _placeholder(3, "Preview & Validate")
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
                    if _step4:
                        _step4.render(stepper)
                    else:
                        _placeholder(4, "Export")
                    with ui.stepper_navigation():
                        ui.button("Back", icon="arrow_back", on_click=stepper.previous).props("flat")


# ── Entry point ───────────────────────────────────────────

if __name__ in ("__main__", "__mp_main__"):
    ui.run(
        port=8080,
        title="Runbook Converter",
        reload=False,
        dark=True,
        favicon="🗂️",
    )
