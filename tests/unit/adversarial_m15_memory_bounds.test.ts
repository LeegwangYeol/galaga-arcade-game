/**
 * Adversarial Milestone 15 Stress Test: 50-Round Memory Bounds & Pool Saturation Hardening
 * 
 * Verifies:
 * 1. Multi-Pass 50-Round Continuous Combat Traversal:
 *    - Executes multiple full passes through 50 rounds (Stages 1..50).
 *    - Full weapon fire, 3 tactical drones active, 3 special moves fired, power-ups dropped, particles spawned.
 *    - Strict < 5.0 MB net heap growth invariant across long-run multi-pass execution.
 * 2. Pool Bounding & Reset Invariants across all 50 rounds:
 *    - Strict getActiveCount() === 0 reset across all 7 subsystems + enemyPool at stage boundaries:
 *      (bulletPool, particlePool, powerUpPool, bombPool, explosionPool, missilePool, sparkPool, enemyPool).
 * 3. Zero Un-Recycled Items & Strict autoExpand: false Invariants:
 *    - Over-acquisition stress tests verifying zero pool auto-expansion beyond configured capacity limits.
 *    - Full release and recycling verification (freeCount === capacity, activeCount === 0).
 * 4. Adversarial Mid-Action Teardown Hygiene:
 *    - Rapid stage skips mid-special move (Chrono Freeze, Warp Ram), mid-tractor beam, and mid-boss damage.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import { Game } from '../../src/core/Game';
import { DroneType } from '../../src/core/allies/types';
import { ParticleSystem } from '../../src/systems/ParticleSystem';

function forceGC(): void {
  if (typeof (globalThis as any).gc === 'function') {
    (globalThis as any).gc();
    (globalThis as any).gc();
    return;
  }
  try {
    v8.setFlagsFromString('--expose_gc');
    const gc = vm.runInNewContext('gc');
    if (typeof gc === 'function') {
      gc();
      gc();
    }
  } catch {
    // Fallback if V8 sandbox restricts gc
  }
}

/**
 * Executes full teardown protocol expected at stage boundaries.
 */
function teardownStageBoundary(game: Game): void {
  game.bulletManager.clear();
  game.particleSystem.clear();
  if (game.powerUpManager) {
    game.powerUpManager.reset();
  }
  if (game.alliesManager) {
    game.alliesManager.onStageClear();
  }
  if (game.specialMovesManager) {
    game.specialMovesManager.onStageClear();
  }
  if (game.formationManager) {
    game.formationManager.reset();
  }
  if (game.bossManager) {
    game.bossManager.reset();
  }
  if (game.crisisEventManager) {
    game.crisisEventManager.clearCrisis();
  }
}

