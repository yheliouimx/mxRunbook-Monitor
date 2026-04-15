/**
 * finalReport/htmlReport.js
 * Assembles the full self-contained HTML report from pre-built SVG/data blocks.
 */

import { HEALTH_META } from "../../constants.js";
import { esc, ISSUE_STATUS, ISSUE_SEVERITY } from "./helpers.js";
import { buildHealthTimelineSVG } from "./svgHealth.js";
import { buildBurndownSVG }       from "./svgBurndown.js";
import { buildGanttSVG }          from "./svgGantt.js";

// ── Internal section builders ─────────────────────────────

function buildStatsSection({ total, done, inProg, notStarted, totalBlocking, openIssues, pct }) {
    const pctColor = pct >= 100 ? "#16a34a" : pct >= 50 ? "#3b82f6" : "#f59e0b";
    const card = (val, label, color) =>
        `<div class="stat"><div class="v" style="color:${color}">${val}</div><div class="l">${esc(label)}</div></div>`;
    return `<section>
  <h2>Summary Statistics</h2>
  <div class="stats-row">
    ${card(total,        "Total",       "#334155")}
    ${card(done,         "Done",        "#16a34a")}
    ${card(inProg,       "In Progress", "#3b82f6")}
    ${card(notStarted,   "Not Started", "#94a3b8")}
    ${card(totalBlocking,"Blocking",    "#ef4444")}
    ${card(openIssues,   "Open Issues", "#f59e0b")}
    ${card(pct + "%",    "Complete",    pctColor)}
  </div>
</section>`;
}

function buildHealthSection(snapshots, currentHealth) {
    const svg  = buildHealthTimelineSVG(snapshots, currentHealth);
    const note = snapshots.length > 0
        ? `<p class="note">Each segment shows the recorded health status. Green\u00a0= On\u00a0Track, Amber\u00a0= At\u00a0Risk, Red\u00a0= Rollback.</p>`
        : "";
    return `<section>
  <h2>Health Timeline</h2>
  <div class="svg-wrap">${svg}</div>${note}
</section>`;
}

function buildBurndownSection(snapshots) {
    const svg  = buildBurndownSVG(snapshots);
    const note = snapshots.length >= 2
        ? `<p class="note">Background colour reflects health status at each interval. Auto-snapshots recorded every 15\u00a0min.</p>`
        : "";
    return `<section>
  <h2>Completion Burndown</h2>
  <div class="svg-wrap">${svg}</div>${note}
</section>`;
}

function buildGanttSection(categories) {
    const content = buildGanttSVG(categories);
    return `<section>
  <h2>Task Timeline (Gantt)</h2>
  <div class="svg-wrap">${content}</div>
  <div class="legend">
    <span><span class="dot" style="background:#22c55e"></span>Done</span>
    <span><span class="dot" style="background:#3b82f6"></span>In Progress</span>
    <span><span class="dot" style="background:#ef4444"></span>Blocking</span>
    <span><span class="dot" style="background:#94a3b8"></span>Not Started</span>
    <span><span class="dot bar"></span>Planned End</span>
    <span><span class="dot bar" style="background:#ef4444"></span>NOW</span>
  </div>
</section>`;
}

