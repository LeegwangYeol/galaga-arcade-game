# Technical Architecture Report: Power-Up Subsystem & Drop Architecture (Milestone 11)

**Explorer**: `m11_explorer_1` (Role: Power-Up Subsystem & Drop Architecture Explorer)  
**Date**: 2026-09-03  
**Target Codebase**: Galaga Arcade Web Game (`/Users/user/src/galog`)  
**Status**: Architecture Design & Specification Complete  

---

## 1. Executive Summary & Architectural Overview

In accordance with Phase 2 Expansion Requirement 3 (R3: Player Fighter Upgrade & Power-Up System) and Milestone 11 objectives, this document specifies the complete architecture of the **Power-Up Subsystem & Drop Architecture** located in `src/core/powerups/`.

To maintain strict compliance with the project's zero-external-asset policy, 60 FPS fixed-timestep determinism, and zero-allocation memory constraints, the power-up subsystem is architected around:
1. **Zero-Allocation Object Pooling**: A pre-allocated `ObjectPool<PowerUpItem>` with a fixed capacity of 32 items, utilizing $O(1)$ swap-and-pop release and reverse-safe active traversal to eliminate runtime Garbage Collection spikes.
2. **Harmonic Kinematic Drift**: Collectible power-up capsules descend at $vy \approx 60\text{ px/s}$ with horizontal sinusoidal sway ($A = 12\text{ px}, \omega = 3.0\text{ rad/s}$), bound within the $224 \times 288$ virtual viewport and automatically recycling on screen exit ($y > 288$).
3. **Deterministic Multi-Tier Loot Table & Drop Engine**: Dynamic drop rate calculation triggered upon enemy destruction in `Enemy.takeDamage()` / `Game.resolveCollisions()`, combining a 12% baseline with diving bonuses ($1.5\times$), Boss Galaga priority ($30\%$), stage tier weighting, and strict Challenging Stage exclusion.
4. **Active Upgrade State & Timer Coordinator**: Manages 15-second timed buffs (`RAPID_FIRE`, `SCATTER_SHOT`, `ENGINE_BOOSTER`), discrete single-hit deflector absorption (`KINETIC_SHIELD`), and instantaneous tactical screen wipes (`EMP_BOMB`).
5. **Seamless Engine Integration Hooks**: Non-invasive integration into `Game.ts` (`update`, `render`, `resolveCollisions`, lifecycle resets), `Enemy.ts` damage pipeline, `Player.ts` state machine, `Bullet.ts` projectile quotas, and `SpriteRenderer.ts` procedural 8x8 pixel matrices.

```
                                  +---------------------------------------+
                                  |                Game.ts                |
                                  +-------------------+-------------------+
                                                      |
                  +-----------------------------------+-----------------------------------+
                  |                                   |                                   |
                  v                                   v                                   v
     +-------------------------+         +-------------------------+         +-------------------------+
     |   Formation / Enemies   |         |     PowerUpManager      |         |     Player Fighter      |
     | (Enemy.takeDamage death |         | (Pool size: 32 items,   |         | (Single / Dual Fighter, |
     |  triggers tryDrop)      |         |  Drop RNG, Buff Timers) |         |  Hitbox, Speed, Cooldown|
     +------------+------------+         +------------+------------+         +------------+------------+
                  |                                   |                                   |
                  |  spawns PowerUpItem               |  resolves collection AABB         |
                  +---------------------------------->|   (awards buff & 500 bonus pts)   |
                                                      +---------------------------------->+
                                                      |
                                                      v
                                         +-------------------------+
                                         |   ObjectPool<PowerUp>   |
                                         |  - 32 pre-allocated     |
                                         |  - vy = 60 px/s drift   |
                                         |  - 12x12 AABB bounds    |
                                         |  - despawn on y > 288   |
                                         +-------------------------+
```

---

## 2. Directory Structure & File Manifest

The subsystem is encapsulated within `src/core/powerups/`:

```
src/core/powerups/
├── types.ts              # PowerUpType enum, PowerUpConfig, ActiveBuffState, DropTables
├── PowerUpItem.ts        # Poolable falling entity with sine sway, AABB, and procedural rendering
└── PowerUpManager.ts     # ObjectPool coordinator, drop calculator, collision detection, buff timers
```

Related integration touchpoints:
- `src/renderer/SpriteRenderer.ts`: Procedural $8 \times 8$ bit-matrices for 5 power-up icons and shield barrier aura.
- `src/core/Game.ts`: Instantiation, update loop, render layering, collision detection hook, and cheat bindings.
- `src/entities/Player.ts`: Consumption of active modifiers (speed, cooldown, spread, shield protection).
- `src/entities/Bullet.ts`: Rapid Fire quota expansion and Scatter Shot 3-way trajectory vectors.
- `src/ui/HUD.ts`: Rendering active buff timers and status badges.

---

## 3. Detailed Specification: `src/core/powerups/types.ts`

### 3.1 Type Definitions & Contracts

