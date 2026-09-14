/**
 * Milestone M18: Mirage Phantom Clone Decoy Entity
 * 
 * Bounded Pool Entity:
 * - Absorbs player bullets to draw enemy fire.
 * - Awards 0 score points and deals 0 collision damage to player ship.
 * - Auto-expires after 2.0 seconds.
 * - Strictly excluded from FormationManager.getLivingCount().
 */

import { EnemyDamageResult, EnemyType, Rect } from '../../types';
import { SpriteRenderer } from '../../renderer/SpriteRenderer';

export class PhantomClone {
  public static readonly LIFETIME_SEC = 2.0;
  public static readonly HITBOX_SIZE = 12;

  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public rotation: number = 0;
  public active: boolean = false;
  public lifetime: number = PhantomClone.LIFETIME_SEC;
  public maxLifetime: number = PhantomClone.LIFETIME_SEC;
  public alpha: number = 0.55;
  public readonly isPhantomDecoy: boolean = true;
  public readonly canShoot: boolean = false;
  public type: EnemyType = EnemyType.ZAKO;

  private flickerTimer: number = 0;
  private animTimer: number = 0;
  private animFrame: number = 0;

  constructor() {
    this.reset();
  }

  public init(
    x: number,
    y: number,
    vx: number,
    vy: number,
    type: EnemyType = EnemyType.ZAKO
  ): this {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.type = type;
    this.active = true;
    this.lifetime = PhantomClone.LIFETIME_SEC;
    this.maxLifetime = PhantomClone.LIFETIME_SEC;
    this.alpha = 0.55;
    this.flickerTimer = 0;
    this.animTimer = 0;
    this.animFrame = 0;
    this.rotation = Math.atan2(vy, vx) + Math.PI / 2;
    return this;
  }

  public reset(): void {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.rotation = 0;
    this.active = false;
    this.lifetime = PhantomClone.LIFETIME_SEC;
    this.maxLifetime = PhantomClone.LIFETIME_SEC;
    this.alpha = 0.55;
    this.flickerTimer = 0;
    this.animTimer = 0;
    this.animFrame = 0;
    this.type = EnemyType.ZAKO;
  }

  public update(dt: number): void {
    if (!this.active) return;

    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.active = false;
      return;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1) {
      this.rotation = Math.atan2(this.vy, this.vx) + Math.PI / 2;
    }

    this.flickerTimer += dt;
    this.animTimer += dt;
    if (this.animTimer >= 0.1) {
      this.animTimer -= 0.1;
      this.animFrame = (this.animFrame + 1) % 2;
    }

    // Holographic alpha pulsation
    const lifeRatio = Math.max(0, this.lifetime / this.maxLifetime);
    const pulse = 0.4 + 0.3 * Math.sin(this.flickerTimer * 24);
    this.alpha = Math.min(1.0, Math.max(0.15, pulse * lifeRatio));

    // Screen bounds check
    if (this.y > 310 || this.y < -30 || this.x < -30 || this.x > 254) {
      this.active = false;
    }
  }

  public getHitbox(): Rect {
    const half = PhantomClone.HITBOX_SIZE / 2;
    return {
      x: this.x - half,
      y: this.y - half,
      width: PhantomClone.HITBOX_SIZE,
      height: PhantomClone.HITBOX_SIZE,
    };
  }

  /**
   * Absorbs incoming player projectile.
   * Strictly awards 0 points and does not trigger chain scores or kills.
   */
  public takeDamage(_amount: number = 1): EnemyDamageResult {
    // Holographic digital disturbance flicker
    this.flickerTimer += 0.2;
    return {
      destroyed: false,
      points: 0,
      wasDamaged: true,
      shieldAbsorbed: true,
      remainingHealth: 1,
      remainingShield: 0,
    };
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;

    ctx.save();
    // Holographic tinting & scanline strobe
    ctx.globalAlpha = this.alpha;

    SpriteRenderer.drawEnemy(
      ctx,
      this.type,
      this.x,
      this.y,
      this.animFrame,
      1,
      this.rotation,
      this.alpha
    );

    // Cyan holographic hologram scanline overlay
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    const half = PhantomClone.HITBOX_SIZE / 2;
    ctx.beginPath();
    ctx.moveTo(this.x - half, this.y);
    ctx.lineTo(this.x + half, this.y);
    ctx.stroke();

    ctx.restore();
  }
}
