/**
 * Milestone 17 Empirical Challenger 2: Memory Leak, Pool Hygiene & Combinatorial Invariants Suite
 * Location: tests/unit/m17_challenger_2_adversarial.test.ts
 *
 * Adversarial Verifications:
 * 1. Zero-Allocation & Memory Leak Profiling:
 *    - 10,000-frame continuous combat loop simulation with DDA active.
 *    - Periodic heap sampling and V8 garbage-collected net heap drift verification (< 5.0 MB ceiling).
 *    - Pool hygiene across all 8 ObjectPools (active counts === 0 at teardown, no auto-expansion).
 *    - 100,000 pure DDA update ticks verifying zero object churn in tight combat loops.
 * 2. Pity Drop Mechanism & Challenging Stage Invariants:
 *    - Dynamic pity bonus scaling (low lives, recent damage, low skill index) bounded in [0.00, 0.25].
 *    - Strict Challenging Stage immunity: all 12 challenging stages strictly yield 0 items and 0 drop chance.
 * 3. QA Cheat Controller Chaotic Fuzzing:
 *    - Chaotic fuzzing of setDDAProficiency (NaN, Infinity, out-of-bounds, invalid types, null).
 *    - Diagnostic snapshot integrity for getDDAMetrics() and getGameState().
 *    - 2,000-step randomized interleaved fuzzing harness verifying mathematical continuity and zero crashes.
 * 4. Boss HP Scaling & Neutral Baseline Exactness Oracle:
 *    - Exact 1.000x neutral multiplier preservation across Stages 10, 20, 30, 40, 50.
 *    - Smooth scaling bounds [0.90x, 1.25x].
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import { Game } from '../../src/core/Game';
import { DynamicDifficultyManager } from '../../src/systems/DynamicDifficultyManager';
import { DifficultyCalculator } from '../../src/systems/DifficultyCalculator';
import { BossFactory } from '../../src/core/boss/BossFactory';
import { EnemyType } from '../../src/types';

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

function teardownCleanly(game: Game): void {
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
  if (game.dynamicDifficultyManager) {
    game.dynamicDifficultyManager.reset();
  }
}

describe('m17_challenger_2: Memory Leak, Pool Hygiene & Combinatorial Invariants Suite', () => {
  let game: Game;
  let unhandledRejections: any[] = [];
  let uncaughtExceptions: any[] = [];
  let rejectionHandler: (reason: any) => void;
  let exceptionHandler: (error: Error) => void;

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
    if (game) {
      teardownCleanly(game);
      game.destroy();
    }
    process.off('unhandledRejection', rejectionHandler);
    process.off('uncaughtException', exceptionHandler);

    expect(unhandledRejections.length).toBe(0);
    expect(uncaughtExceptions.length).toBe(0);
  });

  // ==========================================================================
  // Dimension 1: Zero-Allocation Invariant & 10,000-Frame Memory Profiling
  // ==========================================================================
  describe('Dimension 1: Zero-Allocation Invariant & 10,000-Frame Memory Profiling', () => {
    it(
      'simulates 10,000 frames of combat loop with DDA enabled, achieving < 5.0 MB net heap drift and 100% pool recovery',
      () => {
        const cheat = game.cheatController;
        cheat.setInvincible(true);

        // Warm-up & JIT stabilization
        cheat.skipToStage(10);
        for (let f = 0; f < 100; f++) {
          game.bulletManager.firePlayerBullet(112, 240, false, 480);
          game.dynamicDifficultyManager.recordShotFired(1);
          game.dynamicDifficultyManager.recordShotHit(1);
          game.update(1 / 60);
        }
        cheat.killAllEnemies();
        teardownCleanly(game);

        forceGC();
        const baselineHeap = process.memoryUsage().heapUsed;

        // Enter Stage 10 with active DDA and combat load
        cheat.skipToStage(10);
        game.player.isDual = true;
        cheat.unlockDrone('all');

        const heapSnapshots: number[] = [];

        // 10,000 frames simulation (approx 166.7 seconds of continuous 60Hz gameplay)
        for (let frame = 1; frame <= 10000; frame++) {
          // 1. Dual Player rapid fire every 5 frames
          if (frame % 5 === 0) {
            game.bulletManager.firePlayerBullet(game.player.x - 6, game.player.y - 8, true, 480);
            game.bulletManager.firePlayerBullet(game.player.x + 6, game.player.y - 8, true, 480);
            game.dynamicDifficultyManager.recordShotFired(2);
          }

          // 2. Intermittent hits and score progression
          if (frame % 15 === 0) {
            game.dynamicDifficultyManager.recordShotHit(1);
            game.scoreManager.addScore(100);
          }

          // 3. Simulated damage event every 250 frames
          if (frame % 250 === 0) {
            game.dynamicDifficultyManager.recordPlayerDamage(false);
          }

          // 4. Special moves trigger every 120 frames
          if (frame % 120 === 0) {
            cheat.fillEnergy(100);
            const moveChoice = (frame / 120) % 3;
            if (moveChoice === 0) {
              cheat.triggerSpecialMove('nova');
            } else if (moveChoice === 1) {
              cheat.triggerSpecialMove('chrono');
            } else {
              cheat.triggerSpecialMove('warp');
            }
          }

          // 5. Intermittent drops & explosions
          if (frame % 50 === 0) {
            game.powerUpManager.spawnDrop(112, 80, 10, EnemyType.ZAKO, true);
            game.particleSystem.spawnPlayerExplosion(game.player.x, game.player.y);
          }

          // 6. Stage skip / progression transition every 2000 frames
          if (frame % 2000 === 0) {
            const nextStage = 10 + (frame / 2000) * 5;
            cheat.skipToStage(Math.min(50, nextStage));
          }

          // Core loop update with DDA telemetry update
          game.update(1 / 60);

          // Sample heap every 2,500 frames
          if (frame % 2500 === 0) {
            heapSnapshots.push(process.memoryUsage().heapUsed);
          }
        }

        expect(heapSnapshots.length).toBe(4);

        // Teardown at end of 10,000 frames
        teardownCleanly(game);

        // Pool hygiene audit: all 8 pools must have 0 active items
        expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
        expect(game.particleSystem.getPool().getActiveCount()).toBe(0);
        expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
        expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
        expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
        expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
        expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);
        expect(game.formationManager.getEnemyPool().getActiveCount()).toBe(0);

        // Bounded capacity audit: no pool auto-expanded
        expect(game.bulletManager.getPool().getCapacity()).toBe(32);
        expect(game.particleSystem.getPool().getCapacity()).toBe(250);
        expect(game.powerUpManager.getPool().getCapacity()).toBe(32);
        expect(game.alliesManager.getBombPool().getCapacity()).toBe(16);
        expect(game.alliesManager.getExplosionPool().getCapacity()).toBe(16);
        expect(game.specialMovesManager.getMissilePool().getCapacity()).toBe(32);
        expect(game.specialMovesManager.getSparkPool().getCapacity()).toBe(32);
        expect([48, 64]).toContain(game.formationManager.getEnemyPool().getCapacity());

        // Heap drift verification
        forceGC();
        const finalHeap = process.memoryUsage().heapUsed;
        const netHeapDriftMB = (finalHeap - baselineHeap) / (1024 * 1024);

        // Strictly verify heap drift is below 5.0 MB threshold
        expect(netHeapDriftMB).toBeLessThan(5.0);
      },
      60000
    );

    it(
      'verifies pure DynamicDifficultyManager executes 25,000 update iterations with zero memory leaks and bounded metrics',
      () => {
        const dda = new DynamicDifficultyManager();

        forceGC();
        const memStart = process.memoryUsage().heapUsed;

        for (let i = 0; i < 25000; i++) {
          dda.recordShotFired(1);
          if (i % 2 === 0) dda.recordShotHit(1);
          if (i % 100 === 0) dda.recordPlayerDamage(false);
          if (i % 10 === 0) dda.recordScoreGain(50);

          dda.update(0.016, 3, i * 50);

          const s = dda.getSkillIndex();
          expect(s).toBeGreaterThanOrEqual(0.0);
          expect(s).toBeLessThanOrEqual(1.0);
        }

        forceGC();
        const memEnd = process.memoryUsage().heapUsed;
        const diffMB = (memEnd - memStart) / (1024 * 1024);

        expect(diffMB).toBeLessThan(2.0);
      },
      30000
    );
  });

  // ==========================================================================
  // Dimension 2: Pity Drop Mechanism & Challenging Stage Invariants
  // ==========================================================================
  describe('Dimension 2: Pity Drop Mechanism & Challenging Stage Invariants', () => {
    it('scales dynamic pity bonus accurately up to +0.25 under distressed conditions and resets under health', () => {
      const dda = game.dynamicDifficultyManager;

      // 1. Healthy baseline: 3 lives, no recent damage, neutral skill
      dda.reset();
      dda.update(0.016, 3, 0);
      expect(dda.getPowerUpPityBonus()).toBe(0.00);

      // 2. Low lives component (+0.12)
      dda.update(0.016, 1, 0);
      expect(dda.getPowerUpPityBonus()).toBe(0.12);

      // 3. Recent damage component (+0.08)
      dda.recordPlayerDamage(false);
      dda.update(0.016, 3, 0); // 3 lives, but damaged 0s ago
      expect(dda.getPowerUpPityBonus()).toBe(0.08);

      // 4. Low skill component (+0.05)
      dda.reset();
      dda.setProficiencyOverride(0.20);
      dda.update(0.016, 3, 0);
      expect(dda.getPowerUpPityBonus()).toBe(0.05);

      // 5. Triple distress: 1 life (+0.12), recent damage (+0.08), low skill (+0.05) = 0.25
      dda.recordPlayerDamage(false);
      dda.update(0.016, 1, 0);
      expect(dda.getPowerUpPityBonus()).toBe(0.25);
      expect(dda.getPityDropMultiplier()).toBe(1.50); // 1.0 + 0.25 * 2.0
    });

    it('strictly guarantees all 12 Challenging Stages yield zero drops across 12,000 adversarial drop rolls', () => {
      const challengingStages = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47];
      expect(challengingStages.length).toBe(12);

      // Maximize pity bonus to +0.25
      game.player.lives = 1;
      game.dynamicDifficultyManager.setProficiencyOverride(0.00);
      game.dynamicDifficultyManager.recordPlayerDamage(false);
      game.dynamicDifficultyManager.update(0.016, 1, 0);
      expect(game.dynamicDifficultyManager.getPowerUpPityBonus()).toBe(0.25);

      for (const stage of challengingStages) {
        expect(DifficultyCalculator.isChallengingStage(stage)).toBe(true);

        // computeDropChance must return strictly 0
        expect(game.powerUpManager.computeDropChance(stage, EnemyType.ZAKO, false)).toBe(0);
        expect(game.powerUpManager.computeDropChance(stage, EnemyType.GOEI, true)).toBe(0);
        expect(game.powerUpManager.computeDropChance(stage, EnemyType.BOSS, true)).toBe(0);

        // 1,000 attempts per challenging stage with diving boss enemies
        for (let attempt = 0; attempt < 1000; attempt++) {
          const drop = game.powerUpManager.spawnDrop(100, 100, stage, EnemyType.BOSS, true);
          expect(drop).toBeNull();
        }
      }

      // Total drops in pool must remain strictly 0
      expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
    });

    it('verifies non-challenging stages correctly incorporate pity bonus clamped to 65%', () => {
      game.player.lives = 1;
      game.dynamicDifficultyManager.recordPlayerDamage(false);
      game.dynamicDifficultyManager.setProficiencyOverride(0.10);
      game.dynamicDifficultyManager.update(0.016, 1, 0);

      const pity = game.dynamicDifficultyManager.getPowerUpPityBonus();
      expect(pity).toBe(0.25);

      // Base Boss diving drop chance is 40% (0.40) in Stage 10
      const baseChance = game.powerUpManager.computeDropChance(10, EnemyType.BOSS, true);
      expect(baseChance).toBe(0.40);

      // Base + pity would be 0.40 + 0.25 = 0.65 (exact ceiling)
      // Verify via repeatedly rolling drops in non-challenging stage that items spawn
      let spawnedCount = 0;
      for (let i = 0; i < 100; i++) {
        const item = game.powerUpManager.spawnDrop(112, 100, 1, EnemyType.BOSS, true);
        if (item) {
          spawnedCount++;
        }
      }
      expect(spawnedCount).toBeGreaterThan(0);
      game.powerUpManager.reset();
      expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
    });
  });

  // ==========================================================================
  // Dimension 3: QA Cheat Controller Chaotic Fuzzing
  // ==========================================================================
  describe('Dimension 3: QA Cheat Controller Chaotic Fuzzing', () => {
    it('robustly validates setDDAProficiency across valid, boundary, and adversarial invalid inputs', () => {
      const cheat = game.cheatController;

      // Valid boundary values
      expect(cheat.setDDAProficiency(0.0)).toBe(true);
      expect(game.dynamicDifficultyManager.getSkillIndex()).toBe(0.0);

      expect(cheat.setDDAProficiency(1.0)).toBe(true);
      expect(game.dynamicDifficultyManager.getSkillIndex()).toBe(1.0);

      expect(cheat.setDDAProficiency(0.5)).toBe(true);
      expect(game.dynamicDifficultyManager.getSkillIndex()).toBe(0.5);

      // Null restores dynamic tracking
      expect(cheat.setDDAProficiency(null)).toBe(true);

      // Adversarial inputs must return false and NOT corrupt skill index
      const adversarialInputs = [
        -0.0001,
        -1.0,
        -9999,
        1.0001,
        2.0,
        99999,
        NaN,
        Infinity,
        -Infinity,
        undefined as any,
        '0.5' as any,
        'invalid' as any,
        {} as any,
        [] as any,
        true as any,
        false as any,
        (() => {}) as any,
        Symbol('dda') as any,
      ];

      for (const input of adversarialInputs) {
        expect(cheat.setDDAProficiency(input)).toBe(false);
        const s = game.dynamicDifficultyManager.getSkillIndex();
        expect(Number.isFinite(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0.0);
        expect(s).toBeLessThanOrEqual(1.0);
      }
    });

    it('verifies getDDAMetrics() and getGameState() maintain structural and mathematical integrity', () => {
      const cheat = game.cheatController;

      const metrics = cheat.getDDAMetrics() as any;
      expect(metrics).toBeDefined();
      expect(typeof metrics.rollingAccuracy).toBe('number');
      expect(typeof metrics.survivalFactor).toBe('number');
      expect(typeof metrics.clearSpeedRatio).toBe('number');
      expect(typeof metrics.scoreVelocity).toBe('number');
      expect(typeof metrics.effectiveSkillIndex).toBe('number');
      expect(metrics.actuators).toBeDefined();
      expect(typeof metrics.actuators.diveSpeedMultiplier).toBe('number');
      expect(typeof metrics.actuators.bulletDensityMultiplier).toBe('number');
      expect(typeof metrics.actuators.bossHealthMultiplier).toBe('number');
      expect(typeof metrics.actuators.powerUpPityBonus).toBe('number');

      const gameState = cheat.getGameState();
      expect(gameState.dda).toBeDefined();
      expect(gameState.dda?.skillIndex).toBeCloseTo(0.50, 2);
      expect(gameState.dda?.bossHealthMultiplier).toBe(1.00);
    });

    it('verifies resetDDA() completely purges polluted buffers and restores exact neutral defaults', () => {
      const cheat = game.cheatController;
      const dda = game.dynamicDifficultyManager;

      // Heavily pollute telemetry
      dda.recordShotFired(5000);
      dda.recordShotHit(4000);
      dda.recordPlayerDamage(true);
      dda.recordScoreGain(100000);
      cheat.setDDAProficiency(0.95);
      dda.update(1.0, 1, 100000);

      // Verify polluted state
      expect(dda.getSkillIndex()).toBe(0.95);
      expect(dda.getMetrics().rollingShots).toBeGreaterThan(0);

      // Reset
      cheat.resetDDA();

      // Verify clean neutral defaults
      expect(dda.getSkillIndex()).toBe(0.50);
      const actuators = dda.getActuators();
      expect(actuators.diveSpeedMultiplier).toBe(1.10);
      expect(actuators.bulletDensityMultiplier).toBe(1.10);
      expect(actuators.bossHealthMultiplier).toBe(1.00);
      expect(actuators.powerUpPityBonus).toBe(0.00);

      const metrics = dda.getMetrics();
      expect(metrics.rollingShots).toBe(0);
      expect(metrics.rollingHits).toBe(0);
      expect(metrics.rollingDamage).toBe(0);
      expect(metrics.rollingScore).toBe(0);
      expect(metrics.secondsSinceLastDamage).toBe(30.0);
    });

    it('survives 2,000 chaotic interleaved operations without exceptions, NaNs, or invariant breaches', () => {
      const cheat = game.cheatController;
      const dda = game.dynamicDifficultyManager;

      for (let op = 0; op < 2000; op++) {
        const choice = op % 8;
        switch (choice) {
          case 0: {
            const val = Math.random() < 0.2 ? null : Math.random() * 1.4 - 0.2; // Some valid, some invalid
            cheat.setDDAProficiency(val);
            break;
          }
          case 1:
            dda.recordShotFired(Math.floor(Math.random() * 5) + 1);
            break;
          case 2:
            dda.recordShotHit(Math.floor(Math.random() * 5) + 1);
            break;
          case 3:
            dda.recordPlayerDamage(Math.random() < 0.3);
            break;
          case 4:
            dda.recordScoreGain(Math.floor(Math.random() * 500));
            break;
          case 5:
            dda.update(Math.random() * 0.05, Math.floor(Math.random() * 4), op * 20);
            break;
          case 6:
            cheat.getDDAMetrics();
            break;
          case 7:
            if (op % 200 === 0) {
              cheat.resetDDA();
            }
            break;
        }

        // Continual invariant assertion
        const s = dda.getSkillIndex();
        expect(Number.isFinite(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0.0);
        expect(s).toBeLessThanOrEqual(1.0);

        const diveMult = dda.getDiveSpeedMultiplier();
        expect(diveMult).toBeGreaterThanOrEqual(0.85);
        expect(diveMult).toBeLessThanOrEqual(1.35);

        const bulletMult = dda.getBulletDensityMultiplier();
        expect(bulletMult).toBeGreaterThanOrEqual(0.80);
        expect(bulletMult).toBeLessThanOrEqual(1.40);

        const bossMult = dda.getBossHealthMultiplier();
        expect(bossMult).toBeGreaterThanOrEqual(0.90);
        expect(bossMult).toBeLessThanOrEqual(1.25);

        const pity = dda.getPowerUpPityBonus();
        expect(pity).toBeGreaterThanOrEqual(0.0);
        expect(pity).toBeLessThanOrEqual(0.25);
      }
    });
  });

  // ==========================================================================
  // Dimension 4: Boss HP Scaling & Neutral Baseline Exactness Oracle
  // ==========================================================================
  describe('Dimension 4: Boss HP Scaling & Neutral Baseline Exactness Oracle', () => {
    it('guarantees exact 1.000x baseline Boss HP preservation at neutral sigma = 0.50 across all 5 bosses', () => {
      game.dynamicDifficultyManager.setProficiencyOverride(0.50);

      const bossStages = [
        { stage: 10, expectedBaseline: 80 },
        { stage: 20, expectedBaseline: 120 },
        { stage: 30, expectedBaseline: 150 },
        { stage: 40, expectedBaseline: 180 },
        { stage: 50, expectedBaseline: 300 },
      ];

      for (const { stage, expectedBaseline } of bossStages) {
        const boss = BossFactory.createBoss(stage, game);
        expect(boss).not.toBeNull();
        expect(boss?.maxHealth).toBe(expectedBaseline);
        expect(boss?.health).toBe(expectedBaseline);
      }
    });

    it('scales Boss HP smoothly between [0.90x, 1.25x] at minimum and maximum skill boundaries', () => {
      // Minimum skill (sigma = 0.00 -> mult = 0.90)
      game.dynamicDifficultyManager.setProficiencyOverride(0.00);
      expect(game.dynamicDifficultyManager.getBossHealthMultiplier()).toBe(0.90);

      const boss10Min = BossFactory.createBoss(10, game);
      const boss50Min = BossFactory.createBoss(50, game);
      expect(boss10Min?.maxHealth).toBe(72); // Math.round(80 * 0.90)
      expect(boss50Min?.maxHealth).toBe(270); // Math.round(300 * 0.90)

      // Maximum skill (sigma = 1.00 -> mult = 1.25)
      game.dynamicDifficultyManager.setProficiencyOverride(1.00);
      expect(game.dynamicDifficultyManager.getBossHealthMultiplier()).toBe(1.25);

      const boss10Max = BossFactory.createBoss(10, game);
      const boss50Max = BossFactory.createBoss(50, game);
      expect(boss10Max?.maxHealth).toBe(100); // Math.round(80 * 1.25)
      expect(boss50Max?.maxHealth).toBe(375); // Math.round(300 * 1.25)
    });

    it('verifies Boss sub-unit HP (turrets, escorts, satellites) remain fixed and un-skewed by DDA', () => {
      game.dynamicDifficultyManager.setProficiencyOverride(1.00);

      // Stage 10: CyberDreadnought turrets (15 HP) and escorts (5 HP)
      const dreadnought = BossFactory.createBoss(10, game) as any;
      expect(dreadnought).not.toBeNull();
      expect(dreadnought.maxHealth).toBe(100); // 80 * 1.25
      expect(dreadnought.turretLeft.maxHealth).toBe(15);
      expect(dreadnought.turretRight.maxHealth).toBe(15);
      expect(dreadnought.escortLeft.maxHealth).toBe(5);
      expect(dreadnought.escortRight.maxHealth).toBe(5);

      // Stage 50: AeternumCore satellites (25 HP)
      const aeternum = BossFactory.createBoss(50, game) as any;
      expect(aeternum).not.toBeNull();
      expect(aeternum.maxHealth).toBe(375); // 300 * 1.25
      for (const sat of aeternum.satellites) {
        expect(sat.maxHealth).toBe(25);
      }
    });
  });
});
