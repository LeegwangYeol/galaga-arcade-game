/**
 * Galaga Arcade Web Game — Stage 40: Psionic Shroud Harbinger (장막의 사자)
 * 
 * Phase 1: 2 Illusory Phantom Clones (0 damage taken, deep purple eye) vs True Core (cyan eye),
 *          periodic 1.5s shell-game rotation shuffle.
 * Phase 2: Telekinetic Stun Pulses cutting player thrusters by 75% for 1.25s & rapid psychic lances.
 */

import { SpriteRenderer } from '../../../renderer/SpriteRenderer';
import type { Game } from '../../Game';
import { BaseBoss, BossSubUnit } from '../BaseBoss';
import { BOSS_CONFIGS, type TelekineticStunWave } from '../types';

export class PsionicHarbinger extends BaseBoss {
  public phantom1: BossSubUnit;
  public phantom2: BossSubUnit;

  // Shell Game State
  private slots: number[] = [48, 112, 176];
  private trueSlotIndex: number = 1;
  private shuffleTimer: number = 0;
  private isShuffling: boolean = false;
  private shuffleDuration: number = 1.5;
  private phantomDiveTimer: number = 0;

  // Phase 2 Telekinetic Stun & Lance State
  public stunWave: TelekineticStunWave = {
    y: -50,
    speed: 220,
    height: 8,
    active: false,
  };
  private stunPulseCooldown: number = 0;
  private isStunCharging: boolean = false;
  private stunChargeTimer: number = 0;
  private psychicLanceCooldown: number = 0;

  constructor(game: Game) {
    super(game, BOSS_CONFIGS.STAGE_40);

    // Pre-allocate 2 Phantom clones
    this.phantom1 = new BossSubUnit(this, 9941, 'PHANTOM_1', 'BOSS_HARBINGER_PHANTOM', 9999, 44, 36);
    this.phantom1.isInvulnerableUnit = true; // Phantoms absorb 0 damage

    this.phantom2 = new BossSubUnit(this, 9942, 'PHANTOM_2', 'BOSS_HARBINGER_PHANTOM', 9999, 44, 36);
    this.phantom2.isInvulnerableUnit = true;

    this.subUnits.push(this.phantom1, this.phantom2);

    this.phantom1.active = true;
    this.phantom2.active = true;
    this.applySlotPositions();
  }

  public override checkPhaseTransitions(): void {
    if (this.phase === 'PHASE_1' && this.health <= this.maxHealth * 0.5) {
      this.phase = 'TRANSITION_1_2';
      this.invulnerableTimer = 1.8;

      // Shatter phantom clones
      this.phantom1.active = false;
      this.phantom2.active = false;
      this.game.soundSynth?.playExplosion('boss');
      this.game.particleSystem?.spawnBossExplosion(this.phantom1.x, this.phantom1.y);
      this.game.particleSystem?.spawnBossExplosion(this.phantom2.x, this.phantom2.y);

      // Return core to center
      this.x = 112;
      this.y = 52;
    }
  }

  private applySlotPositions(): void {
    const slotPositions = [this.slots[0]!, this.slots[1]!, this.slots[2]!];
    this.x = slotPositions[this.trueSlotIndex]!;
    this.y = 50;

    let pIdx = 0;
    for (let i = 0; i < 3; i++) {
      if (i === this.trueSlotIndex) continue;
      if (pIdx === 0) {
        this.phantom1.x = slotPositions[i]!;
        this.phantom1.y = 50;
        pIdx++;
      } else {
        this.phantom2.x = slotPositions[i]!;
        this.phantom2.y = 50;
      }
    }
  }

  public override updateBoss(dt: number, playerX: number, playerY: number): void {
    if (this.phase === 'PHASE_1') {
      this.updatePhase1(dt, playerX, playerY);
    } else if (this.phase === 'PHASE_2') {
      this.updatePhase2(dt, playerX, playerY);
    }
  }

  private updatePhase1(dt: number, playerX: number, playerY: number): void {
    // 1. Shell Game Rotation Shuffle (every 6.0s)
    this.shuffleTimer += dt;
    if (!this.isShuffling && this.shuffleTimer >= 6.0) {
      this.isShuffling = true;
      this.shuffleTimer = 0;
      this.trueSlotIndex = (this.trueSlotIndex + 1 + Math.floor(Math.random() * 2)) % 3;
    }

    if (this.isShuffling) {
      const progress = this.shuffleTimer / this.shuffleDuration;
      // Circular rotation swap around center (112, 50)
      const radius = 64;
      const baseAngle = progress * 2 * Math.PI;

      this.x = 112 + radius * Math.cos(baseAngle + (this.trueSlotIndex * 2 * Math.PI) / 3);
      this.y = 50 + 15 * Math.sin(baseAngle);

      this.phantom1.x = 112 + radius * Math.cos(baseAngle + (((this.trueSlotIndex + 1) % 3) * 2 * Math.PI) / 3);
      this.phantom1.y = 50 + 15 * Math.sin(baseAngle + (2 * Math.PI) / 3);

      this.phantom2.x = 112 + radius * Math.cos(baseAngle + (((this.trueSlotIndex + 2) % 3) * 2 * Math.PI) / 3);
      this.phantom2.y = 50 + 15 * Math.sin(baseAngle + (4 * Math.PI) / 3);

      if (this.shuffleTimer >= this.shuffleDuration) {
        this.isShuffling = false;
        this.shuffleTimer = 0;
        this.applySlotPositions();
      }
      return;
    }

    // 2. Dive-Bombing Attack cycle
    this.phantomDiveTimer += dt;
    if (this.phantomDiveTimer >= 4.0) {
      this.phantomDiveTimer = 0;
      const synth = this.game.soundSynth as any;
      if (synth && typeof synth.playPhantomDiveWarble === 'function') {
        synth.playPhantomDiveWarble();
      }
      // All 3 fire aimed psionic bolts
      this.game.bulletManager.fireEnemyBullet(this.x, this.y, playerX, playerY, 190);
      if (this.phantom1.active) {
        this.game.bulletManager.fireEnemyBullet(this.phantom1.x, this.phantom1.y, playerX, playerY, 190);
      }
      if (this.phantom2.active) {
        this.game.bulletManager.fireEnemyBullet(this.phantom2.x, this.phantom2.y, playerX, playerY, 190);
      }
    }
  }

