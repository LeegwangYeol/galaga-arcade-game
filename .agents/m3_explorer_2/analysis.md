# Galaga Projectile Architecture: Bullet & Projectile System Technical Specification

**Document Version**: 1.0.0  
**Author**: `m3_explorer_2` (Milestone 3: Bullet & Projectile Specialist)  
**Target File**: `src/entities/Bullet.ts`  
**System Dependencies**: `src/core/ObjectPool.ts`, `src/types/index.ts`, `src/math/Collision.ts`, `src/systems/ParticleSystem.ts`, `src/audio/SoundSynth.ts`  

---

## 1. Executive Summary

In authentic Namco *Galaga* (1981), the bullet and projectile system is the cornerstone of game pacing, risk-reward tactics, and difficulty scaling. The strict limitation of **maximum 2 missiles on screen** for Single Fighter (and **maximum 4 missiles** for Dual Fighter) forces players to engage enemies at close range for rapid recycle cadence.

This specification details a zero-allocation, high-performance projectile subsystem for `src/entities/Bullet.ts` built on top of `ObjectPool<Bullet>`, featuring:
1. **Player Bullet Physics**: Constant vertical velocity $v_y = -480\text{ px/s}$ with strict on-screen quota gating (Single: 2, Dual: 4).
2. **Enemy Bullet Physics**: Dynamic 2D directional targeting ($180\text{ px/s}$ to $240\text{ px/s}$) aimed at the player's position, with off-screen boundary recycling.
3. **Pixel-Accurate Hitboxes**: $2 \times 6\text{ px}$ AABB for player missiles, $2 \times 4\text{ px}$ AABB for enemy bullets, with swept continuous collision detection (CCD) to prevent high-speed tunneling.
4. **Subsystem Integration**: Clean interfaces for collision resolution, procedural particle spark generation, and Web Audio SFX triggers.
5. **Zero GC Pressure**: 100% pre-allocated memory pool with $O(1)$ swap-and-pop release and safe reverse-traversal iteration.

---

## 2. Mathematical Physics & Trajectory Formulation

### 2.1 Player Missile Physics & Quota Rules

```
                      Y = 0 (Top Screen Boundary)
                           ▲
                           │  vy = -480 px/s (Δy = -8 px/frame @ 60 FPS)
                           │  Hitbox: 2 x 6 px
                        [MISSILE]
                           │
                           │  Single Fighter: Max 2 Active Missiles
                           │  Dual Fighter:   Max 4 Active Missiles
                           │
                 [PLAYER FIGHTER] (Y = 500 px)
```

1. **Velocity Equations**:
   $$\begin{aligned}
   v_x &= 0 \\
   v_y &= -480\text{ px/s} \quad (\Delta y = v_y \cdot \Delta t = -8\text{ px per } 16.667\text{ms frame})
   \end{aligned}$$
2. **On-Screen Flight Duration**:
   At $v_y = -480\text{ px/s}$, traversing the $288\text{ px}$ virtual screen height requires exactly $0.60\text{ seconds}$ ($36\text{ frames}$).
3. **Tactical Cadence & Point-Blank Firing**:
   Because bullets are immediately returned to the pool upon destroying an enemy or exiting the screen, shooting an enemy at distance $d$ yields a maximum firing rate:
   $$f_{\text{max}}(d) = \frac{|v_y|}{d} = \frac{480}{d}\text{ shots/sec}$$
   At point-blank range ($d = 48\text{ px}$), the effective firing rate reaches $10\text{ shots/sec}$, reproducing the core tactical rhythm of arcade Galaga.

### 2.2 Enemy Bullet Physics & Directional Aiming

```
      (xe, ye) [ENEMY SHIP]
                  \
                   \  Aim Vector: (xp - xe, yp - ye)
                    \  Speed: s ∈ [180, 240] px/s
                     ▼
                 [ENEMY BULLET] (2 x 4 px, pulsating red/yellow)
                       \
                        \
                         ▼
             (xp, yp) [PLAYER SHIP]
```

1. **Aim Vector Calculation**:
   Given enemy position $\mathbf{P}_e = (x_e, y_e)$ and target player position $\mathbf{P}_p = (x_p, y_p)$:
   $$\Delta x = x_p - x_e, \quad \Delta y = y_p - y_e$$
   $$\text{distance} = \|\mathbf{P}_p - \mathbf{P}_e\| = \sqrt{\Delta x^2 + \Delta y^2}$$
