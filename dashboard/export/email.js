/**
 * Email image export (1920×1080 light landscape, corporate style).
 */

import { drawText, drawRoundRect, drawDivider, drawDot, drawBackgroundImage, drawProgressBar, resizeIfNeeded, exportCanvasAsImage, formatExportTimestamp } from "./canvas.js";
import { HEALTH_LIGHT, PROGRESS_GRADIENT_LIGHT, CAT_STATUS_LIGHT, STAT_COLORS_LIGHT } from "./theme.js";
import { getExportCategories, getProjectInfo, getExportStats, getCategoryExportStats, getActiveAssignees, getExportIssues, getHealthStatus, getExportAssets, getIssueFilter } from "./shared.js";

/**
 * Generate and export the email snapshot image.
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
    const hMeta = HEALTH_LIGHT[health];
    const stats = getExportStats();
    const sortedCats = getExportCategories();
    const gradColors = PROGRESS_GRADIENT_LIGHT[health] || PROGRESS_GRADIENT_LIGHT.Green;
    const sc = STAT_COLORS_LIGHT;

    // Corporate light background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    if (bgImg) drawBackgroundImage(ctx, bgImg, W, H, 0.08);

    // ── TOP BAR ──
    ctx.fillStyle = project.accentColor;
    ctx.fillRect(0, 0, W, 80);
    if (logoImg) {
        const lS = 52;
        ctx.save(); ctx.beginPath(); ctx.roundRect(18, 14, lS, lS, 8); ctx.clip();
        ctx.drawImage(logoImg, 18, 14, lS, lS); ctx.restore();
    }
    drawText(ctx, project.projectName.toUpperCase() + " — GO-LIVE RUNBOOK", W / 2, 50, "bold 30px Segoe UI, sans-serif", "#ffffff");

    // ── SUBTITLE BAR ──
    ctx.fillStyle = "#f4f5f7";
    ctx.fillRect(0, 80, W, 50);
    drawText(ctx, [project.subtitle, project.changeRef, formatExportTimestamp()].filter(Boolean).join("  |  "), W / 2, 112, "22px Segoe UI, sans-serif", "#555555");

    // Accent line
    ctx.fillStyle = project.accentColor;
    ctx.fillRect(0, 130, W, 3);

    let Y = 155;

    // ── HEALTH BADGE ──
    const badgeW = 260, badgeH = 42, badgeX = 60;
    drawRoundRect(ctx, badgeX, Y, badgeW, badgeH, 21, hMeta.bg, hMeta.color);
    drawDot(ctx, badgeX + 24, Y + badgeH / 2, 8, hMeta.color);
    drawText(ctx, "GO-LIVE: " + hMeta.label, badgeX + badgeW / 2 + 8, Y + 28, "bold 20px Segoe UI, sans-serif", hMeta.color);

    // ── MASTER PROGRESS BAR ──
    const emMasterW = W - 120, emMasterH = 50, emMasterR = 10, emMasterX = 60;
    drawProgressBar(ctx, emMasterX, Y, emMasterW, emMasterH, emMasterR, stats.pct, gradColors, "#e8e8e8", "#d0d0d0");
    drawText(ctx, stats.pct + "%", emMasterX + emMasterW / 2 - 60, Y + 35, "bold 32px Segoe UI, sans-serif", "#ffffff", "center");
    drawText(ctx, `${stats.done} / ${stats.total} tasks completed`, emMasterX + emMasterW / 2 + 10, Y + 28, "18px Segoe UI, sans-serif", "#ffffff", "left");
    drawText(ctx, "OVERALL COMPLETION", emMasterX + emMasterW / 2 + 10, Y + 44, "bold 10px Segoe UI, sans-serif", "rgba(255,255,255,0.85)", "left");
    Y += emMasterH + 10;

    // ── STAT CARDS ──
    const emGap = 14;
    const emLeftW = (W - 120 - emGap) * 0.66;
    const emRightW = (W - 120 - emGap) * 0.34;
    const emLeftX = 60, emRightX = emLeftX + emLeftW + emGap;
    const emGH = 66, emGR = 8;

    drawText(ctx, "TASKS", emLeftX + emLeftW / 2, Y + 8, "bold 11px Segoe UI, sans-serif", "#888888");
    drawText(ctx, "ISSUES", emRightX + emRightW / 2, Y + 8, "bold 11px Segoe UI, sans-serif", "#888888");
    Y += 14;

    const emTaskStats = [
        { value: stats.total, label: "TOTAL", color: sc.total },
        { value: stats.done, label: "DONE", color: sc.done },
        { value: stats.inProg, label: "IN PROG", color: sc.inProg },
        { value: stats.notStarted, label: "NOT START", color: sc.notStarted },
    ];
    const emTcW = (emLeftW - 30) / 4, emTcGap = 10;
    emTaskStats.forEach((s, i) => {
        const cx = emLeftX + i * (emTcW + emTcGap);
        drawRoundRect(ctx, cx, Y, emTcW, emGH, emGR, "#fafafa", "#e0e0e0");
        drawText(ctx, String(s.value), cx + emTcW / 2, Y + 34, "bold 28px Segoe UI, sans-serif", s.color);
        drawText(ctx, s.label, cx + emTcW / 2, Y + 54, "bold 10px Segoe UI, sans-serif", "#888888");
    });

    const emIssStats = [
        { value: stats.openIssues, label: "OPEN", color: sc.openIssues },
        { value: stats.totalBlocking, label: "BLOCKING", color: sc.blocking },
    ];
    const emIcW = (emRightW - 10) / 2, emIcGap = 10;
    emIssStats.forEach((s, i) => {
        const cx = emRightX + i * (emIcW + emIcGap);
        drawRoundRect(ctx, cx, Y, emIcW, emGH, emGR, "#fafafa", "#e0e0e0");
        drawText(ctx, String(s.value), cx + emIcW / 2, Y + 34, "bold 28px Segoe UI, sans-serif", s.color);
        drawText(ctx, s.label, cx + emIcW / 2, Y + 54, "bold 10px Segoe UI, sans-serif", "#888888");
    });
    Y += emGH + 20;

    // ── Divider ──
    drawDivider(ctx, 60, W - 60, Y, "#e0e0e0");
    Y += 20;

    // ── PHASE TIMELINE (2-column grid) ──
    drawText(ctx, "PHASE TIMELINE", W / 2, Y + 6, "bold 16px Segoe UI, sans-serif", "#888888");
    Y += 24;

    const cols = 2;
    const colW = (W - 140) / cols;
    const rowH = 50;

    sortedCats.forEach((cat, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const rx = 70 + col * (colW + 10);
        const ry = Y + row * (rowH + 6);

        const cs = getCategoryExportStats(cat);
        const theme = CAT_STATUS_LIGHT[cs.status] || CAT_STATUS_LIGHT.notstarted;

        drawRoundRect(ctx, rx, ry, colW, rowH, 8, theme.bg, theme.border);
        drawDot(ctx, rx + 22, ry + rowH / 2, 6, theme.dot);
        drawText(ctx, cat, rx + 40, ry + 22, "bold 18px Segoe UI, sans-serif", theme.text, "left");
        drawText(ctx, `${cs.done}/${cs.tasks.length}`, rx + 40, ry + 42, "16px Consolas, monospace", "#888888", "left");

        const mpX = rx + 130, mpW = colW - 250, mpH = 6, mpY = ry + 34;
        drawRoundRect(ctx, mpX, mpY, mpW, mpH, 3, "#e0e0e0");
        if (cs.catPct > 0) drawRoundRect(ctx, mpX, mpY, Math.max(6, mpW * cs.catPct / 100), mpH, 3, theme.dot);
        drawText(ctx, cs.catPct + "%", rx + colW - 30, ry + 32, "bold 20px Segoe UI, sans-serif", theme.text, "center");
    });

    const timelineRows = Math.ceil(sortedCats.length / cols);
    Y += timelineRows * (rowH + 6) + 14;

    // ── ACTIVE ASSIGNEES ──
    const emailActiveList = getActiveAssignees(sortedCats);
    if (emailActiveList.length > 0 && Y < H - 160) {
        drawDivider(ctx, 60, W - 60, Y, "#e0e0e0");
        Y += 20;
        drawText(ctx, "ACTIVE ASSIGNEES", W / 2, Y, "bold 14px Segoe UI, sans-serif", "#888888");
        Y += 12;
        const aCols = 3, aColW = (W - 160) / aCols;
        emailActiveList.slice(0, 6).forEach((entry, i) => {
            const ac = i % aCols;
            const ar = Math.floor(i / aCols);
            const ax = 80 + ac * aColW;
            const ay = Y + ar * 28;
            drawRoundRect(ctx, ax, ay, aColW - 8, 24, 4, "#f0f0ff", "#ddddf0");
            drawText(ctx, entry[0], ax + 8, ay + 17, "14px Segoe UI, sans-serif", "#1565c0", "left");
            drawText(ctx, entry[1] + " active", ax + aColW - 16, ay + 17, "bold 12px Segoe UI, sans-serif", "#e65100", "right");
        });
        Y += Math.ceil(Math.min(emailActiveList.length, 6) / aCols) * 28 + 10;
    }

    // ── ISSUES SECTION ──
    const issueFilter = getIssueFilter("email");
    const { openIssues: emailOpen, closedIssues: emailClosed, displayList: emailIssueList } = getExportIssues(issueFilter);
    if (emailIssueList.length > 0) {
        drawDivider(ctx, 60, W - 60, Y, "#e0e0e0");
        Y += 24;
        const blockOp = emailOpen.filter(i => i.severity === "Blocking").length;
        const emailIssTitle = issueFilter === "open"
            ? `OPEN ISSUES: ${emailOpen.length}${blockOp > 0 ? "  (" + blockOp + " blocking)" : ""}`
            : `ISSUES LOG: ${emailIssueList.length} (${emailOpen.length} open, ${emailClosed.length} closed)`;
        drawText(ctx, emailIssTitle, W / 2, Y, "bold 16px Segoe UI, sans-serif", "#e65100");
        Y += 14;

        emailIssueList.forEach(iss => {
            const iRowX = 70, iRowW = W - 140, iRowH = 38;
            Y += 4;
            const isBlk = iss.severity === "Blocking";
            drawRoundRect(ctx, iRowX, Y, iRowW, iRowH, 6, "#fafafa", "#e0e0e0");
            drawRoundRect(ctx, iRowX + 4, Y + 6, 4, iRowH - 12, 2, isBlk ? "#c62828" : "#e65100");

            const isOpen = iss.issueStatus === "Ongoing";
            const descColor = isOpen ? (isBlk ? "#c62828" : "#333333") : "#888888";
            const desc = iss.description.length > 80 ? iss.description.substring(0, 77) + "..." : iss.description;
            drawText(ctx, desc, iRowX + 20, Y + 24, (isBlk && isOpen ? "bold " : "") + "18px Segoe UI, sans-serif", descColor, "left");

            const stTag = isOpen ? "ONGOING" : "CLOSED";
            drawText(ctx, stTag, iRowX + iRowW - 16, Y + 16, "bold 11px Segoe UI, sans-serif", isOpen ? "#e65100" : "#2e7d32", "right");
            drawText(ctx, isBlk ? "BLOCKING" : "NON-BLOCKING", iRowX + iRowW - 16, Y + 30, "bold 13px Segoe UI, sans-serif", isBlk ? "#c62828" : "#e65100", "right");
            Y += iRowH;
        });
    }

    // ── FOOTER ──
    const footerY = Math.max(Y + 30, H - 40);
    resizeIfNeeded(cv, ctx, footerY, 40, "#ffffff");
    const fY = Math.max(footerY, cv.height - 40);
    ctx.fillStyle = project.accentColor;
    ctx.fillRect(0, fY + 10, W, 30);
    drawText(ctx, "Generated from Runbook Dashboard", W / 2, fY + 30, "16px Segoe UI, sans-serif", "#ffffff", "center");

    // ── Export ──
    exportCanvasAsImage(cv, "runbook_email", null, () => showToast("Corporate email image ready!"));
}
