"""
gui/theme.py

Injects the dashboard design tokens into the NiceGUI page so the
glass-card components share the same visual language as the Electron dashboard.
"""
from nicegui import ui


_CSS = """
/* ── Google Fonts ───────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

/* ── Design tokens (mirrored from runbookDashboard.html) ── */
:root {
    --color-surface:          #0a0a0f;
    --color-surface-elevated: #111118;
    --color-surface-hover:    #151520;
    --color-surface-row:      #0d0d12;
    --color-surface-bar:      #1a1a22;
    --color-surface-form:     #0d0d12;
    --color-surface-action:   #181820;

    --glass-bg:               rgba(17, 17, 24, 0.55);
    --glass-bg-elevated:      rgba(22, 22, 32, 0.6);
    --glass-blur:             18px;
    --glass-border:           rgba(255, 255, 255, 0.06);
    --glass-shadow:           0 4px 24px rgba(0, 0, 0, 0.3);

    --color-text-primary:     #e0e0e0;
    --color-text-secondary:   #888;
    --color-text-dim:         #555;
    --color-text-emphasis:    #ffffff;

    --color-border:           #222;
    --color-border-strong:    #333;
    --color-border-subtle:    #1a1a1a;

    --color-success:          #10b981;
    --color-success-bg:       #052e16;
    --color-success-text:     #6ee7b7;

    --color-warning:          #f59e0b;
    --color-warning-bg:       #451a03;
    --color-warning-text:     #fcd34d;

    --color-danger:           #ef4444;
    --color-danger-bg:        #450a0a;
    --color-danger-text:      #fca5a5;

    --color-info:             #3b82f6;
    --color-issues:           #f97316;
    --color-neutral:          #aaaaaa;
    --color-neutral-muted:    #888888;
    --color-neutral-dim:      #666666;
    --color-neutral-bg:       #1a1a1a;
    --color-primary:          var(--color-success);
    --color-label:            #8888dd;

    --font-sans: 'Outfit', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', monospace;
}

/* ── Base ───────────────────────────────────────────────── */
html, body {
    background: var(--color-surface) !important;
    color: var(--color-text-primary) !important;
    font-family: var(--font-sans) !important;
    min-height: 100vh;
}

/* ── Glass card ─────────────────────────────────────────── */
.glass-card {
    background:    var(--glass-bg) !important;
    border:        1px solid var(--glass-border) !important;
    border-radius: 12px !important;
    box-shadow:    var(--glass-shadow) !important;
    backdrop-filter: blur(var(--glass-blur)) !important;
    -webkit-backdrop-filter: blur(var(--glass-blur)) !important;
    color:         var(--color-text-primary) !important;
}

.glass-card-elevated {
    background:    var(--glass-bg-elevated) !important;
    border:        1px solid var(--glass-border) !important;
    border-radius: 12px !important;
    box-shadow:    var(--glass-shadow) !important;
    backdrop-filter: blur(var(--glass-blur)) !important;
    -webkit-backdrop-filter: blur(var(--glass-blur)) !important;
}

/* ── Upload drop zone ───────────────────────────────────── */
.upload-zone {
    border: 2px dashed var(--color-border-strong) !important;
    border-radius: 12px !important;
    background: var(--color-surface-form) !important;
    transition: border-color 0.2s;
}
.upload-zone:hover {
    border-color: var(--color-primary) !important;
}

/* ── Step pill ──────────────────────────────────────────── */
.step-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--color-primary);
    color: #000;
    font-weight: 700;
    font-size: 14px;
    flex-shrink: 0;
}

/* ── Badges ─────────────────────────────────────────────── */
.badge-success  { background: var(--color-success-bg)  !important; color: var(--color-success-text)  !important; border-radius: 6px; padding: 2px 8px; font-size: 12px; }
.badge-warning  { background: var(--color-warning-bg)  !important; color: var(--color-warning-text)  !important; border-radius: 6px; padding: 2px 8px; font-size: 12px; }
.badge-danger   { background: var(--color-danger-bg)   !important; color: var(--color-danger-text)   !important; border-radius: 6px; padding: 2px 8px; font-size: 12px; }
.badge-info     { background: rgba(59,130,246,0.15)    !important; color: var(--color-info)           !important; border-radius: 6px; padding: 2px 8px; font-size: 12px; }
.badge-neutral  { background: var(--color-neutral-bg)  !important; color: var(--color-neutral)        !important; border-radius: 6px; padding: 2px 8px; font-size: 12px; }

/* ── Quasar overrides ───────────────────────────────────── */
.q-stepper { background: transparent !important; }
.q-stepper__step-inner { background: transparent !important; }
.q-stepper__header { background: var(--color-surface-bar) !important; border-radius: 12px 12px 0 0; }
.q-panel { background: transparent !important; }
.q-btn.primary-btn {
    background: var(--color-primary) !important;
    color: #000 !important;
    font-weight: 600 !important;
}
.q-field__control { background: var(--color-surface-form) !important; }
.q-field__native, .q-field__input { color: var(--color-text-primary) !important; }
.q-table { background: var(--color-surface-elevated) !important; color: var(--color-text-primary) !important; }
.q-table th { color: var(--color-text-secondary) !important; border-bottom: 1px solid var(--color-border) !important; }
.q-table td { border-bottom: 1px solid var(--color-border-subtle) !important; }
"""


def apply_theme() -> None:
    """Inject design tokens and component styles into the current NiceGUI page."""
    ui.add_css(_CSS)
