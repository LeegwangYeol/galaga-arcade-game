# Milestone M31 Architecture Exploration Report: Projectile Allocation, Scoring Attribution & Subsystem Isolation

**Agent Identity**: `m31_explorer_2`  
**Milestone**: M31 (Multi-Entity Player Architecture & Independent State Engine)  
**Parent Conversation ID**: `0236827c-a7d2-4115-a374-2f5c45ed8134`  
**Scope**: Projectile pooling (`Bullet.ts`, `ObjectPool.ts`), player attribution (`ownerId?: 'p1' | 'p2' | 'enemy' | 'drone'`), scoring attribution (`ScoreManager.ts`), and subsystem state isolation/coordination (`PowerUpManager.ts`, `SpecialMovesManager.ts`, `AlliesManager.ts`).

---

## 1. Observation

### 1.1 `Bullet.ts` and `ObjectPool.ts` Projectile Architecture
- **ObjectPool Configuration** (`src/entities/Bullet.ts:261–267`):
  ```ts
  this.bulletPool = new ObjectPool<Bullet>({
    factory: () => new Bullet(this.nextBulletId++),
    reset: (b: Bullet) => b.reset(),
    initialSize: BULLET_CONFIG.POOL_INITIAL_SIZE, // 32
    maxSize: BULLET_CONFIG.POOL_MAX_SIZE,       // 256
    autoExpand: true,
  });
  ```
- **Bullet Entity Fields** (`src/entities/Bullet.ts:58–73`):
  - `public owner: BulletOwner | 'DRONE' = 'PLAYER';`
  - `public type: BulletType = 'PLAYER_MISSILE';`
  - `public active: boolean = false;`
  - `reset()` (`Bullet.ts:82–97`) resets `owner = 'PLAYER'`, `type = 'PLAYER_MISSILE'`, `active = false`.
  - `init()` (`Bullet.ts:102–133`) accepts `owner: BulletOwner | 'DRONE'` and sets velocities and dimensions.
  - Notice: `Bullet` currently has **no entity identifier** distinguishing Player 1 from Player 2.
- **BulletManager Active Counters** (`src/entities/Bullet.ts:245–249`):
  ```ts
  private activePlayerBulletCount: number = 0;
  private activeDroneBulletCount: number = 0;
  private activeEnemyBulletCount: number = 0;
  ```
- **Quota Check & Firing** (`src/entities/Bullet.ts:313–338`):
  ```ts
  public firePlayerBullet(x, y, isDual = false, speed = 480, vx = 0, vy?, maxQuota?): Bullet | null {
    const quota = maxQuota !== undefined ? maxQuota : this.getPlayerMaxQuota(isDual);
    if (this.activePlayerBulletCount >= quota) {
      return null;
    }
    const bullet = this.bulletPool.acquire();
    if (!bullet) return null;
    bullet.init(x, y, vx, actualVy, 'PLAYER', 'PLAYER_MISSILE');
    this.activePlayerBulletCount++;
    ...
  }
  ```
- **Recycling** (`src/entities/Bullet.ts:522–540`):
  ```ts
  public recycle(bullet: Bullet): boolean {
    if (!bullet.active) return false;
    if (bullet.owner === 'PLAYER') {
      this.activePlayerBulletCount = Math.max(0, this.activePlayerBulletCount - 1);
    } else if ((bullet.owner as string) === 'DRONE') {
      this.activeDroneBulletCount = Math.max(0, this.activeDroneBulletCount - 1);
    } else {
      this.activeEnemyBulletCount = Math.max(0, this.activeEnemyBulletCount - 1);
    }
    bullet.active = false;
    return this.bulletPool.release(bullet);
  }
  ```

### 1.2 `ScoreManager.ts` State Management
- **State Storage** (`src/systems/ScoreManager.ts:90–98`):
  - `private _score: number = 0;`
  - `private _highScore: number = SCORE_MATRIX.DEFAULT_HIGH_SCORE;` (20,000)
  - `private _lives: number = SCORE_MATRIX.INITIAL_LIVES;` (3)
  - `private _shotsFired: number = 0;`
  - `private _shotsHit: number = 0;`
