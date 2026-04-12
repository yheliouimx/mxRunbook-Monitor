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
