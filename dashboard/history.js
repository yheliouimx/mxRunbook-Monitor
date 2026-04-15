// ============================================================
// history.js — Snapshot history for burndown chart / final report
// ============================================================
// Records timestamped completion snapshots to localStorage so
// the Final Report can render a burndown curve and health timeline.
// ============================================================

import { state } from "./state.js";
import { getGlobalStats } from "./selectors.js";

const STORAGE_KEY = "runbook_snapshots";
const MAX_SNAPSHOTS = 200;

let _timerId = null;

// ── Internal ──────────────────────────────────────────────

function _load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (_) {
        return [];
    }
}

function _save(snapshots) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
    } catch (_) { /* quota exceeded — skip silently */ }
}

// ── Public API ────────────────────────────────────────────

/**
 * Record the current completion state as a snapshot.
 * Deduplicates back-to-back identical pct values (noise reduction).
 */
export function recordSnapshot() {
    const { total, done, inProg, notStarted, blocking } = getGlobalStats();
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const health = state.healthStatus || "Green";

    const snapshots = _load();

    // Skip duplicate: same pct and same health as the previous entry
    const last = snapshots[snapshots.length - 1];
    if (last && last.pct === pct && last.health === health) return;

    snapshots.push({ ts: new Date().toISOString(), pct, done, total, inProg, notStarted, blocking, health });

    // Cap to MAX_SNAPSHOTS (drop oldest)
    if (snapshots.length > MAX_SNAPSHOTS) snapshots.splice(0, snapshots.length - MAX_SNAPSHOTS);

    _save(snapshots);
}

/**
 * Return the full array of recorded snapshots (oldest first).
 * @returns {Array<{ts:string, pct:number, done:number, total:number, inProg:number, notStarted:number, blocking:number, health:string}>}
 */
export function getSnapshots() {
    return _load();
}

/**
 * Clear all recorded snapshots from localStorage.
 */
export function clearSnapshots() {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Start an auto-snapshot timer.
 * Records immediately, then repeats every `intervalMs` milliseconds.
 * Calling this again replaces any existing timer.
 * @param {number} [intervalMs=900000] — default 15 minutes
 */
export function startAutoSnapshot(intervalMs = 15 * 60 * 1000) {
    if (_timerId !== null) clearInterval(_timerId);
    recordSnapshot(); // record immediately on start
    _timerId = setInterval(recordSnapshot, intervalMs);
}

/**
 * Stop the auto-snapshot timer (if running).
 */
export function stopAutoSnapshot() {
    if (_timerId !== null) {
        clearInterval(_timerId);
        _timerId = null;
    }
}
