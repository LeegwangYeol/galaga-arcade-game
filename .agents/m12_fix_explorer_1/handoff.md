# Milestone 12 Zero-GC & Lifecycle Remediation Handoff Report

**Agent**: `m12_fix_explorer_1` (Roles: Explorer, Investigator, Synthesizer)  
**Date**: 2026-09-04T09:36:00Z  
**Type**: Hard Handoff (Investigation & Remediation Formulation Complete)  
**Deliverable**: `/Users/user/teamwork_projects/galaga_game/.agents/m12_fix_explorer_1/analysis.md`

---

## 1. Observation

1. **60 FPS Heap Allocations in Boss Updates**:
   - `src/core/boss/bosses/NaniteColossus.ts`:
     - Lines 123–130 inside `updatePhase1(dt)`:
       ```typescript
       const anchors = [
         { x: 50, y: 50, phi: 0 },
         { x: 174, y: 50, phi: Math.PI },
         { x: 75, y: 95, phi: Math.PI / 2 },
         { x: 149, y: 95, phi: (3 * Math.PI) / 2 },
       ];
       ```
       Allocates a 4-element array and 4 object literals `{ x, y, phi }` every frame at 60 FPS while `isSplit` is true.
     - Line 115 inside `updatePhase1(dt)`:
       ```typescript
       const angles = [-0.35, -0.12, 0.12, 0.35];
       ```
       Allocates a new number array on every salvo interval (1.6s).
   - `src/core/boss/bosses/AeternumCore.ts`:
     - Lines 236–242 inside `updatePhase3(dt)`:
       ```typescript
       const p0 = { x: 112, y: 52 };
       const p1 = { x: 20, y: 160 };
       const p2 = { x: 204, y: 250 };
       const p3 = { x: 112, y: 52 };
       ```
       Allocates 4 Point objects `{ x, y }` every frame at 60 FPS for 2.2 seconds during ramming swoops.
     - Line 156 inside `updatePhase2(dt)`:
       ```typescript
       const angles = [-0.4, -0.2, 0, 0.2, 0.4];
       ```
       Allocates a new number array on every shotgun spread interval (1.2s).

2. **Sub-Unit Double-Update and Double-Render**:
   - `src/core/boss/BaseBoss.ts`:
     - Lines 318–322:
       ```typescript
       for (const sub of this.subUnits) {
         if (sub.active) {
           sub.update(dt, playerX, playerY);
         }
       }
       ```
     - Lines 335–339:
       ```typescript
       for (const sub of this.subUnits) {
         if (sub.active) {
           sub.render(ctx);
         }
       }
       ```
   - `src/systems/FormationManager.ts`:
     - Line 848: `enemy.update(dt, playerX, playerY);` executes for every active entity in `this.enemies`.
     - Line 906: `enemy.render(ctx);` executes for every active entity in `this.enemies`.
   - `src/core/Game.ts`:
     - Line 384: `onSpawnBoss` adds sub-units to `formationManager.enemies`.
     - Result: Active sub-units are updated twice per frame and rendered twice per frame.

3. **Stage 30 Mini-Construct Collision Softlock**:
   - `src/core/Game.ts` line 384: `return [boss, ...boss.getActiveSubUnits()];`
   - `NaniteColossus` constructs are instantiated with `active = false`. `getActiveSubUnits()` returns `[]` at spawn time.
   - When the boss reaches 50% HP and splits, `construct.active = true` is set, but the constructs are missing from `formationManager.enemies`.
   - `Game.resolveCollisions()` only queries `formationManager.getLivingEnemies()`, so player missiles pass through mini-constructs without colliding. Meanwhile, `NaniteColossus.takeDamage()` returns absorbed damage because `isProtectedBySubUnits()` is `true`. Progression is permanently softlocked.

4. **Stage 10 Escort Drone Sprite ID**:
   - `src/core/boss/bosses/CyberDreadnought.ts` lines 36–37 pass `'ZAKO_WING_0'` to `BossSubUnit`.
   - `'ZAKO_WING_0'` does not exist in `SpriteRenderer.definitions` (only `'ZAKO'` and `'ELITE_ZAKO'`), causing silent early-return in `SpriteRenderer.draw()` and 100% invisible escort drones.

5. **Stage 20 Dual Fighter Multi-Frame Annihilation**:
   - In `src/core/boss/bosses/DimensionalLeviathan.ts` lines 146–161, radial shockwaves check player intersection:
     ```typescript
     if (Math.abs(distToPlayer - wave.radius) <= wave.thickness)
     ```
   - Across 2–3 consecutive frames (33–50ms), the expanding wave intersects the player hitbox without a per-wave single-damage flag or temporary invulnerability, destroying both hulls of a dual fighter almost instantaneously.

6. **Vacuous Assertion in Unit Tests**:
   - In `tests/unit/boss_stage40_psionic.test.ts` lines 89–97, `game.update(1 / 60)` was run without calling `game.setState('PLAYING')`.
   - In `'TITLE'` state, player thrusters were not updated (`moved === 0`), causing `expect(moved).toBeLessThan(2.0)` to pass vacuously (`0 < 2.0`).

7. **Test Suite Baseline Execution**:
   - Command: `npm test`
   - Output: 45 passed test files, 848 passed tests, 0 failures.

---

## 2. Logic Chain

