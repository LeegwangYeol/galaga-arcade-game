# Milestone 12 Review & Adversarial Challenge Report

**Reviewer**: `m12_reviewer_2` (Roles: Reviewer, Critic)  
**Target Work Product**: Milestone 12: 5 Epic Multi-Phase Boss Encounters and Procedural Rendering  
**Verdict**: **`REQUEST_CHANGES`**  
**Overall Risk Assessment**: **HIGH**

---

## 1. Review Summary

While the worker successfully implemented rich mathematical models (Plummer gravitational softening, Lissajous frequency knots, Bernstein Bézier curves, rotating angular shockwave sectors, and dual counter-rotating spiral bullet hell) and strictly adhered to the Zero-External-Asset constraint with 10 pure procedural pixel bit-matrices, an adversarial code audit revealed a **game-breaking integration defect** that permanently deadlocks the game at Stage 30, along with invisible escort drones on Stage 10 and double-update/double-render loops on sub-units.

### Verdict: `REQUEST_CHANGES`

---

## 2. Findings

### [Critical] Finding 1: Stage 30 Permanent Softlock (Mini-Constructs Omitted from Formation Collision Targets)
- **What**: When Stage 30 (`NaniteColossus`) splits into 4 Mini-Constructs at 50% HP, player missiles pass right through the Mini-Constructs without hitting them. The main Colossus is immune to damage while split (`isProtectedBySubUnits() === true`), creating an inescapable infinite softlock.
- **Where**:
  - `src/core/Game.ts`: Line 384 (`onSpawnBoss`)
  - `src/core/boss/bosses/NaniteColossus.ts`: Lines 40–53, 62–73
  - `src/systems/FormationManager.ts`: Line 240–245, Line 920 (`getLivingEnemies`)
- **Why**:
  1. In `Game.ts` lines 381–387:
     ```typescript
     onSpawnBoss: (stage) => {
       const boss = this.bossManager.spawnBoss(stage);
       if (boss) {
         return [boss, ...boss.getActiveSubUnits()];
       }
       return [];
     },
     ```
  2. In `NaniteColossus.ts`, the 4 `miniConstructs` are instantiated in the constructor with default `active = false` (they only activate when the boss splits at 50% HP).
  3. Because `getActiveSubUnits()` filters by `s.active`, it returns `[]` when `spawnStage(30)` is called. Therefore, `formationManager.enemies` receives **ONLY** `[NaniteColossus]`.
  4. When the Colossus reaches 50% HP, `colossus.isSplit = true` and `construct.active = true` are triggered. However, the constructs are **never** added to `formationManager.enemies`.
  5. `Game.resolveCollisions()` checks collisions exclusively against `this.formationManager.getLivingEnemies()`, which only contains `[NaniteColossus]`. Player bullets never hit the Mini-Constructs.
  6. `NaniteColossus.takeDamage()` checks `isProtectedBySubUnits()`, which returns `this.isSplit` (`true`), absorbing all incoming damage.
  7. As verified with live test execution, player bullets pass through Mini-Constructs without effect (`c0.health` remains 18, bullets remain un-recycled), leaving Stage 30 impossible to complete.
- **Suggestion**:
  In `src/core/Game.ts` line 384, change:
  ```typescript
  return [boss, ...boss.subUnits];
  ```
  instead of `...boss.getActiveSubUnits()`. When inactive, `subUnits` have `active = false` and are safely ignored by `formationManager.getLivingEnemies()`. When `isSplit` activates them, they are already present in `formationManager.enemies` and will correctly register bullet collisions.

---

### [Major] Finding 2: Stage 10 Escort Drones are Completely Invisible Due to Unregistered Sprite ID
- **What**: The escort drones for Stage 10 (`CyberDreadnought`) exist logically and fire projectiles, but are 100% invisible on canvas.
- **Where**:
  - `src/core/boss/bosses/CyberDreadnought.ts`: Lines 36–37
  - `src/renderer/SpriteRenderer.ts`: Lines 855–861, 1133–1140
- **Why**:
  In `CyberDreadnought.ts`:
  ```typescript
  this.escortLeft = new BossSubUnit(this, 9903, 'ESCORT_LEFT', 'ZAKO_WING_0', 5, 12, 12);
  this.escortRight = new BossSubUnit(this, 9904, 'ESCORT_RIGHT', 'ZAKO_WING_0', 5, 12, 12);
  ```
  `'ZAKO_WING_0'` is not registered in `SpriteRenderer.ts` (the registered sprite IDs are `'ZAKO'` and `'ELITE_ZAKO'`).
  In `SpriteRenderer.draw()`:
  ```typescript
  const def = SpriteRenderer.definitions.get(spriteId);
  if (def) { ... } else { return; }
  ```
  Because `'ZAKO_WING_0'` is missing from definitions, `SpriteRenderer.draw()` silently early-returns, drawing nothing to the canvas.
