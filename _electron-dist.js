#!/usr/bin/env node
/**
 * _electron-dist.js  –  Package the Electron app for Windows x64
 *
 * No electron-builder, no winCodeSign, no symlink issues.
 * Copies node_modules/electron/dist/ → dist-electron/win-x64/
 * then drops app source files into resources/app/
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = __dirname;
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
const OUT_DIR  = path.join(ROOT, 'dist-electron', 'win-x64');
const APP_DIR  = path.join(OUT_DIR, 'resources', 'app');

// Files / folders to include in resources/app
const APP_INCLUDES = [
  'electron-main.js',
  'runbookDashboard.html',
  'config.json',
  'package.json',    // need {"main":"electron-main.js"} at runtime
  'dashboard',
  'assets',
  'mapping.yml',
  // runbook JSON files (include all *.json in root except package.json — already handled)
];

// Extra root JSON files that match *.json but aren't package.json
const ROOT_JSON_GLOB = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.json') && f !== 'package.json' && !f.startsWith('_'));

// ── helpers ──────────────────────────────────────────────────
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function rmDir(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

// ── 1. Clean output ───────────────────────────────────────────
console.log('Cleaning dist-electron/win-x64 …');
rmDir(OUT_DIR);
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── 2. Copy electron binary + runtime ────────────────────────
console.log('Copying Electron runtime …');
copyDir(ELECTRON_DIST, OUT_DIR);

// Rename electron.exe → "MX Runbook Monitor.exe"
const electronExe = path.join(OUT_DIR, 'electron.exe');
const appExe      = path.join(OUT_DIR, 'MX Runbook Monitor.exe');
if (fs.existsSync(electronExe)) {
  fs.renameSync(electronExe, appExe);
  console.log('  Renamed electron.exe → MX Runbook Monitor.exe');
}

// ── 3. Copy app source files ──────────────────────────────────
console.log('Copying app files …');
fs.mkdirSync(APP_DIR, { recursive: true });

for (const item of [...APP_INCLUDES, ...ROOT_JSON_GLOB]) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) continue;
  const dest = path.join(APP_DIR, item);
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
  console.log(`  + ${item}`);
}

// Ensure package.json in app dir has correct "main" entry
const pkgPath = path.join(APP_DIR, 'package.json');
const pkg     = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.main      = 'electron-main.js';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');

// ── 4. Summary ───────────────────────────────────────────────
const exeSize = fs.existsSync(appExe)
  ? (fs.statSync(appExe).size / 1024 / 1024).toFixed(1) + ' MB'
  : '?';

console.log('\n✔  Build complete!');
console.log(`   Folder : dist-electron/win-x64/`);
console.log(`   Launch : dist-electron/win-x64/MX Runbook Monitor.exe`);
console.log(`   Exe size: ${exeSize}  (plus supporting DLLs)`);
console.log('\nTip: zip the entire win-x64 folder to distribute it.');
