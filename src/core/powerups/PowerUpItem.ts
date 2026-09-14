/**
 * Galaga Arcade Web Game — Poolable Power-Up Item Entity
 * Location: src/core/powerups/PowerUpItem.ts
 */

import type { Poolable, Rect } from '../../types';
import { PowerUpType } from './types';
import { SpriteRenderer } from '../../renderer/SpriteRenderer';

export class PowerUpItem implements Poolable {
  // Static Physics & Kinematics Constants
  public static readonly DRIFT_SPEED = 60;        // 60 pixels per second downward
  public static readonly SWAY_AMPLITUDE = 12.0;   // ±12 px horizontal sinusoidal sway
  public static readonly SWAY_FREQUENCY = 3.0;    // 3.0 rad/s
  public static readonly HITBOX_SIZE = 12;        // 12x12 px AABB bounding box
  public static readonly DESPAWN_Y = 288;         // Screen bottom exit threshold
  public static readonly MIN_X = 10;              // Viewport horizontal clamp min
  public static readonly MAX_X = 214;             // Viewport horizontal clamp max

  // Identity & Pooling State
  public id: number = 0;
  public active: boolean = false;
  public type: PowerUpType = PowerUpType.RAPID_FIRE;

  // Spatial & Kinematics Coordinates
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = PowerUpItem.DRIFT_SPEED;
  public originX: number = 0;
  public width: number = PowerUpItem.HITBOX_SIZE;
  public height: number = PowerUpItem.HITBOX_SIZE;

  // Timers & Phase
  public swayTimer: number = 0;
  public swayPhase: number = 0;
  public animTimer: number = 0;
  public pulseTimer: number = 0;

  public get baseX(): number { return this.originX; }
  public set baseX(v: number) { this.originX = v; }
  public get lifetime(): number { return this.swayTimer; }
  public set lifetime(v: number) { this.swayTimer = v; }

  constructor(id: number = 0) {
    this.id = id;
    this.reset();
  }

  /**
   * Flexible init supporting both (x, y, type) and (type, x, y) parameter signatures.
   */
  public init(
    arg1: number | PowerUpType,
    arg2: number | PowerUpType,
    arg3?: PowerUpType | number
  ): this {
    this.active = true;
    this.swayTimer = 0;
    this.animTimer = 0;
    this.pulseTimer = 0;
    this.vy = PowerUpItem.DRIFT_SPEED;
    this.vx = 0;
    this.width = PowerUpItem.HITBOX_SIZE;
    this.height = PowerUpItem.HITBOX_SIZE;

    if (typeof arg1 === 'string') {
      // Signature: init(type, x, y)
      this.type = arg1 as PowerUpType;
      const posX = typeof arg2 === 'number' ? arg2 : 0;
      const posY = typeof arg3 === 'number' ? arg3 : 0;
      this.originX = Math.max(PowerUpItem.MIN_X, Math.min(PowerUpItem.MAX_X, posX));
      this.x = this.originX;
      this.y = posY;
    } else {
      // Signature: init(x, y, type)
      const posX = arg1;
      const posY = typeof arg2 === 'number' ? arg2 : 0;
      this.type = (typeof arg3 === 'string' ? arg3 : PowerUpType.RAPID_FIRE) as PowerUpType;
      this.originX = Math.max(PowerUpItem.MIN_X, Math.min(PowerUpItem.MAX_X, posX));
      this.x = this.originX;
      this.y = posY;
    }

    // Assign randomized or default oscillation phase
    this.swayPhase = Math.random() * Math.PI * 2;
    return this;
  }

  /**
   * Resets internal fields for zero-allocation pool recycling.
   */
  public reset(): void {
    this.active = false;
    this.type = PowerUpType.RAPID_FIRE;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = PowerUpItem.DRIFT_SPEED;
    this.originX = 0;
    this.swayTimer = 0;
    this.swayPhase = 0;
    this.animTimer = 0;
    this.pulseTimer = 0;
    this.width = PowerUpItem.HITBOX_SIZE;
    this.height = PowerUpItem.HITBOX_SIZE;
  }

  /**
   * Updates downward drift (vy = 60 px/s) and horizontal sinusoidal sway (A = 12, omega = 3.0 rad/s).
   * Clamps x within [10, 214].
   * Returns false if item has exited screen boundaries (y > 288), signalling recycling.
   */
  public update(dt: number): boolean {
    if (!this.active) return false;

    // Advance oscillation & animation timers
    this.swayTimer += dt;
    this.animTimer += dt;
    this.pulseTimer += dt;

    // Downward drift integration
    this.y += PowerUpItem.DRIFT_SPEED * dt;

    // Horizontal sinusoidal sway
    const swayOffset = Math.sin(this.swayTimer * PowerUpItem.SWAY_FREQUENCY + this.swayPhase) * PowerUpItem.SWAY_AMPLITUDE;
    this.x = Math.max(PowerUpItem.MIN_X, Math.min(PowerUpItem.MAX_X, this.originX + swayOffset));

    // Despawn check at bottom margin
    if (this.y > PowerUpItem.DESPAWN_Y || this.y < -30) {
      this.active = false;
      return false;
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
   * Renders the floating power-up capsule with procedural pixel art and aura.
   */
  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;

    SpriteRenderer.drawPowerUpItem(
      ctx,
      this.type,
      this.x,
      this.y,
      this.animTimer
    );
  }
}