```typescript
/**
 * Galaga Arcade Web Game — Power-Up Subsystem Type Definitions
 * Location: src/core/powerups/types.ts
 */

import type { Rect, Vector2D } from '../../types';
import type { EnemyType, StageTier } from '../../types';

/**
 * 5 Canonical Player Power-Up Upgrade Types
 */
export enum PowerUpType {
  RAPID_FIRE = 'RAPID_FIRE',         // Overclock: 2x fire rate, expanded on-screen missile quota
  KINETIC_SHIELD = 'KINETIC_SHIELD', // Energy Barrier: absorbs 1 fatal hit/collision without hull loss
  SCATTER_SHOT = 'SCATTER_SHOT',     // Multi-Blaster: 3-way divergent spread (0°, ±15°)
  EMP_BOMB = 'EMP_BOMB',             // Tactical Screen Wipe: clears enemy bullets & stuns divers
  ENGINE_BOOSTER = 'ENGINE_BOOSTER', // Hyper Drive: lateral speed boost (260 -> 360 px/s)
}

/**
 * Backward-compatibility alias for survey references
 */
export const KINETIC_DEFLECTOR = PowerUpType.KINETIC_SHIELD;

/**
 * Static metadata configuration for each power-up module
 */
export interface PowerUpConfig {
  readonly type: PowerUpType;
  readonly name: string;
  readonly duration: number;        // Duration in seconds (0 = instantaneous, >0 = timed buff)
  readonly spriteId: string;        // SpriteRenderer cache key
  readonly primaryColor: string;    // Arcade palette hex
  readonly secondaryColor: string;  // Accent/flashing palette hex
  readonly baseWeight: number;      // Base probability weight in loot table
  readonly description: string;
}

/**
 * Snapshot of active upgrades and timers on the player
 */
export interface ActiveBuffState {
  rapidFireTimer: number;       // Remaining duration in seconds (0 = inactive)
  scatterShotTimer: number;     // Remaining duration in seconds (0 = inactive)
  engineBoosterTimer: number;   // Remaining duration in seconds (0 = inactive)
  hasShield: boolean;           // True if kinetic shield is active (absorbs 1 hit)
  empBombCount: number;         // Stored EMP charges (if consumable mode enabled)
}

/**
 * Context passed to drop calculations
 */
export interface EnemyDropContext {
  x: number;
  y: number;
  enemyType: EnemyType;
  isDiving: boolean;
  stage: number;
  stageTier: StageTier;
  isChallengingStage: boolean;
}

/**
 * Loot table probability weights
 */
export interface LootTableEntry {
  type: PowerUpType;
  weight: number; // Relative weight (e.g. 30 = 30%)
}

/**
 * Diagnostic statistics for pool and drop monitoring
 */
export interface PowerUpStats {
  totalSpawned: number;
  totalCollected: number;
  totalDespawned: number;
  activeCount: number;
  poolCapacity: number;
}
```

### 3.2 Canonical Configuration Registry

```typescript
export const POWERUP_CONFIGS: Record<PowerUpType, PowerUpConfig> = {
  [PowerUpType.RAPID_FIRE]: {
    type: PowerUpType.RAPID_FIRE,
    name: 'RAPID FIRE',
    duration: 15.0,
    spriteId: 'POWERUP_RAPID',
    primaryColor: '#FF7F00',   // Orange
    secondaryColor: '#FFFF00', // Yellow
    baseWeight: 30,
    description: 'Doubles fire rate and increases on-screen missile quota (Single: 2->4, Dual: 4->6)',
  },
  [PowerUpType.KINETIC_SHIELD]: {
    type: PowerUpType.KINETIC_SHIELD,
    name: 'KINETIC SHIELD',
    duration: 0, // Persists until absorbed by a hit
    spriteId: 'POWERUP_SHIELD',
    primaryColor: '#00FFFF',   // Cyan
    secondaryColor: '#5B93FF', // Light Blue
    baseWeight: 25,
    description: 'Deploys an energy barrier absorbing 1 lethal hit or ship collision',
  },
  [PowerUpType.SCATTER_SHOT]: {
    type: PowerUpType.SCATTER_SHOT,
    name: 'SCATTER SHOT',
    duration: 15.0,
    spriteId: 'POWERUP_SCATTER',
    primaryColor: '#00E700',   // Green
    secondaryColor: '#FFFFFF', // White
    baseWeight: 20,
    description: 'Fires 3-way spread volleys (Single: 3 streams, Dual: twin 3-way / 6 streams)',
  },
  [PowerUpType.ENGINE_BOOSTER]: {
    type: PowerUpType.ENGINE_BOOSTER,
    name: 'ENGINE BOOSTER',
    duration: 15.0,
    spriteId: 'POWERUP_BOOSTER',
    primaryColor: '#5B93FF',   // Light Blue
    secondaryColor: '#00FFFF', // Cyan
    baseWeight: 15,
    description: 'Accelerates lateral thrusters from 260 px/s to 360 px/s with enhanced agility',
  },
  [PowerUpType.EMP_BOMB]: {
    type: PowerUpType.EMP_BOMB,
    name: 'EMP BOMB',
    duration: 0, // Instant screen clear upon collection
    spriteId: 'POWERUP_EMP',
    primaryColor: '#E70000',   // Red
    secondaryColor: '#FFFF00', // Yellow
    baseWeight: 10,
    description: 'Instant tactical EMP shockwave vaporizing enemy bullets and stunning diving craft',
  },
};
```

---

## 4. Detailed Specification: `src/core/powerups/PowerUpItem.ts`

### 4.1 Kinematic Drift Physics & Mathematical Model

When an enemy is destroyed and drops a power-up, the capsule descends vertically while swaying horizontally in an authentic arcade floating trajectory:
1. **Vertical Drift**: Steady downward velocity $vy = 60\text{ px/s}$.
   $$y(t) = y_0 + vy \cdot t$$
2. **Horizontal Sinusoidal Sway**:
   $$x(t) = x_{\text{base}} + A \cdot \sin(\omega \cdot t + \phi)$$
   where:
   - $x_{\text{base}}$: The horizontal origin anchored at the destroyed enemy's $x$ coordinate.
   - Amplitude $A = 12.0\text{ px}$.
   - Angular Frequency $\omega = 3.0\text{ rad/s}$ ($f \approx 0.48\text{ Hz}$, period $\approx 2.1\text{s}$).
   - Initial Phase $\phi$: Randomized upon leasing in $[0, 2\pi)$ to desynchronize simultaneous drops.
3. **Boundary Clamping**:
   $x(t)$ is strictly clamped within $[10, 214]$ to prevent items drifting outside the visible screen.
