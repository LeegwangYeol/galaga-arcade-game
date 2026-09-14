# Technical Investigation Report — Milestone 11 Remediation Strategy

**Agent**: `m11_rem_explorer_1`  
**Role**: Explorer / Technical Investigator  
**Date**: 2026-09-03T16:28:00Z  
**Target Repository**: `/Users/user/src/galog`  
**Status**: Investigation Complete — Ready for Worker Implementation  

---

## 1. Executive Summary

A forensic audit of Milestone 11 (`Player Fighter Upgrade & Power-Up System`) conducted by `m11_auditor_1` returned an **INTEGRITY VIOLATION** verdict because `npm test` exited with code 1. Two primary regressions were identified:
1. **Canvas 2D Mock Defect in `src/core/Game.ts`**: The headless mock canvas context fallback used in Vitest omitted `moveTo`, `lineTo`, `fill`, and `ellipse`. When a player collects a `KINETIC_SHIELD`, rendering the forcefield via `SpriteRenderer.drawPlayerShieldBarrier` crashes with `TypeError: ctx.moveTo is not a function`.
2. **ObjectPool Bounded Capacity Invariant in `src/core/powerups/PowerUpManager.ts`**: The power-up pool was configured with `POOL_MAX_SIZE = 128` and `autoExpand: true`. This causes dynamic heap allocation upon pool saturation (expanding from 32 to 64 items), violating Challenger 1's invariant of strictly 32 pre-allocated entities and zero runtime GC reallocations.

During our in-depth empirical investigation, an **additional critical discovery** was uncovered in `tests/unit/m8_final_adversarial.test.ts`:
- In the 500-tick endurance test, line 142 asserts `expect(playerBulletCount).toBeLessThanOrEqual(2)`. When a player collects `RAPID_FIRE`, the legitimate missile quota dynamically increases to 4. Under high fire rates, this causes intermittent failures (`expected 4 to be less than or equal to 2`). Upgrading line 142 to assert `expect(playerBulletCount).toBeLessThanOrEqual(p.getMaxMissileQuota())` eliminates test flakiness while strictly verifying the engine's dynamic quota contract.

---

## 2. Problem Boundary & Audit Violation Catalog

| Violation ID | Location | Symptoms | Root Cause |
|---|---|---|---|
| **V-01** | `src/core/Game.ts:160-182` | `TypeError: ctx.moveTo is not a function` during `game.render()` | Headless fallback context lacked pathing methods (`moveTo`, `lineTo`, `fill`, `ellipse`). |
| **V-02** | `src/core/powerups/PowerUpManager.ts:25, 64-65` | `AssertionError: expected 128 to be 32` & `expected 64 to be 32` in `m11_challenger_1_adversarial.test.ts` | `POOL_MAX_SIZE = 128` and `autoExpand: true` permit runtime heap growth past 32 items. |
| **V-03 (Discovered)** | `tests/unit/m8_final_adversarial.test.ts:142` | Intermittent `AssertionError: expected 4 to be less than or equal to 2` | Hardcoded quota limit of 2 conflicts with M11 `RAPID_FIRE` dynamic quota expansion ($2 \to 4$). |

---

## 3. Deep-Dive Investigation: Violation 1 (Canvas 2D Mock Fallback in `Game.ts`)

### 3.1 Call Chain & Root Cause
In `src/core/Game.ts` (lines 148–156), the game initializes the rendering context:
```ts
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = this.canvas.getContext?.('2d', {
        alpha: false,
        desynchronized: true,
      }) as CanvasRenderingContext2D | null;
    } catch {
      // Fallback
    }
```
In standard Vitest / Node.js test runs (unless an offscreen polyfill is loaded), `this.canvas.getContext` returns `null`. `Game.ts` provides an in-place mock context on lines 160–182:
```ts
      this.ctx = {
        canvas: this.canvas,
        fillStyle: '#000000',
        strokeStyle: '#FFFFFF',
        font: '8px monospace',
        textAlign: 'center',
        textBaseline: 'middle',
        globalAlpha: 1.0,
        imageSmoothingEnabled: false,
        fillRect: () => {},
        fillText: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        closePath: () => {},
        save: () => {},
        restore: () => {},
        drawImage: () => {},
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        arc: () => {},
        stroke: () => {},
      } as unknown as CanvasRenderingContext2D;
```

### 3.2 Where Missing Methods Are Invoked
1. **`SpriteRenderer.drawPlayerShieldBarrier` (`src/renderer/SpriteRenderer.ts:1198, 1202, 1225, 1235`)**:
   - For single fighter:
     ```ts
     ctx.beginPath();
     for (let i = 0; i < 6; i++) {
       const vx = Math.round(x + radius * Math.cos(angle));
       const vy = Math.round(y + radius * Math.sin(angle));
       if (i === 0) ctx.moveTo(vx, vy);
       else ctx.lineTo(vx, vy);
     }
     ctx.closePath();
     ctx.fill();
     ctx.stroke();
     ```
   - For dual fighter:
     ```ts
     ctx.beginPath();
     ctx.moveTo(leftCenterX, y - capRadius);
     ctx.lineTo(rightCenterX, y - capRadius);
     ctx.arc(...);
     ctx.lineTo(...);
     ctx.arc(...);
     ctx.closePath();
     ctx.fill();
     ```
