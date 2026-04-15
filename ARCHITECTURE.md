# Architecture Reference

Technical reference for AI models and developers extending this codebase.

---

## File Map

### `runbookDashboard.html`

| Section | Content |
|---------|---------|
| CSS | All styles. Uses CSS custom properties for theming. |
| HTML | Header, stats, filters, timeline, task container, action buttons, issues panel, summary box, toast. |
| JS (inline) | Bootstrap: imports ES modules from `dashboard/`, calls `init()`. |

### `dashboard/` — Modular JS Layer (ES Modules)

```
dashboard/
├── app.js          ← Entry point: init(), render(), event wiring
├── state.js        ← Global state (runbookData, filterState, issues, etc.)
├── constants.js    ← Status labels, class mappings, cycle order
├── dom.js          ← DOM element references (cached selectors)
├── selectors.js    ← Derived state queries (getGlobalStats, computeCategoryStatus)
├── persistence.js  ← localStorage save/load, JSON export, file upload
├── validation.js   ← Status normalization, input sanitization
├── actions/
│   ├── health.js   ← Health indicator (Go/At Risk/Stop) toggle + render
│   ├── issues.js   ← Issues CRUD (add, edit, delete, toggle status)
│   └── tasks.js    ← Task status cycling, assignee editing
├── render/
│   ├── categories.js ← Category cards + task rows (targeted DOM patches)
│   ├── issues.js     ← Issues panel rendering
│   ├── stats.js      ← Stat cards + progress bar (value-diffing updates)
│   ├── summary.js    ← Text summary generation
│   └── timeline.js   ← Horizontal phase timeline
└── export/
    ├── canvas.js     ← Shared canvas utilities
    ├── phone.js      ← Phone export (1080×1920 portrait, WhatsApp-optimized)
    ├── email.js      ← Email export (1920×1080 landscape, corporate)
    ├── gantt.js      ← Gantt chart export (1920×dynamic, NOW line)
    ├── shared.js     ← Shared export helpers (blob download, share API)
    └── theme.js      ← Theme toggle (dark/light)
```

### CSS Theming

All colors use CSS custom properties defined in `:root` (dark theme, default) with overrides in `[data-theme="light"]`.

Key variable groups:
- `--bg`, `--surface`, `--text`, `--text-dim` — Base surfaces
- `--stat-*` — Stat card accent colors (done, inprog, notstarted, pct, issues, blocking)
- `--dot-*` — Status dot colors
- `--btn-*-bg`, `--btn-*-border`, `--btn-*-color` — Status button styles
- `--blocked-*`, `--unneeded-*` — Blocking/Unneeded specific colors

When adding a new visual element, always use CSS variables. Never hardcode hex colors in CSS rules.

### JS State (`dashboard/state.js`)

```
runbookData      — Object: category → task array. Reserved keys prefixed with _.
projectConfig    — Object: loaded from config.json. Fields: projectName, subtitle, changeRef, client, environment, release, accentColor.
filterState      — String: "all" | "done" | "inprogress" | "notstarted" | "blocked" | "unneeded"
searchQuery      — String: free-text search filter (matches task, item, taskId, system, comment)
teamFilter       — String: "all" | <assignee value>
systemFilter     — String: "all" | <system value> — dropdown hidden when no tasks have system values
sortMode         — String: "timeline" | "completion" | "alpha"
openCategories   — Set: which category sections are currently expanded
issues           — Array: issue objects with {id, description, category, severity, issueStatus}
healthStatus     — String: "Green" | "Amber" | "Red"
clientLogoImg    — Image | null: loaded from assets/clientLogo-*
clientBgImg      — Image | null: loaded from assets/background-*
```

### JS Module Map

