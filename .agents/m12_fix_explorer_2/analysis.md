# Milestone 12 Remediation Analysis: Boss Mechanics & Procedural Sprites

**Author**: `m12_fix_explorer_2` (Roles: Explorer, Investigation, Synthesis)  
**Target Milestone**: Milestone 12 (5 Epic Multi-Phase Boss Encounters)  
**Date**: 2026-09-04T09:35:00Z  
**Status**: Completed Analysis & Remediation Blueprint  

---

## 1. Executive Summary

Milestone 12 introduced 5 multi-phase epic boss encounters with rich mathematical trajectories (Plummer gravitational softening, Lissajous frequency knots, cubic Bernstein Bézier swoops, rotating spiral bullet hell rings). However, forensic audit and adversarial review identified two critical gameplay defects:
1. **Stage 30 Permanent Softlock**: In `src/core/Game.ts:384`, `onSpawnBoss` only returned active sub-units (`boss.getActiveSubUnits()`). `NaniteColossus` mini-constructs start inactive (`active = false`) and only activate when the Colossus splits at 50% HP. Because they were omitted from `formationManager.enemies`, player bullets could not hit them, while the split Colossus absorbed all damage via shield, deadlocking the game.
2. **Stage 10 Escort Drones Invisibility**: `CyberDreadnought.ts:36–37` assigned sprite ID `'ZAKO_WING_0'` to its escort drones. Because `'ZAKO_WING_0'` was never registered in `SpriteRenderer.ts`, `SpriteRenderer.draw()` silently early-returned, rendering escort drones completely invisible.

This document details the exact root causes, empirical reproduction traces, architectural remediation blueprints, code diff specifications, and automated verification tests to permanently resolve both defects.

---

## 2. Issue 1: Stage 30 Mini-Constructs Softlock

### 2.1 Empirical Reproduction Trace
Direct execution of Stage 30 combat via headless node script demonstrated the failure mode:
```
Enemies in formation for Stage 30: 1
Enemy types in formation: [ 'NaniteColossus' ]
Boss isSplit: true
Mini construct 0 active: true
Mini construct 0 in formation enemies? false
Player bullets before collision: 1
Player bullets after collision: 1
Mini construct 0 HP after bullet: 18
```
Player bullets passed through the active mini-construct without colliding, bullet count remained 1, and mini-construct HP remained 18. When bullets hit the main Colossus, `colossus.takeDamage()` checked `isProtectedBySubUnits()`, which evaluated to `this.isSplit` (`true`), returning `shieldAbsorbed: true`. The stage became impossible to clear.

### 2.2 Root Cause Call Chain Analysis
1. **Stage Spawn (`FormationManager.ts:236–247`)**:
   ```typescript
   if (DifficultyCalculator.isBossStage(stage)) {
     this.enemies.length = 0;
     this.slotToEnemyMap.clear();
     this.isEntryWaveActive = false;
     if (this.onSpawnBoss) {
       const bossEntities = this.onSpawnBoss(stage);
       for (const e of bossEntities) {
         this.enemies.push(e);
       }
     }
     return;
   }
   ```
2. **Boss Factory Hook (`Game.ts:381–387`)**:
   ```typescript
   onSpawnBoss: (stage) => {
     const boss = this.bossManager.spawnBoss(stage);
     if (boss) {
       return [boss, ...boss.getActiveSubUnits()];
     }
     return [];
   },
   ```
3. **Sub-Unit Initialization (`NaniteColossus.ts:40–54` & `BaseBoss.ts:43`)**:
   `NaniteColossus` constructs 4 `miniConstructs` and pushes them to `this.subUnits`. In `BossSubUnit`:
   `this.active = false;`
   Because `boss.getActiveSubUnits()` evaluates `this.subUnits.filter(s => s.active)`, it returns `[]` at spawn time.
   Therefore, `this.formationManager.enemies` contains **ONLY** `[NaniteColossus]`.
4. **Phase 1 Split Trigger (`NaniteColossus.ts:68–71`)**:
   When damaged to <= 75 HP:
   ```typescript
   this.isSplit = true;
   for (const construct of this.miniConstructs) {
     construct.active = true;
     construct.health = construct.maxHealth;
   }
   ```
   `construct.active` becomes `true`, but the constructs are never registered into `this.formationManager.enemies`.