- **Scoring and Extends** (`src/systems/ScoreManager.ts:244–287`):
  - `addScore(points: number): ScoreEventPayload` increments `_score`, awards extra lives at 20k, 70k, +70k intervals, updates `_highScore`, and emits `_onScoreChangedCallback`.
  - Notice: All score mutations and telemetry counters are currently stored as single scalar values without player ID discrimination.

### 1.3 `PowerUpManager.ts` Buff Tracking & Collection
- **Singleton Buff State** (`src/core/powerups/PowerUpManager.ts:35–48`):
  ```ts
  public buffState: ActiveBuffState = {
    rapidFireTimer: 0, scatterShotTimer: 0, engineBoosterTimer: 0,
    hasShield: false, empBombCount: 0, chronoFieldTimer: 0,
    reflectionShieldTimer: 0, hasReflectionShield: false,
    empCollectorTimer: 0, phaseDriveTimer: 0, plasmaBlasterTimer: 0,
  };
  ```
- **Direct Property Testing in Existing Suites**:
  - `tests/unit/adversarial_m13_drones.test.ts:249`, `tests/unit/powerups_m19.test.ts:395`, `tests/unit/m19_challenger_1_adversarial.test.ts:211` directly read and mutate `game.powerUpManager.buffState.hasShield`, `manager.buffState.rapidFireTimer`, etc.
- **Collection Detection** (`src/core/powerups/PowerUpManager.ts:382–415`):
  ```ts
  public checkPlayerCollection(player: Player, onCollected?: (type: PowerUpType) => void): void {
    ...
    if (this.checkAABB(itemBox, playerBox)) {
      this.applyPowerUp(item.type, player);
      ...
    }
  }
  ```
- **Buff Application** (`src/core/powerups/PowerUpManager.ts:420–518`):
  - `applyPowerUp(type: PowerUpType, player: Player)` directly sets both `this.buffState.<prop>` AND `player.<prop>`.
  - `EMP_BOMB` calls `detonateEmpBomb()`: clears all enemy bullets and deals 2 damage to diving enemies (`PowerUpManager.ts:534–545`).
  - `EMP_COLLECTOR` absorbs bullets within 90px of player (`PowerUpManager.ts:359–370`).

### 1.4 `SpecialMovesManager.ts` Energy & Execution
- **Gauge & Pools** (`src/core/specials/SpecialMovesManager.ts:36–60`):
  - `public energy: number = 0;` (0..100)
  - `private missilePool: ObjectPool<NovaMissile>` (initial: 32, max: 32, autoExpand: false)
  - `private sparkPool: ObjectPool<EnergySpark>` (initial: 32, max: 32, autoExpand: false)
- **Execution**:
  - `executeNovaBarrage()` (`SpecialMovesManager.ts:183–235`): Fires 16 missiles from `player.x`, `player.y`.
  - `executeChronoFreeze()` (`SpecialMovesManager.ts:239–253`): Sets `chronoFreezeTimer = 3.0` seconds (`enemyDt = 0`).
  - `executeWarpRam()` (`SpecialMovesManager.ts:268–293`): Sets `player.isWarpRamActive = true`, gives player 1.5s invulnerability, ascends at 800 px/s.
- **Energy Spark** (`src/core/specials/pools/EnergySpark.ts:71–97`):
  - In `update(dt, player?: Player | null)`: If distance $\le 42\text{px}$, accelerates magnetically toward player position.

### 1.5 `AlliesManager.ts` Drone Support
- **Singletons** (`src/core/allies/AlliesManager.ts:34–37`):
  - `public escortDrone: EscortDrone;` (autofires forward plasma bolts)
  - `public aegisDrone: AegisDrone;` (emits repair pulses to restore shield)
  - `public bomberDrone: BomberDrone;` (sweeps top screen, drops cluster bombs)
