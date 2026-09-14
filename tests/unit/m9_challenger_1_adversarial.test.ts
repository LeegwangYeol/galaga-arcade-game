/**
 * Galaga Arcade Web Game — Milestone 9 Challenger 1 Adversarial Test Suite
 * Difficulty Scaling, Boundary Stress & Greedy Badge Decomposition Oracle
 *
 * Verifies:
 * 1. Monotonicity and validity of DifficultyCalculator metrics across stages 1–50:
 *    - getDiveSpeedMultiplier(s): strictly increasing, no NaN, bounded in [1.000, 1.800]
 *    - getDiveInterval(s): strictly decreasing, no NaN, bounded in [0.80, 3.50]
 *    - getMaxConcurrentDivers(s): non-decreasing integer step ladder, bounded in [1, 6]
 *    - getEnemyBulletSpeed(s): non-decreasing integer, bounded in [180, 320]
 * 2. Boundary stress and clamp invariants for extreme stages:
 *    - s = 100, 1000, 1000000 bullet speed never exceeds 320 px/s
 *    - s <= 0 lower bounds properly clamped to stage 1 values
 *    - Fractional and non-integer stage inputs safely truncated
 * 3. Greedy stage badge decomposition mathematical oracle across stages 1–50:
 *    - Exact sum equivalence: sum(badge values) === stage
 *    - HUD layout width budget: totalWidth < 120 px (empirically <= 48 px)
 *    - Screen clearance: distance from leftmost badge to reserve lives barrier (x=81) >= 87 px
 *    - Optimality: badge count matches independent dynamic programming coin-change oracle
 * 4. HUD canvas render layout simulation:
 *    - Right-to-left layout order, 2px inter-badge spacing, no overlapping or out-of-bounds draws
 * 5. Tier transitions, shot quotas, formation sniper intervals, and health/shield matrices
 */

import { describe, it, expect } from 'vitest';
import {
  DifficultyCalculator,
  type StageDifficultyConfig,
} from '../../src/systems/DifficultyCalculator';
import {
  HUD,
  BadgeType,
  type BadgeDecomposition,
} from '../../src/ui/HUD';
import { EnemyType } from '../../src/types';

