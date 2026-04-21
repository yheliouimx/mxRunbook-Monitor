# Plan: Runbook → Excel Save-Back (Feature 2.3)

## Context

During a live go-live event, operators update task statuses and enter actual start/end times
in the dashboard. At the end of the event, they want those changes reflected back in the
original Excel runbook file — so that the post-event file contains both the original plan
AND the actual execution data. The original Excel must be backed up before any overwrite.

This is Feature 2.3 in `Tasks/enhancements_roadmap.md`:
> "Reverse Export: Dashboard → CSV/Excel — export current dashboard state (with live-entered
> actual times + comments) back to a `.csv` / `.xlsx`; critical for post-event filing"

---

## What already exists (do not duplicate)

| What | Where |
|------|-------|
| Forward parse (Excel → JSON) | `adapter/parsers/excel_parser.py` (Python / openpyxl) |
| Column mapping config | `mapping.yml` (project root or client folder) |
| Status mapping | `mapping.yml::status_mapping` |
| Export dropdown (UI) | `runbookDashboard.html` lines 2083–2091 |
| Browser JSON download | `dashboard/persistence.js:exportRunbookJson()` |
| Existing IPC write pattern | `electron-main.js` `config:saveDashboard` handler |
| Client folder path | `currentClientDir` variable in `electron-main.js` |

The adapter Python layer is **not touched** — it is a CLI import tool only.

---

## Technology choice: exceljs (Node.js, Electron main process)

**Why not Python/openpyxl**: Requires Python on the user's machine at runtime; the
Electron app is self-contained and should have no external runtime dependencies.

**Why exceljs**: Mature Node.js library, supports reading an existing `.xlsx` workbook
and updating individual cells while preserving formatting (borders, colours, fonts).
Runs inside Electron's Node context — no bundling to browser needed.

```
npm install exceljs
```

Add to `package.json::dependencies` (not devDependencies — needed at runtime in Electron).

---

## Two operating modes

| Mode | When | Behaviour |
|------|------|-----------|
| **Update-in-place** | `excelFile` in config.json, or `*.xlsx` auto-discovered in client folder | Load original → backup → append actual columns → save |
| **Generate-fresh** | No Excel file found anywhere | Build new `.xlsx` from JSON with standard column layout → save to client folder |

---

## Confirmed design decisions

| Decision | Choice |
|----------|--------|
| Write strategy | **Add parallel columns** — original planned columns untouched; append `Status (Actual)`, `Actual Start`, `Actual End`, `Comment` |
| Excel file location | **Always in client folder** — auto-discover `*.xlsx`, or explicit via `excelFile` in config.json |

### Resulting Excel column layout (after save-back)

```
| Item | Task | Category | Exp start time | Exp end time | [original columns…] | Status (Actual) | Actual Start | Actual End | Comment |
```

Original columns are **never modified**. The 4 new columns are appended to the right.
If a second save-back is triggered later, the existing "Actual" columns are updated in
place (they already exist from the first run). A fresh backup is always created first.

---

## Fields written back to Excel

| JSON field | Column added | Notes |
|-----------|-------------|-------|
| `status` | `Status (Actual)` | Reverse-mapped via `status_mapping`; canonical value if no reverse mapping |
| `startTime` | `Actual Start` | Actual start entered during event |
| `endTime` | `Actual End` | Actual end entered during event |
| `comment` | `Comment` | Only appended if ≥1 task has a non-empty comment |
| `task` | ❌ Never written | Source of truth — original columns untouched |
| `item` | ❌ Never written | Same |
| `assignee` | ❌ Not in v1 | Could be added in a later phase |
| `estimatedEnd` | ❌ Never written | Planned time — already in original; never overwritten |

---

## Column mapping resolution (5-level hierarchy, highest → lowest)

1. Inline `excelMapping` object in `config.json` (per-client, explicit)
2. `mapping.yml` in client folder (per-client)
3. `mapping.yml` in app root (global default, current file)
4. Default field names as literal column headers (`"task"`, `"status"`, `"startTime"`, etc.)

The `mapping.yml` format is already documented — use the same `columns:` and `status_mapping:`
keys for write-back. **Reverse** the `status_mapping` for the write direction
(e.g. `"Completed"` → `"Done"`).

---

## Row matching algorithm

Tasks in JSON must be matched back to their original Excel rows reliably.

```
For each JSON task (per category, in order):
  1. If task.item is non-empty:
       Find the Excel row where item_column == task.item  (exact, trimmed)
  2. Else if task.task is non-empty:
       Find the Excel row where task_column == task.task  (exact, trimmed)
  3. If no match found → add to skippedRows (report at end, do NOT guess)
```

Build a lookup index before iterating (O(1) per lookup):
```javascript
// itemIndex: Map<itemValue, rowNumber>
// taskIndex: Map<taskText, rowNumber>
```

If multiple rows share the same item or task text, the first unmatched one is used
(index is consumed as tasks are matched to avoid double-mapping).

---

## Backup strategy

Create backup **before** any write:
```javascript
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12); // "202604211430"
const backupName = `${basename}_backup_${ts}.xlsx`;
const backupPath = path.join(clientDir, backupName);
fs.copyFileSync(originalPath, backupPath); // synchronous, done before workbook opens
```

Backup lives in the **same directory** as the original Excel file.

---

## New IPC handler: `runbook:writeToExcel`

Location: `electron-main.js`, inside `registerIpcHandlers()`

```
Input:  { runbookData: <current state.runbookData> }
Output: { success, outputPath, backupPath, updatedRows, skippedRows, mode }
```