4. **Despawn on Screen Exit**:
   When $y > 288\text{ px}$ (or $y < -20\text{ px}$ defensively), the item is flagged inactive and returned to the pool via $O(1)$ release.

### 4.2 Hitbox & Collection Geometry

The collection bounding box is an authentic $12 \times 12$ AABB:
$$\text{Hitbox} = \left[ x - 6, \; y - 6, \; 12, \; 12 \right]$$
This allows effortless collection by both Single Fighter ($12 \times 12$ hitbox) and Dual Fighter ($32 \times 12$ hitbox) without requiring pixel-exact overlap.

### 4.3 Implementation Contract

```typescript
/**
 * Galaga Arcade Web Game — Poolable Power-Up Item Entity
 * Location: src/core/powerups/PowerUpItem.ts
 */

import type { Poolable, Rect } from '../../types';
import { PowerUpType, POWERUP_CONFIGS } from './types';
import { SpriteRenderer } from '../../renderer/SpriteRenderer';

export class PowerUpItem implements Poolable {
  // Static Physics Constants
  public static readonly DRIFT_SPEED = 60;        // 60 pixels per second downward
  public static readonly SWAY_AMPLITUDE = 12.0;   // ±12 px horizontal sway
  public static readonly SWAY_FREQUENCY = 3.0;    // 3.0 rad/s (~0.48 Hz)
  public static readonly HITBOX_SIZE = 12;        // 12x12 px bounding box
  public static readonly DESPAWN_Y = 288;         // Screen bottom exit boundary
  public static readonly MIN_X = 10;
  public static readonly MAX_X = 214;

  // Identity & State
  public id: number = 0;
  public active: boolean = false;
  public type: PowerUpType = PowerUpType.RAPID_FIRE;

  // Kinematic Coordinates
  public x: number = 0;
  public y: number = 0;
  public originX: number = 0;
  public swayTimer: number = 0;
  public swayPhase: number = 0;
  public pulseTimer: number = 0;

  constructor(id: number = 0) {
    this.id = id;
    this.reset();
  }

  /**
   * Initializes item upon leasing from ObjectPool<PowerUpItem>.
   */
  public init(x: number, y: number, type: PowerUpType): this {
    this.active = true;
    this.type = type;
    this.originX = Math.max(PowerUpItem.MIN_X, Math.min(PowerUpItem.MAX_X, x));
    this.x = this.originX;
    this.y = y;
    this.swayTimer = 0;
    this.swayPhase = Math.random() * Math.PI * 2; // Randomize oscillation phase
    this.pulseTimer = 0;
    return this;
  }

  /**
   * Resets all properties for zero-allocation pool recycling.
   */
  public reset(): void {
    this.active = false;
    this.type = PowerUpType.RAPID_FIRE;
    this.x = 0;
    this.y = 0;
    this.originX = 0;
    this.swayTimer = 0;
    this.swayPhase = 0;
    this.pulseTimer = 0;
  }

  /**
   * Updates downward drift and horizontal sinusoidal sway.
   * Returns false if item has exited screen boundaries (eligible for recycling).
   */
  public update(dt: number): boolean {
    if (!this.active) return false;

    // 1. Advance timers
    this.swayTimer += dt;
    this.pulseTimer += dt;

    // 2. Downward drift physics
    this.y += PowerUpItem.DRIFT_SPEED * dt;

    // 3. Horizontal sinusoidal sway
    const swayOffset = Math.sin(this.swayTimer * PowerUpItem.SWAY_FREQUENCY + this.swayPhase) * PowerUpItem.SWAY_AMPLITUDE;
    this.x = Math.max(PowerUpItem.MIN_X, Math.min(PowerUpItem.MAX_X, this.originX + swayOffset));

    // 4. Boundary despawn check
    if (this.y > PowerUpItem.DESPAWN_Y || this.y < -30) {
      return false; // Signal out-of-bounds
    }

    return true;
  }

  /**
   * Returns 12x12 Axis-Aligned Bounding Box (AABB) centered at (x, y).
   */
  public getHitbox(): Rect {
    const half = PowerUpItem.HITBOX_SIZE / 2;
    return {
      x: this.x - half,
      y: this.y - half,
      width: PowerUpItem.HITBOX_SIZE,
      height: PowerUpItem.HITBOX_SIZE,
    };
  }

  /**
   * Renders the power-up capsule with procedural arcade pixel art and subtle pulsating aura.
   */
  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;

    const config = POWERUP_CONFIGS[this.type];
    const frameIndex = Math.floor(this.pulseTimer * 6) % 2; // 3Hz animation toggle

    // 1. Draw pre-baked 8x8 matrix via SpriteRenderer
    SpriteRenderer.draw(ctx, config.spriteId, this.x, this.y, {
      frame: frameIndex,
      scale: 1.0,
      anchorX: 0.5,
      anchorY: 0.5,
    });

    // 2. Subtle arcade blinking bracket corners / glow ring
    const alpha = 0.35 + 0.25 * Math.sin(this.pulseTimer * 10);
    ctx.save();
    ctx.strokeStyle = config.primaryColor;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.round(this.x - 5),
      Math.round(this.y - 5),
      10,
      10
    );
    ctx.restore();
  }
}
```

---

## 5. Detailed Specification: `src/core/powerups/PowerUpManager.ts`

### 5.1 Object Pool Invariants

- **Pool Size**: Initial size 32, max capacity 32 (clamped to prevent memory inflation).
- **Zero GC Allocation**: Instantiated once during `Game` boot; items are leased and returned via $O(1)$ pointer operations.
- **Reverse-Safe Iteration**: Traversal in `update()` and `checkCollection()` utilizes `forEachActiveSafe()` so despawning or collected items can be released mid-loop without skipping elements or index corruption.

### 5.2 Drop Probability Formulation

