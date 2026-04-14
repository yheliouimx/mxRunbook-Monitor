#!/usr/bin/env node
// ============================================================
// _package.js  —  Build + zip the portable dashboard release
// ============================================================
// 1. Rebuilds dist/RunbookDashboard.exe (nexe, if --skip-exe not passed)
// 2. Zips everything needed to run the dashboard with no install:
//      RunbookDashboard.exe
//      runbookDashboard.html
//      config.json
//      runbook.json
//      dashboard/  (all .js)
//      assets/assets/Murex_background6.jpg   (only this file)
// 3. Writes: dist/RunbookDashboard-<version>-portable.zip
//
// Usage:
//   node _package.js               # build exe then zip
//   node _package.js --skip-exe    # zip only (exe must already exist)
// ============================================================

'use strict';

const fs         = require('fs');
const path       = require('path');
const { execSync } = require('child_process');
const { promisify } = require('util');

const ROOT     = __dirname;
const DIST     = path.join(ROOT, 'dist');
const EXE_PATH = path.join(DIST, 'RunbookDashboard.exe');

// ── Version from package.json ──────────────────────────────
const pkg     = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const VERSION = pkg.version || '1.0.0';

// ── CLI flags ──────────────────────────────────────────────
const skipExe = process.argv.includes('--skip-exe');

// ── Minimal ZIP implementation (no external deps) ─────────
// Uses Node.js built-in zlib (DEFLATE) to write a valid ZIP file.
// Supports files only (no symlinks). Paths stored with forward slashes.

const zlib = require('zlib');

function crc32(buf) {
    // CRC-32 table
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
    // entries: [{ zipPath: string, data: Buffer }]
    const localHeaders = [];
    const centralDirs  = [];
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
        const nameBytes    = Buffer.from(zipPath, 'utf-8');
        const crc          = crc32(data);
        const compressed   = await deflate(data);
        const useDeflate   = compressed.length < data.length;
        const finalComp    = useDeflate ? compressed : data;
        const method       = useDeflate ? 8 : 0;

        // Local file header (signature 0x04034b50)
        const localHeader = Buffer.concat([
            Buffer.from([0x50, 0x4B, 0x03, 0x04]),
            u16le(20),               // version needed
            u16le(0),                // flags
            u16le(method),
            u16le(modDate.time),
            u16le(modDate.date),
            u32le(crc),
            u32le(finalComp.length),
            u32le(data.length),
            u16le(nameBytes.length),
            u16le(0),                // extra field length
            nameBytes,
        ]);

        localHeaders.push({ offset, header: localHeader, data: finalComp });

        // Central directory record (signature 0x02014b50)
        const central = Buffer.concat([
            Buffer.from([0x50, 0x4B, 0x01, 0x02]),
            u16le(20),               // version made by
            u16le(20),               // version needed
            u16le(0),                // flags
            u16le(method),
            u16le(modDate.time),
            u16le(modDate.date),
            u32le(crc),
            u32le(finalComp.length),
            u32le(data.length),
            u16le(nameBytes.length),
            u16le(0),                // extra
            u16le(0),                // comment
            u16le(0),                // disk start
            u16le(0),                // int attrs
            u32le(0),                // ext attrs
            u32le(offset),           // local header offset
            nameBytes,
        ]);
        centralDirs.push(central);

        chunks.push(localHeader, finalComp);
        offset += localHeader.length + finalComp.length;
    }

    // Central directory
    const cdStart = offset;
    chunks.push(...centralDirs);
    const cdSize = centralDirs.reduce((s, b) => s + b.length, 0);

    // End of central directory record (signature 0x06054b50)
    const eocd = Buffer.concat([
        Buffer.from([0x50, 0x4B, 0x05, 0x06]),
        u16le(0),                    // disk number
        u16le(0),                    // disk with cd
        u16le(entries.length),
        u16le(entries.length),
        u32le(cdSize),
        u32le(cdStart),
        u16le(0),                    // comment length
    ]);
    chunks.push(eocd);

    return Buffer.concat(chunks);
}

// ── File collection ────────────────────────────────────────

function walk(dir, baseDir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walk(full, baseDir));
        } else {
            results.push(path.relative(baseDir, full));
        }
    }
    return results;
}

async function collectEntries() {
    const entries = [];

    function add(relPath, content) {
        const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
        entries.push({ zipPath: relPath.replace(/\\/g, '/'), data });
    }

    function addFile(absPath, zipPath) {
        add(zipPath, fs.readFileSync(absPath));
    }

    // ── RunbookDashboard.exe ──
    if (!fs.existsSync(EXE_PATH)) {
        console.error('ERROR: dist/RunbookDashboard.exe not found. Run npm run build:exe first.');
        process.exit(1);
    }
    addFile(EXE_PATH, 'RunbookDashboard.exe');

    // ── Root files ──
    for (const f of ['runbookDashboard.html', 'config.json', 'runbook.json']) {
        const abs = path.join(ROOT, f);
        if (fs.existsSync(abs)) {
            addFile(abs, f);
        } else {
            console.warn(`  Warning: ${f} not found — skipped`);
        }
    }

    // ── dashboard/ (all JS files) ──
    for (const rel of walk(path.join(ROOT, 'dashboard'), ROOT)) {
        addFile(path.join(ROOT, rel), rel);
    }

    // ── assets/assets/ — only Murex_background6.jpg ──
    const keepAsset = 'Murex_background6.jpg';
    const assetSrc = path.join(ROOT, 'assets', 'assets', keepAsset);
    if (fs.existsSync(assetSrc)) {
        // Mirror the folder structure expected by the dashboard
        addFile(assetSrc, `assets/assets/${keepAsset}`);
    } else {
        console.warn(`  Warning: assets/assets/${keepAsset} not found — skipped`);
    }

    return entries;
}

// ── Main ──────────────────────────────────────────────────

(async () => {
    if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

    // Step 1 — (re)build the exe
    if (!skipExe) {
        console.log('  Building RunbookDashboard.exe...');
        try {
            execSync('npm run build:exe', { cwd: ROOT, stdio: 'inherit' });
        } catch (e) {
            console.error('ERROR: exe build failed.');
            process.exit(1);
        }
    } else {
        console.log('  Skipping exe build (--skip-exe)');
    }

    // Step 2 — collect files
    console.log('  Collecting files...');
    const entries = await collectEntries();

    for (const { zipPath, data } of entries) {
        console.log(`    + ${zipPath.padEnd(55)} ${(data.length / 1024).toFixed(1).padStart(8)} KB`);
    }

    // Step 3 — build zip
    console.log('  Compressing...');
    const zip = await buildZip(entries);

    const zipName = `RunbookDashboard-v${VERSION}-portable.zip`;
    const zipPath = path.join(DIST, zipName);
    fs.writeFileSync(zipPath, zip);

    const totalKB = (zip.length / 1024).toFixed(1);
    console.log(`\n✓ Package written to: dist/${zipName} (${totalKB} KB)`);
    console.log(`  ${entries.length} files — ready to share`);
})();