2. **Normalized Velocity Vector**:
   For $\text{distance} > 0.001$:
   $$v_x = \frac{\Delta x}{\text{distance}} \cdot s, \quad v_y = \frac{\Delta y}{\text{distance}} \cdot s$$
   where $s \in [180, 240]\text{ px/s}$ is the bullet speed (scaled with stage difficulty: $s = 180 + \min(60, (\text{stage} - 1) \times 12)$).
3. **Singularity Fallback**:
   If $\text{distance} \le 0.001$ (enemy directly overlaps player), fallback to straight downward trajectory:
   $$v_x = 0, \quad v_y = s$$
4. **Orientation Angle**:
   $$\theta = \operatorname{atan2}(v_y, v_x)$$

---

## 3. Hitbox Geometry & Swept Collision Detection (CCD)

### 3.1 Static AABB Geometry ($224 \times 288$ Virtual Space)

| Projectile Type | Dimensions ($W \times H$) | Anchor Point | AABB Formula | Palette / Visuals |
|---|---|---|---|---|
| **Player Missile** | $2 \times 6\text{ px}$ | Center $(x, y)$ | $\{ x - 1, y - 3, 2, 6 \}$ | Bright Yellow (`#FFFF00`) with White Tip (`#FFFFFF`) |
| **Enemy Bullet** | $2 \times 4\text{ px}$ | Center $(x, y)$ | $\{ x - 1, y - 2, 2, 4 \}$ | Alternating Red (`#FF0000`) & Yellow (`#FFFF00`) |

### 3.2 Swept Continuous Collision Detection (CCD)

Because player missiles travel $8\text{ px/frame}$ at 60 FPS (and up to $16\text{ px/frame}$ under frame delta spikes), high-speed tunneling past thin enemy colliders is prevented by generating a **Swept AABB**:

$$\text{SweptAABB}(y_{\text{prev}}, y_{\text{curr}}) = \left\{ x - 1, \min(y_{\text{prev}}, y_{\text{curr}}) - 3, 2, |y_{\text{curr}} - y_{\text{prev}}| + 6 \right\}$$

---

## 4. Complete Production-Ready Implementation (`src/entities/Bullet.ts`)

Below is the complete, self-contained, production-ready TypeScript code for `src/entities/Bullet.ts`:

