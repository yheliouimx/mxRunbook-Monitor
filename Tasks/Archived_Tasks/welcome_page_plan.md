# Welcome Page & Client Folder Selector — Full Implementation Plan

**Date:** 2026-04-18  
**Status:** Planning

---

## Feature Overview

When the Electron app opens, instead of landing on a blank/generic dashboard,
the user sees a **Welcome Page** with:

1. The Murex background image — always visible (never blank)
2. A hero "Open Client Runbook" button (styled as a stat card, folder picker)
3. A "Recent Runbooks" grid at the bottom — previous clients rendered as stat-card tiles
   with their client logo, name, project, and last-opened date
4. Clicking any card (new or recent) → navigates to the fully configured dashboard

The background (`Murex_background6.jpg`) is the permanent visual base.
No client element is ever generic or missing once a folder is selected.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Electron Main Process (electron-main.js)                           │
│                                                                     │
│  ┌─────────────────┐   ┌───────────────────────────────────────┐   │
│  │  HTTP Server    │   │  IPC Handlers                         │   │
│  │  port 8090      │   │  dialog:openFolder                    │   │
│  │                 │   │  folder:readConfig                    │   │
│  │  / → welcome    │   │  folder:readFileAsDataUrl             │   │
│  │  /runbook*      │   │  store:getRecent                      │   │
│  │  /client-config │   │  store:addRecent                      │   │
│  │  /client-asset/ │   │  store:removeRecent                   │   │
│  └─────────────────┘   │  client:setDir                        │   │
│                        │  nav:openDashboard                    │   │
│                        │  nav:openWelcome                      │   │
│                        └───────────────────────────────────────┘   │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ IPC
              ┌────────────────────┤
              │                    │
       ┌──────▼──────┐    ┌───────▼──────────────┐
       │ welcome.html│    │ runbookDashboard.html │
       │             │    │                      │
       │ preload.js  │    │ preload.js           │
       │ (contextBridge)  │ (same bridge)        │
       └─────────────┘    └──────────────────────┘
```

### Key principle
The HTTP server continues to serve app files from `ROOT` (the app directory).
A separate in-process variable `currentClientDir` is updated when a folder is selected.
Two new HTTP routes proxy files from `currentClientDir`:
- `GET /client-config` → `{currentClientDir}/config.json`
- `GET /client-asset/{filename}` → `{currentClientDir}/{filename}`

This keeps the HTTP server as the single file source for the renderer,
with no `file://` protocol or `webSecurity: false` needed.

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `preload.js` | **Create** | Electron contextBridge — exposes `window.electronAPI` |
| `welcome.html` | **Create** | Landing page (self-contained HTML + inline JS) |
| `electron-main.js` | **Modify** | IPC handlers, client dir routing, preload, start URL |
| `dashboard/app.js` | **Modify** | Load config from `/client-config`, always-on background, back button |
| `runbookDashboard.html` | **Modify** | Back-to-welcome button in header, `#bgOverlay` fallback style |

---

## Phase 1 — Electron Preload Bridge

**File: `preload.js`** (new, app root)

Expose via `contextBridge.exposeInMainWorld('electronAPI', {...})`:

```js
window.electronAPI = {
  openFolder()                  // → string|null (selected folder path)
  readConfig(folderPath)        // → object|null (parsed config.json from folder)
  readFileAsDataUrl(filePath)   // → string|null (base64 data URL for logo display)
  getRecentClients()            // → RecentClient[]
  addRecentClient(entry)        // → void
  removeRecentClient(path)      // → void
  openDashboard(folderPath)     // → void (navigate BrowserWindow to dashboard)
  openWelcome()                 // → void (navigate back to welcome.html)
  isElectron: true              // constant flag for feature detection
}
```

