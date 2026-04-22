# clientFolderGUI — Implementation Backlog

> Source spec: `Tasks/clientFolderGUI.md`  
> Status: **Phases 0–3 complete — Phase 4 in queue**  
> Last updated: 2026-04-22

---

## Context

The `clientFolderGUI` feature adds a NiceGUI-based 4-step Python wizard at `gui/` that wraps the existing `adapter/` CLI. Non-technical users can import CSV/Excel files and export `runbook.json` without touching the command line. The `adapter/` directory is treated as read-only library code throughout; `gui/bridge.py` calls it as a library. The existing Electron + JS dashboard is completely unaffected.

---

## ~~Pre-flight: Technical Decisions~~ ✅ RESOLVED

| Decision | Resolution | Status |
|---|---|---|
| NiceGUI version | `nicegui>=2.0,<4` — resolves to 3.10.0; all required APIs confirmed | ✅ |
| `bridge.py` imports `adapter/` | `sys.path.insert(0, _REPO_ROOT / "adapter")` at top of `bridge.py` | ✅ |
| `app.py` import path when run as script | `sys.path.insert(0, _REPO_ROOT)` at top of `app.py` | ✅ |
| AppState instantiation | Module-level singleton `state = AppState()` imported by all pages | ✅ |
| Merge logic for `runbook.json` | `merge_preserved_keys` preserves `_`-prefixed metadata only; per-task merge deferred to Phase 5 | ✅ |
| NiceGUI native mode | Deferred to post-MVP; browser mode used | ✅ |
| Temp file for uploads | `bridge.bytes_to_temp_file()` helper; `AppState.temp_path` cleaned on reset | ✅ |

---

## ~~Phase 0 — Pre-flight & Repository Hygiene~~ ✅ DONE

**Goal:** Fix the one pre-existing import blocker in `adapter/`, scaffold the `gui/` directory tree, confirm the NiceGUI API surface, write the dependency manifest.  
**Entry criteria:** None — greenfield.  
**Deliverable:** `python3 -c "from adapter.convert import convert"` passes from the repo root. `gui/` folder structure exists.

| # | Item | Size | Status |
|---|---|---|---|
| 0.1 | Fix `adapter/template_generator.py`: wrap module-level `PatternFill(...)` constant assignments inside `if HAS_OPENPYXL:` guard | S | ✅ |
| 0.2 | Create `gui/` folder structure: `gui/pages/`, `gui/components/`, `gui/tests/`, `__init__.py` stubs | S | ✅ |
| 0.3 | Write `gui/requirements.txt`: `nicegui>=2.0,<4`, `openpyxl>=3.1`, `pyyaml>=6` | S | ✅ |
| 0.4 | Confirm NiceGUI 3.10.0 API surface; spike converted to `gui/tests/test_phase0_preflight.py` (3 tests, all pass) | S | ✅ |

**Tests:** `pytest gui/tests/test_phase0_preflight.py -v` → **3/3 passed**  
**Verified:** `python3 -c "from adapter.convert import convert; print('OK')"` passes. NiceGUI 3.10.0 confirmed with `nicegui>=2.0,<4` constraint.

---

## ~~Phase 1 — Foundation Layer~~ ✅ DONE

**Goal:** All six foundation modules exist and are importable. `python gui/app.py` opens a dark glass-themed 4-step stepper shell in the browser with no crashes.  
**Entry criteria:** Phase 0 complete.  
**Deliverable:** Running app on `http://localhost:8080` showing the stepper with four named but empty steps.

| # | Item | Size | Status |
|---|---|---|---|
| 1.1 | `gui/state.py` — `AppState` dataclass (16 fields), module-level singleton, `reset()` cleans temp file | S | ✅ |
| 1.2 | `gui/theme.py` — `apply_theme()` injects full CSS token set + glass-card + Quasar overrides via `ui.add_css()` | S | ✅ |
| 1.3 | `gui/bridge.py` — 7 adapter wrappers with `sys.path` fix; errors re-raised as `RuntimeError`; `bytes_to_temp_file()` helper | M | ✅ |
| 1.4 | `gui/components/glass_card.py` — `glass_card(title, elevated)` context manager | S | ✅ |
| 1.5 | `gui/components/status_badge.py` — `status_badge(text, variant)` with status→class + variant→class maps | S | ✅ |
| 1.6 | `gui/components/step_header.py` — `step_header(n, title, subtitle)` with numbered pill | S | ✅ |
| 1.7 | `gui/app.py` — NiceGUI entry point; lazy page imports; 4-step stepper shell with placeholder fallback; `Next` bound to `state` fields | M | ✅ |

