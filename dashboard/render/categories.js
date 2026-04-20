import { state } from "../state.js";
import { STATUS, statusLabel } from "../constants.js";
import {
    normalizeStatus, statusClass, computeCategoryStatus,
    formatTime, formatTimeShort, getEarliestTime,
    matchesSearch, matchesTeam, matchesSystem, escapeHtml, getUniqueTeams,
    sortTasks, getTasksGroupedByDay,
} from "../selectors.js";
import { setTaskStatus, completeAllInCategory, setAssignee, setEndTime, setComment, toggleCategory } from "../actions/tasks.js";
import { updateStatsValues } from "./stats.js";

/* ── Helpers for local DOM patching ───────────────────────── */

const STATUS_ICONS = {
    [STATUS.COMPLETED]: "✓", [STATUS.IN_PROGRESS]: "▶",
    [STATUS.BLOCKING]: "✕", [STATUS.UNNEEDED]: "—", [STATUS.NOT_STARTED]: ""
};
const ROW_EXTRA_CLASS = {
    [STATUS.COMPLETED]: "completed", [STATUS.BLOCKING]: "blocked",
    [STATUS.UNNEEDED]: "unneeded"
};

/* ── v2 field helpers ─────────────────────────── */
const PARTY_COLORS = { Client: "#1565c0", Murex: "#c2185b", Joint: "#7b1fa2" };

function partyBadge(party) {
    if (!party) return "";
    const bg = PARTY_COLORS[party] || "#555555";
    return `<span class="task-party" style="background:${bg}">${escapeHtml(party)}</span>`;
}

function endDelta(t) {
    if (!t.estimatedEnd || !t.endTime) return "";
    const diff = Math.round((new Date(t.endTime) - new Date(t.estimatedEnd)) / 60000);
    if (!isFinite(diff) || diff === 0) return "";
    return diff > 0
        ? `<span class="task-overrun">(+${diff}m)</span>`
        : `<span class="task-ahead">(${Math.abs(diff)}m early)</span>`;
}

/**
 * Patch a single task row after its status changed.
 */
function patchTaskRow(row, ns) {
    const sc = statusClass(ns);
    // Update row classes
    row.className = "task-row" + (ROW_EXTRA_CLASS[ns] ? " " + ROW_EXTRA_CLASS[ns] : "");
    // Update status button
    const btn = row.querySelector(".task-status-btn");
    if (btn) {
        btn.className = "task-status-btn s-" + sc;
        btn.textContent = STATUS_ICONS[ns] || "";
    }
    // Update status dot
    const dot = row.querySelector(".task-status-dot");
    if (dot) dot.className = "task-status-dot dot-" + sc;
}

/**
 * Patch category header counters & progress bar after a task status change.
 */
function patchCategoryCard(catDiv, cat) {
    const tasks = state.runbookData[cat];
    const done = tasks.filter(t => { const st = normalizeStatus(t.status); return st === STATUS.COMPLETED || st === STATUS.UNNEEDED; }).length;
    const pct = Math.round((done / tasks.length) * 100);
    const catStatus = computeCategoryStatus(tasks);
    const fillColor = pct === 100 ? "var(--color-success)" : pct > 0 ? "var(--color-warning-text)" : "var(--color-danger-text)";
    // Update tag
    const tag = catDiv.querySelector(".status-tag");
    if (tag) { tag.textContent = done + "/" + tasks.length; tag.className = "status-tag tag-" + catStatus; }
    // Update progress bar
    const fill = catDiv.querySelector(".cat-progress-fill");
    if (fill) { fill.style.width = pct + "%"; fill.style.background = fillColor; }
}

/**
 * Patch a single timeline step after the category's status may have changed.
 */
