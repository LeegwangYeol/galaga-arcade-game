/**
 * Nemesis Star-Eater Crisis Event
 * Dark Matter Ignition: Ambient space darkens to deep violet; sweeping energy beam.
 */

import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType } from '../types';

export class NemesisStarEaterEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.NEMESIS_STAR_EATER;
  public readonly name = 'NEMESIS STAR-EATER';
  public readonly flavorText = 'DARK MATTER IGNITION: BOSS GALAGA BEAM CANNON';
  public override readonly warningDuration = 3.0;
  public override readonly activeDuration = 20.0;

  public beamState: 'IDLE' | 'CHARGING' | 'FIRING' = 'IDLE';
  public beamTimer: number = 0;
  public beamX: number = 112;
  public beamWidth: number = 18;

  protected override onInit(): void {
    this.beamState = 'IDLE';
    this.beamTimer = 0;
    this.beamX = 112;
  }

  protected override onActivated(): void {
    this.beamState = 'IDLE';
    this.beamTimer = 0;
    this.beamX = 112;
  }

  protected override onActiveUpdate(dt: number): void {
    this.beamTimer += dt;

    if (this.beamState === 'IDLE') {
      if (this.beamTimer >= 1.5) {
        this.beamState = 'CHARGING';
        this.beamTimer = 0;
        this.beamX = this.context.player?.x ?? 112;
      }
    } else if (this.beamState === 'CHARGING') {
      if (this.beamTimer >= 1.2) {
        this.beamState = 'FIRING';
        this.beamTimer = 0;
      }
    } else if (this.beamState === 'FIRING') {
      // Horizontal beam sweep
      this.beamX += Math.sin(this.beamTimer * 4.0) * 40 * dt;

      // Check collision against player
      const player = this.context.player as any;
      if (player && player.state !== 'destroyed' && player.state !== 'DESTROYED') {
        const halfWidth = this.beamWidth / 2;
        const playerLeft = player.x - 8;
        const playerRight = player.x + 8;

        if (playerRight >= this.beamX - halfWidth && playerLeft <= this.beamX + halfWidth) {
          if (player.hasShield || (player.shieldHits && player.shieldHits > 0)) {
            // Shield absorbs the beam
            player.shieldHits = 0;
            player.hasShield = false;
            player.invulnerableTimer = 1.0;
            try {
              this.context.particleSystem?.spawnExplosion?.(player.x, player.y, 'HIT');
            } catch {
              // Defensive
            }
          } else {
            const isInvuln = (typeof player.isInvincible === 'function' ? player.isInvincible() : false) ||
              (typeof player.isInvulnerable === 'function' ? player.isInvulnerable() : (player.invulnerableTimer > 0));
            if (!isInvuln) {
              if (typeof player.destroy === 'function') {
                player.destroy();
              } else if (typeof player.onExplode === 'function') {
                player.onExplode(player.x, player.y, player.isDual);
              }
            }
          }
        }
      }

      if (this.beamTimer >= 1.5) {
        this.beamState = 'IDLE';
        this.beamTimer = 0;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE') return;

    ctx.save();
    // 1. Ambient dark matter void tint
    ctx.fillStyle = 'rgba(15, 5, 29, 0.40)';
    ctx.fillRect(0, 0, 224, 288);

    // 2. Beam Charge or Fire rendering
    if (this.beamState === 'CHARGING') {
      const chargeAlpha = 0.3 + Math.sin(this.beamTimer * 16.0) * 0.3;
      ctx.fillStyle = `rgba(192, 132, 252, ${chargeAlpha})`;
      ctx.fillRect(Math.floor(this.beamX - 1), 0, 2, 288);
    } else if (this.beamState === 'FIRING') {
      const halfW = this.beamWidth / 2;
      // Outer purple glow
      ctx.fillStyle = 'rgba(126, 34, 206, 0.45)';
      ctx.fillRect(Math.floor(this.beamX - halfW - 4), 0, this.beamWidth + 8, 288);

      // Core beam
      ctx.fillStyle = '#A855F7';
      ctx.fillRect(Math.floor(this.beamX - halfW), 0, this.beamWidth, 288);

      // Searing center ray
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(Math.floor(this.beamX - 2), 0, 4, 288);
    }
    ctx.restore();
  }

  protected override onDeactivated(): void {
    this.beamState = 'IDLE';
    this.beamTimer = 0;
  }

  protected override onReset(): void {
    this.onDeactivated();
  }
}
