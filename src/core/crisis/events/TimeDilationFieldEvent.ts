/**
 * Time Dilation Field Crisis Event
 * Chrono Anomaly: Oscillating temporal pulses between 1.5x hyper-speed and 0.5x bullet-time.
 */

import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType } from '../types';

export class TimeDilationFieldEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.TIME_DILATION_FIELD;
  public readonly name = 'TIME DILATION FIELD';
  public readonly flavorText = 'CHRONO ANOMALY: OSCILLATING TEMPORAL PULSE';
  public override readonly warningDuration = 3.0;
  public override readonly activeDuration = 20.0;

  public currentScale: number = 1.0;
  public targetScale: number = 1.5;
  public phase: 'HYPER_SPEED' | 'BULLET_TIME' = 'HYPER_SPEED';
  public phaseTimer: number = 0;
  public static readonly PHASE_DURATION = 3.5;

  protected override onInit(): void {
    this.phase = 'HYPER_SPEED';
    this.currentScale = 1.0;
    this.targetScale = 1.5;
    this.phaseTimer = 0;
  }

  protected override onActivated(): void {
    this.phase = 'HYPER_SPEED';
    this.currentScale = 1.0;
    this.targetScale = 1.5;
    this.phaseTimer = 0;
  }

  protected override onActiveUpdate(dt: number): void {
    this.phaseTimer += dt;

    // Switch phases every 3.5 seconds
    if (this.phaseTimer >= TimeDilationFieldEvent.PHASE_DURATION) {
      this.phaseTimer = 0;
      if (this.phase === 'HYPER_SPEED') {
        this.phase = 'BULLET_TIME';
        this.targetScale = 0.5;
      } else {
        this.phase = 'HYPER_SPEED';
        this.targetScale = 1.5;
      }
    }

    // Smooth interpolation of time scale
    this.currentScale += (this.targetScale - this.currentScale) * Math.min(1.0, 4.0 * dt);

    // Apply speed scale to formation and starfield
    const fm = this.context?.formationManager;
    if (fm) {
      fm.diveSpeedMultiplier = this.currentScale;
    }

    const sf = this.context?.starfield as any;
    if (sf) {
      if (typeof sf.setTargetSpeedMultiplier === 'function') {
        sf.setTargetSpeedMultiplier(this.currentScale);
      }
      sf.speedMultiplier = this.currentScale;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE') return;

    ctx.save();
    // Expanding golden/cyan chrono ripple ring
    const progress = this.phaseTimer / TimeDilationFieldEvent.PHASE_DURATION;
    const radius = 10 + progress * 140;
    const alpha = Math.max(0, 0.45 * (1.0 - progress));

    ctx.strokeStyle = this.phase === 'HYPER_SPEED' ? `rgba(245, 158, 11, ${alpha})` : `rgba(56, 189, 248, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(112, 144, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  protected override onDeactivated(): void {
    this.currentScale = 1.0;
    this.targetScale = 1.0;

    const fm = this.context?.formationManager;
    if (fm) {
      fm.diveSpeedMultiplier = 1.0;
    }

    const sf = this.context?.starfield as any;
    if (sf) {
      if (typeof sf.setTargetSpeedMultiplier === 'function') {
        sf.setTargetSpeedMultiplier(1.0);
      }
      sf.speedMultiplier = 1.0;
    }
  }

  protected override onReset(): void {
    this.onDeactivated();
    this.phaseTimer = 0;
  }
}
