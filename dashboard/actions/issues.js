import { state } from "../state.js";

/**
 * Get the default time string for a new issue (current HH:MM DD Mon).
 * @returns {string}
 */
export function getDefaultIssueTime() {
    const now = new Date();
    return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
        + ' ' + now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/**
 * Toggle the issue form open/closed state.
 * Clears editingIssueId when closing.
 */
export function toggleIssueForm() {
    state.issueFormOpen = !state.issueFormOpen;
    if (!state.issueFormOpen) state.editingIssueId = null;
}

/**
 * Save (create or update) an issue from form field values.
 * Returns { ok: true } on success, or { ok: false, reason: string } on validation failure.
 * @param {{ desc: string, cat: string, sev: string, status: string, time: string }} fields
 * @returns {{ ok: boolean, reason?: string }}
 */
export function saveIssue(fields) {
    const { desc, cat, sev, status, time } = fields;
    if (!desc) return { ok: false, reason: "Please enter a description" };
    const timeStr = time || getDefaultIssueTime();

    if (state.editingIssueId !== null) {
        const iss = state.issues.find(i => i.id === state.editingIssueId);
        if (iss) {
            iss.description = desc;
            iss.category = cat;
            iss.severity = sev;
            iss.issueStatus = status;
            iss.time = timeStr;
        }
        state.editingIssueId = null;
    } else {
        state.issues.push({
            id: Date.now(),
            description: desc,
            category: cat,
            severity: sev,
            issueStatus: status,
            time: timeStr,
        });
    }
    state.issueFormOpen = false;
    return { ok: true };
}

/**
 * Close an issue by ID.
 * @param {number} id
 */
export function closeIssue(id) {
    const iss = state.issues.find(i => i.id === id);
    if (iss) iss.issueStatus = "Closed";
}

/**
 * Reopen a closed issue by ID.
 * @param {number} id
 */
export function reopenIssue(id) {
    const iss = state.issues.find(i => i.id === id);
    if (iss) iss.issueStatus = "Ongoing";
}

/**
 * Set up editing state for an issue.
 * @param {number} id
 */
export function editIssue(id) {
    state.editingIssueId = id;
    state.issueFormOpen = true;
}

/**
 * Delete an issue by ID.
 * @param {number} id
 */
export function deleteIssue(id) {
    state.issues = state.issues.filter(i => i.id !== id);
}

/**
 * Toggle the issues panel open/closed.
 */
export function toggleIssuesPanel() {
    state.issuesPanelOpen = !state.issuesPanelOpen;
}
