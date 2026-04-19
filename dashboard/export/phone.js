/**
 * Phone image export (1080×1920 dark portrait) — multi-page support.
 *
 * Page 1: header, health badge, timer strip (if running), progress bar, stat cards.
 * Subsequent pages: phase timeline with per-category in-progress task detail
 *                   (v2 fields: assignee, system, party, taskId),
 *                   active assignees, issues log.
 *
 * Each page is exported as a separate 1080×1920 PNG.
 */

import {
    drawText, drawRoundRect, drawDivider, drawDot,
    drawBackgroundImage, drawLogo, drawProgressBar,
    exportCanvasAsImage, formatExportTimestamp,
} from "./canvas.js";
import { HEALTH_DARK, PROGRESS_GRADIENT_DARK, CAT_STATUS_DARK, STAT_COLORS_DARK } from "./theme.js";
import { ISSUE_SEVERITY, ISSUE_STATUS } from "../constants.js";
import {
    getExportCategories, getProjectInfo, getExportStats, getCategoryExportStats,
    getActiveAssignees, getExportIssues, getHealthStatus, getExportAssets,
    getIssueFilter, getTimerInfo, getDeltaInfo,
} from "./shared.js";

/**
 * Generate and export phone status image(s).
 * Automatically paginates into multiple 1080×1920 pages if content overflows.
 * @param {function} showToast
 */
