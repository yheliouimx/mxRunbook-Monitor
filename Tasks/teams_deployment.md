# Teams App Deployment Backlog

**Scope**: Deliver MX Runbook Monitor as a Microsoft Teams tab application, alongside and without
modifying the existing Electron desktop and standalone HTML distributions.

**Principle**: The `dashboard/` JS module tree is reused verbatim. Only the I/O shell changes:
Electron IPC → Graph API calls, Python adapter → SheetJS client-side parser.

---

## Architecture Overview

```
mxRunbook-Monitor/
├── dashboard/          ← shared (unchanged) — all task logic, rendering, state
├── runbookDashboard.html  ← standalone HTML distribution (unchanged)
├── electron-main.js    ← Electron distribution (unchanged)
└── teams-app/          ← NEW: Teams tab shell only
    ├── manifest/       ← Teams app package (manifest + icons)
    ├── src/            ← Teams-specific I/O adapters
    │   ├── auth.js         ← Azure AD / MSAL auth
    │   ├── graph.js        ← Graph API file read/write
    │   ├── sheetjs-parser.js ← client-side Excel parser (replaces Python adapter)
    │   └── teams-bridge.js ← Teams SDK init, theme sync, user context
    └── index.html      ← Teams tab shell (loads shared dashboard/ modules)
```

The `teams-app/index.html` is the only HTML file for the Teams tab. It:
- Loads the shared `dashboard/` modules via ES module `<script type="module">`
- Replaces `window.electronAPI` with a `window.teamsAPI` shim that calls Graph API
- Injects the Teams JS SDK and SheetJS before the dashboard boots

---

## Stories

### T0 — Scaffold `teams-app/` folder  *(XS — already done)*
**Status**: Done — skeleton files created in `teams-app/`

Deliverables:
- `teams-app/manifest/manifest.json` — Teams app manifest skeleton
- `teams-app/src/auth.js`, `graph.js`, `sheetjs-parser.js`, `teams-bridge.js` — I/O adapter skeletons
- `teams-app/index.html` — Teams tab shell skeleton
- `teams-app/package.json`, `teams-app/README.md`

---

### T1 — Static hosting: deploy the tab as a web app  *(S)*
**Prerequisite**: None — can be done immediately without Azure AD.

Goal: serve `teams-app/index.html` (and the shared `dashboard/` folder) over HTTPS so Teams
can load it in an iframe. The dashboard runs in read-only/paste-JSON mode at this stage.

Tasks:
- [ ] Choose host: **Azure Static Web Apps** (free tier, CI/CD from GitHub Actions)
      or GitHub Pages (simpler, no CI needed for a static file)
- [ ] Configure `staticwebapp.config.json` / `_routes.json` to serve `dashboard/` from the
      parent directory (symlink or copy step in CI)
- [ ] Verify the tab loads in Teams Developer Portal sandbox (no auth yet)
- [ ] Confirm `Content-Security-Policy` headers do not block ES module imports from `dashboard/`

Acceptance: navigating to `https://<domain>/teams-app/index.html` renders the dashboard
           with "load from JSON paste" mode working.

---

### T2 — Teams tab manifest and app registration  *(S)*
**Prerequisite**: T1 (needs a live HTTPS URL)

Goal: produce a `.zip` package installable in a Teams tenant (sideload or via admin centre).

Tasks:
- [ ] Replace all `{{YOUR_APP_DOMAIN}}` and `{{AAD_APP_CLIENT_ID}}` placeholders in
      `teams-app/manifest/manifest.json`
- [ ] Create a 192×192 `color.png` and 32×32 `outline.png` icon in `teams-app/manifest/`
      (can reuse `assets/icon.png` resized)
- [ ] Zip the `manifest/` folder: `manifest.zip` is the Teams app package
- [ ] Sideload in Teams Developer Portal → verify the tab opens and the dashboard renders
- [ ] Document Teams admin centre deployment steps in `teams-app/README.md`

Acceptance: the tab is installable in a Teams channel and personal app scope.

---

