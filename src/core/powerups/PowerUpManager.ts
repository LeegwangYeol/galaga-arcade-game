/**
 * Galaga Arcade Web Game — Power-Up Subsystem Coordinator
 * Location: src/core/powerups/PowerUpManager.ts
 */

import { ObjectPool } from '../ObjectPool';
import { PowerUpItem } from './PowerUpItem';
import {
  PowerUpType,
  type ActiveBuffState,
  type PowerUpStats,
} from './types';
import type { Game } from '../Game';
import type { Player } from '../../entities/Player';
import { EnemyType, EnemyState, type Rect } from '../../types';
import { DifficultyCalculator } from '../../systems/DifficultyCalculator';

export interface PowerUpManagerOptions {
  game?: Game;
  dropRateBaseline?: number;
}

export class PowerUpManager {
  public static readonly POOL_CAPACITY = 32;
  public static readonly POOL_MAX_SIZE = 32;
  public static readonly BASELINE_DROP_RATE = 0.12; // 12% baseline
  public static readonly DEFAULT_BUFF_DURATION = 15.0; // 15 seconds
  public static readonly MAX_BUFF_DURATION = 30.0; // 30 seconds clamp

  private game: Game | null = null;
  private pool: ObjectPool<PowerUpItem>;
  private nextItemId: number = 1;

  // Active Upgrade Buff State
  public buffState: ActiveBuffState = {
    rapidFireTimer: 0,
    scatterShotTimer: 0,
    engineBoosterTimer: 0,
    hasShield: false,
    empBombCount: 0,
    chronoFieldTimer: 0,
    reflectionShieldTimer: 0,
    hasReflectionShield: false,
    empCollectorTimer: 0,
    phaseDriveTimer: 0,
    plasmaBlasterTimer: 0,
  };

  // Metrics
  private stats: PowerUpStats = {
    totalSpawned: 0,
    totalCollected: 0,
    totalDespawned: 0,
    activeCount: 0,
    poolCapacity: PowerUpManager.POOL_CAPACITY,
  };

  // Events
  public onCollect?: (type: PowerUpType, x: number, y: number) => void;
  public onEmpShockwave?: () => void;

  constructor(options: PowerUpManagerOptions = {}) {
    this.game = options.game ?? null;

    // Initialize Zero-Allocation Pool with 32 pre-allocated entities
    this.pool = new ObjectPool<PowerUpItem>({
      factory: () => new PowerUpItem(this.nextItemId++),
      reset: (item: PowerUpItem) => item.reset(),
      initialSize: PowerUpManager.POOL_CAPACITY,
      maxSize: PowerUpManager.POOL_MAX_SIZE,
      autoExpand: false,
    });
  }

  public setGame(game: Game): void {
    this.game = game;
  }

  public getPool(): ObjectPool<PowerUpItem> {
    return this.pool;
  }

  public getStats(): PowerUpStats {
    this.stats.activeCount = this.pool.getActiveCount();
    return { ...this.stats };
  }

  // ==========================================================================
  // Drop Rate Evaluation & Spawning
  // ==========================================================================

  /**
   * Evaluates deterministic drop roll upon enemy destruction.
   * Rates: 12% baseline, 18% diving, 30-40% Boss, 0% on Challenging Stages.
   */
  public spawnDrop(
    x: number,
    y: number,
    stage: number,
    enemyType: EnemyType = EnemyType.ZAKO,
    isDiving: boolean = false
  ): PowerUpItem | null {
    // 1. Strict Exclusion: Challenging stages never drop power-ups
    if (DifficultyCalculator.isChallengingStage(stage)) {
      return null;
    }

    // 2. Drop rate calculation
    let dropChance = this.computeDropChance(stage, enemyType, isDiving);

    // Apply DDA dynamic pity bonus
    if (this.game && this.game.dynamicDifficultyManager) {
      const pity = this.game.dynamicDifficultyManager.getPowerUpPityBonus();
      dropChance = Math.min(0.65, dropChance + pity);
    }

    // 3. Roll drop threshold
    if (Math.random() >= dropChance) {
      return null;
    }

    // 4. Select item type from weighted table
    const type = this.rollLootType(enemyType, stage);

    // 5. Spawn from pool
    return this.spawnPowerUp(x, y, type);
  }