- **Suggestion**:
  In `src/core/boss/bosses/CyberDreadnought.ts` lines 36–37, change `'ZAKO_WING_0'` to `'ZAKO'`.

---

### [Major] Finding 3: Sub-Units Suffer From Double-Update and Double-Render Every Frame
- **What**: Active sub-units (`BossSubUnit`) in Stages 10, 40, and 50 are updated twice per frame and rendered twice per frame.
- **Where**:
  - `src/core/boss/BaseBoss.ts`: Lines 318–322, 335–339
  - `src/systems/FormationManager.ts`: Lines 848, 906
- **Why**:
  1. `BaseBoss.update(dt)` iterates over `this.subUnits` and calls `sub.update(dt, playerX, playerY)`. Simultaneously, `FormationManager.update(dt)` iterates over `this.enemies` (which contains those same sub-units) and calls `enemy.update(dt, playerX, playerY)`. As a result, `sub.update()` runs twice per tick (advancing timers and state at 2x intended speed).
  2. `BaseBoss.render(ctx)` iterates over `this.subUnits` and calls `sub.render(ctx)`. Simultaneously, `FormationManager.render(ctx)` iterates over `this.enemies` and calls `enemy.render(ctx)`. This issues redundant draw calls for every active sub-unit every frame.
- **Suggestion**:
  In `BaseBoss.ts`, remove sub-unit rendering and updating from `BaseBoss.update()` and `BaseBoss.render()`, allowing `FormationManager` to exclusively manage, update, and render all enemies in `this.enemies`.

---

### [Minor] Finding 4: Inaccurate Matrix Specifications in Worker Handoff Report
- **What**: The worker's handoff report documents sprite matrix IDs and dimensions that do not match the actual code in `SpriteRenderer.ts`.
- **Where**: `.agents/m12_worker/handoff.md`: Lines 14–24 vs `src/renderer/SpriteRenderer.ts`: Lines 573–761.
- **Why**:
  The report claims matrices like `'BOSS_DREADNOUGHT_BODY'` (48x32), `'BOSS_DREADNOUGHT_TURRET'` (10x10), `'BOSS_LEVIATHAN_REAL'` (56x36), and `'BOSS_AETERNUM_CORE'` (56x56). In `SpriteRenderer.ts`, the actual constants are named `'BOSS_DREADNOUGHT_ARMORED'` (24x16 scaled 1.5x), `'BOSS_LEVIATHAN_REAL'` (24x16), and `'BOSS_STAREATER_CORE'` (28x20). Turrets use `'ENEMY_BULLET'`. While the code functions with its own naming, the handoff documentation is misleading.

---

### [Minor] Finding 5: Instantaneous Dual Fighter Hull Annihilation from Stage 20 Radial Shockwave
- **What**: A dual fighter hit by Dimensional Leviathan's radial shockwave loses both hulls in 2 consecutive frames (33ms) rather than dropping to a single fighter.
- **Where**: `src/core/boss/bosses/DimensionalLeviathan.ts`: Line 146 vs `src/entities/Player.ts`: Lines 585–597.
- **Why**: With `wave.thickness = 6` and `wave.speed = 110`, the shockwave boundary intersects the player hitbox across ~3 frames. On frame 1, the left hull is destroyed and the player becomes a single fighter, but without temporary damage invulnerability (`invulnerableTimer` is only set on shield deflection). On frame 2, the newly single fighter is hit by the same shockwave and immediately destroyed.
- **Suggestion**: Record a `hasDamagedPlayer` boolean per shockwave cycle or award brief invulnerability (0.5s) upon partial dual-fighter destruction.

---

## 3. Adversarial Challenges

### Challenge 1: Stage 30 Split State Swept Collision Blind Spot
- **Assumption Challenged**: "Adding boss to `formationManager.enemies` handles all collision detection seamlessly."
- **Attack Scenario**: Player reaches Stage 30, damages Nanite Colossus below 75 HP, and fires missiles at the 4 Mini-Constructs.
- **Blast Radius**: **CRITICAL**. Missiles fly through Mini-Constructs. Colossus absorbs all direct hits (`isSplit === true`). Boss cannot be damaged, constructs cannot be damaged, stage cannot be cleared, game softlocked.
- **Result**: **FAILED (Confirmed Bug)**.

### Challenge 2: Procedural Sprite Asset Lookup Reliability
- **Assumption Challenged**: "All sprite IDs passed to `BossSubUnit` exist in `SpriteRenderer`."
- **Attack Scenario**: Sub-unit `ESCORT_LEFT` queries `SpriteRenderer.draw(ctx, 'ZAKO_WING_0', ...)`.
- **Blast Radius**: **MAJOR**. Missing definition causes silent no-op; escort drones are completely invisible.
- **Result**: **FAILED (Confirmed Bug)**.

