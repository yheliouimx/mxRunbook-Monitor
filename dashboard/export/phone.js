/**
 * Phone image export (1080×1920 dark portrait).
 */

import { drawText, drawRoundRect, drawDivider, drawDot, drawBackgroundImage, drawLogo, drawProgressBar, resizeIfNeeded, exportCanvasAsImage, formatExportTimestamp } from "./canvas.js";
import { HEALTH_DARK, PROGRESS_GRADIENT_DARK, CAT_STATUS_DARK, STAT_COLORS_DARK } from "./theme.js";
import { getExportCategories, getProjectInfo, getExportStats, getCategoryExportStats, getActiveAssignees, getExportIssues, getHealthStatus, getExportAssets, getIssueFilter } from "./shared.js";

/**
 * Generate and export the phone snapshot image.
 * @param {function} showToast
 */
export function exportPhoneSnapshot(showToast) {
    showToast("Generating image...");

    const W = 1080, H = 1920;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");

    const { logoImg, bgImg } = getExportAssets();
    const project = getProjectInfo();
    const health = getHealthStatus();
    const hMeta = HEALTH_DARK[health];
    const stats = getExportStats();
    const sortedCats = getExportCategories();
    const gradColors = PROGRESS_GRADIENT_DARK[health] || PROGRESS_GRADIENT_DARK.Green;

    // Background
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, W, H);
    if (bgImg) drawBackgroundImage(ctx, bgImg, W, H, 0.15);

    let Y = 60;

    // ── LOGO ──
    if (logoImg) {
        drawLogo(ctx, logoImg, 40, Y, 120, 10);
    }

    // ── TITLE ──
    drawText(ctx, project.projectName, W / 2, Y += 50, "bold 48px Segoe UI, sans-serif", "#ffffff");
    drawText(ctx, "Go-Live Runbook", W / 2, Y += 56, "bold 44px Segoe UI, sans-serif", "#ffffff");
    drawText(ctx, [project.subtitle, project.changeRef].filter(Boolean).join(" | "), W / 2, Y += 46, "28px Segoe UI, sans-serif", "#888888");

    // Timestamp
    drawText(ctx, formatExportTimestamp(), W / 2, Y += 50, "bold 30px Consolas, monospace", "#39ff14");

    // ── HEALTH BADGE ──
    Y += 40;
    const badgeW = 380, badgeH = 60, badgeR = 30;
    const badgeX = (W - badgeW) / 2;
    drawRoundRect(ctx, badgeX, Y, badgeW, badgeH, badgeR, hMeta.bg, hMeta.border);
    ctx.lineWidth = 3;
    ctx.strokeStyle = hMeta.border;
    ctx.stroke();
    drawDot(ctx, badgeX + 36, Y + badgeH / 2, 12, hMeta.color);
    drawText(ctx, "GO-LIVE: " + hMeta.label, badgeX + badgeW / 2 + 10, Y + 38, "bold 28px Segoe UI, sans-serif", hMeta.color);
    Y += badgeH + 20;

    // ── Divider ──
    drawDivider(ctx, 60, W - 60, Y);
    Y += 20;

    // ── MASTER PROGRESS BAR ──
    const masterW = W - 120, masterH = 70, masterR = 16, masterX = 60;
    drawProgressBar(ctx, masterX, Y, masterW, masterH, masterR, stats.pct, gradColors, "#1a1a2e", "#333333");
    drawText(ctx, stats.pct + "%", masterX + masterW / 2 - 80, Y + 48, "bold 44px Segoe UI, sans-serif", "#ffffff", "center");
    drawText(ctx, `${stats.done} / ${stats.total} tasks completed`, masterX + masterW / 2 + 30, Y + 38, "24px Segoe UI, sans-serif", "#ffffff", "left");
    drawText(ctx, "OVERALL COMPLETION", masterX + masterW / 2 + 30, Y + 58, "bold 14px Segoe UI, sans-serif", "rgba(255,255,255,0.7)", "left");
    Y += masterH + 20;

    // ── STAT CARDS ──
    const gapBetween = 20;
    const leftW = (W - 120 - gapBetween) * 0.65;
    const rightW = (W - 120 - gapBetween) * 0.35;
    const groupH = 100, groupR = 14;
    const leftX = 60, rightX = leftX + leftW + gapBetween;
    const sc = STAT_COLORS_DARK;

    drawText(ctx, "TASKS", leftX + leftW / 2, Y, "bold 16px Segoe UI, sans-serif", "#666666");
    drawText(ctx, "ISSUES", rightX + rightW / 2, Y, "bold 16px Segoe UI, sans-serif", "#666666");
    Y += 12;

    const taskStats = [
        { value: stats.total, label: "TOTAL", color: sc.total },
        { value: stats.done, label: "DONE", color: sc.done },
        { value: stats.inProg, label: "IN PROG", color: sc.inProg },
        { value: stats.notStarted, label: "NOT START", color: sc.notStarted },
    ];
    const tcW = (leftW - 30) / 4, tcGap = 10;
    taskStats.forEach((s, i) => {
        const cx = leftX + i * (tcW + tcGap);
        drawRoundRect(ctx, cx, Y, tcW, groupH, groupR, "#111111", "#222222");
        drawText(ctx, String(s.value), cx + tcW / 2, Y + 48, "bold 40px Segoe UI, sans-serif", s.color);
        drawText(ctx, s.label, cx + tcW / 2, Y + 76, "bold 14px Segoe UI, sans-serif", "#888888");
    });

    const issStats = [
        { value: stats.openIssues, label: "OPEN", color: sc.openIssues },
        { value: stats.totalBlocking, label: "BLOCKING", color: sc.blocking },
    ];
    const icW = (rightW - 10) / 2, icGap = 10;
    issStats.forEach((s, i) => {
        const cx = rightX + i * (icW + icGap);
        drawRoundRect(ctx, cx, Y, icW, groupH, groupR, "#111111", "#222222");
        drawText(ctx, String(s.value), cx + icW / 2, Y + 48, "bold 40px Segoe UI, sans-serif", s.color);
        drawText(ctx, s.label, cx + icW / 2, Y + 76, "bold 14px Segoe UI, sans-serif", "#888888");
    });
    Y += groupH + 30;

    // ── Divider ──
    drawDivider(ctx, 60, W - 60, Y);
    Y += 40;

    // ── PHASE TIMELINE ──
    drawText(ctx, "PHASE TIMELINE", W / 2, Y, "bold 24px Segoe UI, sans-serif", "#888888");
    ctx.textAlign = "left";
    Y += 24;

    sortedCats.forEach(cat => {
        const cs = getCategoryExportStats(cat);
        const theme = CAT_STATUS_DARK[cs.status] || CAT_STATUS_DARK.notstarted;
        const rowX = 80, rowW = W - 160, rowH = 60;
        Y += 8;

        drawRoundRect(ctx, rowX, Y, rowW, rowH, 10, theme.bg, theme.border);
        drawDot(ctx, rowX + 28, Y + rowH / 2, 8, theme.dot);
        drawText(ctx, cat, rowX + 50, Y + 25, "bold 24px Segoe UI, sans-serif", theme.text, "left");
        drawText(ctx, `${cs.done}/${cs.tasks.length}`, rowX + 50, Y + 48, "20px Consolas, monospace", "#aaaaaa", "left");

        // Mini progress bar
        const mpX = rowX + 170, mpW = rowW - 280, mpH = 8, mpY = Y + 40;
        drawRoundRect(ctx, mpX, mpY, mpW, mpH, 4, "#1a1a1a");
        if (cs.catPct > 0) drawRoundRect(ctx, mpX, mpY, Math.max(8, mpW * cs.catPct / 100), mpH, 4, theme.dot);

        drawText(ctx, cs.catPct + "%", rowX + rowW - 45, Y + 37, "bold 24px Segoe UI, sans-serif", theme.text, "center");
        Y += rowH;
    });

    // ── ACTIVE ASSIGNEES ──
    const activeList = getActiveAssignees(sortedCats);
    if (activeList.length > 0) {
        Y += 24;
        drawDivider(ctx, 60, W - 60, Y);
        Y += 30;
        drawText(ctx, "ACTIVE ASSIGNEES", W / 2, Y, "bold 22px Segoe UI, sans-serif", "#888888");
        Y += 16;
        const cols2 = 2, tagW2 = (W - 180) / cols2;
        activeList.slice(0, 8).forEach((entry, i) => {
            const col = i % cols2;
            const row = Math.floor(i / cols2);
            const tx = 90 + col * tagW2;
            const ty = Y + row * 34;
            drawRoundRect(ctx, tx, ty, tagW2 - 10, 28, 6, "#111122", "#333355");
            drawText(ctx, entry[0], tx + 10, ty + 19, "18px Segoe UI, sans-serif", "#5bc0ff", "left");
            drawText(ctx, entry[1] + " active", tx + tagW2 - 20, ty + 19, "bold 16px Segoe UI, sans-serif", "#ffd84a", "right");
        });
        Y += Math.ceil(Math.min(activeList.length, 8) / cols2) * 34 + 6;
        if (activeList.length > 8) {
            drawText(ctx, `... and ${activeList.length - 8} more`, W / 2, Y + 10, "18px Segoe UI, sans-serif", "#555555");
            Y += 24;
        }
    }

    // ── ISSUES SECTION ──
    const issueFilter = getIssueFilter("phone");
    const { openIssues, displayList: allIssues } = getExportIssues(issueFilter);
    if (allIssues.length > 0) {
        Y += 30;
        drawDivider(ctx, 60, W - 60, Y);
        Y += 36;
        const blockingOpen = openIssues.filter(i => i.severity === "Blocking").length;
        let issueTitle = `ISSUES LOG (${openIssues.length} open`;
        if (blockingOpen > 0) issueTitle += ` / ${blockingOpen} blocking`;
        issueTitle += ")";
        drawText(ctx, issueTitle, W / 2, Y, "bold 24px Segoe UI, sans-serif", "#ff9944");
        Y += 16;

        allIssues.forEach(iss => {
            if (Y > H - 100) return;
            Y += 8;
            const iRowX = 80, iRowW = W - 160, iRowH = 66;
            const isOpen = iss.issueStatus === "Ongoing";
            const isBlocking = iss.severity === "Blocking";

            drawRoundRect(ctx, iRowX, Y, iRowW, iRowH, 8, "#0d0d12", "#222222");
            drawRoundRect(ctx, iRowX + 6, Y + 8, 5, iRowH - 16, 3, isBlocking ? "#ff3333" : "#ffa500");

            const descStr = iss.description.length > 55 ? iss.description.substring(0, 52) + "..." : iss.description;
            const descColor = isOpen ? "#eeeeee" : "#888888";
            const descFont = isOpen ? "bold 22px Segoe UI, sans-serif" : "22px Segoe UI, sans-serif";
            drawText(ctx, descStr, iRowX + 24, Y + 26, descFont, descColor, "left");

            drawText(ctx, `${iss.category}  \u00B7  ${iss.time}`, iRowX + 24, Y + 50, "18px Segoe UI, sans-serif", "#666666", "left");

            const stTag = isOpen ? "ONGOING" : "CLOSED";
            const stColor = isOpen ? "#ffd84a" : "#7bff7b";
            const sevTag = isBlocking ? "BLOCKING" : "NON-BLOCKING";
            const sevColor = isBlocking ? "#ff6b6b" : "#ffa500";
            drawText(ctx, stTag, iRowX + iRowW - 16, Y + 26, "bold 16px Segoe UI, sans-serif", stColor, "right");
            drawText(ctx, sevTag, iRowX + iRowW - 16, Y + 48, "bold 14px Segoe UI, sans-serif", sevColor, "right");
            Y += iRowH;
        });
    }

    // ── Footer ──
    Y = Math.max(Y + 40, H - 50);
    resizeIfNeeded(cv, ctx, Y, 60, "#0a0a0f");
    Y = Math.max(Y, cv.height - 50);
    drawText(ctx, "Generated from Runbook Dashboard", W / 2, Y, "22px Segoe UI, sans-serif", "#444444", "center");

    // ── Export ──
    exportCanvasAsImage(cv, "runbook_status", project.projectName + " Status", () => showToast("Image ready!"));
}