1. *From Observation 1 to Zero-GC Design*:
   - Per-frame allocation of `anchors` and `p0..p3` violates the fixed-timestep 60 FPS zero-allocation invariant specified in `PROJECT.md` ("zero-allocation object pools... 60 FPS accumulator loop").
   - Lissajous anchors in `NaniteColossus` are invariant across frames and stages; they can be extracted to `private static readonly ANCHORS` and reused by both constructor and `updatePhase1`.
   - The Cubic Bézier formula in `AeternumCore` has static control points $P_0(112,52), P_1(20,160), P_2(204,250), P_3(112,52)$. Direct evaluation of the expanded polynomial with scalar constants eliminates all 4 Point object allocations per tick during ramming swoops.
   - Salvo and shotgun angles are constant arrays; storing them as static readonly arrays eliminates allocation during combat firing.

2. *From Observation 2 to Single Source of Truth*:
   - In `Game.ts`, `formationManager.enemies` already stores all living enemy entities on screen.
   - When both `BaseBoss` and `FormationManager` iterate over and call `update()` and `render()` on sub-units, timers advance at 2x speed and draw calls double.
   - Removing sub-unit iteration from `BaseBoss.update()` and `BaseBoss.render()` establishes `FormationManager` as the single authoritative source of truth for updating, rendering, and collision detection of all enemies.
   - `BaseBoss.updateBoss(dt)` retains sole authority over calculating sub-unit coordinates and driving composite attack AI.
   - Setting `this.canShoot = false;` in `BossSubUnit` prevents generic dive shooting in `FormationManager.ts`.
   - Guarding the tractor beam trigger with `!(enemy instanceof BaseBoss)` prevents epic bosses from entering classic tractor beam states during vertical movement.

3. *From Observation 3 to Stage 30 Softlock Fix*:
   - `formationManager.enemies` handles inactive entities safely because loops in `update`, `render`, and `getLivingEnemies` check `if (!enemy.active) continue;`.
   - Returning `[boss, ...boss.subUnits]` in `onSpawnBoss` pre-registers the mini-constructs at spawn time.
   - When the boss splits, setting `construct.active = true` immediately exposes them to `FormationManager` updates, renders, and missile collision checks without dynamic array resizing or heap allocation.

4. *From Observation 4 to Escort Visibility Fix*:
   - Replacing `'ZAKO_WING_0'` with registered ID `'ZAKO'` restores immediate procedural rendering.

5. *From Observation 5 to Shockwave Damage Gating*:
   - Adding `hasDamagedPlayer?: boolean` to `RadialShockwave` and setting it to `true` upon first impact prevents subsequent intersection frames from destroying the surviving dual fighter hull.

6. *From Observation 6 to Meaningful Thruster Validation*:
   - Explicitly transitioning `game.setState('PLAYING')` ensures `updatePlaying()` executes, allowing player movement calculation and asserting non-zero displacement ~1.08px.

---

## 3. Caveats

1. **Read-Only Scope**: Adhering strictly to the Teamwork Explorer identity and the user instruction ("ALWAYS wait for explicit user approval before proceeding with implementation"), no production source files or unit tests were modified during this investigation. All concrete changes are detailed in `analysis.md` for subsequent implementation.
2. **Current Test Status**: The existing 848 tests pass cleanly, meaning existing tests did not catch the 60 FPS allocations or the sub-unit double updates because unit tests generally mock or assert single method calls. Specialized adversarial verification scripts (detailed in `analysis.md` section 6) must be run post-implementation to certify zero-GC and collision behavior.

---

## 4. Conclusion

The root causes of the Milestone 12 defects have been completely identified and isolated:
1. **60 FPS Heap Allocations**: Solved via static readonly `ANCHORS` and `SALVO_ANGLES` in `NaniteColossus`, and pure scalar Bézier evaluation and static `SHOTGUN_ANGLES` in `AeternumCore`.
2. **Sub-Unit Double-Update and Double-Render**: Solved by designating `FormationManager` as the single source of truth for sub-unit updates and rendering, removing duplicate loops from `BaseBoss`, and setting `canShoot = false` on `BossSubUnit`.
3. **Stage 30 Softlock**: Solved by returning `[boss, ...boss.subUnits]` in `Game.onSpawnBoss`.
4. **Stage 10 Escort Invisibility**: Solved by updating sprite ID from `'ZAKO_WING_0'` to `'ZAKO'`.
5. **Stage 20 Dual Fighter Annihilation**: Solved by adding `hasDamagedPlayer` gating to `RadialShockwave`.
6. **Vacuous Test Assertion**: Solved by transitioning to `'PLAYING'` state in `boss_stage40_psionic.test.ts`.

The detailed remediation blueprint is fully drafted and ready for implementation upon explicit user approval.

---

## 5. Verification Method

1. **Read Full Analysis**:
   Inspect `/Users/user/teamwork_projects/galaga_game/.agents/m12_fix_explorer_1/analysis.md`.
2. **Verify Current Baseline Passing**:
   ```bash
   npm test
   ```
   *Expected outcome*: 45 test files passed, 848 tests passed.
3. **Verify Allocation Points in Source**:
   - View `src/core/boss/bosses/NaniteColossus.ts` lines 115, 124–130.
   - View `src/core/boss/bosses/AeternumCore.ts` lines 156, 236–242.
   - View `src/core/boss/BaseBoss.ts` lines 318–322, 335–339.
   - View `src/core/Game.ts` line 384.
   - View `src/core/boss/bosses/CyberDreadnought.ts` lines 36–37.
4. **Invalidation Conditions**:
   - Any runtime allocation of array or object literals inside 60 FPS update loops.
   - Sub-units remaining updated or rendered more than once per frame.
   - Stage 30 player missiles failing to damage mini-constructs during split phase.
