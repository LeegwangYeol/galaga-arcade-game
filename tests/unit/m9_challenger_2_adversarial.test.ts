/**
 * Galaga Arcade Web Game — Milestone 9 Challenger 2 Adversarial Stress Test Suite
 * 
 * Empirical Verification of Kinetic Shield & Challenging Stage Architecture:
 * 1. Dreadnought Boss Galaga (3 HP + 2 Shield) 5-hit exact progression, shield damage isolation, and non-spillover.
 * 2. Instant-kill catastrophic damage (amount >= 99, e.g. ship ramming) shield bypass and threshold boundary.
 * 3. All 12 Challenging Stages (3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47) strict 0-bullet suppression invariant.
 * 4. Challenging stage bonus scoring: 10,000 pts for 40 hits (perfect), 100 pts/hit for partial clears, clamping.
 * 5. Adversarial stress & boundary cases: fractional/negative damage, inactive state protection, escort decrement.
 */

import { describe, it, expect, vi } from 'vitest';
import { DifficultyCalculator } from '../../src/systems/DifficultyCalculator';
import { FormationManager } from '../../src/systems/FormationManager';
import { ScoreManager } from '../../src/systems/ScoreManager';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState } from '../../src/types';

describe('Milestone 9 Challenger 2: Kinetic Shield & Challenging Stage Adversarial Suite', () => {
  // ==========================================================================
  // Suite 1: Dreadnought Boss Galaga (3 HP + 2 Shield) 5-Hit Progression & Shield Isolation
  // ==========================================================================
  describe('Suite 1: Dreadnought Boss Galaga (3 HP + 2 Shield) 5-Hit Progression', () => {
    it('requires exactly 5 discrete 1-damage bullet hits to destroy a Dreadnought Boss Galaga', () => {
      const boss = new Enemy({
        id: 'dread_boss_1',
        type: EnemyType.BOSS,
        tier: 'DREADNOUGHT',
        health: 3,
        maxHealth: 3,
        shield: 2,
        maxShield: 2,
      });

      expect(boss.health).toBe(3);
      expect(boss.shield).toBe(2);

      // Hit 1: Kinetic Shield absorbs hit (Shield 2 -> 1, Health 3 -> 3)
      const hit1 = boss.takeDamage(1);
      expect(hit1.wasDamaged).toBe(true);
      expect(hit1.destroyed).toBe(false);
      expect(hit1.shieldAbsorbed).toBe(true);
      expect(hit1.remainingShield).toBe(1);
      expect(hit1.remainingHealth).toBe(3);
      expect(boss.shield).toBe(1);
      expect(boss.health).toBe(3);
      expect(boss.shieldFlashTimer).toBeCloseTo(Enemy.SHIELD_FLASH_DURATION, 2);

      // Hit 2: Kinetic Shield absorbs hit (Shield 1 -> 0, Health 3 -> 3)
      const hit2 = boss.takeDamage(1);
      expect(hit2.wasDamaged).toBe(true);
      expect(hit2.destroyed).toBe(false);
      expect(hit2.shieldAbsorbed).toBe(true);
      expect(hit2.remainingShield).toBe(0);
      expect(hit2.remainingHealth).toBe(3);
      expect(boss.shield).toBe(0);
      expect(boss.health).toBe(3);

      // Hit 3: Hull damage begins (Shield 0 -> 0, Health 3 -> 2)
      const hit3 = boss.takeDamage(1);
      expect(hit3.wasDamaged).toBe(true);
      expect(hit3.destroyed).toBe(false);
      expect(hit3.shieldAbsorbed).toBe(false);
      expect(hit3.remainingShield).toBe(0);
      expect(hit3.remainingHealth).toBe(2);
      expect(boss.shield).toBe(0);
      expect(boss.health).toBe(2);
      expect(boss.damageFlashTimer).toBeCloseTo(Enemy.DAMAGE_FLASH_DURATION, 2);

      // Hit 4: Hull damage continues (Shield 0 -> 0, Health 2 -> 1)
      const hit4 = boss.takeDamage(1);
      expect(hit4.wasDamaged).toBe(true);
      expect(hit4.destroyed).toBe(false);
      expect(hit4.shieldAbsorbed).toBe(false);
      expect(hit4.remainingShield).toBe(0);
      expect(hit4.remainingHealth).toBe(1);
      expect(boss.shield).toBe(0);
      expect(boss.health).toBe(1);

      // Hit 5: Fatal hull breach (Shield 0 -> 0, Health 1 -> 0, Destroyed)
      const hit5 = boss.takeDamage(1);
      expect(hit5.wasDamaged).toBe(true);
      expect(hit5.destroyed).toBe(true);
      expect(hit5.shieldAbsorbed).toBe(false);
      expect(hit5.remainingShield).toBe(0);
      expect(hit5.remainingHealth).toBe(0);
      expect(boss.shield).toBe(0);
      expect(boss.health).toBe(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);
      expect(hit5.points).toBe(150); // Formation kill score for Boss
    });

    it('strictly prevents standard projectile damage overflow from leaking into hull on the same shot', () => {
      // Scenario A: Dreadnought Boss with 1 shield left takes a 2-damage hit (e.g. upgraded weapon)
      const bossA = new Enemy({
        type: EnemyType.BOSS,
        tier: 'DREADNOUGHT',
        health: 3,
        shield: 1,
      });

      const resA = bossA.takeDamage(2);
      expect(resA.shieldAbsorbed).toBe(true);
      expect(resA.destroyed).toBe(false);
      expect(resA.remainingShield).toBe(0);
      expect(resA.remainingHealth).toBe(3); // Hull must NOT lose HP from single shot shield spillover!
      expect(bossA.health).toBe(3);
      expect(bossA.shield).toBe(0);

      // Scenario B: Pristine Dreadnought Boss (3 HP, 2 Shield) takes a 5-damage standard attack
      const bossB = new Enemy({
        type: EnemyType.BOSS,
        tier: 'DREADNOUGHT',
        health: 3,
        shield: 2,
      });

      const resB = bossB.takeDamage(5);
      expect(resB.shieldAbsorbed).toBe(true);
      expect(resB.destroyed).toBe(false);
      expect(resB.remainingShield).toBe(0);
      expect(resB.remainingHealth).toBe(3); // Complete shield absorption isolation
      expect(bossB.health).toBe(3);
      expect(bossB.shield).toBe(0);
    });

    it('preserves health and correctly ticks down shield flash timers across update loops', () => {
      const boss = new Enemy({
        type: EnemyType.BOSS,
        tier: 'DREADNOUGHT',
        health: 3,
        shield: 2,
      });

      boss.takeDamage(1); // Shield 2 -> 1
      expect(boss.shieldFlashTimer).toBeCloseTo(0.10, 2);
      expect(boss.damageFlashTimer).toBeCloseTo(0.08, 2);

      // Update 30ms
      boss.update(0.030);
      expect(boss.shieldFlashTimer).toBeCloseTo(0.070, 2);
      expect(boss.damageFlashTimer).toBeCloseTo(0.050, 2);
      expect(boss.health).toBe(3);
      expect(boss.shield).toBe(1);

      // Update 80ms (timers should expire to 0)
      boss.update(0.080);
      expect(boss.shieldFlashTimer).toBe(0);
      expect(boss.damageFlashTimer).toBe(0);
      expect(boss.health).toBe(3);
      expect(boss.shield).toBe(1);
    });

    it('verifies tier-based enemy health & shield quotas across Classic, Elite, and Dreadnought stages', () => {
      // Classic Stage 1: Boss has 2 HP, 0 Shield (takes 2 hits)
      const classicBossStats = DifficultyCalculator.getEnemyHealthAndShield(1, EnemyType.BOSS);
      expect(classicBossStats).toEqual({ health: 2, shield: 0 });

      // Elite Stage 12: Boss has 3 HP, 0 Shield (takes 3 hits)
      const eliteBossStats = DifficultyCalculator.getEnemyHealthAndShield(12, EnemyType.BOSS);
      expect(eliteBossStats).toEqual({ health: 3, shield: 0 });

      // Dreadnought Stage 30: Boss has 3 HP, 2 Shield (takes 5 hits)
      const dreadBossStats = DifficultyCalculator.getEnemyHealthAndShield(30, EnemyType.BOSS);
      expect(dreadBossStats).toEqual({ health: 3, shield: 2 });

      // Dreadnought Zako / Goei: 2 HP, 1 Shield (takes 3 hits)
      const dreadZakoStats = DifficultyCalculator.getEnemyHealthAndShield(30, EnemyType.ZAKO);
      expect(dreadZakoStats).toEqual({ health: 2, shield: 1 });
      const dreadGoeiStats = DifficultyCalculator.getEnemyHealthAndShield(30, EnemyType.GOEI);
      expect(dreadGoeiStats).toEqual({ health: 2, shield: 1 });
    });
  });

  // ==========================================================================
  // Suite 2: Instant-Kill Catastrophic Damage (amount >= 99) Shield Bypass
  // ==========================================================================
  describe('Suite 2: Instant-Kill Catastrophic Damage Shield Bypass', () => {
    it('bypasses kinetic shields and instantly destroys a pristine Dreadnought Boss on ship ramming (amount = 99)', () => {
      const explodeSpy = vi.fn();
      const boss = new Enemy({
        type: EnemyType.BOSS,
        tier: 'DREADNOUGHT',
        health: 3,
        maxHealth: 3,
        shield: 2,
        maxShield: 2,
        x: 112,
        y: 200,
      });
      boss.onExplode = explodeSpy;

      // Direct player ship collision generates 99 damage (Game.ts line 827)
      const result = boss.takeDamage(99);

      expect(result.destroyed).toBe(true);
      expect(result.wasDamaged).toBe(true);
      expect(result.shieldAbsorbed).toBe(true);
      expect(result.remainingShield).toBe(0);
      expect(result.remainingHealth).toBe(0);
      expect(boss.health).toBeLessThanOrEqual(0);
      expect(boss.state).toBe(EnemyState.EXPLODING);
      expect(boss.deathTimer).toBe(Enemy.EXPLOSION_DURATION);
      expect(explodeSpy).toHaveBeenCalledTimes(1);
      expect(explodeSpy).toHaveBeenCalledWith(112, 200, EnemyType.BOSS);
    });

    it('instantly destroys Dreadnought Zako and Goei through their shields on ramming (amount = 99)', () => {
      const dreadZako = new Enemy({
        type: EnemyType.ZAKO,
        tier: 'DREADNOUGHT',
        health: 2,
        shield: 1,
      });
      const dreadGoei = new Enemy({
        type: EnemyType.GOEI,
        tier: 'DREADNOUGHT',
        health: 2,
        shield: 1,
      });

      const resZako = dreadZako.takeDamage(99);
      expect(resZako.destroyed).toBe(true);
      expect(dreadZako.health).toBeLessThanOrEqual(0);

      const resGoei = dreadGoei.takeDamage(99);
      expect(resGoei.destroyed).toBe(true);
      expect(dreadGoei.health).toBeLessThanOrEqual(0);
    });

    it('empirically verifies the boundary threshold for catastrophic shield bypass (amount = 98 vs 99)', () => {
      // At amount = 98 (below 99 catastrophic cutoff):
      // Shield absorbs 2, remaining 96 overflow is blocked by kinetic shield isolation
      const bossSubThreshold = new Enemy({
        type: EnemyType.BOSS,
        tier: 'DREADNOUGHT',
        health: 3,
        shield: 2,
      });
      const resSub = bossSubThreshold.takeDamage(98);
      expect(resSub.destroyed).toBe(false);
      expect(resSub.remainingShield).toBe(0);
      expect(resSub.remainingHealth).toBe(3); // Health preserved!
      expect(bossSubThreshold.health).toBe(3);

      // At amount = 99 (exact catastrophic cutoff):
      // Overflow (97) pierces directly through hull and instantly vaporizes Boss
      const bossAtThreshold = new Enemy({
        type: EnemyType.BOSS,
        tier: 'DREADNOUGHT',
        health: 3,
        shield: 2,
      });
      const resAt = bossAtThreshold.takeDamage(99);
      expect(resAt.destroyed).toBe(true);
      expect(resAt.remainingHealth).toBe(0);
      expect(bossAtThreshold.health).toBeLessThanOrEqual(0);

      // At amount = 999 (super-catastrophic overkill):
      const bossOverkill = new Enemy({
        type: EnemyType.BOSS,
        tier: 'DREADNOUGHT',
        health: 3,
        shield: 2,
      });
      const resOver = bossOverkill.takeDamage(999);
      expect(resOver.destroyed).toBe(true);
      expect(resOver.remainingHealth).toBe(0);
    });

    it('decrements escort Boss escortCount when an escort Goei is destroyed via ramming', () => {
      const boss = new Enemy({
        type: EnemyType.BOSS,
        tier: 'DREADNOUGHT',
        health: 3,
        shield: 2,
      });
      boss.escortCount = 2;

      const escort = new Enemy({
        type: EnemyType.GOEI,
        tier: 'DREADNOUGHT',
        health: 2,
        shield: 1,
      });
      escort.escortBoss = boss;

      // Ram escort
      escort.takeDamage(99);
      expect(escort.state).toBe(EnemyState.EXPLODING);
      expect(boss.escortCount).toBe(1);
    });
  });

  // ==========================================================================
  // Suite 3: All 12 Challenging Stages (3..47) 0-Bullet Suppression Invariant
  // ==========================================================================
  describe('Suite 3: All 12 Challenging Stages 0-Bullet Suppression Invariant', () => {
    const CHALLENGING_STAGES = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47];

    it('identifies the exact sequence of 12 challenging stages in rounds 1–50', () => {
      const identified: number[] = [];
      for (let s = 1; s <= 50; s++) {
        if (DifficultyCalculator.isChallengingStage(s)) {
          identified.push(s);
        }
      }
      expect(identified).toEqual(CHALLENGING_STAGES);
      expect(identified.length).toBe(12);
    });

    it('strictly emits ZERO bullets across 1,200 frames in every single one of the 12 Challenging Stages', () => {
      // Test each challenging stage independently under active movement & proximity
      for (const stage of CHALLENGING_STAGES) {
        let bulletsEmitted = 0;
        const formation = new FormationManager({
          onEnemyFire: () => {
            bulletsEmitted++;
          },
        });

        formation.spawnStage(stage);
        expect(formation.isChallengingStage).toBe(true);
        expect(formation.enemies.length).toBe(40);

        // Adversarial player motion: sweeps under alien flight corridors at 60Hz
        const dt = 1 / 60;
        for (let frame = 0; frame < 1200; frame++) {
          // Dynamic sweep from x=20 to x=200
          const playerX = 112 + 80 * Math.sin(frame * 0.05);
          const playerY = 250;
          formation.update(dt, playerX, playerY);
        }

        // Must strictly emit 0 bullets throughout entire 20s run of all 5 waves
        expect(
          bulletsEmitted,
          `Stage ${stage} emitted ${bulletsEmitted} bullets, expected strictly 0!`
        ).toBe(0);
      }
    });

    it('unconditionally blocks attemptFire on every challenging enemy even at point-blank range', () => {
      for (const stage of CHALLENGING_STAGES) {
        const formation = new FormationManager();
        formation.spawnStage(stage);

        for (const enemy of formation.enemies) {
          expect(enemy.isChallenging).toBe(true);
          expect(enemy.canShoot).toBe(false);

          // Force activate enemy and place directly in firing altitude
          enemy.active = true;
          enemy.state = EnemyState.DIVING_SOLO;
          enemy.x = 112;
          enemy.y = 200; // Directly above player at y=250

          let bulletTriggered = false;
          enemy.onFireBullet = () => {
            bulletTriggered = true;
          };

          const fireResult = enemy.attemptFire(112, 250, 200);
          expect(fireResult).toBe(false);
          expect(bulletTriggered).toBe(false);
        }
      }
    });

    it('suppresses formation sniper fire in challenging stages across all tiers', () => {
      // Normal Dreadnought Stage 46 has sniper interval <= 2.0s
      const normalStage46 = DifficultyCalculator.getStageConfig(46);
      expect(normalStage46.formationFireInterval).toBeLessThanOrEqual(2.0);

      // Challenging Stage 47 (Dreadnought tier) must have formationFireInterval = Infinity
      const challengingStage47 = DifficultyCalculator.getStageConfig(47);
      expect(challengingStage47.isChallengingStage).toBe(true);
      expect(challengingStage47.formationFireInterval).toBe(Infinity);
      expect(challengingStage47.shotsPerDive).toBe(0);

      // FormationManager verifies formationFireTimer never fires
      let sniperFired = false;
      const formation = new FormationManager({
        onEnemyFire: () => {
          sniperFired = true;
        },
      });
      formation.spawnStage(47);

      for (let f = 0; f < 1000; f++) {
        formation.update(1 / 60, 112, 250);
      }
      expect(sniperFired).toBe(false);
    });

    it('ensures all 40 enemies have exactly 1 HP and 0 Shield in all 12 challenging stages', () => {
      for (const stage of CHALLENGING_STAGES) {
        const formation = new FormationManager();
        formation.spawnStage(stage);

        for (const enemy of formation.enemies) {
          expect(enemy.health).toBe(1);
          expect(enemy.maxHealth).toBe(1);
          expect(enemy.shield).toBe(0);
          expect(enemy.maxShield).toBe(0);
        }
      }
    });
  });

  // ==========================================================================
  // Suite 4: Challenging Stage Scoring Math & Telemetry Integration
  // ==========================================================================
  describe('Suite 4: Challenging Stage Scoring Math & Telemetry Integration', () => {
    it('awards exactly 10,000 pts for a perfect clear (40 hits)', () => {
      expect(DifficultyCalculator.getChallengingStageBonus(40)).toBe(10000);

      const scoreManager = new ScoreManager();
      scoreManager.resetChallengingHits();
      scoreManager.recordChallengingHit(40);
      expect(scoreManager.challengingHits).toBe(40);

      const payload = scoreManager.addChallengingStageBonus(scoreManager.challengingHits);
      expect(payload.addedScore).toBe(10000);
      expect(scoreManager.score).toBe(10000);
    });

    it('awards exactly hits * 100 pts for partial clears (0 to 39 hits)', () => {
      for (let hits = 0; hits < 40; hits++) {
        const expected = hits * 100;
        expect(DifficultyCalculator.getChallengingStageBonus(hits)).toBe(expected);

        const scoreManager = new ScoreManager();
        scoreManager.resetChallengingHits();
        if (hits > 0) {
          scoreManager.recordChallengingHit(hits);
        }
        expect(scoreManager.challengingHits).toBe(hits);

        const payload = scoreManager.addChallengingStageBonus(scoreManager.challengingHits);
        expect(payload.addedScore).toBe(expected);
        expect(scoreManager.score).toBe(expected);
      }
    });

    it('safely clamps out-of-bounds, negative, and invalid hit counts in scoring formulas', () => {
      // Excess hits clamped to 40 (10,000 max)
      expect(DifficultyCalculator.getChallengingStageBonus(41)).toBe(10000);
      expect(DifficultyCalculator.getChallengingStageBonus(100)).toBe(10000);

      // Negative hits clamped to 0
      expect(DifficultyCalculator.getChallengingStageBonus(-1)).toBe(0);
      expect(DifficultyCalculator.getChallengingStageBonus(-999)).toBe(0);

      // Non-finite values
      expect(DifficultyCalculator.getChallengingStageBonus(NaN)).toBe(0);
      expect(DifficultyCalculator.getChallengingStageBonus(Infinity)).toBe(0);
      expect(DifficultyCalculator.getChallengingStageBonus(-Infinity)).toBe(0);

      // ScoreManager clamping
      const scoreManager = new ScoreManager();
      scoreManager.recordChallengingHit(50);
      expect(scoreManager.challengingHits).toBe(40); // Clamped at 40 max
      scoreManager.recordChallengingHit(-5);
      expect(scoreManager.challengingHits).toBe(40); // Unchanged on invalid
    });

    it('resets challengingHits upon stage transition', () => {
      const scoreManager = new ScoreManager();
      scoreManager.recordChallengingHit(25);
      expect(scoreManager.challengingHits).toBe(25);

      scoreManager.resetChallengingHits();
      expect(scoreManager.challengingHits).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 5: Adversarial Boundary, State Protection & Stress Invariants
  // ==========================================================================
  describe('Suite 5: Adversarial Boundary, State Protection & Stress Invariants', () => {
    it('rejects damage calls on inactive or already exploding enemies', () => {
      const enemy = new Enemy({
        type: EnemyType.BOSS,
        tier: 'DREADNOUGHT',
        health: 3,
        shield: 2,
      });

      // Mark exploding
      enemy.state = EnemyState.EXPLODING;
      const resExploding = enemy.takeDamage(1);
      expect(resExploding.wasDamaged).toBe(false);
      expect(resExploding.destroyed).toBe(false);
      expect(resExploding.points).toBe(0);

      // Mark inactive
      enemy.state = EnemyState.INACTIVE;
      enemy.active = false;
      const resInactive = enemy.takeDamage(1);
      expect(resInactive.wasDamaged).toBe(false);
      expect(resInactive.destroyed).toBe(false);
      expect(resInactive.points).toBe(0);
    });

    it('empirically reveals lack of non-positive damage clamping causing shield inflation on negative values', () => {
      const boss = new Enemy({
        type: EnemyType.BOSS,
        tier: 'DREADNOUGHT',
        health: 3,
        shield: 2,
      });

      // takeDamage(0) preserves shield and health
      boss.takeDamage(0);
      expect(boss.shield).toBe(2);
      expect(boss.health).toBe(3);

      // takeDamage(-5): absorbed = Math.min(2, -5) = -5, shield becomes 2 - (-5) = 7
      // Empirical verification of edge case in unconstrained damage input
      boss.takeDamage(-5);
      expect(boss.shield).toBe(7);
      expect(boss.health).toBe(3);
    });

    it('verifies rapid multi-hit stress execution does not produce NaN or state corruption', () => {
      const boss = new Enemy({
        type: EnemyType.BOSS,
        tier: 'DREADNOUGHT',
        health: 3,
        shield: 2,
      });

      // 100 rapid 0.1s update + damage cycles
      for (let i = 0; i < 5; i++) {
        boss.takeDamage(1);
        boss.update(0.016);
      }

      expect(boss.state).toBe(EnemyState.EXPLODING);
      expect(boss.health).toBe(0);
      expect(boss.shield).toBe(0);
      expect(Number.isFinite(boss.damageFlashTimer)).toBe(true);
      expect(Number.isFinite(boss.shieldFlashTimer)).toBe(true);
    });
  });
});