#### Entry & Init (`dashboard/app.js`)
| Function | Purpose |
|----------|---------|
| `init()` | Fetches `config.json`, merges into `projectConfig`, calls `applyConfig()`, wires events |
| `applyConfig()` | Updates page title, h1, subtitle from `projectConfig` |
| `loadRunbook()` | Loads from localStorage (if saved) or fetches `runbook.json` |
| `render()` | Main loop: renders stats, issues, timeline, all categories + tasks |
| `detectAssets()` | Auto-discovers `clientLogo-*` and `background-*` in `assets/` |

Init sequence (in `runbookDashboard.html`):
```
detectAssets() → updateClock() → setInterval(clock) → init()
```

#### Rendering (`dashboard/render/`)
| Module | Function | Purpose |
|--------|----------|---------|
| `stats.js` | `renderGlobalStats()` | 7 stat cards: Total, Completed, In Progress, Not Started, %, Open Issues, Blocking |
| `stats.js` | `updateStatsValues()` | Targeted value-diffing update (skips unchanged DOM nodes) |
| `stats.js` | `renderHealthIndicator()` | Updates health dot + text |
| `timeline.js` | `renderTimeline()` | Horizontal phase timeline at top |
| `timeline.js` | `patchTimelineStep()` | Patches a single timeline dot without full re-render |
| `issues.js` | `renderIssues()` | Issues panel with CRUD operations |
| `categories.js` | `renderCategories()` | All collapsible category cards with task rows |
| `categories.js` | `patchTaskRow()` | In-place DOM patch for a single task row |
| `categories.js` | `patchCategoryCard()` | In-place DOM patch for a single category header/progress |
| `summary.js` | `generateSummary()` | Text summary output |

**Targeted DOM Patching**: Instead of rebuilding the full DOM on every change, the render modules use `patchTaskRow()`, `patchCategoryCard()`, and `patchTimelineStep()` to update only the affected elements. CSS animations are suppressed after initial page load using the `html.loaded` class to prevent visual flicker.

#### State Queries (`dashboard/selectors.js`)
| Function | Purpose |
|----------|---------|
| `normalizeStatus(s)` | Normalizes any status string → one of 5 canonical values |
| `statusClass(s)` | Maps status → CSS class name (done/inprogress/notstarted/blocked/unneeded) |
| `computeCategoryStatus(tasks)` | Derives category-level status from its tasks |
| `getGlobalStats()` | Returns `{total, done, inProg, notStarted, blocking}`. Unneeded counts as done. |
| `matchesSearch(task)` | Tests free-text against task, item, taskId, system, comment |
| `matchesTeam(task)` | Tests against `state.teamFilter` |
| `matchesSystem(task)` | Tests against `state.systemFilter` |
| `getUniqueSystems()` | Returns sorted array of distinct `system` values across all tasks |
| `getUniqueTeams()` | Returns sorted array of distinct `assignee` values |
| `escapeHtml(text)` | XSS-safe HTML encoding; null/undefined → empty string |

#### Task Actions (`dashboard/actions/tasks.js`)
| Function | Purpose |
|----------|---------|
| `setTaskStatus(cat, idx, status)` | Cycles or sets task status, saves state |
| `setAssignee(cat, idx, assignee)` | Updates assignee field |
| `setEndTime(cat, idx, endTime)` | Updates actual end time. Stored as local ISO `YYYY-MM-DDTHH:MM` (no UTC conversion). |
| `setComment(cat, idx, comment)` | Updates operator comment; empty string clears it |
| `toggleCategory(cat)` | Adds/removes from `state.openCategories` |

**Status cycle** (click handler in `dashboard/actions/tasks.js`):
```
Not Started → In Progress → Completed → Blocking → Unneeded → Not Started
```

#### v2 Task Fields

All v2 fields are optional. They are sourced from Excel/CSV columns via `mapping.yml` and normalised in `dashboard/validation.js`.