- **Munitions Pools** (`AlliesManager.ts:58–72`):
  - `bombPool: ObjectPool<ClusterBomb>` (initial: 16, max: 16, autoExpand: false)
  - `explosionPool: ObjectPool<BombExplosion>` (initial: 16, max: 16, autoExpand: false)

### 1.6 Collision Resolution in `Game.ts`
- **Hit Detection** (`src/core/Game.ts:1138–1280`):
  - Iterates `this.bulletManager.forEachActivePlayerBullet((bullet) => ...)`
  - When bullet hits enemy:
    - `this.bulletManager.recycle(bullet)`
    - `this.scoreManager.recordShotHit(1)`
    - `this.scoreManager.addScore(...)` / `addScoreForEnemy(...)`
    - `this.specialMovesManager.addEnergy(...)`
  - All credit currently flows to global singletons without identifying which player fired `bullet`.

---

## 2. Logic Chain

1. **Quota Starvation Vulnerability**:
   - In `BulletManager`, player missiles are gated by `this.activePlayerBulletCount < quota` (`Bullet.ts:323`).
   - In 2-Player mode, if P1 fires 2 standard missiles, `activePlayerBulletCount` becomes 2.
   - If `activePlayerBulletCount` is shared, P2 is immediately blocked from firing (`canPlayerFire()` returns false), causing input starvation and broken co-op gameplay.
   - **Deduction**: Projectile allocation quotas MUST be partitioned per player entity (`activeP1BulletCount` and `activeP2BulletCount`).

2. **Attribution Disambiguation**:
   - When a player projectile hits an enemy (`Game.ts:1155`), `ScoreManager` awards points and `SpecialMovesManager` charges energy.
   - Without tagging the projectile with its source player ID (`ownerId: 'p1' | 'p2'`), the engine cannot credit score or special meter to the player who actually aimed and shot the enemy.
   - **Deduction**: `Bullet` must carry `ownerId: 'p1' | 'p2' | 'enemy' | 'drone'`. When recycling or resolving hits, `ownerId` directs score and energy credit to the corresponding player.

3. **Zero-GC & Memory Invariants**:
   - `bulletPool` currently has `initialSize: 32`, `maxSize: 256`, and `autoExpand: true`.
   - Max simultaneous missiles in co-op: P1 (max 8) + P2 (max 8) + Drone bolts (max 16) + Enemy barrage ($\approx 60$) = $\approx 92 \ll 256$.
   - Adding `public ownerId: 'p1' | 'p2' | 'enemy' | 'drone' = 'p1'` to `Bullet` adds zero heap allocations during the game loop.
   - `Bullet.reset()` reinitializes `ownerId = 'p1'`.
   - **Deduction**: Zero-GC invariants and existing pool bounds ($\le 256$) remain 100% intact without increasing pool capacity.

4. **1P Backward Compatibility & Existing Test Safety**:
   - Over 1,930 unit tests expect `bullet.owner === 'PLAYER'`, `scoreManager.score`, `scoreManager.lives`, and `powerUpManager.buffState`.
   - If `bullet.owner` were changed from `'PLAYER'` to `'P1'`, existing code that checks `bullet.owner === 'PLAYER'` (`Bullet.ts:213`, `Game.ts:1138`, `TheUnbiddenEvent.ts:72`) would fail.
   - **Deduction**: Keep `bullet.owner: BulletOwner` as `'PLAYER' | 'ENEMY' | 'DRONE'` for broad category checks, and add `bullet.ownerId: 'p1' | 'p2' | 'enemy' | 'drone'` for specific entity attribution. Default all single-player calls to `'p1'`.

