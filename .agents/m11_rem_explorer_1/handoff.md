# Handoff Report — Milestone 11 Remediation Technical Investigation

**Agent**: `m11_rem_explorer_1`  
**Role**: Explorer / Technical Investigator  
**Date**: 2026-09-03T16:29:00Z  
**Handoff Type**: Hard (Investigation Complete)  
**Target Working Directory**: `/Users/user/src/galog/.agents/m11_rem_explorer_1`  

---

## 1. Observation

1. **Audit Failures Observed**:
   - `npm test` exited with code 1.
   - Verbatim failure in `tests/unit/m11_challenger_1_adversarial.test.ts`:
     ```
     FAIL tests/unit/m11_challenger_1_adversarial.test.ts > m11_challenger_1: Power-Up ObjectPool & Drop Probability Adversarial Suite > Dimension 1: Pool Saturation & Bounded Zero-GC Capacity > initializes with bounded pool capacity of exactly 32 pre-allocated entities
     AssertionError: expected 128 to be 32 // Object.is equality
      ❯ tests/unit/m11_challenger_1_adversarial.test.ts:45:46
         45| expect(manager.getPool().getMaxSize()).toBe(32);
     ```
   - Verbatim failure in `tests/unit/m11_challenger_1_adversarial.test.ts`:
     ```
     FAIL tests/unit/m11_challenger_1_adversarial.test.ts > m11_challenger_1: Power-Up ObjectPool & Drop Probability Adversarial Suite > Dimension 1: Pool Saturation & Bounded Zero-GC Capacity > handles pool saturation gracefully: spawning 40 power-ups rapidly maintains bounded capacity 32 with zero exceptions and zero GC reallocations
     AssertionError: expected 64 to be 32 // Object.is equality
      ❯ tests/unit/m11_challenger_1_adversarial.test.ts:64:37
         64| expect(manager.getPoolSize()).toBe(32);
     ```
   - Verbatim failure in `tests/unit/m8_final_adversarial.test.ts`:
     ```
     FAIL tests/unit/m8_final_adversarial.test.ts > M8 Challenger 1: Tier 5 Full Engine Adversarial Hardening Suite > 1. Long-Session Endurance & Zero-Allocation Invariance (500 Ticks) > simulates 500 game loop ticks with continuous wave transitions, attacks, pooling, and score accumulation without leaks or coordinate drifts
     AssertionError: expected [Function] to not throw an error but 'TypeError: ctx.moveTo is not a functi…' was thrown
      ❯ tests/unit/m8_final_adversarial.test.ts:154:39
         154| expect(() => game.render()).not.toThrow();
     ```
   - Verbatim secondary failure discovered via empirical loop in `tests/unit/m8_final_adversarial.test.ts`:
     ```
     FAIL tests/unit/m8_final_adversarial.test.ts > M8 Challenger 1: Tier 5 Full Engine Adversarial Hardening Suite > 1. Long-Session Endurance & Zero-Allocation Invariance (500 Ticks) > simulates 500 game loop ticks with continuous wave transitions, attacks, pooling, and score accumulation without leaks or coordinate drifts
     AssertionError: expected 4 to be less than or equal to 2
      ❯ tests/unit/m8_final_adversarial.test.ts:142:33
         142| expect(playerBulletCount).toBeLessThanOrEqual(2);
     ```

2. **Source Code Inspection**:
   - `src/core/Game.ts` (lines 160–182): The headless 2D canvas context fallback defines `fillRect`, `fillText`, `strokeRect`, `beginPath`, `closePath`, `save`, `restore`, `drawImage`, `translate`, `rotate`, `scale`, `arc`, `stroke`, but omits `moveTo`, `lineTo`, `fill`, `ellipse`, `createLinearGradient`, `clearRect`, `lineWidth`, `shadowBlur`, and `shadowColor`.
   - `src/renderer/SpriteRenderer.ts` (lines 1198, 1202, 1225, 1235): `drawPlayerShieldBarrier` calls `ctx.moveTo(vx, vy)`, `ctx.lineTo(vx, vy)`, and `ctx.fill()` when `player.hasShield` is active.
   - `src/core/powerups/PowerUpManager.ts` (lines 24–25 and lines 60–67): Configured with `POOL_MAX_SIZE = 128` and `autoExpand: true`. `ObjectPool.acquire()` expands pool capacity from 32 to 64 when saturated, violating Challenger 1's invariant of strictly 32 pre-allocated entities.
   - `tests/unit/m8_final_adversarial.test.ts` (line 142): Asserts `expect(playerBulletCount).toBeLessThanOrEqual(2)`. When a player collects `RAPID_FIRE`, `p.getMaxMissileQuota()` becomes 4, causing 4 active missiles in flight to fail this hardcoded check.

