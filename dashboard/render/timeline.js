import { state } from "../state.js";
import { STATUS } from "../constants.js";
import { normalizeStatus, computeCategoryStatus } from "../selectors.js";
import { toggleCategory } from "../actions/tasks.js";

/**
 * Render the phase timeline bar.
 * @param {string[]} categories — sorted category names
 * @param {function} renderAll — the top-level render() coordinator, used for click-to-expand
 */
export function renderTimeline(categories, renderAll) {
    const timeline = document.getElementById("timeline");
    timeline.innerHTML = "<strong>Phase Timeline</strong>";
    const items = document.createElement("div");
    items.className = "timeline-items";

    categories.forEach(cat => {
        const tasks = state.runbookData[cat];
        const s = computeCategoryStatus(tasks);
        const done = tasks.filter(t => { const st = normalizeStatus(t.status); return st === STATUS.COMPLETED || st === STATUS.UNNEEDED; }).length;

        const el = document.createElement("span");
        el.className = "timelineItem tl-" + s;
        el.textContent = cat + " (" + done + "/" + tasks.length + ")";
        el.title = cat + ": " + done + "/" + tasks.length + " completed";

        el.addEventListener("click", () => {
            if (!state.openCategories.has(cat)) toggleCategory(cat);
            renderAll();
            const target = document.getElementById("cat-" + cat.replace(/[^a-zA-Z0-9]/g, "_"));
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });

        items.appendChild(el);
    });
    timeline.appendChild(items);
}
