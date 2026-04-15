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
};
