import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../dashboard/state.js';
import {
  normalizeStatus, statusClass, computeCategoryStatus,
  formatTime, formatTimeShort, getEarliestTime,
  getCategoryNames, getGlobalStats, getUniqueTeams,
  matchesSearch, matchesTeam, sortCategories,
  escapeHtml,
  getOpenIssues, getClosedIssues, getBlockingIssues, getCompletionPct,
} from '../dashboard/selectors.js';

// ── Helper to seed state ──

function seedState(overrides = {}) {
  Object.assign(state, {
    runbookData: {},
    issues: [],
    filterState: 'all',
    searchQuery: '',
    teamFilter: 'all',
    sortMode: 'timeline',
    ...overrides,
  });
}

// ── normalizeStatus() ──

describe('normalizeStatus()', () => {
  it('maps null/undefined/NaN to Not Started', () => {
    expect(normalizeStatus(null)).toBe('Not Started');
    expect(normalizeStatus(undefined)).toBe('Not Started');
    expect(normalizeStatus('NaN')).toBe('Not Started');
    expect(normalizeStatus('')).toBe('Not Started');
  });

  it('maps "completed" and "done" to Completed', () => {
    expect(normalizeStatus('completed')).toBe('Completed');
    expect(normalizeStatus('Completed')).toBe('Completed');
    expect(normalizeStatus('done')).toBe('Completed');
    expect(normalizeStatus('DONE')).toBe('Completed');
  });

  it('maps progress variants to In Progress', () => {
    expect(normalizeStatus('In Progress')).toBe('In Progress');
    expect(normalizeStatus('in progress')).toBe('In Progress');
    expect(normalizeStatus('IN PROGRESS')).toBe('In Progress');
  });

  it('maps blocking/blocked to Blocking', () => {
    expect(normalizeStatus('Blocking')).toBe('Blocking');
    expect(normalizeStatus('blocked')).toBe('Blocking');
    expect(normalizeStatus('BLOCKED')).toBe('Blocking');
  });

  it('maps unneeded variants to Unneeded', () => {
    expect(normalizeStatus('Unneeded')).toBe('Unneeded');
    expect(normalizeStatus('not needed')).toBe('Unneeded');
    expect(normalizeStatus('n/a')).toBe('Unneeded');
    expect(normalizeStatus('N/A')).toBe('Unneeded');
  });

  it('falls back to Not Started for unknown values', () => {
    expect(normalizeStatus('random')).toBe('Not Started');
    expect(normalizeStatus('??')).toBe('Not Started');
  });
});

// ── statusClass() ──

describe('statusClass()', () => {
  it('maps Completed to "done"', () => {
    expect(statusClass('Completed')).toBe('done');
  });

  it('maps In Progress to "inprogress"', () => {
    expect(statusClass('In Progress')).toBe('inprogress');
  });

  it('maps Blocking to "blocked"', () => {
    expect(statusClass('Blocking')).toBe('blocked');
  });

  it('maps Unneeded to "unneeded"', () => {
    expect(statusClass('Unneeded')).toBe('unneeded');
  });

  it('defaults to "notstarted"', () => {
    expect(statusClass('Not Started')).toBe('notstarted');
    expect(statusClass('anything')).toBe('notstarted');
  });
});

// ── computeCategoryStatus() ──

describe('computeCategoryStatus()', () => {
  it('returns "done" when all tasks completed', () => {
    const tasks = [
      { status: 'Completed' },
      { status: 'Completed' },
    ];
    expect(computeCategoryStatus(tasks)).toBe('done');
  });

  it('returns "done" with mix of Completed and Unneeded', () => {
    const tasks = [
      { status: 'Completed' },
      { status: 'Unneeded' },
    ];
    expect(computeCategoryStatus(tasks)).toBe('done');
  });

  it('returns "blocked" if any task is Blocking', () => {
    const tasks = [
      { status: 'Completed' },
      { status: 'Blocking' },
      { status: 'Not Started' },
    ];
    expect(computeCategoryStatus(tasks)).toBe('blocked');
  });

  it('returns "inprogress" if some done/in-progress but none blocking', () => {
    const tasks = [
      { status: 'Completed' },
      { status: 'In Progress' },
      { status: 'Not Started' },
    ];
    expect(computeCategoryStatus(tasks)).toBe('inprogress');
  });

  it('returns "inprogress" if some done but not all', () => {
    const tasks = [
      { status: 'Completed' },
      { status: 'Not Started' },
    ];
    expect(computeCategoryStatus(tasks)).toBe('inprogress');
  });

  it('returns "notstarted" if all tasks are Not Started', () => {
    const tasks = [
      { status: 'Not Started' },
      { status: 'Not Started' },
    ];
    expect(computeCategoryStatus(tasks)).toBe('notstarted');
  });
});

