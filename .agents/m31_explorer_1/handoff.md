# Milestone M31: Multi-Entity Player Architecture & Independent State Engine — Handoff Report

## 1. Observation

### Codebase & Invariant Facts Directly Observed:
- **Baseline Test Suite Status**: Executed `npm test` (`vitest run`).
  - Result: **109 test files passed (109)**, **2,002 tests passed (2002)**, 0 failed, duration ~7.52s.
  - Verbatim output: `Test Files 109 passed (109) | Tests 2002 passed (2002)`.
- **`src/entities/Player.ts` Structure & State Model**:
  - `Player` class (lines 61–1001) encapsulates the 7-state player finite state machine:
    - `_state: PlayerStateType` (`normal`, `capturing`, `captured`, `docking`, `dual`, `destroyed`, `respawning`).
    - Position & Kinematics: `x: number` (112), `y: number` (250 / `BASELINE_Y`), `vx: number`, `vy: number`.
    - Boundaries: `clampPosition()` clamps $x \in [12, 212]$ (single), $[16, 208]$ (dual), and forces $y = 250$ unless Warp Ram is active (lines 854–864).
    - Life & Scoring: `lives: number = 3`, `score: number = 0`.
    - Weapon Timers & Limits: `fireCooldownTimer: number`, `activeMissileCount: number`, `getMaxMissileQuota(): number` (lines 233–245: 2 for single, 4 for dual, up to 16 with rapid fire/scatter).
    - Power-Up Timers: `rapidFireTimer`, `scatterShotTimer`, `engineBoosterTimer`, `hasShield`, `shieldHp`, `shieldFlashTimer`, `empBombCount`, `chronoFieldTimer`, `reflectionShieldTimer`, `hasReflectionShield`, `reflectionShieldHp`, `empCollectorTimer`, `phaseDriveTimer`, `phaseWarpCooldown`, `phaseGhostTimer`, `plasmaBlasterTimer`.
    - Tractor Beam & Rescue Docking: `captureTimer`, `captureAngle`, `captureOrigin`, `captureTarget`, `rescuedFighter: RescuedFighterState` (lines 88–102, 520–568).
    - Hitbox & Damage: `hitTestAndDamage(threat: Rect): boolean` (lines 671–788) with reflection shield, kinetic deflector, asymmetrical dual hull destruction, and catastrophic explosion.
- **Widespread Usage of `game.player` in Codebase & Tests**:
  - Found over **480 direct references** to `game.player` across 30+ test suites (e.g. `tests/unit/player.test.ts`, `adversarial_m13_drones.test.ts`, `m21_challenger_1_combinatorial_saturation.test.ts`, `boss_stage20_leviathan.test.ts`, etc.).
  - Direct property accesses: `game.player.x`, `game.player.y`, `game.player.lives`, `game.player.score`, `game.player.state`, `game.player.isDual`, `game.player.activeMissileCount`, `game.player.attemptFire()`, `game.player.destroy()`, `game.player.respawn()`, `game.player.reset()`, `game.player.startCapture()`, `game.player.startRescue()`, `game.player.hasShield`, `game.player.chronoFieldTimer`, `game.player.hitTestAndDamage()`, `game.player.toData()`.
  - In `src/core/Game.ts`: `public player: Player;` is referenced in 45+ places (collision handling lines 1365–1411, update loop lines 1005–1030, render line 1539, telemetry lines 1711–1740, scoring, respawn, etc.).
  - In `src/core/qa/GalagaCheatController.ts`: 22 direct references to `this.game.player` (e.g. `setInvincible`, `addLives`, `setScore`, `skipToStage` reset).
  - In `src/core/specials/SpecialMovesManager.ts`: 26 references to `this.game.player`.
  - In `src/core/allies/drones/EscortDrone.ts`: accesses `this.game.player.x`, `this.game.player.y`, and `this.game.player.state`.
- **`src/entities/Bullet.ts` & Projectile Pooling**:
  - `BulletManager` maintains `bulletPool: ObjectPool<Bullet>` (capped at 256).
  - Tracks `activePlayerBulletCount: number` against quota (`canPlayerFire`).
  - Bullet owner is `BulletOwner = 'PLAYER' | 'ENEMY' | 'DRONE'`.
  - Quota checks in tests call `game.bulletManager.getPlayerBulletCount()`.
- **`src/renderer/SpriteRenderer.ts` Procedural Offscreen Rendering**:
  - 100% Canvas 2D bit-matrices with zero external image files.
  - Registers `PLAYER_FIGHTER` ($15 \times 16$), `DUAL_FIGHTER` ($31 \times 16$), `CAPTURED_FIGHTER` ($15 \times 16$), `PLAYER_MISSILE` ($3 \times 8$), `PLAYER_LIFE_ICON` ($11 \times 10$).