**`RecentClient` shape:**
```ts
{
  path: string           // absolute folder path
  clientName: string     // from config.client
  projectName: string    // from config.projectName
  subtitle: string       // from config.subtitle
  accentColor: string    // from config.accentColor
  logoFile: string       // filename only
  backgroundFile: string // filename only
  logoDataUrl: string    // base64 — stored so welcome page works offline
  lastOpened: string     // ISO timestamp
}
```

**`electron-main.js` changes for Phase 1:**
- Add `preload: path.join(ROOT, 'preload.js')` to `BrowserWindow.webPreferences`
- Import `dialog`, `ipcMain` from electron
- Register IPC handlers for each channel above (see Phase 2 for store, Phase 3 for nav)

---

## Phase 2 — Recent Client Store

**Stored at:** `{app.getPath('userData')}/recent-clients.json`
(userData is already redirected to `os.tmpdir()/mxrunbook-electron`)

Prefer a permanent location — use `path.join(os.homedir(), '.mxrunbook', 'recent-clients.json')` 
so the list survives app reinstalls and doesn't get wiped with temp files.

**Store API (in `electron-main.js` — internal helpers):**

```js
function loadRecentClients()          // parse JSON file → array, default []
function saveRecentClients(arr)       // write JSON file (create dir if needed)
function addOrUpdateRecent(entry)     // upsert by path, sort by lastOpened desc, keep max 10
function removeRecent(folderPath)     // filter out by path
```

**IPC handlers:**
- `ipcMain.handle('store:getRecent', () => loadRecentClients())`
- `ipcMain.handle('store:addRecent', (_, entry) => { addOrUpdateRecent(entry); })`
- `ipcMain.handle('store:removeRecent', (_, p) => { removeRecent(p); })`

**Security:** validate that `entry.path` is a string and doesn't contain dangerous characters
before writing. The logo data URL is bounded at 512KB (reject larger).

---

## Phase 3 — HTTP Server Client Routing

Add to `electron-main.js`:

```js
let currentClientDir = null;  // set by 'client:setDir' IPC

// IPC handler
ipcMain.handle('client:setDir', (_, dir) => { currentClientDir = dir; });
```

In the HTTP `createServer` callback, add two new route branches **before** the
general file-serve logic:

```
GET /client-config
  → read {currentClientDir}/config.json
  → 404 if currentClientDir null or file missing

GET /client-asset/{filename}
  → validate filename (no path traversal: must not contain / or ..)
  → read {currentClientDir}/{filename}
  → 404 if missing
```

Path traversal guard for `/client-asset/`:
```js
const name = urlPath.replace('/client-asset/', '');
if (name.includes('/') || name.includes('..') || name.includes('\\')) {
    res.writeHead(400); res.end('Bad Request'); return;
}
const clientFile = path.join(currentClientDir, name);
// serve clientFile
```

---

## Phase 4 — Welcome Page (`welcome.html`)

**Self-contained single file** — no ES module imports (simpler, no module server dependency).
Uses inline `<style>` and inline `<script>`. Shares the same CSS custom-property tokens
already defined in `runbookDashboard.html` (duplicate the `:root` block).

### Visual Design

```
┌──────────────────────────────────────────────────────────────────────┐
│  [Murex background — fixed, full bleed, with dark gradient overlay]  │
│                                                                      │
│         ┌────────────────────────────────────────────┐              │
│         │  [murex-logo-white.png]                    │  glass panel │
│         │                                            │              │
│         │  Go-Live Runbook Dashboard                 │              │
│         │  ─────────────────────────────             │              │
│         │                                            │              │
│         │  ┌──────────────────────────────────────┐ │              │
│         │  │   📁  Open Client Runbook Folder     │ │  "open" card │
│         │  │       Select a folder to begin       │ │              │
│         │  └──────────────────────────────────────┘ │              │
│         │                                            │              │
│         └────────────────────────────────────────────┘              │
│                                                                      │
│  ─────────────── Recent Runbooks ────────────────────────────────    │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │ [ClientLogo]│  │ [ClientLogo]│  │ [ClientLogo]│  │    ...    │  │
│  │  MKS PAMP   │  │  LBG Fermat │  │  Deutsche B │  │           │  │
│  │  DR2        │  │  Migration  │  │  Go-Live    │  │           │  │
│  │  2026-04-17 │  │  2026-03-28 │  │  2026-03-01 │  │           │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
│  [✕ remove]                                                          │
└──────────────────────────────────────────────────────────────────────┘
```

