# Architecture Reference

Technical reference for AI models and developers extending this codebase.

---

## File Map

### `welcome.html` (Electron app only)

The landing page opened on startup in the Electron app. Shows recent client runbooks as a responsive card grid and provides a folder-picker button to open a new client folder.

| Section | Content |
|---------|--------|
| CSS | Full glassmorphism design with dark/light theme, CSS custom properties mirroring `runbookDashboard.html` tokens |
| HTML | Brand strip, "Open Client Runbook" CTA, recent-runbooks grid, legal footer, toast, loading overlay |
| JS (inline) | `applyDashboardConfig()`, `toggleTheme()`, recent-card rendering, folder picker via `window.electronAPI` |

Theme preference is stored in `dashboard-config.json` via `electronAPI.saveDashboardConfig()` so it persists across welcome ↔ dashboard navigation.

Displays a "This app requires the Electron shell" overlay when opened in a plain browser.

### `preload.js`

Electron contextBridge — runs in Node context before each renderer page, exposes `window.electronAPI` to the renderer without granting Node access.

| API method | IPC channel | Purpose |
|-----------|-------------|--------|
| `openFolder()` | `dialog:openFolder` | Native OS folder picker; resolves to path or null |
| `readConfig(folderPath)` | `folder:readConfig` | Reads + parses `config.json` / `*_config.json` from folder |
| `readFileAsDataUrl(folderPath, filename)` | `folder:readFileAsDataUrl` | Reads image → base64 data URL; auto-resizes via `sharp` if > 250 KB |
| `getRecentClients()` | `store:getRecent` | Returns recent-client list from `~/.mxrunbook/recent-clients.json` |
| `addRecentClient(entry)` | `store:addRecent` | Upserts a recent entry (max 10, trimmed to 350 KB logo cap) |
| `removeRecentClient(folderPath)` | `store:removeRecent` | Removes entry by path |
| `openDashboard(folderPath)` | `nav:openDashboard` | Sets active client dir; navigates to `runbookDashboard.html?clientKey=<slug>` |
| `openWelcome()` | `nav:openWelcome` | Navigates back to `welcome.html` |
| `getDashboardConfig()` | `config:getDashboard` | Returns `dashboard-config.json` object |
| `saveDashboardConfig(updates)` | `config:saveDashboard` | Persists `theme` / `backgroundImage` to `dashboard-config.json` |
| `writeRunbookToExcel(runbookData)` | `runbook:writeToExcel` | Excel save-back (see below) |

### `dashboard-config.json`

Global Electron app settings — independent of any client folder.

```json
{
  "theme": "dark",
  "backgroundImage": "Murex_background6.jpg"
}
```

This file is read/written by `electron-main.js` handlers and exposed via `electronAPI.getDashboardConfig()` / `saveDashboardConfig()`. It keeps the theme choice consistent across the welcome page and the dashboard without polluting per-client `config.json` files.

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
├── constants.js    ← Status labels, class mappings, cycle order, PARTY_OPTIONS
├── dom.js          ← DOM element references (cached selectors)
├── selectors.js    ← Derived state queries (getGlobalStats, computeCategoryStatus)
├── persistence.js  ← localStorage save/load, JSON export, file upload
├── validation.js   ← Status normalization, input sanitization
├── history.js      ← Snapshot history (burndown + health timeline for Final Report)
├── actions/
│   ├── health.js   ← Health indicator (Go/At Risk/Stop) toggle + render
│   ├── issues.js   ← Issues CRUD (add, edit, delete, toggle status)
│   ├── tasks.js    ← Task status cycling, assignee editing
│   └── timer.js    ← Run timer: start/pause/stop, elapsed ms, state saved to localStorage
├── render/
│   ├── categories.js ← Category cards + task rows (targeted DOM patches)
│   ├── issues.js     ← Issues panel rendering
│   ├── stats.js      ← Stat cards + progress bar (value-diffing updates)
│   ├── summary.js    ← Text summary generation
│   └── timeline.js   ← Horizontal phase stepper timeline
└── export/
    ├── canvas.js     ← Shared canvas utilities
    ├── phone.js      ← Phone export (1080×1920 portrait, WhatsApp-optimized)
    ├── email.js      ← Email export (1920×1080 landscape, corporate)
    ├── gantt.js      ← Gantt chart export (1920×dynamic, NOW line)
    ├── finalReport.js ← Post-event summary report (self-contained HTML)
    ├── finalReport/  ← Sub-modules assembled by finalReport.js
    │   ├── helpers.js    ← HTML escape, date formatting, per-assignee stats
    │   ├── htmlReport.js ← Full HTML assembly from SVG/data sections
    │   ├── svgBurndown.js ← Completion burndown SVG chart
    │   ├── svgGantt.js   ← Task timeline SVG (planned vs actual)
    │   └── svgHealth.js  ← Health status timeline SVG
    ├── shared.js     ← Shared export helpers (blob download, share API)
    └── theme.js      ← Theme toggle (dark/light)
