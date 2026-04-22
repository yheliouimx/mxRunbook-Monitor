# Client Folder GUI — Revised Plan & MVP Spec

> **Status:** Plan revised (2026-04-22). Original plan was too abstract — no library
> selected, no concrete flow, no packaging strategy, no error states.
> This document supersedes it with a precise, buildable MVP spec.

---

## Critical Gaps in the Original Plan (Challenges)

| Gap | Why It Matters |
|-----|----------------|
| Tech stack "TBD" (Electron / Tauri / web app) | Both require Node.js/Rust — a second full build stack on top of Python. Adds 10× complexity for zero benefit when the backend is pure Python. |
| No library selected | Without a concrete library, design is impossible. |
| Auto-detect listed as an "option" | `autodetect.py` already works. It should be the **default** — non-technical users should never hand-map columns. |
| No packaging strategy | Non-technical users need a double-clickable installer. "Package and distribute" as the last TODO is too late. |
| No wizard state design | A 4-step wizard with back/forward navigation needs explicit state management or it becomes spaghetti. |
| Error recovery undefined | What happens when validation fails at step 3? The plan doesn't say. |
| Tests scheduled last | Conversion and validation logic should be tested as each step is built. |
| No deployment target decision | Local desktop app? Intranet web server? Both have different constraints. |

---

## Library Selection: NiceGUI

### Why NiceGUI

| Criterion | NiceGUI | Flet | Streamlit | PyWebView + HTML | Electron |
|-----------|---------|------|-----------|-----------------|---------|
| Pure Python API | ✅ | ✅ | ✅ | ⚠️ bridge needed | ❌ Node.js |
| Glass/blur CSS effects | ✅ full CSS injection | ❌ Flutter widgets | ❌ limited theming | ✅ full CSS | ✅ full CSS |
| Matches dashboard visual language | ✅ inject same CSS vars | ❌ different look | ❌ data-app feel | ✅ pixel-perfect | ✅ pixel-perfect |
| Wizard / stepper component | ✅ built-in `ui.stepper` | ⚠️ manual | ❌ no native wizard | manual | manual |
| File upload / drag-drop | ✅ `ui.upload` | ✅ | ✅ | manual | manual |
| Preview table | ✅ `ui.table` | ✅ | ✅ | manual | manual |
| Desktop packaging | ✅ PyInstaller | ✅ built-in | ❌ server-only | ✅ PyInstaller | ✅ electron-builder |
| Install size | ~30 MB | ~60 MB | ~150 MB | ~15 MB | ~200 MB |
| Maintenance burden | Low | Low | Medium | Medium | High |

**Decision: NiceGUI.**

NiceGUI renders real HTML/CSS inside a browser (or a native Chromium window via
`native=True` + `pywebview`). This means we can inject the **exact same CSS
design tokens** as the dashboard (`--glass-bg`, `--glass-blur`, `--color-surface`,
etc.) and get a visually identical look with zero extra work. `ui.stepper()`,
`ui.upload()`, and `ui.table()` cover the three core UI patterns we need out
of the box.

### Installation target
- **Development / demo:** `python gui/app.py` → opens at `http://localhost:8080`
- **Non-technical users (MVP):** single-command launcher script (`run_gui.bat` /
  `run_gui.sh`) that calls `pip install -r gui/requirements.txt && python gui/app.py`
- **Packaged release (post-MVP):** PyInstaller one-folder bundle → zip/installer

---

## MVP Scope (What's In, What's Out)

### In (MVP)
- 4-step wizard: Import → Mapping → Preview → Export
- File formats: CSV and Excel (.xlsx)
- Auto-detect columns (wraps `autodetect.py`) — runs automatically on file drop
- Editable column mapping table as override
- Status mapping editor (source value → canonical dashboard status)
- Live validation badge (wraps `schema.validate`)
- Quality report panel (wraps `quality.check`) with error/warning/info counts
- Task preview table (first 50 rows, paginated)
- Export to `runbook.json` with output-path picker
- Dark glass theme matching the dashboard

### Out (post-MVP)
- Template generation (`--generate-template`)
- Multiple mapping profiles / saved presets
- Diff view between old and new runbook.json
- Category renaming / reordering
- Inline task editing
- Light theme
- Auto-update / online distribution

---

## File Layout

```
gui/
├── app.py                # Entry point — NiceGUI app, routes, startup
├── state.py              # AppState dataclass (file path, mapping, parsed data, errors)
├── theme.py              # CSS injection — dashboard design tokens + glass overrides
├── bridge.py             # Thin wrappers around adapter/ (no business logic here)
├── pages/
│   ├── step1_import.py   # Step 1: file picker + drag-drop
│   ├── step2_mapping.py  # Step 2: column mapping review / override
│   ├── step3_preview.py  # Step 3: task table preview + quality report
│   └── step4_export.py   # Step 4: output path + save + success
├── components/
│   ├── glass_card.py     # Reusable glass panel (backdrop-filter: blur)
│   ├── status_badge.py   # Colored status pill (Done/WIP/Blocked...)
│   └── step_header.py    # Step number + title + subtitle
└── requirements.txt      # nicegui, openpyxl, pyyaml
```