2. **Endgame Crisis Handlers & Other Entities**:
   - `src/core/crisis/events/NaniteCloudEvent.ts:151-165`: Calls `ctx.ellipse` and `ctx.fill()`.
   - `src/core/crisis/events/HyperspaceStormEvent.ts`: Calls `ctx.moveTo` and `ctx.lineTo`.
   - `src/core/crisis/events/ShieldOverloadEvent.ts`: Calls `ctx.moveTo`, `ctx.lineTo`, `ctx.stroke`.
   - `src/core/crisis/events/PhysicsInversionEvent.ts`: Calls `ctx.moveTo`, `ctx.lineTo`.
   - `src/core/crisis/events/TheUnbiddenEvent.ts`: Calls `ctx.moveTo`, `ctx.lineTo`, `ctx.fill`.
   - `src/entities/TractorBeam.ts:405, 411, 421`: Calls `ctx.lineTo`, `ctx.createLinearGradient`, `ctx.fill`.

### 3.3 Triggering Condition in Tests
In `tests/unit/m8_final_adversarial.test.ts` (test: `simulates 500 game loop ticks`), enemies take damage periodically:
- At `tick % 40 === 0`, `victim.takeDamage(99)` is called.
- When an enemy is destroyed in `Game.ts:resolveCollisions()`, `this.powerUpManager.spawnDrop()` rolls a loot drop.
- When a `KINETIC_SHIELD` capsule drops and the player collides with it, `player.activateShield()` is triggered (`player.hasShield = true`).
- At tick 500, line 154 executes `expect(() => game.render()).not.toThrow()`.
- `game.render()` renders `this.player`, which calls `SpriteRenderer.drawPlayerShieldBarrier(this.ctx, ...)`.
- Calling `this.ctx.moveTo(...)` throws `TypeError: ctx.moveTo is not a function`.

---

## 4. Deep-Dive Investigation: Violation 2 (PowerUpManager Pool Bounded Capacity)

### 4.1 Specification Invariant
In `tests/unit/m11_challenger_1_adversarial.test.ts`, the adversarial red team tests Dimension 1:
- `initializes with bounded pool capacity of exactly 32 pre-allocated entities`:
  - `expect(manager.getPoolSize()).toBe(32);`
  - `expect(manager.getActiveCount()).toBe(0);`
  - `expect(manager.getPool().getMaxSize()).toBe(32);`
- `handles pool saturation gracefully: spawning 40 power-ups rapidly maintains bounded capacity 32 with zero exceptions and zero GC reallocations`:
  - Spawning 40 items must not throw.
  - `expect(manager.getPoolSize()).toBe(32);` (strict clamping).
  - `expect(manager.getActiveCount()).toBe(32);`.
  - Items 1 to 32 must be non-null.
  - Overflow items (33 to 40) must return `null`.

### 4.2 Flawed Implementation in `src/core/powerups/PowerUpManager.ts`
```ts
24:  public static readonly POOL_CAPACITY = 32;
25:  public static readonly POOL_MAX_SIZE = 128;
...
60:    this.pool = new ObjectPool<PowerUpItem>({
61:      factory: () => new PowerUpItem(this.nextItemId++),
62:      reset: (item: PowerUpItem) => item.reset(),
63:      initialSize: PowerUpManager.POOL_CAPACITY,
64:      maxSize: PowerUpManager.POOL_MAX_SIZE,
65:      autoExpand: true,
66:    });
```
When `ObjectPool.acquire()` runs:
```ts
    if (this.activeCount >= this.storage.length) {
      if (this.autoExpand && this.storage.length < this.maxSize) {
        const expandSize = Math.min(Math.max(16, this.storage.length * 2), this.maxSize);
        this.preallocate(expandSize);
      } else {
        return null;
      }
    }
```
Because `autoExpand` was `true` and `maxSize` was `128`:
1. `getPool().getMaxSize()` returned `128` instead of `32`.
2. When 40 items were requested, at item #33 the pool automatically expanded `this.storage.length` from 32 to 64!
3. `getPoolSize()` returned 64 instead of 32, and items 33–40 were allocated instead of returning `null`.
4. This violated the zero-GC arcade memory contract.

### 4.3 Remediation Design
Setting:
```ts
  public static readonly POOL_CAPACITY = 32;
  public static readonly POOL_MAX_SIZE = 32;
```
and initializing `ObjectPool` with:
```ts
      initialSize: PowerUpManager.POOL_CAPACITY,
      maxSize: PowerUpManager.POOL_MAX_SIZE,
      autoExpand: false,
```
Guarantees:
- Initial capacity: 32 entities pre-allocated.
- Max capacity: strictly 32 entities.
- `autoExpand: false`: zero runtime memory growth.
- At capacity: `acquire()` returns `null` safely without exceptions.
- Zero GC hitches during 60 FPS gameplay.

---

## 5. Test Suite Ripple Effects & Discovery of Intermittent Quota Failure