```

### CSS Theming

All colors use CSS custom properties defined across four cascade layers:
1. `:root` — dark corporate theme (default)
2. `[data-palette="neon"]` — override with neon accent palette
3. `[data-theme="light"]` — override with light corporate theme
4. `[data-theme="light"][data-palette="neon"]` — light + neon combination

The palette toggle (Corporate ↔ Neon) is exposed in the header and persisted to localStorage under `runbook_palette`.

Key semantic variable groups (80+ custom properties):
- `--color-primary` — driven by `config.json` `accentColor`; applied via `applyConfig()`
- `--color-success`, `--color-warning`, `--color-danger` — semantic status tokens
- `--color-surface`, `--color-surface-elevated`, `--color-border` — layout surfaces
- `--color-text-primary`, `--color-text-secondary` — text hierarchy
- `--bg`, `--surface`, `--text`, `--text-dim` — lower-level aliases (legacy names still present)
- `--stat-*` — Stat card accent colors (done, inprog, notstarted, pct, issues, blocking)
- `--dot-*` — Status dot colors
- `--btn-*-bg`, `--btn-*-border`, `--btn-*-color` — Status button styles
- `--blocked-*`, `--unneeded-*` — Blocking/Unneeded specific colors
- `--text-xs` through `--text-3xl` — type scale; body font is Outfit, monospace is JetBrains Mono
- `--sentinel-color` — set inline by JS to `var(--health-green/amber/red)` on `#sentinelBar`; drives the Sentinel Strip left border, pulsing dot, and progress fill. No new color tokens — reuses existing health color vars so dark/light themes work automatically.

When adding a new visual element, always use CSS variables. Never hardcode hex colors in CSS rules.

### JS State (`dashboard/state.js`)

```
runbookData      — Object: category → task array. Reserved keys prefixed with _.
projectConfig    — Object: loaded from config.json. Fields: projectName, subtitle, changeRef,
                   client, environment, release, accentColor, runbookFile, logoFile,
                   backgroundFile, excelFile, healthThresholds { ahead, onTrack, atRisk }.
filterState      — String: "all" | "done" | "inprogress" | "notstarted" | "blocked" | "unneeded"
searchQuery      — String: free-text search filter (matches task, item, taskId, system, comment)
teamFilter       — String: "all" | <assignee value>
systemFilter     — String: "all" | <system value> — dropdown hidden when no tasks have system values
sortMode         — String: "timeline" | "completion" | "alpha"
openCategories   — Set: which category sections are currently expanded
issues           — Array: issue objects with {id, description, category, severity, issueStatus}
healthStatus     — String: "Green" | "Amber" | "Red"
clientLogoImg    — Image | null: loaded from assets/ (path from logoFile or auto-detected)
clientBgImg      — Image | null: loaded from assets/ (path from backgroundFile or auto-detected)
```

