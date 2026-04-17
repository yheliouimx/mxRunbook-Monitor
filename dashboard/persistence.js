import { state } from "./state.js";
import { RESERVED_KEYS, STATUS } from "./constants.js";
import { validateAndNormalize, formatErrors } from "./validation.js";

// ── Per-client localStorage key prefix ───────────────────────
// electron-main.js injects ?clientKey=<slug> into the URL so each client
// folder gets its own isolated storage bucket.
// Falls back to no prefix so the browser / dev-server path is unaffected.
function _clientPrefix() {
    try {
        const k = new URLSearchParams(window.location.search).get('clientKey');
        return k ? k + ':' : '';
    } catch (_) { return ''; }
}
const _PREFIX       = _clientPrefix();
const PROGRESS_KEY  = _PREFIX + 'runbook_progress';
const SNAPSHOTS_KEY = _PREFIX + 'runbook_snapshots';
const TIMER_KEY     = _PREFIX + 'runbook_timer';

// ── Internal helpers ──

function syncReservedKeys() {
    state.runbookData[RESERVED_KEYS.issues] = state.issues;
    state.runbookData[RESERVED_KEYS.health] = state.healthStatus;
}

function readReservedKeys() {
    state.issues = state.runbookData[RESERVED_KEYS.issues] || [];
    state.healthStatus = state.runbookData[RESERVED_KEYS.health] || "Green";
}

// ── Public API ──

/**
 * Return the runbook filename to fetch.
 * Uses state.projectConfig.runbookFile if set, otherwise "runbook.json".
 */
function runbookFile() {
    return (state.projectConfig && state.projectConfig.runbookFile) || "runbook.json";
}

/**
 * Load runbook on startup. Priority:
 *   1. localStorage ("runbook_progress") — working draft
 *   2. runbookFile from config.json (server fetch) — baseline template
 * Returns { source: string } on success, throws on total failure.
 */
export async function loadInitialRunbook() {
    const saved = localStorage.getItem(PROGRESS_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            applyLoadedRunbook(parsed);
            return { source: "browser draft" };
        } catch (e) { /* fall through to fetch */ }
    }
    const file = runbookFile();
    const res = await fetch(file);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const fetched = await res.json();
    applyLoadedRunbook(fetched);
    return { source: file };
}

/**
 * Reload runbook from server (uses configured filename), discarding current draft.
 */
export async function loadFromServer() {
    const file = runbookFile();
    const res = await fetch(file + "?_ts=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const fresh = await res.json();
    applyLoadedRunbook(fresh);
}

/**
 * Load runbook from a File object (user-selected local file).
 * Returns a Promise that resolves on success.
 */
export function loadFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const fresh = JSON.parse(reader.result);
                applyLoadedRunbook(fresh);
                resolve();
            } catch (e) {
                reject(new Error("Invalid JSON file"));
            }
        };
        reader.onerror = () => reject(new Error("Failed to read local file"));
        reader.readAsText(file);
    });
}

/**
 * Apply a parsed runbook object as the active in-memory state.
 * Validates against schema, normalizes optional fields, then applies.
 */
export function applyLoadedRunbook(fresh) {
    const { errors, data } = validateAndNormalize(fresh);
    if (errors.length > 0) {
        throw new Error(formatErrors(errors));
    }
    state.runbookData = data;
    readReservedKeys();
    state.issueFormOpen = false;
    state.editingIssueId = null;
}

/**
 * Save working draft to localStorage AND download a JSON snapshot.
 */
export function saveDraft() {
    syncReservedKeys();
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.runbookData));
    const blob = new Blob([JSON.stringify(state.runbookData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = runbookFile();
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Export runbook as a dated JSON file (includes issues and health).
 */
export function exportRunbookJson() {
    const exportData = Object.assign({}, state.runbookData, {
        [RESERVED_KEYS.issues]: state.issues,
        [RESERVED_KEYS.health]: state.healthStatus,
    });
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "runbook_" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Reset all tasks to "Not Started", clear issues, health, and snapshot history.
 * Confirmation is handled by the caller (app.js showConfirm modal).
 * Returns true when reset was performed.
 */
export function resetRunbook() {
    Object.keys(state.runbookData).filter(k => !k.startsWith("_")).forEach(cat => {
        state.runbookData[cat].forEach(t => { t.status = STATUS.NOT_STARTED; });
    });
    state.issues.length = 0;
    state.runbookData[RESERVED_KEYS.issues] = [];
    state.healthStatus = "Green";
    state.runbookData[RESERVED_KEYS.health] = "Green";
    // Reset timer
    state.runStart       = null;
    state.pausedDuration = 0;
    state.pauseStart     = null;
    state.timerState     = "stopped";
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(SNAPSHOTS_KEY);
    localStorage.removeItem(TIMER_KEY);
    return true;
}

/**
 * Persist run timer state to localStorage.
 */
export function saveTimerState() {
    const { runStart, pausedDuration, pauseStart, timerState } = state;
    localStorage.setItem(TIMER_KEY, JSON.stringify({ runStart, pausedDuration, pauseStart, timerState }));
}

/**
 * Restore run timer state from localStorage.
 * Called during app boot so the timer survives page refreshes.
 */
export function loadTimerState() {
    const saved = localStorage.getItem(TIMER_KEY);
    if (!saved) return;
    try {
        const { runStart, pausedDuration, pauseStart, timerState } = JSON.parse(saved);
        state.runStart       = runStart       || null;
        state.pausedDuration = pausedDuration || 0;
        state.pauseStart     = pauseStart     || null;
        state.timerState     = timerState     || "stopped";
    } catch (_) { /* corrupt data — ignore */ }
}