describe('Milestone 15 Adversarial: 50-Round Memory Bounds & Pool Saturation', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.startGame();
  });

  afterEach(() => {
    if (game) {
      game.destroy();
    }
  });

  describe('1. Repeated Multi-Pass 50-Round Continuous Traversal & Heap Stability', () => {
    it('executes 2 full consecutive 50-round passes under full combat load with < 5.0 MB net heap growth', () => {
      const cheat = game.getCheatController();
      cheat.setInvincible(true);

      // Warmup & JIT compiler tier-up (60 ticks)
      cheat.skipToStage(1);
      for (let t = 0; t < 60; t++) {
        if (t % 10 === 0) {
          game.bulletManager.firePlayerBullet(112, 240, false, 300);
        }
        game.update(1 / 60);
      }
      cheat.killAllEnemies();
      teardownStageBoundary(game);

      forceGC();
      const baselineHeap = process.memoryUsage().heapUsed;

      const TOTAL_PASSES = 2;
      let totalStagesSimulated = 0;

      for (let pass = 1; pass <= TOTAL_PASSES; pass++) {
        for (let stage = 1; stage <= 50; stage++) {
          totalStagesSimulated++;
          const skipped = cheat.skipToStage(stage);
          expect(skipped).toBe(true);
          expect(game.stage).toBe(stage);

          // Deploy all 3 drones
          game.alliesManager.summonDrone(DroneType.ESCORT, 9999);
          game.alliesManager.summonDrone(DroneType.AEGIS, 9999);
          game.alliesManager.summonDrone(DroneType.BOMBER, 9999, 100, 36);

          // Trigger crisis on eligible stages
          if (stage >= 10 && stage % 4 === 0) {
            cheat.triggerCrisis('contingency');
          }

          // Simulate intense combat frames
          for (let f = 0; f < 15; f++) {
            // Player firing
            if (f % 3 === 0) {
              game.bulletManager.firePlayerBullet(game.player.x - 6, game.player.y - 10, true, 480);
              game.bulletManager.firePlayerBullet(game.player.x + 6, game.player.y - 10, true, 480);
            }

            // Drones weapon engagement
            if (f % 5 === 0) {
              game.alliesManager.spawnClusterBomb(100 + f * 4, 40);
            }

            // Trigger special moves with full energy
            if (f === 5) {
              cheat.fillEnergy(100);
              if (stage % 3 === 0) {
                cheat.triggerSpecialMove('nova');
              } else if (stage % 3 === 1) {
                cheat.triggerSpecialMove('chrono');
              } else {
                cheat.triggerSpecialMove('warp');
              }
            }

            // Power-up drops and explosions
            if (f === 7) {
              game.powerUpManager.spawnDrop(112, 100, stage);
              game.particleSystem.spawnPlayerExplosion(game.player.x, game.player.y);
              game.particleSystem.spawnBossExplosion(112, 80);
            }

            // Boss damage simulation if active
            if (game.bossManager.activeBoss?.active && f % 3 === 0) {
              game.bossManager.activeBoss.takeDamage(100);
            }

            game.update(1 / 60);
          }

          // Defeat living enemies
          cheat.killAllEnemies();

          // Stage boundary teardown
          teardownStageBoundary(game);

          // STRICT INVARIANT: All 7 pools + enemyPool must evaluate to strictly 0 active items
          expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
          expect(game.particleSystem.getPool().getActiveCount()).toBe(0);
          expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
          expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
          expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
          expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
          expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);
          expect(game.formationManager.getEnemyPool().getActiveCount()).toBe(0);
        }
      }

      expect(totalStagesSimulated).toBe(100);

      // Post-traversal garbage collection & heap stability assertion
      forceGC();
      const finalHeap = process.memoryUsage().heapUsed;
      const netDriftMB = (finalHeap - baselineHeap) / (1024 * 1024);

      // Must remain strictly under 5.0 MB
      expect(netDriftMB).toBeLessThan(5.0);
    });
  });

  describe('2. Pool Saturation & autoExpand: false Invariant Verification', () => {
    it('proves all fixed pools reject over-allocation and never expand beyond configured caps', () => {
      // Clean start for isolated testing
      teardownStageBoundary(game);

      // 1. PowerUpPool (capacity: 32, autoExpand: false)
      const powerUpPool = game.powerUpManager.getPool();
      powerUpPool.clear();
      const initialPowerUpCap = powerUpPool.getCapacity();
      expect(initialPowerUpCap).toBe(32);

      const leasedPowerUps = [];
      for (let i = 0; i < 32; i++) {
        const item = powerUpPool.acquire();
        expect(item).not.toBeNull();
        leasedPowerUps.push(item!);
      }
      expect(powerUpPool.getActiveCount()).toBe(32);
      expect(powerUpPool.getFreeCount()).toBe(0);
      expect(powerUpPool.isFull()).toBe(true);

      // Saturated over-acquire attempts must return null and NOT expand capacity
      for (let i = 0; i < 20; i++) {
        const overflow = powerUpPool.acquire();
        expect(overflow).toBeNull();
      }
      expect(powerUpPool.getCapacity()).toBe(32);

      // Release all leased items and verify zero un-recycled items
      for (const item of leasedPowerUps) {
        powerUpPool.release(item);
      }
      expect(powerUpPool.getActiveCount()).toBe(0);
      expect(powerUpPool.getFreeCount()).toBe(32);

      // 2. BombPool (capacity: 16, autoExpand: false)
      const bombPool = game.alliesManager.getBombPool();
      bombPool.clear();
      expect(bombPool.getCapacity()).toBe(16);
      const leasedBombs = [];
      for (let i = 0; i < 16; i++) {
        leasedBombs.push(bombPool.acquire()!);
      }
      expect(bombPool.getActiveCount()).toBe(16);
      expect(bombPool.acquire()).toBeNull();
      expect(bombPool.getCapacity()).toBe(16);
      bombPool.clear();
      expect(bombPool.getActiveCount()).toBe(0);
      expect(bombPool.getFreeCount()).toBe(16);

      // 3. ExplosionPool (capacity: 16, autoExpand: false)
      const expPool = game.alliesManager.getExplosionPool();
      expPool.clear();
      expect(expPool.getCapacity()).toBe(16);
      for (let i = 0; i < 16; i++) {
        expect(expPool.acquire()).not.toBeNull();
      }
      expect(expPool.acquire()).toBeNull();
      expect(expPool.getCapacity()).toBe(16);
      expPool.clear();
      expect(expPool.getActiveCount()).toBe(0);
      expect(expPool.getFreeCount()).toBe(16);

      // 4. MissilePool (capacity: 32, autoExpand: false)
      const missilePool = game.specialMovesManager.getMissilePool();
      missilePool.clear();
      expect(missilePool.getCapacity()).toBe(32);
      for (let i = 0; i < 32; i++) {
        expect(missilePool.acquire()).not.toBeNull();
      }
      expect(missilePool.acquire()).toBeNull();
      expect(missilePool.getCapacity()).toBe(32);
      missilePool.clear();
      expect(missilePool.getActiveCount()).toBe(0);
      expect(missilePool.getFreeCount()).toBe(32);

      // 5. SparkPool (capacity: 32, autoExpand: false)
      const sparkPool = game.specialMovesManager.getSparkPool();
      sparkPool.clear();
      expect(sparkPool.getCapacity()).toBe(32);
      for (let i = 0; i < 32; i++) {
        expect(sparkPool.acquire()).not.toBeNull();
      }
      expect(sparkPool.acquire()).toBeNull();
      expect(sparkPool.getCapacity()).toBe(32);
      sparkPool.clear();
      expect(sparkPool.getActiveCount()).toBe(0);
      expect(sparkPool.getFreeCount()).toBe(32);

      // 6. EnemyPool (initialSize: 64, maxSize: 64, autoExpand: false)
      const enemyPool = game.formationManager.getEnemyPool();
      enemyPool.clear();
      const initialEnemyCap = enemyPool.getCapacity();
      expect(initialEnemyCap).toBe(64);
      for (let i = 0; i < 64; i++) {
        expect(enemyPool.acquire()).not.toBeNull();
      }
      // With autoExpand: false, acquisition beyond initialSize returns null
      expect(enemyPool.acquire()).toBeNull();
      expect(enemyPool.getCapacity()).toBe(64);
      enemyPool.clear();
      expect(enemyPool.getActiveCount()).toBe(0);
      expect(enemyPool.getFreeCount()).toBe(64);

      // 7. ParticlePool (capacity: 250, autoExpand: false)
      const particlePool = game.particleSystem.getPool();
      particlePool.clear();
      expect(particlePool.getCapacity()).toBe(ParticleSystem.DEFAULT_MAX_PARTICLES);
      for (let i = 0; i < ParticleSystem.DEFAULT_MAX_PARTICLES; i++) {
        expect(particlePool.acquire()).not.toBeNull();
      }
      expect(particlePool.acquire()).toBeNull();
      expect(particlePool.getCapacity()).toBe(ParticleSystem.DEFAULT_MAX_PARTICLES);
      particlePool.clear();
      expect(particlePool.getActiveCount()).toBe(0);
      expect(particlePool.getFreeCount()).toBe(ParticleSystem.DEFAULT_MAX_PARTICLES);

      // 8. BulletPool (maxSize: 256, autoExpand: true up to cap)
      const bulletPool = game.bulletManager.getPool();
      bulletPool.clear();
      for (let i = 0; i < 300; i++) {
        bulletPool.acquire();
      }
      expect(bulletPool.getCapacity()).toBe(256);
      expect(bulletPool.getActiveCount()).toBe(256);
      expect(bulletPool.acquire()).toBeNull();
      bulletPool.clear();
      expect(bulletPool.getActiveCount()).toBe(0);
      expect(bulletPool.getFreeCount()).toBe(256);
    });
  });

  describe('3. Natural Stage Progression & Intermission Lifecycle Pool Hygiene', () => {
    it('clears all pools during natural STAGE_CLEAR -> STAGE_INTRO lifecycle update without manual cheats', () => {
      const cheat = game.getCheatController();
      cheat.setInvincible(true);

      // Start at stage 1 normal formation
      cheat.skipToStage(1);
      expect(game.stage).toBe(1);

      // Spawn munitions and particles
      game.bulletManager.firePlayerBullet(112, 200, false, 480);
      game.alliesManager.summonDrone(DroneType.BOMBER, 9999);
      game.alliesManager.spawnClusterBomb(112, 40);
      cheat.fillEnergy(100);
      cheat.triggerSpecialMove('nova');
      game.powerUpManager.spawnDrop(112, 120, 1);
      game.particleSystem.spawnSmallAlienExplosion(112, 100);

      // Advance 2 frames so munitions are active in flight
      game.update(1 / 60);
      game.update(1 / 60);

      expect(game.bulletManager.getPool().getActiveCount()).toBeGreaterThan(0);
      expect(game.particleSystem.getPool().getActiveCount()).toBeGreaterThan(0);

      // Kill all enemies and advance frames to allow explosions to complete and stage clear to trigger
      cheat.killAllEnemies();

      for (let f = 0; f < 30; f++) {
        game.update(1 / 60);
        if (game.state === 'STAGE_CLEAR') break;
      }

      // Ensure state is STAGE_CLEAR
      expect(game.state).toBe('STAGE_CLEAR');

      // Fast-forward stage clear timer past clear duration
      for (let f = 0; f < 130; f++) {
        game.update(1 / 60);
      }

      // State should have transitioned to STAGE_INTRO or PLAYING for stage 2
      expect(game.stage).toBe(2);
      expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
      expect(game.particleSystem.getPool().getActiveCount()).toBe(0);
      expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);
    });
  });

  describe('4. Adversarial Mid-Action Teardown & Stress Resiliency', () => {
    it('safely tears down and resets pools mid-ChronoFreeze, mid-WarpRam, and mid-Boss Enrage without entity leakage', () => {
      const cheat = game.getCheatController();
      cheat.setInvincible(true);

      // Case A: Skip stage mid-ChronoFreeze
      cheat.skipToStage(15);
      cheat.fillEnergy(100);
      cheat.triggerSpecialMove('chrono');
      expect(game.specialMovesManager.isChronoFreezeActive()).toBe(true);

      // Immediate stage skip
      cheat.skipToStage(16);
      expect(game.specialMovesManager.isChronoFreezeActive()).toBe(false);
      expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);

      // Case B: Skip stage mid-WarpRam
      cheat.fillEnergy(100);
      cheat.triggerSpecialMove('warp');
      expect(game.specialMovesManager.isWarpRamActive()).toBe(true);

      cheat.skipToStage(20); // Boss stage
      expect(game.specialMovesManager.isWarpRamActive()).toBe(false);
      expect(game.bossManager.activeBoss).not.toBeNull();
      expect(game.bossManager.activeBoss?.stage).toBe(20);

      // Case C: Skip stage mid-Boss Phase (advance past INTRO to combat phase)
      const boss = game.bossManager.activeBoss;
      expect(boss).not.toBeNull();
      boss!.introTimer = 0;
      boss!.phase = 'PHASE_1';
      boss!.takeDamage(boss!.maxHealth * 0.6);
      expect(boss!.health).toBeLessThan(boss!.maxHealth);

      // Spawn heavy particles and bullets
      for (let i = 0; i < 10; i++) {
        game.particleSystem.spawnBossExplosion(112, 100);
      }
      expect(game.particleSystem.getPool().getActiveCount()).toBeGreaterThan(0);

      // Teardown via skip
      cheat.skipToStage(21);
      expect(game.bossManager.activeBoss).toBeNull();
      expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
      expect(game.particleSystem.getPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
    });
  });
});
