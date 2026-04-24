# Enhancement Backlog — Task Editing, Descriptions & Parallel Links

**Scope**: Three new dashboard capabilities planned for a future sprint.
**Status**: Design / analysis — no code yet.

---

## Context Audit — What Exists Today

Before designing, here is what the codebase already provides per task:

### Editable fields (inline, live dashboard)
| Field | Mechanism | Written to Excel? |
|-------|-----------|-------------------|
| `status` | Click → popup (5 options) | ✅ `Status (Actual)` |
| `assignee` | Click badge → inline `<input>` | ❌ **gap** |
| `endTime` | Click time → `datetime-local` input | ✅ `Actual End` |
| `comment` | 💬 button → inline `<textarea>` | ✅ `Comment` |

### Read-only fields (rendered, not editable today)
| Field | Displayed as |
|-------|-------------|
| `task` | Main task label (text span) |
| `item` | Secondary label badge |
| `startTime` | Time prefix before `—` separator |
| `estimatedEnd` | Gantt planned-end `P` marker + delta badge |
| `taskId` | Yellow `#ID` badge |
| `system` | Cyan pill tag |
| `party` | Colored filled badge |

### Excel row-matching logic (`electron-main.js`)
1. Primary key: `item` (unique item label)
2. Fallback: `task` text (consumed in order, de-duplicated)

Any change to `task` text without preserving the original breaks the fallback lookup → goes to `skippedRows`.

### Current task JSON schema (all fields)
```json
{
  "task":         "string (required)",
  "status":       "string (required)",
  "item":         "string | null",
  "assignee":     "string | null",
  "startTime":    "ISO string | null",
  "endTime":      "ISO string | null",
  "estimatedEnd": "ISO string | null",
  "taskId":       "string | null",
  "system":       "string | null",
  "party":        "string | null",
  "comment":      "string | null"
}
```

---

## Enhancement 1 — Complete Task Editing & Excel Write-back

### Problem statement
Operators need to correct or fill in task data live during a run-book event and have those changes
round-trip accurately when they hit **Save to Excel**. Today two gaps exist:

1. `assignee` is editable in the UI but **never written** to the Excel file.
2. `startTime` is written to `Actual Start` in Excel, but it is the *planned* start — there is no
   way to record the *actual* start time separately without overwriting the planning data.
3. Operators sometimes need to fix a task's short label (`task` / `item`) live, which is currently
   impossible; any typo from the source spreadsheet is frozen in the dashboard.

### Proposed data model additions
Two new optional fields:

```json
{
  "actualStartTime": "YYYY-MM-DDTHH:MM",   // NEW: operator-entered actual start
  "_origTask":       "string"              // NEW: shadow field, set only when task text is edited
}
```

`_origTask` is a reserved internal field (prefixed `_` convention already used for `_issues`,
`_health`). It stores the original task text before any in-dashboard edit, so the Excel matching
engine can still find the row.

### Target Excel write-back columns after this change

| Dashboard field | Excel column written |
|----------------|---------------------|
| `status` | `Status (Actual)` ← existing |
| `actualStartTime` | `Actual Start` ← repurposed (was: `startTime`) |
| `endTime` | `Actual End` ← existing |
| `assignee` | `Assignee (Actual)` ← **new column added if not present** |
| `comment` | `Comment` ← existing |

`startTime` / `estimatedEnd` stay as planning data and are **not** overwritten.

### Editable fields to add to the UI

| Field | Edit UX | Notes |
|-------|---------|-------|
| `actualStartTime` | Click a `+start` placeholder (same pattern as `endTime`) → `datetime-local` input | New field; does not overwrite `startTime` |
| `assignee` | Already editable — just fix the Excel handler to write it back | Zero UI change |
| `task` text | Click pencil icon next to task label → inline `<textarea>` | Stores original in `_origTask` on first edit |
| `item` label | Click item badge → inline `<input>` | Item is the primary Excel key — warn user |

