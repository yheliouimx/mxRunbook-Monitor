/**
 * Shared export view-model builders.
 * Pure functions that derive data from state for use across all export surfaces.
 */

import { state } from "../state.js";
import { STATUS, ISSUE_STATUS, ISSUE_SEVERITY } from "../constants.js";
import { normalizeStatus, computeCategoryStatus, getGlobalStats, sortCategories } from "../selectors.js";

/**
 * Get sorted category names for exports.
 * @returns {string[]}
 */
export function getExportCategories() {
    const categories = Object.keys(state.runbookData).filter(k => !k.startsWith("_"));
    return sortCategories(categories);
}

/**
 * Get project header info.
 * @returns {{ projectName: string, subtitle: string, changeRef: string, client: string, environment: string, release: string, accentColor: string }}
 */
export function getProjectInfo() {
    return { ...state.projectConfig };
}

/**
 * Compute full stats snapshot for exports.
 * @returns {{ total, done, inProg, notStarted, blocking, pct, openIssues, blockingIssues, totalBlocking }}
 */
export function getExportStats() {
    const { total, done, inProg, notStarted, blocking } = getGlobalStats();
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const openIssues = state.issues.filter(i => i.issueStatus === ISSUE_STATUS.ONGOING).length;
    const blockingIssues = state.issues.filter(i => i.issueStatus === ISSUE_STATUS.ONGOING && i.severity === ISSUE_SEVERITY.BLOCKING).length;
    const totalBlocking = blocking + blockingIssues;
    return { total, done, inProg, notStarted, blocking, pct, openIssues, blockingIssues, totalBlocking };
}

/**
 * Compute per-category stats for export.
 * @param {string} cat — category key
 * @returns {{ tasks: object[], done: number, inProg: number, catPct: number, status: string }}
 */
export function getCategoryExportStats(cat) {
    const tasks = state.runbookData[cat];
    const done = tasks.filter(t => {
        const st = normalizeStatus(t.status);
        return st === STATUS.COMPLETED || st === STATUS.UNNEEDED;
    }).length;
    const inProg = tasks.filter(t => normalizeStatus(t.status) === STATUS.IN_PROGRESS).length;
    const catPct = Math.round((done / tasks.length) * 100);
    const status = computeCategoryStatus(tasks);
    return { tasks, done, inProg, catPct, status };
}

/**
 * Get active assignees with task counts (people currently working).
 * @param {string[]} categories — sorted category keys
 * @returns {Array<[string, number]>} — sorted by count descending
 */
export function getActiveAssignees(categories) {
    const map = {};
    categories.forEach(cat => {
        state.runbookData[cat].forEach(t => {
            if (normalizeStatus(t.status) === STATUS.IN_PROGRESS && t.assignee) {
                if (!map[t.assignee]) map[t.assignee] = 0;
                map[t.assignee]++;
            }
        });
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

/**
 * Get filtered issue lists for export.
 * @param {"open"|"all"} filter
 * @returns {{ openIssues: object[], closedIssues: object[], displayList: object[] }}
 */
export function getExportIssues(filter) {
    const openIssues = state.issues.filter(i => i.issueStatus === ISSUE_STATUS.ONGOING);
    const closedIssues = state.issues.filter(i => i.issueStatus === ISSUE_STATUS.CLOSED);
    const displayList = filter === "open" ? openIssues : [...openIssues, ...closedIssues];
    return { openIssues, closedIssues, displayList };
}

/**
 * Compute time bounds across all categories (for Gantt chart).
 * @param {string[]} categories — sorted category keys
 * @returns {{ globalMin: number, globalMax: number, span: number } | null} — null if no time data
 */
export function getTimeBounds(categories) {
    let globalMin = Infinity, globalMax = -Infinity;
    categories.forEach(cat => {
        state.runbookData[cat].forEach(t => {
            if (t.startTime) { const d = new Date(t.startTime).getTime(); if (!isNaN(d) && d < globalMin) globalMin = d; }
            if (t.endTime) { const d = new Date(t.endTime).getTime(); if (!isNaN(d) && d > globalMax) globalMax = d; }
        });
    });
    if (!isFinite(globalMin) || !isFinite(globalMax)) return null;
    // Pad by 1 hour each side
    globalMin -= 3600000;
    globalMax += 3600000;
    return { globalMin, globalMax, span: globalMax - globalMin };
}

/**
 * Compute time bounds for a single category.
 * @param {string} cat — category key
 * @returns {{ catMin: number, catMax: number } | null}
 */
export function getCategoryTimeBounds(cat) {
    let catMin = Infinity, catMax = -Infinity;
    state.runbookData[cat].forEach(t => {
        if (t.startTime) { const d = new Date(t.startTime).getTime(); if (!isNaN(d) && d < catMin) catMin = d; }
        if (t.endTime) { const d = new Date(t.endTime).getTime(); if (!isNaN(d) && d > catMax) catMax = d; }
    });
    if (!isFinite(catMin) || !isFinite(catMax)) return null;
    return { catMin, catMax };
}

/**
 * Get the current health status.
 * @returns {string}
 */
export function getHealthStatus() {
    return state.healthStatus;
}

/**
 * Get export asset images.
 * @returns {{ logoImg: HTMLImageElement|null, bgImg: HTMLImageElement|null }}
 */
export function getExportAssets() {
    return { logoImg: state.clientLogoImg, bgImg: state.clientBgImg };
}

/**
 * Get the issue filter setting for a given export surface.
 * @param {"phone"|"email"} surface
 * @returns {"open"|"all"}
 */
export function getIssueFilter(surface) {
    return surface === "phone" ? state.phoneExportIssueFilter : state.emailExportIssueFilter;
}
