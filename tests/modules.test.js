import { describe, it, expect } from 'vitest';

// ── Render modules ──

describe('render/stats.js exports', () => {
  it('exports renderGlobalStats and renderHealthIndicator', async () => {
    const mod = await import('../dashboard/render/stats.js');
    expect(typeof mod.renderGlobalStats).toBe('function');
    expect(typeof mod.renderHealthIndicator).toBe('function');
  });
});

describe('render/timeline.js exports', () => {
  it('exports renderTimeline', async () => {
    const mod = await import('../dashboard/render/timeline.js');
    expect(typeof mod.renderTimeline).toBe('function');
  });
});

describe('render/categories.js exports', () => {
  it('exports renderCategories', async () => {
    const mod = await import('../dashboard/render/categories.js');
    expect(typeof mod.renderCategories).toBe('function');
  });
});

describe('render/issues.js exports', () => {
  it('exports expected functions', async () => {
    const mod = await import('../dashboard/render/issues.js');
    expect(typeof mod.renderIssues).toBe('function');
    expect(typeof mod.toggleIssueForm).toBe('function');
    expect(typeof mod.saveIssue).toBe('function');
    expect(typeof mod.closeIssue).toBe('function');
    expect(typeof mod.reopenIssue).toBe('function');
    expect(typeof mod.editIssue).toBe('function');
    expect(typeof mod.deleteIssue).toBe('function');
  });
});

describe('render/summary.js exports', () => {
  it('exports generateSummary and copySummaryToClipboard', async () => {
    const mod = await import('../dashboard/render/summary.js');
    expect(typeof mod.generateSummary).toBe('function');
    expect(typeof mod.copySummaryToClipboard).toBe('function');
  });
});

// ── Export modules ──

describe('export/shared.js exports', () => {
  it('exports expected functions', async () => {
    const mod = await import('../dashboard/export/shared.js');
    expect(typeof mod.getExportCategories).toBe('function');
    expect(typeof mod.getProjectInfo).toBe('function');
    expect(typeof mod.getExportStats).toBe('function');
    expect(typeof mod.getCategoryExportStats).toBe('function');
    expect(typeof mod.getActiveAssignees).toBe('function');
    expect(typeof mod.getExportIssues).toBe('function');
    expect(typeof mod.getTimeBounds).toBe('function');
    expect(typeof mod.getCategoryTimeBounds).toBe('function');
  });
});

describe('export/canvas.js exports', () => {
  it('exports expected functions', async () => {
    const mod = await import('../dashboard/export/canvas.js');
    expect(typeof mod.drawText).toBe('function');
    expect(typeof mod.drawRoundRect).toBe('function');
    expect(typeof mod.drawDivider).toBe('function');
    expect(typeof mod.drawDot).toBe('function');
    expect(typeof mod.drawBackgroundImage).toBe('function');
    expect(typeof mod.drawLogo).toBe('function');
    expect(typeof mod.drawProgressBar).toBe('function');
    expect(typeof mod.resizeIfNeeded).toBe('function');
    expect(typeof mod.exportCanvasAsImage).toBe('function');
    expect(typeof mod.formatExportTimestamp).toBe('function');
  });
});

describe('export/theme.js exports', () => {
  it('exports expected functions or objects', async () => {
    const mod = await import('../dashboard/export/theme.js');
    expect(mod).toBeDefined();
  });
});

describe('export/phone.js exports', () => {
  it('exports exportPhoneSnapshot', async () => {
    const mod = await import('../dashboard/export/phone.js');
    expect(typeof mod.exportPhoneSnapshot).toBe('function');
  });
});

describe('export/email.js exports', () => {
  it('exports exportEmailSnapshot', async () => {
    const mod = await import('../dashboard/export/email.js');
    expect(typeof mod.exportEmailSnapshot).toBe('function');
  });
});

describe('export/gantt.js exports', () => {
  it('exports exportGanttChart', async () => {
    const mod = await import('../dashboard/export/gantt.js');
    expect(typeof mod.exportGanttChart).toBe('function');
  });
});

// ── App entry point ──

describe('app.js', () => {
  it('can be imported without throwing', async () => {
    // app.js binds event listeners on import, so we need DOM elements
    // happy-dom provides a basic document. We need to create the elements
    // that app.js expects.
    const ids = [
      'themeToggle', 'clock', 'toast', 'bgOverlay', 'clientLogo',
      'healthText', 'globalStats', 'timeline', 'container',
      'searchBox', 'teamFilter', 'sortSelect', 'issuesPanel',
      'summaryBox', 'runbookFileInput', 'favicon',
    ];
    for (const id of ids) {
      if (!document.getElementById(id)) {
        const el = document.createElement(id === 'searchBox' ? 'input' :
                                           id === 'teamFilter' || id === 'sortSelect' ? 'select' :
                                           id === 'runbookFileInput' ? 'input' :
                                           id === 'favicon' ? 'link' :
                                           id === 'clientLogo' ? 'img' : 'div');
        el.id = id;
        document.body.appendChild(el);
      }
    }
    // Add data-action buttons
    const actions = ['save', 'reload', 'load-file', 'phone-export', 'email-export',
                     'gantt-export', 'summary', 'export-json', 'expand-all', 'collapse-all', 'reset'];
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.setAttribute('data-action', a);
      document.body.appendChild(btn);
    }
    // Add header elements
    const h1 = document.createElement('h1');
    const headerDiv = document.createElement('div');
    headerDiv.className = 'header';
    headerDiv.appendChild(h1);
    document.body.appendChild(headerDiv);

    // Mock fetch for config.json and runbook.json
    const { vi } = await import('vitest');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false, status: 404,
      json: () => Promise.reject(),
    });

    // Import should not throw
    await expect(import('../dashboard/app.js')).resolves.toBeDefined();
  });
});