### Row-matching resilience
In `electron-main.js` `buildRowIndex` / matching loop, change the lookup order to:

1. `t.item` → `byItem` (primary — unchanged)
2. `t._origTask || t.task` → `byTask` (fallback now uses original text if task was edited)

This keeps Excel sync working even after the operator corrects a task label.

### Files that need changes
- `dashboard/actions/tasks.js` — add `setActualStartTime()`, `setTaskText()`, `setItem()`
- `dashboard/render/categories.js` — attach new click-to-edit handlers; render `+start` span
- `dashboard/validation.js` — normalize `actualStartTime` and `_origTask`
- `adapter/schema.py` — add `actualStartTime` to `RUNBOOK_SCHEMA` properties
- `electron-main.js` — write `assignee` → `Assignee (Actual)`, use `_origTask` in byTask lookup
- `mapping.yml` — document `actualStartTime` optional column mapping

### Acceptance criteria
- [ ] `assignee` appears in `Assignee (Actual)` column after Save to Excel
- [ ] `actualStartTime` appears in `Actual Start` column (replaces planned `startTime`)
- [ ] Editing task text does not break Excel row matching for that task
- [ ] Editing `item` shows a warning toast ("This is the primary Excel match key — edit with care")
- [ ] All new editable fields persist to localStorage on change

---

## Enhancement 2 — Collapsible Task Description Panel

### Problem statement
Tasks in go-live runbooks often carry detailed procedure steps, reference links, or contextual notes
that are too long to show in the task label. Today there is no `description` field; operators work
around it by putting everything into `task` (making labels very long) or into `comment` (which is
meant for live operator notes, not pre-authored procedure text).

A dedicated `description` field — hidden by default and toggleable — keeps the task list scannable
while allowing operators to drill into details when needed.

### Proposed data model addition

```json
{
  "task":        "Short label shown in the task row",
  "description": "Full multi-line procedure text, pre-authored in the source Excel.\nCan contain multiple steps.",
  ...
}
```

