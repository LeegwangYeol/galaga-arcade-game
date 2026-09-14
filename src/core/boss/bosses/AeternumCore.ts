/**
 * Galaga Arcade Web Game — Stage 50: Aeternum Star-Eater Core (항성 포식자 - 파이널 레이드)
 * 
 * Phase 1: Planetary Shield Matrix powered by 4 Orbital Satellite Generators (25 HP each).
 * Phase 2: Dark Matter Mega-Beam sweeping 60% canvas width with flank safe zone.
 * Phase 3 (Enrage): Counter-rotating dual 6-arm spiral bullet hell (w = +-2.2 rad/s) & desperate diving ram passes.
 * Defeat: +50,000 pts victory bonus and seamless advancement to Stage 51.
 */

import { SpriteRenderer } from '../../../renderer/SpriteRenderer';
import type { Game } from '../../Game';
import type { Rect } from '../../../types';
import { BaseBoss, BossSubUnit } from '../BaseBoss';
import { BOSS_CONFIGS, type DarkMatterBeam } from '../types';

export class AeternumCore extends BaseBoss {
  public satellites: BossSubUnit[] = [];

  // Phase 1 Satellite state
  private satelliteFireTimer: number = 0;

  // Phase 2 Dark Matter Mega-Beam
  public megaBeam: DarkMatterBeam = {
    charging: false,
    firing: false,
    chargeTimer: 0,
    fireTimer: 0,
    centerX: 112,
    width: 134,
    sweepSpeed: 30,
    sweepDir: 1,
    topY: 70,
    bottomY: 288,
    active: false,
  };
  private beamCooldown: number = 0;
  private shotgunTimer: number = 0;

  // Phase 3 Enrage Spiral Bullet Hell & Ram Swoop
  private spiralAngleA: number = 0;
  private spiralAngleB: number = 0;
  private spiralFireTimer: number = 0;
  private ramTimer: number = 0;
  private isRamming: boolean = false;
  private ramProgress: number = 0;

  public static readonly SHOTGUN_ANGLES: readonly number[] = [-0.4, -0.2, 0, 0.2, 0.4];
  private static readonly RAM_P0_X = 112;
  private static readonly RAM_P0_Y = 52;
  private static readonly RAM_P1_X = 20;
  private static readonly RAM_P1_Y = 160;
  private static readonly RAM_P2_X = 204;
  private static readonly RAM_P2_Y = 250;
  private static readonly RAM_P3_X = 112;
  private static readonly RAM_P3_Y = 52;

  constructor(game: Game) {
    super(game, BOSS_CONFIGS.STAGE_50);

    // Pre-allocate 4 Orbital Satellites (25 HP each)
    for (let i = 0; i < 4; i++) {
      const sat = new BossSubUnit(
        this,
        9950 + i,
        `SATELLITE_${i}`,
        'BOSS_ORBITAL_SATELLITE',
        25,
        12,
        12
      );
      this.satellites.push(sat);
      this.subUnits.push(sat);
      sat.active = true;
    }
  }

  public override isProtectedBySubUnits(): boolean {
    // Planetary shield matrix active while any satellite is alive
    return this.satellites.some((s) => s.active);
  }

  public override checkPhaseTransitions(): void {
    if (this.phase === 'PHASE_1' && !this.isProtectedBySubUnits()) {
      // Transition to Phase 2 (Beam Cannon)
      this.phase = 'TRANSITION_1_2';
      this.invulnerableTimer = 2.0;
      this.game.soundSynth?.playExplosion('boss');
      this.game.particleSystem?.spawnBossExplosion(this.x, this.y);
    } else if (this.phase === 'PHASE_2' && this.health <= Math.ceil(this.maxHealth / 3)) {
      // Transition to Phase 3 (Enrage)
      this.phase = 'TRANSITION_2_3';
      this.invulnerableTimer = 2.0;
      this.megaBeam.active = false;
      this.megaBeam.firing = false;
      this.megaBeam.charging = false;
      const synth = this.game.soundSynth as any;
      if (synth && typeof synth.stopDarkMatterBeamRoar === 'function') {
        synth.stopDarkMatterBeamRoar();
      }
      if (synth && typeof synth.playEnrageSiren === 'function') {
        synth.playEnrageSiren();
      } else {
        this.game.soundSynth?.playExplosion('boss');
      }
      this.game.particleSystem?.spawnBossExplosion(this.x, this.y);
    }
  }

