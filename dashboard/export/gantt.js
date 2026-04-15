/**
 * Gantt chart export (1920×dynamic light landscape).
 */

import { drawText, drawRoundRect, drawDivider, drawDot, exportCanvasAsImage, formatExportTimestamp } from "./canvas.js";
import { HEALTH_LIGHT, CAT_STATUS_LIGHT, GANTT_BAR } from "./theme.js";
import { STATUS, statusLabel } from "../constants.js";
import { getExportCategories, getProjectInfo, getExportStats, getCategoryExportStats, getTimeBounds, getCategoryTimeBounds, getHealthStatus, getExportAssets } from "./shared.js";

/**
 * Generate and export the Gantt chart image.
 * @param {function} showToast
 */
export function exportGanttChart(showToast) {
    showToast("Generating Gantt chart...");

    const project = getProjectInfo();
    const { logoImg } = getExportAssets();
    const health = getHealthStatus();
    const hMeta = HEALTH_LIGHT[health];
    const stats = getExportStats();
    const sortedCats = getExportCategories();
    const timeBounds = getTimeBounds(sortedCats);

    if (!timeBounds) {
        showToast("No time data available for Gantt chart");
        return;
    }

    const { globalMin, globalMax, span } = timeBounds;

    // Layout constants
    const W = 1920, labelW = 340, rightPad = 60, chartX = labelW, chartW = W - labelW - rightPad;
    const topH = 140, axisH = 60;
    const rowH = 72, rowGap = 6;
    const contentH = sortedCats.length * (rowH + rowGap) + 40;
    const legendH = 60;
    const H = topH + axisH + contentH + legendH + 40;

    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // ── TOP BAR ──
    ctx.fillStyle = project.accentColor;
    ctx.fillRect(0, 0, W, 70);
    if (logoImg) {
        const lS = 46;
        ctx.save(); ctx.beginPath(); ctx.roundRect(16, 12, lS, lS, 7); ctx.clip();
        ctx.drawImage(logoImg, 16, 12, lS, lS); ctx.restore();
    }
    drawText(ctx, project.projectName.toUpperCase() + " — GANTT CHART", W / 2, 44, "bold 28px Segoe UI, sans-serif", "#ffffff", "center");

    // Subtitle
    ctx.fillStyle = "#f4f5f7";
    ctx.fillRect(0, 70, W, 36);
    drawText(ctx, [project.subtitle, project.changeRef, formatExportTimestamp()].filter(Boolean).join("  |  "), W / 2, 94, "18px Segoe UI, sans-serif", "#555555", "center");
    ctx.fillStyle = project.accentColor;
    ctx.fillRect(0, 106, W, 3);

    // ── Health badge ──
    drawRoundRect(ctx, 20, 114, 220, 30, 15, hMeta.bg, hMeta.color);
    drawDot(ctx, 38, 129, 6, hMeta.color);
    drawText(ctx, "GO-LIVE: " + hMeta.label, 130, 135, "bold 14px Segoe UI, sans-serif", hMeta.color, "center");

    // ── Overall stats badge ──
    drawText(ctx, `${stats.done}/${stats.total} completed (${stats.pct}%)  |  ${stats.blocking} ${statusLabel(STATUS.BLOCKING).toLowerCase()}`, W - rightPad, 135, "bold 14px Segoe UI, sans-serif", "#555", "right");

    // ── TIME AXIS ──
    const axisY = topH;
    ctx.fillStyle = "#f8f8f8";
    ctx.fillRect(chartX, axisY, chartW, axisH);
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(chartX, axisY + axisH); ctx.lineTo(chartX + chartW, axisY + axisH); ctx.stroke();

    // Time tick marks (3-hour intervals)
    const startDate = new Date(globalMin);
    startDate.setMinutes(0, 0, 0);
    const tickInterval = 3600000 * 3;
    let tick = startDate.getTime();
    while (tick <= globalMax) {
        const x = chartX + ((tick - globalMin) / span) * chartW;
        if (x >= chartX && x <= chartX + chartW) {
            ctx.strokeStyle = "#eee";
            ctx.beginPath(); ctx.moveTo(x, axisY + axisH); ctx.lineTo(x, axisY + axisH + contentH); ctx.stroke();
            const d = new Date(tick);
            drawText(ctx, d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }), x, axisY + 28, "bold 14px Consolas, monospace", "#333", "center");
            drawText(ctx, d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), x, axisY + 46, "12px Segoe UI, sans-serif", "#888", "center");
        }
        tick += tickInterval;
    }

    // Day band highlighting (alternate days)
    const dayStart = new Date(globalMin);
    dayStart.setHours(0, 0, 0, 0);
    let dBand = dayStart.getTime();
    let bandIdx = 0;
    while (dBand < globalMax) {
        const dEnd = dBand + 86400000;
        const x1 = Math.max(chartX, chartX + ((dBand - globalMin) / span) * chartW);
        const x2 = Math.min(chartX + chartW, chartX + ((dEnd - globalMin) / span) * chartW);
        if (x2 > x1 && bandIdx % 2 === 1) {
            ctx.fillStyle = "rgba(0,0,0,0.02)";
            ctx.fillRect(x1, axisY + axisH, x2 - x1, contentH);
        }
        dBand = dEnd;
        bandIdx++;
    }

    // ── NOW line ──
    const nowTs = Date.now();
    if (nowTs >= globalMin && nowTs <= globalMax) {
        const nx = chartX + ((nowTs - globalMin) / span) * chartW;
        ctx.strokeStyle = "#c62828";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(nx, axisY + axisH); ctx.lineTo(nx, axisY + axisH + contentH); ctx.stroke();
        ctx.setLineDash([]);
        drawText(ctx, "NOW", nx, axisY + axisH - 4, "bold 12px Segoe UI, sans-serif", "#c62828", "center");
    }

    // ── GANTT BARS ──
    const barsY = axisY + axisH + 20;

    sortedCats.forEach((cat, i) => {
        const ry = barsY + i * (rowH + rowGap);
        const cs = getCategoryExportStats(cat);
        const catBounds = getCategoryTimeBounds(cat);
        const theme = CAT_STATUS_LIGHT[cs.status] || CAT_STATUS_LIGHT.notstarted;
        const barTheme = GANTT_BAR[cs.status] || GANTT_BAR.notstarted;

        // Label area (left)
        drawRoundRect(ctx, 12, ry, labelW - 20, rowH, 8, theme.bg, theme.border);
        drawDot(ctx, 28, ry + 24, 5, theme.dot);

        const nameStr = cat.length > 26 ? cat.substring(0, 24) + "..." : cat;
        drawText(ctx, nameStr, 42, ry + 28, "bold 16px Segoe UI, sans-serif", theme.text, "left");
        drawText(ctx, `${cs.done}/${cs.tasks.length} (${cs.catPct}%)`, 42, ry + 50, "14px Consolas, monospace", "#888", "left");

        // Mini completion bar in label
        const mbX = 200, mbW = 110, mbH = 6, mbY2 = ry + 44;
        drawRoundRect(ctx, mbX, mbY2, mbW, mbH, 3, "#e0e0e0");
        if (cs.catPct > 0) drawRoundRect(ctx, mbX, mbY2, Math.max(6, mbW * cs.catPct / 100), mbH, 3, theme.dot);

        if (cs.inProg > 0) {
            drawText(ctx, `${cs.inProg} active`, labelW - 30, ry + 50, "bold 12px Segoe UI, sans-serif", "#e65100", "right");
        }

        // Gantt bar (in chart area)
        if (catBounds) {
            const bx1 = chartX + ((catBounds.catMin - globalMin) / span) * chartW;
            const bx2 = chartX + ((catBounds.catMax - globalMin) / span) * chartW;
            const bw = Math.max(8, bx2 - bx1);
            const barY = ry + 10;
            const barH = rowH - 20;

            drawRoundRect(ctx, bx1, barY, bw, barH, 8, barTheme.fill, barTheme.border);

            // Completed fill
            if (cs.catPct > 0) {
                const fillW = Math.max(8, bw * cs.catPct / 100);
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(bx1, barY, bw, barH, 8);
                ctx.clip();
                const grad = ctx.createLinearGradient(bx1, 0, bx1 + fillW, 0);
                grad.addColorStop(0, barTheme.gradFrom);
                grad.addColorStop(1, barTheme.gradTo);
                ctx.fillStyle = grad;
                ctx.fillRect(bx1, barY, fillW, barH);
                ctx.restore();
            }

            // Percentage text on bar
            const textX = bx1 + Math.max(8, bw * cs.catPct / 100) / 2;
            if (cs.catPct > 0 && Math.max(8, bw * cs.catPct / 100) > 50) {
                drawText(ctx, cs.catPct + "%", textX, barY + barH / 2 + 6, "bold 16px Segoe UI, sans-serif", "#ffffff", "center");
            } else if (bw > 50) {
                drawText(ctx, cs.catPct + "%", bx1 + bw / 2, barY + barH / 2 + 6, "bold 16px Segoe UI, sans-serif", theme.text, "center");
            }

            // Time labels below bar
            const startLabel = new Date(catBounds.catMin).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
            const endLabel = new Date(catBounds.catMax).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
            drawText(ctx, startLabel, bx1, barY + barH + 14, "11px Consolas, monospace", "#aaa", "left");
            drawText(ctx, endLabel, bx1 + bw, barY + barH + 14, "11px Consolas, monospace", "#aaa", "right");

            // Planned-end marker: dashed tick at max estimatedEnd across category tasks
            const estEndMs = Math.max(
                ...[...cs.tasks.map(t => t.estimatedEnd ? new Date(t.estimatedEnd).getTime() : 0).filter(v => v > 0)]
            );
            if (isFinite(estEndMs) && estEndMs > 0 && estEndMs !== catBounds.catMax) {
                const xEst = chartX + ((estEndMs - globalMin) / span) * chartW;
                if (xEst >= chartX && xEst <= chartX + chartW) {
                    ctx.save();
                    ctx.strokeStyle = "#888888";
                    ctx.lineWidth = 2;
                    ctx.setLineDash([3, 3]);
                    ctx.beginPath();
                    ctx.moveTo(xEst, barY - 3);
                    ctx.lineTo(xEst, barY + barH + 3);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.restore();
                    drawText(ctx, "P", xEst + 4, barY + 12, "bold 10px Segoe UI, sans-serif", "#888", "left");
                }
            }
        }
    });

    // ── LEGEND ──
    const legY = barsY + sortedCats.length * (rowH + rowGap) + 20;
    drawDivider(ctx, 60, W - 60, legY, "#e0e0e0");
    const items = [
        { color: "#43a047", label: statusLabel(STATUS.COMPLETED) },
        { color: "#ffe0b2", label: statusLabel(STATUS.IN_PROGRESS), border: "#ffcc80" },
        { color: "#ffcdd2", label: statusLabel(STATUS.NOT_STARTED), border: "#ef9a9a" },
    ];
    let lx = W / 2 - 200;
    items.forEach(it => {
        drawRoundRect(ctx, lx, legY + 12, 20, 14, 4, it.color, it.border || it.color);
        drawText(ctx, it.label, lx + 28, legY + 24, "14px Segoe UI, sans-serif", "#555", "left");
        lx += 130;
    });
    // Now line legend
    ctx.strokeStyle = "#c62828";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(lx, legY + 19); ctx.lineTo(lx + 20, legY + 19); ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "Current Time", lx + 28, legY + 24, "14px Segoe UI, sans-serif", "#c62828", "left");

    // ── FOOTER ──
    ctx.fillStyle = project.accentColor;
    ctx.fillRect(0, H - 28, W, 28);
    drawText(ctx, "Generated from Runbook Dashboard", W / 2, H - 10, "14px Segoe UI, sans-serif", "#ffffff", "center");

    // ── Export ──
    exportCanvasAsImage(cv, "runbook_gantt", null, () => showToast("Gantt chart ready!"));
}
