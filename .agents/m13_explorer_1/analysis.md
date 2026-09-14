# Milestone 13: Tactical Allies Support System Architecture & Zero-GC Specification

**Author**: `m13_explorer_1`  
**Date**: 2026-09-04  
**Scope**: Tactical Allies Support System (Escort Wingman Drone, Kinetic Aegis Drone, Bomber Support Drone), Zero-Runtime-GC Pooling Architecture, Unlock & Summoning Synergies, and Full Engine Integration.

---

## 1. Executive Summary & Architectural Overview

Milestone 13 introduces the **Allies Support System (아군 편대 지원 체계)** to empower players against late-game escalation (Stages 11–50), intense multi-phase boss encounters, and devastating Stellaris cosmic crisis events. The system introduces three distinct AI-driven tactical wingmen drones:

1. **Escort Wingman Drone (호위 드론)**: Orbits the player fighter at a fixed radius, maintaining sustained offensive fire with forward plasma bolts using the existing zero-allocation `BulletManager`.
2. **Kinetic Aegis Drone (쉴드 수복기)**: Operates defensively in close proximity to the player ship, continuously monitoring shield status and emitting periodic repair pulses to restore depleted energy barriers.
3. **Bomber Support Drone (폭격 지원기)**: Executes high-speed horizontal strategic bombing runs across the upper screen, carpet-bombing enemy formations and boss clusters with high-explosive cluster bombs.

### Core Architectural Principles
- **Zero Runtime Garbage Collection**: All drone projectiles, cluster bombs, and area-of-effect explosions are pre-allocated and managed via `ObjectPool<T>`. Singletons are used for drone entities. Zero memory allocations occur during the 60 FPS update loop.
- **Unified Projectile Engine**: Escort drone bolts leverage `BulletManager.firePlayerBulletWithVector(...)` with expanded quota overrides, guaranteeing 100% backward-compatibility with existing collision and scoring pipelines.
- **Bi-directional Shield Synchronization**: Kinetic Aegis repair pulses seamlessly synchronize with both `Player.hasShield` / `Player.shieldHp` and `PowerUpManager.buffState.hasShield`.
- **Modular Directory Layout**: Implemented under `src/core/allies/`, matching the established architecture of `src/core/boss/`, `src/core/crisis/`, and `src/core/powerups/`.

---

## 2. Codebase Investigation & System Integration Points

### 2.1 Player Entity (`src/entities/Player.ts`)
- **Spatial Coordinates**: `x`, `y`, `vx`, `vy`, `speed`, `isDual`, clamped to $X \in [12, 212]$ (Single) or $[16, 208]$ (Dual), baseline $Y = 250$.
- **Shield Subsystem**:
  - `hasShield: boolean` (indicates active energy deflector).
  - `shieldHp: number` (hitpoint absorption count).
  - `shieldFlashTimer: number` (visual barrier flash).
  - When damaged in `hitTestAndDamage(threat)`:
    ```typescript
    if (this.hasShield || this.shieldHp > 0) {
      this.hasShield = false;
      this.shieldHp = 0;
      this.shieldFlashTimer = 0.3;
      this.invulnerableTimer = Math.max(this.invulnerableTimer, 1.0);
      this.onShieldDeflect?.(this.x, this.y);
      return false; // Intercepts lethal hit!
    }
    ```
  - **Aegis Drone Hook**: Setting `player.hasShield = true; player.shieldHp = 1;` fully restores the barrier and triggers player shield rendering.

### 2.2 Power-Up Manager Subsystem (`src/core/powerups/PowerUpManager.ts`)
- `PowerUpManager.buffState.hasShield` synchronizes with `player.hasShield` during `update(dt, player)`:
  ```typescript
  player.hasShield = this.buffState.hasShield;
  ```
- **Crucial Invariant**: When Kinetic Aegis repairs the shield, it must update both:
  ```typescript
  player.hasShield = true;
  player.shieldHp = 1;
  if (game.powerUpManager) {
    game.powerUpManager.buffState.hasShield = true;
  }
  ```
  And when the player's shield is depleted, `PowerUpManager` should ensure `this.buffState.hasShield = player.hasShield`.

