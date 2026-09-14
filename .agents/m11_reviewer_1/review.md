# Architecture & Subsystem Quality Review: Milestone 11 (Power-Up Subsystem)

**Reviewer**: `m11_reviewer_1` (Role: Power-Up Architecture Reviewer & Adversarial Critic)  
**Date**: 2026-09-03T13:45:00+09:00  
**Target Milestone**: Milestone 11 (Player Fighter Upgrade & Power-Up System)  
**Project Root**: `/Users/user/src/galog`  

---

## 1. Review Summary

**Verdict**: **REQUEST_CHANGES**

Milestone 11 introduces a rich and well-structured power-up foundation: 5 canonical power-up types (`RAPID_FIRE`, `KINETIC_SHIELD`, `SCATTER_SHOT`, `EMP_BOMB`, `ENGINE_BOOSTER`), procedural 10x10 bitmatrices in `SpriteRenderer`, trigonometric fan spreading ($0^\circ, \pm 15^\circ$), downward drift kinematics ($60$ px/s) with sinusoidal sway ($A=12$, $\omega=3.0$), and deterministic drop rates (0% on challenging stages, 12% baseline, 18% diving, 30-40% Boss).

However, rigorous adversarial stress testing and architectural tracing uncovered **two Critical integration defects** and **one Major pool capacity violation** that prevent approval:
1. **Critical Defect**: **Infinite Kinetic Shield (Permanent Invulnerability Loop)**. `PowerUpManager.update()` continuously overwrites `player.hasShield = this.buffState.hasShield` every frame, restoring the shield after it is depleted and granting the player permanent invulnerability.
2. **Critical Defect**: **Buff Resurrecting After Player Death**. `PowerUpManager.onPlayerDeath()` is defined but never invoked anywhere in the codebase. When a player dies, `Player.destroy()` zeroes out buff timers, but `PowerUpManager.update()` immediately overwrites them with its internal `buffState`, restoring buffs to the newly respawned ship.
3. **Major Defect**: **ObjectPool Capacity & Zero-Allocation Invariant Broken**. `PowerUpManager` initializes its pool with `maxSize: 128` and `autoExpand: true` instead of a strictly bounded 32-capacity pool. Under rapid spawn bursts (>32 items), dynamic heap allocation occurs, causing 2 test failures in `tests/unit/m11_challenger_1_adversarial.test.ts`.

---

## 2. Findings & Defects

### [Critical] Finding 1: Infinite Kinetic Shield via `PowerUpManager.update()` Desync
- **Location**: `src/core/powerups/PowerUpManager.ts:273`, `src/core/powerups/PowerUpManager.ts:334`, `src/entities/Player.ts:575-582`, `src/entities/Player.ts:619-626`
- **Evidence**:
  1. When a `KINETIC_SHIELD` is collected, `PowerUpManager.applyPowerUp` sets `this.buffState.hasShield = true` and `player.hasShield = true; player.shieldHp = 1;`.
  2. When the player takes a lethal projectile or collision, `Player.hitTestAndDamage()` intercepts the hit:
     ```typescript
     if (this.hasShield || this.shieldHp > 0) {
       this.hasShield = false;
       this.shieldHp = 0;
       this.shieldFlashTimer = 0.3;
       this.invulnerableTimer = Math.max(this.invulnerableTimer, 1.0);
       this.onShieldDeflect?.(this.x, this.y);
       return false;
     }
     ```
     `player.hasShield` is now `false`.
  3. However, on the next game loop frame (`Game.ts:632` calling `powerUpManager.update(dt, this.player)`):
     ```typescript
     // PowerUpManager.ts:273
     player.hasShield = this.buffState.hasShield;
     ```
     `this.buffState.hasShield` was never set to `false` when the hit occurred! Thus, line 273 immediately resets `player.hasShield = true`!
  4. Once `invulnerableTimer` expires, any subsequent hit is absorbed again, repeating the cycle infinitely. The player is impossible to kill.
- **Why this is a problem**: Game-breaking god-mode bug that invalidates player mortality and game balance.
- **Suggested Fix**:
  - In `PowerUpManager.ts:update()`: synchronize shield state from the player rather than overwriting it, or update `this.buffState.hasShield` when depleted:
    ```typescript
    if (player) {
      this.buffState.hasShield = player.hasShield;
      // ...
    }
    ```
  - And/or wire `player.onShieldDeflect` to notify `powerUpManager` to clear `buffState.hasShield = false`.

