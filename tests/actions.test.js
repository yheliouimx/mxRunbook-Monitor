import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../dashboard/state.js';
import { STATUS, ISSUE_STATUS } from '../dashboard/constants.js';

// ── actions/tasks.js ──

import {
  setTaskStatus, completeAllInCategory, setAssignee,
  expandAll, collapseAll, toggleCategory,
  setActualStartTime, setTaskText, setItemLabel,
} from '../dashboard/actions/tasks.js';

function seedTasks() {
  state.runbookData = {
    Phase1: [
      { task: 'A', status: 'Not Started' },
      { task: 'B', status: 'In Progress' },
      { task: 'C', status: 'Unneeded' },
    ],
    Phase2: [
      { task: 'D', status: 'Not Started' },
      { task: 'E', status: 'Not Started' },
    ],
    _issues: [],
    _health: 'Green',
  };
  state.openCategories = new Set();
}

describe('setTaskStatus()', () => {
  beforeEach(seedTasks);

  it('changes a task status by category and index', () => {
    setTaskStatus('Phase1', 0, STATUS.COMPLETED);
    expect(state.runbookData.Phase1[0].status).toBe(STATUS.COMPLETED);
  });

  it('does not affect other tasks', () => {
    setTaskStatus('Phase1', 0, STATUS.COMPLETED);
    expect(state.runbookData.Phase1[1].status).toBe('In Progress');
    expect(state.runbookData.Phase1[2].status).toBe('Unneeded');
  });
});

describe('completeAllInCategory()', () => {
  beforeEach(seedTasks);

  it('marks all non-Unneeded tasks as Completed', () => {
    const count = completeAllInCategory('Phase1');
    expect(count).toBe(2); // A and B were pending
    expect(state.runbookData.Phase1[0].status).toBe(STATUS.COMPLETED);
    expect(state.runbookData.Phase1[1].status).toBe(STATUS.COMPLETED);
  });

  it('preserves Unneeded status', () => {
    completeAllInCategory('Phase1');
    expect(state.runbookData.Phase1[2].status).toBe('Unneeded');
  });

  it('returns -1 if no pending tasks', () => {
    state.runbookData.Phase2 = [
      { task: 'D', status: 'Completed' },
      { task: 'E', status: 'Unneeded' },
    ];
    expect(completeAllInCategory('Phase2')).toBe(-1);
  });

  it('marks all tasks in a fully not-started category', () => {
    const count = completeAllInCategory('Phase2');
    expect(count).toBe(2);
    expect(state.runbookData.Phase2.every(t => t.status === STATUS.COMPLETED)).toBe(true);
  });
});

describe('setAssignee()', () => {
  beforeEach(seedTasks);

  it('sets assignee on a task', () => {
    setAssignee('Phase1', 0, 'Alice');
    expect(state.runbookData.Phase1[0].assignee).toBe('Alice');
  });

  it('clears assignee with empty string', () => {
    state.runbookData.Phase1[0].assignee = 'Bob';
    setAssignee('Phase1', 0, '');
    expect(state.runbookData.Phase1[0].assignee).toBeUndefined();
  });
});

describe('expandAll()', () => {
  beforeEach(seedTasks);

  it('adds all non-reserved categories to openCategories', () => {
    expandAll();
    expect(state.openCategories.has('Phase1')).toBe(true);
    expect(state.openCategories.has('Phase2')).toBe(true);
    expect(state.openCategories.has('_issues')).toBe(false);
    expect(state.openCategories.has('_health')).toBe(false);
  });
});

describe('collapseAll()', () => {
  beforeEach(seedTasks);

  it('clears all openCategories', () => {
    state.openCategories.add('Phase1');
    state.openCategories.add('Phase2');
    collapseAll();
    expect(state.openCategories.size).toBe(0);
  });
});

describe('toggleCategory()', () => {
  beforeEach(seedTasks);

  it('opens a closed category', () => {
    toggleCategory('Phase1');
    expect(state.openCategories.has('Phase1')).toBe(true);
  });

  it('closes an open category', () => {
    state.openCategories.add('Phase1');
    toggleCategory('Phase1');
    expect(state.openCategories.has('Phase1')).toBe(false);
  });
});