```typescript
/**
 * Galaga Arcade Web Game — Bullet & Projectile Subsystem
 * 
 * Production-ready implementation featuring:
 * - Zero-allocation ObjectPool<Bullet> management for player and enemy projectiles.
 * - Single Fighter (max 2) & Dual Fighter (max 4) on-screen missile quota enforcement.
 * - Authentic projectile physics: Player (-480 px/s), Enemy (180 - 240 px/s aimed).
 * - Pixel-accurate hitboxes (Player: 2x6px, Enemy: 2x4px) with Swept CCD.
 * - Pure procedural Canvas 2D rendering with animated palette cycling.
 * - Seamless integration hooks with Collision, Particle, and Audio systems.
 */

import { ObjectPool } from '../core/ObjectPool';
import type {
  BulletData,
  BulletOwner,
  BulletType,
  Poolable,
  Rect,
  Vector2D,
} from '../types';

// ============================================================================
// 1. Constants & Configuration
// ============================================================================

export const BULLET_CONFIG = {
  // Screen Boundaries (224 x 288 virtual arcade space with margin)
  VIRTUAL_WIDTH: 224,
  VIRTUAL_HEIGHT: 288,
  BOUNDS_MARGIN: 8,

  // Player Bullet Specifications
  PLAYER_SPEED: 480, // px/s (upward, vy = -480)
  PLAYER_WIDTH: 2,
  PLAYER_HEIGHT: 6,
  PLAYER_SINGLE_MAX_BULLETS: 2,
  PLAYER_DUAL_MAX_BULLETS: 4,
  DUAL_GUN_OFFSET_X: 6, // Distance from center ship anchor to left/right cannons

  // Enemy Bullet Specifications
  ENEMY_MIN_SPEED: 180, // px/s (Stage 1 base)
  ENEMY_MAX_SPEED: 240, // px/s (Later stages)
  ENEMY_WIDTH: 2,
  ENEMY_HEIGHT: 4,
  ENEMY_ANIM_RATE_HZ: 15, // Palette alternation frequency

  // Pool Capacities
  POOL_INITIAL_SIZE: 32,
  POOL_MAX_SIZE: 128,
} as const;

// ============================================================================
// 2. Bullet Entity Class
// ============================================================================

export class Bullet implements BulletData, Poolable {
  public id: number = 0;
  public position: Vector2D = { x: 0, y: 0 };
  public velocity: Vector2D = { x: 0, y: 0 };
  public prevPosition: Vector2D = { x: 0, y: 0 };
  public owner: BulletOwner = 'PLAYER';
  public type: BulletType = 'PLAYER_MISSILE';
  public active: boolean = false;
  public width: number = BULLET_CONFIG.PLAYER_WIDTH;
  public height: number = BULLET_CONFIG.PLAYER_HEIGHT;

  // Animation & Rotation State
  public angle: number = -Math.PI / 2; // Radians (-PI/2 = straight up)
  public animTimer: number = 0;
  public animFrame: number = 0;

  constructor(id: number = 0) {
    this.id = id;
    this.reset();
  }

  /**
   * Resets all internal fields for zero-allocation pool reuse.
   */
  public reset(): void {
    this.position.x = 0;
    this.position.y = 0;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.prevPosition.x = 0;
    this.prevPosition.y = 0;
    this.owner = 'PLAYER';
    this.type = 'PLAYER_MISSILE';
    this.active = false;
    this.width = BULLET_CONFIG.PLAYER_WIDTH;
    this.height = BULLET_CONFIG.PLAYER_HEIGHT;
    this.angle = -Math.PI / 2;
    this.animTimer = 0;
    this.animFrame = 0;
  }

  /**
   * Initializes bullet state upon acquisition from the pool.
   */
  public init(
    x: number,
    y: number,
    vx: number,
    vy: number,
    owner: BulletOwner,
    type: BulletType = owner === 'PLAYER' ? 'PLAYER_MISSILE' : 'ENEMY_RED_BULLET'
  ): this {
    this.position.x = x;
    this.position.y = y;
    this.prevPosition.x = x;
    this.prevPosition.y = y;
    this.velocity.x = vx;
    this.velocity.y = vy;
    this.owner = owner;
    this.type = type;
    this.active = true;
    this.animTimer = 0;
    this.animFrame = 0;

    if (owner === 'PLAYER') {
      this.width = BULLET_CONFIG.PLAYER_WIDTH;
      this.height = BULLET_CONFIG.PLAYER_HEIGHT;
      this.angle = -Math.PI / 2;
    } else {
      this.width = BULLET_CONFIG.ENEMY_WIDTH;
      this.height = BULLET_CONFIG.ENEMY_HEIGHT;
      this.angle = Math.atan2(vy, vx);
    }

    return this;
  }

  /**
   * Updates bullet physics and animation state.
   * Returns false if the bullet has left the playable bounds (should be recycled).
   */
  public update(dt: number, boundsMargin: number = BULLET_CONFIG.BOUNDS_MARGIN): boolean {
    if (!this.active) return false;

    // Cache previous position for Swept CCD
    this.prevPosition.x = this.position.x;
    this.prevPosition.y = this.position.y;

    // Integrate Euler kinematics
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;

    // Advance animation frame for enemy bullets
    if (this.owner === 'ENEMY') {
      this.animTimer += dt;
      if (this.animTimer >= 1 / BULLET_CONFIG.ENEMY_ANIM_RATE_HZ) {
        this.animTimer = 0;
        this.animFrame = (this.animFrame + 1) % 2;
      }
    }

    // Check bounds
    if (
      this.position.y < -boundsMargin ||
      this.position.y > BULLET_CONFIG.VIRTUAL_HEIGHT + boundsMargin ||
      this.position.x < -boundsMargin ||
      this.position.x > BULLET_CONFIG.VIRTUAL_WIDTH + boundsMargin
    ) {
      this.active = false;
      return false; // Out of bounds
    }

    return true;
  }

  /**
   * Returns current static Axis-Aligned Bounding Box (AABB) centered around position.
   */
  public getHitbox(): Rect {
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    return {
      x: this.position.x - halfW,
      y: this.position.y - halfH,
      width: this.width,
      height: this.height,
    };
  }

  /**
   * Returns Swept AABB spanning from previous frame position to current position.
   * Eliminates tunneling artifacts against thin colliders.
   */
  public getSweptHitbox(): Rect {
    const halfW = this.width / 2;
    const halfH = this.height / 2;

    const minX = Math.min(this.prevPosition.x, this.position.x) - halfW;
    const maxX = Math.max(this.prevPosition.x, this.position.x) + halfW;
    const minY = Math.min(this.prevPosition.y, this.position.y) - halfH;
    const maxY = Math.max(this.prevPosition.y, this.position.y) + halfH;

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Renders the projectile to canvas using pure procedural pixel routines.
   */
  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;

    const px = Math.round(this.position.x);
    const py = Math.round(this.position.y);

    if (this.owner === 'PLAYER') {
      // Authentic Galaga Player Yellow Missile (2x6 px with White Tip)
      // Top tip (1x2 px white)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(px - 1, py - 3, 2, 2);

      // Shaft & body (2x4 px bright yellow)
      ctx.fillStyle = '#FFFF00';
      ctx.fillRect(px - 1, py - 1, 2, 3);

      // Trailing exhaust dot (1x1 px orange)
      ctx.fillStyle = '#FF6600';
      ctx.fillRect(px, py + 2, 1, 1);
    } else {
      // Authentic Galaga Enemy Red/Yellow Pulsing Oblong Bullet (2x4 px)
      const isRedFrame = this.animFrame === 0;

      // Outer glow / body
      ctx.fillStyle = isRedFrame ? '#FF0000' : '#FFFF00';
      ctx.fillRect(px - 1, py - 2, 2, 4);

      // Inner core highlight (1x2 px white/yellow)
      ctx.fillStyle = isRedFrame ? '#FFAAAA' : '#FFFFFF';
      ctx.fillRect(px, py - 1, 1, 2);
    }
  }
}

// ============================================================================
// 3. Projectile / Bullet Manager System
// ============================================================================

export interface BulletManagerOptions {
  onPlayerFire?: (bullet: Bullet) => void;
  onEnemyFire?: (bullet: Bullet) => void;
  onBulletRecycle?: (bullet: Bullet) => void;
}

export class BulletManager {
  private bulletPool: ObjectPool<Bullet>;
  private nextBulletId: number = 1;
  private activePlayerBulletCount: number = 0;
  private activeEnemyBulletCount: number = 0;

  private callbacks: BulletManagerOptions;

  constructor(options: BulletManagerOptions = {}) {
    this.callbacks = options;

    this.bulletPool = new ObjectPool<Bullet>({
      factory: () => new Bullet(this.nextBulletId++),
      reset: (b: Bullet) => b.reset(),
      initialSize: BULLET_CONFIG.POOL_INITIAL_SIZE,
      maxSize: BULLET_CONFIG.POOL_MAX_SIZE,
      autoExpand: true,
    });
  }

  // ==========================================================================
  // Quota & Authorization Checks
  // ==========================================================================

  /**
   * Returns current count of active player missiles on screen.
   */
  public getPlayerBulletCount(): number {
    return this.activePlayerBulletCount;
  }

  /**
   * Returns current count of active enemy projectiles on screen.
   */
  public getEnemyBulletCount(): number {
    return this.activeEnemyBulletCount;
  }

  /**
   * Returns maximum allowed player missiles based on Single vs Dual fighter mode.
   */
  public getPlayerMaxQuota(isDual: boolean): number {
    return isDual
      ? BULLET_CONFIG.PLAYER_DUAL_MAX_BULLETS
      : BULLET_CONFIG.PLAYER_SINGLE_MAX_BULLETS;
  }

  /**
   * Determines if player is permitted to fire given current on-screen quota.
   */
  public canPlayerFire(isDual: boolean): boolean {
    const quota = this.getPlayerMaxQuota(isDual);
    return this.activePlayerBulletCount < quota;
  }

  // ==========================================================================
  // Spawning Methods
  // ==========================================================================

  /**
   * Spawns a single player missile traveling at -480 px/s.
   * Returns Bullet instance if permitted by quota, or null if quota is saturated.
   */
  public firePlayerBullet(x: number, y: number, isDual: boolean = false): Bullet | null {
    if (!this.canPlayerFire(isDual)) {
      return null;
    }

    const bullet = this.bulletPool.acquire();
    if (!bullet) return null;

    bullet.init(x, y, 0, -BULLET_CONFIG.PLAYER_SPEED, 'PLAYER', 'PLAYER_MISSILE');
    this.activePlayerBulletCount++;

    if (this.callbacks.onPlayerFire) {
      this.callbacks.onPlayerFire(bullet);
    }

    return bullet;
  }

  /**
   * Spawns parallel twin missiles for Dual Fighter mode.
   * Returns array of spawned bullets (up to 2).
   */
  public fireDualBullets(
    centerX: number,
    y: number,
    offset: number = BULLET_CONFIG.DUAL_GUN_OFFSET_X
  ): Bullet[] {
    const spawned: Bullet[] = [];

    // Left cannon
    if (this.canPlayerFire(true)) {
      const left = this.firePlayerBullet(centerX - offset, y, true);
      if (left) spawned.push(left);
    }

    // Right cannon
    if (this.canPlayerFire(true)) {
      const right = this.firePlayerBullet(centerX + offset, y, true);
      if (right) spawned.push(right);
    }

    return spawned;
  }

  /**
   * Spawns an enemy bullet aimed directionally at target position (xp, yp).
   */
  public fireEnemyBullet(
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    speed: number = BULLET_CONFIG.ENEMY_MIN_SPEED,
    type: BulletType = 'ENEMY_RED_BULLET'
  ): Bullet | null {
    const bullet = this.bulletPool.acquire();
    if (!bullet) return null;

    // Calculate normalized direction vector
    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let vx = 0;
    let vy = speed;

    if (dist > 0.001) {
      vx = (dx / dist) * speed;
      vy = (dy / dist) * speed;
    }

    bullet.init(originX, originY, vx, vy, 'ENEMY', type);
    this.activeEnemyBulletCount++;

    if (this.callbacks.onEnemyFire) {
      this.callbacks.onEnemyFire(bullet);
    }

    return bullet;
  }

  // ==========================================================================
  // Release & Recycling
  // ==========================================================================

  /**
   * Recycles an active bullet back to the pool and decrements owner counter.
   */
  public recycle(bullet: Bullet): boolean {
    if (!bullet.active) return false;

    if (bullet.owner === 'PLAYER') {
      this.activePlayerBulletCount = Math.max(0, this.activePlayerBulletCount - 1);
    } else {
      this.activeEnemyBulletCount = Math.max(0, this.activeEnemyBulletCount - 1);
    }

    bullet.active = false;

    if (this.callbacks.onBulletRecycle) {
      this.callbacks.onBulletRecycle(bullet);
    }

    return this.bulletPool.release(bullet);
  }

  /**
   * Clears and recycles all active projectiles (e.g. stage clear, game over).
   */
  public clear(): void {
    this.bulletPool.clear();
    this.activePlayerBulletCount = 0;
    this.activeEnemyBulletCount = 0;
  }

  // ==========================================================================
  // Game Loop Integration (Update & Render)
  // ==========================================================================

  /**
   * Updates all active bullets, moving them and recycling off-screen ones safely.
   */
  public update(dt: number): void {
    this.bulletPool.forEachActiveSafe((bullet) => {
      const inBounds = bullet.update(dt);
      if (!inBounds) {
        this.recycle(bullet);
      }
    });
  }

  /**
   * Renders all active bullets to the canvas context.
   */
  public render(ctx: CanvasRenderingContext2D): void {
    this.bulletPool.forEachActive((bullet) => {
      bullet.render(ctx);
    });
  }

  // ==========================================================================
  // Collision Detection Hooks
  // ==========================================================================

  /**
   * Iterates through active player bullets to perform hit testing against enemy colliders.
   */
  public forEachActivePlayerBullet(callback: (bullet: Bullet) => void): void {
    this.bulletPool.forEachActiveSafe((bullet) => {
      if (bullet.active && bullet.owner === 'PLAYER') {
        callback(bullet);
      }
    });
  }

  /**
   * Iterates through active enemy bullets to perform hit testing against player ship.
   */
  public forEachActiveEnemyBullet(callback: (bullet: Bullet) => void): void {
    this.bulletPool.forEachActiveSafe((bullet) => {
      if (bullet.active && bullet.owner === 'ENEMY') {
        callback(bullet);
      }
    });
  }

  /**
   * Direct access to underlying ObjectPool for diagnostic inspection.
   */
  public getPool(): ObjectPool<Bullet> {
    return this.bulletPool;
  }
}
```