### T3 — Azure AD app registration and auth  *(S)*
**Prerequisite**: T1

Goal: users can sign in with their Microsoft identity so Graph API calls are authorized.

Tasks:
- [ ] Register an app in Azure AD (Azure Portal → App registrations)
  - Platform: Single-page application
  - Redirect URI: `https://<domain>/teams-app/auth-end.html`
  - Expose an API: `api://<domain>/<client-id>` → scope `access_as_user`
  - Delegated permissions: `Files.ReadWrite`, `Sites.ReadWrite.All`, `User.Read`
- [ ] Fill in `{{AAD_APP_CLIENT_ID}}` and `{{TENANT_ID}}` in `teams-app/src/auth.js`
- [ ] Create `teams-app/auth-end.html` (Teams auth popup callback page — 3 lines of JS)
- [ ] Wire `initAuth()` and `getAccessToken()` into `teams-app/index.html` startup sequence
- [ ] Test Teams SSO path (`getAuthToken` → token exchange) and MSAL popup fallback
      (standalone browser dev mode)

Acceptance: `await getAccessToken()` returns a valid bearer token; Graph API call to
           `GET /me` returns the user's profile.

> **Note on OBO flow**: Teams SSO returns a token scoped to your app, not Graph directly.
> To use it with Graph you need a server-side On-Behalf-Of exchange (a small Azure Function
> or App Service endpoint). Alternatively, skip Teams SSO and use MSAL popup auth — simpler
> for an internal tool. Document the trade-off in README.

---

### T4 — Client-side Excel parsing with SheetJS  *(M)*
**Prerequisite**: T3 (needs auth to fetch the file)

Goal: replace the Python `openpyxl` adapter with `teams-app/src/sheetjs-parser.js`.
      Same `mapping.yml` column-mapping schema is reused.

Tasks:
- [ ] Add SheetJS to `teams-app/package.json` (`xlsx` package) or load from CDN in `index.html`
- [ ] Complete `parseExcel(buffer, mapping)` in `sheetjs-parser.js`
  - Handle `datetime` cells (SheetJS `cellDates: true`)
  - Apply `status_mapping` and `category_mapping` from the mapping config
  - Implement `startDate`/`endDate` + `startTime`/`endTime` merge (same logic as `excel_parser.py`)
  - Emit `parallelGroup` and `description` fields when columns are mapped
- [ ] Write unit tests: `tests/sheetjs-parser.test.js` — use a fixture `.xlsx` file
- [ ] Validate output against the existing `adapter/schema.py` schema definition

Acceptance: `parseExcel(buffer, mapping)` produces output identical to `excel_parser.py`
           for a reference test spreadsheet.

---

### T5 — OneDrive / SharePoint file picker  *(M)*
**Prerequisite**: T3, T4

Goal: replace the Electron `dialog:openFolder` + `folder:readFileAsDataUrl` with a
      Graph-powered file picker that lets users choose their runbook Excel from OneDrive/SharePoint.

Tasks:
- [ ] Implement `pickFile()` in `teams-app/src/graph.js` using the
      OneDrive picker SDK (`window.open` + `postMessage` pattern)
- [ ] Implement `readExcelBytes(driveId, itemId)` — `GET /drives/{id}/items/{id}/content`
- [ ] Wire picker into `teams-app/index.html`:
      "Open runbook" button → `pickFile()` → `readExcelBytes()` → `parseExcel()` → load dashboard