| Field | Type | Dashboard display | Editable in UI |
|-------|------|-------------------|-----------------|
| `taskId` | string | Yellow `#ID` badge | No |
| `system` | string | Cyan outlined pill tag | No (filter dropdown) |
| `party` | string | Colored filled badge (Client/Murex/Joint) | No |
| `estimatedEnd` | ISO string | Used for Gantt planned-end `P` marker and delta `(+15m)` display | No |
| `endTime` | ISO string | Displayed after `—`; dashed underline = clickable to edit | Yes — datetime-local input |
| `comment` | string | Amber `💬 note` pill; block with left accent border when set | Yes — inline textarea |

Time fields (`startTime`, `endTime`, `estimatedEnd`) use **local ISO** format `YYYY-MM-DDTHH:MM` with no UTC offset. The dashboard stores and displays them as-is — no timezone conversion is applied.
- `Unneeded` tasks count as `Completed` in all stats, progress bars, and exports
- The `Blocking` stat card = blocking tasks + blocking issues (unified count)

#### Canvas Image Exports (`dashboard/export/`)
| Module | Dimensions | Style |
|--------|------------|-------|
| `phone.js` | 1080×1920 portrait | Dark bg, neon colors. For phone/WhatsApp. |
| `email.js` | 1920×1080 landscape | White bg, corporate colors. For email. |
| `gantt.js` | 1920×dynamic | Timeline bars with NOW line. |

All three renderers:
- Use `projectConfig` for titles, subtitle, changeRef, accentColor
- Draw client logo if `clientLogoImg` is loaded
- Use Canvas 2D API directly (no libraries)
- Export as PNG via `canvas.toBlob()`
- Phone export offers `navigator.share()` on mobile, falls back to download

#### Data Persistence (`dashboard/persistence.js`)
| Function | Purpose |
|----------|---------|
| `saveToLocalStorage()` | Saves entire `runbookData` (including `_issues`, `_health`) to localStorage key `runbook_progress` |
| `exportJSON()` | Downloads current state as `.json` file |
| `loadFromFile()` | Reads uploaded `.json` file and restores state |

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
- v2 optional fields validated when present: `taskId`, `system`, `party`, `estimatedEnd`, `comment`
- `party` must be one of `Client`, `Murex`, `Joint` if set
- Time fields must be valid ISO datetime strings if set

### `quality.py` — Quality Checks

`quality_check(data: dict) -> dict`: Returns `{warnings, errors}` lists.

Checks performed:
- Tasks with bare time strings (HH:MM) instead of full ISO — warns to set `runbook_date`
- Tasks where `endTime` < `startTime` (overnight crossing auto-corrected)
- Task text containing raw newlines `\n`
- Tasks where `item` and `task` are identical (redundant)
- Party values not in the allowed set
- `endTime` significantly later than `estimatedEnd` (overrun flag)

### `parsers/excel_parser.py`

`parse(source_path, mapping) -> OrderedDict`

- Requires `openpyxl` (`pip install openpyxl`)
- Raises `PermissionError` with a friendly message if the file is open in Excel
- Same mapping structure as CSV parser
- Supports `sheet` key in mapping to specify which worksheet
- `_resolve_time()` handles `datetime.time` cells and Excel 1900-epoch artifacts
- Maps v2 columns: `taskId`, `system`, `party`, `estimatedEnd` when defined in `mapping.yml`

`parse(source_path, mapping) -> OrderedDict`

- Tries encodings in order: utf-8-sig, utf-8, cp1252, latin-1
- `_clean_text()`: Fixes non-breaking spaces, unicode hyphens, collapses whitespace
- Supports `category_mapping` to normalize messy category names

### Mapping Structure (`mapping.yml`)

