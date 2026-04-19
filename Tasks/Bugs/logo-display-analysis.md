# Logo Retrieval & Display — Bug Analysis & Fix Plan

## Overview

The app displays a client logo in two places:
- **Home page** (`welcome.html`) — on each recent-client card
- **Dashboard header** (`runbookDashboard.html`) — in the `#clientLogo` `<img>` element

These two pages use **completely separate mechanisms** to source the logo. Several silent failure modes cause the logo to disappear without any user feedback.

---

## Full Algorithm

### HOME PAGE (`welcome.html`)

#### Path A — Opening a NEW folder (`openNewFolder`)

```
User clicks "Open Folder"
  → electronAPI.openFolder()                    OS file picker → folderPath
  → electronAPI.readConfig(folderPath)          reads config.json
  → if cfg.logoFile:
      electronAPI.readFileAsDataUrl(folderPath, cfg.logoFile)
        → IPC: folder:readFileAsDataUrl (electron-main.js ~244)
            reads file from disk
            enforces size cap → null if exceeded (before fix)
            converts to base64 data URL: "data:image/png;base64,..."
  → electronAPI.addRecentClient({ ...fields, logoDataUrl })
      → IPC: store:addRecent (electron-main.js ~261)
          if logoDataUrl.length > 350_000 → strips to '' silently
          saves to ~/.mxrunbook/recent-clients.json
  → electronAPI.openDashboard(folderPath)
```

#### Path B — Re-opening a RECENT folder (`openRecentFolder`)

```
User clicks a recent card
  → electronAPI.readConfig(entry.path)          verify folder accessible
  → electronAPI.addRecentClient({ ...entry, lastOpened: now })
      ⚠️ spreads old entry verbatim — NEVER re-reads the logo file
  → electronAPI.openDashboard(entry.path)
```

#### Rendering recent cards (`renderRecentCards`)

```
For each stored recent entry r:
  if r.logoDataUrl is truthy:
    → <img src="{r.logoDataUrl}" onerror="show letter fallback">
  else:
    → <span> with first letter of clientName
```

---

### DASHBOARD PAGE (`runbookDashboard.html` → `dashboard/app.js`)

#### Bootstrap sequence

```
loadConfig() → detectAssets() → loadRunbook()
```

#### `loadConfig()` (~line 81)

```
if ?clientKey in URL → fetch /client-config
else                 → fetch config.json
merge into state.projectConfig
applyConfig()  ← sets title/subtitle/accent colour; does NOT touch the logo
```

#### `detectAssets()` — full logo loading logic (~line 339)

```
Step 1 — Determine URL prefix:
  isClientMode = URL has '?clientKey'
  clientPrefix = isClientMode ? '/client-asset/' : 'assets/'

Step 2 — Load logo if configured:
  if state.projectConfig.logoFile:
    loadLogo(clientPrefix + logoFile)
      img.onload → set #clientLogo.src, remove .hidden class, update favicon
      img.onerror → tryAutoDetect()   ⚠️ called even in client mode (wrong)

Step 3 — Load background:
  if state.projectConfig.backgroundFile:
    loadBg(clientPrefix + backgroundFile)
  if no backgroundFile AND not clientMode:
    loadBg('assets/Murex_background6.jpg')

Step 4 — Delayed auto-detect (150 ms timeout):
  if NOT clientMode AND (logo or bg not yet loaded):
    tryAutoDetect()   ← auto-detect fully disabled in client mode
```

#### `tryAutoDetect()` (~line 389)

```
Guard: runs only once (autoDetectAttempted flag)
fetch('assets/')                     ⚠️ hardcoded path — wrong in client mode
  parse HTML for href matching *logo*.(png|jpg|jpeg|svg|webp)
  on success: loadLogo('assets/' + logoName)
  on fetch error (no directory listing):
    parallel Image() guesses: logo.*, client-logo.*, clientlogo.*
```

---

## Bugs Found

| # | Bug | File & Location | Impact |
|---|-----|-----------------|--------|
| B1 | Recent re-open never refreshes `logoDataUrl` | `welcome.html openRecentFolder` | Logo stays missing forever if null on first open |
| B2 | Silent 350 K char cap strips stored logos without warning | `electron-main.js store:addRecent ~264` | Large logos vanish with no feedback |
| B3 | 256 KB hard cap returns `null` instead of resizing | `electron-main.js readFileAsDataUrl ~253` | Any logo > 256 KB is silently dropped |
| B4 | `tryAutoDetect()` hardcodes `'assets/'` path | `dashboard/app.js ~393` | In client mode fetches wrong URL, finds nothing |
| B5 | `img.onerror` calls `tryAutoDetect()` even in client mode | `dashboard/app.js ~360` | Silent no-op in client mode when logoFile is wrong |
| B6 | Config fetch failure is silently swallowed | `dashboard/app.js ~86-88` | `state.projectConfig.logoFile` stays undefined; no logo loads |

