**Backlog**
This is the safest concrete implementation backlog to get from the current monolith in runbookDashboard.html to a maintainable structure without changing the UI, exports, or runbook format. It is sequenced so each phase leaves the dashboard working.

**Phase 0** ✅
Stabilize the current contract before moving code.

1. ~~runbookDashboard.html: Add a short architecture banner comment at the top of the script section describing the intended module split, the persistence policy, and the rule that the UI must stay visually unchanged during refactor.~~ ✅
2. ~~runbookDashboard.html: Inventory all status strings, health labels, reserved keys, and export filter values currently in use; mark every duplicate for extraction.~~ ✅
3. ~~runbookDashboard.html: Define the source-of-truth policy in code comments next to the initial load path so future refactor work does not drift.~~ ✅
4. ~~schema.py: Confirm the browser validation scope should mirror this file exactly for required fields and root structure; keep this file as the authoritative schema reference for runbook shape.~~ ✅

Definition of done:
- ~~one documented contract for status names, reserved keys, and persistence behavior~~ ✅
- ~~no functional changes yet~~ ✅

**Phase 1** ✅
Create the shared module skeleton and move constants/state first.

1. ~~Create dashboard/constants.js: Extract canonical status values, status display labels, health labels, reserved keys, filter option values, default project config, and export mode values.~~ ✅
2. ~~Create dashboard/state.js: Move all mutable globals from runbookDashboard.html into a single exported state object, including runbook data, issues, filters, sorting, open categories, health state, issue form state, and export filter state.~~ ✅
3. ~~Create dashboard/dom.js: Centralize repeated DOM lookups such as container nodes, summary box, timeline, toast, file input, and header elements.~~ ✅
4. ~~Update runbookDashboard.html: Replace loose top-level variables with imports from the new state and constants modules.~~ ✅ (216 global→state.* replacements)
5. ~~Update runbookDashboard.html: Convert the bootstrap sequence so the HTML file becomes an entry point that wires modules together instead of owning all logic.~~ ✅ (script type="module" + window re-exports for onclick handlers)

Definition of done:
- ~~one state container~~ ✅
- ~~one constants module~~ ✅
- ~~no change in rendering or behavior~~ ✅

Estimated effort:
- 0.5 to 1 day

**Phase 2** ✅
Extract pure selectors and normalization logic.

1. ~~Create dashboard/selectors.js: Move normalizeStatus from runbookDashboard.html and keep one canonical mapping for internal values.~~ ✅
2. ~~Create dashboard/selectors.js: Move statusClass, computeCategoryStatus, getGlobalStats, getEarliestTime, getUniqueTeams, matchesSearch, matchesTeam, and sortCategories out of runbookDashboard.html.~~ ✅ (also moved formatTime, formatTimeShort, escapeHtml, getCategoryNames)
3. ~~Create dashboard/selectors.js: Add derived helpers such as getOpenIssues, getClosedIssues, getBlockingIssues, getActiveAssignees, getVisibleCategories, getVisibleTasks, and getCompletionPct.~~ ✅ (getOpenIssues, getClosedIssues, getBlockingIssues, getCompletionPct added)
4. ~~Update runbookDashboard.html: Make global stats rendering consume selectors rather than recomputing counts inline.~~ ✅ (renderGlobalStats now uses getCompletionPct(), getOpenIssues(), getBlockingIssues())
5. ~~Update runbookDashboard.html: Make the main render path consume a single derived dashboard model instead of mixing filtering, sorting, and markup assembly in the same function.~~ ✅ (render() now uses getCategoryNames() via sortCategories; full view-model pattern deferred to Phase 5)

Definition of done:
- ~~one place for status normalization~~ ✅
- ~~dashboard, summary, and exports can share the same derived counts~~ ✅
- Blocking vs Blocked display drift is controlled centrally ← Phase 8

Estimated effort:
- 1 day

**Phase 3** ✅
Separate persistence and load flows.

1. ~~Create dashboard/persistence.js: Extract loadInitialRunbook from runbookDashboard.html with explicit precedence rules for browser draft versus server file.~~ ✅
2. ~~Create dashboard/persistence.js: Extract saveDraft from runbookDashboard.html so localStorage save and file download are clearly separated but still triggered together if that remains the chosen behavior.~~ ✅
3. ~~Create dashboard/persistence.js: Extract exportRunbookJson from runbookDashboard.html so file export is isolated from UI concerns.~~ ✅
4. ~~Create dashboard/persistence.js: Extract loadFromServer from runbookDashboard.html.~~ ✅
5. ~~Create dashboard/persistence.js: Extract loadFromFile from runbookDashboard.html.~~ ✅
6. ~~Create dashboard/persistence.js: Extract resetRunbook from runbookDashboard.html.~~ ✅
7. ~~Update runbookDashboard.html: Keep button handlers, but make them call persistence functions instead of inline logic.~~ ✅ (loadRunbook→loadInitialRunbook, saveToLocalStorage→saveDraft, exportJSON→exportRunbookJson, reloadRunbookJSON→loadFromServer, handleRunbookFileSelected→loadFromFile, resetRunbook→doReset)

