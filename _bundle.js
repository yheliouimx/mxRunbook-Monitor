#!/usr/bin/env node
// ============================================================
// _bundle.js — Build a single portable HTML file
// ============================================================
// Usage:
//   node _bundle.js                        (config only, no runbook inlined)
//   node _bundle.js --runbook runbook.json  (inline a specific runbook)
//   node _bundle.js --no-assets             (skip base64-inlining assets)
//
// Output: dist/runbookDashboard-portable.html
// ============================================================

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");
const HTML_SRC = path.join(ROOT, "runbookDashboard.html");
const CONFIG_SRC = path.join(ROOT, "config.json");
const ASSETS_DIR = path.join(ROOT, "assets", "assets");
const ENTRY = path.join(ROOT, "dashboard", "app.js");

// ── CLI args ──

const args = process.argv.slice(2);
const runbookFlag = args.indexOf("--runbook");
const runbookPath = runbookFlag !== -1 ? path.resolve(ROOT, args[runbookFlag + 1]) : null;
const skipAssets = args.includes("--no-assets");

// ── Helpers ──

function readJSON(p) {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function toDataURI(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml", ".webp": "image/webp", ".gif": "image/gif",
    };
    const mime = mimeMap[ext] || "application/octet-stream";
    const buf = fs.readFileSync(filePath);
    return `data:${mime};base64,${buf.toString("base64")}`;
}

// ── Main ──

async function build() {
    // 1. Bundle JS modules into a single IIFE
    const result = await esbuild.build({
        entryPoints: [ENTRY],
        bundle: true,
        format: "iife",
        write: false,
        minify: false,       // keep readable; user can pass --minify separately
        target: "es2020",
    });
    const bundledJS = result.outputFiles[0].text;

    // 2. Read config.json
    const config = readJSON(CONFIG_SRC);

    // 3. Optionally read runbook
    let runbook = null;
    if (runbookPath) {
        if (!fs.existsSync(runbookPath)) {
            console.error(`Runbook not found: ${runbookPath}`);
            process.exit(1);
        }
        runbook = readJSON(runbookPath);
        console.log(`  Inlining runbook: ${runbookPath}`);
    }

    // 4. Build the fetch shim
    const inlineData = { "config.json": config };
    if (runbook) inlineData["runbook.json"] = runbook;

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
        // In file:// mode, non-inlined fetches will fail gracefully
        return __origFetch.call(this, url, opts);
    };
})();
`;

    // 5. Optionally inline assets as base64
    let assetOverrides = "";
    if (!skipAssets) {
        const logoFile = config.logoFile;
        const bgFile = config.backgroundFile;
        const overrides = [];

        if (logoFile) {
            const logoPath = path.join(ASSETS_DIR, logoFile);
            if (fs.existsSync(logoPath)) {
                const dataURI = toDataURI(logoPath);
                overrides.push(`
    // Inline logo
    (function() {
        var img = document.getElementById('clientLogo');
        if (img) { img.src = ${JSON.stringify(dataURI)}; img.classList.remove('hidden'); }
        var fav = document.getElementById('favicon');
        if (fav) fav.href = ${JSON.stringify(dataURI)};
    })();`);
                console.log(`  Inlined logo: ${logoFile} (${(fs.statSync(logoPath).size / 1024).toFixed(1)} KB)`);
            } else {
                console.warn(`  Warning: logo not found at ${logoPath}`);
            }
        }

        if (bgFile) {
            const bgPath = path.join(ASSETS_DIR, bgFile);
            if (fs.existsSync(bgPath)) {
                const dataURI = toDataURI(bgPath);
                overrides.push(`
    // Inline background
    (function() {
        var el = document.getElementById('bgOverlay');
        if (el) el.style.backgroundImage = 'url(${dataURI.replace(/'/g, "\\'")}' + ')';
    })();`);
                console.log(`  Inlined background: ${bgFile} (${(fs.statSync(bgPath).size / 1024).toFixed(1)} KB)`);
            } else {
                console.warn(`  Warning: background not found at ${bgPath}`);
            }
        }

        if (overrides.length) {
            assetOverrides = `\n// ── Inline assets ──\ndocument.addEventListener('DOMContentLoaded', function() {${overrides.join("\n")}\n});\n`;
        }
    }

    // 6. Read HTML and replace the module script tag
    let html = fs.readFileSync(HTML_SRC, "utf-8");

    // Replace <script type="module" src="./dashboard/app.js"></script>
    const scriptTag = /<script\s+type="module"\s+src="\.\/dashboard\/app\.js"\s*><\/script>/;
    if (!scriptTag.test(html)) {
        console.error("Could not find <script type=\"module\" src=\"./dashboard/app.js\"> in HTML");
        process.exit(1);
    }

    const inlineScript = `<script>\n${shim}\n${bundledJS}\n${assetOverrides}</script>`;
    html = html.replace(scriptTag, inlineScript);

    // 7. Add a portable-mode banner comment
    html = html.replace("<!DOCTYPE html>",
        `<!DOCTYPE html>\n<!-- PORTABLE BUILD — generated ${new Date().toISOString().slice(0, 10)} by _bundle.js -->`);

    // 8. Write output
    if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
    const outPath = path.join(DIST, "runbookDashboard-portable.html");
    fs.writeFileSync(outPath, html, "utf-8");

    const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`\n✓ Portable dashboard written to: dist/runbookDashboard-portable.html (${sizeKB} KB)`);
    if (!runbook) {
        console.log('  No runbook inlined — users will load one via the "Load File" button.');
        console.log('  To inline a runbook: node _bundle.js --runbook runbook.json');
    }
}

build().catch(err => { console.error(err); process.exit(1); });
