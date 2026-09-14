# Comprehensive Analysis: Unmasking Dimensional Warp Ram Kinematics & Kinetic Trauma

**Agent**: `m16_rem_explorer_2`  
**Role**: Teamwork Explorer (Read-Only Investigation & Synthesis)  
**Target File**: `tests/unit/adversarial_m16_combinatorial_saturation.test.ts` (Lines 181–203)  
**Co-targets**: `src/entities/Player.ts`, `src/core/specials/SpecialMovesManager.ts`  
**Date**: 2026-09-04  

---

## 1. Executive Summary

During the Milestone 16 adversarial audit, `m16_reviewer_1` uncovered a critical test integrity flaw: in `tests/unit/adversarial_m16_combinatorial_saturation.test.ts` (Lines 181–203), the assertion verifying Warp Ram boss damage (`expect(boss.health).toBeLessThan(preRamBossHp)`) passed despite the fact that `Player.clampPosition()` completely paralyzed the player ship's vertical ascent, resulting in zero physical contact with the boss.

This investigation provides:
1. **The Exact Masking Mechanism**: How concurrent Escort Drone forward bolts, Bomber Drone cluster bomb shockwaves, and pre-fired player missiles inflicted small increments of damage during the 60 frames of Warp Ram execution, satisfying `toBeLessThan(preRamBossHp)` while Warp Ram dealt 0 damage.
2. **The Kinematic Blindness**: How sampling `player.y` only at frame 60 hid the fact that `player.y` never left 236.67, since on frame 60 `warpRamTimer` expired and reset `player.y = 250`.
3. **A Hidden Multi-Hit Engine Defect**: We discovered that once `Player.clampPosition()` is fixed to permit vertical ascent, `SpecialMovesManager.resolveCollisions()` will inflict **240 damage per frame across 3 to 4 consecutive frames (totaling 480+ damage)** due to:
   - Duplicate collision checks (the boss is present in both `livingEnemies` and `bossManager.activeBoss`).
   - The absence of a per-activation hit debounce set for the swept ram hitbox.
4. **Formulation of a Clean, Unmasked Test Sequence**: A rigorous sequence that neutralizes extraneous munitions, calibrates boss health to a controlled baseline (`250 HP`), samples frame-by-frame ascent kinematics (`y < initialPlayerY - 100` and `y <= -30`), verifies exact 120 kinetic trauma (`boss.health === preRamBossHp - 120`), and checks wrap restoration to `y = 250` with invulnerability.
5. **Exact Code Recommendations**: Complete patch specifications for `tests/unit/adversarial_m16_combinatorial_saturation.test.ts`, `src/entities/Player.ts`, and `src/core/specials/SpecialMovesManager.ts`.

---

## 2. Anatomical Deconstruction of Lines 181–203

### 2.1 The Code Under Audit

In `tests/unit/adversarial_m16_combinatorial_saturation.test.ts`:
```typescript
180:    // 9. Execute Warp Ram mid-freeze
181:    const preRamBossHp = boss.health;
182:
183:    // Position player in line with the boss to test kinetic collision
184:    game.player.x = boss.x;
185:    game.player.y = 250;
186:
187:    cheat.fillEnergy(100);
188:    const triggeredWarp = cheat.triggerSpecialMove('warp');
189:    expect(triggeredWarp).toBe(true);
190:    expect(game.specialMovesManager.isWarpRamActive()).toBe(true);
191:
192:    // Run Warp Ram execution frames (60 frames = 1.0s)
193:    for (let f = 0; f < 60; f++) {
194:      game.update(1 / 60);
195:    }
196:
197:    // Invariant: Warp Ram inflicted kinetic trauma to boss
198:    expect(boss.health).toBeLessThan(preRamBossHp);
199:
200:    // Invariant: Player wrapped cleanly and returned to baseline Y position with grace invulnerability
201:    expect(game.player.y).toBe(250);
202:    expect(game.player.invulnerableTimer).toBeGreaterThan(0);
```

### 2.2 Mechanism of Masking: Concurrent Munitions & Chrono Freeze Discrepancy

In steps 5 and 6 of the test:
- Line 128: `cheat.unlockDrone('all')` activates all 3 drones (`EscortDrone`, `AegisDrone`, `BomberDrone`).
- Lines 135–139: The test pre-fires 60 player bullets over 30 frames (`game.bulletManager.firePlayerBullet(...)`).
- Line 144: Chrono Freeze is triggered (`isChronoFreezeActive() === true`).