  private updatePhase2(dt: number, playerX: number, playerY: number): void {
    // Gentle floating
    this.x = 112 + 25 * Math.sin(this.stateTimer * 1.5);
    this.y = 52;

    // 1. Telekinetic Stun Pulses (every 3.8s)
    if (!this.isStunCharging && !this.stunWave.active) {
      this.stunPulseCooldown += dt;
      if (this.stunPulseCooldown >= 3.8) {
        this.stunPulseCooldown = 0;
        this.isStunCharging = true;
        this.stunChargeTimer = 0.8;
      }
    } else if (this.isStunCharging) {
      this.stunChargeTimer -= dt;
      if (this.stunChargeTimer <= 0) {
        this.isStunCharging = false;
        // Launch distortion wave
        this.stunWave.active = true;
        this.stunWave.y = this.y + 16;
        const synth = this.game.soundSynth as any;
        if (synth && typeof synth.playTelekineticStunScreech === 'function') {
          synth.playTelekineticStunScreech();
        } else {
          this.game.soundSynth?.playLaser();
        }
      }
    }

    // Update Stun Wave movement
    if (this.stunWave.active) {
      this.stunWave.y += this.stunWave.speed * dt;

      // Check collision with player baseline
      const pY = this.game.player.y;
      if (Math.abs(this.stunWave.y - pY) <= this.stunWave.height / 2 + 8) {
        // Player stunned! Cut horizontal speed for 1.25s
        if (this.game.bossManager) {
          this.game.bossManager.playerStunTimer = 1.25;
        }
      }

      if (this.stunWave.y > 300) {
        this.stunWave.active = false;
      }
    }

    // 2. Rapid Psychic Lances (fired following stun pulse or every 2.0s)
    this.psychicLanceCooldown += dt;
    if (this.psychicLanceCooldown >= 2.0) {
      this.psychicLanceCooldown = 0;
      // Triple rapid lances
      for (let i = -1; i <= 1; i++) {
        const targetOffset = i * 20;
        this.game.bulletManager.fireEnemyBullet(this.x, this.y, playerX + targetOffset, playerY, 280, 'ENEMY_FAST_BEAM');
      }
      this.game.soundSynth?.playLaser();
    }
  }

  public override renderBoss(ctx: CanvasRenderingContext2D): void {
    // Render Phantoms with procedural chromatic jitter & silhouette echoes in Phase 1
    if (this.phase === 'PHASE_1') {
      if (this.phantom1.active) {
        SpriteRenderer.drawPsionicPhantom(ctx, 'BOSS_HARBINGER_PHANTOM', this.phantom1.x, this.phantom1.y, 0, this.stateTimer);
      }
      if (this.phantom2.active) {
        SpriteRenderer.drawPsionicPhantom(ctx, 'BOSS_HARBINGER_PHANTOM', this.phantom2.x, this.phantom2.y, 1, this.stateTimer);
      }
    }

    // Render True Core
    SpriteRenderer.draw(ctx, 'BOSS_HARBINGER_TRUE', this.x, this.y, { scale: 1.5 });

    // Subtle Cyan Third-Eye Pulsing Glow (12 Hz) on True Core
    const eyeAlpha = 0.5 + 0.5 * Math.sin(this.stateTimer * 24);
    ctx.save();
    ctx.fillStyle = `rgba(0, 255, 255, ${eyeAlpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y - 2, 2.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();

    // Render Telekinetic Stun Charging indicator
    if (this.isStunCharging) {
      ctx.save();
      ctx.strokeStyle = '#FF007F';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 24 * (this.stunChargeTimer / 0.8), 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();
    }

    // Render Telekinetic Stun Wave in Phase 2
    if (this.stunWave.active) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 0, 127, 0.45)';
      ctx.strokeStyle = '#FF007F';
      ctx.lineWidth = 2;
      ctx.fillRect(0, this.stunWave.y - this.stunWave.height / 2, 224, this.stunWave.height);
      ctx.strokeRect(0, this.stunWave.y - this.stunWave.height / 2, 224, this.stunWave.height);
      ctx.restore();
    }
  }
}
