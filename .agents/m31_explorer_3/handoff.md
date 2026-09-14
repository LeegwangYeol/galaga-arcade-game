# Handoff Report: M31 Baseline Test Compatibility, Game Player Proxy & Tractor Beam Dual Dynamics

- **Agent Identity**: `m31_explorer_3`
- **Working Directory**: `/Users/user/src/galog/.agents/m31_explorer_3`
- **Target Milestone**: M31 (Multi-Entity Player Architecture & Independent State Engine)
- **Parent Conversation ID**: `0236827c-a7d2-4115-a374-2f5c45ed8134`
- **Date / Timestamp**: 2026-09-14T08:40:00Z

---

## 1. Observation

### 1.1 Baseline Test Suite Execution & Volume
Direct execution of the current unit test suite via `npx vitest run tests/unit --run`:
```
 Test Files  109 passed (109)
      Tests  2002 passed (2002)
   Duration  8.10s
```
*Note*: The test suite has grown from the earlier 104 files / 1,930 tests to 109 test files and 2,002 tests (including M26–M30 fullscreen, responsive layout, bottom dashboard, and opengraph tests). All 2,002 tests pass 100% with zero failures.

### 1.2 Catalog of `game.player` and `player` Usages Across `tests/unit/`
Using AST and regex analysis over all 109 unit test files:

#### A. Usages of `game.player.*` (33 test files):
The following 43 properties, methods, and callbacks are accessed on `game.player`:
1. **Spatial & Kinematic Coordinates**:
   - `x`, `y`, `vx`, `vy`, `clampPosition()`
2. **State & Timers**:
   - `state` (getter/setter: `'normal'`, `'capturing'`, `'captured'`, `'docking'`, `'dual'`, `'destroyed'`, `'respawning'`)
   - `lives` (direct getter and direct mutation, e.g. `game.player.lives = 0`, `game.player.lives = 1`)
   - `score` (getter/setter)
   - `isDual` (getter/setter)
   - `isInvulnerable()` (method call)
   - `invulnerableTimer` (getter/setter)
   - `deathTimer` (getter/setter)
   - `isInvincibleCheat` (boolean flag)
   - `isWarpRamActive` (boolean flag)
3. **Weapon & Firing**:
   - `attemptFire()`
   - `canFire` (getter)
   - `fireCooldownTimer` (getter/setter)
   - `activeMissileCount` (getter/setter)
   - `getMaxMissileQuota()` (method call)
   - `hasRapidFire`, `hasScatterShot` (getters)
   - `rapidFireTimer` (getter/setter)
4. **Buffs & Power-Ups**:
   - `hasShield`, `shieldHp` (getter/setter)
   - `chronoFieldTimer` (getter/setter)
   - `reflectionShieldTimer`, `hasReflectionShield` (getter/setter)
   - `empCollectorTimer` (getter/setter)
   - `phaseDriveTimer` (getter/setter)
   - `plasmaBlasterTimer` (getter/setter)
5. **Collision & Hit Testing**:
   - `getHitbox()` (returns `Rect`)
   - `hitTestAndDamage(threat: Rect)` (returns `boolean`)
   - `destroy()`
6. **Capture & Rescue FSM Triggers**:
   - `startCapture(beamCenterX: number, bossY: number)`
   - `startRescue(bossX: number, bossY: number)`
   - `rescuedFighter` (object inspection)
7. **Lifecycle & Rendering**:
   - `update(dt: number, input?: InputState)`
   - `render(ctx: CanvasRenderingContext2D)`
8. **Event Callbacks**:
   - `onFire`, `onExplode`, `onDocked`, `onGameOver`, `onShieldDeflect`

#### B. Usages of `player.*` (Isolated `Player` instances in tests):
The following 58 properties and methods are used across unit tests where `Player` is tested directly:
- In addition to all above: `applyPowerUp`, `cancelCapture`, `captureAngle`, `currentSpeed`, `engineBoosterTimer`, `hasAntimatterPlasma`, `hasChronoField`, `hasEmpCollector`, `hasEngineBooster`, `hasPhaseDrive`, `hasReflectionShieldActive`, `onPlasmaBeamTick`, `onReflectionDeflect`, `phaseWarpCooldown`, `reflectionShieldHp`, `reset`, `respawn`, `shieldFlashTimer`, `speed`, `toData`, `triggerPhaseWarp`.