Timer state is managed inside `dashboard/actions/timer.js` (not in `state.js` — ephemeral,
persisted separately):
```
runStart         — Number | null: Date.now() ms when the run started (null = not started)
pausedDuration   — Number: total accumulated ms during all pauses
pauseStart       — Number | null: Date.now() ms when the current pause began (null = not paused)
timerState       — String: "stopped" | "running" | "paused"
```
Timer state is saved to localStorage key `runbook_timer` by `saveTimerState()` in `persistence.js`.

### JS Module Map

#### Entry & Init (`dashboard/app.js`)
| Function | Purpose |
|----------|---------|
| `init()` | Fetches `config.json` (or `/client-config` in Electron), merges into `projectConfig`, calls `applyConfig()`, wires events |
| `applyConfig()` | Updates page title, h1, subtitle from `projectConfig`; applies `--color-primary` from `accentColor` |
| `loadRunbook()` | Loads from localStorage (if saved) or fetches `runbook.json` (or `projectConfig.runbookFile`) |
| `render()` | Main loop: renders stats, issues, timeline, all categories + tasks |
| `detectAssets()` | Loads logo/background: checks `config.json` `logoFile`/`backgroundFile` first; falls back to `assets/` directory scan, then prefix-guessing; in Electron uses `/client-asset/<name>` route |
| `initTheme()` | Restores saved dark/light preference from localStorage |
| `initPalette()` | Restores saved corporate/neon palette preference from localStorage |
| `toggleTheme()` | Flips dark ⟺ light; persists to localStorage |
| `togglePalette()` | Flips corporate ⟺ neon palette; persists to localStorage; triggers full re-render |
| `showConfirm(title, msg, opts)` | Returns `Promise<boolean>`; renders a styled themed modal (replaces native `confirm()`) |
| `bindEvents()` | Wires all static event listeners (filters, sort, search, action buttons, keyboard shortcuts) |
| `populateTeamFilter()` | Rebuilds team filter `<select>` from current runbook data |
| `populateSystemFilter()` | Rebuilds system filter `<select>`; hides it when no tasks have a `system` value |

Boot sequence (bottom of `runbookDashboard.html`):
```
initTheme() → initPalette() → updateClock() → setInterval(clock, 1s)
→ bindEvents() → loadConfig() → detectAssets() → loadRunbook()
→ loadTimerState() → startAutoSnapshot(15 min)
→ setInterval(updateSentinelBar, 1s)   ← Sentinel Strip live countdown
```

#### Rendering (`dashboard/render/`)
| Module | Function | Purpose |
|--------|----------|---------|
| `stats.js` | `renderGlobalStats()` | 7 stat cards: Total, Completed, In Progress, Not Started, %, Open Issues, Blocking |
| `stats.js` | `updateStatsValues()` | Targeted value-diffing update (skips unchanged DOM nodes) |
| `stats.js` | `renderHealthIndicator()` | Updates health dot + text |
| `stats.js` | `updateSentinelBar()` | Updates the Sentinel Strip: elapsed time, timer controls, dual progress bars (Phase 2), health advisory (Phase 3), and inline `--sentinel-color` CSS var |
| `timeline.js` | `renderTimeline()` | Horizontal stepper pipeline at top — clicking a node opens its category |
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
| `getTotalEstimatedMs()` | Returns total planned duration ms (latestEstimatedEnd − runStart), or null if unavailable |
| `getEstimationCoverage()` | Returns fraction 0–1 of non-Unneeded tasks that have `estimatedEnd` |
| `getTimeDelta()` | Returns `{ timeProgressPct, completionPct, deltaPct }` or null (suppressed when timer stopped, no runStart, coverage < 60%, or no estimated duration) |
| `getHealthAdvisory()` | Returns `'Green'|'Amber'|'Red'|null` based on `deltaPct` vs `projectConfig.healthThresholds`; null when delta is above `ahead` threshold or no delta available |

