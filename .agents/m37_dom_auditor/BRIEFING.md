# BRIEFING — 2026-09-15T07:30:00Z

## Mission
Conduct an in-depth audit of BottomDashboard.ts, InputHandler.ts, and Game.ts for DOM node retention, detached elements, and memory leaks; verify zero-GC HUD updates and mode switching; write tests/unit/adversarial_m37_dom_audit.test.ts; produce handoff.md and notify parent.

## 🔒 My Identity
- Archetype: explorer
- Roles: Detached DOM & Listener Leak Auditor
- Working directory: /Users/user/src/galog/.agents/m37_dom_auditor
- Original parent: 820e6697-1fa9-4dc4-b5b2-c3abf790c1e9
- Milestone: M37

## 🔒 Key Constraints
- Read-only investigation — do NOT modify core source code
- Create empirical verification test tests/unit/adversarial_m37_dom_audit.test.ts
- Provide handoff report in handoff.md

## Current Parent
- Conversation ID: 820e6697-1fa9-4dc4-b5b2-c3abf790c1e9
- Updated: 2026-09-15T07:30:00Z

## Investigation State
- **Explored paths**:
  - `src/ui/BottomDashboard.ts`: Symmetrical dual HUD dirty checking, chip pools, mode switching, life icons, preallocated frozen string arrays, and teardown.
  - `src/ui/InputHandler.ts`: Event listener lifecycle across window, document, canvas, and DOM touch controls; reset/destroy cleanup.
  - `src/core/Game.ts`: Subsystem cascade destruction, canvas creation/retention, telemetry update loop, and toggle button binding.
  - `src/ui/FullscreenManager.ts`: `bindToggleButton` listener leak identification.
  - `src/audio/AudioContextManager.ts`: Auto-unlock window listener lifecycle identification.
  - `src/core/ScreenManager.ts`: Window resize listener lifecycle.
  - `src/main.ts`: Application bootstrap and SPA teardown gap analysis.
- **Key findings**:
  1. `BottomDashboard.update()` strictly honors zero-GC dirty checking: 10,000 steady-state frames produce exactly 0 textContent, style, classList, attribute, or tree mutations.
  2. Frozen lookup tables (`PERCENT_STRINGS`, `REVIVE_COUNTDOWN_STRINGS`, `REVIVE_P1_STRINGS`, `REVIVE_P2_STRINGS`) and `formatScore6` dirty check eliminate heap string allocation in the steady-state loop.
  3. Power-up chips (`chipPool`, `chipPoolP1`, `chipPoolP2`) are strictly reused via pooling; inactive chips are unmounted without destroying element instances or creating new ones upon reactivation.
  4. Mode switching (`setMode('coop')` <-> `setMode('single')`) across 100 cycles creates 0 orphaned DOM elements and 0 duplicate listeners; action buttons and high-score entries reparent with 100% node identity preservation.
  5. Critical finding 1 (Listener Leak in `Game.ts` / `FullscreenManager.ts`): `Game.ts:334` calls `this.fullscreenManager.bindToggleButton(btnFullscreen)` which binds a `click` listener and returns an unbind closure, but neither `Game` nor `FullscreenManager.destroy()` tracks or executes this unbind callback, permanently leaking a `click` listener on `#btn-fullscreen` across Game instances.
  6. Critical finding 2 (Listener Leak in `AudioContextManager.ts`): Window auto-unlock listeners (`pointerdown`, `touchstart`, `keydown`, `mousedown`) are attached by `attachAutoUnlockListeners()` but never detached in `Game.destroy()` if the game is destroyed prior to user interaction.
  7. Optimization finding 3 (Reference Retention in `InputHandler.ts`): `InputHandler.destroy()` removes all listeners correctly, but retains DOM element references (`this.canvas`, `this.domBtnLeft`, `this.domBtnRight`, `this.domBtnFire`, `this.domBtnSpecial`) rather than nulling them.
  8. Optimization finding 4 (QuerySelector overhead in `BottomDashboard.setMode()`): `this.zoneLeft?.querySelector('.dash-lives-rack')` is queried dynamically on each mode switch instead of using a cached member property `this.elSingleLivesRack`.
  9. Optimization finding 5 (Missing SPA Teardown in `main.ts`): No exported `teardown()` function exists to cleanly unmount `gameInstance`.
- **Unexplored areas**: None for M37 DOM audit scope.

## Key Decisions Made
- Created and verified comprehensive unit test `tests/unit/adversarial_m37_dom_audit.test.ts` (20/20 tests passing 100%).
- Formulated exact remediation blueprint for Milestone M38 swarm.

## Artifact Index
- `.agents/m37_dom_auditor/DISPATCH.md` — Initial dispatch prompt
- `.agents/m37_dom_auditor/BRIEFING.md` — Agent state and findings index
- `.agents/m37_dom_auditor/progress.md` — Liveness and step tracking
- `tests/unit/adversarial_m37_dom_audit.test.ts` — Empirical verification test suite (20/20 passed)
- `.agents/m37_dom_auditor/handoff.md` — Final 5-component handoff report for M38 swarm