  /**
   * Computes the exact drop chance percentage for an enemy.
   */
  public computeDropChance(
    stage: number,
    enemyType: EnemyType = EnemyType.ZAKO,
    isDiving: boolean = false
  ): number {
    if (DifficultyCalculator.isChallengingStage(stage)) {
      return 0;
    }

    let dropChance = PowerUpManager.BASELINE_DROP_RATE;

    if (enemyType === EnemyType.BOSS) {
      dropChance = isDiving ? 0.40 : 0.30;
    } else if (enemyType === EnemyType.GOEI) {
      dropChance = isDiving ? 0.225 : 0.15;
    } else {
      if (isDiving) {
        dropChance = 0.18;
      }
    }

    const tier = DifficultyCalculator.getStageTier(stage);
    if (tier === 'ELITE') {
      dropChance += 0.03;
    } else if (tier === 'DREADNOUGHT') {
      dropChance += 0.06;
    }

    return dropChance;
  }

  public getPoolSize(): number {
    return this.pool.getCapacity();
  }

  public getActiveCount(): number {
    return this.pool.getActiveCount();
  }

  public getActiveItems(): readonly PowerUpItem[] {
    return this.pool.getActive();
  }

  public forceSpawn(x: number, y: number, type: PowerUpType): PowerUpItem | null {
    return this.spawnPowerUp(x, y, type);
  }

  /**
   * Alias for spawnDrop to accommodate alternate caller conventions.
   */
  public tryDropEnemyKill(
    x: number,
    y: number,
    enemyType: EnemyType,
    isDiving: boolean,
    stage: number
  ): PowerUpItem | null {
    return this.spawnDrop(x, y, stage, enemyType, isDiving);
  }

  /**
   * Selects power-up type using weighted lottery.
   * Stage <= 10: Preserves canonical 5-item classic distribution (30/25/20/15/10).
   * Stage >= 11: Expanded 10-item distribution including M19 Post-Launch upgrades.
   */
  public rollLootType(enemyType: EnemyType = EnemyType.ZAKO, stage: number = 1): PowerUpType {
    let weights: Record<PowerUpType, number>;

    if (stage <= 10) {
      if (enemyType === EnemyType.BOSS) {
        weights = {
          [PowerUpType.KINETIC_SHIELD]: 35,
          [PowerUpType.EMP_BOMB]: 20,
          [PowerUpType.RAPID_FIRE]: 20,
          [PowerUpType.SCATTER_SHOT]: 15,
          [PowerUpType.ENGINE_BOOSTER]: 10,
          [PowerUpType.CHRONO_FIELD]: 0,
          [PowerUpType.REFLECTION_SHIELD]: 0,
          [PowerUpType.EMP_COLLECTOR]: 0,
          [PowerUpType.PHASE_DRIVE]: 0,
          [PowerUpType.ANTIMATTER_PLASMA]: 0,
        };
      } else {
        weights = {
          [PowerUpType.RAPID_FIRE]: 30,
          [PowerUpType.KINETIC_SHIELD]: 25,
          [PowerUpType.SCATTER_SHOT]: 20,
          [PowerUpType.ENGINE_BOOSTER]: 15,
          [PowerUpType.EMP_BOMB]: 10,
          [PowerUpType.CHRONO_FIELD]: 0,
          [PowerUpType.REFLECTION_SHIELD]: 0,
          [PowerUpType.EMP_COLLECTOR]: 0,
          [PowerUpType.PHASE_DRIVE]: 0,
          [PowerUpType.ANTIMATTER_PLASMA]: 0,
        };
      }
    } else {
      // Stage >= 11: Expanded 10-item loot distribution
      if (enemyType === EnemyType.BOSS) {
        weights = {
          [PowerUpType.KINETIC_SHIELD]: 18,
          [PowerUpType.REFLECTION_SHIELD]: 15,
          [PowerUpType.EMP_BOMB]: 12,
          [PowerUpType.CHRONO_FIELD]: 12,
          [PowerUpType.ANTIMATTER_PLASMA]: 11,
          [PowerUpType.EMP_COLLECTOR]: 10,
          [PowerUpType.RAPID_FIRE]: 8,
          [PowerUpType.SCATTER_SHOT]: 6,
          [PowerUpType.PHASE_DRIVE]: 5,
          [PowerUpType.ENGINE_BOOSTER]: 3,
        };
      } else {
        weights = {
          [PowerUpType.RAPID_FIRE]: 15,
          [PowerUpType.KINETIC_SHIELD]: 12,
          [PowerUpType.SCATTER_SHOT]: 11,
          [PowerUpType.ENGINE_BOOSTER]: 10,
          [PowerUpType.EMP_BOMB]: 8,
          [PowerUpType.CHRONO_FIELD]: 10,
          [PowerUpType.REFLECTION_SHIELD]: 10,
          [PowerUpType.EMP_COLLECTOR]: 8,
          [PowerUpType.PHASE_DRIVE]: 8,
          [PowerUpType.ANTIMATTER_PLASMA]: 8,
        };
      }
    }

    let totalWeight = 0;
    for (const key in weights) {
      totalWeight += weights[key as PowerUpType];
    }

    let roll = Math.random() * totalWeight;
    for (const key in weights) {
      const type = key as PowerUpType;
      roll -= weights[type];
      if (roll <= 0) {
        return type;
      }
    }

    return PowerUpType.RAPID_FIRE;
  }