### 2.3 Bullet & Projectile Subsystem (`src/entities/Bullet.ts`)
- `BulletManager` manages `ObjectPool<Bullet>` (capacity up to 256).
- Method: `firePlayerBulletWithVector(x, y, vx, vy, maxQuota)`:
  - Supports passing explicit velocity vectors.
  - Supports `maxQuota?: number`. By providing `maxQuota: 16`, the Escort Drone's shots bypass the player's single (2) / dual (4) missile cap without altering the player's manual firing quota.
  - Bullets are registered with `owner: 'PLAYER'`, allowing `Game.resolveCollisions()` to handle collision with enemies, scoring, and recycling without duplicate logic.

### 2.4 Particle System (`src/systems/ParticleSystem.ts`)
- Features zero-allocation `ObjectPool<Particle>` with 250 pre-allocated entities.
- Presets readily available for allies:
  - `spawnHitSparks(x, y)`: Drone plasma impacts and thruster flairs.
  - `spawnBossExplosion(x, y, count)`: Cluster bomb explosive detonations and shockwave rings.
  - `spawnTractorSparkle(x, y)`: Aegis drone shield repair charge particles.

### 2.5 Master Game Coordinator (`src/core/Game.ts`)
- Clean lifecycle integration points:
  - `constructor`: `this.alliesManager = new AlliesManager(this);`
  - `updatePlaying(dt)`: `this.alliesManager.update(dt);`
  - `resolveCollisions()`: `this.alliesManager.resolveCollisions(livingEnemies, this.bossManager);`
  - `renderPlayingScreen(ctx)`: `this.alliesManager.render(ctx);`
  - `setState('TITLE')`, `startGame()`, `destroy()`, `onStageClear()`: `this.alliesManager.reset();`

---

## 3. Detailed Drone Specifications & Kinematics

### 3.1 Escort Wingman Drone (`EscortDrone.ts`)
- **Tactical Role**: Sustained fire support and wingman escort.
- **Kinematics & Orbital Trajectory**:
  - Orbits the player fighter at radius $R = 24\text{ px}$.
  - Angular position:
    $$\theta(t) = \theta_0 + \omega \cdot t \quad (\omega = 2.4\text{ rad/s})$$
  - Coordinates relative to player $(X_p, Y_p)$:
    $$X_d(t) = X_p + R \cdot \cos(\theta(t))$$
    $$Y_d(t) = Y_p + \frac{R}{2} \cdot \sin(\theta(t))$$
  - The semi-minor axis $\frac{R}{2}$ prevents the drone from dipping excessively below the player ship while giving an authentic 3D elliptical orbit illusion.
  - Coordinates are clamped: $X_d \in [8, 216]$, $Y_d \in [20, 270]$.
- **Weapon System**:
  - Plasma Bolt Autofire: $V_x = 0$, $V_y = -460\text{ px/s}$.
  - Fire Cooldown: $0.35\text{ seconds}$ (~2.85 rounds/sec).
  - Execution:
    ```typescript
    game.bulletManager.firePlayerBulletWithVector(
      this.x,
      this.y - 4,
      0,
      -460,
      16 // Expanded quota override
    );
    ```
- **Rendering & Animation**:
  - 10x10 compact tactical fighter sprite (`DRONE_ESCORT`).
  - Thruster trail: 2px flickering cyan/orange flame (`#00FFFF`, `#FF7F00`).

### 3.2 Kinetic Aegis Drone (`AegisDrone.ts`)
- **Tactical Role**: Energy shield tender and defensive interception.
- **Kinematics**:
  - Formation anchor: Trailing flank behind player ship:
    $$X_{target} = X_p - 18 \quad (\text{or } X_p + 18 \text{ if } X_p < 30)$$
    $$Y_{target} = Y_p - 8$$
  - Smooth lerp interpolation:
    $$X_d \leftarrow X_d + (X_{target} - X_d) \cdot \min(1.0, 7.0 \cdot dt)$$
    $$Y_d \leftarrow Y_d + (Y_{target} - Y_d) \cdot \min(1.0, 7.0 \cdot dt)$$
  - Vertical oscillation: $Y_{bob} = \sin(3.5 \cdot t) \cdot 1.5\text{ px}$.