---

### [Critical] Finding 2: `PowerUpManager.onPlayerDeath()` Never Called (Buffs Resurrect on Death)
- **Location**: `src/core/powerups/PowerUpManager.ts:447-452`, `src/entities/Player.ts:644-650`, `src/core/Game.ts:871-898`
- **Evidence**:
  1. `PowerUpManager.ts` implements:
     ```typescript
     public onPlayerDeath(): void {
       this.buffState.rapidFireTimer = 0;
       this.buffState.scatterShotTimer = 0;
       this.buffState.engineBoosterTimer = 0;
       this.buffState.hasShield = false;
     }
     ```
  2. `grep_search` across the entire codebase confirms that `powerUpManager.onPlayerDeath` is called in **0 locations**.
  3. In `Player.destroy()`, the local timers are cleared (`this.rapidFireTimer = 0`, etc.). But during the player's destroyed/respawning state, `Game.updatePlaying` continues calling `this.powerUpManager.update(dt, this.player)`.
  4. `PowerUpManager.update` blindly re-assigns `player.rapidFireTimer = this.buffState.rapidFireTimer`, immediately restoring the dead player's active buffs to the newly respawning ship.
- **Why this is a problem**: Loss of life in Galaga must strip all temporary weapon buffs. Re-spawning with inherited buffs violates arcade rules and core design.
- **Suggested Fix**:
  - In `Game.ts`, whenever player life is lost or player is destroyed (e.g. inside `this.player.onExplode` or when `damageResult` kills player), invoke:
    ```typescript
    this.powerUpManager.onPlayerDeath();
    ```
  - Also in `PowerUpManager.update(dt, player)`: defensively check if `player.state === 'destroyed'` and zero out active buffs.

---

### [Major] Finding 3: ObjectPool Bounded Capacity & Zero-Allocation Invariant Broken
- **Location**: `src/core/powerups/PowerUpManager.ts:24-25`, `src/core/powerups/PowerUpManager.ts:60-66`
- **Evidence**:
  1. USER_REQUEST specifies: "Zero-allocation 32-capacity ObjectPool management."
  2. `PowerUpManager.ts` defines:
     ```typescript
     public static readonly POOL_CAPACITY = 32;
     public static readonly POOL_MAX_SIZE = 128;
     ...
     this.pool = new ObjectPool<PowerUpItem>({
       factory: () => new PowerUpItem(this.nextItemId++),
       reset: (item: PowerUpItem) => item.reset(),
       initialSize: PowerUpManager.POOL_CAPACITY, // 32
       maxSize: PowerUpManager.POOL_MAX_SIZE, // 128
       autoExpand: true, // Allocates new objects on the heap during gameplay
     });
     ```
  3. When more than 32 items are spawned, `pool.acquire()` expands the pool to 64 and allocates 32 new `PowerUpItem` instances on the heap during active gameplay.
  4. This directly breaks zero-allocation runtime guarantees and causes 2 unit test failures in `tests/unit/m11_challenger_1_adversarial.test.ts`:
     - `expect(manager.getPool().getMaxSize()).toBe(32)` received `128`
     - `expect(manager.getPoolSize()).toBe(32)` received `64`
- **Why this is a problem**: Violates the zero-allocation gameplay mandate and bounded 32-capacity specification; causes test suite regression.
- **Suggested Fix**:
  - In `PowerUpManager.ts`:
    ```typescript
    public static readonly POOL_CAPACITY = 32;
    public static readonly POOL_MAX_SIZE = 32;
    ...
    this.pool = new ObjectPool<PowerUpItem>({
      factory: () => new PowerUpItem(this.nextItemId++),
      reset: (item: PowerUpItem) => item.reset(),
      initialSize: PowerUpManager.POOL_CAPACITY,
      maxSize: PowerUpManager.POOL_CAPACITY,
      autoExpand: false,
    });
    ```
  - When all 32 items are leased, `pool.acquire()` will return `null` without throwing and without triggering heap allocations.

---

## 3. Verification Commands & Results