- [ ] Store `{ driveId, itemId, name }` in `sessionStorage` so page reload re-fetches the file
- [ ] Handle the case where the source file is not in OneDrive (show message: "file must be in
      OneDrive or SharePoint to use the Teams tab")

Acceptance: clicking "Open runbook" in the Teams tab shows the OneDrive picker; selecting an
           `.xlsx` file loads the runbook dashboard with all tasks visible.

---

### T6 — Graph API Excel write-back  *(M)*
**Prerequisite**: T5

Goal: replace `electronAPI.writeRunbookToExcel` with a Graph API upload so "Save to Excel"
      round-trips back to the OneDrive file.

Approach: **full-file replace** (PUT the modified workbook bytes) rather than the cell-level
Electron approach. SheetJS modifies the workbook in memory; we upload the result.

Tasks:
- [ ] Implement `writeExcelBytes(driveId, itemId, arrayBuffer)` in `graph.js`
      (`PUT /drives/{id}/items/{id}/content`)
- [ ] In `teams-app/index.html`, define `window.teamsAPI.writeRunbookToExcel`:
  1. Fetch the current Excel bytes from OneDrive
  2. Parse with SheetJS (`XLSX.read`)
  3. Apply runbook state changes to the relevant sheet (Status, Actual Start, Actual End,
     Assignee, Comment columns — same set as `electron-main.js`)
  4. Re-serialize with SheetJS (`XLSX.write`)
  5. Upload via `writeExcelBytes`
- [ ] Preserve all Excel sheets, formulas, and formatting outside the runbook sheet
- [ ] Show a toast on success/failure (same pattern as Electron)

Acceptance: editing a task status in the Teams tab and hitting "Save" updates the OneDrive
           Excel file; re-opening the file in Excel shows the updated `Status (Actual)` column.

---

### T7 — Configurable tab (channel scope)  *(S)*
**Prerequisite**: T5

Goal: allow a Teams channel owner to pin a specific OneDrive runbook file to the tab, so all
      channel members see the same runbook without each having to pick the file.

Tasks:
- [ ] Create `teams-app/config.html` — a simple tab configuration page
  - Shows a file picker to choose the runbook Excel
  - Saves `{ driveId, itemId, name }` via `microsoftTeams.pages.config.setConfig()`
- [ ] In `teams-app/index.html`, read the configured file on load:
      `microsoftTeams.pages.getConfig()` → if config present, load that file automatically
- [ ] Update `manifest.json` `configurableTabs` section with the `config.html` URL
- [ ] Document in README: how channel owners configure the tab vs. personal tab usage

Acceptance: a channel tab pinned to a specific runbook auto-loads that file for all viewers.

---

### T8 — CI/CD packaging and distribution  *(S)*
**Prerequisite**: T2, T5

Goal: automate the Teams app package (`.zip`) build alongside the existing Electron/HTML builds.

Tasks:
- [ ] Add `build:teams` script to root `package.json`:
      builds the static site, packages `teams-app/manifest/` into `dist-teams/MXRunbook.zip`
- [ ] GitHub Actions workflow (`.github/workflows/teams-deploy.yml`):
      on push to `main` → build → deploy to Azure Static Web Apps → package manifest zip
      as a release artefact
- [ ] Add `teams-app/` to root `package.json` `build.files` exclusion list so it is not
      bundled into the Electron package

Acceptance: `npm run build:teams` produces `dist-teams/MXRunbook.zip` ready to upload to the
           Teams admin centre.

---

## Dependency Map

```
T0 (scaffold)
  └─ T1 (static hosting)
       ├─ T2 (manifest + sideload)
       └─ T3 (Azure AD auth)
            └─ T4 (SheetJS parser)
                 └─ T5 (file picker)
                      ├─ T6 (write-back)
                      └─ T7 (configurable tab)
T8 (CI/CD) ──── depends on T2 + T5
```

## Effort Summary

| Story | Effort | Risk | Owner |
|-------|--------|------|-------|
| T0 scaffold | XS | — | Done |
| T1 static hosting | S | Low | — |
| T2 manifest | S | Low | — |
| T3 Azure AD auth | S | Medium (OBO flow decision) | — |
| T4 SheetJS parser | M | Low | — |
| T5 file picker | M | Low | — |
| T6 write-back | M | Medium (formula preservation) | — |
| T7 configurable tab | S | Low | — |
| T8 CI/CD | S | Low | — |

**Minimum viable Teams tab**: T0 → T1 → T2 → T3 → T4 → T5 (read-only parity)
**Full feature parity with Electron**: + T6
**Production deployment**: + T7 + T8