### Card anatomy (recent runbook card)

Modelled exactly after `.stat-card` from the dashboard:
- Glass background (`--glass-bg`, `backdrop-filter: blur`)
- `4px` left border accent using client's `accentColor`
- Client logo in top-left (circle-cropped, 48×48px)
- `clientName` as value, `projectName` as label
- Last-opened date as secondary text
- Full card is clickable → opens that client folder
- `✕` remove button (top-right, appears on hover)
- Hover: `transform: translateY(-2px)`, accent border brightens

### "Open Client Runbook" primary card

Same card style but larger, centered, full-width:
- Icon: folder SVG
- Value: "Open Runbook Folder"
- Label: "Select a client folder (config.json + runbook)"
- Accent color: `--color-primary` (default teal)
- Click: trigger `electronAPI.openFolder()`

### JavaScript flow (inline in `welcome.html`):

```js
async function init() {
    applyTheme();
    const recents = await electronAPI.getRecentClients();
    renderRecentCards(recents);
}

async function openNewFolder() {
    const folderPath = await electronAPI.openFolder();
    if (!folderPath) return;  // user cancelled
    const cfg = await electronAPI.readConfig(folderPath);
    if (!cfg) { showError('No config.json found in that folder'); return; }
    const logoDataUrl = cfg.logoFile
        ? await electronAPI.readFileAsDataUrl(path.join(folderPath, cfg.logoFile))
        : null;
    await electronAPI.addRecentClient({
        path: folderPath,
        clientName: cfg.client || cfg.projectName,
        projectName: cfg.projectName,
        subtitle: cfg.subtitle || '',
        accentColor: cfg.accentColor || '#10b981',
        logoFile: cfg.logoFile || '',
        backgroundFile: cfg.backgroundFile || '',
        logoDataUrl: logoDataUrl || '',
        lastOpened: new Date().toISOString()
    });
    await electronAPI.openDashboard(folderPath);
}

async function openRecentFolder(folderPath) {
    const cfg = await electronAPI.readConfig(folderPath);
    if (!cfg) { showError('Folder no longer accessible: ' + folderPath); return; }
    await electronAPI.addRecentClient({ ...existingEntry, lastOpened: new Date().toISOString() });
    await electronAPI.openDashboard(folderPath);
}
```

### `electronAPI.openDashboard(folderPath)` (in main process):
1. Calls `ipcMain` handler → sets `currentClientDir = folderPath`
2. Generates `clientKey = slugify(path.basename(folderPath))`
3. Navigates BrowserWindow to `http://127.0.0.1:{port}/runbookDashboard.html?clientKey={slug}`
4. The dashboard then uses `clientKey` for its localStorage namespace (already in `persistence.js`)
   and fetches `/client-config` instead of `config.json`

---

## Phase 5 — Dashboard Config Integration

### `dashboard/app.js` — `loadConfig()` change

```js
async function loadConfig() {
    try {
        // Detect if running with a client folder selected (Electron) vs dev server
        const hasClientDir = new URLSearchParams(window.location.search).has('clientKey');
        const configUrl = hasClientDir ? '/client-config' : 'config.json';
        const res = await fetch(configUrl);
        const cfg = await res.json();
        Object.assign(state.projectConfig, cfg);
    } catch(e) { /* config.json optional — use defaults */ }
    applyConfig();
}
```

### `dashboard/app.js` — `detectAssets()` change