---

## Wizard Flow (Step-by-Step Spec)

### Step 1 — Import File

**Goal:** User picks or drops a CSV / Excel file.

**UI elements:**
- Glass card with dashed border: "Drop your runbook file here"
- `ui.upload()` with accepted types `.csv,.xlsx,.xls`
- On upload: show filename, detected format badge (CSV / Excel), estimated row count
- "Next →" button enabled only after a file is loaded
- Error toast if file is corrupted or has no headers

**Backend call:** `bridge.detect_format(path)`, read first row for header count.

**State written:** `state.source_path`, `state.detected_format`, `state.raw_headers`

---

### Step 2 — Review Column Mapping

**Goal:** Show auto-detected mapping; let user correct any misses.

**Backend call on enter:** `bridge.autodetect(state.raw_headers)` → populates mapping
  table immediately.

**UI elements:**
- Glass card with heading "Column Mapping"
- Two-column table: **Runbook Field** | **Your Column** (editable dropdown)
  - Required fields highlighted: `task`, `status`
  - Optional fields shown greyed if not detected
- Separate "Category column" selector (dropdown of all headers + "— none —")
- Collapsible "Status value mapping" panel — editable key/value grid
  (source values from file → canonical: Done / In Progress / Not Started /
  Blocking / Unneeded)
- "Auto-detect again" icon button (re-runs autodetect if user wants a reset)
- "← Back" and "Next →" buttons
- Inline warning badge if `task` or `status` is unmapped ("Required")

**State written:** `state.mapping` (complete mapping dict, same shape as `mapping.yml`)

---

### Step 3 — Preview & Validate

**Goal:** Show the parsed runbook and flag any issues before saving.

**Backend calls on enter:**
1. `bridge.convert(state.source_path, state.detected_format, state.mapping)`
   → `state.parsed_data`
2. `schema.validate(state.parsed_data)` → `state.schema_errors`
3. `quality.check(state.parsed_data)` → `state.quality_report`

**UI elements:**
- Summary bar: `{N} categories · {M} tasks · {K} errors · {J} warnings`
  with colored badges matching dashboard status colors
- Quality report panel (collapsible):
  - Red section: schema errors (blocking — must fix)
  - Amber section: warnings (non-blocking)
  - Green section: info/statistics
- `ui.table()` with columns: Category | # | Task | Status | Start | End | Assignee
  - Row color-coded by status (matching dashboard dot colors)
  - Paginated: 25 rows per page
- If schema errors exist: "Next →" is disabled; red banner "Fix mapping issues to continue"
- "← Back" always enabled (goes back to Step 2 with mapping preserved)

**State written:** `state.parsed_data`, `state.schema_errors`, `state.quality_report`

---

### Step 4 — Export

**Goal:** Save `runbook.json` to disk.

**UI elements:**
- Glass card: "Output file"
- Path input pre-filled with `{source_dir}/runbook.json`, editable
- "Browse" button to pick directory
- "Save runbook.json" primary button
- On success: green checkmark animation + "File saved to {abs_path}"
- "Open folder" link (opens OS file manager to the output directory)
- "Start over" secondary button (resets state → Step 1)
- "View quality report" expander (same report from Step 3)

**Backend call:** `bridge.write_runbook(state.parsed_data, output_path)` — calls
  `merge_preserved_keys` if a `runbook.json` already exists at that path.

---

## State Management

Use a single `AppState` dataclass (NiceGUI's `app.storage.user` or a plain
module-level singleton — module singleton is simpler for a single-user desktop tool).

```python
@dataclass
class AppState:
    # Step 1
    source_path: str | None = None
    detected_format: str | None = None      # "csv" | "excel"
    raw_headers: list[str] = field(default_factory=list)

    # Step 2
    mapping: dict | None = None             # same shape as mapping.yml

    # Step 3
    parsed_data: dict | None = None
    schema_errors: list[str] = field(default_factory=list)
    quality_report: dict | None = None      # {errors, warnings, info}

    # Navigation
    current_step: int = 1                   # 1–4
```

State is reset only when the user explicitly clicks "Start over."

---

## CSS / Theme

Inject the dashboard's design tokens via `ui.add_head_html()` + `theme.py`.
Key overrides for glass panels:

```css
/* Injected once at startup in theme.py */
:root {
  --color-surface:         #0a0a0f;
  --color-surface-elevated:#111118;
  --glass-bg:              rgba(17, 17, 24, 0.55);
  --glass-bg-elevated:     rgba(22, 22, 32, 0.60);
  --glass-blur:            18px;
  --glass-border:          rgba(255, 255, 255, 0.06);
  --glass-shadow:          0 4px 24px rgba(0,0,0,0.3);
  --color-text-primary:    #e0e0e0;
  --color-text-secondary:  #888;
  --color-success:         #10b981;
  --color-warning:         #f59e0b;
  --color-danger:          #ef4444;
  --color-info:            #3b82f6;
  /* Fonts match dashboard */
  --font-body:   'Outfit', sans-serif;
  --font-mono:   'JetBrains Mono', monospace;
}

.glass-card {
  background:      var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border:          1px solid var(--glass-border);
  box-shadow:      var(--glass-shadow);
  border-radius:   12px;
}
```

