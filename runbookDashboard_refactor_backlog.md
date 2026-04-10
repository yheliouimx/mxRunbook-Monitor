**Backlog**
This is the safest concrete implementation backlog to get from the current monolith in runbookDashboard.html to a maintainable structure without changing the UI, exports, or runbook format. It is sequenced so each phase leaves the dashboard working.

**Phase 0**
Stabilize the current contract before moving code.

1. runbookDashboard.html: Add a short architecture banner comment at the top of the script section describing the intended module split, the persistence policy, and the rule that the UI must stay visually unchanged during refactor.
2. runbookDashboard.html: Inventory all status strings, health labels, reserved keys, and export filter values currently in use; mark every duplicate for extraction.
3. runbookDashboard.html: Define the source-of-truth policy in code comments next to the initial load path so future refactor work does not drift.
4. schema.py: Confirm the browser validation scope should mirror this file exactly for required fields and root structure; keep this file as the authoritative schema reference for runbook shape.

Definition of done:
- one documented contract for status names, reserved keys, and persistence behavior
- no functional changes yet

**Phase 1**
Create the shared module skeleton and move constants/state first.

1. Create dashboard/constants.js: Extract canonical status values, status display labels, health labels, reserved keys, filter option values, default project config, and export mode values.
2. Create dashboard/state.js: Move all mutable globals from runbookDashboard.html into a single exported state object, including runbook data, issues, filters, sorting, open categories, health state, issue form state, and export filter state.
3. Create dashboard/dom.js: Centralize repeated DOM lookups such as container nodes, summary box, timeline, toast, file input, and header elements.
4. Update runbookDashboard.html: Replace loose top-level variables with imports from the new state and constants modules.
5. Update runbookDashboard.html: Convert the bootstrap sequence so the HTML file becomes an entry point that wires modules together instead of owning all logic.

Definition of done:
- one state container
- one constants module
- no change in rendering or behavior

Estimated effort:
- 0.5 to 1 day

**Phase 2**
Extract pure selectors and normalization logic.

1. Create dashboard/selectors.js: Move normalizeStatus from runbookDashboard.html and keep one canonical mapping for internal values.
2. Create dashboard/selectors.js: Move statusClass, computeCategoryStatus, getGlobalStats, getEarliestTime, getUniqueTeams, matchesSearch, matchesTeam, and sortCategories out of runbookDashboard.html.
3. Create dashboard/selectors.js: Add derived helpers such as getOpenIssues, getClosedIssues, getBlockingIssues, getActiveAssignees, getVisibleCategories, getVisibleTasks, and getCompletionPct.
4. Update runbookDashboard.html: Make global stats rendering consume selectors rather than recomputing counts inline.
5. Update runbookDashboard.html: Make the main render path consume a single derived dashboard model instead of mixing filtering, sorting, and markup assembly in the same function.

Definition of done:
- one place for status normalization
- dashboard, summary, and exports can share the same derived counts
- Blocking vs Blocked display drift is controlled centrally

Estimated effort:
- 1 day

**Phase 3**
Separate persistence and load flows.

1. Create dashboard/persistence.js: Extract loadInitialRunbook from runbookDashboard.html with explicit precedence rules for browser draft versus server file.
2. Create dashboard/persistence.js: Extract saveDraft from runbookDashboard.html so localStorage save and file download are clearly separated but still triggered together if that remains the chosen behavior.
3. Create dashboard/persistence.js: Extract exportRunbookJson from runbookDashboard.html so file export is isolated from UI concerns.
4. Create dashboard/persistence.js: Extract loadFromServer from runbookDashboard.html.
5. Create dashboard/persistence.js: Extract loadFromFile from runbookDashboard.html.
6. Create dashboard/persistence.js: Extract resetRunbook from runbookDashboard.html.
7. Update runbookDashboard.html: Keep button handlers, but make them call persistence functions instead of inline logic.

Definition of done:
- every load/save/reset path goes through one persistence layer
- startup and manual reload behavior are predictable
- `_issues` and `_health` are always persisted consistently

Estimated effort:
- 0.5 to 1 day

**Phase 4**
Add browser-side validation aligned with the Python schema.

1. Create dashboard/validation.js: Mirror the structural checks from schema.py for root object, category arrays, and required task and status fields.
2. Create dashboard/validation.js: Add normalization helpers for optional fields such as item, assignee, startTime, and endTime so the UI always receives a stable shape.
3. Create dashboard/validation.js: Add user-facing error formatting that turns raw validation errors into short toast-friendly messages.
4. Update runbookDashboard.html: Replace the loose object check in applyLoadedRunbook with validate then normalize then apply.
5. Update runbookDashboard.html: Make both reload-from-server and load-from-file pass through the same validation and normalization path.

