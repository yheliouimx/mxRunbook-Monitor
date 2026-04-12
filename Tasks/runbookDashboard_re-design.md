# Runbook Dashboard — Re-Design Backlog

> Generated: 2026-04-12
> Prerequisite: Complete current refactoring first. These proposals target the HTML/CSS and render JS files only.

---

## P0 — Critical (Do First)

### ~~1. Max-width + centered layout~~ ✅ Done (2026-04-12)
- ~~Add `max-width: 1280px; margin: 0 auto` to the body or a wrapper~~
- ~~Prevents content stretching on wide monitors~~
- **Files:** `runbookDashboard.html` (CSS)

### ~~2. Replace neon palette with config-driven accent color~~ ✅ Done (2026-04-12)
- ~~`accentColor` from `config.json` is applied as `--color-primary` across the dashboard~~
- ~~Default corporate palette (emerald `#10b981`); neon palette preserved via `[data-palette="neon"]` toggle~~
- ~~Palette toggle button added; preference persisted in localStorage~~
- **Files:** `runbookDashboard.html`, `dashboard/app.js`, `dashboard/render/stats.js`, `dashboard/render/categories.js`

### ~~3. Semantic CSS variable system~~ ✅ Done (2026-04-12)
- ~~80+ atomic vars now alias semantic tokens (`--color-success`, `--color-warning`, `--color-danger`, etc.)~~
- ~~4 CSS cascade layers: `:root` (corporate dark) → `[data-palette="neon"]` → `[data-theme="light"]` → `[data-theme="light"][data-palette="neon"]`~~
- ~~Hardcoded hex colors removed from JS render files~~
- **Files:** `runbookDashboard.html` (`:root`, `[data-palette]`, `[data-theme]` blocks)

---

## P1 — High (Visual Polish)

### 4. Typography upgrade
- Replace `'Segoe UI', system-ui` with a distinctive sans-serif (e.g. DM Sans, IBM Plex Sans, Outfit)
- Replace `'Consolas'` with a modern monospace (e.g. JetBrains Mono, IBM Plex Mono)
- Add a proper type scale as CSS custom properties: `--text-xs` through `--text-3xl`
- Use a bolder/different face for the page title `h1`
- **Files:** `runbookDashboard.html` (`<head>` for font loading, CSS body/font rules)

### 5. Smooth accordion animations
- Current: `.tasks` toggles `display: none/block` — instant appearance
- Target: `max-height` + `overflow: hidden` transition, or CSS `grid-template-rows: 0fr → 1fr`
- Also animate the issue form open/close
- **Files:** `runbookDashboard.html` (CSS `.tasks`, `.issue-add-form`), `dashboard/render/categories.js`

### 6. Sticky filter bar
- Make `.controls` stick below the header on scroll (`position: sticky; top: 0; z-index: 10`)
- Add a subtle background/backdrop-blur and bottom border when stuck
- **Files:** `runbookDashboard.html` (CSS `.controls`)

### 7. Accessible filter buttons
- Convert `div.filterBtn` to `<button>` elements
- Add `aria-pressed` toggling
- Add visible `:focus-visible` ring styles
- **Files:** `runbookDashboard.html` (markup + CSS)

### 8. Compact top bar header
- Replace centered decorative header with a compact top bar layout
- Logo left, project name + subtitle center/left, theme toggle + settings right
- Reduce vertical space consumed by the header section
- **Files:** `runbookDashboard.html` (markup + CSS `.header`)

---

## P2 — Medium (Feature & UX Enhancements)

### 9. Timeline → horizontal stepper/pipeline
- Replace current tag-pill list with a connected node stepper (dots + lines)
- Nodes colored by category status, connected by a progress line
- Clicking a node scrolls to the category (keep current behavior)
- **Files:** `dashboard/render/timeline.js`, `runbookDashboard.html` (CSS `#timeline`, `.timelineItem`)

### 10. Action button grouping + overflow menu
- Group into: Primary (`Save`), Secondary (`Reload`, `Load File`), Export (dropdown menu for Phone/Email/Gantt/JSON/Summary)
- Add `Expand All` / `Collapse All` as icon-only toggle buttons
- Reduce visual clutter from 9 flat buttons
- **Files:** `runbookDashboard.html` (markup `.actions`), likely new CSS for dropdown