function patchTimelineStep(cat, categories) {
    const idx = categories.indexOf(cat);
    if (idx < 0) return;
    const steps = document.querySelectorAll(".timeline-step");
    const step = steps[idx];
    if (!step) return;
    const tasks = state.runbookData[cat];
    const s = computeCategoryStatus(tasks);
    const done = tasks.filter(t => { const st = normalizeStatus(t.status); return st === STATUS.COMPLETED || st === STATUS.UNNEEDED; }).length;
    // Dot
    const dot = step.querySelector(".timeline-dot");
    if (dot) {
        dot.className = "timeline-dot tl-" + s;
        dot.textContent = s === "done" ? "✓" : s === "inprogress" ? "▶" : s === "blocked" ? "✕" : "";
    }
    // Right line of this step
    const lineR = step.querySelector(".timeline-line-right");
    if (lineR) lineR.classList.toggle("done", s === "done");
    // Left line of the NEXT step (depends on this step being done)
    const nextStep = steps[idx + 1];
    if (nextStep) {
        const nextLineL = nextStep.querySelector(".timeline-line-left");
        if (nextLineL) nextLineL.classList.toggle("done", s === "done");
    }
    // Count label
    const countEl = step.querySelector(".timeline-count");
    if (countEl) countEl.textContent = done + "/" + tasks.length;
    // Title
    step.title = cat + ": " + done + "/" + tasks.length + " completed";
}

/**
 * Attach click-to-edit behavior on an assignee badge.
 * Creates an inline <input> on click; on commit, swaps back to a badge.
 */
function attachAssigneeEdit(badge, c, idx) {
    badge.addEventListener("click", (e) => {
        e.stopPropagation();
        const span = e.currentTarget;
        const current = state.runbookData[c][idx].assignee || "";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "task-assignee-edit";
        input.value = current;
        input.placeholder = "Assignee name...";

        const dlId = "dl_teams_" + Date.now();
        const dl = document.createElement("datalist");
        dl.id = dlId;
        getUniqueTeams().forEach(t => {
            const opt = document.createElement("option");
            opt.value = t;
            dl.appendChild(opt);
        });
        input.setAttribute("list", dlId);

        span.replaceWith(input);
        input.parentElement.appendChild(dl);
        input.focus();
        input.select();

        const commit = () => {
            if (input._committed) return;
            input._committed = true;
            const val = input.value.trim();
            setAssignee(c, idx, val);
            // Create replacement badge (no full re-render)
            const newBadge = document.createElement("span");
            newBadge.className = "task-assignee";
            newBadge.dataset.cat = c;
            newBadge.dataset.idx = String(idx);
            if (val) {
                newBadge.textContent = val;
                newBadge.title = "Click to edit assignee";
            } else {
                newBadge.textContent = "+ assign";
                newBadge.title = "Click to assign";
                newBadge.style.opacity = "0.4";
                newBadge.style.border = "1px dashed var(--input-border)";
            }
            attachAssigneeEdit(newBadge, c, idx);
            const dlEl = input.parentElement && input.parentElement.querySelector("datalist");
            if (dlEl) dlEl.remove();
            input.replaceWith(newBadge);
        };
        input.addEventListener("blur", commit);
        input.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
            if (ev.key === "Escape") { input.value = current; input.blur(); }
        });
    });
}

/* ── endTime & comment editing (v2) ─────────────────────── */

/**
 * Attach click-to-edit on an end-time span. Opens a datetime-local input;
 * on commit saves ISO string to state via setEndTime().
 */