---

## 2. Logic Chain

1. **Premise 1 (Single-Player Backward Compatibility)**: Because more than 480 unit test assertions and core engine components directly access `game.player` properties and methods, replacing `game.player` with an incompatible type or deleting it would instantly break the existing 2,002 tests.
2. **Premise 2 (Multi-Entity Requirement)**: Milestone M31 and Phase 6 require Player 1 and Player 2 to have independent positions, velocities, hitboxes, weapon levels, active buffs, lives, scores, and special gauges.
3. **Step 1 (Entity Abstraction)**: By defining `PlayerEntity` (or enhancing `Player` to support `id: 'p1' | 'p2'`), we allow individual fighter instances to maintain complete local state. Setting default `id = 'p1'` ensures existing instantiation `new Player(...)` behaves exactly as P1.
4. **Step 2 (Manager Encapsulation)**: Creating `PlayerManager` (in `src/systems/PlayerManager.ts`) provides a unified lifecycle controller:
   - In 1-Player mode: `players = [p1]`, `p2 = undefined`.
   - In 2-Player mode: `players = [p1, p2]`.
   - Methods: `update(dt, inputMap)`, `render(ctx)`, `getPlayers()`, `getPlayer(id)`, `getActiveCount()`, `areAllPlayersDead()`.
5. **Step 3 (Game Adapter Delegation)**: In `Game.ts`, implementing:
   ```ts
   public playerManager: PlayerManager;
   public get player(): PlayerEntity {
     return this.playerManager.p1;
   }
   public set player(p: PlayerEntity) {
     this.playerManager.p1 = p;
   }
   ```
   guarantees that 100% of existing single-player code, cheats, allies, bosses, specials, and tests referencing `game.player` seamlessly route to `p1` with zero signature discrepancies.
6. **Step 4 (Bullet Tagging & Tracking)**:
   - Adding `playerId?: 'p1' | 'p2'` to `Bullet` allows tracking which player fired the missile.
   - `BulletManager` tracks `activePlayerBulletCountP1` and `activePlayerBulletCountP2`.
   - `getPlayerBulletCount(playerId?: 'p1' | 'p2')`: when called without arguments, returning P1 count (or combined in coop) preserves 100% backward compatibility for all existing tests while giving 2P mode independent quotas.
7. **Step 5 (Visual Differentiation & Zero External Assets)**:
   - P1: Classic Galaga White/Cyan fighter sprite with blue plasma exhaust and cyan shields.
   - P2: Crimson/Amber Elite fighter sprite with golden ion exhaust and amber shields.
   - Adding procedural bit-matrices `PLAYER_FIGHTER_P2_MATRIX`, `DUAL_FIGHTER_P2_MATRIX`, `PLAYER_MISSILE_P2_MATRIX`, `PLAYER_LIFE_ICON_P2_MATRIX` directly to `SpriteRenderer.ts` adheres 100% to the Zero-External-Asset rule.

---

## 3. Detailed Architecture Design & Type Contracts

### 3.1 Architecture Overview

```
                          ┌────────────────────────┐
                          │        Game.ts         │
                          └───────────┬────────────┘
                                      │ owns
                                      ▼
                        ┌───────────────────────────┐
                        │       PlayerManager       │
                        │ (mode: 'single' | 'coop') │
                        └──────┬─────────────┬──────┘
                               │             │
                    owns p1    │             │ owns p2 (coop only)
                               ▼             ▼
              ┌──────────────────────┐ ┌──────────────────────┐
              │  PlayerEntity (P1)   │ │  PlayerEntity (P2)   │
              ├──────────────────────┤ ├──────────────────────┤
              │ id: 'p1'             │ │ id: 'p2'             │
              │ Style: Cyan / White  │ │ Style: Crimson/Amber │
              │ x: 80 (or 112 solo)  │ │ x: 144               │
              │ y: 250 (baseline)    │ │ y: 250 (baseline)    │
              │ lives: 3             │ │ lives: 3             │
              │ score: 0             │ │ score: 0             │
              │ activePowerUps: Map  │ │ activePowerUps: Map  │
              │ state: normal..dual  │ │ state: normal..dual  │
              └──────────────────────┘ └──────────────────────┘
                         ▲
                         │ game.player getter (100% backward compat)
             All 480+ existing tests & systems
```

### 3.2 Type Contracts

