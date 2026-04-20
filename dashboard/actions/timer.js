// ============================================================
// actions/timer.js — Run timer: start, pause, resume, stop
// ============================================================

import { state } from "../state.js";
import { saveTimerState } from "../persistence.js";

/**
 * Start a fresh timer run. Resets any existing timer state.
 */
export function startTimer() {
    state.runStart       = Date.now();
    state.pausedDuration = 0;
    state.pauseStart     = null;
    state.stoppedAt      = null;
    state.timerState     = "running";
    saveTimerState();
}

/**
 * Pause a running timer. Records the start of the pause window.
 */
export function pauseTimer() {
    if (state.timerState !== "running") return;
    state.pauseStart = Date.now();
    state.timerState = "paused";
    saveTimerState();
}

/**
 * Resume a paused timer. Accumulates the pause duration.
 */
export function resumeTimer() {
    if (state.timerState !== "paused") return;
    state.pausedDuration += Date.now() - state.pauseStart;
    state.pauseStart     = null;
    state.timerState     = "running";
    saveTimerState();
}

/**
 * Stop the timer. Freezes the final elapsed time via stoppedAt.
 * The timer is now permanently ended — only a full runbook reset clears it.
 */
export function stopTimer() {
    if (state.timerState === "paused") {
        // Accumulate the current pause before stopping
        state.pausedDuration += Date.now() - state.pauseStart;
        state.pauseStart = null;
    }
    state.stoppedAt  = Date.now();
    state.timerState = "stopped";
    saveTimerState();
}

/**
 * Calculate elapsed milliseconds, accounting for pauses.
 * - stopped with stoppedAt: returns frozen final value
 * - stopped without stoppedAt: never started, returns 0
 * - paused: returns frozen value at pause point
 * - running: returns live value
 */
export function getElapsedMs() {
    if (!state.runStart) return 0;
    if (state.timerState === "stopped") {
        // Frozen final time (go-live ended)
        return state.stoppedAt - state.runStart - state.pausedDuration;
    }
    if (state.timerState === "paused") {
        return state.pauseStart - state.runStart - state.pausedDuration;
    }
    // running
    return Date.now() - state.runStart - state.pausedDuration;
}

/**
 * Format milliseconds as HH:MM:SS.
 * @param {number} ms
 * @returns {string}
 */
export function formatElapsed(ms) {
    if (ms <= 0) return "00:00:00";
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return String(h).padStart(2, "0") + ":" +
           String(m).padStart(2, "0") + ":" +
           String(s).padStart(2, "0");
}