function attachEndTimeEdit(span, c, idx) {
    span.addEventListener("click", (e) => {
        e.stopPropagation();
        const current = state.runbookData[c][idx].endTime || "";
        // datetime-local inputs expect "YYYY-MM-DDTHH:MM" — slice to 16 chars, no UTC conversion
        const localVal = current ? current.slice(0, 16) : "";
        const input = document.createElement("input");
        input.type = "datetime-local";
        input.className = "task-time-edit";
        input.value = localVal;
        span.replaceWith(input);
        input.focus();
        const commit = () => {
            if (input._committed) return;
            input._committed = true;
            const val = input.value;
            const newEnd = val ? val.slice(0, 16) : "";  // keep as local "YYYY-MM-DDTHH:MM", no UTC conversion
            setEndTime(c, idx, newEnd);
            const newSpan = document.createElement("span");
            newSpan.className = span.className;
            Object.assign(newSpan.dataset, { cat: c, idx: String(idx) });
            newSpan.title = span.title;
            const t = state.runbookData[c][idx];
            if (newEnd) {
                newSpan.textContent = formatTimeShort(newEnd);
            } else {
                newSpan.innerHTML = "<span style='opacity:0.35'>+end</span>";
            }
            attachEndTimeEdit(newSpan, c, idx);
            input.replaceWith(newSpan);
            const next = newSpan.nextElementSibling;
            if (next && (next.classList.contains("task-overrun") || next.classList.contains("task-ahead"))) next.remove();
            const deltaHtml = endDelta(t);
            if (deltaHtml) newSpan.insertAdjacentHTML("afterend", deltaHtml);
        };
        input.addEventListener("blur", commit);
        input.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
            if (ev.key === "Escape") { input.value = localVal; input.blur(); }
        });
    });
}

/**
 * Attach pencil-button click for inline comment editing.
 * Opens a textarea in-place; Ctrl+Enter or blur commits, Escape cancels.
 */
function attachCommentEdit(btn, c, idx) {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const content = btn.closest(".task-content");
        if (!content || content.querySelector(".task-comment-edit")) return; // already open
        const current = state.runbookData[c][idx].comment || "";
        const existing = content.querySelector(".task-comment");
        if (existing) existing.remove();
        const textarea = document.createElement("textarea");
        textarea.className = "task-comment-edit";
        textarea.value = current;
        textarea.placeholder = "Add a note about this task\u2026";
        btn.insertAdjacentElement("afterend", textarea);
        textarea.focus();
        const len = textarea.value.length;
        textarea.setSelectionRange(len, len);
        const commit = () => {
            if (textarea._committed) return;
            textarea._committed = true;
            const val = textarea.value.trim();
            setComment(c, idx, val);
            textarea.remove();
            const old = content.querySelector(".task-comment");
            if (old) old.remove();
            if (val) {
                const div = document.createElement("div");
                div.className = "task-comment";
                div.textContent = val;
                btn.insertAdjacentElement("afterend", div);
            }
            btn.title = val ? "Edit note" : "Add note";
        };
        textarea.addEventListener("blur", commit);
        textarea.addEventListener("keydown", (ev) => {
            if (ev.key === "Escape") { textarea.value = current; textarea.blur(); }
            if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") { ev.preventDefault(); textarea.blur(); }
        });
    });
}

/**
 * Render all category cards into the container.
 * @param {string[]} categories — sorted category names
 * @param {function} renderAll — top-level render coordinator (for re-render after state change)
 * @param {function} showToast — toast notification helper
 */
