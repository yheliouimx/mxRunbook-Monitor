// ============================================================
// electron-main.js — Electron launcher for RunbookDashboard
// ============================================================
// Starts the same HTTP server in-process, then opens a native
// BrowserWindow instead of the system browser.
// Zero changes to dashboard/, adapter/, or any existing file.
//
// Setup:  npm install
// Run:    npm run electron
// ============================================================

'use strict';

// Redirect userData to a local temp path so Chromium can write its
// GPU shader cache — avoids "Unable to move the cache: Access is denied"
// errors that occur when running from an OneDrive-synced folder.
const os   = require('os');
const path = require('path');
const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
app.setPath('userData', path.join(os.tmpdir(), 'mxrunbook-electron'));
const http = require('http');
const fs   = require('fs');

const MIMES = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.css':  'text/css',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg':  'image/svg+xml',
    '.yml':  'text/yaml',
    '.webp': 'image/webp',
    '.ico':  'image/x-icon',
};

const PREFERRED_PORT = 8090;
const FALLBACK_PORTS = [8091, 8092, 8093, 9000, 9090, 3000, 4000];
const ROOT           = __dirname;

// ── Client dir state ─────────────────────────────────────────
let currentClientDir = null;  // set when user selects a client folder
let serverPort       = null;  // set after HTTP server starts

// ── Recent clients store ─────────────────────────────────────
// Persisted at ~/.mxrunbook/recent-clients.json so the list
// survives app reinstalls and temp-dir cleanups.
const RECENT_FILE = path.join(os.homedir(), '.mxrunbook', 'recent-clients.json');
const RECENT_MAX  = 10;

// ── Dashboard config (global app settings — irrespective of client) ──
const DASHBOARD_CONFIG_PATH     = path.join(ROOT, 'dashboard-config.json');
const DASHBOARD_CONFIG_DEFAULTS = { theme: 'dark', backgroundImage: 'Murex_background6.jpg' };

