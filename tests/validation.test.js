import { describe, it, expect } from 'vitest';
import { validate, normalize, formatErrors, validateAndNormalize } from '../dashboard/validation.js';

// ── validate() ──

describe('validate()', () => {
  it('rejects null', () => {
    const errs = validate(null);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/Root must be a JSON object/);
  });

  it('rejects undefined', () => {
    expect(validate(undefined)).toHaveLength(1);
  });

  it('rejects arrays', () => {
    expect(validate([1, 2])).toHaveLength(1);
    expect(validate([])[0]).toMatch(/Root must be a JSON object/);
  });

  it('rejects primitives', () => {
    expect(validate('hello')).toHaveLength(1);
    expect(validate(42)).toHaveLength(1);
    expect(validate(true)).toHaveLength(1);
  });

  it('accepts an empty object', () => {
    expect(validate({})).toHaveLength(0);
  });

  it('accepts valid categories with tasks', () => {
    const data = {
      Deploy: [
        { task: 'Step 1', status: 'Not Started' },
        { task: 'Step 2', status: 'Completed' },
      ],
    };
    expect(validate(data)).toHaveLength(0);
  });

  it('ignores reserved keys (underscore prefix)', () => {
    const data = {
      _issues: [{ some: 'data' }],
      _health: 'Green',
      Deploy: [{ task: 'Step 1', status: 'Not Started' }],
    };
    expect(validate(data)).toHaveLength(0);
  });

  it('rejects non-array categories', () => {
    const data = { Deploy: 'not-an-array' };
    const errs = validate(data);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/Category 'Deploy' must be an array/);
  });

  it('rejects non-object tasks', () => {
    const data = { Deploy: ['not-an-object'] };
    const errs = validate(data);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/'Deploy\[0\]' must be an object/);
  });

  it('rejects tasks missing "task" field', () => {
    const data = { Deploy: [{ status: 'Not Started' }] };
    const errs = validate(data);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/missing required field 'task'/);
  });

  it('rejects tasks missing "status" field', () => {
    const data = { Deploy: [{ task: 'Step 1' }] };
    const errs = validate(data);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/missing required field 'status'/);
  });

  it('rejects tasks missing both required fields', () => {
    const data = { Deploy: [{}] };
    const errs = validate(data);
    expect(errs).toHaveLength(2);
  });

  it('collects errors across multiple categories', () => {
    const data = {
      Alpha: [{ task: 'a' }],               // missing status
      Beta:  [{ status: 'Done' }],           // missing task
      Gamma: 'not-array',                     // not array
    };
    const errs = validate(data);
    expect(errs).toHaveLength(3);
  });
});

// ── normalize() ──

