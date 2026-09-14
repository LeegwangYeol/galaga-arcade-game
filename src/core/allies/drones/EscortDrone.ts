/**
 * Galaga Arcade Web Game — Escort Wingman Drone Entity
 * 
 * Orbits player fighter in continuous parametric harmonic motion.
 * Autofires forward plasma bolts without consuming player missile quotas.
 */

import { BaseDrone } from '../BaseDrone';
import { DroneType } from '../types';
import type { Game } from '../../Game';
import { SpriteRenderer } from '../../../renderer/SpriteRenderer';

export class EscortDrone extends BaseDrone {
  public readonly type = DroneType.ESCORT;

  // Orbital Kinematics
  public radius: number = 20; // Default 20px radius
  public omega: number = Math.PI; // rad/s (2.0s orbital period)
  public angle: number = 0; // Current orbital angle (radians)

  // Weapon System
  public fireInterval: number = 0.35; // seconds
  public fireTimer: number = 0;
  public bulletSpeed: number = 460; // px/s
  public shotsFired: number = 0;

  // Bounds
  public minX: number = 4;
  public maxX: number = 220;
  public minY: number = 10;
  public maxY: number = 280;

  constructor(game: Game, radius: number = 20, omega: number = Math.PI) {
    super(game);
    this.radius = radius;
    this.omega = omega;
  }

  public override activate(duration: number = 0, initialX: number = 112, initialY: number = 250): void {
    super.activate(duration, initialX, initialY);
    this.angle = 0;
    this.fireTimer = 0;
    this.shotsFired = 0;
    this.x = initialX + this.radius;
    this.y = initialY;
  }

  public override update(dt: number, playerX?: number, playerY?: number): void {
    if (!this.active) return;

    // Advance orbital angle
    this.angle += this.omega * dt;

    // Anchor to player position (default to center baseline if player unavailable)
    const px = playerX !== undefined ? playerX : (this.game.player ? this.game.player.x : 112);
    const py = playerY !== undefined ? playerY : (this.game.player ? this.game.player.y : 250);

    // Parametric orbital coordinates: x = px + R cos(theta), y = py + R sin(theta)
    const targetX = px + this.radius * Math.cos(this.angle);
    const targetY = py + this.radius * Math.sin(this.angle);

    // Boundary clamping
    this.x = Math.max(this.minX, Math.min(this.maxX, targetX));
    this.y = Math.max(this.minY, Math.min(this.maxY, targetY));

    // Animation frame cycling (10 Hz)
    this.animTimer += dt;
    if (this.animTimer >= 0.1) {
      this.animTimer -= 0.1;
      this.animFrame = (this.animFrame + 1) % 2;
    }

    // Lifetime management if duration specified
    if (this.duration > 0) {
      this.lifetimeTimer += dt;
      if (this.lifetimeTimer >= this.duration) {
        this.deactivate();
        return;
      }
    }

    // Autofire plasma bolts (suppressed if player is destroyed/captured/capturing)
    const playerState = this.game.player ? this.game.player.state : 'normal';
    const isPlayerIncapacitated =
      playerState === 'DESTROYED' ||
      playerState === 'capturing' ||
      playerState === 'CAPTURING' ||
      playerState === 'captured' ||
      playerState === 'CAPTURED';

    if (!isPlayerIncapacitated && this.game.state === 'PLAYING') {
      this.fireTimer += dt;
      if (this.fireTimer >= this.fireInterval) {
        this.fireTimer -= this.fireInterval;
        this.firePlasmaBolt();
      }
    }
  }

  public firePlasmaBolt(): void {
    if (!this.active || !this.game.bulletManager) return;

    // Fire via bulletManager.fireDroneBullet or firePlayerBulletWithVector without starving player quota
    if (typeof this.game.bulletManager.fireDroneBullet === 'function') {
      this.game.bulletManager.fireDroneBullet(this.x, this.y - 4, 0, -this.bulletSpeed);
    } else {
      this.game.bulletManager.firePlayerBulletWithVector(this.x, this.y - 4, 0, -this.bulletSpeed, 16);
    }
    this.shotsFired++;
  }

  public override render(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;

    if (SpriteRenderer.hasDefinition('DRONE_ESCORT')) {
      SpriteRenderer.draw(ctx, 'DRONE_ESCORT', this.x, this.y, {
        frame: this.animFrame,
      });
    } else {
      ctx.save();
      ctx.fillStyle = '#00FFFF';
      ctx.fillRect(this.x - 5, this.y - 5, 10, 10);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(this.x - 2, this.y - 2, 4, 4);
      ctx.restore();
    }

    // Engine thruster glow
    ctx.save();
    ctx.fillStyle = this.animFrame === 0 ? '#00FFFF' : '#FF7F00';
    ctx.fillRect(this.x - 1, this.y + 6, 2, 3);
    ctx.restore();
  }
}
