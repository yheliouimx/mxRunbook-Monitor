#!/usr/bin/env node
// ============================================================
// _client-zip.js  —  Build a client-specific distributable zip
// ============================================================
// Bundles the runbook dashboard as a single portable HTML file
// (all JS, config, runbook data, logo and background inlined),
// then zips it alongside the raw client folder.
//
// Usage:
//   node _client-zip.js --client runbooks/MKS
//   node _client-zip.js --client runbooks/LBG
//   node _client-zip.js --client runbooks/DNB
//
// Output:  dist/MXRunbook-<Client>-<ChangeRef>-<date>.zip
// Contents:
//   MXRunbook-<label>/
//     RunbookDashboard-<label>.html   ← portable, all assets inlined
//     client/                         ← raw client data files
//       mks_config.json
//       mks_runbook.json
//       clientLogo-mks.jpg
//       mks_mapping.yml
//       ...
// ============================================================

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

// ── CLI args ──────────────────────────────────────────────
const clientIdx = process.argv.indexOf('--client');
if (clientIdx === -1 || !process.argv[clientIdx + 1]) {
    console.error('Usage: node _client-zip.js --client <client-folder>');
    console.error('Example: node _client-zip.js --client runbooks/MKS');
    process.exit(1);
}
const CLIENT_FOLDER = path.resolve(ROOT, process.argv[clientIdx + 1]);
if (!fs.existsSync(CLIENT_FOLDER)) {
    console.error(`Client folder not found: ${CLIENT_FOLDER}`);
    process.exit(1);
}

// ── ZIP helpers (same implementation as _package.js) ──────
function crc32(buf) {
    let table = crc32._table;
    if (!table) {
        table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            table[i] = c;
        }
        crc32._table = table;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function u16le(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }
function u32le(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; }

function deflate(data) {
    return new Promise((res, rej) => zlib.deflateRaw(data, (e, d) => e ? rej(e) : res(d)));
}

async function buildZip(entries) {
    const centralDirs = [];
    let offset = 0;
    const modDate = (() => {
        const d = new Date();
        return {
            date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
            time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
        };
    })();
    const chunks = [];

    for (const { zipPath, data } of entries) {
        const nameBytes  = Buffer.from(zipPath, 'utf-8');
        const crc        = crc32(data);
        const compressed = await deflate(data);
        const useDeflate = compressed.length < data.length;
        const finalComp  = useDeflate ? compressed : data;
        const method     = useDeflate ? 8 : 0;

        const localHeader = Buffer.concat([
            Buffer.from([0x50, 0x4B, 0x03, 0x04]),
            u16le(20), u16le(0), u16le(method),
            u16le(modDate.time), u16le(modDate.date),
            u32le(crc), u32le(finalComp.length), u32le(data.length),
            u16le(nameBytes.length), u16le(0),
            nameBytes,
        ]);

        const central = Buffer.concat([
            Buffer.from([0x50, 0x4B, 0x01, 0x02]),
            u16le(20), u16le(20), u16le(0), u16le(method),
            u16le(modDate.time), u16le(modDate.date),
            u32le(crc), u32le(finalComp.length), u32le(data.length),
            u16le(nameBytes.length), u16le(0), u16le(0), u16le(0), u16le(0),
            u32le(0), u32le(offset), nameBytes,
        ]);
        centralDirs.push(central);

        chunks.push(localHeader, finalComp);
        offset += localHeader.length + finalComp.length;
    }

    const cdStart = offset;
    chunks.push(...centralDirs);
    const cdSize = centralDirs.reduce((s, b) => s + b.length, 0);

    const eocd = Buffer.concat([
        Buffer.from([0x50, 0x4B, 0x05, 0x06]),
        u16le(0), u16le(0),
        u16le(entries.length), u16le(entries.length),
        u32le(cdSize), u32le(cdStart), u16le(0),
    ]);
    chunks.push(eocd);

    return Buffer.concat(chunks);
}

// ── Helpers ────────────────────────────────────────────────
function toDataURI(filePath) {
    const ext  = path.extname(filePath).toLowerCase();
    const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                   '.svg': 'image/svg+xml', '.webp': 'image/webp' }[ext] || 'application/octet-stream';
    return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function findFileCI(dir, name) {
    // Case-insensitive file lookup — also tries swapping jpg/png extension
    if (!fs.existsSync(dir)) return null;
    const lower = name.toLowerCase();
    const files  = fs.readdirSync(dir);
    const exact  = files.find(f => f.toLowerCase() === lower);
    if (exact) return path.join(dir, exact);
    // Try alternate extension
    const swapped = lower.endsWith('.png') ? lower.slice(0, -4) + '.jpg'
                  : lower.endsWith('.jpg') ? lower.slice(0, -4) + '.png'
                  : null;
    if (swapped) {
        const alt = files.find(f => f.toLowerCase() === swapped);
        if (alt) return path.join(dir, alt);
    }
    return null;
}

function walk(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...walk(full));
        else results.push(full);
    }
    return results;
}

