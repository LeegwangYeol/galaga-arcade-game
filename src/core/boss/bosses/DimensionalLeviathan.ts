/**
 * Galaga Arcade Web Game — Stage 20: Dimensional Leviathan (차원수 레비아탄)
 * 
 * Phase 1: Phase-shift invulnerability (3.5s Materialized / 2.0s Void Shroud) & 2 Gravitational Tears.
 * Phase 2: Central Black-Hole Gravity Suction Vortex & Expanding Radial Shockwaves with a 40° safe gap.
 */

import { SpriteRenderer } from '../../../renderer/SpriteRenderer';
import type { Game } from '../../Game';
import { BaseBoss } from '../BaseBoss';
import { BOSS_CONFIGS, type DimensionalTear, type RadialShockwave } from '../types';

export class DimensionalLeviathan extends BaseBoss {
  // Phase 1 Phase-Shift State
  public isMaterialized: boolean = true;
  public shiftTimer: number = 0;

  // Phase 1 Gravitational Tears (pre-allocated static array)
  public tears: DimensionalTear[] = [
    { x: 60, y: 110, radius: 18, life: 6.0, maxLife: 6.0, active: false },
    { x: 164, y: 110, radius: 18, life: 6.0, maxLife: 6.0, active: false },
  ];

  // Phase 2 Gravity Vortex & Shockwaves
  public shockwaves: RadialShockwave[] = [
    { centerX: 112, centerY: 60, radius: 0, speed: 110, maxRadius: 260, thickness: 6, safeAngle: 0, safeWidthRad: 0.70, active: false },
    { centerX: 112, centerY: 60, radius: 0, speed: 110, maxRadius: 260, thickness: 6, safeAngle: 0, safeWidthRad: 0.70, active: false },
  ];
  private shockwaveTimer: number = 0;
  private shockwaveSafeAngle: number = Math.PI / 2; // initial facing down
  private boltFireTimer: number = 0;

  constructor(game: Game) {
    super(game, BOSS_CONFIGS.STAGE_20);
    this.shiftTimer = 3.5;
    this.isMaterialized = true;
  }

  public override isInvulnerable(): boolean {
    if (super.isInvulnerable()) return true;
    if (this.phase === 'PHASE_1' && !this.isMaterialized) {
      return true; // Dematerialized Void Shroud state
    }
    return false;
  }

  public override checkPhaseTransitions(): void {
    if (this.phase === 'PHASE_1' && this.health <= this.maxHealth * 0.5) {
      this.phase = 'TRANSITION_1_2';
      this.invulnerableTimer = 1.8;
      // Collapse tears
      for (const t of this.tears) {
        t.active = false;
      }
      const synth = this.game.soundSynth as any;
      if (synth && typeof synth.stopDimensionalTearHum === 'function') {
        synth.stopDimensionalTearHum();
      }
      if (synth && typeof synth.playBlackHoleSuctionRumble === 'function') {
        synth.playBlackHoleSuctionRumble();
      }
      this.game.soundSynth?.playExplosion('boss');
      this.game.particleSystem?.spawnBossExplosion(this.x, this.y);
    }
  }

  public override updateBoss(dt: number, playerX: number, playerY: number): void {
    if (this.phase === 'PHASE_1') {
      this.updatePhase1(dt, playerX, playerY);
    } else if (this.phase === 'PHASE_2') {
      this.updatePhase2(dt, playerX, playerY);
    }
  }

  private updatePhase1(dt: number, _playerX: number, _playerY: number): void {
    // Sinusoidal floating path
    const t = this.stateTimer;
    this.x = 112 + 50 * Math.sin(0.9 * t);
    this.y = 48 + 14 * Math.cos(1.8 * t);

    // Phase-shift timer
    this.shiftTimer -= dt;
    if (this.shiftTimer <= 0) {
      this.isMaterialized = !this.isMaterialized;
      this.shiftTimer = this.isMaterialized ? 3.5 : 2.0;

      const synth = this.game.soundSynth as any;
      if (!this.isMaterialized) {
        // Activate dimensional tears when entering Void Shroud
        for (const tear of this.tears) {
          tear.active = true;
          tear.life = tear.maxLife;
        }
        if (synth && typeof synth.playDimensionalTearHum === 'function') {
          synth.playDimensionalTearHum();
        }
      } else {
        if (synth && typeof synth.stopDimensionalTearHum === 'function') {
          synth.stopDimensionalTearHum();
        }
      }
    }

    // Apply Gravitational Deflection to Player Missiles
    const G = 320000;
    const epsSq = 18 * 18;

    this.game.bulletManager.forEachActivePlayerBullet((bullet) => {
      for (const tear of this.tears) {
        if (!tear.active) continue;
        const dx = tear.x - bullet.position.x;
        const dy = tear.y - bullet.position.y;
        const distSq = dx * dx + dy * dy;
        const denom = Math.pow(distSq + epsSq, 1.5);
        const ax = (G * dx) / denom;
        const ay = (G * dy) / denom;

        bullet.velocity.x += ax * dt;
        bullet.velocity.y += ay * dt;
      }
    });
  }

