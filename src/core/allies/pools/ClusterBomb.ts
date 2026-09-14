/**
 * Galaga Arcade Web Game — Poolable Cluster Bomb Entity
 * Zero-runtime-GC munition dropped by Bomber Support Drone.
 */

import type { Rect, Poolable } from '../../../types';
import type { IClusterBomb } from '../types';
import { SpriteRenderer } from '../../../renderer/SpriteRenderer';

export class ClusterBomb implements IClusterBomb, Poolable {
  public id: number = 0;
  public active: boolean = false;
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 150;
  public targetY: number = 105;
  public timer: number = 0;
  public maxLife: number = 1.5;
  public width: number = 6;
  public height: number = 8;
  public gravity: number = 60; // px/s^2

  constructor(id: number = 0) {
    this.id = id;
    this.reset();
  }

  public init(x: number, y: number, vx: number = 0, vy: number = 150, targetY: number = 105): void {
    this.active = true;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.targetY = targetY;
    this.timer = 0;
  }

  public reset(): void {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 150;
    this.targetY = 105;
    this.timer = 0;
    this.maxLife = 1.5;
  }

  /**
   * Updates bomb trajectory with gravity acceleration.
   * Returns false when the bomb should detonate.
   */
  public update(dt: number): boolean {
    if (!this.active) return false;

    this.timer += dt;
    if (this.timer >= this.maxLife) {
      return false; // Time out -> Detonate!
    }

    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.y >= this.targetY || this.y > 280) {
      return false; // Target altitude reached or off-screen -> Detonate!
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

    if (SpriteRenderer.hasDefinition('CLUSTER_BOMB')) {
      SpriteRenderer.draw(ctx, 'CLUSTER_BOMB', this.x, this.y);
    } else {
      ctx.save();
      ctx.fillStyle = '#FF7F00';
      ctx.fillRect(this.x - 2, this.y - 3, 4, 6);
      ctx.fillStyle = '#FFFF00';
      ctx.fillRect(this.x - 1, this.y - 1, 2, 2);
      ctx.restore();
    }
  }
}
