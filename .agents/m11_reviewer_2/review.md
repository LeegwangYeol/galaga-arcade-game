# Milestone 11 Quality & Adversarial Review Report
**Reviewer**: `m11_reviewer_2` (Role: Upgrades & Dual Fighter Synergy Reviewer / Adversarial Critic)  
**Project**: Galaga Arcade Web Game  
**Target**: Milestone 11 (Player Fighter Upgrade & Power-Up System)  
**Date**: 2026-09-03T13:42:00+09:00  

---

## Review Summary

**Verdict**: **REQUEST_CHANGES**

Milestone 11 demonstrates impressive architectural work: 100% procedural 10x10 pixel art bitmatrices with offscreen pre-baking, zero external image or sound assets, authentic trigonometric projectile fan spreads ($0^\circ, \pm 15^\circ$), swept CCD missile orientation, Dual Fighter hull preservation under deflection, and complete unit test coverage.

However, an adversarial deep-dive into the live game loop synchronization between `PowerUpManager` and `Player` uncovered a **Critical Gameplay Defect**:
1. **Perpetual Kinetic Shield Immortality**: When a player collects `KINETIC_SHIELD`, `powerUpManager.buffState.hasShield` is set to `true`. When a threat hits the ship, `Player.hitTestAndDamage` correctly absorbs the blow and sets `player.hasShield = false`. However, `PowerUpManager.buffState.hasShield` is never updated or cleared upon deflection. Every frame in `Game.updatePlaying()`, `PowerUpManager.update(dt, player)` executes `player.hasShield = this.buffState.hasShield`, immediately re-arming `player.hasShield = true`. As a consequence, the player becomes **permanently immortal** to fatal hits for the rest of the game session.
2. **Missing `onPlayerDeath()` Invocation**: When the player is destroyed, `PowerUpManager.onPlayerDeath()` is never called in `Game.ts`. The buff timers continue running in `PowerUpManager.buffState` and re-synchronize to the newly respawned player ship.
3. **Pool Saturation Mismatch**: In `tests/unit/m11_challenger_1_adversarial.test.ts`, tests expect `PowerUpManager` pool to be strictly clamped at `maxSize: 32` with `autoExpand: false`, but `PowerUpManager.ts` initialized with `maxSize: 128` and `autoExpand: true`.

---

## Findings

### [Critical] Finding 1: Perpetual Kinetic Shield Deflector Immortality via Buff State Re-synchronization

- **What**: Once `KINETIC_SHIELD` is collected, the player is granted indefinite invulnerability to all fatal damage because `player.hasShield` is continuously overwritten to `true` on every frame.
- **Where**:
  - `src/core/powerups/PowerUpManager.ts`, lines 269–275:
    ```typescript
    if (player) {
      player.rapidFireTimer = this.buffState.rapidFireTimer;
      player.scatterShotTimer = this.buffState.scatterShotTimer;
      player.engineBoosterTimer = this.buffState.engineBoosterTimer;
      player.hasShield = this.buffState.hasShield;
      player.empBombCount = this.buffState.empBombCount;
    }
    ```
  - `src/entities/Player.ts`, lines 575–581 & 619–625:
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
  - `src/core/Game.ts`, lines 631–632:
    ```typescript
    this.player.update(dt, input);
    this.powerUpManager.update(dt, this.player);
    ```
- **Why this is a problem**:
  When `hitTestAndDamage` deflects a threat, it sets `player.hasShield = false`. But `powerUpManager.buffState.hasShield` remains `true` indefinitely (it has `duration: 0` so it never ticks down). On the very next animation frame (16.6ms later), `powerUpManager.update(dt, this.player)` overwrites `player.hasShield = this.buffState.hasShield` (which is still `true`). When the 1.0s invulnerability window expires, the player still has an active shield and deflects the next hit, repeating indefinitely. The player can never be destroyed.
- **Why unit tests in `powerups.test.ts` passed**:
  In `tests/unit/powerups.test.ts` (lines 439–462), the unit test directly invoked `player.applyPowerUp(PowerUpType.KINETIC_SHIELD)` and `player.hitTestAndDamage(threat)` without running `powerUpManager.update(dt, player)` between frames.
- **Suggestion**:
  - In `Player.ts`, emit or notify shield depletion via `onShieldDeflect`:
    In `Game.ts`:
    ```typescript
    this.player.onShieldDeflect = (x, y) => {
      this.powerUpManager.buffState.hasShield = false;
      this.soundSynth.playBossHit();
      this.particleSystem.spawnHitSparks(x, y);
    };
    ```
  - AND in `PowerUpManager.update(dt, player)`:
    Synchronize bidirectionally:
    ```typescript
    if (player) {
      // If player lost shield in combat, reflect it back into manager buff state
      if (!player.hasShield) {
        this.buffState.hasShield = false;
      }
    }
    ```

---

### [Major] Finding 2: `PowerUpManager.onPlayerDeath()` is Declared but Never Invoked

