## 2026-09-04T11:15:34Z
You are m15_explorer_1.
Your working directory is `/Users/user/teamwork_projects/galaga_game/.agents/m15_explorer_1`.
You MUST read:
- `/Users/user/teamwork_projects/galaga_game/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/teamwork_projects/galaga_game/PROJECT.md`
- `/Users/user/teamwork_projects/galaga_game/COLLABORATION.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/teamwork_preview_orchestrator_6/DISPATCH.md`

Your objective for Milestone 15: QA Controller & Cheat System Architecture:
1. Investigate codebase entry points (`src/main.ts`, `src/core/Game.ts`, `src/types/index.ts`) for mounting a global QA cheat controller onto `window.__GALAGA_CHEAT__`.
2. Design the interface `GalagaCheatController` and concrete methods:
   - `skipToStage(stage: number)`: cleanly tears down current stage entities (enemies, bullets, boss, crisis), updates stage number, initializes the new stage, and resets state.
   - `triggerCrisis(crisisId: string)`: immediately forces activation of a specific Stellaris crisis event via `CrisisEventManager`.
   - `spawnBoss(bossId: string)`: immediately transitions to designated Boss fight (Stages 10, 20, 30, 40, 50).
   - `triggerSpecialMove(moveId: SpecialMoveType)`: forces instant activation of Nova Barrage, Chrono Freeze, or Warp Ram.
   - `setInvincible(invincible: boolean)`: toggles player invulnerability for QA testing.
   - `unlockDrone(droneType: DroneType)`: summons designated wingman Drone via `AlliesManager`.
   - `fillEnergy(amount?: number)`: sets special energy meter to 100%.
   - `killAllEnemies()`: destroys all active enemy entities on screen.
   - `setScore(score: number)`: updates score for milestone testing.
   - `addLives(n: number)`: adjusts player lives count.
3. Investigate state cleanup: ensure entity recycling to pools during `skipToStage` prevents memory leaks.
4. Ensure global Window declaration works cleanly with TypeScript strict mode (`tsc --noEmit`).
Write your analysis to `/Users/user/teamwork_projects/galaga_game/.agents/m15_explorer_1/analysis.md` and deliver a self-contained handoff report at `/Users/user/teamwork_projects/galaga_game/.agents/m15_explorer_1/handoff.md`.
Update your `progress.md` before and after work. When finished, send a message back to parent.