#### Timer Actions (`dashboard/actions/timer.js`)
| Function | Purpose |
|----------|---------|
| `startTimer()` | Sets `runStart = Date.now()`, `timerState = 'running'`, saves state |
| `pauseTimer()` | Records pause start; `timerState = 'paused'` |
| `resumeTimer()` | Accumulates `pausedDuration`; `timerState = 'running'` |
| `stopTimer()` | Resets all timer fields to initial values; clears localStorage |
| `getElapsedMs()` | Returns elapsed ms excluding paused time; 0 if not started |

The Sentinel Strip (`#sentinelBar`) is updated once per second via `setInterval(updateSentinelBar, 1000)` in `app.js`. Timer actions call `saveTimerState()` after each mutation.

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

#### Snapshot History (`dashboard/history.js`)
| Function | Purpose |
|----------|---------|
| `recordSnapshot()` | Saves a timestamped `{ts, pct, done, total, inProg, notStarted, blocking, health}` entry to localStorage (`runbook_snapshots`). Deduplicates back-to-back identical pct+health entries. |
| `getSnapshots()` | Returns all recorded snapshots oldest-first. |
| `clearSnapshots()` | Clears localStorage snapshot history. |
| `startAutoSnapshot(intervalMs)` | Starts a timer that calls `recordSnapshot()` automatically (default: every 15 minutes). |

Snapshots are recorded: on every health change, and on a 15-minute auto-timer. Capped at 200 entries.

#### Canvas Image Exports (`dashboard/export/`)
| Module | Dimensions | Style |
|--------|------------|-------|
| `phone.js` | 1080×1920 portrait | Dark bg, neon colors. For phone/WhatsApp. |
| `email.js` | 1920×1080 landscape | White bg, corporate colors. For email. |
| `gantt.js` | 1920×dynamic | Timeline bars with NOW line. |
| `finalReport.js` | N/A (HTML output) | Self-contained HTML report: burndown SVG, health SVG, Gantt SVG, per-assignee table, issue log, stats. |

All canvas renderers:
- Use `projectConfig` for titles, subtitle, changeRef, accentColor
- Draw client logo if `clientLogoImg` is loaded
- Use Canvas 2D API directly (no libraries)
- Export as PNG via `canvas.toBlob()`
- Phone export offers `navigator.share()` on mobile, falls back to download

The **Final Report** (`finalReport.js` + `finalReport/`) is a post-event HTML report downloaded as a self-contained file. It:
- Takes a final snapshot immediately before rendering
- Builds SVG charts from the `history.js` snapshot array
- Generates per-assignee completion stats via `finalReport/helpers.js`
- Assembles a printable HTML page via `finalReport/htmlReport.js`

#### Data Persistence (`dashboard/persistence.js`)
| Function | Purpose |
|----------|---------|
| `saveToLocalStorage()` | Saves entire `runbookData` (including `_issues`, `_health`) to localStorage key `runbook_progress` (namespaced per client via `?clientKey`) |
| `exportJSON()` | Downloads current state as `.json` file |
| `loadFromFile()` | Reads uploaded `.json` file and restores state |
| `saveTimerState()` | Saves `{ runStart, pausedDuration, pauseStart, timerState }` to localStorage key `runbook_timer` |
| `loadTimerState()` | Restores timer state from localStorage; called during boot before first render |

localStorage is auto-saved on every status change, issue change, health change, and timer state change.

In Electron, `app.js` fetches project config from `/client-config` (served by `electron-main.js` which proxies the active client folder) rather than from a static `config.json`. Client assets (logo, background) are served via `/client-asset/<filename>`. This allows multiple client folders without copying files into the app bundle.

---

## Electron Architecture (`electron-main.js`)

### HTTP Server Routes

| Route | Purpose |
|-------|---------|
| `/` | Redirects to `welcome.html` |
| `/welcome.html` | Welcome screen (served from app root) |
| `/runbookDashboard.html?clientKey=<slug>` | Dashboard scoped to active client |
| `/client-config` | Proxies `config.json` / `*_config.json` from `currentClientDir`; auto-injects `runbookFile` if absent |
| `/client-asset/<filename>` | Serves a file from `currentClientDir` (bare filename only; path-traversal guarded) |
| `/<path>` | Static file serving from app root with MIME type detection |