export function renderCategories(categories, renderAll, showToast) {
    const container = document.getElementById("container");
    container.innerHTML = "";

    let anyVisible = false;

    categories.forEach(cat => {
        const tasks = state.runbookData[cat];
        const catStatus = computeCategoryStatus(tasks);

        if (state.filterState !== "all" && state.filterState !== catStatus) return;

        const isFiltered = !!(state.searchQuery || state.teamFilter !== "all" || state.systemFilter !== "all");
        const matchingTasks = sortTasks(tasks.filter(t => matchesSearch(t) && matchesTeam(t) && matchesSystem(t)));
        if (isFiltered && matchingTasks.length === 0) return;

        anyVisible = true;

        const done = tasks.filter(t => { const st = normalizeStatus(t.status); return st === STATUS.COMPLETED || st === STATUS.UNNEEDED; }).length;
        const pct = Math.round((done / tasks.length) * 100);
        const isOpen = state.openCategories.has(cat);
        const earliest = getEarliestTime(tasks);
        const timeRange = earliest ? formatTime(earliest.toISOString()) : "";

        const fillColor = pct === 100 ? "var(--color-success)" : pct > 0 ? "var(--color-warning-text)" : "var(--color-danger-text)";

        const div = document.createElement("div");
        div.className = "category";
        div.id = "cat-" + cat.replace(/[^a-zA-Z0-9]/g, "_");

        const displayTasks = isFiltered ? matchingTasks : sortTasks(tasks);

        div.innerHTML = `
            <div class="category-header" data-cat="${escapeHtml(cat)}">
                <div class="cat-left">
                    <span class="cat-chevron ${isOpen ? 'open' : ''}">&#9654;</span>
                    <span class="cat-name">${escapeHtml(cat)}</span>
                </div>
                <div class="cat-right">
                    <span class="cat-time">${timeRange}</span>
                    <button class="cat-complete-all" data-cat="${escapeHtml(cat)}" title="Mark all tasks in this category as Completed">✓ All</button>
                    <span class="status-tag tag-${catStatus}">${done}/${tasks.length}</span>
                </div>
            </div>
            <div class="cat-progress"><div class="cat-progress-fill" style="width:${pct}%; background:${fillColor}"></div></div>
            <div class="tasks-wrapper ${isOpen ? 'open' : ''}">
            <div class="tasks">
                ${displayTasks.map((t, i) => {
                    const realIdx = tasks.indexOf(t);
                    const ns = normalizeStatus(t.status);
                    const sc = statusClass(ns);
                    const startTStr = t.startTime ? `<span class="task-time">${formatTimeShort(t.startTime)}</span> — ` : "";
                    const endTStr = `<span class="task-time-end" data-cat="${escapeHtml(cat)}" data-idx="${realIdx}" title="Click to edit actual end time">${t.endTime ? formatTimeShort(t.endTime) : "<span style='opacity:0.35'>+end</span>"}</span>`;
                    const deltaStr = endDelta(t);
                    const timePart = (t.startTime || t.endTime) ? (startTStr + endTStr + deltaStr) : "";
                    return `
                    <div class="task-row ${ns === STATUS.COMPLETED ? 'completed' : ns === STATUS.BLOCKING ? 'blocked' : ns === STATUS.UNNEEDED ? 'unneeded' : ''}">
                        <div class="task-status-btn s-${sc}" title="Click to cycle status"
                            data-cat="${escapeHtml(cat)}" data-idx="${realIdx}">
                            ${ns === STATUS.COMPLETED ? '✓' : ns === STATUS.IN_PROGRESS ? '▶' : ns === STATUS.BLOCKING ? '✕' : ns === STATUS.UNNEEDED ? '—' : ''}
                        </div>
                        <div class="task-content">
                            ${t.taskId ? '<span class="task-id-badge">#' + escapeHtml(t.taskId) + '</span>' : ''}
                            ${(t.item && t.item !== t.task) ? '<span class="task-item-label">' + escapeHtml(t.item) + '</span>' : ''}
                            <span class="task-text">${escapeHtml(t.task || t.item || '')}</span>
                            ${t.system ? '<span class="task-system-tag">' + escapeHtml(t.system) + '</span>' : ''}
                            ${t.assignee ? '<span class="task-assignee" title="Click to edit assignee" data-cat="' + escapeHtml(cat) + '" data-idx="' + realIdx + '">' + escapeHtml(t.assignee) + '</span>' : '<span class="task-assignee" title="Click to assign" data-cat="' + escapeHtml(cat) + '" data-idx="' + realIdx + '" style="opacity:0.4;border:1px dashed var(--input-border)">+ assign</span>'}
                            ${partyBadge(t.party)}
                            <span class="task-comment-btn" data-cat="${escapeHtml(cat)}" data-idx="${realIdx}" title="${t.comment ? 'Edit note' : 'Add note'}">💬 ${t.comment ? 'edit' : 'note'}</span>
                            ${t.comment ? '<div class="task-comment">' + escapeHtml(t.comment) + '</div>' : ''}
                        </div>
                        <div class="task-meta">
                            ${timePart}
                            <span class="task-status-dot dot-${sc}"></span>
                        </div>
                    </div>`;
                }).join("")}
            </div>
            </div>
        `;
        container.appendChild(div);

        // Attach header click — local DOM toggle (no full re-render)
        div.querySelector(".category-header").addEventListener("click", () => {
            toggleCategory(cat);
            const isNowOpen = state.openCategories.has(cat);
            const wrapper = div.querySelector(".tasks-wrapper");
            const chevron = div.querySelector(".cat-chevron");
            if (wrapper) wrapper.classList.toggle("open", isNowOpen);
            if (chevron) chevron.classList.toggle("open", isNowOpen);
        });

        // Attach status button clicks — show status popup
        div.querySelectorAll(".task-status-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                document.querySelectorAll(".status-popup").forEach(p => p.remove());
                const c = e.currentTarget.dataset.cat;
                const idx = parseInt(e.currentTarget.dataset.idx);
                const popup = document.createElement("div");
                popup.className = "status-popup";
                const statuses = [
                    { key: STATUS.NOT_STARTED, label: statusLabel(STATUS.NOT_STARTED), cls: "sp-notstarted", icon: "" },
                    { key: STATUS.IN_PROGRESS, label: statusLabel(STATUS.IN_PROGRESS), cls: "sp-inprogress", icon: "▶" },
                    { key: STATUS.COMPLETED,   label: statusLabel(STATUS.COMPLETED),   cls: "sp-done",       icon: "✓" },
                    { key: STATUS.BLOCKING,    label: statusLabel(STATUS.BLOCKING),     cls: "sp-blocked",    icon: "✕" },
                    { key: STATUS.UNNEEDED,    label: statusLabel(STATUS.UNNEEDED),     cls: "sp-unneeded",   icon: "—" }
                ];
                statuses.forEach(s => {
                    const opt = document.createElement("div");
                    opt.className = "sp-opt " + s.cls;
                    opt.textContent = s.icon;
                    opt.title = s.label;
                    opt.addEventListener("click", (ev) => {
                        ev.stopPropagation();
                        setTaskStatus(c, idx, s.key);
                        popup.remove();
                        // Local DOM patch — no full re-render
                        const ns = normalizeStatus(s.key);
                        const row = btn.closest(".task-row");
                        if (row) patchTaskRow(row, ns);
                        patchCategoryCard(div, c);
                        updateStatsValues();
                        patchTimelineStep(c, categories);
                    });
                    popup.appendChild(opt);
                });
                e.currentTarget.appendChild(popup);
                const closePopup = (ev) => { if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener("click", closePopup); } };
                setTimeout(() => document.addEventListener("click", closePopup), 0);
            });
        });

        // Attach category complete-all button
        const completeAllBtn = div.querySelector(".cat-complete-all");
        if (completeAllBtn) {
            completeAllBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const c = e.currentTarget.dataset.cat;
                const pending = state.runbookData[c].filter(t => normalizeStatus(t.status) !== STATUS.COMPLETED && normalizeStatus(t.status) !== STATUS.UNNEEDED).length;
                if (pending === 0) { showToast("All tasks already completed or unneeded"); return; }
                const confirmFn = window.showConfirm || ((_t, _m) => Promise.resolve(confirm(_t)));
                confirmFn(
                    "Complete All Tasks",
                    `Mark all <strong>${pending}</strong> remaining tasks in &ldquo;${c}&rdquo; as Completed?`,
                    { confirmLabel: "Complete All", confirmClass: "danger" }
                ).then(ok => {
                    if (!ok) return;
                    completeAllInCategory(c);
                    // Patch all task rows in this category
                    div.querySelectorAll(".task-row").forEach(row => {
                        const btn = row.querySelector(".task-status-btn");
                        if (btn) {
                            const catName = btn.dataset.cat;
                            const taskIdx = parseInt(btn.dataset.idx);
                            const ns = normalizeStatus(state.runbookData[catName][taskIdx].status);
                            patchTaskRow(row, ns);
                        }
                    });
                    patchCategoryCard(div, c);
                    updateStatsValues();
                    patchTimelineStep(c, categories);
                    showToast(`All tasks in "${c}" marked as Completed`);
                });
            });
        }

        // Attach assignee click-to-edit
        div.querySelectorAll(".task-assignee").forEach(badge => {
            const c = badge.dataset.cat;
            const idx = parseInt(badge.dataset.idx);
            attachAssigneeEdit(badge, c, idx);
        });

        // Attach end time click-to-edit (v2)
        div.querySelectorAll(".task-time-end").forEach(span => {
            const c = span.dataset.cat;
            const idx = parseInt(span.dataset.idx);
            if (c && !isNaN(idx)) attachEndTimeEdit(span, c, idx);
        });

        // Attach comment edit (v2)
        div.querySelectorAll(".task-comment-btn").forEach(btn => {
            const c = btn.dataset.cat;
            const idx = parseInt(btn.dataset.idx);
            if (c && !isNaN(idx)) attachCommentEdit(btn, c, idx);
        });
    });

    if (!anyVisible) {
        container.innerHTML = '<div class="no-results">No categories match the current filter / search.</div>';
    }
}