```yaml
columns:
  task: "Source Column Name"       # Required
  status: "Source Column Name"     # Required
  startTime: "Source Column Name"  # Optional
  endTime: "Source Column Name"    # Optional
  item: "Source Column Name"       # Optional
  # v2 optional fields
  taskId:  "Task Id"               # Optional: reference ID badge
  system:  "System"                # Optional: system/component filter tag
  party:   "Owner"                 # Optional: Client | Murex | Joint
  estimatedEnd: "Planned End"      # Optional: planned end for Gantt delta
  comment: "Comments"              # Optional: operator notes

category_column: "Phase Column"    # Groups tasks. Omit to put all in one category.
default_category: "Tasks"          # Fallback when category is empty
sheet: "Sheet1"                    # Excel only, optional
runbook_date: "2026-04-15"         # Anchor date for time-only cells (HH:MM → full ISO)

status_mapping:                    # Source value → dashboard status
  "Done": "Completed"
  "WIP": "In Progress"

category_mapping:                  # Fix typos/encoding in category names
  "Bad Name": "Good Name"
```

---

## Extension Guide

### Adding a new task status

1. **CSS** (`runbookDashboard.html`): Add variables in `:root` and `[data-theme="light"]` for the new status color
2. **CSS**: Add styles for `.stat-card.newstatus`, `.tag-newstatus`, `.tl-newstatus`, `.task-status-btn.s-newstatus`, `.task-row.newstatus`, `.dot-newstatus`
3. **`dashboard/validation.js`**: Add mapping in `normalizeStatus()` from raw strings to the canonical name
4. **`dashboard/constants.js`**: Add mapping in `statusClass()` to CSS class
5. **`dashboard/selectors.js`**: Update `computeCategoryStatus()` and `getGlobalStats()` logic
6. **`dashboard/render/stats.js`**: Add/update stat card
7. **`dashboard/render/categories.js`**: Update task row class, icon, and in `patchTaskRow()`
8. **`dashboard/actions/tasks.js`**: Update status cycle order
9. **`dashboard/export/`**: Update all 3 export modules' stats arrays
10. **`dashboard/render/summary.js`**: Update text output
11. **Filter buttons**: Add filter in HTML

### Adding a new canvas export

1. Create a new module in `dashboard/export/` following `phone.js` as template
2. Set canvas dimensions, draw background
3. Use `projectConfig` for all text (never hardcode project strings)
4. Use `projectConfig.accentColor` for brand-colored bars
5. Draw `clientLogoImg` if available
6. Call `getGlobalStats()` for numbers
7. Export via `canvas.toBlob()` → download or share (use helpers from `shared.js`)
8. Wire the button in `dashboard/app.js` event setup

### Adding a new parser

1. Create `adapter/parsers/newformat_parser.py`
2. Implement `parse(source_path: str, mapping: dict | None) -> OrderedDict`
3. Return `OrderedDict` of `category_name → [task_dicts]`
4. Register in `convert.py`: add to `detect_format()` and `convert()` functions
5. Each task dict: `{"item": str|None, "task": str, "status": str, "startTime": str|None, "endTime": str|None}`

### Adding a new config field

1. Add default value in `projectConfig` object (`dashboard/state.js`)
2. Add to `config.json`
3. Use via `projectConfig.fieldName` anywhere in JS modules
4. If it affects the HTML header, update `applyConfig()` in `dashboard/app.js`

---

## Testing

Unit tests live in `tests/` and use **Vitest** with **happy-dom**.

```bash
npm test          # Run all tests once
npm run test:watch  # Watch mode
```

Test files mirror the module structure:
| Test File | Covers |
|-----------|--------|
| `state.test.js` | State management |
| `constants.test.js` | Status mappings, cycle order |
| `selectors.test.js` | `getGlobalStats`, `computeCategoryStatus` |
| `validation.test.js` | `normalizeStatus`, input sanitization |
| `persistence.test.js` | localStorage save/load |
| `actions.test.js` | Task status cycling, issue CRUD |
| `modules.test.js` | Module import/export integrity |

---

## Dev Server

`_serve.js` is a zero-dependency Node.js static file server (port 8090):

```bash
node _serve.js
# → http://localhost:8090/
```

It serves `runbookDashboard.html` as the default route and resolves all assets, JSON, and JS modules with correct MIME types. ES module imports from `dashboard/` require a proper HTTP server — opening the HTML file directly via `file://` will fail.