### Challenge 3: Gravitational Singularity Division-by-Zero
- **Assumption Challenged**: "Gravitational tear formula $a = G \cdot \Delta r / (r^2 + \epsilon^2)^{1.5}$ could cause $NaN$ or runaway velocities when player bullet enters center of tear."
- **Stress Test**: Tested with $\Delta r = 0$. Denominator evaluates to $(18^2)^{1.5} = 18^3 = 5832 \ne 0$. Acceleration evaluates to 0. Velocity remains finite and smooth.
- **Blast Radius**: Zero.
- **Result**: **PASSED**.

### Challenge 4: ObjectPool Bounding Under Dual Spiral Bullet Hell
- **Assumption Challenged**: "Stage 50 Phase 3 dual 6-arm spiral bullet hell firing every 0.25s will exceed `BULLET_CONFIG.POOL_MAX_SIZE = 256` and cause dropped bullets or GC allocations."
- **Stress Test**: Ran 300 continuous frames of dual spiral hell. Maximum active enemy bullets peaked between 70–95 before leaving viewport and recycling. Remained well below the 256 pool limit.
- **Blast Radius**: Zero.
- **Result**: **PASSED**.

---

## 4. 5-Component Handoff Protocol

### 1. Observation
- **Test Suite**: `npm test` passed 43 files and 821 tests in 2.29s.
- **Build**: `npm run build` completed cleanly in 279ms (`tsc --noEmit && vite build`).
- **Media Asset Scan**: `find_by_name` across `png, jpg, jpeg, svg, gif, mp3, wav, ogg` returned 0 files. Zero external assets confirmed.
- **Code Inspection & Live Reproduction**:
  - `src/core/Game.ts:384`: `return [boss, ...boss.getActiveSubUnits()];`
  - In `NaniteColossus.ts`: `construct.active = false` at spawn time.
  - Live execution output:
    ```
    Enemies in formation for Stage 30: 1
    Enemy types in formation: [ 'NaniteColossus' ]
    Boss isSplit: true
    Mini construct 0 active: true
    Enemies in formation NOW: 1
    Player bullets before collision: 1
    Player bullets after collision: 1
    Mini construct 0 HP after bullet: 18
    ```
  - In `CyberDreadnought.ts:36-37`: `'ZAKO_WING_0'` passed as sprite ID.
  - In `SpriteRenderer.ts`: `'ZAKO_WING_0'` does not exist in `definitions` map.

### 2. Logic Chain
1. *Observation*: `Game.resolveCollisions()` checks collisions only against `formationManager.getLivingEnemies()`.
2. *Observation*: `onSpawnBoss` adds only `boss.getActiveSubUnits()` to `formationManager.enemies`.
3. *Observation*: `NaniteColossus` constructs are inactive at spawn time and thus never added to `formationManager.enemies`.
4. *Deduction*: When `NaniteColossus` splits, its active constructs are missing from `formationManager.enemies` and cannot be collided with by player bullets.
5. *Observation*: `NaniteColossus.isProtectedBySubUnits()` returns `true` while split.
6. *Deduction*: The player cannot damage the boss, nor can the player damage the constructs. Stage 30 is permanently softlocked.
7. *Conclusion*: Milestone 12 contains a Critical gameplay defect that breaks progression. The verdict must be `REQUEST_CHANGES`.

### 3. Caveats
- No changes to implementation code were made during this review (strict adherence to Review-Only constraint).
- Other boss stages (10, 20, 40, 50) have their sub-units active at initialization and do not suffer from the Stage 30 omission, although Stage 10 suffers from invisible escort drones.

### 4. Conclusion
**Verdict: `REQUEST_CHANGES`**  
The implementation exhibits solid mathematical foundations and clean build compliance, but cannot be approved until:
1. Stage 30 Mini-Constructs are added to `formationManager.enemies` (by changing `onSpawnBoss` to return `[boss, ...boss.subUnits]`) so player bullets can hit and destroy them.
2. Stage 10 escort drones sprite ID is corrected from `'ZAKO_WING_0'` to `'ZAKO'`.
3. Sub-unit double-updating and double-rendering in `BaseBoss.ts` vs `FormationManager.ts` is resolved.

### 5. Verification Method
1. Run the Stage 30 full collision reproduction script:
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
   if (c0.health === 18) throw new Error("Mini-construct was not damaged by bullet!");
   '
   ```
2. Verify all test suites pass:
   ```bash
   npm test
   ```
3. Verify production build:
   ```bash
   npm run build
   ```
4. Invalidation condition: Any test failure in `npm test`, build error, or failure of player bullets to hit Stage 30 mini-constructs.
