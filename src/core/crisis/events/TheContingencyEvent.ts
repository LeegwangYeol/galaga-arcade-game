/**
 * The Contingency Crisis Event
 * AI Rogue Pulse: Predictive enemy bullet aim and player fire rate stutter.
 */

import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType } from '../types';

export class TheContingencyEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.THE_CONTINGENCY;
  public readonly name = 'THE CONTINGENCY';
  public readonly flavorText = 'GHOST SIGNAL OVERRIDE';
  public override readonly warningDuration = 3.0;
  public override readonly activeDuration = 20.0;

  private pulseTimer: number = 0;
  private isPulsing: boolean = false;
  private pulseRadius: number = 0;
  private stutterTimer: number = 0;
  private vsyncBarY: number = 0;

  // Zero-allocation matrix rain buffer
  private matrixDropX = new Float32Array([16, 28, 44, 60, 76, 92, 108, 124, 140, 156, 172, 188, 204, 36, 100, 164]);
  private matrixDropY = new Float32Array(16);
  private matrixDropSpeed = new Float32Array(16);

  protected override onInit(): void {
    this.pulseTimer = 0;
    this.isPulsing = false;
    this.pulseRadius = 0;
    this.stutterTimer = 0;
    this.vsyncBarY = 0;
    for (let i = 0; i < 16; i++) {
      this.matrixDropY[i] = Math.random() * 288;
      this.matrixDropSpeed[i] = 40 + Math.random() * 40;
    }
  }

  protected override onActivated(): void {
    this.pulseTimer = 0;
    this.isPulsing = false;
    this.pulseRadius = 0;
    this.stutterTimer = 0;
    this.vsyncBarY = 0;
    const synth = this.context.soundSynth as any;
    if (synth && typeof synth.playCrisisKlaxon === 'function') {
      synth.playCrisisKlaxon();
    }
  }

  protected override onActiveUpdate(dt: number): void {
    const { player, bulletManager } = this.context;

    // V-Sync bar motion
    this.vsyncBarY = (this.vsyncBarY + 140 * dt) % 288;

    // 1. Rogue AI EMP Pulse
    this.pulseTimer += dt;
    if (this.pulseTimer >= 3.5) {
      this.pulseTimer = 0;
      this.isPulsing = true;
      this.pulseRadius = 0;
      const synth = this.context.soundSynth as any;
      if (synth && typeof synth.playDigitalGlitch === 'function') {
        synth.playDigitalGlitch();
      }
    }

    if (this.isPulsing) {
      this.pulseRadius += 350 * dt;
      if (this.pulseRadius > 320) {
        this.isPulsing = false;
      }
    }

    // 2. Predictive Enemy Bullet Micro-Homing Steering
    if (bulletManager && player) {
      const px = player.x;
      const py = player.y;
      const iterateBullets = bulletManager.forEachActiveEnemyBullet
        ? (cb: (b: any) => void) => bulletManager.forEachActiveEnemyBullet(cb)
        : (cb: (b: any) => void) => bulletManager.forEachEnemyBullet?.(cb);

      if (iterateBullets) {
        iterateBullets((bullet: any) => {
          if (!bullet.active || !bullet.position || bullet.position.y >= py - 15) return;
          const dx = px - bullet.position.x;
          const steer = Math.sign(dx) * 85 * dt;
          if (bullet.velocity) {
            bullet.velocity.x = Math.max(-120, Math.min(120, bullet.velocity.x + steer));
            bullet.angle = Math.atan2(bullet.velocity.y, bullet.velocity.x);
          }
        });
      }
    }

    // 3. Player Fire Rate Stutter
    if (player) {
      this.stutterTimer += dt;
      const cycle = this.stutterTimer % 2.6;
      if (cycle < 0.45 && player.fireCooldownTimer !== undefined && player.fireCooldownTimer > 0) {
        player.fireCooldownTimer = Math.max(player.fireCooldownTimer, 0.22);
      }
    }

    // 4. Matrix Digital Rain Update
    for (let i = 0; i < 16; i++) {
      const y = this.matrixDropY[i]!;
      const spd = this.matrixDropSpeed[i]!;
      const newY = y + spd * dt;
      this.matrixDropY[i] = newY > 288 ? -10 : newY;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE') return;

    ctx.save();

    // 1. Phosphor Green Rolling CRT Scanlines (3px stride)
    ctx.fillStyle = 'rgba(0, 255, 65, 0.05)';
    for (let y = 0; y < 288; y += 3) {
      ctx.fillRect(0, y, 224, 1);
    }

    // 2. Rolling V-Sync Refresh Bar
    ctx.fillStyle = 'rgba(0, 255, 100, 0.08)';
    ctx.fillRect(0, Math.floor(this.vsyncBarY), 224, 8);

    // 3. Single-Frame Horizontal Glitch Displacement
    if (Math.random() < 0.15) {
      const gy = Math.floor(Math.random() * 280);
      const gOffset = Math.floor((Math.random() - 0.5) * 6);
      ctx.fillStyle = 'rgba(0, 255, 65, 0.15)';
      ctx.fillRect(gOffset, gy, 224, 2);
    }

    // 4. Expanding Pulse Wavefront
    if (this.isPulsing) {
      const alpha = Math.max(0, 1 - this.pulseRadius / 320);
      ctx.strokeStyle = `rgba(0, 255, 100, ${alpha * 0.7})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(112, 0, this.pulseRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 5. Matrix Digital Code Drops
    ctx.fillStyle = '#00FF41';
    for (let i = 0; i < 16; i++) {
      const px = Math.floor(this.matrixDropX[i]!);
      const py = Math.floor(this.matrixDropY[i]!);
      ctx.fillRect(px, py, 2, 4);
      ctx.fillRect(px, py - 6, 1, 3);
    }

    ctx.restore();
  }

  protected override onDeactivated(): void {
    this.isPulsing = false;
  }

  protected override onReset(): void {
    this.onInit();
  }
}
