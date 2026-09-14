# Milestone 12 Zero-GC & Lifecycle Remediation Strategy

**Author**: `m12_fix_explorer_1` (Roles: Explorer, Investigator, Synthesizer)  
**Date**: 2026-09-04T09:35:00Z  
**Status**: Completed Formulation (Ready for Review & Implementation Approval)  
**Target Modules**:
- `src/core/boss/bosses/NaniteColossus.ts`
- `src/core/boss/bosses/AeternumCore.ts`
- `src/core/boss/BaseBoss.ts`
- `src/core/boss/bosses/CyberDreadnought.ts`
- `src/core/boss/bosses/DimensionalLeviathan.ts`
- `src/core/boss/types.ts`
- `src/core/Game.ts`
- `src/systems/FormationManager.ts`
- `tests/unit/boss_stage40_psionic.test.ts`

---

## 1. Executive Summary

Milestone 12 introduced 5 multi-phase boss encounters with mathematical flight curves, bullet hell patterns, and 10 procedural bit-matrices in Canvas 2D. However, adversarial audits conducted by `m12_auditor_1` (Integrity Forensics) and `m12_reviewer_2` (Adversarial Review) identified critical engine defects:
1. **60 FPS Heap Allocations**: `NaniteColossus` allocates an array and 4 object literals every frame during split state, and `AeternumCore` allocates 4 point object literals every frame during Bézier ram swoops, violating the zero-GC invariant of the 60 FPS fixed-timestep accumulator loop.
2. **Sub-Unit Double-Update and Double-Render**: Active sub-units (`BossSubUnit`) are updated and rendered twice per frame (once by `BaseBoss` and once by `FormationManager`).
3. **Stage 30 Permanent Softlock**: Inactive mini-constructs in `NaniteColossus` were omitted from `FormationManager.enemies` because `getActiveSubUnits()` filtered them out at spawn time, rendering them invulnerable and collision-less when activated at 50% HP.
4. **Stage 10 Invisible Escort Drones**: In `CyberDreadnought`, escort drones were assigned unregistered sprite ID `'ZAKO_WING_0'` instead of `'ZAKO'`.
5. **Stage 20 Dual Fighter Multi-Frame Annihilation**: Shockwave collision lacking a per-wave damage flag destroyed both dual-fighter hulls across 33ms.
6. **Vacuous Unit Test Assertion**: `tests/unit/boss_stage40_psionic.test.ts` asserted player movement while `game.state` was `'TITLE'`, vacuously asserting `0 < 2.0`.

This document formulates the comprehensive, mathematically verified remediation strategy for all identified issues.

---

## 2. Zero-GC Heap Allocation Remediation

### 2.1 Issue in `src/core/boss/bosses/NaniteColossus.ts`

#### Observation
In `src/core/boss/bosses/NaniteColossus.ts`:
1. **Lines 123–130**: Inside `updatePhase1(dt, playerX, playerY)`, while `isSplit` is `true`:
   ```typescript
   } else {
     // Mini-Constructs moving along Lissajous paths
     const anchors = [
       { x: 50, y: 50, phi: 0 },
       { x: 174, y: 50, phi: Math.PI },
       { x: 75, y: 95, phi: Math.PI / 2 },
       { x: 149, y: 95, phi: (3 * Math.PI) / 2 },
     ];
   ```
   This instantiates a new 4-element JavaScript array and 4 new object literals `{ x, y, phi }` on every tick at 60 FPS (240 objects/sec + 60 arrays/sec), generating garbage collection churn.
2. **Line 115**: Inside `updatePhase1`, quad-burst spread salvos allocate a temporary angle array every 1.6 seconds:
   ```typescript
   const angles = [-0.35, -0.12, 0.12, 0.35];
   ```
3. **Lines 32–37**: Constructor also duplicates this exact same `anchors` array literal.

#### Remediation Design
1. Define class-level `static readonly` constant structures outside all loops:
   ```typescript
   private static readonly ANCHORS: ReadonlyArray<{ readonly x: number; readonly y: number; readonly phi: number }> = [
     { x: 50, y: 50, phi: 0 },
     { x: 174, y: 50, phi: Math.PI },
     { x: 75, y: 95, phi: Math.PI / 2 },
     { x: 149, y: 95, phi: (3 * Math.PI) / 2 },
   ];

   private static readonly SALVO_ANGLES: readonly number[] = [-0.35, -0.12, 0.12, 0.35];
   ```