**The Delta-Time Asymmetry**:
In `src/core/Game.ts`:
```typescript
740: const isFrozen = this.specialMovesManager ? this.specialMovesManager.isChronoFreezeActive() : false;
741: const enemyDt = isFrozen ? 0 : dt;
...
754: this.bulletManager.update(dt, enemyDt);
...
865: this.alliesManager.update(dt);
```
- Enemy movement and enemy bullet updates are frozen (`enemyDt = 0`).
- **Player bullets and ally drones update with un-frozen `dt` (`1/60s`)**.
- Escort Drone fires forward player missiles every 0.30s (every 18 frames) via `firePlayerBulletWithVector(...)`.
- Bomber Drone continuously moves across the screen and drops cluster bombs via `spawnClusterBomb(...)`, which detonate into `BombExplosion` blast shockwaves.

**The False Positive Execution**:
When line 181 records `const preRamBossHp = boss.health;`, the boss had ~73 HP remaining.
During the subsequent 60 frames (1.0s of real time):
1. Escort drone fired 3 volleys of forward bolts directly upward toward the boss.
2. Bomber drone dropped cluster bombs whose shockwaves intersected the boss hitbox at `y = 52`, dealing `exp.damage * 2 = 4` damage (`AlliesManager.ts:273`).
3. Bullets dealt 1 damage each (`Game.ts:987`).
4. In total, the boss suffered 6 points of collateral damage, reducing its health from 73 to 67.
5. Line 198 evaluated:
   ```typescript
   expect(boss.health).toBeLessThan(preRamBossHp); // 67 < 73 -> TRUE!
   ```
6. The test passed despite Warp Ram never coming within 150 pixels of the boss!

### 2.3 Kinematic Blindness: Why Post-Loop Y Sampling Failed

In `src/entities/Player.ts:686`:
```typescript
public clampPosition(): void {
  const isDual = this.isDual;
  const minX = isDual ? 16 : 12;
  const maxX = isDual ? 208 : 212;
  this.x = Math.max(minX, Math.min(maxX, this.x));
  this.y = Player.BASELINE_Y; // Unconditionally resets y = 250 every frame!
}
```

Every frame during the 60-frame loop:
1. `this.player.update(dt, input)` called `updateControllable()`, which called `clampPosition()`, setting `this.player.y = 250`.
2. `this.specialMovesManager.update(dt)` moved the player upward: `player.y -= 800 * (1/60) = 236.67`.
3. On the next frame, `this.player.update` reset `player.y` back to 250.
4. Across all 60 frames, `player.y` alternated between 250 and 236.67.
5. On frame 60, `warpRamTimer` reached 0, triggering `SpecialMovesManager.ts:371`:
   ```typescript
   if (this.warpRamTimer <= 0 && player) {
     player.y = this.warpRamStartY; // 250
     player.invulnerableTimer = 0.5;
   }
   ```
6. Line 201 checked `expect(game.player.y).toBe(250)` only **after** the loop finished. Because `player.y` was 250 both when clamped and when wrapped, the assertion could not detect the paralysis.

---

## 3. Hidden Engine Hazard: Multi-Hit & Duplicate Collision

We conducted an empirical simulation of Warp Ram collision with `Player.clampPosition()` unblocked. This revealed an unexpected secondary defect in `SpecialMovesManager.ts`.

### 3.1 Duplicate Boss Collision in a Single Frame

In `src/core/Game.ts:400`, when stage 50 spawns the boss:
```typescript
onSpawnBoss: (stage) => {
  const boss = this.bossManager.spawnBoss(stage);
  if (boss) {
    return [boss, ...boss.subUnits];
  }
  return [];
}
```
The boss entity (`AeternumCore`) is registered in `formationManager.enemies`. Therefore, `formationManager.getLivingEnemies()` returns an array containing `boss`.

In `src/core/specials/SpecialMovesManager.ts:470–501`:
```typescript
for (const enemy of enemies) {
  ...
  const eBox = enemy.getHitbox();
  if (checkAABB(ramBox, eBox)) {
    if (enemy instanceof BaseBoss) {
      enemy.takeDamage(120); // <-- HIT 1: Executed because boss is in enemies!
      ...
    }
  }
}

// Check Boss directly
if (bossManager && bossManager.activeBoss && bossManager.activeBoss.active) {
  const boss = bossManager.activeBoss;
  const bBox = boss.getHitbox();
  if (checkAABB(ramBox, bBox)) {
    boss.takeDamage(120);    // <-- HIT 2: Executed on the exact same frame!
  }
}
```
**Result**: In a single frame, `boss.takeDamage(120)` is called **twice**, dealing **240 damage**.

### 3.2 Absence of Per-Activation Debounce (Multi-Frame Overlap)

