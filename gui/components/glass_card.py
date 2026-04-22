"""gui/components/glass_card.py — Glass-morphism card wrapper."""
from contextlib import contextmanager
from nicegui import ui


@contextmanager
def glass_card(title: str | None = None, elevated: bool = False):
    """Context manager that yields a glass-styled ui.card."""
    css_class = "glass-card-elevated" if elevated else "glass-card"
    with ui.card().classes(f"{css_class} w-full q-pa-md"):
        if title:
            ui.label(title).style(
                "font-size: 1rem; font-weight: 600; "
                "color: var(--color-text-primary); margin-bottom: 8px;"
            )
        yield
