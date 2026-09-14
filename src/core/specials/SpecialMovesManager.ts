/**
 * Galaga Arcade Web Game — Special Moves Subsystem Coordinator
 * 
 * Manages the Energy Gauge (0..100), trigger controls (KeyX / Gamepad / Touch),
 * and executes the 3 Special Moves:
 * 1. Nova Barrage: 16-missile Proportional Navigation salvo.
 * 2. Chrono Freeze: 3.0s absolute time stop (enemyDt = 0).
 * 3. Dimensional Warp Ram: Hyper-speed invulnerable swept ramming charge.
 */

import { ObjectPool } from '../ObjectPool';
import { SpecialMoveType } from './types';
import { NovaMissile } from './pools/NovaMissile';
import { EnergySpark } from './pools/EnergySpark';
import type { Game } from '../Game';
import type { Enemy } from '../../entities/Enemy';
import { Player } from '../../entities/Player';
import { EnemyState } from '../../types';
import type { Rect } from '../../types';
import { BaseBoss } from '../boss/BaseBoss';
import { SpriteRenderer } from '../../renderer/SpriteRenderer';

function checkAABB(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export class SpecialMovesManager {
  public game: Game;

  // Energy Gauge System (0..100)
  public energy: number = 0;
  public maxEnergy: number = 100;
  public cooldownTimer: number = 0;
  public maxCooldown: number = 5.0; // seconds

  // Selected & Active Move States
  public selectedMove: SpecialMoveType = SpecialMoveType.NOVA_BARRAGE;
  public isActive: boolean = false;
  public activeMove: SpecialMoveType | null = null;
  public activeTimer: number = 0;

  // Specific Move Timers
  public chronoFreezeTimer: number = 0;
  public chronoFreezeDuration: number = 3.0; // seconds

  public warpRamTimer: number = 0;
  public warpRamDuration: number = 1.0; // seconds
  public warpRamSpeed: number = 800; // px/s (upward)
  private warpRamStartY: number = 250;
  private warpRamExitedTop: boolean = false;
  private warpRamHitTargetIds = new Set<any>();

  // Pre-allocated Object Pools (Strictly Bounded to 32)
  private missilePool: ObjectPool<NovaMissile>;
  private sparkPool: ObjectPool<EnergySpark>;

  // Scratch targets buffer for zero-GC target assignment
  private scratchTargetList: Enemy[] = [];

  // Pre-allocated Speed Lines for Warp Ram (Zero-GC)
  public static readonly SPEED_LINE_COUNT = 24;
  public speedLineX = new Float32Array(SpecialMovesManager.SPEED_LINE_COUNT);
  public speedLineY = new Float32Array(SpecialMovesManager.SPEED_LINE_COUNT);
  public speedLineLen = new Float32Array(SpecialMovesManager.SPEED_LINE_COUNT);
  public speedLineSpeed = new Float32Array(SpecialMovesManager.SPEED_LINE_COUNT);
  private warpWakeTimer: number = 0;

  constructor(game: Game) {
    this.game = game;

    // Pre-allocate pools
    this.missilePool = new ObjectPool<NovaMissile>({
      factory: () => new NovaMissile(),
      reset: (missile) => missile.reset(),
      initialSize: 32,
      maxSize: 32,
      autoExpand: false,
    });

    this.sparkPool = new ObjectPool<EnergySpark>({
      factory: () => new EnergySpark(),
      reset: (spark) => spark.reset(),
      initialSize: 32,
      maxSize: 32,
      autoExpand: false,
    });

    // Initialize speed lines
    for (let i = 0; i < SpecialMovesManager.SPEED_LINE_COUNT; i++) {
      this.speedLineX[i] = Math.random() * 224;
      this.speedLineY[i] = Math.random() * 288;
      this.speedLineLen[i] = 12 + Math.random() * 20;
      this.speedLineSpeed[i] = 700 + Math.random() * 400;
    }
  }

  // --- Gauge Accessors & Mutators ---

  public get energyMeter(): number {
    return this.energy;
  }

  public set energyMeter(val: number) {
    this.energy = Math.max(0, Math.min(this.maxEnergy, val));
  }

  public addEnergy(amount: number): void {
    const prevEnergy = this.energy;
    this.energy = Math.max(0, Math.min(this.maxEnergy, this.energy + amount));

    // Play chime when meter becomes fully charged
    if (prevEnergy < this.maxEnergy && this.energy >= this.maxEnergy) {
      if (this.game.soundSynth && typeof (this.game.soundSynth as unknown as { playDockingChime?: () => void }).playDockingChime === 'function') {
        (this.game.soundSynth as unknown as { playDockingChime: () => void }).playDockingChime();
      }
    }
  }

  public isReady(): boolean {
    return this.energy >= this.maxEnergy && this.cooldownTimer <= 0 && !this.isActive;
  }

  public cycleSpecial(): SpecialMoveType {
    switch (this.selectedMove) {
      case SpecialMoveType.NOVA_BARRAGE:
        this.selectedMove = SpecialMoveType.CHRONO_FREEZE;
        break;
      case SpecialMoveType.CHRONO_FREEZE:
        this.selectedMove = SpecialMoveType.WARP_RAM;
        break;
      case SpecialMoveType.WARP_RAM:
        this.selectedMove = SpecialMoveType.NOVA_BARRAGE;
        break;
      default:
        this.selectedMove = SpecialMoveType.NOVA_BARRAGE;
        break;
    }
    return this.selectedMove;
  }

  // --- Trigger & Execution ---

  public trigger(move?: SpecialMoveType): boolean {
    return this.triggerSpecial(move);
  }

  public triggerSpecial(move?: SpecialMoveType): boolean {
    if (!this.isReady()) {
      return false;
    }

    const targetMove = move ?? this.selectedMove;

    // Consume gauge and set cooldown
    this.energy = 0;
    this.cooldownTimer = this.maxCooldown;
    this.isActive = true;
    this.activeMove = targetMove;
    this.activeTimer = 0;

    switch (targetMove) {
      case SpecialMoveType.NOVA_BARRAGE:
        this.executeNovaBarrage();
        break;
      case SpecialMoveType.CHRONO_FREEZE:
        this.executeChronoFreeze();
        break;
      case SpecialMoveType.WARP_RAM:
        this.executeWarpRam();
        break;
    }

    return true;
  }

  // --- 1. Nova Barrage ---

  private executeNovaBarrage(): void {
    const player = this.game.player;
    const px = player ? player.x : 112;
    const py = player ? player.y : 250;

    // Find living enemies
    this.scratchTargetList.length = 0;
    if (this.game.formationManager) {
      const living = this.game.formationManager.getLivingEnemies();
      for (const e of living) {
        if (e.active && e.state !== EnemyState.EXPLODING && e.state !== EnemyState.INACTIVE) {
          this.scratchTargetList.push(e);
        }
      }
    }

    const boss = this.game.bossManager?.activeBoss;
    const targetCount = this.scratchTargetList.length;

    // Fire 16 missiles in a wide fan salvo
    const totalMissiles = 16;
    for (let i = 0; i < totalMissiles; i++) {
      // Symmetrical fan angle from -125 degrees to -55 degrees (-PI/2 is straight up)
      const spreadFraction = (i - (totalMissiles - 1) / 2) / (totalMissiles / 2);
      const angle = -Math.PI / 2 + spreadFraction * (Math.PI / 3.2);

      // Target selection
      let target: Enemy | BaseBoss | null = null;
      if (boss && boss.active && (i < 8 || targetCount === 0)) {
        target = boss;
      } else if (targetCount > 0) {
        target = this.scratchTargetList[i % targetCount] ?? null;
      }

      const missile = this.missilePool.acquire();
      if (missile) {
        const hardpointX = px + (i % 2 === 0 ? -6 : 6);
        missile.init(hardpointX, py - 6, angle, target, 320);
      }
    }

    // Audio SFX & Screen Shake
    const synth = this.game.soundSynth as any;
    if (synth && typeof synth.playNovaLockChime === 'function') {
      synth.playNovaLockChime();
    }
    if (synth && typeof synth.playNovaMissileSwoosh === 'function') {
      synth.playNovaMissileSwoosh();
    } else {
      this.game.soundSynth?.playLaser();
      this.game.soundSynth?.playExplosion('large');
    }
  }

  // --- 2. Chrono Freeze ---

  private executeChronoFreeze(): void {
    this.chronoFreezeTimer = this.chronoFreezeDuration;

    // Audio resonance
    const synth = this.game.soundSynth as any;
    if (synth && typeof synth.playChronoFreezeDrop === 'function') {
      synth.playChronoFreezeDrop();
    } else if (this.game.soundSynth && typeof (this.game.soundSynth as unknown as { playAlienDive?: (type: string) => void }).playAlienDive === 'function') {
      (this.game.soundSynth as unknown as { playAlienDive: (type: string) => void }).playAlienDive('boss');
    }
    if (synth && typeof synth.playClockFreezeTick === 'function') {
      synth.playClockFreezeTick();
    }
  }

  public isChronoFrozen(): boolean {
    return this.chronoFreezeTimer > 0;
  }

  public isChronoFreezeActive(): boolean {
    return this.chronoFreezeTimer > 0;
  }

  public getEnemyDeltaTime(dt: number): number {
    return this.chronoFreezeTimer > 0 ? 0 : dt;
  }

  // --- 3. Dimensional Warp Ram ---

  private executeWarpRam(): void {
    this.warpRamHitTargetIds.clear();
    this.warpRamTimer = this.warpRamDuration;
    this.warpRamExitedTop = false;

    const player = this.game.player;
    if (player) {
      this.warpRamStartY = player.y || Player.BASELINE_Y;
      player.isWarpRamActive = true;
      // Absolute invulnerability during warp ram
      player.invulnerableTimer = Math.max(player.invulnerableTimer, this.warpRamDuration + 0.5);
    }

    // Camera screen shake
    if (typeof this.game.triggerScreenShake === 'function') {
      this.game.triggerScreenShake(1.5, 0.6);
    }

    // Audio
    const synth = this.game.soundSynth as any;
    if (synth && typeof synth.playWarpRamSonicBoom === 'function') {
      synth.playWarpRamSonicBoom();
    } else {
      this.game.soundSynth?.playExplosion('large');
    }
  }

  public isWarpRamActive(): boolean {
    return this.warpRamTimer > 0;
  }

  // --- Energy Spark Spawning ---

  public spawnSpark(x: number, y: number, value: number = 15.0): EnergySpark | null {
    const spark = this.sparkPool.acquire();
    if (!spark) return null;
    spark.init(x, y, value, 300);
    return spark;
  }

  // --- Frame Update Loop ---

  public update(dt: number): void {
    // 1. Cooldown decrement
    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
    }

    // 2. Chrono Freeze decrement
    if (this.chronoFreezeTimer > 0) {
      this.chronoFreezeTimer = Math.max(0, this.chronoFreezeTimer - dt);
    }

    // 3. Dimensional Warp Ram kinematics
    if (this.warpRamTimer > 0) {
      this.warpRamTimer = Math.max(0, this.warpRamTimer - dt);
      const player = this.game.player;

      if (player) {
        // Enforce invulnerability during warp ram
        player.invulnerableTimer = Math.max(player.invulnerableTimer, 0.5);

        // Hyper-speed upward surge
        if (!this.warpRamExitedTop) {
          player.y -= this.warpRamSpeed * dt;
          if (player.y < -30) {
            this.warpRamExitedTop = true;
            player.invulnerableTimer = Math.max(player.invulnerableTimer, 1.0);
          }
        } else {
          // Wrap re-entry
          player.y = this.warpRamStartY;
        }

        // Vaporize enemy bullets in the player's flight lane
        if (this.game.bulletManager) {
          const laneLeft = player.x - 20;
          const laneRight = player.x + 20;
          this.game.bulletManager.forEachActiveEnemyBullet((bullet) => {
            if (bullet.active && bullet.position.x >= laneLeft && bullet.position.x <= laneRight) {
              this.game.bulletManager.recycle(bullet);
              this.addEnergy(1.0); // +1% energy per vaporized bullet
              this.game.particleSystem?.spawnHitSparks(bullet.position.x, bullet.position.y);
            }
          });
        }

        // Emit Doppler wake particles every ~2 frames (0.035s)
        this.warpWakeTimer += dt;
        if (this.warpWakeTimer >= 0.035) {
          this.warpWakeTimer = 0;
          if (this.game.particleSystem && typeof this.game.particleSystem.spawnWarpWake === 'function') {
            this.game.particleSystem.spawnWarpWake(player.x, player.y + 12);
          }
        }
      }

      // Update speed lines kinematics
      for (let i = 0; i < SpecialMovesManager.SPEED_LINE_COUNT; i++) {
        this.speedLineY[i]! += this.speedLineSpeed[i]! * dt;
        if (this.speedLineY[i]! > 288) {
          this.speedLineY[i] = -this.speedLineLen[i]!;
          this.speedLineX[i] = Math.random() * 224;
        }
      }

      // Conclude Warp Ram
      if (this.warpRamTimer <= 0 && player) {
        player.y = this.warpRamStartY;
        player.invulnerableTimer = 0.5; // Grace window
        player.isWarpRamActive = false;
      }
    }

    // 4. Update Nova Missiles
    this.missilePool.forEachActiveSafe((missile) => {
      const alive = missile.update(dt);
      if (!alive) {
        this.missilePool.release(missile);
      }
    });

    // 5. Update Energy Sparks
    this.sparkPool.forEachActiveSafe((spark) => {
      const alive = spark.update(dt, this.game.player);
      if (!alive) {
        this.sparkPool.release(spark);
      }
    });

    // 6. Active state update
    if (this.activeMove) {
      this.activeTimer += dt;
      if (this.chronoFreezeTimer <= 0 && this.warpRamTimer <= 0 && this.missilePool.getActiveCount() === 0) {
        this.isActive = false;
        this.activeMove = null;
      }
    }
  }

  // --- Collision Resolution Hook ---

  public resolveCollisions(enemies: Enemy[], bossManager?: { activeBoss: BaseBoss | null }): void {
    const player = this.game.player;

    // 1. Nova Missiles vs Enemies
    this.missilePool.forEachActiveSafe((missile) => {
      if (!missile.active) return;
      const mBox = missile.getHitbox();

      for (const enemy of enemies) {
        if (!enemy.active || enemy.state === EnemyState.EXPLODING || enemy.state === EnemyState.INACTIVE) {
          continue;
        }

        const eBox = enemy.getHitbox();
        if (checkAABB(mBox, eBox)) {
          this.missilePool.release(missile);
          if (this.game.particleSystem && typeof this.game.particleSystem.spawnNovaImpact === 'function') {
            this.game.particleSystem.spawnNovaImpact(missile.x, missile.y);
          }

          if (enemy instanceof BaseBoss) {
            const res = enemy.takeDamage(missile.damage);
            if (res.destroyed) {
              this.game.soundSynth?.playExplosion('boss');
              this.game.particleSystem?.spawnBossExplosion(enemy.x, enemy.y);
            } else {
              this.game.soundSynth?.playBossHit();
              this.game.particleSystem?.spawnHitSparks(enemy.x, enemy.y);
            }
          } else {
            const res = enemy.takeDamage(99);
            if (res.destroyed) {
              this.game.soundSynth?.playExplosion('small');
              this.game.particleSystem?.spawnBossExplosion(enemy.x, enemy.y, 16);
              if (this.game.scoreManager) {
                this.game.scoreManager.addScore(res.points);
              }
            }
          }
          break;
        }
      }

      // Check Boss directly
      if (missile.active && bossManager && bossManager.activeBoss && bossManager.activeBoss.active) {
        const boss = bossManager.activeBoss;
        const bBox = boss.getHitbox();
        if (checkAABB(mBox, bBox)) {
          this.missilePool.release(missile);
          if (this.game.particleSystem && typeof this.game.particleSystem.spawnNovaImpact === 'function') {
            this.game.particleSystem.spawnNovaImpact(missile.x, missile.y);
          }
          boss.takeDamage(missile.damage);
        }
      }
    });

    // 2. Warp Ram Swept Hitbox vs Enemies
    if (this.isWarpRamActive() && player) {
      const ramBox = {
        x: player.x - 18,
        y: player.y - 16,
        width: 36,
        height: 32,
      };

      for (const enemy of enemies) {
        if (!enemy.active || enemy.state === EnemyState.EXPLODING || enemy.state === EnemyState.INACTIVE) {
          continue;
        }

        const targetKey = (enemy as any).id ?? enemy;
        if (this.warpRamHitTargetIds.has(targetKey)) {
          continue;
        }

        const eBox = enemy.getHitbox();
        if (checkAABB(ramBox, eBox)) {
          this.warpRamHitTargetIds.add(targetKey);
          if (enemy instanceof BaseBoss) {
            enemy.takeDamage(120); // Massive blunt kinetic trauma
            this.game.soundSynth?.playExplosion('boss');
            this.game.particleSystem?.spawnBossExplosion(enemy.x, enemy.y);
          } else {
            const res = enemy.takeDamage(999);
            if (res.destroyed) {
              this.game.soundSynth?.playExplosion('small');
              this.game.particleSystem?.spawnBossExplosion(enemy.x, enemy.y, 20);
              if (this.game.scoreManager) {
                this.game.scoreManager.addScore(res.points);
              }
            }
          }
        }
      }

      if (bossManager && bossManager.activeBoss && bossManager.activeBoss.active) {
        const boss = bossManager.activeBoss;
        const bossKey = (boss as any).id ?? boss;
        if (!this.warpRamHitTargetIds.has(bossKey)) {
          const bBox = boss.getHitbox();
          if (checkAABB(ramBox, bBox)) {
            this.warpRamHitTargetIds.add(bossKey);
            boss.takeDamage(120);
            this.game.soundSynth?.playExplosion('boss');
            this.game.particleSystem?.spawnBossExplosion(boss.x, boss.y);
          }
        }
      }
    }

    // 3. Energy Sparks Collection vs Player
    if (player && player.state !== 'DESTROYED') {
      const playerBox = player.getHitbox();

      this.sparkPool.forEachActiveSafe((spark) => {
        if (!spark.active) return;
        const sBox = spark.getHitbox();

        if (checkAABB(playerBox, sBox)) {
          this.addEnergy(spark.value);
          if (this.game.scoreManager) {
            this.game.scoreManager.addScore(spark.points);
          }
          if (this.game.particleSystem) {
            this.game.particleSystem.spawnHitSparks(spark.x, spark.y);
          }
          this.sparkPool.release(spark);
        }
      });
    }
  }

  // --- Render Loop ---

  public render(ctx: CanvasRenderingContext2D): void {
    // 1. Render Energy Sparks
    this.sparkPool.forEachActive((spark) => {
      spark.render(ctx);
    });

    // 2. Render Nova Missiles & Target Reticles
    this.missilePool.forEachActive((missile) => {
      if (missile.target && (missile.target as any).active) {
        const t = missile.target as any;
        SpriteRenderer.drawTargetingReticle(
          ctx,
          t.x,
          t.y,
          t.width || 16,
          t.height || 16,
          true,
          this.activeTimer
        );
      }
      missile.render(ctx);
    });

    // 3. Chrono Freeze Screen Corner Frost Crystals & Vignette
    if (this.chronoFreezeTimer > 0) {
      this.renderChronoFrost(ctx);
    }

    // 4. Warp Ram Plasma Shockcone & Motion Blur
    if (this.isWarpRamActive() && this.game.player) {
      this.renderWarpRamVFX(ctx);
    }
  }

  private renderChronoFrost(ctx: CanvasRenderingContext2D): void {
    SpriteRenderer.drawChronoFrostVignette(ctx, 224, 288, this.activeTimer);
  }

  private renderWarpRamVFX(ctx: CanvasRenderingContext2D): void {
    const player = this.game.player;
    if (!player) return;

    // Relativistic speed lines
    SpriteRenderer.drawWarpSpeedLines(
      ctx,
      this.speedLineX,
      this.speedLineY,
      this.speedLineLen,
      SpecialMovesManager.SPEED_LINE_COUNT,
      0.8
    );

    ctx.save();
    // Motion blur beam along flight column
    const gradient = ctx.createLinearGradient(player.x, player.y, player.x, player.y + 40);
    gradient.addColorStop(0, 'rgba(0, 255, 255, 0.8)');
    gradient.addColorStop(0.5, 'rgba(153, 0, 238, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(player.x - 14, player.y, 28, 48);

    // Lateral thrust flares
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(player.x - 16, player.y + 8, 4, 16);
    ctx.fillRect(player.x + 12, player.y + 8, 4, 16);
    ctx.restore();
  }

  public onStageClear(): void {
    this.missilePool.clear();
    this.sparkPool.clear();
    this.warpRamHitTargetIds.clear();
    this.isActive = false;
    this.activeMove = null;
    this.activeTimer = 0;
    this.chronoFreezeTimer = 0;
    this.warpRamTimer = 0;
    if (this.game?.player) {
      this.game.player.isWarpRamActive = false;
      this.game.player.y = Player.BASELINE_Y;
    }
  }

  public reset(): void {
    this.energy = 0;
    this.cooldownTimer = 0;
    this.isActive = false;
    this.activeMove = null;
    this.activeTimer = 0;
    this.chronoFreezeTimer = 0;
    this.warpRamTimer = 0;
    this.warpRamHitTargetIds.clear();
    this.missilePool.clear();
    this.sparkPool.clear();
    if (this.game?.player) {
      this.game.player.isWarpRamActive = false;
      this.game.player.y = Player.BASELINE_Y;
    }
  }

  public getMissilePool(): ObjectPool<NovaMissile> {
    return this.missilePool;
  }

  public getSparkPool(): ObjectPool<EnergySpark> {
    return this.sparkPool;
  }
}