Definition of done:
- invalid JSON cannot reach render
- browser behavior matches the schema contract in schema.py
- users get actionable load errors instead of silent breakage

Estimated effort:
- 0.5 day

**Phase 5**
Split the main DOM renderer into focused modules.

1. Create dashboard/render/stats.js: Move renderGlobalStats from runbookDashboard.html into a pure renderer that accepts a derived stats model.
2. Create dashboard/render/timeline.js: Move renderTimeline from runbookDashboard.html and make it depend only on visible categories and selector output.
3. Create dashboard/render/categories.js: Move the category card and task row rendering logic from runbookDashboard.html into isolated functions for category header, progress bar, task row, status popup, and assignee editor markup.
4. Create dashboard/render/issues.js: Move renderIssues from runbookDashboard.html into its own renderer with a small API for form state and issue collections.
5. Create dashboard/render/summary.js: Move generateSummary and copySummaryToClipboard from runbookDashboard.html into a summary renderer plus clipboard helper.
6. Update runbookDashboard.html: Replace the monolithic render function with a coordinator that calls renderStats, renderIssues, renderTimeline, and renderCategories in order.

Definition of done:
- each visual surface has one renderer file
- render coordinator becomes short and readable
- DOM rendering no longer owns business rules

Estimated effort:
- 1.5 to 2 days

**Phase 6**
Isolate issue actions and task actions from rendering.

1. Create dashboard/actions/tasks.js: Move task status updates, bulk-complete logic, assignee editing commit logic, expandAll, and collapseAll out of runbookDashboard.html and runbookDashboard.html.
2. Create dashboard/actions/issues.js: Move toggleIssueForm, saveIssue, closeIssue, reopenIssue, editIssue, and deleteIssue out of runbookDashboard.html.
3. Create dashboard/actions/health.js: Move setHealth and health-related state updates out of runbookDashboard.html.
4. Update runbookDashboard.html: Keep only top-level event registration in the entry file.

Definition of done:
- user actions are separated from markup generation
- renderers render, actions mutate state, selectors derive data

Estimated effort:
- 1 day

**Phase 7**
Extract shared export data and canvas helpers before touching visuals.

1. Create dashboard/export/shared.js: Centralize shared export selectors for project title, timestamp, health metadata, stats, visible categories, active assignees, and issue lists.
2. Create dashboard/export/canvas.js: Move repeated canvas helpers such as drawText, drawRoundRect, gradient helpers, logo draw helpers, and resize-if-overflow logic from runbookDashboard.html.
3. Create dashboard/export/theme.js: Centralize export color maps for phone, email, and gantt surfaces so health/status colors are defined once.
4. Update runbookDashboard.html: Refactor phone export to consume shared export data and shared canvas helpers without changing layout.
5. Update runbookDashboard.html: Refactor email export to consume the same shared export data.
6. Update runbookDashboard.html: Refactor gantt export to consume the same shared time bounds and category status model.

Definition of done:
- exports still look the same
- counts and labels match the main dashboard exactly
- export-specific code is mostly drawing, not business logic

Estimated effort:
- 1.5 to 2 days

**Phase 8**
Normalize naming and remove drift.

1. Create dashboard/labels.js or extend dashboard/constants.js: Define canonical internal status values and separate display labels so data stays compatible with existing JSON while UI text can say Blocked consistently.
2. Update runbookDashboard.html: Make filter labels use shared display labels instead of inline text.
3. Update runbookDashboard.html, runbookDashboard.html, runbookDashboard.html, runbookDashboard.html, and runbookDashboard.html: Replace all hard-coded Blocking and Blocked strings with shared label helpers.
4. Review runbookDashboard.html and runbookDashboard.html: Collapse duplicate CSS variables where possible, but only after renderer refactor is complete.

Definition of done:
- one internal term for data
- one display-label map for UI
- no more mixed wording across filter buttons, stats, issues, summary, and exports

Estimated effort:
- 0.5 day

**Phase 9**
Trim the HTML file down to shell plus entry wiring.

1. Update runbookDashboard.html: Keep only markup, CSS, and minimal import/bootstrap code.
2. Update runbookDashboard.html: Remove migrated logic in slices, verifying the page still runs after each extraction rather than deleting everything in one pass.
3. Keep runbookDashboard.html as the stable DOM shell for operational usage so user workflows do not change.

Definition of done:
- the HTML file becomes the page shell
- app logic lives in modules
- future features can be added without editing a 3000-line script block

Estimated effort:
- 0.5 day

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
A realistic implementation estimate for one person moving carefully is 6 to 9 working days, with the first meaningful maintainability win after 2 days.

If you want, I can turn this next into a sprint-ready checklist with exact acceptance criteria per ticket and a recommended commit sequence.