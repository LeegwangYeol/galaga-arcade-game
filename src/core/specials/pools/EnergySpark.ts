/**
 * Galaga Arcade Web Game — Poolable Energy Spark Entity
 * 
 * Collectible cosmic energy orb dropped upon enemy destruction.
 * Rewards +15% Special Meter and features magnetic near-field funneling toward the player.
 */

import type { Rect, Poolable } from '../../../types';
import type { IEnergySpark } from '../types';
import type { Player } from '../../../entities/Player';
import { SpriteRenderer } from '../../../renderer/SpriteRenderer';

export class EnergySpark implements IEnergySpark, Poolable {
  public id: number = 0;
  public active: boolean = false;
  public x: number = 0;
  public y: number = 0;
  public baseX: number = 0;
  public vx: number = 0;
  public vy: number = 54;
  public timer: number = 0;
  public maxLife: number = 10.0;
  public value: number = 15.0; // +15% Special Energy
  public points: number = 300;
  public width: number = 8;
  public height: number = 8;
  public animFrame: number = 0;
  public animTimer: number = 0;

  public amplitude: number = 10;
  public frequency: number = 3.5;
  public phase: number = 0;
  public magneticRadius: number = 42; // px
  public magneticAcceleration: number = 380; // px/s^2

  constructor(id: number = 0) {
    this.id = id;
    this.reset();
  }

  public init(x: number, y: number, value: number = 15.0, points: number = 300): void {
    this.active = true;
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.vx = 0;
    this.vy = 54;
    this.value = value;
    this.points = points;
    this.timer = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.animFrame = 0;
    this.animTimer = 0;
  }

  public reset(): void {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.baseX = 0;
    this.vx = 0;
    this.vy = 54;
    this.timer = 0;
    this.animFrame = 0;
    this.animTimer = 0;
  }

  /**
   * Updates spark kinematics and magnetic attraction toward player.
   */
  public update(dt: number, player?: Player | null): boolean {
    if (!this.active) return false;

    this.timer += dt;
    if (this.timer >= this.maxLife) {
      this.active = false;
      return false;
    }

    // Check magnetic attraction toward player
    let isMagnetized = false;
    if (player && player.state !== 'DESTROYED') {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= this.magneticRadius) {
        isMagnetized = true;
        if (dist > 0.1) {
          const accel = this.magneticAcceleration * dt;
          this.vx += (dx / dist) * accel;
          this.vy += (dy / dist) * accel;
        }
        this.x += this.vx * dt;
        this.y += this.vy * dt;
      }
    }

    if (!isMagnetized) {
      // Natural downward harmonic flutter
      this.y += this.vy * dt;
      this.baseX += this.vx * dt;
      this.x = this.baseX + this.amplitude * Math.sin(this.frequency * this.timer + this.phase);
    }

    // Animation frame cycling (8 Hz)
    this.animTimer += dt;
    if (this.animTimer >= 0.125) {
      this.animTimer -= 0.125;
      this.animFrame = (this.animFrame + 1) % 2;
    }

    // Screen Boundary check
    if (this.y > 290 || this.x < -10 || this.x > 234) {
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

    if (SpriteRenderer.hasDefinition('ITEM_ENERGY_SPARK')) {
      SpriteRenderer.draw(ctx, 'ITEM_ENERGY_SPARK', this.x, this.y, {
        frame: this.animFrame,
      });
    } else {
      ctx.save();
      ctx.fillStyle = this.animFrame === 0 ? '#00FFFF' : '#FFFF00';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