#### C. Direct Instantiations and Assignments:
- **Direct instantiations**: Exactly 35 test files call `new Player({ x: ..., y: ..., lives: ... })` directly.
- **Direct assignments to `game.player`**: Exactly 0 tests assign `game.player = ...`.
- In `src/core/Game.ts`: Line 77 defines `public player: Player;`, instantiated once at line 318 `this.player = new Player({ ... });`.
- In `src/core/Game.ts`: Line 1602 defines `public getPlayer(): Player { return this.player; }`.

### 1.3 Tractor Beam & Enemy Capture/Rescue Code Paths
Inspecting `src/entities/TractorBeam.ts`, `src/entities/Enemy.ts`, `src/systems/FormationManager.ts`, and `src/core/Game.ts`:

1. **Scheduling (`FormationManager.ts:696–711`)**:
   ```typescript
   const shouldAttemptTractor =
     this.stage >= 2 &&
     !playerIsDual &&
     !this.isTractorBeamActive() &&
     Math.random() < 0.35;
   if (shouldAttemptTractor) {
     const eligibleBosses = formationEnemies.filter(
       (e) => e.type === EnemyType.BOSS && !e.hasCapturedFighter && e.health >= 1
     );
     if (eligibleBosses.length > 0) {
       const boss = eligibleBosses[Math.floor(Math.random() * eligibleBosses.length)]!;
       this.launchTractorBeamDive(boss, playerX);
       return;
     }
   }
   ```
2. **Dive Initiation (`FormationManager.ts:774–802`)**:
   `launchTractorBeamDive` calculates `haltX = Math.max(48, Math.min(176, playerX))` and `haltY = 100`, assigns cubic Bézier curve to `TRACTOR_DIVE`, and sets `boss.isTractorDiving = true`.
3. **Altitude Check (`FormationManager.ts:1012–1027` & `Enemy.ts:740–756`)**:
   When Boss reaches $y \in [95, 105]$, `enemy.isTractorDiving = false`, `enemy.state = EnemyState.TRACTOR_BEAM_ACTIVE`, and `onTractorBeamRequest?.(enemy)` fires.
4. **Beam Activation (`Game.ts:475–478` & `TractorBeam.ts:143–170`)**:
   `tractorBeam.activate(boss)` sets beam state to `EMITTING` (expands for 0.5s into `HOLDING` for 3.5s).
5. **Capture Collision (`Game.ts:1341–1362`)**:
   Checks `!player.isInvulnerable()`, `(player.state === 'normal' || 'ALIVE')`, and `!player.isDual`. If inside beam cone, `tractorBeam.startCapture(this.player)` and `this.player.startCapture(boss.x, boss.y)` are invoked.
6. **Capture Ascension (`Player.ts:549–569`)**:
   Ascends for 2.5s while spinning at 1440 deg/s ($8\pi\text{ rad/s}$). At progress 1.0: `player._state = 'captured'`, `player.lives -= 1`, `player.onCapturedComplete?.(targetX, targetY)`. If `player.lives > 0`, `player.respawn()`. If `player.lives === 0`, `player.onGameOver?.()`.
7. **Escort Attachment (`Game.ts:1060–1083`)**:
   Spawns `EnemyType.CAPTURED_FIGHTER` escort attached to Boss Galaga (`boss.hasCapturedFighter = true`, `boss.capturedFighterEnemy = escort`). Boss transitions to `RETURNING_TO_FORMATION`.
8. **Rescue Flow (`Game.ts:1215–1235`)**:
   If diving Boss Galaga is killed:
   `capturedFighter.active = false; capturedFighter.state = EnemyState.INACTIVE;`
   `this.player.startRescue(enemy.x, enemy.y);`
   `this.scoreManager.addScore(1000);`
   Rescued fighter descends and docks with player ship, transforming it into Dual Fighter (`player._state = 'dual'`).
   If Boss is destroyed in formation: Escort becomes `CAPTURED_HOSTILE` turncoat and dives solo.
   If Boss is destroyed mid-beam: `tractorBeam.deactivate(true);` and `player.cancelCapture?.();` (restores normal with 1.0s invulnerability).

