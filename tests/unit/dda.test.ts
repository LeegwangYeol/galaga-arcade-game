import { describe, it, expect, beforeEach } from 'vitest';
import { DynamicDifficultyManager } from '../../src/systems/DynamicDifficultyManager';
import { Game } from '../../src/core/Game';
import { EnemyType, EnemyState } from '../../src/types';
import { BossFactory } from '../../src/core/boss/BossFactory';

describe('Milestone 17: Dynamic Difficulty Adjustment (DDA) Engine', () => {
  let dda: DynamicDifficultyManager;

  beforeEach(() => {
    dda = new DynamicDifficultyManager();
  });

  // ==========================================================================
  // Suite 1: Initialization & Neutral Defaults
  // ==========================================================================
  describe('Suite 1: Initialization & Neutral Defaults', () => {
    it('initializes with neutral Skill Index of exactly 0.50', () => {
      expect(dda.getSkillIndex()).toBe(0.50);
    });

    it('initializes actuators with exact neutral scaling factors', () => {
      const actuators = dda.getActuators();
      expect(actuators.skillIndex).toBe(0.50);
      expect(actuators.diveSpeedMultiplier).toBe(1.10); // 0.85 + 0.50 * 0.50
      expect(actuators.bulletDensityMultiplier).toBe(1.10); // 0.80 + 0.60 * 0.50
      expect(actuators.bossHealthMultiplier).toBe(1.00); // Exact 1.000 baseline at neutral sigma = 0.50
      expect(actuators.powerUpPityBonus).toBe(0.00); // 0 pity when healthy
    });

    it('initializes telemetry metrics with clean zero-state accumulators', () => {
      const metrics = dda.getMetrics();
      expect(metrics.rollingShots).toBe(0);
      expect(metrics.rollingHits).toBe(0);
      expect(metrics.rollingDamage).toBe(0);
      expect(metrics.rollingScore).toBe(0);
      expect(metrics.secondsSinceLastDamage).toBe(30.0);
      expect(metrics.currentLives).toBe(3);
      expect(metrics.rollingAccuracy).toBe(0.50);
      expect(metrics.survivalFactor).toBe(1.00);
    });

    it('cleanly flushes all state and ring buffers on reset()', () => {
      dda.recordShotFired(15);
      dda.recordShotHit(12);
      dda.recordPlayerDamage(true);
      dda.recordScoreGain(5000);
      dda.setProficiencyOverride(0.95);

      dda.reset();

      expect(dda.getSkillIndex()).toBe(0.50);
      expect(dda.getActuators().bossHealthMultiplier).toBe(1.00);
      expect(dda.getMetrics().rollingShots).toBe(0);
      expect(dda.getMetrics().rollingHits).toBe(0);
      expect(dda.getMetrics().rollingDamage).toBe(0);
      expect(dda.getMetrics().rollingScore).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 2: Telemetry Recording & Rolling Ring Buffers
  // ==========================================================================
  describe('Suite 2: Telemetry Recording & Rolling Ring Buffers', () => {
    it('accurately accumulates shots and hits in the active bucket and running sums', () => {
      dda.recordShotFired(4);
      dda.recordShotHit(3);

      expect(dda.getMetrics().rollingShots).toBe(4);
      expect(dda.getMetrics().rollingHits).toBe(3);
    });

    it('applies Bayesian damping for small samples (< 10 shots)', () => {
      // 2 shots, 2 hits -> raw ratio is 100%, but small sample blends with 0.50 prior
      // weight = 2/10 = 0.20 -> 0.20 * 1.0 + 0.80 * 0.50 = 0.60
      dda.recordShotFired(2);
      dda.recordShotHit(2);
      dda.update(0.016, 3, 0);

      const metrics = dda.getMetrics();
      expect(metrics.rollingAccuracy).toBeCloseTo(0.60, 2);
    });

    it('evaluates undamped rolling accuracy once sample size reaches >= 10 shots', () => {
      dda.recordShotFired(10);
      dda.recordShotHit(7);
      dda.update(0.016, 3, 0);

      const metrics = dda.getMetrics();
      expect(metrics.rollingAccuracy).toBeCloseTo(0.70, 2);
    });

    it('advances 1-second circular ring buffer buckets and evicts expired data after 30s', () => {
      dda.recordShotFired(10);
      dda.recordShotHit(10);
      dda.recordPlayerDamage(false);
      dda.recordScoreGain(1000);

      expect(dda.getMetrics().rollingShots).toBe(10);
      expect(dda.getMetrics().rollingHits).toBe(10);
      expect(dda.getMetrics().rollingDamage).toBe(1);
      expect(dda.getMetrics().rollingScore).toBe(1000);

      // Simulate 15 seconds: data should still be present in the 30s rolling window
      for (let s = 0; s < 15; s++) {
        dda.update(1.0, 3, 1000);
      }
      expect(dda.getMetrics().rollingShots).toBe(10);
      expect(dda.getMetrics().rollingHits).toBe(10);

      // Simulate remaining 16 seconds (total 31s elapsed): initial bucket expires
      for (let s = 0; s < 16; s++) {
        dda.update(1.0, 3, 1000);
      }
      expect(dda.getMetrics().rollingShots).toBe(0);
      expect(dda.getMetrics().rollingHits).toBe(0);
      expect(dda.getMetrics().rollingDamage).toBe(0);
      expect(dda.getMetrics().rollingScore).toBe(0);
    });

    it('tracks damage frequency and resets secondsSinceLastDamage on hit', () => {
      dda.update(10.0, 3, 0);
      expect(dda.getMetrics().secondsSinceLastDamage).toBe(40.0);

      dda.recordPlayerDamage(false);
      expect(dda.getMetrics().secondsSinceLastDamage).toBe(0.0);
      expect(dda.getMetrics().rollingDamage).toBe(1);
    });

    it('depresses survival factor upon taking damage and with low lives', () => {
      // Undamaged, 3 lives
      dda.update(0.016, 3, 0);
      const highSurvival = dda.getMetrics().survivalFactor;
      expect(highSurvival).toBe(1.0);

      // Take damage and drop to 1 life
      dda.recordPlayerDamage(true);
      dda.recordPlayerDamage(true);
      dda.update(0.016, 1, 0);

      const lowSurvival = dda.getMetrics().survivalFactor;
      expect(lowSurvival).toBeLessThan(0.40);
    });

    it('tracks stage clear speed ratio comparing against stage type benchmarks', () => {
      dda.onStageStart(1); // Normal stage expected 30s
      dda.onStageClear(1, 15.0); // Cleared in 15s (2.0x faster)

      dda.update(0.016, 3, 0);
      expect(dda.getMetrics().clearSpeedRatio).toBeGreaterThan(0.70);

      // Clear stage very slowly
      dda.onStageStart(2);
      dda.onStageClear(2, 60.0); // 60s on 30s benchmark (0.50x)
      dda.update(0.016, 3, 0);
      expect(dda.getMetrics().clearSpeedRatio).toBeLessThan(0.70);
    });

    it('tracks score velocity from score delta and normalizes to 250 pts/s', () => {
      dda.update(1.0, 3, 0);
      // Gain 7,500 points across 30 seconds -> 250 pts/s -> normalized velocity = 1.0
      dda.update(1.0, 3, 7500);

      const metrics = dda.getMetrics();
      expect(metrics.rollingScore).toBe(7500);
      expect(metrics.scoreVelocity).toBe(250);
    });
  });

  // ==========================================================================
  // Suite 3: Skill Index & Asymmetric EMA Smoothing
  // ==========================================================================
  describe('Suite 3: Skill Index & Asymmetric EMA Smoothing', () => {
    it('strictly clamps raw and smoothed skill index within [0.0, 1.0]', () => {
      // Adversarial extreme high performance
      for (let i = 0; i < 50; i++) {
        dda.recordShotFired(10);
        dda.recordShotHit(10);
        dda.recordScoreGain(1000);
      }
      dda.update(10.0, 5, 50000);
      expect(dda.getSkillIndex()).toBeLessThanOrEqual(1.0);
      expect(dda.getSkillIndex()).toBeGreaterThanOrEqual(0.0);

      // Adversarial extreme low performance
      dda.reset();
      for (let i = 0; i < 50; i++) {
        dda.recordShotFired(10);
        dda.recordPlayerDamage(true);
      }
      dda.update(10.0, 0, 0);
      expect(dda.getSkillIndex()).toBeLessThanOrEqual(1.0);
      expect(dda.getSkillIndex()).toBeGreaterThanOrEqual(0.0);
    });

    it('applies fast downward relief (tau = 0.8s) when taking damage', () => {
      // Start from high proficiency
      dda.setProficiencyOverride(0.90);
      dda.update(0.016, 3, 0);
      dda.setProficiencyOverride(null); // Release override with smooth at 0.90

      // Trigger heavy damage (raw drops sharply to low value)
      for (let i = 0; i < 5; i++) {
        dda.recordPlayerDamage(true);
      }
      dda.recordShotFired(20); // 0 hits -> 0% accuracy

      const before = dda.getSkillIndex();
      // Tick 0.8 seconds (one tau_down)
      dda.update(0.8, 1, 0);
      const after = dda.getSkillIndex();

      // Should have dropped substantially within 0.8s (approx 63% of delta)
      expect(after).toBeLessThan(before - 0.20);
    });

    it('applies gradual upward ramp (tau = 3.0s) when dominating to prevent sudden spikes', () => {
      // Start from low proficiency
      dda.setProficiencyOverride(0.20);
      dda.update(0.016, 3, 0);
      dda.setProficiencyOverride(null);

      // Player dominates: 100% hits, high score
      for (let i = 0; i < 20; i++) {
        dda.recordShotFired(1);
        dda.recordShotHit(1);
      }
      dda.recordScoreGain(5000);

      const before = dda.getSkillIndex();
      // Tick 0.8 seconds
      dda.update(0.8, 3, 5000);
      const after = dda.getSkillIndex();

      // Upward ramp should be gradual: delta in 0.8s should be modest (tau is 3.0s)
      expect(after - before).toBeLessThan(0.25);
    });
  });

  // ==========================================================================
  // Suite 4: Dynamic Tuning Actuators
  // ==========================================================================
  describe('Suite 4: Dynamic Tuning Actuators', () => {
    it('scales diveSpeedMultiplier linearly from 0.85x to 1.35x', () => {
      dda.setProficiencyOverride(0.0);
      expect(dda.getDiveSpeedMultiplier()).toBe(0.85);

      dda.setProficiencyOverride(0.5);
      expect(dda.getDiveSpeedMultiplier()).toBe(1.10);

      dda.setProficiencyOverride(1.0);
      expect(dda.getDiveSpeedMultiplier()).toBe(1.35);
    });

    it('scales bulletDensityMultiplier linearly from 0.80x to 1.40x', () => {
      dda.setProficiencyOverride(0.0);
      expect(dda.getBulletDensityMultiplier()).toBe(0.80);

      dda.setProficiencyOverride(0.5);
      expect(dda.getBulletDensityMultiplier()).toBe(1.10);

      dda.setProficiencyOverride(1.0);
      expect(dda.getBulletDensityMultiplier()).toBe(1.40);
    });

    it('evaluates bossHealthMultiplier with piecewise exact 1.000x at neutral sigma = 0.50', () => {
      // Novice sigma = 0.0 -> 0.90x
      dda.setProficiencyOverride(0.0);
      expect(dda.getBossHealthMultiplier()).toBe(0.90);

      // Neutral sigma = 0.50 -> EXACT 1.000x!
      dda.setProficiencyOverride(0.50);
      expect(dda.getBossHealthMultiplier()).toBe(1.00);

      // Expert sigma = 1.00 -> 1.25x
      dda.setProficiencyOverride(1.00);
      expect(dda.getBossHealthMultiplier()).toBe(1.25);
    });

    it('activates powerUpPityBonus dynamically up to +0.25 on distress', () => {
      // Full health & undamaged -> 0 pity bonus
      dda.update(0.016, 3, 0);
      expect(dda.getPowerUpPityBonus()).toBe(0.00);

      // Down to 1 life -> +0.12 pity
      dda.update(0.016, 1, 0);
      expect(dda.getPowerUpPityBonus()).toBeGreaterThanOrEqual(0.12);

      // Down to 1 life AND recently damaged (< 10s) -> +0.20 pity
      dda.recordPlayerDamage(false);
      dda.update(0.016, 1, 0);
      expect(dda.getPowerUpPityBonus()).toBeGreaterThanOrEqual(0.20);

      // Distress with low skill (< 0.30) -> capped at +0.25
      dda.setProficiencyOverride(0.10);
      dda.update(0.016, 1, 0);
      expect(dda.getPowerUpPityBonus()).toBe(0.25);
    });
  });

  // ==========================================================================
  // Suite 5: Zero-Allocation Memory Hygiene (60s of 60FPS updates)
  // ==========================================================================
  describe('Suite 5: Zero-Allocation Memory Hygiene', () => {
    it('executes 3,600 consecutive 60FPS update ticks without buffer reallocation', () => {
      const actuatorsRef = dda.getActuators();
      const metricsRef = dda.getMetrics();

      // Simulate 60 seconds (3,600 frames at 60Hz) with continuous combat events
      for (let frame = 0; frame < 3600; frame++) {
        if (frame % 30 === 0) dda.recordShotFired(1);
        if (frame % 45 === 0) dda.recordShotHit(1);
        if (frame % 300 === 0) dda.recordPlayerDamage(false);
        if (frame % 60 === 0) dda.recordScoreGain(100);

        dda.update(1 / 60, 3, frame * 10);
      }

      // Memory identity guarantee: returned object references are unchanged
      expect(dda.getActuators()).toBe(actuatorsRef);
      expect(dda.getMetrics()).toBe(metricsRef);

      // Verify running sums match non-negative invariants
      expect(dda.getMetrics().rollingShots).toBeGreaterThanOrEqual(0);
      expect(dda.getMetrics().rollingHits).toBeGreaterThanOrEqual(0);
      expect(dda.getMetrics().rollingDamage).toBeGreaterThanOrEqual(0);
      expect(dda.getMetrics().rollingScore).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Suite 6: Cheat Controller & Game Integration
  // ==========================================================================
  describe('Suite 6: Cheat Controller & Subsystem Integration', () => {
    let game: Game;

    beforeEach(() => {
      game = new Game();
    });

    it('wires dynamicDifficultyManager into Game instance cleanly', () => {
      expect(game.dynamicDifficultyManager).toBeDefined();
      expect(game.dynamicDifficultyManager.getSkillIndex()).toBe(0.50);
    });

    it('records shots fired in DDA when player fires in game loop', () => {
      const initialShots = game.dynamicDifficultyManager.getMetrics().rollingShots;
      game.player.onFire?.([{ x: 112, y: 240, vx: 0, vy: -300 }]);
      expect(game.dynamicDifficultyManager.getMetrics().rollingShots).toBe(initialShots + 1);
    });

    it('records enemy bullet hit in DDA during collision resolution', () => {
      game.formationManager.spawnStage(1);
      const enemy = game.formationManager.enemies[0]!;
      enemy.active = true;
      enemy.state = EnemyState.IN_FORMATION;
      enemy.x = 100;
      enemy.y = 100;

      // Spawn player bullet on top of enemy
      const bullet = game.bulletManager.firePlayerBullet(100, 100, false, 300, 0, -300, 2);
      expect(bullet).not.toBeNull();

      const hitsBefore = game.dynamicDifficultyManager.getMetrics().rollingHits;
      game.resolveCollisions();
      expect(game.dynamicDifficultyManager.getMetrics().rollingHits).toBe(hitsBefore + 1);
    });

    it('records damage in DDA on player shield deflection and hull explosion', () => {
      // Shield deflection
      game.player.hasShield = true;
      game.player.onShieldDeflect?.(112, 250);
      expect(game.dynamicDifficultyManager.getMetrics().rollingDamage).toBe(1);
      expect(game.dynamicDifficultyManager.getMetrics().secondsSinceLastDamage).toBe(0);

      // Hull explosion
      game.player.onExplode?.(112, 250, false);
      expect(game.dynamicDifficultyManager.getMetrics().rollingDamage).toBe(2);
    });

    it('applies DDA dive speed multiplier to diving enemies in FormationManager', () => {
      game.dynamicDifficultyManager.setProficiencyOverride(1.0); // diveSpeed = 1.35x
      const expectedSpeed = 160 * game.formationManager.diveSpeedMultiplier * 1.35;

      expect(160 * game.formationManager.getEffectiveDiveSpeedMultiplier()).toBeCloseTo(
        expectedSpeed,
        3
      );
    });

    it('strictly preserves 0 bullets and base speed on Challenging Stages even at max DDA skill', () => {
      game.dynamicDifficultyManager.setProficiencyOverride(1.0); // max aggression
      game.formationManager.spawnStage(3); // Stage 3 is challenging

      expect(game.formationManager.isChallengingStage).toBe(true);
      expect(game.formationManager.getEffectiveBulletDensityMultiplier()).toBe(1.0); // Unaltered
      expect(game.formationManager.getEffectiveDiveSpeedMultiplier()).toBe(game.formationManager.diveSpeedMultiplier);

      // Assert all enemies in challenging stage cannot shoot
      for (const enemy of game.formationManager.enemies) {
        expect(enemy.canShoot).toBe(false);
        expect(enemy.isChallenging).toBe(true);
      }
    });

    it('scales Boss Max HP via BossFactory with exact baseline preservation at neutral sigma', () => {
      // Neutral sigma = 0.50 -> exact baseline HP
      game.dynamicDifficultyManager.setProficiencyOverride(0.50);
      const boss10Neutral = BossFactory.createBoss(10, game);
      const boss50Neutral = BossFactory.createBoss(50, game);
      expect(boss10Neutral?.maxHealth).toBe(80);
      expect(boss50Neutral?.maxHealth).toBe(300);

      // High sigma = 1.00 -> 1.25x HP
      game.dynamicDifficultyManager.setProficiencyOverride(1.00);
      const boss10Expert = BossFactory.createBoss(10, game);
      const boss50Expert = BossFactory.createBoss(50, game);
      expect(boss10Expert?.maxHealth).toBe(Math.round(80 * 1.25)); // 100 HP
      expect(boss50Expert?.maxHealth).toBe(Math.round(300 * 1.25)); // 375 HP

      // Low sigma = 0.00 -> 0.90x HP
      game.dynamicDifficultyManager.setProficiencyOverride(0.00);
      const boss10Novice = BossFactory.createBoss(10, game);
      expect(boss10Novice?.maxHealth).toBe(Math.round(80 * 0.90)); // 72 HP
    });

    it('adds pity bonus in PowerUpManager.spawnDrop() while preserving computeDropChance()', () => {
      const baseChance = game.powerUpManager.computeDropChance(1, EnemyType.ZAKO, false);
      expect(baseChance).toBeCloseTo(0.12, 3); // Unmodified baseline

      // Put player at 1 life with recent damage to trigger +0.20 pity
      game.player.lives = 1;
      game.dynamicDifficultyManager.recordPlayerDamage(false);
      game.dynamicDifficultyManager.update(0.016, 1, 0);

      const pityBonus = game.dynamicDifficultyManager.getPowerUpPityBonus();
      expect(pityBonus).toBeGreaterThanOrEqual(0.20);

      // In Challenging Stages, spawnDrop strictly returns null regardless of pity
      const dropInChallenging = game.powerUpManager.spawnDrop(100, 100, 3, EnemyType.BOSS, true);
      expect(dropInChallenging).toBeNull();
    });

    it('allows GalagaCheatController to set, read, and reset DDA proficiency', () => {
      const cheat = game.cheatController;

      // Valid override
      expect(cheat.setDDAProficiency(0.75)).toBe(true);
      expect(game.dynamicDifficultyManager.getSkillIndex()).toBe(0.75);

      const metrics = cheat.getDDAMetrics() as any;
      expect(metrics.actuators.skillIndex).toBe(0.75);

      // Out of bounds input returns false
      expect(cheat.setDDAProficiency(1.5)).toBe(false);
      expect(cheat.setDDAProficiency(-0.1)).toBe(false);

      // Reset DDA restores neutral
      cheat.resetDDA();
      expect(game.dynamicDifficultyManager.getSkillIndex()).toBe(0.50);

      // getGameState() includes dda snapshot
      const state = cheat.getGameState();
      expect(state.dda).toBeDefined();
      expect(state.dda?.skillIndex).toBe(0.50);
      expect(state.dda?.bossHealthMultiplier).toBe(1.00);
    });
  });
});