2. In the constructor, initialize `miniConstructs` from `NaniteColossus.ANCHORS`:
   ```typescript
   for (let i = 0; i < 4; i++) {
     const construct = new BossSubUnit(
       this,
       9930 + i,
       `MINI_CONSTRUCT_${i}`,
       'BOSS_NANITE_MINI_CONSTRUCT',
       18,
       14,
       14
     );
     construct.x = NaniteColossus.ANCHORS[i]!.x;
     construct.y = NaniteColossus.ANCHORS[i]!.y;
     this.miniConstructs.push(construct);
     this.subUnits.push(construct);
   }
   ```
3. In `updatePhase1`:
   - Replace salvo angles loop with indexed loop over `NaniteColossus.SALVO_ANGLES`:
     ```typescript
     for (let i = 0; i < NaniteColossus.SALVO_ANGLES.length; i++) {
       const a = NaniteColossus.SALVO_ANGLES[i]!;
       const vx = 180 * Math.sin(a);
       const vy = 180 * Math.cos(a);
       this.game.bulletManager.fireEnemyBulletWithVector(this.x, this.y, vx, vy);
     }
     ```
   - Replace `anchors` local declaration with direct reference to `NaniteColossus.ANCHORS`:
     ```typescript
     const t = this.stateTimer;
     for (let i = 0; i < this.miniConstructs.length; i++) {
       const c = this.miniConstructs[i]!;
       if (!c.active) continue;
       const anc = NaniteColossus.ANCHORS[i]!;
       c.x = anc.x + 25 * Math.sin(1.4 * t + anc.phi);
       c.y = anc.y + 10 * Math.cos(2.8 * t);
     }
     ```
**GC Impact**: Exactly 0 heap allocations per tick in `NaniteColossus.updateBoss()`.

---

### 2.2 Issue in `src/core/boss/bosses/AeternumCore.ts`

#### Observation
In `src/core/boss/bosses/AeternumCore.ts`:
1. **Lines 236–242**: Inside `updatePhase3(dt, playerX, playerY)` during the 2.2s diving ram swoop:
   ```typescript
   const u = this.ramProgress;
   const u1 = 1 - u;
   const p0 = { x: 112, y: 52 };
   const p1 = { x: 20, y: 160 };
   const p2 = { x: 204, y: 250 };
   const p3 = { x: 112, y: 52 };

   this.x = u1 * u1 * u1 * p0.x + 3 * u1 * u1 * u * p1.x + 3 * u1 * u * u * p2.x + u * u * u * p3.x;
   this.y = u1 * u1 * u1 * p0.y + 3 * u1 * u1 * u * p1.y + 3 * u1 * u * u * p2.y + u * u * u * p3.y;
   ```
   This instantiates 4 point objects `{ x, y }` on every tick at 60 FPS for 2.2 seconds (528 objects per ram swoop pass), causing GC churn.
2. **Line 156**: Inside `updatePhase2`, shotgun spreads allocate an array every 1.2s:
   ```typescript
   const angles = [-0.4, -0.2, 0, 0.2, 0.4];
   ```

#### Remediation Design: Pure Scalar Bézier Calculation
1. The Cubic Bernstein Bézier curve equation is:
   $$B(u) = (1-u)^3 P_0 + 3(1-u)^2 u P_1 + 3(1-u) u^2 P_2 + u^3 P_3$$
   With fixed control points:
   - $P_0 = (112, 52)$
   - $P_1 = (20, 160)$
   - $P_2 = (204, 250)$
   - $P_3 = (112, 52)$
2. Store control coordinates as scalar `private static readonly` constants on `AeternumCore`:
   ```typescript
   private static readonly RAM_P0_X = 112;
   private static readonly RAM_P0_Y = 52;
   private static readonly RAM_P1_X = 20;
   private static readonly RAM_P1_Y = 160;
   private static readonly RAM_P2_X = 204;
   private static readonly RAM_P2_Y = 250;
   private static readonly RAM_P3_X = 112;
   private static readonly RAM_P3_Y = 52;

   private static readonly SHOTGUN_ANGLES: readonly number[] = [-0.4, -0.2, 0, 0.2, 0.4];
   ```
3. Evaluate the cubic polynomial directly using primitive scalar arithmetic:
   ```typescript
   this.ramProgress += dt / 2.2;
   const u = this.ramProgress;
   const u1 = 1 - u;
   const u1Sq = u1 * u1;
   const uSq = u * u;
   const c0 = u1Sq * u1;
   const c1 = 3 * u1Sq * u;
   const c2 = 3 * u1 * uSq;
   const c3 = uSq * u;

   this.x = c0 * AeternumCore.RAM_P0_X + c1 * AeternumCore.RAM_P1_X + c2 * AeternumCore.RAM_P2_X + c3 * AeternumCore.RAM_P3_X;
   this.y = c0 * AeternumCore.RAM_P0_Y + c1 * AeternumCore.RAM_P1_Y + c2 * AeternumCore.RAM_P2_Y + c3 * AeternumCore.RAM_P3_Y;
   ```
