/**
 * Galaga Arcade Web Game — Poolable Cluster Bomb Explosion Entity
 * Expanding shockwave AOE that inflicts burst damage to enemies within its blast radius.
 */

import type { Poolable } from '../../../types';
import type { IBombExplosion } from '../types';

export class BombExplosion implements IBombExplosion, Poolable {
  public id: number = 0;
  public active: boolean = false;
  public x: number = 0;
  public y: number = 0;
  public currentRadius: number = 4;
  public maxRadius: number = 28;
  public damage: number = 2;
  public timer: number = 0;
  public maxLife: number = 0.4;
  public hitEnemyIds: string[] = [];

  constructor(id: number = 0) {
    this.id = id;
    this.reset();
  }

  public init(x: number, y: number, maxRadius: number = 28, damage: number = 2, maxLife: number = 0.4): void {
    this.active = true;
    this.x = x;
    this.y = y;
    this.currentRadius = 4;
    this.maxRadius = maxRadius;
    this.damage = damage;
    this.timer = 0;
    this.maxLife = maxLife;
    this.hitEnemyIds.length = 0;
  }

  public reset(): void {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.currentRadius = 4;
    this.maxRadius = 28;
    this.damage = 2;
    this.timer = 0;
    this.maxLife = 0.4;
    this.hitEnemyIds.length = 0;
  }

  /**
   * Updates explosion radius.
   * Returns false when the shockwave has dissipated.
   */
  public update(dt: number): boolean {
    if (!this.active) return false;

    this.timer += dt;
    if (this.timer >= this.maxLife) {
      this.active = false;
      return false;
    }

    const progress = Math.min(1.0, this.timer / this.maxLife);
    // Ease-out expansion: 4 -> 28
    this.currentRadius = 4 + (this.maxRadius - 4) * (1 - Math.pow(1 - progress, 2));

    return true;
  }

  public hasHit(enemyId: string | number): boolean {
    const id = String(enemyId);
    return this.hitEnemyIds.includes(id);
  }

  public recordHit(enemyId: string | number): void {
    const id = String(enemyId);
    if (!this.hitEnemyIds.includes(id)) {
      this.hitEnemyIds.push(id);
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.active || this.currentRadius <= 0) return;

    ctx.save();
    const progress = Math.min(1.0, this.timer / this.maxLife);
    const alpha = Math.max(0, 1.0 - progress);

    // Outer shockwave ring
    ctx.strokeStyle = `rgba(255, 127, 0, ${alpha * 0.9})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner bright core ring
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y, Math.max(1, this.currentRadius * 0.6), 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}
