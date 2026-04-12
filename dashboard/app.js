// ============================================================
// app.js — Application entry point and event wiring
// ============================================================
// This module owns:
//   - config loading and applying
//   - theme toggling
//   - clock
//   - toast notifications
//   - the render() orchestrator
//   - all static event listeners (replaces inline onclick)
//   - asset detection (logo, background)
//   - window-level function exposure for dynamic onclick in renderers
// ============================================================

import { state } from "./state.js";
import { getCategoryNames, getUniqueTeams, sortCategories, escapeHtml } from "./selectors.js";
import { loadInitialRunbook, loadFromServer, loadFromFile, saveDraft, exportRunbookJson, resetRunbook as doReset } from "./persistence.js";
import { renderGlobalStats, renderHealthIndicator } from "./render/stats.js";
import { renderTimeline } from "./render/timeline.js";
import { renderCategories } from "./render/categories.js";
import { renderIssues, toggleIssueForm, saveIssue as doSaveIssue, closeIssue as doCloseIssue, reopenIssue as doReopenIssue, editIssue as doEditIssue, deleteIssue as doDeleteIssue } from "./render/issues.js";
import { generateSummary as doGenerateSummary, copySummaryToClipboard as doCopySummaryToClipboard } from "./render/summary.js";
import { setHealth as doSetHealth } from "./actions/health.js";
import { expandAll as doExpandAll, collapseAll as doCollapseAll } from "./actions/tasks.js";
import { toggleIssuesPanel as doToggleIssuesPanel } from "./actions/issues.js";
import { exportPhoneSnapshot } from "./export/phone.js";
import { exportEmailSnapshot } from "./export/email.js";
import { exportGanttChart } from "./export/gantt.js";

// ── Helpers ────────────────────────────────────────────────

function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2500);
}

function updateClock() {
    const now = new Date();
    document.getElementById("clock").textContent =
        now.toLocaleString("en-GB", {
            weekday: "short", day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
        }) + " UK";
}

// ── Config ─────────────────────────────────────────────────

async function loadConfig() {
    try {
        const res = await fetch("config.json");
        const cfg = await res.json();
        Object.assign(state.projectConfig, cfg);
    } catch(e) { /* config.json optional — use defaults */ }
    applyConfig();
}

function applyConfig() {
    const c = state.projectConfig;
    document.title = c.projectName + " - Go-Live Runbook Dashboard";
    const h1 = document.querySelector(".header h1");
    if (h1) h1.textContent = c.projectName + " - Go-Live Runbook";
    const sub = document.querySelector(".subtitle");
    if (sub) sub.textContent = [c.subtitle, c.changeRef].filter(Boolean).join(" | ");
    if (c.accentColor) {
        document.documentElement.style.setProperty('--color-primary', c.accentColor);
    }
}

// ── Theme ──────────────────────────────────────────────────

function initTheme() {
    const saved = localStorage.getItem("runbook_theme");
    if (saved === "light") document.documentElement.setAttribute("data-theme", "light");
}

function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    html.setAttribute("data-theme", next);
    localStorage.setItem("runbook_theme", next);
    renderHealthIndicator();
}

// ── Palette ────────────────────────────────────────────────

function initPalette() {
    const saved = localStorage.getItem("runbook_palette");
    if (saved === "neon") document.documentElement.setAttribute("data-palette", "neon");
    updatePaletteButton();
}

function togglePalette() {
    const html = document.documentElement;
    const current = html.getAttribute("data-palette");
    const next = current === "neon" ? null : "neon";
    if (next) {
        html.setAttribute("data-palette", next);
    } else {
        html.removeAttribute("data-palette");
    }
    localStorage.setItem("runbook_palette", next || "corporate");
    updatePaletteButton();
    renderHealthIndicator();
    render();
}

function updatePaletteButton() {
    const btn = document.getElementById("paletteToggle");
    if (!btn) return;
    const isNeon = document.documentElement.getAttribute("data-palette") === "neon";
    btn.textContent = isNeon ? "🟢 Neon" : "Corporate";
}

// ── Health ─────────────────────────────────────────────────

function setHealth(status) {
    doSetHealth(status);
    renderHealthIndicator();
    renderGlobalStats();
}

// ── Team filter ────────────────────────────────────────────

function populateTeamFilter() {
    const sel = document.getElementById("teamFilter");
    const current = sel.value;
    const teams = getUniqueTeams();
    sel.innerHTML = '<option value="all">All Teams</option>' +
        teams.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    sel.value = current;
}

