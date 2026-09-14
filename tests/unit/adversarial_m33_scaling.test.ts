/**
 * Galaga Arcade Web Game — Milestone M33 Adversarial Test Suite
 * 
 * Focus: Adversarial Dynamic Scaling, Stage Bosses Scaling & Phase Invariance,
 * Multiplicative DDA Composition Under Stress, and Wave Divers & Density Bounds.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { BossFactory } from '../../src/core/boss/BossFactory';
import { DifficultyCalculator } from '../../src/systems/DifficultyCalculator';
import { EnemyType } from '../../src/types';
import { CyberDreadnought } from '../../src/core/boss/bosses/CyberDreadnought';
import { DimensionalLeviathan } from '../../src/core/boss/bosses/DimensionalLeviathan';
import { NaniteColossus } from '../../src/core/boss/bosses/NaniteColossus';
import { PsionicHarbinger } from '../../src/core/boss/bosses/PsionicHarbinger';
import { AeternumCore } from '../../src/core/boss/bosses/AeternumCore';

describe('Milestone M33: Adversarial Dynamic Scaling & Stress Test Suite', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.setCoopMode(true);
  });

  // ==========================================================================
  // Track 1: Full 50-Stage Scaling Validation & Challenging Stage Immunity
  // ==========================================================================
  describe('Track 1: Full 50-Stage Scaling Validation & Invariants', () => {
    const EXPECTED_CHALLENGING_STAGES = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47];
    const CLASSIC_NON_BONUS = [1, 2, 4, 5, 6, 8, 9, 10];
    const ELITE_NON_BONUS = [12, 13, 14, 16, 17, 18, 20, 21, 22, 24, 25];
    const DREADNOUGHT_NON_BONUS = [
      26, 28, 29, 30, 32, 33, 34, 36, 37, 38, 40, 41, 42, 44, 45, 46, 48, 49, 50,
    ];

    it('identifies exactly 12 challenging stages across 1..50 stages', () => {
      const challengingStagesFound: number[] = [];
      for (let s = 1; s <= 50; s++) {
        if (DifficultyCalculator.isChallengingStage(s)) {
          challengingStagesFound.push(s);
        }
      }
      expect(challengingStagesFound).toEqual(EXPECTED_CHALLENGING_STAGES);
      expect(challengingStagesFound.length).toBe(12);
    });

    it('iterates through Stages 1 to 50 in co-op mode validating tier HP, shields, and challenging rules', () => {
      for (let s = 1; s <= 50; s++) {
        const isChallenging = DifficultyCalculator.isChallengingStage(s);
        if (isChallenging) {
          expect(EXPECTED_CHALLENGING_STAGES).toContain(s);
          for (const t of [EnemyType.ZAKO, EnemyType.GOEI, EnemyType.BOSS, EnemyType.CAPTURED_FIGHTER]) {
            const stats = DifficultyCalculator.getEnemyHealthAndShield(s, t, true);
            expect(stats.health).toBe(1);
            expect(stats.shield).toBe(0);
          }
          expect(DifficultyCalculator.getShotsPerDive(s)).toBe(0);
        } else {
          const bossStats = DifficultyCalculator.getEnemyHealthAndShield(s, EnemyType.BOSS, true);
          if (s <= 10) {
            // Classic non-bonus stages
            expect(bossStats.health).toBe(3);
            expect(bossStats.shield).toBe(0);
          } else if (s <= 25) {
            // Elite non-bonus stages
            expect(bossStats.health).toBe(5);
            expect(bossStats.shield).toBe(0);
          } else {
            // Dreadnought non-bonus stages
            expect(bossStats.health).toBe(5);
            expect(bossStats.shield).toBe(2);
          }
        }
      }
    });

    it('strictly enforces health === 1, shield === 0, and 0 bullets for all 12 Challenging Stages in Co-op', () => {
      const allEnemyTypes = [
        EnemyType.ZAKO,
        EnemyType.GOEI,
        EnemyType.BOSS,
        EnemyType.CAPTURED_FIGHTER,
      ];

      for (const stg of EXPECTED_CHALLENGING_STAGES) {
        // Assert every enemy type has health === 1, shield === 0
        for (const type of allEnemyTypes) {
          const stats = DifficultyCalculator.getEnemyHealthAndShield(stg, type, true);
          expect(stats.health, `Stage ${stg} type ${type} health must be 1`).toBe(1);
          expect(stats.shield, `Stage ${stg} type ${type} shield must be 0`).toBe(0);
        }

        // Assert 0 shots per dive (strict invariant)
        const shots = DifficultyCalculator.getShotsPerDive(stg);
        expect(shots, `Stage ${stg} shotsPerDive must be 0`).toBe(0);

        // Assert formation background fire is disabled (Infinity)
        const formationFire = DifficultyCalculator.getFormationFireInterval(stg);
        expect(formationFire, `Stage ${stg} formationFireInterval must be Infinity`).toBe(Infinity);

        // Assert in FormationManager bullet density is strictly 1.0 (unscaled)
        game.formationManager.spawnStage(stg);
        expect(game.formationManager.isChallengingStage).toBe(true);
        expect(game.formationManager.getEffectiveBulletDensityMultiplier()).toBe(1.0);
      }
    });

    it('strictly scales Classic non-bonus stages (1, 2, 4, 5, 6, 8, 9, 10) to Boss Galaga HP == 3 in Co-op', () => {
      for (const stg of CLASSIC_NON_BONUS) {
        const stats = DifficultyCalculator.getEnemyHealthAndShield(stg, EnemyType.BOSS, true);
        expect(stats.health, `Classic stage ${stg} Boss Galaga HP must be 3`).toBe(3);
        expect(stats.shield, `Classic stage ${stg} Boss Galaga shield must be 0`).toBe(0);

        // Single player verification: baseline must remain 2 HP
        const spStats = DifficultyCalculator.getEnemyHealthAndShield(stg, EnemyType.BOSS, false);
        expect(spStats.health, `Classic stage ${stg} SP Boss Galaga HP must be 2`).toBe(2);
        expect(spStats.shield).toBe(0);

        // Regular enemies in classic stages
        const zakoStats = DifficultyCalculator.getEnemyHealthAndShield(stg, EnemyType.ZAKO, true);
        expect(zakoStats.health).toBe(1);
        expect(zakoStats.shield).toBe(0);
      }
    });

    it('strictly scales Elite non-bonus stages (12..25) to Boss Galaga HP == 5 and shield == 0 in Co-op', () => {
      for (const stg of ELITE_NON_BONUS) {
        const stats = DifficultyCalculator.getEnemyHealthAndShield(stg, EnemyType.BOSS, true);
        expect(stats.health, `Elite stage ${stg} Boss Galaga HP must be 5`).toBe(5);
        expect(stats.shield, `Elite stage ${stg} Boss Galaga shield must be 0`).toBe(0);

        // Single player verification: baseline must remain 3 HP
        const spStats = DifficultyCalculator.getEnemyHealthAndShield(stg, EnemyType.BOSS, false);
        expect(spStats.health, `Elite stage ${stg} SP Boss Galaga HP must be 3`).toBe(3);
        expect(spStats.shield).toBe(0);

        // Regular enemies in elite stages
        const zakoStats = DifficultyCalculator.getEnemyHealthAndShield(stg, EnemyType.ZAKO, true);
        expect(zakoStats.health).toBe(2);
        expect(zakoStats.shield).toBe(0);
      }
    });

    it('strictly scales Dreadnought non-bonus stages (26..50) to Boss Galaga HP == 5 and shield == 2 in Co-op', () => {
      for (const stg of DREADNOUGHT_NON_BONUS) {
        const stats = DifficultyCalculator.getEnemyHealthAndShield(stg, EnemyType.BOSS, true);
        expect(stats.health, `Dreadnought stage ${stg} Boss Galaga HP must be 5`).toBe(5);
        expect(stats.shield, `Dreadnought stage ${stg} Boss Galaga shield must be 2`).toBe(2);

        // Single player verification: baseline must remain 3 HP, 2 shield
        const spStats = DifficultyCalculator.getEnemyHealthAndShield(stg, EnemyType.BOSS, false);
        expect(spStats.health, `Dreadnought stage ${stg} SP Boss Galaga HP must be 3`).toBe(3);
        expect(spStats.shield).toBe(2);

        // Regular enemies in dreadnought stages
        const zakoStats = DifficultyCalculator.getEnemyHealthAndShield(stg, EnemyType.ZAKO, true);
        expect(zakoStats.health).toBe(2);
        expect(zakoStats.shield).toBe(1);
      }
    });

    it('gracefully handles boundary and out-of-range stage numbers clamping within [1, 50]', () => {
      const boundaryStages = [-10, 0, 0.5, 1, 50, 51, 100];
      for (const stg of boundaryStages) {
        expect(() => DifficultyCalculator.getEnemyHealthAndShield(stg, EnemyType.BOSS, true)).not.toThrow();
        const res = DifficultyCalculator.getEnemyHealthAndShield(stg, EnemyType.BOSS, true);
        expect(Number.isFinite(res.health)).toBe(true);
        expect(res.health).toBeGreaterThanOrEqual(1);
        expect(Number.isFinite(res.shield)).toBe(true);
        expect(res.shield).toBeGreaterThanOrEqual(0);

        const config = DifficultyCalculator.getStageConfig(stg);
        expect(Number.isFinite(config.diveSpeedMultiplier)).toBe(true);
        expect(Number.isFinite(config.diveInterval)).toBe(true);
        expect(Number.isFinite(config.maxConcurrentDivers)).toBe(true);
        expect(Number.isFinite(config.enemyBulletSpeed)).toBe(true);
      }

      // Non-finite hits in getChallengingStageBonus
      expect(DifficultyCalculator.getChallengingStageBonus(NaN)).toBe(0);
      expect(DifficultyCalculator.getChallengingStageBonus(Infinity)).toBe(0);
      expect(DifficultyCalculator.getChallengingStageBonus(-Infinity)).toBe(0);
    });
  });

  // ==========================================================================
  // Track 2: Stage Bosses Scaling & Phase Invariance Under Co-op
  // ==========================================================================
  describe('Track 2: Stage Bosses Scaling & Phase Invariance Under Co-op', () => {
    it('verifies exact co-op scaled maxHealth across all 5 Stage Bosses', () => {
      // Stage 10: Cyber Dreadnought (80 * 1.6 = 128 HP)
      const b10 = BossFactory.createBoss(10, game) as CyberDreadnought;
      expect(b10).not.toBeNull();
      expect(b10.maxHealth).toBe(128);
      expect(b10.health).toBe(128);

      // Stage 20: Dimensional Leviathan (120 * 1.6 = 192 HP)
      const b20 = BossFactory.createBoss(20, game) as DimensionalLeviathan;
      expect(b20).not.toBeNull();
      expect(b20.maxHealth).toBe(192);
      expect(b20.health).toBe(192);

      // Stage 30: Nanite Colossus (150 * 1.6 = 240 HP)
      const b30 = BossFactory.createBoss(30, game) as NaniteColossus;
      expect(b30).not.toBeNull();
      expect(b30.maxHealth).toBe(240);
      expect(b30.health).toBe(240);

      // Stage 40: Psionic Harbinger (180 * 1.6 = 288 HP)
      const b40 = BossFactory.createBoss(40, game) as PsionicHarbinger;
      expect(b40).not.toBeNull();
      expect(b40.maxHealth).toBe(288);
      expect(b40.health).toBe(288);

      // Stage 50: Aeternum Core (300 * 1.6 = 480 HP)
      const b50 = BossFactory.createBoss(50, game) as AeternumCore;
      expect(b50).not.toBeNull();
      expect(b50.maxHealth).toBe(480);
      expect(b50.health).toBe(480);
    });

    it('Stage 10 (Cyber Dreadnought): simulates core exposure at exactly <= 64 HP in Co-op', () => {
      const boss = BossFactory.createBoss(10, game) as CyberDreadnought;
      expect(boss.maxHealth).toBe(128);

      // Advance through INTRO
      boss.update(2.1, 112, 250);
      expect(boss.phase).toBe('PHASE_1');

      // Turrets protect core while active
      expect(boss.isProtectedBySubUnits()).toBe(true);
      const blockedDmg = boss.takeDamage(10);
      expect(blockedDmg.shieldAbsorbed).toBe(true);
      expect(boss.health).toBe(128);

      // Destroy turrets to expose core
      boss.turretLeft.active = false;
      boss.turretRight.active = false;
      expect(boss.isProtectedBySubUnits()).toBe(false);

      // Damage core down to 65 HP: phase must remain PHASE_1
      boss.takeDamage(128 - 65);
      expect(boss.health).toBe(65);
      expect(boss.phase).toBe('PHASE_1');

      // Inflict 1 point of damage to reach 64 HP (exactly 50% of 128)
      boss.takeDamage(1);
      expect(boss.health).toBe(64);
      expect(boss.phase).toBe('TRANSITION_1_2');
      expect(boss.invulnerableTimer).toBeGreaterThan(0);

      // Advance time through transition duration
      boss.update(boss.invulnerableTimer + 0.1, 112, 250);
      expect(boss.phase).toBe('PHASE_2');

      // Defeat boss
      boss.takeDamage(64);
      expect(boss.health).toBe(0);
      expect(boss.phase).toBe('DEFEATED');
    });

    it('Stage 20 (Dimensional Leviathan): simulates Phase 2 transition at exactly <= 96 HP in Co-op', () => {
      const boss = BossFactory.createBoss(20, game) as DimensionalLeviathan;
      expect(boss.maxHealth).toBe(192);

      // Advance through INTRO
      boss.update(2.1, 112, 250);
      expect(boss.phase).toBe('PHASE_1');

      // Damage down to 97 HP (above 50% threshold)
      boss.takeDamage(192 - 97);
      expect(boss.health).toBe(97);
      expect(boss.phase).toBe('PHASE_1');

      // Damage down to 96 HP (exactly 50% of 192)
      boss.takeDamage(1);
      expect(boss.health).toBe(96);
      expect(boss.phase).toBe('TRANSITION_1_2');

      // Advance through transition
      boss.update(boss.invulnerableTimer + 0.1, 112, 250);
      expect(boss.phase).toBe('PHASE_2');

      // Defeat boss
      boss.takeDamage(96);
      expect(boss.health).toBe(0);
      expect(boss.phase).toBe('DEFEATED');
    });

    it('Stage 30 (Nanite Colossus): simulates split mechanic at exactly <= 120 HP in Co-op', () => {
      const boss = BossFactory.createBoss(30, game) as NaniteColossus;
      expect(boss.maxHealth).toBe(240);

      // Advance through INTRO
      boss.update(2.1, 112, 250);
      expect(boss.phase).toBe('PHASE_1');

      // Damage down to 121 HP: isSplit must be false
      boss.takeDamage(240 - 121);
      expect(boss.health).toBe(121);
      expect(boss.isSplit).toBe(false);
      expect(boss.phase).toBe('PHASE_1');

      // Damage to 120 HP (exactly 50% of 240): triggers split
      boss.takeDamage(1);
      expect(boss.health).toBe(120);
      expect(boss.isSplit).toBe(true);

      // While in split, main colossus is protected
      expect(boss.isProtectedBySubUnits()).toBe(true);
      const splitBlocked = boss.takeDamage(10);
      expect(splitBlocked.shieldAbsorbed).toBe(true);
      expect(boss.health).toBe(120);

      // Destroy all 4 mini-constructs
      for (const construct of boss.miniConstructs) {
        construct.active = false;
        boss.onSubUnitDestroyed(construct);
      }
      expect(boss.isSplit).toBe(false);
      expect(boss.phase).toBe('TRANSITION_1_2');

      // Advance through transition
      boss.update(boss.invulnerableTimer + 0.1, 112, 250);
      expect(boss.phase).toBe('PHASE_2');

      // Defeat boss
      boss.takeDamage(120);
      expect(boss.health).toBe(0);
      expect(boss.phase).toBe('DEFEATED');
    });

    it('Stage 40 (Psionic Harbinger): simulates phantom clone shatter at exactly <= 144 HP in Co-op', () => {
      const boss = BossFactory.createBoss(40, game) as PsionicHarbinger;
      expect(boss.maxHealth).toBe(288);

      // Advance through INTRO
      boss.update(2.1, 112, 250);
      expect(boss.phase).toBe('PHASE_1');
      expect(boss.phantom1.active).toBe(true);
      expect(boss.phantom2.active).toBe(true);

      // Damage to 145 HP
      boss.takeDamage(288 - 145);
      expect(boss.health).toBe(145);
      expect(boss.phase).toBe('PHASE_1');
      expect(boss.phantom1.active).toBe(true);

      // Damage to 144 HP (exactly 50% of 288)
      boss.takeDamage(1);
      expect(boss.health).toBe(144);
      expect(boss.phase).toBe('TRANSITION_1_2');
      expect(boss.phantom1.active).toBe(false);
      expect(boss.phantom2.active).toBe(false);

      // Advance through transition
      boss.update(boss.invulnerableTimer + 0.1, 112, 250);
      expect(boss.phase).toBe('PHASE_2');

      // Defeat boss
      boss.takeDamage(144);
      expect(boss.health).toBe(0);
      expect(boss.phase).toBe('DEFEATED');
    });

    it('Stage 50 (Aeternum Core): simulates Phase 2 & Enrage Phase 3 at exactly <= 160 HP in Co-op', () => {
      const boss = BossFactory.createBoss(50, game) as AeternumCore;
      expect(boss.maxHealth).toBe(480);

      // Advance through INTRO
      boss.update(2.1, 112, 250);
      expect(boss.phase).toBe('PHASE_1');

      // Satellites shield the core in Phase 1
      expect(boss.isProtectedBySubUnits()).toBe(true);
      const blocked = boss.takeDamage(50);
      expect(blocked.shieldAbsorbed).toBe(true);
      expect(boss.health).toBe(480);

      // Destroy all 4 satellites to trigger Phase 2
      for (const sat of boss.satellites) {
        sat.active = false;
        boss.onSubUnitDestroyed(sat);
      }
      expect(boss.isProtectedBySubUnits()).toBe(false);
      expect(boss.phase).toBe('TRANSITION_1_2');

      // Advance through transition to PHASE_2
      boss.update(boss.invulnerableTimer + 0.1, 112, 250);
      expect(boss.phase).toBe('PHASE_2');

      // In Phase 2: Enrage triggers at <= ceil(maxHealth / 3) = ceil(480 / 3) = 160 HP
      boss.takeDamage(480 - 161);
      expect(boss.health).toBe(161);
      expect(boss.phase).toBe('PHASE_2');

      // 1 more damage to reach 160 HP
      boss.takeDamage(1);
      expect(boss.health).toBe(160);
      expect(boss.phase).toBe('TRANSITION_2_3');

      // Advance through transition to PHASE_3
      boss.update(boss.invulnerableTimer + 0.1, 112, 250);
      expect(boss.phase).toBe('PHASE_3');

      // Defeat boss
      boss.takeDamage(160);
      expect(boss.health).toBe(0);
      expect(boss.phase).toBe('DEFEATED');
    });
  });

  // ==========================================================================
  // Track 3: Multiplicative DDA Composition Under Stress
  // ==========================================================================
  describe('Track 3: Multiplicative DDA Composition Under Stress', () => {
    const STAGE_BOSSES = [
      { stage: 10, baseHp: 80 },
      { stage: 20, baseHp: 120 },
      { stage: 30, baseHp: 150 },
      { stage: 40, baseHp: 180 },
      { stage: 50, baseHp: 300 },
    ];

    it('verifies extreme DDA skill ratings: sigma=0.0 (0.90x), sigma=0.5 (1.00x), sigma=1.0 (1.25x) produce total HP in [1.44, 2.00] * baseHp', () => {
      const ddaManager = game.dynamicDifficultyManager!;
      expect(ddaManager).not.toBeNull();

      // Test extreme rating sigma = 0.0 (Easy / Struggling)
      ddaManager.setProficiencyOverride(0.0);
      expect(ddaManager.getBossHealthMultiplier()).toBeCloseTo(0.90, 3);
      for (const { stage, baseHp } of STAGE_BOSSES) {
        const boss = BossFactory.createBoss(stage, game)!;
        expect(boss).not.toBeNull();
        const expectedHp = Math.round(baseHp * (1.60 * 0.90)); // 1.44x
        expect(boss.maxHealth).toBe(expectedHp);
        expect(boss.maxHealth).toBeGreaterThanOrEqual(Math.floor(1.44 * baseHp));
        expect(boss.maxHealth).toBeLessThanOrEqual(Math.ceil(2.00 * baseHp));
        expect(boss.health).toBe(boss.maxHealth);
      }

      // Test neutral rating sigma = 0.5 (Neutral Baseline)
      ddaManager.setProficiencyOverride(0.5);
      expect(ddaManager.getBossHealthMultiplier()).toBeCloseTo(1.00, 3);
      for (const { stage, baseHp } of STAGE_BOSSES) {
        const boss = BossFactory.createBoss(stage, game)!;
        expect(boss).not.toBeNull();
        const expectedHp = Math.round(baseHp * 1.60); // 1.60x
        expect(boss.maxHealth).toBe(expectedHp);
        expect(boss.maxHealth).toBeGreaterThanOrEqual(Math.floor(1.44 * baseHp));
        expect(boss.maxHealth).toBeLessThanOrEqual(Math.ceil(2.00 * baseHp));
      }

      // Test expert rating sigma = 1.0 (Master / Dominating)
      ddaManager.setProficiencyOverride(1.0);
      expect(ddaManager.getBossHealthMultiplier()).toBeCloseTo(1.25, 3);
      for (const { stage, baseHp } of STAGE_BOSSES) {
        const boss = BossFactory.createBoss(stage, game)!;
        expect(boss).not.toBeNull();
        const expectedHp = Math.round(baseHp * (1.60 * 1.25)); // 2.00x
        expect(boss.maxHealth).toBe(expectedHp);
        expect(boss.maxHealth).toBe(baseHp * 2); // Exact 2.00x
        expect(boss.maxHealth).toBeGreaterThanOrEqual(Math.floor(1.44 * baseHp));
        expect(boss.maxHealth).toBeLessThanOrEqual(Math.ceil(2.00 * baseHp));
      }
    });

    it('sweeps continuous DDA skill ratings sigma in [0.0, 1.0] ensuring monotonicity and no NaN or zero', () => {
      const ddaManager = game.dynamicDifficultyManager!;

      for (const { stage, baseHp } of STAGE_BOSSES) {
        let previousHp = 0;
        for (let sigma = 0.0; sigma <= 1.001; sigma += 0.05) {
          ddaManager.setProficiencyOverride(sigma);
          const boss = BossFactory.createBoss(stage, game)!;

          expect(Number.isFinite(boss.maxHealth)).toBe(true);
          expect(Number.isInteger(boss.maxHealth)).toBe(true);
          expect(boss.maxHealth).toBeGreaterThan(0);
          expect(boss.health).toBe(boss.maxHealth);

          // Invariant: HP stays within [1.44, 2.00] * baseHp
          expect(boss.maxHealth).toBeGreaterThanOrEqual(Math.floor(1.44 * baseHp));
          expect(boss.maxHealth).toBeLessThanOrEqual(Math.ceil(2.00 * baseHp));

          // Monotonicity: Higher skill rating never decreases boss HP
          expect(boss.maxHealth).toBeGreaterThanOrEqual(previousHp);
          previousHp = boss.maxHealth;
        }
      }
    });

    it('robustly clamps adversarial and malformed DDA ratings without NaN or crash', () => {
      const ddaManager = game.dynamicDifficultyManager!;
      const adversarialSigmas = [-10.0, -0.5, 1.5, 99.0, NaN, Infinity, -Infinity];

      for (const sig of adversarialSigmas) {
        ddaManager.setProficiencyOverride(sig);
        const mult = ddaManager.getBossHealthMultiplier();
        expect(Number.isFinite(mult)).toBe(true);
        expect(mult).toBeGreaterThanOrEqual(0.90);
        expect(mult).toBeLessThanOrEqual(1.25);

        for (const { stage, baseHp } of STAGE_BOSSES) {
          const boss = BossFactory.createBoss(stage, game)!;
          expect(Number.isFinite(boss.maxHealth)).toBe(true);
          expect(boss.maxHealth).toBeGreaterThanOrEqual(Math.floor(1.44 * baseHp));
          expect(boss.maxHealth).toBeLessThanOrEqual(Math.ceil(2.00 * baseHp));
        }
      }
    });
  });

  // ==========================================================================
  // Track 4: Wave Divers & Density Bounds
  // ==========================================================================
  describe('Track 4: Wave Divers & Density Bounds', () => {
    it('verifies DifficultyCalculator.getCoopMaxConcurrentDivers caps strictly at 8', () => {
      // Test base diver values
      expect(DifficultyCalculator.getCoopMaxConcurrentDivers(1)).toBe(1); // round(1.25) = 1
      expect(DifficultyCalculator.getCoopMaxConcurrentDivers(2)).toBe(3); // round(2.50) = 3
      expect(DifficultyCalculator.getCoopMaxConcurrentDivers(3)).toBe(4); // round(3.75) = 4
      expect(DifficultyCalculator.getCoopMaxConcurrentDivers(4)).toBe(5); // round(5.00) = 5
      expect(DifficultyCalculator.getCoopMaxConcurrentDivers(5)).toBe(6); // round(6.25) = 6
      expect(DifficultyCalculator.getCoopMaxConcurrentDivers(6)).toBe(8); // round(7.50) = 8 (capped at 8)
      expect(DifficultyCalculator.getCoopMaxConcurrentDivers(7)).toBe(8); // min(8, 9) = 8
      expect(DifficultyCalculator.getCoopMaxConcurrentDivers(10)).toBe(8); // min(8, 13) = 8
      expect(DifficultyCalculator.getCoopMaxConcurrentDivers(100)).toBe(8); // min(8, 125) = 8
    });

    it('verifies FormationManager maxConcurrentDivers is capped at 8 across all 50 stages in Co-op', () => {
      for (let stg = 1; stg <= 50; stg++) {
        game.formationManager.spawnStage(stg);
        const divers = game.formationManager.maxConcurrentDivers;

        expect(Number.isInteger(divers)).toBe(true);
        expect(divers).toBeGreaterThanOrEqual(1);
        expect(divers, `Stage ${stg} maxConcurrentDivers must not exceed 8`).toBeLessThanOrEqual(8);

        // High stages (40..50) must reach the cap of 8
        if (stg >= 40 && !DifficultyCalculator.isChallengingStage(stg) && !DifficultyCalculator.isBossStage(stg)) {
          expect(divers, `Stage ${stg} maxConcurrentDivers should be 8`).toBe(8);
        }
      }
    });

    it('verifies bullet density multiplier scales by 1.25x in Co-op but locks to 1.0 in Challenging Stages', () => {
      // Non-challenging normal stage
      game.formationManager.spawnStage(1);
      game.setCoopMode(true);
      const coopMult = game.formationManager.getEffectiveBulletDensityMultiplier();
      game.setCoopMode(false);
      const spMult = game.formationManager.getEffectiveBulletDensityMultiplier();
      expect(coopMult / spMult).toBeCloseTo(1.25, 2);

      // Challenging stages (3, 7, 11, etc.)
      const challengingStages = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47];
      for (const stg of challengingStages) {
        game.formationManager.spawnStage(stg);
        game.setCoopMode(true);
        expect(game.formationManager.getEffectiveBulletDensityMultiplier()).toBe(1.0);
        game.setCoopMode(false);
        expect(game.formationManager.getEffectiveBulletDensityMultiplier()).toBe(1.0);
      }
    });

    it('verifies bullet density composition under extreme DDA remains bounded and positive', () => {
      game.formationManager.spawnStage(2); // Normal stage
      game.setCoopMode(true);

      // Under minimum DDA (sigma = 0.0 -> bulletMult = 0.80)
      game.dynamicDifficultyManager.setProficiencyOverride(0.0);
      const minMult = game.formationManager.getEffectiveBulletDensityMultiplier();
      expect(minMult).toBeCloseTo(1.25 * 0.80, 2); // 1.00

      // Under maximum DDA (sigma = 1.0 -> bulletMult = 1.40)
      game.dynamicDifficultyManager.setProficiencyOverride(1.0);
      const maxMult = game.formationManager.getEffectiveBulletDensityMultiplier();
      expect(maxMult).toBeCloseTo(1.25 * 1.40, 2); // 1.75

      expect(minMult).toBeGreaterThanOrEqual(0.80);
      expect(maxMult).toBeLessThanOrEqual(2.00);
    });
  });
});
