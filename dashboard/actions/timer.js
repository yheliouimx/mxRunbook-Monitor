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
 * Stop the timer entirely and clear all run state.
 */
export function stopTimer() {
    state.runStart       = null;
    state.pausedDuration = 0;
    state.pauseStart     = null;
    state.timerState     = "stopped";
    saveTimerState();
}

/**
 * Calculate elapsed milliseconds, accounting for pauses.
 * Returns 0 if the timer has never been started.
 */
export function getElapsedMs() {
    if (!state.runStart || state.timerState === "stopped") return 0;
    const now = state.timerState === "paused" ? state.pauseStart : Date.now();
    return now - state.runStart - state.pausedDuration;
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
