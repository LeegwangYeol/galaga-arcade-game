# Handoff Report — Milestone M18: Adversarial Challenge (Kinematics, Stage Clear Flow & Boundary Invariants)

## 1. Observation

### Verification Suite Execution
- **Adversarial Test Suite (`tests/unit/m18_challenger_1_adversarial.test.ts`)**:
  Executed command:
  ```bash
  npx vitest run tests/unit/m18_challenger_1_adversarial.test.ts
  ```
  Result:
  ```
  ✓ tests/unit/m18_challenger_1_adversarial.test.ts (19 tests) 168ms
  Test Files  1 passed (1)
       Tests  19 passed (19)
  ```
- **TypeScript Production Build (`npm run build`)**:
  Executed command:
  ```bash
  npm run build
  ```
  Verbatim build output and compiler failure:
  ```
  > galog@1.0.0 build
  > tsc --noEmit && vite build

  tests/unit/adversarial_m18_challenger_2.test.ts(26,1): error TS6133: 'GlitchEventManager' is declared but its value is never read.
  tests/unit/adversarial_m18_challenger_2.test.ts(27,1): error TS6133: 'GlitchEventType' is declared but its value is never read.
  ```
  Exit code: 2.

### Direct Code Observations of Detected Bugs
1. **`src/systems/FormationManager.ts:958–963`**:
   ```typescript
   // 3.5 Update active phantom decoy clones
   this.phantomPool.forEachActive((clone) => {
     clone.update(dt);
     if (!clone.active) {
       this.phantomPool.release(clone);
     }
   });
   ```
   `forEachActive` iterates forward `for (let i = 0; i < count; i++)`. When `this.phantomPool.release(clone)` executes O(1) swap-and-pop, `storage[i]` is replaced with `storage[lastActiveIndex]`, and `activeCount` decrements. On the subsequent iteration step `i = 1`, the element moved to index 0 is completely skipped.
   Empirical test observation in `SC-2`:
   ```
   initial active: 2
   active after 2.1s (simultaneous expiry): 1
   active clone index: 0 lifetime: 2 active: true
   ```

2. **`src/entities/Enemy.ts:617–633` & `src/entities/Enemy.ts:643–658`**:
   Lines 617–633 (ceiling wrap):
   ```typescript
   if (this.y < -20 && this.glitchKinematicVy < 0) {
     this.flightPath = null;
     this.pathElapsedMs = 0;
     this.glitchOffsetX = 0;
     this.glitchOffsetY = 0;
     this.glitchDisplacementX = 0;
     this.glitchDisplacementY = 0;
     this.glitchKinematicVx = 0;
     this.glitchKinematicVy = 0;
     this.isKineticInverted = false;
     this.y = -Enemy.BASE_HEIGHT;
     this.state = EnemyState.RETURNING_TO_FORMATION;
     this.vx = 0;
     this.vy = this.diveSpeed * 0.8;
     this.rotation = 0;
     return;
   }
   ```
   Lines 643–658 (path completion / bottom wrap):
   ```typescript
   if (sample.isComplete || this.y > 288 + Enemy.BASE_HEIGHT) {
     this.flightPath = null;
     this.pathElapsedMs = 0;
     this.glitchOffsetX = 0;
     this.glitchOffsetY = 0;
     this.glitchDisplacementX = 0;
     this.glitchDisplacementY = 0;
     this.glitchKinematicVx = 0;
     this.glitchKinematicVy = 0;
     this.isKineticInverted = false;
     this.y = -Enemy.BASE_HEIGHT;
     this.state = EnemyState.RETURNING_TO_FORMATION;
     this.vx = 0;
     this.vy = this.diveSpeed * 0.8;
     this.rotation = 0;
   }
   ```
   Neither block resets `this.isTeleporting = false;` or `this.teleportTimer = 0;`.
   Empirical test observation in `QT-4`:
   ```
   isTeleporting before end: true
   teleportTimer: 0.08
   state after path complete: RETURNING_TO_FORMATION
   flightPath after complete: null
   isTeleporting after complete: true
   teleportTimer remaining: 0.08
   isTeleporting after 10 returning frames: true
   ```
   Enemy in formation renders every frame via `Enemy.ts:816–820`:
   ```typescript
   if (this.isTeleporting) {
     ctx.save();
     ctx.globalAlpha = 0.6;
     ctx.translate((Math.random() - 0.5) * 4, 0);
   }
   ```
   The enemy permanently vibrates horizontally by $\pm 2$ px and stays at 60% opacity while parked in formation.