  /**
   * Leases a PowerUpItem from the pool and initializes it at (x, y).
   */
  public spawnPowerUp(x: number, y: number, type: PowerUpType): PowerUpItem | null {
    const item = this.pool.acquire();
    if (!item) {
      return null;
    }

    item.init(x, y, type);
    this.stats.totalSpawned++;
    return item;
  }

  // ==========================================================================
  // Update Loop & Active Buff Timers
  // ==========================================================================

  /**
   * Updates falling items and decrements active buff countdown timers.
   */
  public update(dt: number, player?: Player): void {
    // 1. Update falling items
    this.pool.forEachActiveSafe((item) => {
      const alive = item.update(dt);
      if (!alive) {
        this.pool.release(item);
        this.stats.totalDespawned++;
      }
    });

    this.stats.activeCount = this.pool.getActiveCount();

    // 2. Decrement active buff timers (unless player is in capture sequence)
    const isPaused = player && (player.state === 'capturing' || player.state === 'CAPTURING');
    if (!isPaused) {
      if (this.buffState.rapidFireTimer > 0) {
        this.buffState.rapidFireTimer = Math.max(0, this.buffState.rapidFireTimer - dt);
      }
      if (this.buffState.scatterShotTimer > 0) {
        this.buffState.scatterShotTimer = Math.max(0, this.buffState.scatterShotTimer - dt);
      }
      if (this.buffState.engineBoosterTimer > 0) {
        this.buffState.engineBoosterTimer = Math.max(0, this.buffState.engineBoosterTimer - dt);
      }
      if (this.buffState.chronoFieldTimer > 0) {
        this.buffState.chronoFieldTimer = Math.max(0, this.buffState.chronoFieldTimer - dt);
      }
      if (this.buffState.reflectionShieldTimer > 0) {
        this.buffState.reflectionShieldTimer = Math.max(0, this.buffState.reflectionShieldTimer - dt);
        if (this.buffState.reflectionShieldTimer <= 0) {
          this.buffState.hasReflectionShield = false;
        }
      }
      if (this.buffState.empCollectorTimer > 0) {
        this.buffState.empCollectorTimer = Math.max(0, this.buffState.empCollectorTimer - dt);
      }
      if (this.buffState.phaseDriveTimer > 0) {
        this.buffState.phaseDriveTimer = Math.max(0, this.buffState.phaseDriveTimer - dt);
      }
      if (this.buffState.plasmaBlasterTimer > 0) {
        this.buffState.plasmaBlasterTimer = Math.max(0, this.buffState.plasmaBlasterTimer - dt);
      }
    }

    // Synchronize buff state with player entity if available
    if (player) {
      player.rapidFireTimer = this.buffState.rapidFireTimer;
      player.scatterShotTimer = this.buffState.scatterShotTimer;
      player.engineBoosterTimer = this.buffState.engineBoosterTimer;
      player.hasShield = this.buffState.hasShield;
      player.empBombCount = this.buffState.empBombCount;

      player.chronoFieldTimer = this.buffState.chronoFieldTimer;
      player.reflectionShieldTimer = this.buffState.reflectionShieldTimer;
      if (!this.buffState.hasReflectionShield) {
        player.hasReflectionShield = false;
      }
      player.empCollectorTimer = this.buffState.empCollectorTimer;
      player.phaseDriveTimer = this.buffState.phaseDriveTimer;
      player.plasmaBlasterTimer = this.buffState.plasmaBlasterTimer;

      // EMP Collector bullet absorption within 90px
      if (this.game && (this.buffState.empCollectorTimer > 0 || player.hasEmpCollector)) {
        this.game.bulletManager.forEachActiveEnemyBullet((bullet) => {
          const dx = bullet.position.x - player.x;
          const dy = bullet.position.y - player.y;
          if (dx * dx + dy * dy <= 8100) {
            this.game?.bulletManager.recycle(bullet);
            this.game?.scoreManager.addScore(50);
            this.game?.specialMovesManager?.addEnergy(5);
            this.game?.particleSystem.spawnHitSparks(bullet.position.x, bullet.position.y);
            this.game?.soundSynth?.playEmpBulletAbsorb?.();
          }
        });
      }
    }
  }