Definition of done:
- every load/save/reset path goes through one persistence layer
- startup and manual reload behavior are predictable
- `_issues` and `_health` are always persisted consistently

Estimated effort:
- 0.5 to 1 day

**Phase 4** ✅
Add browser-side validation aligned with the Python schema.

1. ~~Create dashboard/validation.js: Mirror the structural checks from schema.py for root object, category arrays, and required task and status fields.~~ ✅
2. ~~Create dashboard/validation.js: Add normalization helpers for optional fields such as item, assignee, startTime, and endTime so the UI always receives a stable shape.~~ ✅
3. ~~Create dashboard/validation.js: Add user-facing error formatting that turns raw validation errors into short toast-friendly messages.~~ ✅
4. ~~Update runbookDashboard.html: Replace the loose object check in applyLoadedRunbook with validate then normalize then apply.~~ ✅ (applyLoadedRunbook in persistence.js now calls validateAndNormalize)
5. ~~Update runbookDashboard.html: Make both reload-from-server and load-from-file pass through the same validation and normalization path.~~ ✅ (loadInitialRunbook, loadFromServer, loadFromFile all route through applyLoadedRunbook → validateAndNormalize)

Definition of done:
- invalid JSON cannot reach render
- browser behavior matches the schema contract in schema.py
- users get actionable load errors instead of silent breakage

Estimated effort:
- 0.5 day

**Phase 5** ✅
Split the main DOM renderer into focused modules.

1. ~~Create dashboard/render/stats.js: Move renderGlobalStats from runbookDashboard.html into a pure renderer that accepts a derived stats model.~~ ✅ (also includes renderHealthIndicator)
2. ~~Create dashboard/render/timeline.js: Move renderTimeline from runbookDashboard.html and make it depend only on visible categories and selector output.~~ ✅ (accepts renderAll callback for click-to-expand)
3. ~~Create dashboard/render/categories.js: Move the category card and task row rendering logic from runbookDashboard.html into isolated functions for category header, progress bar, task row, status popup, and assignee editor markup.~~ ✅ (accepts renderAll + showToast callbacks)
4. ~~Create dashboard/render/issues.js: Move renderIssues from runbookDashboard.html into its own renderer with a small API for form state and issue collections.~~ ✅ (also exports toggleIssueForm, saveIssue, closeIssue, reopenIssue, editIssue, deleteIssue)
5. ~~Create dashboard/render/summary.js: Move generateSummary and copySummaryToClipboard from runbookDashboard.html into a summary renderer plus clipboard helper.~~ ✅
6. ~~Update runbookDashboard.html: Replace the monolithic render function with a coordinator that calls renderStats, renderIssues, renderTimeline, and renderCategories in order.~~ ✅ (render() is now 6 lines: stats → issues → teamFilter → timeline → categories)

Definition of done:
- each visual surface has one renderer file
- render coordinator becomes short and readable
- DOM rendering no longer owns business rules

Estimated effort:
- 1.5 to 2 days

**Phase 6** ✅
Isolate issue actions and task actions from rendering.

1. ~~Create dashboard/actions/tasks.js: Move task status updates, bulk-complete logic, assignee editing commit logic, expandAll, and collapseAll out of runbookDashboard.html and runbookDashboard.html.~~ ✅ (setTaskStatus, completeAllInCategory, setAssignee, expandAll, collapseAll, toggleCategory)
2. ~~Create dashboard/actions/issues.js: Move toggleIssueForm, saveIssue, closeIssue, reopenIssue, editIssue, and deleteIssue out of runbookDashboard.html.~~ ✅ (also toggleIssuesPanel, getDefaultIssueTime; saveIssue accepts field object and returns {ok, reason})
3. ~~Create dashboard/actions/health.js: Move setHealth and health-related state updates out of runbookDashboard.html.~~ ✅
4. ~~Update runbookDashboard.html: Keep only top-level event registration in the entry file.~~ ✅ (thin wrappers call action → then renderer → then toast)

Definition of done:
- ~~user actions are separated from markup generation~~ ✅
- ~~renderers render, actions mutate state, selectors derive data~~ ✅

Estimated effort:
- 1 day

**Phase 7** ✅
Extract shared export data and canvas helpers before touching visuals.

