# Small Enhancements — Refined Implementation Plan

> Refined from raw ideas. Items sorted by **added value first, then effort**.  
> Legend: 🔴 High value · 🟡 Medium value · 🟢 Nice-to-have | ⚡ Low effort · ⚙️ Medium effort · 🔧 High effort

---

## Priority Matrix

| # | Feature | Value | Effort | Phase |
|---|---------|-------|--------|-------|
| E1 | Runbook timer auto-start | 🔴 | ⚡ | A |
| E2 | Task time tracking (`actualEnd`, `isBlocked`, `deviationMinutes`) | 🔴 | ⚙️ | B |
| E3 | Reset category to default state | 🔴 | ⚙️ | B |
| E4 | Theme persistence across pages | 🟡 | ⚡ | A |
| E5 | Split export button into Visuals / Data / Reports | 🟡 | ⚡ | A |
| E6 | Edit config.json from dashboard or welcome screen | 🟡 | ⚙️ | B |
| E7 | Edit recent client entries (name, logo) from welcome page | 🟡 | ⚙️ | B |
| E8 | Drag-and-drop folder onto welcome page | 🟢 | ⚙️ | C |
| E9 | Auto-update phase timeline date distribution | 🟢 | 🔧 | C |
| E10 | Auto-refresh dashboard when client folder changes on disk | 🟢 | 🔧 | C |

---

## Phase A — Quick Wins (Low Effort, High/Medium Value)

### E1 · Runbook Timer Auto-Start
**Value:** 🔴 · **Effort:** ⚡

**Refined description**  
When a user marks the first task as "In Progress" and the runbook timer has not yet been started, start it automatically. This removes the manual step of pressing Start during a live event when every second counts. Should be guarded by a `autoStartTimer` boolean flag in `config.json` (default `true`) so teams that prefer manual control can opt out.

**Implementation**
- `config.json` — add `"autoStartTimer": true`
- `dashboard/app.js` → `loadConfig()` — read and store the flag in `state`
- `dashboard/actions/tasks.js` → `setTaskStatus()` — after status update, if new status is `"In Progress"` and `state.timerState === "stopped"` and `config.autoStartTimer`, call `startTimer()`
- No UI change needed; optionally show a brief toast "Timer started automatically"

---

### E4 · Theme Persistence Across Pages
**Value:** 🟡 · **Effort:** ⚡

**Refined description**  
The welcome page stores its theme in `localStorage.welcome_theme`; the dashboard stores it in `localStorage.runbook_theme`. Navigating between pages resets the apparent theme, causing a jarring visual switch. Unify to a single key.

**Implementation**
- Pick one key: `localStorage.mx_theme` (replaces both existing keys)
- `welcome.html` — update theme init and toggle logic to read/write `mx_theme`
- `dashboard/app.js` → `initTheme()` — read `mx_theme` instead of `runbook_theme`; keep `runbook_palette` key unchanged
- Search for all remaining references to `welcome_theme` / `runbook_theme` and replace

---

### E5 · Split Export Button into Three Groups
**Value:** 🟡 · **Effort:** ⚡

**Refined description**  
The current export menu mixes visual exports (Phone, Email, Gantt), data exports (JSON, CSV, Excel), and reports (Summary, Final Report) into one flat list. Splitting them into three clearly labeled groups — or three distinct buttons — reduces cognitive load and avoids accidental data exports when the user only wants to share a screenshot.

**Proposed structure**
```
[📸 Visuals ▾]        [📦 Export Data ▾]       [📄 Reports ▾]
  • Phone / iPhone      • JSON                    • Text Summary
  • Email format        • CSV                     • Final Report (HTML)
  • Gantt image         • Excel (.xlsx)
```

**Implementation**
- `runbookDashboard.html` — replace the single `#exportMenu` dropdown with three adjacent buttons + dropdowns
- `dashboard/app.js` — update `exportMenu` selector and wire up click handlers per group
- CSS — style the three buttons as a button group (shared border radius, matching accent)
- No changes to the export logic files themselves