describe('normalize()', () => {
  it('fills missing optional fields with empty strings', () => {
    const data = {
      Deploy: [{ task: 'Step 1', status: 'Not Started' }],
    };
    normalize(data);
    const t = data.Deploy[0];
    expect(t.item).toBe('');
    expect(t.assignee).toBe('');
    expect(t.startTime).toBe('');
    expect(t.endTime).toBe('');
    expect(t.actualStartTime).toBe('');
  });

  it('normalizes actualStartTime null to empty string', () => {
    const data = { Deploy: [{ task: 'X', status: 'Y', actualStartTime: null }] };
    normalize(data);
    expect(data.Deploy[0].actualStartTime).toBe('');
  });

  it('preserves valid actualStartTime value', () => {
    const data = { Deploy: [{ task: 'X', status: 'Y', actualStartTime: '2026-04-25T09:00' }] };
    normalize(data);
    expect(data.Deploy[0].actualStartTime).toBe('2026-04-25T09:00');
  });

  it('clears invalid actualStartTime and logs warning', () => {
    const data = { Deploy: [{ task: 'X', status: 'Y', actualStartTime: 'not-a-date' }] };
    normalize(data);
    expect(data.Deploy[0].actualStartTime).toBe('');
  });

  it('normalizes description null to empty string', () => {
    const data = { Deploy: [{ task: 'X', status: 'Y', description: null }] };
    normalize(data);
    expect(data.Deploy[0].description).toBe('');
  });

  it('preserves existing description value', () => {
    const data = { Deploy: [{ task: 'X', status: 'Y', description: 'Step 1\nStep 2' }] };
    normalize(data);
    expect(data.Deploy[0].description).toBe('Step 1\nStep 2');
  });

  it('fills missing description with empty string', () => {
    const data = { Deploy: [{ task: 'X', status: 'Y' }] };
    normalize(data);
    expect(data.Deploy[0].description).toBe('');
  });

  it('preserves existing optional field values', () => {
    const data = {
      Deploy: [{
        task: 'Step 1', status: 'Not Started',
        item: 'SRV-1', assignee: 'Alice',
        startTime: '2026-04-01T10:00', endTime: '2026-04-01T12:00',
      }],
    };
    normalize(data);
    const t = data.Deploy[0];
    expect(t.item).toBe('SRV-1');
    expect(t.assignee).toBe('Alice');
    expect(t.startTime).toBe('2026-04-01T10:00');
    expect(t.endTime).toBe('2026-04-01T12:00');
  });

  it('fills null fields but not zeroes or false', () => {
    const data = {
      Deploy: [{ task: 'X', status: 'Y', item: null, assignee: undefined }],
    };
    normalize(data);
    expect(data.Deploy[0].item).toBe('');
    expect(data.Deploy[0].assignee).toBe('');
  });

  it('skips reserved keys', () => {
    const data = {
      _issues: [{ id: 1 }],
      Deploy: [{ task: 'X', status: 'Y' }],
    };
    normalize(data);
    // reserved key should be untouched
    expect(data._issues[0]).toEqual({ id: 1 });
    // regular tasks should be normalized
    expect(data.Deploy[0].item).toBe('');
  });

  it('skips non-array values gracefully', () => {
    const data = { Deploy: 'oops' };
    expect(() => normalize(data)).not.toThrow();
  });

  it('skips non-object items in arrays gracefully', () => {
    const data = { Deploy: [null, 42, { task: 'X', status: 'Y' }] };
    expect(() => normalize(data)).not.toThrow();
    expect(data.Deploy[2].item).toBe('');
  });

  it('returns the same object (mutates in place)', () => {
    const data = { Deploy: [{ task: 'X', status: 'Y' }] };
    const result = normalize(data);
    expect(result).toBe(data);
  });
});

// ── formatErrors() ──

describe('formatErrors()', () => {
  it('returns empty string for no errors', () => {
    expect(formatErrors([])).toBe('');
    expect(formatErrors(null)).toBe('');
    expect(formatErrors(undefined)).toBe('');
  });

  it('returns single error as-is', () => {
    expect(formatErrors(['Bad input'])).toBe('Bad input');
  });

  it('joins up to 3 errors with semicolons', () => {
    const errs = ['E1', 'E2', 'E3'];
    expect(formatErrors(errs)).toBe('E1; E2; E3');
  });

  it('truncates beyond 3 and shows count', () => {
    const errs = ['E1', 'E2', 'E3', 'E4', 'E5'];
    const result = formatErrors(errs);
    expect(result).toBe('E1; E2; E3 (+2 more)');
  });

  it('handles exactly 4 errors', () => {
    const errs = ['A', 'B', 'C', 'D'];
    expect(formatErrors(errs)).toBe('A; B; C (+1 more)');
  });
});

// ── validateAndNormalize() ──

describe('validateAndNormalize()', () => {
  it('returns errors and unchanged data on invalid input', () => {
    const data = { Deploy: 'bad' };
    const result = validateAndNormalize(data);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.data.Deploy).toBe('bad'); // not mutated
  });

  it('returns empty errors and normalized data on valid input', () => {
    const data = {
      Deploy: [{ task: 'Step 1', status: 'Not Started' }],
    };
    const result = validateAndNormalize(data);
    expect(result.errors).toHaveLength(0);
    expect(result.data.Deploy[0].item).toBe('');
    expect(result.data.Deploy[0].assignee).toBe('');
  });

  it('end-to-end: rejects null root', () => {
    const result = validateAndNormalize(null);
    expect(result.errors).toHaveLength(1);
  });

  it('end-to-end: valid complex payload', () => {
    const data = {
      _issues: [],
      _health: 'Green',
      Phase1: [
        { task: 'Setup', status: 'Completed', item: 'SRV-1', assignee: 'Bob' },
        { task: 'Config', status: 'In Progress' },
      ],
      Phase2: [
        { task: 'Deploy', status: 'Not Started' },
      ],
    };
    const result = validateAndNormalize(data);
    expect(result.errors).toHaveLength(0);
    expect(result.data.Phase1[1].item).toBe('');
    expect(result.data.Phase2[0].assignee).toBe('');
  });
});