#### `src/entities/PlayerEntity.ts` (or `Player.ts`)
```ts
export type PlayerId = 'p1' | 'p2';

export interface PlayerConfig {
  id?: PlayerId;
  x?: number;
  y?: number;
  lives?: number;
  game?: any;
}

export interface IPlayerEntity {
  readonly id: PlayerId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  lives: number;
  score: number;
  state: PlayerStateType;
  isDual: boolean;
  canFire: boolean;
  activeMissileCount: number;
  invulnerableTimer: number;
  isInvincibleCheat: boolean;
  
  // Power-Up timers
  rapidFireTimer: number;
  scatterShotTimer: number;
  engineBoosterTimer: number;
  hasShield: boolean;
  shieldHp: number;
  chronoFieldTimer: number;
  reflectionShieldTimer: number;
  hasReflectionShield: boolean;
  empCollectorTimer: number;
  phaseDriveTimer: number;
  plasmaBlasterTimer: number;

  // Lifecycle & methods
  reset(x?: number, y?: number, lives?: number): void;
  update(dt: number, input?: InputState): void;
  render(ctx: CanvasRenderingContext2D): void;
  attemptFire(): boolean;
  hitTestAndDamage(threat: Rect): boolean;
  destroy(): void;
  respawn(): void;
  startCapture(beamCenterX: number, bossY: number): void;
  startRescue(bossX: number, bossY: number): void;
  cancelCapture(): void;
  getHitbox(): Rect;
  toData(): PlayerData;
}
```

#### `src/systems/PlayerManager.ts`
```ts
export type GameMode = 'single' | 'coop';

export class PlayerManager {
  public mode: GameMode = 'single';
  public p1: PlayerEntity;
  public p2?: PlayerEntity;
  private game: any;

  constructor(game?: any, mode: GameMode = 'single') {
    this.game = game;
    this.mode = mode;
    this.p1 = new PlayerEntity({ id: 'p1', x: mode === 'coop' ? 80 : 112, y: 250, lives: 3, game });
    if (mode === 'coop') {
      this.p2 = new PlayerEntity({ id: 'p2', x: 144, y: 250, lives: 3, game });
    }
  }

  public setMode(mode: GameMode): void;
  public isCoop(): boolean;
  public getPlayers(): PlayerEntity[];
  public getPlayer(id: PlayerId): PlayerEntity | undefined;
  public getLivingPlayers(): PlayerEntity[];
  public getActiveCount(): number;
  public areAllPlayersDead(): boolean;
  public reset(): void;
  public update(dt: number, inputs: { p1?: InputState; p2?: InputState } | InputState): void;
  public render(ctx: CanvasRenderingContext2D): void;
}
```

### 3.3 Procedural Pixel Art Matrices for P2 (Crimson / Amber)

```ts
export const PLAYER_FIGHTER_P2_MATRIX: string[][] = [
  ['.','.','.','.','.','.','.','O','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','O','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','Y','R','Y','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','Y','R','Y','.','.','.','.','.','.'],
  ['.','.','.','.','.','R','R','R','R','R','.','.','.','.','.'],
  ['.','.','.','.','.','R','D','D','D','R','.','.','.','.','.'],
  ['.','.','.','.','R','R','D','D','D','R','R','.','.','.','.'],
  ['.','.','.','.','R','R','R','R','R','R','R','.','.','.','.'],
  ['.','R','.','.','R','Y','Y','R','Y','Y','R','.','.','R','.'],
  ['.','R','.','R','R','Y','Y','R','Y','Y','R','R','.','R','.'],
  ['.','R','R','R','R','R','R','R','R','R','R','R','R','R','.'],
  ['R','R','R','R','R','R','D','D','D','R','R','R','R','R','R'],
  ['R','Y','Y','R','R','R','D','D','D','R','R','R','Y','Y','R'],
  ['R','Y','Y','R','R','R','R','R','R','R','R','R','Y','Y','R'],
  ['R','R','R','R','.','.','D','D','D','.','.','R','R','R','R'],
  ['.','R','R','.','.','.','.','D','.','.','.','.','R','R','.']
];

export const DUAL_FIGHTER_P2_MATRIX: string[][] = createDualFighterMatrix(PLAYER_FIGHTER_P2_MATRIX);

export const PLAYER_MISSILE_P2_MATRIX: string[][] = [
  ['.','O','.'],
  ['.','O','.'],
  ['.','Y','.'],
  ['.','Y','.'],
  ['R','R','R'],
  ['R','R','R'],
  ['.','R','.'],
  ['.','R','.']
];

export const PLAYER_LIFE_ICON_P2_MATRIX: string[][] = [
  ['.','.','.','.','.','O','.','.','.','.','.'],
  ['.','.','.','.','Y','R','Y','.','.','.','.'],
  ['.','.','.','.','R','R','R','.','.','.','.'],
  ['.','.','.','R','Y','R','Y','R','.','.','.'],
  ['.','R','.','R','Y','R','Y','R','.','R','.'],
  ['.','R','R','R','R','R','R','R','R','R','.'],
  ['R','R','R','R','D','D','D','R','R','R','R'],
  ['R','Y','Y','R','D','D','D','R','Y','Y','R'],
  ['R','R','R','.','D','D','D','.','R','R','R'],
  ['.','R','.','.','.','D','.','.','.','R','.']
];
```

