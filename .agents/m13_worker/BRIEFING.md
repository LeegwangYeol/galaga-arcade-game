# BRIEFING — 2026-09-04T19:25:00+09:00

## Mission
Implement Milestone 13: Allies Support System (Escort Drone, Kinetic Aegis Drone, Bomber Drone) & 3 Special Moves (Nova Barrage, Chrono Freeze, Dimensional Warp Ram), procedural pixel bit-matrices, HUD meter, controls, zero-GC pools, and comprehensive unit tests.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /Users/user/teamwork_projects/galaga_game/.agents/m13_worker
- Original parent: e83ea4b9-cadd-4692-a6bc-95743f0dd928
- Milestone: Milestone 13 (Allies Support System & 3 Special Moves)

## 🔒 Key Constraints
- Pure Canvas pixel bit-matrices in SpriteRenderer.ts & Web Audio procedural sound synthesis (0 external image or audio files).
- Zero runtime GC allocations in 60 FPS update loops (ObjectPool with static bounds, zero heap churn).
- Maintain 100% pass on all 863 existing tests with 0 regressions.
- Strict write ownership: src/core/allies/**, src/core/specials/** (or src/core/special/**), src/renderer/SpriteRenderer.ts, src/ui/HUD.ts, src/ui/InputHandler.ts, src/entities/Bullet.ts, src/core/Game.ts, tests/unit/m13_*.test.ts.
- Deliver genuine implementations: no cheating, no facades, no hardcoded test strings.
- Complete 5-component handoff report in handoff.md and notify parent via send_message.

## Current Parent
- Conversation ID: e83ea4b9-cadd-4692-a6bc-95743f0dd928
- Updated: 2026-09-04T19:25:00+09:00

## Task Summary
- **What to build**:
  1. Allies Support System (3 Drones): Escort, Aegis, Bomber, and AlliesManager.
  2. 3 Special Moves: Energy Gauge [0..100], Nova Barrage, Chrono Freeze, Dimensional Warp Ram.
  3. Procedural Assets & Zero-GC Invariant.
  4. Integration and full regression coverage.
- **Success criteria**: All 863 baseline tests + 45 new tests pass (908 total), clean TypeScript build, 0 errors.

## Key Decisions Made
- Implemented `AlliesManager` with persistent drone singletons and bounded ObjectPools (16 bombs, 16 explosions).
- Implemented `SpecialMovesManager` with bounded ObjectPools (32 missiles, 32 sparks).
- Handled Chrono Freeze via dual timestep splitting: `playerDt = dt`, `enemyDt = isChronoFrozen ? 0 : dt`, freezing enemy bullets, diving curves, boss AI, and formation oscillation without freezing the master state machine or player controls.
- Drone bullets routed through dedicated `activeDroneBulletCount` to ensure zero starvation of the player's 2/4 manual missile quota.
- Added virtual touch `#btn-special` button to mobile overlay in `index.html` and bound in `InputHandler.ts`.
- Integrated HUD special energy gauge at center-bottom (X=72, Y=278) with 10 discrete segments and 8Hz gold/white flashing when fully charged.

## Artifact Index
- DISPATCH.md — Assignment instructions
- BRIEFING.md — Situational awareness
- progress.md — Liveness heartbeat
- handoff.md — Final hard handoff report

## Change Tracker
- **Files modified**:
  - `src/types/index.ts`: added 'DRONE' to `BulletOwner` union.
  - `src/core/allies/**`: complete Allies Support System.
  - `src/core/specials/**`: complete Special Moves Subsystem (and symlinked `src/core/special`).
  - `src/renderer/SpriteRenderer.ts`: procedural pixel bit-matrices for drones, bombs, sparks, beams, frost.
  - `src/entities/Bullet.ts`: drone bullet ownership, quota isolation, and dual dt update.
  - `src/ui/HUD.ts`: special gauge rendering with 10 segments and ready flashing.
  - `src/ui/InputHandler.ts`: KeyX, KeyC, Gamepad, and touch special move triggers.
  - `index.html`: `#btn-special` DOM button and styling.
  - `src/core/Game.ts`: subsystem lifecycles, Chrono Freeze dt splitting, collision hooks, spark drops, HUD state.
  - `tests/unit/m13_allies_drones.test.ts`: 17 tests.
  - `tests/unit/m13_special_moves.test.ts`: 14 tests.
  - `tests/unit/m13_zerogc_stress.test.ts`: 5 tests (10,000-tick continuous endurance).
  - `tests/unit/m13_regression_guard.test.ts`: 9 tests.
- **Build status**: `npm run build` succeeds cleanly in 306ms; `npm test` passes 50/50 test files, 908/908 tests.
- **Pending issues**: None.

## Quality Status
- **Build/test result**: 908 passed, 0 failed.
- **Lint status**: Clean (tsc --noEmit passed).
- **Tests added/modified**: 45 new tests authored across 4 test suites.

## Loaded Skills
- None