### 5.1 Discovery of Secondary Failure in `m8_final_adversarial.test.ts`
While running empirical stress tests on `tests/unit/m8_final_adversarial.test.ts`:
```bash
for i in {1..10}; do npx vitest run -t "simulates 500 game loop ticks" tests/unit/m8_final_adversarial.test.ts || break; done
```
We observed an intermittent assertion failure at line 142:
```
FAIL tests/unit/m8_final_adversarial.test.ts > M8 Challenger 1: Tier 5 Full Engine Adversarial Hardening Suite > 1. Long-Session Endurance & Zero-Allocation Invariance (500 Ticks)
AssertionError: expected 4 to be less than or equal to 2
 ❯ tests/unit/m8_final_adversarial.test.ts:142:33
    140|       // 3. Verify Bullet counts never exceed quota (2 for single fighter)
    141|       const playerBulletCount = game.getBulletManager().getPlayerBulletCount();
    142|       expect(playerBulletCount).toBeLessThanOrEqual(2);
```

### 5.2 Mechanics of the Intermittent Failure
1. In Milestone 8, the player single fighter missile quota was constant `2`.
2. Milestone 11 introduced `RAPID_FIRE` and `SCATTER_SHOT`.
   In `src/entities/Player.ts:193-205`:
   ```ts
   public getMaxMissileQuota(): number {
     if (this.isDual) {
       if (this.hasScatterShot) return this.hasRapidFire ? 16 : 12;
       return this.hasRapidFire ? 8 : 4;
     } else {
       if (this.hasScatterShot) return this.hasRapidFire ? 8 : 6;
       return this.hasRapidFire ? 4 : 2;
     }
   }
   ```
3. During the 500-tick loop in `m8_final_adversarial.test.ts`, enemies are killed and roll for drops via `this.powerUpManager.spawnDrop()`.
4. If the player happens to collect `RAPID_FIRE`, `p.getMaxMissileQuota()` increases to `4`.
5. Under simulated firing input (`tick % 15 === 0`), 4 bullets can be active in the air at tick 500.
6. The test at line 142 had hardcoded `expect(playerBulletCount).toBeLessThanOrEqual(2)`.
7. **Fix**: Update line 142 to:
   ```ts
   expect(playerBulletCount).toBeLessThanOrEqual(p.getMaxMissileQuota());
   ```
   This accurately validates that bullet counts never exceed the active player quota, whether 2, 4, 6, 8, etc., perfectly satisfying the intended invariant without false regressions.

---

## 6. Exact Remediation Diffs

The following unified diffs provide the complete, exact edits required to remediate all audit and behavioral failures.

### Target 1: `src/core/Game.ts`
**Location**: lines 160–186  
**Rationale**: Add missing Canvas 2D methods (`moveTo`, `lineTo`, `fill`, `ellipse`, `createLinearGradient`, `clearRect`, etc.) to the headless fallback mock so that shield barrier rendering and crisis shaders execute without throwing.

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

---

### Target 2: `src/core/powerups/PowerUpManager.ts`
**Location**: lines 24–25 and lines 60–67  
**Rationale**: Clamp `POOL_MAX_SIZE` to 32 and set `autoExpand: false` so that the ObjectPool enforces a strictly bounded capacity of 32 pre-allocated entities with zero runtime GC reallocations.

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

---

### Target 3: `tests/unit/m8_final_adversarial.test.ts`
**Location**: lines 140–144  
**Rationale**: Evaluate `playerBulletCount` against `p.getMaxMissileQuota()` instead of hardcoded `2` to accommodate legitimate `RAPID_FIRE` power-up quota expansion during 500-tick simulation runs.

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

## 7. Verification Procedure & Commands

After the worker applies the diffs, the following independent verification protocol must be executed:

1. **Type Check**:
   ```bash
   npm run typecheck
   ```
   *Expected Result*: Exits with code 0 (0 errors).

2. **Challenger 1 Adversarial Suite**:
   ```bash
   npx vitest run tests/unit/m11_challenger_1_adversarial.test.ts
   ```
   *Expected Result*: All 13 tests pass (100% pass, code 0).

3. **M8 Adversarial Hardening Endurance Suite**:
   ```bash
   npx vitest run tests/unit/m8_final_adversarial.test.ts
   ```
   *Expected Result*: All 19 tests pass (100% pass, code 0).

4. **Power-Up Unit Test Suite**:
   ```bash
   npx vitest run tests/unit/powerups.test.ts
   ```
   *Expected Result*: All 28 tests pass (100% pass, code 0).

5. **Full Repository Test Suite**:
   ```bash
   npm test
   ```
   *Expected Result*: All 35 test files and 755+ tests pass with code 0.

6. **Production Build**:
   ```bash
   npm run build
   ```
   *Expected Result*: Clean build to `dist/` with 0 errors.

---

## 8. Conclusion

The root causes of the audit failure are fully diagnosed, reproducible, and isolated. With the exact, surgical diffs specified above, Milestone 11 will achieve 100% behavioral test compliance, uphold zero-GC memory bounded invariants, and be ready for unconditional forensic certification.
