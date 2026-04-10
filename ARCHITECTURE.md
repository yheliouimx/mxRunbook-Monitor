# Architecture Reference

Technical reference for AI models and developers extending this codebase.

---

## File Map

### `runbookDashboard.html` (~2530 lines, single self-contained file)

| Section | Lines | Content |
|---------|-------|---------|
| CSS | 8–919 | All styles. Uses CSS custom properties for theming. |
| HTML | 919–1003 | Header, stats, filters, timeline, task container, action buttons, issues panel, summary box, toast. |
| JS | 1003–2532 | All logic, state management, canvas renderers, asset detection. |

### CSS Theming

All colors use CSS custom properties defined in `:root` (dark theme, default) with overrides in `[data-theme="light"]`.

Key variable groups:
- `--bg`, `--surface`, `--text`, `--text-dim` — Base surfaces
- `--stat-*` — Stat card accent colors (done, inprog, notstarted, pct, issues, blocking)
- `--dot-*` — Status dot colors
- `--btn-*-bg`, `--btn-*-border`, `--btn-*-color` — Status button styles
- `--blocked-*`, `--unneeded-*` — Blocking/Unneeded specific colors

When adding a new visual element, always use CSS variables. Never hardcode hex colors in CSS rules.

### JS Global State

```
runbookData      — Object: category → task array. Reserved keys prefixed with _.
projectConfig    — Object: loaded from config.json. Fields: projectName, subtitle, changeRef, client, environment, release, accentColor.
filterState      — String: "all" | "done" | "inprogress" | "notstarted" | "blocked" | "unneeded"
searchQuery      — String: free-text search filter
sortMode         — String: "timeline" | "completion" | "alpha"
openCategories   — Set: which category sections are currently expanded
issues           — Array: issue objects with {id, description, category, severity, issueStatus}
healthStatus     — String: "Green" | "Amber" | "Red"
clientLogoImg    — Image | null: loaded from assets/clientLogo-*
clientBgImg      — Image | null: loaded from assets/background-*
```

### JS Function Map

#### Startup
| Function | Line | Purpose |
|----------|------|---------|
| `loadConfig()` | 1023 | Fetches `config.json`, merges into `projectConfig`, calls `applyConfig()` |
| `applyConfig()` | 1032 | Updates page title, h1, subtitle from `projectConfig` |
| `loadRunbook()` | 1145 | Loads from localStorage (if saved) or fetches `runbook.json` |
| `detectAssets()` | 2467 | Auto-discovers `clientLogo-*` and `background-*` in `assets/` |
| `setFavicon()` | 2462 | Sets browser tab icon from logo |

Init sequence (bottom of script):
```
detectAssets() → updateClock() → setInterval(clock) → loadConfig().then(loadRunbook)
```

#### Core Rendering
| Function | Line | Purpose |
|----------|------|---------|
| `render()` | 1237 | Main loop: renders stats, issues, timeline, all categories + tasks |
| `renderGlobalStats()` | 1188 | 7 stat cards: Total, Completed, In Progress, Not Started, %, Open Issues, Blocking |
| `renderTimeline()` | 1347 | Horizontal phase timeline at top |
| `renderIssues()` | 1387 | Issues panel with CRUD operations |
| `renderHealthIndicator()` | 1060 | Updates health dot + text |

#### Status Logic
| Function | Line | Purpose |
|----------|------|---------|
| `normalizeStatus(s)` | 1086 | Normalizes any status string → one of 5 canonical values |
| `statusClass(s)` | 1096 | Maps status → CSS class name (done/inprogress/notstarted/blocked/unneeded) |
| `computeCategoryStatus(tasks)` | 1129 | Derives category-level status from its tasks |
| `getGlobalStats()` | 1171 | Returns `{total, done, inProg, notStarted, blocking}`. Unneeded counts as done. |

**Status cycle** (click handler in `render()`):
```
Not Started → In Progress → Completed → Blocking → Unneeded → Not Started
```

**Stat merging**:
- `Unneeded` tasks count as `Completed` in all stats, progress bars, and exports
- The `Blocking` stat card = blocking tasks + blocking issues (unified count)

#### Canvas Image Exports
| Function | Line | Dimensions | Style |
|----------|------|------------|-------|
| `exportSnapshot()` | 1596 | 1080×1920 portrait | Dark bg, neon colors. For phone/WhatsApp. |
| `exportEmailSnapshot()` | 1892 | 1920×1080 landscape | White bg, corporate colors. For email. |
| `exportGantt()` | 2134 | 1920×dynamic | Timeline bars with NOW line. |

All three renderers:
- Use `projectConfig` for titles, subtitle, changeRef, accentColor
- Draw client logo if `clientLogoImg` is loaded
- Use Canvas 2D API directly (no libraries)
- Export as PNG via `canvas.toBlob()`
- Phone export offers `navigator.share()` on mobile, falls back to download