/**
 * Render all tasks grouped by calendar day (Group by Day view).
 * Each day becomes a collapsible card. task.data-cat / data-idx always reference
 * the original runbookData so all editing operations continue to work.
 * @param {function} renderAll — top-level re-render callback
 * @param {function} showToast — toast helper
 */
export function renderCategoriesGroupedByDay(renderAll, showToast) {
    const container = document.getElementById("container");
    container.innerHTML = "";

    let dayGroups = getTasksGroupedByDay();

    // Apply sortMode to day buckets (same semantics as category sort where applicable)
    const noDate = dayGroups.find(g => g.dateKey === "nodate");
    let dated = dayGroups.filter(g => g.dateKey !== "nodate");

    if (state.sortMode === "completion") {
        dated.sort((a, b) => {
            const pA = a.tasks.filter(t => { const s = normalizeStatus(t.status); return s === STATUS.COMPLETED || s === STATUS.UNNEEDED; }).length / (a.tasks.length || 1);
            const pB = b.tasks.filter(t => { const s = normalizeStatus(t.status); return s === STATUS.COMPLETED || s === STATUS.UNNEEDED; }).length / (b.tasks.length || 1);
            return pB - pA;
        });
    } else if (state.sortMode === "alpha") {
        dated.sort((a, b) => a.label.localeCompare(b.label));
    }
    // "day", "timeline", "original", "taskid" → keep chronological date order (default)

    dayGroups = noDate ? [...dated, noDate] : dated;

    // Apply task-level sort within each bucket (handles "taskid" via sortTasks)
    dayGroups = dayGroups.map(g => ({ ...g, tasks: sortTasks(g.tasks) }));

    // Apply search/team/system filters across all tasks
    const isFiltered = !!(state.searchQuery || state.teamFilter !== "all" || state.systemFilter !== "all");

    let anyVisible = false;

    dayGroups.forEach(({ label, dateKey, tasks: allTasks }) => {
        const displayTasks = isFiltered
            ? allTasks.filter(t => matchesSearch(t) && matchesTeam(t) && matchesSystem(t))
            : allTasks;
        if (isFiltered && displayTasks.length === 0) return;

        // Apply status filter at task level (not bucket level — avoid hiding whole days)
        const statusFiltered = state.filterState === "all" ? displayTasks
            : displayTasks.filter(t => {
                const s = normalizeStatus(t.status);
                if (state.filterState === "done")        return s === STATUS.COMPLETED || s === STATUS.UNNEEDED;
                if (state.filterState === "inprogress")  return s === STATUS.IN_PROGRESS;
                if (state.filterState === "notstarted")  return s === STATUS.NOT_STARTED;
                if (state.filterState === "blocked")     return s === STATUS.BLOCKING;
                if (state.filterState === "unneeded")    return s === STATUS.UNNEEDED;
                return true;
            });
        if (statusFiltered.length === 0) return;

        anyVisible = true;

        const done  = statusFiltered.filter(t => { const s = normalizeStatus(t.status); return s === STATUS.COMPLETED || s === STATUS.UNNEEDED; }).length;
        const total = statusFiltered.length;
        const pct   = Math.round((done / total) * 100);
        const catStatus = (() => {
            const inProg   = statusFiltered.filter(t => normalizeStatus(t.status) === STATUS.IN_PROGRESS).length;
            const blocking = statusFiltered.filter(t => normalizeStatus(t.status) === STATUS.BLOCKING).length;
            if (done === total) return "done";
            if (blocking > 0)  return "blocked";
            if (done > 0 || inProg > 0) return "inprogress";
            return "notstarted";
        })();
        const fillColor = pct === 100 ? "var(--color-success)" : pct > 0 ? "var(--color-warning-text)" : "var(--color-danger-text)";

        const divId = "day-" + dateKey.replace(/[^a-zA-Z0-9]/g, "_");
        const isOpen = state.openCategories.has(divId);

        const div = document.createElement("div");
        div.className = "category";
        div.id = divId;

        div.innerHTML = `
            <div class="category-header" data-cat="${escapeHtml(divId)}">
                <div class="cat-left">
                    <span class="cat-chevron ${isOpen ? 'open' : ''}">&#9654;</span>
                    <span class="cat-name">&#128197; ${escapeHtml(label)}</span>
                </div>
                <div class="cat-right">
                    <span class="status-tag tag-${catStatus}">${done}/${total}</span>
                </div>
            </div>
            <div class="cat-progress"><div class="cat-progress-fill" style="width:${pct}%; background:${fillColor}"></div></div>
            <div class="tasks-wrapper ${isOpen ? 'open' : ''}">
            <div class="tasks">
                ${statusFiltered.map(t => {
                    const cat    = t._origCat;
                    const idx    = t._origIdx;
                    const ns     = normalizeStatus(t.status);
                    const sc     = statusClass(ns);
                    const startTStr = t.startTime ? `<span class="task-time">${formatTimeShort(t.startTime)}</span> — ` : "";
                    const endTStr   = `<span class="task-time-end" data-cat="${escapeHtml(cat)}" data-idx="${idx}" title="Click to edit actual end time">${t.endTime ? formatTimeShort(t.endTime) : "<span style='opacity:0.35'>+end</span>"}</span>`;
                    const timePart  = (t.startTime || t.endTime) ? (startTStr + endTStr + endDelta(t)) : "";
                    // Category breadcrumb badge
                    const catBadge  = `<span class="task-system-tag" style="opacity:0.7">${escapeHtml(cat)}</span>`;
                    return `
                    <div class="task-row ${ns === STATUS.COMPLETED ? 'completed' : ns === STATUS.BLOCKING ? 'blocked' : ns === STATUS.UNNEEDED ? 'unneeded' : ''}">
                        <div class="task-status-btn s-${sc}" title="Click to cycle status" data-cat="${escapeHtml(cat)}" data-idx="${idx}">
                            ${STATUS_ICONS[ns] || ""}
                        </div>
                        <div class="task-content">
                            ${t.taskId ? '<span class="task-id-badge">#' + escapeHtml(t.taskId) + '</span>' : ''}
                            ${(t.item && t.item !== t.task) ? '<span class="task-item-label">' + escapeHtml(t.item) + '</span>' : ''}
                            <span class="task-text">${escapeHtml(t.task || t.item || '')}</span>
                            ${catBadge}
                            ${t.system ? '<span class="task-system-tag">' + escapeHtml(t.system) + '</span>' : ''}
                            ${t.assignee ? '<span class="task-assignee" title="Click to edit assignee" data-cat="' + escapeHtml(cat) + '" data-idx="' + idx + '">' + escapeHtml(t.assignee) + '</span>' : '<span class="task-assignee" title="Click to assign" data-cat="' + escapeHtml(cat) + '" data-idx="' + idx + '" style="opacity:0.4;border:1px dashed var(--input-border)">+ assign</span>'}
                            ${partyBadge(t.party)}
                            <span class="task-comment-btn" data-cat="${escapeHtml(cat)}" data-idx="${idx}" title="${t.comment ? 'Edit note' : 'Add note'}">&#128172; ${t.comment ? 'edit' : 'note'}</span>
                            ${t.comment ? '<div class="task-comment">' + escapeHtml(t.comment) + '</div>' : ''}
                        </div>
                        <div class="task-meta">${timePart}<span class="task-status-dot dot-${sc}"></span></div>
                    </div>`;
                }).join("")}
            </div>
            </div>
        `;
        container.appendChild(div);

        // Header: collapse/expand using divId as the key
        div.querySelector(".category-header").addEventListener("click", () => {
            if (state.openCategories.has(divId)) state.openCategories.delete(divId);
            else state.openCategories.add(divId);
            const wrapper = div.querySelector(".tasks-wrapper");
            const chevron = div.querySelector(".cat-chevron");
            if (wrapper) wrapper.classList.toggle("open", state.openCategories.has(divId));
            if (chevron) chevron.classList.toggle("open", state.openCategories.has(divId));
        });

        // Status buttons — full re-render after change (virtual grouping must be recomputed)
        div.querySelectorAll(".task-status-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                document.querySelectorAll(".status-popup").forEach(p => p.remove());
                const c   = e.currentTarget.dataset.cat;
                const idx = parseInt(e.currentTarget.dataset.idx);
                const popup = document.createElement("div");
                popup.className = "status-popup";
                const statuses = [
                    { key: STATUS.NOT_STARTED, label: statusLabel(STATUS.NOT_STARTED), cls: "sp-notstarted", icon: "" },
                    { key: STATUS.IN_PROGRESS, label: statusLabel(STATUS.IN_PROGRESS), cls: "sp-inprogress", icon: "▶" },
                    { key: STATUS.COMPLETED,   label: statusLabel(STATUS.COMPLETED),   cls: "sp-done",       icon: "✓" },
                    { key: STATUS.BLOCKING,    label: statusLabel(STATUS.BLOCKING),    cls: "sp-blocked",    icon: "✕" },
                    { key: STATUS.UNNEEDED,    label: statusLabel(STATUS.UNNEEDED),    cls: "sp-unneeded",   icon: "—" },
                ];
                statuses.forEach(s => {
                    const opt = document.createElement("div");
                    opt.className = "sp-opt " + s.cls;
                    opt.textContent = s.icon;
                    opt.title = s.label;
                    opt.addEventListener("click", (ev) => {
                        ev.stopPropagation();
                        setTaskStatus(c, idx, s.key);
                        popup.remove();
                        renderAll(); // full re-render — virtual day buckets change
                    });
                    popup.appendChild(opt);
                });
                e.currentTarget.appendChild(popup);
                const closePopup = (ev) => { if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener("click", closePopup); } };
                setTimeout(() => document.addEventListener("click", closePopup), 0);
            });
        });

        // Assignee / end-time / comment editors — same helpers, same data refs
        div.querySelectorAll(".task-assignee").forEach(badge => {
            const c = badge.dataset.cat; const idx = parseInt(badge.dataset.idx);
            attachAssigneeEdit(badge, c, idx);
        });
        div.querySelectorAll(".task-time-end").forEach(span => {
            const c = span.dataset.cat; const idx = parseInt(span.dataset.idx);
            if (c && !isNaN(idx)) attachEndTimeEdit(span, c, idx);
        });
        div.querySelectorAll(".task-comment-btn").forEach(btn => {
            const c = btn.dataset.cat; const idx = parseInt(btn.dataset.idx);
            if (c && !isNaN(idx)) attachCommentEdit(btn, c, idx);
        });
    });

    if (!anyVisible) {
        container.innerHTML = '<div class="no-results">No tasks match the current filter / search.</div>';
    }
}
