/**
 * Physics Inversion Crisis Event
 * Singularity Shift: Starfield flow reverses upward, enemy dives loop unpredictably.
 */

import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType } from '../types';

export class PhysicsInversionEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.PHYSICS_INVERSION;
  public readonly name = 'PHYSICS INVERSION';
  public readonly flavorText = 'SINGULARITY SHIFT';
  public override readonly warningDuration = 3.0;
  public override readonly activeDuration = 20.0;

  private gridPhase: number = 0;

  protected override onInit(): void {
    this.gridPhase = 0;
  }

  protected override onActivated(): void {
    this.gridPhase = 0;
  }

  protected override onActiveUpdate(dt: number): void {
    this.gridPhase += 3.0 * dt;
    const { starfield, formationManager } = this.context;

    // 1. Reverse Upward Starfield Movement
    if (starfield && typeof starfield.getStars === 'function') {
      const stars = starfield.getStars();
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i] as any;
        if (!star) continue;
        star.y -= (star.speed || 30) * 2.2 * dt;
        if (star.y < 0) {
          star.y += 288;
          star.x = Math.random() * 224;
        }
      }
    }

    // 2. Inverted Anti-Gravity Upward Loops for Diving Enemies
    if (formationManager) {
      const enemies = formationManager.enemies || [];
      for (const enemy of enemies) {
        if (enemy.active && (enemy.state === 'DIVING_SOLO' || enemy.state === 'DIVING_ESCORT')) {
          const antiG = -110 * Math.sin((Math.PI * enemy.y) / 144) * dt;
          enemy.vy = Math.max(-100, (enemy.vy || 0) + antiG);
        }
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE') return;

    ctx.save();

    // 1. Warped Gravity Grid
    ctx.strokeStyle = 'rgba(138, 43, 226, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 16; x < 224; x += 32) {
      ctx.moveTo(x, 0);
      for (let y = 0; y < 288; y += 16) {
        const dx = Math.sin(y * 0.05 + this.gridPhase) * 3;
        ctx.lineTo(x + dx, y);
      }
    }
    for (let y = 16; y < 288; y += 32) {
      ctx.moveTo(0, y);
      for (let x = 0; x < 224; x += 16) {
        const dy = Math.cos(x * 0.05 + this.gridPhase) * 3;
        ctx.lineTo(x, y + dy);
      }
    }
    ctx.stroke();

    // 2. Ascending Gravity Chevrons (Upward motion indicator)
    ctx.fillStyle = 'rgba(0, 255, 255, 0.25)';
    const offset = (this.elapsedTime * 60) % 48;
    for (let y = 280 - offset; y > 0; y -= 48) {
      ctx.fillText('^', 6, y);
      ctx.fillText('^', 212, y);
    }

    ctx.restore();
  }

  protected override onDeactivated(): void {
    if (this.context?.starfield) {
      if (typeof this.context.starfield.setSpeedState === 'function') {
        this.context.starfield.setSpeedState('NORMAL');
      }
      if (typeof this.context.starfield.setTargetSpeedMultiplier === 'function') {
        this.context.starfield.setTargetSpeedMultiplier(1.0);
      }
      this.context.starfield.speedMultiplier = 1.0;
    }
  }

  protected override onReset(): void {
    this.onInit();
  }
}