describe('Milestone 9 Challenger 1: Difficulty Scaling & Boundary Stress Suite', () => {
  const BADGE_VALUES: Record<BadgeType, number> = {
    [BadgeType.FLAG_50]: 50,
    [BadgeType.FLAG_30]: 30,
    [BadgeType.FLAG_20]: 20,
    [BadgeType.FLAG_10]: 10,
    [BadgeType.FLAG_5]: 5,
    [BadgeType.FLAG_1]: 1,
  };

  // Independent DP Oracle for coin change minimum badge count
  const COIN_DENOMINATIONS = [50, 30, 20, 10, 5, 1];
  function minBadgesDP(n: number): number {
    const dp = new Array(n + 1).fill(Infinity);
    dp[0] = 0;
    for (let i = 1; i <= n; i++) {
      for (const c of COIN_DENOMINATIONS) {
        if (i >= c && dp[i - c] + 1 < dp[i]) {
          dp[i] = dp[i - c] + 1;
        }
      }
    }
    return dp[n];
  }

  // ==========================================================================
  // Suite 1: Stages 1–50 Difficulty Metric Validation & Monotonicity
  // ==========================================================================
  describe('Suite 1: Stages 1–50 Difficulty Metric Validation & Monotonicity', () => {
    it('verifies getDiveSpeedMultiplier(s) is defined, non-NaN, and strictly increasing for stages 1..50', () => {
      let prev = 0;
      for (let s = 1; s <= 50; s++) {
        const speed = DifficultyCalculator.getDiveSpeedMultiplier(s);
        expect(typeof speed).toBe('number');
        expect(Number.isFinite(speed)).toBe(true);
        expect(Number.isNaN(speed)).toBe(false);
        expect(speed).toBeGreaterThanOrEqual(1.0);
        expect(speed).toBeLessThanOrEqual(1.8);

        if (s > 1) {
          // Strict monotonicity: every stage must be strictly faster than the previous
          expect(speed).toBeGreaterThan(prev);
        }
        prev = speed;
      }

      // Exact boundary assertions
      expect(DifficultyCalculator.getDiveSpeedMultiplier(1)).toBe(1.0);
      expect(DifficultyCalculator.getDiveSpeedMultiplier(50)).toBe(1.8);
    });

    it('verifies getDiveInterval(s) is defined, non-NaN, and strictly decreasing for stages 1..50', () => {
      let prev = Infinity;
      for (let s = 1; s <= 50; s++) {
        const interval = DifficultyCalculator.getDiveInterval(s);
        expect(typeof interval).toBe('number');
        expect(Number.isFinite(interval)).toBe(true);
        expect(Number.isNaN(interval)).toBe(false);
        expect(interval).toBeGreaterThanOrEqual(0.8);
        expect(interval).toBeLessThanOrEqual(3.5);

        if (s > 1) {
          // Strict monotonicity: dive interval must strictly decay each stage
          expect(interval).toBeLessThan(prev);
        }
        prev = interval;
      }

      // Exact boundary assertions
      expect(DifficultyCalculator.getDiveInterval(1)).toBeCloseTo(3.5, 2);
      expect(DifficultyCalculator.getDiveInterval(50)).toBeCloseTo(0.8, 2);
    });

    it('verifies getMaxConcurrentDivers(s) is a non-decreasing integer in [1, 6] for stages 1..50', () => {
      let prev = 0;
      const seenValues = new Set<number>();

      for (let s = 1; s <= 50; s++) {
        const divers = DifficultyCalculator.getMaxConcurrentDivers(s);
        expect(typeof divers).toBe('number');
        expect(Number.isInteger(divers)).toBe(true);
        expect(divers).toBeGreaterThanOrEqual(1);
        expect(divers).toBeLessThanOrEqual(6);
        expect(divers).toBeGreaterThanOrEqual(prev);

        seenValues.add(divers);
        prev = divers;
      }

      // Ladder covers all integer values 1 through 6
      expect(Array.from(seenValues).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(DifficultyCalculator.getMaxConcurrentDivers(1)).toBe(1);
      expect(DifficultyCalculator.getMaxConcurrentDivers(50)).toBe(6);
    });

    it('verifies getEnemyBulletSpeed(s) is an integer in [180, 320] and non-decreasing for stages 1..50', () => {
      let prev = 0;
      for (let s = 1; s <= 50; s++) {
        const bulletSpeed = DifficultyCalculator.getEnemyBulletSpeed(s);
        expect(typeof bulletSpeed).toBe('number');
        expect(Number.isInteger(bulletSpeed)).toBe(true);
        expect(bulletSpeed).toBeGreaterThanOrEqual(180);
        expect(bulletSpeed).toBeLessThanOrEqual(320);
        expect(bulletSpeed).toBeGreaterThanOrEqual(prev);
        prev = bulletSpeed;
      }

      // Exact boundary assertions
      expect(DifficultyCalculator.getEnemyBulletSpeed(1)).toBe(180);
      expect(DifficultyCalculator.getEnemyBulletSpeed(50)).toBe(320);
    });

    it('verifies getStageConfig(s) produces a complete, coherent configuration for every stage 1..50', () => {
      for (let s = 1; s <= 50; s++) {
        const cfg: StageDifficultyConfig = DifficultyCalculator.getStageConfig(s);
        expect(cfg.stage).toBe(s);
        expect(['CLASSIC', 'ELITE', 'DREADNOUGHT']).toContain(cfg.tier);
        expect(cfg.diveSpeedMultiplier).toBe(DifficultyCalculator.getDiveSpeedMultiplier(s));
        expect(cfg.diveInterval).toBe(DifficultyCalculator.getDiveInterval(s));
        expect(cfg.maxConcurrentDivers).toBe(DifficultyCalculator.getMaxConcurrentDivers(s));
        expect(cfg.enemyBulletSpeed).toBe(DifficultyCalculator.getEnemyBulletSpeed(s));
        expect(cfg.shotsPerDive).toBe(DifficultyCalculator.getShotsPerDive(s));
        expect(cfg.formationFireInterval).toBe(DifficultyCalculator.getFormationFireInterval(s));
        expect(cfg.isChallengingStage).toBe(DifficultyCalculator.isChallengingStage(s));
      }
    });
  });

  // ==========================================================================
  // Suite 2: Extreme Stage Stress & Upper/Lower Boundary Clamping
  // ==========================================================================
  describe('Suite 2: Extreme Stage Stress & Upper/Lower Boundary Clamping', () => {
    it('strictly clamps enemy bullet speed to <= 320 px/s for extreme stages (100, 1000, 1000000)', () => {
      const extremeStages = [51, 60, 100, 255, 1000, 9999, 1000000];
      for (const s of extremeStages) {
        const bSpeed = DifficultyCalculator.getEnemyBulletSpeed(s);
        expect(bSpeed).toBe(320);
        expect(bSpeed).toBeLessThanOrEqual(320);
      }
    });

    it('strictly clamps dive speed multiplier to <= 1.800 for extreme stages', () => {
      const extremeStages = [51, 100, 1000, 1000000];
      for (const s of extremeStages) {
        const speed = DifficultyCalculator.getDiveSpeedMultiplier(s);
        expect(speed).toBe(1.8);
        expect(speed).toBeLessThanOrEqual(1.8);
      }
    });

    it('strictly clamps dive interval to >= 0.80s for extreme stages', () => {
      const extremeStages = [51, 100, 1000, 1000000];
      for (const s of extremeStages) {
        const interval = DifficultyCalculator.getDiveInterval(s);
        expect(interval).toBe(0.8);
        expect(interval).toBeGreaterThanOrEqual(0.8);
      }
    });

    it('strictly clamps max concurrent divers to <= 6 for extreme stages', () => {
      const extremeStages = [51, 100, 1000, 1000000];
      for (const s of extremeStages) {
        const divers = DifficultyCalculator.getMaxConcurrentDivers(s);
        expect(divers).toBe(6);
        expect(divers).toBeLessThanOrEqual(6);
      }
    });

    it('safely clamps lower out-of-bounds stages (<= 0) to stage 1 parameters', () => {
      const negativeStages = [0, -1, -10, -999, -Infinity];
      for (const s of negativeStages) {
        expect(DifficultyCalculator.getDiveSpeedMultiplier(s)).toBe(1.0);
        expect(DifficultyCalculator.getDiveInterval(s)).toBe(3.5);
        expect(DifficultyCalculator.getMaxConcurrentDivers(s)).toBe(1);
        expect(DifficultyCalculator.getEnemyBulletSpeed(s)).toBe(180);
      }
    });

    it('safely floors fractional stage inputs without producing NaN', () => {
      const fractionalStages = [1.2, 2.8, 14.5, 49.99];
      for (const s of fractionalStages) {
        const floored = Math.floor(s);
        expect(DifficultyCalculator.getDiveSpeedMultiplier(s)).toBe(
          DifficultyCalculator.getDiveSpeedMultiplier(floored)
        );
        expect(DifficultyCalculator.getDiveInterval(s)).toBe(
          DifficultyCalculator.getDiveInterval(floored)
        );
        expect(DifficultyCalculator.getMaxConcurrentDivers(s)).toBe(
          DifficultyCalculator.getMaxConcurrentDivers(floored)
        );
        expect(DifficultyCalculator.getEnemyBulletSpeed(s)).toBe(
          DifficultyCalculator.getEnemyBulletSpeed(floored)
        );
      }
    });
  });

  // ==========================================================================
  // Suite 3: Greedy Stage Badge Decomposition Oracle (Stages 1–50)
  // ==========================================================================
  describe('Suite 3: Greedy Stage Badge Decomposition Oracle (Stages 1–50)', () => {
    it('verifies greedy badge sum strictly equals stage number for every integer 1..50', () => {
      for (let s = 1; s <= 50; s++) {
        const decomp: BadgeDecomposition = HUD.decomposeStage(s);
        expect(decomp.stage).toBe(s);

        const calculatedSum = decomp.badges.reduce(
          (acc, b) => acc + BADGE_VALUES[b],
          0
        );
        expect(calculatedSum).toBe(s);
      }
    });

    it('verifies total badge width fits safely within the < 120 px HUD budget for all stages 1..50', () => {
      let maxWidth = 0;
      let worstStage = 0;

      for (let s = 1; s <= 50; s++) {
        const decomp = HUD.decomposeStage(s);
        expect(decomp.totalWidth).toBeLessThan(120);

        if (decomp.totalWidth > maxWidth) {
          maxWidth = decomp.totalWidth;
          worstStage = s;
        }
      }

      // Maximum width occurs at Stage 49 (48px)
      expect(worstStage).toBe(49);
      expect(maxWidth).toBe(48);
      expect(maxWidth).toBeLessThan(120);
    });

    it('verifies screen clearance between leftmost badge and reserve lives display >= 87 px', () => {
      const RIGHT_ANCHOR_X = 216; // HUD.VIRTUAL_WIDTH (224) - 8
      const LIVES_BARRIER_X = 81; // Max 5 life icons: 12 + 4 * 14 + 13 = 81

      for (let s = 1; s <= 50; s++) {
        const decomp = HUD.decomposeStage(s);
        const leftmostX = RIGHT_ANCHOR_X - decomp.totalWidth;
        const clearance = leftmostX - LIVES_BARRIER_X;

        // Strict clearance invariant: badges never collide with lives
        expect(clearance).toBeGreaterThanOrEqual(87);
        // Also ensure leftmost coordinate is far above the crowding cutoff (96px)
        expect(leftmostX).toBeGreaterThanOrEqual(168);
        expect(leftmostX).toBeGreaterThan(96);
      }
    });

    it('verifies greedy decomposition achieves minimal badge count (optimal DP oracle comparison)', () => {
      for (let s = 1; s <= 50; s++) {
        const decomp = HUD.decomposeStage(s);
        const optimalCount = minBadgesDP(s);
        expect(decomp.totalBadges).toBe(optimalCount);
      }
    });

    it('verifies badge composition milestones match authentic arcade expectations', () => {
      // Stage 1: 1x 1-flag
      expect(HUD.decomposeStage(1).badges).toEqual([BadgeType.FLAG_1]);

      // Stage 5: 1x 5-flag
      expect(HUD.decomposeStage(5).badges).toEqual([BadgeType.FLAG_5]);

      // Stage 10: 1x 10-flag
      expect(HUD.decomposeStage(10).badges).toEqual([BadgeType.FLAG_10]);

      // Stage 20: 1x 20-flag
      expect(HUD.decomposeStage(20).badges).toEqual([BadgeType.FLAG_20]);

      // Stage 30: 1x 30-flag
      expect(HUD.decomposeStage(30).badges).toEqual([BadgeType.FLAG_30]);

      // Stage 40: 1x 30-flag + 1x 10-flag
      expect(HUD.decomposeStage(40).badges).toEqual([
        BadgeType.FLAG_30,
        BadgeType.FLAG_10,
      ]);

      // Stage 49: 1x 30 + 1x 10 + 1x 5 + 4x 1 (7 badges)
      expect(HUD.decomposeStage(49).badges).toEqual([
        BadgeType.FLAG_30,
        BadgeType.FLAG_10,
        BadgeType.FLAG_5,
        BadgeType.FLAG_1,
        BadgeType.FLAG_1,
        BadgeType.FLAG_1,
        BadgeType.FLAG_1,
      ]);

      // Stage 50: 1x 50-flag
      expect(HUD.decomposeStage(50).badges).toEqual([BadgeType.FLAG_50]);
    });

    it('decomposes stages > 50 correctly without crashing', () => {
      // Stage 55: 1x 50 + 1x 5
      const d55 = HUD.decomposeStage(55);
      expect(d55.badges).toEqual([BadgeType.FLAG_50, BadgeType.FLAG_5]);
      expect(d55.badges.reduce((acc, b) => acc + BADGE_VALUES[b], 0)).toBe(55);

      // Stage 88: 1x 50 + 1x 30 + 1x 5 + 3x 1
      const d88 = HUD.decomposeStage(88);
      expect(d88.badges.reduce((acc, b) => acc + BADGE_VALUES[b], 0)).toBe(88);

      // Stage 100: 2x 50
      const d100 = HUD.decomposeStage(100);
      expect(d100.badges).toEqual([BadgeType.FLAG_50, BadgeType.FLAG_50]);
    });

    it('defaults invalid stage inputs (NaN, 0, negative) to Stage 1 decomposition', () => {
      expect(HUD.decomposeStage(NaN).badges).toEqual([BadgeType.FLAG_1]);
      expect(HUD.decomposeStage(0).badges).toEqual([BadgeType.FLAG_1]);
      expect(HUD.decomposeStage(-10).badges).toEqual([BadgeType.FLAG_1]);
    });
  });

  // ==========================================================================
  // Suite 4: HUD Canvas Stage Badge Rendering Layout Simulation
  // ==========================================================================
  describe('Suite 4: HUD Canvas Stage Badge Rendering Layout Simulation', () => {
    it('renders badges right-to-left with correct widths and 2px spacing', () => {
      const hud = new HUD();
      const drawnBadges: Array<{ badge: string; x: number; y: number }> = [];

      const mockCtx = {
        drawImage: (_img: any, x: number, y: number) => {
          drawnBadges.push({ badge: 'DRAW', x, y });
        },
      } as unknown as CanvasRenderingContext2D;

      // Render Stage 49 (worst-case: 7 badges)
      hud.renderStageBadges(mockCtx, 49);

      expect(drawnBadges.length).toBe(7);

      // Verify that badges are laid out from right to left
      for (let i = 1; i < drawnBadges.length; i++) {
        expect(drawnBadges[i]!.x).toBeLessThan(drawnBadges[i - 1]!.x);
      }

      // Verify bounds of all drawn badges
      for (const d of drawnBadges) {
        expect(d.x).toBeGreaterThanOrEqual(96); // Crowding cutoff
        expect(d.x).toBeLessThan(216); // Within virtual width
        expect(d.y).toBe(HUD.VIRTUAL_HEIGHT - 14); // 274
      }
    });

    it('renders single 50-flag badge at correct coordinate for Stage 50', () => {
      const hud = new HUD();
      const drawnBadges: Array<{ x: number; y: number }> = [];

      const mockCtx = {
        drawImage: (_img: any, x: number, y: number) => {
          drawnBadges.push({ x, y });
        },
      } as unknown as CanvasRenderingContext2D;

      hud.renderStageBadges(mockCtx, 50);

      expect(drawnBadges.length).toBe(1);
      // Right origin = 216, FLAG_50 width = 10 -> x = 206
      expect(drawnBadges[0]!.x).toBe(206);
      expect(drawnBadges[0]!.y).toBe(HUD.VIRTUAL_HEIGHT - 14);
    });
  });

  // ==========================================================================
  // Suite 5: Tier Transitions, Shot Quotas & Formation Sniper Fire
  // ==========================================================================
  describe('Suite 5: Tier Transitions, Shot Quotas & Formation Sniper Fire', () => {
    it('strictly partitions stages 1–50 into CLASSIC (1-10), ELITE (11-25), and DREADNOUGHT (26-50)', () => {
      for (let s = 1; s <= 10; s++) {
        expect(DifficultyCalculator.getStageTier(s)).toBe('CLASSIC');
      }
      for (let s = 11; s <= 25; s++) {
        expect(DifficultyCalculator.getStageTier(s)).toBe('ELITE');
      }
      for (let s = 26; s <= 50; s++) {
        expect(DifficultyCalculator.getStageTier(s)).toBe('DREADNOUGHT');
      }
      // Edge transitions
      expect(DifficultyCalculator.getStageTier(10)).toBe('CLASSIC');
      expect(DifficultyCalculator.getStageTier(11)).toBe('ELITE');
      expect(DifficultyCalculator.getStageTier(25)).toBe('ELITE');
      expect(DifficultyCalculator.getStageTier(26)).toBe('DREADNOUGHT');
      expect(DifficultyCalculator.getStageTier(100)).toBe('DREADNOUGHT');
    });

    it('strictly enforces shots per dive: Classic=1, Elite=2, Dreadnought=3, Challenging=0', () => {
      for (let s = 1; s <= 50; s++) {
        const shots = DifficultyCalculator.getShotsPerDive(s);
        if (DifficultyCalculator.isChallengingStage(s)) {
          expect(shots).toBe(0);
        } else {
          const tier = DifficultyCalculator.getStageTier(s);
          if (tier === 'CLASSIC') expect(shots).toBe(1);
          if (tier === 'ELITE') expect(shots).toBe(2);
          if (tier === 'DREADNOUGHT') expect(shots).toBe(3);
        }
      }
    });

    it('governs formation fire interval: disabled in Classic/Challenging, decays in Elite/Dreadnought', () => {
      // Classic stages: strictly Infinity
      for (let s = 1; s <= 10; s++) {
        expect(DifficultyCalculator.getFormationFireInterval(s)).toBe(Infinity);
      }

      // All 12 Challenging stages: strictly Infinity
      for (let s = 1; s <= 50; s++) {
        if (DifficultyCalculator.isChallengingStage(s)) {
          expect(DifficultyCalculator.getFormationFireInterval(s)).toBe(Infinity);
        }
      }

      // Non-challenging Elite & Dreadnought stages: decays from 4.0s down to 1.5s
      let prevInterval = Infinity;
      for (let s = 11; s <= 50; s++) {
        if (DifficultyCalculator.isChallengingStage(s)) continue;
        const interval = DifficultyCalculator.getFormationFireInterval(s);
        expect(interval).toBeGreaterThanOrEqual(1.5);
        expect(interval).toBeLessThanOrEqual(4.0);
        expect(interval).toBeLessThanOrEqual(prevInterval);
        prevInterval = interval;
      }

      expect(DifficultyCalculator.getFormationFireInterval(11)).toBe(Infinity); // Stage 11 is a Challenging Stage
      expect(DifficultyCalculator.getFormationFireInterval(12)).toBeCloseTo(4.0 - (1 / 39) * 2.5, 2);
      expect(DifficultyCalculator.getFormationFireInterval(50)).toBe(1.5);
    });

    it('verifies health and shield quotas across tiers for all enemy types', () => {
      // Classic (e.g. Stage 1)
      expect(DifficultyCalculator.getEnemyHealthAndShield(1, EnemyType.ZAKO)).toEqual({ health: 1, shield: 0 });
      expect(DifficultyCalculator.getEnemyHealthAndShield(1, EnemyType.GOEI)).toEqual({ health: 1, shield: 0 });
      expect(DifficultyCalculator.getEnemyHealthAndShield(1, EnemyType.BOSS)).toEqual({ health: 2, shield: 0 });

      // Elite (e.g. Stage 12)
      expect(DifficultyCalculator.getEnemyHealthAndShield(12, EnemyType.ZAKO)).toEqual({ health: 2, shield: 0 });
      expect(DifficultyCalculator.getEnemyHealthAndShield(12, EnemyType.GOEI)).toEqual({ health: 2, shield: 0 });
      expect(DifficultyCalculator.getEnemyHealthAndShield(12, EnemyType.BOSS)).toEqual({ health: 3, shield: 0 });
      expect(DifficultyCalculator.getEnemyHealthAndShield(12, EnemyType.CAPTURED_FIGHTER)).toEqual({ health: 1, shield: 0 });

      // Dreadnought (e.g. Stage 30)
      expect(DifficultyCalculator.getEnemyHealthAndShield(30, EnemyType.ZAKO)).toEqual({ health: 2, shield: 1 });
      expect(DifficultyCalculator.getEnemyHealthAndShield(30, EnemyType.GOEI)).toEqual({ health: 2, shield: 1 });
      expect(DifficultyCalculator.getEnemyHealthAndShield(30, EnemyType.BOSS)).toEqual({ health: 3, shield: 2 });
      expect(DifficultyCalculator.getEnemyHealthAndShield(30, EnemyType.CAPTURED_FIGHTER)).toEqual({ health: 1, shield: 0 });

      // Challenging Stage (e.g. Stage 3, 11, 27, 47): strictly 1 HP and 0 Shield
      for (const cs of [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47]) {
        expect(DifficultyCalculator.getEnemyHealthAndShield(cs, EnemyType.ZAKO)).toEqual({ health: 1, shield: 0 });
        expect(DifficultyCalculator.getEnemyHealthAndShield(cs, EnemyType.GOEI)).toEqual({ health: 1, shield: 0 });
        expect(DifficultyCalculator.getEnemyHealthAndShield(cs, EnemyType.BOSS)).toEqual({ health: 1, shield: 0 });
        expect(DifficultyCalculator.getEnemyHealthAndShield(cs, EnemyType.CAPTURED_FIGHTER)).toEqual({ health: 1, shield: 0 });
      }
    });
  });
});
