import { state } from "./state.js";
import { STATUS, ISSUE_STATUS, ISSUE_SEVERITY } from "./constants.js";

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
    // timeline: sort by earliest task start time
    return [...categories].sort((a, b) => {
        const tA = getEarliestTime(state.runbookData[a]);
        const tB = getEarliestTime(state.runbookData[b]);
        if (!tA && !tB) return 0;
        if (!tA) return 1;
        if (!tB) return -1;
        return tA - tB;
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
