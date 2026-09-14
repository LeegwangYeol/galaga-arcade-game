/**
 * Hyperspace Storm Crisis Event
 * Cosmic Lightning Lanes: Periodic vertical plasma strikes, enemy dive speed boost +25%.
 */

import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType } from '../types';

export class HyperspaceStormEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.HYPERSPACE_STORM;
  public readonly name = 'HYPERSPACE STORM';
  public readonly flavorText = 'HYPERLANE TEMPEST DETECTED';
  public override readonly warningDuration = 3.0;
  public override readonly activeDuration = 20.0;

  private baseDiveSpeedMultiplier: number = 1.0;

  // Lightning Lane State Machine
  private laneState: 'IDLE' | 'WARNING' | 'STRIKING' = 'IDLE';
  private activeLane: number = -1;
  private laneTimer: number = 0;
  private laneCycleTimer: number = 0;
  private flashAlpha: number = 0;

  // Pre-allocated buffers for primary trunk and 2 branching forks
  private boltX = new Float32Array(12);
  private boltY = new Float32Array(12);
  private branch1X = new Float32Array(6);
  private branch1Y = new Float32Array(6);
  private branch2X = new Float32Array(6);
  private branch2Y = new Float32Array(6);

  protected override onInit(): void {
    this.laneState = 'IDLE';
    this.activeLane = -1;
    this.laneTimer = 0;
    this.laneCycleTimer = 0;
    this.flashAlpha = 0;
  }

  protected override onActivated(): void {
    this.laneState = 'IDLE';
    this.laneCycleTimer = 0;
    this.flashAlpha = 0;

    const synth = this.context.soundSynth as any;
    if (synth && typeof synth.playCrisisKlaxon === 'function') {
      synth.playCrisisKlaxon();
    }

    // Boost Formation Dive Speed by +25%
    if (this.context?.formationManager) {
      this.baseDiveSpeedMultiplier = this.context.formationManager.diveSpeedMultiplier || 1.0;
      this.context.formationManager.diveSpeedMultiplier = this.baseDiveSpeedMultiplier * 1.25;
    }
  }

  protected override onActiveUpdate(dt: number): void {
    const { player } = this.context;

    // Decay Flash Alpha
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - 3.5 * dt);
    }

    // Lightning Lane State Machine
    switch (this.laneState) {
      case 'IDLE':
        this.laneCycleTimer += dt;
        if (this.laneCycleTimer >= 2.4) {
          this.laneCycleTimer = 0;
          this.activeLane = Math.floor(Math.random() * 7); // 7 lanes (0..6)
          this.laneState = 'WARNING';
          this.laneTimer = 0;
        }
        break;

      case 'WARNING':
        this.laneTimer += dt;
        if (this.laneTimer >= 0.9) {
          this.laneState = 'STRIKING';
          this.laneTimer = 0;
          this.flashAlpha = 0.28;
          this.generateBolt(this.activeLane);

          // Strike Sound
          try {
            const synth = this.context.soundSynth as any;
            if (synth && typeof synth.playLightningCrackle === 'function') {
              synth.playLightningCrackle();
            } else {
              this.context.soundSynth?.playExplosion?.('boss');
            }
          } catch {
            // Defensive
          }
        }
        break;

      case 'STRIKING':
        this.laneTimer += dt;

        // Lethal Lane Collision with Player
        if (player && (player.state === 'normal' || player.state === 'ALIVE' || player.state === 'dual' || player.state === 'DUAL')) {
          const invuln = (typeof player.isInvulnerable === 'function' ? player.isInvulnerable() : (player.invulnerableTimer > 0));
          if (!invuln) {
            const laneMinX = this.activeLane * 32;
            const laneMaxX = (this.activeLane + 1) * 32;
            const pHalfW = player.isDual ? 16 : 8;
            if (player.x + pHalfW > laneMinX && player.x - pHalfW < laneMaxX) {
              if (typeof player.destroy === 'function') {
                player.destroy();
              } else if (typeof player.onExplode === 'function') {
                player.onExplode(player.x, player.y, player.isDual);
              }
            }
          }
        }

        if (this.laneTimer >= 0.25) {
          this.laneState = 'IDLE';
          this.activeLane = -1;
        }
        break;
    }
  }

  private generateBolt(laneIndex: number): void {
    const cx = laneIndex * 32 + 16;
    for (let i = 0; i < 12; i++) {
      this.boltY[i] = (288 * i) / 11;
      this.boltX[i] = cx + (Math.random() - 0.5) * 16;
    }
    // Branch 1 starts from node 3
    const startX1 = this.boltX[3]!;
    const startY1 = this.boltY[3]!;
    for (let i = 0; i < 6; i++) {
      this.branch1Y[i] = startY1 + i * 18;
      this.branch1X[i] = startX1 - i * 4 + (Math.random() - 0.5) * 8;
    }
    // Branch 2 starts from node 7
    const startX2 = this.boltX[7]!;
    const startY2 = this.boltY[7]!;
    for (let i = 0; i < 6; i++) {
      this.branch2Y[i] = startY2 + i * 18;
      this.branch2X[i] = startX2 + i * 4 + (Math.random() - 0.5) * 8;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE') return;

    ctx.save();

    // 1. Pre-Discharge Warning Column & Ionized Boundaries
    if (this.laneState === 'WARNING' && this.activeLane >= 0) {
      const lx = this.activeLane * 32;
      const alpha = 0.18 + 0.14 * Math.sin(this.laneTimer * 25);
      ctx.fillStyle = `rgba(255, 0, 128, ${alpha})`;
      ctx.fillRect(lx, 0, 32, 288);

      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(lx + 1, 0, 30, 288);
    }

    // 2. Cosmic Lightning Bolt Discharge with Branching Forks
    if (this.laneState === 'STRIKING' && this.activeLane >= 0) {
      // Glow sheath for main trunk
      ctx.strokeStyle = '#8A2BE2';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const bx = this.boltX[i]!;
        const by = this.boltY[i]!;
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.stroke();

      // Branch 1 sheath
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const bx = this.branch1X[i]!;
        const by = this.branch1Y[i]!;
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.stroke();

      // Branch 2 sheath
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const bx = this.branch2X[i]!;
        const by = this.branch2Y[i]!;
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.stroke();

      // Cyan core
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const bx = this.boltX[i]!;
        const by = this.boltY[i]!;
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.stroke();

      // White filament
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const bx = this.boltX[i]!;
        const by = this.boltY[i]!;
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }

    // 3. Screen Plasma Flash
    if (this.flashAlpha > 0.01) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
      ctx.fillRect(0, 0, 224, 288);
    }

    ctx.restore();
  }

  protected override onDeactivated(): void {
    this.laneState = 'IDLE';
    this.activeLane = -1;
    this.flashAlpha = 0;

    // Restore Formation Dive Speed Multiplier
    if (this.context?.formationManager) {
      this.context.formationManager.diveSpeedMultiplier = this.baseDiveSpeedMultiplier;
    }
  }

  protected override onReset(): void {
    this.onInit();
  }
}