---

## Fix Plan

### Fix B3 + B2 — Auto-resize logo in the IPC handler (`electron-main.js`)

**Status: ✅ Implemented**

`sharp` (already installed, moved to `dependencies`) is used inside the `folder:readFileAsDataUrl` handler. The handler is now `async`. Files already under 250 KB are returned unchanged. Larger files go through a 3-pass resize pipeline:

| Pass | Dimensions | Format | Quality |
|------|-----------|--------|---------|
| 1 | 512 × 512 max | PNG (lossless) | compressionLevel 9 |
| 2 | 256 × 256 max | JPEG | 85% |
| 3 | 128 × 128 max | JPEG | 60% |

**Why 250 KB?** 250 KB binary → ~333 K base64 chars → safely under the 350 K `store:addRecent` cap.

```javascript
// electron-main.js ~245
ipcMain.handle('folder:readFileAsDataUrl', async (_, folderPath, filename) => {
    // ...security checks...
    const data = fs.readFileSync(filePath);
    const TARGET = 250 * 1024;

    if (data.length <= TARGET) {
        return `data:${mime};base64,${data.toString('base64')}`;
    }

    const sharp = require('sharp');
    // Pass 1: PNG, 512×512 max
    let out = await sharp(data).resize(512,512,{fit:'inside',withoutEnlargement:true}).png({compressionLevel:9}).toBuffer();
    if (out.length <= TARGET) return `data:image/png;base64,${out.toString('base64')}`;
    // Pass 2: JPEG 85%, 256×256 max
    out = await sharp(data).resize(256,256,{fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
    if (out.length <= TARGET) return `data:image/jpeg;base64,${out.toString('base64')}`;
    // Pass 3: JPEG 60%, 128×128 max (last resort)
    out = await sharp(data).resize(128,128,{fit:'inside',withoutEnlargement:true}).jpeg({quality:60}).toBuffer();
    return `data:image/jpeg;base64,${out.toString('base64')}`;
});
```

---

### Fix B1 — Refresh `logoDataUrl` on every recent folder open (`welcome.html`)

**Status: ✅ Implemented**

`openRecentFolder` now re-reads the logo file after verifying the config, using the same `readFileAsDataUrl` call as `openNewFolder`. The fresh data URL is passed to `addRecentClient`, replacing the stale stored value.

```javascript
// welcome.html openRecentFolder
let logoDataUrl = entry.logoDataUrl || '';
if (cfg.logoFile) {
    logoDataUrl = await window.electronAPI.readFileAsDataUrl(entry.path, cfg.logoFile) || logoDataUrl;
}
await window.electronAPI.addRecentClient({ ...entry, logoDataUrl, lastOpened: new Date().toISOString() });
```

---

### Fix B4 + B5 — Use correct prefix in `tryAutoDetect`, guard client mode (`dashboard/app.js`)

**Status: ✅ Implemented**

- `loadLogo`/`loadBg` `onerror` handlers now only call `tryAutoDetect()` when `!isClientMode`.
- `tryAutoDetect` now fetches `clientPrefix` instead of the hardcoded `'assets/'`, and uses `clientPrefix` when building all guessed filenames.

```javascript
// loadLogo onerror
img.onerror = () => {
    if (!isClientMode) tryAutoDetect();
};

// tryAutoDetect
fetch(clientPrefix)   // was hardcoded 'assets/'
    .then(...)
    .catch(() => {
        ['logo', 'client-logo', 'clientlogo'].forEach(base => {
            exts.forEach(ext => loadLogo(clientPrefix + base + '.' + ext));
        });
    });
```

---

### Fix B6 — Surface config load failure (minor / low-risk)

**Status: ⏳ Recommended (not yet applied)**

Add a `console.warn` so config failures appear in DevTools without breaking the app:

```javascript
} catch(e) {
    console.warn('Config load failed — using defaults:', e);
}
```

---

## Files Modified

| File | Change |
|------|--------|
| `electron-main.js` | `readFileAsDataUrl` → async + 3-pass sharp resize pipeline |
| `welcome.html` | `openRecentFolder` → re-reads logo on every open |
| `dashboard/app.js` | `onerror` guards + `tryAutoDetect` uses `clientPrefix` |
| `package.json` | Moved `sharp` from `devDependencies` → `dependencies` |

---

## Verification Steps

1. Place a logo **> 256 KB** in a client folder, reference it in `config.json` → open folder → confirm logo appears on home card (auto-resized, not dropped)
2. Change the logo file on disk → re-open same folder from recents → confirm new logo appears (not cached stale)
3. Set `logoFile` to a **nonexistent filename** in client mode → open dashboard → confirm no JS errors, graceful fallback to letter/no logo
4. Delete `config.json` → open dashboard → confirm `console.warn` appears in DevTools, app still loads
5. Open dashboard **without `?clientKey`** → confirm auto-detect still probes `assets/` directory listing correctly
