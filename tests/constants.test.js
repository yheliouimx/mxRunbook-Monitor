import { describe, it, expect } from 'vitest';
import {
  STATUS, STATUS_LABELS, statusLabel,
  ISSUE_STATUS, ISSUE_SEVERITY,
  CATEGORY_STATUS, CATEGORY_STATUS_LABEL,
  HEALTH_META, HEALTH_STATUSES,
  RESERVED_KEYS, DEFAULT_PROJECT_CONFIG,
  SORT_MODES, EXPORT_FILTERS,
} from '../dashboard/constants.js';

// ── Contract guards ──

describe('STATUS', () => {
  it('has all five canonical values', () => {
    expect(STATUS.NOT_STARTED).toBe('Not Started');
    expect(STATUS.IN_PROGRESS).toBe('In Progress');
    expect(STATUS.COMPLETED).toBe('Completed');
    expect(STATUS.BLOCKING).toBe('Blocking');
    expect(STATUS.UNNEEDED).toBe('Unneeded');
  });

  it('has exactly 5 entries', () => {
    expect(Object.keys(STATUS)).toHaveLength(5);
  });
});

describe('STATUS_LABELS', () => {
  it('has a label for every STATUS value', () => {
    for (const val of Object.values(STATUS)) {
      expect(STATUS_LABELS).toHaveProperty(val);
    }
  });

  it('maps Blocking → Blocked for display', () => {
    expect(STATUS_LABELS['Blocking']).toBe('Blocked');
  });

  it('preserves other labels unchanged', () => {
    expect(STATUS_LABELS['Completed']).toBe('Completed');
    expect(STATUS_LABELS['Not Started']).toBe('Not Started');
    expect(STATUS_LABELS['In Progress']).toBe('In Progress');
    expect(STATUS_LABELS['Unneeded']).toBe('Unneeded');
  });
});

describe('statusLabel()', () => {
  it('returns display label for known status', () => {
    expect(statusLabel('Blocking')).toBe('Blocked');
    expect(statusLabel('Completed')).toBe('Completed');
  });

  it('falls back to raw value for unknown input', () => {
    expect(statusLabel('CustomStatus')).toBe('CustomStatus');
  });

  it('handles empty string', () => {
    expect(statusLabel('')).toBe('');
  });
});

describe('ISSUE_STATUS', () => {
  it('has Ongoing and Closed', () => {
    expect(ISSUE_STATUS.ONGOING).toBe('Ongoing');
    expect(ISSUE_STATUS.CLOSED).toBe('Closed');
  });

  it('has exactly 2 entries', () => {
    expect(Object.keys(ISSUE_STATUS)).toHaveLength(2);
  });
});

describe('ISSUE_SEVERITY', () => {
  it('has Blocking and Non-Blocking', () => {
    expect(ISSUE_SEVERITY.BLOCKING).toBe('Blocking');
    expect(ISSUE_SEVERITY.NON_BLOCKING).toBe('Non-Blocking');
  });

  it('has exactly 2 entries', () => {
    expect(Object.keys(ISSUE_SEVERITY)).toHaveLength(2);
  });
});

describe('CATEGORY_STATUS', () => {
  it('has CSS-friendly keys for all states', () => {
    expect(CATEGORY_STATUS.DONE).toBe('done');
    expect(CATEGORY_STATUS.IN_PROGRESS).toBe('inprogress');
    expect(CATEGORY_STATUS.BLOCKED).toBe('blocked');
    expect(CATEGORY_STATUS.NOT_STARTED).toBe('notstarted');
  });
});

describe('CATEGORY_STATUS_LABEL', () => {
  it('maps each category status to an uppercase display label', () => {
    expect(CATEGORY_STATUS_LABEL.done).toBe('DONE');
    expect(CATEGORY_STATUS_LABEL.inprogress).toBe('IN PROGRESS');
    expect(CATEGORY_STATUS_LABEL.blocked).toBe('BLOCKING');
    expect(CATEGORY_STATUS_LABEL.notstarted).toBe('NOT STARTED');
  });

  it('has a label for every CATEGORY_STATUS value', () => {
    for (const val of Object.values(CATEGORY_STATUS)) {
      expect(CATEGORY_STATUS_LABEL).toHaveProperty(val);
    }
  });
});

describe('HEALTH_META', () => {
  it('covers all HEALTH_STATUSES', () => {
    for (const h of HEALTH_STATUSES) {
      expect(HEALTH_META).toHaveProperty(h);
      expect(HEALTH_META[h]).toHaveProperty('label');
      expect(HEALTH_META[h]).toHaveProperty('color');
      expect(HEALTH_META[h]).toHaveProperty('bg');
      expect(HEALTH_META[h]).toHaveProperty('border');
      expect(HEALTH_META[h]).toHaveProperty('colorLight');
      expect(HEALTH_META[h]).toHaveProperty('bgLight');
    }
  });

  it('has correct labels', () => {
    expect(HEALTH_META.Green.label).toBe('ON TRACK');
    expect(HEALTH_META.Amber.label).toBe('AT RISK');
    expect(HEALTH_META.Red.label).toBe('ROLLBACK');
  });
});

describe('HEALTH_STATUSES', () => {
  it('has exactly Green, Amber, Red', () => {
    expect(HEALTH_STATUSES).toEqual(['Green', 'Amber', 'Red']);
  });
});

describe('RESERVED_KEYS', () => {
  it('values start with underscore', () => {
    for (const val of Object.values(RESERVED_KEYS)) {
      expect(val.startsWith('_')).toBe(true);
    }
  });

  it('has issues and health', () => {
    expect(RESERVED_KEYS.issues).toBe('_issues');
    expect(RESERVED_KEYS.health).toBe('_health');
  });
});

describe('DEFAULT_PROJECT_CONFIG', () => {
  it('has required keys', () => {
    expect(DEFAULT_PROJECT_CONFIG).toHaveProperty('projectName');
    expect(DEFAULT_PROJECT_CONFIG).toHaveProperty('subtitle');
    expect(DEFAULT_PROJECT_CONFIG).toHaveProperty('changeRef');
    expect(DEFAULT_PROJECT_CONFIG).toHaveProperty('accentColor');
  });
});

describe('SORT_MODES', () => {
  it('has timeline, completion, alpha', () => {
    expect(SORT_MODES.TIMELINE).toBe('timeline');
    expect(SORT_MODES.COMPLETION).toBe('completion');
    expect(SORT_MODES.ALPHA).toBe('alpha');
  });
});

describe('EXPORT_FILTERS', () => {
  it('has open and all', () => {
    expect(EXPORT_FILTERS.OPEN).toBe('open');
    expect(EXPORT_FILTERS.ALL).toBe('all');
  });
});