Implementation steps inside the handler:
1. Validate `currentClientDir` is set (client must be open)
2. Call `resolveExcelFile(currentClientDir)` → absolute path or null
3. Call `loadColumnMapping(currentClientDir)` → column map + reverse status map
4. If Excel file found → **update mode**:
   - `fs.copyFileSync(excelPath, backupPath)` — backup first
   - Load workbook with `new ExcelJS.Workbook().xlsx.readFile(excelPath)`
   - Find the worksheet (use `sheet:` from mapping or first sheet)
   - Scan row 1 for headers → build `colIndex: { task, status, startTime, endTime, item, comment }`
   - Detect or add `Status (Actual)`, `Actual Start`, `Actual End`, `Comment` columns
   - Build `itemIndex` and `taskIndex` from the data rows
   - For each JSON task: match row → write/update actual cells → track updated/skipped
   - `workbook.xlsx.writeFile(excelPath)`
5. If no Excel file → **generate mode**:
   - Build new `ExcelJS.Workbook()`
   - Write header row (item, task, category, status, startTime, endTime, `Status (Actual)`, `Actual Start`, `Actual End`, comment)
   - For each category + task: write a row
   - Save as `<projectName>_runbook_export_YYYYMMDD.xlsx` in client folder
6. Return result object

### Helper functions (add near top of `electron-main.js`, after `saveDashboardConfig`):

| Function | Purpose |
|----------|---------|
| `resolveExcelFile(clientDir)` | Checks config.json for `excelFile`, then auto-discovers `*.xlsx` in dir |
| `loadColumnMapping(clientDir)` | Reads mapping.yml hierarchy → returns `{ colMap, reverseStatusMap }` |
| `buildRowIndex(ws, colIndex)` | Scans worksheet → returns `{ itemIndex, taskIndex }` |
| `formatTimeForExcel(isoStr)` | Converts ISO datetime string → human-readable string for Excel |
| `reverseStatusMap(forwardMap)` | Inverts `{ "Done": "Completed" }` → `{ "Completed": "Done" }` |

---

## Preload bridge addition (`preload.js`)

```javascript
// Save current runbook state back to the original Excel file in the client folder.
// Returns { success, outputPath, backupPath, updatedRows, skippedRows, mode }.
writeRunbookToExcel: (runbookData) =>
    ipcRenderer.invoke('runbook:writeToExcel', { runbookData }),
```

---

## Dashboard UI (`runbookDashboard.html`)

Add one button to the existing export dropdown (after the `export-json` button, lines ~2089):

```html
<button data-action="save-excel">
  <svg><!-- spreadsheet icon --></svg>
  Save to Excel
</button>
```

The button is hidden when `!window.electronAPI` (browser / dev-server mode where
writing to disk is not possible).

### Event handler in `dashboard/app.js`

Existing pattern: `document.addEventListener('click', e => { const btn = e.target.closest('[data-action]'); ... })`.
Add a new `case 'save-excel'`:

```javascript
case 'save-excel': {
    if (!window.electronAPI) break;
    syncReservedKeys();
    showToast('Saving to Excel…');
    const result = await window.electronAPI.writeRunbookToExcel(state.runbookData);
    if (result && result.success) {
        const bk = result.backupPath.split(/[\\/]/).pop();
        showToast(`Saved ✓  Backup: ${bk}  (${result.updatedRows} rows updated)`);
    } else {
        showToast('Excel export failed — check the client folder contains an .xlsx file and it is not open in Excel');
    }
    break;
}
```

---

## Files to modify

| File | Change |
|------|--------|
| `package.json` | Add `"exceljs": "^4.4.0"` to `dependencies` |
| `electron-main.js` | Add 5 helper functions + `runbook:writeToExcel` IPC handler |
| `preload.js` | Expose `writeRunbookToExcel` on `window.electronAPI` |
| `runbookDashboard.html` | Add `save-excel` button to export dropdown + `case 'save-excel'` handler |

No new files need to be created. No existing Python code is touched.

---

## Optional: `excelFile` config field

To let clients explicitly point to their source Excel, document (but do not enforce) a
new optional field in `config.json`:

```json
{
  "excelFile": "mks_runbook.xlsx"
}
```

Path is relative to the client folder. If omitted, the system auto-discovers `*.xlsx`.

---

## Additional implementation considerations

### Windows file lock
If the user has the Excel open in Excel/LibreOffice when they click "Save to Excel",
the write will fail with an EBUSY / permission error. The IPC handler must catch this
and return a user-friendly message: *"Close the Excel file before saving."*

### Circular import safety
If the updated Excel is later re-imported via the Python CLI tool, `status_mapping`
must round-trip cleanly. Because the original `status` column is untouched (we only
write `Status (Actual)`), re-import is safe by default.

### Issues & health metadata (out of scope for v1)
A future Phase 2 could add a second worksheet: one row per issue (from `_issues`),
plus health timeline events. Keep out of scope for the initial implementation.

---

## Verification steps

1. `npm install exceljs` — confirm no dependency conflicts
2. Add `"excelFile": "mks_runbook.xlsx"` to a test client's `config.json`
3. `npm run electron` → open the client folder
4. Change several task statuses in the dashboard
5. Click **Export → Save to Excel**
6. Confirm: `mks_runbook_backup_YYYYMMDD_HHMM.xlsx` appears in the client folder
7. Open both files in Excel: backup = original unchanged; updated file has 4 new columns on the right
8. Test generate-fresh mode: remove `excelFile` from config and delete/rename any `.xlsx`
   → click Save to Excel → new file generated in client folder
9. Test skipped rows: rename a task in the JSON and confirm the toast reports it as skipped
