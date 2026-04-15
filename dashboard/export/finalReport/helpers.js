/**
 * finalReport/helpers.js
 * Shared utilities and per-assignee stats builder for the Final Report.
 */

import { state } from "../../state.js";
import { normalizeStatus } from "../../selectors.js";
import { STATUS, ISSUE_STATUS, ISSUE_SEVERITY } from "../../constants.js";

// ── HTML escape (no DOM dependency — safe in any context) ──

export function esc(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ── Date formatting ────────────────────────────────────────

export function fmtDatetime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
    });
}

export function fmtTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// ── Per-assignee stats ─────────────────────────────────────

/**
 * Aggregate task counts per assignee across all categories.
 * @param {string[]} categories
 * @returns {Array<{name,assigned,done,inProg,notStarted,blocking,overruns}>}
 */
export function buildAssigneeStats(categories) {
    const map = {};

    categories.forEach(cat => {
        (state.runbookData[cat] || []).forEach(t => {
            const name = t.assignee;
            if (!name) return;

            if (!map[name]) {
                map[name] = {
                    name,
                    assigned: 0, done: 0, inProg: 0,
                    notStarted: 0, blocking: 0, overruns: 0,
                };
            }

            const s = normalizeStatus(t.status);
            map[name].assigned++;
            if (s === STATUS.COMPLETED || s === STATUS.UNNEEDED) map[name].done++;
            else if (s === STATUS.IN_PROGRESS)                   map[name].inProg++;
            else if (s === STATUS.BLOCKING)                      map[name].blocking++;
            else                                                  map[name].notStarted++;

            // Overrun: actual endTime > estimatedEnd by > 5 min
            if (t.endTime && t.estimatedEnd) {
                const actual  = new Date(t.endTime).getTime();
                const planned = new Date(t.estimatedEnd).getTime();
                if (!isNaN(actual) && !isNaN(planned) && actual > planned + 5 * 60_000) {
                    map[name].overruns++;
                }
            }
        });
    });

    return Object.values(map).sort((a, b) => b.assigned - a.assigned);
}

// ── Issue list helpers ─────────────────────────────────────

export function partitionIssues(issues) {
    const open   = issues.filter(i => i.issueStatus === ISSUE_STATUS.ONGOING);
    const closed = issues.filter(i => i.issueStatus === ISSUE_STATUS.CLOSED);
    return { open, closed, all: [...open, ...closed] };
}

export { ISSUE_STATUS, ISSUE_SEVERITY };