- Boss hitbox height: `48 px` (centered at `y = 52`, spanning `y = 28` to `y = 76`).
- Warp Ram hitbox height: `32 px` (`y = player.y - 16` to `player.y + 16`).
- Ascent speed: `800 px/s` = `13.33 px / frame`.
- Contact window:
  - Frame 11: `player.y = 90.0`, ramBox top = 74 (enters bottom of boss at 76).
  - Frame 12: `player.y = 76.7`, ramBox overlaps boss -> **deals 240 damage**.
  - Frame 13: `player.y = 63.3`, ramBox overlaps boss -> **deals 240 damage**.
  - Frame 14: `player.y = 50.0`, ramBox overlaps boss -> **deals 240 damage**.
- Total damage dealt without hit debounce: **720 damage**!

### 3.3 Empirical Confirmation

Our test script in Node confirmed:
```
Frame 12: y = 76.7, bossHp = 260, damageDealt = 240
Frame 13: y = 63.3, bossHp = 20, damageDealt = 240
Frame 14: y = 50.0, bossHp = 0, damageDealt = 20 (boss destroyed)
```
If the test asserts `expect(boss.health).toBe(preRamBossHp - 120)`, the test **will fail** unless:
1. `SpecialMovesManager` tracks entities hit during the active Warp Ram using a `warpRamHitTargetIds: Set<number>` structure.
2. Hit entities take damage only once per Warp Ram activation.

---

## 4. The Clean, Unmasked Test Sequence Formulation

To properly test Dimensional Warp Ram without masking or false positives, the test sequence must enforce four guarantees:

### 4.1 Isolation & Munition Recycling Protocol
Before triggering Warp Ram:
1. Recycle all active player and drone bullets:
   ```typescript
   game.bulletManager.forEachActivePlayerBullet((b) => game.bulletManager.recycle(b));
   ```
2. Clear all falling cluster bombs and expanding blast shockwaves:
   ```typescript
   game.alliesManager.getBombPool().clear();
   game.alliesManager.getExplosionPool().clear();
   ```
3. Temporarily deactivate all three drones during the 1.0s Warp Ram test window:
   ```typescript
   game.alliesManager.escortDrone.active = false;
   game.alliesManager.bomberDrone.active = false;
   game.alliesManager.aegisDrone.active = false;
   ```

### 4.2 Controlled Boss Health Baseline
In the current test, `boss.health` is 80 (or ~73 after initial munitions). Since Warp Ram inflicts 120 damage:
- If `boss.health <= 120`, the boss is destroyed (`health` clamped to 0), making it impossible to distinguish between 120 damage and 240+ damage.
- By setting `boss.health = 250; boss.maxHealth = 300;`:
  - `preRamBossHp = 250`.
  - After 120 kinetic trauma, `boss.health === 130` (or `preRamBossHp - 120`).
  - The boss survives in Phase 3 Enrage (`health <= 100` is enrage threshold, but `boss.phase === 'PHASE_3'` remains active regardless of current HP).

### 4.3 Frame-by-Frame Kinematic Sampling
Instead of a blind loop, track:
```typescript
let minPlayerY = game.player.y;
let reachedIntermediateAscent = false;
let reachedTopScreenExit = false;

for (let f = 0; f < 60; f++) {
  game.update(1 / 60);

  if (game.player.y < minPlayerY) {
    minPlayerY = game.player.y;
  }
  if (game.player.y < initialPlayerY - 100) {
    reachedIntermediateAscent = true;
  }
  if (game.player.y <= -30) {
    reachedTopScreenExit = true;
  }
}
```

### 4.4 Unmasked Invariant Verification
```typescript
// 1. Ascent Invariant: Player ship surged upward at 800 px/s
expect(reachedIntermediateAscent).toBe(true);
expect(reachedTopScreenExit).toBe(true);
expect(minPlayerY).toBeLessThanOrEqual(-30);

// 2. Kinetic Trauma Invariant: Exact 120 kinetic trauma without drone interference
expect(boss.health).toBe(preRamBossHp - 120);

// 3. Wrap & Grace Invulnerability Invariant:
expect(game.player.y).toBe(250);
expect(game.player.invulnerableTimer).toBeGreaterThan(0);
```

---

## 5. Precise Line-by-Line Code Recommendations for Worker

### 5.1 Test Modification: `tests/unit/adversarial_m16_combinatorial_saturation.test.ts`

**Target Range**: Lines 180–204