5. **Collision Detection Loop (`Game.ts:830–846`)**:
   ```typescript
   const livingEnemies = this.formationManager.getLivingEnemies();
   this.bulletManager.forEachActivePlayerBullet((bullet) => {
     ...
     for (const enemy of livingEnemies) {
       ...
       if (checkAABB(bulletBox, enemyBox)) {
         // Collision resolution
       }
     }
   });
   ```
   `getLivingEnemies()` filters `this.enemies`. Because `miniConstructs` were never in `this.enemies`, they are never tested for collision against player bullets.
6. **Immunity Shield (`NaniteColossus.ts:56–59`)**:
   ```typescript
   public override isProtectedBySubUnits(): boolean {
     return this.isSplit;
   }
   ```
   Incoming bullets hitting Colossus deal 0 damage. The battle cannot progress.

### 2.3 Proposed Remediation Strategy

#### Part A: Upfront Registration in `Game.ts`
In `src/core/Game.ts:384`, modify `onSpawnBoss` to return all sub-units:
```typescript
<<<< BEFORE
      onSpawnBoss: (stage) => {
        const boss = this.bossManager.spawnBoss(stage);
        if (boss) {
          return [boss, ...boss.getActiveSubUnits()];
        }
        return [];
      },
==== AFTER
      onSpawnBoss: (stage) => {
        const boss = this.bossManager.spawnBoss(stage);
        if (boss) {
          return [boss, ...boss.subUnits];
        }
        return [];
      },
>>>>
```
**Why this is safe and effective**:
`FormationManager` already implements dormant entity filtering:
- `FormationManager.update()`: Line 835: `if (!enemy.active) continue;` skips inactive units.
- `FormationManager.render()`: Line 905: `if (enemy.active) enemy.render(ctx);` skips inactive units.
- `FormationManager.getLivingEnemies()`: Line 920: `this.enemies.filter((e) => e.active && e.state !== EnemyState.EXPLODING);` skips inactive units.
- `FormationManager.getLivingCount()`: Line 916: skips inactive units.
- `livingCount === 0` stage clear check: Line 878: only considers active living enemies.

When `miniConstructs` are inactive (`active = false`), they are completely dormant. The moment `colossus.isSplit = true` sets `construct.active = true`, they instantly appear in `getLivingEnemies()`, render on screen, and register swept AABB bullet hits.

#### Part B: Defense-in-Depth Dynamic Registration Hook
To protect against any future dynamic boss spawns or late sub-unit creation:
1. In `src/systems/FormationManager.ts`, expose an `addEnemy` helper:
   ```typescript
   public addEnemy(enemy: Enemy): void {
     if (!this.enemies.includes(enemy)) {
       this.enemies.push(enemy);
     }
   }
   ```
2. In `src/core/Game.ts` inside `updatePlaying(dt)`:
   ```typescript
   // Ensure dynamic boss sub-units are registered in formationManager
   if (this.bossManager?.activeBoss) {
     for (const sub of this.bossManager.activeBoss.subUnits) {
       if (sub.active && !this.formationManager.enemies.includes(sub)) {
         this.formationManager.addEnemy(sub);
       }
     }
   }
   ```

#### Part C: Elimination of Sub-Unit Double-Update & Double-Render
When sub-units are in `formationManager.enemies`, `FormationManager.update()` iterates over `this.enemies` and invokes `enemy.update(dt, playerX, playerY)`. `FormationManager.render()` iterates over `this.enemies` and invokes `enemy.render(ctx)`.
Simultaneously, `BaseBoss.update()` (lines 318–322) and `BaseBoss.render()` (lines 335–339) iterated over `this.subUnits`, causing:
- Sub-unit timers (`animTimer`, `damageFlashTimer`, `deathTimer`) to advance at 2x intended speed.
- Redundant duplicate Canvas draw calls for every active sub-unit.

