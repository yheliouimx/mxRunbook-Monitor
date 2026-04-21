# Go-Live Runbook Dashboard

A lightweight, zero-infrastructure monitoring tool for production go-live events. Track task progress, export status snapshots, and share updates — all from a single HTML page opened in a browser.

Built for short-lived, high-pressure events (releases, migrations, cutovers) where teams need real-time visibility without setting up servers or deployments.

![Dashboard overview — dark mode](assets/screenshot-overview.png)

---

## Features

- **5-state task tracking**: Not Started → In Progress → Completed → Blocking → Unneeded (click to cycle)
- **Category progress**: Collapsible task groups with progress bars
- **Health indicator**: Green / Amber / Red go-live health with one-click toggle
- **Issues log**: Full CRUD panel for tracking issues (blocking / non-blocking, ongoing / closed)
- **Run Timer + Health Advisory** (Sentinel Strip between stat cards and task list):
  - `▶ Start Run` / `⏸` / `⏹` timer tracking elapsed time since the run began, surviving page refreshes
  - Dual progress bars (Completion % vs Time %) with a delta badge (`+12% ahead` / `−8% at risk`) once ≥ 60% of tasks have `estimatedEnd` data
  - Auto health advisory (`⚠ Auto: Amber [Accept]`) derived from the completion-vs-time delta; thresholds configurable in `config.json`; never applied without operator confirmation
- **Welcome screen** (Electron app): launcher page with glassmorphism UI showing recent runbooks as cards (client logo, project name, last-opened date); click to reopen instantly or browse for a new client folder; up to 10 entries persisted in `~/.mxrunbook/recent-clients.json`
- **Per-client localStorage isolation**: each client folder gets its own storage namespace via `?clientKey=<slug>` — switching between projects never overwrites another client's progress
- **Smart file discovery**: the Electron server auto-detects `*_config.json` / `*_runbook.json` naming variants so clients can keep their canonical file names (e.g. `mks_config.json`) without renaming
- **Excel save-back** (Electron only): write the current runbook state back to the original `.xlsx` file with `Status (Actual)`, `Actual Start`, `Actual End`, and `Comment` columns added; creates a timestamped backup before writing; falls back to generating a fresh export file if no source xlsx is found
- **5 export types**:
  - Phone (1080×1920 portrait) — optimized for WhatsApp sharing
  - Email (1920×1080 landscape) — corporate style for email updates
  - Gantt chart (1920×dynamic) — timeline visualization with NOW line, planned-end marker
  - Text summary — copy-paste-ready status block with operator comments
  - **Post-Event Summary Report** — self-contained HTML file with burndown chart, health timeline SVG, Gantt, per-assignee breakdown, and issue log
- **Snapshot history**: Completion % and health recorded every 15 min to localStorage; powers the burndown curve in the Final Report
- **Excel Template Generator**: generate a ready-to-fill `.xlsx` template from your `mapping.yml` (`--generate-template`)
- **Column auto-detection**: fuzzy-match your spreadsheet headers to suggest a `mapping.yml` automatically (`--auto-detect`)
- **Dark/Light mode**: Toggle between dark (default) and light themes
- **Corporate/Neon palette**: Toggle between a corporate palette (accent-color-driven) and a neon palette; preference persisted per-browser
- **Client branding**: Logo and background configurable via `config.json` (`logoFile`, `backgroundFile`); auto-detected from `assets/` by scanning for any filename containing `logo` or `background`
- **Offline**: Everything runs locally, no network required after initial load
- **State persistence**: Progress saved to browser localStorage

### v2 task fields (optional, sourced from Excel)

When your runbook spreadsheet includes extra columns, the adapter maps them to these v2 fields and the dashboard displays them in-line on each task row:

| Field | Dashboard display | Example |
|-------|-------------------|---------|
| `taskId` | Yellow `#ID` badge | `#15` |
| `system` | Cyan outlined pill | `MX/PROD` |
| `party` | Colored filled badge | `Client` / `Murex` / `Joint` |
| `estimatedEnd` | Planned-end baseline for Gantt & delta display | `2026-04-15T14:00` |
| `endTime` | Actual end — click-to-edit inline on the task row | `13:45` |
| `comment` | Amber 💬 note button → inline textarea editor | operator notes |

