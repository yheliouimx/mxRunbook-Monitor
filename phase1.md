# Phase 1 — Extract Constants & State

**Backlog reference:** Phase 1 items 1–5
**Pre-requisite:** Phase 0 complete ✅ (architecture banner, EXTRACT markers, persistence policy comment added)
**Goal:** Zero behavior change. Zero visual change. One constants module. One state object. Dashboard still loads and runs identically.

---

## Context

**File:** `runbookDashboard.html`  
**Line count after Phase 0:** 3011  
**Script block starts:** line 1214  
**Bootstrap (last line of script):** `loadConfig().then(() => { detectAssets(); loadRunbook(); });`  
**Server:** Python `http.server` — ES modules (`type="module"`) work fine.

---

## All Globals to Move

### Group A — loose globals at lines 1262–1281 (move to `dashboard/state.js`)

| Line | Variable | Default |
|------|----------|---------|
| 1262 | `let runbookData` | `{}` |
| 1263–1271 | `let projectConfig` | `{ projectName, subtitle, changeRef, client, environment, release, accentColor }` |
| 1272 | `let filterState` | `"all"` |
| 1273 | `let searchQuery` | `""` |
| 1274 | `let teamFilter` | `"all"` |
| 1275 | `let sortMode` | `"timeline"` |
| 1276 | `let openCategories` | `new Set()` |
| 1277 | `let issues` | `[]` |
| 1278 | `let issueFormOpen` | `false` |
| 1279 | `let issuesPanelOpen` | `true` |
| 1280 | `let editingIssueId` | `null` |
| 1281 | `let healthStatus` | `"Green"` |

### Group B — export filter globals at lines 2140–2141 (move to `dashboard/state.js`)

| Line | Variable | Default |
|------|----------|---------|
| 2140 | `let phoneExportIssueFilter` | `"open"` |
| 2141 | `let emailExportIssueFilter` | `"open"` |

### Group C — asset image globals at lines 3211–3212 (move to `dashboard/state.js`)

| Line | Variable | Default |
|------|----------|---------|
| 3211 | `let clientLogoImg` | `null` |
| 3212 | `let clientBgImg` | `null` |

---

## Constants to Extract

All go into `dashboard/constants.js`:

```js
// STATUS — internal data values, must match runbook.json
export const STATUS = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS:  "In Progress",
  COMPLETED:    "Completed",
  BLOCKING:     "Blocking",
  UNNEEDED:     "Unneeded",
};

// STATUS_LABELS — what the UI shows (Blocking → "Blocked" in display)
export const STATUS_LABELS = {
  "Not Started": "Not Started",
  "In Progress": "In Progress",
  "Completed":   "Completed",
  "Blocking":    "Blocked",
  "Unneeded":    "Unneeded",
};

// HEALTH_META — labels used in renderHealthIndicator(), export* (3 duplicates today)
export const HEALTH_META = {
  Green: { label: "ON TRACK", color: "#39ff14", bg: "#0a3a0a", border: "#39ff14",
           colorLight: "#2e7d32", bgLight: "#e8f5e9" },
  Amber: { label: "AT RISK",  color: "#ffa500", bg: "#3a2a00", border: "#ffa500",
           colorLight: "#e65100", bgLight: "#fff3e0" },
  Red:   { label: "ROLLBACK", color: "#ff3333", bg: "#3a0a0a", border: "#ff3333",
           colorLight: "#c62828", bgLight: "#ffebee" },
};

// RESERVED_KEYS — never iterated as categories
export const RESERVED_KEYS = {
  issues: "_issues",
  health: "_health",
};

// DEFAULT_PROJECT_CONFIG — matches current inline default in projectConfig
export const DEFAULT_PROJECT_CONFIG = {
  projectName: "Go-Live Runbook",
  subtitle:    "",
  changeRef:   "",
  client:      "",
  environment: "",
  release:     "",
  accentColor: "#003a2d",
};

// SORT_MODES
export const SORT_MODES = {
  TIMELINE:   "timeline",
  COMPLETION: "completion",
  ALPHA:      "alpha",
};

// EXPORT_FILTERS
export const EXPORT_FILTERS = {
  OPEN: "open",
  ALL:  "all",
};

// HEALTH_STATUSES
export const HEALTH_STATUSES = ["Green", "Amber", "Red"];
```

---

## State Object to Create

