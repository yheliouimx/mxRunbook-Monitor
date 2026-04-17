#!/usr/bin/env node
/**
 * _create-icon.js  –  Generate assets/icon.png (256x256) and assets/icon.ico
 *
 * Uses sharp (devDependency) to render an SVG design → PNG → ICO.
 * The SVG draws a dark-green rounded square with a white heartbeat line,
 * matching the "monitor heart" theme of the Runbook Dashboard.
 *
 * Run:  node _create-icon.js
 */
'use strict';

const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');

const OUT_PNG = path.join(__dirname, 'assets', 'icon.png');
const OUT_ICO = path.join(__dirname, 'assets', 'icon.ico');

// ── SVG design ───────────────────────────────────────────────
// Dark-green (#003a2d) rounded square with a white EKG heartbeat line
// and a subtle accent glow. Size-agnostic (256 viewBox).
const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#004d3a"/>
      <stop offset="100%" stop-color="#001f17"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="256" height="256" rx="40" fill="url(#bg)"/>
  <rect x="4" y="4" width="248" height="248" rx="36" fill="none" stroke="#00765a" stroke-width="2" opacity="0.4"/>

  <!-- Heartbeat EKG line -->
  <polyline fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"
            filter="url(#glow)"
            points="30,140 70,140 90,140 105,80 120,190 140,60 158,180 175,110 190,140 226,140"/>

  <!-- Small heart icon top-right -->
  <g transform="translate(190,30) scale(0.6)" fill="#e05050" opacity="0.85">
    <path d="M25,10 C25,0 15,-5 10,5 C5,-5 -5,0 -5,10 C-5,20 10,30 10,30 C10,30 25,20 25,10 Z"/>
  </g>
</svg>`;

// ── PNG sizes for the ICO ────────────────────────────────────
const SIZES = [256, 48, 32, 16];

// ── ICO container builder ────────────────────────────────────
// Wraps PNG image data entries into the ICO binary format.
function buildIco(pngBuffers, sizes) {
  const count  = pngBuffers.length;
  const headerLen  = 6;
  const dirLen     = 16 * count;
  let   dataOffset = headerLen + dirLen;

  // ICO header: reserved(2) + type=1(2) + count(2)
  const header = Buffer.alloc(headerLen);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type = ICO
  header.writeUInt16LE(count, 4);  // image count

  const dirEntries = [];
  const dataChunks = [];

  for (let i = 0; i < count; i++) {
    const png  = pngBuffers[i];
    const size = sizes[i];
    const dim  = size >= 256 ? 0 : size; // 256 is encoded as 0

    const entry = Buffer.alloc(16);
    entry.writeUInt8(dim, 0);           // width
    entry.writeUInt8(dim, 1);           // height
    entry.writeUInt8(0, 2);             // color palette
    entry.writeUInt8(0, 3);             // reserved
    entry.writeUInt16LE(1, 4);          // color planes
    entry.writeUInt16LE(32, 6);         // bits per pixel
    entry.writeUInt32LE(png.length, 8); // data size
    entry.writeUInt32LE(dataOffset, 12);// data offset

    dirEntries.push(entry);
    dataChunks.push(png);
    dataOffset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...dataChunks]);
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });

  // Generate PNGs at each required size
  const pngBuffers = [];
  for (const size of SIZES) {
    const png = await sharp(Buffer.from(SVG))
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers.push(png);
  }

  // Save the largest as icon.png (used by BrowserWindow.icon)
  fs.writeFileSync(OUT_PNG, pngBuffers[0]);
  console.log(`  Created ${OUT_PNG}  (${pngBuffers[0].length} bytes, 256x256)`);

  // Build and save the ICO (used for EXE stamping)
  const ico = buildIco(pngBuffers, SIZES);
  fs.writeFileSync(OUT_ICO, ico);
  console.log(`  Created ${OUT_ICO}  (${ico.length} bytes, ${SIZES.join('+')} sizes)`);
}

main().catch(err => { console.error(err); process.exit(1); });
