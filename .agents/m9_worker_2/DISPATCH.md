## 2026-09-03T03:22:40Z

You are m9_worker_2 (Role: Scaling Engine & Stage Config Implementation Worker).
Working directory: /Users/user/src/galog/.agents/m9_worker_2/
Project root: /Users/user/src/galog

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY INPUTS:
Read these specification documents before making any changes:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/.agents/teamwork_preview_orchestrator_2/SCOPE.md
- /Users/user/src/galog/.agents/m9_explorer_1/report.md
- /Users/user/src/galog/.agents/m9_explorer_2/report.md
- /Users/user/src/galog/.agents/m9_explorer_3/report.md

FILE OWNERSHIP (Exclusive):
You have exclusive write ownership over:
- src/systems/DifficultyCalculator.ts (Create)
- src/types/index.ts (Update types: StageTier, EnemyDamageResult, etc.)
- src/entities/Enemy.ts (Update tier, shield, maxShield, damageFlash, takeDamage, setDifficulty)
- src/renderer/SpriteRenderer.ts (Update Elite palettes, flash matrix, shield aura rendering)
- src/systems/FormationManager.ts (Integrate DifficultyCalculator, 12 Challenging Stages wave flow, bullet suppression)
- src/ui/HUD.ts (Update FLAG_20 badge matrix)
- src/core/Game.ts (Wire shield damage sound/particles, challenging stage hit tracking)
- tests/unit/difficulty.test.ts (Create comprehensive test suite)

IMPLEMENTATION TASKS:
1. Implement `src/systems/DifficultyCalculator.ts`:
   - `getStageTier(stage: number): 'CLASSIC' | 'ELITE' | 'DREADNOUGHT'`
   - `getDiveSpeedMultiplier(stage: number): number` (1.0 to 1.8 monotonic curve: 1.0 + 0.8 * ((s-1)/49)^0.85)
   - `getDiveInterval(stage: number): number` (3.5s to 0.8s exponential decay: 3.5 * (0.8/3.5)^((s-1)/49))
   - `getMaxConcurrentDivers(stage: number): number` (1 to 6)
   - `getEnemyBulletSpeed(stage: number): number` (180 to 320 px/s clamp)
   - `getEnemyHealthAndShield(stage: number, type: EnemyType): { health: number, shield: number }` (Classic 1/0 or 2/0; Elite 2/0 or 3/0; Dreadnought 2/1 or 3/2; Challenging stage strictly 1/0)
2. Update `src/entities/Enemy.ts`:
   - Add `tier`, `shield`, `maxShield`, `damageFlashTimer`, `shieldFlashTimer`.
   - Update `takeDamage(amount: number): EnemyDamageResult` absorbing through shield first.
   - Maintain default constructor backwards-compatibility (1 HP for Zako/Goei, 2 HP for Boss).
3. Update `src/renderer/SpriteRenderer.ts`:
   - Procedural Elite enemy variants (Amber Zako, Royal Purple Goei, Gold Boss).
   - Render rotating hexagonal kinetic shield aura when `shield > 0`.
   - Render white flash silhouette during 80ms `damageFlashTimer`.
4. Update `src/ui/HUD.ts`:
   - Add dedicated 8x12 pixel matrix for `FLAG_20` (distinct from 30).
5. Update `src/systems/FormationManager.ts` & `src/core/Game.ts`:
   - Inject `DifficultyCalculator` curves for dive speeds, intervals, diver quotas, and bullet velocity.
   - Implement 12 Challenging Stages wave spawning (stages 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47) with 5 acrobatic waves, offscreen deactivation, 0 bullets, and hit/bonus score tracking.
   - Wire shield hit sound and spark particles into `Game.resolveCollisions()`.
6. Create `tests/unit/difficulty.test.ts` covering:
   - All DifficultyCalculator curves across stages 1–50.
   - Challenging stages schedule, 0-bullet suppression, 40-hit bonus calculation.
   - Kinetic shield absorption and Elite/Dreadnought tier properties.
   - Stage badge decomposition and layout constraints for stages 1–50.

VERIFICATION REQUIRED:
- Run `npm run typecheck` (must pass with 0 TypeScript errors).
- Run `npm test` (all 546 existing tests + all new difficulty tests must pass).
- Run `npm run build` (production build must succeed).
- Document all build and test command outputs in your handoff.md report.

Write your report to `/Users/user/src/galog/.agents/m9_worker_2/report.md` and `/Users/user/src/galog/.agents/m9_worker_2/handoff.md`.
Notify orchestrator via send_message when done.
