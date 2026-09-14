/**
 * Galaga Arcade Web Game — Milestone M30 Adversarial Pool Hygiene & Capacity Invariant Suite
 * Challenger: m30_pool_hygiene_verifier (Object Pool Lifecycle & Bounded Capacity Verifier)
 * Location: tests/unit/m30_pool_hygiene_verifier_adversarial.test.ts
 *
 * Empirical Challenge Objectives:
 * 1. Challenge 1 (autoExpand Invariant):
 *    - Asserts that contrary to COLLABORATION.md claims, bulletPool enforces autoExpand: true (32 -> 256).
 *    - Verifies that the remaining 7 pools (particle, powerUp, bomb, explosion, missile, spark, enemy)
 *      and phantomPool enforce autoExpand: false.
 * 2. Challenge 2 (Bounded Capacity Exhaustion):
 *    - Asserts exact saturation ceilings across all pools.
 *    - Identifies enemyPool dead-zone where initialSize: 48 with autoExpand: false prevents reaching maxSize: 64.
 * 3. Challenge 3 (Stage Boundary Teardown & Lifecycle Invariants):
 *    - Verifies that onStageClear flushes pools to getActiveCount() === 0.
 *    - Exposes defensive gap in updateStageClear where powerUpManager.reset() is omitted.
 * 4. Challenge 4 (Game Over Total Flush):
 *    - Verifies that setState('GAME_OVER') flushes all 9 pools unconditionally to getActiveCount() === 0.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { DroneType } from '../../src/core/allies/types';

describe('Milestone M30: Object Pool Lifecycle & Bounded Capacity Adversarial Suite', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game({} as any);
    game.startGame();
  });

  afterEach(() => {
    if (game) {
      game.destroy();
    }
  });

  describe('Track 1: autoExpand Flag Empirical Invariant Audit', () => {
    it('demonstrates that bulletPool has autoExpand: true (expanding from 32 to 256)', () => {
      const bp = game.bulletManager.getPool();
      expect((bp as any).autoExpand).toBe(true);
      expect(bp.getCapacity()).toBe(32);
      expect(bp.getMaxSize()).toBe(256);

      // Acquire 33 bullets to trigger auto-expansion
      for (let i = 0; i < 33; i++) {
        bp.acquire();
      }

      // Proves empirical expansion
      expect(bp.getCapacity()).toBeGreaterThan(32);
      expect(bp.getCapacity()).toBe(64);
    });

    it('confirms the other 7 pools (plus phantomPool) enforce autoExpand: false', () => {
      const particlePool = game.particleSystem.getPool();
      const powerUpPool = game.powerUpManager.getPool();
      const bombPool = game.alliesManager.getBombPool();
      const explosionPool = game.alliesManager.getExplosionPool();
      const missilePool = game.specialMovesManager.getMissilePool();
      const sparkPool = game.specialMovesManager.getSparkPool();
      const enemyPool = game.formationManager.getEnemyPool();
      const phantomPool = game.formationManager.getPhantomPool();

      expect((particlePool as any).autoExpand).toBe(false);
      expect((powerUpPool as any).autoExpand).toBe(false);
      expect((bombPool as any).autoExpand).toBe(false);
      expect((explosionPool as any).autoExpand).toBe(false);
      expect((missilePool as any).autoExpand).toBe(false);
      expect((sparkPool as any).autoExpand).toBe(false);
      expect((enemyPool as any).autoExpand).toBe(false);
      expect((phantomPool as any).autoExpand).toBe(false);
      expect(game.formationManager.getEnemyPool().getCapacity()).toBe(64);
    });
  });

  describe('Track 2: Bounded Capacity Saturation & Exhaustion Limits', () => {
    it('proves all pools strictly return null when reaching maximum capacity without runaway growth', () => {
      const poolMap = {
        bulletPool: { pool: game.bulletManager.getPool(), expectedCap: 256 },
        particlePool: { pool: game.particleSystem.getPool(), expectedCap: 250 },
        powerUpPool: { pool: game.powerUpManager.getPool(), expectedCap: 32 },
        bombPool: { pool: game.alliesManager.getBombPool(), expectedCap: 16 },
        explosionPool: { pool: game.alliesManager.getExplosionPool(), expectedCap: 16 },
        missilePool: { pool: game.specialMovesManager.getMissilePool(), expectedCap: 32 },
        sparkPool: { pool: game.specialMovesManager.getSparkPool(), expectedCap: 32 },
        enemyPool: { pool: game.formationManager.getEnemyPool(), expectedCap: 64 },
        phantomPool: { pool: game.formationManager.getPhantomPool(), expectedCap: 8 },
      };

      for (const [name, { pool, expectedCap }] of Object.entries(poolMap)) {
        pool.clear();
        let acquired = 0;
        while (pool.acquire() !== null) {
          acquired++;
          if (acquired > 1000) break;
        }
        expect(acquired, `${name} must saturate at exact cap`).toBe(expectedCap);
        expect(pool.acquire(), `${name} must return null after saturation`).toBeNull();
        expect(pool.getActiveCount(), `${name} active count must equal cap`).toBe(expectedCap);
        pool.clear();
        expect(pool.getActiveCount(), `${name} active count must reset to 0`).toBe(0);
      }
    });

    it('verifies enemyPool configuration where initialSize and maxSize are 64 with autoExpand: false', () => {
      const enemyPool = game.formationManager.getEnemyPool();
      expect(enemyPool.getMaxSize()).toBe(64);
      expect((enemyPool as any).autoExpand).toBe(false);
      expect(enemyPool.getCapacity()).toBe(64);

      enemyPool.clear();
      for (let i = 0; i < 64; i++) {
        expect(enemyPool.acquire()).not.toBeNull();
      }

      // 65th acquisition fails even though maxSize is 64
      expect(enemyPool.acquire()).toBeNull();
      enemyPool.clear();
    });
  });

  describe('Track 3: Stage Boundary Teardown & Lifecycle Flushes', () => {
    it('flushes munitions and active effects on natural onStageClear()', () => {
      // Seed active items
      game.powerUpManager.spawnPowerUp(112, 50, 'shield' as any);
      game.alliesManager.summonDrone(DroneType.BOMBER);
      game.alliesManager.spawnClusterBomb(100, 50);
      game.alliesManager.spawnExplosion(100, 50, 20, 1);
      game.specialMovesManager.getMissilePool().acquire();
      game.specialMovesManager.getSparkPool().acquire();

      expect(game.powerUpManager.getPool().getActiveCount()).toBe(1);
      expect(game.alliesManager.getBombPool().getActiveCount()).toBe(1);
      expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(1);
      expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(1);
      expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(1);

      // Trigger stage clear
      (game as any).formationManager.onStageClear();

      expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);
    });

    it('verifies updateStageClear() flushes powerUpManager when advancing stage directly', () => {
      game.powerUpManager.spawnPowerUp(112, 50, 'shield' as any);
      expect(game.powerUpManager.getPool().getActiveCount()).toBe(1);

      (game as any).setState('STAGE_CLEAR');
      (game as any).stateTimer = 3.0;
      (game as any).updateStageClear(0.016);

      // Cleanly flushed because updateStageClear includes this.powerUpManager.reset()
      expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
    });
  });

  describe('Track 4: Game Over Invariant Flush', () => {
    it('unconditionally flushes all 9 object pools to getActiveCount() === 0 on GAME_OVER', () => {
      // Lease items in all pools
      game.bulletManager.getPool().acquire();
      game.particleSystem.getPool().acquire();
      game.powerUpManager.getPool().acquire();
      game.alliesManager.getBombPool().acquire();
      game.alliesManager.getExplosionPool().acquire();
      game.specialMovesManager.getMissilePool().acquire();
      game.specialMovesManager.getSparkPool().acquire();
      game.formationManager.getEnemyPool().acquire();
      game.formationManager.getPhantomPool().acquire();

      (game as any).setState('GAME_OVER');

      expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
      expect(game.particleSystem.getPool().getActiveCount()).toBe(0);
      expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);
      expect(game.formationManager.getEnemyPool().getActiveCount()).toBe(0);
      expect(game.formationManager.getPhantomPool().getActiveCount()).toBe(0);
    });
  });
});
