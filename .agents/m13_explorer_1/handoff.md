# Handoff Report: Milestone 13 Allies Support System Architecture

**Agent**: `m13_explorer_1`  
**Date**: 2026-09-04  
**Type**: Hard Handoff (Investigation & Architecture Design Complete)

---

## 1. Observation
1. **Existing Test Baseline**:
   - Command: `npm test`
   - Result: 46 test files passed, 863 tests passed in 2.08s with 0 failures.
2. **Player Entity Architecture (`src/entities/Player.ts`)**:
   - Line 63: Baseline $Y = 250$. Clamped horizontal bounds: $X \in [12, 212]$ (Single), $[16, 208]$ (Dual).
   - Lines 575–582:
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
     Demonstrating that setting `hasShield = true` and `shieldHp = 1` activates the full deflection shield and deflection animation.
3. **PowerUpManager Shield Synchronization (`src/core/powerups/PowerUpManager.ts`)**:
   - Line 273: `player.hasShield = this.buffState.hasShield;` in `update(dt, player)`.
   - Direct implication: When the Kinetic Aegis Drone restores shields, both `player.hasShield = true` and `powerUpManager.buffState.hasShield = true` must be updated to prevent shield overwrite on subsequent frames.
4. **BulletManager Quota Mechanism (`src/entities/Bullet.ts`)**:
   - Lines 337–360:
     ```typescript
     public firePlayerBulletWithVector(
       x: number,
       y: number,
       vx: number,
       vy: number,
       maxQuota?: number
     ): Bullet | null {
       const quota = maxQuota !== undefined ? maxQuota : BULLET_CONFIG.PLAYER_SINGLE_MAX_BULLETS;
       if (this.activePlayerBulletCount >= quota) {
         return null;
       }
       const bullet = this.bulletPool.acquire();
       if (!bullet) return null;
       bullet.init(x, y, vx, vy, 'PLAYER', 'PLAYER_MISSILE');
       this.activePlayerBulletCount++;
       ...
     ```
     `firePlayerBulletWithVector` accepts `maxQuota?: number`. When called with `maxQuota: 16`, Escort Drone plasma shots bypass the player's single (2) / dual (4) missile quotas without allocating new objects.
5. **Master Game Coordinator (`src/core/Game.ts`)**:
   - Lines 390–395: Subsystem initialization pattern:
     ```typescript
     this.crisisEventManager = new CrisisEventManager(this);
     this.powerUpManager = new PowerUpManager({ game: this });
     ```
   - Lines 751–771: Game update pipeline calls subsystem updates and triggers `resolveCollisions()`.

---

## 2. Logic Chain
1. **Unified Offensive Pipeline**:
   - *Observation 4* shows `BulletManager.firePlayerBulletWithVector` already implements zero-allocation pooling (`ObjectPool<Bullet>`), custom velocity vectors, and customizable quotas.
   - *Logic*: Rather than creating a separate projectile pool for the Escort Drone, routing drone plasma bolts through `BulletManager` with `maxQuota: 16` automatically leverages existing collision checks, scoring, and particle effects in `Game.ts` with 0 heap allocation and 0 redundant code.
2. **Defensive Shield Regeneration Invariant**:
   - *Observations 2 and 3* show that `Player.hitTestAndDamage` consumes `player.hasShield`, but `PowerUpManager.update` overwrites `player.hasShield` from `buffState.hasShield`.
   - *Logic*: The Kinetic Aegis Drone's repair pulse must synchronize both `player.hasShield = true; player.shieldHp = 1;` and `game.powerUpManager.buffState.hasShield = true;` to avoid desynchronization bugs.
3. **Strategic Bombing Runs & AOE Damage**:
   - The Bomber Drone sweeps across $Y = 36\text{ px}$ and drops cluster bombs into the enemy formation breathing zone ($Y \approx 105\text{ px}$).
   - *Logic*: Creating two dedicated pre-allocated object pools (`ObjectPool<ClusterBomb>` [16] and `ObjectPool<BombExplosion>` [16]) guarantees zero GC during high-intensity carpet bombing. Tracking hit enemy IDs in each explosion using pre-allocated arrays prevents multiple damage ticks from a single explosion.
4. **Architectural Alignment**:
   - Other core subsystems reside in `src/core/crisis/`, `src/core/boss/`, and `src/core/powerups/`.
   - *Logic*: Placing the allies subsystem in `src/core/allies/` adheres strictly to the existing architectural conventions.

---

## 3. Caveats
1. **Special Moves Separation**:
   - Special Moves (Nova Barrage, Chrono Freeze, Dimensional Warp Ram) are investigated by peer agent `m13_explorer_2`. Synergy between allies and special moves (e.g. gauge boost from drone kills) should be finalized during the worker implementation phase.
2. **Audio SFX Synthesizer**:
   - Drone weapons, shield repair chimes, and bomber sirens will use existing sound synthesizer methods (`soundSynth.playLaserDual()`, `soundSynth.playExplosion('large')`), while new dedicated chimes will be expanded in Milestone 14 (Procedural Audio & VFX).
3. **Assumptions Made**:
   - Singletons for `EscortDrone`, `AegisDrone`, and `BomberDrone` within `AlliesManager` are sufficient, as arcade conventions limit simultaneously active drones to 1–2 wingmen.

---

## 4. Conclusion
The tactical Allies Support System is fully architected and ready for implementation by `m13_worker`:
- **Directory**: `src/core/allies/` (`types.ts`, `BaseDrone.ts`, `drones/`, `pools/`, `AlliesManager.ts`, `index.ts`).
- **3 Tactical Drones**:
  - `EscortDrone`: Fixed radius elliptical orbit, autofire plasma bolts via `BulletManager`.
  - `AegisDrone`: Flank position, shield repair state machine, bi-directional sync with `PowerUpManager`.
  - `BomberDrone`: High-speed horizontal sweep ($140\text{ px/s}$), 4 cluster bomb drops, 28px AOE blast shockwaves.
- **Zero-GC Invariant**: Fully satisfied via `ObjectPool<ClusterBomb>` (16), `ObjectPool<BombExplosion>` (16), and singleton drone instances.
- **Summoning Channels**: Score milestones (15k, 35k, 60k), Power-Up item drops, and Stellaris Crisis emergency response triggers.

---

## 5. Verification Method
1. **Automated Vitest Test Suite**:
   ```bash
   npm test
   ```
   Must pass all 863 existing tests with 0 regressions.
2. **New Unit & Stress Tests (`tests/unit/allies.test.ts`)**:
   - Verify Escort Drone orbit equations, boundary clamps, and autofire rate.
   - Verify Aegis Drone state machine ($IDLE \to CHARGE \to EMIT \to COOLDOWN$) and shield restoration.
   - Verify Bomber Drone sweep kinematics and cluster bomb drop intervals.
   - Verify zero-GC pooling across 1,000 acquire/release cycles for `ClusterBomb` and `BombExplosion`.
3. **Invalidation Conditions**:
   - Heap allocation detected in `AlliesManager.update(dt)`.
   - Escort Drone bolts blocked by single/dual player missile limits.
   - Player shield not restored or overwritten by `PowerUpManager.update`.
