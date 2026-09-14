/**
 * Galaga Arcade Web Game — Poolable Nova Missile Entity
 * 
 * 16-missile salvo projectile utilizing Proportional Navigation Guidance
 * to track, curve toward, and destroy enemy targets with zero runtime GC.
 */

import type { Rect, Poolable } from '../../../types';
import type { INovaMissile } from '../types';
import type { Enemy } from '../../../entities/Enemy';
import type { BaseBoss } from '../../boss/BaseBoss';
import { SpriteRenderer } from '../../../renderer/SpriteRenderer';

export class NovaMissile implements INovaMissile, Poolable {
  public id: number = 0;
  public active: boolean = false;
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = -320;
  public angle: number = -Math.PI / 2;
  public speed: number = 320;
  public maxSpeed: number = 580;
  public maxOmega: number = 14.0; // rad/s angular turning rate
  public target: Enemy | BaseBoss | null = null;
  public timer: number = 0;
  public maxLife: number = 2.2;
  public damage: number = 8; // 8 damage per hit against Bosses; instant kill on regular
  public width: number = 6;
  public height: number = 10;
  public animFrame: number = 0;
  public animTimer: number = 0;

  // 5-position ring-buffer exhaust trails (Milestone 14)
  public static readonly TRAIL_LENGTH = 5;
  public trailX = new Float32Array(NovaMissile.TRAIL_LENGTH);
  public trailY = new Float32Array(NovaMissile.TRAIL_LENGTH);
  public trailHead: number = 0;
  public trailCount: number = 0;

  constructor(id: number = 0) {
    this.id = id;
    this.reset();
  }

  public init(
    x: number,
    y: number,
    initialAngle: number,
    target: Enemy | BaseBoss | null = null,
    initialSpeed: number = 320
  ): void {
    this.active = true;
    this.x = x;
    this.y = y;
    this.angle = initialAngle;
    this.speed = initialSpeed;
    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;
    this.target = target;
    this.timer = 0;
    this.animFrame = 0;
    this.animTimer = 0;
    this.trailHead = 0;
    this.trailCount = 0;
    this.trailX.fill(x);
    this.trailY.fill(y);
  }

  public reset(): void {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = -320;
    this.angle = -Math.PI / 2;
    this.speed = 320;
    this.target = null;
    this.timer = 0;
    this.trailHead = 0;
    this.trailCount = 0;
  }

  /**
   * Updates missile position and Proportional Navigation homing steering.
   * Returns false when missile expires or exits bounds.
   */
  public update(dt: number): boolean {
    if (!this.active) return false;

    this.timer += dt;
    if (this.timer >= this.maxLife) {
      this.active = false;
      return false;
    }

    // Accelerate speed over flight duration (320 -> 580 px/s)
    const accelFactor = Math.min(1.0, this.timer / 0.8);
    this.speed = 320 + (this.maxSpeed - 320) * accelFactor;

    // Proportional Navigation homing towards active target
    if (this.target && this.target.active && !(this.target as unknown as { state: string }).state?.includes('EXPLODING')) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const desiredAngle = Math.atan2(dy, dx);

      // Normalize delta angle to [-PI, PI]
      let deltaAngle = desiredAngle - this.angle;
      while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
      while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;

      // Clamp angular rate to maxOmega
      const maxTurn = this.maxOmega * dt;
      const turn = Math.max(-maxTurn, Math.min(maxTurn, deltaAngle));
      this.angle += turn;
    }

    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Record trail position into ring buffer
    this.trailX[this.trailHead] = this.x;
    this.trailY[this.trailHead] = this.y;
    this.trailHead = (this.trailHead + 1) % NovaMissile.TRAIL_LENGTH;
    if (this.trailCount < NovaMissile.TRAIL_LENGTH) {
      this.trailCount++;
    }

    // Animation frames (15 Hz)
    this.animTimer += dt;
    if (this.animTimer >= 0.067) {
      this.animTimer -= 0.067;
      this.animFrame = (this.animFrame + 1) % 2;
    }

    // Screen Boundary check
    if (this.y < -20 || this.y > 300 || this.x < -20 || this.x > 244) {
      this.active = false;
      return false;
    }

    return true;
  }

  public getHitbox(): Rect {
    return {
      x: this.x - this.width / 2,
      y: this.y - this.height / 2,
      width: this.width,
      height: this.height,
    };
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;

    // 1. Render 5-position ring-buffer exhaust trail
    if (this.trailCount > 1) {
      ctx.save();
      ctx.strokeStyle = '#00FFFF';
      ctx.lineCap = 'round';

      for (let i = 0; i < this.trailCount - 1; i++) {
        const currIdx = (this.trailHead - 1 - i + NovaMissile.TRAIL_LENGTH) % NovaMissile.TRAIL_LENGTH;
        const nextIdx = (this.trailHead - 2 - i + NovaMissile.TRAIL_LENGTH) % NovaMissile.TRAIL_LENGTH;

        const alpha = Math.max(0.08, 0.7 - i * 0.15);
        ctx.globalAlpha = alpha;
        ctx.lineWidth = Math.max(0.8, 2.5 - i * 0.4);

        ctx.beginPath();
        ctx.moveTo(this.trailX[currIdx]!, this.trailY[currIdx]!);
        ctx.lineTo(this.trailX[nextIdx]!, this.trailY[nextIdx]!);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Render Missile Sprite
    if (SpriteRenderer.hasDefinition('NOVA_LASER_BEAM')) {
      SpriteRenderer.draw(ctx, 'NOVA_LASER_BEAM', this.x, this.y, {
        rotation: this.angle + Math.PI / 2,
        frame: this.animFrame,
      });
    } else {
      ctx.save();
      ctx.fillStyle = this.animFrame === 0 ? '#00FFFF' : '#FFFF00';
      ctx.fillRect(this.x - 2, this.y - 4, 4, 8);
      ctx.restore();
    }
  }
}
