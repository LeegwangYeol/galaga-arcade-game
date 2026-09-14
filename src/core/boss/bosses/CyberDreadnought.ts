/**
 * Galaga Arcade Web Game — Stage 10: Cyber Dreadnought (사이버 전함)
 * 
 * Phase 1: Twin-laser turrets (15 HP each) and escort drones (5 HP each).
 * Phase 2: Exposed core with 4-arm rotating spiral bullet hell rings (w = 1.75 rad/s) & precision railgun.
 */

import { SpriteRenderer } from '../../../renderer/SpriteRenderer';
import type { Game } from '../../Game';
import { BaseBoss, BossSubUnit } from '../BaseBoss';
import { BOSS_CONFIGS } from '../types';

export class CyberDreadnought extends BaseBoss {
  public turretLeft: BossSubUnit;
  public turretRight: BossSubUnit;
  public escortLeft: BossSubUnit;
  public escortRight: BossSubUnit;

  // Attack timers
  private turretFireTimer: number = 0;
  private droneFireTimer: number = 0;
  private spiralFireTimer: number = 0;
  private spiralAngle: number = 0;
  private spiralOmega: number = 1.75; // rad/s
  private spiralDirTimer: number = 0;
  private railgunTimer: number = 0;
  private railgunChargeTimer: number = 0;
  private isRailgunCharging: boolean = false;

  constructor(game: Game) {
    super(game, BOSS_CONFIGS.STAGE_10);

    // Pre-allocate sub-units
    this.turretLeft = new BossSubUnit(this, 9901, 'TURRET_LEFT', 'ENEMY_BULLET', 15, 10, 10);
    this.turretRight = new BossSubUnit(this, 9902, 'TURRET_RIGHT', 'ENEMY_BULLET', 15, 10, 10);
    this.escortLeft = new BossSubUnit(this, 9903, 'ESCORT_LEFT', 'ZAKO_WING_0', 5, 12, 12);
    this.escortRight = new BossSubUnit(this, 9904, 'ESCORT_RIGHT', 'ZAKO_WING_0', 5, 12, 12);

    this.subUnits.push(this.turretLeft, this.turretRight, this.escortLeft, this.escortRight);

    // Activate Phase 1 units
    this.turretLeft.active = true;
    this.turretRight.active = true;
    this.escortLeft.active = true;
    this.escortRight.active = true;
  }

  public override isProtectedBySubUnits(): boolean {
    // Shielded bulkheads absorb damage until both turrets are disabled
    return this.turretLeft.active || this.turretRight.active;
  }

  public override checkPhaseTransitions(): void {
    if (this.phase === 'PHASE_1' && this.health <= this.maxHealth * 0.5) {
      this.phase = 'TRANSITION_1_2';
      this.invulnerableTimer = 1.5;
      this.game.soundSynth?.playExplosion('boss');
      this.game.particleSystem?.spawnBossExplosion(this.x - 16, this.y + 8);
      this.game.particleSystem?.spawnBossExplosion(this.x + 16, this.y + 8);
      this.turretLeft.active = false;
      this.turretRight.active = false;
    }
  }

  public override onSubUnitDestroyed(subUnit: BossSubUnit): void {
    this.game.particleSystem?.spawnBossExplosion(subUnit.x, subUnit.y);
    this.game.soundSynth?.playExplosion('small');
  }

  public override updateBoss(dt: number, playerX: number, playerY: number): void {
    // Horizontal hovering: amplitude +-35px at 0.25 Hz
    this.x = 112 + 35 * Math.sin(0.25 * 2 * Math.PI * this.stateTimer);

    if (this.phase === 'PHASE_1') {
      this.updatePhase1(dt, playerX, playerY);
    } else if (this.phase === 'PHASE_2') {
      this.updatePhase2(dt, playerX, playerY);
    }
  }

