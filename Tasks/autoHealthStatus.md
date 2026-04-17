# Auto-Health Status — Feature Specification

## What It Is

An automated health-assessment feature that periodically evaluates dashboard metrics
(blocking tasks, overdue tasks) and sets the health status (Green / Amber / Red)
without requiring manual operator intervention.

---

## Phase 1 — Sentinel Strip UI + Assessment Engine

### Why NOT a round button

| Problem | Detail |
|---------|--------|
| Ambiguous state | A round button conveys "press me" but not whether automation is running, paused, or what it is monitoring |
| No countdown visibility | Operators need to glance and know "next check in 2:14" without hovering |
| Stressful context | Go-live operators are under pressure — controls should be self-labelling |
| Orphaned visually | A circle floating between panels breaks the horizontal card rhythm without adding meaning |

### Proposed design: Sentinel Strip

A slim full-width monitoring bar inserted between the stat cards and the category
stepper. NOT a stat card (no large number, no rounded box). Inspired by vital-signs
monitors — appropriate for a go-live context.

```
▐ ● AUTO-HEALTH   Blocking: 0 · Overdue: 0 → Green     Next check: 1:47   ⏸
```

#### Anatomy

| Element | Purpose |
|---------|---------|
| 4 px left accent border | Current health color, always visible |
| Pulsing dot (●) | Heartbeat animation — signals live monitoring |
| Assessment summary | Self-documenting: operator sees WHY health is Green |
| Countdown | "Next check: 1:47" — always visible, ticks every second |
| ⏸ / ▶ toggle | Single click to pause/resume; strip dims when paused |

#### States

| State | Appearance |
|-------|-----------|
| **Active** | Left border + pulsing dot = current health color; countdown ticking |
| **Paused** | Opacity 0.55, border grey, dot grey; label changes to "MANUAL OVERRIDE" |
| **Disabled** | `display:none`; re-enabled via "Enable auto-health" link near health dots |

#### Manual override interaction
Clicking a health dot (GO / AT RISK / STOP) in the header automatically pauses the
automation, indicating the operator has taken manual control. Strip shows "MANUAL OVERRIDE".
Clicking ▶ in the strip resumes auto-health from that moment.

---

## Auto-Health Logic

Evaluated every `intervalSec` seconds (default: 120 s, configurable via `config.json`).

```
blocking = count of tasks with status "Blocking"
overdue  = count of non-Completed/Unneeded tasks whose estimatedEnd < now

if blocking >= 3 OR overdue >= 4  → Red
elif blocking > 0 OR overdue > 0  → Amber
else                               → Green
```

Configurable key in `config.json`:
```json
{ "autoHealthIntervalSec": 120 }
```

---

## Theme Integration

All colors use existing CSS custom properties — zero new tokens required:

```css
.sentinel-strip {
    border-left: 4px solid var(--sentinel-color);   /* set inline by JS */
    background: var(--glass-bg, var(--card-bg));
    border-top: 1px solid var(--glass-border, var(--card-border));
    backdrop-filter: blur(var(--glass-blur, 0));
}
.sentinel-strip.paused { opacity: 0.55; }

@keyframes sentinel-pulse {
    0%, 100% { box-shadow: 0 0 0 0 var(--sentinel-color); }
    50%       { box-shadow: 0 0 8px 3px var(--sentinel-color); }
}
.sentinel-dot { animation: sentinel-pulse 2.4s ease-in-out infinite; }
```

`--sentinel-color` is set inline to `var(--health-green)` / `var(--health-amber)` /
`var(--health-red)` — these already have light-mode overrides in the theme.

---

## Files To Create / Modify

| File | Action |
|------|--------|
| `dashboard/actions/autoHealth.js` | **CREATE** — timer + assessment logic |
| `dashboard/render/autoHealthBar.js` | **CREATE** — sentinel strip DOM renderer |
| `runbookDashboard.html` | **MODIFY** — add `#autoHealthBar` div + CSS |
| `dashboard/app.js` | **MODIFY** — wire start + toggle handler |
| `dashboard/actions/health.js` | **MODIFY** — pause auto-health on manual override |
| `config.json` | **MODIFY** (optional) — add `autoHealthIntervalSec` |
| `tests/autoHealth.test.js` | **CREATE** — unit tests |

---

## API of `dashboard/actions/autoHealth.js`

```js
export function startAutoHealth(intervalSec = 120)  // starts timer, applies immediately
export function stopAutoHealth()                     // clears timer
export function pauseAutoHealth()                    // pauses; keeps timer, skips apply
export function resumeAutoHealth()                   // unpauses
export function assessHealth()                       // returns 'Green'|'Amber'|'Red'
export function getAutoHealthState()                 // { enabled, paused, nextCheckTs, intervalSec }
```

## API of `dashboard/render/autoHealthBar.js`

```js
export function renderAutoHealthBar()   // builds / updates #autoHealthBar innerHTML
export function startCountdownTick()    // setInterval(renderAutoHealthBar, 1000)
export function stopCountdownTick()
```

---

## Unit Test Coverage (`tests/autoHealth.test.js`)

- `assessHealth()` returns Green when no blocking / overdue tasks
- `assessHealth()` returns Amber when 1 blocking task exists
- `assessHealth()` returns Red when 3+ blocking tasks
- `startAutoHealth()` sets `enabled: true`
- `pauseAutoHealth()` / `resumeAutoHealth()` toggle `paused` correctly
- Manual health-dot click triggers `pauseAutoHealth()`
- `renderAutoHealthBar()` shows "MANUAL OVERRIDE" when paused

---

## Verification Steps

1. `npm test` — all existing + new tests pass
2. `node _serve.js` → open `http://localhost:8090`
3. Load a runbook — sentinel strip appears below stat cards, pulsing green
4. Add 3+ blocking tasks → strip turns red within 2 min (or reduce interval for testing)
5. Click ⏸ → strip dims, label shows "MANUAL OVERRIDE"
6. Click a health dot manually → auto-health pauses automatically
7. Click ▶ → auto-health resumes
8. Toggle to light theme → all colors adjust automatically via CSS vars

---

## Status

| Phase | Status |
|-------|--------|
| Phase 1 — Sentinel Strip + Assessment Engine | **Planned** |
| Phase 2 — Configurable rules via `config.json` | Backlog |
| Phase 3 — Notification / toast on auto-change | Backlog |