---

## Phase B — Core Enhancements (Medium Effort, High/Medium Value)

### E2 · Task Time Tracking (`actualEnd`, `isBlocked`, `deviationMinutes`)
**Value:** 🔴 · **Effort:** ⚙️

**Refined description**  
Currently `endTime` is manually entered. This enhancement auto-captures timestamps at key moments and enables an accurate post-event timeline:

- **`actualStart`** — ISO timestamp set automatically when a task first moves to "In Progress"
- **`actualEnd`** — ISO timestamp set automatically when a task moves to "Completed"
- **`isBlocked`** — boolean; when `true`, the task elapsed clock pauses. Toggling off resumes. A "blocked minutes" counter accumulates for reporting.
- **`deviationMinutes`** — persisted integer (`actualEnd - estimatedEnd` in minutes); negative = early, positive = overrun. Replaces the on-the-fly calculation so it survives a page reload.

The existing deviation display in task rows (`+Xm` / `-Xm early`) continues to work but now reads from the persisted field when available.

**Implementation**
- `dashboard/actions/tasks.js` → `setTaskStatus()`
  - On transition to `"In Progress"`: set `task.actualStart = new Date().toISOString()` if not already set
  - On transition to `"Completed"`: set `task.actualEnd = new Date().toISOString()`; calculate and persist `task.deviationMinutes`
- `dashboard/actions/tasks.js` — add `toggleTaskBlocked(cat, idx)` function that flips `task.isBlocked` and patches the UI badge
- `dashboard/render/categories.js` — show a ⏸ badge on blocked tasks; update deviation display to prefer `task.deviationMinutes` over live calculation
- `dashboard/export/shared.js` — include `actualStart`, `actualEnd`, `deviationMinutes`, `isBlocked` in CSV/Excel export rows (feeds roadmap items 1.5 and 1.6)
- No schema migration needed — fields are additive and undefined-safe

---

### E3 · Reset Category to Default State
**Value:** 🔴 · **Effort:** ⚙️

**Refined description**  
During a live event a team might accidentally bulk-complete tasks, or need to re-run a category from scratch. A "Reset Category" action restores all tasks in that category to their original state from the loaded runbook, clearing `status`, `actualStart`, `actualEnd`, `deviationMinutes`, `isBlocked`, and any in-session comments.

A confirmation dialog ("Reset 12 tasks in DB Migration back to Not Started?") prevents accidental resets.

**Implementation**
- `dashboard/persistence.js` — at load time, deep-clone the original runbook into `state.originalRunbook` (before any draft is applied). This is the source of truth for resets.
- `dashboard/actions/tasks.js` — add `resetCategory(catKey)` function: copies tasks from `state.originalRunbook[catKey]` back into `state.runbookData[catKey]`, then calls `renderCategory(catKey)`
- `dashboard/render/categories.js` — add a "Reset" icon button (↺) to each category header, visible on hover. On click, show a `confirm()` dialog before calling `resetCategory()`
- `dashboard/actions/tasks.js` — hook `saveDraft()` call at the end so the reset is persisted immediately

---

### E6 · Edit Config.json from the UI
**Value:** 🟡 · **Effort:** ⚙️

**Refined description**  
Non-technical users currently must open a terminal to change `config.json`. Expose an in-app editor:

- **Dashboard**: Settings menu → "Edit Config" opens a modal with a `<textarea>` pre-filled with the current `config.json` content. On Save, validate JSON, write file via the Electron IPC bridge, and hot-reload the config without a full page refresh.
- **Welcome screen**: Each client card gets a ⚙ icon that opens the same modal for that client's `config.json`.

