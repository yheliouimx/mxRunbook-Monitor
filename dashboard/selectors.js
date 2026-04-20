import { state } from "./state.js";
import { STATUS, ISSUE_STATUS, ISSUE_SEVERITY } from "./constants.js";
import { getElapsedMs } from "./actions/timer.js";

// ── Status normalization & classification ──

export function normalizeStatus(s) {
    if (!s || s === "NaN") return STATUS.NOT_STARTED;
    const lower = s.toLowerCase().trim();
    if (lower === "completed" || lower === "done") return STATUS.COMPLETED;
    if (lower.includes("progress")) return STATUS.IN_PROGRESS;
    if (lower === "blocked" || lower === "blocking") return STATUS.BLOCKING;
    if (lower === "unneeded" || lower === "not needed" || lower === "n/a") return STATUS.UNNEEDED;
    return STATUS.NOT_STARTED;
}

export function statusClass(s) {
    if (s === STATUS.COMPLETED) return "done";
    if (s === STATUS.IN_PROGRESS) return "inprogress";
    if (s === STATUS.BLOCKING) return "blocked";
    if (s === STATUS.UNNEEDED) return "unneeded";
    return "notstarted";
}

export function computeCategoryStatus(tasks) {
    const done = tasks.filter(t => { const st = normalizeStatus(t.status); return st === STATUS.COMPLETED || st === STATUS.UNNEEDED; }).length;
    const inProg = tasks.filter(t => normalizeStatus(t.status) === STATUS.IN_PROGRESS).length;
    const blocking = tasks.filter(t => normalizeStatus(t.status) === STATUS.BLOCKING).length;
    if (done === tasks.length) return "done";
    if (blocking > 0) return "blocked";
    if (done > 0 || inProg > 0) return "inprogress";
    return "notstarted";
}

// ── Time helpers ──

export function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("en-GB", { month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false });
}

export function formatTimeShort(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit", hour12:false });
}

export function getEarliestTime(tasks) {
    let earliest = null;
    for (const t of tasks) {
        if (t.startTime) {
            const d = new Date(t.startTime);
            if (!isNaN(d) && (!earliest || d < earliest)) earliest = d;
        }
    }
    return earliest;
}

// ── Data queries (read from state) ──

export function getCategoryNames() {
    return Object.keys(state.runbookData).filter(k => !k.startsWith("_"));
}

export function getGlobalStats() {
    let total = 0, done = 0, inProg = 0, notStarted = 0, blocking = 0;
    Object.entries(state.runbookData).forEach(([key, tasks]) => {
        if (key.startsWith("_")) return;
        if (!Array.isArray(tasks)) return;
        tasks.forEach(t => {
            total++;
            const s = normalizeStatus(t.status);
            if (s === STATUS.COMPLETED || s === STATUS.UNNEEDED) done++;
            else if (s === STATUS.IN_PROGRESS) inProg++;
            else if (s === STATUS.BLOCKING) blocking++;
            else notStarted++;
        });
    });
    return { total, done, inProg, notStarted, blocking };
}

export function getUniqueTeams() {
    const teams = new Set();
    Object.entries(state.runbookData).forEach(([key, tasks]) => {
        if (key.startsWith("_") || !Array.isArray(tasks)) return;
        tasks.forEach(t => { if (t.assignee) teams.add(t.assignee); });
    });
    return [...teams].sort((a, b) => a.localeCompare(b));
}

// ── Filtering & sorting ──

export function matchesSearch(task) {
    if (!state.searchQuery) return true;
    const q = state.searchQuery.toLowerCase();
    const text = [task.item, task.task, task.assignee, task.taskId, task.system, task.comment]
        .map(v => v || "").join(" ").toLowerCase();
    return text.includes(q);
}

export function matchesTeam(task) {
    if (state.teamFilter === "all") return true;
    return (task.assignee || "") === state.teamFilter;
}

export function matchesSystem(task) {
    if (state.systemFilter === "all") return true;
    return (task.system || "") === state.systemFilter;
}