describe('setActualStartTime()', () => {
  beforeEach(seedTasks);

  it('sets actualStartTime on a task', () => {
    setActualStartTime('Phase1', 0, '2026-04-25T09:00');
    expect(state.runbookData.Phase1[0].actualStartTime).toBe('2026-04-25T09:00');
  });

  it('clears actualStartTime with empty string', () => {
    state.runbookData.Phase1[0].actualStartTime = '2026-04-25T09:00';
    setActualStartTime('Phase1', 0, '');
    expect(state.runbookData.Phase1[0].actualStartTime).toBeUndefined();
  });

  it('does not affect other tasks', () => {
    setActualStartTime('Phase1', 0, '2026-04-25T09:00');
    expect(state.runbookData.Phase1[1].actualStartTime).toBeUndefined();
  });
});

describe('setTaskText()', () => {
  beforeEach(seedTasks);

  it('updates task text', () => {
    setTaskText('Phase1', 0, 'Updated Label');
    expect(state.runbookData.Phase1[0].task).toBe('Updated Label');
  });

  it('captures _origTask on first edit', () => {
    setTaskText('Phase1', 0, 'Updated Label');
    expect(state.runbookData.Phase1[0]._origTask).toBe('A');
  });

  it('preserves _origTask on subsequent edits', () => {
    setTaskText('Phase1', 0, 'First Edit');
    setTaskText('Phase1', 0, 'Second Edit');
    expect(state.runbookData.Phase1[0]._origTask).toBe('A');
    expect(state.runbookData.Phase1[0].task).toBe('Second Edit');
  });

  it('falls back to _origTask when text is cleared', () => {
    setTaskText('Phase1', 0, 'Edited');
    setTaskText('Phase1', 0, '');
    expect(state.runbookData.Phase1[0].task).toBe('A');
  });
});

describe('setItemLabel()', () => {
  beforeEach(seedTasks);

  it('sets item label on a task', () => {
    setItemLabel('Phase1', 0, 'SRV-99');
    expect(state.runbookData.Phase1[0].item).toBe('SRV-99');
  });

  it('clears item label with empty string', () => {
    state.runbookData.Phase1[0].item = 'SRV-01';
    setItemLabel('Phase1', 0, '');
    expect(state.runbookData.Phase1[0].item).toBeUndefined();
  });
});

// ── actions/issues.js ──

import {
  toggleIssueForm, saveIssue, closeIssue, reopenIssue,
  editIssue, deleteIssue, toggleIssuesPanel, getDefaultIssueTime,
} from '../dashboard/actions/issues.js';

function seedIssues() {
  state.issues = [
    { id: 1, description: 'Bug A', issueStatus: 'Ongoing', severity: 'Blocking', category: 'Phase1', time: '10:00 28 Mar' },
    { id: 2, description: 'Bug B', issueStatus: 'Closed', severity: 'Non-Blocking', category: 'Phase2', time: '12:00 28 Mar' },
    { id: 3, description: 'Bug C', issueStatus: 'Ongoing', severity: 'Non-Blocking', category: 'Phase1', time: '14:00 28 Mar' },
  ];
  state.issueFormOpen = false;
  state.editingIssueId = null;
  state.issuesPanelOpen = true;
}

describe('toggleIssueForm()', () => {
  beforeEach(seedIssues);

  it('opens the form when closed', () => {
    toggleIssueForm();
    expect(state.issueFormOpen).toBe(true);
  });

  it('closes the form when open', () => {
    state.issueFormOpen = true;
    toggleIssueForm();
    expect(state.issueFormOpen).toBe(false);
  });

  it('clears editingIssueId when closing', () => {
    state.issueFormOpen = true;
    state.editingIssueId = 1;
    toggleIssueForm();
    expect(state.editingIssueId).toBeNull();
  });
});

