Compacted conversationI’m turning the architecture review into a concrete staged refactor plan, anchored to the current dashboard file so the steps map cleanly onto what exists today.Optimizing tool selection...

Searched for regex `function loadRunbook|function renderGlobalStats|function render\(|function renderIssues|function generateSummary|function exportSnapshot|function exportEmailSnapshot|function exportGantt|function applyLoadedRunbook|function normalizeStatus|function getGlobalStats` (`**/runbookDashboard.html`), 11 results

Searched for regex `let runbookData|let filterState|let issues =|let healthStatus` (`**/runbookDashboard.html`), 4 results

Searched for regex `localStorage.getItem\("runbook_progress"\)|localStorage.setItem\("runbook_progress"\)|fetch\("runbook.json|handleRunbookFileSelected|reloadRunbookJSON` (`**/runbookDashboard.html`), 7 results

I have the key anchors now: state is global, persistence is split across three load paths, and render/export logic sits in separate large functions. I’m checking the schema file once so the plan includes validation, not just code organization.

Searched for regex `RUNBOOK_SCHEMA|def validate\(|def validate_file\(` (`**/adapter/schema.py`), 3 results

Searched for regex `Blocking|Blocked` (`**/runbookDashboard.html`), 40 results

I’ve confirmed the schema entry points and the naming drift around Blocking/Blocked. One quick read of the schema is enough to fold validation into the plan without speculating.

