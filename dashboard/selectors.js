import { state } from "./state.js";

// ── Status normalization & classification ──

export function normalizeStatus(s) {
    if (!s || s === "NaN") return "Not Started";
    const lower = s.toLowerCase().trim();
    if (lower === "completed" || lower === "done") return "Completed";
    if (lower.includes("progress")) return "In Progress";
    if (lower === "blocked" || lower === "blocking") return "Blocking";
    if (lower === "unneeded" || lower === "not needed" || lower === "n/a") return "Unneeded";
    return "Not Started";
}

export function statusClass(s) {
    if (s === "Completed") return "done";
    if (s === "In Progress") return "inprogress";
    if (s === "Blocking") return "blocked";
    if (s === "Unneeded") return "unneeded";
    return "notstarted";
}

export function computeCategoryStatus(tasks) {
    const done = tasks.filter(t => { const st = normalizeStatus(t.status); return st === "Completed" || st === "Unneeded"; }).length;
    const inProg = tasks.filter(t => normalizeStatus(t.status) === "In Progress").length;
    const blocking = tasks.filter(t => normalizeStatus(t.status) === "Blocking").length;
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
            if (s === "Completed" || s === "Unneeded") done++;
            else if (s === "In Progress") inProg++;
            else if (s === "Blocking") blocking++;
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
    const text = ((task.item || "") + " " + (task.task || "") + " " + (task.assignee || "")).toLowerCase();
    return text.includes(q);
}

export function matchesTeam(task) {
    if (state.teamFilter === "all") return true;
    return (task.assignee || "") === state.teamFilter;
}

export function sortCategories(categories) {
    if (state.sortMode === "completion") {
        return [...categories].sort((a, b) => {
            const pA = state.runbookData[a].filter(t => { const st = normalizeStatus(t.status); return st === "Completed" || st === "Unneeded"; }).length / state.runbookData[a].length;
            const pB = state.runbookData[b].filter(t => { const st = normalizeStatus(t.status); return st === "Completed" || st === "Unneeded"; }).length / state.runbookData[b].length;
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
    div.textContent = text;
    return div.innerHTML;
}

// ── Derived issue helpers ──

export function getOpenIssues() {
    return state.issues.filter(i => i.issueStatus === "Ongoing");
}

export function getClosedIssues() {
    return state.issues.filter(i => i.issueStatus === "Closed");
}

export function getBlockingIssues() {
    return state.issues.filter(i => i.issueStatus === "Ongoing" && i.severity === "Blocking");
}

export function getCompletionPct() {
    const { total, done } = getGlobalStats();
    return total > 0 ? Math.round((done / total) * 100) : 0;
}