// ── Core render ────────────────────────────────────────────

function render() {
    renderGlobalStats();
    renderIssues();
    populateTeamFilter();

    let categories = sortCategories(getCategoryNames());
    renderTimeline(categories, render);
    renderCategories(categories, render, showToast);
}

// ── Runbook loading ────────────────────────────────────────

async function loadRunbook() {
    try {
        const { source } = await loadInitialRunbook();
        showToast(source === "browser draft" ? "Loaded saved progress" : "Loaded runbook.json");
        render();
    } catch (e) {
        document.getElementById("container").innerHTML =
            '<div class="no-results">Failed to load runbook.json. Make sure the file is in the same directory.</div>';
    }
}

// ── Action wrappers ────────────────────────────────────────

function resetRunbook() {
    if (!doReset()) return;
    render();
    showToast("Runbook has been reset");
}

function saveToLocalStorage() {
    saveDraft();
    showToast("Progress saved to runbook.json");
}

function saveIssue() { doSaveIssue(showToast); }
function closeIssue(id) { doCloseIssue(id); }
function reopenIssue(id) { doReopenIssue(id); }
function editIssue(id) { doEditIssue(id); }
function deleteIssue(id) { doDeleteIssue(id, showToast); }

function generateSummary() { doGenerateSummary(); }
function copySummaryToClipboard() { doCopySummaryToClipboard(showToast); }

// ── Export modals ──────────────────────────────────────────

