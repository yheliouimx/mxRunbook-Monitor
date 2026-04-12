import { state } from "./state.js";
import { RESERVED_KEYS } from "./constants.js";

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
 * Load runbook on startup. Priority:
 *   1. localStorage ("runbook_progress") — working draft
 *   2. runbook.json (server fetch) — baseline template
 * Returns { source: string } on success, throws on total failure.
 */
export async function loadInitialRunbook() {
    const saved = localStorage.getItem("runbook_progress");
    if (saved) {
        try {
            state.runbookData = JSON.parse(saved);
            readReservedKeys();
            return { source: "browser draft" };
        } catch (e) { /* fall through to fetch */ }
    }
    const res = await fetch("runbook.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    state.runbookData = await res.json();
    readReservedKeys();
    return { source: "runbook.json" };
}

/**
 * Reload runbook.json from server, discarding current draft.
 */
export async function loadFromServer() {
    const res = await fetch("runbook.json?_ts=" + Date.now(), { cache: "no-store" });
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
 * Validates minimally, reads reserved keys, resets UI state.
 */
export function applyLoadedRunbook(fresh) {
    if (!fresh || typeof fresh !== "object" || Array.isArray(fresh)) {
        throw new Error("Invalid JSON structure");
    }
    state.runbookData = fresh;
    readReservedKeys();
    state.issueFormOpen = false;
    state.editingIssueId = null;
}

/**
 * Save working draft to localStorage AND download a runbook.json snapshot.
 */
export function saveDraft() {
    syncReservedKeys();
    localStorage.setItem("runbook_progress", JSON.stringify(state.runbookData));
    const blob = new Blob([JSON.stringify(state.runbookData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "runbook.json";
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
 * Reset all tasks to "Not Started", clear issues and health.
 * Returns false if user cancelled, true if reset was performed.
 */
export function resetRunbook() {
    if (!confirm("⚠ WARNING: This will reset ALL task statuses back to \"Not Started\" and clear all issues.\n\nThis action cannot be undone.\n\nAre you sure?")) return false;
    if (!confirm("FINAL CONFIRMATION: You are about to reset the ENTIRE runbook. Continue?")) return false;
    Object.keys(state.runbookData).filter(k => !k.startsWith("_")).forEach(cat => {
        state.runbookData[cat].forEach(t => { t.status = "Not Started"; });
    });
    state.issues.length = 0;
    state.runbookData[RESERVED_KEYS.issues] = [];
    state.healthStatus = "Green";
    state.runbookData[RESERVED_KEYS.health] = "Green";
    localStorage.removeItem("runbook_progress");
    return true;
}
