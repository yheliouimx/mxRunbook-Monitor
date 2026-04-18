# Auto-Health Status — Feature Specification

## What It Is

A run-timer and health-advisory system that tracks elapsed time, compares it against
task completion, and advises (never silently overrides) the health status. All three
phases are surfaced through a single **Sentinel Strip** — a slim monitoring bar sitting
between the stat cards and the category stepper.

---

## Sentinel Strip — Design Rationale

### Why NOT a round button

| Problem | Detail |
|---------|--------|
| Ambiguous state | A button conveys "press me" but not whether the timer is running, paused, or what it monitors |
| No glanceable data | Operators need to see elapsed time and delta at a glance during a stressful go-live |
| Stressful context | Controls should be self-labelling — no icon guessing under pressure |
| Orphaned visually | A circle floating between panels breaks the horizontal card rhythm without adding meaning |

### Why NOT a stat card (old Phase 1 design)

The original Phase 1 implementation placed the timer inside a `.stat-card.timer` alongside
Total / Done / In Prog / Not Started cards. This creates visual noise: the card looks like a
statistic but contains interactive buttons, and its rectangular shape makes it indistinguishable
from the data cards at a glance.

### The Sentinel Strip

A slim full-width monitoring bar. Not a card, not a button — closer to a vital-signs monitor
line, which is appropriate for a go-live context.

```
▐ ● 01:23:45  Done ████████░░ 52%  Time ██████░░░░ 40%  +12% ahead  ⚠ Auto: Amber [Accept]  ⏸  ⏹
```

#### Visual anatomy

| Element | Purpose |
|---------|---------|
| 4 px left accent border | Current advisory health color — changes automatically |
| Pulsing dot (●) | Heartbeat animation while running; static when paused/stopped |
| Elapsed `HH:MM:SS` | Timer value — monospace, always visible |
| Done / Time bars | Phase 2 — dual mini progress bars (completion % vs time %) |
| Delta badge | Phase 2 — `+12% ahead` / `-8% at risk` etc. |
| `⚠ Auto: Amber [Accept]` | Phase 3 — advisory block, only shown when advisory ≠ current health |
| ▶ / ⏸ / ⏹ buttons | Timer controls |

#### States

| State | Appearance |
|-------|-----------|
| **Stopped** | Grey left border, `—` elapsed, only `▶ Start Run` visible |
| **Running** | Health-colored pulsing border and dot; countdown live |
| **Paused** | Amber border; opacity 0.82; `▶ Resume` + `⏹` visible |

---

## Phase 1 — Run Timer ✅

### What it does
Tracks elapsed wall-clock time from when `▶ Start Run` is pressed, subtracting any
paused periods. Persists across page refreshes via localStorage.

### State (`dashboard/state.js`)
```js
runStart:       null,      // Date.now() ms when run was started
pausedDuration: 0,         // accumulated pause time in ms
pauseStart:     null,      // Date.now() when current pause began
timerState:     "stopped", // "stopped" | "running" | "paused"
```

### Key functions (`dashboard/actions/timer.js`)
```js
export function startTimer()       // sets runStart, timerState = "running"
export function pauseTimer()       // records pauseStart, timerState = "paused"
export function resumeTimer()      // accumulates pausedDuration, clears pauseStart
export function stopTimer()        // resets all timer state
export function getElapsedMs()     // (now - runStart) - pausedDuration
export function formatElapsed(ms)  // → "HH:MM:SS"
```

### Storage
`dashboard/persistence.js` — `saveTimerState()` / `loadTimerState()` using key
`${prefix}runbook_timer` in localStorage.

---

## Phase 2 — Time Progress Bar + Delta ✅

### What it does
Compares elapsed time % against completion % to show whether the run is ahead of or
behind schedule. Suppressed when `estimatedEnd` data coverage is below 60%.

### Key functions (`dashboard/selectors.js`)

```js
export function getTotalEstimatedMs()
// Finds the latest estimatedEnd across all tasks.
// Returns (latestEstimatedEnd - runStart) ms, or null if data unavailable.

export function getEstimationCoverage()
// Returns fraction (0–1) of non-Unneeded tasks that have estimatedEnd.

export function getTimeDelta()
// Returns { timeProgressPct, completionPct, deltaPct } or null when suppressed.
// Suppressed when: timer stopped, no runStart, coverage < 60%, no totalEstimatedMs.
```