  private updatePhase2(dt: number, playerX: number, _playerY: number): void {
    // Anchor at center
    this.x = 112;
    this.y = 60;

    // 1. Black-Hole Gravity Suction Vortex
    // Displace player horizontally toward boss center
    const dx = this.x - playerX;
    const suction = Math.sign(dx) * Math.min(110, 4500 / (Math.abs(dx) + 35));
    this.game.player.x = Math.max(8, Math.min(216, this.game.player.x + suction * dt));

    // 2. Expanding Radial Shockwaves
    this.shockwaveSafeAngle += 0.6 * dt; // rotating safe sector
    this.shockwaveTimer += dt;
    if (this.shockwaveTimer >= 2.4) {
      this.shockwaveTimer = 0;
      // Acquire inactive shockwave
      const wave = this.shockwaves.find((w) => !w.active);
      if (wave) {
        wave.active = true;
        wave.hasDamagedPlayer = false;
        wave.centerX = this.x;
        wave.centerY = this.y;
        wave.radius = 8;
        wave.safeAngle = this.shockwaveSafeAngle;
      }
    }

    // Update active shockwaves
    for (const wave of this.shockwaves) {
      if (!wave.active) continue;
      wave.radius += wave.speed * dt;

      // Check collision against player at baseline (y ~ 250)
      const pX = this.game.player.x;
      const pY = this.game.player.y;
      const distToPlayer = Math.hypot(pX - wave.centerX, pY - wave.centerY);

      if (!wave.hasDamagedPlayer && Math.abs(distToPlayer - wave.radius) <= wave.thickness) {
        // Check if player is inside safe sector
        const angleToPlayer = Math.atan2(pY - wave.centerY, pX - wave.centerX);
        let diff = Math.abs(angleToPlayer - wave.safeAngle);
        while (diff > Math.PI) diff -= 2 * Math.PI;
        diff = Math.abs(diff);

        if (diff > wave.safeWidthRad / 2) {
          // Outside safe sector: player hit!
          wave.hasDamagedPlayer = true;
          this.game.player.hitTestAndDamage({
            x: pX - 6,
            y: pY - 6,
            width: 12,
            height: 12,
          });
        }
      }

      if (wave.radius >= wave.maxRadius) {
        wave.active = false;
      }
    }

    // 3. Periodic aimed plasma bolts
    this.boltFireTimer += dt;
    if (this.boltFireTimer >= 1.6) {
      this.boltFireTimer = 0;
      this.game.bulletManager.fireEnemyBullet(this.x, this.y, this.game.player.x, this.game.player.y, 200);
    }
  }

  public override renderBoss(ctx: CanvasRenderingContext2D): void {
    const spriteId = this.isMaterialized ? 'BOSS_LEVIATHAN_REAL' : 'BOSS_LEVIATHAN_VOID';
    ctx.save();
    if (!this.isMaterialized) {
      ctx.globalAlpha = 0.35;
    }
    SpriteRenderer.draw(ctx, spriteId, this.x, this.y, { scale: 1.5 });
    ctx.restore();

    // Render Dimensional Tears in Phase 1
    if (this.phase === 'PHASE_1') {
      for (const tear of this.tears) {
        if (!tear.active) continue;
        ctx.save();
        ctx.strokeStyle = '#9900EE';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tear.x, tear.y, 14, 0, 2 * Math.PI);
        ctx.stroke();

        ctx.fillStyle = '#00FFFF';
        ctx.beginPath();
        ctx.arc(tear.x, tear.y, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      }
    }

    // Render Black-Hole Vortex & Shockwaves in Phase 2
    if (this.phase === 'PHASE_2') {
      // Vortex aura
      ctx.save();
      ctx.strokeStyle = '#9900EE';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 20 + 4 * Math.sin(this.stateTimer * 8), 0, 2 * Math.PI);
      ctx.stroke();

      // Shockwaves with safe gap
      for (const wave of this.shockwaves) {
        if (!wave.active) continue;
        ctx.strokeStyle = '#FF007F';
        ctx.lineWidth = wave.thickness;
        ctx.beginPath();
        // Draw arc excluding safe gap
        const start = wave.safeAngle + wave.safeWidthRad / 2;
        const end = wave.safeAngle + 2 * Math.PI - wave.safeWidthRad / 2;
        ctx.arc(wave.centerX, wave.centerY, wave.radius, start, end);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