  // ==========================================================================
  // Collision & Collection Detection
  // ==========================================================================

  /**
   * Tests active power-up items against player ship hitbox.
   */
  public checkPlayerCollection(
    player: Player,
    onCollected?: (type: PowerUpType) => void
  ): void {
    if (!player) return;

    const s = player.state;
    const isAlive =
      s === 'normal' ||
      s === 'ALIVE' ||
      s === 'dual' ||
      s === 'DUAL' ||
      s === 'docking' ||
      s === 'DOCKING' ||
      s === 'respawning' ||
      s === 'RESPAWNING';

    if (!isAlive) return;

    const playerBox = player.getHitbox();

    this.pool.forEachActiveSafe((item) => {
      if (!item.active) return;

      const itemBox = item.getHitbox();
      if (this.checkAABB(itemBox, playerBox)) {
        this.applyPowerUp(item.type, player);
        this.stats.totalCollected++;
        onCollected?.(item.type);
        this.onCollect?.(item.type, item.x, item.y);
        this.pool.release(item);
      }
    });
  }

  /**
   * Applies upgrade effects to active buff state and player.
   */
  public applyPowerUp(type: PowerUpType, player: Player): void {
    switch (type) {
      case PowerUpType.RAPID_FIRE:
        this.buffState.rapidFireTimer = Math.min(
          PowerUpManager.MAX_BUFF_DURATION,
          this.buffState.rapidFireTimer + PowerUpManager.DEFAULT_BUFF_DURATION
        );
        player.rapidFireTimer = this.buffState.rapidFireTimer;
        break;

      case PowerUpType.KINETIC_SHIELD:
        this.buffState.hasShield = true;
        player.hasShield = true;
        player.shieldHp = 1;
        break;

      case PowerUpType.SCATTER_SHOT:
        this.buffState.scatterShotTimer = Math.min(
          PowerUpManager.MAX_BUFF_DURATION,
          this.buffState.scatterShotTimer + PowerUpManager.DEFAULT_BUFF_DURATION
        );
        player.scatterShotTimer = this.buffState.scatterShotTimer;
        break;

      case PowerUpType.EMP_BOMB:
        this.detonateEmpBomb();
        break;

      case PowerUpType.ENGINE_BOOSTER:
        this.buffState.engineBoosterTimer = Math.min(
          PowerUpManager.MAX_BUFF_DURATION,
          this.buffState.engineBoosterTimer + PowerUpManager.DEFAULT_BUFF_DURATION
        );
        player.engineBoosterTimer = this.buffState.engineBoosterTimer;
        break;

      case PowerUpType.CHRONO_FIELD:
        this.buffState.chronoFieldTimer = Math.min(
          PowerUpManager.MAX_BUFF_DURATION,
          this.buffState.chronoFieldTimer + 6.0
        );
        player.chronoFieldTimer = this.buffState.chronoFieldTimer;
        this.game?.soundSynth?.playChronoFieldActivate?.();
        break;

      case PowerUpType.REFLECTION_SHIELD:
        this.buffState.reflectionShieldTimer = Math.min(
          PowerUpManager.MAX_BUFF_DURATION,
          this.buffState.reflectionShieldTimer + 12.0
        );
        this.buffState.hasReflectionShield = true;
        player.reflectionShieldTimer = this.buffState.reflectionShieldTimer;
        player.hasReflectionShield = true;
        player.reflectionShieldHp = 3;
        this.game?.soundSynth?.playReflectionDeflect?.();
        break;

      case PowerUpType.EMP_COLLECTOR:
        this.buffState.empCollectorTimer = Math.min(
          PowerUpManager.MAX_BUFF_DURATION,
          this.buffState.empCollectorTimer + 5.0
        );
        player.empCollectorTimer = this.buffState.empCollectorTimer;
        this.game?.soundSynth?.playEmpBulletAbsorb?.();
        break;

      case PowerUpType.PHASE_DRIVE:
        this.buffState.phaseDriveTimer = Math.min(
          PowerUpManager.MAX_BUFF_DURATION,
          this.buffState.phaseDriveTimer + 15.0
        );
        player.phaseDriveTimer = this.buffState.phaseDriveTimer;
        this.game?.soundSynth?.playPhaseDriveBlink?.();
        break;

      case PowerUpType.ANTIMATTER_PLASMA:
        this.buffState.plasmaBlasterTimer = Math.min(
          PowerUpManager.MAX_BUFF_DURATION,
          this.buffState.plasmaBlasterTimer + 7.0
        );
        player.plasmaBlasterTimer = this.buffState.plasmaBlasterTimer;
        this.game?.soundSynth?.playPlasmaBeamPulse?.();
        break;
    }

    // Award collection score & trigger audio/visuals
    if (this.game) {
      this.game.scoreManager?.addScore?.(500); // 500 bonus points
      this.game.particleSystem?.spawnHitSparks?.(player.x, player.y);
      this.game.soundSynth?.playLaserDual?.();
    }
  }