`dashboard/state.js` — single exported mutable object. All current loose globals become properties:

```js
import { DEFAULT_PROJECT_CONFIG, EXPORT_FILTERS } from "./constants.js";

export const state = {
  // Runbook data
  runbookData:    {},
  projectConfig:  { ...DEFAULT_PROJECT_CONFIG },

  // UI filters
  filterState:    "all",
  searchQuery:    "",
  teamFilter:     "all",
  sortMode:       "timeline",
  openCategories: new Set(),

  // Health & issues
  healthStatus:   "Green",
  issues:         [],

  // Issue form UI state
  issueFormOpen:   false,
  issuesPanelOpen: true,
  editingIssueId:  null,

  // Export options
  phoneExportIssueFilter: EXPORT_FILTERS.OPEN,
  emailExportIssueFilter: EXPORT_FILTERS.OPEN,

  // Assets (set by detectAssets())
  clientLogoImg: null,
  clientBgImg:   null,
};
```

---

## DOM Lookups to Centralise

`dashboard/dom.js` — getters (lazy, called once DOM is ready):

```js
export const dom = {
  container:       () => document.getElementById("container"),
  globalStats:     () => document.getElementById("globalStats"),
  timeline:        () => document.getElementById("timeline"),
  issuesPanel:     () => document.getElementById("issuesPanel"),
  summaryBox:      () => document.getElementById("summaryBox"),
  summaryBody:     () => document.getElementById("summaryBody"),
  toast:           () => document.getElementById("toast"),
  clock:           () => document.getElementById("clock"),
  healthText:      () => document.getElementById("healthText"),
  searchBox:       () => document.getElementById("searchBox"),
  teamFilter:      () => document.getElementById("teamFilter"),
  sortSelect:      () => document.getElementById("sortSelect"),
  runbookFileInput:() => document.getElementById("runbookFileInput"),
  favicon:         () => document.getElementById("favicon"),
  clientLogo:      () => document.getElementById("clientLogo"),
  bgOverlay:       () => document.getElementById("bgOverlay"),
  headerH1:        () => document.querySelector(".header h1"),
  subtitle:        () => document.querySelector(".subtitle"),
};
```

---

## Step-by-Step Implementation Order

### Step 1 — Create `dashboard/constants.js`
- Copy the `const` block above verbatim.
- No changes to `runbookDashboard.html` yet.
- _Verify:_ file exists, no errors.

### Step 2 — Create `dashboard/state.js`
- Copy the `state` object above verbatim.
- No changes to `runbookDashboard.html` yet.
- _Verify:_ file exists, no errors.

### Step 3 — Create `dashboard/dom.js`
- Copy the `dom` object above verbatim.
- No changes to `runbookDashboard.html` yet.
- _Verify:_ file exists, no errors.

### Step 4 — Convert `<script>` to `type="module"` in the HTML
Change line 1214 from:
```html
<script>
```
to:
```html
<script type="module">
```
**Critical:** `type="module"` is required for `import` statements to work.
All existing `window.*` references (onclick="..." in HTML attributes) will break if functions are not re-exported to window. See Step 6.

### Step 5 — Add imports at the top of the script block (after the banner comment, before `let runbookData`)
Insert at line ~1262 (just before `let runbookData = {};`):
```js
import { STATUS, STATUS_LABELS, HEALTH_META, RESERVED_KEYS, DEFAULT_PROJECT_CONFIG, SORT_MODES, EXPORT_FILTERS } from "./dashboard/constants.js";
import { state } from "./dashboard/state.js";
import { dom } from "./dashboard/dom.js";
```

### Step 6 — Replace all 17 loose globals with `state.*` references

Must replace every read and write. The full substitution map:

| Old global | New reference |
|---|---|
| `runbookData` | `state.runbookData` |
| `projectConfig` | `state.projectConfig` |
| `filterState` | `state.filterState` |
| `searchQuery` | `state.searchQuery` |
| `teamFilter` | `state.teamFilter` |
| `sortMode` | `state.sortMode` |
| `openCategories` | `state.openCategories` |
| `issues` | `state.issues` |
| `issueFormOpen` | `state.issueFormOpen` |
| `issuesPanelOpen` | `state.issuesPanelOpen` |
| `editingIssueId` | `state.editingIssueId` |
| `healthStatus` | `state.healthStatus` |
| `phoneExportIssueFilter` | `state.phoneExportIssueFilter` |
| `emailExportIssueFilter` | `state.emailExportIssueFilter` |
| `clientLogoImg` | `state.clientLogoImg` |
| `clientBgImg` | `state.clientBgImg` |

