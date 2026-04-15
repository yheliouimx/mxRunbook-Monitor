# Plan: Schema Hardening + New Task Fields

## Status: DRAFT — awaiting user approval

## TL;DR
Three-phase plan:
1. **Harden existing validation** — make adapter+dashboard crash-proof for bad Excel data
2. **Extend the task schema** with 5 new optional fields
3. **Wire new fields** through Excel parser → JSON → dashboard UI

---

## Phase 1 — Validation Hardening (crash-proof)

### 1A. Python: `adapter/schema.py`
- Add `additionalProperties: true` to RUNBOOK_SCHEMA (allow forward-compat new fields)
- Add per-task time format validation: if `startTime`/`endTime` present, must match ISO pattern OR be null
- Add `assignee` to schema properties
- Add category name length check (> 100 chars → warning)

### 1B. Python: `adapter/quality.py`
- Add time format check: warn if startTime/endTime is bare `"HH:MM:SS"` (no anchor → JS won't sort)
- Add check: if `endTime < startTime` across midnight crossing (currently false-flags overnight tasks)
- Add check: warn if task text contains unstripped `\n`
- Add check: warn if `item` == `task` (redundant field, usually a mapping error)

### 1C. Python: `adapter/parsers/excel_parser.py`
- Already fixed time parsing — add one more guard: strip leading/trailing whitespace from ALL string fields
- If `category_column` points to a column that doesn't exist → raise clear error (currently silently falls back)
- Validate `runbook_date` format at parse start, not silently ignore bad values

### 1D. JS: `dashboard/validation.js`
- Add time string validation in `normalize()`: if startTime/endTime is a non-empty string AND `new Date(val)` is NaN → set to `""` with a console.warn (prevents render crashes silently)
- Add `comment`, `taskId`, `system`, `party`, `estimatedEnd` to normalize() defaults (empty string / null)

### 1E. JS: `dashboard/selectors.js` — `formatTimeShort()`
- Already has isNaN guard — no change needed

---

## Phase 2 — New Task Fields (Schema Extension)

New optional fields added to task objects:

| Field | Type | Source | Description |
|---|---|---|---|
| `taskId` | string\|null | Excel col (optional) | Unique task reference ID |
| `estimatedEnd` | ISO string\|null | Excel col (optional) | Original planned end time (frozen at import) |
| `system` | string\|null | Excel col (optional) | Impacted system (e.g. "MX PROD", "Findur") |
| `party` | string\|null | Excel col (optional) | Responsible party: "Client" \| "Murex" \| "Joint" |
| `comment` | string\|null | Dashboard only | Free-text note added live in UI (not from Excel) |

`endTime` becomes the **actual** end time (editable in dashboard, saved to draft).
`estimatedEnd` is the planned end time (read-only, from import).

### 2A. Python: `adapter/schema.py`
- Add 5 new properties to RUNBOOK_SCHEMA task object (all optional, string|null)

### 2B. Python: `adapter/parsers/excel_parser.py`
- Add 5 new keys to `DEFAULT_MAPPING["columns"]` (all default to None)
- `get_raw()` / `get_val()` already generic — just add the new fields to the task dict
- `estimatedEnd` = copy of `endTime` value at parse time (frozen planned value)

### 2C. Python: `adapter/quality.py`
- Add check: if `estimatedEnd` present and `endTime` present, warn if actual > estimated by > 30 min
- Add check: if `party` present, warn if value not in {"Client", "Murex", "Joint", null}

### 2D. Mapping files (`lbg_fermat_mapping.yml`, `dz_mapping.yml`)
- Add commented-out column mappings for new fields (opt-in, no breaking change)

### 2E. JS: `dashboard/validation.js` — `normalize()`
- Add new fields to normalization defaults

### 2F. JS: `dashboard/constants.js`
- Add `PARTY_OPTIONS = ["Client", "Murex", "Joint"]`

---

## Phase 3 — Dashboard UI for New Fields

### 3A. Task card rendering (`dashboard/render/categories.js`)
- Show `taskId` as a small badge before item label (if present)
- Show `system` as a small tag after task text (if present)  
- Show `party` as a colored badge (Client=blue, Murex=green, Joint=gray)
- Show `comment` as an expandable note below task text with inline edit (pencil icon → textarea → save)
- Show `estimatedEnd` vs `endTime` delta when both present: "(+15m)" in orange if overrun

### 3B. `endTime` inline editing
- The existing assignee click-to-edit pattern (`attachAssigneeEdit`) is the template
- Add similar click-to-edit on the task time display for `endTime` — ISO datetime input
- On save: update `state.runbookData[cat][idx].endTime`, trigger local DOM patch

### 3C. Filtering/search (`dashboard/selectors.js`)
- Extend `matchesSearch()` to also match `taskId`, `system`, `comment`
- Add `systemFilter` state and dropdown (parallel to `teamFilter`) — only shown if any task has `system`

### 3D. Stats/exports
- `export/shared.js` `getExportCategories()` — no change needed (spreads full task objects)
- Gantt: show `estimatedEnd` as a lighter bar behind actual `endTime` bar (planned vs actual)
- Summary export: add `comment` column if any tasks have comments

---

## Relevant Files
- `adapter/schema.py` — add 5 new properties + time format validation
- `adapter/quality.py` — add 3 new checks
- `adapter/parsers/excel_parser.py` — add 5 new fields to task dict + better error on bad category_column
- `adapter/convert.py` — no change (generic)
- `dz_mapping.yml` + `runbooks/lbg_fermat_mapping.yml` — add commented new column mappings
- `dashboard/validation.js` — normalize() gets new field defaults + time string guard
- `dashboard/constants.js` — add PARTY_OPTIONS
- `dashboard/state.js` — no change (state.runbookData is dynamic)
- `dashboard/render/categories.js` — render new fields + endTime editing + comment editing
- `dashboard/selectors.js` — extend matchesSearch(), optionally add systemFilter
- `dashboard/export/shared.js` — no breaking change (already spreads full task)
- `dashboard/export/gantt.js` — optional: planned vs actual bar

## Decisions
- New fields are ALL optional — zero breaking change on existing runbooks
- `estimatedEnd` is a NEW field frozen at import time; `endTime` becomes the live/actual value
- `comment` is dashboard-only (not from Excel); survives in localStorage draft and exported JSON
- Phase 3 (UI) can be split: rendering new fields first, then endTime editing, then comment editing
- `system` filter dropdown only rendered if ≥1 task has a non-empty system value

## Out of Scope
- No database — all state stays in localStorage + JSON file
- No multi-user collaboration — single user model unchanged
- No Excel write-back — endTime edits live only in dashboard/draft JSON