Read [](file:///d%3A/OneDrive%20-%20Murex/Documents/CDS/01.Projects/18_LLOYDS/05_Production/FERMAT/adapter/schema.py)

Refactor this incrementally, not as a rewrite.

The current fault lines are clear in runbookDashboard.html, runbookDashboard.html, runbookDashboard.html, runbookDashboard.html, runbookDashboard.html, runbookDashboard.html, runbookDashboard.html, and runbookDashboard.html:
- global mutable state
- mixed persistence rules
- one large DOM renderer
- separate export renderers duplicating business rules
- inconsistent Blocking vs Blocked terminology
- minimal validation on imported JSON despite schema.py

**Target State**
Keep the same UI, same behaviors, same JSON shape, but move toward this structure:

```text
runbookDashboard.html
assets/
dashboard/
  constants.js
  state.js
  selectors.js
  validation.js
  persistence.js
  render/
    stats.js
    timeline.js
    categories.js
    issues.js
    summary.js
  export/
    shared.js
    phone.js
    email.js
    gantt.js
  app.js
```

You do not need to get there in one jump. The safest plan is 5 phases.

**Phase 1**
Centralize state and constants first.

Why:
- Your globals are scattered from runbookDashboard.html through runbookDashboard.html
- status labels, colors, and filters are duplicated in many places
- this is the lowest-risk change with the highest future payoff

What to extract:
- app state object
- reserved key names: `_issues`, `_health`
- canonical statuses
- health labels/colors
- export filter defaults
- UI flags like `issueFormOpen`, `issuesPanelOpen`, `editingIssueId`

What the API should look like:
```js
const STATUS = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocking",
  COMPLETED: "Completed",
  UNNEEDED: "Unneeded"
};

const state = {
  runbookData: {},
  issues: [],
  healthStatus: "Green",
  filterState: "all",
  searchQuery: "",
  teamFilter: "all",
  sortMode: "timeline",
  openCategories: new Set(),
  issueFormOpen: false,
  issuesPanelOpen: true,
  editingIssueId: null,
  phoneExportIssueFilter: "open",
  emailExportIssueFilter: "open"
};
```

Acceptance criteria:
- no visual change
- no behavior change
- one canonical source for status names and health labels
- all functions read from one state object instead of loose globals

**Phase 2**
Separate pure business logic from DOM rendering.

Why:
- functions like runbookDashboard.html, runbookDashboard.html, category status logic, team extraction, sorting, and search/filtering are already close to pure helpers
- these should become stable building blocks used by both the dashboard and exports

Move into `selectors.js`:
- normalize status
- compute status class
- compute category status
- global stats
- category progress
- visible categories
- visible tasks per category
- open/closed/blocking issue counts
- active assignees
- timeline ordering

Add one derived model per surface:
```js
getDashboardViewModel(state)
getSummaryViewModel(state)
getExportViewModel(state)
```

Why this matters:
- today the same rules are recalculated differently in render, phone export, email export, and gantt export
- that is where regressions come from

Acceptance criteria:
- renderers stop deciding business rules
- exports use the same counts and status decisions as the main UI
- a terminology change like Blocking → Blocked becomes one change, not many

**Phase 3**
Fix persistence and loading policy before further features.

This is the most important correctness issue.

Current split:
- startup prefers `localStorage` in runbookDashboard.html
- server reload uses runbookDashboard.html
- local file import uses runbookDashboard.html
- save writes both browser storage and a downloaded file in runbookDashboard.html

That is workable operationally, but ambiguous.

Define a clear source-of-truth policy:
- runbook.json is the baseline template
- `localStorage` is the working draft for browser continuity
- imported local JSON becomes the active in-memory working draft
- reload from server explicitly replaces current in-memory data
- save persists working draft to localStorage and downloads a file snapshot

Recommended UX rule:
- show one small source label in memory only, for example:
  - `Loaded from browser draft`
  - `Loaded from runbook.json`
  - `Loaded from local file`
- no visual redesign needed, just clarity

Create `persistence.js` with:
- `loadInitialRunbook()`
- `loadFromServer()`
- `loadFromFile(file)`
- `saveDraft()`
- `exportRunbookJson()`
- `resetRunbook()`

Acceptance criteria:
- every load path returns the same normalized state shape
- every save path persists `_issues` and `_health` consistently
- refresh behavior is predictable

**Phase 4**
Add browser-side validation aligned with schema.py.

Why:
- `applyLoadedRunbook()` in runbookDashboard.html only checks “object or not”
- imported JSON can silently break later render paths
- you already have the backend validation contract in schema.py

Implement a lightweight frontend mirror:
- root must be an object
- non-underscore keys must be arrays
- each task must have `task` and `status`
- optional fields: `item`, `assignee`, `startTime`, `endTime`
- reserved keys remain free-form but normalized

Recommended flow:
- `parseJson`
- `validateShape`
- `normalizeData`
- `applyLoadedRunbook`

Return user-friendly messages such as:
- `Category "Payments" must be an array`
- `"Cutover[3]" is missing required field "task"`

Acceptance criteria:
- no invalid file reaches `render()`
- load failures tell the user what is wrong
- frontend and adapter validation stay aligned

**Phase 5**
Split rendering by surface, then consolidate export logic.

Current split:
- main dashboard render: runbookDashboard.html
- issues render: runbookDashboard.html
- summary render: runbookDashboard.html
- phone export: runbookDashboard.html
- email export: runbookDashboard.html
- gantt export: runbookDashboard.html

Recommended order:
1. extract `renderGlobalStats`
2. extract `renderTimeline`
3. extract `renderCategories`
4. extract `renderIssues`
5. extract `renderSummary`
6. only then refactor exports

Why this order:
- the DOM renderer changes more often than the exports
- exports are large, but stable if the shared selectors exist first

For exports, do not try to share drawing code too early. Share data first:
- shared stats model
- shared issue list selection
- shared health badge config
- shared category progress model
- shared assignee model

Then optionally share canvas helpers:
- `drawText`
- `drawRoundRect`
- color maps
- health gradients
- footer/header builders

Acceptance criteria:
- changing a stat rule affects dashboard, summary, and exports consistently
- export files remain pixel-equivalent or near-equivalent to current output
- renderer files become smaller and testable by inspection

**Naming Cleanup**
Do this early, but carefully.

You currently mix `Blocking` and `Blocked` in both styles and UI strings, visible around runbookDashboard.html and throughout the CSS/status classes.

Recommendation:
- keep data canonical as `Blocking` for compatibility with existing JSON
- expose `Blocked` only as the user-facing label where desired
- centralize the display label mapping

Example:
```js
const STATUS_LABELS = {
  "Not Started": "Not Started",
  "In Progress": "In Progress",
  "Completed": "Completed",
  "Blocking": "Blocked",
  "Unneeded": "Unneeded"
};
```

That avoids breaking existing files while removing drift from the UI.

**What Not To Refactor Yet**
To preserve the exact look and feel, do not start with:
- CSS redesign
- HTML structure rewrite
- framework migration
- converting everything to classes
- rewriting all event handling at once

Those are high-risk and not necessary.

**Suggested Execution Order**
If you want the safest implementation sequence, do it in this exact order:

1. Extract constants and state container
2. Extract selectors and derived-data helpers
3. Centralize load/save/reset/import logic
4. Add validation before apply
5. Split main render into smaller render functions
6. Make summary consume shared selectors
7. Make phone/email/gantt exports consume shared selectors
8. Remove duplicated status/health/color maps

**Definition Of Done**
You can consider the refactor successful when:
- the HTML looks identical
- all buttons behave the same
- save/load/reload/import rules are explicit and stable
- one change to status logic updates every surface
- the main file becomes an entry point, not the whole application
- adding a new feature no longer requires touching five unrelated sections

**Best First Refactor**
If you want one concrete next step, start with this:
- extract `state`
- extract `STATUS`, `STATUS_LABELS`, `HEALTH_META`
- move `normalizeStatus`, `statusClass`, `computeCategoryStatus`, `getGlobalStats`, `sortCategories`, `getUniqueTeams` into shared helpers
- make runbookDashboard.html, runbookDashboard.html, runbookDashboard.html, runbookDashboard.html, and runbookDashboard.html consume those helpers

That gives you the most leverage with the least UI risk.

If you want, I can next turn this into a concrete implementation backlog with file-by-file tasks and estimated effort, or I can review a proposed module split before you start coding.