4. For shotgun fire in `updatePhase2`, iterate over `AeternumCore.SHOTGUN_ANGLES`:
   ```typescript
   for (let i = 0; i < AeternumCore.SHOTGUN_ANGLES.length; i++) {
     const a = AeternumCore.SHOTGUN_ANGLES[i]!;
     const vx = 170 * Math.sin(a);
     const vy = 170 * Math.cos(a);
     this.game.bulletManager.fireEnemyBulletWithVector(this.x, this.y, vx, vy);
   }
   ```
**GC Impact**: Exactly 0 heap allocations per tick in `AeternumCore.updateBoss()`.

---

## 3. Sub-Unit Lifecycle Single Source of Truth

### 3.1 Problem Analysis
In the current architecture:
1. `BaseBoss` inherits from `Enemy` and maintains a `subUnits: BossSubUnit[]` list.
2. In `Game.ts:384`, `onSpawnBoss` returns `[boss, ...boss.getActiveSubUnits()]`. These are pushed into `FormationManager.enemies`.
3. In `FormationManager.update()`:
   ```typescript
   for (const enemy of this.enemies) {
     ...
     enemy.update(dt, playerX, playerY);
   }
   ```
   When `enemy` is `boss`:
   `boss.update(dt)` executes `BaseBoss.update(dt)`:
   - Lines 314–315: `this.updateBoss(dt, playerX, playerY)` (updates boss state and sets sub-unit coordinates).
   - Lines 318–322:
     ```typescript
     for (const sub of this.subUnits) {
       if (sub.active) {
         sub.update(dt, playerX, playerY); // 1st update
       }
     }
     ```
   Then the loop in `FormationManager.update()` advances to `subUnit1` (since it is in `this.enemies`):
   - Line 848: `enemy.update(dt, playerX, playerY)` // **2nd update!**
   Therefore, every active sub-unit's `update()` method is invoked **twice per tick (120 Hz)**.
4. Similarly, in `Game.renderPlayingScreen()`:
   `formationManager.render(ctx)` iterates over `this.enemies`.
   - When rendering `boss`: `BaseBoss.render(ctx)` lines 335–339 loops through `this.subUnits` and calls `sub.render(ctx)`.
   - When rendering the subsequent sub-unit in `this.enemies`: `enemy.render(ctx)` is called again.
   Therefore, every active sub-unit is rendered **twice per frame**.

### 3.2 Single Source of Truth Formulation

To resolve this architectural defect cleanly:
**`FormationManager` must be the sole authoritative lifecycle manager for all entities present on the battlefield.**

#### Principles of the Unified Architecture
1. **Registry**: `FormationManager.enemies` is the authoritative list of all enemy entities. On boss stages, `onSpawnBoss` returns `[boss, ...boss.subUnits]` (registering both the boss and all its sub-units, whether initially active or inactive).
2. **Update**:
   - `BaseBoss.update()` updates boss timers and invokes `this.updateBoss(dt, playerX, playerY)`.
   - In `updateBoss(dt)`, the concrete boss AI updates boss kinematics and calculates the positions `(x, y)` of its sub-units.
   - `BaseBoss.update()` **does NOT** call `sub.update()`.
   - `FormationManager.update()` iterates over `this.enemies`. Inactive units (`!enemy.active`) are skipped. Active units (`sub.active === true`) have `sub.update(dt)` called **exactly once per frame**.
3. **Render**:
   - `BaseBoss.render()` renders the boss body and invulnerability/flash shaders.
   - `BaseBoss.render()` **does NOT** call `sub.render()`.
   - `FormationManager.render()` iterates over `this.enemies`. Inactive units are skipped. Active units have `sub.render(ctx)` called **exactly once per frame**.
4. **Collision**:
   - `Game.resolveCollisions()` queries `formationManager.getLivingEnemies()`.
   - Active sub-units are returned in `getLivingEnemies()` and checked against player missiles and player ship hitbox.
5. **Firing Isolation**:
   - In `BossSubUnit` constructor (`BaseBoss.ts`), set `this.canShoot = false;`.
   - This explicitly prevents `FormationManager` lines 865–874 (`attemptFire`) from mistakenly treating boss sub-units like generic diving Galaga aliens. Sub-unit firing remains 100% governed by the concrete boss's attack pattern.
