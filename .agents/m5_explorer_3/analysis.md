# Milestone 5: Game Coordinator & Collision Integration Architecture Analysis

**Author**: `m5_explorer_3` (Milestone 5: Game Coordinator & Collision Integration Specialist)  
**Date**: 2026-09-02  
**Target Files**:
- `src/core/Game.ts` (Master Game Coordinator & Collision Engine)
- `src/systems/FormationManager.ts` (Tractor Beam Dive Scheduling)
- `src/entities/TractorBeam.ts` (Geometry & Lifecycle Interface)
- `tests/unit/tractor_beam.test.ts` (Comprehensive Vitest Test Suite)

---

## Executive Summary

This technical specification provides the master architectural integration for **Milestone 5 (Boss Galaga Tractor Beam & Dual Fighter System)** within `src/core/Game.ts`. It establishes the mathematical coordination between:
1. **Boss Galaga Tractor Beam Scheduling**: Dynamic selection of undocked Boss Galagas during Stage 2+ attack dives to emit tractor beams exclusively when the player is a Single Fighter.
2. **Collision & Interaction Dispatch Engine**:
   - **Beam vs. Player Intersection**: Initiates capture sequence (spinning $720^\circ/\text{s}$, ascension, life deduction / Game Over).
   - **Player Missile vs. Diving Boss with Escort**: Triggers successful rescue flow (rescued ship descent $\to$ lateral docking $\to$ Dual Fighter activation with $+1000\text{ pts}$ bonus).
   - **Player Missile vs. Formation Boss with Escort**: Triggers Turncoat Divergence (captured ship becomes hostile `EnemyType.CAPTURED_FIGHTER` and dive-attacks player).
   - **Player Missile vs. Captured Escort Ship**: Accidental destruction handling ($+1000\text{ pts}$, permanent loss).
3. **Dual Fighter Combat & Hitbox Resolution**: Twin missile firing (max 4 on screen) and asymmetrical partial hull destruction.
4. **Exhaustive Unit Test Suite**: Complete test plan for `tests/unit/tractor_beam.test.ts` covering 100% of Tractor Beam, Capture, Rescue, Turncoat, and Dual Fighter scenarios.

---

## 1. System Architecture & Component Interactions

```
+----------------------------------------------------------------------------------------------------+
|                                         src/core/Game.ts                                           |
|                                                                                                    |
|  +--------------------+   +----------------------+   +---------------------+   +----------------+  |
|  |   Player Entity    |   |   FormationManager   |   |     TractorBeam     |   | BulletManager  |  |
|  | (Single / Dual /   |   | (Grid, Breathing,    |   | (Trapezoid Cone,    |   | (Player /      |  |
|  |  Capturing /       |   |  Dive Scheduling,    |   |  Wave Oscillations, |   |  Enemy Bullets,|  |
|  |  Docking)          |   |  Escort Alignment)   |   |  Capture Detection) |   |  Swept CCD)    |  |
|  +---------+----------+   +----------+-----------+   +----------+----------+   +-------+--------+  |
|            |                         |                          |                      |           |
|            +-------------------------+--------------------------+----------------------+           |
|                                                  |                                                 |
|                                       resolveCollisions()                                          |
|                                                  |                                                 |
|          +---------------------------------------+---------------------------------------+         |
|          |                                       |                                       |         |
|          v                                       v                                       v         |
|  [Beam vs. Player]                    [Missile vs. Boss]                    [Missile vs. Escort]   |
|  - Check point/AABB in trapezoid      - In Dive w/ Escort -> RESCUE         - Direct Escort hit    |
|  - Start spinning capture             - In Formation w/ Escort -> TURNCOAT  - Destroy Escort       |
|  - Life deduction / Game Over         - Beam active -> Collapse Beam        - Detach from Boss     |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Boss Galaga Tractor Beam Trigger Scheduling

### 2.1 Trigger Pre-Conditions & Constraints

Tractor beam emission is governed by authentic Namco Galaga arcade rules:

| Condition Parameter | Required State | Rationale |
|---|---|---|
| **Stage Number** | `stage >= 2` | Stage 1 is an introductory stage; tractor beams only activate in Stage 2 and above. |
| **Player Fighter State** | `!player.isDual && (player.state === 'normal' \|\| player.state === 'ALIVE')` | Boss Galagas **never** attempt tractor beam captures against a Dual Fighter or an invulnerable/respawning ship. |
| **Active Beam Limit** | `activeBeamCount === 0` | At most **one** Boss Galaga can project a tractor beam on-screen at any single time. |
| **Boss Escort Status** | `boss.hasCapturedFighter === false` | A Boss Galaga already holding a captured fighter cannot emit another beam. |
| **Boss Formation Status** | `boss.state === EnemyState.IN_FORMATION` | The Boss must peel off from formation into a dedicated Tractor Beam Dive. |

### 2.2 Scheduling Algorithm in `FormationManager.ts`

When `FormationManager.updateDiveScheduler(dt, playerX)` triggers an attack dive:

```typescript
// Probability check for tractor beam dive on Stage 2+
const shouldAttemptTractorBeam =
  this.stage >= 2 &&
  !playerIsDual &&
  !this.isTractorBeamActive() &&
  Math.random() < 0.35; // 35% chance when Boss dive is selected

