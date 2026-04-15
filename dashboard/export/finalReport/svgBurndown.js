/**
 * finalReport/svgBurndown.js
 * Renders the completion burndown as an inline SVG string.
 *
 * X axis  — wall-clock time (from first to last snapshot)
 * Y axis  — completion percentage (0–100 %)
 * Background bands — coloured by health status at each interval
 * Line    — blue polyline with a translucent fill under it
 */

import { HEALTH_META } from "../../constants.js";
import { esc } from "./helpers.js";

const W   = 800;
const H   = 260;
const PAD = { top: 20, right: 20, bottom: 40, left: 50 };

/**
 * @param {Array<{ts:string, pct:number, health:string}>} snapshots
 * @returns {string} inline SVG markup
 */
export function buildBurndownSVG(snapshots) {
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top  - PAD.bottom;

    // ── Not enough data ─────────────────────────────────────────────────
    if (snapshots.length < 2) {
        return [
            `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`,
            `<rect width="${W}" height="${H}" fill="#f8fafc" rx="8"/>`,
            `<text x="${W / 2}" y="${H / 2 - 10}" text-anchor="middle" fill="#94a3b8"`,
            ` font-size="14" font-family="system-ui,sans-serif">Not enough snapshot data yet.</text>`,
            `<text x="${W / 2}" y="${H / 2 + 12}" text-anchor="middle" fill="#cbd5e1"`,
            ` font-size="12" font-family="system-ui,sans-serif">Snapshots are recorded every 15 minutes while the dashboard is open.</text>`,
            `</svg>`,
        ].join("");
    }

    const times = snapshots.map(s => new Date(s.ts).getTime());
    const tMin  = times[0];
    const tMax  = times[times.length - 1];
    const tSpan = tMax - tMin || 1;

    const xOf  = t   => PAD.left + ((t - tMin) / tSpan) * plotW;
    const yOf  = pct => PAD.top  + plotH - (pct / 100)  * plotH;

    // ── Health colour bands ─────────────────────────────────────────────
    const bands = snapshots.slice(0, -1).map((s, i) => {
        const x1  = xOf(times[i]);
        const x2  = xOf(times[i + 1]);
        const col = (HEALTH_META[s.health] || HEALTH_META["Green"]).colorLight;
        return `<rect x="${x1.toFixed(1)}" y="${PAD.top}" width="${(x2 - x1).toFixed(1)}"` +
               ` height="${plotH}" fill="${col}" opacity="0.18"/>`;
    }).join("");

    // ── Y-axis grid lines + labels (0, 25, 50, 75, 100) ────────────────
    const yGrid = [0, 25, 50, 75, 100].map(pct => {
        const y = yOf(pct);
        return [
            `<line x1="${PAD.left}" y1="${y.toFixed(1)}"`,
            ` x2="${(PAD.left + plotW).toFixed(1)}" y2="${y.toFixed(1)}"`,
            ` stroke="#e2e8f0" stroke-width="1"/>`,
            `<text x="${(PAD.left - 6).toFixed(1)}" y="${(y + 4).toFixed(1)}"`,
            ` text-anchor="end" fill="#94a3b8" font-size="10" font-family="system-ui,sans-serif">${pct}%</text>`,
        ].join("");
    }).join("");

    // ── X-axis tick marks + time labels (up to 6) ───────────────────────
    const tickStep  = Math.max(1, Math.floor((snapshots.length - 1) / 5));
    const xTicks    = [];
    for (let i = 0; i < snapshots.length; i += tickStep) {
        const x     = xOf(times[i]);
        const label = new Date(times[i]).toLocaleTimeString("en-GB",
            { hour: "2-digit", minute: "2-digit", hour12: false });
        xTicks.push(
            `<line x1="${x.toFixed(1)}" y1="${(PAD.top + plotH).toFixed(1)}"`,
            ` x2="${x.toFixed(1)}" y2="${(PAD.top + plotH + 4).toFixed(1)}" stroke="#cbd5e1" stroke-width="1"/>`,
            `<text x="${x.toFixed(1)}" y="${(PAD.top + plotH + 16).toFixed(1)}"`,
            ` text-anchor="middle" fill="#94a3b8" font-size="10" font-family="system-ui,sans-serif">${esc(label)}</text>`
        );
    }

    // ── Burndown polyline + fill ─────────────────────────────────────────
    const pts     = snapshots.map((s, i) =>
        `${xOf(times[i]).toFixed(1)},${yOf(s.pct).toFixed(1)}`).join(" ");
    const fillPts = [
        `${xOf(times[0]).toFixed(1)},${(PAD.top + plotH).toFixed(1)}`,
        pts,
        `${xOf(times[times.length - 1]).toFixed(1)},${(PAD.top + plotH).toFixed(1)}`,
    ].join(" ");

    const dots = snapshots.map((s, i) =>
        `<circle cx="${xOf(times[i]).toFixed(1)}" cy="${yOf(s.pct).toFixed(1)}" r="3" fill="#3b82f6"/>`
    ).join("");

    // ── Y-axis label (rotated) ───────────────────────────────────────────
    const yLabelX = PAD.left - 36;
    const yLabelY = PAD.top + plotH / 2;
    const yAxisLabel =
        `<text x="${yLabelX.toFixed(1)}" y="${yLabelY.toFixed(1)}" text-anchor="middle"` +
        ` fill="#94a3b8" font-size="10" font-family="system-ui,sans-serif"` +
        ` transform="rotate(-90 ${yLabelX.toFixed(1)} ${yLabelY.toFixed(1)})">% Done</text>`;

    return [
        `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`,
        `<rect width="${W}" height="${H}" fill="#f8fafc" rx="8"/>`,
        bands,
        yGrid,
        xTicks.join(""),
        `<polygon points="${fillPts}" fill="#3b82f6" opacity="0.1"/>`,
        `<polyline points="${pts}" fill="none" stroke="#3b82f6" stroke-width="2.5"`,
        ` stroke-linejoin="round" stroke-linecap="round"/>`,
        dots,
        yAxisLabel,
        `</svg>`,
    ].join("");
}