---

## 2. Logic Chain

### 2.1 Backward Compatibility Architecture: `game.player` Proxy & `PlayerManager`
1. **Observation**: 33 existing test files directly access `game.player` with 43 distinct properties and methods, including mutating `game.player.lives` or calling `game.player.hitTestAndDamage()`. None assign `game.player = ...`. 35 test files instantiate `new Player(...)`.
2. **Inference**: If `Game.ts` replaces `public player: Player;` with a getter `public get player(): Player`, returning the primary player (`this.playerManager.getPlayer('p1')!`), and provides a setter `public set player(p: Player)`, then:
   - Every single read and write to `game.player.*` evaluates directly on the underlying Player 1 entity.
   - All 33 test files will continue running with zero modifications and zero regressions.
   - `game.getPlayer()` returns `this.playerManager.getPlayer('p1')!`.
   - `game.players` returns `this.playerManager.getPlayers()`.
   - `Player` class can be retained with all its existing methods and properties, adding an optional `id: 'p1' | 'p2' = 'p1'` and `colorScheme: 'classic' | 'crimson'` in its constructor config.
   - `PlayerEntity` can be defined as an interface or class identical/inheriting from `Player`, ensuring 100% interoperability.

### 2.2 Co-op Mode Multi-Entity Integration (`PlayerManager`)
1. In Single-Player mode (default), `PlayerManager` initializes only `p1`. `getPlayers()` returns `[p1]`, `isCoop()` returns `false`.
2. In Co-op mode, `PlayerManager` initializes `p1` (Classic Cyan/White, starting at $x = 80$, baseline $y = 250$) and `p2` (Crimson/Amber, starting at $x = 144$, baseline $y = 250$).
3. Each player maintains completely independent:
   - `x`, `y`, `vx`, `vy`, `clampPosition()`
   - `lives` (P1 and P2 have independent life counters)
   - `score` (P1 and P2 accumulate score independently)
   - `state` (`'normal'`, `'dual'`, `'capturing'`, `'captured'`, `'docking'`, `'destroyed'`, `'respawning'`, `'dead'`)
   - `activeMissileCount`
   - Active buffs (`hasShield`, `hasRapidFire`, `hasScatterShot`, `hasChronoField`, etc.)
   - Hitbox geometry (`getHitbox()`)

### 2.3 Tagged Projectiles & Zero-Allocation Bullet Pooling
1. **Observation**: `BulletManager` uses an `ObjectPool<Bullet>` capped at `maxSize: 256`. Projectile limits are enforced via `activePlayerBulletCount`.
2. **Inference**: To support concurrent 2P firing without pool fragmentation or exceeding capacity:
   - Add `public ownerId: 'p1' | 'p2' = 'p1';` to `Bullet`.
   - In `BulletManager`:
     - Maintain `activeP1BulletCount: number = 0;` and `activeP2BulletCount: number = 0;`.
     - `firePlayerBullet(...)` accepts `playerId: 'p1' | 'p2' = 'p1'`.
     - Quota is checked against `activeP1BulletCount` (for P1) or `activeP2BulletCount` (for P2).
     - Each player has an independent 2-missile quota (single) or 4-missile quota (dual).
     - When recycling, decrement the respective counter based on `bullet.ownerId`.
   - In `Game.resolveCollisions()`:
     - When a player bullet strikes an enemy, check `bullet.ownerId`.
     - Attribute score to `p1.score` if `ownerId === 'p1'`, or `p2.score` if `ownerId === 'p2'`.
     - Accumulate total team score in `scoreManager`.

### 2.4 2-Player Tractor Beam & Rescue State Machine
1. **Targeting**:
   - Boss Galaga evaluates all living players via `playerManager.getPlayers()`.
   - Players in `'dual'` state are ineligible.
   - If both P1 and P2 are single fighters, Boss Galaga targets either player (e.g. closest or pseudo-random).
   - If only one player is single, that player is targeted.
   - If both are dual, tractor dive is suppressed.