  public override onSubUnitDestroyed(subUnit: BossSubUnit): void {
    this.game.particleSystem?.spawnBossExplosion(subUnit.x, subUnit.y);
    this.game.soundSynth?.playExplosion('small');
    this.checkPhaseTransitions();
  }

  public override updateBoss(dt: number, playerX: number, playerY: number): void {
    if (this.phase === 'PHASE_1') {
      this.updatePhase1(dt, playerX, playerY);
    } else if (this.phase === 'PHASE_2') {
      this.updatePhase2(dt, playerX, playerY);
    } else if (this.phase === 'PHASE_3') {
      this.updatePhase3(dt, playerX, playerY);
    }
  }

  private updatePhase1(dt: number, _playerX: number, _playerY: number): void {
    // 1. Orbital Satellite Path: Rx = 54, Ry = 22, omega = 1.25 rad/s
    const Rx = 54;
    const Ry = 22;
    const t = this.stateTimer;
    const omega = 1.25;

    for (let i = 0; i < 4; i++) {
      const sat = this.satellites[i];
      if (!sat || !sat.active) continue;
      const angle = omega * t + (i * Math.PI) / 2;
      sat.x = this.x + Rx * Math.cos(angle);
      sat.y = this.y + Ry * Math.sin(angle);
    }

    // 2. Satellite Vertical Laser Pulses: every 1.5s
    this.satelliteFireTimer += dt;
    if (this.satelliteFireTimer >= 1.5) {
      this.satelliteFireTimer = 0;
      for (const sat of this.satellites) {
        if (!sat.active) continue;
        this.game.bulletManager.fireEnemyBulletWithVector(sat.x, sat.y, 0, 210);
      }
    }
  }

  private updatePhase2(dt: number, playerX: number, _playerY: number): void {
    this.x = 112 + 20 * Math.sin(this.stateTimer * 0.8);
    this.y = 52;

    // 1. Dark Matter Mega-Beam Cannon Loop
    if (!this.megaBeam.charging && !this.megaBeam.firing) {
      this.beamCooldown += dt;
      if (this.beamCooldown >= 2.5) {
        this.beamCooldown = 0;
        this.megaBeam.charging = true;
        this.megaBeam.active = true;
        this.megaBeam.chargeTimer = 1.6;
        // Align beam center towards player anticipated position
        this.megaBeam.centerX = Math.max(67, Math.min(157, playerX));
        this.megaBeam.sweepDir = playerX > 112 ? -1 : 1;

        const synth = this.game.soundSynth as any;
        if (synth && typeof synth.playDarkMatterBeamCharge === 'function') {
          synth.playDarkMatterBeamCharge();
        }
      }

      // Shotgun spreads during cooldown
      this.shotgunTimer += dt;
      if (this.shotgunTimer >= 1.2) {
        this.shotgunTimer = 0;
        for (let i = 0; i < AeternumCore.SHOTGUN_ANGLES.length; i++) {
          const a = AeternumCore.SHOTGUN_ANGLES[i]!;
          const vx = 170 * Math.sin(a);
          const vy = 170 * Math.cos(a);
          this.game.bulletManager.fireEnemyBulletWithVector(this.x, this.y, vx, vy);
        }
      }
    } else if (this.megaBeam.charging) {
      this.megaBeam.chargeTimer -= dt;
      if (this.megaBeam.chargeTimer <= 0) {
        this.megaBeam.charging = false;
        this.megaBeam.firing = true;
        this.megaBeam.fireTimer = 1.8;

        const synth = this.game.soundSynth as any;
        if (synth && typeof synth.playDarkMatterBeamRoar === 'function') {
          synth.playDarkMatterBeamRoar();
        } else {
          this.game.soundSynth?.playLaser();
        }

        if (typeof this.game.triggerScreenShake === 'function') {
          this.game.triggerScreenShake(2.0, 1.8);
        }
      }
    } else if (this.megaBeam.firing) {
      this.megaBeam.fireTimer -= dt;
      // Sweep laterally
      this.megaBeam.centerX += this.megaBeam.sweepDir * this.megaBeam.sweepSpeed * dt;

      // Check collision with player
      const halfW = this.megaBeam.width / 2;
      const left = this.megaBeam.centerX - halfW;
      const right = this.megaBeam.centerX + halfW;
      const pX = this.game.player.x;
      const pY = this.game.player.y;

      const beamBox: Rect = {
        x: left,
        y: this.megaBeam.topY,
        width: this.megaBeam.width,
        height: this.megaBeam.bottomY - this.megaBeam.topY,
      };

      if (pX >= left && pX <= right && pY >= this.megaBeam.topY && pY <= this.megaBeam.bottomY) {
        this.game.player.hitTestAndDamage(beamBox);
      }

      if (this.megaBeam.fireTimer <= 0) {
        this.megaBeam.firing = false;
        this.megaBeam.active = false;
        const synth = this.game.soundSynth as any;
        if (synth && typeof synth.stopDarkMatterBeamRoar === 'function') {
          synth.stopDarkMatterBeamRoar();
        }
      }
    }
  }

