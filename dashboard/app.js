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
import { getCategoryNames, getUniqueTeams, getUniqueSystems, sortCategories, escapeHtml } from "./selectors.js";
import { loadInitialRunbook, loadFromServer, loadFromFile, saveDraft, exportRunbookJson, resetRunbook as doReset, loadTimerState } from "./persistence.js";
import { renderGlobalStats, renderHealthIndicator, updateStatsValues, updateSentinelBar } from "./render/stats.js";
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
import { exportFinalReport } from "./export/finalReport.js";
import { startAutoSnapshot, recordSnapshot } from "./history.js";
import { startTimer, pauseTimer, resumeTimer, stopTimer } from "./actions/timer.js";

// ── Helpers ────────────────────────────────────────────────

function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2500);
}

/**
 * Show a styled confirmation modal. Returns a Promise<boolean>.
 * @param {string} title - Dialog heading
 * @param {string} message - Body text
 * @param {object} [opts] - { confirmLabel, confirmClass }
 */
function showConfirm(title, message, opts = {}) {
    return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.className = "confirm-overlay";
        overlay.innerHTML = `
            <div class="confirm-dialog">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="confirm-actions">
                    <button class="confirm-btn" data-role="cancel">Cancel</button>
                    <button class="confirm-btn ${opts.confirmClass || 'danger'}" data-role="confirm">${opts.confirmLabel || 'Confirm'}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const cleanup = (val) => { overlay.remove(); resolve(val); };
        overlay.querySelector('[data-role="cancel"]').addEventListener("click", () => cleanup(false));
        overlay.querySelector('[data-role="confirm"]').addEventListener("click", () => cleanup(true));
        overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(false); });
        overlay.querySelector('[data-role="cancel"]').focus();
    });
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
        const hasClientDir = new URLSearchParams(window.location.search).has('clientKey');
        const configUrl = hasClientDir ? '/client-config' : 'config.json';
        const res = await fetch(configUrl);
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
    if (sub) sub.textContent = [c.client, c.environment, c.release, c.subtitle, c.changeRef].filter(Boolean).join(" | ");
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
    const isNeon = document.documentElement.getAttribute("data-palette") === "neon";
    const label = isNeon ? "🟢 Neon" : "Corporate";
    document.querySelectorAll("#paletteToggle, #paletteToggle2").forEach(btn => {
        if (btn) btn.textContent = label;
    });
}

// ── Health ─────────────────────────────────────────────────

function setHealth(status) {
    doSetHealth(status);
    renderHealthIndicator();
    recordSnapshot(); // capture health transition immediately
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

function populateSystemFilter() {
    const sel = document.getElementById("systemFilter");
    if (!sel) return;
    const current = sel.value;
    const systems = getUniqueSystems();
    sel.style.display = systems.length > 0 ? "" : "none";
    if (systems.length === 0) { state.systemFilter = "all"; return; }
    sel.innerHTML = '<option value="all">All Systems</option>' +
        systems.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    if (systems.includes(current)) sel.value = current;
}

// ── Core render ────────────────────────────────────────────

function render() {
    renderGlobalStats();
    renderIssues();
    populateTeamFilter();
    populateSystemFilter();

    let categories = sortCategories(getCategoryNames());
    renderTimeline(categories, render);
    renderCategories(categories, render, showToast);
}

// ── Runbook loading ────────────────────────────────────────

async function loadRunbook() {
    try {
        const { source } = await loadInitialRunbook();
        showToast(source === "browser draft" ? "Loaded saved progress" : `Loaded ${source}`);
        render();
        // After initial render completes, suppress intro animations on future re-renders
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.documentElement.classList.add("loaded");
            });
        });
    } catch (e) {
        document.getElementById("container").innerHTML =
            '<div class="no-results">Failed to load runbook file. Check that the file specified in config.json exists in the same directory.</div>';
    }
}

// ── Action wrappers ────────────────────────────────────────

function resetRunbook() {
    showConfirm(
        "⚠ Reset Entire Runbook",
        "This will reset ALL task statuses back to &ldquo;Not Started&rdquo; and clear all issues.<br><br><strong>This action cannot be undone.</strong>",
        { confirmLabel: "Reset Runbook", confirmClass: "danger" }
    ).then(ok => {
        if (!ok) return;
        if (!doReset()) return;
        render();
        showToast("Runbook has been reset");
    });
}

function saveToLocalStorage() {
    saveDraft();
    showToast("Progress saved to " + (state.projectConfig.runbookFile || "runbook.json"));
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

async function exportReport() {
    try {
        await exportFinalReport(showToast);
    } catch (e) {
        showToast("Failed to generate report");
    }
}

function exportJSON() {
    exportRunbookJson();
    showToast("JSON exported (includes issues)");
}

async function reloadRunbookJSON() {
    try {
        await loadFromServer();
        render();
        showToast("Reloaded " + (state.projectConfig.runbookFile || "runbook.json"));
    } catch (e) {
        showToast("Failed to reload runbook file");
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
    let logoLoaded = false;
    let bgLoaded = false;
    let autoDetectAttempted = false;

    // When navigated from the welcome page with a client folder selected, assets are
    // served via the /client-asset/ proxy route; otherwise fall back to local assets/.
    const isClientMode = new URLSearchParams(window.location.search).has('clientKey');
    const clientPrefix = isClientMode ? '/client-asset/' : 'assets/';

    function loadLogo(src) {
        const img = new Image();
        img.onload = () => {
            logoLoaded = true;
            state.clientLogoImg = img;
            const el = document.getElementById('clientLogo');
            el.src = src;
            el.classList.remove('hidden');
            setFavicon(src);
        };
        img.onerror = () => {
            // Fallback to auto-detect when explicit config path fails
            tryAutoDetect();
        };
        img.src = src;
    }

    function loadBg(src) {
        const bgImg = new Image();
        bgImg.onload = () => {
            bgLoaded = true;
            state.clientBgImg = bgImg;
            document.getElementById('bgOverlay').style.backgroundImage = 'url(' + src + ')';
        };
        bgImg.onerror = () => {
            // Fallback to auto-detect when explicit config path fails
            tryAutoDetect();
        };
        bgImg.src = src;
    }

    function pickFirstMatch(html, patterns) {
        for (const p of patterns) {
            const m = html.match(p);
            if (m) return m[1].replace(/.*\//, '');
        }
        return null;
    }

    function tryAutoDetect() {
        if (autoDetectAttempted) return;
        autoDetectAttempted = true;

        fetch('assets/')
            .then(r => r.ok ? r.text() : '')
            .then(html => {
                if (!html) return;

                if (!logoLoaded) {
                    // Match any filename containing "logo" (e.g. logo.png, acme-logo.svg, mylogo.jpg).
                    // clientLogo-* files are client-specific and not in the distribution.
                    const logoName = pickFirstMatch(html, [
                        /href="([^"]*logo[^"]*\.(png|jpg|jpeg|svg|webp))"/i,
                    ]);
                    if (logoName) loadLogo('assets/' + logoName);
                }

                if (!bgLoaded) {
                    const bgName = pickFirstMatch(html, [
                        /href="([^"]*\bbackground[^"]*\.(png|jpg|jpeg|svg|webp))"/i,
                    ]);
                    if (bgName) loadBg('assets/' + bgName);
                }
            })
            .catch(() => {
                // Last-resort filename guesses when directory listing fails
                if (!logoLoaded) {
                    ['logo', 'client-logo', 'clientlogo'].forEach(base => {
                        exts.forEach(ext => loadLogo('assets/' + base + '.' + ext));
                    });
                }
                if (!bgLoaded) {
                    exts.forEach(ext => loadBg('assets/background.' + ext));
                }
            });
    }

    if (state.projectConfig.logoFile) loadLogo(clientPrefix + state.projectConfig.logoFile);
    if (state.projectConfig.backgroundFile) loadBg(clientPrefix + state.projectConfig.backgroundFile);

    // In non-client mode with no backgroundFile configured, always try the Murex default
    // so the dashboard is never plain black. CSS already sets it as a fallback (Phase 6),
    // but this ensures the loaded-state flag is consistent.
    if (!state.projectConfig.backgroundFile && !isClientMode) {
        loadBg('assets/Murex_background6.jpg');
    }

    // Always run a delayed auto-detect pass. If explicit files loaded, it no-ops;
    // if they failed/missing, it recovers by probing assets listing/guesses.
    // Skip auto-detect in client mode — assets are only accessible via /client-asset/ and
    // filenames must come from config.json.
    setTimeout(() => {
        if (!isClientMode && (!logoLoaded || !bgLoaded)) tryAutoDetect();
    }, 150);
}

// ── Static event listeners ─────────────────────────────────

function bindEvents() {
    // Theme toggle (primary in header-right, fallback hidden wrap)
    document.querySelectorAll("#themeToggle, #themeToggle2").forEach(el => {
        if (el) el.addEventListener("click", toggleTheme);
    });

    // Palette toggle (primary in header-right, fallback hidden wrap)
    document.querySelectorAll("#paletteToggle, #paletteToggle2").forEach(el => {
        if (el) el.addEventListener("click", togglePalette);
    });

    // Health dots
    document.querySelectorAll(".health-dot").forEach(dot => {
        dot.addEventListener("click", () => setHealth(dot.dataset.health));
    });

    // Filter buttons (accessible: button elements with aria-pressed)
    document.querySelectorAll(".filterBtn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filterBtn").forEach(b => {
                b.classList.remove("active");
                b.setAttribute("aria-pressed", "false");
            });
            btn.classList.add("active");
            btn.setAttribute("aria-pressed", "true");
            state.filterState = btn.dataset.filter;
            render();
        });
    });

    // Sticky filter bar scroll detection
    const controlsBar = document.getElementById("controlsBar");
    if (controlsBar) {
        const observer = new IntersectionObserver(
            ([e]) => controlsBar.classList.toggle("stuck", e.intersectionRatio < 1),
            { threshold: [1], rootMargin: "-1px 0px 0px 0px" }
        );
        observer.observe(controlsBar);
    }

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

    // System filter (v2 — only visible when runbook has system-tagged tasks)
    const systemFilterEl = document.getElementById("systemFilter");
    if (systemFilterEl) {
        systemFilterEl.addEventListener("change", (e) => {
            state.systemFilter = e.target.value;
            render();
        });
    }

    // Sort
    document.getElementById("sortSelect").addEventListener("change", (e) => {
        state.sortMode = e.target.value;
        render();
    });

    // Action buttons
    document.querySelector('[data-action="save"]').addEventListener("click", saveToLocalStorage);
    document.querySelector('[data-action="reload"]').addEventListener("click", reloadRunbookJSON);
    document.querySelector('[data-action="load-file"]').addEventListener("click", triggerFileRunbookLoad);

    // Export dropdown
    const exportTrigger = document.querySelector('[data-action="export-menu"]');
    const exportMenu = document.getElementById("exportMenu");
    if (exportTrigger && exportMenu) {
        exportTrigger.addEventListener("click", () => {
            exportMenu.classList.toggle("open");
        });
        document.addEventListener("click", (e) => {
            if (!e.target.closest("#exportDropdown")) exportMenu.classList.remove("open");
        });
        exportMenu.querySelector('[data-action="phone-export"]').addEventListener("click", () => { exportMenu.classList.remove("open"); showPhoneExportOptions(); });
        exportMenu.querySelector('[data-action="email-export"]').addEventListener("click", () => { exportMenu.classList.remove("open"); showEmailExportOptions(); });
        exportMenu.querySelector('[data-action="gantt-export"]').addEventListener("click", () => { exportMenu.classList.remove("open"); exportGantt(); });
        exportMenu.querySelector('[data-action="summary"]').addEventListener("click", () => { exportMenu.classList.remove("open"); generateSummary(); });
        exportMenu.querySelector('[data-action="export-json"]').addEventListener("click", () => { exportMenu.classList.remove("open"); exportJSON(); });
        exportMenu.querySelector('[data-action="final-report"]').addEventListener("click", () => { exportMenu.classList.remove("open"); exportReport(); });
    }

    document.querySelector('[data-action="expand-all"]').addEventListener("click", expandAll);
    document.querySelector('[data-action="collapse-all"]').addEventListener("click", collapseAll);

    // File input
    document.getElementById("runbookFileInput").addEventListener("change", handleRunbookFileSelected);

    // Reset
    document.querySelector('[data-action="reset"]').addEventListener("click", resetRunbook);

    // Sentinel strip — run timer controls + advisory accept (static DOM, direct delegation)
    document.getElementById("sentinelBar").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === "timer-start") {
            if (state.timerState === "paused") resumeTimer(); else startTimer();
            updateSentinelBar();
        } else if (action === "timer-pause") {
            pauseTimer();
            updateSentinelBar();
        } else if (action === "timer-stop") {
            showConfirm("Stop Run Timer", "Stop the run timer and reset elapsed time?",
                { confirmLabel: "Stop Timer", confirmClass: "danger" }
            ).then(ok => { if (ok) { stopTimer(); updateSentinelBar(); } });
        } else if (action === "advisory-accept") {
            const advisory = document.getElementById("sentinelAdvisoryLabel")?.textContent?.replace("⚠ Auto: ", "");
            if (advisory === "Green" || advisory === "Amber" || advisory === "Red") {
                setHealth(advisory);
                render();
            }
        }
    });

    // Keyboard shortcut: Ctrl+S to save
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            saveToLocalStorage();
        }
    });

    // Back-to-welcome button (Electron only — hidden by default, shown when electronAPI present)
    if (window.electronAPI && window.electronAPI.isElectron) {
        const backBtn = document.getElementById('backToWelcomeBtn');
        if (backBtn) {
            backBtn.style.display = 'inline-flex';
            backBtn.addEventListener('click', () => window.electronAPI.openWelcome());
        }
    }
}

// ── Expose to window for dynamic onclick in renderers ──────
// (issues.js and summary.js generate HTML with onclick attributes
//  that reference these globals; will be migrated in a later phase)
Object.assign(window, {
    toggleIssueForm, saveIssue, closeIssue, reopenIssue, editIssue, deleteIssue,
    toggleIssuesPanel,
    copySummaryToClipboard,
    showConfirm,
});

// ── Boot ───────────────────────────────────────────────────

initTheme();
initPalette();
updateClock();
setInterval(updateClock, 1000);
setInterval(updateSentinelBar, 1000);
loadTimerState();
bindEvents();
loadConfig().then(() => { detectAssets(); loadRunbook(); });
startAutoSnapshot(15 * 60 * 1000);