1. ~~Create dashboard/export/shared.js: Centralize shared export selectors for project title, timestamp, health metadata, stats, visible categories, active assignees, and issue lists.~~ ✅
2. ~~Create dashboard/export/canvas.js: Move repeated canvas helpers such as drawText, drawRoundRect, gradient helpers, logo draw helpers, and resize-if-overflow logic from runbookDashboard.html.~~ ✅
3. ~~Create dashboard/export/theme.js: Centralize export color maps for phone, email, and gantt surfaces so health/status colors are defined once.~~ ✅
4. ~~Create dashboard/export/phone.js: Refactor phone export to consume shared export data and shared canvas helpers without changing layout.~~ ✅
5. ~~Create dashboard/export/email.js: Refactor email export to consume the same shared export data.~~ ✅
6. ~~Create dashboard/export/gantt.js: Refactor gantt export to consume the same shared time bounds and category status model.~~ ✅
7. ~~Update runbookDashboard.html: Replace ~930 lines of inline export code with 3-line delegations importing from the new modules.~~ ✅

Definition of done:
- ~~exports still look the same~~ ✅
- ~~counts and labels match the main dashboard exactly~~ ✅
- ~~export-specific code is mostly drawing, not business logic~~ ✅

**Phase 8** ✅
Normalize naming and remove drift.

1. ~~Extend dashboard/constants.js: Add `statusLabel()` helper, `ISSUE_STATUS` (Ongoing/Closed), `ISSUE_SEVERITY` (Blocking/Non-Blocking), `CATEGORY_STATUS` (CSS-friendly keys), and `CATEGORY_STATUS_LABEL` (uppercase display text for summary/exports).~~ ✅
2. ~~Update runbookDashboard.html: Change filter button label from "Blocking" to "Blocked" to match STATUS_LABELS.~~ ✅
3. ~~Update all JS modules: Replace every hard-coded status/severity/issue-status string with imports from constants.js across selectors.js, render/stats.js, render/timeline.js, render/categories.js, render/issues.js, render/summary.js, actions/tasks.js, actions/issues.js, persistence.js, export/shared.js, export/phone.js, export/email.js, export/gantt.js, export/theme.js (16 files total).~~ ✅
4. ~~Review CSS variables: Audited all `:root` vs `[data-theme="light"]` definitions — all duplicates are intentional theme overrides. No collapsible redundancy found.~~ ✅

Definition of done:
- ~~one internal term for data~~ ✅ (STATUS, ISSUE_STATUS, ISSUE_SEVERITY in constants.js)
- ~~one display-label map for UI~~ ✅ (STATUS_LABELS + statusLabel() + CATEGORY_STATUS_LABEL)
- ~~no more mixed wording across filter buttons, stats, issues, summary, and exports~~ ✅

**Phase 9** ✅
Trim the HTML file down to shell plus entry wiring.

1. ~~Update runbookDashboard.html: Keep only markup, CSS, and minimal import/bootstrap code.~~ ✅
2. ~~Update runbookDashboard.html: Remove migrated logic in slices, verifying the page still runs after each extraction rather than deleting everything in one pass.~~ ✅
3. ~~Keep runbookDashboard.html as the stable DOM shell for operational usage so user workflows do not change.~~ ✅

Created dashboard/app.js (~260 lines) with all application logic:
- Config loading, theme, clock, toast, render orchestrator
- All action wrappers (save, reset, expand/collapse, issues, summary, exports)
- Export modal dialog
- Asset detection (logo, background)
- Static event binding via addEventListener (replaces 16 inline onclick/onchange attributes)
- Window exposure for dynamic onclick in renderers (issues.js, summary.js)

HTML changes:
- Replaced 16 inline onclick/onchange attributes with data-action attributes
- Replaced ~350-line inline `<script>` block with single `<script type="module" src="./dashboard/app.js">`
- HTML file reduced from ~1589 lines to ~1167 lines (pure markup + CSS shell)

Definition of done:
- ~~the HTML file becomes the page shell~~ ✅
- ~~app logic lives in modules~~ ✅
- ~~future features can be added without editing a 3000-line script block~~ ✅

Estimated effort:
- 0.5 day

**Phase 10**
Add test infrastructure and initial unit test coverage.

