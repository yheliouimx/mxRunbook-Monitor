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
- **3 image exports**:
  - Phone (1080×1920 portrait) — optimized for WhatsApp sharing
  - Email (1920×1080 landscape) — corporate style for email updates
  - Gantt chart (1920×dynamic) — timeline visualization with NOW line
- **Text summary**: Copy-paste-ready status summary
- **Dark/Light mode**: Toggle between dark (default) and light themes
- **Client branding**: Auto-detects logo and background from `assets/` folder
- **Offline**: Everything runs locally, no network required after initial load
- **State persistence**: Progress saved to browser localStorage

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
  "accentColor": "#003a2d"
}
```

`accentColor` is used in canvas exports (top bar, footer). Use the client's brand color.

### 3. Map your data columns — `mapping.yml`

Map your source file's columns to the dashboard fields:
```yaml
columns:
  task: "Activity Description"     # Column header for the task text
  status: "Current Status"         # Column header for status
  startTime: "Planned Start"       # Optional: start time column
  endTime: "Planned End"           # Optional: end time column
  item: "Task ID"                  # Optional: item label column

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
- Logo: `clientLogo-<anything>.png` (e.g., `clientLogo-acme.png`)
- Background: `background-<anything>.jpg` (e.g., `background-dark.jpg`)

The dashboard auto-detects files by prefix — no config needed.

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

## Limitations

**This tool is not:**

- **A runbook authoring tool** — it does not create runbooks from scratch. It consumes a pre-existing runbook (CSV or Excel) and converts it into a displayable format.
- **A real-time collaboration tool** — there is no server, no database, and no sync between users. Each operator works on their own local copy. Progress is stored in the browser's `localStorage` and is lost if the cache is cleared or a different browser/machine is used.
- **A zero-setup tool** — it requires Python 3.10+ on the machine to convert source files, and a local HTTP server to serve the dashboard correctly. Opening the HTML file directly in a browser without a server will fail to load `runbook.json` and `config.json`.
- **An automated tracker** — statuses must be updated manually by the operator. The tool has no awareness of actual system state, CI/CD pipelines, or deployment logs.
- **An alerting or notification system** — there are no push alerts, emails, or escalation triggers. The health indicator (Green / Amber / Red) is set manually.
- **Persistent across sessions by default** — if `Save Progress` is not clicked (or `Ctrl+S`), unsaved changes are lost on page refresh. Saved state is browser-local only.
- **A Gantt chart generator without time data** — the Gantt export requires `startTime` and `endTime` fields populated in `runbook.json`. Tasks without time data will not appear on the chart.
- **Guaranteed to paste correctly into all email clients** — the email summary copy function works best with Outlook on Windows. Other clients may strip formatting.

---

## Architecture

```
runbook-dashboard/
├── runbookDashboard.html    ← Dashboard HTML + CSS
├── _serve.js                ← Dev server (Node.js, port 8090)
├── config.json              ← Project-specific metadata
├── mapping.yml              ← Column mapping for source runbook
├── runbook.json             ← Task data (generated, never hand-edit)
├── dashboard/               ← Modular JS (ES modules)
│   ├── app.js               ← Entry point, render loop, event wiring
│   ├── state.js             ← Global state
│   ├── constants.js         ← Status labels, class mappings
│   ├── selectors.js         ← Derived queries (stats, status logic)
│   ├── persistence.js       ← localStorage, JSON export/import
│   ├── validation.js        ← Status normalization
│   ├── actions/             ← User interaction handlers
│   ├── render/              ← DOM rendering (targeted patches)
│   └── export/              ← Canvas image exports + theme
├── assets/
│   ├── clientLogo-*.png     ← Client logo (auto-detected)
│   └── background-*.jpg     ← Background image (auto-detected)
├── adapter/
│   ├── convert.py           ← CLI: source file → runbook.json
│   ├── schema.py            ← JSON validation
│   └── parsers/             ← CSV + Excel parsers
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
      "item": "TASK-1",
      "task": "Description of the task",
      "status": "Not Started",
      "startTime": "2026-03-27T18:00:00",
      "endTime": "2026-03-27T19:00:00"
    }
  ],
  "Another Category": [ ... ],
  "_issues": [],
  "_health": "Green"
}
```

- Categories are displayed in source order
- `item` and time fields are optional (can be `null`)
- `_issues` and `_health` are reserved keys (prefixed with `_`), managed by the dashboard UI
- `status` should be one of: `Completed`, `In Progress`, `Not Started`, `Blocking`, `Unneeded`

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

---

## License

[ISC](LICENSE)
