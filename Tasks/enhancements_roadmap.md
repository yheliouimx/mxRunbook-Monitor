# mxRunbook-Monitor — Enhancement Roadmap

> Generated from the improvement analysis session (April 2026).  
> Items marked ✅ are already implemented on branch `claude/improve-runbook-tool-6x0yl`.  
> All other items are open backlog, grouped by added value then effort.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented |
| 🔴 | High added value |
| 🟡 | Medium added value |
| 🟢 | Nice to have |
| ⚡ | Low effort |
| ⚙️ | Medium effort |
| 🔧 | High effort |

---

## Group 1 — Reporting & Post-Event Analysis
*Highest impact. Teams spend hours producing status reports manually; these eliminate that work entirely.*

| # | Feature | Value | Effort | Status |
|---|---------|-------|--------|--------|
| 1.1 | **Post-Event Summary Report** — self-contained HTML with Gantt, burndown, per-assignee table, issues log, health timeline | 🔴 | 🔧 | ✅ |
| 1.2 | **Snapshot History** — auto-record completion % + health every 15 min to localStorage; powers burndown curve | 🔴 | ⚙️ | ✅ |
| 1.3 | **Burndown Curve** — SVG line chart of completion % over time with health-coloured background bands | 🔴 | ⚙️ | ✅ |
| 1.4 | **Per-Assignee Summary** — tasks assigned / done / in-progress / blocking + overrun count per person | 🔴 | ⚙️ | ✅ |
| 1.5 | **Progress CSV Export** — "Export Progress CSV" button; dumps all task fields including `actualEnd` and `deviationMinutes` for post-event Excel analysis | 🔴 | ⚡ | Open |
| 1.6 | **Timeline Deviation Report** — per-task bar chart showing actual vs planned end time (green = early, red = overrun); average delay + % on time | 🔴 | ⚙️ | Open |
| 1.7 | **Live ETA Estimator** — derives current velocity (tasks/hour) and displays "Estimated completion: 03:45" in the header, updating every 60 s | 🟡 | ⚡ | Open |
| 1.8 | **Health Status History Panel** — timeline of when health was toggled Green / Amber / Red, visible inside the dashboard (not just in the report) | 🟡 | ⚙️ | Open |
| 1.9 | **Snapshot Comparison** — diff two saved snapshots to see exactly which tasks changed between T1 and T2 | 🟢 | ⚙️ | Open |

---

## Group 2 — Excel / CSV Conversion Quality
*Reduces the biggest source of friction: getting the runbook data in cleanly.*

| # | Feature | Value | Effort | Status |
|---|---------|-------|--------|--------|
| 2.1 | **Excel Template Generator** — `--generate-template` CLI flag; produces `.xlsx` with headers, example row, Status & Party dropdowns, frozen row | 🔴 | ⚙️ | ✅ |
| 2.2 | **Auto-detect Column Mapping** — `--auto-detect` CLI flag; fuzzy-matches column headers and prints a suggested `mapping.yml` | 🔴 | ⚙️ | ✅ |
| 2.3 | **Reverse Export: Dashboard → CSV/Excel** — export current dashboard state (with live-entered actual times + comments) back to a `.csv` / `.xlsx`; critical for post-event filing | 🔴 | ⚙️ | Open |
| 2.4 | **Rich Conversion Report** — `--report` flag generates `conversion_report.html` with colour-coded issues by row, missing-data heatmap, original-value → mapped-value preview | 🟡 | ⚙️ | Open |
| 2.5 | **Incremental Re-sync / Diff Mode** — `--diff` flag; compare new source file against existing `runbook.json`, preserve statuses of unchanged tasks, highlight added/removed/modified rows | 🟡 | 🔧 | Open |
| 2.6 | **Multi-Sheet Excel** — target a specific sheet by name via `sheet:` in `mapping.yml`; support multiple sheets as multiple categories | 🟡 | ⚙️ | Open |
| 2.7 | **Drag-and-Drop File Import** — drop `.xlsx`, `.csv`, or `.json` directly onto the dashboard; basic column auto-detection handles common naming conventions with no Python needed | 🟡 | 🔧 | Open |

