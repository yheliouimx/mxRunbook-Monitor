import { state } from "../state.js";
import { normalizeStatus, getGlobalStats, formatTimeShort, escapeHtml } from "../selectors.js";

/**
 * Generate an HTML summary suitable for pasting into Outlook.
 * Renders into #summaryBox.
 */
export function generateSummary() {
    const box = document.getElementById("summaryBox");
    const { total, done, inProg, notStarted, blocking } = getGlobalStats();
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const now = new Date().toLocaleString("en-GB");
    const accent = state.projectConfig.accentColor || '#003a2d';

    let html = '';
    html += `<div style="font-family:Segoe UI,Calibri,Arial,sans-serif;background:#ffffff;color:#222222;padding:20px 28px;max-width:800px;">`;
    html += `<table style="width:100%;border:none;border-bottom:3px solid ${accent};padding-bottom:12px;margin-bottom:16px;"><tr>`;
    html += `<td style="font-size:20px;font-weight:bold;color:${accent};padding:0;">${escapeHtml(state.projectConfig.projectName)}</td>`;
    html += `<td style="text-align:right;font-size:12px;color:#888888;padding:0;">Go-Live Runbook Update<br/>${now}</td>`;
    html += `</tr></table>`;

    const pctColor = pct === 100 ? '#2e7d32' : pct >= 50 ? '#1565c0' : '#e65100';
    html += `<table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><tr>`;
    html += `<td style="padding:12px;background:#f5f5f5;border-radius:6px;text-align:center;">`;
    html += `<span style="font-size:32px;font-weight:bold;color:${pctColor};">${pct}%</span>`;
    html += `<span style="font-size:14px;color:#555555;margin-left:12px;">${done} / ${total} tasks completed</span>`;
    html += `</td></tr></table>`;

    html += `<table style="width:100%;border-collapse:collapse;margin-bottom:20px;"><tr>`;
    html += `<td style="text-align:center;padding:8px;background:#e8f5e9;border-radius:4px;"><b style="font-size:18px;color:#2e7d32;">${done}</b><br/><span style="font-size:11px;color:#666;">DONE</span></td>`;
    html += `<td style="width:6px;"></td>`;
    html += `<td style="text-align:center;padding:8px;background:#fff3e0;border-radius:4px;"><b style="font-size:18px;color:#e65100;">${inProg}</b><br/><span style="font-size:11px;color:#666;">IN PROGRESS</span></td>`;
    html += `<td style="width:6px;"></td>`;
    html += `<td style="text-align:center;padding:8px;background:#fafafa;border-radius:4px;"><b style="font-size:18px;color:#555;">${notStarted}</b><br/><span style="font-size:11px;color:#666;">NOT STARTED</span></td>`;
    html += `<td style="width:6px;"></td>`;
    html += `<td style="text-align:center;padding:8px;background:#ffebee;border-radius:4px;"><b style="font-size:18px;color:#c62828;">${blocking}</b><br/><span style="font-size:11px;color:#666;">BLOCKING</span></td>`;
    html += `</tr></table>`;

    html += `<table style="width:100%;border-collapse:collapse;font-size:13px;">`;
    html += `<tr style="background:${accent};color:#ffffff;"><th style="padding:8px 10px;text-align:left;font-weight:600;">Category</th><th style="padding:8px 6px;text-align:center;width:70px;">Progress</th><th style="padding:8px 6px;text-align:center;width:60px;">Status</th></tr>`;

    Object.keys(state.runbookData).filter(k => !k.startsWith("_")).forEach((cat, ci) => {
        const tasks = state.runbookData[cat];
        const d = tasks.filter(t => { const st = normalizeStatus(t.status); return st === "Completed" || st === "Unneeded"; }).length;
        const ip = tasks.filter(t => normalizeStatus(t.status) === "In Progress").length;
        const bl = tasks.filter(t => normalizeStatus(t.status) === "Blocking").length;
        const p = Math.round((d / tasks.length) * 100);
        const marker = bl > 0 ? "BLOCKING" : d === tasks.length ? "DONE" : ip > 0 ? "IN PROGRESS" : "NOT STARTED";
        const markerColor = bl > 0 ? '#c62828' : d === tasks.length ? '#2e7d32' : ip > 0 ? '#e65100' : '#888888';
        const rowBg = ci % 2 === 0 ? '#ffffff' : '#f9f9f9';

        html += `<tr style="background:${rowBg};border-bottom:1px solid #eeeeee;">`;
        html += `<td style="padding:7px 10px;font-weight:600;">${escapeHtml(cat)}</td>`;
        html += `<td style="padding:7px 6px;text-align:center;">${d}/${tasks.length} (${p}%)</td>`;
        html += `<td style="padding:7px 6px;text-align:center;"><span style="background:${markerColor};color:#ffffff;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;">${marker}</span></td>`;
        html += `</tr>`;

        tasks.forEach(t => {
            const s = normalizeStatus(t.status);
            if (s !== "Completed" && s !== "Unneeded") {
                const sColor = s === "In Progress" ? '#e65100' : s === "Blocking" ? '#c62828' : '#888888';
                const sIcon = s === "In Progress" ? '▶' : s === "Blocking" ? '✕' : '•';
                const firstLine = t.task.split("\n")[0];
                const time = t.startTime ? formatTimeShort(t.startTime) : '';
                const who = t.assignee || '';
                html += `<tr style="background:${rowBg};border-bottom:1px solid #f5f5f5;">`;
                html += `<td style="padding:3px 10px 3px 30px;color:#555;font-size:12px;"><span style="color:${sColor};">${sIcon}</span> ${escapeHtml(firstLine)}`;
                if (who) html += ` <span style="color:#888;font-style:italic;">@${escapeHtml(who)}</span>`;
                html += `</td>`;
                html += `<td style="padding:3px 6px;text-align:center;font-size:11px;color:#888;">${time}</td>`;
                html += `<td style="padding:3px 6px;text-align:center;"><span style="color:${sColor};font-size:11px;font-weight:600;">${s.toUpperCase()}</span></td>`;
                html += `</tr>`;
            }
        });
    });
    html += `</table>`;

    const openIss = state.issues.filter(i => i.issueStatus === "Ongoing");
    const closedIss = state.issues.filter(i => i.issueStatus === "Closed");
    if (state.issues.length > 0) {
        html += `<div style="margin-top:20px;border-top:2px solid ${accent};padding-top:12px;">`;
        html += `<div style="font-size:14px;font-weight:bold;color:${accent};margin-bottom:10px;">Issues Log (${openIss.length} open, ${closedIss.length} closed)</div>`;
        html += `<table style="width:100%;border-collapse:collapse;font-size:12px;">`;

        const renderIssueRows = (list, label) => {
            if (list.length === 0) return;
            html += `<tr><td colspan="4" style="padding:6px 10px;font-weight:bold;color:#555;background:#f5f5f5;font-size:11px;text-transform:uppercase;letter-spacing:1px;">${label}</td></tr>`;
            list.forEach(iss => {
                const isBlk = iss.severity === "Blocking";
                const sevColor = isBlk ? '#c62828' : '#e65100';
                html += `<tr style="border-bottom:1px solid #eeeeee;">`;
                html += `<td style="padding:5px 10px;width:4px;background:${sevColor};">&nbsp;</td>`;
                html += `<td style="padding:5px 10px;">${escapeHtml(iss.description)}</td>`;
                html += `<td style="padding:5px 8px;text-align:center;white-space:nowrap;"><span style="background:${sevColor};color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;">${isBlk ? 'BLOCKING' : 'NON-BLOCKING'}</span></td>`;
                html += `<td style="padding:5px 8px;text-align:right;white-space:nowrap;color:#888;font-size:11px;">${escapeHtml(iss.time || '')}</td>`;
                html += `</tr>`;
            });
        };
        renderIssueRows(openIss, 'Ongoing');
        renderIssueRows(closedIss, 'Closed');
        html += `</table></div>`;
    }

    html += `<div style="margin-top:16px;padding-top:8px;border-top:1px solid #dddddd;font-size:11px;color:#aaaaaa;text-align:center;">Generated from Runbook Dashboard — ${escapeHtml(state.projectConfig.client || '')}</div>`;
    html += `</div>`;

    box.innerHTML = `
        <div class="summary-toolbar">
            <button class="copy-btn" onclick="copySummaryToClipboard()">Copy to Clipboard</button>
            <button onclick="document.getElementById('summaryBox').style.display='none'">Close</button>
        </div>
        <div class="summary-body" id="summaryBody">${html}</div>
    `;
    box.style.display = "block";
    box.scrollIntoView({ behavior: "smooth" });
}

/**
 * Copy the rendered summary HTML to the clipboard (for pasting into Outlook).
 * @param {function} showToast
 */
export function copySummaryToClipboard(showToast) {
    const body = document.getElementById("summaryBody");
    const htmlContent = body.innerHTML;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const item = new ClipboardItem({ 'text/html': blob, 'text/plain': new Blob([body.innerText], { type: 'text/plain' }) });
    navigator.clipboard.write([item]).then(() => {
        showToast("Summary copied — paste into Outlook!");
    }).catch(() => {
        const range = document.createRange();
        range.selectNodeContents(body);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('copy');
        sel.removeAllRanges();
        showToast("Summary copied (fallback)");
    });
}