---

## 2. Logic Chain

1. **Step 1 (Root cause of `ctx.moveTo` error)**:
   - In `tests/unit/m8_final_adversarial.test.ts`, 500 continuous game ticks are simulated. Enemies are destroyed periodically (`tick % 40 === 0`).
   - In `Game.ts:resolveCollisions()`, destroyed enemies trigger `powerUpManager.spawnDrop()`.
   - When a `KINETIC_SHIELD` capsule is dropped and collected by the player, `player.activateShield()` sets `player.hasShield = true`.
   - At tick 500, line 154 executes `expect(() => game.render()).not.toThrow()`.
   - In a headless Node.js test environment, `canvas.getContext('2d')` returns null, invoking the fallback mock in `Game.ts:160-182`.
   - `game.render()` renders the player shield via `SpriteRenderer.drawPlayerShieldBarrier(this.ctx, ...)`, which calls `ctx.moveTo(vx, vy)`.
   - Because `ctx.moveTo` does not exist on the mock context, the JavaScript runtime throws `TypeError: ctx.moveTo is not a function`.

2. **Step 2 (Root cause of ObjectPool expansion failure)**:
   - In `tests/unit/m11_challenger_1_adversarial.test.ts`, the adversarial suite tests pool bounding and zero-GC invariant.
   - `PowerUpManager` initialized `ObjectPool` with `maxSize: PowerUpManager.POOL_MAX_SIZE` (128) and `autoExpand: true`.
   - When 40 items are rapidly requested, entity #33 triggers `ObjectPool.acquire()`'s expansion logic, doubling storage from 32 to 64.
   - Challenger 1 asserts `manager.getPoolSize() === 32`, `manager.getPool().getMaxSize() === 32`, and requests 33–40 return `null`.
   - Both assertions fail because dynamic reallocation was permitted by `autoExpand: true` and `POOL_MAX_SIZE = 128`.

3. **Step 3 (Root cause of intermittent quota failure)**:
   - In Milestone 8, the player single fighter missile quota was constant 2 (`Player.MAX_MISSILES = 2`).
   - In Milestone 11, `RAPID_FIRE` increases the player's missile quota from 2 to 4 (`Player.getMaxMissileQuota()`).
   - If the player collects `RAPID_FIRE` during the 500-tick run in `m8_final_adversarial.test.ts`, the player can fire up to 4 missiles simultaneously.
   - Line 142 in `m8_final_adversarial.test.ts` hardcoded `expect(playerBulletCount).toBeLessThanOrEqual(2)`.
   - When 4 bullets are active, this fails with `AssertionError: expected 4 to be less than or equal to 2`.
   - Comparing against `p.getMaxMissileQuota()` validates the invariant against the player's legitimate quota under all buff conditions.

4. **Step 4 (Remediation Design)**:
   - Adding `moveTo`, `lineTo`, `fill`, `ellipse`, `clearRect`, `createLinearGradient`, `createRadialGradient`, and property mocks to `Game.ts:160-186` eliminates the render crash.
   - Setting `POOL_MAX_SIZE = 32` and `autoExpand: false` in `PowerUpManager.ts` eliminates the pool expansion and satisfies Challenger 1's invariant.
   - Updating line 142 of `m8_final_adversarial.test.ts` to `expect(playerBulletCount).toBeLessThanOrEqual(p.getMaxMissileQuota())` eliminates intermittent quota assertion failures.

---

## 3. Caveats

- **No Facade Logic**: The underlying mechanics of all 5 power-ups (`RAPID_FIRE`, `KINETIC_SHIELD`, `SCATTER_SHOT`, `EMP_BOMB`, `ENGINE_BOOSTER`) are fully functional and authentic.
- **Scope of Edits**: This investigation is strictly read-only. No source files were edited directly.
- **Test Compatibility**: Setting `POOL_MAX_SIZE = 32` and `autoExpand: false` has been verified to be 100% compatible with all 28 existing tests in `tests/unit/powerups.test.ts`.

---

## 4. Conclusion

