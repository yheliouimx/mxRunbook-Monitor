import { DEFAULT_PROJECT_CONFIG, EXPORT_FILTERS } from "./constants.js";

export const state = {
  // Runbook data
  runbookData:    {},
  projectConfig:  { ...DEFAULT_PROJECT_CONFIG },

  // UI filters
  filterState:    "all",
  searchQuery:    "",
  teamFilter:     "all",
  systemFilter:   "all",
  sortMode:       "timeline",
  openCategories: new Set(),

  // Health & issues
  healthStatus:   "Green",
  issues:         [],

  // Issue form UI state
  issueFormOpen:   false,
  issuesPanelOpen: true,
  editingIssueId:  null,

  // Export options
  phoneExportIssueFilter: EXPORT_FILTERS.OPEN,
  emailExportIssueFilter: EXPORT_FILTERS.OPEN,

  // Assets (set by detectAssets())
  clientLogoImg: null,
  clientBgImg:   null,

  // Run timer
  runStart:       null,   // ms timestamp (Date.now()) when run was started
  pausedDuration: 0,      // accumulated pause time in ms
  pauseStart:     null,   // ms timestamp when current pause began
  stoppedAt:      null,   // ms timestamp when Stop was clicked — freezes final elapsed time
  timerState:     "stopped", // "stopped" | "running" | "paused"
};