**Remediation in `src/core/boss/BaseBoss.ts`**:
Guard sub-unit update and render in `BaseBoss`:
```typescript
<<<< BEFORE (BaseBoss.ts:318-322)
    // 5. Update Sub-units
    for (const sub of this.subUnits) {
      if (sub.active) {
        sub.update(dt, playerX, playerY);
      }
    }
==== AFTER
    // 5. Update Sub-units (if not already managed by FormationManager)
    for (const sub of this.subUnits) {
      if (sub.active && !this.game.formationManager?.enemies.includes(sub)) {
        sub.update(dt, playerX, playerY);
      }
    }
>>>>
```
```typescript
<<<< BEFORE (BaseBoss.ts:335-339)
    // Render active sub-units first
    for (const sub of this.subUnits) {
      if (sub.active) {
        sub.render(ctx);
      }
    }
==== AFTER
    // Render active sub-units (if not already managed by FormationManager)
    for (const sub of this.subUnits) {
      if (sub.active && !this.game.formationManager?.enemies.includes(sub)) {
        sub.render(ctx);
      }
    }
>>>>
```
**Benefits**:
- Zero duplicate updates or draw calls during full game execution.
- 100% backward-compatible with isolated unit tests where `FormationManager` is not managing the boss.

---

## 3. Issue 2: Stage 10 Escort Drones Invisibility

### 3.1 Empirical Reproduction Trace
Direct test of `CyberDreadnought.escortLeft.render(ctx)`:
```
Draw calls for escortLeft: 0
```
With `fakeCtx.drawImage` tracking, 0 draw calls were issued. The escort drone existed logically in memory, moved in figure-8 Lissajous trajectories, and fired needle bullets, but was completely invisible on screen.

### 3.2 Root Cause Analysis
1. In `src/core/boss/bosses/CyberDreadnought.ts:36–37`:
   ```typescript
   this.escortLeft = new BossSubUnit(this, 9903, 'ESCORT_LEFT', 'ZAKO_WING_0', 5, 12, 12);
   this.escortRight = new BossSubUnit(this, 9904, 'ESCORT_RIGHT', 'ZAKO_WING_0', 5, 12, 12);
   ```
2. In `src/core/boss/BaseBoss.ts:89–96` (`BossSubUnit.render`):
   ```typescript
   public override render(ctx: CanvasRenderingContext2D): void {
     if (!this.active) return;
     if (this.spriteId) {
       SpriteRenderer.draw(ctx, this.spriteId, this.x, this.y, {
         rotation: this.rotation,
       });
     }
   }
   ```
3. In `src/renderer/SpriteRenderer.ts:1133–1140`:
   ```typescript
   const def = SpriteRenderer.definitions.get(spriteId);
   if (def) {
     const frame = def.frames[frameIndex] ?? def.frames[0] ?? [];
     cached = SpriteRenderer.bakeFrame(def.width, def.height, frame);
     SpriteRenderer.cache.set(cacheKey, cached);
   } else {
     return;
   }
   ```
   `SpriteRenderer.definitions.get('ZAKO_WING_0')` returned `undefined`. `SpriteRenderer.draw()` early-returned without drawing anything to canvas.

### 3.3 Proposed Remediation Strategy

#### Part A: Register `'ZAKO_WING_0'` in `SpriteRenderer.ts`
In `src/renderer/SpriteRenderer.ts`, inside `registerStandardDefinitions()`:
```typescript
    // Escort Drone / Wing-spread Zako matrix definition (16x16)
    SpriteRenderer.registerDefinition({
      id: 'ZAKO_WING_0',
      width: 16,
      height: 16,
      frames: [ZAKO_FRAME_0_MATRIX, ZAKO_FRAME_1_MATRIX],
    });
```
`ZAKO_FRAME_0_MATRIX` features the iconic cyan wingtips (`C`) spread wide, providing the exact visual look intended for Cyber Dreadnought's escort wingmen. Registering two frames (`[ZAKO_FRAME_0_MATRIX, ZAKO_FRAME_1_MATRIX]`) allows fluttering animation if `frame` is provided, and defaults to frame 0 for static rendering.

#### Part B: Fallback Alias Guard in `SpriteRenderer.draw()`
In `src/renderer/SpriteRenderer.ts:1133`, add an alias fallback:
```typescript
<<<< BEFORE
    if (!cached) {
      const def = SpriteRenderer.definitions.get(spriteId);
      if (def) {
==== AFTER
    if (!cached) {
      let def = SpriteRenderer.definitions.get(spriteId);
      if (!def && spriteId === 'ZAKO_WING_0') {
        def = SpriteRenderer.definitions.get('ZAKO');
      }
      if (def) {
>>>>
```
This guarantees that even if definitions are cleared or re-initialized dynamically, `'ZAKO_WING_0'` will always resolve.