6. **Tractor Beam Guard in `FormationManager`**:
   - In `FormationManager.ts` line 851, the classic Boss Galaga tractor beam trigger:
     ```typescript
     if (
       enemy.type === EnemyType.BOSS &&
       !(enemy instanceof BaseBoss) &&
       enemy.state === EnemyState.DIVING_SOLO &&
       enemy.flightPath === null &&
       enemy.y >= 95 &&
       enemy.y <= 105
     ) {
     ```
     Guarding with `!(enemy instanceof BaseBoss)` ensures that epic bosses (such as AeternumCore during its ram swoop through $y \in [95, 105]$) never trigger classic tractor beam events.

---

## 4. Integration Defect Remediations

### 4.1 Stage 30 Mini-Construct Collision Softlock

#### Root Cause
In `Game.ts:384`:
```typescript
onSpawnBoss: (stage) => {
  const boss = this.bossManager.spawnBoss(stage);
  if (boss) {
    return [boss, ...boss.getActiveSubUnits()];
  }
  return [];
}
```
In `NaniteColossus.ts`, the 4 mini-constructs are created with `construct.active = false`. `boss.getActiveSubUnits()` returns `[]` at spawn time. Thus, `formationManager.enemies` receives only `[NaniteColossus]`.
When the boss splits at 50% HP, `construct.active = true` is set, but the constructs are never in `formationManager.enemies`. Player bullets pass through them without collision, while the boss absorbs all damage (`isSplit === true`), creating an infinite softlock.

#### Remediation
In `src/core/Game.ts:384`, change:
```typescript
// Before:
return [boss, ...boss.getActiveSubUnits()];

// After:
return [boss, ...boss.subUnits];
```
When inactive, `FormationManager`'s loops (`update`, `render`, `getLivingEnemies`, `getLivingCount`) automatically skip them via `if (!enemy.active) continue;`. When `isSplit` activates them, they are already present in `formationManager.enemies` and immediately participate in collision detection.

---

### 4.2 Stage 10 Invisible Escort Drones

#### Root Cause
In `src/core/boss/bosses/CyberDreadnought.ts:36-37`:
```typescript
this.escortLeft = new BossSubUnit(this, 9903, 'ESCORT_LEFT', 'ZAKO_WING_0', 5, 12, 12);
this.escortRight = new BossSubUnit(this, 9904, 'ESCORT_RIGHT', 'ZAKO_WING_0', 5, 12, 12);
```
`'ZAKO_WING_0'` is not defined in `SpriteRenderer.ts` (the valid IDs are `'ZAKO'` and `'ELITE_ZAKO'`). `SpriteRenderer.draw()` silently early-returns, making escort drones completely invisible.

#### Remediation
In `CyberDreadnought.ts:36-37`, update the sprite ID to `'ZAKO'`:
```typescript
this.escortLeft = new BossSubUnit(this, 9903, 'ESCORT_LEFT', 'ZAKO', 5, 12, 12);
this.escortRight = new BossSubUnit(this, 9904, 'ESCORT_RIGHT', 'ZAKO', 5, 12, 12);
```

---

### 4.3 Stage 20 Radial Shockwave Dual Fighter Annihilation

#### Root Cause
In `src/core/boss/bosses/DimensionalLeviathan.ts:146`, the radial shockwave checks player intersection:
```typescript
if (Math.abs(distToPlayer - wave.radius) <= wave.thickness) { ... }
```
With `thickness = 6` and `speed = 110`, the shockwave intersects the player across 2–3 frames. When a Dual Fighter is hit, on frame 1 it drops to a single fighter. On frame 2 (16ms later), the same shockwave is still intersecting the player, immediately killing the single fighter.

#### Remediation
1. In `src/core/boss/types.ts`, add `hasDamagedPlayer?: boolean;` to `RadialShockwave`.
2. In `DimensionalLeviathan.ts`:
   - When firing a new wave: `wave.hasDamagedPlayer = false;`
   - During collision check:
     ```typescript
     if (!wave.hasDamagedPlayer && Math.abs(distToPlayer - wave.radius) <= wave.thickness) {
       ...
       if (diff > wave.safeWidthRad / 2) {
         wave.hasDamagedPlayer = true;
         this.game.player.hitTestAndDamage({
           x: pX - 6,
           y: pY - 6,
           width: 12,
           height: 12,
         });
       }
     }
     ```
This guarantees each shockwave damages the player at most once.

---

### 4.4 Vacuous Test Assertion in `tests/unit/boss_stage40_psionic.test.ts`

#### Root Cause
In `tests/unit/boss_stage40_psionic.test.ts:93`:
```typescript
game.update(1 / 60);
```
`game.state` defaults to `'TITLE'`. In `'TITLE'` state, `game.update()` calls `updateTitleScreen()` rather than `updatePlaying()`. `game.player.x` was never updated (`moved === 0`). The assertion `expect(0).toBeLessThan(2.0)` passed vacuously.