- **Shield Repair State Machine**:
  1. `IDLE_MONITORING`:
     - Checks if `!player.hasShield && player.shieldHp === 0`.
     - When shield loss detected, transitions to `CHARGING_PULSE`.
  2. `CHARGING_PULSE` (Duration: $2.5\text{ s}$):
     - Channels repair energy.
     - Spawns cyan streaming charge sparkles from drone toward player position.
     - Warning/charging chime audio.
  3. `EMITTING_PULSE`:
     - Restores player shield: `player.hasShield = true; player.shieldHp = 1;`.
     - Syncs `game.powerUpManager.buffState.hasShield = true;`.
     - Triggers radiant expanding repair ring (radius $2 \to 24\text{ px}$).
     - Plays Web Audio harmonic chime.
     - Transitions to `COOLDOWN` (Duration: $12.0\text{ s}$).
  4. `COOLDOWN`:
     - Cooldown timer decrements. Returns to `IDLE_MONITORING` when complete.
- **Bonus Point-Defense Flak**:
  - Intercepts and dissolves any enemy projectile passing within $12\text{ px}$ of the Aegis drone (internal cooldown: 8.0s).

### 3.3 Bomber Support Drone (`BomberDrone.ts`)
- **Tactical Role**: Heavy air support and formation carpet-bombing.
- **Kinematics**:
  - Dormant until called into action.
  - Traverses the upper canvas at $Y_{sweep} = 36\text{ px}$ from $X = -32$ to $X = 256$ at velocity $V_x = 140\text{ px/s}$.
  - Total traversal time: $\approx 2.05\text{ seconds}$.
  - Emits heavy twin engine contrail smoke particles.
- **Carpet Bombing Cascade**:
  - Drops 4 `ClusterBomb` projectiles at horizontal positions $X = 35, 80, 125, 170$.
  - Bomb Kinematics:
    - Initial velocity: $V_x = 0$, $V_y = 150\text{ px/s}$ with gravity acceleration $a_y = 60\text{ px/s}^2$.
    - Target altitude: $Y_{target} \approx 105\text{ px}$ (formation center).
- **Cluster Bomb Detonation & Blast Radius**:
  - Detonation triggers when:
    1. Bomb reaches $Y \ge Y_{target}$; OR
    2. Bomb AABB intersects any living enemy or boss hitbox; OR
    3. Lifetime exceeds $1.5\text{ s}$.
  - On Detonation:
    - Recycles `ClusterBomb` back to pool.
    - Spawns `BombExplosion` from pool at $(X_{bomb}, Y_{bomb})$.
    - Spawns `particleSystem.spawnBossExplosion(x, y, 36)`.
    - Triggers screen shake ($0.2\text{ s}$).
    - Plays `soundSynth.playExplosion('large')`.
- **AOE Shockwave Damage**:
  - `BombExplosion`:
    - Radius expands from $4\text{ px}$ to $28\text{ px}$ over $0.4\text{ s}$.
    - Enemies within blast radius take damage:
      - Normal enemies: Destroyed (2 damage).
      - Boss Galaga & Elite enemies: 2 damage.
      - Epic Multi-phase Boss: 4 damage.
    - Multi-hit safeguard: Pre-allocated hit list prevents dealing damage more than once per enemy per bomb explosion.

---

## 4. Unlock & Summoning Synergies

Drones are unlocked and summoned through three interconnected channels:

```
                  ┌──────────────────────────────────────────────┐
                  │          Allies Summoning Channels           │
                  └───────┬──────────────┬──────────────┬────────┘
                          │              │              │
           ┌──────────────▼───┐   ┌──────▼──────┐   ┌───▼──────────────────┐
           │ Score Milestones │   │ Power-Up    │   │ Crisis Synergies     │
           │ & Stage Clears   │   │ Item Drops  │   │ (Emergency Response) │
           └──────────────────┘   └─────────────┘   └──────────────────────┘
```

1. **Score & Progression Milestones**:
   - **15,000 pts**: Escort Wingman Drone permanently unlocked/deployed.
   - **35,000 pts**: Kinetic Aegis Drone unlocked/deployed.
   - **60,000 pts**: Bomber Support Drone air support unlocked.
   - **Boss Stage Clear**: Clearing Stages 10, 20, 30, 40, or 50 summons immediate tactical drone reinforcement for the following round.
2. **Power-Up Item Drops**:
   - Diving enemies and Bosses have a 10% chance to drop a `DRONE_BEACON` / `ALLY_SUMMON` capsule.
   - Collecting the capsule summons or upgrades the active drone roster.
3. **Endgame Crisis Event Synergy**:
   - In Milestone 10, 11 Stellaris Crisis events were introduced.
   - When a Crisis event triggers (`Devouring Swarm Frenzy`, `The Contingency`, `Hyperspace Storm`), the Allied Fleet command detects the cosmic emergency and immediately launches an **Emergency Bomber Airstrike** across the top of the screen to thin the incoming swarm, while bolstering player defenses!