**Tests:** `pytest gui/tests/ -v` → **26/26 passed** (Phase 0: 3, Phase 1: 23)  
**Note:** `merge_preserved_keys` preserves only `_`-prefixed metadata (`_issues`, `_health`); per-task field merge (comment/status by taskId) is deferred to Phase 5.  
**Verified:** All modules import cleanly. App shell boots; `Next` buttons respond correctly to state.

---

## ~~Phase 2 — Step 1: Import File~~ ✅ DONE

**Goal:** User uploads a CSV or Excel file; detected format badge and row count appear; "Next" activates only on success.  
**Entry criteria:** Phase 1 complete.  
**Deliverable:** `AppState.source_path`, `detected_format`, `raw_headers` populated after successful upload.

| # | Item | Size | Status |
|---|---|---|---|
| 2.1 | `gui/pages/step1_import.py` — glass card + `ui.upload` (auto-upload, max 1 file, .csv/.xlsx/.xls) + `@ui.refreshable` file-status panel | M | ✅ |
| 2.2 | `process_upload(name, content)` — pure logic function; writes temp file, detects format, reads headers; returns state-update dict or error string | M | ✅ |
| 2.3 | `@ui.refreshable` file-status: format badge (CSV=info / Excel=success), column count, row count | S | ✅ |
| 2.4 | Error toast + state cleared on corrupt file / unsupported type / no headers; "Next" stays disabled | S | ✅ |
| 2.5 | Downstream state (`mapping`, `parsed_data`, `schema_errors`, `quality_report`) reset whenever a new file is loaded | S | ✅ |

**Tests:** `pytest gui/tests/test_phase2_step1.py -v` → **12/12 passed**  
**Verified:** `process_upload` handles CSV, Excel, unsupported types, empty files, corrupt Excel, whitespace headers.

---

## ~~Phase 3 — Step 2: Column Mapping~~ ✅ DONE

**Goal:** Auto-detect fires on step entry and pre-fills all dropdowns; user can edit and re-run; required-field warnings block "Next"; status value mapping is collapsible.  
**Entry criteria:** Phase 2 complete; `state.raw_headers` populated.  
**Deliverable:** `AppState.mapping` dict in the exact shape `mapping.yml` uses.

| # | Item | Size | Status |
|---|---|---|---|
| 3.1 | `gui/pages/step2_mapping.py` — `on_enter()` hook runs auto-detect + refreshes UI; called by `app.py` Step 1 "Next" button | M | ✅ |
| 3.2 | `@ui.refreshable` mapping UI — 3-column grid: field label + required badge \| `ui.select` dropdown \| status icon (✓ / ⚠) | M | ✅ |
| 3.3 | Category column selector with `ui.select` and optional label | S | ✅ |
| 3.4 | "Auto-detect again" toolbar button — calls `apply_autodetect()` + `mapping_ui.refresh()` | S | ✅ |
| 3.5 | Required-field amber warning banner (task + status); Step 2 "Next" `bind_enabled_from` checks both fields | S | ✅ |
| 3.6 | Collapsible `ui.expansion` status mapping editor — source value → `ui.select` canonical target | M | ✅ |

**Tests:** `pytest gui/tests/test_phase3_step2.py -v` → **23/23 passed**  
**Verified:** `apply_autodetect`, `update_column`, `update_category`, `update_status_mapping`, `is_ready`, `on_enter` — full coverage.  
**Note:** `_do_refresh` is a module-level callable (single-user desktop tool). For multi-user deployments use per-client storage.

---

## Phase 4 — Step 3: Preview & Validate

**Goal:** Conversion, validation, and quality checks run automatically on step entry. Summary bar, quality report, and paginated task table are shown. "Next" is blocked if schema errors exist.  
**Entry criteria:** Phase 3 complete; `state.mapping` is a valid mapping dict.  
**Deliverable:** `AppState.parsed_data`, `schema_errors`, `quality_report` populated and displayed.