export function getUniqueSystems() {
    const systems = new Set();
    Object.entries(state.runbookData).forEach(([key, tasks]) => {
        if (key.startsWith("_") || !Array.isArray(tasks)) return;
        tasks.forEach(t => { if (t.system) systems.add(t.system); });
    });
    return [...systems].sort((a, b) => a.localeCompare(b));
}

export function sortCategories(categories) {
    if (state.sortMode === "completion") {
        return [...categories].sort((a, b) => {
            const pA = state.runbookData[a].filter(t => { const st = normalizeStatus(t.status); return st === STATUS.COMPLETED || st === STATUS.UNNEEDED; }).length / state.runbookData[a].length;
            const pB = state.runbookData[b].filter(t => { const st = normalizeStatus(t.status); return st === STATUS.COMPLETED || st === STATUS.UNNEEDED; }).length / state.runbookData[b].length;
            return pB - pA;
        });
    }
    if (state.sortMode === "alpha") {
        return [...categories].sort((a, b) => a.localeCompare(b));
    }
    if (state.sortMode === "original" || state.sortMode === "taskid") {
        // Keep categories in their original JSON insertion order
        return [...categories];
    }
    if (state.sortMode === "day") {
        // Sort categories by the calendar date (date portion only) of their earliest task startTime
        return [...categories].sort((a, b) => {
            const tA = getEarliestTime(state.runbookData[a]);
            const tB = getEarliestTime(state.runbookData[b]);
            if (!tA && !tB) return 0;
            if (!tA) return 1;
            if (!tB) return -1;
            const dA = new Date(tA.getFullYear(), tA.getMonth(), tA.getDate());
            const dB = new Date(tB.getFullYear(), tB.getMonth(), tB.getDate());
            return dA - dB;
        });
    }
    // timeline: sort by earliest task start time (full datetime)
    return [...categories].sort((a, b) => {
        const tA = getEarliestTime(state.runbookData[a]);
        const tB = getEarliestTime(state.runbookData[b]);
        if (!tA && !tB) return 0;
        if (!tA) return 1;
        if (!tB) return -1;
        return tA - tB;
    });
}

/**
 * Sort tasks within a category for display. Does not mutate the original array.
 * - "day"    : sort by full startTime datetime (chronological within each category)
 * - "taskid" : alphabetical/numeric by taskId (tasks with no taskId go to end)
 * - all other modes: original array order
 */
export function sortTasks(tasks) {
    if (state.sortMode === "day") {
        return [...tasks].sort((a, b) => {
            const _toDate = iso => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : d; };
            const tA = _toDate(a.startTime);
            const tB = _toDate(b.startTime);
            if (!tA && !tB) return 0;
            if (!tA) return 1;
            if (!tB) return -1;
            return tA - tB;
        });
    }
    if (state.sortMode === "taskid") {
        return [...tasks].sort((a, b) => {
            const idA = a.taskId || null;
            const idB = b.taskId || null;
            if (!idA && !idB) return 0;
            if (!idA) return 1;
            if (!idB) return -1;
            return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: "base" });
        });
    }
    return tasks;
}

/**
 * Group all tasks across all categories by calendar date (from startTime).
 * Returns an ordered array of { label, dateKey, tasks } where each task has
 * _origCat and _origIdx set so the original data can always be addressed.
 *
 * Tasks with no parseable date go into a trailing "No Date" bucket.
 * Within each bucket tasks are sorted chronologically by startTime.
 */
