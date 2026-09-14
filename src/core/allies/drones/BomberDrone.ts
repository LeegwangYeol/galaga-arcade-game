/**
 * Galaga Arcade Web Game — Bomber Support Wing Drone Entity
 * 
 * High-speed strategic bomber that sweeps across the upper playfield (Y = 36px),
 * dropping cluster munitions with expanding AOE shockwave detonations.
 */

import { BaseDrone } from '../BaseDrone';
import { DroneType } from '../types';
import type { Game } from '../../Game';
import type { AlliesManager } from '../AlliesManager';
import { SpriteRenderer } from '../../../renderer/SpriteRenderer';

export class BomberDrone extends BaseDrone {
  public readonly type = DroneType.BOMBER;

  public sweepSpeed: number = 140; // px/s
  public dropInterval: number = 0.3; // seconds
  public dropTimer: number = 0;
  public bombsDropped: number = 0;
  public maxBombsPerRun: number = 6;

  private alliesManager?: AlliesManager;

  constructor(game: Game, sweepSpeed: number = 140) {
    super(game);
    this.sweepSpeed = sweepSpeed;
  }

  public setAlliesManager(manager: AlliesManager): void {
    this.alliesManager = manager;
  }

  public override activate(duration: number = 0, initialX: number = -24, initialY: number = 36): void {
    super.activate(duration, initialX, initialY);
    this.x = initialX;
    this.y = initialY;
    this.vx = this.sweepSpeed;
    this.vy = 0;
    this.dropTimer = 0;
    this.bombsDropped = 0;
  }

  public override update(dt: number, _playerX?: number, _playerY?: number): void {
    if (!this.active) return;

    this.x += this.vx * dt;

    // Animation frame cycling (12 Hz)
    this.animTimer += dt;
    if (this.animTimer >= 0.083) {
      this.animTimer -= 0.083;
      this.animFrame = (this.animFrame + 1) % 2;
    }

    // Drop cluster bombs while traversing playfield
    if (this.x >= 16 && this.x <= 208 && this.bombsDropped < this.maxBombsPerRun) {
      this.dropTimer += dt;
      if (this.dropTimer >= this.dropInterval) {
        this.dropTimer -= this.dropInterval;
        this.dropClusterBomb();
      }
    }

    // Exit right boundary
    if (this.x > 248) {
      this.deactivate();
    }
  }

  public dropClusterBomb(): void {
    if (this.alliesManager) {
      this.alliesManager.spawnClusterBomb(this.x, this.y + 4);
      this.bombsDropped++;
    }
  }

  public override render(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;

    if (SpriteRenderer.hasDefinition('DRONE_BOMBER')) {
      SpriteRenderer.draw(ctx, 'DRONE_BOMBER', this.x, this.y, {
        frame: this.animFrame,
      });
    } else {
      ctx.save();
      ctx.fillStyle = '#AAAAAA';
      ctx.fillRect(this.x - 8, this.y - 4, 16, 8);
      ctx.fillStyle = '#E70000';
      ctx.fillRect(this.x - 2, this.y - 6, 4, 2);
      ctx.restore();
    }

    // Engine thruster twin plumes
    ctx.save();
    ctx.fillStyle = this.animFrame === 0 ? '#FF7F00' : '#FFFF00';
    ctx.fillRect(this.x - 6, this.y + 5, 2, 3);
    ctx.fillRect(this.x + 4, this.y + 5, 2, 3);
    ctx.restore();
  }
}