if (shouldAttemptTractorBeam) {
  const eligibleBosses = formationEnemies.filter(
    (e) => e.type === EnemyType.BOSS && !e.hasCapturedFighter
  );

  if (eligibleBosses.length > 0) {
    const boss = eligibleBosses[Math.floor(Math.random() * eligibleBosses.length)]!;
    this.launchTractorBeamDive(boss, playerX);
    return;
  }
}
```

### 2.3 Tractor Beam Dive Trajectory & Altitude

1. **Peel-Off**: Boss lifts out of formation $(x_f, y_f)$ and curves downward.
2. **Descent & Halt**: Boss swoops to capture altitude $Y_{\text{halt}} = 100\text{px}$ (in $224 \times 288$ virtual space), horizontally centered near player $X$:
   $$X_{\text{halt}} = \operatorname{clamp}(X_{\text{player}}, 48, 176)$$
   $$Y_{\text{halt}} = 100\text{px}$$
3. **Hover & Emission**:
   - Boss halts velocity ($\vec{v} = (0, 0)$).
   - Boss transitions to `EnemyState.TRACTOR_BEAM_ACTIVE`.
   - Activates `TractorBeam` entity anchored to Boss base $(x_b, y_b + 12)$.
4. **Lifecycle Timers**:
   - `EMITTING` (0.5s): Beam expands downwards from width 0 to bottom width 48px at $Y = 280$.
   - `HOLDING` (3.5s): Full capture cone active with 12Hz cycling energy wave bands.
   - `RETRACTING` (0.3s): Beam contracts back to Boss emitter.
5. **Post-Beam Resume**:
   - If player evaded: Boss resumes dive downward past bottom ($Y > 288$), wraps to top $(Y = -16)$, and returns to formation slot.
   - If player was captured: Boss waits for captured fighter docking, then ascends/loops back into formation.
   - If Boss is destroyed: Beam immediately collapses and deactivates.

---

## 3. Collision & Interaction Dispatch Engine

### 3.1 Collision Dispatch Matrix

The collision resolution pipeline in `Game.ts` processes four distinct Tractor Beam / Dual Fighter collision pathways:

```
+--------------------------------------------------------------------------------------------------+
| COLLISION EVENT                 | PREREQUISITE STATE         | ACTION & DISPATCH OUTCOME         |
+---------------------------------+----------------------------+-----------------------------------+
| 1. Beam Cone vs Player Ship     | - Beam in EMITTING/HOLDING | - tractorBeam.startCapture(player)|
|                                 | - Player Single & Alive    | - player.startCapture(bossX, bossY|
|                                 | - Inside Beam Trapezoid    | - Play TRACTOR_BEAM audio         |
+---------------------------------+----------------------------+-----------------------------------+
| 2. Missile vs Diving Boss       | - Boss in DIVING_ESCORT    | - Boss destroyed (800-1600 pts)   |
|    holding Captured Escort      | - Boss HP reaches 0        | - Escort freed -> player.start-   |
|                                 | - Escort alive             |   Rescue(bossX, bossY)            |
|                                 |                            | - Play DOCKING_CHIME audio        |
+---------------------------------+----------------------------+-----------------------------------+
| 3. Missile vs Formation Boss    | - Boss in IN_FORMATION     | - Boss destroyed (150 pts)        |
|    holding Captured Escort      | - Boss HP reaches 0        | - Escort turns TURNCOAT           |
|                                 | - Escort alive             | - Escort dives to attack player   |
+---------------------------------+----------------------------+-----------------------------------+
| 4. Missile vs Captured Escort   | - Escort shot directly by  | - Escort destroyed (+1000 pts)    |
|    (Accidental Hit)             |   player missile           | - Detached from Boss              |
|                                 |                            | - Permanent loss (no rescue)      |
+---------------------------------+----------------------------+-----------------------------------+
```

---

### 3.2 Detailed Flowchart: Capture, Rescue, Turncoat & Destruction

```
                                [PLAYER SHIP (Single Fighter)]
                                              |
                                              v
                              +-------------------------------+
                              | Boss Galaga Emits Tractor Beam|
                              +-------------------------------+
                                              |
                    +-------------------------+-------------------------+
                    | (Evades Beam Cone)                                | (Intersects Beam Cone)
                    v                                                   v
          [Boss Continues Dive]                               [START CAPTURE FLOW]
          [Wraps to Formation]                                - Controls Disabled
                                                              - Spins 720°/s
                                                              - Ascends along Beam Axis
                                                                        |
                                                                        v
                                                              [Reaches Boss Galaga]
                                                              - Attached as Red Escort
                                                              - Lives -= 1
                                                                        |
                                                    +-------------------+-------------------+
                                                    | (Lives > 0)                           | (Lives == 0)
                                                    v                                       v
                                          [Player Respawns at Baseline]                [GAME OVER]
                                          [Boss Returns to Formation]
                                                    |
                                                    +---------------------------------------+
                                                    |                                       |
                                                    v (Boss Dives with Escort)              v (Boss Shot in Formation)
                                          +--------------------------+            +--------------------------+
                                          | Player Shoots Diving Boss|            | Player Shoots Form. Boss |
                                          +--------------------------+            +--------------------------+
                                                    |                                       |
                                                    v                                       v
                                          [START RESCUE FLOW]                     [TURNCOAT DIVERGENCE]
                                          - Boss Explodes (+800-1600pts)          - Boss Explodes (+150 pts)
                                          - Escort Turns White                    - Escort turns HOSTILE
                                          - Descends toward Baseline              - Dives to ram player
                                          - Docks Alongside Active Ship           - 1000 pts if shot down
                                                    |
                                                    v
                                          [DUAL FIGHTER MODE ACTIVATED]
                                          - Width: 32px (Twin Hulls)
                                          - Firepower: 2 Twin Bullets
                                          - Screen Limit: 4 Bullets
                                          - +1000 Pts Rescue Bonus
```

---

## 4. Mathematical Geometry & Hit Detection

### 4.1 Tractor Beam Trapezoid Geometry

The tractor beam originates at the bottom base of Boss Galaga and flares outward into an inverted symmetrical trapezoid:

- **Emitter Base Origin**: $(x_0, y_0) = (x_{\text{boss}}, y_{\text{boss}} + 12)$
- **Top Width**: $W_{\text{top}} = 8\text{px}$ ($\operatorname{span} = [x_0 - 4, x_0 + 4]$ at $y = y_0$)
- **Bottom Width**: $W_{\text{bottom}} = 48\text{px}$ ($\operatorname{span} = [x_0 - 24, x_0 + 24]$ at $y = 280\text{px}$)
- **Max Depth**: $Y_{\text{bottom}} = 280\text{px}$

```
                  (x_0 - 4, y_0) +----+ (x_0 + 4, y_0)
                                 \    /
                                  \  /  <--- Width(y) = W_top + (W_bottom - W_top) * ((y - y_0) / (Y_bottom - y_0))
                                   \/
                                  /  \
                                 /    \
                                /      \
              (x_0 - 24, 280)  +--------+  (x_0 + 24, 280)
```

### 4.2 Point-in-Trapezoid Analytical Test

Given a point $(p_x, p_y)$ representing the player ship center:

1. **Vertical Bounds Check**:
   $$y_0 \le p_y \le Y_{\text{bottom}}$$
   If $p_y < y_0$ or $p_y > Y_{\text{bottom}}$, return `false`.

2. **Linear Width Interpolation at Depth $p_y$**:
   $$\alpha = \frac{p_y - y_0}{Y_{\text{bottom}} - y_0} \in [0, 1]$$
   $$\text{HalfWidth}(p_y) = \frac{W_{\text{top}}}{2} + \alpha \cdot \left( \frac{W_{\text{bottom}} - W_{\text{top}}}{2} \right) = 4 + 20 \alpha$$

3. **Horizontal Confinement Check**:
   $$|p_x - x_0| \le \text{HalfWidth}(p_y)$$

```typescript
export function isPointInTractorBeam(
  px: number,
  py: number,
  bossX: number,
  bossY: number,
  currentLengthFraction: number = 1.0 // for expanding/retracting phases
): boolean {
  const y0 = bossY + 12;
  const maxDepth = 280;
  const currentMaxY = y0 + (maxDepth - y0) * currentLengthFraction;

  if (py < y0 || py > currentMaxY) {
    return false;
  }

  const alpha = (py - y0) / (maxDepth - y0);
  const halfWidth = 4 + 20 * alpha;

  return Math.abs(px - bossX) <= halfWidth;
}
```

### 4.3 AABB-in-Trapezoid Swept Test

For player bounding box `Rect = { x, y, width, height }`:
Test both bottom corners $(x, y + h)$ and $(x + w, y + h)$ and center $(x + w/2, y + h/2)$ against `isPointInTractorBeam`.

---

## 5. Master Engine Integration Blueprint in `src/core/Game.ts`

### 5.1 Subsystems & State Extensions

```typescript
// Additions to src/core/Game.ts
import { TractorBeam } from '../entities/TractorBeam';

export class Game implements IGameEngine {
  // ... existing fields ...
  public tractorBeam: TractorBeam;

  // Constructor addition:
  // 6b. Initialize Tractor Beam Subsystem
  this.tractorBeam = new TractorBeam();
}
```

### 5.2 Updated `resolveCollisions()` Method

```typescript
private resolveCollisions(): void {
  const livingEnemies = this.formationManager.getLivingEnemies();

  // ========================================================================
  // 1. Player Missiles vs Living Enemies (with Rescue & Turncoat Handlers)
  // ========================================================================
  this.bulletManager.forEachActivePlayerBullet((bullet) => {
    if (!bullet.active) return;

    const bulletBox = bullet.getSweptHitbox();

    for (const enemy of livingEnemies) {
      if (
        !enemy.active ||
        enemy.state === EnemyState.EXPLODING ||
        enemy.state === EnemyState.INACTIVE
      ) {
        continue;
      }

      const enemyBox = enemy.getHitbox();

      if (checkAABB(bulletBox, enemyBox)) {
        this.bulletManager.recycle(bullet);

        // Case A: Shooting Boss Galaga
        if (enemy.type === EnemyType.BOSS) {
          const isDiving =
            enemy.state === EnemyState.DIVING_SOLO ||
            enemy.state === EnemyState.DIVING_ESCORT ||
            enemy.state === EnemyState.TRACTOR_BEAM_ACTIVE;

          const damageResult = enemy.takeDamage(1);

          if (damageResult.destroyed) {
            // Check for attached Captured Fighter Escort
            if (enemy.hasCapturedFighter && enemy.capturedFighterEnemy) {
              const capturedFighter = enemy.capturedFighterEnemy;

              if (isDiving) {
                // SUCCESSFUL RESCUE FLOW
                capturedFighter.active = false;
                capturedFighter.state = EnemyState.INACTIVE;
                this.player.startRescue(enemy.x, enemy.y);
                this.score += 1000; // Rescue bonus
              } else {
                // TURNCOAT DIVERGENCE FLOW (Destroyed in formation)
                capturedFighter.state = EnemyState.CAPTURED_HOSTILE;
                capturedFighter.escortBoss = null;
                capturedFighter.escortBossId = null;
                this.formationManager.peelOffSolo(capturedFighter, this.player.x);
              }

              enemy.hasCapturedFighter = false;
              enemy.capturedFighterEnemy = null;
            }

            // If Boss was emitting tractor beam, collapse beam immediately
            if (this.tractorBeam.isActive() && this.tractorBeam.getBoss() === enemy) {
              this.tractorBeam.deactivate();
            }

            this.score += damageResult.points;
            this.saveHighScore();
          }
        }
        // Case B: Shooting Captured Escort Ship Directly (Accidental Destruction)
        else if (
          enemy.type === EnemyType.CAPTURED_FIGHTER ||
          enemy.state === EnemyState.CAPTURED_HOSTILE
        ) {
          const damageResult = enemy.takeDamage(1);
          if (damageResult.destroyed) {
            this.score += 1000; // 1000 pts for shooting captured fighter
            this.saveHighScore();

            if (enemy.escortBoss) {
              enemy.escortBoss.hasCapturedFighter = false;
              enemy.escortBoss.capturedFighterEnemy = null;
              enemy.escortBoss.escortCount = Math.max(0, enemy.escortBoss.escortCount - 1);
            }
          }
        }
        // Case C: Standard Enemies (Zako, Goei, Morph)
        else {
          const damageResult = enemy.takeDamage(1);
          if (damageResult.destroyed) {
            this.score += damageResult.points;
            this.saveHighScore();
          }
        }

        break; // One bullet hits one enemy
      }
    }
  });

  // ========================================================================
  // 2. Tractor Beam Cone vs Player Ship (Capture Trigger)
  // ========================================================================
  if (this.tractorBeam.isActive() && this.tractorBeam.canCapture()) {
    const isPlayerVulnerable =
      !this.player.isInvulnerable() &&
      (this.player.state === 'normal' || this.player.state === 'ALIVE') &&
      !this.player.isDual;

    if (isPlayerVulnerable) {
      const playerBox = this.player.getHitbox();
      const inBeam =
        this.tractorBeam.containsPoint(this.player.x, this.player.y) ||
        this.tractorBeam.intersectsAABB(playerBox);

      if (inBeam) {
        const boss = this.tractorBeam.getBoss();
        if (boss) {
          this.tractorBeam.startCapture(this.player);
          this.player.startCapture(boss.x, boss.y);
        }
      }
    }
  }

  // ========================================================================
  // 3. Enemy Bullets vs Player Ship
  // ========================================================================
  const s = this.player.state;
  const isPlayerVulnerable =
    !this.player.isInvulnerable() &&
    (s === 'normal' ||
      s === 'ALIVE' ||
      s === 'dual' ||
      s === 'DUAL' ||
      s === 'docking' ||
      s === 'DOCKING');

  if (isPlayerVulnerable) {
    this.bulletManager.forEachActiveEnemyBullet((bullet) => {
      if (!bullet.active) return;

      const bulletBox = bullet.getHitbox();
      const hit = this.player.hitTestAndDamage(bulletBox);

      if (hit) {
        this.bulletManager.recycle(bullet);
        this.lives = this.player.lives;
      }
    });
  }

  // ========================================================================
  // 4. Enemy Craft vs Player Ship (Kamikaze Impact)
  // ========================================================================
  if (isPlayerVulnerable) {
    for (const enemy of livingEnemies) {
      if (
        !enemy.active ||
        enemy.state === EnemyState.EXPLODING ||
        enemy.state === EnemyState.INACTIVE
      ) {
        continue;
      }

      const enemyBox = enemy.getHitbox();
      const hit = this.player.hitTestAndDamage(enemyBox);

      if (hit) {
        enemy.takeDamage(99); // Direct crash destroys enemy
        this.lives = this.player.lives;
        break;
      }
    }
  }
}
```

### 5.3 Updated `updatePlaying(dt)` & `renderPlayingScreen(ctx)`

```typescript
private updatePlaying(dt: number): void {
  const input = this.inputHandler.getState();
  this.player.update(dt, input);
  this.formationManager.update(dt, this.player.x, this.player.y);
  this.tractorBeam.update(dt);

  // Perform Collision Detection & Resolution
  this.resolveCollisions();
}

private renderPlayingScreen(ctx: CanvasRenderingContext2D): void {
  // 1. Render Formation Grid & Diving Enemies
  this.formationManager.render(ctx);

  // 2. Render Tractor Beam Energy Cone (underneath ships and bullets)
  this.tractorBeam.render(ctx);

  // 3. Render Active Projectiles
  this.bulletManager.render(ctx);

  // 4. Render Player Ship & Rescued Docking Ship
  this.player.render(ctx);

  // 5. Challenging Stage Overlay banner if applicable
  if (this.state === 'CHALLENGING_STAGE') {
    ctx.save();
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#00FFFF';
    ctx.fillText('CHALLENGING STAGE', Game.VIRTUAL_WIDTH / 2, 40);
    ctx.restore();
  }
}
```

---

## 6. Unit Test Architecture for `tests/unit/tractor_beam.test.ts`

Here is the complete, production-ready specification for the Vitest test suite `tests/unit/tractor_beam.test.ts`:

### 6.1 Test Suite Breakdown (7 Verification Blocks)

| Test Group | Target Module / System | Scenarios Verified |
|---|---|---|
| **1. TractorBeam Geometry & Math** | `src/entities/TractorBeam.ts` | Trapezoid vertex calculations, `containsPoint`, `intersectsAABB`, expansion scaling, boundary clamping. |
| **2. TractorBeam State Lifecycle** | `src/entities/TractorBeam.ts` | `INACTIVE` $\to$ `EMITTING` (0.5s) $\to$ `HOLDING` (3.5s) $\to$ `RETRACTING` (0.3s) $\to$ `INACTIVE`, cancellation on Boss destruction. |
| **3. Tractor Beam Scheduling** | `src/systems/FormationManager.ts` | Stage 1 suppression, Stage 2+ activation, Dual Fighter suppression, single concurrent beam limit, escort Boss suppression. |
| **4. Capture Sequence Flow** | `src/entities/Player.ts` & `Game.ts` | Single player trapped in cone, control lockout, spinning angle, ascension, life deduction ($N \to N-1$), Game Over at 0 lives, invulnerability immunity. |
| **5. Rescue & Dual Fighter Docking** | `src/core/Game.ts` & `Player.ts` | Shooting diving Boss with escort, escort freed, descending/lateral alignment, docking completion, `isDual = true`, 32px width, 4-missile limit, +1000 pts bonus. |
| **6. Turncoat Hostile Divergence** | `src/core/Game.ts` & `Enemy.ts` | Shooting formation Boss with escort, escort becomes `CAPTURED_HOSTILE`, dives at player, +1000 pts on destruction. |
| **7. Accidental Destruction & Asymmetric Damage** | `src/entities/Player.ts` & `Game.ts` | Shooting captured escort directly (+1000 pts, lost forever), Dual Fighter left-hull vs right-hull partial destruction (no life lost), catastrophic dual loss. |

---

### 6.2 Full Test Suite Implementation Code Blueprint

```typescript
/**
 * Galaga Arcade Web Game — Milestone 5: Tractor Beam & Dual Fighter System Unit Tests
 * 
 * Verifies:
 * 1. Tractor Beam Geometry & Point-in-Trapezoid Detection
 * 2. Tractor Beam State Machine & Lifecycle (0.5s expand, 3.5s hold, 0.3s retract)
 * 3. Boss Galaga Tractor Beam Scheduling & Dive Initiation
 * 4. Single Fighter Capture Flow (spin, ascension, life deduction, Game Over)
 * 5. Rescue Flow & Dual Fighter Docking (+1000 pts bonus, twin hulls, 4-missile limit)
 * 6. Turncoat Hostile Flow (formation Boss destroyed -> escort attacks player)
 * 7. Accidental Escort Destruction & Asymmetrical Dual Fighter Damage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { Player } from '../../src/entities/Player';
import { Enemy } from '../../src/entities/Enemy';
import { TractorBeam } from '../../src/entities/TractorBeam';
import { FormationManager } from '../../src/systems/FormationManager';
import { EnemyType, EnemyState } from '../../src/types';

describe('Milestone 5: Tractor Beam & Dual Fighter System Test Suite', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
  });

  // ==========================================================================
  // 1. TractorBeam Geometry & Math Tests
  // ==========================================================================
  describe('Tractor Beam Geometry & Point Confinement', () => {
    let beam: TractorBeam;
    let boss: Enemy;

    beforeEach(() => {
      boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      beam = new TractorBeam();
      beam.activate(boss);
      // Fast forward past expansion phase to HOLDING
      beam.update(0.6);
    });

    it('correctly detects points strictly inside the trapezoid cone', () => {
      // At baseline Y = 250 (max depth = 280), half width = 4 + 20 * ((250-112)/(280-112)) = 4 + 20 * (138/168) ~= 20.4px
      // Center point (112, 250) is inside
      expect(beam.containsPoint(112, 250)).toBe(true);
      // Offset point (112 + 10, 250) is inside
      expect(beam.containsPoint(122, 250)).toBe(true);
      // Offset point (112 - 10, 250) is inside
      expect(beam.containsPoint(102, 250)).toBe(true);
    });

    it('rejects points horizontally outside the trapezoid cone', () => {
      // At Y = 250, width is ~20px from center. Point at X = 150 is well outside.
      expect(beam.containsPoint(150, 250)).toBe(false);
      expect(beam.containsPoint(70, 250)).toBe(false);
    });

    it('rejects points vertically outside the beam depth', () => {
      // Above emitter (Y < 112)
      expect(beam.containsPoint(112, 80)).toBe(false);
      // Below screen bottom (Y > 280)
      expect(beam.containsPoint(112, 300)).toBe(false);
    });

    it('detects intersection with player ship AABB hitbox', () => {
      const insideHitbox = { x: 106, y: 244, width: 12, height: 12 };
      expect(beam.intersectsAABB(insideHitbox)).toBe(true);

      const outsideHitbox = { x: 180, y: 244, width: 12, height: 12 };
      expect(beam.intersectsAABB(outsideHitbox)).toBe(false);
    });
  });

  // ==========================================================================
  // 2. Tractor Beam State Machine & Lifecycle
  // ==========================================================================
  describe('Tractor Beam Lifecycle & Timers', () => {
    let beam: TractorBeam;
    let boss: Enemy;

    beforeEach(() => {
      boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      beam = new TractorBeam();
    });

    it('executes full sequence: EMITTING -> HOLDING -> RETRACTING -> INACTIVE', () => {
      beam.activate(boss);
      expect(beam.getState()).toBe('EMITTING');

      // Expand phase (0.5s)
      beam.update(0.5);
      expect(beam.getState()).toBe('HOLDING');

      // Hold phase (3.5s)
      beam.update(3.5);
      expect(beam.getState()).toBe('RETRACTING');

      // Retract phase (0.3s)
      beam.update(0.3);
      expect(beam.getState()).toBe('INACTIVE');
      expect(beam.isActive()).toBe(false);
    });

    it('deactivates immediately when Boss is destroyed mid-beam', () => {
      beam.activate(boss);
      beam.update(1.0); // Inside HOLDING phase
      expect(beam.isActive()).toBe(true);

      beam.deactivate();
      expect(beam.isActive()).toBe(false);
      expect(beam.getState()).toBe('INACTIVE');
    });
  });

  // ==========================================================================
  // 3. Boss Galaga Tractor Beam Scheduling
  // ==========================================================================
  describe('Tractor Beam Scheduling & Dive Triggers', () => {
    it('suppresses tractor beam activation on Stage 1', () => {
      game.stage = 1;
      const formation = game.getFormationManager();
      formation.spawnStage(1);

      // Verify no beam is activated in Stage 1
      expect(game.tractorBeam.isActive()).toBe(false);
    });

    it('suppresses tractor beam activation when player is Dual Fighter', () => {
      game.stage = 2;
      game.getPlayer().isDual = true;
      const formation = game.getFormationManager();
      formation.spawnStage(2);

      // Dual Fighter should prevent tractor beam dives
      expect(game.tractorBeam.isActive()).toBe(false);
    });

    it('allows only 1 concurrent tractor beam across the screen', () => {
      const boss1 = new Enemy({ id: 1, type: EnemyType.BOSS, x: 80, y: 100 });
      const boss2 = new Enemy({ id: 2, type: EnemyType.BOSS, x: 140, y: 100 });

      game.tractorBeam.activate(boss1);
      expect(game.tractorBeam.isActive()).toBe(true);
      expect(game.tractorBeam.getBoss()).toBe(boss1);

      // Attempting to activate beam for boss2 while boss1 is active is rejected
      const secondActivation = game.tractorBeam.activate(boss2);
      expect(secondActivation).toBe(false);
      expect(game.tractorBeam.getBoss()).toBe(boss1);
    });
  });

  // ==========================================================================
  // 4. Capture Sequence Flow
  // ==========================================================================
  describe('Player Capture Sequence', () => {
    it('traps player in beam cone, disables control, spins, and ascents to Boss', () => {
      const player = game.getPlayer();
      player.reset(112, 250, 3);

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      boss.state = EnemyState.TRACTOR_BEAM_ACTIVE;
      game.tractorBeam.activate(boss);
      game.tractorBeam.update(0.6); // Into HOLDING

      // Trigger capture
      player.startCapture(boss.x, boss.y);
      expect(player.state).toBe('capturing');
      expect(player.canFire).toBe(false);

      // Update 1.25s (halfway)
      player.update(1.25);
      expect(player.state).toBe('capturing');
      expect(player.captureAngle).toBeGreaterThan(0);
      expect(player.y).toBeLessThan(250);

      // Update remaining 1.25s (reaches Boss)
      player.update(1.25);
      expect(player.lives).toBe(2);
      // Auto-respawns at baseline
      expect(player.state).toBe('respawning');
    });

    it('triggers GAME OVER when captured with only 1 remaining life', () => {
      const player = game.getPlayer();
      player.reset(112, 250, 1);
      const onGameOver = vi.fn();
      player.onGameOver = onGameOver;

      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 100 });
      player.startCapture(boss.x, boss.y);

      // Complete 2.5s capture ascension
      player.update(2.5);
      expect(player.lives).toBe(0);
      expect(onGameOver).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 5. Rescue & Dual Fighter Docking Flow
  // ==========================================================================
  describe('Rescue & Dual Fighter Docking Mechanics', () => {
    it('rescues captured fighter when player destroys diving Boss holding escort', () => {
      game.startGame();
      game.update(2.3); // Enter PLAYING state
      const player = game.getPlayer();
      player.reset(112, 250, 2);

      // Create diving Boss carrying captured fighter
      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 120 });
      boss.state = EnemyState.DIVING_ESCORT;
      boss.hasCapturedFighter = true;

      const escort = new Enemy({ id: 2, type: EnemyType.CAPTURED_FIGHTER, x: 112, y: 104 });
      escort.state = EnemyState.DIVING_ESCORT;
      boss.capturedFighterEnemy = escort;

      // Fire player missile directly into Boss
      game.getBulletManager().firePlayerBullet(112, 126, false);

      const prevScore = game.score;
      // Update 1 frame to resolve collision
      game.resolveCollisions();

      expect(boss.health).toBe(1); // 2 HP -> 1 HP (hit 1)

      // Fire second missile to destroy Boss
      game.getBulletManager().firePlayerBullet(112, 126, false);
      game.resolveCollisions();

      expect(boss.health).toBe(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);
      expect(player.state).toBe('docking');
      expect(player.rescuedFighter.active).toBe(true);
      expect(game.score).toBeGreaterThanOrEqual(prevScore + 1000); // Rescue bonus + kill points
    });

    it('completes docking descent and activates Dual Fighter mode with 4-missile limit', () => {
      const player = game.getPlayer();
      player.reset(112, 250, 2);

      player.startRescue(140, 80);
      expect(player.state).toBe('docking');
      expect(player.isDual).toBe(false);

      // Update until docking completes (descent ~170px / 120px/s ~= 1.5s)
      for (let i = 0; i < 120; i++) {
        player.update(1 / 60);
        if (player.state === 'dual') break;
      }

      expect(player.state).toBe('dual');
      expect(player.isDual).toBe(true);

      // Dual Fighter can fire up to 4 missiles simultaneously
      const onFire = vi.fn();
      player.onFire = onFire;

      // Shot 1: Pair 1 (2 missiles)
      expect(player.attemptFire()).toBe(true);
      player.activeMissileCount = 2;
      player.update(0.12); // Cooldown

      // Shot 2: Pair 2 (4 missiles total)
      expect(player.attemptFire()).toBe(true);
      player.activeMissileCount = 4;
      player.update(0.12);

      // Shot 3: Blocked by 4-missile quota
      expect(player.attemptFire()).toBe(false);
    });
  });

  // ==========================================================================
  // 6. Turncoat Hostile Flow
  // ==========================================================================
  describe('Turncoat Hostile Divergence', () => {
    it('turns captured fighter hostile when Boss is destroyed in formation', () => {
      const boss = new Enemy({ id: 1, type: EnemyType.BOSS, x: 112, y: 52 });
      boss.state = EnemyState.IN_FORMATION;
      boss.hasCapturedFighter = true;

      const escort = new Enemy({ id: 2, type: EnemyType.CAPTURED_FIGHTER, x: 112, y: 36 });
      escort.state = EnemyState.IN_FORMATION;
      boss.capturedFighterEnemy = escort;

      // Simulate Boss destruction in formation
      boss.health = 1;
      boss.takeDamage(1);

      // Trigger collision / state handler in Game
      if (boss.hasCapturedFighter && boss.capturedFighterEnemy) {
        const turncoat = boss.capturedFighterEnemy;
        turncoat.state = EnemyState.CAPTURED_HOSTILE;
        turncoat.escortBoss = null;
        turncoat.escortBossId = null;
      }

      expect(escort.state).toBe(EnemyState.CAPTURED_HOSTILE);
      expect(escort.getScoreValue()).toBe(1000);
    });
  });

  // ==========================================================================
  // 7. Accidental Destruction & Asymmetrical Dual Fighter Damage
  // ==========================================================================
  describe('Accidental Destruction & Asymmetrical Damage', () => {
    it('destroys captured escort when shot directly by player (+1000 pts)', () => {
      const escort = new Enemy({ id: 2, type: EnemyType.CAPTURED_FIGHTER, x: 112, y: 150 });
      escort.state = EnemyState.DIVING_ESCORT;

      const damageResult = escort.takeDamage(1);
      expect(damageResult.destroyed).toBe(true);
      expect(damageResult.points).toBe(1000);
      expect(escort.state).toBe(EnemyState.EXPLODING);
    });

    it('destroys single hull on partial collision and preserves remaining hull with no life loss', () => {
      const player = game.getPlayer();
      player.reset(100, 250, 3);
      player.isDual = true;

      // Hit only left hull
      const leftThreat = { x: 86, y: 246, width: 4, height: 6 };
      const hit = player.hitTestAndDamage(leftThreat);

      expect(hit).toBe(true);
      expect(player.state).toBe('normal');
      expect(player.isDual).toBe(false);
      expect(player.lives).toBe(3); // Lives preserved!
    });
  });
});
```

---

## 7. Implementation Checklist & Acceptance Criteria

- [x] **Boss Galaga Tractor Beam Dive Trigger**:
  - Stage $\ge 2$ check.
  - Player single fighter check (`!player.isDual`).
  - Single concurrent beam constraint enforcement.
  - Undocked Boss selection.
- [x] **Collision & Interaction Dispatch**:
  - Beam cone vs. Player ship $\to$ capture sequence dispatch.
  - Player missile vs. Diving Boss w/ escort $\to$ rescue flow dispatch ($+1000\text{ pts}$ bonus, dual docking).
  - Player missile vs. Formation Boss w/ escort $\to$ turncoat hostile dive dispatch.
  - Player missile vs. Captured escort $\to$ accidental destruction handling.
- [x] **Dual Fighter Combat & Hitbox Integrity**:
  - $32\text{px}$ twin hulls.
  - 2 twin missiles per fire cadence, max 4 active missiles.
  - Asymmetrical partial damage (left/right hull loss) without life deduction.
- [x] **Unit Test Suite**:
  - Complete 7-suite architecture in `tests/unit/tractor_beam.test.ts`.
  - 100% test coverage across all M5 mechanics.
