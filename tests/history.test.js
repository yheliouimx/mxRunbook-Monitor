import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { state } from '../dashboard/state.js';

// We import the module under test after each localStorage reset
// because the module reads localStorage lazily (on each call).
import {
    recordSnapshot,
    getSnapshots,
    clearSnapshots,
    startAutoSnapshot,
    stopAutoSnapshot,
} from '../dashboard/history.js';

// ── Helpers ───────────────────────────────────────────────

function seedState(runbookData = {}, health = "Green") {
    state.runbookData = runbookData;
    state.healthStatus = health;
}

function makeTask(status) {
    return { task: "T", status };
}

// ── Setup / teardown ──────────────────────────────────────

beforeEach(() => {
    localStorage.clear();
    stopAutoSnapshot();
    seedState();
});

afterEach(() => {
    stopAutoSnapshot();
});

// ── getSnapshots() ────────────────────────────────────────

describe('getSnapshots()', () => {
    it('returns empty array when nothing recorded', () => {
        expect(getSnapshots()).toEqual([]);
    });

    it('returns empty array on corrupt localStorage', () => {
        localStorage.setItem('runbook_snapshots', '{bad json');
        expect(getSnapshots()).toEqual([]);
    });
});

// ── clearSnapshots() ──────────────────────────────────────

describe('clearSnapshots()', () => {
    it('removes all snapshots from storage', () => {
        recordSnapshot();
        expect(getSnapshots().length).toBe(1);
        clearSnapshots();
        expect(getSnapshots()).toEqual([]);
    });
});

// ── recordSnapshot() ──────────────────────────────────────

describe('recordSnapshot()', () => {
    it('stores a snapshot with the expected shape', () => {
        seedState({ Cat: [makeTask("Completed"), makeTask("Not Started")] }, "Green");
        recordSnapshot();

        const snaps = getSnapshots();
        expect(snaps.length).toBe(1);

        const s = snaps[0];
        expect(typeof s.ts).toBe('string');
        expect(new Date(s.ts).toString()).not.toBe('Invalid Date');
        expect(s.pct).toBe(50);   // 1/2 done
        expect(s.done).toBe(1);
        expect(s.total).toBe(2);
        expect(s.health).toBe('Green');
        expect(typeof s.inProg).toBe('number');
        expect(typeof s.notStarted).toBe('number');
        expect(typeof s.blocking).toBe('number');
    });

    it('computes pct=0 when no tasks are done', () => {
        seedState({ Cat: [makeTask("Not Started"), makeTask("In Progress")] });
        recordSnapshot();
        expect(getSnapshots()[0].pct).toBe(0);
    });

    it('computes pct=100 when all tasks are done', () => {
        seedState({ Cat: [makeTask("Completed"), makeTask("Unneeded")] });
        recordSnapshot();
        expect(getSnapshots()[0].pct).toBe(100);
    });

    it('computes pct=0 with empty runbook', () => {
        seedState({});
        recordSnapshot();
        expect(getSnapshots()[0].pct).toBe(0);
    });

    it('skips reserved keys (_issues, _health) when counting tasks', () => {
        seedState({
            _issues: [],
            _health: "Green",
            Cat: [makeTask("Completed")],
        });
        recordSnapshot();
        const s = getSnapshots()[0];
        expect(s.total).toBe(1);
        expect(s.done).toBe(1);
    });

    it('records the current health status', () => {
        seedState({ Cat: [makeTask("Completed")] }, "Amber");
        recordSnapshot();
        expect(getSnapshots()[0].health).toBe("Amber");
    });

    it('deduplicates consecutive identical pct + health', () => {
        seedState({ Cat: [makeTask("Completed")] }, "Green");
        recordSnapshot();
        recordSnapshot(); // same pct=100, same health=Green
        expect(getSnapshots().length).toBe(1);
    });

    it('does NOT deduplicate when health changes', () => {
        seedState({ Cat: [makeTask("Completed")] }, "Green");
        recordSnapshot();
        state.healthStatus = "Amber";
        recordSnapshot(); // same pct but different health
        expect(getSnapshots().length).toBe(2);
    });

    it('does NOT deduplicate when pct changes', () => {
        seedState({ Cat: [makeTask("Not Started"), makeTask("Not Started")] }, "Green");
        recordSnapshot(); // pct=0

        // Complete one task
        state.runbookData['Cat'][0].status = "Completed";
        recordSnapshot(); // pct=50
        expect(getSnapshots().length).toBe(2);
    });

    it('caps to 200 entries (drops oldest)', () => {
        seedState({}, "Green");
        // Fill up to 201 entries with alternating pct to bypass dedup
        for (let i = 0; i <= 200; i++) {
            state.runbookData = {
                Cat: [makeTask(i % 2 === 0 ? "Completed" : "Not Started")],
            };
            recordSnapshot();
        }
        expect(getSnapshots().length).toBe(200);
    });

    it('accumulates multiple distinct snapshots in order', () => {
        seedState({ Cat: [makeTask("Not Started")] }, "Green");
        recordSnapshot(); // pct=0, health=Green

        state.runbookData['Cat'][0].status = "Completed";
        state.healthStatus = "Amber";
        recordSnapshot(); // pct=100, health=Amber

        const snaps = getSnapshots();
        expect(snaps.length).toBe(2);
        expect(snaps[0].pct).toBe(0);
        expect(snaps[1].pct).toBe(100);
        expect(snaps[1].health).toBe("Amber");
    });
});

// ── startAutoSnapshot() ───────────────────────────────────

describe('startAutoSnapshot()', () => {
    it('records a snapshot immediately on start', () => {
        seedState({ Cat: [makeTask("Completed")] }, "Green");
        startAutoSnapshot(60_000);
        expect(getSnapshots().length).toBe(1);
        stopAutoSnapshot();
    });

    it('fires again after the interval elapses', () => {
        vi.useFakeTimers();
        seedState({ Cat: [makeTask("Not Started")] }, "Green");

        startAutoSnapshot(1000);
        expect(getSnapshots().length).toBe(1); // immediate

        // Advance time and change state so dedup doesn't suppress next snapshot
        state.runbookData['Cat'][0].status = "Completed";
        vi.advanceTimersByTime(1000);
        expect(getSnapshots().length).toBe(2);

        stopAutoSnapshot();
        vi.useRealTimers();
    });

    it('replaces an existing timer when called twice', () => {
        vi.useFakeTimers();
        seedState({}, "Green");

        startAutoSnapshot(1000);
        const firstCount = getSnapshots().length;

        // Change state so second start can record
        state.healthStatus = "Amber";
        startAutoSnapshot(1000); // replaces timer, records immediately
        expect(getSnapshots().length).toBe(firstCount + 1);

        stopAutoSnapshot();
        vi.useRealTimers();
    });
});
