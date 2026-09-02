/**
 * Galaga Arcade Web Game — Bullet & Projectile Subsystem
 * 
 * Production-ready implementation featuring:
 * - Zero-allocation ObjectPool<Bullet> management for player and enemy projectiles.
 * - Single Fighter (max 2) & Dual Fighter (max 4) on-screen missile quota enforcement.
 * - Authentic projectile physics: Player (-480 px/s), Enemy (180 - 240 px/s aimed).
 * - Pixel-accurate hitboxes (Player: 2x6px, Enemy: 2x4px) with Swept CCD.
 * - Offscreen cached rendering with SpriteRenderer and procedural fallback.
 * - Reverse-safe iteration and defensive double-release protection.
 */

import { ObjectPool } from '../core/ObjectPool';
import { SpriteRenderer } from '../renderer/SpriteRenderer';
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
  DUAL_GUN_OFFSET_X: 8, // Distance from dual center to left/right cannons

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
   * Renders the projectile to canvas using SpriteRenderer with procedural fallback.
   */
  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;

    if (this.owner === 'PLAYER') {
      SpriteRenderer.draw(ctx, 'PLAYER_MISSILE', this.position.x, this.position.y);
    } else {
      const spriteId = this.type === 'ENEMY_FAST_BEAM' ? 'ENEMY_FAST_BEAM' : 'ENEMY_BULLET';
      // Calculate rotation offset for enemy bullet orientation
      const rot = this.angle + Math.PI / 2;
      SpriteRenderer.draw(ctx, spriteId, this.position.x, this.position.y, {
        rotation: rot,
      });
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
   * Spawns a single player missile traveling upward.
   * Returns Bullet instance if permitted by quota, or null if quota is saturated.
   */
  public firePlayerBullet(
    x: number,
    y: number,
    isDual: boolean = false,
    speed: number = BULLET_CONFIG.PLAYER_SPEED
  ): Bullet | null {
    if (!this.canPlayerFire(isDual)) {
      return null;
    }

    const bullet = this.bulletPool.acquire();
    if (!bullet) return null;

    bullet.init(x, y, 0, -Math.abs(speed), 'PLAYER', 'PLAYER_MISSILE');
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
    offset: number = BULLET_CONFIG.DUAL_GUN_OFFSET_X,
    speed: number = BULLET_CONFIG.PLAYER_SPEED
  ): Bullet[] {
    const spawned: Bullet[] = [];

    // Requires room for 2 missiles
    if (this.activePlayerBulletCount > BULLET_CONFIG.PLAYER_DUAL_MAX_BULLETS - 2) {
      return spawned;
    }

    const left = this.firePlayerBullet(centerX - offset, y, true, speed);
    if (left) spawned.push(left);

    const right = this.firePlayerBullet(centerX + offset, y, true, speed);
    if (right) spawned.push(right);

    return spawned;
  }

  /**
   * Spawns an enemy bullet aimed directionally at target position (targetX, targetY).
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
  // Iteration & Collision Hooks
  // ==========================================================================

  /**
   * Iterates through active player bullets with safe-deletion support.
   */
  public forEachActivePlayerBullet(callback: (bullet: Bullet) => void): void {
    this.bulletPool.forEachActiveSafe((bullet) => {
      if (bullet.active && bullet.owner === 'PLAYER') {
        callback(bullet);
      }
    });
  }

  /**
   * Iterates through active enemy bullets with safe-deletion support.
   */
  public forEachActiveEnemyBullet(callback: (bullet: Bullet) => void): void {
    this.bulletPool.forEachActiveSafe((bullet) => {
      if (bullet.active && bullet.owner === 'ENEMY') {
        callback(bullet);
      }
    });
  }

  /**
   * Returns direct access to underlying ObjectPool for diagnostic inspection.
   */
  public getPool(): ObjectPool<Bullet> {
    return this.bulletPool;
  }
}
