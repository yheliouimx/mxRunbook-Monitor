import { state } from "../state.js";
import { STATUS, statusLabel } from "../constants.js";
import {
    normalizeStatus, statusClass, computeCategoryStatus,
    formatTime, formatTimeShort, getEarliestTime,
    matchesSearch, matchesTeam, escapeHtml, getUniqueTeams,
} from "../selectors.js";
import { setTaskStatus, completeAllInCategory, setAssignee, toggleCategory } from "../actions/tasks.js";

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

        const matchingTasks = tasks.filter(t => matchesSearch(t) && matchesTeam(t));
        if ((state.searchQuery || state.teamFilter !== "all") && matchingTasks.length === 0) return;

        anyVisible = true;

        const done = tasks.filter(t => { const st = normalizeStatus(t.status); return st === STATUS.COMPLETED || st === STATUS.UNNEEDED; }).length;
        const pct = Math.round((done / tasks.length) * 100);
        const isOpen = state.openCategories.has(cat);
        const earliest = getEarliestTime(tasks);
        const timeRange = earliest ? formatTime(tasks.reduce((best, t) => {
            if (!t.startTime) return best;
            const d = new Date(t.startTime);
            return (!best || d < best) ? d : best;
        }, null).toISOString()) : "";

        const fillColor = pct === 100 ? "var(--color-success)" : pct > 0 ? "var(--color-warning-text)" : "var(--color-danger-text)";

        const div = document.createElement("div");
        div.className = "category";
        div.id = "cat-" + cat.replace(/[^a-zA-Z0-9]/g, "_");

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
            <div class="tasks ${isOpen ? 'open' : ''}">
                ${(state.searchQuery || state.teamFilter !== "all" ? matchingTasks : tasks).map((t, i) => {
                    const realIdx = tasks.indexOf(t);
                    const ns = normalizeStatus(t.status);
                    const sc = statusClass(ns);
                    const timeStr = t.startTime
                        ? formatTimeShort(t.startTime) + (t.endTime ? " - " + formatTimeShort(t.endTime) : "")
                        : "";
                    return `
                    <div class="task-row ${ns === STATUS.COMPLETED ? 'completed' : ns === STATUS.BLOCKING ? 'blocked' : ns === STATUS.UNNEEDED ? 'unneeded' : ''}">
                        <div class="task-status-btn s-${sc}" title="Click to cycle status"
                            data-cat="${escapeHtml(cat)}" data-idx="${realIdx}">
                            ${ns === STATUS.COMPLETED ? '✓' : ns === STATUS.IN_PROGRESS ? '▶' : ns === STATUS.BLOCKING ? '✕' : ns === STATUS.UNNEEDED ? '—' : ''}
                        </div>
                        <div class="task-content">
                            ${t.item ? '<span class="task-item-label">' + escapeHtml(t.item) + '</span>' : ''}
                            <span class="task-text">${escapeHtml(t.task)}</span>
                            ${t.assignee ? '<span class="task-assignee" title="Click to edit assignee" data-cat="' + escapeHtml(cat) + '" data-idx="' + realIdx + '">' + escapeHtml(t.assignee) + '</span>' : '<span class="task-assignee" title="Click to assign" data-cat="' + escapeHtml(cat) + '" data-idx="' + realIdx + '" style="opacity:0.4;border:1px dashed var(--input-border)">+ assign</span>'}
                        </div>
                        <div class="task-meta">
                            ${timeStr ? '<span class="task-time">' + timeStr + '</span>' : ''}
                            <span class="task-status-dot dot-${sc}"></span>
                        </div>
                    </div>`;
                }).join("")}
            </div>
        `;
        container.appendChild(div);

        // Attach header click
        div.querySelector(".category-header").addEventListener("click", () => {
            toggleCategory(cat);
            renderAll();
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
                        renderAll();
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
                if (!confirm(`Mark all ${pending} remaining tasks in "${c}" as Completed?`)) return;
                completeAllInCategory(c);
                renderAll();
                showToast(`All tasks in "${c}" marked as Completed`);
            });
        }

        // Attach assignee click-to-edit
        div.querySelectorAll(".task-assignee").forEach(badge => {
            badge.addEventListener("click", (e) => {
                e.stopPropagation();
                const span = e.currentTarget;
                const c = span.dataset.cat;
                const idx = parseInt(span.dataset.idx);
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
                    const val = input.value.trim();
                    setAssignee(c, idx, val);
                    renderAll();
                };
                input.addEventListener("blur", commit);
                input.addEventListener("keydown", (ev) => {
                    if (ev.key === "Enter") { ev.preventDefault(); commit(); }
                    if (ev.key === "Escape") { renderAll(); }
                });
            });
        });
    });

    if (!anyVisible) {
        container.innerHTML = '<div class="no-results">No categories match the current filter / search.</div>';
    }
}
