/**
 * Export color themes — dark (phone) and light (email/gantt) surfaces.
 * Single source of truth for health, status, and gradient colors in exports.
 */

// ── Health colors by surface ──

export const HEALTH_DARK = {
    Green: { color: "#39ff14", bg: "#0a3a0a", border: "#39ff14", label: "ON TRACK" },
    Amber: { color: "#ffa500", bg: "#3a2a00", border: "#ffa500", label: "AT RISK" },
    Red:   { color: "#ff3333", bg: "#3a0a0a", border: "#ff3333", label: "ROLLBACK" },
};

export const HEALTH_LIGHT = {
    Green: { color: "#2e7d32", bg: "#e8f5e9", border: "#2e7d32", label: "ON TRACK" },
    Amber: { color: "#e65100", bg: "#fff3e0", border: "#e65100", label: "AT RISK" },
    Red:   { color: "#c62828", bg: "#ffebee", border: "#c62828", label: "ROLLBACK" },
};

// ── Progress bar gradient colors by health status ──

export const PROGRESS_GRADIENT_DARK = {
    Green: ["#39ff14", "#5bc0ff"],
    Amber: ["#ffd700", "#ff8c00"],
    Red:   ["#ff8c00", "#ff1744"],
};

export const PROGRESS_GRADIENT_LIGHT = {
    Green: ["#2e7d32", "#1565c0"],
    Amber: ["#f9a825", "#e65100"],
    Red:   ["#e65100", "#c62828"],
};

// ── Category status colors (dark surface — phone) ──

export const CAT_STATUS_DARK = {
    done:        { bg: "#0d2d0d", border: "#1a5a1a", dot: "#39ff14", text: "#7bff7b" },
    inprogress:  { bg: "#2d2500", border: "#5a4a00", dot: "#ffd84a", text: "#ffd84a" },
    notstarted:  { bg: "#2a0a0a", border: "#5a1a1a", dot: "#ff6b6b", text: "#ff8888" },
    blocked:     { bg: "#2a0a0a", border: "#5a1a1a", dot: "#ff6b6b", text: "#ff8888" },
    unneeded:    { bg: "#1a1a1a", border: "#333333", dot: "#666666", text: "#888888" },
};

// ── Category status colors (light surface — email/gantt) ──

export const CAT_STATUS_LIGHT = {
    done:        { bg: "#e8f5e9", border: "#a5d6a7", dot: "#2e7d32", text: "#2e7d32" },
    inprogress:  { bg: "#fff8e1", border: "#ffe082", dot: "#e65100", text: "#e65100" },
    notstarted:  { bg: "#ffebee", border: "#ef9a9a", dot: "#c62828", text: "#c62828" },
    blocked:     { bg: "#ffebee", border: "#ef9a9a", dot: "#c62828", text: "#c62828" },
    unneeded:    { bg: "#f5f5f5", border: "#e0e0e0", dot: "#9e9e9e", text: "#9e9e9e" },
};

// ── Stat card colors per surface ──

export const STAT_COLORS_DARK = {
    total: "#ffffff", done: "#39ff14", inProg: "#ffd84a", notStarted: "#ff6b6b",
    openIssues: "#ff9944", blocking: "#ff3333",
};

export const STAT_COLORS_LIGHT = {
    total: "#1a1a2e", done: "#2e7d32", inProg: "#e65100", notStarted: "#c62828",
    openIssues: "#e65100", blocking: "#c62828",
};

// ── Gantt bar colors ──

export const GANTT_BAR = {
    done:       { fill: "#c8e6c9", border: "#a5d6a7", gradFrom: "#43a047", gradTo: "#66bb6a" },
    inprogress: { fill: "#ffe0b2", border: "#ffcc80", gradFrom: "#2e7d32", gradTo: "#43a047" },
    notstarted: { fill: "#ffcdd2", border: "#ef9a9a", gradFrom: "#2e7d32", gradTo: "#43a047" },
    blocked:    { fill: "#ffcdd2", border: "#ef9a9a", gradFrom: "#c62828", gradTo: "#e53935" },
    unneeded:   { fill: "#f5f5f5", border: "#e0e0e0", gradFrom: "#9e9e9e", gradTo: "#bdbdbd" },
};