```js
// Prefix to use for asset fetching
const clientPrefix = new URLSearchParams(window.location.search).has('clientKey')
    ? '/client-asset/'
    : 'assets/';

// Replace all 'assets/' references in loadLogo / loadBg calls with clientPrefix
if (state.projectConfig.logoFile) loadLogo(clientPrefix + state.projectConfig.logoFile);
if (state.projectConfig.backgroundFile) loadBg(clientPrefix + state.projectConfig.backgroundFile);
```

### Always-on background fallback

In `detectAssets()`, if no `backgroundFile` in config AND no `clientKey` param,
always attempt `loadBg('assets/Murex_background6.jpg')` so the dashboard is
never plain black.

### Back-to-welcome button

In `dashboard/app.js` `init()`:
```js
if (window.electronAPI && window.electronAPI.isElectron) {
    const backBtn = document.getElementById('backToWelcomeBtn');
    if (backBtn) {
        backBtn.style.display = 'inline-flex';
        backBtn.addEventListener('click', () => window.electronAPI.openWelcome());
    }
}
```

In `runbookDashboard.html` header area — add a small "← Home" button (hidden by default,
shown only in Electron context via the JS above).

---

## Phase 6 — Background Always-On

### `runbookDashboard.html` CSS

The `#bgOverlay` element currently gets its background via JS (`detectAssets()`).
Add a CSS fallback so it always has *something* even before JS runs or if no config:

```css
#bgOverlay {
    background-image: url('assets/Murex_background6.jpg');
    background-size: cover;
    background-position: center;
    /* ... rest of existing styles ... */
}
```

When JS then calls `loadBg(clientFile)` it overwrites with the client background.
If no client background exists, the Murex default remains.

---

## Implementation Order

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
  |           |         |          |          |         |
preload    recent    HTTP       welcome    dashboard  always-bg
  .js      store    routes      .html      config     fallback
```

Each phase is independently testable:
- P1: `window.electronAPI` available in DevTools → folder dialog opens
- P2: Recent list persists across app restarts
- P3: `/client-config` and `/client-asset/logo.png` return 200 after folder selected
- P4: Welcome page renders correctly; cards click through to dashboard
- P5: Dashboard header shows correct client name + logo after navigation
- P6: Background always present even with no config

---

## File Change Summary

### `preload.js` (new, ~80 lines)
- `contextBridge.exposeInMainWorld`
- 9 IPC invoke wrappers
- `isElectron: true` constant

### `electron-main.js` (modify, ~+120 lines)
- Import `ipcMain`, `dialog`
- `preload` in `webPreferences`
- `currentClientDir` variable
- 2 new HTTP routes (`/client-config`, `/client-asset/`)
- 7 IPC handlers
- `loadRecentClients()`, `saveRecentClients()`, `addOrUpdateRecent()`, `removeRecent()` helpers
- Open `welcome.html` instead of `runbookDashboard.html` on start

### `welcome.html` (new, ~350 lines)
- Full HTML page with inline CSS (subset of dashboard tokens)
- Murex background, glass panel, stat-card-style cards
- Inline JS: `init()`, `openNewFolder()`, `openRecentFolder()`, `renderRecentCards()`
- Error toast for inaccessible folders

### `runbookDashboard.html` (modify, ~+5 lines)
- Add `#backToWelcomeBtn` button element in header (hidden by default)
- Add CSS fallback `background-image` to `#bgOverlay`

### `dashboard/app.js` (modify, ~+20 lines)
- `loadConfig()`: conditional `/client-config` vs `config.json`
- `detectAssets()`: `clientPrefix` variable, always-on bg fallback
- Back button wire-up in `init()`

---

## Out of Scope (deferred)

- Drag-and-drop folder onto welcome page (can be added later)
- Editing recent client entries (name, logo) from welcome page
- Multiple simultaneous client windows
- Auto-refresh if client folder contents change on disk
