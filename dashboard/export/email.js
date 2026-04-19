/**
 * Email image export (1920×1080 light landscape, corporate style).
 *
 * New in this version:
 *  - Timer elapsed strip (if timer is running/paused)
 *  - Computed health advisory from time delta
 *  - In-progress task detail section with v2 fields (assignee, system, party, taskId)
 *  - Phase timeline categories with per-row mini progress bars
 */

import {
    drawText, drawRoundRect, drawDivider, drawDot,
    drawBackgroundImage, drawProgressBar, resizeIfNeeded,
    exportCanvasAsImage, formatExportTimestamp,
} from "./canvas.js";
import { HEALTH_LIGHT, PROGRESS_GRADIENT_LIGHT, CAT_STATUS_LIGHT, STAT_COLORS_LIGHT } from "./theme.js";
import { ISSUE_SEVERITY, ISSUE_STATUS } from "../constants.js";
import {
    getExportCategories, getProjectInfo, getExportStats, getCategoryExportStats,
    getActiveAssignees, getExportIssues, getHealthStatus, getExportAssets,
    getIssueFilter, getTimerInfo, getDeltaInfo,
} from "./shared.js";

/**
 * Generate and export the corporate email snapshot image.
 * @param {function} showToast
 */
export function exportEmailSnapshot(showToast) {
    showToast("Generating corporate image...");

    const W = 1920, H = 1080;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");

    const { logoImg, bgImg } = getExportAssets();
    const project = getProjectInfo();
    const health = getHealthStatus();
    const hMeta = HEALTH_LIGHT[health] || HEALTH_LIGHT.Green;
    const stats = getExportStats();
    const sortedCats = getExportCategories();
    const gradColors = PROGRESS_GRADIENT_LIGHT[health] || PROGRESS_GRADIENT_LIGHT.Green;
    const sc = STAT_COLORS_LIGHT;
    const timer = getTimerInfo();
    const delta = getDeltaInfo();
    const accentColor = project.accentColor || "#1a3a6b";

    // Corporate light background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    if (bgImg) drawBackgroundImage(ctx, bgImg, W, H, 0.07);

    // ── TOP BAR ──
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, 0, W, 80);
    if (logoImg) {
        const lS = 52;
        ctx.save(); ctx.beginPath(); ctx.roundRect(18, 14, lS, lS, 8); ctx.clip();
        ctx.drawImage(logoImg, 18, 14, lS, lS); ctx.restore();
    }
    drawText(ctx, project.projectName.toUpperCase() + " \u2014 GO-LIVE RUNBOOK", W / 2, 50, "bold 30px Segoe UI, sans-serif", "#ffffff");

    // ── SUBTITLE BAR ──
    ctx.fillStyle = "#f4f5f7";
    ctx.fillRect(0, 80, W, 50);
    drawText(ctx, [project.subtitle, project.changeRef, formatExportTimestamp()].filter(Boolean).join("  \u00B7  "), W / 2, 112, "21px Segoe UI, sans-serif", "#555555");

    // Accent line
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, 130, W, 3);

    let Y = 150;

    // ── PROGRESS BAR + HEALTH BADGE ──
    // Health badge overlays the left portion of the full-width progress bar
    const barW = W - 120, barH = 52, barR = 10, barX = 60;
    drawProgressBar(ctx, barX, Y, barW, barH, barR, stats.pct, gradColors, "#e8e8ec", "#c8c8d0");
    drawText(ctx, stats.pct + "%", barX + barW * 0.5, Y + 36, "bold 32px Segoe UI, sans-serif", "#ffffff", "center");
    drawText(ctx, `${stats.done} / ${stats.total} tasks completed`, barX + barW * 0.58, Y + 28, "18px Segoe UI, sans-serif", "#ffffff", "left");
    drawText(ctx, "OVERALL COMPLETION", barX + barW * 0.58, Y + 45, "bold 10px Segoe UI, sans-serif", "rgba(255,255,255,0.8)", "left");

    // Health badge on left portion of bar
    const badgeW = 270, badgeH = 44;
    drawRoundRect(ctx, barX, Y + 4, badgeW, badgeH, 22, hMeta.bg, hMeta.color);
    drawDot(ctx, barX + 24, Y + 4 + badgeH / 2, 8, hMeta.color);
    drawText(ctx, "GO-LIVE: " + hMeta.label, barX + badgeW / 2 + 8, Y + 4 + 28, "bold 20px Segoe UI, sans-serif", hMeta.color);

    // Timer + delta on the right end of bar (if running)
    if (timer) {
        drawText(ctx, timer.elapsed, barX + barW - 10, Y + 22, "bold 15px Consolas, monospace", "rgba(255,255,255,0.9)", "right");
        if (delta) {
            const sign = delta.deltaPct >= 0 ? "+" : "";
            const advLabel = delta.advisory === "Green" ? "ON TRACK"
                : delta.advisory === "Amber" ? "WATCH" : "AT RISK";
            drawText(ctx, `\u0394 ${sign}${delta.deltaPct}%  ${advLabel}`, barX + barW - 10, Y + 42, "bold 14px Segoe UI, sans-serif", "rgba(255,255,255,0.9)", "right");
        }
    }
    Y += barH + 8;

    // ── TIMER / DELTA STRIP (full row, if timer is running) ──
    if (timer) {
        const timerBg  = delta
            ? (delta.advisory === "Green" ? "#e8f5e9" : delta.advisory === "Amber" ? "#fff8e1" : "#ffebee")
            : "#f0f0f8";
        const timerBdr = delta
            ? (delta.advisory === "Green" ? "#a5d6a7" : delta.advisory === "Amber" ? "#ffe082" : "#ef9a9a")
            : "#d0d0e8";
        const STRIP_H = 36;
        drawRoundRect(ctx, 60, Y, W - 120, STRIP_H, 8, timerBg, timerBdr);
        drawText(ctx, `ELAPSED:  ${timer.elapsed}`, 80, Y + 24, "bold 15px Consolas, monospace", "#1565c0", "left");
        if (delta) {
            const dColor = delta.advisory === "Green" ? "#2e7d32"
                : delta.advisory === "Amber" ? "#e65100" : "#c62828";
            const sign = delta.deltaPct >= 0 ? "+" : "";
            const advisoryLabel = delta.advisory === "Green" ? "ON TRACK"
                : delta.advisory === "Amber" ? "SLIGHT DELAY" : "AT RISK";
            drawText(ctx, `\u0394 ${sign}${delta.deltaPct}%  \u2014  ${advisoryLabel}`, W - 80, Y + 24, "bold 14px Segoe UI, sans-serif", dColor, "right");
        } else {
            drawText(ctx, timer.timerState === "paused" ? "PAUSED" : "RUNNING", W - 80, Y + 24, "bold 13px Segoe UI, sans-serif", "#888888", "right");
        }
        Y += STRIP_H + 8;
    }

    // ── STAT CARDS ──
    const emGap = 12;
    const emLeftW  = (W - 120 - emGap) * 0.66;
    const emRightW = (W - 120 - emGap) * 0.34;
    const emLeftX  = 60, emRightX = emLeftX + emLeftW + emGap;
    const emGH = 64, emGR = 8;

    drawText(ctx, "TASKS",  emLeftX  + emLeftW  / 2, Y + 8, "bold 11px Segoe UI, sans-serif", "#888888");
    drawText(ctx, "ISSUES", emRightX + emRightW / 2, Y + 8, "bold 11px Segoe UI, sans-serif", "#888888");
    Y += 14;

    const emTaskCards = [
        { value: stats.total,       label: "TOTAL",     color: sc.total },
        { value: stats.done,        label: "DONE",      color: sc.done },
        { value: stats.inProg,      label: "IN PROG",   color: sc.inProg },
        { value: stats.notStarted,  label: "NOT START", color: sc.notStarted },
    ];
    const emTcW = (emLeftW - emGap * 3) / 4;
    emTaskCards.forEach((s, i) => {
        const cx = emLeftX + i * (emTcW + emGap);
        drawRoundRect(ctx, cx, Y, emTcW, emGH, emGR, "#fafafa", "#e0e0e0");
        drawText(ctx, String(s.value), cx + emTcW / 2, Y + 34, "bold 28px Segoe UI, sans-serif", s.color);
        drawText(ctx, s.label, cx + emTcW / 2, Y + 54, "bold 10px Segoe UI, sans-serif", "#888888");
    });

    const emIssCards = [
        { value: stats.openIssues,    label: "OPEN",     color: sc.openIssues },
        { value: stats.totalBlocking, label: "BLOCKING", color: sc.blocking },
    ];
    const emIcW = (emRightW - emGap) / 2;
    emIssCards.forEach((s, i) => {
        const cx = emRightX + i * (emIcW + emGap);
        drawRoundRect(ctx, cx, Y, emIcW, emGH, emGR, "#fafafa", "#e0e0e0");
        drawText(ctx, String(s.value), cx + emIcW / 2, Y + 34, "bold 28px Segoe UI, sans-serif", s.color);
        drawText(ctx, s.label, cx + emIcW / 2, Y + 54, "bold 10px Segoe UI, sans-serif", "#888888");
    });
    Y += emGH + 12;

    // ── DIVIDER ──
    drawDivider(ctx, 60, W - 60, Y, "#e0e0e0");
    Y += 14;

    // ── PHASE TIMELINE (2-column grid) ──
    drawText(ctx, "PHASE TIMELINE", W / 2, Y + 6, "bold 15px Segoe UI, sans-serif", "#888888");
    Y += 20;

    const tlCols = 2, tlColW = (W - 140) / tlCols, tlRowH = 50;
    sortedCats.forEach((cat, i) => {
        const col = i % tlCols;
        const row = Math.floor(i / tlCols);
        const rx  = 70 + col * (tlColW + 10);
        const ry  = Y + row * (tlRowH + 6);
        const cs  = getCategoryExportStats(cat);
        const theme = CAT_STATUS_LIGHT[cs.status] || CAT_STATUS_LIGHT.notstarted;

        drawRoundRect(ctx, rx, ry, tlColW, tlRowH, 8, theme.bg, theme.border);
        drawDot(ctx, rx + 22, ry + tlRowH / 2, 6, theme.dot);
        const catLabel = cat.length > 38 ? cat.substring(0, 35) + "\u2026" : cat;
        drawText(ctx, catLabel, rx + 40, ry + 22, "bold 17px Segoe UI, sans-serif", theme.text, "left");
        drawText(ctx, `${cs.done}/${cs.tasks.length}`, rx + 40, ry + 40, "15px Consolas, monospace", "#888888", "left");

        const mpX = rx + 130, mpW = tlColW - 238, mpH = 6, mpY = ry + 34;
        drawRoundRect(ctx, mpX, mpY, mpW, mpH, 3, "#e0e0e0");
        if (cs.catPct > 0) drawRoundRect(ctx, mpX, mpY, Math.max(6, mpW * cs.catPct / 100), mpH, 3, theme.dot);
        drawText(ctx, cs.catPct + "%", rx + tlColW - 28, ry + 32, "bold 19px Segoe UI, sans-serif", theme.text, "center");
    });

    const tlRows = Math.ceil(sortedCats.length / tlCols);
    Y += tlRows * (tlRowH + 6) + 10;

    // ── IN PROGRESS NOW (NEW — shows v2 task detail) ──
    const inProgAll = [];
    sortedCats.forEach(cat => {
        const cs = getCategoryExportStats(cat);
        (cs.inProgTasks || []).forEach(t => inProgAll.push({ ...t, _cat: cat }));
    });
    if (inProgAll.length > 0 && Y < H - 180) {
        drawDivider(ctx, 60, W - 60, Y, "#e0e0e0");
        Y += 14;
        drawText(ctx, "IN PROGRESS NOW", W / 2, Y, "bold 13px Segoe UI, sans-serif", "#888888");
        Y += 14;
        const ipCols = 2, ipColW = (W - 160) / ipCols, ipRowH = 36;
        inProgAll.slice(0, 8).forEach((task, i) => {
            const col = i % ipCols;
            const row = Math.floor(i / ipCols);
            const rx  = 80 + col * (ipColW + 8);
            const ry  = Y + row * (ipRowH + 4);
            drawRoundRect(ctx, rx, ry, ipColW, ipRowH, 6, "#fffdf0", "#ffe082");
            drawRoundRect(ctx, rx, ry, 4, ipRowH, 2, "#e65100");

            const taskLabel = (task.task || "").length > 38
                ? (task.task || "").substring(0, 35) + "\u2026"
                : (task.task || "");
            drawText(ctx, taskLabel, rx + 14, ry + 23, "15px Segoe UI, sans-serif", "#333333", "left");

            // Right: @assignee  system  [party]
            const parts = [];
            if (task.assignee) parts.push("@" + task.assignee);
            if (task.system)   parts.push(task.system);
            if (task.party)    parts.push("[" + task.party + "]");
            if (task.taskId)   parts.push("#" + task.taskId);
            if (parts.length > 0) {
                drawText(ctx, parts.join("  "), rx + ipColW - 10, ry + 23, "12px Segoe UI, sans-serif", "#777777", "right");
            }
        });
        const ipRows = Math.ceil(Math.min(inProgAll.length, 8) / ipCols);
        Y += ipRows * (ipRowH + 4) + 6;
        if (inProgAll.length > 8) {
            drawText(ctx, `\u2026 and ${inProgAll.length - 8} more in progress`, W / 2, Y, "13px Segoe UI, sans-serif", "#aaaaaa");
            Y += 14;
        }
    }

    // ── ACTIVE ASSIGNEES ──
    const emailActiveList = getActiveAssignees(sortedCats);
    if (emailActiveList.length > 0 && Y < H - 120) {
        drawDivider(ctx, 60, W - 60, Y, "#e0e0e0");
        Y += 14;
        drawText(ctx, "ACTIVE ASSIGNEES", W / 2, Y, "bold 13px Segoe UI, sans-serif", "#888888");
        Y += 12;
        const aCols = 3, aColW = (W - 160) / aCols;
        emailActiveList.slice(0, 6).forEach((entry, i) => {
            const ac = i % aCols, ar = Math.floor(i / aCols);
            const ax = 80 + ac * aColW, ay = Y + ar * 28;
            drawRoundRect(ctx, ax, ay, aColW - 8, 24, 4, "#f0f0ff", "#ddddf0");
            drawText(ctx, "@" + entry[0], ax + 8, ay + 17, "13px Segoe UI, sans-serif", "#1565c0", "left");
            drawText(ctx, entry[1] + " active", ax + aColW - 16, ay + 17, "bold 11px Segoe UI, sans-serif", "#e65100", "right");
        });
        Y += Math.ceil(Math.min(emailActiveList.length, 6) / aCols) * 28 + 8;
    }

    // ── ISSUES ──
    const issueFilter = getIssueFilter("email");
    const { openIssues: emailOpen, closedIssues: emailClosed, displayList: emailIssueList } = getExportIssues(issueFilter);
    if (emailIssueList.length > 0) {
        drawDivider(ctx, 60, W - 60, Y, "#e0e0e0");
        Y += 16;
        const blockOp = emailOpen.filter(i => i.severity === ISSUE_SEVERITY.BLOCKING).length;
        const issTitle = issueFilter === "open"
            ? `OPEN ISSUES: ${emailOpen.length}${blockOp > 0 ? "  (" + blockOp + " blocking)" : ""}`
            : `ISSUES LOG: ${emailIssueList.length} (${emailOpen.length} open, ${emailClosed.length} closed)`;
        drawText(ctx, issTitle, W / 2, Y, "bold 15px Segoe UI, sans-serif", "#e65100");
        Y += 14;

        emailIssueList.forEach(iss => {
            const iRowX = 70, iRowW = W - 140, iRowH = 38;
            Y += 4;
            if (Y + iRowH > H - 44) return;
            const isBlk  = iss.severity  === ISSUE_SEVERITY.BLOCKING;
            const isOpen = iss.issueStatus === ISSUE_STATUS.ONGOING;
            drawRoundRect(ctx, iRowX, Y, iRowW, iRowH, 6, "#fafafa", "#e0e0e0");
            drawRoundRect(ctx, iRowX + 4, Y + 6, 4, iRowH - 12, 2, isBlk ? "#c62828" : "#e65100");

            const descColor = isOpen ? (isBlk ? "#c62828" : "#333333") : "#888888";
            const desc = (iss.description || "").length > 80
                ? (iss.description || "").substring(0, 77) + "\u2026"
                : (iss.description || "");
            drawText(ctx, desc, iRowX + 20, Y + 24, (isBlk && isOpen ? "bold " : "") + "17px Segoe UI, sans-serif", descColor, "left");
            drawText(ctx, isOpen ? "OPEN" : "CLOSED", iRowX + iRowW - 16, Y + 16, "bold 11px Segoe UI, sans-serif", isOpen ? "#e65100" : "#2e7d32", "right");
            drawText(ctx, isBlk ? "BLOCKING" : "NON-BLOCKING", iRowX + iRowW - 16, Y + 30, "bold 11px Segoe UI, sans-serif", isBlk ? "#c62828" : "#e65100", "right");
            Y += iRowH;
        });
    }

    // ── FOOTER ──
    const footerY = Math.max(Y + 24, H - 44);
    resizeIfNeeded(cv, ctx, footerY, 44, "#ffffff");
    const fY = Math.max(footerY, cv.height - 44);
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, fY + 12, W, 32);
    drawText(ctx, "Generated from Runbook Dashboard", W / 2, fY + 33, "15px Segoe UI, sans-serif", "#ffffff", "center");

    // ── Export ──
    exportCanvasAsImage(cv, "runbook_email", null, () => showToast("Corporate image ready!"));
}