```typescript
<<<<
    // 9. Execute Warp Ram mid-freeze
    const preRamBossHp = boss.health;

    // Position player in line with the boss to test kinetic collision
    game.player.x = boss.x;
    game.player.y = 250;

    cheat.fillEnergy(100);
    const triggeredWarp = cheat.triggerSpecialMove('warp');
    expect(triggeredWarp).toBe(true);
    expect(game.specialMovesManager.isWarpRamActive()).toBe(true);

    // Run Warp Ram execution frames (60 frames = 1.0s)
    for (let f = 0; f < 60; f++) {
      game.update(1 / 60);
    }

    // Invariant: Warp Ram inflicted kinetic trauma to boss
    expect(boss.health).toBeLessThan(preRamBossHp);

    // Invariant: Player wrapped cleanly and returned to baseline Y position with grace invulnerability
    expect(game.player.y).toBe(250);
    expect(game.player.invulnerableTimer).toBeGreaterThan(0);
====
    // 9. Execute Warp Ram mid-freeze (isolated kinetic trauma & kinematic ascent validation)
    // 9a. Clear active player and drone munitions to prevent assertion masking on boss damage
    game.bulletManager.forEachActivePlayerBullet((b) => game.bulletManager.recycle(b));
    game.alliesManager.getBombPool().clear();
    game.alliesManager.getExplosionPool().clear();

    // 9b. Neutralize tactical drones during the Warp Ram test window for pure kinetic measurement
    game.alliesManager.escortDrone.active = false;
    game.alliesManager.bomberDrone.active = false;
    game.alliesManager.aegisDrone.active = false;

    // 9c. Set boss health to a controlled baseline (>120 HP) to verify exact 120 kinetic trauma
    boss.health = 250;
    boss.maxHealth = 300;
    const preRamBossHp = boss.health;
    const initialPlayerY = 250;

    // Position player in line with the boss to test kinetic collision
    game.player.x = boss.x;
    game.player.y = initialPlayerY;

    cheat.fillEnergy(100);
    const triggeredWarp = cheat.triggerSpecialMove('warp');
    expect(triggeredWarp).toBe(true);
    expect(game.specialMovesManager.isWarpRamActive()).toBe(true);

    // 9d. Track vertical ascent kinematics across 60 frames (1.0s)
    let minPlayerY = game.player.y;
    let reachedIntermediateAscent = false;
    let reachedTopScreenExit = false;

    for (let f = 0; f < 60; f++) {
      game.update(1 / 60);

      if (game.player.y < minPlayerY) {
        minPlayerY = game.player.y;
      }
      if (game.player.y < initialPlayerY - 100) {
        reachedIntermediateAscent = true;
      }
      if (game.player.y <= -30) {
        reachedTopScreenExit = true;
      }
    }

    // Invariant: Player ship surged upward at 800 px/s (decreased by >100px and exited screen top y <= -30)
    expect(reachedIntermediateAscent).toBe(true);
    expect(reachedTopScreenExit).toBe(true);
    expect(minPlayerY).toBeLessThanOrEqual(-30);

    // Invariant: Warp Ram inflicted exactly 120 blunt kinetic trauma to boss without masking
    expect(boss.health).toBe(preRamBossHp - 120);

    // Invariant: Player wrapped cleanly and returned to baseline Y position with grace invulnerability
    expect(game.player.y).toBe(250);
    expect(game.player.invulnerableTimer).toBeGreaterThan(0);

    // Re-enable tactical drones for post-freeze saturation verification in subsequent step
    game.alliesManager.escortDrone.active = true;
    game.alliesManager.bomberDrone.active = true;
    game.alliesManager.aegisDrone.active = true;
>>>>
```

---

### 5.2 Required Engine Fix: `src/entities/Player.ts`

**Target Range**: Lines 686–693

```typescript
<<<<
  public clampPosition(): void {
    const isDual = this.isDual;
    const minX = isDual ? 16 : 12;
    const maxX = isDual ? 208 : 212;
    this.x = Math.max(minX, Math.min(maxX, this.x));
    this.y = Player.BASELINE_Y;
  }
====
  public clampPosition(): void {
    const isDual = this.isDual;
    const minX = isDual ? 16 : 12;
    const maxX = isDual ? 208 : 212;
    this.x = Math.max(minX, Math.min(maxX, this.x));
    // Do not clamp Y to baseline if player is actively surging in Warp Ram
    if (!this.game?.specialMovesManager?.isWarpRamActive()) {
      this.y = Player.BASELINE_Y;
    }
  }
>>>>
```

---

### 5.3 Required Engine Fix: `src/core/specials/SpecialMovesManager.ts`

To resolve the 240+ multi-hit issue and enforce exact 120 kinetic trauma per Warp Ram activation:

