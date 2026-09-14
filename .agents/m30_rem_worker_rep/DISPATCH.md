## 2026-09-11T19:01:29Z

You are m30_rem_worker_rep (Milestone M30 Pool Hygiene & Lifecycle Remediation Replacement Worker).
Your Working Directory: /Users/user/teamwork_projects/galaga_game/.agents/m30_rem_worker_rep (and mirror metadata to /Users/user/src/galog/.agents/m30_rem_worker_rep)
Your Identity: Replacement worker succeeding m30_rem_worker (who hit a broken pipe) to implement the 4 pool hygiene and stage clear remediations.

MANDATORY Context to Read First:
- Authoritative User Request: /Users/user/teamwork_projects/galaga_game/.agents/ORIGINAL_REQUEST.md
- Architecture & Milestones: /Users/user/teamwork_projects/galaga_game/PROJECT.md
- Collaboration Guide: /Users/user/teamwork_projects/galaga_game/COLLABORATION.md
- Challenger Handoff: /Users/user/teamwork_projects/galaga_game/.agents/m30_pool_hygiene_verifier/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Write Ownership (You own exclusively):
- `src/core/Game.ts`
- `src/systems/FormationManager.ts`
- `tests/unit/pool.test.ts`
- `tests/unit/m11_powerup_pool.test.ts`
- `tests/unit/m30_pool_hygiene_verifier_adversarial.test.ts`
- `COLLABORATION.md`
- Mirror all modified and new files to `/Users/user/src/galog/`!

Your Implementation Objectives:
1. In `src/core/Game.ts:1094` (inside `updateStageClear()`):
   - Add `if (this.powerUpManager) this.powerUpManager.reset();` so that any active powerups are cleanly flushed at the exact moment of advancing to the next stage, mirroring `bulletManager.clear()`, `particleSystem.clear()`, `alliesManager.onStageClear()`, and `specialMovesManager.onStageClear()`.
2. In `src/systems/FormationManager.ts:94-100`:
   - Change `enemyPool` configuration to `initialSize: 64, maxSize: 64, autoExpand: false` so that all 64 slots are genuinely pre-allocated and accessible without a dead-zone.
3. Create `tests/unit/pool.test.ts`:
   - Comprehensive Vitest unit test suite covering `ObjectPool` functionality (preallocation, acquire, release, swap-and-pop, forEachActive, clear, drain, capacity bounds, double-free protection).
4. Create `tests/unit/m11_powerup_pool.test.ts`:
   - Comprehensive Vitest unit test suite testing `PowerUpManager` pool invariants (initialSize 32, maxSize 32, autoExpand false, reset flushes activeCount to 0, acquire/release lifecycle).
5. In `tests/unit/m30_pool_hygiene_verifier_adversarial.test.ts`:
   - Update line 76: `expect(game.formationManager.getEnemyPool().getCapacity()).toBe(64);` (since initialSize is now 64).
   - Update line 157-161: with the fix in place, `updateStageClear` now flushes powerups, so `expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);`.
6. In `COLLABORATION.md`:
   - Clarify the object pool configuration: 7 of 8 pools enforce `autoExpand: false` with static preallocation; `bulletPool` enforces bounded dynamic expansion (`autoExpand: true`) capped at `maxSize: 256` to balance early-round low-footprint tests with late-round bullet hell density.
7. Run Verification Commands:
   - `npx vitest run tests/unit/pool.test.ts tests/unit/m11_powerup_pool.test.ts tests/unit/m30_pool_hygiene_verifier_adversarial.test.ts` (all must pass 100%)
   - `npx tsc --noEmit` (must be 0 errors)
   - `npm test` (all test files must pass 100%)
   - `npm run build` (clean Vite build)
   - Verify 100% bitwise parity between `/Users/user/teamwork_projects/galaga_game` and `/Users/user/src/galog`.
8. Write complete handoff report to `handoff.md` and send message to parent.