Enable them in your `mapping.yml`:
```yaml
columns:
  # ... required columns ...
  taskId:  "Task Id"
  system:  "System"
  party:   "Owner"          # values: Client / Murex / Joint
  estimatedEnd: "Planned End"
  endTime: "Actual End"
  comment: "Comments"
```

### Dark & Light themes
![Dashboard — dark mode (left) and light mode (right)](assets/screenshot-themes.png)

### Task list
![Task list with assignees and time ranges](assets/screenshot-tasks.png)

---

## Quick Start

> **TL;DR**: Convert your runbook spreadsheet → start a local server → open the dashboard.

### Prerequisites

| Requirement | Why |
|-------------|-----|
| **Node.js** (any version) | To run the local dev server (`_serve.js`) |
| **Python 3.10+** | To convert source files (CSV/Excel) into `runbook.json` |
| `pip install pyyaml` | If using `.yml` mapping files |
| `pip install openpyxl` | If converting from Excel `.xlsx` |

### 1. Clone / copy the project

Copy these files to your working folder:
```
runbookDashboard.html
_serve.js
config.json
mapping.yml
adapter/          (entire folder)
dashboard/        (entire folder)
assets/           (create empty)
```

### 2. Configure your project — `config.json`

```json
{
  "projectName": "Your Project Name",
  "subtitle": "Release Phase Description",
  "changeRef": "CHG0000000",
  "client": "Client Name",
  "environment": "PROD",
  "release": "v1.0",
  "accentColor": "#003a2d",
  "runbookFile": "runbook.json",
  "logoFile": "clientLogo-acme.png",
  "backgroundFile": "Murex_background6.jpg",
  "excelFile": "my_runbook.xlsx",
  "healthThresholds": { "ahead": 5, "onTrack": -10, "atRisk": -25 }
}
```

`accentColor` drives the `--color-primary` CSS variable used across the dashboard and in canvas exports. Use the client's brand color.
`runbookFile` sets the JSON file the dashboard loads. Defaults to `runbook.json` if omitted — useful when managing multiple projects in the same folder.
`logoFile` / `backgroundFile` load a specific file from `assets/` directly, bypassing the prefix-based auto-detection. Omit to keep auto-detection.
`excelFile` (Electron only) specifies the source `.xlsx` file to update when using the Excel save-back feature. If omitted, the first `*.xlsx` found in the client folder is used automatically.
`healthThresholds` tunes the Sentinel Strip health advisory: `ahead` (%) = delta above which the advisory is Green; `onTrack` (%) = above which Amber; `atRisk` (%) = above which Red (below = delayed). Negative = behind schedule.

### 3. Map your data columns — `mapping.yml`

Map your source file's columns to the dashboard fields:
```yaml
columns:
  task: "Activity Description"     # Column header for the task text
  status: "Current Status"         # Column header for status
  startTime: "Planned Start"       # Optional: start time column
  endTime: "Planned End"           # Optional: end time column
  item: "Task ID"                  # Optional: item label column
  # v2 optional fields
  taskId:  "Task Id"               # Optional: task reference ID
  system:  "System"                # Optional: system/component tag
  party:   "Owner"                 # Optional: Client / Murex / Joint
  estimatedEnd: "Planned End"      # Optional: planned end (for Gantt delta)
  comment: "Comments"              # Optional: operator notes column

category_column: "Phase"           # Column that groups tasks into categories
default_category: "Tasks"          # Fallback if a row has no category

status_mapping:                    # Map source values → dashboard statuses
  "Done": "Completed"
  "WIP": "In Progress"
  "Pending": "Not Started"

category_mapping:                  # Fix typos or encoding issues
  "Deplymnt": "Deployment"
```

**Dashboard statuses**: `Completed`, `In Progress`, `Not Started`, `Blocking`, `Unneeded`

### 4. Add branding (optional)

Drop files into `assets/`:
- **Logo**: any filename containing `logo` is detected automatically (e.g. `logo.png`, `acme-logo.svg`, `mylogo.jpg`).
- **Background**: name it `background.jpg` (or any `background*.jpg/png`) — or keep the default `Murex_background6.jpg`.

