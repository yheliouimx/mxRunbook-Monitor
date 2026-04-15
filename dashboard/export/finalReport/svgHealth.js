/**
 * finalReport/svgHealth.js
 * Renders the health-status timeline as an inline SVG string.
 *
 * The timeline is a horizontal bar divided into coloured segments, one per
 * recorded snapshot. Each segment is coloured by the health value at that
 * point: green / amber / red. Transition labels are printed at the start of
 * each new health phase.
 */

import { HEALTH_META } from "../../constants.js";
import { esc } from "./helpers.js";

const W = 800;
const H = 48;

/**
 * Build the health-timeline SVG.
 * @param {Array<{ts:string, health:string}>} snapshots
 * @param {string} currentHealth — fallback when snapshots is empty
 * @returns {string} inline SVG markup
 */
export function buildHealthTimelineSVG(snapshots, currentHealth) {
    // ── No history: single-colour bar for the whole event ──────────────
    if (snapshots.length === 0) {
        const meta = HEALTH_META[currentHealth] || HEALTH_META["Green"];
        return [
            `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`,
            `<rect width="${W}" height="${H}" rx="6" fill="${meta.colorLight}"/>`,
            `<text x="${W / 2}" y="30" text-anchor="middle" fill="white" font-size="13"`,
            ` font-weight="700" font-family="system-ui,sans-serif">${esc(meta.label)} — Entire Event</text>`,
            `</svg>`,
        ].join("");
    }

    // ── Map snapshot timestamps to x positions ──────────────────────────
    const times = snapshots.map(s => new Date(s.ts).getTime());
    const tMin  = times[0];
    const tMax  = times[times.length - 1];
    const tSpan = tMax - tMin || 1;
    const xOf   = t => ((t - tMin) / tSpan) * W;

    // ── Coloured segments ───────────────────────────────────────────────
    const segs = snapshots.map((s, i) => {
        const x1   = xOf(times[i]);
        const x2   = i + 1 < times.length ? xOf(times[i + 1]) : W;
        const meta = HEALTH_META[s.health] || HEALTH_META["Green"];
        const w    = Math.max(x2 - x1, 1);
        return `<rect x="${x1.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${H}" fill="${meta.colorLight}" opacity="0.9"/>`;
    }).join("");

    // ── Label each health transition ────────────────────────────────────
    const labels = [];
    let lastHealth = null;
    snapshots.forEach((s, i) => {
        if (s.health === lastHealth) return;
        const x    = xOf(times[i]);
        const meta = HEALTH_META[s.health] || HEALTH_META["Green"];
        labels.push(
            `<text x="${(x + 6).toFixed(1)}" y="31" fill="white" font-size="11"`,
            ` font-weight="700" font-family="system-ui,sans-serif">${esc(meta.label)}</text>`
        );
        lastHealth = s.health;
    });

    return [
        `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`,
        `<rect width="${W}" height="${H}" rx="6" fill="#e2e8f0"/>`,
        segs,
        labels.join(""),
        `</svg>`,
    ].join("");
}
