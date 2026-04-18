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
const { spawnSync } = require('child_process');

const ROOT     = __dirname;
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
const OUT_DIR  = path.join(ROOT, 'dist-electron', 'win-x64');
const APP_DIR  = path.join(OUT_DIR, 'resources', 'app');

// Files / folders to include in resources/app.
// config.json, runbook.json, and assets/ are handled separately below
// so client-specific files are excluded from the generic dist.
const APP_INCLUDES = [
  'electron-main.js',
  'preload.js',
  'runbookDashboard.html',
  'welcome.html',
  'package.json',    // need {"main":"electron-main.js"} at runtime
  'dashboard',
  'mapping.yml',
];

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

function findIconPath() {
  const candidates = [
    path.join(ROOT, 'assets', 'icon.ico'),
    path.join(ROOT, 'assets', 'mxRunbook-Monitor.ico'),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function findRceditBin() {
  const candidates = process.platform === 'win32'
    ? [
        path.join(ROOT, 'node_modules', '.bin', 'rcedit.cmd'),
        path.join(ROOT, 'node_modules', '.bin', 'rcedit.exe'),
        path.join(ROOT, 'node_modules', 'rcedit', 'bin', 'rcedit.exe'),
        path.join(ROOT, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe'),
      ]
    : [path.join(ROOT, 'node_modules', '.bin', 'rcedit')];

  return candidates.find(p => fs.existsSync(p)) || null;
}

function stampExeIcon(exePath) {
  const iconPath = findIconPath();
  if (!iconPath) {
    console.warn('  ⚠  Icon stamping skipped: no assets/icon.ico or assets/mxRunbook-Monitor.ico found.');
    return;
  }

  const rceditBin = findRceditBin();
  if (!rceditBin) {
    console.warn('  ⚠  Icon stamping skipped: rcedit not found. Run npm install to install dependencies.');
    return;
  }

  // Stamp in a temp dir first to avoid OneDrive / AV locking the EXE in-place.
  // Strategy: copy → stamp in temp → copy back.
  const tmpDir  = path.join(require('os').tmpdir(), 'mxrunbook-icon-stamp-' + Date.now());
  const tmpExe  = path.join(tmpDir, path.basename(exePath));
  let usedTemp  = false;

  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.copyFileSync(exePath, tmpExe);
    usedTemp = true;

    const result = spawnSync(rceditBin, [tmpExe, '--set-icon', iconPath], {
      stdio: 'inherit',
      shell: false,
    });

    if (result.status !== 0) {
      throw new Error('rcedit returned non-zero exit code.');
    }

    // Copy stamped EXE back, replacing the original
    fs.copyFileSync(tmpExe, exePath);
    console.log(`  Stamped EXE icon from ${path.basename(iconPath)}`);
  } catch (err) {
    // Non-fatal: warn and continue — the app works fine without icon stamping.
    console.warn(`  ⚠  Icon stamping skipped (${err.message}). EXE will use default Electron icon.`);
  } finally {
    if (usedTemp) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
  }
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
  stampExeIcon(appExe);
}

// Remove default_app.asar so Electron loads resources/app/ instead
const defaultAsar = path.join(OUT_DIR, 'resources', 'default_app.asar');
if (fs.existsSync(defaultAsar)) {
  fs.unlinkSync(defaultAsar);
  console.log('  Removed default_app.asar');
}

// ── 3. Copy app source files ──────────────────────────────────
console.log('Copying app files …');
fs.mkdirSync(APP_DIR, { recursive: true });

for (const item of APP_INCLUDES) {
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

// Write blank config.json placeholder — operator provides real one via client folder
const blankConfig = {
  projectName: "Go-Live Runbook",
  subtitle:    "",
  changeRef:   "",
  client:      "",
  environment: "",
  release:     "",
  accentColor: "#003a2d",
  runbookFile: "runbook.json",
};
fs.writeFileSync(path.join(APP_DIR, 'config.json'), JSON.stringify(blankConfig, null, 2), 'utf8');
console.log('  + config.json (blank placeholder)');

// Write empty runbook.json placeholder
fs.writeFileSync(path.join(APP_DIR, 'runbook.json'), '{}', 'utf8');
console.log('  + runbook.json (empty placeholder)');

// Copy assets — exclude client-specific logo files (clientLogo-*)
const srcAssets  = path.join(ROOT, 'assets');
const destAssets = path.join(APP_DIR, 'assets');
if (fs.existsSync(srcAssets)) {
  fs.mkdirSync(destAssets, { recursive: true });
  for (const entry of fs.readdirSync(srcAssets, { withFileTypes: true })) {
    if (entry.name.startsWith('clientLogo-')) continue;  // client-specific, exclude
    const s = path.join(srcAssets, entry.name);
    const d = path.join(destAssets, entry.name);
    if (entry.isDirectory()) { copyDir(s, d); } else { fs.copyFileSync(s, d); }
  }
  console.log('  + assets/ (clientLogo-* excluded)');
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