When an enemy is destroyed:
1. **Challenging Stage Check**: If `isChallengingStage === true`, drop chance is strictly **0%**.
2. **Baseline Probability**: $P_{\text{base}} = 0.12$ (12%).
3. **Diving State Multiplier**:
   - If enemy is diving (`DIVING_SOLO`, `DIVING_ESCORT`, `TRACTOR_BEAM_ACTIVE`, or `CAPTURED_HOSTILE`):
     $$P_{\text{dive}} = P_{\text{base}} \times 1.5 = 0.18 \; (18\%)$$
4. **Enemy Hierarchy Multiplier**:
   - **Zako (Tier 1)**: $12\%$ (formation) / $18\%$ (diving)
   - **Goei (Tier 2)**: $15\%$ (formation) / $22.5\%$ (diving)
   - **Boss Galaga**: $30\%$ (formation) / $40\%$ (diving)
   - **Elite / Dreadnought Tier Modifiers**:
     - `ELITE` (Stages 11–25): $+3\%$ drop rate bonus
     - `DREADNOUGHT` (Stages 26–50): $+6\%$ drop rate bonus
5. **Item Selection (Weighted Loot Roll)**:
   When a drop succeeds ($R < P_{\text{drop}}$), a second random roll determines the item based on relative weights:
   - `RAPID_FIRE`: Weight 30 ($30\%$)
   - `KINETIC_SHIELD`: Weight 25 ($25\%$)
   - `SCATTER_SHOT`: Weight 20 ($20\%$)
   - `ENGINE_BOOSTER`: Weight 15 ($15\%$)
   - `EMP_BOMB`: Weight 10 ($10\%$)
   *(Boss Galaga drops weight Shield to 35% and EMP to 20% to reward high-risk takedowns).*

### 5.3 Active Upgrade Timers & State Machine

1. **Timed Buff Duration**:
   `RAPID_FIRE`, `SCATTER_SHOT`, and `ENGINE_BOOSTER` each grant **15.0 seconds** of active enhancement.
2. **Buff Stacking / Refresh Policy**:
   - Collecting the same buff while active refreshes the timer back to 15.0s (or stacks up to a ceiling of 30.0s).
   - Collecting a *different* buff operates concurrently (e.g. Rapid Fire + Scatter Shot + Engine Booster can be active simultaneously for a super-powered ship!).
3. **Kinetic Shield Absorption**:
   - `hasShield = true` until the player takes an incoming hit or enemy collision.
   - When a hit occurs:
     - The shield absorbs the hit completely (no life loss, no dual separation).
     - `hasShield` becomes `false`.
     - 1.0 second of invulnerability is granted to prevent consecutive damage frames.
     - Sound effect `playShieldDeflect()` and visual spark burst are triggered.
4. **EMP Bomb Instant Execution**:
   - When picked up:
     1. Clears all active enemy projectiles via `bulletManager.forEachActiveEnemyBullet(...)`.
     2. Stuns or damages all active diving aliens (`enemy.takeDamage(1)`).
     3. Spawns an expanding particle shockwave ring centered on the player.
     4. Plays procedural explosion / low-frequency EMP rumble.
5. **Player Death & Reset Policy**:
   - When the player is destroyed, all temporary active buffs reset to baseline (`rapidFire = 0, scatter = 0, booster = 0, shield = false`).
   - During Tractor Beam capture, timers pause so player time isn't penalized during cinematic ascension.

### 5.4 Implementation Contract