function loadDashboardConfig() {
    try {
        return { ...DASHBOARD_CONFIG_DEFAULTS, ...JSON.parse(fs.readFileSync(DASHBOARD_CONFIG_PATH, 'utf8')) };
    } catch (_) { return { ...DASHBOARD_CONFIG_DEFAULTS }; }
}
function saveDashboardConfig(updates) {
    try {
        const merged = { ...loadDashboardConfig(), ...updates };
        fs.writeFileSync(DASHBOARD_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
        return merged;
    } catch (_) { return null; }
}

// ── Excel save-back helpers ──────────────────────────────────
// Locate the original .xlsx in the client folder.
// Checks config.json for an explicit "excelFile" field first,
// then auto-discovers the first *.xlsx that isn't a backup.
function resolveExcelFile(clientDir) {
    try {
        const cfgPath = findConfigFile(clientDir);
        if (cfgPath) {
            const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
            if (cfg.excelFile && typeof cfg.excelFile === 'string') {
                const explicit = path.resolve(clientDir, cfg.excelFile);
                if (explicit.startsWith(path.resolve(clientDir)) && fs.existsSync(explicit))
                    return explicit;
            }
        }
    } catch (_) { /* fall through to discovery */ }
    try {
        const files = fs.readdirSync(clientDir);
        const xlsx = files
            .filter(f => /\.xlsx$/i.test(f) && !/_backup_\d{12}\.xlsx$/i.test(f))
            .sort()[0];
        if (xlsx) return path.join(clientDir, xlsx);
    } catch (_) { /* unreadable dir */ }
    return null;
}

// Parse mapping.yml (yaml subset: only key: "value" lines, no multi-document).
// Returns { columns, status_mapping, sheet } with sensible defaults.
function parseSimpleYaml(text) {
    const result = { columns: {}, status_mapping: {}, sheet: null };
    let section = null;
    for (const raw of text.split('\n')) {
        const line = raw.replace(/#.*$/, '').trimEnd();
        if (!line.trim()) continue;
        const indent = line.match(/^(\s*)/)[1].length;
        const trimmed = line.trim();
        if (indent === 0) {
            const m = trimmed.match(/^(\w+)\s*:\s*(.*)$/);
            if (m) {
                section = m[1];
                if (m[2] && m[2] !== '') result[section] = m[2].replace(/^["']|["']$/g, '');
            }
        } else {
            const m = trimmed.match(/^([\w]+)\s*:\s*(.*)$/);
            if (m && typeof result[section] === 'object') {
                const val = m[2].trim().replace(/^["']|["']$/g, '');
                if (val && val.toLowerCase() !== 'null') result[section][m[1]] = val;
            }
        }
    }
    return result;
}

// Load column mapping using the 4-level hierarchy described in the plan.
// Returns { colMap: { task, status, startTime, endTime, item, assignee },
//           reverseStatus: Map<canonical → excel value>,
//           sheet: string|null }
function loadColumnMapping(clientDir) {
    const defaults = { task: 'task', status: 'status', startTime: 'startTime',
                       endTime: 'endTime', item: 'item', assignee: 'assignee' };
    let parsed = null;
    for (const candidate of [
        path.join(clientDir, 'mapping.yml'),
        path.join(ROOT, 'mapping.yml'),
    ]) {
        try {
            parsed = parseSimpleYaml(fs.readFileSync(candidate, 'utf8'));
            break;
        } catch (_) { /* try next */ }
    }
    // Also check config.json for inline excelMapping
    try {
        const cfgPath = findConfigFile(clientDir);
        if (cfgPath) {
            const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
            if (cfg.excelMapping && typeof cfg.excelMapping === 'object') {
                parsed = { columns: cfg.excelMapping, status_mapping: cfg.excelStatusMapping || {}, sheet: null };
            }
        }
    } catch (_) { /* ignore */ }

    const cols  = (parsed && parsed.columns)        || {};
    const smRaw = (parsed && parsed.status_mapping) || {};
    const sheet = (parsed && typeof parsed.sheet === 'string') ? parsed.sheet : null;

    const colMap = {
        task:      cols.task      || defaults.task,
        status:    cols.status    || defaults.status,
        startTime: cols.startTime || defaults.startTime,
        endTime:   cols.endTime   || defaults.endTime,
        item:      cols.item      || defaults.item,
        assignee:  cols.assignee  || defaults.assignee,
    };
    // Build reverse status map: "Completed" → "Done" (first match wins)
    const reverseStatus = new Map();
    for (const [excelVal, canonical] of Object.entries(smRaw)) {
        if (!reverseStatus.has(canonical)) reverseStatus.set(canonical, excelVal);
    }
    return { colMap, reverseStatus, sheet };
}

// Scan the header row of a worksheet and return a map of
// column-name → 1-based column index.
function buildHeaderIndex(ws) {
    const idx = new Map();
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell, colNum) => {
        const v = cell.value != null ? String(cell.value).trim() : '';
        if (v) idx.set(v, colNum);
    });
    return idx;
}

// Find or create a column by header name.
// Returns the 1-based column number, adding a new header cell if missing.
function ensureColumn(ws, headerIdx, name) {
    if (headerIdx.has(name)) return headerIdx.get(name);
    const newCol = ws.columnCount + 1;
    ws.getRow(1).getCell(newCol).value = name;
    headerIdx.set(name, newCol);
    return newCol;
}

// Format an ISO datetime / time-only string for writing into Excel as plain text.
function formatTimeForExcel(iso) {
    if (!iso) return '';
    return String(iso).replace('T', ' ').replace(/:\d\d$/, ''); // "2026-04-15 09:00"
}

// Build task-lookup indexes from the worksheet data rows (rows 2+).
// Returns { byItem: Map<item→rowNum>, byTask: Map<task→rowNum[]> }
// byTask uses an array to handle duplicate task texts (consumed FIFO).
function buildRowIndex(ws, colMap, headerIdx) {
    const itemCol = headerIdx.get(colMap.item);
    const taskCol = headerIdx.get(colMap.task);
    const byItem  = new Map();
    const byTask  = new Map();
    ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        if (itemCol) {
            const v = row.getCell(itemCol).value;
            const s = v != null ? String(v).trim() : '';
            if (s && !byItem.has(s)) byItem.set(s, rowNum);
        }
        if (taskCol) {
            const v = row.getCell(taskCol).value;
            const s = v != null ? String(v).trim() : '';
            if (s) {
                if (!byTask.has(s)) byTask.set(s, []);
                byTask.get(s).push(rowNum);
            }
        }
    });
    return { byItem, byTask };
}

function loadRecentClients() {
    try { return JSON.parse(fs.readFileSync(RECENT_FILE, 'utf8')); }
    catch (_) { return []; }
}
function saveRecentClients(arr) {
    try {
        fs.mkdirSync(path.dirname(RECENT_FILE), { recursive: true });
        fs.writeFileSync(RECENT_FILE, JSON.stringify(arr, null, 2), 'utf8');
    } catch (_) { /* ignore write errors */ }
}
function addOrUpdateRecent(entry) {
    const list = loadRecentClients();
    const idx  = list.findIndex(r => r.path === entry.path);
    if (idx >= 0) list.splice(idx, 1);
    list.unshift(entry);
    saveRecentClients(list.slice(0, RECENT_MAX));
}
function removeRecent(folderPath) {
    saveRecentClients(loadRecentClients().filter(r => r.path !== folderPath));
}

// ── Config / runbook file discovery ──────────────────────
// Clients name their files like "mks_config.json" / "mks_runbook.json"
// rather than the canonical names.  These helpers find whichever variant
// is present, trying the canonical name first then *_config.json / *_runbook.json.
function findConfigFile(folderPath) {
    const canonical = path.join(folderPath, 'config.json');
    if (fs.existsSync(canonical)) return canonical;
    try {
        const files = fs.readdirSync(folderPath);
        const match = files.filter(f => /^.+_config\.json$/i.test(f)).sort()[0];
        if (match) return path.join(folderPath, match);
    } catch (_) { /* unreadable dir */ }
    return null;
}

function findRunbookFile(folderPath) {
    const canonical = path.join(folderPath, 'runbook.json');
    if (fs.existsSync(canonical)) return canonical;
    try {
        const files = fs.readdirSync(folderPath);
        const match = files.filter(f => /^.+_runbook\.json$/i.test(f)).sort()[0];
        if (match) return path.join(folderPath, match);
    } catch (_) { /* unreadable dir */ }
    return null;
}

// ── HTTP server (same logic as _serve.js / _launcher.js) ─────
const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);

    // ── Client proxy routes (must precede general file-serve) ──
    if (urlPath === '/client-config') {
        if (!currentClientDir) { res.writeHead(404); res.end('No client selected'); return; }
        const cfgPath = findConfigFile(currentClientDir);
        if (!cfgPath) { res.writeHead(404); res.end('No config file found in client folder'); return; }
        fs.readFile(cfgPath, (err, data) => {
            if (err) { res.writeHead(404); res.end('Config file unreadable'); return; }
            try {
                const cfg = JSON.parse(data);
                // Auto-inject runbookFile if not set — discover *_runbook.json in the folder
                if (!cfg.runbookFile) {
                    const rbPath = findRunbookFile(currentClientDir);
                    if (rbPath) cfg.runbookFile = path.basename(rbPath);
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(cfg));
            } catch (_) {
                // Unparseable JSON — serve raw so the client gets a useful error
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(data);
            }
        });
        return;
    }

    if (urlPath.startsWith('/client-asset/')) {
        if (!currentClientDir) { res.writeHead(404); res.end('No client selected'); return; }
        const assetName = urlPath.slice('/client-asset/'.length);
        // Path traversal guard — bare filename only, no separators or dots
        if (!assetName || /[\/\\]/.test(assetName) || assetName.includes('..')) {
            res.writeHead(400); res.end('Bad Request'); return;
        }
        const assetPath = path.join(currentClientDir, assetName);
        fs.readFile(assetPath, (err, data) => {
            if (err) { res.writeHead(404); res.end('Asset not found'); return; }
            const ext = path.extname(assetPath).toLowerCase();
            res.writeHead(200, { 'Content-Type': MIMES[ext] || 'application/octet-stream' });
            res.end(data);
        });
        return;
    }

    if (urlPath === '/') urlPath = '/welcome.html';

    // Prevent path traversal attacks
    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'EISDIR') {
                try {
                    const files = fs.readdirSync(filePath);
                    const html = files.map(n => `<a href="${n}">${n}</a>`).join('\n');
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(html);
                } catch (_) { res.writeHead(404); res.end('Not found'); }
                return;
            }
            res.writeHead(404); res.end('Not found'); return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIMES[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

function tryListen(port) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
            server.removeListener('error', reject);
            resolve(port);
        });
    });
}