#### Data Persistence
| Function | Line | Purpose |
|----------|------|---------|
| `saveToLocalStorage()` | 1375 | Saves entire `runbookData` (including `_issues`, `_health`) to localStorage key `runbook_progress` |
| `exportJSON()` | 2408 | Downloads current state as `.json` file |

localStorage is auto-saved on every status change, issue change, and health change.

---

## Adapter Layer (`adapter/`)

### `convert.py` — CLI Entry Point

```bash
python adapter/convert.py --source FILE --mapping MAPPING --output runbook.json
python adapter/convert.py --validate runbook.json
```

Arguments:
- `--source` / `-s`: Input file path
- `--format` / `-f`: Force format (`csv`, `excel`, `json`). Auto-detected from extension if omitted.
- `--mapping` / `-m`: Path to column mapping file (YAML or JSON)
- `--output` / `-o`: Output path (default: `runbook.json`)
- `--validate` / `-v`: Validate an existing JSON file and exit
- `--no-merge`: Don't preserve `_issues`/`_health` from existing output file

Key behaviors:
- Preserves `_issues` and `_health` from existing `runbook.json` by default (safe to re-run during live events)
- Validates output against schema before writing
- Auto-detects format from file extension

### `schema.py` — Validation

`validate(data: dict) -> list[str]`: Returns list of error strings. Empty = valid.

Rules:
- Root must be a dict
- Keys starting with `_` are reserved (any value allowed)
- All other keys must be arrays of task objects
- Each task must have `task` (string) and `status` (string)
- `item`, `startTime`, `endTime` are optional

### `parsers/generic_csv.py`

`parse(source_path, mapping) -> OrderedDict`

- Tries encodings in order: utf-8-sig, utf-8, cp1252, latin-1
- `_clean_text()`: Fixes non-breaking spaces, unicode hyphens, collapses whitespace
- Supports `category_mapping` to normalize messy category names

### `parsers/excel_parser.py`

`parse(source_path, mapping) -> OrderedDict`

- Requires `openpyxl` (`pip install openpyxl`)
- Same mapping structure as CSV parser
- Supports `sheet` key in mapping to specify which worksheet

### Mapping Structure (`mapping.yml`)

```yaml
columns:
  task: "Source Column Name"       # Required
  status: "Source Column Name"     # Required
  startTime: "Source Column Name"  # Optional
  endTime: "Source Column Name"    # Optional
  item: "Source Column Name"       # Optional

category_column: "Phase Column"    # Groups tasks. Omit to put all in one category.
default_category: "Tasks"          # Fallback when category is empty
sheet: "Sheet1"                    # Excel only, optional

status_mapping:                    # Source value → dashboard status
  "Done": "Completed"
  "WIP": "In Progress"

category_mapping:                  # Fix typos/encoding in category names
  "Bad Name": "Good Name"
```

---

## Extension Guide

### Adding a new task status

1. **CSS**: Add variables in `:root` and `[data-theme="light"]` for the new status color
2. **CSS**: Add styles for `.stat-card.newstatus`, `.tag-newstatus`, `.tl-newstatus`, `.task-status-btn.s-newstatus`, `.task-row.newstatus`, `.dot-newstatus`
3. **JS `normalizeStatus()`**: Add mapping from raw strings to the canonical name
4. **JS `statusClass()`**: Add mapping to CSS class
5. **JS `computeCategoryStatus()`**: Update logic
6. **JS `getGlobalStats()`**: Decide how it counts (as done? as incomplete? separate?)
7. **JS `renderGlobalStats()`**: Add/update stat card
8. **JS `render()`**: Update task row class, icon, and status cycle
9. **Canvas exports**: Update all 3 export functions' stats arrays
10. **JS `generateSummary()`**: Update text output
11. **Filter buttons**: Add filter in HTML

### Adding a new canvas export

1. Create a new function following `exportSnapshot()` as template
2. Set canvas dimensions, draw background
3. Use `projectConfig` for all text (never hardcode project strings)
4. Use `projectConfig.accentColor` for brand-colored bars
5. Draw `clientLogoImg` if available
6. Call `getGlobalStats()` for numbers
7. Export via `canvas.toBlob()` → download or share
8. Add a button in the HTML actions bar

### Adding a new parser

1. Create `adapter/parsers/newformat_parser.py`
2. Implement `parse(source_path: str, mapping: dict | None) -> OrderedDict`
3. Return `OrderedDict` of `category_name → [task_dicts]`
4. Register in `convert.py`: add to `detect_format()` and `convert()` functions
5. Each task dict: `{"item": str|None, "task": str, "status": str, "startTime": str|None, "endTime": str|None}`

### Adding a new config field

1. Add default value in `projectConfig` object (JS global)
2. Add to `config.json`
3. Use via `projectConfig.fieldName` anywhere in JS
4. If it affects the HTML header, update `applyConfig()`
