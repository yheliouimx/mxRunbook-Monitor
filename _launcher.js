// ============================================================
// _launcher.js — Portable server for RunbookDashboard.exe
// ============================================================
// Bundled by nexe into a standalone .exe with no dependencies.
// Files (HTML, JS, JSON, assets) live next to the .exe and are
// served from disk — runbook.json and config.json remain editable.
// ============================================================

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

// ── Determine the serve root ──────────────────────────────
// When running as a nexe .exe, __dirname points to the virtual
// snapshot inside the binary. We need the real directory on disk.
// Strategy: look for runbookDashboard.html next to the .exe first,
// then fall back to cwd, then __dirname (dev mode via `node`).

function findServeRoot() {
    const candidates = [
        path.dirname(process.execPath), // next to .exe (nexe prod mode)
        process.cwd(),                  // current working directory
        __dirname,                      // node dev mode
    ];
    for (const dir of candidates) {
        if (fs.existsSync(path.join(dir, 'runbookDashboard.html'))) {
            return dir;
        }
    }
    // No HTML found — serve from exe dir anyway and let 404s happen
    return path.dirname(process.execPath);
}

const ROOT = findServeRoot();

// ── MIME types ────────────────────────────────────────────
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

// ── Port selection ────────────────────────────────────────
const PREFERRED_PORT = 8090;
const FALLBACK_PORTS = [8091, 8092, 8093, 9000, 9090, 3000, 4000];

function tryListen(server, port) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
            server.removeListener('error', reject);
            resolve(port);
        });
    });
}

async function findFreePort(server) {
    for (const port of [PREFERRED_PORT, ...FALLBACK_PORTS]) {
        try {
            return await tryListen(server, port);
        } catch(e) {
            if (e.code !== 'EADDRINUSE') throw e;
            // port in use — try next
        }
    }
    throw new Error('No free port found in range');
}

// ── HTTP server ───────────────────────────────────────────
const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/runbookDashboard.html';

    // Security: prevent path traversal
    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIMES[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

// ── Open browser (Windows) ────────────────────────────────
function openBrowser(url) {
    // `start` is a Windows shell built-in; works without any external program
    exec('start "" "' + url + '"', (err) => {
        if (err) {
            // Fallback: try explorer
            exec('explorer "' + url + '"');
        }
    });
}

// ── Boot ──────────────────────────────────────────────────
(async () => {
    let port;
    try {
        port = await findFreePort(server);
    } catch (e) {
        console.error('ERROR: Could not start server —', e.message);
        console.error('Please close other applications using ports 8090-9090 and try again.');
        process.stdin.resume(); // keep window open so user can read the error
        return;
    }

    const url = 'http://localhost:' + port;
    console.log('');
    console.log('  Runbook Dashboard');
    console.log('  ─────────────────────────────────────────');
    console.log('  Serving: ' + ROOT);
    console.log('  URL:     ' + url);
    console.log('');
    console.log('  Opening browser...');
    console.log('  Close this window to stop the server.');
    console.log('');

    // Small delay so the console message is visible before browser opens
    setTimeout(() => openBrowser(url), 500);

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n  Server stopped.');
        server.close(() => process.exit(0));
    });
})();
