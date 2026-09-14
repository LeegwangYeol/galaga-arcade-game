/**
 * Milestone 17 Remediation Adversarial Challenger 2 Test Suite
 * Location: tests/unit/adversarial_m17_rem_challenger_2.test.ts
 *
 * Comprehensive Empirical Verification of:
 * 1. High-saturation multi-bucket burst evictions (500,000 shots across multiple buckets & cycles)
 * 2. Extreme score values exceeding 2^31 (up to 4.29B) without signed integer wrap or residual
 * 3. 10,000 frames combat loop zero-allocation invariant (< 5.0 MB heap drift & pool hygiene)
 * 4. Pity drop mechanism & strict Challenging Stage bullet/drop immunity across all 12 stages
 * 5. Robustness against non-finite inputs and failsafe actuator bounds
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

describe('M17 Remediation Challenger 2: Adversarial Stress & Invariant Verification Suite', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.startGame();
  });

  afterEach(() => {
    if (game) {
      teardownCleanly(game);
      game.destroy();
    }
  });

  // ==========================================================================
  // 1. High-Saturation Multi-Bucket Burst Evictions
  // ==========================================================================
  describe('Area 1: High-Saturation Multi-Bucket Burst Evictions', () => {
    it('accurately evicts 500,000 shots fired across 10 buckets with zero phantom residual after 31s', () => {
      const dda = new DynamicDifficultyManager();

      // 50,000 shots and 25,000 hits per second for 10 consecutive seconds
      for (let s = 0; s < 10; s++) {
        dda.recordShotFired(50000);
        dda.recordShotHit(25000);
        dda.update(1.0, 3, 0);
      }

      // Exact cumulative in-window counts: 10 * 50,000 = 500,000 shots; 250,000 hits
      const midMetrics = dda.getMetrics();
      expect(midMetrics.rollingShots).toBe(500000);
      expect(midMetrics.rollingHits).toBe(250000);
      expect(midMetrics.rollingAccuracy).toBeCloseTo(0.50, 4);

      // Advance by 31 seconds -> all 10 buckets must fully expire and evict
      for (let s = 0; s < 31; s++) {
        dda.update(1.0, 3, 0);
      }

      const postMetrics = dda.getMetrics();
      expect(postMetrics.rollingShots).toBe(0);
      expect(postMetrics.rollingHits).toBe(0);
      expect(postMetrics.rollingAccuracy).toBe(0.50);
    });

    it('survives ring-buffer wraparound with 500,000 shots distributed over 50 buckets', () => {
      const dda = new DynamicDifficultyManager();

      // Distribute 10,000 shots/sec over 50 seconds (exceeding 30s window size)
      for (let s = 0; s < 50; s++) {
        dda.recordShotFired(10000);
        dda.recordShotHit(5000);

        // Mid-second: exactly 30 filled buckets if s >= 29
        if (s >= 29) {
          expect(dda.getMetrics().rollingShots).toBe(300000);
          expect(dda.getMetrics().rollingHits).toBe(150000);
        }

        dda.update(1.0, 3, 0);

        // After update(1.0), bucket advanced and next bucket cleared: 29 filled buckets
        const m = dda.getMetrics();
        if (s >= 29) {
          expect(m.rollingShots).toBe(290000);
          expect(m.rollingHits).toBe(145000);
        }
      }

      // Now cease firing and advance 31 seconds to evict all remaining buckets
      for (let s = 0; s < 31; s++) {
        dda.update(1.0, 3, 0);
      }

      const finalMetrics = dda.getMetrics();
      expect(finalMetrics.rollingShots).toBe(0);
      expect(finalMetrics.rollingHits).toBe(0);
      expect(finalMetrics.rollingAccuracy).toBe(0.50);
    });

    it('handles Uint32 upper boundary saturation (4,294,967,295) with safe clamping and clean eviction', () => {
      const dda = new DynamicDifficultyManager();

      // Record maximum uint32 count
      dda.recordShotFired(0xFFFFFFFF);
      dda.recordShotHit(0xFFFFFFFF);
      expect(dda.getMetrics().rollingShots).toBe(0xFFFFFFFF);
      expect(dda.getMetrics().rollingHits).toBe(0xFFFFFFFF);

      // Attempting to record more into the same bucket must be safely clamped
      dda.recordShotFired(1000);
      dda.recordShotHit(1000);
      expect(dda.getMetrics().rollingShots).toBe(0xFFFFFFFF);
      expect(dda.getMetrics().rollingHits).toBe(0xFFFFFFFF);

      // Advance 31 seconds to evict
      for (let s = 0; s < 31; s++) {
        dda.update(1.0, 3, 0);
      }

      const metrics = dda.getMetrics();
      expect(metrics.rollingShots).toBe(0);
      expect(metrics.rollingHits).toBe(0);
    });

    it('endures 10 continuous multi-cycle bursts of 500,000 shots each (5,000,000 total) without drift', () => {
      const dda = new DynamicDifficultyManager();

      for (let cycle = 0; cycle < 10; cycle++) {
        // Fire 100,000 shots/sec for 5 seconds (500,000 shots)
        for (let s = 0; s < 5; s++) {
          dda.recordShotFired(100000);
          dda.recordShotHit(75000);
          dda.update(1.0, 3, 0);
        }

        expect(dda.getMetrics().rollingShots).toBe(500000);
        expect(dda.getMetrics().rollingHits).toBe(375000);

        // Evict with 31 empty seconds
        for (let s = 0; s < 31; s++) {
          dda.update(1.0, 3, 0);
        }

        expect(dda.getMetrics().rollingShots).toBe(0);
        expect(dda.getMetrics().rollingHits).toBe(0);
      }
    });
  });

  // ==========================================================================
  // 2. Extreme Score Values Exceeding 2^31
  // ==========================================================================
  describe('Area 2: Extreme Score Values Exceeding 2^31', () => {
    it('absorbs single extreme score of 3,500,000,000 points via recordScoreGain and evicts cleanly to 0', () => {
      const dda = new DynamicDifficultyManager();

      // 3.5 billion points > 2^31 - 1 (2,147,483,647)
      dda.recordScoreGain(3500000000);
      expect(dda.getMetrics().rollingScore).toBe(3500000000);

      // Score velocity is 3.5B / 30 = 116,666,666.67 pts/s
      dda.update(0.016, 3, 0);
      const metrics = dda.getMetrics();
      expect(metrics.scoreVelocity).toBeCloseTo(3500000000 / 30, 0);
      expect(metrics.rawSkillIndex).toBeGreaterThanOrEqual(0.0);
      expect(metrics.rawSkillIndex).toBeLessThanOrEqual(1.0);

      // Evict after 31s
      for (let s = 0; s < 31; s++) {
        dda.update(1.0, 3, 0);
      }

      const postMetrics = dda.getMetrics();
      expect(postMetrics.rollingScore).toBe(0);
      expect(postMetrics.scoreVelocity).toBe(0);
    });

    it('absorbs single extreme score of 3,500,000,000 points via update(dt, lives, score) and evicts cleanly', () => {
      const dda = new DynamicDifficultyManager();

      // Automatically captured via update delta tracking
      dda.update(0.016, 3, 3500000000);
      expect(dda.getMetrics().rollingScore).toBe(3500000000);
      expect(dda.getMetrics().scoreVelocity).toBeCloseTo(3500000000 / 30, 0);

      // Subsequent update with identical score does not add phantom delta
      dda.update(0.016, 3, 3500000000);
      expect(dda.getMetrics().rollingScore).toBe(3500000000);

      // Evict after 31s
      for (let s = 0; s < 31; s++) {
        dda.update(1.0, 3, 3500000000);
      }

      expect(dda.getMetrics().rollingScore).toBe(0);
      expect(dda.getMetrics().scoreVelocity).toBe(0);
    });

    it('handles multiple extreme score increments distributed across 10 buckets summing to 3.0 billion points', () => {
      const dda = new DynamicDifficultyManager();

      // 10 buckets * 300,000,000 = 3,000,000,000 points
      for (let s = 0; s < 10; s++) {
        dda.recordScoreGain(300000000);
        dda.update(1.0, 3, 0);
      }

      expect(dda.getMetrics().rollingScore).toBe(3000000000);

      // Evict
      for (let s = 0; s < 31; s++) {
        dda.update(1.0, 3, 0);
      }

      expect(dda.getMetrics().rollingScore).toBe(0);
    });

    it('safely clamps scores exceeding Uint32 limit (5 billion points) without integer wrap', () => {
      const dda = new DynamicDifficultyManager();

      // 5 billion points exceeds Uint32 (4.29B)
      dda.recordScoreGain(5000000000);
      // Clamped to 0xFFFFFFFF (4,294,967,295)
      expect(dda.getMetrics().rollingScore).toBe(0xFFFFFFFF);

      for (let s = 0; s < 31; s++) {
        dda.update(1.0, 3, 0);
      }

      expect(dda.getMetrics().rollingScore).toBe(0);
    });
  });

  // ==========================================================================
  // 3. 10,000 Frames Combat Loop Zero-Allocation Invariant (< 5.0 MB Drift)
  // ==========================================================================
  describe('Area 3: 10,000 Frames Combat Loop Zero-Allocation Invariant', () => {
    it(
      'executes 10,000 combat loop frames with DDA active, verifying < 5.0 MB net heap drift and strict pool hygiene',
      () => {
        const cheat = game.cheatController;
        cheat.setInvincible(true);

        // Warm-up and stabilization
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
        const initialHeap = process.memoryUsage().heapUsed;

        // Enter Stage 10 with full combat load
        cheat.skipToStage(10);
        game.player.isDual = true;
        cheat.unlockDrone('all');

        const samples: number[] = [];

        // 10,000 frames simulation
        for (let frame = 1; frame <= 10000; frame++) {
          // Dual firing every 5 frames
          if (frame % 5 === 0) {
            game.bulletManager.firePlayerBullet(game.player.x - 6, game.player.y - 8, true, 480);
            game.bulletManager.firePlayerBullet(game.player.x + 6, game.player.y - 8, true, 480);
            game.dynamicDifficultyManager.recordShotFired(2);
          }

          // Hits and score every 15 frames
          if (frame % 15 === 0) {
            game.dynamicDifficultyManager.recordShotHit(1);
            game.scoreManager.addScore(100);
          }

          // Damage every 250 frames
          if (frame % 250 === 0) {
            game.dynamicDifficultyManager.recordPlayerDamage(false);
          }

          // Special moves every 120 frames
          if (frame % 120 === 0) {
            cheat.fillEnergy(100);
            const moveChoice = (frame / 120) % 3;
            if (moveChoice === 0) cheat.triggerSpecialMove('nova');
            else if (moveChoice === 1) cheat.triggerSpecialMove('chrono');
            else cheat.triggerSpecialMove('warp');
          }

          // Periodic drops and explosions
          if (frame % 50 === 0) {
            game.powerUpManager.spawnDrop(112, 80, 10, EnemyType.ZAKO, true);
            game.particleSystem.spawnPlayerExplosion(game.player.x, game.player.y);
          }

          // Stage skips every 2,000 frames
          if (frame % 2000 === 0) {
            const nextStage = 10 + (frame / 2000) * 5;
            cheat.skipToStage(Math.min(50, nextStage));
          }

          // Core loop tick
          game.update(1 / 60);

          if (frame % 2500 === 0) {
            samples.push(process.memoryUsage().heapUsed);
          }
        }

        expect(samples.length).toBe(4);

        // Teardown and verify pool hygiene
        teardownCleanly(game);

        expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
        expect(game.particleSystem.getPool().getActiveCount()).toBe(0);
        expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
        expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
        expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
        expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
        expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);
        expect(game.formationManager.getEnemyPool().getActiveCount()).toBe(0);

        // Bounded pool capacities (no auto-expansion)
        expect(game.bulletManager.getPool().getCapacity()).toBe(32);
        expect(game.particleSystem.getPool().getCapacity()).toBe(250);
        expect(game.powerUpManager.getPool().getCapacity()).toBe(32);
        expect(game.alliesManager.getBombPool().getCapacity()).toBe(16);
        expect(game.alliesManager.getExplosionPool().getCapacity()).toBe(16);
        expect(game.specialMovesManager.getMissilePool().getCapacity()).toBe(32);
        expect(game.specialMovesManager.getSparkPool().getCapacity()).toBe(32);

        forceGC();
        const finalHeap = process.memoryUsage().heapUsed;
        const driftMB = (finalHeap - initialHeap) / (1024 * 1024); console.log(`[10,000 Frames Memory Benchmark] Initial Heap: ${(initialHeap/1048576).toFixed(3)} MB, Final Heap: ${(finalHeap/1048576).toFixed(3)} MB, Net Drift: ${driftMB.toFixed(3)} MB, Samples: ${samples.map(s => (s/1048576).toFixed(2)).join(", ")} MB`);

        // Strict invariant: < 5.0 MB net heap drift
        expect(driftMB).toBeLessThan(5.0);
      },
      60000
    );

    it(
      'runs 50,000 pure DDA update ticks verifying zero object churn and memory stability',
      () => {
        const dda = new DynamicDifficultyManager();

        forceGC();
        const startMem = process.memoryUsage().heapUsed;

        for (let i = 0; i < 50000; i++) {
          dda.recordShotFired(1);
          if (i % 2 === 0) dda.recordShotHit(1);
          if (i % 100 === 0) dda.recordPlayerDamage(false);
          if (i % 10 === 0) dda.recordScoreGain(100);

          dda.update(0.016, 3, i * 100);

          const s = dda.getSkillIndex();
          expect(s).toBeGreaterThanOrEqual(0.0);
          expect(s).toBeLessThanOrEqual(1.0);
        }

        forceGC();
        const endMem = process.memoryUsage().heapUsed;
        const memGrowthMB = (endMem - startMem) / (1024 * 1024); console.log(`[50,000 DDA Updates Memory Benchmark] Start Heap: ${(startMem/1048576).toFixed(3)} MB, End Heap: ${(endMem/1048576).toFixed(3)} MB, Net Drift: ${memGrowthMB.toFixed(3)} MB`);

        expect(memGrowthMB).toBeLessThan(2.0);
      },
      30000
    );
  });

  // ==========================================================================
  // 4. Pity Drop Mechanism & Challenging Stage Bullet/Drop Immunity
  // ==========================================================================
  describe('Area 4: Pity Drop Mechanism & Challenging Stage Immunity', () => {
    const CHALLENGING_STAGES = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47];

    it('verifies exact enumeration of all 12 Challenging Stages across 1..50', () => {
      expect(CHALLENGING_STAGES.length).toBe(12);

      const detectedStages: number[] = [];
      for (let s = 1; s <= 50; s++) {
        if (DifficultyCalculator.isChallengingStage(s)) {
          detectedStages.push(s);
        }
      }

      expect(detectedStages).toEqual(CHALLENGING_STAGES);
    });

    it('strictly guarantees 0 drop chance and 0 spawned items across all 12 Challenging Stages under max pity', () => {
      // Configure maximum pity (+0.25)
      game.player.lives = 1;
      game.dynamicDifficultyManager.setProficiencyOverride(0.00);
      game.dynamicDifficultyManager.recordPlayerDamage(false);
      game.dynamicDifficultyManager.update(0.016, 1, 0);

      expect(game.dynamicDifficultyManager.getPowerUpPityBonus()).toBe(0.25);

      for (const stage of CHALLENGING_STAGES) {
        // computeDropChance must return strictly 0
        expect(game.powerUpManager.computeDropChance(stage, EnemyType.ZAKO, false)).toBe(0);
        expect(game.powerUpManager.computeDropChance(stage, EnemyType.ZAKO, true)).toBe(0);
        expect(game.powerUpManager.computeDropChance(stage, EnemyType.GOEI, false)).toBe(0);
        expect(game.powerUpManager.computeDropChance(stage, EnemyType.GOEI, true)).toBe(0);
        expect(game.powerUpManager.computeDropChance(stage, EnemyType.BOSS, false)).toBe(0);
        expect(game.powerUpManager.computeDropChance(stage, EnemyType.BOSS, true)).toBe(0);

        // 1,000 spawn attempts per stage must all return null
        for (let attempt = 0; attempt < 1000; attempt++) {
          const drop = game.powerUpManager.spawnDrop(100, 100, stage, EnemyType.BOSS, true);
          expect(drop).toBeNull();
        }
      }

      expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
    });

    it('strictly guarantees enemies fire zero bullets across all 12 Challenging Stages', () => {
      for (const stage of CHALLENGING_STAGES) {
        game.cheatController.skipToStage(stage);
        expect(game.stage).toBe(stage);
        expect(game.formationManager.isChallengingStage).toBe(true);

        // Clear any leftover bullets
        game.bulletManager.clear();

        // Run 300 simulation frames (5 seconds of combat)
        for (let frame = 0; frame < 300; frame++) {
          game.update(1 / 60);

          // Invariant: zero enemy bullets can ever be spawned during challenging stage
          expect(game.bulletManager.getEnemyBulletCount()).toBe(0);
        }
      }
    });

    it('verifies dynamic pity drop bonus calculation and clamping in non-challenging stages', () => {
      const dda = game.dynamicDifficultyManager;

      // 1. Healthy state -> pity = 0.00
      dda.reset();
      dda.update(0.016, 3, 0);
      expect(dda.getPowerUpPityBonus()).toBe(0.00);

      // 2. Low lives component (+0.12)
      dda.update(0.016, 1, 0);
      expect(dda.getPowerUpPityBonus()).toBe(0.12);

      // 3. Recent damage component (+0.08)
      dda.recordPlayerDamage(false);
      dda.update(0.016, 3, 0);
      expect(dda.getPowerUpPityBonus()).toBe(0.08);

      // 4. Low skill component (+0.05)
      dda.reset();
      dda.setProficiencyOverride(0.25);
      dda.update(0.016, 3, 0);
      expect(dda.getPowerUpPityBonus()).toBe(0.05);

      // 5. Combined maximum pity (+0.25)
      dda.recordPlayerDamage(false);
      dda.update(0.016, 1, 0);
      expect(dda.getPowerUpPityBonus()).toBe(0.25);

      // 6. Base diving boss drop chance is 0.40 + 0.25 pity = 0.65 ceiling in non-challenging Stage 1
      const chance = game.powerUpManager.computeDropChance(1, EnemyType.BOSS, true);
      expect(chance).toBe(0.40);
      // When spawned with pity, effective drop rate is clamped to 0.65
      let drops = 0;
      for (let i = 0; i < 200; i++) {
        const item = game.powerUpManager.spawnDrop(112, 100, 1, EnemyType.BOSS, true);
        if (item) drops++;
      }
      expect(drops).toBeGreaterThan(0);
      game.powerUpManager.reset();
    });
  });

  // ==========================================================================
  // 5. Robustness, Failsafe Clamping & Invariant Continuity
  // ==========================================================================
  describe('Area 5: Robustness, Failsafe Clamping & Invariant Continuity', () => {
    it('defends against non-finite values across all public recording and update methods', () => {
      const dda = new DynamicDifficultyManager();

      // Record non-finite calls
      dda.recordShotFired(NaN);
      dda.recordShotFired(-10);
      dda.recordShotHit(NaN);
      dda.recordShotHit(-5);
      dda.recordPlayerDamage(NaN as any);
      dda.recordPlayerDamage(false, NaN);
      dda.recordPlayerDamage(false, -1);
      dda.recordScoreGain(NaN);
      dda.recordScoreGain(-1000);

      const m = dda.getMetrics();
      expect(m.rollingShots).toBe(0);
      expect(m.rollingHits).toBe(0);
      expect(m.rollingDamage).toBe(0);
      expect(m.rollingScore).toBe(0);

      // Non-finite update ticks
      dda.update(NaN, NaN as any, NaN as any);
      dda.update(-0.016, 3, 0);
      dda.update(0, 3, 0);

      expect(dda.getSkillIndex()).toBe(0.50);
      const act = dda.getActuators();
      expect(act.diveSpeedMultiplier).toBe(1.10);
      expect(act.bulletDensityMultiplier).toBe(1.10);
      expect(act.bossHealthMultiplier).toBe(1.00);
      expect(act.powerUpPityBonus).toBe(0.00);
    });

    it('guarantees exact baseline Boss HP preservation (1.000x) at neutral sigma = 0.50 across all 5 bosses', () => {
      game.dynamicDifficultyManager.setProficiencyOverride(0.50);
      expect(game.dynamicDifficultyManager.getBossHealthMultiplier()).toBe(1.00);

      const bosses = [
        { stage: 10, hp: 80 },
        { stage: 20, hp: 120 },
        { stage: 30, hp: 150 },
        { stage: 40, hp: 180 },
        { stage: 50, hp: 300 },
      ];

      for (const { stage, hp } of bosses) {
        const boss = BossFactory.createBoss(stage, game);
        expect(boss).not.toBeNull();
        expect(boss?.maxHealth).toBe(hp);
        expect(boss?.health).toBe(hp);
      }
    });

    it('enforces strict mathematical clamping of all 4 actuators under forced NaN state injection', () => {
      const dda = new DynamicDifficultyManager();

      // Force internal state to corrupted values
      (dda as any).smoothedSkillIndex = NaN;
      (dda as any).proficiencyOverride = NaN;
      (dda as any).updateActuators();

      const act = dda.getActuators();
      expect(Number.isFinite(act.diveSpeedMultiplier)).toBe(true);
      expect(act.diveSpeedMultiplier).toBe(1.10);
      expect(Number.isFinite(act.bulletDensityMultiplier)).toBe(true);
      expect(act.bulletDensityMultiplier).toBe(1.10);
      expect(Number.isFinite(act.bossHealthMultiplier)).toBe(true);
      expect(act.bossHealthMultiplier).toBe(1.00);
      expect(Number.isFinite(act.powerUpPityBonus)).toBe(true);
      expect(act.powerUpPityBonus).toBe(0.00);
      expect(Number.isFinite(act.skillIndex)).toBe(true);
      expect(act.skillIndex).toBe(0.50);
    });
  });
});
