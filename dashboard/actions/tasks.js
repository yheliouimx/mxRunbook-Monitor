import { state } from "../state.js";
import { STATUS } from "../constants.js";
import { normalizeStatus } from "../selectors.js";

/**
 * Set a single task's status by category name and task index.
 * @param {string} cat — category key
 * @param {number} idx — task index within the category
 * @param {string} newStatus — new status value (internal, e.g. "Completed")
 */
export function setTaskStatus(cat, idx, newStatus) {
    state.runbookData[cat][idx].status = newStatus;
}

/**
 * Mark all non-Unneeded tasks in a category as Completed.
 * Returns the count of tasks that were changed, or -1 if there were none to change.
 * @param {string} cat — category key
 * @returns {number}
 */
export function completeAllInCategory(cat) {
    const tasks = state.runbookData[cat];
    const pending = tasks.filter(t => {
        const st = normalizeStatus(t.status);
        return st !== STATUS.COMPLETED && st !== STATUS.UNNEEDED;
    });
    if (pending.length === 0) return -1;
    tasks.forEach(t => {
        if (normalizeStatus(t.status) !== STATUS.UNNEEDED) t.status = STATUS.COMPLETED;
    });
    return pending.length;
}

/**
 * Set or clear a task's assignee.
 * @param {string} cat — category key
 * @param {number} idx — task index within the category
 * @param {string} assignee — new assignee name (empty string clears)
 */
export function setAssignee(cat, idx, assignee) {
    state.runbookData[cat][idx].assignee = assignee || undefined;
}

/**
 * Set a task's actual end time (editable in the dashboard live view).
 * @param {string} cat — category key
 * @param {number} idx — task index
 * @param {string} endTime — ISO datetime string, or empty string to clear
 */
export function setEndTime(cat, idx, endTime) {
    state.runbookData[cat][idx].endTime = endTime || undefined;
}

/**
 * Set or clear the operator comment on a task.
 * @param {string} cat — category key
 * @param {number} idx — task index
 * @param {string} comment — comment text, or empty string to clear
 */
export function setComment(cat, idx, comment) {
    state.runbookData[cat][idx].comment = comment || undefined;
}

/**
 * Expand all categories (add all to openCategories set).
 */
export function expandAll() {
    Object.keys(state.runbookData).filter(k => !k.startsWith("_")).forEach(cat => {
        state.openCategories.add(cat);
    });
}

/**
 * Collapse all categories (clear openCategories set).
 */
export function collapseAll() {
    state.openCategories.clear();
}

/**
 * Toggle a single category's open/closed state.
 * @param {string} cat — category key
 */
export function toggleCategory(cat) {
    if (state.openCategories.has(cat)) state.openCategories.delete(cat);
    else state.openCategories.add(cat);
}
