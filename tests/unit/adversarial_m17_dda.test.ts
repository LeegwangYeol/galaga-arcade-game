import { describe, it, expect, beforeEach } from 'vitest';
import { DynamicDifficultyManager } from '../../src/systems/DynamicDifficultyManager';
import { Game } from '../../src/core/Game';
import { BossFactory } from '../../src/core/boss/BossFactory';
import { EnemyType } from '../../src/types';

describe('Milestone 17 Adversarial: Dynamic Difficulty Adjustment (DDA) Engine Fuzzing & Boundary Suite', () => {
  let dda: DynamicDifficultyManager;

  beforeEach(() => {
    dda = new DynamicDifficultyManager();
  });

  // ==========================================================================
  // Suite 1: High-Frequency Burst Input & TypedArray Integer Overflow Fuzzing
  // ==========================================================================
  describe('Suite 1: High-Frequency Burst Input & TypedArray Limits', () => {
    it('verifies Uint32Array capacity absorbs 100,000 burst shots/hits without phantom residual after 31s eviction', () => {
      // Record 100,000 shots and 50,000 hits in the current bucket
      dda.recordShotFired(100000);
      dda.recordShotHit(50000);

      // Immediately after recording: running sum added 100,000 and 50,000
      expect(dda.getMetrics().rollingShots).toBe(100000);
      expect(dda.getMetrics().rollingHits).toBe(50000);

      // Advance time by 31 seconds so the bucket expires and is evicted
      for (let s = 0; s < 31; s++) {
        dda.update(1.0, 3, 0);
      }

      // REMEDIATED INVARIANT: Exactly 0 residual phantom shots or hits!
      const metrics = dda.getMetrics();
      expect(metrics.rollingShots).toBe(0);
      expect(metrics.rollingHits).toBe(0);
      expect(metrics.rollingAccuracy).toBe(0.50); // Restores neutral prior cleanly
    });

    it('verifies Uint32Array capacity absorbs > 255 damage events without phantom residual after 31s eviction', () => {
      // Record 300 damage events
      for (let i = 0; i < 300; i++) {
        dda.recordPlayerDamage(false);
      }

      expect(dda.getMetrics().rollingDamage).toBe(300);

      // Advance time by 31 seconds so the bucket expires and is evicted
      for (let s = 0; s < 31; s++) {
        dda.update(1.0, 3, 0);
      }

      // REMEDIATED INVARIANT: Exactly 0 residual phantom damage events!
      const metrics = dda.getMetrics();
      expect(metrics.rollingDamage).toBe(0);
    });

    it('survives 10,000 rapid zero-to-max difficulty toggles without memory leak or corruption', () => {
      for (let i = 0; i < 10000; i++) {
        const toggle = i % 2 === 0 ? 0.0 : 1.0;
        dda.setProficiencyOverride(toggle);
        expect(dda.getSkillIndex()).toBe(toggle);
      }

      dda.setProficiencyOverride(null);
      expect(dda.getSkillIndex()).toBeGreaterThanOrEqual(0.0);
      expect(dda.getSkillIndex()).toBeLessThanOrEqual(1.0);
    });
  });

  // ==========================================================================
  // Suite 2: Extreme Boundary Conditions & Non-Finite / NaN Fuzzing
  // ==========================================================================
  describe('Suite 2: Extreme Boundary Conditions & NaN Fuzzing', () => {
    it('handles zero shots and zero hits gracefully returning neutral 0.50 accuracy prior', () => {
      dda.update(0.016, 3, 0);
      const metrics = dda.getMetrics();
      expect(metrics.rollingShots).toBe(0);
      expect(metrics.rollingHits).toBe(0);
      expect(metrics.rollingAccuracy).toBe(0.50);
      expect(dda.getSkillIndex()).toBeCloseTo(0.50, 2);
    });

    it('handles negative dt by clamping to 0.0 without corrupting timers', () => {
      dda.update(-10.0, 3, 0);
      const metrics = dda.getMetrics();
      expect(metrics.stageElapsedTime).toBe(0.0);
      expect(metrics.secondsSinceLastDamage).toBe(30.0);
      expect(dda.getSkillIndex()).toBe(0.50);
    });

    it('handles huge dt (+1,000,000s) by cleanly flushing ring buffers without integer overflow', () => {
      dda.recordShotFired(10);
      dda.recordShotHit(5);
      dda.recordPlayerDamage(true);
      dda.recordScoreGain(5000);

      // Huge delta step: triggers WINDOW_SECONDS complete flush
      dda.update(1000000.0, 3, 5000);

      const metrics = dda.getMetrics();
      expect(metrics.rollingShots).toBe(0);
      expect(metrics.rollingHits).toBe(0);
      expect(metrics.rollingDamage).toBe(0);
      expect(metrics.rollingScore).toBe(0);
      expect(metrics.stageElapsedTime).toBe(1000000.0);
    });

    it('defends against NaN dt input and does NOT freeze subsequent valid updates', () => {
      // When dt = NaN, update() must reject dt early without corrupting timers or state
      dda.update(NaN, 3, 0);
      const metrics = dda.getMetrics();

      expect(Number.isNaN(metrics.rawSkillIndex)).toBe(false);
      expect(metrics.rawSkillIndex).toBe(0.50);
      expect(Number.isNaN(metrics.survivalFactor)).toBe(false);
      expect(metrics.survivalFactor).toBe(1.00);
      expect(metrics.secondsSinceLastDamage).toBe(30.0);
      expect(metrics.stageElapsedTime).toBe(0.0);

      // On subsequent frame with valid dt = 0.016, secondsSinceLastDamage and timers advance normally
      dda.update(0.016, 3, 0);
      const metricsAfter = dda.getMetrics();
      expect(Number.isNaN(metricsAfter.rawSkillIndex)).toBe(false);
      expect(Number.isNaN(metricsAfter.secondsSinceLastDamage)).toBe(false);
      expect(metricsAfter.secondsSinceLastDamage).toBeCloseTo(30.016, 3);
      expect(metricsAfter.stageElapsedTime).toBeCloseTo(0.016, 3);
      expect(dda.getSkillIndex()).toBeCloseTo(0.50, 2);
    });

    it('defends against recordShotFired(NaN) without corrupting rolling accumulators', () => {
      // NaN, negative, and infinite counts are rejected by defensive guard
      dda.recordShotFired(NaN);
      dda.recordShotFired(-10);
      dda.recordShotFired(Infinity);
      expect(dda.getMetrics().rollingShots).toBe(0);

      dda.update(0.016, 3, 0);
      expect(Number.isNaN(dda.getMetrics().rollingAccuracy)).toBe(false);
      expect(dda.getMetrics().rollingAccuracy).toBe(0.50);

      // Verify subsequent valid shots accumulate cleanly
      dda.recordShotFired(10);
      dda.recordShotHit(8);
      expect(dda.getMetrics().rollingShots).toBe(10);
      expect(dda.getMetrics().rollingHits).toBe(8);

      dda.update(0.016, 3, 0);
      expect(dda.getMetrics().rollingAccuracy).toBeCloseTo(0.80, 2);
    });

    it('defends against setProficiencyOverride(NaN) without corrupting actuators', () => {
      // Calling setProficiencyOverride(NaN) must be rejected without mutating state
      dda.setProficiencyOverride(NaN);
      expect(Number.isNaN(dda.getSkillIndex())).toBe(false);
      expect(dda.getSkillIndex()).toBe(0.50);

      // Actuators must remain finite in legal neutral ranges
      expect(Number.isNaN(dda.getDiveSpeedMultiplier())).toBe(false);
      expect(dda.getDiveSpeedMultiplier()).toBe(1.10);
      expect(Number.isNaN(dda.getBulletDensityMultiplier())).toBe(false);
      expect(dda.getBulletDensityMultiplier()).toBe(1.10);
      expect(Number.isNaN(dda.getBossHealthMultiplier())).toBe(false);
      expect(dda.getBossHealthMultiplier()).toBe(1.00);

      // Additional invalid non-finite checks
      dda.setProficiencyOverride(Infinity);
      expect(dda.getSkillIndex()).toBe(0.50);
      dda.setProficiencyOverride(-Infinity);
      expect(dda.getSkillIndex()).toBe(0.50);
    });

    it('handles life = 0 correctly by lowering survival factor and raising pity bonus', () => {
      dda.update(0.016, 0, 0);
      const metrics = dda.getMetrics();
      expect(metrics.currentLives).toBe(0);
      expect(metrics.survivalFactor).toBeLessThanOrEqual(0.50);
      expect(dda.getPowerUpPityBonus()).toBeGreaterThanOrEqual(0.12);
    });
  });

  // ==========================================================================
  // Suite 3: Challenging Stage Bullet & Speed Immunity Invariant
  // ==========================================================================
  describe('Suite 3: Challenging Stage Absolute Immunity Invariant', () => {
    let game: Game;
    const CHALLENGING_STAGES = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47];

    beforeEach(() => {
      game = new Game();
      game.startGame();
    });

    it('verifies all 12 Challenging Stages strictly fire 0 enemy bullets even when DDA is locked at 1.0 (Expert)', () => {
      game.dynamicDifficultyManager.setProficiencyOverride(1.0); // Maximum aggression

      for (const stage of CHALLENGING_STAGES) {
        game.cheatController.skipToStage(stage);

        expect(game.formationManager.isChallengingStage).toBe(true);
        expect(game.formationManager.getEffectiveBulletDensityMultiplier()).toBe(1.0);
        expect(game.formationManager.getEffectiveDiveSpeedMultiplier()).toBe(
          game.formationManager.diveSpeedMultiplier
        );

        // Simulate 60 frames (1 second)
        let bulletsFired = 0;
        for (let frame = 0; frame < 60; frame++) {
          game.update(1 / 60);
          bulletsFired += game.bulletManager.getEnemyBulletCount();
        }

        expect(bulletsFired).toBe(0);
      }
    });

    it('verifies PowerUpManager strictly drops 0 power-ups in Challenging Stages regardless of DDA pity', () => {
      // Distressed state: 1 life, recent damage
      game.dynamicDifficultyManager.setProficiencyOverride(0.0);
      game.dynamicDifficultyManager.recordPlayerDamage(false);
      game.dynamicDifficultyManager.update(0.016, 1, 0);

      const pity = game.dynamicDifficultyManager.getPowerUpPityBonus();
      expect(pity).toBeGreaterThanOrEqual(0.20);

      // In challenging stage, spawnDrop must strictly return null
      for (const stage of CHALLENGING_STAGES) {
        const drop = game.powerUpManager.spawnDrop(100, 100, stage, EnemyType.BOSS, true);
        expect(drop).toBeNull();
      }
    });
  });

  // ==========================================================================
  // Suite 4: Boss HP Scaling Invariant
  // ==========================================================================
  describe('Suite 4: Boss HP Scaling Invariant Across Stages 10, 20, 30, 40, 50', () => {
    let game: Game;
    const BOSS_STAGES = [10, 20, 30, 40, 50];
    const BASE_HP: Record<number, number> = {
      10: 80,
      20: 120,
      30: 150,
      40: 180,
      50: 300,
    };

    beforeEach(() => {
      game = new Game();
    });

    it('verifies Boss HP at sigma = 0.0 (Novice 0.90x)', () => {
      game.dynamicDifficultyManager.setProficiencyOverride(0.0);
      expect(game.dynamicDifficultyManager.getBossHealthMultiplier()).toBe(0.90);

      for (const stage of BOSS_STAGES) {
        const boss = BossFactory.createBoss(stage, game);
        const expectedHp = Math.round(BASE_HP[stage]! * 0.90);
        expect(boss?.maxHealth).toBe(expectedHp);
        expect(boss?.health).toBe(expectedHp);
      }
    });

    it('verifies Boss HP at sigma = 0.5 (Neutral 1.00x - Exact Baseline Preservation)', () => {
      game.dynamicDifficultyManager.setProficiencyOverride(0.5);
      expect(game.dynamicDifficultyManager.getBossHealthMultiplier()).toBe(1.00);

      for (const stage of BOSS_STAGES) {
        const boss = BossFactory.createBoss(stage, game);
        const expectedHp = BASE_HP[stage]!;
        expect(boss?.maxHealth).toBe(expectedHp);
        expect(boss?.health).toBe(expectedHp);
      }
    });

    it('verifies Boss HP at sigma = 1.0 (Expert 1.25x)', () => {
      game.dynamicDifficultyManager.setProficiencyOverride(1.0);
      expect(game.dynamicDifficultyManager.getBossHealthMultiplier()).toBe(1.25);

      for (const stage of BOSS_STAGES) {
        const boss = BossFactory.createBoss(stage, game);
        const expectedHp = Math.round(BASE_HP[stage]! * 1.25);
        expect(boss?.maxHealth).toBe(expectedHp);
        expect(boss?.health).toBe(expectedHp);
      }
    });
  });

  // ==========================================================================
  // Suite 5: High-Saturation Endurance & Failsafe Clamping Invariants
  // ==========================================================================
  describe('Suite 5: High-Saturation Endurance & Failsafe Clamping Invariants', () => {
    it('verifies 5-bucket consecutive burst (500,000 shots) completely evicts after 36s', () => {
      // 100,000 shots fired per second for 5 consecutive seconds
      for (let s = 0; s < 5; s++) {
        dda.recordShotFired(100000);
        dda.recordShotHit(50000);
        dda.update(1.0, 3, 0);
      }

      expect(dda.getMetrics().rollingShots).toBe(500000);
      expect(dda.getMetrics().rollingHits).toBe(250000);

      // Advance 31 more seconds (total 36s elapsed) -> all 5 buckets must be evicted
      for (let s = 0; s < 31; s++) {
        dda.update(1.0, 3, 0);
      }

      const metrics = dda.getMetrics();
      expect(metrics.rollingShots).toBe(0);
      expect(metrics.rollingHits).toBe(0);
      expect(metrics.rollingAccuracy).toBe(0.50);
    });

    it('verifies score buffer absorption of extreme scores (> 2^31) without signed integer wrap', () => {
      // 3 billion points exceeds signed 32-bit integer range [-(2^31), 2^31 - 1]
      dda.recordScoreGain(3000000000);
      expect(dda.getMetrics().rollingScore).toBe(3000000000);

      for (let s = 0; s < 31; s++) {
        dda.update(1.0, 3, 3000000000);
      }

      // Must cleanly evict to 0 without phantom addition or negative score corruption
      expect(dda.getMetrics().rollingScore).toBe(0);
    });

    it('defends recordPlayerDamage against NaN and negative counts', () => {
      dda.recordPlayerDamage(NaN as any);
      expect(dda.getMetrics().rollingDamage).toBe(0);
      expect(dda.getMetrics().secondsSinceLastDamage).toBe(30.0);

      dda.recordPlayerDamage(false, NaN);
      expect(dda.getMetrics().rollingDamage).toBe(0);

      dda.recordPlayerDamage(false, -5);
      expect(dda.getMetrics().rollingDamage).toBe(0);

      dda.recordPlayerDamage(false, 3);
      expect(dda.getMetrics().rollingDamage).toBe(3);
      expect(dda.getMetrics().secondsSinceLastDamage).toBe(0.0);
    });

    it('defends update against NaN playerLives and NaN currentScore', () => {
      dda.update(0.016, NaN as any, NaN as any);
      const metrics = dda.getMetrics();
      expect(Number.isFinite(metrics.currentLives)).toBe(true);
      expect(metrics.currentLives).toBe(3);
      expect(Number.isFinite(metrics.survivalFactor)).toBe(true);
      expect(Number.isFinite(metrics.rawSkillIndex)).toBe(true);
    });

    it('failsafe clamping guarantees actuators never contain NaN even under forced memory corruption', () => {
      // Force internal state corruption via reflection to verify actuator firewall
      (dda as any).smoothedSkillIndex = NaN;
      (dda as any).proficiencyOverride = NaN;
      (dda as any).updateActuators();

      const actuators = dda.getActuators();
      expect(Number.isFinite(actuators.diveSpeedMultiplier)).toBe(true);
      expect(actuators.diveSpeedMultiplier).toBe(1.10);
      expect(Number.isFinite(actuators.bulletDensityMultiplier)).toBe(true);
      expect(actuators.bulletDensityMultiplier).toBe(1.10);
      expect(Number.isFinite(actuators.bossHealthMultiplier)).toBe(true);
      expect(actuators.bossHealthMultiplier).toBe(1.00);
      expect(Number.isFinite(actuators.powerUpPityBonus)).toBe(true);
      expect(actuators.powerUpPityBonus).toBe(0.00);
      expect(Number.isFinite(actuators.skillIndex)).toBe(true);
      expect(actuators.skillIndex).toBe(0.50);
    });
  });
});