5. **Subsystem Isolation vs Coordination Matrix**:
   - **Power-Ups**:
     - *Isolated*: Rapid Fire, Kinetic Shield, Scatter Shot, Engine Booster, Reflection Shield, Phase Drive, Antimatter Plasma Blaster apply to the individual player who touches the item.
     - *Shared*: EMP Bomb wipes screen bullets (protects both); Chrono Field creates a localized slow zone (protects nearby ally); EMP Collector absorbs bullets within 90px of collector.
     - *State Structure*: Maintain `powerUpManager.buffState` for P1 (preserving all 40+ existing tests), and add `powerUpManager.p2BuffState` for P2.
   - **Special Moves**:
     - *Isolated*: P1 and P2 have independent energy meters (0..100), separate triggers (Key `X` vs Key `M`/`Shift`), and separate HUD gauges.
     - *Nova Barrage*: 16 missiles spawn from the executing player; capped pool of 32 allows both players to fire without pool starvation.
     - *Chrono Freeze*: 3-second absolute time stop benefits both players.
     - *Warp Ram*: Executing player charges upward with invulnerability; the other player remains active in their normal position.
     - *Energy Sparks*: Funnel magnetically toward the *closest* alive player; reward energy to the collector.
   - **Allies Support**:
     - Escort Drone orbits leader / primary player.
     - Aegis Drone monitors both players, prioritizing the unshielded player for shield repair pulses.
     - Bomber Drone sweeps the top formation, benefiting both players.

---

## 3. Caveats

1. **Single-Player Test Invariance**:
   Existing tests instantiate `Game`, `Player`, `BulletManager`, and `ScoreManager` without specifying `playerId`. All methods MUST default to `'p1'` or Player 1 so that single-player code paths remain 100% backward-compatible.
2. **Dual Docking in Co-op Mode**:
   Boss Galaga tractor beam can capture either P1 or P2. If P1 is captured and P2 rescues P1 by shooting the diving boss, does P1 return to single fighter or form a dual fighter with P2?
   Per `COLLABORATION.md`: Rescue returns the captured fighter to the captured player, or creates a dual formation. In M31, independent player entities must support `isDual` independently.
3. **Challenging Stages**:
   In Challenging stages (Bonus rounds), hit counts are recorded per player (`challengingHits: { p1: number, p2: number }`) to determine accurate individual bonus awards.

---

## 4. Conclusion & Architecture Contracts

### 4.1 Type Contracts (`src/types/index.ts`)
```ts
export type PlayerId = 'p1' | 'p2';
export type ProjectileOwnerId = 'p1' | 'p2' | 'enemy' | 'drone';

export interface BulletData {
  id: number;
  position: Vector2D;
  velocity: Vector2D;
  owner: BulletOwner;               // 'PLAYER' | 'ENEMY' | 'DRONE'
  ownerId?: ProjectileOwnerId;      // 'p1' | 'p2' | 'enemy' | 'drone'
  type: BulletType;
  active: boolean;
  width: number;
  height: number;
}
```

