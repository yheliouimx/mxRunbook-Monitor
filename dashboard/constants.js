// STATUS — internal data values, must match runbook.json
export const STATUS = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS:  "In Progress",
  COMPLETED:    "Completed",
  BLOCKING:     "Blocking",
  UNNEEDED:     "Unneeded",
};

// STATUS_LABELS — what the UI shows (Blocking → "Blocked" in display)
export const STATUS_LABELS = {
  "Not Started": "Not Started",
  "In Progress": "In Progress",
  "Completed":   "Completed",
  "Blocking":    "Blocked",
  "Unneeded":    "Unneeded",
};

// HEALTH_META — labels used in renderHealthIndicator(), export* (3 duplicates today)
export const HEALTH_META = {
  Green: { label: "ON TRACK", color: "#39ff14", bg: "#0a3a0a", border: "#39ff14",
           colorLight: "#2e7d32", bgLight: "#e8f5e9" },
  Amber: { label: "AT RISK",  color: "#ffa500", bg: "#3a2a00", border: "#ffa500",
           colorLight: "#e65100", bgLight: "#fff3e0" },
  Red:   { label: "ROLLBACK", color: "#ff3333", bg: "#3a0a0a", border: "#ff3333",
           colorLight: "#c62828", bgLight: "#ffebee" },
};

// RESERVED_KEYS — never iterated as categories
export const RESERVED_KEYS = {
  issues: "_issues",
  health: "_health",
};

// DEFAULT_PROJECT_CONFIG — matches current inline default in projectConfig
export const DEFAULT_PROJECT_CONFIG = {
  projectName: "Go-Live Runbook",
  subtitle:    "",
  changeRef:   "",
  client:      "",
  environment: "",
  release:     "",
  accentColor: "#003a2d",
};

// SORT_MODES
export const SORT_MODES = {
  TIMELINE:   "timeline",
  COMPLETION: "completion",
  ALPHA:      "alpha",
};

// EXPORT_FILTERS
export const EXPORT_FILTERS = {
  OPEN: "open",
  ALL:  "all",
};

// HEALTH_STATUSES
export const HEALTH_STATUSES = ["Green", "Amber", "Red"];