**Option A — auto-detection** (recommended): use the standard filenames above and omit `logoFile` / `backgroundFile` from `config.json`. The dashboard scans `assets/` and loads the first match.

**Option B — explicit path**: set `logoFile` and `backgroundFile` in `config.json` to load a specific file regardless of its name:
```json
"logoFile": "acme-brand.png",
"backgroundFile": "Murex_background6.jpg"
```

> **Note:** Files named `clientLogo-*` are a development convention used in the source repository and are intentionally excluded from the portable distribution. Use `logo.*` naming for deployment assets.

### 5. Convert your runbook

```bash
python adapter/convert.py --source your_runbook.csv --mapping mapping.yml
```

Other examples:
```bash
# Excel source
python adapter/convert.py --source your_runbook.xlsx --mapping mapping.yml

# Custom output path
python adapter/convert.py --source your_runbook.csv --mapping mapping.yml --output runbook.json

# Validate an existing file
python adapter/convert.py --validate runbook.json

# Generate a ready-to-fill Excel template from your mapping
python adapter/convert.py --generate-template --mapping mapping.yml

# Auto-detect column mapping by scanning your spreadsheet headers
python adapter/convert.py --auto-detect --source your_runbook.xlsx
```

> The converter preserves `_issues` and `_health` from any existing `runbook.json`, so re-running it during a live event won't wipe saved progress.

### 6. Start the server and open the dashboard

```bash
node _serve.js
```

Then open **http://localhost:8090/** in your browser.

That's it. You should see the dashboard with your data loaded.

> **Alternative**: If you don't have Node.js, use Python's built-in server:
> ```bash
> python -m http.server 8090 --bind 127.0.0.1
> ```
> Then open `http://localhost:8090/runbookDashboard.html`

---

## Portable Distribution (No Install)

For users with no Node.js or Python available, two distribution options exist:

### Option A — Single portable HTML file

A completely self-contained HTML file with all JS, config, and assets base64-inlined. Works by double-clicking in any browser — no server required.

```bash
npm run build         # config + assets inlined, user loads runbook via "Load File"
npm run build:full    # also inlines runbook.json (fully self-contained)
```

Output: `dist/runbookDashboard-portable.html`

> Image exports (Phone / Email / Gantt) require an internet connection for html2canvas CDN. Google Fonts also requires internet; the dashboard falls back to system fonts if offline.

### Option B — Standalone Electron app (Windows x64)

A native desktop app (`MX Runbook Monitor.exe`) that embeds Chromium + a local HTTP server. No browser, no Node.js install, and no Python required on the end-user machine.

**Build:**
```bash
npm run dist        # → dist-electron/win-x64/
npm run dist:zip    # → dist-electron/MXRunbookMonitor-win-x64.zip
```

**Folder layout after build:**
```
dist-electron/win-x64/
├── MX Runbook Monitor.exe
└── resources/app/
    ├── welcome.html       ← landing page (opens on startup)
    ├── runbookDashboard.html
    ├── dashboard-config.json  ← global theme / background settings
    ├── dashboard/
    ├── mapping.yml
    └── assets/
        └── Murex_background6.jpg   ← default background (included)
```

> The Electron app no longer ships a pre-baked `config.json` or `runbook.json`. Instead, the **Welcome screen** lets the operator select any client folder on their machine at runtime.

**Multi-client workflow:**
1. Double-click `MX Runbook Monitor.exe` — the Welcome screen opens
2. Click **Open Client Runbook** and select the client folder containing `config.json` (or `*_config.json`) and the runbook JSON
3. The dashboard opens scoped to that client; progress is stored under a per-client key so multiple clients never share localStorage
4. Recent folders appear as cards on the Welcome screen — click any card to reopen instantly
5. To switch clients: click **← Back** in the dashboard header to return to the Welcome screen

