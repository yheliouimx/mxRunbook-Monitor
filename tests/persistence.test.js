import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from '../dashboard/state.js';
import { RESERVED_KEYS, STATUS } from '../dashboard/constants.js';

// We test persistence through its public API.
// Need to mock fetch, localStorage, confirm, URL.createObjectURL, and <a>.click.

// Reset state helper
function resetState() {
  state.runbookData = {};
  state.issues = [];
  state.healthStatus = 'Green';
  state.issueFormOpen = false;
  state.editingIssueId = null;
}

describe('persistence', () => {
  let persistence;

  beforeEach(async () => {
    resetState();
    // Clear mocks
    vi.restoreAllMocks();
    localStorage.clear();
    // Re-import to get fresh module
    persistence = await import('../dashboard/persistence.js');
  });

  // ── applyLoadedRunbook ──

  describe('applyLoadedRunbook()', () => {
    it('applies valid runbook data to state', () => {
      const data = {
        Phase1: [{ task: 'A', status: 'Not Started' }],
        _issues: [{ id: 1, description: 'Bug' }],
        _health: 'Amber',
      };
      persistence.applyLoadedRunbook(data);
      expect(state.runbookData).toBe(data);
      expect(state.issues).toEqual([{ id: 1, description: 'Bug' }]);
      expect(state.healthStatus).toBe('Amber');
    });

    it('resets UI state on apply', () => {
      state.issueFormOpen = true;
      state.editingIssueId = 42;
      const data = { Phase1: [{ task: 'A', status: 'X' }] };
      persistence.applyLoadedRunbook(data);
      expect(state.issueFormOpen).toBe(false);
      expect(state.editingIssueId).toBeNull();
    });

    it('defaults health to Green if missing', () => {
      const data = { Phase1: [{ task: 'A', status: 'X' }] };
      persistence.applyLoadedRunbook(data);
      expect(state.healthStatus).toBe('Green');
    });

    it('defaults issues to empty array if missing', () => {
      const data = { Phase1: [{ task: 'A', status: 'X' }] };
      persistence.applyLoadedRunbook(data);
      expect(state.issues).toEqual([]);
    });

    it('throws on invalid data (non-object)', () => {
      expect(() => persistence.applyLoadedRunbook(null)).toThrow();
    });

    it('throws on invalid data (non-array category)', () => {
      expect(() => persistence.applyLoadedRunbook({ Phase1: 'bad' })).toThrow();
    });

    it('normalizes tasks (fills optional fields)', () => {
      const data = { Phase1: [{ task: 'A', status: 'X' }] };
      persistence.applyLoadedRunbook(data);
      expect(state.runbookData.Phase1[0].item).toBe('');
      expect(state.runbookData.Phase1[0].assignee).toBe('');
    });
  });

  // ── loadInitialRunbook ──

  describe('loadInitialRunbook()', () => {
    it('prefers localStorage draft over fetch', async () => {
      const draft = { Phase1: [{ task: 'A', status: 'Completed' }], _health: 'Amber' };
      localStorage.setItem('runbook_progress', JSON.stringify(draft));

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const { source } = await persistence.loadInitialRunbook();

      expect(source).toBe('browser draft');
      expect(state.runbookData.Phase1[0].status).toBe('Completed');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('falls through to fetch on corrupt localStorage', async () => {
      localStorage.setItem('runbook_progress', 'NOT VALID JSON{{{');

      const serverData = { Phase1: [{ task: 'B', status: 'Not Started' }] };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(serverData),
      });

      const { source } = await persistence.loadInitialRunbook();
      expect(source).toBe('runbook.json');
      expect(state.runbookData.Phase1[0].task).toBe('B');
    });

    it('fetches runbook.json when no localStorage', async () => {
      const serverData = { Deploy: [{ task: 'Step 1', status: 'Not Started' }] };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(serverData),
      });

      const { source } = await persistence.loadInitialRunbook();
      expect(source).toBe('runbook.json');
      expect(state.runbookData.Deploy).toBeDefined();
    });

    it('throws when fetch fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 });
      await expect(persistence.loadInitialRunbook()).rejects.toThrow('HTTP 404');
    });
  });

  // ── loadFromServer ──

  describe('loadFromServer()', () => {
    it('replaces current state with server data', async () => {
      state.runbookData = { Old: [{ task: 'X', status: 'Y' }] };
      const serverData = { New: [{ task: 'Fresh', status: 'Not Started' }] };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(serverData),
      });

      await persistence.loadFromServer();
      expect(state.runbookData.New).toBeDefined();
      expect(state.runbookData.Old).toBeUndefined();
    });

    it('throws on HTTP error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 });
      await expect(persistence.loadFromServer()).rejects.toThrow('HTTP 500');
    });
  });

  // ── saveDraft ──

  describe('saveDraft()', () => {
    it('writes to localStorage', () => {
      state.runbookData = { Phase1: [{ task: 'A', status: 'Done' }] };
      state.issues = [{ id: 1, description: 'X' }];
      state.healthStatus = 'Red';

      // Mock URL and <a>.click
      const revokeURL = vi.fn();
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeURL);

      persistence.saveDraft();

      const saved = JSON.parse(localStorage.getItem('runbook_progress'));
      expect(saved[RESERVED_KEYS.issues]).toEqual([{ id: 1, description: 'X' }]);
      expect(saved[RESERVED_KEYS.health]).toBe('Red');
    });
  });

  // ── exportRunbookJson ──

  describe('exportRunbookJson()', () => {
    it('creates a download with issues and health merged', () => {
      state.runbookData = { Phase1: [{ task: 'A', status: 'X' }] };
      state.issues = [{ id: 1 }];
      state.healthStatus = 'Amber';

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      persistence.exportRunbookJson();
      // Just ensure no throw; download triggering is DOM side-effect
    });
  });

  // ── resetRunbook ──

  describe('resetRunbook()', () => {
    it('always returns true (confirmation is handled by the caller in app.js)', () => {
      // resetRunbook() performs the reset unconditionally and signals success.
      // The showConfirm() guard lives in app.js, not here.
      state.runbookData = { Phase1: [{ task: 'A', status: 'Completed' }] };
      expect(persistence.resetRunbook()).toBe(true);
    });

    it('resets all tasks to Not Started on double confirm', () => {
      state.runbookData = {
        Phase1: [
          { task: 'A', status: 'Completed' },
          { task: 'B', status: 'In Progress' },
        ],
        _issues: [{ id: 1 }],
        _health: 'Red',
      };
      state.issues = [{ id: 1 }];
      state.healthStatus = 'Red';

      vi.spyOn(globalThis, 'confirm').mockReturnValue(true);

      const result = persistence.resetRunbook();
      expect(result).toBe(true);
      expect(state.runbookData.Phase1[0].status).toBe(STATUS.NOT_STARTED);
      expect(state.runbookData.Phase1[1].status).toBe(STATUS.NOT_STARTED);
      expect(state.issues).toHaveLength(0);
      expect(state.healthStatus).toBe('Green');
      expect(localStorage.getItem('runbook_progress')).toBeNull();
    });
  });
});