---

## 5. Zero-Runtime-GC Pooling Design

### 5.1 Object Pools
| Entity | ObjectPool Capacity | Expansion Mode | Role |
|---|---|---|---|
| `ClusterBomb` | 16 entities | `autoExpand: false` | Bomber dropped munitions |
| `BombExplosion` | 16 entities | `autoExpand: false` | AOE blast damage zones |
| `Bullet` (Escort) | 256 entities (shared) | Existing `BulletManager` | Forward plasma bolts |
| `Particle` | 250 entities (shared) | Existing `ParticleSystem` | Visual explosion sparks |

### 5.2 Zero-Allocation Pool Entities
```typescript
// src/core/allies/pools/ClusterBomb.ts
export class ClusterBomb implements Poolable {
  public id: number = 0;
  public active: boolean = false;
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 150;
  public targetY: number = 105;
  public timer: number = 0;
  public maxLife: number = 1.5;
  public width: number = 4;
  public height: number = 6;

  public reset(): void {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 150;
    this.targetY = 105;
    this.timer = 0;
  }
}
```

```typescript
// src/core/allies/pools/BombExplosion.ts
export class BombExplosion implements Poolable {
  public id: number = 0;
  public active: boolean = false;
  public x: number = 0;
  public y: number = 0;
  public currentRadius: number = 4;
  public maxRadius: number = 28;
  public damage: number = 2;
  public timer: number = 0;
  public maxLife: number = 0.4;
  // Fixed pre-allocated array for multi-hit prevention (Zero GC!)
  public hitEnemyIds: string[] = [];

  public reset(): void {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.currentRadius = 4;
    this.timer = 0;
    this.hitEnemyIds.length = 0; // Clears array without reallocation
  }
}
```

### 5.3 Persistent Drone Singletons
- Drones (`EscortDrone`, `AegisDrone`, `BomberDrone`) are instantiated once in `AlliesManager`.
- When activated: `drone.activate(duration)`.
- When expired or recalled: `drone.deactivate()`.
- **Zero dynamic class instantiation** occurs during gameplay.

---

## 6. Procedural Pixel Art Sprites (`SpriteRenderer.ts`)

Procedural bit-matrices designed for registration at startup:

1. **`DRONE_ESCORT` (10x10)**:
   ```typescript
   export const DRONE_ESCORT_MATRIX: string[][] = [
     ['.','.','.','.','W','W','.','.','.','.'],
     ['.','.','.','W','C','C','W','.','.','.'],
     ['.','.','W','C','B','B','C','W','.','.'],
     ['.','W','W','B','W','W','B','W','W','.'],
     ['W','W','O','B','W','W','B','O','W','W'],
     ['W','O','O','W','W','W','W','O','O','W'],
     ['.','W','W','.','W','W','.','W','W','.'],
     ['.','.','.','.','R','R','.','.','.','.'],
     ['.','.','.','.','Y','Y','.','.','.','.'],
     ['.','.','.','.','O','O','.','.','.','.']
   ];
   ```

2. **`DRONE_AEGIS` (10x10)**:
   ```typescript
   export const DRONE_AEGIS_MATRIX: string[][] = [
     ['.','.','.','C','C','C','C','.','.','.'],
     ['.','.','C','B','W','W','B','C','.','.'],
     ['.','C','B','W','W','W','W','B','C','.'],
     ['C','B','W','W','C','C','W','W','B','C'],
     ['C','W','W','C','B','B','C','W','W','C'],
     ['C','W','W','C','B','B','C','W','W','C'],
     ['C','B','W','W','C','C','W','W','B','C'],
     ['.','C','B','W','W','W','W','B','C','.'],
     ['.','.','C','B','W','W','B','C','.','.'],
     ['.','.','.','C','C','C','C','.','.','.']
   ];
   ```