`description` is optional. When absent or empty, the toggle button is hidden (or shown greyed out
at the operator's preference — a config option).

### Excel mapping (adapter)
```yaml
columns:
  description: "Procedure / Notes"   # optional column
```

The adapter writes this field unchanged into `runbook.json`. No status normalization needed.

### UI design

```
┌────────────────────────────────────────────────────────────────────┐
│ ▶  [status btn]  #ID  Item Label  Task short label  SYSTEM  Owner  │  ← task row (unchanged)
│    ▼ Details                                                        │  ← toggle button (when description exists)
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │ Full procedure text goes here.                                   ││  ← collapsible panel
│ │ Step 1: ...                                                      ││
│ │ Step 2: ...                                                      ││
│ └──────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────┘
```

- **Toggle button**: small `▶ Details` / `▼ Details` button rendered below the task label row,
  only when `description` is non-empty. Styled similarly to the `💬 note` button.
- **Expansion**: CSS `max-height` + `overflow: hidden` transition (same pattern as category
  accordion `.tasks-wrapper.open`).
- **Content**: `white-space: pre-wrap` to preserve line breaks; subtle left border accent
  using `var(--color-primary)` at 40% opacity.
- **State**: expansion is **per-task, ephemeral** (stored in a local `Set` in the render module,
  not persisted to `state.js` or localStorage). Acceptable to collapse on page reload — description
  is reference text, not operator-entered progress data.
- **Editing**: description is treated as a **planning field** (like `startTime`) — not editable
  in the live dashboard by default. If inline editing is desired later, it follows the same
  `attachCommentEdit` pattern.

### Interaction with existing `comment` field
- `description` = pre-authored procedure text sourced from Excel (read-only by default)
- `comment` = live operator note entered during the event (editable, persisted, written to Excel)

These are distinct and should coexist on the same task row without visual confusion.

### Files that need changes
- `dashboard/render/categories.js` — render `▶ Details` button and collapsible panel; attach toggle listener
- `dashboard/validation.js` — normalize `description` (null → "")
- `adapter/schema.py` — add `description` to `RUNBOOK_SCHEMA` properties
- `adapter/parsers/excel_parser.py` — read `description` column if mapped
- `mapping.yml` — document optional `description` column
- `runbookDashboard.html` (CSS) — add `.task-description` and `.task-desc-toggle` styles

### Acceptance criteria
- [ ] `description` field renders as a collapsible panel below each task that has one
- [ ] Toggle button is hidden when `description` is empty/absent
- [ ] Expand/collapse animation is smooth (CSS transition, no re-render)
- [ ] `description` text is not editable in the dashboard (read-only, authored in Excel)
- [ ] The adapter maps an optional `description` column from the source spreadsheet
- [ ] `description` does not appear in the Excel write-back (it is a planning input, not an output)

---

## Enhancement 3 — Task Linking / Parallel Execution Groups

### Problem statement
Runbooks often have tasks that can be executed simultaneously. Currently the task list is purely
sequential — there is no way to communicate to the operator which tasks are concurrent or which
tasks depend on others being complete first.

### Design options considered

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A — `parallelGroup` tag** | Tasks share a group ID string; same group = run in parallel | Simple, authoring-friendly (one Excel column), easy to render as bracket/section | Does not encode ordering / dependencies |
| **B — `dependsOn` list** | `dependsOn: ["taskId1"]` on each task | Full dependency graph, enables critical-path analysis | Complex authoring, graph rendering is non-trivial |
| **C — `parallelWith` list** | Explicit peer links between task IDs | Symmetric relationship, clear intent | Harder to author; mutual references must be consistent |

**Recommendation: Option A (`parallelGroup`) for the initial enhancement.**

It is the simplest to author in Excel (one column, one shared label per group), natural to render
visually, and forward-compatible — `dependsOn` can be added as a follow-on.

### Proposed data model addition

```json
{
  "task":          "Run DB migration script",
  "parallelGroup": "PG-deploy",
  ...
}
```

`parallelGroup` is an arbitrary string. All tasks within the same category sharing the same
`parallelGroup` value are treated as a parallel execution group.

### Excel mapping

```yaml
columns:
  parallelGroup: "Parallel Group"   # optional column; blank = sequential task
```

### UI design

Tasks in the same `parallelGroup` are visually bracketed together:

```
┌── PG-deploy ───────────────────────────────────────────────┐
│ ▶ [●]  Run DB migration script              DBA            │
│ ▶ [●]  Deploy app server config             Support        │
│ ▶ [●]  Enable load balancer rules           Network        │
└────────────────────────────────────────────────────────────┘
    ▶ [●]  Smoke test — sequential task after group
```

Visual elements:
- **Group wrapper `<div class="parallel-group">`**: left border using `var(--color-primary)`
  at 50% opacity, subtle background tint.
- **Group label**: small pill at top-left of the bracket showing the group ID
  (or a generic `⟳ Parallel` label if the ID is not meaningful to operators).
- **Sort order**: within a category, tasks are sorted so that all tasks of the same `parallelGroup`
  appear consecutively. Tasks without a `parallelGroup` keep their original order, interleaved
  between groups at the position of their first group member.
- **No change to status logic**: parallel tasks are still individually clickable; their status
  cycles independently. The group bracket is purely visual — no automatic status propagation.

### Gantt integration
Tasks in the same `parallelGroup` with overlapping `startTime`/`estimatedEnd` will naturally
render as overlapping Gantt bars — no special handling needed. As a future improvement, the Gantt
renderer could shade the parallel group background to make concurrency explicit.

### Dashboard editing (linking / unlinking UI)

The `parallelGroup` field should be editable live in the dashboard:

- **Add to group**: small `⟳` link icon on each task row → inline `<input>` that shows existing
  group names as datalist suggestions (same pattern as `assignee` editing).
- **Remove from group**: clear the input to empty string.
- **Create group**: type a new group name; it is created immediately.

This allows operators to group tasks during a live event (e.g., discovering two tasks can
actually run concurrently).

### Interaction with sorting / filtering
- When `sortMode === "timeline"` or `"original"`, group members are kept consecutive.
- When `sortMode === "alpha"` or `"completion"`, the group visual bracket is suppressed
  (members may not be adjacent after sorting by non-timeline criteria). A badge on each task
  still indicates its group membership.

### Files that need changes
- `dashboard/actions/tasks.js` — add `setParallelGroup(cat, idx, groupId)`
- `dashboard/render/categories.js` — group tasks by `parallelGroup` before rendering; wrap in
  `.parallel-group` div; attach inline group-name editor
- `dashboard/validation.js` — normalize `parallelGroup` (null → "")
- `adapter/schema.py` — add `parallelGroup` to `RUNBOOK_SCHEMA` properties
- `adapter/parsers/excel_parser.py` — read `parallelGroup` column if mapped
- `mapping.yml` — document optional `parallelGroup` column
- `runbookDashboard.html` (CSS) — add `.parallel-group`, `.parallel-group-label` styles

### Acceptance criteria
- [ ] Tasks sharing a `parallelGroup` value are rendered inside a visual bracket
- [ ] Group label is shown at the top of the bracket
- [ ] Inline `parallelGroup` editor follows the same click-to-edit UX as `assignee`
- [ ] Removing a task from a group (clear field) re-renders it as a sequential task
- [ ] When a group has only one member remaining, the bracket is removed automatically
- [ ] `parallelGroup` persists to localStorage and is included in JSON export
- [ ] The adapter reads an optional `Parallel Group` column and maps it correctly

---

## Cross-cutting Concerns

### Schema versioning
All three enhancements add optional fields with no breaking changes:
- `actualStartTime` (Enh. 1)
- `description` (Enh. 2)
- `parallelGroup` (Enh. 3)
- `_origTask` (Enh. 1, internal/reserved)

Older runbook files without these fields continue to load correctly — `validation.js normalize()`
already sets absent optional fields to `""`.

### `patchTaskRow` / targeted DOM patching
All new editable fields should use the existing targeted-patch pattern (no full re-render on
field change) to preserve scroll position and animation state:
- Enh. 1: `actualStartTime` → patch the `+start` span in-place (same as `endTime`)
- Enh. 2: description toggle → CSS class toggle only, no DOM rebuild
- Enh. 3: group editor → patch the group badge + possibly reorder rows (requires partial re-render
  of the affected category only)

### `saveToLocalStorage` / persistence
All new state fields are part of `state.runbookData` (task objects), so they are automatically
picked up by `saveToLocalStorage()` and `exportJSON()` — no persistence changes needed.

### Tests (`tests/`)
New unit tests needed:
- `tasks.test.js` — `setActualStartTime`, `setTaskText` (with `_origTask` tracking),
  `setParallelGroup`
- `validation.test.js` — normalize handles new fields; schema accepts / rejects correctly
- `selectors.test.js` — any new derived queries (e.g., `getParallelGroups()`)

---

## Implementation Order (suggested)

| Priority | Enhancement | Effort estimate | Risk |
|----------|-------------|-----------------|------|
| 1 | Enh. 1a — Write `assignee` to Excel | XS (1 line in IPC handler) | Low |
| 2 | Enh. 1b — `actualStartTime` editable field + Excel | S | Low |
| 3 | Enh. 2 — Description panel (render + adapter) | M | Low |
| 4 | Enh. 1c — Editable task text with `_origTask` | M | Medium (Excel matching) |
| 5 | Enh. 3 — Parallel groups (render + adapter) | M–L | Medium (sort + rendering) |
| 6 | Enh. 1d — Editable `item` label with warning | S | Medium (primary Excel key) |