| Verification Command | Execution Result | Status | Notes |
|---|---|---|---|
| `npm run typecheck` | Code 0 | **PASS** | `tsc --noEmit` exits with 0 errors |
| `npm test` | Code 1 (34 passed, 1 failed) | **FAIL** | 742 passed, 2 failed in `m11_challenger_1_adversarial.test.ts` due to pool capacity 128 vs 32 |
| `npm run build` | Code 0 (452ms) | **PASS** | Bundle generated: `dist/assets/index-BFegbMjh.js` (213.17 kB) |
| `npx vitest run tests/unit/powerups.test.ts` | Code 0 (28 passed) | **PASS** | Unit suite passed in isolation (isolated tests did not exercise manager update loop) |
| `npx vitest run tests/unit/m11_challenger_2_adversarial.test.ts` | Code 0 (21 passed) | **PASS** | High-intensity combat, weapon spreads, and deflection tests passed |

---

## 4. Verification Checklist Matrix

| Requirement | Spec / Constraint | Implementation Finding | Verified? |
|---|---|---|---|
| Zero-allocation ObjectPool | Bounded 32 items, 0 runtime GC heap allocs | Initial size 32, but `maxSize: 128` and `autoExpand: true` causes heap expansion to 64 | **FAIL** (Finding 3) |
| Challenging Stage Drop Rate | 0% drops on Stages 3, 7, 11, etc. | Strictly returns `null` via `DifficultyCalculator.isChallengingStage(stage)` | **PASS** |
| Baseline Drop Rate | 12% on standard non-diving enemies | Evaluates `PowerUpManager.BASELINE_DROP_RATE = 0.12` | **PASS** |
| Diving Drop Rate | 18% on diving enemies | Evaluates 0.18 for diving Zako / Goei | **PASS** |
| Boss Galaga Drop Rate | 30% formation, 40% diving | Evaluates 0.30 formation, 0.40 diving | **PASS** |
| Tier Scaling Bonuses | +3% Elite, +6% Dreadnought | Verified against `DifficultyCalculator.getStageTier(stage)` | **PASS** |
| Buff Timer Management | 15.0s per timed upgrade | Configured at 15.0s in `POWERUP_CONFIGS` | **PASS** |
| Stacking Clamp | Clamped at 30.0s max | `Math.min(30.0, timer + 15.0)` strictly enforced | **PASS** |
| Tractor Beam Timer Pause | Buff timers frozen while player capturing | Frozen when `player.state === 'capturing'` | **PASS** |
| Kinetic Deflector Shield | Absorbs 1 hit, preserves Dual hulls | Absorbs hit and preserves hulls, BUT permanent invulnerability bug | **FAIL** (Finding 1) |
| Player Death Reset | Clears temporary buffs on loss of life | `onPlayerDeath()` never called; timers resurrected by manager | **FAIL** (Finding 2) |
| Procedural Assets | Zero external textures or audio files | 10x10 bitmatrices in `SpriteRenderer`, offscreen canvas pre-baking | **PASS** |

---

## 5. Integrity Audit

- **Hardcoded test hacks**: None found. Real physics, bitmatrices, and formulas implemented.
- **Dummy / facade implementations**: None found.
- **Delegation shortcuts**: None found.
- **Self-certifying without genuine verification**: The worker relied on `tests/unit/powerups.test.ts` where `player.hitTestAndDamage` was tested without calling `PowerUpManager.update(dt, player)` across frames. This masked the Infinite Shield bug.
- **Integrity Tag**: No malicious integrity violation, but severe architectural desynchronization.

---

## 6. Required Actions for Worker

1. **Fix Infinite Shield Defect**:
   - In `src/core/powerups/PowerUpManager.ts`, update `this.buffState.hasShield` to reflect player shield consumption, or update line 273 so that `player.hasShield` is not overwritten with stale state.
   - Wire `player.onShieldDeflect` in `Game.ts` to call `powerUpManager.buffState.hasShield = false` or a dedicated `powerUpManager.onShieldDepleted()` method.
2. **Fix Buff Resurrection on Player Death**:
   - In `src/core/Game.ts`, call `this.powerUpManager.onPlayerDeath()` when the player is destroyed.
   - In `PowerUpManager.update(dt, player)`, clear buff state if player is in `'destroyed'` or `'respawning'` state without active buffs.
3. **Fix 32-Capacity Bounded ObjectPool**:
   - In `src/core/powerups/PowerUpManager.ts`, set `maxSize: PowerUpManager.POOL_CAPACITY` (32) and `autoExpand: false`.
4. **Ensure All Test Suites Pass**:
   - Run `npm test` and verify that all 35 test files and 744+ tests pass with 0 failures.
