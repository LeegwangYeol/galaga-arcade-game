/**
 * Galaga Arcade Web Game — Kinetic Aegis Drone Entity
 * 
 * Defensive wingman trailing player ship.
 * Continuously monitors player shield status and emits periodic repair pulses
 * that restore depleted energy deflectors (player.hasShield = true, player.shieldHp = 1)
 * while synchronizing with PowerUpManager.buffState.hasShield.
 */

import { BaseDrone } from '../BaseDrone';
import { DroneType } from '../types';
import type { Game } from '../../Game';
import { SpriteRenderer } from '../../../renderer/SpriteRenderer';

export class AegisDrone extends BaseDrone {
  public readonly type = DroneType.AEGIS;

  // Pulse & Repair Parameters
  public pulseInterval: number = 6.0; // seconds cycle
  public chargeDuration: number = 2.5; // seconds charge time
  public pulseTimer: number = 0;
  public shieldsRepaired: number = 0;
  public repairPulseVisualTimer: number = 0;

  // Point Defense Parameters
  public pointDefenseRadius: number = 12; // px
  public pointDefenseCooldown: number = 0;

  // Kinematic parameters
  public offsetX: number = -18;
  public offsetY: number = -8;
  public bobTimer: number = 0;

  constructor(game: Game) {
    super(game);
  }

  public override activate(duration: number = 0, initialX: number = 112, initialY: number = 250): void {
    super.activate(duration, initialX, initialY);
    this.pulseTimer = 0;
    this.shieldsRepaired = 0;
    this.repairPulseVisualTimer = 0;
    this.pointDefenseCooldown = 0;
    this.x = initialX + this.offsetX;
    this.y = initialY + this.offsetY;
  }

  public override update(dt: number, playerX?: number, playerY?: number): void {
    if (!this.active) return;

    const px = playerX !== undefined ? playerX : (this.game.player ? this.game.player.x : 112);
    const py = playerY !== undefined ? playerY : (this.game.player ? this.game.player.y : 250);

    // Target formation position: trailing flank
    const flankOffsetX = px < 30 ? Math.abs(this.offsetX) : this.offsetX;
    const targetX = px + flankOffsetX;
    this.bobTimer += dt;
    const bobOffset = Math.sin(this.bobTimer * 3.5) * 1.5;
    const targetY = py + this.offsetY + bobOffset;

    // Smooth lerp movement toward target
    const lerpFactor = Math.min(1.0, 7.0 * dt);
    this.x += (targetX - this.x) * lerpFactor;
    this.y += (targetY - this.y) * lerpFactor;

    // Animation frame cycling (8 Hz)
    this.animTimer += dt;
    if (this.animTimer >= 0.125) {
      this.animTimer -= 0.125;
      this.animFrame = (this.animFrame + 1) % 2;
    }

    if (this.repairPulseVisualTimer > 0) {
      this.repairPulseVisualTimer = Math.max(0, this.repairPulseVisualTimer - dt);
    }
    if (this.pointDefenseCooldown > 0) {
      this.pointDefenseCooldown = Math.max(0, this.pointDefenseCooldown - dt);
    }

    // Shield Monitoring & Pulse Generation
    const player = this.game.player;
    if (player) {
      const shieldDown = !player.hasShield || player.shieldHp <= 0;

      if (shieldDown) {
        this.pulseTimer += dt;
        if (this.pulseTimer >= this.pulseInterval) {
          this.emitRepairPulse();
          this.pulseTimer = 0;
        }
      } else {
        // If shield is already active, pulse timer does not exceed interval, preventing overflow
        this.pulseTimer = Math.min(this.pulseInterval, this.pulseTimer + dt);
        if (this.pulseTimer >= this.pulseInterval) {
          // Shield is already full, hold or reset to avoid wasting
          player.shieldHp = Math.min(1, player.shieldHp);
        }
      }
    }

    // Point Defense Flak (intercepts nearby enemy bullets within 12px)
    this.interceptNearbyEnemyBullets();

    // Lifetime management if duration set
    if (this.duration > 0) {
      this.lifetimeTimer += dt;
      if (this.lifetimeTimer >= this.duration) {
        this.deactivate();
      }
    }
  }

  public emitRepairPulse(): void {
    const player = this.game.player;
    if (!player) return;

    player.hasShield = true;
    player.shieldHp = 1;
    player.shieldFlashTimer = 0.3;

    // Bi-directional synchronization with PowerUpManager
    if (this.game.powerUpManager) {
      this.game.powerUpManager.buffState.hasShield = true;
    }

    this.shieldsRepaired++;
    this.repairPulseVisualTimer = 0.4;

    // Sparkles
    if (this.game.particleSystem) {
      this.game.particleSystem.spawnTractorSparkle(player.x, player.y);
      this.game.particleSystem.spawnTractorSparkle(this.x, this.y);
    }

    // Audio chime
    if (this.game.soundSynth && typeof (this.game.soundSynth as unknown as { playDockingChime?: () => void }).playDockingChime === 'function') {
      (this.game.soundSynth as unknown as { playDockingChime: () => void }).playDockingChime();
    }
  }

  public interceptHostileBullets(): void {
    this.interceptNearbyEnemyBullets();
  }

  public interceptNearbyEnemyBullets(): void {
    if (!this.active || !this.game.bulletManager) return;
    if (this.pointDefenseCooldown > 0) return;
    this.game.bulletManager.forEachActiveEnemyBullet((bullet) => {
      if (!bullet.active) return;
      const dx = bullet.position.x - this.x;
      const dy = bullet.position.y - this.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= this.pointDefenseRadius * this.pointDefenseRadius) {
        this.game.bulletManager.recycle(bullet);
        if (this.game.particleSystem) {
          this.game.particleSystem.spawnHitSparks(bullet.position.x, bullet.position.y);
        }
      }
    });
  }

  public override render(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;

    if (SpriteRenderer.hasDefinition('DRONE_AEGIS')) {
      SpriteRenderer.draw(ctx, 'DRONE_AEGIS', this.x, this.y, {
        frame: this.animFrame,
      });
    } else {
      ctx.save();
      ctx.fillStyle = '#00FFFF';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Visual expanding repair pulse
    if (this.repairPulseVisualTimer > 0) {
      ctx.save();
      const progress = 1.0 - this.repairPulseVisualTimer / 0.4;
      const radius = 4 + progress * 24;
      const alpha = Math.max(0, 1.0 - progress);
      ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