3. **`DRONE_BOMBER` (18x10)**:
   ```typescript
   export const DRONE_BOMBER_MATRIX: string[][] = [
     ['.','.','.','.','.','.','.','.','R','R','.','.','.','.','.','.','.','.'],
     ['.','.','.','.','.','.','.','K','W','W','K','.','.','.','.','.','.','.'],
     ['.','.','.','.','.','.','K','L','W','W','L','K','.','.','.','.','.','.'],
     ['.','.','.','.','.','K','L','L','K','K','L','L','K','.','.','.','.','.'],
     ['.','.','.','.','K','L','R','R','K','K','R','R','L','K','.','.','.','.'],
     ['.','.','.','K','L','L','R','R','L','L','R','R','L','L','K','.','.','.'],
     ['.','.','K','L','K','K','L','L','W','W','L','L','K','K','L','K','.','.'],
     ['.','K','L','L','K','K','K','K','W','W','K','K','K','K','L','L','K','.'],
     ['K','L','L','K','.','.','O','O','K','K','O','O','.','.','K','L','L','K'],
     ['K','K','K','.','.','.','Y','Y','.','.','Y','Y','.','.','.','K','K','K']
   ];
   ```

4. **`CLUSTER_BOMB` (6x8)**:
   ```typescript
   export const CLUSTER_BOMB_MATRIX: string[][] = [
     ['.','.','K','K','.','.'],
     ['.','K','R','R','K','.'],
     ['K','R','Y','Y','R','K'],
     ['K','R','Y','Y','R','K'],
     ['K','R','R','R','R','K'],
     ['.','K','O','O','K','.'],
     ['.','K','Y','Y','K','.'],
     ['.','.','O','O','.','.']
   ];
   ```

---

## 7. Exact File Structure & Module Interfaces

```
src/core/allies/
├── types.ts                    # All interfaces, enums, configs, and ally state types
├── BaseDrone.ts                # Abstract base class for drones (position, timers, state)
├── drones/
│   ├── EscortDrone.ts          # Escort Wingman Drone (orbital motion, autofire plasma bolts)
│   ├── AegisDrone.ts           # Kinetic Aegis Drone (shield repair pulse, defensive flak)
│   └── BomberDrone.ts          # Bomber Support Drone (top sweep, carpet-bombing runs)
├── pools/
│   ├── ClusterBomb.ts          # Poolable cluster bomb entity
│   └── BombExplosion.ts        # Poolable explosive AOE shockwave entity
├── AlliesManager.ts            # Master coordinator for drones, pools, summoning & collision hooks
└── index.ts                    # Public barrel exports
```

### Class Signatures

```typescript
// src/core/allies/types.ts
export enum DroneType {
  ESCORT = 'ESCORT',
  AEGIS = 'AEGIS',
  BOMBER = 'BOMBER',
}

export enum DroneState {
  INACTIVE = 'INACTIVE',
  DEPLOYING = 'DEPLOYING',
  ACTIVE = 'ACTIVE',
  RETURNING = 'RETURNING',
  COOLDOWN = 'COOLDOWN',
}

export interface DroneStats {
  activeCount: number;
  totalSummoned: number;
  totalBombsDropped: number;
  totalShieldsRepaired: number;
}
```

```typescript
// src/core/allies/AlliesManager.ts
export class AlliesManager {
  public escortDrone: EscortDrone;
  public aegisDrone: AegisDrone;
  public bomberDrone: BomberDrone;
  private bombPool: ObjectPool<ClusterBomb>;
  private explosionPool: ObjectPool<BombExplosion>;

  constructor(game: Game);
  public update(dt: number): void;
  public render(ctx: CanvasRenderingContext2D): void;
  public resolveCollisions(enemies: Enemy[], bossManager?: BossManager): void;
  public summonDrone(type: DroneType, duration?: number): void;
  public onCrisisTriggered(crisisId: string): void;
  public checkMilestones(score: number, stage: number): void;
  public reset(): void;
  public onStageClear(): void;
}
```

---

## 8. Verification Strategy & Invalidation Conditions

1. **Automated Unit Tests**:
   - `tests/unit/allies.test.ts`:
     - Test Escort Drone orbit equations, boundary clamps, and autofire rate.
     - Test Aegis Drone shield monitoring, charging duration, pulse trigger, and player shield restoration.
     - Test Bomber Drone sweep speed, bomb drop intervals, and screen-exit cleanup.
     - Test `ClusterBomb` and `BombExplosion` pool invariants across 1,000 cycles without allocations.
2. **Backward-Compatibility**:
   - Ensure all existing 863 Vitest tests continue to pass with 0 regressions.
3. **Invalidation Conditions**:
   - Any runtime heap allocation detected in `AlliesManager.update()`.
   - Player fire quota blocked by Escort Drone autofire.
   - Desynchronization between Aegis Drone shield restoration and `PowerUpManager`.