  private updatePhase1(dt: number, playerX: number, playerY: number): void {
    // Update Turret positions
    if (this.turretLeft.active) {
      this.turretLeft.x = this.x - 16;
      this.turretLeft.y = this.y + 8;
    }
    if (this.turretRight.active) {
      this.turretRight.x = this.x + 16;
      this.turretRight.y = this.y + 8;
    }

    // Update Escort Drones figure-8 trajectory
    const t = this.stateTimer;
    if (this.escortLeft.active) {
      this.escortLeft.x = this.x - (32 + 12 * Math.cos(2.0 * t));
      this.escortLeft.y = this.y + 18 + 8 * Math.sin(4.0 * t);
    }
    if (this.escortRight.active) {
      this.escortRight.x = this.x + (32 + 12 * Math.cos(2.0 * t));
      this.escortRight.y = this.y + 18 + 8 * Math.sin(4.0 * t);
    }

    // Turret Alternate Firing: tau = 1.4s
    this.turretFireTimer += dt;
    if (this.turretFireTimer >= 1.4) {
      this.turretFireTimer = 0;
      if (this.turretLeft.active) {
        this.game.bulletManager.fireEnemyBulletWithVector(this.turretLeft.x, this.turretLeft.y, 0, 220);
      }
      if (this.turretRight.active) {
        this.game.bulletManager.fireEnemyBulletWithVector(this.turretRight.x, this.turretRight.y, 0, 220);
      }
      const synth = this.game.soundSynth as any;
      if (synth && typeof synth.playHeavyLaserBlast === 'function') {
        synth.playHeavyLaserBlast();
      }
    }

    // Escort Drone Aimed Needles: tau = 2.0s
    this.droneFireTimer += dt;
    if (this.droneFireTimer >= 2.0) {
      this.droneFireTimer = 0;
      if (this.escortLeft.active) {
        this.game.bulletManager.fireEnemyBullet(this.escortLeft.x, this.escortLeft.y, playerX, playerY, 190);
      }
      if (this.escortRight.active) {
        this.game.bulletManager.fireEnemyBullet(this.escortRight.x, this.escortRight.y, playerX, playerY, 190);
      }
    }
  }

  private updatePhase2(dt: number, playerX: number, playerY: number): void {
    // 1. Rotating Spiral Bullet Rings
    this.spiralAngle += this.spiralOmega * dt;
    this.spiralDirTimer += dt;
    if (this.spiralDirTimer >= 3.0) {
      this.spiralDirTimer = 0;
      this.spiralOmega = -this.spiralOmega;
    }

    this.spiralFireTimer += dt;
    if (this.spiralFireTimer >= 0.35) {
      this.spiralFireTimer = 0;
      const synth = this.game.soundSynth as any;
      if (synth && typeof synth.playSpiralRingWhoosh === 'function') {
        synth.playSpiralRingWhoosh();
      }
      const M = 4;
      const V = 140;
      for (let i = 0; i < M; i++) {
        const angle = this.spiralAngle + (i * Math.PI) / 2;
        const vx = V * Math.cos(angle);
        const vy = V * Math.sin(angle);
        this.game.bulletManager.fireEnemyBulletWithVector(this.x, this.y, vx, vy);
      }
    }

    // 2. Precision Aimed Railgun: every 2.8s, charge 0.6s
    if (!this.isRailgunCharging) {
      this.railgunTimer += dt;
      if (this.railgunTimer >= 2.8) {
        this.railgunTimer = 0;
        this.isRailgunCharging = true;
        this.railgunChargeTimer = 0.6;
      }
    } else {
      this.railgunChargeTimer -= dt;
      if (this.railgunChargeTimer <= 0) {
        this.isRailgunCharging = false;
        // Fire precision shot
        this.game.bulletManager.fireEnemyBullet(this.x, this.y, playerX, playerY, 260, 'ENEMY_FAST_BEAM');
        const synth = this.game.soundSynth as any;
        if (synth && typeof synth.playHeavyLaserBlast === 'function') {
          synth.playHeavyLaserBlast();
        } else {
          this.game.soundSynth?.playLaser();
        }
      }
    }
  }

  public override renderBoss(ctx: CanvasRenderingContext2D): void {
    const spriteId = this.phase === 'PHASE_2' ? 'BOSS_DREADNOUGHT_EXPOSED' : 'BOSS_DREADNOUGHT_ARMORED';
    SpriteRenderer.draw(ctx, spriteId, this.x, this.y, { scale: 1.5 });

    // Railgun charge warning line
    if (this.isRailgunCharging) {
      ctx.save();
      ctx.strokeStyle = '#FFFF00';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y + 12);
      ctx.lineTo(this.x, 288);
      ctx.stroke();
      ctx.restore();
    }
  }
}
