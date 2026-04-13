import { state } from "../state.js";
import { HEALTH_META, statusLabel, STATUS } from "../constants.js";
import { getGlobalStats, getCompletionPct, getOpenIssues, getBlockingIssues } from "../selectors.js";

export function renderHealthIndicator() {
    document.querySelectorAll('.health-dot').forEach(d => {
        d.classList.toggle('active', d.dataset.health === state.healthStatus);
    });
    const ht = document.getElementById('healthText');
    ht.textContent = (HEALTH_META[state.healthStatus] || {}).label || state.healthStatus;
    ht.className = 'health-text ' + state.healthStatus.toLowerCase();
    const clockEl = document.getElementById('clock');
    const clockColorMap = { Green: 'var(--color-success)', Amber: 'var(--color-warning)', Red: 'var(--color-danger)' };
    clockEl.style.color = clockColorMap[state.healthStatus] || clockColorMap.Green;
    // Update health-based class on stats-master without full rebuild
    const master = document.querySelector('.stats-master');
    if (master) {
        master.className = master.className.replace(/\bhealth-\w+/g, '').trim()
            + ' health-' + (state.healthStatus || 'Green').toLowerCase();
    }
}

export function renderGlobalStats() {
    const { total, done, inProg, notStarted, blocking } = getGlobalStats();
    const pct = getCompletionPct();
    const openIss = getOpenIssues().length;
    const blockIss = getBlockingIssues().length;
    const totalBlocking = blocking + blockIss;
    const healthClass = 'health-' + (state.healthStatus || 'Green').toLowerCase();
    document.getElementById("globalStats").innerHTML = `
        <div class="stats-master ${healthClass}">
            <div class="progress-fill" style="width:${pct}%"></div>
            <div class="progress-text">
                <div class="master-pct">${pct}%</div>
                <div>
                    <div class="master-detail">${done} / ${total} tasks completed</div>
                    <div class="master-label">Overall Completion</div>
                </div>
            </div>
        </div>
        <div class="stats-groups">
            <div style="flex:1">
                <div class="stats-group-label">Tasks</div>
                <div class="stats-group">
                    <div class="stat-card total"><div class="stat-value">${total}</div><div class="stat-label">Total</div></div>
                    <div class="stat-card done"><div class="stat-value">${done}</div><div class="stat-label">Done</div></div>
                    <div class="stat-card inprog"><div class="stat-value">${inProg}</div><div class="stat-label">In Prog</div></div>
                    <div class="stat-card notstarted"><div class="stat-value">${notStarted}</div><div class="stat-label">Not Started</div></div>
                </div>
            </div>
            <div style="flex:0 0 auto">
                <div class="stats-group-label">Issues</div>
                <div class="stats-group">
                    <div class="stat-card issues"><div class="stat-value">${openIss}</div><div class="stat-label">Open</div></div>
                    <div class="stat-card blocking"><div class="stat-value">${totalBlocking}</div><div class="stat-label">${statusLabel(STATUS.BLOCKING)}</div></div>
                </div>
            </div>
        </div>
    `;
    renderHealthIndicator();
}

/**
 * Patch stat values in-place without rebuilding the entire #globalStats DOM.
 * Only updates text content of .stat-value cells that actually changed,
 * plus the master progress bar.
 */
export function updateStatsValues() {
    const { total, done, inProg, notStarted, blocking } = getGlobalStats();
    const pct = getCompletionPct();
    const openIss = getOpenIssues().length;
    const blockIss = getBlockingIssues().length;
    const totalBlocking = blocking + blockIss;
    const gs = document.getElementById("globalStats");
    const vals = { blocking: totalBlocking, issues: openIss, total, done, inprog: inProg, notstarted: notStarted };
    Object.keys(vals).forEach(sel => {
        const el = gs.querySelector(`.stat-card.${sel} .stat-value`);
        if (el && el.textContent !== String(vals[sel])) el.textContent = vals[sel];
    });
    const fill = gs.querySelector('.progress-fill');
    if (fill) { const w = pct + '%'; if (fill.style.width !== w) fill.style.width = w; }
    const masterPct = gs.querySelector('.master-pct');
    if (masterPct) { const t = pct + '%'; if (masterPct.textContent !== t) masterPct.textContent = t; }
    const masterDetail = gs.querySelector('.master-detail');
    if (masterDetail) { const t = done + ' / ' + total + ' tasks completed'; if (masterDetail.textContent !== t) masterDetail.textContent = t; }
}