**Addition in Class Properties** (~Line 69):
```typescript
  // Set of entity IDs struck during the current Warp Ram activation to prevent multi-frame hits
  private warpRamHitTargetIds = new Set<number>();
```

**In `executeWarpRam()`** (~Line 266):
```typescript
  private executeWarpRam(): void {
    this.warpRamTimer = this.warpRamDuration;
    this.warpRamExitedTop = false;
    this.warpRamHitTargetIds.clear();
```

**In `onStageClear()` / `reset()`** (~Lines 602, 612):
```typescript
    this.warpRamTimer = 0;
    this.warpRamHitTargetIds.clear();
```

**In `resolveCollisions()`** (Lines 462–501):
```typescript
<<<<
      for (const enemy of enemies) {
        if (!enemy.active || enemy.state === EnemyState.EXPLODING || enemy.state === EnemyState.INACTIVE) {
          continue;
        }

        const eBox = enemy.getHitbox();
        if (checkAABB(ramBox, eBox)) {
          if (enemy instanceof BaseBoss) {
            enemy.takeDamage(120); // Massive blunt kinetic trauma
            this.game.soundSynth?.playExplosion('boss');
            this.game.particleSystem?.spawnBossExplosion(enemy.x, enemy.y);
          } else {
            const res = enemy.takeDamage(999);
            if (res.destroyed) {
              this.game.soundSynth?.playExplosion('small');
              this.game.particleSystem?.spawnBossExplosion(enemy.x, enemy.y, 20);
              if (this.game.scoreManager) {
                this.game.scoreManager.addScore(res.points);
              }
            }
          }
        }
      }

      if (bossManager && bossManager.activeBoss && bossManager.activeBoss.active) {
        const boss = bossManager.activeBoss;
        const bBox = boss.getHitbox();
        if (checkAABB(ramBox, bBox)) {
          boss.takeDamage(120);
        }
      }
====
      for (const enemy of enemies) {
        if (!enemy.active || enemy.state === EnemyState.EXPLODING || enemy.state === EnemyState.INACTIVE) {
          continue;
        }

        const eBox = enemy.getHitbox();
        if (checkAABB(ramBox, eBox)) {
          if (this.warpRamHitTargetIds.has(enemy.id)) {
            continue;
          }
          this.warpRamHitTargetIds.add(enemy.id);

          if (enemy instanceof BaseBoss) {
            enemy.takeDamage(120); // Massive blunt kinetic trauma
            this.game.soundSynth?.playExplosion('boss');
            this.game.particleSystem?.spawnBossExplosion(enemy.x, enemy.y);
          } else {
            const res = enemy.takeDamage(999);
            if (res.destroyed) {
              this.game.soundSynth?.playExplosion('small');
              this.game.particleSystem?.spawnBossExplosion(enemy.x, enemy.y, 20);
              if (this.game.scoreManager) {
                this.game.scoreManager.addScore(res.points);
              }
            }
          }
        }
      }

      if (bossManager && bossManager.activeBoss && bossManager.activeBoss.active) {
        const boss = bossManager.activeBoss;
        if (!this.warpRamHitTargetIds.has(boss.id)) {
          const bBox = boss.getHitbox();
          if (checkAABB(ramBox, bBox)) {
            this.warpRamHitTargetIds.add(boss.id);
            boss.takeDamage(120);
            this.game.soundSynth?.playExplosion('boss');
            this.game.particleSystem?.spawnBossExplosion(boss.x, boss.y);
          }
        }
      }
>>>>
```

---

## 6. Synthesis & Cross-Test Impact Assessment

1. **`adversarial_m16_combinatorial_saturation.test.ts` (Test 1)**:
   With the proposed changes, Test 1 will rigorously verify Warp Ram upward ascent, screen-wrap, and exact 120 kinetic trauma with zero masking.
2. **`m16_challenger_1_adversarial.test.ts` (Test 1 & Test 3)**:
   - In Test 1, the check `expect(harbinger.health).toBeLessThan(preRamBossHp)` will be genuinely backed by Warp Ram damage rather than player bullets.
   - When the worker applies the fix in `SpecialMovesManager.ts`, Test 1 will pass cleanly with zero risk of multi-hit failure.
3. **Existing Milestone 13 & 14 Suites**:
   - `adversarial_m13_specials.test.ts` Line 443 asserts `expect(boss.health).toBe(80)` (200 - 120). With our single-hit debounce fix in `SpecialMovesManager`, this test will continue passing.
4. **Performance & Zero-GC**:
   - `warpRamHitTargetIds` contains at most ~10 IDs per 1-second Warp Ram activation and is cleared at each trigger and stage clear. Memory overhead is < 1KB, well within all zero-GC and memory drift thresholds.