// ── formatTime() ──

describe('formatTime()', () => {
  it('returns empty string for falsy input', () => {
    expect(formatTime('')).toBe('');
    expect(formatTime(null)).toBe('');
    expect(formatTime(undefined)).toBe('');
  });

  it('returns empty string for invalid date', () => {
    expect(formatTime('not-a-date')).toBe('');
  });

  it('returns formatted string for valid ISO', () => {
    const result = formatTime('2026-03-28T15:30:00');
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/28/);
  });
});

// ── formatTimeShort() ──

describe('formatTimeShort()', () => {
  it('returns empty string for falsy input', () => {
    expect(formatTimeShort('')).toBe('');
    expect(formatTimeShort(null)).toBe('');
  });

  it('returns empty string for invalid date', () => {
    expect(formatTimeShort('xyz')).toBe('');
  });

  it('returns HH:MM for valid ISO', () => {
    const result = formatTimeShort('2026-03-28T15:30:00');
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

// ── getEarliestTime() ──

describe('getEarliestTime()', () => {
  it('returns null for empty tasks', () => {
    expect(getEarliestTime([])).toBeNull();
  });

  it('returns null when no tasks have startTime', () => {
    expect(getEarliestTime([{ task: 'A' }, { task: 'B' }])).toBeNull();
  });

  it('returns the earliest date', () => {
    const tasks = [
      { startTime: '2026-03-29T10:00' },
      { startTime: '2026-03-28T08:00' },
      { startTime: '2026-03-30T12:00' },
    ];
    const result = getEarliestTime(tasks);
    expect(result.getTime()).toBe(new Date('2026-03-28T08:00').getTime());
  });

  it('ignores invalid dates', () => {
    const tasks = [
      { startTime: 'invalid' },
      { startTime: '2026-03-28T08:00' },
    ];
    const result = getEarliestTime(tasks);
    expect(result.getTime()).toBe(new Date('2026-03-28T08:00').getTime());
  });
});

// ── getCategoryNames() ──

describe('getCategoryNames()', () => {
  beforeEach(() => seedState());

  it('returns empty array for empty runbookData', () => {
    expect(getCategoryNames()).toEqual([]);
  });

  it('returns non-reserved keys', () => {
    seedState({
      runbookData: {
        _issues: [],
        _health: 'Green',
        Deploy: [],
        Config: [],
      },
    });
    const names = getCategoryNames();
    expect(names).toContain('Deploy');
    expect(names).toContain('Config');
    expect(names).not.toContain('_issues');
    expect(names).not.toContain('_health');
  });
});

// ── getGlobalStats() ──

describe('getGlobalStats()', () => {
  beforeEach(() => seedState());

  it('returns all zeroes for empty runbook', () => {
    expect(getGlobalStats()).toEqual({ total: 0, done: 0, inProg: 0, notStarted: 0, blocking: 0 });
  });

  it('counts tasks correctly across categories', () => {
    seedState({
      runbookData: {
        Phase1: [
          { task: 'A', status: 'Completed' },
          { task: 'B', status: 'In Progress' },
        ],
        Phase2: [
          { task: 'C', status: 'Not Started' },
          { task: 'D', status: 'Blocking' },
          { task: 'E', status: 'Unneeded' },
        ],
        _issues: [],
      },
    });
    const stats = getGlobalStats();
    expect(stats.total).toBe(5);
    expect(stats.done).toBe(2);       // Completed + Unneeded
    expect(stats.inProg).toBe(1);
    expect(stats.notStarted).toBe(1);
    expect(stats.blocking).toBe(1);
  });

  it('skips non-array values', () => {
    seedState({
      runbookData: {
        Phase1: [{ task: 'A', status: 'Completed' }],
        _health: 'Green',
      },
    });
    expect(getGlobalStats().total).toBe(1);
  });
});

// ── getUniqueTeams() ──

describe('getUniqueTeams()', () => {
  beforeEach(() => seedState());

  it('returns empty for no assignees', () => {
    seedState({ runbookData: { Phase1: [{ task: 'A', status: 'X' }] } });
    expect(getUniqueTeams()).toEqual([]);
  });

  it('returns sorted unique assignees', () => {
    seedState({
      runbookData: {
        Phase1: [
          { task: 'A', status: 'X', assignee: 'Charlie' },
          { task: 'B', status: 'X', assignee: 'Alice' },
        ],
        Phase2: [
          { task: 'C', status: 'X', assignee: 'Alice' },
          { task: 'D', status: 'X', assignee: 'Bob' },
        ],
      },
    });
    expect(getUniqueTeams()).toEqual(['Alice', 'Bob', 'Charlie']);
  });
});

// ── matchesSearch() ──

describe('matchesSearch()', () => {
  beforeEach(() => seedState());

  it('returns true when no search query', () => {
    expect(matchesSearch({ task: 'anything' })).toBe(true);
  });

  it('matches on task name', () => {
    state.searchQuery = 'deploy';
    expect(matchesSearch({ task: 'Deploy Server' })).toBe(true);
    expect(matchesSearch({ task: 'Configure DB' })).toBe(false);
  });

  it('matches on item', () => {
    state.searchQuery = 'SRV';
    expect(matchesSearch({ task: 'X', item: 'SRV-001' })).toBe(true);
  });

  it('matches on assignee', () => {
    state.searchQuery = 'alice';
    expect(matchesSearch({ task: 'X', assignee: 'Alice' })).toBe(true);
  });

  it('is case insensitive', () => {
    state.searchQuery = 'DEPLOY';
    expect(matchesSearch({ task: 'deploy servers' })).toBe(true);
  });
});

// ── matchesTeam() ──

describe('matchesTeam()', () => {
  beforeEach(() => seedState());

  it('returns true when teamFilter is "all"', () => {
    expect(matchesTeam({ assignee: 'Anyone' })).toBe(true);
  });

  it('matches exact assignee', () => {
    state.teamFilter = 'Alice';
    expect(matchesTeam({ assignee: 'Alice' })).toBe(true);
    expect(matchesTeam({ assignee: 'Bob' })).toBe(false);
  });

  it('handles missing assignee', () => {
    state.teamFilter = 'Alice';
    expect(matchesTeam({ task: 'X' })).toBe(false);
    expect(matchesTeam({})).toBe(false);
  });
});

// ── sortCategories() ──

describe('sortCategories()', () => {
  beforeEach(() => seedState());

  it('sorts alphabetically in alpha mode', () => {
    seedState({
      sortMode: 'alpha',
      runbookData: { Zulu: [], Alpha: [], Mike: [] },
    });
    expect(sortCategories(['Zulu', 'Alpha', 'Mike'])).toEqual(['Alpha', 'Mike', 'Zulu']);
  });

  it('sorts by completion in completion mode', () => {
    seedState({
      sortMode: 'completion',
      runbookData: {
        Low:  [{ status: 'Not Started' }, { status: 'Not Started' }],
        High: [{ status: 'Completed' }, { status: 'Completed' }],
        Mid:  [{ status: 'Completed' }, { status: 'Not Started' }],
      },
    });
    const sorted = sortCategories(['Low', 'High', 'Mid']);
    expect(sorted[0]).toBe('High');
    expect(sorted[1]).toBe('Mid');
    expect(sorted[2]).toBe('Low');
  });

  it('sorts by earliest start time in timeline mode', () => {
    seedState({
      sortMode: 'timeline',
      runbookData: {
        Late:  [{ startTime: '2026-03-30T10:00', status: 'X' }],
        Early: [{ startTime: '2026-03-28T08:00', status: 'X' }],
        Mid:   [{ startTime: '2026-03-29T12:00', status: 'X' }],
      },
    });
    expect(sortCategories(['Late', 'Early', 'Mid'])).toEqual(['Early', 'Mid', 'Late']);
  });

  it('puts categories without start times last in timeline mode', () => {
    seedState({
      sortMode: 'timeline',
      runbookData: {
        NoTime: [{ status: 'X' }],
        WithTime: [{ startTime: '2026-03-28T08:00', status: 'X' }],
      },
    });
    const sorted = sortCategories(['NoTime', 'WithTime']);
    expect(sorted[0]).toBe('WithTime');
    expect(sorted[1]).toBe('NoTime');
  });
});

// ── escapeHtml() ──

describe('escapeHtml()', () => {
  it('escapes < and >', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes &', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('passes through quotes (textContent does not escape them)', () => {
    expect(escapeHtml('"hello"')).toBe('"hello"');
  });

  it('handles XSS vectors', () => {
    const xss = '<img src=x onerror=alert(1)>';
    const result = escapeHtml(xss);
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;');
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });
});

// ── Issue helpers ──

describe('getOpenIssues()', () => {
  beforeEach(() => seedState());

  it('returns only Ongoing issues', () => {
    seedState({
      issues: [
        { id: 1, issueStatus: 'Ongoing' },
        { id: 2, issueStatus: 'Closed' },
        { id: 3, issueStatus: 'Ongoing' },
      ],
    });
    expect(getOpenIssues()).toHaveLength(2);
    expect(getOpenIssues().every(i => i.issueStatus === 'Ongoing')).toBe(true);
  });

  it('returns empty for no issues', () => {
    expect(getOpenIssues()).toEqual([]);
  });
});

describe('getClosedIssues()', () => {
  it('returns only Closed issues', () => {
    seedState({
      issues: [
        { id: 1, issueStatus: 'Ongoing' },
        { id: 2, issueStatus: 'Closed' },
      ],
    });
    expect(getClosedIssues()).toHaveLength(1);
    expect(getClosedIssues()[0].id).toBe(2);
  });
});

describe('getBlockingIssues()', () => {
  it('returns only Ongoing + Blocking severity', () => {
    seedState({
      issues: [
        { id: 1, issueStatus: 'Ongoing', severity: 'Blocking' },
        { id: 2, issueStatus: 'Closed', severity: 'Blocking' },
        { id: 3, issueStatus: 'Ongoing', severity: 'Non-Blocking' },
      ],
    });
    expect(getBlockingIssues()).toHaveLength(1);
    expect(getBlockingIssues()[0].id).toBe(1);
  });
});

describe('getCompletionPct()', () => {
  beforeEach(() => seedState());

  it('returns 0 for empty runbook', () => {
    expect(getCompletionPct()).toBe(0);
  });

  it('returns 100 when all completed', () => {
    seedState({
      runbookData: {
        Phase1: [
          { task: 'A', status: 'Completed' },
          { task: 'B', status: 'Completed' },
        ],
      },
    });
    expect(getCompletionPct()).toBe(100);
  });

  it('returns correct percentage', () => {
    seedState({
      runbookData: {
        Phase1: [
          { task: 'A', status: 'Completed' },
          { task: 'B', status: 'Not Started' },
          { task: 'C', status: 'In Progress' },
          { task: 'D', status: 'Completed' },
        ],
      },
    });
    expect(getCompletionPct()).toBe(50);
  });

  it('counts Unneeded as done', () => {
    seedState({
      runbookData: {
        Phase1: [
          { task: 'A', status: 'Completed' },
          { task: 'B', status: 'Unneeded' },
        ],
      },
    });
    expect(getCompletionPct()).toBe(100);
  });
});
