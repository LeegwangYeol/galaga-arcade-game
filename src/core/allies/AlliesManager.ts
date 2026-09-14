/**
 * Galaga Arcade Web Game — Allies Support System Manager
 * 
 * Master coordinator managing tactical wingmen drones, munitions pooling,
 * milestone unlocks, crisis synergies, and damage collision resolution with zero runtime GC.
 */

import { ObjectPool } from '../ObjectPool';
import { DroneType } from './types';
import { BaseDrone } from './BaseDrone';
import { EscortDrone } from './drones/EscortDrone';
import { AegisDrone } from './drones/AegisDrone';
import { BomberDrone } from './drones/BomberDrone';
import { ClusterBomb } from './pools/ClusterBomb';
import { BombExplosion } from './pools/BombExplosion';
import type { Game } from '../Game';
import type { Enemy } from '../../entities/Enemy';
import { EnemyState } from '../../types';
import type { Rect } from '../../types';
import { BaseBoss } from '../boss/BaseBoss';

function checkAABB(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export class AlliesManager {
  public game: Game;

  // Persistent Drone Singletons (Zero Runtime Heap Allocation)
  public escortDrone: EscortDrone;
  public aegisDrone: AegisDrone;
  public bomberDrone: BomberDrone;

  // Pre-allocated Munition Pools (Strictly Bounded to 16)
  private bombPool: ObjectPool<ClusterBomb>;
  private explosionPool: ObjectPool<BombExplosion>;

  // Milestone unlock flags
  private unlocked15k: boolean = false;
  private unlocked35k: boolean = false;
  private unlocked60k: boolean = false;

  constructor(game: Game) {
    this.game = game;

    // Instantiate drone singletons
    this.escortDrone = new EscortDrone(game);
    this.aegisDrone = new AegisDrone(game);
    this.bomberDrone = new BomberDrone(game);
    this.bomberDrone.setAlliesManager(this);

    // Pre-allocate bounded zero-GC pools (capacity = 16, autoExpand = false)
    this.bombPool = new ObjectPool<ClusterBomb>({
      factory: () => new ClusterBomb(),
      reset: (bomb) => bomb.reset(),
      initialSize: 16,
      maxSize: 16,
      autoExpand: false,
    });

    this.explosionPool = new ObjectPool<BombExplosion>({
      factory: () => new BombExplosion(),
      reset: (exp) => exp.reset(),
      initialSize: 16,
      maxSize: 16,
      autoExpand: false,
    });
  }

  /**
   * Activates a drone by type. Supports aliases spawnDrone & summonDrone.
   */
  public spawnDrone(type: DroneType, x?: number, y?: number, duration: number = 0): BaseDrone {
    return this.summonDrone(type, duration, x, y);
  }

  public summonDrone(type: DroneType, duration: number = 0, initialX?: number, initialY?: number): BaseDrone {
    const px = initialX !== undefined ? initialX : (this.game.player ? this.game.player.x : 112);
    const py = initialY !== undefined ? initialY : (this.game.player ? this.game.player.y : 250);

    switch (type) {
      case DroneType.ESCORT: {
        this.escortDrone.activate(duration, px, py);
        return this.escortDrone;
      }
      case DroneType.AEGIS: {
        this.aegisDrone.activate(duration, px, py);
        return this.aegisDrone;
      }
      case DroneType.BOMBER: {
        const startX = initialX !== undefined ? initialX : -24;
        const startY = initialY !== undefined ? initialY : 36;
        this.bomberDrone.activate(duration, startX, startY);
        return this.bomberDrone;
      }
      default:
        return this.escortDrone;
    }
  }

  /**
   * Spawns a cluster bomb from the zero-GC pool.
   */
  public spawnClusterBomb(x: number, y: number, vx: number = 0, vy: number = 150, targetY: number = 105): ClusterBomb | null {
    const bomb = this.bombPool.acquire();
    if (!bomb) return null;
    bomb.init(x, y, vx, vy, targetY);
    return bomb;
  }

  /**
   * Spawns an expanding blast shockwave from the pool.
   */
  public spawnExplosion(x: number, y: number, maxRadius: number = 28, damage: number = 2): BombExplosion | null {
    const exp = this.explosionPool.acquire();
    if (!exp) return null;
    exp.init(x, y, maxRadius, damage);

    // Audio and particles
    if (this.game.particleSystem) {
      this.game.particleSystem.spawnBossExplosion(x, y, 20);
    }
    if (this.game.soundSynth) {
      this.game.soundSynth.playExplosion('large');
    }

    return exp;
  }

  /**
   * Frame update for all active drones, bombs, and blast shockwaves.
   */
  public update(dt: number): void {
    const player = this.game.player;
    const px = player ? player.x : 112;
    const py = player ? player.y : 250;

    // 1. Update Drones
    if (this.escortDrone.active) {
      this.escortDrone.update(dt, px, py);
    }
    if (this.aegisDrone.active) {
      this.aegisDrone.update(dt, px, py);
    }
    if (this.bomberDrone.active) {
      this.bomberDrone.update(dt, px, py);
    }

    // 2. Update Dropped Cluster Bombs
    this.bombPool.forEachActiveSafe((bomb) => {
      const alive = bomb.update(dt);
      if (!alive) {
        // Detonation!
        this.spawnExplosion(bomb.x, bomb.y, 28, 2);
        this.bombPool.release(bomb);
      }
    });

    // 3. Update Expanding Bomb Explosions
    this.explosionPool.forEachActiveSafe((exp) => {
      const alive = exp.update(dt);
      if (!alive) {
        this.explosionPool.release(exp);
      }
    });
  }

  /**
   * Renders active drones, falling cluster munitions, and blast rings.
   */
  public render(ctx: CanvasRenderingContext2D): void {
    // 1. Render Cluster Bombs
    this.bombPool.forEachActive((bomb) => {
      bomb.render(ctx);
    });

    // 2. Render Explosions
    this.explosionPool.forEachActive((exp) => {
      exp.render(ctx);
    });

    // 3. Render Drones
    if (this.escortDrone.active) {
      this.escortDrone.render(ctx);
    }
    if (this.aegisDrone.active) {
      this.aegisDrone.render(ctx);
    }
    if (this.bomberDrone.active) {
      this.bomberDrone.render(ctx);
    }
  }

  /**
   * Collision resolution for bombs and explosions against living enemies.
   */
  public resolveCollisions(enemies: Enemy[], bossManager?: { activeBoss: BaseBoss | null }): void {
    // 1. Bombs hitting enemies mid-air
    this.bombPool.forEachActiveSafe((bomb) => {
      if (!bomb.active) return;
      const bombBox = bomb.getHitbox();

      for (const enemy of enemies) {
        if (!enemy.active || enemy.state === EnemyState.EXPLODING || enemy.state === EnemyState.INACTIVE) {
          continue;
        }

        const enemyBox = enemy.getHitbox();
        if (checkAABB(bombBox, enemyBox)) {
          // Detonate on direct contact
          this.spawnExplosion(bomb.x, bomb.y, 28, 2);
          this.bombPool.release(bomb);
          break;
        }
      }
    });

    // 2. Blast Shockwave Damage
    this.explosionPool.forEachActiveSafe((exp) => {
      if (!exp.active) return;
      const radiusSq = exp.currentRadius * exp.currentRadius;

      for (const enemy of enemies) {
        if (!enemy.active || enemy.state === EnemyState.EXPLODING || enemy.state === EnemyState.INACTIVE) {
          continue;
        }

        if (exp.hasHit(enemy.id)) continue;

        const dx = enemy.x - exp.x;
        const dy = enemy.y - exp.y;
        if (dx * dx + dy * dy <= radiusSq) {
          exp.recordHit(enemy.id);

          if (enemy instanceof BaseBoss) {
            const damageRes = enemy.takeDamage(exp.damage * 2);
            if (damageRes.destroyed) {
              this.game.soundSynth?.playExplosion('boss');
              this.game.particleSystem?.spawnBossExplosion(enemy.x, enemy.y);
            } else {
              this.game.soundSynth?.playBossHit();
              this.game.particleSystem?.spawnHitSparks(enemy.x, enemy.y);
            }
          } else {
            const res = enemy.takeDamage(exp.damage);
            if (res.destroyed) {
              this.game.soundSynth?.playExplosion('small');
              this.game.particleSystem?.spawnBossExplosion(enemy.x, enemy.y, 16);
              if (this.game.scoreManager) {
                this.game.scoreManager.addScore(res.points);
              }
            } else {
              this.game.soundSynth?.playBossHit();
              this.game.particleSystem?.spawnHitSparks(enemy.x, enemy.y);
            }
          }
        }
      }

      // Check Boss if active and not in regular enemies array
      if (bossManager && bossManager.activeBoss && bossManager.activeBoss.active) {
        const boss = bossManager.activeBoss;
        if (!exp.hasHit(boss.id)) {
          const dx = boss.x - exp.x;
          const dy = boss.y - exp.y;
          if (dx * dx + dy * dy <= radiusSq) {
            exp.recordHit(boss.id);
            boss.takeDamage(exp.damage * 2);
          }
        }
      }
    });
  }

  /**
   * Score milestone unlocking system (15k, 35k, 60k).
   */
  public checkMilestones(score: number, _stage: number): void {
    if (!this.unlocked15k && score >= 15000) {
      this.unlocked15k = true;
      this.summonDrone(DroneType.ESCORT);
    }
    if (!this.unlocked35k && score >= 35000) {
      this.unlocked35k = true;
      this.summonDrone(DroneType.AEGIS);
    }
    if (!this.unlocked60k && score >= 60000) {
      this.unlocked60k = true;
      this.summonDrone(DroneType.BOMBER);
    }
  }

  /**
   * Emergency support response when a Stellaris crisis event triggers.
   */
  public onCrisisTriggered(_crisisId: string): void {
    // Air support bombing run to alleviate swarm pressure
    this.summonDrone(DroneType.BOMBER);
  }

  public onStageClear(): void {
    // Persistent escort/aegis drones carry over, bombers complete their run
    // Clear active munition pools to prevent leaks across stages
    this.bombPool.clear();
    this.explosionPool.clear();
  }

  public reset(): void {
    this.escortDrone.reset();
    this.aegisDrone.reset();
    this.bomberDrone.reset();
    this.bombPool.clear();
    this.explosionPool.clear();
    this.unlocked15k = false;
    this.unlocked35k = false;
    this.unlocked60k = false;
  }

  public getBombPool(): ObjectPool<ClusterBomb> {
    return this.bombPool;
  }

  public getExplosionPool(): ObjectPool<BombExplosion> {
    return this.explosionPool;
  }
}