### 4.2 `Bullet` & `BulletManager` Contracts (`src/entities/Bullet.ts`)
```ts
export class Bullet implements BulletData, Poolable {
  // Existing fields preserved
  public owner: BulletOwner | 'DRONE' = 'PLAYER';
  public ownerId: ProjectileOwnerId = 'p1';
  ...
  public reset(): void {
    ...
    this.owner = 'PLAYER';
    this.ownerId = 'p1';
  }

  public init(
    x: number,
    y: number,
    vx: number,
    vy: number,
    owner: BulletOwner | 'DRONE',
    type: BulletType = ...,
    ownerId: ProjectileOwnerId = (owner === 'PLAYER' ? 'p1' : owner === 'DRONE' ? 'drone' : 'enemy')
  ): this {
    ...
    this.owner = owner;
    this.ownerId = ownerId;
    return this;
  }
}

export class BulletManager {
  private activeP1BulletCount: number = 0;
  private activeP2BulletCount: number = 0;
  private activeDroneBulletCount: number = 0;
  private activeEnemyBulletCount: number = 0;

  // Backward-compatible getter (returns P1 count or total)
  public getPlayerBulletCount(playerId: PlayerId = 'p1'): number {
    return playerId === 'p2' ? this.activeP2BulletCount : this.activeP1BulletCount;
  }

  public canPlayerFire(isDual: boolean, maxQuota?: number, playerId: PlayerId = 'p1'): boolean {
    const quota = maxQuota !== undefined ? maxQuota : this.getPlayerMaxQuota(isDual);
    const count = playerId === 'p2' ? this.activeP2BulletCount : this.activeP1BulletCount;
    return count < quota;
  }

  public firePlayerBullet(
    x: number,
    y: number,
    isDual: boolean = false,
    speed: number = BULLET_CONFIG.PLAYER_SPEED,
    vx: number = 0,
    vy?: number,
    maxQuota?: number,
    playerId: PlayerId = 'p1'
  ): Bullet | null {
    const quota = maxQuota !== undefined ? maxQuota : this.getPlayerMaxQuota(isDual);
    const currentCount = playerId === 'p2' ? this.activeP2BulletCount : this.activeP1BulletCount;
    if (currentCount >= quota) return null;

    const bullet = this.bulletPool.acquire();
    if (!bullet) return null;

    const actualVy = vy !== undefined ? vy : -Math.abs(speed);
    bullet.init(x, y, vx, actualVy, 'PLAYER', 'PLAYER_MISSILE', playerId);

    if (playerId === 'p2') {
      this.activeP2BulletCount++;
    } else {
      this.activeP1BulletCount++;
    }

    this.callbacks.onPlayerFire?.(bullet);
    return bullet;
  }

  public recycle(bullet: Bullet): boolean {
    if (!bullet.active) return false;

    if (bullet.ownerId === 'p2') {
      this.activeP2BulletCount = Math.max(0, this.activeP2BulletCount - 1);
    } else if (bullet.ownerId === 'p1' || bullet.owner === 'PLAYER') {
      this.activeP1BulletCount = Math.max(0, this.activeP1BulletCount - 1);
    } else if (bullet.ownerId === 'drone' || (bullet.owner as string) === 'DRONE') {
      this.activeDroneBulletCount = Math.max(0, this.activeDroneBulletCount - 1);
    } else {
      this.activeEnemyBulletCount = Math.max(0, this.activeEnemyBulletCount - 1);
    }

    bullet.active = false;
    this.callbacks.onBulletRecycle?.(bullet);
    return this.bulletPool.release(bullet);
  }

  public clear(): void {
    this.bulletPool.clear();
    this.activeP1BulletCount = 0;
    this.activeP2BulletCount = 0;
    this.activeDroneBulletCount = 0;
    this.activeEnemyBulletCount = 0;
  }
}
```

### 4.3 `ScoreManager` Multi-Player Contracts (`src/systems/ScoreManager.ts`)
```ts
export class ScoreManager {
  // P1 fields (mapped directly to existing getters for 100% backward compatibility)
  private _score: number = 0;
  private _lives: number = SCORE_MATRIX.INITIAL_LIVES;
  private _shotsFired: number = 0;
  private _shotsHit: number = 0;
  private _nextExtraLifeThresholdIndex: number = 0;

  // P2 fields
  private _p2Score: number = 0;
  private _p2Lives: number = SCORE_MATRIX.INITIAL_LIVES;
  private _p2ShotsFired: number = 0;
  private _p2ShotsHit: number = 0;
  private _p2NextExtraLifeThresholdIndex: number = 0;

  public getScore(playerId: PlayerId = 'p1'): number {
    return playerId === 'p2' ? this._p2Score : this._score;
  }

  public getLives(playerId: PlayerId = 'p1'): number {
    return playerId === 'p2' ? this._p2Lives : this._lives;
  }

  public addScore(points: number, playerId: PlayerId = 'p1'): ScoreEventPayload {
    // Adds score to specified player, updates global highScore if exceeded,
    // and checks extend thresholds for that specific player.
  }

  public addScoreForEnemy(
    type: EnemyType | string,
    isDiving: boolean,
    escortCount: number = 0,
    playerId: PlayerId = 'p1'
  ): ScoreEventPayload {
    // Calculates points from canonical SCORE_MATRIX and calls addScore(points, playerId).
  }

  public recordShotFired(count: number = 1, playerId: PlayerId = 'p1'): void {
    if (playerId === 'p2') this._p2ShotsFired += count;
    else this._shotsFired += count;
  }

  public recordShotHit(count: number = 1, playerId: PlayerId = 'p1'): void {
    if (playerId === 'p2') this._p2ShotsHit += count;
    else this._shotsHit += count;
  }
}
```