export function getTasksGroupedByDay() {
    const buckets = new Map();  // dateKey (YYYY-MM-DD | "nodate") → task list
    const NO_DATE = "nodate";

    Object.entries(state.runbookData).forEach(([cat, tasks]) => {
        if (cat.startsWith("_") || !Array.isArray(tasks)) return;
        tasks.forEach((t, idx) => {
            const enriched = { ...t, _origCat: cat, _origIdx: idx };
            let key = NO_DATE;
            if (t.startTime) {
                const d = new Date(t.startTime);
                if (!isNaN(d)) {
                    key = d.toISOString().slice(0, 10); // YYYY-MM-DD
                }
            }
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(enriched);
        });
    });

    // Sort bucket keys chronologically, keep "nodate" last
    const sortedKeys = [...buckets.keys()].filter(k => k !== NO_DATE).sort();
    if (buckets.has(NO_DATE)) sortedKeys.push(NO_DATE);

    return sortedKeys.map(key => {
        const tasks = buckets.get(key).sort((a, b) => {
            const tA = a.startTime ? new Date(a.startTime) : null;
            const tB = b.startTime ? new Date(b.startTime) : null;
            if (!tA && !tB) return 0;
            if (!tA) return 1;
            if (!tB) return -1;
            return tA - tB;
        });
        let label;
        if (key === NO_DATE) {
            label = "No Date";
        } else {
            const d = new Date(key + "T00:00:00");
            label = d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
        }
        return { label, dateKey: key, tasks };
    });
}

// ── Utility ──

export function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

// ── Derived issue helpers ──

export function getOpenIssues() {
    return state.issues.filter(i => i.issueStatus === ISSUE_STATUS.ONGOING);
}

export function getClosedIssues() {
    return state.issues.filter(i => i.issueStatus === ISSUE_STATUS.CLOSED);
}

export function getBlockingIssues() {
    return state.issues.filter(i => i.issueStatus === ISSUE_STATUS.ONGOING && i.severity === ISSUE_SEVERITY.BLOCKING);
}

export function getCompletionPct() {
    const { total, done } = getGlobalStats();
    return total > 0 ? Math.round((done / total) * 100) : 0;
}

// ── Run timer analytics (Phase 2 + 3) ──────────────────────

export function getTotalEstimatedMs() {
    if (!state.runStart) return null;
    let latest = null;
    for (const [key, tasks] of Object.entries(state.runbookData)) {
        if (key.startsWith('_') || !Array.isArray(tasks)) continue;
        for (const t of tasks) {
            if (!t.estimatedEnd) continue;
            const d = new Date(t.estimatedEnd);
            if (!isNaN(d) && (!latest || d > latest)) latest = d;
        }
    }
    if (!latest) return null;
    const ms = latest.getTime() - state.runStart;
    return ms > 0 ? ms : null;
}

export function getEstimationCoverage() {
    let total = 0, covered = 0;
    for (const [key, tasks] of Object.entries(state.runbookData)) {
        if (key.startsWith('_') || !Array.isArray(tasks)) continue;
        for (const t of tasks) {
            if (normalizeStatus(t.status) === STATUS.UNNEEDED) continue;
            total++;
            if (t.estimatedEnd) covered++;
        }
    }
    return total > 0 ? covered / total : 0;
}

export function getTimeDelta() {
    if (!state.runStart) return null;
    // Allow stopped state only when stoppedAt is recorded (shows frozen final values)
    if (state.timerState === 'stopped' && !state.stoppedAt) return null;
    const totalMs = getTotalEstimatedMs();
    if (!totalMs) return null;
    if (getEstimationCoverage() < 0.6) return null;
    const completionPct = getCompletionPct();
    const timeProgressPct = Math.min(100, Math.round((getElapsedMs() / totalMs) * 100));
    const deltaPct = completionPct - timeProgressPct;
    return { timeProgressPct, completionPct, deltaPct };
}

export function getHealthAdvisory() {
    if (state.timerState === 'stopped' || !state.runStart) return null;
    const delta = getTimeDelta();
    if (!delta) return null;
    const t = (state.projectConfig.healthThresholds) || { ahead: 5, onTrack: -10, atRisk: -25 };
    const d = delta.deltaPct;
    if (d > t.ahead)   return null;      // ahead of schedule — no advisory needed
    if (d >= t.onTrack) return 'Green';
    if (d >= t.atRisk)  return 'Amber';
    return 'Red';
}