async function startServer() {
    for (const port of [PREFERRED_PORT, ...FALLBACK_PORTS]) {
        try { return await tryListen(port); }
        catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
    }
    throw new Error('No free port found in range');
}

// ── Electron window ───────────────────────────────────────────
let win = null;

function createWindow(port) {
    win = new BrowserWindow({
        width:    1440,
        height:   900,
        minWidth:  900,
        minHeight: 600,
        title: 'Go-Live Runbook Dashboard',
        icon: fs.existsSync(path.join(ROOT, 'assets', 'icon.ico'))
            ? path.join(ROOT, 'assets', 'icon.ico')
            : undefined,
        webPreferences: {
            nodeIntegration: false,   // keep renderer sandboxed
            contextIsolation: true,
            preload: path.join(ROOT, 'preload.js'),
        },
    });

    win.loadURL(`http://127.0.0.1:${port}/`);

    // Open any <a target="_blank"> links in the system browser, not a new Electron window
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    win.setMenuBarVisibility(false);
    win.on('closed', () => { win = null; });
}

// ── IPC Handlers ─────────────────────────────────────────────
function registerIpcHandlers() {

    // Open native folder picker
    ipcMain.handle('dialog:openFolder', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            properties: ['openDirectory'],
            title: 'Select Client Runbook Folder',
        });
        return canceled ? null : filePaths[0];
    });

    // Read the config file from an arbitrary folder path.
    // Accepts canonical "config.json" or client-named "*_config.json" variants.
    ipcMain.handle('folder:readConfig', (_, folderPath) => {
        if (typeof folderPath !== 'string') return null;
        try {
            const cfgPath = findConfigFile(path.resolve(folderPath));
            if (!cfgPath) return null;
            return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        } catch (_) { return null; }
    });

    // Read an image file from within folderPath; return as base64 data URL.
    // Files already under 250 KB are returned as-is. Larger files are automatically
    // resized down using sharp (PNG → JPEG progressive fallback) so they always fit
    // under the 350 K base64 character cap enforced by store:addRecent.
    ipcMain.handle('folder:readFileAsDataUrl', async (_, folderPath, filename) => {
        if (typeof folderPath !== 'string' || typeof filename !== 'string') return null;
        if (/[\/\\]/.test(filename) || filename.includes('..')) return null;
        try {
            const filePath = path.join(folderPath, filename);
            if (!path.resolve(filePath).startsWith(path.resolve(folderPath))) return null;
            const data = fs.readFileSync(filePath);
            const TARGET = 250 * 1024; // 250 KB → ~333 K base64 chars, safely under 350 K cap
            const ext = path.extname(filename).toLowerCase();

            if (data.length <= TARGET) {
                const mime = MIMES[ext] || 'application/octet-stream';
                return `data:${mime};base64,${data.toString('base64')}`;
            }

            // File exceeds target — resize with sharp rather than silently dropping it
            const sharp = require('sharp');

            // Pass 1: preserve transparency via PNG, resize to 512×512 max
            let out = await sharp(data)
                .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
                .png({ compressionLevel: 9 })
                .toBuffer();
            if (out.length <= TARGET)
                return `data:image/png;base64,${out.toString('base64')}`;

            // Pass 2: JPEG at 85% quality, 256×256 max (drops transparency)
            out = await sharp(data)
                .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();
            if (out.length <= TARGET)
                return `data:image/jpeg;base64,${out.toString('base64')}`;

            // Pass 3: JPEG at 60% quality, 128×128 (last resort)
            out = await sharp(data)
                .resize(128, 128, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 60 })
                .toBuffer();
            return `data:image/jpeg;base64,${out.toString('base64')}`;
        } catch (_) { return null; }
    });

    // Recent client persistence
    ipcMain.handle('store:getRecent',    ()        => loadRecentClients());
    ipcMain.handle('store:addRecent',    (_, entry) => {
        if (!entry || typeof entry.path !== 'string') return;
        // Cap logoDataUrl to prevent bloated JSON storage
        if (typeof entry.logoDataUrl === 'string' && entry.logoDataUrl.length > 350_000) {
            entry = { ...entry, logoDataUrl: '' };
        }
        addOrUpdateRecent(entry);
    });
    ipcMain.handle('store:removeRecent', (_, p) => {
        if (typeof p === 'string') removeRecent(p);
    });

    // Navigate the window to the dashboard for a given client folder
    ipcMain.handle('nav:openDashboard', (_, folderPath) => {
        if (!win || typeof folderPath !== 'string') return;
        currentClientDir = folderPath;
        const slug = path.basename(folderPath)
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        win.loadURL(
            `http://127.0.0.1:${serverPort}/runbookDashboard.html?clientKey=${encodeURIComponent(slug)}`
        );
    });

    // Navigate back to the welcome page
    ipcMain.handle('nav:openWelcome', () => {
        if (!win) return;
        win.loadURL(`http://127.0.0.1:${serverPort}/welcome.html`);
    });

    // Dashboard-level config (theme, background image — irrespective of client)
    ipcMain.handle('config:getDashboard', () => loadDashboardConfig());
    ipcMain.handle('config:saveDashboard', (_, updates) => {
        if (!updates || typeof updates !== 'object' || Array.isArray(updates)) return null;
        const safe = {};
        if (typeof updates.theme === 'string')           safe.theme = updates.theme;
        if (typeof updates.backgroundImage === 'string') safe.backgroundImage = updates.backgroundImage;
        return saveDashboardConfig(safe);
    });

    // Write dashboard state back to the original Excel file in the client folder.
    // Adds parallel "Actual" columns — original planned columns are never modified.
    // Always creates a timestamped backup before writing.
    ipcMain.handle('runbook:writeToExcel', async (_, { runbookData }) => {
        if (!currentClientDir) return { success: false, error: 'No client folder is open.' };
        if (!runbookData || typeof runbookData !== 'object')
            return { success: false, error: 'Invalid runbook data.' };

        const ExcelJS = require('exceljs');
        const { colMap, reverseStatus, sheet: sheetName } = loadColumnMapping(currentClientDir);

        // Flatten categories → tasks (skip reserved _keys)
        const categories = Object.keys(runbookData).filter(k => !k.startsWith('_'));
        const allTasks = categories.flatMap(cat =>
            (runbookData[cat] || []).map(t => ({ ...t, _cat: cat }))
        );
        // Check if any task has a comment — drives whether to add that column
        const hasComments = allTasks.some(t => t.comment && String(t.comment).trim());

        const excelPath = resolveExcelFile(currentClientDir);

        // ── Generate-fresh mode ───────────────────────────────
        if (!excelPath) {
            const wb  = new ExcelJS.Workbook();
            const ws  = wb.addWorksheet('Runbook');
            const hdr = ['Item', 'Category', 'Task', 'Status', 'Start Time', 'End Time',
                         'Assignee', 'Status (Actual)', 'Actual Start', 'Actual End'];
            if (hasComments) hdr.push('Comment');
            ws.addRow(hdr);
            ws.getRow(1).font = { bold: true };
            for (const t of allTasks) {
                const actualStatus = reverseStatus.get(t.status) || t.status || '';
                const row = [
                    t.item || '', t._cat, t.task || '', t.status || '',
                    formatTimeForExcel(t.startTime), formatTimeForExcel(t.endTime),
                    t.assignee || '', actualStatus,
                    formatTimeForExcel(t.startTime), formatTimeForExcel(t.endTime),
                ];
                if (hasComments) row.push(t.comment || '');
                ws.addRow(row);
            }
            const cfg = (() => { try { return JSON.parse(fs.readFileSync(findConfigFile(currentClientDir), 'utf8')); } catch (_) { return {}; } })();
            const safeName = (cfg.projectName || 'runbook').replace(/[^a-z0-9_-]/gi, '_');
            const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const outputPath = path.join(currentClientDir, `${safeName}_export_${ts}.xlsx`);
            await wb.xlsx.writeFile(outputPath);
            return { success: true, mode: 'generate', outputPath, backupPath: null,
                     updatedRows: allTasks.length, skippedRows: [] };
        }

        // ── Update-in-place mode ──────────────────────────────
        // 1. Backup first
        const baseName = path.basename(excelPath, '.xlsx');
        const ts12 = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
        const backupPath = path.join(currentClientDir, `${baseName}_backup_${ts12}.xlsx`);
        try {
            fs.copyFileSync(excelPath, backupPath);
        } catch (e) {
            const msg = (e.code === 'EBUSY' || e.code === 'EPERM')
                ? 'Close the Excel file before saving.'
                : `Backup failed: ${e.message}`;
            return { success: false, error: msg };
        }

        // 2. Load workbook
        const wb = new ExcelJS.Workbook();
        try {
            await wb.xlsx.readFile(excelPath);
        } catch (e) {
            return { success: false, error: `Cannot read Excel file: ${e.message}` };
        }

        const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
        if (!ws) return { success: false, error: 'Worksheet not found in workbook.' };

        // 3. Build header index + ensure Actual columns exist
        const headerIdx = buildHeaderIndex(ws);
        const colActualStatus = ensureColumn(ws, headerIdx, 'Status (Actual)');
        const colActualStart  = ensureColumn(ws, headerIdx, 'Actual Start');
        const colActualEnd    = ensureColumn(ws, headerIdx, 'Actual End');
        const colComment      = hasComments ? ensureColumn(ws, headerIdx, 'Comment') : null;

        // 4. Build row-lookup indexes
        const { byItem, byTask } = buildRowIndex(ws, colMap, headerIdx);

        // 5. Match each task and write Actual columns
        const updatedRows = [];
        const skippedRows = [];

        for (const t of allTasks) {
            const itemKey = t.item != null ? String(t.item).trim() : '';
            const taskKey = t.task != null ? String(t.task).trim() : '';

            let rowNum = null;
            if (itemKey && byItem.has(itemKey)) {
                rowNum = byItem.get(itemKey);
                byItem.delete(itemKey); // consume so it won't match again
            } else if (taskKey && byTask.has(taskKey)) {
                const arr = byTask.get(taskKey);
                rowNum = arr.shift();
                if (arr.length === 0) byTask.delete(taskKey);
            }

            if (rowNum == null) {
                skippedRows.push(taskKey || itemKey || '(unknown)');
                continue;
            }

            const row = ws.getRow(rowNum);
            const actualStatus = reverseStatus.get(t.status) || t.status || '';
            row.getCell(colActualStatus).value = actualStatus;
            row.getCell(colActualStart).value  = formatTimeForExcel(t.startTime);
            row.getCell(colActualEnd).value    = formatTimeForExcel(t.endTime);
            if (colComment) row.getCell(colComment).value = t.comment || '';
            row.commit();
            updatedRows.push(rowNum);
        }

        // 6. Save
        try {
            await wb.xlsx.writeFile(excelPath);
        } catch (e) {
            const msg = (e.code === 'EBUSY' || e.code === 'EPERM')
                ? 'Close the Excel file before saving.'
                : `Write failed: ${e.message}`;
            return { success: false, error: msg };
        }

        return { success: true, mode: 'update', outputPath: excelPath, backupPath,
                 updatedRows: updatedRows.length, skippedRows };
    });
}

// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(async () => {
    registerIpcHandlers();
    const port = await startServer();
    serverPort = port;
    createWindow(port);

    // macOS: re-create window when dock icon is clicked and no windows exist
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
    });
});

app.on('window-all-closed', () => {
    server.close();
    // On macOS apps stay alive until Cmd+Q; on Windows/Linux quit immediately
    if (process.platform !== 'darwin') app.quit();
});
