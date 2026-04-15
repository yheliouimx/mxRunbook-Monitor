/**
 * export/finalReport.js — Public entry point for the Post-Event Summary Report.
 *
 * Orchestrates data collection from state/selectors/history and delegates
 * rendering to the sub-modules in export/finalReport/.
 *
 * Usage (from app.js):
 *   import { exportFinalReport } from "./export/finalReport.js";
 *   await exportFinalReport(showToast);
 */

import { state }                          from "../state.js";
import { getExportStats, getProjectInfo,
         getExportCategories,
         getExportIssues }                from "./shared.js";
import { getSnapshots, recordSnapshot }   from "../history.js";
import { buildAssigneeStats }             from "./finalReport/helpers.js";
import { buildHTML }                      from "./finalReport/htmlReport.js";

/**
 * Generate and download the post-event summary report as a self-contained
 * HTML file. Takes a snapshot immediately before rendering so the report
 * always reflects the latest state.
 * @param {Function} [showToast]
 */
export async function exportFinalReport(showToast) {
    // Take one last snapshot so the burndown ends at "now"
    recordSnapshot();

    const snapshots    = getSnapshots();
    const stats        = getExportStats();
    const projectInfo  = getProjectInfo();
    const categories   = getExportCategories();
    const assignees    = buildAssigneeStats(categories);
    const currentHealth = state.healthStatus || "Green";
    const { displayList: issues } = getExportIssues("all");

    const html = buildHTML({
        projectInfo,
        stats,
        snapshots,
        assignees,
        categories,
        issues,
        currentHealth,
    });

    // Download the report
    const blob    = new Blob([html], { type: "text/html; charset=utf-8" });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement("a");
    a.href        = url;
    const safeName = (projectInfo.projectName || "Runbook").replace(/[^a-z0-9]/gi, "-");
    a.download    = `FinalReport-${safeName}-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);

    if (showToast) showToast("Final report downloaded");
}
