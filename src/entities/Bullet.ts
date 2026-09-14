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
  PlayerId,
  ProjectileOwnerId,
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
  POOL_MAX_SIZE: 256,
} as const;

// ============================================================================
// 2. Bullet Entity Class
// ============================================================================

export class Bullet implements BulletData, Poolable {
  public id: number = 0;
  public position: Vector2D = { x: 0, y: 0 };
  public velocity: Vector2D = { x: 0, y: 0 };
  public prevPosition: Vector2D = { x: 0, y: 0 };
  public owner: BulletOwner | 'DRONE' = 'PLAYER';
  public ownerId: ProjectileOwnerId = 'p1';
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
    this.ownerId = 'p1';
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
    owner: BulletOwner | 'DRONE',
    type: BulletType = (owner === 'PLAYER' || (owner as string) === 'DRONE') ? 'PLAYER_MISSILE' : 'ENEMY_RED_BULLET',
    ownerId?: ProjectileOwnerId
  ): this {
    this.position.x = x;
    this.position.y = y;
    this.prevPosition.x = x;
    this.prevPosition.y = y;
    this.velocity.x = vx;
    this.velocity.y = vy;
    this.owner = owner;
    this.ownerId = ownerId ?? (owner === 'PLAYER' ? 'p1' : owner === 'DRONE' ? 'drone' : 'enemy');
    this.type = type;
    this.active = true;
    this.animTimer = 0;
    this.animFrame = 0;

    if (owner === 'PLAYER' || (owner as string) === 'DRONE') {
      this.width = BULLET_CONFIG.PLAYER_WIDTH;
      this.height = BULLET_CONFIG.PLAYER_HEIGHT;
      this.angle = (vx === 0 && vy === 0) ? -Math.PI / 2 : Math.atan2(vy, vx);
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

    if (this.owner === 'PLAYER' || (this.owner as string) === 'DRONE') {
      const spriteId = this.ownerId === 'p2' ? 'PLAYER_MISSILE_P2' : 'PLAYER_MISSILE';
      const rot = this.angle + Math.PI / 2;
      if (Math.abs(rot) > 0.001) {
        SpriteRenderer.draw(ctx, spriteId, this.position.x, this.position.y, {
          rotation: rot,
        });
      } else {
        SpriteRenderer.draw(ctx, spriteId, this.position.x, this.position.y);
      }
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
  private activeP1BulletCount: number = 0;
  private activeP2BulletCount: number = 0;
  private activeDroneBulletCount: number = 0;
  private activeEnemyBulletCount: number = 0;

  private callbacks: BulletManagerOptions;

  constructor(options: BulletManagerOptions = {}) {
    this.callbacks = options;

    // ObjectPool Capacity Invariants:
    // bulletPool is hard-bounded at maxSize: 256 (initialSize: 32, autoExpand: true
    // up to the strict 256 cap, beyond which acquire() returns null), preserving
    // compatibility with tests/unit/m8_final_adversarial.test.ts:146 (capacity <= 128)
    // and tests/unit/adversarial_m15_memory_bounds.test.ts:310–322 (capacity === 256).
    // At stage clear, bulletManager.clear() flushes all bullets to getActiveCount() === 0.
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
   * Defaults to P1 count for 100% backward compatibility.
   */
  public getPlayerBulletCount(playerId: PlayerId = 'p1'): number {
    return playerId === 'p2' ? this.activeP2BulletCount : this.activeP1BulletCount;
  }

  public getActivePlayerBulletCount(playerId: PlayerId = 'p1'): number {
    return this.getPlayerBulletCount(playerId);
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
  public canPlayerFire(
    isDualOrPlayerId: boolean | PlayerId = false,
    maxQuotaOrDual?: number | boolean,
    playerId: PlayerId = 'p1'
  ): boolean {
    let isDual = false;
    let maxQuota: number | undefined;
    let targetPlayerId: PlayerId = 'p1';

    if (typeof isDualOrPlayerId === 'string') {
      targetPlayerId = isDualOrPlayerId;
      isDual = typeof maxQuotaOrDual === 'boolean' ? maxQuotaOrDual : false;
    } else {
      isDual = isDualOrPlayerId;
      if (typeof maxQuotaOrDual === 'number') maxQuota = maxQuotaOrDual;
      targetPlayerId = playerId;
    }

    const quota = maxQuota !== undefined ? maxQuota : this.getPlayerMaxQuota(isDual);
    const count = this.getPlayerBulletCount(targetPlayerId);
    return count < quota;
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
    speed: number = BULLET_CONFIG.PLAYER_SPEED,
    vx: number = 0,
    vy?: number,
    maxQuota?: number,
    playerId: PlayerId = 'p1'
  ): Bullet | null {
    const quota = maxQuota !== undefined ? maxQuota : this.getPlayerMaxQuota(isDual);
    const currentCount = this.getPlayerBulletCount(playerId);
    if (currentCount >= quota) {
      return null;
    }

    const bullet = this.bulletPool.acquire();
    if (!bullet) return null;

    const actualVy = vy !== undefined ? vy : -Math.abs(speed);
    bullet.init(x, y, vx, actualVy, 'PLAYER', 'PLAYER_MISSILE', playerId);
    if (playerId === 'p2') {
      this.activeP2BulletCount++;
    } else {
      this.activeP1BulletCount++;
    }

    if (this.callbacks.onPlayerFire) {
      this.callbacks.onPlayerFire(bullet);
    }

    return bullet;
  }

  /**
   * Spawns a player bullet with explicit velocity vectors and custom quota.
   */
  public firePlayerBulletWithVector(
    x: number,
    y: number,
    vx: number,
    vy: number,
    maxQuota?: number,
    playerId: PlayerId = 'p1'
  ): Bullet | null {
    const quota = maxQuota !== undefined ? maxQuota : BULLET_CONFIG.PLAYER_SINGLE_MAX_BULLETS;
    const currentCount = this.getPlayerBulletCount(playerId);
    if (currentCount >= quota) {
      return null;
    }

    const bullet = this.bulletPool.acquire();
    if (!bullet) return null;

    bullet.init(x, y, vx, vy, 'PLAYER', 'PLAYER_MISSILE', playerId);
    if (playerId === 'p2') {
      this.activeP2BulletCount++;
    } else {
      this.activeP1BulletCount++;
    }

    if (this.callbacks.onPlayerFire) {
      this.callbacks.onPlayerFire(bullet);
    }

    return bullet;
  }

  /**
   * Spawns an Escort Drone plasma bolt traveling upward without consuming player missile quota.
   */
  public fireDroneBullet(
    x: number,
    y: number,
    vx: number = 0,
    vy: number = -460,
    maxQuota: number = 16
  ): Bullet | null {
    if (this.activeDroneBulletCount >= maxQuota) {
      return null;
    }

    const bullet = this.bulletPool.acquire();
    if (!bullet) return null;

    bullet.init(x, y, vx, vy, 'DRONE' as any, 'PLAYER_MISSILE');
    this.activeDroneBulletCount++;

    return bullet;
  }

  /**
   * Spawns a high-speed homing counter-missile deflected by the Kinetic Reflection Shield.
   * Uses 'DRONE' owner tag so it damages enemies without counting against player primary fire quota.
   */
  public fireReflectionMissile(
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    speed: number = 600
  ): Bullet | null {
    const bullet = this.bulletPool.acquire();
    if (!bullet) return null;

    const dx = targetX - originX;
    const dy = targetY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let vx = 0;
    let vy = -speed;
    if (dist > 0.001) {
      vx = (dx / dist) * speed;
      vy = (dy / dist) * speed;
    }

    bullet.init(originX, originY, vx, vy, 'DRONE' as any, 'PLAYER_MISSILE');
    this.activeDroneBulletCount++;

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
    speed: number = BULLET_CONFIG.PLAYER_SPEED,
    playerId: PlayerId = 'p1'
  ): Bullet[] {
    const spawned: Bullet[] = [];

    // Requires room for 2 missiles
    const currentCount = this.getPlayerBulletCount(playerId);
    if (currentCount > BULLET_CONFIG.PLAYER_DUAL_MAX_BULLETS - 2) {
      return spawned;
    }

    const left = this.firePlayerBullet(centerX - offset, y, true, speed, 0, undefined, undefined, playerId);
    if (left) spawned.push(left);

    const right = this.firePlayerBullet(centerX + offset, y, true, speed, 0, undefined, undefined, playerId);
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

  /**
   * Spawns an enemy bullet with explicit velocity vector (vx, vy).
   * Used for boss spiral rings, radial shockwaves, and custom trajectories with zero GC.
   */
  public fireEnemyBulletWithVector(
    originX: number,
    originY: number,
    vx: number,
    vy: number,
    type: BulletType = 'ENEMY_RED_BULLET',
    _damage?: number,
    _color?: string
  ): Bullet | null {
    const bullet = this.bulletPool.acquire();
    if (!bullet) return null;

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
    this.activeP1BulletCount = 0;
    this.activeP2BulletCount = 0;
    this.activeDroneBulletCount = 0;
    this.activeEnemyBulletCount = 0;
  }

  /**
   * Clears all active enemy bullets and optionally invokes an effect callback.
   */
  public clearEnemyBulletsWithEffect(
    onBulletNeutralized?: (x: number, y: number) => void
  ): number {
    let clearedCount = 0;
    this.bulletPool.forEachActiveSafe((bullet) => {
      if (bullet.active && bullet.owner === 'ENEMY') {
        onBulletNeutralized?.(bullet.position.x, bullet.position.y);
        this.recycle(bullet);
        clearedCount++;
      }
    });
    this.activeEnemyBulletCount = 0;
    return clearedCount;
  }

  // ==========================================================================
  // Game Loop Integration (Update & Render)
  // ==========================================================================

  /**
   * Updates all active bullets, moving them and recycling off-screen ones safely.
   * Supports Chrono Freeze (enemyDt = 0) and Chrono Field localized slowing.
   */
  public update(
    dt: number,
    enemyDt?: number,
    chronoField?: { x: number; y: number; radiusSq?: number; slowFactor?: number }
  ): void {
    const actualEnemyDt = enemyDt !== undefined ? enemyDt : dt;
    const rSq = chronoField?.radiusSq ?? 14400; // 120^2 px
    const factor = chronoField?.slowFactor ?? 0.40; // 60% reduction

    this.bulletPool.forEachActiveSafe((bullet) => {
      let effectiveDt = dt;
      if (bullet.owner === 'ENEMY') {
        effectiveDt = actualEnemyDt;
        if (chronoField) {
          const dx = bullet.position.x - chronoField.x;
          const dy = bullet.position.y - chronoField.y;
          if (dx * dx + dy * dy <= rSq) {
            effectiveDt *= factor;
          }
        }
      }
      const inBounds = bullet.update(effectiveDt);
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
   * Iterates through active player and ally drone bullets with safe-deletion support.
   */
  public forEachActivePlayerBullet(callback: (bullet: Bullet) => void): void {
    this.bulletPool.forEachActiveSafe((bullet) => {
      if (bullet.active && (bullet.owner === 'PLAYER' || (bullet.owner as string) === 'DRONE')) {
        callback(bullet);
      }
    });
  }

  /**
   * Returns snapshot array of all active player and reflected/drone projectiles.
   */
  public getActivePlayerBullets(): Bullet[] {
    const list: Bullet[] = [];
    this.forEachActivePlayerBullet((bullet) => list.push(bullet));
    return list;
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

  /**
   * Returns current pre-allocated capacity of the projectile ObjectPool.
   */
  public getPoolCapacity(): number {
    return this.bulletPool.getCapacity();
  }

  /**
   * Deactivates and recycles a bullet entity.
   */
  public deactivateBullet(bullet: Bullet): boolean {
    return this.recycle(bullet);
  }
}