### Per-Client localStorage Isolation

When `electronAPI.openDashboard(folderPath)` is called, `electron-main.js` sets `currentClientDir` and navigates the window to `runbookDashboard.html?clientKey=<slug>` where `<slug>` is the folder's basename normalized to `[a-z0-9-]`. The dashboard reads `clientKey` from the URL and prefixes all localStorage keys with it. Switching between clients never overwrites another client's progress.

### Smart File Discovery

`findConfigFile(folderPath)` and `findRunbookFile(folderPath)` allow clients to keep their own naming conventions:
- Tries `config.json` / `runbook.json` first
- Falls back to the first file matching `*_config.json` / `*_runbook.json` (sorted alphabetically)

This means a client folder named `mks_config.json` + `mks_runbook.json` works without renaming.

### Recent Clients Store

Persisted at `~/.mxrunbook/recent-clients.json` (survives app reinstalls and temp-dir cleanups). Each entry:
```
{ path, clientName, projectName, subtitle, accentColor, logoFile, logoDataUrl, lastOpened }
```
- `logoDataUrl` capped at 350 K characters; large images are auto-resized via `sharp` (PNG→JPEG fallback, down to 128×128) before storage
- Max 10 entries; oldest removed when limit exceeded

### Excel Save-Back

`ipcMain.handle('runbook:writeToExcel', ...)` — writes current dashboard state to the source `.xlsx`:

1. **Locate source file** via `resolveExcelFile()`: checks `config.json` `excelFile` field first, then auto-discovers the first `*.xlsx` in the client folder (excludes `*_backup_*.xlsx`)
2. **Backup** — copies the source file to `<name>_backup_<YYYYMMDDHHmm>.xlsx` before any write; returns an error if the file is locked (Excel open)
3. **Update-in-place** (source file found):
   - Builds a header index from row 1
   - Ensures `Status (Actual)`, `Actual Start`, `Actual End`, `Comment` columns exist (appended if missing)
   - Matches each runbook task to a worksheet row by `item` (primary) or `task` text (fallback, FIFO for duplicates)
   - Writes actual status (reverse-mapped via `status_mapping`), actual end time, and comment
4. **Generate-fresh** (no source file):
   - Creates a new workbook with Item / Category / Task / Status / Start / End / Assignee / Status (Actual) / Actual Start / Actual End columns
   - Outputs to `<projectName>_export_<YYYYMMDD>.xlsx`

Returns `{ success, mode, outputPath, backupPath, updatedRows, skippedRows, error? }`.

---

## Adapter Layer (`adapter/`)

### `convert.py` — CLI Entry Point

```bash
python adapter/convert.py --source FILE --mapping MAPPING --output runbook.json
python adapter/convert.py --validate runbook.json
python adapter/convert.py --generate-template --mapping mapping.yml
python adapter/convert.py --auto-detect --source your_runbook.xlsx
```

Arguments:
- `--source` / `-s`: Input file path
- `--format` / `-f`: Force format (`csv`, `excel`, `json`). Auto-detected from extension if omitted.
- `--mapping` / `-m`: Path to column mapping file (YAML or JSON)
- `--output` / `-o`: Output path (default: `runbook.json`)
- `--validate` / `-v`: Validate an existing JSON file and exit
- `--no-merge`: Don't preserve `_issues`/`_health` from existing output file
- `--generate-template`: Generate a ready-to-fill `.xlsx` template from `mapping.yml` (uses `adapter/template_generator.py`)
- `--auto-detect`: Fuzzy-match spreadsheet headers to suggest a `mapping.yml` (uses `adapter/autodetect.py`); prints suggested YAML to stdout

Key behaviors:
- Preserves `_issues` and `_health` from existing `runbook.json` by default (safe to re-run during live events)
- Validates output against schema before writing
- Auto-detects format from file extension
- `autodetect.py` is lazily imported only when `--auto-detect` is passed

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
| `history.test.js` | Snapshot recording, deduplication, auto-snapshot |
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
