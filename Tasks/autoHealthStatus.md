# Auto Health Status — Design Analysis & Implementation Plan

## Context & Intent

The current dashboard displays running time based on real-time progression, which makes it difficult to assess whether the client process is actually progressing according to plan. The intent is to introduce a mechanism that allows time tracking to start only when the client process effectively begins, rather than relying on absolute clock time.

---

## 1. Is this a good idea operationally?

**Yes, with caveats.** Go-live events are time-critical and the current dashboard only answers *"what has been done"* — not *"are we going to finish on time"*. The gap between completion % and time % is genuinely the most useful early-warning signal during a run.

The main risk already identified: **the health auto-update is only as good as the estimation data.** If `estimatedEnd` fields are sparse or optimistic, the indicator will create noise rather than signal. A misleading "Red" health during a go-live is arguably worse than no indicator at all.

A second operational risk: **scheduled pauses and wait states are not captured**. If the runbook has a "Wait for system restart (30 min)" step, the timer shouldn't count that as delay. Without pause/resume this degrades quickly in practice.

---

## 2. Where to Integrate

The existing architecture has natural anchor points:

| Location | What fits |
|---|---|
| **Header / stat cards area** | A `RUN TIMER` card showing elapsed time and a `[▶ Start Run]` / `[⏸ Pause]` button — keeps it global and visible at a glance |
| **Completion % stat card** | A secondary "time %" row under the completion %, showing `Elapsed 1h 20m / Est. 3h 00m (44%)` — this is where the delta makes most sense |
| **Timeline stepper** | Per-phase estimated duration badge on each node — ties naturally into the existing category structure |
| **Health indicator** | Keep manual override as primary; add auto-advisory as a **suggestion** with a small badge `⚠ auto` so the operator can accept or dismiss it — never override manual without confirmation |

The **least invasive high-value starting point** is a global timer in the stats area + a second progress bar under the completion bar.

---

## 3. Minimum Data and Rules to Avoid Misleading Indicators

### Minimum viable data requirement

The timer needs a total estimated duration. The cleanest derivation:
- Use the **latest `estimatedEnd`** value across all tasks minus the `runStart` timestamp
- This only works if at least one task has `estimatedEnd` and that task is logically the last

If using per-task `estimatedEnd`, surface coverage: if fewer than ~60% of tasks have this field, suppress the time-progress indicator entirely and show an "Insufficient estimation data" warning instead.

### Rules

```
runStart          — stored in state + localStorage when ▶ Start pressed
pausedDuration    — accumulated pause time (supports pause/resume)
elapsedMs         — (now - runStart) - pausedDuration

timeProgress %    — elapsedMs / totalEstimatedMs × 100
completionPct     — existing (done + unneeded) / total × 100

delta             — completionPct - timeProgress

Health advisory:
  delta > +5%     → "Ahead"    (suppress auto; manual can still be Amber/Red)
  delta ≥ -10%    → "On track" → advisory Green
  delta ≥ -25%    → "At risk"  → advisory Amber
  delta < -25%    → "Delayed"  → advisory Red
```

> Threshold values should be configurable in `config.json` — different clients have different risk tolerances.

### Edge cases to handle

| Case | Behaviour |
|---|---|
| Run not started yet | Show `[▶ Start Run]`; all time-progress indicators hidden |
| Run paused | Elapsed counter frozen; delta frozen; no health change |
| All tasks Completed | Show final elapsed time; freeze timer |
| `estimatedEnd` < `runStart` (bad data) | Suppress indicator; show data warning |
| Page refresh / localStorage restore | Restore `runStart`, `pausedDuration` from persisted state |

---

## Recommended Implementation Path

### Phase 1 — Timer + Elapsed Display (low risk, high value)
- Add `runStart`, `pausedDuration`, `timerState` to `dashboard/state.js`
- Add `[▶ Start Run]` / `[⏸ Pause]` / `[⏹ Stop]` controls to the header
- Add a **RUN TIMER** stat card showing elapsed time
- Persist timer state to localStorage
- **No health auto-update yet** — lets the team validate UX and data quality first

### Phase 2 — Time Progress Bar + Delta
- Add a time progress bar alongside the existing completion bar
- Show explicit delta: `(+12% ahead)` / `(-8% behind)`
- Suppress bar entirely when estimation coverage < 60%

### Phase 3 — Health Advisory
- Add auto-advisory health suggestion with a visible `⚠ auto` badge
- Manual override always preserved and always takes precedence
- Operator can accept or dismiss the advisory — automation informs, never overrides
- Thresholds exposed in `config.json`

---

## Files to Modify

| File | Change |
|---|---|
| `dashboard/state.js` | Add `runStart`, `pausedDuration`, `timerState`, `timerInterval` |
| `dashboard/persistence.js` | Persist/restore timer fields in localStorage |
| `dashboard/actions/` | New `timer.js` — start, pause, resume, stop logic |
| `dashboard/render/stats.js` | Add RUN TIMER card; add time progress bar |
| `dashboard/selectors.js` | Add `getTotalEstimatedMs()`, `getTimeDelta()`, `getEstimationCoverage()` |
| `dashboard/app.js` | Wire timer button events; integrate advisory into health render |
| `runbookDashboard.html` | Add timer control buttons; add CSS for time bar and delta badge |
| `config.json` | Add `healthThresholds: { ahead, onTrack, atRisk }` |
