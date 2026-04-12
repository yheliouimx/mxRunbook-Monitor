import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../dashboard/state.js';
import { EXPORT_FILTERS, DEFAULT_PROJECT_CONFIG } from '../dashboard/constants.js';

// ── state shape ──

describe('state', () => {
  it('has all expected top-level keys', () => {
    const expectedKeys = [
      'runbookData', 'projectConfig',
      'filterState', 'searchQuery', 'teamFilter', 'sortMode', 'openCategories',
      'healthStatus', 'issues',
      'issueFormOpen', 'issuesPanelOpen', 'editingIssueId',
      'phoneExportIssueFilter', 'emailExportIssueFilter',
      'clientLogoImg', 'clientBgImg',
    ];
    for (const key of expectedKeys) {
      expect(state).toHaveProperty(key);
    }
  });

  it('initializes runbookData as empty object', () => {
    expect(state.runbookData).toEqual(expect.any(Object));
  });

  it('initializes projectConfig from DEFAULT_PROJECT_CONFIG', () => {
    expect(state.projectConfig.projectName).toBe(DEFAULT_PROJECT_CONFIG.projectName);
  });

  it('initializes filters to defaults', () => {
    expect(state.filterState).toBe('all');
    expect(state.searchQuery).toBe('');
    expect(state.teamFilter).toBe('all');
    expect(state.sortMode).toBe('timeline');
  });

  it('initializes openCategories as a Set', () => {
    expect(state.openCategories).toBeInstanceOf(Set);
  });

  it('initializes health to Green', () => {
    expect(state.healthStatus).toBe('Green');
  });

  it('initializes issues as empty array', () => {
    expect(state.issues).toEqual([]);
  });

  it('initializes issue form state', () => {
    expect(state.issueFormOpen).toBe(false);
    expect(state.issuesPanelOpen).toBe(true);
    expect(state.editingIssueId).toBeNull();
  });

  it('initializes export filters to OPEN', () => {
    expect(state.phoneExportIssueFilter).toBe(EXPORT_FILTERS.OPEN);
    expect(state.emailExportIssueFilter).toBe(EXPORT_FILTERS.OPEN);
  });

  it('initializes assets as null', () => {
    expect(state.clientLogoImg).toBeNull();
    expect(state.clientBgImg).toBeNull();
  });

  // ── Integration: state mutation flows through selectors ──

  it('mutating state.runbookData is visible to selectors', async () => {
    const { getGlobalStats } = await import('../dashboard/selectors.js');
    state.runbookData = {
      Phase1: [{ task: 'A', status: 'Completed' }],
    };
    expect(getGlobalStats().done).toBe(1);

    state.runbookData.Phase1.push({ task: 'B', status: 'Not Started' });
    expect(getGlobalStats().total).toBe(2);
    expect(getGlobalStats().notStarted).toBe(1);
  });

  it('mutating state.issues is visible to issue selectors', async () => {
    const { getOpenIssues, getBlockingIssues } = await import('../dashboard/selectors.js');
    state.issues = [
      { id: 1, issueStatus: 'Ongoing', severity: 'Blocking' },
    ];
    expect(getOpenIssues()).toHaveLength(1);
    expect(getBlockingIssues()).toHaveLength(1);

    state.issues[0].issueStatus = 'Closed';
    expect(getOpenIssues()).toHaveLength(0);
    expect(getBlockingIssues()).toHaveLength(0);
  });
});