---

## 2. Logic Chain

1. **Build Blocker**:
   - Observation: `npm run build` runs `tsc --noEmit && vite build`.
   - In `tests/unit/adversarial_m18_challenger_2.test.ts`, lines 26 and 27 import `GlitchEventManager` and `GlitchEventType` without referencing them.
   - Because `tsconfig.json` enables strict compiler flags including `noUnusedLocals: true`, `tsc --noEmit` fails with exit code 2.
   - Production deployment to Vercel requires clean builds (`exit code 0`). This build break blocks deployment.

2. **Phantom Pool Swap-and-Skip Bug (`FormationManager.ts:958`)**:
   - Observation: `PhantomClone.ts` entities have a lifetime of 2.0s. `FormationManager.spawnMirageClones()` spawns 2 clones.
   - Observation: In `FormationManager.ts:958`, active clones are updated using `this.phantomPool.forEachActive()`.
   - `ObjectPool.ts:101–125` implements swap-and-pop release: releasing `storage[0]` moves `storage[lastActiveIndex]` into index 0 and decrements `activeCount` to 1.
   - `ObjectPool.ts:138–146` iterates forward with loop counter `i`: after index 0 is released, `i` increments to 1.
   - The element swapped into index 0 is never visited during that update pass.
   - If both clones reach lifetime expiration simultaneously (e.g., after 2.0s), the second clone is skipped, fails to decrement its lifetime, and remains active in the pool.
   - The skipped clone survives an additional 2.0 seconds (total 4.0s on screen), violating the 2.0s lifetime specification.
   - Contrast: `ObjectPool.ts:151` specifically provides `forEachActiveSafe()` (reverse-iteration) for in-loop releases. All other subsystems in the codebase (`Bullet.ts`, `ParticleSystem.ts`, `PowerUpManager.ts`, `SpecialMovesManager.ts`, `AlliesManager.ts`) use `forEachActiveSafe()`.

3. **Lingering Quantum Teleportation State Machine Bug (`Enemy.ts:626 & 652`)**:
   - Observation: When `triggerQuantumTeleport()` is called during a dive, `this.isTeleporting` is set to `true` and `this.teleportTimer` is set to `0.08` (80ms).
   - `this.teleportTimer` is only decremented inside `Enemy.ts:563` within `updateDiving()`, guarded by `if (this.flightPath)`.
   - When an enemy reaches the end of its flight path (`sample.isComplete`) or wraps around the bottom of the screen ($y > 288 + \text{BASE\_HEIGHT}$) or ceiling wraps ($y < -20$), lines 618 and 644 set `this.flightPath = null` and transition `state` to `RETURNING_TO_FORMATION`.
   - Lines 626 and 652 explicitly clean up `glitchOffsetX/Y`, `glitchDisplacementX/Y`, `glitchKinematicVx/Vy`, and `isKineticInverted = false`, but fail to reset `isTeleporting = false` or `teleportTimer = 0`.
   - Once `state` is `RETURNING_TO_FORMATION` or `IN_FORMATION`, `updateReturning()` or `update()` never decrement `teleportTimer`.
   - `this.isTeleporting` remains `true` permanently.
   - In `Enemy.ts:816`, `Enemy.render()` applies `globalAlpha = 0.6` and random horizontal jitter `translate((Math.random() - 0.5) * 4, 0)` every frame.
   - Result: Any enemy that finishes its dive while teleporting remains permanently semi-transparent and vibrating while stationary in formation.

---

## 3. Caveats

- The core Canvas 2D raster effects in `GlitchRenderer.ts` (scanline tears, chromatic aberration, XOR corrupted sprites, HUD hex scrambling) correctly maintain `ctx.save()` / `ctx.restore()` stack depth balance (`mockCtx.getStackDepth() === 0`) and zero runtime heap allocations.
- Anti-gravity acceleration in `Enemy.ts:574` correctly evaluates to $-450 \text{ px/s}^2$, and ceiling bounds recovery ($y < -20$) correctly catches enemies ascending out of view.
- Stage immunity for all 12 Challenging Stages (3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47) and all 5 Epic Boss Stages (10, 20, 30, 40, 50) correctly rejects glitch triggers and clears pre-existing glitches.
- Cheat controller `triggerGlitch()` accurately maps all canonical types and aliases with case-insensitivity and survives 500 rapid toggle cycles without state corruption.
- Stage clear flow in `FormationManager.ts:966` correctly triggers when living enemies reach 0, regardless of whether phantom clones are active on screen.
- Per Teamwork review-only constraints, these 3 defects are documented for remediation by the worker rather than modified directly.

