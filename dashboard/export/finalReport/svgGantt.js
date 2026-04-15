/**
 * finalReport/svgGantt.js
 * Renders a Gantt chart as an inline SVG string.
 *
 * Only tasks with valid startTime AND endTime appear on the chart.
 * Categories that have no timed tasks are skipped entirely.
 * A "NOW" line is drawn if the current time falls within the chart range.
 * Planned-end (estimatedEnd) is shown as a dashed amber vertical marker.
 */

import { state } from "../../state.js";
import { normalizeStatus } from "../../selectors.js";
import { STATUS } from "../../constants.js";
import { esc } from "./helpers.js";

const W        = 800;
const LABEL_W  = 188;   // left column width for row labels
const ROW_H    = 28;
const PAD_TOP  = 32;
const PAD_BOT  = 16;
const TWO_HOURS = 2 * 3_600_000;

const BAR_COLOR = {
    [STATUS.COMPLETED]:  "#22c55e",
    [STATUS.UNNEEDED]:   "#22c55e",
    [STATUS.IN_PROGRESS]:"#3b82f6",
    [STATUS.BLOCKING]:   "#ef4444",
    [STATUS.NOT_STARTED]:"#94a3b8",
};

// ── Internal helpers ──────────────────────────────────────

function validTime(iso) {
    if (!iso) return NaN;
    const t = new Date(iso).getTime();
    return isNaN(t) ? NaN : t;
}

function taskHasTime(t) {
    const s = validTime(t.startTime);
    const e = validTime(t.endTime);
    return !isNaN(s) && !isNaN(e) && e > s;
}

// ── Public function ───────────────────────────────────────

/**
 * Build the Gantt chart SVG.
 * Returns an HTML string — either an SVG element or a fallback <p>.
 * @param {string[]} categories
 * @returns {string}
 */
export function buildGanttSVG(categories) {
    // ── Collect rows ────────────────────────────────────────────────────
    const rows = [];
    categories.forEach(cat => {
        const timedTasks = (state.runbookData[cat] || []).filter(taskHasTime);
        if (timedTasks.length === 0) return;
        rows.push({ type: "cat", label: cat });
        timedTasks.forEach(task => rows.push({ type: "task", task }));
    });

    if (rows.length === 0) {
        return `<p style="color:#94a3b8;text-align:center;padding:32px 0;font-size:.9rem">` +
               `No time data — tasks need both startTime and endTime to appear here.</p>`;
    }

    // ── Time bounds ─────────────────────────────────────────────────────
    let tMin = Infinity, tMax = -Infinity;
    rows.filter(r => r.type === "task").forEach(r => {
        const s = validTime(r.task.startTime);
        const e = validTime(r.task.endTime);
        if (s < tMin) tMin = s;
        if (e > tMax) tMax = e;
    });
    tMin -= 1_800_000;   // 30-min left padding
    tMax += 1_800_000;   // 30-min right padding
    const tSpan = tMax - tMin;

    const plotW = W - LABEL_W;
    const H     = PAD_TOP + rows.length * ROW_H + PAD_BOT;
    const xOf   = t => LABEL_W + ((t - tMin) / tSpan) * plotW;

    // ── Tick lines + time labels ────────────────────────────────────────
    const firstTick = Math.ceil(tMin / TWO_HOURS) * TWO_HOURS;
    const ticks = [];
    for (let t = firstTick; t <= tMax; t += TWO_HOURS) {
        const x     = xOf(t).toFixed(1);
        const label = new Date(t).toLocaleTimeString("en-GB",
            { hour: "2-digit", minute: "2-digit", hour12: false });
        ticks.push(
            `<line x1="${x}" y1="${PAD_TOP - 8}" x2="${x}" y2="${H - PAD_BOT}"`,
            ` stroke="#e2e8f0" stroke-width="1"/>`,
            `<text x="${x}" y="${PAD_TOP - 12}" text-anchor="middle" fill="#94a3b8"`,
            ` font-size="10" font-family="system-ui,sans-serif">${esc(label)}</text>`
        );
    }

    // ── Row elements ────────────────────────────────────────────────────
    const rowEls = rows.map((row, i) => {
        const y = PAD_TOP + i * ROW_H;

        if (row.type === "cat") {
            const label = row.label.length > 28 ? row.label.slice(0, 27) + "…" : row.label;
            return [
                `<rect x="0" y="${y}" width="${W}" height="${ROW_H}" fill="#f1f5f9"/>`,
                `<text x="8" y="${y + 17}" fill="#334155" font-size="11" font-weight="700"`,
                ` font-family="system-ui,sans-serif">${esc(label)}</text>`,
            ].join("");
        }

        const t     = row.task;
        const st    = normalizeStatus(t.status);
        const color = BAR_COLOR[st] || BAR_COLOR[STATUS.NOT_STARTED];

        const x1   = xOf(validTime(t.startTime));
        const x2   = xOf(validTime(t.endTime));
        const barW = Math.max(x2 - x1, 4);
        const barY = y + 7;
        const barH = ROW_H - 14;

        const rawLabel  = (t.item ? `[${t.item}] ` : "") + (t.task || "");
        const shortLabel = rawLabel.length > 25 ? rawLabel.slice(0, 24) + "…" : rawLabel;

        const parts = [
            `<text x="4" y="${y + 18}" fill="#475569" font-size="10"`,
            ` font-family="system-ui,sans-serif">${esc(shortLabel)}</text>`,
            `<rect x="${x1.toFixed(1)}" y="${barY}" width="${barW.toFixed(1)}"`,
            ` height="${barH}" rx="3" fill="${color}" opacity="0.85"/>`,
        ];

        // Planned-end dashed marker
        const pe = validTime(t.estimatedEnd);
        if (!isNaN(pe) && pe > tMin && pe < tMax) {
            const px = xOf(pe).toFixed(1);
            parts.push(
                `<line x1="${px}" y1="${barY - 2}" x2="${px}" y2="${barY + barH + 2}"`,
                ` stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3,2"/>`
            );
        }

        return parts.join("");
    }).join("");

    // ── NOW marker ──────────────────────────────────────────────────────
    const now = Date.now();
    let nowLine = "";
    if (now >= tMin && now <= tMax) {
        const nx = xOf(now).toFixed(1);
        nowLine = [
            `<line x1="${nx}" y1="${PAD_TOP - 8}" x2="${nx}" y2="${H - PAD_BOT}"`,
            ` stroke="#ef4444" stroke-width="1.5"/>`,
            `<text x="${nx}" y="${PAD_TOP - 12}" text-anchor="middle" fill="#ef4444"`,
            ` font-size="10" font-weight="700" font-family="system-ui,sans-serif">NOW</text>`,
        ].join("");
    }

    return [
        `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"`,
        ` style="min-height:${H}px;display:block">`,
        `<rect width="${W}" height="${H}" fill="#f8fafc" rx="8"/>`,
        ticks.join(""),
        rowEls,
        nowLine,
        `</svg>`,
    ].join("");
}