| # | Item | Size | Depends on |
|---|---|---|---|
| 4.1 | `gui/pages/step3_preview.py` — on-enter: loading spinner, call `bridge.run_convert()` → `run_validate()` → `run_quality()` (wrapped in `asyncio.to_thread()` to avoid blocking UI), write results to `state` | M | 1.3 |
| 4.2 | Summary bar — glass card row: categories badge, tasks badge, errors badge (red if > 0), warnings badge (amber if > 0) | S | 4.1 |
| 4.3 | Collapsible quality report panel — three `ui.expansion` sections: "Errors" (red), "Warnings" (amber), "Info" (green), each with a list of items from `state.quality_report` | M | 4.1 |
| 4.4 | Paginated task preview table — `ui.table(pagination={'rowsPerPage': 25})` with columns: Category, Item, Task, Status, Assignee; rows flattened from `state.parsed_data` (skip `_`-prefixed keys); Status column uses `status_badge` | M | 4.1 |
| 4.5 | Blocking banner + disabled Next — if `state.schema_errors` non-empty, render red banner "Fix {N} mapping errors to continue"; "Next" disabled; "Back" always enabled | S | 4.1 |

**Verification:** Feed a corrupt mapping → errors appear, "Next" disabled. Feed a valid mapping from sample CSV → correct counts in summary, table paginated correctly (25 rows/page), "Next" enabled.

---

## Phase 5 — Step 4: Export

**Goal:** User saves `runbook.json` to disk. Success state shows with path and "Open folder" link. "Start over" resets the full wizard.  
**Entry criteria:** Phase 4 complete; `state.parsed_data` is valid.  
**Deliverable:** `runbook.json` written to disk; app can be restarted cleanly.

| # | Item | Size | Depends on |
|---|---|---|---|
| 5.1 | `gui/pages/step4_export.py` — output path input pre-filled with `{source_dir}/runbook.json`, "Browse" path override (plain `ui.input` in browser mode; document native mode limitation), "Save runbook.json" primary button, quality report expander | M | 1.3 |
| 5.2 | `bridge.write_runbook()` with merge logic — if output path already exists, call `merge_preserved_keys()` to preserve `comment`, `status`, `endTime` on matching `taskId`s, then write | M | 1.3 |
| 5.3 | Success state — hide form, show green checkmark + absolute path + "Open folder" button (platform-aware: `os.startfile` on Windows, `subprocess(['open',…])` on macOS, `subprocess(['xdg-open',…])` on Linux). Error: `ui.notify(err, type='negative')` | S | 5.2 |
| 5.4 | "Start over" — call `state.reset()`, delete `state.temp_path` if exists, navigate stepper back to Step 1 | S | 1.1 |

**Verification:** Complete Steps 1–4 → "Save" → `runbook.json` written. Run `python adapter/convert.py --validate runbook.json` → "OK". Save over an existing file with matching taskIds → comments preserved. "Start over" → back to Step 1, state cleared, temp file deleted.

---

## Phase 6 — Launcher Scripts & Distribution

**Goal:** Non-technical users can double-click a script (or run a single terminal command) on any OS to install dependencies and open the wizard.  
**Entry criteria:** Phases 1–5 complete; full wizard works end-to-end.  
**Deliverable:** `run_gui.bat` (Windows) and `run_gui.sh` (Mac/Linux) work on a clean Python 3.8+ environment.

| # | Item | Size | Depends on |
|---|---|---|---|
| 6.1 | `run_gui.bat` — `@echo off`, `pip install -r gui\requirements.txt --quiet`, `python gui\app.py`, pause on error | S | Phase 5 |
| 6.2 | `run_gui.sh` — `#!/usr/bin/env bash`, `pip3 install -r gui/requirements.txt --quiet`, `python3 gui/app.py` | S | Phase 5 |
| 6.3 | End-to-end smoke test — manual: complete full wizard with real CSV and real Excel file; confirm output `runbook.json` loads correctly in the Electron dashboard via `npm run electron` | M | 6.1, 6.2 |

**Verification:** On a clean Python 3.8+ environment (no prior pip installs), `bash run_gui.sh` completes without errors and opens the browser. Same for `run_gui.bat` on Windows.

---

## Phase 7 — Automated Tests

**Goal:** Regression safety net over `bridge.py` contracts and two full integration paths. Tests have no NiceGUI dependency.  
**Entry criteria:** Phase 6 complete.  
**Deliverable:** `pytest gui/tests/ -v` passes; all 5 test modules covered.

| # | Item | Size | Depends on |
|---|---|---|---|
| 7.1 | `gui/tests/test_bridge.py` — unit tests: `detect_format` returns correct strings; `autodetect` returns dict with `columns` + `status_mapping` keys; `run_validate` returns empty list for known-good runbook; `run_quality` returns dict with `errors`/`warnings`/`info`; `write_runbook` writes parseable JSON | M | 1.3 |
| 7.2 | `gui/tests/test_integration_csv.py` — minimal 3-row CSV fixture → bridge pipeline in sequence → assert output JSON is schema-valid | M | 7.1 |
| 7.3 | `gui/tests/test_integration_excel.py` — minimal `.xlsx` created with `openpyxl` fixture → bridge pipeline → assert output JSON is schema-valid | M | 7.1 |
| 7.4 | `gui/tests/test_error_recovery.py` — corrupt file → `bridge.read_headers()` raises expected exception; mapping with `task=None` → `run_convert()` produces data that fails `run_validate()` | S | 7.1 |
| 7.5 | `gui/tests/test_required_fields.py` — call `bridge.run_validate()` on a dict with tasks missing `task`/`status` fields; assert `schema_errors` is non-empty | S | 7.1 |