function showExportIssueOptions(exportFn, filterSetter, title) {
    let modal = document.getElementById('exportIssueModal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'exportIssueModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999';
    modal.innerHTML = `
        <div style="background:var(--surface, #1a1a2e);border:1px solid var(--border, #333);border-radius:12px;padding:24px 32px;min-width:300px;text-align:center">
            <h3 style="margin:0 0 16px;color:var(--text, #fff);font-size:1.1em">${title} \u2014 Issues Filter</h3>
            <p style="margin:0 0 16px;color:var(--text-dim, #888);font-size:0.9em">Which issues to include in the export?</p>
            <div style="display:flex;gap:10px;justify-content:center">
                <button class="issue-btn save" id="expOptOpen">Open Only</button>
                <button class="issue-btn save" id="expOptAll">All Issues</button>
                <button class="issue-btn" id="expOptCancel">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#expOptOpen').addEventListener('click', () => { filterSetter('open'); modal.remove(); exportFn(); });
    modal.querySelector('#expOptAll').addEventListener('click', () => { filterSetter('all'); modal.remove(); exportFn(); });
    modal.querySelector('#expOptCancel').addEventListener('click', () => { modal.remove(); });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function showPhoneExportOptions() {
    showExportIssueOptions(() => exportPhoneSnapshot(showToast), (v) => { state.phoneExportIssueFilter = v; }, 'Phone Image');
}

function showEmailExportOptions() {
    showExportIssueOptions(() => exportEmailSnapshot(showToast), (v) => { state.emailExportIssueFilter = v; }, 'Email Image');
}

function exportGantt() { exportGanttChart(showToast); }

function exportJSON() {
    exportRunbookJson();
    showToast("JSON exported (includes issues)");
}

async function reloadRunbookJSON() {
    try {
        await loadFromServer();
        render();
        showToast("Reloaded runbook.json");
    } catch (e) {
        showToast("Failed to reload runbook.json");
    }
}

function triggerFileRunbookLoad() {
    const input = document.getElementById("runbookFileInput");
    input.value = "";
    input.click();
}

function handleRunbookFileSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    loadFromFile(file)
        .then(() => { render(); showToast("Loaded runbook from local file"); })
        .catch(e => showToast(e.message || "Failed to read local file"));
}

function expandAll() {
    doExpandAll();
    render();
}

function collapseAll() {
    doCollapseAll();
    render();
}

function toggleIssuesPanel(el) {
    doToggleIssuesPanel();
    document.getElementById('issuesList').style.display = state.issuesPanelOpen ? 'block' : 'none';
    el.querySelector('.iss-chevron').classList.toggle('open', state.issuesPanelOpen);
}

// ── Asset detection ────────────────────────────────────────

function setFavicon(src) {
    const link = document.getElementById('favicon');
    if (link) link.href = src;
}

function detectAssets() {
    const exts = ['png', 'jpg', 'jpeg', 'svg', 'webp'];

    function loadLogo(src) {
        const img = new Image();
        img.onload = () => {
            state.clientLogoImg = img;
            const el = document.getElementById('clientLogo');
            el.src = src;
            el.classList.remove('hidden');
            setFavicon(src);
        };
        img.src = src;
    }

    function loadBg(src) {
        const bgImg = new Image();
        bgImg.onload = () => {
            state.clientBgImg = bgImg;
            document.getElementById('bgOverlay').style.backgroundImage = 'url(' + src + ')';
        };
        bgImg.src = src;
    }

    if (state.projectConfig.logoFile) loadLogo('assets/' + state.projectConfig.logoFile);
    if (state.projectConfig.backgroundFile) loadBg('assets/' + state.projectConfig.backgroundFile);

    if (!state.projectConfig.logoFile || !state.projectConfig.backgroundFile) {
        fetch('assets/')
            .then(r => r.ok ? r.text() : '')
            .then(html => {
                if (!html) return;
                if (!state.projectConfig.logoFile) {
                    const m = html.match(/href="([^"]*clientLogo[^"]*\.(png|jpg|jpeg|svg|webp))"/i);
                    if (m) loadLogo('assets/' + m[1].replace(/.*\//, ''));
                }
                if (!state.projectConfig.backgroundFile) {
                    const m = html.match(/href="([^"]*background[^"]*\.(png|jpg|jpeg|svg|webp))"/i);
                    if (m) loadBg('assets/' + m[1].replace(/.*\//, ''));
                }
            })
            .catch(() => {
                if (!state.projectConfig.logoFile) {
                    exts.forEach(ext => loadLogo('assets/clientLogo.' + ext));
                }
                if (!state.projectConfig.backgroundFile) {
                    exts.forEach(ext => loadBg('assets/background.' + ext));
                }
            });
    }
}

// ── Static event listeners ─────────────────────────────────

function bindEvents() {
    // Theme toggle
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);

    // Palette toggle
    const paletteBtn = document.getElementById("paletteToggle");
    if (paletteBtn) paletteBtn.addEventListener("click", togglePalette);

    // Health dots
    document.querySelectorAll(".health-dot").forEach(dot => {
        dot.addEventListener("click", () => setHealth(dot.dataset.health));
    });

    // Filter buttons
    document.querySelectorAll(".filterBtn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filterBtn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.filterState = btn.dataset.filter;
            render();
        });
    });

    // Search
    document.getElementById("searchBox").addEventListener("input", (e) => {
        state.searchQuery = e.target.value.trim();
        render();
    });

    // Team filter
    document.getElementById("teamFilter").addEventListener("change", (e) => {
        state.teamFilter = e.target.value;
        render();
    });

    // Sort
    document.getElementById("sortSelect").addEventListener("change", (e) => {
        state.sortMode = e.target.value;
        render();
    });

    // Action buttons
    document.querySelector('[data-action="save"]').addEventListener("click", saveToLocalStorage);
    document.querySelector('[data-action="reload"]').addEventListener("click", reloadRunbookJSON);
    document.querySelector('[data-action="load-file"]').addEventListener("click", triggerFileRunbookLoad);
    document.querySelector('[data-action="phone-export"]').addEventListener("click", showPhoneExportOptions);
    document.querySelector('[data-action="email-export"]').addEventListener("click", showEmailExportOptions);
    document.querySelector('[data-action="gantt-export"]').addEventListener("click", exportGantt);
    document.querySelector('[data-action="summary"]').addEventListener("click", generateSummary);
    document.querySelector('[data-action="export-json"]').addEventListener("click", exportJSON);
    document.querySelector('[data-action="expand-all"]').addEventListener("click", expandAll);
    document.querySelector('[data-action="collapse-all"]').addEventListener("click", collapseAll);

    // File input
    document.getElementById("runbookFileInput").addEventListener("change", handleRunbookFileSelected);

    // Reset
    document.querySelector('[data-action="reset"]').addEventListener("click", resetRunbook);

    // Keyboard shortcut: Ctrl+S to save
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            saveToLocalStorage();
        }
    });
}

// ── Expose to window for dynamic onclick in renderers ──────
// (issues.js and summary.js generate HTML with onclick attributes
//  that reference these globals; will be migrated in a later phase)
Object.assign(window, {
    toggleIssueForm, saveIssue, closeIssue, reopenIssue, editIssue, deleteIssue,
    toggleIssuesPanel,
    copySummaryToClipboard,
});

// ── Boot ───────────────────────────────────────────────────

initTheme();
initPalette();
updateClock();
setInterval(updateClock, 1000);
bindEvents();
loadConfig().then(() => { detectAssets(); loadRunbook(); });