```typescript
/**
 * Galaga Arcade Web Game — Power-Up Subsystem Coordinator
 * Location: src/core/powerups/PowerUpManager.ts
 */

import { ObjectPool } from '../ObjectPool';
import { PowerUpItem } from './PowerUpItem';
import {
  PowerUpType,
  POWERUP_CONFIGS,
  type ActiveBuffState,
  type PowerUpStats,
} from './types';
import type { Game } from '../Game';
import type { Player } from '../../entities/Player';
import { EnemyType, EnemyState, type Rect } from '../../types';
import { DifficultyCalculator } from '../../systems/DifficultyCalculator';

export interface PowerUpManagerOptions {
  game?: Game;
  dropRateBaseline?: number; // Default: 0.12 (12%)
}

export class PowerUpManager {
  public static readonly POOL_CAPACITY = 32;
  public static readonly BASELINE_DROP_RATE = 0.12; // 12%
  public static readonly DEFAULT_BUFF_DURATION = 15.0; // 15 seconds
  public static readonly MAX_BUFF_DURATION = 30.0; // 30 seconds clamp

  private game: Game | null = null;
  private pool: ObjectPool<PowerUpItem>;
  private nextItemId: number = 1;

  // Active Upgrade Buff State
  public buffState: ActiveBuffState = {
    rapidFireTimer: 0,
    scatterShotTimer: 0,
    engineBoosterTimer: 0,
    hasShield: false,
    empBombCount: 0,
  };

  // Metrics
  private stats: PowerUpStats = {
    totalSpawned: 0,
    totalCollected: 0,
    totalDespawned: 0,
    activeCount: 0,
    poolCapacity: PowerUpManager.POOL_CAPACITY,
  };

  constructor(options: PowerUpManagerOptions = {}) {
    this.game = options.game ?? null;

    // Initialize Zero-Allocation Pool
    this.pool = new ObjectPool<PowerUpItem>({
      factory: () => new PowerUpItem(this.nextItemId++),
      reset: (item: PowerUpItem) => item.reset(),
      initialSize: PowerUpManager.POOL_CAPACITY,
      maxSize: PowerUpManager.POOL_CAPACITY,
      autoExpand: false, // Strict upper bound to prevent runaway allocations
    });
  }

  public setGame(game: Game): void {
    this.game = game;
  }

  // ==========================================================================
  // Drop Rate Evaluation & Spawning
  // ==========================================================================

  /**
   * Evaluates drop roll upon enemy death and spawns a PowerUpItem if successful.
   */
  public tryDropEnemyKill(
    x: number,
    y: number,
    enemyType: EnemyType,
    isDiving: boolean,
    stage: number
  ): PowerUpItem | null {
    // 1. Challenging Stages never drop items (preserves pure bonus scoring)
    if (DifficultyCalculator.isChallengingStage(stage)) {
      return null;
    }

    // 2. Compute drop probability
    let dropChance = PowerUpManager.BASELINE_DROP_RATE;

    // Diving bonus (1.5x)
    if (isDiving) {
      dropChance *= 1.5;
    }

    // Enemy Type Modifiers
    if (enemyType === EnemyType.BOSS) {
      dropChance = isDiving ? 0.40 : 0.30;
    } else if (enemyType === EnemyType.GOEI) {
      dropChance += 0.03;
    }

    // Stage Tier Modifiers
    const tier = DifficultyCalculator.getStageTier(stage);
    if (tier === 'ELITE') {
      dropChance += 0.03;
    } else if (tier === 'DREADNOUGHT') {
      dropChance += 0.06;
    }

    // 3. Roll drop threshold
    if (Math.random() >= dropChance) {
      return null;
    }

    // 4. Select power-up type from weighted loot table
    const type = this.rollLootType(enemyType);

    // 5. Spawn from pool
    return this.spawnPowerUp(x, y, type);
  }

  /**
   * Selects power-up type using weighted lottery.
   */
  private rollLootType(enemyType: EnemyType): PowerUpType {
    let weights: Record<PowerUpType, number>;

    if (enemyType === EnemyType.BOSS) {
      // Bosses prioritize Kinetic Shield and EMP
      weights = {
        [PowerUpType.KINETIC_SHIELD]: 35,
        [PowerUpType.EMP_BOMB]: 20,
        [PowerUpType.RAPID_FIRE]: 20,
        [PowerUpType.SCATTER_SHOT]: 15,
        [PowerUpType.ENGINE_BOOSTER]: 10,
      };
    } else {
      weights = {
        [PowerUpType.RAPID_FIRE]: 30,
        [PowerUpType.KINETIC_SHIELD]: 25,
        [PowerUpType.SCATTER_SHOT]: 20,
        [PowerUpType.ENGINE_BOOSTER]: 15,
        [PowerUpType.EMP_BOMB]: 10,
      };
    }

    let totalWeight = 0;
    for (const key in weights) {
      totalWeight += weights[key as PowerUpType];
    }

    let roll = Math.random() * totalWeight;
    for (const key in weights) {
      const type = key as PowerUpType;
      roll -= weights[type];
      if (roll <= 0) {
        return type;
      }
    }

    return PowerUpType.RAPID_FIRE;
  }

  /**
   * Spawns a specific power-up entity at (x, y).
   */
  public spawnPowerUp(x: number, y: number, type: PowerUpType): PowerUpItem | null {
    const item = this.pool.acquire();
    if (!item) {
      return null; // Pool full
    }

    item.init(x, y, type);
    this.stats.totalSpawned++;
    return item;
  }

  // ==========================================================================
  // Update Loop & Active Buff Timers
  // ==========================================================================

  /**
   * Updates falling items and decrements active buff countdown timers.
   */
  public update(dt: number, player?: Player): void {
    // 1. Update falling items
    this.pool.forEachActiveSafe((item) => {
      const alive = item.update(dt);
      if (!alive) {
        this.pool.release(item);
        this.stats.totalDespawned++;
      }
    });

    this.stats.activeCount = this.pool.getActiveCount();

    // 2. Decrement active buff timers (unless player is in capture sequence)
    const isPaused = player && (player.state === 'capturing' || player.state === 'CAPTURING');
    if (!isPaused) {
      if (this.buffState.rapidFireTimer > 0) {
        this.buffState.rapidFireTimer = Math.max(0, this.buffState.rapidFireTimer - dt);
      }
      if (this.buffState.scatterShotTimer > 0) {
        this.buffState.scatterShotTimer = Math.max(0, this.buffState.scatterShotTimer - dt);
      }
      if (this.buffState.engineBoosterTimer > 0) {
        this.buffState.engineBoosterTimer = Math.max(0, this.buffState.engineBoosterTimer - dt);
      }
    }
  }

  // ==========================================================================
  // Collision & Collection Detection
  // ==========================================================================

  /**
   * Tests active power-up items against player ship hitbox.
   * Invoked within Game.resolveCollisions().
   */
  public checkPlayerCollection(
    player: Player,
    onCollected?: (type: PowerUpType) => void
  ): void {
    if (!player || player.isInvulnerable()) {
      // Player is dead or respawning
      const s = player?.state;
      if (s !== 'normal' && s !== 'ALIVE' && s !== 'dual' && s !== 'DUAL' && s !== 'docking' && s !== 'DOCKING') {
        return;
      }
    }

    const playerBox = player.getHitbox();

    this.pool.forEachActiveSafe((item) => {
      if (!item.active) return;

      const itemBox = item.getHitbox();
      if (this.checkAABB(itemBox, playerBox)) {
        // Collect item
        this.applyPowerUp(item.type, player);
        this.stats.totalCollected++;
        onCollected?.(item.type);
        this.pool.release(item);
      }
    });
  }

  /**
   * Applies upgrade effects to active buff state and player.
   */
  public applyPowerUp(type: PowerUpType, player: Player): void {
    switch (type) {
      case PowerUpType.RAPID_FIRE:
        this.buffState.rapidFireTimer = Math.min(
          PowerUpManager.MAX_BUFF_DURATION,
          this.buffState.rapidFireTimer + PowerUpManager.DEFAULT_BUFF_DURATION
        );
        break;

      case PowerUpType.KINETIC_SHIELD:
        this.buffState.hasShield = true;
        break;

      case PowerUpType.SCATTER_SHOT:
        this.buffState.scatterShotTimer = Math.min(
          PowerUpManager.MAX_BUFF_DURATION,
          this.buffState.scatterShotTimer + PowerUpManager.DEFAULT_BUFF_DURATION
        );
        break;

      case PowerUpType.ENGINE_BOOSTER:
        this.buffState.engineBoosterTimer = Math.min(
          PowerUpManager.MAX_BUFF_DURATION,
          this.buffState.engineBoosterTimer + PowerUpManager.DEFAULT_BUFF_DURATION
        );
        break;

      case PowerUpType.EMP_BOMB:
        this.detonateEmpBomb();
        break;
    }

    // Award collection score & trigger audio/visuals
    if (this.game) {
      this.game.scoreManager.addScore(500); // 500 bonus points
      this.game.particleSystem.spawnHitSparks(player.x, player.y);
      this.game.soundSynth.playLaserDual(); // Or dedicated pickup sound
    }
  }

  /**
   * Executes immediate EMP screen-wipe shockwave:
   * 1. Vaporizes all active enemy projectiles.
   * 2. Damages / stuns diving enemies.
   * 3. Triggers radial particle shockwave.
   */
  public detonateEmpBomb(): void {
    if (!this.game) return;

    // 1. Recycle all active enemy bullets
    this.game.bulletManager.forEachActiveEnemyBullet((bullet) => {
      this.game?.particleSystem.spawnHitSparks(bullet.position.x, bullet.position.y);
      this.game?.bulletManager.recycle(bullet);
    });

    // 2. Damage or stun diving enemies
    for (const enemy of this.game.formationManager.enemies) {
      if (
        enemy.active &&
        (enemy.state === EnemyState.DIVING_SOLO ||
          enemy.state === EnemyState.DIVING_ESCORT ||
          enemy.state === EnemyState.TRACTOR_BEAM_ACTIVE ||
          enemy.state === EnemyState.CAPTURED_HOSTILE)
      ) {
        enemy.takeDamage(1);
      }
    }

    // 3. Screen shockwave particle burst
    this.game.particleSystem.spawnPlayerExplosion(Game.VIRTUAL_WIDTH / 2, Game.VIRTUAL_HEIGHT / 2);
    this.game.soundSynth.playExplosion('large');
  }

  // ==========================================================================
  // Render & Lifecycle
  // ==========================================================================

  public render(ctx: CanvasRenderingContext2D): void {
    this.pool.forEachActive((item) => {
      item.render(ctx);
    });
  }

  /**
   * Resets active buffs and clears all falling items.
   */
  public reset(): void {
    this.pool.clear();
    this.buffState = {
      rapidFireTimer: 0,
      scatterShotTimer: 0,
      engineBoosterTimer: 0,
      hasShield: false,
      empBombCount: 0,
    };
  }

  /**
   * Clears temporary buffs upon player loss of life.
   */
  public onPlayerDeath(): void {
    this.buffState.rapidFireTimer = 0;
    this.buffState.scatterShotTimer = 0;
    this.buffState.engineBoosterTimer = 0;
    this.buffState.hasShield = false;
  }

  public getStats(): PowerUpStats {
    return { ...this.stats, activeCount: this.pool.getActiveCount() };
  }

  public getPool(): ObjectPool<PowerUpItem> {
    return this.pool;
  }

  private checkAABB(a: Rect, b: Rect): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }
}
```