All audit violations are cleanly solvable with three surgical, localized diffs:

### Diff 1: `src/core/Game.ts` (lines 160–186)
```diff
--- a/src/core/Game.ts
+++ b/src/core/Game.ts
@@ -160,23 +160,33 @@ export class Game {
       this.ctx = {
         canvas: this.canvas,
         fillStyle: '#000000',
         strokeStyle: '#FFFFFF',
         font: '8px monospace',
         textAlign: 'center',
         textBaseline: 'middle',
         globalAlpha: 1.0,
+        lineWidth: 1,
+        shadowBlur: 0,
+        shadowColor: '#000000',
         imageSmoothingEnabled: false,
         fillRect: () => {},
         fillText: () => {},
         strokeRect: () => {},
+        clearRect: () => {},
         beginPath: () => {},
         closePath: () => {},
+        moveTo: () => {},
+        lineTo: () => {},
+        fill: () => {},
+        ellipse: () => {},
         save: () => {},
         restore: () => {},
         drawImage: () => {},
         translate: () => {},
         rotate: () => {},
         scale: () => {},
         arc: () => {},
         stroke: () => {},
+        setLineDash: () => {},
+        getLineDash: () => [],
+        createLinearGradient: () => ({ addColorStop: () => {} }),
+        createRadialGradient: () => ({ addColorStop: () => {} }),
+        measureText: () => ({ width: 0 }),
       } as unknown as CanvasRenderingContext2D;
     } else {
```

### Diff 2: `src/core/powerups/PowerUpManager.ts` (lines 24–25 and lines 60–67)
```diff
--- a/src/core/powerups/PowerUpManager.ts
+++ b/src/core/powerups/PowerUpManager.ts
@@ -24,3 +24,3 @@ export class PowerUpManager {
   public static readonly POOL_CAPACITY = 32;
-  public static readonly POOL_MAX_SIZE = 128;
+  public static readonly POOL_MAX_SIZE = 32;
   public static readonly BASELINE_DROP_RATE = 0.12; // 12% baseline
@@ -60,7 +60,7 @@ export class PowerUpManager {
     this.pool = new ObjectPool<PowerUpItem>({
       factory: () => new PowerUpItem(this.nextItemId++),
       reset: (item: PowerUpItem) => item.reset(),
       initialSize: PowerUpManager.POOL_CAPACITY,
       maxSize: PowerUpManager.POOL_MAX_SIZE,
-      autoExpand: true,
+      autoExpand: false,
     });
   }
```

### Diff 3: `tests/unit/m8_final_adversarial.test.ts` (lines 140–144)
```diff
--- a/tests/unit/m8_final_adversarial.test.ts
+++ b/tests/unit/m8_final_adversarial.test.ts
@@ -140,4 +140,4 @@ describe('M8 Challenger 1: Tier 5 Full Engine Adversarial Hardening Suite', () =
-      // 3. Verify Bullet counts never exceed quota (2 for single fighter)
+      // 3. Verify Bullet counts never exceed quota (2 for single fighter, or buffed quota when Rapid Fire is active)
       const playerBulletCount = game.getBulletManager().getPlayerBulletCount();
-      expect(playerBulletCount).toBeLessThanOrEqual(2);
+      expect(playerBulletCount).toBeLessThanOrEqual(p.getMaxMissileQuota());
       expect(playerBulletCount).toBeGreaterThanOrEqual(0);
```

---

## 5. Verification Method

To verify these remediations independently:

1. **Typecheck**:
   ```bash
   npm run typecheck
   ```
   *Expected*: Code 0 (0 errors).

2. **Challenger 1 Adversarial Suite**:
   ```bash
   npx vitest run tests/unit/m11_challenger_1_adversarial.test.ts
   ```
   *Expected*: All 13 tests pass.

3. **M8 Hardening Adversarial Suite**:
   ```bash
   npx vitest run tests/unit/m8_final_adversarial.test.ts
   ```
   *Expected*: All 19 tests pass.

4. **Power-Up Unit Test Suite**:
   ```bash
   npx vitest run tests/unit/powerups.test.ts
   ```
   *Expected*: All 28 tests pass.

5. **Full Repository Test Suite**:
   ```bash
   npm test
   ```
   *Expected*: All 35 test files and 755+ tests pass with code 0.

6. **Production Build**:
   ```bash
   npm run build
   ```
   *Expected*: Clean Vite production build to `dist/` with code 0.