---

## Group 3 — Genericness & Configurability
*Makes the tool reusable beyond Murex delivery contexts and easier to brand for each client.*

| # | Feature | Value | Effort | Status |
|---|---------|-------|--------|--------|
| 3.1 | **Configurable Party / Owner Types** — `Client \| Murex \| Joint` is hardcoded in `schema.py` and `quality.py`; move to `config.json` so any team can define their own labels | 🟡 | ⚡ | Open |
| 3.2 | **Configurable Status Display Labels** — custom display aliases for the 5 canonical statuses (e.g. show "Done ✓" instead of "Completed") via `config.json`; internal keys stay stable | 🟡 | ⚡ | Open |
| 3.3 | **Configurable Stat Cards** — show/hide individual stat cards via `config.json` (e.g. hide "System" card when runbook has no system-tagged tasks) | 🟢 | ⚡ | Open |
| 3.4 | **Multi-Project Switcher** — single dashboard instance supports switching between multiple `runbook.json` files without reloading the page | 🟢 | 🔧 | Open |

---

## Group 4 — UX & Operator Efficiency
*Reduces repetitive clicking during a live go-live event where every second counts.*

| # | Feature | Value | Effort | Status |
|---|---------|-------|--------|--------|
| 4.1 | **Bulk Status Update** — right-click / long-press category card → "Mark all Completed / Reset all"; shift-click for multi-task select | 🔴 | ⚙️ | Open |
| 4.2 | **Undo / Redo** — ring buffer of last 20 actions; Ctrl+Z / Ctrl+Y; "Undo" button in header | 🟡 | ⚙️ | Open |
| 4.3 | **Keyboard Navigation & Shortcuts** — `J`/`K` move between tasks, `Space` cycles status, `C` opens comment, `F` focuses search, `?` shows cheat sheet | 🟡 | ⚙️ | Open |
| 4.4 | **PWA / Offline Install** — `manifest.json` + service worker; installable from Safari to iPhone homescreen; fully offline after first load | 🟡 | ⚙️ | Open |
| 4.5 | **Critical Path Highlighting** — tasks declare `dependsOn: ["item-id"]`; dashboard highlights tasks whose delay would extend total duration | 🟢 | 🔧 | Open |
| 4.6 | **Drag-to-Reorder Tasks** — reorder tasks within a category via drag; persisted to localStorage | 🟢 | 🔧 | Open |

---

## Suggested Implementation Order

```
Sprint 1 (quick wins, high value)
  1.5  Progress CSV Export
  1.7  Live ETA Estimator
  3.1  Configurable Party values
  3.2  Configurable Status labels
  4.1  Bulk Status Update

Sprint 2 (conversion quality)
  2.3  Reverse Export Dashboard → CSV/Excel
  2.4  Rich Conversion Report
  2.6  Multi-Sheet Excel support

Sprint 3 (deeper analytics)
  1.6  Timeline Deviation Report
  1.8  Health Status History Panel
  4.2  Undo / Redo

Sprint 4 (platform & reach)
  4.4  PWA / Offline Install (high value on iPhone)
  2.5  Incremental Re-sync / Diff Mode
  2.7  Drag-and-Drop File Import

Backlog (lower priority)
  1.9  Snapshot Comparison
  3.3  Configurable Stat Cards
  3.4  Multi-Project Switcher
  4.3  Keyboard Navigation
  4.5  Critical Path Highlighting
  4.6  Drag-to-Reorder
```

---

## Already Delivered (this session)

| Item | PR |
|------|----|
| Snapshot history module (`dashboard/history.js`) | #2 |
| Final Report export — burndown, health timeline, Gantt, per-assignee, issues log | #2 |
| Excel Template Generator (`adapter/template_generator.py`, `--generate-template`) | #2 |
| Auto-detect column mapping (`adapter/autodetect.py`, `--auto-detect`) | #2 |
| Fixed pre-existing null guards in `app.js` (`systemFilter`, `exportMenu`) | #2 |
| 17 new unit tests for history module | #2 |
