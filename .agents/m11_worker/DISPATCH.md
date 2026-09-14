## 2026-09-03T04:19:40Z

You are m11_worker (Role: Player Upgrade & Power-Up System Implementation Worker).
Working directory: /Users/user/src/galog/.agents/m11_worker/
Project root: /Users/user/src/galog

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY INPUTS:
Read these specification documents before writing any code:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/.agents/teamwork_preview_orchestrator_2/SCOPE.md
- /Users/user/src/galog/.agents/m11_explorer_1/report.md
- /Users/user/src/galog/.agents/m11_explorer_2/report.md
- /Users/user/src/galog/.agents/m11_explorer_3/report.md

FILE OWNERSHIP (Exclusive):
You have exclusive write ownership over:
- src/core/powerups/types.ts (Create)
- src/core/powerups/PowerUpItem.ts (Create)
- src/core/powerups/PowerUpManager.ts (Create)
- src/entities/Player.ts (Update)
- src/entities/Bullet.ts (Update)
- src/renderer/SpriteRenderer.ts (Update)
- src/core/Game.ts (Update)
- tests/unit/powerups.test.ts (Create)

IMPLEMENTATION SPECIFICATIONS:
1. `src/core/powerups/types.ts` & `PowerUpItem.ts`:
   - Enumerate `PowerUpType`: 'RAPID_FIRE', 'KINETIC_SHIELD', 'SCATTER_SHOT', 'EMP_BOMB', 'ENGINE_BOOSTER'.
   - `PowerUpItem`: Poolable item leased from `ObjectPool<PowerUpItem>`. Downward drift $vy = 60$ px/s with horizontal sine sway ($A = 12$ px, $\omega = 3.0$ rad/s), $12 \times 12$ AABB, bounds clamp [10, 214], and despawn recycling at $y > 288$.
2. `src/core/powerups/PowerUpManager.ts`:
   - Zero-allocation 32-capacity `ObjectPool<PowerUpItem>`.
   - `spawnDrop(x, y, stage, enemyType, isDiving)`: Deterministic drop rates (12% baseline, 18% diving, 30-40% Boss, 0% on Challenging Stages).
   - 15-second timed buff management (`rapidFire`, `scatterShot`, `engineBooster`) with stacking/timer refresh.
   - `EMP_BOMB`: Instantly wipes all active enemy bullets on screen via `bulletManager.forEachActiveEnemyBullet` and deals 1 damage to diving enemies.
   - Zero GC during 60 FPS update and render loops.
3. Update `src/entities/Player.ts`:
   - Integrate upgrades:
     - Rapid Fire: Halves fire cooldown ($0.12\text{s} \to 0.06\text{s}$), expands quota (Single: 4, Dual: 8).
     - Kinetic Deflector Shield: Absorbs 1 fatal collision or projectile hit, grants 1.0s invulnerability, preserves Dual Fighter hulls without separation!
     - Scatter / Triple Shot: Single Fighter fires 3 streams ($0^\circ, \pm 15^\circ$); Dual Fighter fires twin 3-way spreads (6 streams!).
     - Engine Booster: Scales lateral speed from 260 px/s to 390 px/s ($1.5\times$).
   - Seamless Dual Fighter docking integration (asymmetrical damage preservation, buffs stack).
4. Update `src/entities/Bullet.ts`:
   - Support `vx, vy` velocity components and directional rotation angle for player bullets.
   - Dynamic player bullet quota checks.
5. Update `src/renderer/SpriteRenderer.ts`:
   - 100% Zero External Assets: Procedural 10x10 pixel art matrices for all 5 power-up capsules (Rapid Fire, Kinetic Shield, Scatter Shot, EMP Bomb, Engine Booster).
   - Pre-bake offscreen canvases at boot.
   - Render floating capsule with pulsating aura and orbital sparkles.
   - Render player kinetic shield barrier: Single Fighter hexagon (R=14px) and Dual Fighter pill/stadium (42x24px) with deflection flash.
6. Update `src/core/Game.ts`:
   - Wire `PowerUpManager` into constructor, `update(dt)`, `renderPlayingScreen()`, `resolveCollisions()` (enemy kill drop check and player collection check), and lifecycle resets (`onStageClear`, `startGame`, `destroy`).
7. Create `tests/unit/powerups.test.ts`:
   - Comprehensive test suite covering ObjectPool leasing, drop rates, drift kinematics, upgrade application to Single/Dual Fighter, spread angles, shield deflection, and buff timers.

VERIFICATION REQUIRED:
- Run `npm run typecheck` (0 errors).
- Run `npm test` (all 693 existing tests + new power-up tests must pass 100%).
- Run `npm run build` (production build must succeed).
- Document all command outputs in your handoff.md.

Write report to `/Users/user/src/galog/.agents/m11_worker/report.md` and `/Users/user/src/galog/.agents/m11_worker/handoff.md`.
Notify orchestrator via send_message when done.
