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
const { app, BrowserWindow, shell } = require('electron');
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

// ── HTTP server (same logic as _serve.js / _launcher.js) ─────
const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/runbookDashboard.html';

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

// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(async () => {
    const port = await startServer();
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
