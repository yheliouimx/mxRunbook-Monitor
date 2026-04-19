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