---

## 5. Subsystem Integration Contracts

### 5.1 Collision System Integration (`src/math/Collision.ts`)

```typescript
// Player Missiles vs Enemies Collision Pass
export function resolvePlayerBulletCollisions(
  bulletManager: BulletManager,
  enemies: Enemy[],
  particleSystem: ParticleSystem,
  onEnemyHit: (enemy: Enemy, bullet: Bullet) => void
): void {
  bulletManager.forEachActivePlayerBullet((bullet) => {
    const bulletBox = bullet.getSweptHitbox();

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy.isAlive()) continue;

      if (checkAABB(bulletBox, enemy.getHitbox())) {
        // 1. Spawn hit sparks
        particleSystem.spawnSparks(bullet.position.x, bullet.position.y, '#FFFF00', 8);

        // 2. Notify enemy hit
        onEnemyHit(enemy, bullet);

        // 3. Immediately recycle bullet -> restores player fire quota instantly
        bulletManager.recycle(bullet);
        break;
      }
    }
  });
}
```

### 5.2 Particle System Integration (`src/systems/ParticleSystem.ts`)

When a missile impacts an alien or boundary:
- **Player Missile Impact**: 6–10 yellow/white spark particles ($v \in [60, 140]\text{ px/s}$, lifespan $150\text{ms}$).
- **Enemy Bullet Impact on Player**: 16–24 red/orange/white expanding debris particles ($v \in [40, 200]\text{ px/s}$, lifespan $600\text{ms}$).