1. Initialize npm project and install Vitest + happy-dom as dev dependencies. Add `"test"` script to package.json.
2. Create vitest.config.js with happy-dom environment so tests get a lightweight DOM without a real browser.
3. Create tests/validation.test.js: Test validate() rejects non-objects, missing required fields, non-array categories; test normalize() fills null/undefined optional fields; test formatErrors() truncation logic; test validateAndNormalize() end-to-end with valid and invalid payloads.
4. Create tests/selectors.test.js: Test normalizeStatus() canonical mapping and unknown-status passthrough; test computeCategoryStatus() for all status combinations; test getGlobalStats() counts; test getOpenIssues(), getBlockingIssues(), getCompletionPct() against a seeded state; test sortCategories() for each sort mode; test matchesSearch() and matchesTeam() filtering; test escapeHtml() against XSS vectors.
5. Create tests/constants.test.js: Assert STATUS values match the keys in STATUS_LABELS; assert HEALTH_META covers all HEALTH_STATUSES; assert RESERVED_KEYS values start with underscore. These are contract guards, not logic tests.
6. Create tests/persistence.test.js: Mock fetch and localStorage; test loadInitialRunbook() prefers localStorage draft over server fetch; test loadInitialRunbook() falls through to fetch on corrupt localStorage; test saveDraft() writes to localStorage and triggers download; test resetRunbook() clears state and localStorage; test applyLoadedRunbook() rejects invalid JSON via validation.
7. Create tests/state.test.js: Test initial state shape has all expected keys; test that mutating state is reflected in selector output (integration smoke test).
8. Add tests for any render, actions, or export modules that exist by this phase — at minimum verify they export the expected functions and don't throw on basic input.

Definition of done:
- `npm test` runs all suites from the command line
- pure modules (validation, selectors, constants) have full coverage
- persistence has coverage for all load/save/reset paths with mocked browser APIs
- CI-ready: no browser required, no network required
- test failures surface as actionable messages, not generic assertion dumps

Estimated effort:
- 1 to 1.5 days

**File-By-File Deliverables**
This is the concrete file creation and ownership map.

1. dashboard/constants.js: statuses, labels, health metadata, reserved keys, defaults.
2. dashboard/state.js: central mutable state object and reset helpers for ephemeral UI state.
3. dashboard/dom.js: element lookups and tiny DOM helper utilities.
4. dashboard/selectors.js: all pure derived-data and normalization functions.
5. dashboard/validation.js: browser validation mirroring schema.py.
6. dashboard/persistence.js: load, save, reset, reload, import, export.
7. dashboard/actions/tasks.js: task mutation logic.
8. dashboard/actions/issues.js: issue mutation logic.
9. dashboard/actions/health.js: health updates and any health-related side effects.
10. dashboard/render/stats.js: global stats markup.
11. dashboard/render/timeline.js: phase timeline markup.
12. dashboard/render/categories.js: category cards, task rows, status popup, assignee editor.
13. dashboard/render/issues.js: issues panel and issue form markup.
14. dashboard/render/summary.js: HTML summary generation and clipboard flow.
15. dashboard/export/shared.js: export view models and cross-export selectors.
16. dashboard/export/canvas.js: generic canvas drawing helpers.
17. dashboard/export/theme.js: color maps and health gradients.
18. dashboard/export/phone.js: phone image renderer.
19. dashboard/export/email.js: email image renderer.
20. dashboard/export/gantt.js: gantt renderer.
21. runbookDashboard.html: final entry point and shell.
22. schema.py: unchanged authority for schema, but referenced by validation documentation and parity checks.
23. vitest.config.js: test runner configuration with happy-dom environment.
24. tests/validation.test.js: schema validation and normalization tests.
25. tests/selectors.test.js: selector logic, filtering, sorting, and derived-data tests.
26. tests/constants.test.js: contract guards for status/health/reserved-key consistency.
27. tests/persistence.test.js: load/save/reset flows with mocked fetch and localStorage.
28. tests/state.test.js: state shape and mutation smoke tests.

**Recommended Ticket Breakdown**
If you want to manage this as work items, this is the cleanest split.

1. Ticket 1: Extract constants and shared state.
2. Ticket 2: Extract selectors and normalized status handling.
3. Ticket 3: Consolidate persistence and load flows.
4. Ticket 4: Add browser-side runbook validation.
5. Ticket 5: Extract stats, timeline, and categories renderers.
6. Ticket 6: Extract issues and summary renderers.
7. Ticket 7: Extract task and issue actions.
8. Ticket 8: Refactor phone and email exports onto shared data.
9. Ticket 9: Refactor gantt export onto shared data.
10. Ticket 10: Final naming cleanup and monolith reduction.
11. Ticket 11: Test infrastructure and initial unit test coverage.

**Suggested Order If You Want Fast Value**
Do these first because they reduce breakage risk immediately:

1. constants.js
2. state.js
3. selectors.js
4. persistence.js
5. validation.js

Then move rendering and exports.

**Risk Notes**
The highest-risk files during implementation will be:
- runbookDashboard.html, because render and event binding are intertwined
- runbookDashboard.html, runbookDashboard.html, and runbookDashboard.html, because export layouts are large and visually sensitive

The lowest-risk starting point is:
- runbookDashboard.html, because that area is mostly state, config, normalization, loading, and selectors

**Effort**
A realistic implementation estimate for one person moving carefully is 7 to 10.5 working days, with the first meaningful maintainability win after 2 days.

If you want, I can turn this next into a sprint-ready checklist with exact acceptance criteria per ticket and a recommended commit sequence.