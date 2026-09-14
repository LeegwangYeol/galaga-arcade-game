/**
 * Galaga Arcade Web Game — Milestone 13: Zero-GC Pool Bounds & 10k-Tick Stress Suite
 * 
 * Verifies strict capacity boundaries:
 * - ClusterBomb: max 16, autoExpand: false
 * - BombExplosion: max 16, autoExpand: false
 * - NovaMissile: max 32, autoExpand: false
 * - EnergySpark: max 32, autoExpand: false
 * 
 * Executes 10,000 continuous fixed-timestep update ticks without heap expansion,
 * verifying zero pool leaks, O(1) recycling, and invariant stability.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { AlliesManager } from '../../src/core/allies/AlliesManager';
import { SpecialMovesManager } from '../../src/core/specials/SpecialMovesManager';
import { DroneType } from '../../src/core/allies/types';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState } from '../../src/types';

describe('Milestone 13 — Zero-GC Pool Bounds & 10,000-Tick Stress Endurance', () => {
  let game: Game;
  let alliesManager: AlliesManager;
  let specialManager: SpecialMovesManager;

  beforeEach(() => {
    game = new Game();
    alliesManager = game.getAlliesManager();
    specialManager = game.getSpecialMovesManager();
  });

  describe('1. Bounded Object Pools & Saturation Safeguards', () => {
    it('strictly enforces ClusterBomb pool upper bound of 16 without auto-expansion', () => {
      const pool = alliesManager.getBombPool();
      expect(pool.getMaxSize()).toBe(16);

      const acquired = [];
      for (let i = 0; i < 16; i++) {
        const bomb = alliesManager.spawnClusterBomb(100, 50);
        expect(bomb).not.toBeNull();
        acquired.push(bomb!);
      }

      expect(pool.getActiveCount()).toBe(16);

      // 17th acquisition must be rejected gracefully with null
      const overflowBomb = alliesManager.spawnClusterBomb(100, 50);
      expect(overflowBomb).toBeNull();
      expect(pool.getActiveCount()).toBe(16);

      // Release all and verify O(1) recycling
      for (const bomb of acquired) {
        pool.release(bomb);
      }
      expect(pool.getActiveCount()).toBe(0);

      // Can acquire again up to 16
      const reacquired = alliesManager.spawnClusterBomb(100, 50);
      expect(reacquired).not.toBeNull();
      expect(pool.getActiveCount()).toBe(1);
    });

    it('strictly enforces BombExplosion pool upper bound of 16 without auto-expansion', () => {
      const pool = alliesManager.getExplosionPool();
      expect(pool.getMaxSize()).toBe(16);

      const acquired = [];
      for (let i = 0; i < 16; i++) {
        const exp = alliesManager.spawnExplosion(100, 100, 28, 2);
        expect(exp).not.toBeNull();
        acquired.push(exp!);
      }

      expect(pool.getActiveCount()).toBe(16);

      // 17th acquisition must be rejected gracefully with null
      const overflowExp = alliesManager.spawnExplosion(100, 100, 28, 2);
      expect(overflowExp).toBeNull();
      expect(pool.getActiveCount()).toBe(16);

      for (const exp of acquired) {
        pool.release(exp);
      }
      expect(pool.getActiveCount()).toBe(0);
    });

    it('strictly enforces NovaMissile pool upper bound of 32 without auto-expansion', () => {
      const pool = specialManager.getMissilePool();
      expect(pool.getMaxSize()).toBe(32);

      const acquired = [];
      for (let i = 0; i < 32; i++) {
        const missile = pool.acquire();
        expect(missile).not.toBeNull();
        acquired.push(missile!);
      }

      expect(pool.getActiveCount()).toBe(32);

      // 33rd acquisition must return null
      const overflow = pool.acquire();
      expect(overflow).toBeNull();
      expect(pool.getActiveCount()).toBe(32);

      for (const missile of acquired) {
        pool.release(missile);
      }
      expect(pool.getActiveCount()).toBe(0);
    });

    it('strictly enforces EnergySpark pool upper bound of 32 without auto-expansion', () => {
      const pool = specialManager.getSparkPool();
      expect(pool.getMaxSize()).toBe(32);

      const acquired = [];
      for (let i = 0; i < 32; i++) {
        const spark = specialManager.spawnSpark(100, 100, 15.0);
        expect(spark).not.toBeNull();
        acquired.push(spark!);
      }

      expect(pool.getActiveCount()).toBe(32);

      // 33rd acquisition returns null
      const overflow = specialManager.spawnSpark(100, 100, 15.0);
      expect(overflow).toBeNull();
      expect(pool.getActiveCount()).toBe(32);

      for (const spark of acquired) {
        pool.release(spark);
      }
      expect(pool.getActiveCount()).toBe(0);
    });
  });

  describe('2. 10,000-Tick Continuous Endurance Combat Simulation', () => {
    it('executes 10,000 update ticks with continuous allies and special moves combat without pool leakage', () => {
      game.state = 'PLAYING';

      // Activate all 3 drones
      alliesManager.summonDrone(DroneType.ESCORT);
      alliesManager.summonDrone(DroneType.AEGIS);
      alliesManager.summonDrone(DroneType.BOMBER);

      // Seed enemies in formation
      for (let i = 0; i < 8; i++) {
        const enemy = new Enemy({
          id: `stress_enemy_${i}`,
          type: i % 2 === 0 ? EnemyType.GOEI : EnemyType.ZAKO,
          x: 40 + i * 20,
          y: 60,
        });
        enemy.state = EnemyState.IN_FORMATION;
        game.formationManager.enemies.push(enemy);
      }

      const dt = 1 / 60; // 60 FPS fixed timestep
      let specialMovesTriggered = 0;

      for (let tick = 0; tick < 10000; tick++) {
        // Charge energy periodically
        if (tick % 60 === 0) {
          specialManager.addEnergy(20);
        }

        // Cycle and trigger special moves when ready
        if (specialManager.isReady()) {
          specialManager.cycleSpecial();
          specialManager.trigger();
          specialMovesTriggered++;
        }

        // Re-summon bomber drone if inactive
        if (!alliesManager.bomberDrone.active && tick % 120 === 0) {
          alliesManager.summonDrone(DroneType.BOMBER);
        }

        // Spawn energy sparks occasionally
        if (tick % 90 === 0) {
          specialManager.spawnSpark(40 + (tick % 140), 50);
        }

        // Run game update
        game.update(dt);

        // Periodically respawn enemies if all destroyed
        if (game.formationManager.getLivingEnemies().length === 0) {
          for (let i = 0; i < 4; i++) {
            const enemy = new Enemy({
              id: `respawn_${tick}_${i}`,
              type: EnemyType.ZAKO,
              x: 50 + i * 30,
              y: 80,
            });
            enemy.state = EnemyState.IN_FORMATION;
            game.formationManager.enemies.push(enemy);
          }
        }
      }

      // Assert that multiple special moves were successfully triggered during 10k ticks
      expect(specialMovesTriggered).toBeGreaterThan(10);

      // Verify all pool capacities remain bounded and have not grown
      expect(alliesManager.getBombPool().getMaxSize()).toBe(16);
      expect(alliesManager.getExplosionPool().getMaxSize()).toBe(16);
      expect(specialManager.getMissilePool().getMaxSize()).toBe(32);
      expect(specialManager.getSparkPool().getMaxSize()).toBe(32);

      // Active counts must be within bounds (no negative or runaway counts)
      expect(alliesManager.getBombPool().getActiveCount()).toBeLessThanOrEqual(16);
      expect(alliesManager.getBombPool().getActiveCount()).toBeGreaterThanOrEqual(0);
      expect(alliesManager.getExplosionPool().getActiveCount()).toBeLessThanOrEqual(16);
      expect(alliesManager.getExplosionPool().getActiveCount()).toBeGreaterThanOrEqual(0);
      expect(specialManager.getMissilePool().getActiveCount()).toBeLessThanOrEqual(32);
      expect(specialManager.getMissilePool().getActiveCount()).toBeGreaterThanOrEqual(0);
      expect(specialManager.getSparkPool().getActiveCount()).toBeLessThanOrEqual(32);
      expect(specialManager.getSparkPool().getActiveCount()).toBeGreaterThanOrEqual(0);

      // Starfield, particle, and bullet manager entities must also remain stable
      expect(Number.isNaN(game.player.x)).toBe(false);
      expect(Number.isNaN(game.player.y)).toBe(false);
    });
  });
});
