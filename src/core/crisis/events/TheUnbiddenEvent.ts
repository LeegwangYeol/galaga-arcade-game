/**
 * The Unbidden Crisis Event
 * Dimensional Tear: Gravitational anomaly bending player bullet trajectories toward center.
 */

import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType } from '../types';

export class TheUnbiddenEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.THE_UNBIDDEN;
  public readonly name = 'THE UNBIDDEN';
  public readonly flavorText = 'DIMENSIONAL TEAR DETECTED';
  public override readonly warningDuration = 3.0;
  public override readonly activeDuration = 20.0;

  private riftX: number = 112;
  private riftY: number = 60;
  private vortexAngle: number = 0;

  // Zero-allocation buffer for 24 inward spiraling motes
  private moteR = new Float32Array(24);
  private moteTheta = new Float32Array(24);
  private moteSpeed = new Float32Array(24);

  // Zero-allocation 10-vertex jagged fissure tear offsets
  private tearOffsetX = new Float32Array(10);
  private tearOffsetY = new Float32Array(10);

  protected override onInit(): void {
    this.vortexAngle = 0;
    for (let i = 0; i < 24; i++) {
      this.moteR[i] = 20 + Math.random() * 60;
      this.moteTheta[i] = Math.random() * Math.PI * 2;
      this.moteSpeed[i] = 25 + Math.random() * 25;
    }

    const angles = [0, 0.63, 1.26, 1.88, 2.51, 3.14, 3.77, 4.40, 5.03, 5.65];
    for (let i = 0; i < 10; i++) {
      const a = angles[i]!;
      const r = 12 + (i % 2 === 0 ? 6 : -3) + (i % 3);
      this.tearOffsetX[i] = Math.cos(a) * r;
      this.tearOffsetY[i] = Math.sin(a) * r * 0.7;
    }
  }

  protected override onActivated(): void {
    this.vortexAngle = 0;
    for (let i = 0; i < 24; i++) {
      this.moteR[i] = 20 + Math.random() * 60;
      this.moteTheta[i] = Math.random() * Math.PI * 2;
      this.moteSpeed[i] = 25 + Math.random() * 25;
    }

    const synth = this.context.soundSynth as any;
    if (synth && typeof synth.playCrisisKlaxon === 'function') {
      synth.playCrisisKlaxon();
    }
    if (synth && typeof synth.playDimensionalTearHum === 'function') {
      synth.playDimensionalTearHum();
    }
  }

  protected override onActiveUpdate(dt: number): void {
    this.vortexAngle += 2.2 * dt;

    const { bulletManager } = this.context;

    // 1. Softened Gravitational Trajectory Bending on Player Missiles
    if (bulletManager) {
      const G = 280000;
      const epsSq = 400; // 20^2 px^2
      const iterateBullets = bulletManager.forEachActivePlayerBullet
        ? (cb: (b: any) => void) => bulletManager.forEachActivePlayerBullet(cb)
        : (cb: (b: any) => void) => bulletManager.forEachPlayerBullet?.(cb);

      if (iterateBullets) {
        iterateBullets((bullet: any) => {
          if (!bullet.active || !bullet.position || !bullet.velocity) return;
          const dx = this.riftX - bullet.position.x;
          const dy = this.riftY - bullet.position.y;
          const rSq = dx * dx + dy * dy;
          const denom = Math.pow(rSq + epsSq, 1.5);
          const ax = (G * dx) / denom;
          const ay = (G * dy) / denom;

          bullet.velocity.x += ax * dt;
          bullet.velocity.y += ay * dt;
          bullet.velocity.x = Math.max(-280, Math.min(280, bullet.velocity.x));
        });
      }
    }

    // 2. Inward Spiraling Void Motes
    for (let i = 0; i < 24; i++) {
      const spd = this.moteSpeed[i]!;
      const r = this.moteR[i]! - spd * dt;
      const th = this.moteTheta[i]! + (2.2 + 35 / (r + 5)) * dt;
      if (r <= 3) {
        this.moteR[i] = 70 + Math.random() * 20;
        this.moteTheta[i] = Math.random() * Math.PI * 2;
      } else {
        this.moteR[i] = r;
        this.moteTheta[i] = th;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE') return;

    ctx.save();

    // 1. Outer Dimensional Aurora & Gravitational Ripples
    const grad = ctx.createRadialGradient(this.riftX, this.riftY, 4, this.riftX, this.riftY, 55);
    grad.addColorStop(0, 'rgba(138, 43, 226, 0.45)');
    grad.addColorStop(0.5, 'rgba(0, 255, 255, 0.20)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.riftX, this.riftY, 55, 0, Math.PI * 2);
    ctx.fill();

    // Outward gravitational distortion ripples
    const rippleRadius = 24 + ((this.vortexAngle * 20) % 36);
    ctx.strokeStyle = 'rgba(255, 0, 255, 0.35)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(this.riftX, this.riftY, rippleRadius, 0, Math.PI * 2);
    ctx.stroke();

    // 2. Rotating Vortex Arms
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 1.5;
    for (let arm = 0; arm < 3; arm++) {
      const baseA = this.vortexAngle + (arm * Math.PI * 2) / 3;
      ctx.beginPath();
      for (let step = 0; step < 16; step++) {
        const r = 6 + step * 2.8;
        const theta = baseA + step * 0.25;
        const x = this.riftX + r * Math.cos(theta);
        const y = this.riftY + r * Math.sin(theta) * 0.75;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 3. Jagged 10-vertex Spacetime Fissure Tear Core
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const jx = this.riftX + this.tearOffsetX[i]! + Math.sin(this.vortexAngle * 4 + i) * 1.5;
      const jy = this.riftY + this.tearOffsetY[i]! + Math.cos(this.vortexAngle * 4 + i) * 1.5;
      if (i === 0) ctx.moveTo(jx, jy);
      else ctx.lineTo(jx, jy);
    }
    ctx.closePath();
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.strokeStyle = '#FF00FF';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 4. Inward Spiraling Motes
    ctx.fillStyle = '#00FFFF';
    for (let i = 0; i < 24; i++) {
      const mr = this.moteR[i]!;
      const mth = this.moteTheta[i]!;
      const x = Math.floor(this.riftX + mr * Math.cos(mth));
      const y = Math.floor(this.riftY + mr * Math.sin(mth) * 0.75);
      ctx.fillRect(x, y, 1, 1);
    }

    ctx.restore();
  }

  protected override onDeactivated(): void {
    const synth = this.context.soundSynth as any;
    if (synth && typeof synth.stopDimensionalTearHum === 'function') {
      synth.stopDimensionalTearHum();
    }
  }

  protected override onReset(): void {
    this.onInit();
  }
}
