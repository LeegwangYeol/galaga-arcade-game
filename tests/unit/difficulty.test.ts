/**
 * Galaga Arcade Web Game — Milestone 9 Difficulty Scaling & Stage Progression Test Suite
 *
 * Verifies:
 * 1. DifficultyCalculator mathematical progression curves across stages 1–50
 * 2. 12 Challenging Stages schedule and 0-bullet suppression invariant
 * 3. 5 Acrobatic wave trajectories, offscreen deactivation, and stage clear trigger
 * 4. Enemy defense pipeline (health, kinetic shield absorption, and overflow resistance)
 * 5. HUD stage badge greedy decomposition, dedicated BADGE_20_MATRIX, and screen clearance
 * 6. SpriteRenderer procedural color remapping, flash matrices, and shield aura rendering
 */

import { describe, it, expect, vi } from 'vitest';
import { DifficultyCalculator } from '../../src/systems/DifficultyCalculator';
import { FormationManager } from '../../src/systems/FormationManager';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState } from '../../src/types';
import {
  HUD,
  BadgeType,
  BADGE_20_MATRIX,
  BADGE_30_MATRIX,
} from '../../src/ui/HUD';
import {
  SpriteRenderer,
  remapMatrixColors,
  createFlashMatrix,
} from '../../src/renderer/SpriteRenderer';