NiceGUI's `ui.card()` gets a `.glass-card` class applied via `classes('glass-card')`.

---

## Bridge Layer (`bridge.py`)

Thin wrappers only — no business logic. All logic lives in `adapter/`.

```python
# bridge.py (pseudocode)
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'adapter'))

from autodetect import autodetect_mapping
from convert import convert, load_mapping, detect_format, merge_preserved_keys
from schema import validate
from quality import check as quality_check, format_report

def autodetect(headers: list[str]) -> dict:
    return autodetect_mapping(headers)

def run_convert(source_path: str, fmt: str, mapping: dict) -> dict:
    return convert(source_path, fmt, mapping)

def run_validate(data: dict) -> list[str]:
    return validate(data)

def run_quality(data: dict) -> dict:
    return quality_check(data)

def write_runbook(data: dict, output_path: str) -> None:
    import json
    data = merge_preserved_keys(output_path, data)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
```

---

## Non-Technical User Distribution (MVP)

Provide two launcher scripts at the repo root:

**`run_gui.bat`** (Windows):
```bat
@echo off
pip install -r gui/requirements.txt --quiet
python gui/app.py
```

**`run_gui.sh`** (Mac/Linux):
```bash
#!/usr/bin/env bash
pip install -r gui/requirements.txt --quiet
python3 gui/app.py
```

App opens automatically in the default browser at `http://localhost:8080`.

Post-MVP: PyInstaller bundle → `dist/RunbookConverter.exe` / `.app`.

---

## TODO (Ordered, Concrete)

### Foundation
- [ ] Create `gui/` folder structure (app.py, state.py, theme.py, bridge.py, pages/, components/)
- [ ] Add `gui/requirements.txt`: `nicegui>=1.4`, `openpyxl>=3.1`, `pyyaml>=6`
- [ ] Implement `theme.py` — inject CSS tokens + `.glass-card` class
- [ ] Implement `bridge.py` — thin wrappers around adapter/
- [ ] Implement `state.py` — AppState dataclass + module singleton
- [ ] Wire up `app.py` with NiceGUI routes and step navigation logic

### Step 1 — Import
- [ ] Build `pages/step1_import.py` — file upload card
- [ ] Auto-detect format from extension; show detected format badge
- [ ] Read and store raw headers; show header count
- [ ] Error handling: corrupted file, no headers, unsupported extension

### Step 2 — Mapping
- [ ] Build `pages/step2_mapping.py` — mapping review table
- [ ] Call `bridge.autodetect()` on page enter; populate dropdowns
- [ ] Implement "Required field" warning badges for task + status
- [ ] Implement status-value mapping editor (collapsible)
- [ ] Implement "Auto-detect again" reset button

### Step 3 — Preview
- [ ] Build `pages/step3_preview.py` — preview table + quality report
- [ ] Call `bridge.run_convert()`, `bridge.run_validate()`, `bridge.run_quality()` on enter
- [ ] Build quality report panel (error/warning/info sections)
- [ ] Implement pagination for task table (25 rows/page)
- [ ] Disable "Next" when schema errors exist; show blocking banner

### Step 4 — Export
- [ ] Build `pages/step4_export.py` — output path + save button
- [ ] Pre-fill output path with source dir + `/runbook.json`
- [ ] Implement `bridge.write_runbook()` with merge logic
- [ ] Success animation + file path display + "Open folder" link
- [ ] "Start over" resets AppState → Step 1

### Launcher & Distribution
- [ ] Write `run_gui.bat` and `run_gui.sh` launcher scripts
- [ ] Test full flow end-to-end with a real CSV and Excel file
- [ ] Write README section: "Running the GUI"

### Validation (parallel with implementation)
- [ ] Unit tests for `bridge.py` wrappers (sanity checks)
- [ ] Integration test: CSV → Step 1–4 full flow produces valid runbook.json
- [ ] Integration test: Excel → same
- [ ] Test: corrupted file shows error on Step 1 (not crash)
- [ ] Test: unmapped required field blocks Step 3 "Next"

### Usability (first iteration)
- [ ] Walk through with one non-technical user; record blockers
- [ ] Iterate on mapping step UX (most likely pain point)

---

## Notes

- `adapter/` code is **not touched** — GUI wraps it, never modifies it.
- `mapping.yml` pattern is preserved; the mapping editor produces the same dict structure.
- NiceGUI `native=True` mode (requires `pip install pywebview`) gives a native window
  without a visible browser — use this for the PyInstaller build.
- Google Fonts (Outfit + JetBrains Mono) require an internet connection; bundle
  the fonts as static files for the offline PyInstaller build.
- Keep `app.py` thin: all page logic lives in `pages/`, all adapter calls in `bridge.py`.