2. **Capture**:
   - Beam checks intersection with both living players.
   - At most 1 player is captured at a time. The first vulnerable player in the cone triggers `tractorBeam.startCapture(p)` and `p.startCapture(boss.x, boss.y)`.
   - While player `A` is ascending, player `B` can continue maneuvering and firing!
   - Player `A` loses 1 life upon reaching the Boss.
   - If player `A` has `lives > 0`, player `A` respawns with 3.0s invulnerability.
   - If player `A` has `lives === 0`, player `A` enters `'dead'` (or `'waiting_revive'`). Game Over is NOT triggered because player `B` is still alive!
   - Captured fighter attaches to Boss Galaga with tag `originalOwnerId = playerA.id`.
3. **Rescue**:
   - Later, when Boss Galaga dives with the captured fighter escort:
   - Either P1 or P2 can shoot down the diving Boss Galaga.
   - Upon Boss destruction:
     - The shooting player receives 1,000 pts rescue bonus.
     - The captured fighter initiates rescue descent toward its original owner (`originalOwnerId`):
       - If original owner is alive and single: initiates docking and becomes Dual Fighter!
       - If original owner was eliminated (`lives === 0`): the rescue REVIVES the eliminated player back into play with 1 life!

---

## 3. Caveats

1. **Input Mapping (M32 dependency)**: M31 focuses strictly on the multi-entity architecture, state engine, tagged pooling, and 1P backward compatibility. Dual keyboard/touch input mapping is assigned to Milestone M32. In M31, `PlayerManager.update()` accepts an input map `Map<'p1' | 'p2', InputState>`.
2. **Dynamic Scaling (M33 dependency)**: Enemy HP scaling (+50% Boss Galaga, +60% Stage Bosses) and wave density adjustments (+25%) belong to Milestone M33. In M31, enemy stats remain at baseline values unless explicitly in co-op mode.
3. **Bottom Dashboard Split (M34 dependency)**: Full visual split of the bottom dashboard into symmetrical Left (P1) and Right (P2) zones belongs to Milestone M34. In M31, HUD reflects P1 or team score without breaking existing DOM dirty-checking.

---

## 4. Conclusion & Interface Compatibility Plan

### 4.1 Interface Compatibility Plan
1. **`src/entities/Player.ts`**:
   - Add `public id: 'p1' | 'p2' = 'p1';` and `public colorScheme: 'classic' | 'crimson' = 'classic';`.
   - Update `PlayerConfig`: `{ id?: 'p1' | 'p2'; x?: number; y?: number; lives?: number; game?: any; colorScheme?: 'classic' | 'crimson'; }`.
   - Retain all 58 existing public methods and properties intact.
   - In `render(ctx)`: When `this.id === 'p2'`, render using Crimson/Amber sprite matrices (`PLAYER_2_FIGHTER` / `PLAYER_2_DUAL_FIGHTER`) with golden exhaust.
2. **`src/entities/PlayerManager.ts` (New Core Subsystem)**:
   - Manages `p1: Player` and optional `p2: Player | null`.
   - Methods:
     - `getPlayers(): Player[]`
     - `getPlayer(id: 'p1' | 'p2'): Player | undefined`
     - `isCoop(): boolean`
     - `setMode(mode: 'single' | 'coop'): void`
     - `getActiveCount(): number`
     - `update(dt: number, inputs: Map<'p1' | 'p2', InputState> | InputState): void`
     - `render(ctx: CanvasRenderingContext2D): void`
     - `reset(mode?: 'single' | 'coop'): void`
3. **`src/core/Game.ts`**:
   - Initialize `this.playerManager = new PlayerManager({ game: this });`.
   - Provide getter/setter:
     ```typescript
     public get player(): Player {
       return this.playerManager.getPlayer('p1')!;
     }
     public set player(p: Player) {
       this.playerManager.setPlayer('p1', p);
     }
     public getPlayer(id: 'p1' | 'p2' = 'p1'): Player {
       return this.playerManager.getPlayer(id)!;
     }
     public get players(): Player[] {
       return this.playerManager.getPlayers();
     }
     ```
   - In `resolveCollisions()`: Iterate over `this.playerManager.getPlayers()` for bullet hits, enemy kamikaze dive collisions, power-up pickups, and tractor beam checks.