  private updatePhase3(dt: number, _playerX: number, _playerY: number): void {
    // 1. Dual Counter-Rotating 6-Arm Spiral Bullet Hell
    this.spiralAngleA += 2.2 * dt;  // Clockwise
    this.spiralAngleB -= 2.2 * dt;  // Counter-clockwise

    this.spiralFireTimer += dt;
    if (this.spiralFireTimer >= 0.25) {
      this.spiralFireTimer = 0;
      const M = 6;
      const V = 130;

      // Cannon Alpha
      for (let i = 0; i < M; i++) {
        const a = this.spiralAngleA + (i * 2 * Math.PI) / M;
        this.game.bulletManager.fireEnemyBulletWithVector(this.x, this.y, V * Math.cos(a), V * Math.sin(a));
      }

      // Cannon Beta
      for (let i = 0; i < M; i++) {
        const b = this.spiralAngleB + (i * 2 * Math.PI) / M;
        this.game.bulletManager.fireEnemyBulletWithVector(this.x, this.y, V * Math.cos(b), V * Math.sin(b), 'ENEMY_FAST_BEAM');
      }
    }

    // 2. Desperate Diving Ram Swoop (every 5.0s)
    if (!this.isRamming) {
      this.x = 112 + 30 * Math.sin(this.stateTimer * 2.0);
      this.y = 52;
      this.ramTimer += dt;
      if (this.ramTimer >= 5.0) {
        this.ramTimer = 0;
        this.isRamming = true;
        this.ramProgress = 0;
      }
    } else {
      this.ramProgress += dt / 2.2;
      // Cubic Bézier Swoop: P0=(112,52), P1=(20,160), P2=(204,250), P3=(112,52)
      const u = this.ramProgress;
      const u1 = 1 - u;
      const u1Sq = u1 * u1;
      const uSq = u * u;
      const c0 = u1Sq * u1;
      const c1 = 3 * u1Sq * u;
      const c2 = 3 * u1 * uSq;
      const c3 = uSq * u;

      this.x = c0 * AeternumCore.RAM_P0_X + c1 * AeternumCore.RAM_P1_X + c2 * AeternumCore.RAM_P2_X + c3 * AeternumCore.RAM_P3_X;
      this.y = c0 * AeternumCore.RAM_P0_Y + c1 * AeternumCore.RAM_P1_Y + c2 * AeternumCore.RAM_P2_Y + c3 * AeternumCore.RAM_P3_Y;

      // Ramming collision check against player
      if (this.y >= 230) {
        this.game.player.hitTestAndDamage(this.getHitbox());
      }

      if (this.ramProgress >= 1.0) {
        this.isRamming = false;
        this.ramProgress = 0;
        this.x = 112;
        this.y = 52;
      }
    }
  }

  public override renderBoss(ctx: CanvasRenderingContext2D): void {
    // Render Core
    SpriteRenderer.draw(ctx, 'BOSS_STAREATER_CORE', this.x, this.y, { scale: 1.5 });

    // Render Planetary Shield Matrix in Phase 1
    if (this.phase === 'PHASE_1' && this.isProtectedBySubUnits()) {
      ctx.save();
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 38, 0, 2 * Math.PI);
      ctx.stroke();

      // Energy tethers to living satellites
      for (const sat of this.satellites) {
        if (!sat.active) continue;
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(sat.x, sat.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Render Dark Matter Mega-Beam in Phase 2
    if (this.phase === 'PHASE_2' && this.megaBeam.active) {
      const chargeProgress = 1.0 - (this.megaBeam.chargeTimer / 1.6);
      SpriteRenderer.drawAeternumMegaBeam(
        ctx,
        this.megaBeam.centerX,
        this.megaBeam.width,
        this.megaBeam.topY,
        this.megaBeam.bottomY,
        this.megaBeam.charging,
        this.megaBeam.firing,
        chargeProgress,
        this.stateTimer
      );
    }
  }
}