#### Part C: Hitbox and Sprite Alignment Verification
- In `CyberDreadnought.ts:36–37`:
  `customHitboxSize = { width: 12, height: 12 }`
- The sprite is 16x16 with anchor `(0.5, 0.5)`.
- The hitbox is 12x12 centered at `(x, y)`.
- This maintains the canonical Galaga hit-box margin (12x12 hitbox inside 16x16 visual sprite bounds), giving players clean, responsive hit feedback.

---

## 4. Performance & Zero-Allocation Invariant (Auditor Check 5)

Forensic Auditor 1 identified heap allocations occurring inside 60 FPS update loops. While not fatal to test execution, these violate the engine's Zero-Allocation Invariant:

### 4.1 In `src/core/boss/bosses/NaniteColossus.ts`
1. **Lissajous Anchors Array (line 124–129)**:
   Instantiating `const anchors = [{x: 50, y: 50, phi: 0}, ...]` every frame while `isSplit` is true allocates 1 array and 4 object literals 60 times per second.
   **Fix**: Move to class-level static readonly constant:
   ```typescript
   private static readonly LISSAJOUS_ANCHORS = [
     { x: 50, y: 50, phi: 0 },
     { x: 174, y: 50, phi: Math.PI },
     { x: 75, y: 95, phi: Math.PI / 2 },
     { x: 149, y: 95, phi: (3 * Math.PI) / 2 },
   ] as const;
   ```
2. **Salvo Angles Array (line 115)**:
   `const angles = [-0.35, -0.12, 0.12, 0.35];` allocated on each salvo.
   **Fix**: Move to class-level static readonly constant:
   ```typescript
   private static readonly SALVO_ANGLES = [-0.35, -0.12, 0.12, 0.35] as const;
   ```

### 4.2 In `src/core/boss/bosses/AeternumCore.ts`
1. **Bézier Ram Swoop Point Objects (lines 238–241)**:
   Allocating `p0, p1, p2, p3` point objects every frame during ramming.
   **Fix**: Inline the Bernstein cubic polynomial directly using scalar coordinates:
   ```typescript
   // Cubic Bézier calculation with fixed control points:
   // P0(112, 52), P1(20, 160), P2(204, 250), P3(112, 52)
   const u = this.ramProgress;
   const u1 = 1 - u;
   const b0 = u1 * u1 * u1;
   const b1 = 3 * u1 * u1 * u;
   const b2 = 3 * u1 * u * u;
   const b3 = u * u * u;
   this.x = b0 * 112 + b1 * 20 + b2 * 204 + b3 * 112;
   this.y = b0 * 52 + b1 * 160 + b2 * 250 + b3 * 52;
   ```
   This achieves mathematically identical cubic Bézier curves with **zero object allocations**.
2. **Shotgun Angles Array (line 156)**:
   `const angles = [-0.4, -0.2, 0, 0.2, 0.4];`
   **Fix**: Pre-allocate as static readonly array:
   ```typescript
   private static readonly SHOTGUN_ANGLES = [-0.4, -0.2, 0, 0.2, 0.4] as const;
   ```

---

## 5. Verification Matrix & Concrete Automated Test Plan