---

## 6. Procedural Pixel Art & SpriteRenderer Registration

In accordance with the 100% procedural zero-external-asset mandate, all 5 power-up icons and the kinetic shield aura are registered in `src/renderer/SpriteRenderer.ts`:

```typescript
// ============================================================================
// 8x8 Procedural Power-Up Pixel Matrices (Arcade Palette)
// ============================================================================

// 1. Rapid Fire (Orange Bolt / Overclock)
export const POWERUP_RAPID_FRAME_0: string[][] = [
  ['.','.','.','Y','Y','.','.','.'],
  ['.','.','Y','O','O','Y','.','.'],
  ['.','Y','O','O','.','.','.','.'],
  ['Y','Y','Y','Y','Y','Y','Y','.'],
  ['.','.','.','O','O','Y','.','.'],
  ['.','.','Y','O','O','Y','.','.'],
  ['.','.','Y','O','Y','.','.','.'],
  ['.','.','.','Y','.','.','.','.']
];
export const POWERUP_RAPID_FRAME_1: string[][] = [
  ['.','.','.','W','W','.','.','.'],
  ['.','.','W','Y','Y','W','.','.'],
  ['.','W','Y','Y','.','.','.','.'],
  ['W','W','W','W','W','W','W','.'],
  ['.','.','.','Y','Y','W','.','.'],
  ['.','.','W','Y','Y','W','.','.'],
  ['.','.','W','Y','W','.','.','.'],
  ['.','.','.','W','.','.','.','.']
];

// 2. Kinetic Shield (Cyan Hexagonal Barrier)
export const POWERUP_SHIELD_FRAME_0: string[][] = [
  ['.','.','C','C','C','C','.','.'],
  ['.','C','W','B','B','W','C','.'],
  ['C','W','B','B','B','B','W','C'],
  ['C','B','B','C','C','B','B','C'],
  ['C','B','B','C','C','B','B','C'],
  ['C','W','B','B','B','B','W','C'],
  ['.','C','W','B','B','W','C','.'],
  ['.','.','C','C','C','C','.','.']
];
export const POWERUP_SHIELD_FRAME_1: string[][] = [
  ['.','.','W','W','W','W','.','.'],
  ['.','W','C','C','C','C','W','.'],
  ['W','C','C','W','W','C','C','W'],
  ['W','C','W','C','C','W','C','W'],
  ['W','C','W','C','C','W','C','W'],
  ['W','C','C','W','W','C','C','W'],
  ['.','W','C','C','C','C','W','.'],
  ['.','.','W','W','W','W','.','.']
];

// 3. Scatter Shot (Green 3-Way Divergent Lasers)
export const POWERUP_SCATTER_FRAME_0: string[][] = [
  ['G','.','.','G','.','.','G','.'],
  ['.','G','.','G','.','G','.','.'],
  ['.','G','.','G','.','G','.','.'],
  ['.','.','W','G','W','.','.','.'],
  ['.','.','W','G','W','.','.','.'],
  ['.','.','G','G','G','.','.','.'],
  ['.','.','G','G','G','.','.','.'],
  ['.','.','.','G','.','.','.','.']
];
export const POWERUP_SCATTER_FRAME_1: string[][] = [
  ['W','.','.','W','.','.','W','.'],
  ['.','W','.','W','.','W','.','.'],
  ['.','W','.','W','.','W','.','.'],
  ['.','.','G','W','G','.','.','.'],
  ['.','.','G','W','G','.','.','.'],
  ['.','.','W','W','W','.','.','.'],
  ['.','.','W','W','W','.','.','.'],
  ['.','.','.','W','.','.','.','.']
];

// 4. Engine Booster (Blue Thruster Turbine)
export const POWERUP_BOOSTER_FRAME_0: string[][] = [
  ['.','.','.','W','.','.','.','.'],
  ['.','.','W','B','W','.','.','.'],
  ['.','W','B','C','B','W','.','.'],
  ['W','B','C','C','C','B','W','.'],
  ['.','W','C','Y','C','W','.','.'],
  ['.','.','C','Y','C','.','.','.'],
  ['.','C','Y','R','Y','C','.','.'],
  ['.','.','R','.','R','.','.','.']
];
export const POWERUP_BOOSTER_FRAME_1: string[][] = [
  ['.','.','.','C','.','.','.','.'],
  ['.','.','C','W','C','.','.','.'],
  ['.','C','W','C','W','C','.','.'],
  ['C','W','C','W','C','W','C','.'],
  ['.','C','W','Y','W','C','.','.'],
  ['.','.','W','Y','W','.','.','.'],
  ['.','W','Y','O','Y','W','.','.'],
  ['.','.','O','.','O','.','.','.']
];

// 5. EMP Bomb (Nuclear Spark Capsule)
export const POWERUP_EMP_FRAME_0: string[][] = [
  ['.','.','R','R','R','R','.','.'],
  ['.','R','Y','Y','Y','Y','R','.'],
  ['R','Y','W','R','R','W','Y','R'],
  ['R','Y','R','W','W','R','Y','R'],
  ['R','Y','R','W','W','R','Y','R'],
  ['R','Y','W','R','R','W','Y','R'],
  ['.','R','Y','Y','Y','Y','R','.'],
  ['.','.','R','R','R','R','.','.']
];
export const POWERUP_EMP_FRAME_1: string[][] = [
  ['.','.','Y','Y','Y','Y','.','.'],
  ['.','Y','W','W','W','W','Y','.'],
  ['Y','W','R','Y','Y','R','W','Y'],
  ['Y','W','Y','R','R','Y','W','Y'],
  ['Y','W','Y','R','R','Y','W','Y'],
  ['Y','W','R','Y','Y','R','W','Y'],
  ['.','Y','W','W','W','W','Y','.'],
  ['.','.','Y','Y','Y','Y','.','.']
];
```

