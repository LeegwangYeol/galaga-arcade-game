# DISPATCH — m16_rem_worker

## 2026-09-04T21:12:00Z

You are `m16_rem_worker`.
Your working directory is `/Users/user/teamwork_projects/galaga_game/.agents/m16_rem_worker`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read:
- `/Users/user/teamwork_projects/galaga_game/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/teamwork_projects/galaga_game/PROJECT.md`
- `/Users/user/teamwork_projects/galaga_game/COLLABORATION.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/teamwork_preview_orchestrator_6/DISPATCH.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/teamwork_preview_orchestrator_6/M16_REMEDIATION_SYNTHESIS.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/m16_rem_explorer_1/handoff.md` and `analysis.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/m16_rem_explorer_2/handoff.md` and `analysis.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/m16_rem_explorer_3/handoff.md` and `analysis.md`

Your Objective: Implement Milestone 16 Remediation: Fix Warp Ram Kinematics & Unmask Adversarial Tests.

Write Ownership:
You have exclusive write ownership over:
- `src/entities/Player.ts`
- `src/core/Game.ts`
- `src/core/specials/SpecialMovesManager.ts`
- `tests/unit/adversarial_m16_combinatorial_saturation.test.ts`
- `tests/unit/m16_challenger_1_adversarial.test.ts`

Detailed Tasks per `M16_REMEDIATION_SYNTHESIS.md`:
1. `src/entities/Player.ts`:
   - Expand `PlayerConfig` with `game?: any;`.
   - Add `public isWarpRamActive: boolean = false;` and `public game?: any;` to `Player`.
   - In `Player.reset()`, set `this.isWarpRamActive = false;`.
   - In `Player.clampPosition()`:
     ```typescript
     const isWarpRam = this.isWarpRamActive || (this.game?.specialMovesManager?.isWarpRamActive?.() ?? false);
     if (!isWarpRam) {
       this.y = Player.BASELINE_Y;
     }
     ```
2. `src/core/Game.ts`:
   - In constructor line 296, pass `game: this` to `new Player({ ..., game: this })`.
3. `src/core/specials/SpecialMovesManager.ts`:
   - Add `private warpRamHitTargetIds = new Set<any>();`.
   - In `executeWarpRam()`, clear `this.warpRamHitTargetIds`, set `player.isWarpRamActive = true`, and store `this.warpRamStartY = player.y || Player.BASELINE_Y`.
   - In `update(dt)`:
     - When `player.y < -30`, set `this.warpRamExitedTop = true` and `player.invulnerableTimer = Math.max(player.invulnerableTimer, 1.0)`.
     - When `warpRamExitedTop` is true, wrap `player.y = this.warpRamStartY;`.
     - When `this.warpRamTimer <= 0`, set `player.y = this.warpRamStartY;`, `player.invulnerableTimer = 0.5;`, and `player.isWarpRamActive = false;`.
   - In `resolveCollisions()`:
     - Debounce enemy hits using `warpRamHitTargetIds` so each entity takes damage at most once per activation.
     - Debounce boss hit using `warpRamHitTargetIds` so boss takes 120 damage at most once per activation.
   - In `onStageClear()` and `reset()`:
     - Clear `warpRamHitTargetIds`.
     - If `this.game?.player`, set `player.isWarpRamActive = false;` and `player.y = Player.BASELINE_Y;`.
4. `tests/unit/adversarial_m16_combinatorial_saturation.test.ts`:
   - Unmask Test 1 lines 180–204 per `M16_REMEDIATION_SYNTHESIS.md`:
     - Recycle active bullets and clear bomb pools before Warp Ram.
     - Temporarily suspend drones during the 60 frames of Warp Ram.
     - Set `boss.health = 250; boss.maxHealth = 300;`.
     - Execute 60 frames tracking `minPlayerY`, `reachedIntermediateAscent`, and `reachedTopScreenExit`.
     - Assert `reachedIntermediateAscent: true`, `reachedTopScreenExit: true`, `minPlayerY <= -30`.
     - Assert exact 120 damage: `expect(boss.health).toBe(preRamBossHp - 120)`.
     - Assert wrap back to 250 with invulnerability.
     - Restore drones.
5. `tests/unit/m16_challenger_1_adversarial.test.ts`:
   - Verify Test 1 passes with real upward ascent (`reachedTop === true`) and kinetic trauma.
6. Run `npm test` and `npm run build` directly and ensure 100% pass across all 66 test files and 1,105+ tests with clean Vite build.
Deliver handoff report to `/Users/user/teamwork_projects/galaga_game/.agents/m16_rem_worker/handoff.md` and message parent when complete.