export function exportPhoneSnapshot(showToast) {
    showToast("Generating image(s)...");

    const W = 1080, H = 1920;
    const MARGIN = 60;
    const FOOTER_H = 74;
    const CONTENT_END = H - FOOTER_H;

    const { logoImg, bgImg } = getExportAssets();
    const project = getProjectInfo();
    const health = getHealthStatus();
    const hMeta = HEALTH_DARK[health] || HEALTH_DARK.Green;
    const stats = getExportStats();
    const sortedCats = getExportCategories();
    const gradColors = PROGRESS_GRADIENT_DARK[health] || PROGRESS_GRADIENT_DARK.Green;
    const sc = STAT_COLORS_DARK;
    const timer = getTimerInfo();
    const delta = getDeltaInfo();

    // ── Page state (mutated by page helpers, shared via closure) ──────
    const pages = [];
    let cv, ctx, pageY;

    function drawBg() {
        ctx.fillStyle = "#0a0a0f";
        ctx.fillRect(0, 0, W, H);
        if (bgImg) drawBackgroundImage(ctx, bgImg, W, H, 0.12);
    }

    function startPage(isContinuation) {
        cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        ctx = cv.getContext("2d");
        drawBg();
        pages.push(cv);
        pageY = MARGIN;
        if (isContinuation) {
            drawText(ctx, project.projectName, W / 2, pageY + 28, "bold 26px Segoe UI, sans-serif", "#777777");
            drawText(ctx, `Page ${pages.length}`, W - MARGIN, pageY + 28, "18px Segoe UI, sans-serif", "#555555", "right");
            pageY += 52;
            drawDivider(ctx, MARGIN, W - MARGIN, pageY, "#1e1e1e");
            pageY += 22;
        }
    }

    function endPage() {
        const fY = H - FOOTER_H;
        ctx.fillStyle = "rgba(7, 7, 11, 0.97)";
        ctx.fillRect(0, fY, W, FOOTER_H);
        drawDivider(ctx, MARGIN, W - MARGIN, fY + 2, "#1e1e1e");
        drawText(ctx, `Page ${pages.length}  \u00B7  ${formatExportTimestamp()}`, W / 2, fY + 46, "18px Segoe UI, sans-serif", "#3a3a3a", "center");
    }

    /** Ensure at least neededH px remain before page footer. If not, start a new page. */
    function ensure(neededH) {
        if (pageY + neededH > CONTENT_END) {
            endPage();
            startPage(true);
        }
    }

    // ── PAGE 1 — HEADER + STATS ───────────────────────────────────────
    startPage(false);

    // Logo + title block
    if (logoImg) {
        drawLogo(ctx, logoImg, MARGIN, pageY, 110, 10);
        drawText(ctx, project.projectName, MARGIN + 130, pageY + 42, "bold 44px Segoe UI, sans-serif", "#ffffff", "left");
        drawText(ctx, "GO-LIVE RUNBOOK", MARGIN + 130, pageY + 86, "bold 32px Segoe UI, sans-serif", "#aaaaaa", "left");
        pageY += 132;
    } else {
        drawText(ctx, project.projectName, W / 2, pageY + 52, "bold 50px Segoe UI, sans-serif", "#ffffff");
        drawText(ctx, "GO-LIVE RUNBOOK", W / 2, pageY + 100, "bold 38px Segoe UI, sans-serif", "#aaaaaa");
        pageY += 134;
    }

    const subtitleStr = [project.subtitle, project.changeRef].filter(Boolean).join("  |  ");
    if (subtitleStr) {
        drawText(ctx, subtitleStr, W / 2, pageY, "26px Segoe UI, sans-serif", "#666666");
        pageY += 40;
    }
    drawText(ctx, formatExportTimestamp(), W / 2, pageY, "bold 24px Consolas, monospace", "#39ff14");
    pageY += 50;

    // Health badge
    const badgeW = 430, badgeH = 62, badgeR = 31;
    const badgeX = (W - badgeW) / 2;
    drawRoundRect(ctx, badgeX, pageY, badgeW, badgeH, badgeR, hMeta.bg, hMeta.border);
    drawDot(ctx, badgeX + 34, pageY + badgeH / 2, 12, hMeta.color);
    drawText(ctx, "GO-LIVE STATUS:  " + hMeta.label, W / 2 + 12, pageY + 41, "bold 28px Segoe UI, sans-serif", hMeta.color);
    pageY += badgeH + 28;

    // Timer strip (only when timer is running or paused)
    if (timer) {
        const timerBg  = delta
            ? (delta.advisory === "Green" ? "#082008" : delta.advisory === "Amber" ? "#201400" : "#200808")
            : "#0c0c1c";
        const timerBdr = delta
            ? (delta.advisory === "Green" ? "#184a10" : delta.advisory === "Amber" ? "#4a2e00" : "#4a1010")
            : "#1c1c30";
        const STRIP_H = 68;
        drawRoundRect(ctx, MARGIN, pageY, W - MARGIN * 2, STRIP_H, 14, timerBg, timerBdr);
        drawText(ctx, "ELAPSED", MARGIN + 28, pageY + 24, "bold 13px Segoe UI, sans-serif", "#3a3a5a", "left");
        drawText(ctx, timer.elapsed, MARGIN + 28, pageY + 54, "bold 36px Consolas, monospace", "#5bc0ff", "left");
        if (delta) {
            const dColor = delta.advisory === "Green" ? "#39ff14"
                : delta.advisory === "Amber" ? "#ffd84a" : "#ff6b6b";
            const sign = delta.deltaPct >= 0 ? "+" : "";
            const advisoryLabel = delta.advisory === "Green" ? "ON TRACK"
                : delta.advisory === "Amber" ? "SLIGHT DELAY" : "AT RISK";
            drawText(ctx, "PROGRESS DELTA", W - MARGIN - 28, pageY + 24, "bold 13px Segoe UI, sans-serif", "#3a3a5a", "right");
            drawText(ctx, `${sign}${delta.deltaPct}%  ${advisoryLabel}`, W - MARGIN - 28, pageY + 54, "bold 28px Segoe UI, sans-serif", dColor, "right");
        } else {
            drawText(ctx, timer.timerState === "paused" ? "PAUSED" : "RUNNING", W - MARGIN - 28, pageY + 46, "bold 24px Segoe UI, sans-serif", "#444466", "right");
        }
        pageY += STRIP_H + 24;
    }

    // Master progress bar
    const BAR_W = W - MARGIN * 2, BAR_H = 76, BAR_R = 18;
    drawProgressBar(ctx, MARGIN, pageY, BAR_W, BAR_H, BAR_R, stats.pct, gradColors, "#13132a", "#23234a");
    drawText(ctx, stats.pct + "%", MARGIN + BAR_W * 0.26, pageY + 51, "bold 48px Segoe UI, sans-serif", "#ffffff", "center");
    drawText(ctx, `${stats.done} / ${stats.total} tasks`, MARGIN + BAR_W * 0.52, pageY + 36, "28px Segoe UI, sans-serif", "rgba(255,255,255,0.9)", "left");
    drawText(ctx, "OVERALL COMPLETION", MARGIN + BAR_W * 0.52, pageY + 63, "bold 15px Segoe UI, sans-serif", "rgba(255,255,255,0.5)", "left");
    pageY += BAR_H + 28;

    // Stat cards
    const STAT_GAP = 14;
    const leftW  = (W - MARGIN * 2 - STAT_GAP) * 0.65;
    const rightW = (W - MARGIN * 2 - STAT_GAP) * 0.35;
    const CARD_H = 98, CARD_R = 14;
    const leftX = MARGIN, rightX = leftX + leftW + STAT_GAP;

    drawText(ctx, "TASKS",  leftX + leftW / 2,  pageY, "bold 15px Segoe UI, sans-serif", "#444444");
    drawText(ctx, "ISSUES", rightX + rightW / 2, pageY, "bold 15px Segoe UI, sans-serif", "#444444");
    pageY += 14;

    const taskCards = [
        { value: stats.total,       label: "TOTAL",   color: sc.total },
        { value: stats.done,        label: "DONE",    color: sc.done },
        { value: stats.inProg,      label: "IN PROG", color: sc.inProg },
        { value: stats.notStarted,  label: "WAITING", color: sc.notStarted },
    ];
    const tcW = (leftW - STAT_GAP * 3) / 4;
    taskCards.forEach((s, i) => {
        const cx = leftX + i * (tcW + STAT_GAP);
        drawRoundRect(ctx, cx, pageY, tcW, CARD_H, CARD_R, "#0e0e14", "#1a1a22");
        drawText(ctx, String(s.value), cx + tcW / 2, pageY + 52, "bold 42px Segoe UI, sans-serif", s.color);
        drawText(ctx, s.label, cx + tcW / 2, pageY + 80, "bold 13px Segoe UI, sans-serif", "#555555");
    });

    const issCards = [
        { value: stats.openIssues,    label: "OPEN",     color: sc.openIssues },
        { value: stats.totalBlocking, label: "BLOCKING", color: sc.blocking },
    ];
    const icW = (rightW - STAT_GAP) / 2;
    issCards.forEach((s, i) => {
        const cx = rightX + i * (icW + STAT_GAP);
        drawRoundRect(ctx, cx, pageY, icW, CARD_H, CARD_R, "#0e0e14", "#1a1a22");
        drawText(ctx, String(s.value), cx + icW / 2, pageY + 52, "bold 42px Segoe UI, sans-serif", s.color);
        drawText(ctx, s.label, cx + icW / 2, pageY + 80, "bold 13px Segoe UI, sans-serif", "#555555");
    });
    pageY += CARD_H + 36;

    drawDivider(ctx, MARGIN, W - MARGIN, pageY, "#1e1e1e");
    pageY += 34;

    // ── PHASE TIMELINE (paginates automatically) ──────────────────────
    ensure(80);
    drawText(ctx, "PHASE TIMELINE", W / 2, pageY, "bold 22px Segoe UI, sans-serif", "#555555");
    pageY += 28;

    sortedCats.forEach(cat => {
        const cs   = getCategoryExportStats(cat);
        const theme = CAT_STATUS_DARK[cs.status] || CAT_STATUS_DARK.notstarted;
        const CAT_H = 78;
        const rowX = MARGIN, rowW = W - MARGIN * 2;

        ensure(CAT_H + 8);

        // Category header
        drawRoundRect(ctx, rowX, pageY, rowW, CAT_H, 12, theme.bg, theme.border);
        drawDot(ctx, rowX + 28, pageY + CAT_H / 2, 9, theme.dot);
        const catLabel = cat.length > 44 ? cat.substring(0, 41) + "\u2026" : cat;
        drawText(ctx, catLabel, rowX + 52, pageY + 28, "bold 24px Segoe UI, sans-serif", theme.text, "left");
        drawText(ctx, `${cs.done}/${cs.tasks.length}`, rowX + 52, pageY + 56, "20px Consolas, monospace", "#777777", "left");

        const mpX = rowX + 210, mpW = rowW - 322, mpH = 8, mpY = pageY + 50;
        drawRoundRect(ctx, mpX, mpY, mpW, mpH, 4, "#141414");
        if (cs.catPct > 0) drawRoundRect(ctx, mpX, mpY, Math.max(8, mpW * cs.catPct / 100), mpH, 4, theme.dot);
        drawText(ctx, cs.catPct + "%", rowX + rowW - 44, pageY + CAT_H / 2 + 10, "bold 26px Segoe UI, sans-serif", theme.text, "center");
        pageY += CAT_H;

        // In-progress task detail rows (show v2 fields)
        (cs.inProgTasks || []).forEach(task => {
            const TASK_H = 56;
            ensure(TASK_H + 4);
            const tx = rowX + 18, tw = rowW - 18;
            drawRoundRect(ctx, tx, pageY, tw, TASK_H, 8, "#0c0c18", "#1e1e40");
            drawRoundRect(ctx, tx, pageY, 4, TASK_H, 2, "#4a80c8"); // blue left accent

            const taskLabel = (task.task || "").length > 42
                ? (task.task || "").substring(0, 39) + "\u2026"
                : (task.task || "");
            drawText(ctx, taskLabel, tx + 20, pageY + 24, "18px Segoe UI, sans-serif", "#cccccc", "left");

            // V2 tag row: @assignee  system  [PARTY]  #taskId
            const tagY = pageY + 44;
            let tagX = tx + 20;
            if (task.assignee) {
                const aStr = "@" + task.assignee;
                ctx.font = "14px Segoe UI, sans-serif"; ctx.fillStyle = "#5bc0ff"; ctx.textAlign = "left";
                ctx.fillText(aStr, tagX, tagY);
                tagX += ctx.measureText(aStr).width + 14;
            }
            if (task.system) {
                ctx.font = "14px Segoe UI, sans-serif"; ctx.fillStyle = "#50d9c8"; ctx.textAlign = "left";
                ctx.fillText(task.system, tagX, tagY);
                tagX += ctx.measureText(task.system).width + 14;
            }
            if (task.party) {
                const pColor = task.party === "Client" ? "#ffd84a"
                    : task.party === "Murex" ? "#5bc0ff" : "#a78bfa";
                ctx.font = "bold 12px Segoe UI, sans-serif"; ctx.fillStyle = pColor; ctx.textAlign = "left";
                ctx.fillText(task.party.toUpperCase(), tagX, tagY);
            }
            if (task.taskId) {
                drawText(ctx, "#" + task.taskId, tx + tw - 14, tagY, "bold 13px Consolas, monospace", "#444444", "right");
            }
            pageY += TASK_H + 4;
        });

        pageY += 8;
    });

    // ── ACTIVE ASSIGNEES ──────────────────────────────────────────────
    const activeList = getActiveAssignees(sortedCats);
    if (activeList.length > 0) {
        ensure(60);
        pageY += 10;
        drawDivider(ctx, MARGIN, W - MARGIN, pageY, "#1e1e1e");
        pageY += 28;
        drawText(ctx, "ACTIVE ASSIGNEES", W / 2, pageY, "bold 22px Segoe UI, sans-serif", "#555555");
        pageY += 28;

        const aTagW = (W - MARGIN * 2 - 16) / 2;
        const displayAssignees = activeList.slice(0, 10);
        displayAssignees.forEach((entry, i) => {
            const col = i % 2;
            if (col === 0) ensure(38);
            const tx = MARGIN + col * (aTagW + 16);
            drawRoundRect(ctx, tx, pageY, aTagW, 30, 6, "#0c0c1a", "#1c1c30");
            drawText(ctx, "@" + entry[0], tx + 12, pageY + 20, "16px Segoe UI, sans-serif", "#5bc0ff", "left");
            drawText(ctx, entry[1] + " active", tx + aTagW - 12, pageY + 20, "bold 15px Segoe UI, sans-serif", "#ffd84a", "right");
            if (col === 1 || i === displayAssignees.length - 1) pageY += 38;
        });
        if (activeList.length > 10) {
            ensure(28);
            drawText(ctx, `\u2026 and ${activeList.length - 10} more`, W / 2, pageY, "18px Segoe UI, sans-serif", "#444444");
            pageY += 28;
        }
    }

    // ── ISSUES LOG ────────────────────────────────────────────────────
    const issueFilter = getIssueFilter("phone");
    const { openIssues, displayList: allIssues } = getExportIssues(issueFilter);
    if (allIssues.length > 0) {
        ensure(60);
        pageY += 10;
        drawDivider(ctx, MARGIN, W - MARGIN, pageY, "#1e1e1e");
        pageY += 28;

        const blockingOpen = openIssues.filter(i => i.severity === ISSUE_SEVERITY.BLOCKING).length;
        let issTitle = `ISSUES LOG  (${openIssues.length} open`;
        if (blockingOpen > 0) issTitle += `  \u00B7  ${blockingOpen} blocking`;
        issTitle += ")";
        drawText(ctx, issTitle, W / 2, pageY, "bold 22px Segoe UI, sans-serif", "#ff9944");
        pageY += 28;

        allIssues.forEach(iss => {
            const ISS_H = 70;
            ensure(ISS_H + 8);
            const isOpen = iss.issueStatus === ISSUE_STATUS.ONGOING;
            const isBlk  = iss.severity   === ISSUE_SEVERITY.BLOCKING;
            const iRowX  = MARGIN, iRowW = W - MARGIN * 2;

            drawRoundRect(ctx, iRowX, pageY, iRowW, ISS_H, 10, "#0c0c10", "#181818");
            drawRoundRect(ctx, iRowX, pageY, 5, ISS_H, 3, isBlk ? "#cc2222" : "#cc7700");

            const desc = (iss.description || "").length > 54
                ? (iss.description || "").substring(0, 51) + "\u2026"
                : (iss.description || "");
            drawText(ctx, desc, iRowX + 22, pageY + 28, (isOpen ? "bold " : "") + "20px Segoe UI, sans-serif", isOpen ? "#dddddd" : "#666666", "left");
            drawText(ctx, [iss.category, iss.time].filter(Boolean).join("  \u00B7  "), iRowX + 22, pageY + 52, "16px Segoe UI, sans-serif", "#444444", "left");

            drawText(ctx, isOpen ? "OPEN" : "CLOSED", iRowX + iRowW - 16, pageY + 28, "bold 16px Segoe UI, sans-serif", isOpen ? "#ffd84a" : "#7bff7b", "right");
            drawText(ctx, isBlk ? "BLOCKING" : "NON-BLOCKING", iRowX + iRowW - 16, pageY + 52, "bold 14px Segoe UI, sans-serif", isBlk ? "#ff6b6b" : "#ffa500", "right");
            pageY += ISS_H + 8;
        });
    }

    // ── Finalise and export all pages ────────────────────────────────
    endPage();

    const total = pages.length;
    pages.forEach((pageCv, i) => {
        const isLast = i === total - 1;
        exportCanvasAsImage(
            pageCv,
            `runbook_status_p${i + 1}`,
            i === 0 ? project.projectName + " Status" : null,
            isLast ? () => showToast(`${total} image${total > 1 ? "s" : ""} ready!`) : null,
        );
    });
}

