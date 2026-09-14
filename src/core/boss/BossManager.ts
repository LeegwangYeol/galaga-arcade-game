/**
 * Galaga Arcade Web Game — Boss Encounter Manager
 * 
 * Master coordinator for Milestone 12 Boss Encounters.
 * Manages boss lifecycle, HUD health bar rendering, and player status alterations.
 */

import type { Game } from '../Game';
import type { BaseBoss } from './BaseBoss';
import { BossFactory } from './BossFactory';

export class BossManager {
  public game: Game;
  public activeBoss: BaseBoss | null = null;
  public playerStunTimer: number = 0;

  constructor(game: Game) {
    this.game = game;
  }

  public isBossActive(): boolean {
    return this.activeBoss !== null && this.activeBoss.active;
  }

  public spawnBoss(stage: number): BaseBoss | null {
    this.reset();
    const boss = BossFactory.createBoss(stage, this.game);
    if (boss) {
      this.activeBoss = boss;
    }
    return boss;
  }

  public update(dt: number, _playerX: number, _playerY: number): void {
    if (this.playerStunTimer > 0) {
      this.playerStunTimer = Math.max(0, this.playerStunTimer - dt);
      // Spawn electric static sparks on player
      if (Math.random() < 0.3) {
        this.game.particleSystem?.spawnHitSparks(
          this.game.player.x + (Math.random() - 0.5) * 16,
          this.game.player.y + (Math.random() - 0.5) * 16
        );
      }
    }

    if (this.activeBoss && !this.activeBoss.active && this.activeBoss.phase === 'DEFEATED' && this.activeBoss.defeatTimer <= 0) {
      this.activeBoss = null;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.activeBoss || !this.activeBoss.active) return;

    // Render Boss Top HUD Health Bar (Virtual resolution: 224x288)
    const boss = this.activeBoss;
    const barX = 32;
    const barY = 24;
    const barWidth = 160;
    const barHeight = 4;

    const hpRatio = Math.max(0, Math.min(1, boss.health / boss.maxHealth));

    ctx.save();
    // 1. Health bar background
    ctx.fillStyle = '#000000';
    ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

    // 2. Health bar fill
    let fillColor = '#00E700'; // Green
    if (hpRatio <= 0.33) {
      fillColor = '#E70000'; // Red
    } else if (hpRatio <= 0.66) {
      fillColor = '#FFFF00'; // Yellow
    }
    ctx.fillStyle = fillColor;
    ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);

    // 3. Boss Name Label
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '6px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${boss.bossName} [${boss.phase}]`, 112, barY - 2);

    ctx.restore();
  }

  public onStageClear(): void {
    this.reset();
  }

  public reset(): void {
    this.activeBoss = null;
    this.playerStunTimer = 0;
  }
}