  public getActiveBuffs(): ActiveBuffState {
    return { ...this.buffState };
  }

  public activateLaserAudio(player: Player): void {
    if (!this.game) return;
    if (player.isDual) {
      this.game.soundSynth?.playLaserDual?.();
    }
  }

  /**
   * Executes immediate EMP screen-wipe shockwave:
   * 1. Vaporizes all active enemy projectiles.
   * 2. Deals 1 damage to diving enemies.
   * 3. Triggers radial particle shockwave.
   */
  public detonateEmpBomb(): void {
    if (!this.game) return;

    // 1. Recycle all active enemy bullets
    this.game.bulletManager.forEachActiveEnemyBullet((bullet) => {
      this.game?.particleSystem?.spawnHitSparks?.(bullet.position.x, bullet.position.y);
      this.game?.bulletManager.recycle(bullet);
    });

    // 2. Damage diving enemies
    for (const enemy of this.game.formationManager.enemies) {
      if (
        enemy.active &&
        (enemy.state === EnemyState.DIVING_SOLO ||
          enemy.state === EnemyState.DIVING_ESCORT ||
          enemy.state === EnemyState.TRACTOR_BEAM_ACTIVE ||
          enemy.state === EnemyState.CAPTURED_HOSTILE)
      ) {
        const res = enemy.takeDamage(1);
        if (res.destroyed) {
          this.game.soundSynth?.playExplosion?.('small');
          this.game.particleSystem?.spawnSmallAlienExplosion?.(enemy.x, enemy.y);
          this.game.scoreManager?.addScoreForEnemy?.(enemy.type, true);
        } else {
          this.game.particleSystem?.spawnHitSparks?.(enemy.x, enemy.y);
        }
      }
    }

    // 3. Screen shockwave particle burst
    this.game.particleSystem?.spawnPlayerExplosion?.(112, 144);
    this.game.soundSynth?.playExplosion?.('large');
    this.onEmpShockwave?.();
  }

  // ==========================================================================
  // Render & Lifecycle
  // ==========================================================================

  public render(ctx: CanvasRenderingContext2D): void {
    this.pool.forEachActive((item) => {
      item.render(ctx);
    });
  }

  /**
   * Resets active buffs and clears all falling items.
   */
  public reset(): void {
    this.pool.clear();
    this.buffState = {
      rapidFireTimer: 0,
      scatterShotTimer: 0,
      engineBoosterTimer: 0,
      hasShield: false,
      empBombCount: 0,
      chronoFieldTimer: 0,
      reflectionShieldTimer: 0,
      hasReflectionShield: false,
      empCollectorTimer: 0,
      phaseDriveTimer: 0,
      plasmaBlasterTimer: 0,
    };
  }

  /**
   * Clears temporary buffs upon player loss of life.
   */
  public onPlayerDeath(): void {
    this.buffState.rapidFireTimer = 0;
    this.buffState.scatterShotTimer = 0;
    this.buffState.engineBoosterTimer = 0;
    this.buffState.hasShield = false;
    this.buffState.chronoFieldTimer = 0;
    this.buffState.reflectionShieldTimer = 0;
    this.buffState.hasReflectionShield = false;
    this.buffState.empCollectorTimer = 0;
    this.buffState.phaseDriveTimer = 0;
    this.buffState.plasmaBlasterTimer = 0;
  }

  private checkAABB(a: Rect, b: Rect): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }
}
