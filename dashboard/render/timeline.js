import { state } from "../state.js";
import { STATUS } from "../constants.js";
import { normalizeStatus, computeCategoryStatus } from "../selectors.js";
import { toggleCategory } from "../actions/tasks.js";

/**
 * Render the phase timeline as a horizontal stepper/pipeline.
 * Each step: two half-lines flanking a centered dot, with label + count below.
 * @param {string[]} categories — sorted category names
 * @param {function} renderAll — the top-level render() coordinator
 */
export function renderTimeline(categories, renderAll) {
    const timeline = document.getElementById("timeline");
    timeline.innerHTML = "<strong>Phase Timeline</strong>";
    const items = document.createElement("div");
    items.className = "timeline-items";

    const statuses = categories.map(cat => computeCategoryStatus(state.runbookData[cat]));

    categories.forEach((cat, idx) => {
        const tasks = state.runbookData[cat];
        const s = statuses[idx];
        const done = tasks.filter(t => { const st = normalizeStatus(t.status); return st === STATUS.COMPLETED || st === STATUS.UNNEEDED; }).length;

        const step = document.createElement("div");
        step.className = "timeline-step";
        step.title = cat + ": " + done + "/" + tasks.length + " completed";

        // Track row: [left-line] [dot] [right-line]
        const track = document.createElement("div");
        track.className = "timeline-step-track";

        const lineL = document.createElement("div");
        lineL.className = "timeline-line-left";
        // Left line is "done" if the previous step is done
        if (idx > 0 && statuses[idx - 1] === "done") lineL.classList.add("done");

        const dot = document.createElement("div");
        dot.className = "timeline-dot tl-" + s;
        dot.textContent = s === "done" ? "✓" : s === "inprogress" ? "▶" : s === "blocked" ? "✕" : "";

        const lineR = document.createElement("div");
        lineR.className = "timeline-line-right";
        // Right line is "done" if this step is done
        if (s === "done") lineR.classList.add("done");

        track.appendChild(lineL);
        track.appendChild(dot);
        track.appendChild(lineR);

        // Info row: label + count
        const info = document.createElement("div");
        info.className = "timeline-info";
        info.innerHTML = '<div class="timeline-label">' + cat + '</div><div class="timeline-count">' + done + '/' + tasks.length + '</div>';

        step.appendChild(track);
        step.appendChild(info);

        // Click: open category and scroll to it
        step.addEventListener("click", () => {
            if (!state.openCategories.has(cat)) toggleCategory(cat);
            renderAll();
            const target = document.getElementById("cat-" + cat.replace(/[^a-zA-Z0-9]/g, "_"));
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });

        items.appendChild(step);
    });
    timeline.appendChild(items);
}