// ── Main ──────────────────────────────────────────────────
(async () => {
    // 1. Load client config
    console.log(`\nClient folder: ${CLIENT_FOLDER}`);
    const clientFiles = fs.readdirSync(CLIENT_FOLDER);
    const configName  = clientFiles.find(f => f.endsWith('_config.json')) ||
                        clientFiles.find(f => f === 'config.json');
    if (!configName) { console.error('No config file found in client folder'); process.exit(1); }
    const config = JSON.parse(fs.readFileSync(path.join(CLIENT_FOLDER, configName), 'utf-8'));
    console.log(`  Config: ${configName}  (${config.client} / ${config.changeRef || 'N/A'})`);

    // 2. Load runbook
    const runbookName = config.runbookFile || 'runbook.json';
    const runbookPath = path.join(CLIENT_FOLDER, runbookName);
    if (!fs.existsSync(runbookPath)) {
        console.error(`Runbook not found: ${runbookPath}`);
        process.exit(1);
    }
    const runbook = JSON.parse(fs.readFileSync(runbookPath, 'utf-8'));
    console.log(`  Runbook: ${runbookName}`);

    // 3. Load logo (from client folder, case-insensitive, jpg/png fallback)
    let logoDataURI = null;
    if (config.logoFile) {
        const logoPath = findFileCI(CLIENT_FOLDER, config.logoFile);
        if (logoPath) {
            logoDataURI = toDataURI(logoPath);
            console.log(`  Logo: ${path.basename(logoPath)} (${(fs.statSync(logoPath).size / 1024).toFixed(1)} KB)`);
        } else {
            console.warn(`  Warning: logo "${config.logoFile}" not found in client folder — skipped`);
        }
    }

    // 4. Load background (from assets/ directory)
    let bgDataURI = null;
    const bgFile = config.backgroundFile || 'Murex_background6.jpg';
    const bgPath = findFileCI(path.join(ROOT, 'assets'), bgFile);
    if (bgPath) {
        bgDataURI = toDataURI(bgPath);
        console.log(`  Background: ${path.basename(bgPath)} (${(fs.statSync(bgPath).size / 1024).toFixed(1)} KB)`);
    } else {
        console.warn(`  Warning: background "${bgFile}" not found in assets/ — skipped`);
    }

    // 5. Bundle JS with esbuild
    console.log('  Bundling JS...');
    let esbuild;
    try { esbuild = require('esbuild'); } catch(e) {
        console.error('esbuild not found. Run: npm install');
        process.exit(1);
    }
    const result = await esbuild.build({
        entryPoints: [path.join(ROOT, 'dashboard', 'app.js')],
        bundle: true,
        format: 'iife',
        write: false,
        minify: false,
        target: 'es2020',
    });
    const bundledJS = result.outputFiles[0].text;

    // 6. Build the fetch shim (intercepts config.json + runbook filename)
    const inlineData = {
        'config.json': config,
        [runbookName]: runbook,
    };
    const shim = `
// ── Portable fetch shim ────────────────────────────────────
(function() {
    var __INLINE__ = ${JSON.stringify(inlineData)};
    var __origFetch = window.fetch;
    window.fetch = function(url, opts) {
        var key = typeof url === 'string' ? url.split('?')[0] : '';
        if (__INLINE__[key]) {
            return Promise.resolve(new Response(JSON.stringify(__INLINE__[key]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }));
        }
        return __origFetch ? __origFetch.call(this, url, opts) : Promise.reject(new Error('fetch unavailable'));
    };
})();
`;

    // 7. Build asset overrides
    const assetParts = [];
    if (logoDataURI) {
        assetParts.push(`
    (function() {
        var img = document.getElementById('clientLogo');
        if (img) { img.src = ${JSON.stringify(logoDataURI)}; img.classList.remove('hidden'); }
        var fav = document.getElementById('favicon');
        if (fav) fav.href = ${JSON.stringify(logoDataURI)};
    })();`);
    }
    if (bgDataURI) {
        assetParts.push(`
    (function() {
        var el = document.getElementById('bgOverlay');
        if (el) el.style.backgroundImage = 'url(${bgDataURI.replace(/'/g, "\\'")}' + ')';
        // Also override the CSS fallback background
        document.documentElement.style.setProperty('--bg-override', 'url(${bgDataURI.replace(/'/g, "\\'")}' + ')');
    })();`);
    }
    const assetOverrides = assetParts.length
        ? `\n// ── Inline assets ──\ndocument.addEventListener('DOMContentLoaded', function() {${assetParts.join('\n')}\n});\n`
        : '';

    // 8. Patch the HTML
    let html = fs.readFileSync(path.join(ROOT, 'runbookDashboard.html'), 'utf-8');
    const scriptTag = /<script\s+type="module"\s+src="\.\/dashboard\/app\.js"\s*><\/script>/;
    if (!scriptTag.test(html)) {
        console.error('Could not find <script type="module" src="./dashboard/app.js"> in runbookDashboard.html');
        process.exit(1);
    }
    const inlineScript = `<script>\n${shim}\n${bundledJS}\n${assetOverrides}</script>`;
    html = html.replace(scriptTag, inlineScript);

    // Portable build banner
    const label = [config.client, config.changeRef].filter(Boolean).join('-').replace(/\s+/g, '_') ||
                  path.basename(CLIENT_FOLDER);
    const today = new Date().toISOString().slice(0, 10);
    html = html.replace('<!DOCTYPE html>',
        `<!DOCTYPE html>\n<!-- PORTABLE BUILD — ${label} — generated ${today} by _client-zip.js -->`);

    // 9. Collect zip entries
    const entries = [];
    const zipRoot = `MXRunbook-${label}/`;

    function addBuf(zipPath, data) {
        entries.push({ zipPath: zipPath.replace(/\\/g, '/'), data: Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8') });
    }

    // Portable HTML
    const htmlName = `RunbookDashboard-${label}.html`;
    addBuf(zipRoot + htmlName, html);
    console.log(`  Portable HTML: ${htmlName} (~${(Buffer.byteLength(html, 'utf-8') / 1024).toFixed(0)} KB)`);

    // Raw client folder under client/
    const clientSubdir = zipRoot + 'client/';
    // Skip backup files (.bkp) and archive sub-folder
    const skipDirs  = new Set(['Archives', 'archives']);
    const skipExts  = new Set(['.bkp', '.bkp2', '.zip']);
    for (const absPath of walk(CLIENT_FOLDER)) {
        const rel = path.relative(CLIENT_FOLDER, absPath);
        const parts = rel.split(path.sep);
        if (parts.some(p => skipDirs.has(p))) continue;
        if (skipExts.has(path.extname(absPath).toLowerCase())) continue;
        addBuf(clientSubdir + parts.join('/'), fs.readFileSync(absPath));
        console.log(`    + client/${rel}`);
    }

    // 10. Build zip
    console.log('  Compressing...');
    if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
    const zip = await buildZip(entries);
    const zipName = `MXRunbook-${label}-${today}.zip`;
    const zipOut  = path.join(DIST, zipName);
    fs.writeFileSync(zipOut, zip);

    console.log(`\n✓ Distributable zip: dist/${zipName} (${(zip.length / 1024).toFixed(1)} KB)`);
    console.log(`  ${entries.length} files — open ${htmlName} in a browser to use`);
})();
