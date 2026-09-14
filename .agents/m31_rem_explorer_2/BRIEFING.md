# BRIEFING — 2026-09-14T09:18:00Z

## Mission
Investigate failure & fix strategy for M31-DEFECT-01 (ScoreManager and Game callbacks multi-player support and backward compatibility).

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /Users/user/src/galog/.agents/m31_rem_explorer_2
- Original parent: 0236827c-a7d2-4115-a374-2f5c45ed8134
- Milestone: M31 Iteration 2

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- ALWAYS wait for explicit user approval before proceeding with implementation
- Communicate with Claude via Rule Guide (Markdown) COLLABORATION.md
- Output handoff report to /Users/user/src/galog/.agents/m31_rem_explorer_2/handoff.md

## Current Parent
- Conversation ID: 0236827c-a7d2-4115-a374-2f5c45ed8134
- Updated: 2026-09-14T09:18:00Z

## Investigation State
- **Explored paths**:
  - `src/systems/ScoreManager.ts`: inspected all properties, callbacks, addScore, threshold, telemetry, and accessor methods.
  - `src/core/Game.ts`: examined `setupPlayerCallbacks`, `onExtraLife`, bullet recycling, collision resolutions, and stage clear hooks.
  - `src/entities/Player.ts`: inspected all callback definitions and closures.
  - `src/systems/PlayerManager.ts`: examined player instantiation and mode toggling.
  - `src/entities/Bullet.ts`: verified quota and owner tracking.
  - `src/core/powerups/PowerUpManager.ts`: verified multi-player active buff states.
  - `src/core/specials/SpecialMovesManager.ts`: verified multi-player special move triggers.
  - Existing test suites: `tests/unit/hud_screens.test.ts`, `tests/unit/m7_challenger_1_adversarial.test.ts`, `tests/unit/score.test.ts`, `tests/unit/adversarial_m31_player_stress.test.ts`, `tests/unit/adversarial_m31_challenger_2.test.ts`.
- **Key findings**:
  - Unconditionally passing `(count, playerId)` breaks Vitest `toHaveBeenCalledWith(1)` assertions in `m7_challenger_1_adversarial.test.ts` and `hud_screens.test.ts` because spies check exact argument list length.
  - Smart dispatch strategy (`if (playerId === 'p2') callback(count, 'p2'); else if (callback.length >= 2) callback(count, playerId); else callback(count);`) guarantees 100% backward compatibility for single-player callers while delivering full multi-player accuracy.
  - `onScoreChanged` should similarly support `(payload, playerId)` with optional `payload.playerId` and smart dispatch.
  - Secondary findings: `getNextExtraLifeThreshold`, `getPointsToNextExtraLife`, `getAccuracy`, `getAccuracyPercentage`, `getFormattedAccuracy`, `getScoreRecord`, and `getHUDState` currently lack `playerId: PlayerId = 'p1'` parameter.
  - Lint failure: `tests/unit/adversarial_m31_challenger_2.test.ts` has 3 unused imports causing `tsc --noEmit` to fail.
- **Unexplored areas**: None for M31-DEFECT-01 scope. Full evidence chain established.

## Key Decisions Made
- Formulated two-layer backward compatibility strategy: TypeScript signature overload / optional parameters + runtime smart dispatch checking `playerId === 'p2'` and `callback.length >= 2`.

## Artifact Index
- /Users/user/src/galog/.agents/m31_rem_explorer_2/DISPATCH.md — Dispatch log
- /Users/user/src/galog/.agents/m31_rem_explorer_2/BRIEFING.md — Persistent working memory
- /Users/user/src/galog/.agents/m31_rem_explorer_2/progress.md — Liveness heartbeat
- /Users/user/src/galog/.agents/m31_rem_explorer_2/scratch_test.ts — Empirical verification harness for spy argument matching
- /Users/user/src/galog/.agents/m31_rem_explorer_2/handoff.md — Final 5-component handoff report