### 4.4 Subsystem Coordination Architecture
```
┌────────────────────────────────────────────────────────────────────────┐
│                              Game Engine                               │
├──────────────────────────────────┬─────────────────────────────────────┤
│        Player 1 Entity           │          Player 2 Entity            │
│  - ID: 'p1'                      │  - ID: 'p2'                         │
│  - Sprite: Cyan / White          │  - Sprite: Crimson / Amber          │
│  - Input: WASD + Space + X       │  - Input: Arrows + Enter + M        │
│  - Active Missiles: 0..8         │  - Active Missiles: 0..8            │
│  - Buff State: buffState         │  - Buff State: p2BuffState          │
│  - Special Meter: energy.p1      │  - Special Meter: energy.p2         │
└────────────────┬─────────────────┴──────────────────┬──────────────────┘
                 │                                    │
                 ▼                                    ▼
       firePlayerBullet(..., 'p1')           firePlayerBullet(..., 'p2')
                 │                                    │
                 └──────────────┬─────────────────────┘
                                ▼
         ┌──────────────────────────────────────────────┐
         │         BulletManager & bulletPool           │
         │  - Bounded Capacity: maxSize = 256 (Zero-GC) │
         │  - Tagged Allocation: bullet.ownerId         │
         │  - Quotas: activeP1Count & activeP2Count     │
         └──────────────────────┬───────────────────────┘
                                │
               Enemy Hit in Collision Pipeline
                                │
                                ▼
         ┌──────────────────────────────────────────────┐
         │         Score & Gauge Attribution            │
         │  - ScoreManager.addScore(pts, bullet.ownerId)│
         │  - SpecialMovesManager.addEnergy(amount, id) │
         └──────────────────────────────────────────────┘
```

---

## 5. Verification Method

### 5.1 Automated Unit Tests to Write & Run
1. **Tagged Projectile Quota Independence**:
   - `tests/unit/m31_tagged_bullets.test.ts`:
     - Assert P1 firing 2 missiles does not increment `activeP2BulletCount`.
     - Assert P2 can fire up to their independent quota (e.g. 2 single, 4 dual) while P1's missiles are on screen.
     - Assert recycling P1 bullet decrements only P1 counter.
     - Assert `bulletPool.getActiveCount() === 0` after stage clear.
2. **Score Attribution**:
   - `tests/unit/m31_score_attribution.test.ts`:
     - Assert `bullet.ownerId === 'p2'` hitting Zako awards 100 points to P2 and 0 points to P1.
     - Assert P1 score and P2 score accumulate independently.
     - Assert P1 reaching 20,000 awards extend to P1 without mutating P2 lives.
3. **PowerUp & Special Move Isolation**:
   - `tests/unit/m31_subsystem_isolation.test.ts`:
     - Assert P1 picking up Rapid Fire sets `player1.rapidFireTimer = 15` while P2 remains baseline.
     - Assert P2 executing Warp Ram ascends P2 without displacing P1.
     - Assert Energy Sparks funnel magnetically toward the nearest player.
4. **Baseline Invariance**:
   - Run complete unit test suite:
     ```bash
     npx vitest run
     ```
     Verify all 104 test files and 1,930 tests pass 100%.

---
*End of M31 Architecture Exploration Report*