4. **`src/entities/Bullet.ts`**:
   - Add `public ownerId: 'p1' | 'p2' = 'p1';` to `Bullet`.
   - Add `activeP1BulletCount: number = 0;` and `activeP2BulletCount: number = 0;` to `BulletManager`.
   - Support `firePlayerBullet(..., playerId: 'p1' | 'p2' = 'p1')`.

---

## 5. Concrete Unit Test Specifications for M31

We propose creating a dedicated new unit test suite: `tests/unit/m31_multi_entity_player.test.ts` with the following 20 test specifications:

### Track A: Independent P1 & P2 Entity State (6 Tests)
1. **`spec-m31-01`**: `initializes P1 and P2 with independent positions and distinct default coordinates in co-op mode` (P1 at $x=80$, P2 at $x=144$).
2. **`spec-m31-02`**: `maintains independent lives counters when P1 takes damage and P2 does not`.
3. **`spec-m31-03`**: `maintains independent power-up buffs (e.g. P1 acquires Rapid Fire while P2 remains baseline)`.
4. **`spec-m31-04`**: `maintains independent Dual Fighter docking states (P1 is Dual, P2 is Single)`.
5. **`spec-m31-05`**: `applies independent boundary clamping [12, 212] for P1 and P2 without position interference`.
6. **`spec-m31-06`**: `executes independent respawn and invulnerability timers (P1 invulnerable, P2 vulnerable)`.

### Track B: Tagged Projectile Limits & Score Attribution (5 Tests)
7. **`spec-m31-07`**: `enforces independent 2-missile on-screen quotas (P1 saturates 2 missiles, P2 can still fire 2 missiles)`.
8. **`spec-m31-08`**: `enforces independent 4-missile quota when P1 is Dual and P2 is Single`.
9. **`spec-m31-09`**: `correctly tags bullets with ownerId ('p1' vs 'p2') upon firing`.
10. **`spec-m31-10`**: `accurately attributes score to P1 when P1 bullet destroys an enemy, and to P2 when P2 bullet destroys an enemy`.
11. **`spec-m31-11`**: `recycles tagged projectiles into shared pool and decrements correct per-player missile counter`.

### Track C: Co-op Tractor Beam Capture & Rescue Dynamics (5 Tests)
12. **`spec-m31-12`**: `Boss Galaga tractor beam captures only the vulnerable single player in beam cone while other player remains controllable`.
13. **`spec-m31-13`**: `does not trigger Game Over when P1 is captured with 1 life if P2 still has lives remaining`.
14. **`spec-m31-14`**: `allows P2 to shoot down diving Boss Galaga holding P1's captured escort, triggering rescue for P1`.
15. **`spec-m31-15`**: `awards 1000 pts rescue bonus to liberating player and transitions rescued player to Dual Fighter`.
16. **`spec-m31-16`**: `cancels capture immediately if P2 shoots Boss Galaga during active beam emission, granting P1 1.0s invulnerability`.

### Track D: 100% Single-Player Backward Compatibility (4 Tests)
17. **`spec-m31-17`**: `game.player returns identical Player instance as getPlayer('p1') in single-player mode`.
18. **`spec-m31-18`**: `direct mutations on game.player (e.g. game.player.lives = 1) mutate underlying Player entity`.
19. **`spec-m31-19`**: `all 33 legacy test property/method access patterns on game.player work without throwing or type errors`.
20. **`spec-m31-20`**: `runs full game loop in 1P mode asserting 0 regressions against baseline mechanics`.

---

## 6. Verification Method

To independently verify the findings and proposed interface plan:
1. **Baseline Invariance Verification**:
   ```bash
   npx vitest run tests/unit --run
   ```
   Must pass all 109 test files and 2,002 tests with 100% success rate.
2. **TypeScript Strict Typecheck**:
   ```bash
   npx tsc --noEmit
   ```
   Must pass with 0 type errors.
3. **M31 New Test Suite Run** (once implemented by worker):
   ```bash
   npx vitest run tests/unit/m31_multi_entity_player.test.ts --run
   ```
   Must pass all 20 new tests.
4. **Invalidation Conditions**:
   - If any existing test file in `tests/unit/` fails due to `game.player` being undefined or having a different interface, the getter proxy design is invalidated and must be adjusted.
   - If `bulletPool` capacity exceeds 256 or allocations occur during 60 FPS loop, the tagged projectile implementation is invalidated.
