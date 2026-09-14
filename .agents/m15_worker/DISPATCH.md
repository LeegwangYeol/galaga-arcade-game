## 2026-09-04T11:21:23Z

You are m15_worker.
Your working directory is `/Users/user/teamwork_projects/galaga_game/.agents/m15_worker`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read:
- `/Users/user/teamwork_projects/galaga_game/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/teamwork_projects/galaga_game/PROJECT.md`
- `/Users/user/teamwork_projects/galaga_game/COLLABORATION.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/teamwork_preview_orchestrator_6/DISPATCH.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/teamwork_preview_orchestrator_6/M15_SYNTHESIS.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/m15_explorer_1/handoff.md` and `analysis.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/m15_explorer_2/handoff.md` and `analysis.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/m15_explorer_3/handoff.md` and `analysis.md`

Your Objective: Implement Milestone 15: 50-Round Memory Bot & QA Controller (`window.__GALAGA_CHEAT__`).

Write Ownership:
You have exclusive write ownership over:
- `src/core/qa/GalagaCheatController.ts` (new)
- `src/types/index.ts` (`IGalagaCheatController`, `window.__GALAGA_CHEAT__`)
- `src/core/Game.ts` (cheat controller wiring, stage teardown pool clearing)
- `src/entities/Player.ts` (`isInvincibleCheat` flag)
- `src/core/allies/AlliesManager.ts` (`onStageClear` munition pool clearing)
- `src/core/specials/SpecialMovesManager.ts` (`onStageClear` munition pool clearing)
- `src/systems/FormationManager.ts` (`Enemy` pool or clean entity reuse)
- `tests/unit/m15_qa_cheat.test.ts` (new)
- `tests/unit/m15_50round_memory.test.ts` (new)
- `tests/e2e/memory_bot_50round.spec.ts` (new)

Detailed Requirements:
1. Global QA Cheat Controller (`window.__GALAGA_CHEAT__`):
   - Implement `GalagaCheatController.ts` conforming to `IGalagaCheatController`.
   - Methods: `skipToStage(stage: number)`, `triggerCrisis(crisisId: string)`, `spawnBoss(bossId: string | number)`, `triggerSpecialMove(moveId: string)`, `setInvincible(invincible: boolean)`, `unlockDrone(droneType: string)`, `fillEnergy(amount?: number)`, `killAllEnemies()`, `setScore(score: number)`, `addLives(n: number)`, and `getGameState()`.
   - Case-insensitive alias dictionary mapping for crises, bosses, drones, and special moves.
   - Mount cleanly in `Game` constructor to both `window.__GALAGA_CHEAT__` (browser) and `(globalThis as any).__GALAGA_CHEAT__` (headless Node), and unmount cleanly in `Game.destroy()`. Expose via `game.getCheatController()`.
2. Stage Teardown & Munition Recycles (Zero Leaks):
   - In `AlliesManager.onStageClear()`: clear `bombPool` and `explosionPool`.
   - In `SpecialMovesManager.onStageClear()`: clear `missilePool` and `sparkPool`, reset active chrono/warp timers.
   - In `Game.ts` stage transitions & `skipToStage()`: ensure complete teardown of active bosses, crises, bullets, particles, and munitions so all 7 pools have `getActiveCount() === 0`.
3. Player Invincibility:
   - In `src/entities/Player.ts`: add `public isInvincibleCheat: boolean = false`.
   - In `Player.isInvulnerable()`: return `true` if `this.isInvincibleCheat` without triggering respawn blinking.
4. Testing & Verification:
   - `tests/unit/m15_qa_cheat.test.ts`: test mounting/unmounting, all 10 methods, boundary values (negative stages, stages > 50, invalid IDs), and atomic state transitions (mid-boss, active crisis, player death, game over).
   - `tests/unit/m15_50round_memory.test.ts`: automated headless 50-round traversal across all 50 stages. Assert net heap growth between Stage 1 and Stage 50 is strictly `< 5.0 MB`. Assert all pool capacities remain bounded.
   - `tests/e2e/memory_bot_50round.spec.ts`: Playwright headless bot running 50 rounds, verifying 0 runtime errors/console errors, clean DOM, and canvas attachment.
   - Run `npm test` and `npm run build` directly and ensure all existing 1,035 tests + new tests pass (100%) with 0 errors and clean Vite build.
5. Deliver handoff report to `/Users/user/teamwork_projects/galaga_game/.agents/m15_worker/handoff.md` and message parent when complete.