function buildAssigneeSection(assignees) {
    const rows = assignees.length === 0
        ? `<tr><td colspan="6" class="no-data">No assignee data in runbook.</td></tr>`
        : assignees.map((a, i) => {
            const bg = i % 2 === 0 ? "#f8fafc" : "#fff";
            return [
                `<tr style="background:${bg}">`,
                `<td style="padding:8px 12px;font-weight:500;color:#334155">${esc(a.name)}</td>`,
                `<td class="tc">${a.assigned}</td>`,
                `<td class="tc" style="color:#16a34a;font-weight:600">${a.done}</td>`,
                `<td class="tc" style="color:#3b82f6">${a.inProg}</td>`,
                `<td class="tc" style="color:#ef4444">${a.blocking}</td>`,
                `<td class="tc" style="color:${a.overruns > 0 ? "#f59e0b" : "#94a3b8"};font-weight:${a.overruns > 0 ? "600" : "400"}">`,
                `${a.overruns > 0 ? "+" + a.overruns : "\u2014"}</td>`,
                `</tr>`,
            ].join("");
        }).join("");

    return `<section>
  <h2>Per-Assignee Summary</h2>
  <table>
    <thead><tr>
      <th>Assignee</th>
      <th style="text-align:center">Assigned</th>
      <th style="text-align:center">Done</th>
      <th style="text-align:center">In Progress</th>
      <th style="text-align:center">Blocking</th>
      <th style="text-align:center">Overruns</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function buildIssuesSection(issues) {
    const openList   = issues.filter(i => i.issueStatus === ISSUE_STATUS.ONGOING);
    const closedList = issues.filter(i => i.issueStatus === ISSUE_STATUS.CLOSED);
    const all        = [...openList, ...closedList];

    const rows = all.length === 0
        ? `<tr><td colspan="3" class="no-data">No issues logged during this event.</td></tr>`
        : all.map((iss, i) => {
            const isBlocking = iss.severity === ISSUE_SEVERITY.BLOCKING;
            const isClosed   = iss.issueStatus === ISSUE_STATUS.CLOSED;
            const bg         = i % 2 === 0 ? "#f8fafc" : "#fff";
            const sevBg      = isBlocking ? "#fee2e2" : "#fef3c7";
            const sevCol     = isBlocking ? "#dc2626" : "#d97706";
            const stBg       = isClosed   ? "#f1f5f9" : "#dcfce7";
            const stCol      = isClosed   ? "#94a3b8" : "#16a34a";
            return [
                `<tr style="background:${bg}">`,
                `<td style="padding:8px 12px;white-space:nowrap">`,
                `<span class="badge" style="background:${sevBg};color:${sevCol}">${esc(iss.severity || "Non-Blocking")}</span></td>`,
                `<td style="padding:8px 12px;color:#334155">${esc(iss.description || "")}</td>`,
                `<td style="padding:8px 12px;white-space:nowrap">`,
                `<span class="badge" style="background:${stBg};color:${stCol}">${esc(iss.issueStatus || "Ongoing")}</span></td>`,
                `</tr>`,
            ].join("");
        }).join("");

    return `<section>
  <h2>Issues Log</h2>
  <table>
    <thead><tr><th>Severity</th><th>Description</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

// ── CSS ───────────────────────────────────────────────────

function buildCSS(accent, healthMeta) {
    return `<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f1f5f9;color:#1e293b;line-height:1.5;font-size:14px}
.page{max-width:960px;margin:0 auto;padding:24px 16px 56px}
.rpt-header{background:${accent};color:#fff;border-radius:10px;padding:22px 28px;margin-bottom:20px}
.rpt-header h1{font-size:1.4rem;font-weight:700;margin-bottom:2px}
.rpt-header .sub{opacity:.75;font-size:.85rem;margin-bottom:10px}
.rpt-header .hrow{display:flex;align-items:flex-start;gap:12px}
.rpt-header .meta{display:flex;flex-wrap:wrap;gap:16px;margin-top:10px}
.rpt-header .meta span{font-size:.78rem;opacity:.7}
.health-badge{display:inline-block;padding:4px 14px;border-radius:20px;font-size:.78rem;font-weight:700;
  background:${healthMeta.colorLight}33;color:${healthMeta.colorLight};border:1px solid ${healthMeta.colorLight}}
section{background:#fff;border-radius:10px;padding:22px 24px;margin-bottom:18px;box-shadow:0 1px 3px rgba(0,0,0,.07)}
section h2{font-size:.82rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.07em;
  margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #f1f5f9}
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:10px}
.stat{background:#f8fafc;border-radius:8px;padding:14px 10px;text-align:center}
.stat .v{font-size:1.9rem;font-weight:800;line-height:1}
.stat .l{font-size:.72rem;color:#64748b;margin-top:3px;text-transform:uppercase;letter-spacing:.04em}
.svg-wrap{overflow-x:auto;border-radius:8px;background:#f8fafc}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th{background:#f1f5f9;padding:9px 12px;text-align:left;font-size:.75rem;font-weight:700;
  color:#475569;text-transform:uppercase;letter-spacing:.05em}
td{border-top:1px solid #f1f5f9}
.tc{text-align:center;padding:8px 12px}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.75rem;font-weight:700}
.no-data{text-align:center;color:#94a3b8;padding:20px;font-size:.9rem}
.note{margin-top:8px;font-size:.75rem;color:#94a3b8}
.legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;font-size:.78rem;color:#64748b;align-items:center}
.legend span{display:flex;align-items:center;gap:5px}
.dot{display:inline-block;width:12px;height:12px;border-radius:2px}
.dot.bar{width:2px;height:14px;border-radius:0;background:#f59e0b}
footer{text-align:center;color:#94a3b8;font-size:.75rem;margin-top:32px}
</style>`;
}

// ── Main assembler ────────────────────────────────────────

/**
 * Build the complete self-contained HTML report string.
 * @param {{projectInfo, stats, snapshots, assignees, categories, issues, currentHealth}} data
 * @returns {string} full HTML document
 */
export function buildHTML(data) {
    const { projectInfo, stats, snapshots, assignees, categories, issues, currentHealth } = data;
    const accent     = projectInfo.accentColor || "#003a2d";
    const healthMeta = HEALTH_META[currentHealth] || HEALTH_META["Green"];

    const nowStr = new Date().toLocaleString("en-GB", {
        weekday: "short", day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
    });

    const subtitle = [
        projectInfo.client, projectInfo.environment,
        projectInfo.release, projectInfo.subtitle, projectInfo.changeRef,
    ].filter(Boolean).join(" | ");

    const snapshotNote = snapshots.length > 0
        ? `<span>${snapshots.length} snapshot${snapshots.length !== 1 ? "s" : ""} recorded</span>`
        : "";
    const refNote = projectInfo.changeRef
        ? `<span>Ref: ${esc(projectInfo.changeRef)}</span>` : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Final Report \u2014 ${esc(projectInfo.projectName)}</title>
${buildCSS(accent, healthMeta)}
</head>
<body>
<div class="page">

<div class="rpt-header">
  <div class="hrow">
    <div style="flex:1">
      <h1>${esc(projectInfo.projectName)} \u2014 Post-Event Report</h1>
      ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ""}
    </div>
    <span class="health-badge">${esc(healthMeta.label)}</span>
  </div>
  <div class="meta">
    <span>Generated: ${esc(nowStr)}</span>
    ${refNote}
    ${snapshotNote}
  </div>
</div>

${buildStatsSection(stats)}
${buildHealthSection(snapshots, currentHealth)}
${buildBurndownSection(snapshots)}
${buildGanttSection(categories)}
${buildAssigneeSection(assignees)}
${buildIssuesSection(issues)}

<footer>mxRunbook-Monitor \u2014 Post-Event Summary Report \u2014 ${esc(nowStr)}</footer>
</div>
</body>
</html>`;
}