**Preparing a client folder:**
1. Create a folder for the client (e.g. `C:\Runbooks\Acme-Release\`)
2. Copy `config.json` (or name it `acme_config.json`) with project details
3. Copy the runbook JSON (or name it `acme_runbook.json`) — filename is auto-detected
4. Copy the `.xlsx` source file if you want Excel save-back
5. Add logo — any file containing `logo` in `assets/` sub-folder or in the client folder root
6. Select the folder from the Welcome screen

**Excel save-back:**

In the Electron app, a **Save to Excel** button in the dashboard writes current task statuses, actual end times, and operator comments back to the original `.xlsx` file:
- Adds `Status (Actual)`, `Actual Start`, `Actual End`, `Comment` columns alongside the original planned columns
- Creates a timestamped backup (e.g. `runbook_backup_202604151030.xlsx`) before writing
- Falls back to generating a fresh export file if no `.xlsx` is found in the client folder
- Set `"excelFile": "myfile.xlsx"` in `config.json` to pin the source file; otherwise the first `*.xlsx` in the folder is used

> **Why `logo.*` and not `clientLogo-*`?** Files named `clientLogo-*` are a source-repo convention and are deliberately excluded from the distribution (they are project-specific). The deployment convention is `logo.png` — one file per deployment, placed alongside the runbook data.

---

## Limitations

**This tool is not:**

- **A runbook authoring tool** — it does not create runbooks from scratch. It consumes a pre-existing runbook (CSV or Excel) and converts it into a displayable format.
- **A real-time collaboration tool** — there is no server, no database, and no sync between users. Each operator works on their own local copy. Progress is stored in the browser's `localStorage` and is lost if the cache is cleared or a different browser/machine is used.
- **A zero-setup tool** — it requires Python 3.10+ on the machine to convert source files, and a local HTTP server to serve the dashboard correctly. Opening the HTML file directly in a browser without a server will fail to load `runbook.json` and `config.json`.
- **An automated tracker** — task statuses must be updated manually by the operator. The tool has no awareness of actual system state, CI/CD pipelines, or deployment logs. The Sentinel Strip provides a *health advisory* (completion-vs-time delta) but the operator must press [Accept] to apply it — nothing changes automatically.
- **An alerting or notification system** — there are no push alerts, emails, or escalation triggers. The health indicator (Green / Amber / Red) is operator-controlled; the Sentinel Strip suggests a health level but never applies it without confirmation.
- **Persistent across sessions by default** — if `Save Progress` is not clicked (or `Ctrl+S`), unsaved changes are lost on page refresh. Saved state is browser-local only.
- **A Gantt chart generator without time data** — the Gantt export requires `startTime` and `endTime` fields populated in `runbook.json`. Tasks without time data will not appear on the chart.
- **Guaranteed to paste correctly into all email clients** — the email summary copy function works best with Outlook on Windows. Other clients may strip formatting.

---

## Architecture

```
runbook-dashboard/
├── welcome.html             ← Electron landing page (recent runbooks)
├── runbookDashboard.html    ← Dashboard HTML + CSS
├── _serve.js                ← Dev server (Node.js, port 8090)
├── _launcher.js             ← Portable server (bundled into exe)
├── _bundle.js               ← Build script → single portable HTML
├── _package.js              ← Build script → portable zip release
├── electron-main.js         ← Electron app entry (native window + IPC handlers)
├── preload.js               ← Electron contextBridge → window.electronAPI
├── dashboard-config.json    ← Global app settings (theme, backgroundImage)
├── config.json              ← Project-specific metadata (per client folder)
├── mapping.yml              ← Column mapping for source runbook
├── runbook.json             ← Task data (generated, never hand-edit)
├── dashboard/               ← Modular JS (ES modules)
│   ├── app.js               ← Entry point, render loop, event wiring
│   ├── state.js             ← Global state
│   ├── constants.js         ← Status labels, class mappings, PARTY_OPTIONS
│   ├── selectors.js         ← Derived queries (stats, filters, delta, health advisory)
│   ├── history.js           ← Snapshot history for burndown / final report
│   ├── persistence.js       ← localStorage, JSON export/import, timer state
│   ├── validation.js        ← Status normalization, v2 field defaults
│   ├── actions/             ← User interaction handlers
│   │   ├── health.js
│   │   ├── issues.js
│   │   ├── tasks.js         ← setTaskStatus, setAssignee, setEndTime, setComment
│   │   └── timer.js         ← Run timer (start/pause/stop, elapsed, state persistence)
│   ├── render/              ← DOM rendering (targeted patches)
│   │   ├── categories.js    ← Task rows with v2 badges, inline editing
│   │   ├── issues.js
│   │   ├── stats.js         ← Stat cards + Sentinel Strip (updateSentinelBar)
│   │   ├── summary.js       ← Includes comment rows in HTML export
│   │   └── timeline.js
│   └── export/              ← Image exports + reports
│       ├── gantt.js         ← Gantt canvas with planned-end (P) marker
│       ├── finalReport.js   ← Post-event HTML summary report
│       └── finalReport/     ← Sub-modules for final report
│           ├── helpers.js
│           ├── htmlReport.js
│           ├── svgBurndown.js
│           ├── svgGantt.js
│           └── svgHealth.js
├── assets/
│   ├── logo.png             ← Client logo — any filename containing "logo" is auto-detected
│   └── background.jpg       ← Background — any filename containing "background" is auto-detected
├── adapter/
│   ├── convert.py           ← CLI: source file → runbook.json
│   ├── schema.py            ← JSON validation (incl. v2 fields)
│   ├── quality.py           ← Quality checks (time conflicts, party values)
│   └── parsers/
│       ├── excel_parser.py  ← Excel parser, maps v2 columns
│       └── generic_csv.py
├── dist/                    ← Build outputs (git-ignored)
│   ├── RunbookDashboard.exe            ← Portable Windows server
│   ├── runbookDashboard-portable.html  ← Single-file HTML build
│   └── RunbookDashboard-v*-portable.zip← Shareable release package
└── tests/                   ← Vitest unit tests
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical reference.

---

## runbook.json Format

The dashboard expects this structure:
```json
{
  "Category Name": [
    {
      "task": "Description of the task",
      "status": "Not Started",
      "item": "TASK-1",
      "startTime": "2026-03-27T18:00",
      "endTime": "2026-03-27T19:00",
      "taskId": "15",
      "system": "MX/PROD",
      "party": "Murex",
      "estimatedEnd": "2026-03-27T19:30",
      "comment": "Operator note goes here"
    }
  ],
  "Another Category": [ ... ],
  "_issues": [],
  "_health": "Green"
}
```

- Categories are displayed in source order
- `item`, `taskId`, `system`, `party`, `estimatedEnd`, `comment` are all optional (omit or `null`)
- `startTime` / `endTime` use local ISO format `YYYY-MM-DDTHH:MM` (no UTC offset needed)
- `endTime` is editable in the dashboard — click the time on any task row
- `comment` is editable in the dashboard — click the 💬 note button on any task row
- `_issues` and `_health` are reserved keys managed by the dashboard UI

---

## Status Logic

| Status | Meaning | In stats |
|--------|---------|----------|
| **Not Started** | Task not begun | Counts as incomplete |
| **In Progress** | Currently being worked on | Counts as incomplete |
| **Completed** | Task finished | Counts as done |
| **Blocking** | Task is blocked. Merged with blocking issues in the "Blocking" stat card | Counts as incomplete |
| **Unneeded** | Task is not needed for this release | Counts as **completed** in all stats |

The unified **Blocking** stat card combines blocking tasks + blocking issues into a single number.

---

## Development

### Running tests

```bash
npm install    # first time only
npm test       # run all tests
```

### Dev server

```bash
node _serve.js
# Dashboard at http://localhost:8090/
```

### Build scripts

| Command | Output | Notes |
|---------|--------|-------|
| `npm run build` | `dist/runbookDashboard-portable.html` | Single HTML, no runbook inlined |
| `npm run build:full` | `dist/runbookDashboard-portable.html` | Single HTML with `runbook.json` inlined |
| `npm run build:exe` | `dist/RunbookDashboard.exe` | Portable Windows server (~54 MB) |
| `npm run build:package` | `dist/RunbookDashboard-v*-portable.zip` | Rebuilds exe + zips release folder |
| `npm run build:package:zip` | `dist/RunbookDashboard-v*-portable.zip` | Zip only, reuses existing exe |
| `npm run electron` | Opens native Electron window | Requires `npm install` with electron |  
| `npm run dist` | `dist-electron/win-x64/` | Electron distributable (Windows x64) |
| `npm run dist:zip` | `dist-electron/MXRunbookMonitor-win-x64.zip` | Electron distributable zipped |

---

## License

[ISC](LICENSE)
