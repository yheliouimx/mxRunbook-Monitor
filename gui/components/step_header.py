"""gui/components/step_header.py — Numbered step title block."""
from nicegui import ui


def step_header(n: int, title: str, subtitle: str = "") -> None:
    """Render a step number pill, title, and optional subtitle."""
    with ui.row().classes("items-center q-mb-md").style("gap: 12px;"):
        ui.label(str(n)).classes("step-pill")
        with ui.column().style("gap: 2px;"):
            ui.label(title).style(
                "font-size: 1.1rem; font-weight: 600; "
                "color: var(--color-text-emphasis); line-height: 1.2;"
            )
            if subtitle:
                ui.label(subtitle).style(
                    "font-size: 0.85rem; color: var(--color-text-secondary);"
                )