describe('saveIssue()', () => {
  beforeEach(seedIssues);

  it('rejects empty description', () => {
    const result = saveIssue({ desc: '', cat: 'Phase1', sev: 'Blocking', status: 'Ongoing', time: '' });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/description/i);
  });

  it('creates a new issue', () => {
    const before = state.issues.length;
    const result = saveIssue({
      desc: 'New bug', cat: 'Phase1', sev: 'Blocking', status: 'Ongoing', time: '16:00 28 Mar',
    });
    expect(result.ok).toBe(true);
    expect(state.issues).toHaveLength(before + 1);
    const newIss = state.issues[state.issues.length - 1];
    expect(newIss.description).toBe('New bug');
    expect(newIss.category).toBe('Phase1');
    expect(newIss.severity).toBe('Blocking');
  });

  it('closes the form after saving', () => {
    state.issueFormOpen = true;
    saveIssue({ desc: 'X', cat: 'P', sev: 'Blocking', status: 'Ongoing', time: '' });
    expect(state.issueFormOpen).toBe(false);
  });

  it('auto-generates time if not provided', () => {
    saveIssue({ desc: 'X', cat: 'P', sev: 'Blocking', status: 'Ongoing', time: '' });
    const newIss = state.issues[state.issues.length - 1];
    expect(newIss.time).toBeTruthy();
  });

  it('updates existing issue when editingIssueId is set', () => {
    state.editingIssueId = 1;
    const result = saveIssue({
      desc: 'Updated', cat: 'Phase2', sev: 'Non-Blocking', status: 'Closed', time: '18:00 28 Mar',
    });
    expect(result.ok).toBe(true);
    const updated = state.issues.find(i => i.id === 1);
    expect(updated.description).toBe('Updated');
    expect(updated.category).toBe('Phase2');
    expect(updated.severity).toBe('Non-Blocking');
    expect(state.editingIssueId).toBeNull();
  });
});

describe('closeIssue()', () => {
  beforeEach(seedIssues);

  it('sets issue status to Closed', () => {
    closeIssue(1);
    expect(state.issues.find(i => i.id === 1).issueStatus).toBe(ISSUE_STATUS.CLOSED);
  });

  it('does nothing for non-existent id', () => {
    const before = JSON.stringify(state.issues);
    closeIssue(999);
    expect(JSON.stringify(state.issues)).toBe(before);
  });
});

describe('reopenIssue()', () => {
  beforeEach(seedIssues);

  it('sets issue status to Ongoing', () => {
    reopenIssue(2);
    expect(state.issues.find(i => i.id === 2).issueStatus).toBe(ISSUE_STATUS.ONGOING);
  });
});

describe('editIssue()', () => {
  beforeEach(seedIssues);

  it('sets editingIssueId and opens form', () => {
    editIssue(1);
    expect(state.editingIssueId).toBe(1);
    expect(state.issueFormOpen).toBe(true);
  });
});

describe('deleteIssue()', () => {
  beforeEach(seedIssues);

  it('removes issue by id', () => {
    deleteIssue(2);
    expect(state.issues.find(i => i.id === 2)).toBeUndefined();
    expect(state.issues).toHaveLength(2);
  });

  it('does nothing for non-existent id', () => {
    deleteIssue(999);
    expect(state.issues).toHaveLength(3);
  });
});

describe('toggleIssuesPanel()', () => {
  beforeEach(seedIssues);

  it('toggles issuesPanelOpen', () => {
    expect(state.issuesPanelOpen).toBe(true);
    toggleIssuesPanel();
    expect(state.issuesPanelOpen).toBe(false);
    toggleIssuesPanel();
    expect(state.issuesPanelOpen).toBe(true);
  });
});

describe('getDefaultIssueTime()', () => {
  it('returns a non-empty string', () => {
    expect(getDefaultIssueTime()).toBeTruthy();
  });

  it('contains HH:MM pattern', () => {
    expect(getDefaultIssueTime()).toMatch(/\d{2}:\d{2}/);
  });
});

// ── actions/health.js ──

import { setHealth } from '../dashboard/actions/health.js';

describe('setHealth()', () => {
  beforeEach(() => {
    state.runbookData = {};
    state.healthStatus = 'Green';
  });

  it('updates healthStatus in state', () => {
    setHealth('Red');
    expect(state.healthStatus).toBe('Red');
  });

  it('persists to runbookData._health', () => {
    setHealth('Amber');
    expect(state.runbookData._health).toBe('Amber');
  });
});