---

## 4. Conclusion

**Verdict**: **REQUEST_CHANGES**

Milestone M18 cannot be approved in its current state due to two runtime bugs and one build-breaking compiler failure:
1. **[Build Blocker]**: `tests/unit/adversarial_m18_challenger_2.test.ts:26–27` has unused imports breaking `npm run build` (`tsc --noEmit`).
2. **[Critical Runtime Bug]**: `src/systems/FormationManager.ts:958` uses forward `forEachActive` with in-loop `release()`, causing swap-and-skip of expiring phantom clones and doubling their active lifetime.
3. **[High Runtime Bug]**: `src/entities/Enemy.ts:626 & 652` omits `this.isTeleporting = false;` and `this.teleportTimer = 0;` during path completion and ceiling wrap, leaving enemies stuck in a permanent vibrating holographic render state in formation.

### Required Remediation Actions:
1. In `src/systems/FormationManager.ts:958`:
   Change:
   ```typescript
   this.phantomPool.forEachActive((clone) => {
   ```
   To:
   ```typescript
   this.phantomPool.forEachActiveSafe((clone) => {
   ```
2. In `src/entities/Enemy.ts`:
   - At line 626 (ceiling wrap guard): add:
     ```typescript
     this.isTeleporting = false;
     this.teleportTimer = 0;
     ```
   - At line 652 (path completion / bottom wrap guard): add:
     ```typescript
     this.isTeleporting = false;
     this.teleportTimer = 0;
     ```
3. In `tests/unit/adversarial_m18_challenger_2.test.ts`:
   Remove unused imports `GlitchEventManager` and `GlitchEventType` on lines 26–27.
4. Verify `npm run build` passes with exit code 0.
5. Verify all tests in `tests/unit/` pass cleanly.

---

## 5. Verification Method

1. **Verify Build**:
   ```bash
   cd /Users/user/teamwork_projects/galaga_game && npm run build
   ```
   *Current state*: Fails with `TS6133` error.
   *Remediated state*: Exits with code 0.

2. **Verify Adversarial Challenge Suite**:
   ```bash
   cd /Users/user/teamwork_projects/galaga_game && npx vitest run tests/unit/m18_challenger_1_adversarial.test.ts
   ```
   *Expected result*: 19/19 passing tests verifying all stress scenarios and empirical reproductions.

3. **Verify Phantom Pool Safe Traversal**:
   ```bash
   npx tsx -e "
   import { FormationManager } from './src/systems/FormationManager';
   const fm = new FormationManager();
   fm.spawnMirageClones(112, 100);
   const pool = fm.getPhantomPool();
   fm.update(2.1, 112, 250);
   console.log('Active clones remaining:', pool.getActiveCount());
   "
   ```
   *Current output*: `Active clones remaining: 1` (clone skipped).
   *Remediated output*: `Active clones remaining: 0`.

4. **Verify Teleport State Reset**:
   ```bash
   npx tsx -e "
   import { Enemy } from './src/entities/Enemy';
   import { EnemyState, EnemyType } from './src/types';
   import { FlightPathManager } from './src/systems/FlightPathManager';
   const enemy = new Enemy();
   enemy.init(1, EnemyType.ZAKO, 0, 0, 112, 100);
   enemy.isGlitched = true;
   enemy.flightPath = FlightPathManager.createSoloDivePath({ x: 112, y: 100 }, 112);
   enemy.state = EnemyState.DIVING_SOLO;
   while (enemy.state === EnemyState.DIVING_SOLO && (enemy as any).pathElapsedMs < 2500) { enemy.update(0.016, 112, 250); }
   enemy.triggerQuantumTeleport(30);
   while (enemy.state === EnemyState.DIVING_SOLO) { enemy.update(0.016, 112, 250); }
   console.log('isTeleporting in formation return:', enemy.isTeleporting);
   "
   ```
   *Current output*: `isTeleporting in formation return: true` (stuck).
   *Remediated output*: `isTeleporting in formation return: false`.
