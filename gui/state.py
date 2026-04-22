"""
gui/state.py

Module-level AppState singleton shared across all pages.
Reset only on "Start over" click.
"""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class AppState:
    # ── Step 1: Import ────────────────────────────────────
    source_path: str | None = None
    detected_format: str | None = None      # 'csv' | 'excel'
    raw_headers: list[str] = field(default_factory=list)
    temp_path: str | None = None            # server-side temp file for upload bytes
    row_count: int = 0
    file_name: str | None = None
    upload_error: str | None = None

    # ── Step 2: Mapping ───────────────────────────────────
    mapping: dict = field(default_factory=dict)

    # ── Step 3: Preview ───────────────────────────────────
    parsed_data: dict = field(default_factory=dict)
    schema_errors: list[str] = field(default_factory=list)
    quality_report: dict = field(default_factory=dict)

    # ── Step 4: Export ────────────────────────────────────
    output_path: str | None = None
    save_success: bool = False
    saved_path: str | None = None

    # ── Navigation / UI ───────────────────────────────────
    current_step: int = 1
    processing: bool = False

    def reset(self) -> None:
        """Reset all fields to defaults. Called by 'Start over'."""
        import tempfile, os
        if self.temp_path and os.path.exists(self.temp_path):
            try:
                os.remove(self.temp_path)
            except OSError:
                pass

        self.__init__()  # type: ignore[misc]


# Module-level singleton imported by all pages and components
state = AppState()