**Counts of each (from grep before Phase 1):**

| Variable | Occurrences |
|---|---|
| `runbookData` | ~45 |
| `issues` | ~30 |
| `healthStatus` | ~18 |
| `projectConfig` | ~14 |
| `filterState` | ~4 |
| `openCategories` | ~5 |
| `issueFormOpen` | ~5 |
| `editingIssueId` | ~6 |
| `sortMode` | ~4 |
| `teamFilter` | ~4 |
| `searchQuery` | ~4 |
| `issuesPanelOpen` | ~3 |
| `clientLogoImg` | ~6 |
| `clientBgImg` | ~6 |
| `phoneExportIssueFilter` | ~3 |
| `emailExportIssueFilter` | ~3 |

### Step 7 — Expose functions used in HTML `onclick` attributes to `window`

ES modules do not pollute global scope. All `onclick="..."` attributes in the HTML need their functions on `window`. Add at the **bottom** of the `<script type="module">` block, before `</script>`:

```js
// Expose to global scope for HTML onclick attributes
// (Phase 9 will move these to addEventListener)
Object.assign(window, {
  toggleTheme, setHealth, showPhoneExportOptions, showEmailExportOptions,
  exportGantt, generateSummary, copySummaryToClipboard,
  saveToLocalStorage, exportJSON, resetRunbook,
  reloadRunbookJSON, triggerFileRunbookLoad, handleRunbookFileSelected,
  expandAll, collapseAll,
  toggleIssueForm, saveIssue, closeIssue, reopenIssue, editIssue, deleteIssue,
});
```

### Step 8 — Remove the now-imported loose globals from the HTML script block
Delete lines 1262–1281 (`let runbookData ... let healthStatus`), lines 2140–2141 (`let phoneExportIssueFilter/emailExportIssueFilter`), and lines 3211–3212 (`let clientLogoImg/clientBgImg`) from the script body — they now live in `state.js`.

### Step 9 — Smoke-test

Open `http://localhost:8000/runbookDashboard.html`, open browser DevTools console:
- No `import` / `module` errors
- No `Uncaught ReferenceError` for any global
- Dashboard renders identically
- Filter buttons work
- Category expand/collapse works
- Health toggle works
- Save button works (check localStorage in DevTools → Application)
- One export (phone image) works

---

## Files Created in Phase 1

| File | Purpose |
|---|---|
| `dashboard/constants.js` | STATUS, STATUS_LABELS, HEALTH_META, RESERVED_KEYS, defaults |
| `dashboard/state.js` | Single mutable state object replacing 17 loose globals |
| `dashboard/dom.js` | Centralised DOM element getters |

## Files Modified in Phase 1

| File | Change |
|---|---|
| `runbookDashboard.html` | `<script>` → `<script type="module">`, add imports, replace ~140 global references with `state.*`, remove deleted globals, add `window.*` re-exports |

---

## Acceptance Criteria (from backlog)

- [ ] One constants module (`dashboard/constants.js`) with no duplicates
- [ ] One state container (`dashboard/state.js`) — no loose mutable globals in HTML
- [ ] No change in rendering
- [ ] No change in behavior
- [ ] No console errors

## Risks & Notes

- **`issues = issues.filter(...)` pattern** — reassignment to `state.issues` must be `state.issues = state.issues.filter(...)`. Grep for `issues =` (assignment, not comparison) to catch these.
- **`new Set()`** — `state.openCategories` is a Set. `openCategories.add(cat)` becomes `state.openCategories.add(cat)`. The `= new Set()` re-assignment in `collapseAll()` becomes `state.openCategories = new Set()`.
- **`projectConfig` spread** — `Object.assign(projectConfig, cfg)` in `loadConfig()` becomes `Object.assign(state.projectConfig, cfg)`.
- **`issues.length = 0`** in `resetRunbook()` — must become `state.issues.length = 0` or `state.issues = []`.
- **ES module scope** — `type="module"` makes the script run deferred automatically. Remove any manual `defer` attribute if present.
- **`initTheme` IIFE** — currently runs inline at script parse time. In a module this still works, but verify it runs before `render()`.
