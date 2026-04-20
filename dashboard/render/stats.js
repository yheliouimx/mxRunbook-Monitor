import { state } from "../state.js";
import { HEALTH_META, statusLabel, STATUS } from "../constants.js";
import { getGlobalStats, getCompletionPct, getOpenIssues, getBlockingIssues,
         getTimeDelta, getHealthAdvisory } from "../selectors.js";
import { getElapsedMs, formatElapsed } from "../actions/timer.js";

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
                    <div class="stat-card inprog"><div class="stat-value">${inProg}</div><div class="stat-label">IN PROGRESS</div></div>
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

// ── Sentinel Strip (replaces old timer stat card) ──────────

/**
 * Tick update for the Sentinel Strip — patches timer, progress bars, delta,
 * and health advisory every second. Called via setInterval in app.js.
 */
export function updateSentinelBar() {
    const strip = document.getElementById('sentinelBar');
    if (!strip) return;

    const ts = state.timerState;

    // Timer state class drives left-border color via CSS
    strip.classList.remove('sentinel-stopped', 'sentinel-running', 'sentinel-paused');
    strip.classList.add('sentinel-' + ts);

    // ── Elapsed + status label ──
    const elapsedEl = document.getElementById('sentinelElapsed');
    const statusEl  = document.getElementById('sentinelTimerStatus');
    if (elapsedEl) {
        const txt = ts === 'stopped' ? '—' : formatElapsed(getElapsedMs());
        if (elapsedEl.textContent !== txt) elapsedEl.textContent = txt;
    }
    if (statusEl) {
        const txt = ts === 'running' ? 'Running…' : ts === 'paused' ? 'Paused' : 'Run Timer';
        if (statusEl.textContent !== txt) statusEl.textContent = txt;
    }

    // ── Control buttons ──
    const startBtn = document.getElementById('sentinelStartBtn');
    const pauseBtn = document.getElementById('sentinelPauseBtn');
    const stopBtn  = document.getElementById('sentinelStopBtn');
    if (startBtn) {
        const label = ts === 'paused' ? '▶ Resume' : '▶ Start Run';
        if (startBtn.textContent !== label) startBtn.textContent = label;
        startBtn.classList.toggle('hidden', ts === 'running');
    }
    if (pauseBtn) pauseBtn.classList.toggle('hidden', ts !== 'running');
    if (stopBtn)  stopBtn.classList.toggle('hidden',  ts === 'stopped');

    // ── Phase 2: Progress bars + delta ──
    const delta = getTimeDelta();
    const progressBlock = document.getElementById('sentinelProgressBlock');
    const deltaEl       = document.getElementById('sentinelDelta');
    const timeRow       = document.getElementById('sentinelTimeRow');

    // Show progress block whenever timer is active (running/paused), even without estimation data.
    // The Done bar only needs completion %; the Time bar requires estimatedEnd coverage.
    const showProgress = ts !== 'stopped' || delta !== null;
    if (progressBlock) progressBlock.classList.toggle('hidden', !showProgress);

    if (showProgress) {
        const completionPct = delta ? delta.completionPct : getCompletionPct();
        _setIfChanged('sentinelDoneFill', null, completionPct + '%');
        _setIfChanged('sentinelDonePct', completionPct + '%');
    }

    // Time bar: only visible when estimation data is available
    if (timeRow) timeRow.classList.toggle('hidden', !delta);
    if (delta) {
        _setIfChanged('sentinelTimeFill', null, delta.timeProgressPct + '%');
        _setIfChanged('sentinelTimePct', delta.timeProgressPct + '%');
    }

    if (deltaEl) {
        if (delta) {
            const d = delta.deltaPct;
            let cls, text;
            if (d > 5)        { cls = 'ahead';   text = '+' + d + '% ahead'; }
            else if (d >= -10) { cls = 'ontrack'; text = (d >= 0 ? '+' : '') + d + '% on track'; }
            else if (d >= -25) { cls = 'atrisk';  text = d + '% at risk'; }
            else               { cls = 'delayed'; text = d + '% delayed'; }
            deltaEl.className = 'sentinel-delta ' + cls;
            if (deltaEl.textContent !== text) deltaEl.textContent = text;
        } else {
            deltaEl.className = 'sentinel-delta hidden';
        }
    }

    // ── Phase 3: Health advisory ──
    const advisory = ts !== 'stopped' ? getHealthAdvisory() : null;

    // Override strip accent color with advisory color when active
    if (advisory) {
        strip.style.setProperty('--sentinel-color', `var(--health-${advisory.toLowerCase()})`);
    } else {
        strip.style.removeProperty('--sentinel-color');
    }

    const advisoryBlock = document.getElementById('sentinelAdvisoryBlock');
    const advisoryLabel = document.getElementById('sentinelAdvisoryLabel');
    const acceptBtn     = document.getElementById('sentinelAcceptBtn');
    const showAdvisory  = advisory !== null && advisory !== state.healthStatus;

    if (advisoryBlock) advisoryBlock.classList.toggle('hidden', !showAdvisory);
    if (showAdvisory && advisoryLabel) {
        const txt = '⚠ Auto: ' + advisory;
        if (advisoryLabel.textContent !== txt) advisoryLabel.textContent = txt;
        advisoryLabel.className = 'sentinel-advisory-label ' + advisory.toLowerCase();
    }
    if (acceptBtn) acceptBtn.classList.toggle('hidden', !showAdvisory);
}

function _setIfChanged(id, text, width) {
    const el = document.getElementById(id);
    if (!el) return;
    if (width !== undefined && el.style.width !== width) el.style.width = width;
    if (text  !== null     && el.textContent !== text)   el.textContent = text;
}
