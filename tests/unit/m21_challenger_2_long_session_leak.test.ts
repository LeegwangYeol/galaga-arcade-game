/**
 * Milestone M21 Adversarial Soak Test Suite
 * Author: m21_challenger_2 (Role: Long-Session Zero-Leak Soak Challenger)
 * Location: tests/unit/m21_challenger_2_long_session_leak.test.ts
 *
 * Verification Objectives:
 * 1. Extended Multi-Loop Soak:
 *    - Simulates 10,000+ game loop update ticks covering multiple full 50-round loops (Stages 1..50 repeated).
 *    - Continuously fires player bullets, spawns & applies M19 power-ups, triggers glitch anomalies,
 *      exercises tactical allies drones, special moves, and boss multi-phase transitions.
 * 2. ObjectPool Leak & Bounded Capacity Verification:
 *    - At every stage boundary, strictly asserts getActiveCount() === 0 across all 9 object pools:
 *      1. bulletPool (max 256)
 *      2. particlePool (max 256)
 *      3. powerUpPool (max 32)
 *      4. enemyPool (max 64)
 *      5. phantomPool (max 8)
 *      6. bombPool (max 16)
 *      7. explosionPool (max 16)
 *      8. missilePool (max 32)
 *      9. sparkPool (max 32)
 *    - Asserts that none of the bounded pools expanded past their designated limits.
 *    - Asserts freeCount === capacity at stage boundaries.
 * 3. Net Heap Drift Invariant:
 *    - Measures baseline V8 heap vs final V8 heap with forced garbage collection.
 *    - Strictly asserts net heap drift across 10,000+ ticks is < 5.0 MB.
 * 4. Coordinate & State Integrity:
 *    - Strictly asserts zero NaNs and finite coordinates across player, enemies, phantoms, bullets, and boss.
 *    - Zero uncaught exceptions and zero unhandled promise rejections.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import { Game } from '../../src/core/Game';
import { EnemyType, EnemyState } from '../../src/types';
import { DroneType } from '../../src/core/allies/types';

// ============================================================================
// Helper: Force V8 Garbage Collection
// ============================================================================
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
    // V8 sandbox fallback
  }
}

// ============================================================================
// Helper: Stage Boundary Teardown Protocol
// ============================================================================
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
    game.crisisEventManager.onStageClear();
  }
  if (game.glitchEventManager) {
    game.glitchEventManager.clearGlitch();
  }
}

// ============================================================================
// Helper: Strict Pool Hygiene & Capacity Invariants on All 9 Pools
// ============================================================================
function assertAll9PoolsHygiene(game: Game, context: string): void {
  // 1. bulletPool (max 256)
  const bulletPool = game.bulletManager.getPool();
  expect(bulletPool.getActiveCount(), `${context}: bulletPool activeCount must be 0`).toBe(0);
  expect(bulletPool.getCapacity(), `${context}: bulletPool capacity must be <= 256`).toBeLessThanOrEqual(256);
  expect(bulletPool.getCapacity(), `${context}: bulletPool capacity <= getMaxSize()`).toBeLessThanOrEqual(bulletPool.getMaxSize());
  expect(bulletPool.getFreeCount(), `${context}: bulletPool freeCount must equal capacity`).toBe(bulletPool.getCapacity());

  // 2. particlePool (max 256, default 250)
  const particlePool = game.particleSystem.getPool();
  expect(particlePool.getActiveCount(), `${context}: particlePool activeCount must be 0`).toBe(0);
  expect(particlePool.getCapacity(), `${context}: particlePool capacity must be <= 256`).toBeLessThanOrEqual(256);
  expect(particlePool.getCapacity(), `${context}: particlePool capacity <= getMaxSize()`).toBeLessThanOrEqual(particlePool.getMaxSize());
  expect(particlePool.getFreeCount(), `${context}: particlePool freeCount must equal capacity`).toBe(particlePool.getCapacity());

  // 3. powerUpPool (max 32)
  const powerUpPool = game.powerUpManager.getPool();
  expect(powerUpPool.getActiveCount(), `${context}: powerUpPool activeCount must be 0`).toBe(0);
  expect(powerUpPool.getCapacity(), `${context}: powerUpPool capacity must be <= 32`).toBeLessThanOrEqual(32);
  expect(powerUpPool.getCapacity(), `${context}: powerUpPool capacity <= getMaxSize()`).toBeLessThanOrEqual(powerUpPool.getMaxSize());
  expect(powerUpPool.getFreeCount(), `${context}: powerUpPool freeCount must equal capacity`).toBe(powerUpPool.getCapacity());

  // 4. enemyPool (max 64)
  const enemyPool = game.formationManager.getEnemyPool();
  expect(enemyPool.getActiveCount(), `${context}: enemyPool activeCount must be 0`).toBe(0);
  expect(enemyPool.getCapacity(), `${context}: enemyPool capacity must be <= 64`).toBeLessThanOrEqual(64);
  expect(enemyPool.getCapacity(), `${context}: enemyPool capacity <= getMaxSize()`).toBeLessThanOrEqual(enemyPool.getMaxSize());
  expect(enemyPool.getFreeCount(), `${context}: enemyPool freeCount must equal capacity`).toBe(enemyPool.getCapacity());

  // 5. phantomPool (max 8)
  const phantomPool = game.formationManager.getPhantomPool();
  expect(phantomPool.getActiveCount(), `${context}: phantomPool activeCount must be 0`).toBe(0);
  expect(phantomPool.getCapacity(), `${context}: phantomPool capacity must be <= 8`).toBeLessThanOrEqual(8);
  expect(phantomPool.getCapacity(), `${context}: phantomPool capacity <= getMaxSize()`).toBeLessThanOrEqual(phantomPool.getMaxSize());
  expect(phantomPool.getFreeCount(), `${context}: phantomPool freeCount must equal capacity`).toBe(phantomPool.getCapacity());

  // 6. bombPool (max 16)
  const bombPool = game.alliesManager.getBombPool();
  expect(bombPool.getActiveCount(), `${context}: bombPool activeCount must be 0`).toBe(0);
  expect(bombPool.getCapacity(), `${context}: bombPool capacity must be <= 16`).toBeLessThanOrEqual(16);
  expect(bombPool.getCapacity(), `${context}: bombPool capacity <= getMaxSize()`).toBeLessThanOrEqual(bombPool.getMaxSize());
  expect(bombPool.getFreeCount(), `${context}: bombPool freeCount must equal capacity`).toBe(bombPool.getCapacity());

  // 7. explosionPool (max 16)
  const explosionPool = game.alliesManager.getExplosionPool();
  expect(explosionPool.getActiveCount(), `${context}: explosionPool activeCount must be 0`).toBe(0);
  expect(explosionPool.getCapacity(), `${context}: explosionPool capacity must be <= 16`).toBeLessThanOrEqual(16);
  expect(explosionPool.getCapacity(), `${context}: explosionPool capacity <= getMaxSize()`).toBeLessThanOrEqual(explosionPool.getMaxSize());
  expect(explosionPool.getFreeCount(), `${context}: explosionPool freeCount must equal capacity`).toBe(explosionPool.getCapacity());

  // 8. missilePool (max 32)
  const missilePool = game.specialMovesManager.getMissilePool();
  expect(missilePool.getActiveCount(), `${context}: missilePool activeCount must be 0`).toBe(0);
  expect(missilePool.getCapacity(), `${context}: missilePool capacity must be <= 32`).toBeLessThanOrEqual(32);
  expect(missilePool.getCapacity(), `${context}: missilePool capacity <= getMaxSize()`).toBeLessThanOrEqual(missilePool.getMaxSize());
  expect(missilePool.getFreeCount(), `${context}: missilePool freeCount must equal capacity`).toBe(missilePool.getCapacity());

  // 9. sparkPool (max 32)
  const sparkPool = game.specialMovesManager.getSparkPool();
  expect(sparkPool.getActiveCount(), `${context}: sparkPool activeCount must be 0`).toBe(0);
  expect(sparkPool.getCapacity(), `${context}: sparkPool capacity must be <= 32`).toBeLessThanOrEqual(32);
  expect(sparkPool.getCapacity(), `${context}: sparkPool capacity <= getMaxSize()`).toBeLessThanOrEqual(sparkPool.getMaxSize());
  expect(sparkPool.getFreeCount(), `${context}: sparkPool freeCount must equal capacity`).toBe(sparkPool.getCapacity());
}

// ============================================================================
// Helper: Coordinate & State NaN Invariant Check
// ============================================================================
function assertZeroNaN(game: Game, context: string): void {
  // 1. Player
  expect(Number.isNaN(game.player.x), `${context}: Player X is NaN`).toBe(false);
  expect(Number.isNaN(game.player.y), `${context}: Player Y is NaN`).toBe(false);
  expect(Number.isNaN(game.player.vx), `${context}: Player Vx is NaN`).toBe(false);
  expect(Number.isNaN(game.player.vy), `${context}: Player Vy is NaN`).toBe(false);
  expect(Number.isFinite(game.player.x), `${context}: Player X is infinite`).toBe(true);
  expect(Number.isFinite(game.player.y), `${context}: Player Y is infinite`).toBe(true);

  // 2. Formation Enemies
  for (const enemy of game.formationManager.enemies) {
    if (!enemy.active) continue;
    expect(Number.isNaN(enemy.x), `${context}: Enemy #${enemy.id} X is NaN`).toBe(false);
    expect(Number.isNaN(enemy.y), `${context}: Enemy #${enemy.id} Y is NaN`).toBe(false);
    expect(Number.isNaN(enemy.vx), `${context}: Enemy #${enemy.id} Vx is NaN`).toBe(false);
    expect(Number.isNaN(enemy.vy), `${context}: Enemy #${enemy.id} Vy is NaN`).toBe(false);
    expect(Number.isNaN(enemy.rotation), `${context}: Enemy #${enemy.id} rotation is NaN`).toBe(false);
    expect(Number.isFinite(enemy.x), `${context}: Enemy #${enemy.id} X is infinite`).toBe(true);
    expect(Number.isFinite(enemy.y), `${context}: Enemy #${enemy.id} Y is infinite`).toBe(true);
  }

  // 3. Phantom Clones
  game.formationManager.phantomPool.forEachActive((clone) => {
    expect(Number.isNaN(clone.x), `${context}: Phantom clone X is NaN`).toBe(false);
    expect(Number.isNaN(clone.y), `${context}: Phantom clone Y is NaN`).toBe(false);
    expect(Number.isFinite(clone.x), `${context}: Phantom clone X is infinite`).toBe(true);
    expect(Number.isFinite(clone.y), `${context}: Phantom clone Y is infinite`).toBe(true);
  });

  // 4. Bullets
  game.bulletManager.getPool().forEachActive((bullet) => {
    expect(Number.isNaN(bullet.position.x), `${context}: Bullet X is NaN`).toBe(false);
    expect(Number.isNaN(bullet.position.y), `${context}: Bullet Y is NaN`).toBe(false);
    expect(Number.isFinite(bullet.position.x), `${context}: Bullet X is infinite`).toBe(true);
    expect(Number.isFinite(bullet.position.y), `${context}: Bullet Y is infinite`).toBe(true);
  });

  // 5. Active Boss
  if (game.bossManager?.activeBoss && game.bossManager.activeBoss.active) {
    const boss = game.bossManager.activeBoss;
    expect(Number.isNaN(boss.x), `${context}: Boss X is NaN`).toBe(false);
    expect(Number.isNaN(boss.y), `${context}: Boss Y is NaN`).toBe(false);
    expect(Number.isNaN(boss.health), `${context}: Boss health is NaN`).toBe(false);
    expect(Number.isFinite(boss.x), `${context}: Boss X is infinite`).toBe(true);
    expect(Number.isFinite(boss.y), `${context}: Boss Y is infinite`).toBe(true);
  }

  // 6. HUD / State Metrics
  expect(Number.isNaN(game.score), `${context}: Score is NaN`).toBe(false);
  expect(Number.isNaN(game.stage), `${context}: Stage is NaN`).toBe(false);
  expect(Number.isNaN(game.lives), `${context}: Lives is NaN`).toBe(false);
  expect(Number.isNaN(game.specialMovesManager.energy), `${context}: Special energy is NaN`).toBe(false);
}

// ============================================================================
// Test Suite Definition
// ============================================================================
describe('Milestone M21: Long-Session Zero-Leak Soak & Bounded Capacity Verifications', { timeout: 60000 }, () => {
  let game: Game;
  let unhandledRejections: any[] = [];
  let uncaughtExceptions: any[] = [];
  let rejectionHandler: (reason: any) => void;
  let exceptionHandler: (error: Error) => void;

  const M19_POWER_UPS = [
    'chrono_field',
    'reflection_shield',
    'emp_collector',
    'phase_drive',
    'antimatter_plasma',
  ];

  const GLITCH_TYPES = [
    'teleport',
    'kinetic',
    'mirage',
    'vector',
    'raster',
    'chroma',
    'xor',
    'hex',
  ];

  beforeEach(() => {
    unhandledRejections = [];
    uncaughtExceptions = [];
    rejectionHandler = (reason: any) => unhandledRejections.push(reason);
    exceptionHandler = (error: Error) => uncaughtExceptions.push(error);
    process.on('unhandledRejection', rejectionHandler);
    process.on('uncaughtException', exceptionHandler);

    game = new Game();
    game.startGame();
  });

  afterEach(() => {
    process.removeListener('unhandledRejection', rejectionHandler);
    process.removeListener('uncaughtException', exceptionHandler);

    if (game) {
      game.destroy();
    }

    expect(unhandledRejections, 'Unhandled promise rejections encountered during soak').toHaveLength(0);
    expect(uncaughtExceptions, 'Uncaught exceptions encountered during soak').toHaveLength(0);
  });

  // ==========================================================================
  // 1. Extended Multi-Loop Soak (10,000+ Ticks, 2x 50-Round Loops)
  // ==========================================================================
  it('simulates 10,000+ ticks across two complete 50-round loops with zero leaks across all 9 pools and < 5.0 MB heap drift', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    // Warmup JIT & initial pool allocation (60 ticks)
    cheat.skipToStage(1);
    for (let t = 0; t < 60; t++) {
      if (t % 10 === 0) {
        game.bulletManager.firePlayerBullet(112, 240, false, 300);
      }
      game.update(1 / 60);
    }
    teardownStageBoundary(game);

    forceGC();
    const baselineHeap = process.memoryUsage().heapUsed;

    let totalTicksSimulated = 0;
    let stageBoundariesVerified = 0;
    const TOTAL_LOOPS = 2; // 2 passes of Stages 1..50 = 100 stage traversals
    const TICKS_PER_STAGE = 105; // 100 * 105 = 10,500 combat ticks (+ clear ticks > 10,700 ticks total)

    for (let loop = 1; loop <= TOTAL_LOOPS; loop++) {
      for (let stage = 1; stage <= 50; stage++) {
        // Stage Boundary: Assert all 9 pools are completely clean BEFORE starting new stage
        teardownStageBoundary(game);
        assertAll9PoolsHygiene(game, `Loop ${loop} Stage ${stage} (Pre-Spawn Boundary)`);
        stageBoundariesVerified++;

        // Setup Stage
        cheat.skipToStage(stage);

        // Select & Apply M19 Power-Up
        const powerUp = M19_POWER_UPS[(stage - 1) % M19_POWER_UPS.length]!;
        cheat.applyPowerUp(powerUp);

        // Spawn falling power-up capsule to exercise item pool motion
        if (stage % 2 === 0) {
          cheat.spawnPowerUp(powerUp, 50 + (stage % 10) * 12, 50);
        }

        // Trigger Glitch Anomaly
        const glitch = GLITCH_TYPES[(stage - 1) % GLITCH_TYPES.length]!;
        cheat.triggerGlitch(glitch);

        // If mirage glitch, spawn phantom clones from phantomPool
        if (glitch === 'mirage') {
          game.formationManager.spawnMirageClones(112, 90, EnemyType.GOEI);
        }

        // Allies Drone Support (Bomber / Escort)
        if (stage % 5 === 0) {
          game.alliesManager.summonDrone(DroneType.BOMBER);
          game.alliesManager.spawnClusterBomb(80 + (stage % 8) * 10, 60);
          game.alliesManager.spawnExplosion(112, 100, 24, 2);
        }

        // Special Moves Execution (Nova / Chrono / Warp)
        if (stage % 4 === 0) {
          cheat.fillEnergy(100);
          const specialId = stage % 3 === 0 ? 'nova' : stage % 3 === 1 ? 'chrono' : 'warp';
          cheat.triggerSpecialMove(specialId);
          game.specialMovesManager.spawnSpark(100 + (stage % 6) * 8, 120);
        }

        // Dive Maneuver: peel off formation enemies if available
        const formationEnemies = game.formationManager.enemies.filter(
          (e) => e.active && e.state === EnemyState.IN_FORMATION
        );
        if (formationEnemies.length > 0) {
          game.formationManager.peelOffSolo(formationEnemies[0]!, game.player.x);
        }
        if (formationEnemies.length > 1) {
          game.formationManager.peelOffSolo(formationEnemies[1]!, game.player.x);
        }

        // Run live combat simulation ticks
        for (let tick = 0; tick < TICKS_PER_STAGE; tick++) {
          // Continuous weapon fire
          if (tick % 4 === 0) {
            game.bulletManager.firePlayerBullet(game.player.x - 4, game.player.y - 10, false, 360);
            game.bulletManager.firePlayerBullet(game.player.x + 4, game.player.y - 10, false, 360);
          }

          // Enemy firing simulation
          if (tick % 15 === 0) {
            game.bulletManager.fireEnemyBullet(112, 80, game.player.x, game.player.y, 180);
          }

          // Advance game simulation tick
          game.update(1 / 60);
          totalTicksSimulated++;

          // Multi-phase boss damage progression
          if (game.bossManager?.activeBoss?.active && tick % 5 === 0) {
            game.bossManager.activeBoss.takeDamage(20);
          }

          // Periodic NaN invariant verification (at tick 0 and mid-stage)
          if (tick === 0 || tick === Math.floor(TICKS_PER_STAGE / 2)) {
            assertZeroNaN(game, `Loop ${loop} Stage ${stage} Tick ${tick}`);
          }
        }

        // Stage Clear: Defeat living minions and boss
        cheat.killAllEnemies();

        // 3 transition frames to process explosions
        for (let t = 0; t < 3; t++) {
          game.update(1 / 60);
          totalTicksSimulated++;
        }

        // Stage Boundary: Assert all 9 pools are completely clean POST-CLEAR
        teardownStageBoundary(game);
        assertAll9PoolsHygiene(game, `Loop ${loop} Stage ${stage} (Post-Clear Boundary)`);
        stageBoundariesVerified++;

        // Periodic garbage collection at milestone intervals
        if (stage % 10 === 0) {
          forceGC();
        }
      }
    }

    // Strict multi-thousand-tick invariant
    expect(totalTicksSimulated).toBeGreaterThanOrEqual(10000);
    expect(stageBoundariesVerified).toBe(TOTAL_LOOPS * 50 * 2); // 200 boundary hygiene checks

    // Final Garbage Collection & Net Heap Drift Assertion
    forceGC();
    const finalHeap = process.memoryUsage().heapUsed;
    const netDriftMB = (finalHeap - baselineHeap) / (1024 * 1024);

    // Strictly assert net heap drift across 10,000+ ticks is < 5.0 MB
    expect(netDriftMB).toBeLessThan(5.0);
  });

  // ==========================================================================
  // 2. Maximal Simultaneous Saturation & Instant Teardown Hygiene
  // ==========================================================================
  it('guarantees complete zero-leak drainage across all 9 pools under maximal simultaneous saturation at stage boundary', () => {
    const cheat = game.getCheatController();
    cheat.skipToStage(26); // Glitch Sector stage

    // 1. bulletPool saturation: fire 40 player & enemy bullets
    for (let i = 0; i < 20; i++) {
      game.bulletManager.firePlayerBullet(40 + i * 6, 200, false, 300);
      game.bulletManager.fireEnemyBullet(50 + i * 6, 80, 112, 240, 180);
    }
    expect(game.bulletManager.getPool().getActiveCount()).toBeGreaterThanOrEqual(20);

    // 2. particlePool saturation: spawn multiple large explosions
    for (let i = 0; i < 8; i++) {
      game.particleSystem.spawnBossExplosion(50 + i * 15, 70);
      game.particleSystem.spawnPlayerExplosion(112, 240);
    }
    expect(game.particleSystem.getPool().getActiveCount()).toBeGreaterThanOrEqual(20);

    // 3. powerUpPool saturation: spawn 15 falling capsules
    for (let i = 0; i < 15; i++) {
      cheat.spawnPowerUp(M19_POWER_UPS[i % M19_POWER_UPS.length]!, 40 + i * 10, 60);
    }
    expect(game.powerUpManager.getPool().getActiveCount()).toBeGreaterThanOrEqual(10);

    // 4. enemyPool saturation: 40 formation enemies
    expect(game.formationManager.getEnemyPool().getActiveCount()).toBeGreaterThanOrEqual(40);

    // 5. phantomPool saturation: max out 8 phantom clones
    for (let i = 0; i < 16; i++) {
      game.formationManager.spawnMirageClones(80 + (i % 4) * 15, 90, EnemyType.GOEI);
    }
    expect(game.formationManager.getPhantomPool().getActiveCount()).toBe(8);

    // 6. bombPool & explosionPool saturation: bomber drone strikes
    game.alliesManager.summonDrone(DroneType.BOMBER);
    for (let i = 0; i < 6; i++) {
      game.alliesManager.spawnClusterBomb(60 + i * 18, 50);
      game.alliesManager.spawnExplosion(60 + i * 18, 120, 24, 2);
    }
    expect(game.alliesManager.getBombPool().getActiveCount()).toBeGreaterThanOrEqual(1);
    expect(game.alliesManager.getExplosionPool().getActiveCount()).toBeGreaterThanOrEqual(1);

    // 7. missilePool & sparkPool saturation: special nova barrage & sparks
    cheat.fillEnergy(100);
    cheat.triggerSpecialMove('nova');
    for (let i = 0; i < 10; i++) {
      game.specialMovesManager.spawnSpark(70 + i * 10, 140);
    }
    expect(game.specialMovesManager.getMissilePool().getActiveCount() +
           game.specialMovesManager.getSparkPool().getActiveCount()).toBeGreaterThanOrEqual(5);

    // Mid-Action Abrupt Stage Boundary Teardown
    teardownStageBoundary(game);

    // STRICT INVARIANT: All 9 pools must instantly register exactly 0 active leases
    assertAll9PoolsHygiene(game, 'Post-Max-Saturation Boundary Teardown');

    // Run 30 simulation ticks post-teardown to ensure zero ghost revivals
    for (let t = 0; t < 30; t++) {
      game.update(1 / 60);
    }
    assertAll9PoolsHygiene(game, 'Post-Saturation Quiescence (30 Ticks Later)');
  });

  // ==========================================================================
  // 3. Continuous 10,000-Tick Single-Session Soak with Micro-Leak Profiling
  // ==========================================================================
  it('verifies memory stability and zero heap growth over 10,000 continuous uninterrupted gameplay ticks in a single session', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    // Initial Warmup
    cheat.skipToStage(1);
    for (let t = 0; t < 60; t++) {
      game.update(1 / 60);
    }

    forceGC();
    const initialHeap = process.memoryUsage().heapUsed;
    const heapCheckpoints: { tick: number; heapMB: number }[] = [];

    const TOTAL_TICKS = 10000;
    const CHECKPOINT_INTERVAL = 2500;

    for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
      // Periodic player shooting (continuous firing)
      if (tick % 5 === 0) {
        game.bulletManager.firePlayerBullet(game.player.x, game.player.y - 10, false, 320);
      }

      // Periodic enemy dive
      if (tick % 120 === 0) {
        const living = game.formationManager.getLivingEnemies();
        if (living.length > 0) {
          game.formationManager.peelOffSolo(living[0]!, game.player.x);
        } else {
          // Respawn formation if all enemies defeated
          game.formationManager.spawnStage(game.stage);
        }
      }

      // Periodic power-up cycle
      if (tick % 250 === 0) {
        const powerUp = M19_POWER_UPS[(tick / 250) % M19_POWER_UPS.length]!;
        cheat.applyPowerUp(powerUp);
      }

      // Periodic glitch anomalies
      if (tick % 400 === 0) {
        const glitch = GLITCH_TYPES[(tick / 400) % GLITCH_TYPES.length]!;
        cheat.triggerGlitch(glitch);
        if (glitch === 'mirage') {
          game.formationManager.spawnMirageClones(112, 100, EnemyType.ZAKO);
        }
      }

      // Advance game loop simulation tick
      game.update(1 / 60);

      // Checkpoint heap profiling every 2,500 ticks
      if (tick % CHECKPOINT_INTERVAL === 0) {
        forceGC();
        const currentHeap = process.memoryUsage().heapUsed;
        const driftFromInitialMB = (currentHeap - initialHeap) / (1024 * 1024);
        heapCheckpoints.push({ tick, heapMB: driftFromInitialMB });

        // Intermediate drift must remain safely under 5.0 MB
        expect(driftFromInitialMB).toBeLessThan(5.0);

        // Verify entity coordinates remain valid and free of NaNs
        assertZeroNaN(game, `Continuous Soak Tick ${tick}`);
      }
    }

    // Final Post-Soak Garbage Collection
    forceGC();
    const finalHeap = process.memoryUsage().heapUsed;
    const totalDriftMB = (finalHeap - initialHeap) / (1024 * 1024);

    expect(heapCheckpoints).toHaveLength(4); // 2500, 5000, 7500, 10000
    expect(totalDriftMB).toBeLessThan(5.0);
  });

  // ==========================================================================
  // 4. Adversarial Whiplash Stage Jumps under Mid-Flight Weapon Load
  // ==========================================================================
  it('survives erratic non-linear stage whiplash under high munition saturation without leaks across all 9 pools', () => {
    const cheat = game.getCheatController();
    const erraticStages = [1, 50, 13, 26, 38, 10, 40, 20, 30, 1, 50];

    for (const targetStage of erraticStages) {
      // 1. Skip to Stage
      const skipped = cheat.skipToStage(targetStage);
      expect(skipped).toBe(true);

      // 2. Generate intense burst activity
      cheat.applyPowerUp(M19_POWER_UPS[targetStage % M19_POWER_UPS.length]!);
      cheat.triggerGlitch(GLITCH_TYPES[targetStage % GLITCH_TYPES.length]!);
      game.alliesManager.summonDrone(DroneType.BOMBER);
      cheat.fillEnergy(100);
      cheat.triggerSpecialMove('nova');

      // 3. Simulate 12 combat ticks
      for (let t = 0; t < 12; t++) {
        game.bulletManager.firePlayerBullet(game.player.x, game.player.y - 10, false, 300);
        game.update(1 / 60);
      }

      // 4. Assert stage boundary teardown completely recycles all 9 pools
      teardownStageBoundary(game);
      assertAll9PoolsHygiene(game, `Whiplash Jump to Stage ${targetStage}`);
    }
  });
});