Registration during `SpriteRenderer.initialize()`:
```typescript
SpriteRenderer.registerDefinition({
  id: 'POWERUP_RAPID',
  width: 8,
  height: 8,
  frames: [POWERUP_RAPID_FRAME_0, POWERUP_RAPID_FRAME_1]
});
SpriteRenderer.registerDefinition({
  id: 'POWERUP_SHIELD',
  width: 8,
  height: 8,
  frames: [POWERUP_SHIELD_FRAME_0, POWERUP_SHIELD_FRAME_1]
});
SpriteRenderer.registerDefinition({
  id: 'POWERUP_SCATTER',
  width: 8,
  height: 8,
  frames: [POWERUP_SCATTER_FRAME_0, POWERUP_SCATTER_FRAME_1]
});
SpriteRenderer.registerDefinition({
  id: 'POWERUP_BOOSTER',
  width: 8,
  height: 8,
  frames: [POWERUP_BOOSTER_FRAME_0, POWERUP_BOOSTER_FRAME_1]
});
SpriteRenderer.registerDefinition({
  id: 'POWERUP_EMP',
  width: 8,
  height: 8,
  frames: [POWERUP_EMP_FRAME_0, POWERUP_EMP_FRAME_1]
});
```

---

## 7. Engine Integration Architecture (`src/core/Game.ts`)

### 7.1 Class Member & Constructor Hook

In `src/core/Game.ts`:
```typescript
import { PowerUpManager } from './powerups/PowerUpManager';

export class Game implements IGameEngine {
  // Subsystem instances
  public powerUpManager: PowerUpManager;

  constructor(options?: GameOptions) {
    // ... existing initializations ...
    this.powerUpManager = new PowerUpManager({ game: this });
  }
```

### 7.2 Update Loop Hook

In `Game.update(dt)`:
```typescript
  // Update projectiles
  this.bulletManager.update(dt);
  this.player.activeMissileCount = this.bulletManager.getPlayerBulletCount();

  // [NEW M11] Update falling power-ups and active buff timers
  this.powerUpManager.update(dt, this.player);
```

### 7.3 Collision Pipeline Hook (`Game.resolveCollisions()`)