### 11. Loading skeleton
- Show skeleton cards (pulsing gray placeholders) during `loadRunbook()` instead of empty page
- Remove skeleton after `render()` completes
- **Files:** `runbookDashboard.html` (add skeleton markup/CSS), entry-point `<script>`

### 12. Responsive breakpoints
- Add `@media (max-width: 768px)` for tablet: stack stats, collapse filter group
- Add `@media (max-width: 480px)` for mobile: single-column, hamburger for actions
- Fix touch targets (minimum 44px)
- **Files:** `runbookDashboard.html` (CSS media queries)

### 13. Styled confirmation modals
- Replace `confirm()` calls (e.g. reset runbook, delete issue) with styled modal dialogs
- Match dashboard theme, include clear destructive-action styling
- **Files:** `runbookDashboard.html` (new modal CSS), `dashboard/render/issues.js`, reset function

### 14. Page load animation
- Staggered fade-in on stat cards and category cards using `animation-delay`
- Progress bar fill animation on initial render
- **Files:** `runbookDashboard.html` (CSS `@keyframes`), `dashboard/render/stats.js`, `dashboard/render/categories.js`

---

## P3 — Low (Product Hardening)

### 15. Full ARIA + keyboard navigation
- Add `role="region"`, `aria-expanded`, `aria-label` to category accordions
- Add `aria-live="polite"` to toast
- Add keyboard navigation for status popups (arrow keys, Escape to close)
- Add skip-to-content link
- **Files:** `runbookDashboard.html`, `dashboard/render/categories.js`, `dashboard/render/issues.js`

### 16. White-label theme support
- Support optional `theme.css` override file loaded after main styles
- Add `themePreset` to `config.json`: `"dark"` | `"light"` | `"auto"`
- Curate the light theme as a distinct design (not just inverted dark values)
- **Files:** `runbookDashboard.html` (`<head>`), config loading logic

### 17. Print stylesheet
- Add `@media print` rules: hide controls/actions, force light background, optimize layout
- **Files:** `runbookDashboard.html` (CSS)

### 18. URL-based state
- Persist filter, search, sort, and expanded categories in URL query params
- Enables sharing a specific view with teammates
- **Files:** entry-point `<script>`, `dashboard/state.js`

### 19. User avatar/initials for assignees
- Replace plain text assignee tags with colored initials circles (e.g. `AB` in a colored circle)
- Color derived from assignee name hash for consistency
- **Files:** `dashboard/render/categories.js`, `runbookDashboard.html` (CSS)

### 20. Status shape differentiation (colorblind support)
- Add shape/icon differentiation to status indicators alongside color
- Done: checkmark, In Progress: arrow, Not Started: empty circle, Blocked: cross
- Already partially done in `.task-status-btn` — extend to `.task-status-dot` and `.timelineItem`
- **Files:** `runbookDashboard.html` (CSS), `dashboard/render/categories.js`, `dashboard/render/timeline.js`

---

## Design Tokens — Reference Palette

Target palette shift (replace neon with corporate):

| Token | Dark Theme | Light Theme |
|-------|-----------|-------------|
| `--color-primary` | `{accentColor}` | `{accentColor}` |
| `--color-success` | `#10b981` | `#059669` |
| `--color-warning` | `#f59e0b` | `#d97706` |
| `--color-danger` | `#ef4444` | `#dc2626` |
| `--color-surface` | `#111118` | `#ffffff` |
| `--color-surface-elevated` | `#1a1a22` | `#f8f9fa` |
| `--color-text-primary` | `#e4e4e7` | `#18181b` |
| `--color-text-secondary` | `#71717a` | `#52525b` |
| `--color-border` | `#27272a` | `#e4e4e7` |

## Font Pairing Candidates

| Role | Option A | Option B | Option C |
|------|----------|----------|----------|
| Display/Headings | Clash Display | Satoshi | Plus Jakarta Sans |
| Body | DM Sans | IBM Plex Sans | Outfit |
| Monospace/Data | JetBrains Mono | IBM Plex Mono | Fira Code |