**Implementation**
- `electron-main.js` — add two IPC handlers: `read-config-file(path)` and `write-config-file(path, content)` (validate it's within the app data directory to prevent path traversal)
- `dashboard/app.js` — add `openConfigEditor()` that calls `read-config-file`, populates a modal textarea, and on confirm calls `write-config-file` then `loadConfig()`
- `runbookDashboard.html` — add a "Edit Config" item to the settings dropdown; add the modal HTML
- `welcome.html` — add a ⚙ icon to each recent client card; similar open/save/reload flow

---

### E7 · Edit Recent Client Entries (Name, Logo) from Welcome Page
**Value:** 🟡 · **Effort:** ⚙️

**Refined description**  
When a client is renamed or rebranded, users currently have to manually edit files. An "Edit" action on recent client cards should let users update the display name and swap the logo image.

**Implementation**
- `welcome.html` — add an Edit (✏) icon that appears on hover over each recent client card
- On click: open a modal with two inputs — a text field for the client name and a file picker for the logo. Pre-fill both from the stored client data.
- On save: write the updated name and logo path back into the client's `config.json` (via Electron IPC `write-config-file`); update the card DOM inline without full reload
- `electron-main.js` — reuse the `write-config-file` IPC handler from E6

---

## Phase C — Deferred / Nice-to-Have

### E8 · Drag-and-Drop Folder onto Welcome Page
**Value:** 🟢 · **Effort:** ⚙️

**Refined description**  
Allow users to drag a client folder from Finder/Explorer directly onto the welcome page instead of using the folder picker button. Validate that the dropped item is a directory containing a `config.json` before loading it.

**Implementation**
- `welcome.html` — add `dragover` / `drop` event listeners on the main drop zone
- In the `drop` handler, use Electron's `webUtils.getPathForFile()` (Electron 26+) to get the folder path, then call the existing `loadClientFolder(path)` flow
- Show a visual drop target overlay while dragging

---

### E9 · Auto-Update Phase Timeline Date Distribution
**Value:** 🟢 · **Effort:** 🔧

**Refined description**  
When a runbook's overall date range is extended or shortened, all category phase dates should scale proportionally rather than requiring manual edits to each category.

**Needs more spec before implementation** — open questions:
- Triggered manually (button) or automatically on date change?
- Proportional scaling vs equal distribution?
- Should it preserve relative gaps between phases?

Defer until the requirement is better defined.

---

### E10 · Auto-Refresh Dashboard When Client Folder Changes on Disk
**Value:** 🟢 · **Effort:** 🔧

**Refined description**  
Use a file system watcher (`chokidar` or Node.js `fs.watch`) in the Electron main process to detect changes to the client folder. On change, send an IPC event to the renderer to soft-reload the runbook data.

**Concerns to address before implementing:**
- Performance: watch granularity (watch individual files vs whole folder)
- Loop risk: saving from the dashboard triggers a reload which triggers another save
- Setting: `"autoRefresh": false` in `dashboard-config.json` to opt out

**Implementation sketch** (when ready)
- `electron-main.js` — start a `chokidar.watch()` on the client folder path when a client is loaded; send `runbook-file-changed` IPC message to renderer on `change` events, debounced to 2 s
- `dashboard/app.js` — listen for `runbook-file-changed`; call `loadRunbook()` but skip if `state.timerState === "running"` (don't interrupt a live event)

---

## Implementation Order Summary

```
Phase A — Quick Wins (can be done in a single session)
  E1  Runbook timer auto-start          🔴 ⚡
  E4  Theme persistence                 🟡 ⚡
  E5  Split export button               🟡 ⚡

Phase B — Core Enhancements (one feature per session)
  E2  Task time tracking                🔴 ⚙️  ← do first; unlocks reporting accuracy
  E3  Reset category to default         🔴 ⚙️
  E6  Edit config.json from UI          🟡 ⚙️  ← share IPC work with E7
  E7  Edit recent client entries        🟡 ⚙️

Phase C — Deferred
  E8  Drag-and-drop folder              🟢 ⚙️
  E9  Phase timeline auto-update        🟢 🔧  (needs spec first)
  E10 Auto-refresh on file change       🟢 🔧  (needs perf analysis first)
```