1. **Enemy Destruction Drop Roll**:
```typescript
  // In Game.resolveCollisions():
  // Inside Bullet vs Enemy loop when damageResult.destroyed === true:
  if (damageResult.destroyed) {
    // Drop roll hook
    const isDiving =
      enemy.state === EnemyState.DIVING_SOLO ||
      enemy.state === EnemyState.DIVING_ESCORT ||
      enemy.state === EnemyState.TRACTOR_BEAM_ACTIVE ||
      enemy.state === EnemyState.CAPTURED_HOSTILE;

    this.powerUpManager.tryDropEnemyKill(
      enemy.x,
      enemy.y,
      enemy.type,
      isDiving,
      this.stage
    );
  }
```

2. **Player Collection Hit Testing**:
```typescript
  // In Game.resolveCollisions():
  // [NEW M11] Resolve Power-Up Collection vs Player
  this.powerUpManager.checkPlayerCollection(this.player, (type) => {
    // Optional telemetry or HUD flash
  });
```

### 7.4 Rendering Pipeline Hook

In `Game.renderPlayingScreen(ctx)`:
```typescript
  // 1. Render Formation Grid & Diving Enemies
  this.formationManager.render(ctx);

  // 2. Render Tractor Beam Energy Cone
  this.tractorBeam.render(ctx);

  // 2.5 [NEW M11] Render Collectible Power-Up Capsules
  this.powerUpManager.render(ctx);

  // 3. Render Active Projectiles
  this.bulletManager.render(ctx);

  // 4. Render Particle Explosions & Sparkles
  this.particleSystem.render(ctx);

  // 5. Render Player Ship & Kinetic Shield Aura
  this.player.render(ctx);
  if (this.powerUpManager.buffState.hasShield) {
    SpriteRenderer.drawShieldAura(
      ctx,
      this.player.x,
      this.player.y,
      this.player.isDual ? 24 : 14
    );
  }
```

### 7.5 State Machine & Lifecycle Hooks

- `startGame()` / `resetGame()`:
  `this.powerUpManager.reset();`
- Player Death (`player.destroy()`):
  `this.powerUpManager.onPlayerDeath();`
- Stage Clear (`STAGE_CLEAR`):
  Active buffs persist between stages to reward skillful play! Falling uncollected items are cleared upon advancing to the next stage intro.

---

## 8. Integration Contracts with Peer Systems

### 8.1 `Player.ts` Integration (Coordinated with `m11_explorer_2`)

1. **Kinetic Shield Absorption in `hitTestAndDamage(threat: Rect)`**:
   ```typescript
   if (this.powerUpManager?.buffState.hasShield) {
     this.powerUpManager.buffState.hasShield = false;
     this.invulnerableTimer = 1.0; // 1 second mercy invulnerability
     this.soundSynth.playShieldDeflect();
     this.particleSystem.spawnHitSparks(this.x, this.y);
     return false; // Fatal blow absorbed!
   }
   ```
2. **Rapid Fire in `attemptFire()` and `canFire`**:
   - Halves `fireCooldownTimer` from $120\text{ms}$ to $60\text{ms}$.
   - Expands on-screen quota: Single Fighter ($2 \to 4$), Dual Fighter ($4 \to 6$ or $8$).
3. **Scatter Shot in `attemptFire()`**:
   - Single Fighter fires 3 missiles: Center ($0^\circ$), Left ($-15^\circ$), Right ($+15^\circ$).
   - Dual Fighter fires twin 3-way spreads (6 simultaneous missiles).
4. **Engine Booster in `updateControllable()`**:
   - Movement speed scales from $260\text{ px/s}$ to $360\text{ px/s}$.

### 8.2 Runtime Cheat Controller API (`window.__GALAGA_CHEAT__`)

In Milestone 13, the automated test bot and debug cheats rely on programmatic control:
```typescript
window.__GALAGA_CHEAT__.spawnPowerUp = (type: PowerUpType) => {
  game.powerUpManager.spawnPowerUp(game.player.x, 100, type);
};

window.__GALAGA_CHEAT__.getBuffState = () => {
  return { ...game.powerUpManager.buffState };
};

window.__GALAGA_CHEAT__.getPowerUpPoolStats = () => {
  return game.powerUpManager.getStats();
};
```

---

## 9. Verification & Test Plan

1. **Pool Zero-Allocation Unit Tests (`powerup_pool.test.ts`)**:
   - Verify initial size is 32.
   - Verify acquiring 32 items does not throw.
   - Verify acquiring the 33rd item returns `null` safely without heap expansion.
   - Verify $O(1)$ release restores available free count without reallocating arrays.
2. **Kinematic Drift & Despawn Tests (`powerup_physics.test.ts`)**:
   - Verify vertical translation matches $vy = 60\text{ px/s} \times dt$.
   - Verify horizontal coordinate follows sinusoidal bounds ($|x - x_0| \le 12$).
   - Verify item is automatically recycled when $y > 288$.
3. **Drop Table & Probability Tests (`powerup_drop.test.ts`)**:
   - Run 10,000 simulated kills to verify:
     - Challenging stage drop rate is strictly 0.0%.
     - Baseline kill rate converges to $12\% \pm 1\%$.
     - Diving kill rate converges to $18\% \pm 1\%$.
     - Boss Galaga kill rate converges to $30\text{--}40\%$.
4. **Collection & Buff Lifecycle Tests (`powerup_manager.test.ts`)**:
   - Verify AABB intersection between player and item triggers collection.
   - Verify 500 points awarded.
   - Verify buff timer is set to 15.0s and decrements each frame.
   - Verify Kinetic Shield absorbs hit and resets `hasShield` to false.
   - Verify EMP Bomb clears all enemy bullets on screen.

---

## 10. Conclusion

This architecture delivers a robust, authentic, zero-allocation power-up subsystem satisfying all criteria of R3 and M11. Implementers can immediately proceed to code generation adhering to these exact contracts.