**Verification:** `pytest gui/tests/ -v` — all pass, no NiceGUI imports in test files.

---

## Phase 8 — Usability Polish

**Goal:** One real non-technical user completes the full wizard unaided; friction points addressed.  
**Entry criteria:** Phase 7 complete and all tests passing.  
**Deliverable:** Iteration notes captured; any UX fixes shipped.

| # | Item | Size | Depends on |
|---|---|---|---|
| 8.1 | Conduct walk-through session — provide launcher + real client file; observe without prompting; note hesitation points | S | Phase 7 |
| 8.2 | Iterate on mapping step UX — likely fixes: column value preview (first 3 rows), improved "Required" label copy, simplified status mapping editor | M | 8.1 |

**Verification:** User completes wizard without verbal guidance and produces a valid `runbook.json` that loads in the dashboard.

---

## Dependency Graph

```
Phase 0  (pre-flight + adapter bug fix)
   └── Phase 1  (foundation: state, theme, bridge, components, app)
         ├── Phase 2  (Step 1: Import)
         │      └── Phase 3  (Step 2: Mapping)
         │             └── Phase 4  (Step 3: Preview)
         │                    └── Phase 5  (Step 4: Export)
         │                           └── Phase 6  (launchers + smoke test)
         │                                  └── Phase 7  (tests)
         │                                         └── Phase 8  (usability)
         └── (shared components used across all page phases)
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| NiceGUI `ui.stepper` API differs between v1.x and v3.x | High | High | Run P0.4 spike before writing any page code; pin version |
| `template_generator.py` module-level `PatternFill` crash blocks all `bridge.py` imports | Confirmed | High | Fix in Phase 0 (one-line guard) before writing bridge.py |
| `ui.upload` in browser mode writes to server-side temp dir, not user's disk | Medium | High | Write uploaded bytes to `tempfile.NamedTemporaryFile` in upload callback |
| Step 3 conversion blocks UI on large files | Medium | Medium | Wrap `bridge.run_convert()` in `asyncio.to_thread()` |
| Google Fonts CDN unavailable in offline environments | Medium | Low | Acceptable for MVP; bundle fonts in post-MVP PyInstaller build |
| "Open folder" command differs per platform | Low | Low | Platform-detect: `os.startfile` (Win), `open` (macOS), `xdg-open` (Linux) |

---

## Complexity Legend

| Size | Definition |
|---|---|
| S | Small — well-defined, ≤ 30 lines, no design ambiguity |
| M | Medium — requires design judgment, 30–100 lines, or orchestrates multiple components |

---

## Runnable Checkpoints

| After phase | What to run |
|---|---|
| 0 | `python3 -c "from adapter.convert import convert; print('OK')"` |
| 1 | `python gui/app.py` → dark stepper shell in browser |
| 2 | Upload a CSV → see format badge and header count |
| 3 | Advance to Step 2 → auto-detected mapping table appears |
| 4 | Advance to Step 3 → preview table and quality report appear |
| 5 | Complete Step 4 → `runbook.json` written and validates |
| 6 | `bash run_gui.sh` on a fresh machine → installs and opens app |
| 7 | `pytest gui/tests/ -v` → all pass |
| 8 | Non-technical user completes wizard unaided |

---

## Critical Files Reference

| File | Role |
|---|---|
| `Tasks/clientFolderGUI.md` | Authoritative spec and original 39-item TODO source |
| `adapter/convert.py` | Bridge wraps `convert()`, `detect_format()`, `merge_preserved_keys()` |
| `adapter/template_generator.py` | Contains Phase 0 bug fix (line ~55–56) |
| `adapter/schema.py` | `run_validate()` calls this — do not modify |
| `runbookDashboard.html` | CSS token values to replicate in `gui/theme.py` |
| `gui/bridge.py` | **New** — thin wrapper layer, owns `sys.path` fix |
| `gui/state.py` | **New** — AppState singleton |
| `gui/app.py` | **New** — NiceGUI entry point |
