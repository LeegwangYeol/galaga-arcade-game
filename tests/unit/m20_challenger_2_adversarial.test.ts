/**
 * Milestone M20 Adversarial Challenge Test Suite
 * Author: m20_challenger_2 (Adversarial 50-Round Soak & Stress Verifier)
 * Location: tests/unit/m20_challenger_2_adversarial.test.ts
 *
 * Verifications:
 * 1. Rapid 50-Round Skip Soak:
 *    - Rapid traversal from Stage 1 to Stage 50 via cheat.skipToStage(s).
 *    - 15 simulation ticks per stage with diving enemies, player shooting, and active glitch events.
 *    - Rotational activation of all 5 M19 power-ups and glitch events.
 *    - Strict assertion of zero NaN coordinates in player, enemies, phantoms, bullets, boss, and HUD.
 *    - Zero unhandled rejections or uncaught exceptions.
 * 2. Pool Hygiene at Stage Boundaries:
 *    - Immediate post-skip assertion across all stages and upon reaching Stage 50:
 *      - powerUpManager.getActiveCount() === 0
 *      - formationManager.phantomPool.getActiveCount() === 0
 *      - alliesManager bombPool and explosionPool === 0
 *      - specialMovesManager missilePool and sparkPool === 0
 *      - bulletManager and particleSystem pools === 0
 *      - All pool capacities strictly clamped (autoExpand: false).
 * 3. Memory Stability & Heap Drift:
 *    - Strict < 5.0 MB net heap drift invariant across 50 continuous rounds in Node/V8 environment.
 * 4. Adversarial Non-Linear Stage Whiplash:
 *    - Random arbitrary stage jumps under high combat saturation recovering cleanly without leaks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import { Game } from '../../src/core/Game';
import { EnemyType, EnemyState } from '../../src/types';
import { DroneType } from '../../src/core/allies/types';
import { DifficultyCalculator } from '../../src/systems/DifficultyCalculator';

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
// Helper: Coordinate & State NaN Invariant Check
// ============================================================================
function assertZeroNaN(game: Game, stage: number, tick: number): void {
  // 1. Player Coordinates & Kinematics
  expect(Number.isNaN(game.player.x), `Stage ${stage} Tick ${tick}: Player X is NaN`).toBe(false);
  expect(Number.isNaN(game.player.y), `Stage ${stage} Tick ${tick}: Player Y is NaN`).toBe(false);
  expect(Number.isNaN(game.player.vx), `Stage ${stage} Tick ${tick}: Player Vx is NaN`).toBe(false);
  expect(Number.isNaN(game.player.vy), `Stage ${stage} Tick ${tick}: Player Vy is NaN`).toBe(false);
  expect(Number.isFinite(game.player.x), `Stage ${stage} Tick ${tick}: Player X is infinite`).toBe(true);
  expect(Number.isFinite(game.player.y), `Stage ${stage} Tick ${tick}: Player Y is infinite`).toBe(true);

  // 2. Formation Enemies
  for (const enemy of game.formationManager.enemies) {
    if (!enemy.active) continue;
    expect(Number.isNaN(enemy.x), `Stage ${stage} Tick ${tick}: Enemy #${enemy.id} X is NaN`).toBe(false);
    expect(Number.isNaN(enemy.y), `Stage ${stage} Tick ${tick}: Enemy #${enemy.id} Y is NaN`).toBe(false);
    expect(Number.isNaN(enemy.vx), `Stage ${stage} Tick ${tick}: Enemy #${enemy.id} Vx is NaN`).toBe(false);
    expect(Number.isNaN(enemy.vy), `Stage ${stage} Tick ${tick}: Enemy #${enemy.id} Vy is NaN`).toBe(false);
    expect(Number.isNaN(enemy.rotation), `Stage ${stage} Tick ${tick}: Enemy #${enemy.id} rotation is NaN`).toBe(false);
    expect(Number.isFinite(enemy.x), `Stage ${stage} Tick ${tick}: Enemy #${enemy.id} X is infinite`).toBe(true);
    expect(Number.isFinite(enemy.y), `Stage ${stage} Tick ${tick}: Enemy #${enemy.id} Y is infinite`).toBe(true);
  }

  // 3. Phantom Clones
  game.formationManager.phantomPool.forEachActive((clone) => {
    expect(Number.isNaN(clone.x), `Stage ${stage} Tick ${tick}: Phantom clone X is NaN`).toBe(false);
    expect(Number.isNaN(clone.y), `Stage ${stage} Tick ${tick}: Phantom clone Y is NaN`).toBe(false);
    expect(Number.isNaN(clone.vx), `Stage ${stage} Tick ${tick}: Phantom clone Vx is NaN`).toBe(false);
    expect(Number.isNaN(clone.vy), `Stage ${stage} Tick ${tick}: Phantom clone Vy is NaN`).toBe(false);
    expect(Number.isFinite(clone.x), `Stage ${stage} Tick ${tick}: Phantom clone X is infinite`).toBe(true);
    expect(Number.isFinite(clone.y), `Stage ${stage} Tick ${tick}: Phantom clone Y is infinite`).toBe(true);
  });

  // 4. Bullets (Player & Enemy)
  game.bulletManager.getPool().forEachActive((bullet) => {
    expect(Number.isNaN(bullet.position.x), `Stage ${stage} Tick ${tick}: Bullet X is NaN`).toBe(false);
    expect(Number.isNaN(bullet.position.y), `Stage ${stage} Tick ${tick}: Bullet Y is NaN`).toBe(false);
    expect(Number.isNaN(bullet.velocity.x), `Stage ${stage} Tick ${tick}: Bullet Vx is NaN`).toBe(false);
    expect(Number.isNaN(bullet.velocity.y), `Stage ${stage} Tick ${tick}: Bullet Vy is NaN`).toBe(false);
    expect(Number.isFinite(bullet.position.x), `Stage ${stage} Tick ${tick}: Bullet X is infinite`).toBe(true);
    expect(Number.isFinite(bullet.position.y), `Stage ${stage} Tick ${tick}: Bullet Y is infinite`).toBe(true);
  });

  // 5. Active Boss (on Boss Stages)
  if (game.bossManager?.activeBoss && game.bossManager.activeBoss.active) {
    const boss = game.bossManager.activeBoss;
    expect(Number.isNaN(boss.x), `Stage ${stage} Tick ${tick}: Boss X is NaN`).toBe(false);
    expect(Number.isNaN(boss.y), `Stage ${stage} Tick ${tick}: Boss Y is NaN`).toBe(false);
    expect(Number.isNaN(boss.health), `Stage ${stage} Tick ${tick}: Boss health is NaN`).toBe(false);
    expect(Number.isFinite(boss.x), `Stage ${stage} Tick ${tick}: Boss X is infinite`).toBe(true);
    expect(Number.isFinite(boss.y), `Stage ${stage} Tick ${tick}: Boss Y is infinite`).toBe(true);
  }

  // 6. HUD and Global Metrics
  expect(Number.isNaN(game.score), `Stage ${stage} Tick ${tick}: Game score is NaN`).toBe(false);
  expect(Number.isNaN(game.stage), `Stage ${stage} Tick ${tick}: Game stage is NaN`).toBe(false);
  expect(Number.isNaN(game.lives), `Stage ${stage} Tick ${tick}: Game lives is NaN`).toBe(false);
  expect(Number.isNaN(game.specialMovesManager.energy), `Stage ${stage} Tick ${tick}: Special energy is NaN`).toBe(false);
}

// ============================================================================
// Helper: Pool Hygiene Assertions at Stage Boundary
// ============================================================================
function assertPoolHygieneAtBoundary(game: Game, stage: number): void {
  // 1. PowerUp Pool
  expect(
    game.powerUpManager.getActiveCount(),
    `Stage ${stage}: PowerUpManager activeCount must be 0`
  ).toBe(0);
  expect(game.powerUpManager.getPool().getCapacity()).toBeLessThanOrEqual(32);

  // 2. Phantom Pool
  expect(
    game.formationManager.phantomPool.getActiveCount(),
    `Stage ${stage}: FormationManager phantomPool activeCount must be 0`
  ).toBe(0);
  expect(game.formationManager.phantomPool.getCapacity()).toBeLessThanOrEqual(8);

  // 3. Allies Munition Pools
  expect(
    game.alliesManager.getBombPool().getActiveCount(),
    `Stage ${stage}: AlliesManager bombPool activeCount must be 0`
  ).toBe(0);
  expect(
    game.alliesManager.getExplosionPool().getActiveCount(),
    `Stage ${stage}: AlliesManager explosionPool activeCount must be 0`
  ).toBe(0);
  expect(game.alliesManager.getBombPool().getCapacity()).toBeLessThanOrEqual(16);
  expect(game.alliesManager.getExplosionPool().getCapacity()).toBeLessThanOrEqual(16);

  // 4. Special Moves Munition Pools
  expect(
    game.specialMovesManager.getMissilePool().getActiveCount(),
    `Stage ${stage}: SpecialMovesManager missilePool activeCount must be 0`
  ).toBe(0);
  expect(
    game.specialMovesManager.getSparkPool().getActiveCount(),
    `Stage ${stage}: SpecialMovesManager sparkPool activeCount must be 0`
  ).toBe(0);
  expect(game.specialMovesManager.getMissilePool().getCapacity()).toBeLessThanOrEqual(32);
  expect(game.specialMovesManager.getSparkPool().getCapacity()).toBeLessThanOrEqual(32);

  // 5. Core Game Munition & Particle Pools
  expect(
    game.bulletManager.getPool().getActiveCount(),
    `Stage ${stage}: BulletManager activeCount must be 0`
  ).toBe(0);
  expect(
    game.particleSystem.getPool().getActiveCount(),
    `Stage ${stage}: ParticleSystem activeCount must be 0`
  ).toBe(0);
  expect(game.bulletManager.getPool().getCapacity()).toBeLessThanOrEqual(256);
  expect(game.particleSystem.getPool().getCapacity()).toBeLessThanOrEqual(256);
  expect(game.formationManager.getEnemyPool().getCapacity()).toBeLessThanOrEqual(64);
}

// ============================================================================
// Test Suite Definition
// ============================================================================
describe('Milestone M20: Adversarial 50-Round Soak & Stress Verifications', () => {
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
  // Target 1 & 2: Rapid 50-Round Skip Soak, Pool Hygiene & Zero NaNs
  // ==========================================================================
  it('rapidly traverses Stages 1 to 50 under M19 power-ups and glitch saturation with zero NaNs and zero pool leaks', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    const stagesTraversed: number[] = [];
    const powerUpsActivated: string[] = [];
    const glitchesTriggered: string[] = [];
    const bossStagesEncountered: number[] = [];

    // Rapidly traverse Stages 1 through 50
    for (let stage = 1; stage <= 50; stage++) {
      stagesTraversed.push(stage);

      // 1. Skip to Stage
      const skipSuccess = cheat.skipToStage(stage);
      expect(skipSuccess).toBe(true);
      expect(game.stage).toBe(stage);

      // 2. Assert Pool Hygiene IMMEDIATELY at Stage Boundary
      assertPoolHygieneAtBoundary(game, stage);

      if (DifficultyCalculator.isBossStage(stage)) {
        bossStagesEncountered.push(stage);
        expect(game.bossManager.activeBoss).not.toBeNull();
      }

      // 3. Select and activate one of the 5 new M19 power-ups
      const chosenPowerUp = M19_POWER_UPS[(stage - 1) % M19_POWER_UPS.length]!;
      powerUpsActivated.push(chosenPowerUp);
      const applied = cheat.applyPowerUp(chosenPowerUp);
      expect(applied).toBe(true);

      // Occasionally spawn a falling power-up capsule to stress item update loop
      if (stage % 2 === 0) {
        cheat.spawnPowerUp(chosenPowerUp, game.player.x + (stage % 20) - 10, game.player.y - 40);
      }

      // 4. Select and activate a glitch event
      const chosenGlitch = GLITCH_TYPES[(stage - 1) % GLITCH_TYPES.length]!;
      glitchesTriggered.push(chosenGlitch);
      const glitchTriggered = cheat.triggerGlitch(chosenGlitch);
      expect(glitchTriggered).toBe(true);

      // 5. Force enemies into diving state if in formation
      const formationEnemies = game.formationManager.enemies.filter(
        (e) => e.active && e.state === EnemyState.IN_FORMATION
      );
      if (formationEnemies.length > 0) {
        game.formationManager.peelOffSolo(formationEnemies[0]!, game.player.x);
      }
      if (formationEnemies.length > 1) {
        game.formationManager.peelOffSolo(formationEnemies[1]!, game.player.x);
      }

      // If mirage glitch, trigger phantom clone spawning
      if (chosenGlitch === 'mirage') {
        game.formationManager.spawnMirageClones(112, 100, EnemyType.GOEI);
        expect(game.formationManager.phantomPool.getActiveCount()).toBeGreaterThan(0);
      }

      // Occasionally exercise Allies bomber drone and Special moves
      if (stage % 7 === 0) {
        game.alliesManager.summonDrone(DroneType.BOMBER);
        cheat.triggerSpecialMove('nova');
      }

      // 6. Run 15 simulation ticks with player shooting and enemy movements
      for (let tick = 0; tick < 15; tick++) {
        // Player shooting
        if (tick % 3 === 0) {
          game.bulletManager.firePlayerBullet(game.player.x, game.player.y - 10, false, 300);
        }

        // Advance game simulation tick
        game.update(1 / 60);

        // Verify zero NaN coordinates in all active entities
        assertZeroNaN(game, stage, tick);

        // Damage boss if active
        if (game.bossManager?.activeBoss?.active && tick % 4 === 0) {
          game.bossManager.activeBoss.takeDamage(25);
        }
      }

      // Verify gameState snapshot is valid and free of NaNs
      const stateSnapshot = cheat.getGameState();
      expect(stateSnapshot.stage).toBe(stage);
      expect(Number.isNaN(stateSnapshot.score)).toBe(false);
      expect(Number.isNaN(stateSnapshot.energy)).toBe(false);
    }

    // 7. Final Verification upon Reaching Stage 50
    expect(stagesTraversed).toHaveLength(50);
    expect(bossStagesEncountered).toEqual([10, 20, 30, 40, 50]);
    expect(powerUpsActivated).toHaveLength(50);
    expect(glitchesTriggered).toHaveLength(50);

    // Teardown and assert final Stage 50 pool hygiene
    cheat.skipToStage(50);
    assertPoolHygieneAtBoundary(game, 50);
  });

  // ==========================================================================
  // Target 2: High-Saturation Pool Drainage & Boundary Hygiene
  // ==========================================================================
  it('demonstrates complete pool recycling at stage boundary under maximal simultaneous pool saturation', () => {
    const cheat = game.getCheatController();
    cheat.skipToStage(26); // Glitch Sector stage

    // 1. Saturate phantomPool (max 8)
    for (let i = 0; i < 20; i++) {
      game.formationManager.spawnMirageClones(100 + (i % 5) * 10, 80 + i * 5, EnemyType.GOEI);
    }
    expect(game.formationManager.phantomPool.getActiveCount()).toBe(8);

    // 2. Saturate powerUpPool
    for (let i = 0; i < 15; i++) {
      cheat.spawnPowerUp(M19_POWER_UPS[i % M19_POWER_UPS.length]!, 50 + i * 8, 40 + i * 6);
    }
    expect(game.powerUpManager.getActiveCount()).toBeGreaterThanOrEqual(10);

    // 3. Saturate alliesManager pools
    game.alliesManager.summonDrone(DroneType.BOMBER);
    for (let t = 0; t < 30; t++) {
      game.alliesManager.update(1 / 60);
    }
    game.alliesManager.spawnExplosion(112, 120, 28, 2);
    expect(
      game.alliesManager.getBombPool().getActiveCount() +
      game.alliesManager.getExplosionPool().getActiveCount()
    ).toBeGreaterThanOrEqual(1);

    // 4. Saturate specialMovesManager pools
    cheat.fillEnergy();
    cheat.triggerSpecialMove('nova');
    game.specialMovesManager.spawnSpark(112, 140);
    game.specialMovesManager.spawnSpark(120, 150);
    expect(
      game.specialMovesManager.getMissilePool().getActiveCount() +
      game.specialMovesManager.getSparkPool().getActiveCount()
    ).toBeGreaterThanOrEqual(1);

    // 5. Saturate bulletManager pool
    for (let i = 0; i < 20; i++) {
      game.bulletManager.firePlayerBullet(50 + i * 5, 200, false, 300);
      game.bulletManager.fireEnemyBullet(60 + i * 5, 100, 112, 250, 180);
    }
    expect(game.bulletManager.getPool().getActiveCount()).toBeGreaterThanOrEqual(20);

    // 6. Abrupt Stage Skip Mid-Flight (Stress Boundary Teardown)
    cheat.skipToStage(27);

    // 7. Verify all pools instantly drain to 0 active entities without leak
    assertPoolHygieneAtBoundary(game, 27);

    // Verify capacities remain strictly bounded
    expect(game.powerUpManager.getPool().getCapacity()).toBe(32);
    expect(game.formationManager.phantomPool.getCapacity()).toBe(8);
    expect(game.alliesManager.getBombPool().getCapacity()).toBe(16);
    expect(game.alliesManager.getExplosionPool().getCapacity()).toBe(16);
    expect(game.specialMovesManager.getMissilePool().getCapacity()).toBe(32);
    expect(game.specialMovesManager.getSparkPool().getCapacity()).toBe(32);
  });

  // ==========================================================================
  // Target 3: Memory Stability & Net Heap Drift under Rapid 50-Round Cycle
  // ==========================================================================
  it('strictly bounds net heap growth to < 5.0 MB across continuous 50-round traversal', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    // Warmup JIT & stabilize pool baseline (60 frames at Stage 1)
    cheat.skipToStage(1);
    for (let t = 0; t < 60; t++) {
      if (t % 10 === 0) {
        game.bulletManager.firePlayerBullet(112, 240, false, 300);
      }
      game.update(1 / 60);
    }
    cheat.skipToStage(1);

    forceGC();
    const baselineHeap = process.memoryUsage().heapUsed;

    // Traverse all 50 stages with 12 combat frames per stage
    for (let stage = 1; stage <= 50; stage++) {
      cheat.skipToStage(stage);

      const chosenPowerUp = M19_POWER_UPS[(stage - 1) % M19_POWER_UPS.length]!;
      cheat.applyPowerUp(chosenPowerUp);

      const chosenGlitch = GLITCH_TYPES[(stage - 1) % GLITCH_TYPES.length]!;
      cheat.triggerGlitch(chosenGlitch);

      for (let f = 0; f < 12; f++) {
        if (f % 4 === 0) {
          game.bulletManager.firePlayerBullet(game.player.x, game.player.y - 10, false, 300);
        }
        game.update(1 / 60);
      }

      // Checkpoint GC at Boss stages
      if ([10, 20, 30, 40, 50].includes(stage)) {
        forceGC();
      }
    }

    forceGC();
    const finalHeap = process.memoryUsage().heapUsed;
    const netDriftMB = (finalHeap - baselineHeap) / (1024 * 1024);

    // Strict < 5.0 MB net heap drift invariant
    expect(netDriftMB).toBeLessThan(5.0);
  });

  // ==========================================================================
  // Target 4: Adversarial Non-Linear Stage Whiplash
  // ==========================================================================
  it('survives rapid erratic stage jumping across disparate tiers without crashing, leaking, or corrupting state', () => {
    const cheat = game.getCheatController();
    const jumpSequence = [1, 49, 13, 50, 2, 38, 10, 26, 40, 3, 50, 1];

    for (const targetStage of jumpSequence) {
      const skipped = cheat.skipToStage(targetStage);
      expect(skipped).toBe(true);
      expect(game.stage).toBe(targetStage);

      // Verify boundary pool hygiene
      assertPoolHygieneAtBoundary(game, targetStage);

      // Trigger chaos: power-up + glitch + diving
      cheat.applyPowerUp(M19_POWER_UPS[targetStage % M19_POWER_UPS.length]!);
      cheat.triggerGlitch(GLITCH_TYPES[targetStage % GLITCH_TYPES.length]!);

      // Simulate 10 frames
      for (let t = 0; t < 10; t++) {
        game.bulletManager.firePlayerBullet(game.player.x, game.player.y - 10, false, 300);
        game.update(1 / 60);
        assertZeroNaN(game, targetStage, t);
      }
    }

    // Final Stage reset to 50
    cheat.skipToStage(50);
    assertPoolHygieneAtBoundary(game, 50);
  });
});