### Test 1: Stage 30 Mini-Constructs Hit Registration & Stage Clear Progression
```typescript
it('registers Stage 30 mini-constructs in formation and allows destroying them to advance stage', () => {
  const game = new Game();
  game.scoreManager.reset(3, 30);
  game.setState('STAGE_INTRO');
  game.stateTimer = 2.5;
  game.update(1 / 60);

  expect(game.formationManager.enemies.length).toBe(5); // 1 Boss + 4 SubUnits
  const boss = game.bossManager.activeBoss as NaniteColossus;
  boss.update(2.5, 112, 250);

  // Damage boss to 50% HP to trigger split
  boss.takeDamage(75);
  expect(boss.isSplit).toBe(true);
  expect(boss.miniConstructs[0].active).toBe(true);

  // Fire bullet at mini-construct 0
  const c0 = boss.miniConstructs[0];
  game.bulletManager.firePlayerBullet(c0.x, c0.y, false, 480);
  expect(game.bulletManager.getPlayerBulletCount()).toBe(1);

  game.resolveCollisions();
  expect(game.bulletManager.getPlayerBulletCount()).toBe(0); // Bullet consumed
  expect(c0.health).toBe(17); // 18 -> 17 damaged!

  // Destroy all constructs
  for (const c of boss.miniConstructs) {
    c.takeDamage(18);
  }
  expect(boss.isSplit).toBe(false);
  expect(boss.phase).toBe('TRANSITION_1_2');

  // Transition to Phase 2
  boss.invulnerableTimer = 0;
  boss.update(2.1, 112, 250);
  expect(boss.phase).toBe('PHASE_2');

  // Defeat boss
  boss.takeDamage(75);
  expect(boss.phase).toBe('DEFEATED');
  boss.defeatTimer = 0;
  boss.update(0.1, 112, 250);

  game.formationManager.update(1 / 60, 112, 250);
  expect(game.state).toBe('STAGE_CLEAR');
});
```

### Test 2: Stage 10 Escort Drones Sprite Registration & Render Draw Calls
```typescript
it('renders Stage 10 escort drones with valid baked sprite frames without no-op early returns', () => {
  const game = new Game();
  const dreadnought = new CyberDreadnought(game);
  
  expect(SpriteRenderer.definitions.has('ZAKO_WING_0')).toBe(true);

  const calls: unknown[] = [];
  const ctx = {
    drawImage: (...args: unknown[]) => calls.push(args),
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
  } as unknown as CanvasRenderingContext2D;

  dreadnought.escortLeft.render(ctx);
  dreadnought.escortRight.render(ctx);

  expect(calls.length).toBe(2); // Exactly 1 draw call per escort drone
});
```

### Test 3: Sub-Unit Single-Update and Single-Render Invariant
```typescript
it('ensures sub-units are updated and rendered exactly once per game loop tick', () => {
  const game = new Game();
  game.scoreManager.reset(3, 10);
  game.setState('STAGE_INTRO');
  game.stateTimer = 2.5;
  game.update(1 / 60);

  const dreadnought = game.bossManager.activeBoss as CyberDreadnought;
  const escort = dreadnought.escortLeft;
  escort.damageFlashTimer = 0.08;

  // Single game update tick
  game.update(1 / 60);

  // If updated once: 0.08 - 0.01667 ~= 0.0633s
  // If updated twice (bug): 0.08 - 2 * 0.01667 ~= 0.0467s
  expect(escort.damageFlashTimer).toBeCloseTo(0.08 - 1 / 60, 3);
});
```

---

## 6. Implementation Readiness & Summary

| File | Target Lines | Planned Change | Impact |
|---|---|---|---|
| `src/core/Game.ts` | 384 | Return `[boss, ...boss.subUnits]` in `onSpawnBoss` | Fixes Stage 30 softlock permanently |
| `src/systems/FormationManager.ts` | 240+ | Add `addEnemy(enemy: Enemy)` helper | Defense-in-depth dynamic registration |
| `src/core/boss/BaseBoss.ts` | 318–322, 335–339 | Guard subUnit update/render against formation membership | Eliminates sub-unit 2x double update and double render |
| `src/renderer/SpriteRenderer.ts` | 860+ | Register `'ZAKO_WING_0'` with `[ZAKO_FRAME_0_MATRIX, ZAKO_FRAME_1_MATRIX]` | Fixes Stage 10 escort drones invisibility |
| `src/renderer/SpriteRenderer.ts` | 1133 | Add `'ZAKO_WING_0'` alias fallback in `draw()` | Defensive fallback for sprite lookup |
| `src/core/boss/bosses/NaniteColossus.ts` | 115, 124–129 | Pre-allocate `LISSAJOUS_ANCHORS` and `SALVO_ANGLES` static arrays | Zero heap allocations in 60 FPS update |
| `src/core/boss/bosses/AeternumCore.ts` | 156, 238–241 | Inline Bernstein polynomial scalar math, pre-allocate `SHOTGUN_ANGLES` | Zero heap allocations in 60 FPS update |

This concludes the analysis. All mechanisms, root causes, and remediation patterns are fully specified and ready for implementation upon user authorization.