Color Mapping:
- P1: White `#FFFFFF` / Cyan `#00FFFF` / Light Blue `#5B93FF` / Yellow `#FFFF00`
- P2: Crimson `#E70000` / Dark Red `#9E0000` / Amber `#FF7F00` / Yellow `#FFFF00`

---

## 4. Caveats

1. **Input Handling (M32 Scope)**: M31 establishes the multi-entity state representation and update interfaces, while non-blocking dual-keyboard (WASD vs Arrows) and mobile split-screen touch event listeners will be fully integrated in Milestone M32. M31 provides mock/dual input pass-through.
2. **Co-op Dynamic Balance & Revive Logic (M33 Scope)**: Dynamic wave health scaling (+50% Boss Galaga HP, +60% Stage Bosses HP) and shared life donation ('L' key / revive timer) will be implemented in Milestone M33. In M31, P1 and P2 have independent life counters and independent game-over conditions.
3. **Bottom Dashboard Symmetrical HUD (M34 Scope)**: Symmetrical P1/P2 split HUD in `BottomDashboard.ts` is scoped for Milestone M34. In M31, `updateDashboardTelemetry()` continues to report P1 telemetry (with optional P2 data slot readiness).
4. **No Implementation in Explorer Phase**: In strict adherence to the explorer role and `RULE[user_global]`, no source code modifications have been made during this exploration. Implementation will begin only upon explicit user approval ("승인" / "proceed").

---

## 5. Conclusion & Implementation Recommendations

The multi-entity player architecture can be introduced with **zero breaking changes** and **100% preservation of all 2,002 tests**. 

### Actionable Implementation Steps for M31:
1. **Step 1: Procedural Asset Matrices**:
   - Add `PLAYER_FIGHTER_P2_MATRIX`, `DUAL_FIGHTER_P2_MATRIX`, `PLAYER_MISSILE_P2_MATRIX`, and `PLAYER_LIFE_ICON_P2_MATRIX` to `src/renderer/SpriteRenderer.ts`.
   - Register definitions in `SpriteRenderer.initialize()`.
2. **Step 2: PlayerEntity Class**:
   - In `src/entities/Player.ts` (or `PlayerEntity.ts` with re-export), add `public id: PlayerId = 'p1'`.
   - Adapt rendering: if `this.id === 'p2'`, blit `PLAYER_FIGHTER_P2` / `DUAL_FIGHTER_P2` / amber thrusters (`#FF8800`) / amber shield (`#FFAA00`).
   - Export both `Player` and `PlayerEntity` (where `Player` is an alias or subclass defaulting to `id: 'p1'`).
3. **Step 3: PlayerManager System**:
   - Create `src/systems/PlayerManager.ts`.
   - Manage `p1` and optional `p2`, update loops, boundary clamping, and reset logic.
4. **Step 4: Tagged Projectiles in BulletManager**:
   - Add `playerId?: 'p1' | 'p2'` to `Bullet`.
   - In `BulletManager`: track `activePlayerBulletCountP1` and `activePlayerBulletCountP2`.
   - Ensure `getPlayerBulletCount(playerId?: 'p1' | 'p2')` defaults to returning P1 count (or total in 1P mode), ensuring 100% test compatibility.
5. **Step 5: Game.ts Adapter**:
   - Instantiate `this.playerManager = new PlayerManager(this, 'single');`.
   - Expose `get player(): Player { return this.playerManager.p1; }` and `set player(p: Player) { this.playerManager.p1 = p; }`.
   - Update game loop collision and render passes to iterate over `this.playerManager.getPlayers()`.
6. **Step 6: Unit Verification Suite**:
   - Create `tests/unit/player_multi_entity.test.ts` verifying independent positions, velocities, weapon quotas, damage handling, and 1P backward compatibility.

---

## 6. Verification Method

To independently verify after implementation:
1. **Test Suite Verification**:
   ```bash
   npm test
   ```
   Must pass all 109 test files and 2,002+ tests with 0 failures and 0 regressions.
2. **New Multi-Entity Unit Tests**:
   ```bash
   npx vitest run tests/unit/player_multi_entity.test.ts
   ```
   Asserts:
   - P1 and P2 possess independent `(x, y)` positions, velocities, and bounding boxes.
   - P1 and P2 possess independent `lives`, `score`, and power-up timers.
   - P1 damage does not affect P2; P2 death does not terminate P1.
   - `game.player` getter returns `p1` identically to legacy single player.
   - P1 renders with Cyan/White sprites; P2 renders with Crimson/Amber sprites.
3. **Production TypeScript & Vite Build**:
   ```bash
   npm run build
   ```
   Must compile cleanly with `tsc --noEmit` and Vite bundle in under 1 second.
