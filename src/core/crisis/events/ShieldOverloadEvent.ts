/**
 * Shield Overload Crisis Event
 * Energy Matrix Overdrive: +2 shields for all living enemies in formation.
 */

import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType } from '../types';

export class ShieldOverloadEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.SHIELD_OVERLOAD;
  public readonly name = 'SHIELD OVERLOAD';
  public readonly flavorText = 'ENERGY MATRIX OVERDRIVE';
  public override readonly warningDuration = 3.0;
  public override readonly activeDuration = 20.0;

  private hexRotation: number = 0;
  private sweepY: number = 0;
  private isSweeping: boolean = true;

  protected override onInit(): void {
    this.hexRotation = 0;
    this.sweepY = 0;
    this.isSweeping = false;
  }

  protected override onActivated(): void {
    this.hexRotation = 0;
    this.sweepY = 0;
    this.isSweeping = true;

    // Grant +2 Kinetic Shields to all living enemies
    if (this.context?.formationManager) {
      const enemies = this.context.formationManager.enemies || [];
      for (const enemy of enemies) {
        if (enemy.active && enemy.state !== 'INACTIVE') {
          enemy.maxShield = Math.max(enemy.maxShield || 0, (enemy.shield || 0) + 2);
          enemy.shield = (enemy.shield || 0) + 2;
        }
      }
    }
  }

  protected override onActiveUpdate(dt: number): void {
    this.hexRotation += 0.8 * dt;

    if (this.isSweeping) {
      this.sweepY += 220 * dt;
      if (this.sweepY > 288) {
        this.isSweeping = false;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE') return;

    ctx.save();

    // 1. Kinetic Interlink Laser Filaments between Formation Enemies
    if (this.context?.formationManager) {
      const enemies = this.context.formationManager.enemies || [];
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < enemies.length; i++) {
        const e1 = enemies[i];
        if (!e1.active || (e1.shield || 0) <= 0) continue;
        for (let j = i + 1; j < enemies.length; j++) {
          const e2 = enemies[j];
          if (!e2.active || (e2.shield || 0) <= 0) continue;
          const distSq = (e1.x - e2.x) ** 2 + (e1.y - e2.y) ** 2;
          if (distSq < 750) {
            ctx.moveTo(Math.floor(e1.x), Math.floor(e1.y));
            ctx.lineTo(Math.floor(e2.x), Math.floor(e2.y));
          }
        }
      }
      ctx.stroke();

      // 2. Rotating Hexagonal Kinetic Barriers
      for (const enemy of enemies) {
        if (!enemy.active || (enemy.shield || 0) <= 0) continue;
        const s = enemy.shield || 0;
        ctx.strokeStyle = s >= 2 ? '#00E5FF' : '#80D8FF';
        ctx.lineWidth = 1;

        // Outer Hexagon
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const angle = this.hexRotation + (k * Math.PI) / 3;
          const hx = enemy.x + 12 * Math.cos(angle);
          const hy = enemy.y + 12 * Math.sin(angle);
          if (k === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();

        // Inner Hexagon for shield >= 2
        if (s >= 2) {
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const angle = -this.hexRotation + (k * Math.PI) / 3;
            const hx = enemy.x + 8 * Math.cos(angle);
            const hy = enemy.y + 8 * Math.sin(angle);
            if (k === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
    }

    // 3. Activation Energy Sweep Bar
    if (this.isSweeping) {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.4)';
      ctx.fillRect(0, Math.floor(this.sweepY) - 2, 224, 4);
    }

    ctx.restore();
  }

  protected override onDeactivated(): void {
    this.isSweeping = false;
  }

  protected override onReset(): void {
    this.onInit();
  }
}