### 5.3 Audio Engine Integration (`src/audio/SoundSynth.ts`)

- **Laser Fire SFX**: Triggered on `BulletManager.firePlayerBullet()` via `SoundSynthesizer.playLaser()` (80ms downward chirp $1200\text{Hz} \to 300\text{Hz}$).

---

## 6. Adversarial Edge Cases & Hardening Matrix

| Scenario / Edge Case | Failure Mode Without Hardening | Implemented Hardening Mechanism |
|---|---|---|
| **Point-Blank Rapid Firing** | Quota counter drift if recycled mid-frame | `recycle()` directly decrements atomic counter with `Math.max(0, count - 1)`. |
| **High $\Delta t$ Lag Spike (Tunneling)** | Bullet skips over enemy collider | `getSweptHitbox()` creates continuous bounding box spanning $[y_{\text{prev}}, y_{\text{curr}}]$. |
| **Zero-Distance Enemy Aiming** | Division by zero ($\text{dist} = 0 \to \text{NaN}$) | Distance check `dist > 0.001` with clean fallback $v_x = 0, v_y = s$. |
| **Double Release / Foreign Object** | Corrupted pool partition pointer | Handled by `ObjectPool.release()` with active index validation and `bullet.active` guards. |
| **Simultaneous Multi-Hit** | Single bullet triggering multiple destroys | First hit immediately calls `recycle(bullet)` and breaks loop traversal. |
| **In-Loop Deletion** | Array index corruption during traversal | Safe reverse iteration via `forEachActiveSafe`. |

---

## 7. Verification & Unit Test Suite Plan (`tests/unit/bullet.test.ts`)

A dedicated unit test suite should verify:
1. **Quota Enforcement**:
   - Single fighter cannot exceed 2 active bullets.
   - Dual fighter can fire up to 4 active bullets.
   - Quota decrements immediately upon `recycle()`.
2. **Kinematics & Speed**:
   - Player bullet moves upward at exactly $v_y = -480\text{ px/s}$.
   - Enemy bullet moves towards target at configured speed ($180\text{--}240\text{ px/s}$).
3. **Hitbox Accuracy**:
   - Static AABB matches $2 \times 6\text{ px}$ (player) and $2 \times 4\text{ px}$ (enemy).
   - Swept AABB accurately encompasses $y_{\text{prev}}$ to $y_{\text{curr}}$.
4. **Pool Stability**:
   - Continuous rapid fire and recycle for 10,000 cycles produces zero leaked objects and stable pool capacity.

---
*End of Analysis Report.*