#### Remediation
Set `game.setState('PLAYING')` before testing movement:
```typescript
game.setState('PLAYING');
const prevX = game.player.x;
(game.inputHandler.getState() as { moveRight: boolean }).moveRight = true;
game.update(1 / 60);
const moved = game.player.x - prevX;
// Baseline speed is 260 px/s => per frame ~4.33px. Cut by 75% => ~1.08px.
expect(moved).toBeGreaterThan(0.5);
expect(moved).toBeCloseTo(1.0833, 2);
```

---

## 5. Code Modification Matrix

| File Path | Lines to Modify | Change Description | Rationale |
|---|---|---|---|
| `src/core/boss/bosses/NaniteColossus.ts` | 32–37, 115, 124–130 | Pre-allocate `ANCHORS` and `SALVO_ANGLES` static arrays; reference static constants in constructor and `updatePhase1`. | Eliminates 60 FPS array & object literal allocations in update loop. |
| `src/core/boss/bosses/AeternumCore.ts` | 156, 236–242 | Pre-allocate `SHOTGUN_ANGLES` static array; refactor Bézier ram swoop points to static scalar constants `RAM_P0_X`, etc. | Eliminates 4 object allocations per tick during ram swoop and per-salvo angle array allocations. |
| `src/core/boss/BaseBoss.ts` | 42, 318–322, 335–339 | Set `this.canShoot = false;` in `BossSubUnit`; remove sub-unit update and render loops from `BaseBoss`. | Resolves double-update and double-render of all sub-units; establishes `FormationManager` as single source of truth. |
| `src/core/Game.ts` | 384 | Change `[boss, ...boss.getActiveSubUnits()]` to `[boss, ...boss.subUnits]`. | Fixes Stage 30 softlock by registering all sub-units into `formationManager.enemies` upfront. |
| `src/core/boss/bosses/CyberDreadnought.ts` | 36–37 | Change `'ZAKO_WING_0'` to `'ZAKO'`. | Resolves invisible escort drones on Stage 10. |
| `src/core/boss/types.ts` | 74–85 | Add `hasDamagedPlayer?: boolean;` to `RadialShockwave`. | Supports single-hit per shockwave cycle. |
| `src/core/boss/bosses/DimensionalLeviathan.ts` | 126–134, 146–162 | Reset `hasDamagedPlayer = false` on spawn; guard damage with `!wave.hasDamagedPlayer`. | Prevents instantaneous multi-frame destruction of Dual Fighters. |
| `src/systems/FormationManager.ts` | 851–863 | Add `!(enemy instanceof BaseBoss)` guard to tractor beam trigger. | Prevents epic bosses from triggering tractor beam during vertical movement. |
| `tests/unit/boss_stage40_psionic.test.ts` | 89–97 | Call `game.setState('PLAYING')` before `game.update(1 / 60)` and assert `moved > 0.5`. | Eliminates vacuous test assertion; verifies real thruster stun disruption. |

---

## 6. Verification Strategy

1. **Static Analysis & Build Verification**:
   ```bash
   npm run build
   ```
   Must compile cleanly with zero TypeScript errors.
2. **Full Unit Test Execution**:
   ```bash
   npm test
   ```
   All 45 test files and 848+ tests must pass with 0 failures.
3. **Stage 30 Mini-Construct Collision Verification**:
   Execute programmatic simulation testing that missiles hit mini-constructs when split:
   ```bash
   npx tsx -e '
   import { Game } from "./src/core/Game";
   const game = new Game();
   game.scoreManager.reset(3, 30);
   game.setState("STAGE_INTRO");
   game.stateTimer = 2.5;
   game.update(1 / 60);
   const boss = game.bossManager.activeBoss;
   boss.update(2.5, 112, 250);
   boss.takeDamage(75);
   const c0 = boss.miniConstructs[0];
   game.bulletManager.firePlayerBullet(c0.x, c0.y, false, 480);
   game.resolveCollisions();
   if (c0.health === 18) throw new Error("Mini-construct was not damaged!");
   console.log("Stage 30 split collision verified successfully!");
   '
   ```
4. **Single-Invocation Sub-Unit Update Verification**:
   Verify via spy or step counter that `sub.update()` runs exactly once per tick of `game.update(1 / 60)`.
5. **Zero-GC Invariance Verification**:
   Verify that `NaniteColossus.updateBoss` and `AeternumCore.updateBoss` do not allocate object literals or arrays during 600 consecutive ticks.