- **What**: `PowerUpManager.onPlayerDeath()` (which clears `rapidFireTimer`, `scatterShotTimer`, `engineBoosterTimer`, and `hasShield`) is orphaned and never called when the player is destroyed.
- **Where**:
  - `src/core/powerups/PowerUpManager.ts`, line 447:
    ```typescript
    public onPlayerDeath(): void {
      this.buffState.rapidFireTimer = 0;
      this.buffState.scatterShotTimer = 0;
      this.buffState.engineBoosterTimer = 0;
      this.buffState.hasShield = false;
    }
    ```
  - `src/core/Game.ts`, lines 258–260, 871–877, 889–896.
- **Why this is a problem**:
  When a player dies, `player.destroy()` sets `player.rapidFireTimer = 0`, but `powerUpManager.buffState` is not reset. On the next frame, `powerUpManager.update(dt, player)` copies the remaining buff timers back to the player, allowing reserve respawned ships to inherit upgrades from destroyed ships.
- **Suggestion**:
  Hook `this.powerUpManager.onPlayerDeath()` into `Game.ts` whenever `player.destroy()` or `player.onExplode` triggers.

---

### [Minor] Finding 3: ObjectPool Bounded Capacity Alignment with Challenger Invariants

- **What**: In `src/core/powerups/PowerUpManager.ts`, the pool is constructed with `maxSize: PowerUpManager.POOL_MAX_SIZE` (128) and `autoExpand: true`, whereas `tests/unit/m11_challenger_1_adversarial.test.ts` asserts `maxSize: 32` and `autoExpand: false` for strict memory bounding.
- **Where**: `src/core/powerups/PowerUpManager.ts`, line 64.
- **Why this is a problem**: Two adversarial tests in `tests/unit/m11_challenger_1_adversarial.test.ts` fail because `manager.getPool().getMaxSize()` returns 128 instead of 32, and spawning 40 items expands the pool to 64 instead of clamping at 32.
- **Suggestion**:
  Either configure `maxSize: PowerUpManager.POOL_CAPACITY` (32) and `autoExpand: false` in `PowerUpManager.ts`, or coordinate with `m11_challenger_1` on the intended expansion semantics.

---

## Verified Claims

| Feature / Claim | Verification Method | Status | Notes |
|---|---|---|---|
| **Rapid Fire Cooldown (0.06s)** | Source inspection in `Player.ts:476-478`, Vitest test | **PASS** | `Player.FIRE_COOLDOWN * 0.5 = 0.06s`. Verified halved cooldown. |
| **Missile Quotas (2/4/6/8/12/16)** | `Player.getMaxMissileQuota()`, Vitest test | **PASS** | Correctly scales across Single/Dual and Normal/Scatter/Rapid combinations. |
| **Scatter Shot Spreads (0°, ±15°)** | `Player.attemptFire()`, vector calculation, Vitest test | **PASS** | $vx \approx \pm 124.23$, $vy \approx -463.64$. 3 streams single, 6 streams dual. |
| **Rotational Missile Rendering** | `Bullet.render()`, rotation transform | **PASS** | Angle derived from $\text{atan2}(vy, vx)$, rendered with offset $+\pi/2$. |
| **Engine Booster Speed (390 px/s)** | `Player.speed`, integration update | **PASS** | $260 \times 1.5 = 390$ px/s. Cyan thruster exhaust rendered. |
| **Zero External Assets (100%)** | `SpriteRenderer.ts` code audit, build artifact inspection | **PASS** | 10x10 procedural bitmatrices pre-baked into offscreen canvases. No image/sound files. |
| **Shield Geometry & Hull Preservation** | `Player.hitTestAndDamage()`, `SpriteRenderer.drawPlayerShieldBarrier` | **PASS (Logic)** / **FAIL (Integration)** | Logic preserves both hulls without splitting, but is corrupted by infinite re-arm in Game loop. |
| **TypeScript Compilation** | `npm run typecheck` | **PASS** | Clean compilation, 0 errors. |
| **Baseline Test Suite** | `npm test` | **PASS** | 33 test files, 721 tests passed. |
| **Production Build** | `npm run build` | **PASS** | Vite bundle built in 1.30s (213.17 kB bundle). |

---

## Integrity & Non-Circumvention Audit

- **Hardcoded test bypasses**: None found. Trigonometric math, AABB math, and bitmatrices are dynamic and genuine.
- **Dummy or facade implementations**: None. All 5 power-up types have full lifecycle implementations.
- **Task shortcuts / external dependencies**: Zero external libraries added; zero asset files loaded.
- **Fabricated verification outputs**: Verification commands were executed directly via `run_command` and verified independently.

---

## Recommendation

The worker must address **Finding 1** (clear `buffState.hasShield` upon deflection and bidirectional sync) and **Finding 2** (call `powerUpManager.onPlayerDeath()` in `Game.ts`), and resolve the pool size invariant in **Finding 3**. Once fixed, Milestone 11 will be fully compliant and ready for final approval.