describe('Milestone 9: Scaling Engine & Stage Progression Suite', () => {
  // ==========================================================================
  // Suite 1: Difficulty Calculator Mathematical Progression (Stages 1–50)
  // ==========================================================================
  describe('Suite 1: DifficultyCalculator Mathematical Progression (Stages 1–50)', () => {
    it('partitions stages 1–50 into CLASSIC, ELITE, and DREADNOUGHT tiers', () => {
      // Classic: 1..10
      for (let s = 1; s <= 10; s++) {
        expect(DifficultyCalculator.getStageTier(s)).toBe('CLASSIC');
      }
      // Elite: 11..25
      for (let s = 11; s <= 25; s++) {
        expect(DifficultyCalculator.getStageTier(s)).toBe('ELITE');
      }
      // Dreadnought: 26..50
      for (let s = 26; s <= 50; s++) {
        expect(DifficultyCalculator.getStageTier(s)).toBe('DREADNOUGHT');
      }
    });

    it('exhibits monotonic sub-linear dive speed multiplier growth bounded in [1.000, 1.800]', () => {
      let prevSpeed = 0;
      for (let s = 1; s <= 50; s++) {
        const speed = DifficultyCalculator.getDiveSpeedMultiplier(s);
        expect(speed).toBeGreaterThanOrEqual(1.0);
        expect(speed).toBeLessThanOrEqual(1.8);
        expect(speed).toBeGreaterThanOrEqual(prevSpeed);
        prevSpeed = speed;
      }
      expect(DifficultyCalculator.getDiveSpeedMultiplier(1)).toBe(1.0);
      expect(DifficultyCalculator.getDiveSpeedMultiplier(50)).toBeCloseTo(1.8, 2);
    });

    it('exhibits monotonic exponential decay of dive intervals bounded in [0.80s, 3.50s]', () => {
      let prevInterval = Infinity;
      for (let s = 1; s <= 50; s++) {
        const interval = DifficultyCalculator.getDiveInterval(s);
        expect(interval).toBeGreaterThanOrEqual(0.8);
        expect(interval).toBeLessThanOrEqual(3.5);
        expect(interval).toBeLessThanOrEqual(prevInterval);
        prevInterval = interval;
      }
      expect(DifficultyCalculator.getDiveInterval(1)).toBeCloseTo(3.5, 2);
      expect(DifficultyCalculator.getDiveInterval(50)).toBeCloseTo(0.8, 2);
    });

    it('monotonically steps concurrent divers from 1 to 6', () => {
      let prevQuota = 0;
      for (let s = 1; s <= 50; s++) {
        const divers = DifficultyCalculator.getMaxConcurrentDivers(s);
        expect(divers).toBeGreaterThanOrEqual(1);
        expect(divers).toBeLessThanOrEqual(6);
        expect(divers).toBeGreaterThanOrEqual(prevQuota);
        prevQuota = divers;
      }
      expect(DifficultyCalculator.getMaxConcurrentDivers(1)).toBe(1);
      expect(DifficultyCalculator.getMaxConcurrentDivers(50)).toBe(6);
    });

    it('clamps enemy bullet speed within [180, 320] px/s', () => {
      let prevBullet = 0;
      for (let s = 1; s <= 50; s++) {
        const bSpeed = DifficultyCalculator.getEnemyBulletSpeed(s);
        expect(bSpeed).toBeGreaterThanOrEqual(180);
        expect(bSpeed).toBeLessThanOrEqual(320);
        expect(bSpeed).toBeGreaterThanOrEqual(prevBullet);
        prevBullet = bSpeed;
      }
      expect(DifficultyCalculator.getEnemyBulletSpeed(1)).toBe(180);
      expect(DifficultyCalculator.getEnemyBulletSpeed(50)).toBe(320);
    });

    it('scales enemy health and kinetic shield according to tier and type', () => {
      // Classic (Stage 5)
      expect(DifficultyCalculator.getEnemyHealthAndShield(5, EnemyType.ZAKO)).toEqual({ health: 1, shield: 0 });
      expect(DifficultyCalculator.getEnemyHealthAndShield(5, EnemyType.GOEI)).toEqual({ health: 1, shield: 0 });
      expect(DifficultyCalculator.getEnemyHealthAndShield(5, EnemyType.BOSS)).toEqual({ health: 2, shield: 0 });

      // Elite (Stage 18)
      expect(DifficultyCalculator.getEnemyHealthAndShield(18, EnemyType.ZAKO)).toEqual({ health: 2, shield: 0 });
      expect(DifficultyCalculator.getEnemyHealthAndShield(18, EnemyType.GOEI)).toEqual({ health: 2, shield: 0 });
      expect(DifficultyCalculator.getEnemyHealthAndShield(18, EnemyType.BOSS)).toEqual({ health: 3, shield: 0 });

      // Dreadnought (Stage 36)
      expect(DifficultyCalculator.getEnemyHealthAndShield(36, EnemyType.ZAKO)).toEqual({ health: 2, shield: 1 });
      expect(DifficultyCalculator.getEnemyHealthAndShield(36, EnemyType.GOEI)).toEqual({ health: 2, shield: 1 });
      expect(DifficultyCalculator.getEnemyHealthAndShield(36, EnemyType.BOSS)).toEqual({ health: 3, shield: 2 });
    });

    it('preserves 1 HP and 0 shield for all enemies in Challenging Stages regardless of tier', () => {
      for (const cs of [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47]) {
        expect(DifficultyCalculator.getEnemyHealthAndShield(cs, EnemyType.ZAKO)).toEqual({ health: 1, shield: 0 });
        expect(DifficultyCalculator.getEnemyHealthAndShield(cs, EnemyType.GOEI)).toEqual({ health: 1, shield: 0 });
        expect(DifficultyCalculator.getEnemyHealthAndShield(cs, EnemyType.BOSS)).toEqual({ health: 1, shield: 0 });
      }
    });

    it('governs dive shot quotas and background formation sniper intervals', () => {
      // Challenging: 0 shots, Infinity interval
      expect(DifficultyCalculator.getShotsPerDive(3)).toBe(0);
      expect(DifficultyCalculator.getFormationFireInterval(3)).toBe(Infinity);

      // Classic: 1 shot, Infinity interval
      expect(DifficultyCalculator.getShotsPerDive(1)).toBe(1);
      expect(DifficultyCalculator.getFormationFireInterval(1)).toBe(Infinity);

      // Elite: 2 shots, 4.0s - 2.5s interval
      expect(DifficultyCalculator.getShotsPerDive(14)).toBe(2);
      expect(DifficultyCalculator.getFormationFireInterval(14)).toBeLessThanOrEqual(4.0);
      expect(DifficultyCalculator.getFormationFireInterval(14)).toBeGreaterThanOrEqual(2.0);

      // Dreadnought: 3 shots, 2.8s - 1.5s interval
      expect(DifficultyCalculator.getShotsPerDive(30)).toBe(3);
      expect(DifficultyCalculator.getFormationFireInterval(30)).toBeLessThanOrEqual(3.0);
      expect(DifficultyCalculator.getFormationFireInterval(30)).toBeGreaterThanOrEqual(1.5);
      expect(DifficultyCalculator.getFormationFireInterval(50)).toBe(1.5);
    });

    it('calculates authentic challenging stage hit bonus scoring', () => {
      // Perfect 40 hits = 10,000 pts
      expect(DifficultyCalculator.getChallengingStageBonus(40)).toBe(10000);

      // Partial hits = hits * 100
      expect(DifficultyCalculator.getChallengingStageBonus(0)).toBe(0);
      expect(DifficultyCalculator.getChallengingStageBonus(1)).toBe(100);
      expect(DifficultyCalculator.getChallengingStageBonus(25)).toBe(2500);
      expect(DifficultyCalculator.getChallengingStageBonus(39)).toBe(3900);

      // Clamping bounds
      expect(DifficultyCalculator.getChallengingStageBonus(-5)).toBe(0);
      expect(DifficultyCalculator.getChallengingStageBonus(45)).toBe(10000);
      expect(DifficultyCalculator.getChallengingStageBonus(NaN)).toBe(0);
    });

    it('returns complete stage configuration object matching snapshot expectations', () => {
      const config1 = DifficultyCalculator.getStageConfig(1);
      expect(config1.stage).toBe(1);
      expect(config1.tier).toBe('CLASSIC');
      expect(config1.isChallengingStage).toBe(false);
      expect(config1.diveSpeedMultiplier).toBe(1.0);
      expect(config1.diveInterval).toBe(3.5);
      expect(config1.maxConcurrentDivers).toBe(1);

      const config27 = DifficultyCalculator.getStageConfig(27);
      expect(config27.stage).toBe(27);
      expect(config27.tier).toBe('DREADNOUGHT');
      expect(config27.isChallengingStage).toBe(true);
      expect(config27.shotsPerDive).toBe(0);
      expect(config27.formationFireInterval).toBe(Infinity);
    });
  });

  // ==========================================================================
  // Suite 2: Challenging Stage Ingress Schedule & Bullet Suppression Invariant
  // ==========================================================================
  describe('Suite 2: Challenging Stage Schedule & Bullet Suppression Invariant', () => {
    it('identifies exactly 12 challenging stages in rounds 1–50', () => {
      const challengingStages: number[] = [];
      for (let s = 1; s <= 50; s++) {
        if (DifficultyCalculator.isChallengingStage(s)) {
          challengingStages.push(s);
        }
      }

      expect(challengingStages).toEqual([
        3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47
      ]);
      expect(challengingStages.length).toBe(12);
    });

    it('remains periodic for stages > 50', () => {
      expect(DifficultyCalculator.isChallengingStage(51)).toBe(true);
      expect(DifficultyCalculator.isChallengingStage(55)).toBe(true);
      expect(DifficultyCalculator.isChallengingStage(99)).toBe(true);
      expect(DifficultyCalculator.isChallengingStage(52)).toBe(false);
    });

    it('discharges ZERO bullets across all 40 enemies in a challenging stage', () => {
      let bulletsFired = 0;
      const formation = new FormationManager({
        onEnemyFire: () => {
          bulletsFired++;
        },
      });

      // Spawn Challenging Stage 3
      formation.spawnStage(3);

      // Simulate 15 seconds of gameplay (900 frames at 60Hz)
      const dt = 1 / 60;
      for (let f = 0; f < 900; f++) {
        formation.update(dt, 112, 250);
      }

      // Invariant: 0 enemy bullets permitted
      expect(bulletsFired).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 3: Acrobatic Wave Formation & Offscreen Despawn Lifecycle
  // ==========================================================================
  describe('Suite 3: Acrobatic Wave Formation & Offscreen Despawn Lifecycle', () => {
    it('spawns exactly 5 waves of 8 enemies (40 enemies total)', () => {
      const formation = new FormationManager();
      formation.spawnStage(3);

      // Advance through all 5 sub-waves (2.2s * 5 = 11s)
      for (let i = 0; i < 700; i++) {
        formation.update(1 / 60, 112, 250);
      }

      // Check total enemies populated
      expect(formation.enemies.length).toBe(40);
    });

    it('sets enemy health=1 and shield=0 for all challenging ships regardless of stage tier', () => {
      const formation = new FormationManager();
      // Test across Classic (3), Elite (15), and Dreadnought (35)
      for (const cs of [3, 15, 35]) {
        formation.spawnStage(cs);
        for (const e of formation.enemies) {
          expect(e.maxHealth).toBe(1);
          expect(e.health).toBe(1);
          expect(e.shield).toBe(0);
        }
      }
    });

    it('deactivates challenging enemies when their acrobatic paths complete offscreen', () => {
      const formation = new FormationManager();
      formation.spawnStage(3);

      // Run 20 seconds of gameplay (1200 ticks at 60Hz)
      for (let i = 0; i < 1200; i++) {
        formation.update(1 / 60, 112, 250);
      }

      // After 20s, all acrobatic paths must have finished and exited offscreen
      const living = formation.getLivingCount();
      expect(living).toBe(0);
    });

    it('triggers onStageClear when all 40 enemies are resolved', () => {
      const clearSpy = vi.fn();
      const formation = new FormationManager({ onStageClear: clearSpy });
      formation.spawnStage(3);

      // Force-complete all waves and deactivate all enemies
      formation.currentSubWave = 5;
      for (const e of formation.enemies) {
        e.active = false;
        e.state = EnemyState.INACTIVE;
      }

      formation.update(1 / 60, 112, 250);
      expect(clearSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Suite 4: Enemy Defense Pipeline & Kinetic Shield Absorption
  // ==========================================================================
  describe('Suite 4: Enemy Defense Pipeline & Kinetic Shield Absorption', () => {
    it('absorbs damage in kinetic shield first and prevents health loss', () => {
      const enemy = new Enemy({
        type: EnemyType.GOEI,
        tier: 'DREADNOUGHT',
        health: 2,
        maxHealth: 2,
        shield: 1,
        maxShield: 1,
      });

      // First hit: absorbed by shield
      const res1 = enemy.takeDamage(1);
      expect(res1.wasDamaged).toBe(true);
      expect(res1.destroyed).toBe(false);
      expect(res1.shieldAbsorbed).toBe(true);
      expect(res1.remainingShield).toBe(0);
      expect(res1.remainingHealth).toBe(2);
      expect(enemy.shield).toBe(0);
      expect(enemy.health).toBe(2);
      expect(enemy.shieldFlashTimer).toBeGreaterThan(0);

      // Second hit: damages health (2 -> 1)
      const res2 = enemy.takeDamage(1);
      expect(res2.wasDamaged).toBe(true);
      expect(res2.destroyed).toBe(false);
      expect(res2.shieldAbsorbed).toBe(false);
      expect(res2.remainingHealth).toBe(1);
      expect(enemy.health).toBe(1);
      expect(enemy.damageFlashTimer).toBeGreaterThan(0);

      // Third hit: destroys enemy (1 -> 0)
      const res3 = enemy.takeDamage(1);
      expect(res3.destroyed).toBe(true);
      expect(enemy.health).toBe(0);
    });

    it('absorbs projectile damage in kinetic shield without spilling over to health', () => {
      const enemy = new Enemy({
        type: EnemyType.BOSS,
        tier: 'DREADNOUGHT',
        health: 3,
        maxHealth: 3,
        shield: 1,
        maxShield: 1,
      });

      // Hit with 2 damage on 1 shield
      const res = enemy.takeDamage(2);
      expect(res.shieldAbsorbed).toBe(true);
      expect(res.remainingShield).toBe(0);
      expect(res.remainingHealth).toBe(3); // Overflow does NOT damage hull on same shot
      expect(enemy.health).toBe(3);
    });

    it('requires 5 discrete hits to destroy a Dreadnought Boss Galaga (3 HP + 2 Shield)', () => {
      const boss = new Enemy({
        type: EnemyType.BOSS,
        tier: 'DREADNOUGHT',
        health: 3,
        maxHealth: 3,
        shield: 2,
        maxShield: 2,
      });

      // Hit 1: Shield 2 -> 1
      expect(boss.takeDamage(1).remainingShield).toBe(1);
      expect(boss.health).toBe(3);

      // Hit 2: Shield 1 -> 0
      expect(boss.takeDamage(1).remainingShield).toBe(0);
      expect(boss.health).toBe(3);

      // Hit 3: Health 3 -> 2
      expect(boss.takeDamage(1).remainingHealth).toBe(2);

      // Hit 4: Health 2 -> 1
      expect(boss.takeDamage(1).remainingHealth).toBe(1);

      // Hit 5: Health 1 -> 0 (Destroyed)
      const finalHit = boss.takeDamage(1);
      expect(finalHit.destroyed).toBe(true);
      expect(boss.health).toBe(0);
    });

    it('ticks down both damageFlashTimer and shieldFlashTimer during update', () => {
      const enemy = new Enemy({
        type: EnemyType.ZAKO,
        health: 2,
        shield: 1,
      });

      enemy.takeDamage(1); // Shield absorbed
      expect(enemy.shieldFlashTimer).toBeCloseTo(Enemy.SHIELD_FLASH_DURATION, 2);

      enemy.update(0.04);
      expect(enemy.shieldFlashTimer).toBeCloseTo(0.06, 2);

      enemy.update(0.07);
      expect(enemy.shieldFlashTimer).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 5: HUD Stage Badge Layout Proofs (Stages 1–50)
  // ==========================================================================
  describe('Suite 5: HUD Stage Badge Layout Proofs (Stages 1–50)', () => {
    const BADGE_VALUES: Record<BadgeType, number> = {
      [BadgeType.FLAG_50]: 50,
      [BadgeType.FLAG_30]: 30,
      [BadgeType.FLAG_20]: 20,
      [BadgeType.FLAG_10]: 10,
      [BadgeType.FLAG_5]: 5,
      [BadgeType.FLAG_1]: 1,
    };

    it('mathematically decomposes all stages 1–50 correctly with greedy denominations', () => {
      for (let s = 1; s <= 50; s++) {
        const decomp = HUD.decomposeStage(s);
        const sum = decomp.badges.reduce((acc, b) => acc + BADGE_VALUES[b], 0);
        expect(sum).toBe(s);
      }
    });

    it('features dedicated 8x12 BADGE_20_MATRIX distinct from BADGE_30_MATRIX', () => {
      expect(BADGE_20_MATRIX).not.toBe(BADGE_30_MATRIX);
      expect(BADGE_20_MATRIX.length).toBe(12);
      expect(BADGE_20_MATRIX[0]!.length).toBe(8);

      // Verifies dual-stripe pattern: Col 2 and 4 are White, Col 3 is Red
      for (let row = 0; row < 6; row++) {
        expect(BADGE_20_MATRIX[row]![0]).toBe('Y'); // Yellow flag pole
        expect(BADGE_20_MATRIX[row]![1]).toBe('R'); // Red boundary
        expect(BADGE_20_MATRIX[row]![2]).toBe('W'); // White stripe 1
        expect(BADGE_20_MATRIX[row]![3]).toBe('R'); // Red center
        expect(BADGE_20_MATRIX[row]![4]).toBe('W'); // White stripe 2
        expect(BADGE_20_MATRIX[row]![5]).toBe('R'); // Red trailing
      }

      // Lower pole rows (6..11)
      for (let row = 6; row < 12; row++) {
        expect(BADGE_20_MATRIX[row]![0]).toBe('Y');
        expect(BADGE_20_MATRIX[row]![1]).toBe('.');
      }
    });

    it('proves badge total width <= 48px and screen clearance >= 87px for all stages 1–50', () => {
      let maxBadges = 0;
      let worstStage = 0;

      for (let s = 1; s <= 50; s++) {
        const decomp = HUD.decomposeStage(s);
        const badgeCount = decomp.totalBadges;
        if (badgeCount > maxBadges) {
          maxBadges = badgeCount;
          worstStage = s;
        }

        // Width calculation
        expect(decomp.totalWidth).toBeLessThanOrEqual(48);

        // Clearance calculation: right origin is x=216
        const leftmostX = 216 - decomp.totalWidth;
        // Reserve lives barrier is x=81 (or clamped safety x=96)
        const clearanceToLives = leftmostX - 81;
        expect(clearanceToLives).toBeGreaterThanOrEqual(87);
      }

      // Worst case is Stage 49: 1x30, 1x10, 1x5, 4x1 = 7 badges
      expect(worstStage).toBe(49);
      expect(maxBadges).toBe(7);
    });
  });

  // ==========================================================================
  // Suite 6: SpriteRenderer Procedural Transforms & Shield Aura
  // ==========================================================================
  describe('Suite 6: SpriteRenderer Procedural Transforms & Shield Aura', () => {
    it('remaps pixel codes correctly using remapMatrixColors', () => {
      const input = [
        ['R', 'G', '.'],
        ['B', 'Y', 'R'],
      ];
      const result = remapMatrixColors(input, { R: 'C', G: 'O' });
      expect(result).toEqual([
        ['C', 'O', '.'],
        ['B', 'Y', 'C'],
      ]);
    });

    it('creates solid white flash matrix with createFlashMatrix', () => {
      const input = [
        ['R', 'G', '.'],
        ['.', 'Y', 'R'],
      ];
      const result = createFlashMatrix(input, 'W');
      expect(result).toEqual([
        ['W', 'W', '.'],
        ['.', 'W', 'W'],
      ]);
    });

    it('pre-bakes procedural Elite and Flash matrices into SpriteRenderer', () => {
      SpriteRenderer.initialize();

      expect(SpriteRenderer.hasDefinition('ELITE_ZAKO')).toBe(true);
      expect(SpriteRenderer.hasDefinition('ELITE_GOEI')).toBe(true);
      expect(SpriteRenderer.hasDefinition('BOSS_ELITE')).toBe(true);
      expect(SpriteRenderer.hasDefinition('ZAKO_FLASH')).toBe(true);
      expect(SpriteRenderer.hasDefinition('GOEI_FLASH')).toBe(true);
      expect(SpriteRenderer.hasDefinition('BOSS_FLASH')).toBe(true);
    });

    it('renders drawShieldAura without crashing on mock canvas context', () => {
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillRect: vi.fn(),
        arc: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      // Single shield layer
      SpriteRenderer.drawShieldAura(mockCtx, 100, 100, 1, 0, 0.5);
      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();

      // Heavy multi-shield layer with flash strobe
      SpriteRenderer.drawShieldAura(mockCtx, 100, 100, 2, 0.08, 0.5);
      expect(mockCtx.stroke).toHaveBeenCalled();
    });

    it('drawEnemy dynamically selects Elite and Flash sprites according to health and tier', () => {
      SpriteRenderer.initialize();
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const drawSpy = vi.spyOn(SpriteRenderer, 'draw');

      // 1. Classic Zako -> 'ZAKO'
      SpriteRenderer.drawEnemy(mockCtx, EnemyType.ZAKO, 100, 100, 0, 1, 0, 1.0, 'CLASSIC');
      expect(drawSpy).toHaveBeenLastCalledWith(mockCtx, 'ZAKO', 100, 100, expect.any(Object));

      // 2. Elite Zako -> 'ELITE_ZAKO'
      SpriteRenderer.drawEnemy(mockCtx, EnemyType.ZAKO, 100, 100, 0, 2, 0, 1.0, 'ELITE');
      expect(drawSpy).toHaveBeenLastCalledWith(mockCtx, 'ELITE_ZAKO', 100, 100, expect.any(Object));

      // 3. Elite Boss Galaga (3 HP) -> 'BOSS_ELITE'
      SpriteRenderer.drawEnemy(mockCtx, EnemyType.BOSS, 100, 100, 0, 3, 0, 1.0, 'ELITE');
      expect(drawSpy).toHaveBeenLastCalledWith(mockCtx, 'BOSS_ELITE', 100, 100, expect.any(Object));

      // 4. White Flash Feedback during damageFlashTimer > 0 (unshielded)
      SpriteRenderer.drawEnemy(mockCtx, EnemyType.ZAKO, 100, 100, 0, 1, 0, 1.0, 'CLASSIC', 0, 0.08);
      expect(drawSpy).toHaveBeenLastCalledWith(mockCtx, 'ZAKO_FLASH', 100, 100, expect.any(Object));

      drawSpy.mockRestore();
    });
  });
});