### Delta → badge text

| deltaPct | Badge class | Text |
|----------|-------------|------|
| `> +5`   | `ahead`     | `+N% ahead` |
| `≥ -10`  | `ontrack`   | `±N% on track` |
| `≥ -25`  | `atrisk`    | `−N% at risk` |
| `< -25`  | `delayed`   | `−N% delayed` |

---

## Phase 3 — Health Advisory ✅

### What it does
Translates the delta into a health advisory (Green / Amber / Red). Displayed as a
`⚠ Auto: Amber` badge in the sentinel strip with an **Accept** button. The operator
always has final say — the advisory is never auto-applied without a click.

### Logic (`dashboard/selectors.js`)

```js
export function getHealthAdvisory()
// Returns 'Green' | 'Amber' | 'Red' | null
// null when: timer stopped, no time delta data, or delta > ahead threshold
```

### Thresholds (`config.json`)

```json
"healthThresholds": {
  "ahead":   5,    // delta >  5% → no advisory (suppress — doing great)
  "onTrack": -10,  // delta ≥ -10% → Green
  "atRisk":  -25   // delta ≥ -25% → Amber; below → Red
}
```

### Advisory interaction
1. `updateSentinelBar()` runs every second via `setInterval`
2. If advisory ≠ `state.healthStatus` → show `⚠ Auto: <status>` badge + **Accept** button
3. Operator clicks **Accept** → `setHealth(advisory)` called, page re-renders
4. Advisory = current health → badge hidden (no noise when consistent)
5. Strip left border color = advisory health color while running, overriding the
   timer-state default color so the health signal has primary visual prominence

---

## Theme Integration

All colors use existing CSS custom properties — zero new color tokens required:

```css
.sentinel-strip {
    border-left: 4px solid var(--sentinel-color, var(--text-muted));
    /* --sentinel-color set inline by JS to var(--health-green/amber/red) */
}
.sentinel-strip.sentinel-running { --sentinel-color: var(--color-success); }
.sentinel-strip.sentinel-paused  { --sentinel-color: var(--color-warning); }
.sentinel-strip.sentinel-stopped { --sentinel-color: var(--text-muted); }
```

`--health-green` / `--health-amber` / `--health-red` already have light-mode overrides
so dark ↔ light theme switching is automatic.

---

## Files Modified / Created

| File | Change |
|------|--------|
| `dashboard/actions/timer.js` | Phase 1 — timer logic (unchanged from original) |
| `dashboard/state.js` | Phase 1 — timer state fields (unchanged) |
| `dashboard/persistence.js` | Phase 1 — timer persistence (unchanged) |
| `dashboard/selectors.js` | Phase 2+3 — added `getTotalEstimatedMs`, `getEstimationCoverage`, `getTimeDelta`, `getHealthAdvisory` |
| `dashboard/render/stats.js` | Replaced `.stat-card.timer` + `updateTimerDisplay` with `updateSentinelBar` |
| `runbookDashboard.html` | Replaced old timer CSS with sentinel CSS; added `#sentinelBar` static HTML |
| `dashboard/app.js` | Rewired sentinel button listener; updated setInterval target |
| `config.json` | Added `healthThresholds` block |

---

## Verification Steps

1. `npm test` — all tests pass
2. `node _serve.js` → open `http://localhost:8090`
3. Load a runbook — sentinel strip appears below stat cards, grey left border, `—` elapsed
4. Click `▶ Start Run` → border turns green, dot pulses, timer ticks
5. With ≥ 60% `estimatedEnd` coverage: dual progress bars and delta badge appear
6. Let time progress past completion % → delta badge turns amber/red; advisory badge shows
7. Click **Accept** → health dot updates, advisory badge clears
8. Click ⏸ → strip dims, border goes amber, timer freezes; ▶ Resume restores it
9. Toggle light theme → all colors adjust automatically

---

## Status

| Phase | Status |
|-------|--------|
| Phase 1 — Run Timer + Sentinel Strip redesign | ✅ Complete |
| Phase 2 — Time Progress Bar + Delta | ✅ Complete |
| Phase 3 — Health Advisory | ✅ Complete |
| Phase 4 — Configurable thresholds via `config.json` | ✅ Complete |
| Phase 5 — Toast notification on advisory change | Backlog |
