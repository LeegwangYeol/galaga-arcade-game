/**
 * Galaga Arcade Web Game — Milestone 11 Adversarial Challenger Test Suite
 * Power-Up ObjectPool & Drop Probability Challenger (m11_challenger_1)
 *
 * Empirical Adversarial Verification Dimensions:
 * 1. Pool Saturation & Zero-GC Bounded Capacity:
 *    - Spawn 40 power-ups rapidly under high-frequency load.
 *    - Assert bounded pool capacity (32 items) handles overflow gracefully.
 *    - Assert zero thrown exceptions on overflow.
 *    - Assert zero GC reallocations (pool capacity strictly clamped at 32, no memory expansion).
 *    - Overflow items must return null and active count must not exceed 32.
 * 2. Drop Probability Statistical Test (10,000 Simulated Kills per Scenario):
 *    - Strictly 0% drops on Challenging Stages (Stages 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, etc.).
 *    - Baseline regular enemies (Zako, Classic stage): 12% ± 1.5% [10.5% – 13.5%].
 *    - Diving enemies (Zako diving, Classic stage): 18% ± 2.0% [16.0% – 20.0%].
 *    - Boss Galagas (Classic stage): 30% formation, 40% diving (strictly within 30% – 40%).
 *    - Elite (+3%) and Dreadnought (+6%) tier bonuses validated.
 * 3. Kinematics, Sway Physics & Boundary Clamping:
 *    - Constant downward drift at exactly vy = 60 px/s.
 *    - Sinusoidal horizontal sway with amplitude = 12 px, frequency = 3.0 rad/s.
 *    - Strict boundary clamping within [MIN_X=10, MAX_X=214] under all origin offsets.
 *    - Reliable despawn and zero-allocation recycling at y > 288.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PowerUpManager } from '../../src/core/powerups/PowerUpManager';
import { PowerUpItem } from '../../src/core/powerups/PowerUpItem';
import { PowerUpType } from '../../src/core/powerups/types';
import { EnemyType } from '../../src/types';

describe('m11_challenger_1: Power-Up ObjectPool & Drop Probability Adversarial Suite', () => {
  let manager: PowerUpManager;

  beforeEach(() => {
    manager = new PowerUpManager();
  });

  // ==========================================================================
  // Dimension 1: Pool Saturation & Bounded Capacity (32 items)
  // ==========================================================================
  describe('Dimension 1: Pool Saturation & Bounded Zero-GC Capacity', () => {
    it('initializes with bounded pool capacity of exactly 32 pre-allocated entities', () => {
      expect(manager.getPoolSize()).toBe(32);
      expect(manager.getActiveCount()).toBe(0);
      expect(manager.getPool().getMaxSize()).toBe(32);
    });

    it('handles pool saturation gracefully: spawning 40 power-ups rapidly maintains bounded capacity 32 with zero exceptions and zero GC reallocations', () => {
      const initialCapacity = manager.getPoolSize();
      expect(initialCapacity).toBe(32);

      const spawnedItems: (PowerUpItem | null)[] = [];

      // Spawning 40 items rapidly must not throw any exceptions
      expect(() => {
        for (let i = 0; i < 40; i++) {
          const item = manager.spawnPowerUp(50 + (i % 8) * 15, 50, PowerUpType.RAPID_FIRE);
          spawnedItems.push(item);
        }
      }).not.toThrow();

      // Invariant: Pool capacity must remain strictly bounded at 32 (Zero GC reallocations)
      // Any expansion beyond 32 indicates runaway dynamic heap allocation during active gameplay.
      expect(manager.getPoolSize()).toBe(32);

      // Invariant: Exactly 32 active items leased
      expect(manager.getActiveCount()).toBe(32);

      // Invariant: First 32 requests successfully acquired leased items
      for (let i = 0; i < 32; i++) {
        expect(spawnedItems[i]).not.toBeNull();
        expect(spawnedItems[i]?.active).toBe(true);
      }

      // Invariant: Overflow requests (33 through 40) handled gracefully by returning null
      for (let i = 32; i < 40; i++) {
        expect(spawnedItems[i]).toBeNull();
      }
    });

    it('preserves zero-allocation pool recycling across 100 saturation-despawn cycles', () => {
      for (let cycle = 0; cycle < 100; cycle++) {
        // Fill pool to capacity (32 items)
        for (let i = 0; i < 32; i++) {
          const item = manager.spawnPowerUp(100, 200, PowerUpType.KINETIC_SHIELD);
          expect(item).not.toBeNull();
        }
        expect(manager.getActiveCount()).toBe(32);
        expect(manager.getPoolSize()).toBe(32);

        // Advance time to drive items past y > 288 (60 px/s * 2.0s = 120px -> y = 320 > 288)
        manager.update(2.0);

        // Assert all 32 items recycled back to pool
        expect(manager.getActiveCount()).toBe(0);
        expect(manager.getPoolSize()).toBe(32);
      }
    });
  });

  // ==========================================================================
  // Dimension 2: Drop Probability Statistical Test (10,000 Simulated Kills)
  // ==========================================================================
  describe('Dimension 2: Drop Probability Statistical Monte Carlo Verification', () => {
    it('strictly drops 0% power-ups across 10,000 simulated kills on Challenging Stages', () => {
      const challengingStages = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47];
      const TRIALS = 10_000;
      let totalDrops = 0;

      for (let i = 0; i < TRIALS; i++) {
        const stage = challengingStages[i % challengingStages.length]!;
        const enemyType = i % 3 === 0 ? EnemyType.BOSS : i % 3 === 1 ? EnemyType.GOEI : EnemyType.ZAKO;
        const isDiving = i % 2 === 0;

        const drop = manager.spawnDrop(100, 100, stage, enemyType, isDiving);
        if (drop !== null) {
          totalDrops++;
          // Clean up to prevent pool saturation from affecting test
          manager.reset();
        }
      }

      // Invariant: Strictly 0% drop rate (0 drops out of 10,000) on Challenging Stages
      expect(totalDrops).toBe(0);
    });

    it('asserts 12% ± 1.5% baseline drop rate on regular non-diving enemies across 10,000 kills (Stage 1)', () => {
      const TRIALS = 10_000;
      let drops = 0;

      // Stage 1 Classic tier, non-diving Zako: Expected drop rate = 0.12 (12%)
      const expectedRate = manager.computeDropChance(1, EnemyType.ZAKO, false);
      expect(expectedRate).toBeCloseTo(0.12, 3);

      for (let i = 0; i < TRIALS; i++) {
        const drop = manager.spawnDrop(100, 100, 1, EnemyType.ZAKO, false);
        if (drop !== null) {
          drops++;
          manager.reset(); // Release leased item to keep pool ready
        }
      }

      const measuredRate = drops / TRIALS;
      // 12% ± 1.5% -> [0.105, 0.135] (Bounds check: ~4.6 standard deviations)
      expect(measuredRate).toBeGreaterThanOrEqual(0.105);
      expect(measuredRate).toBeLessThanOrEqual(0.135);
    });

    it('asserts 18% ± 2.0% drop rate on diving enemies across 10,000 kills (Stage 1)', () => {
      const TRIALS = 10_000;
      let drops = 0;

      // Stage 1 Classic tier, diving Zako: Expected drop rate = 0.18 (18%)
      const expectedRate = manager.computeDropChance(1, EnemyType.ZAKO, true);
      expect(expectedRate).toBeCloseTo(0.18, 3);

      for (let i = 0; i < TRIALS; i++) {
        const drop = manager.spawnDrop(100, 100, 1, EnemyType.ZAKO, true);
        if (drop !== null) {
          drops++;
          manager.reset();
        }
      }

      const measuredRate = drops / TRIALS;
      // 18% ± 2.0% -> [0.160, 0.200] (Bounds check: ~5.2 standard deviations)
      expect(measuredRate).toBeGreaterThanOrEqual(0.160);
      expect(measuredRate).toBeLessThanOrEqual(0.200);
    });

    it('asserts 30%–40% drop rate on Boss Galagas across 10,000 kills (Stage 1)', () => {
      const TRIALS = 10_000;

      // 1. Formation Boss Galaga: strictly 30%
      const formationRate = manager.computeDropChance(1, EnemyType.BOSS, false);
      expect(formationRate).toBeCloseTo(0.30, 3);

      let formationDrops = 0;
      for (let i = 0; i < TRIALS; i++) {
        const drop = manager.spawnDrop(100, 100, 1, EnemyType.BOSS, false);
        if (drop !== null) {
          formationDrops++;
          manager.reset();
        }
      }
      const measuredFormationRate = formationDrops / TRIALS;
      expect(measuredFormationRate).toBeGreaterThanOrEqual(0.28);
      expect(measuredFormationRate).toBeLessThanOrEqual(0.32);

      // 2. Diving Boss Galaga: strictly 40%
      const divingRate = manager.computeDropChance(1, EnemyType.BOSS, true);
      expect(divingRate).toBeCloseTo(0.40, 3);

      let divingDrops = 0;
      for (let i = 0; i < TRIALS; i++) {
        const drop = manager.spawnDrop(100, 100, 1, EnemyType.BOSS, true);
        if (drop !== null) {
          divingDrops++;
          manager.reset();
        }
      }
      const measuredDivingRate = divingDrops / TRIALS;
      expect(measuredDivingRate).toBeGreaterThanOrEqual(0.38);
      expect(measuredDivingRate).toBeLessThanOrEqual(0.42);

      // Overall: Both formation and diving rates remain bounded within [30%, 40%]
      expect(measuredFormationRate).toBeGreaterThanOrEqual(0.28);
      expect(measuredDivingRate).toBeLessThanOrEqual(0.42);
    });

    it('verifies tier scaling bonuses: +3% in Elite tier (Stages 11–25) and +6% in Dreadnought tier (Stages 26–50)', () => {
      // Classic (Stage 1): 0.12
      expect(manager.computeDropChance(1, EnemyType.ZAKO, false)).toBeCloseTo(0.12, 3);
      // Elite (Stage 12, non-challenging): 0.12 + 0.03 = 0.15
      expect(manager.computeDropChance(12, EnemyType.ZAKO, false)).toBeCloseTo(0.15, 3);
      // Dreadnought (Stage 26): 0.12 + 0.06 = 0.18
      expect(manager.computeDropChance(26, EnemyType.ZAKO, false)).toBeCloseTo(0.18, 3);

      // Boss diving in Dreadnought: 0.40 + 0.06 = 0.46
      expect(manager.computeDropChance(26, EnemyType.BOSS, true)).toBeCloseTo(0.46, 3);
    });

    it('validates weighted loot distribution conforms to defined ratios', () => {
      const lootCounts: Record<PowerUpType, number> = {
        [PowerUpType.RAPID_FIRE]: 0,
        [PowerUpType.KINETIC_SHIELD]: 0,
        [PowerUpType.SCATTER_SHOT]: 0,
        [PowerUpType.EMP_BOMB]: 0,
        [PowerUpType.ENGINE_BOOSTER]: 0,
        [PowerUpType.CHRONO_FIELD]: 0,
        [PowerUpType.REFLECTION_SHIELD]: 0,
        [PowerUpType.EMP_COLLECTOR]: 0,
        [PowerUpType.PHASE_DRIVE]: 0,
        [PowerUpType.ANTIMATTER_PLASMA]: 0,
      };

      const TRIALS = 50_000;
      for (let i = 0; i < TRIALS; i++) {
        const type = manager.rollLootType(EnemyType.ZAKO);
        lootCounts[type]++;
      }

      // Weights: RAPID_FIRE: 30, KINETIC_SHIELD: 25, SCATTER_SHOT: 20, ENGINE_BOOSTER: 15, EMP_BOMB: 10
      // Total weight = 100
      expect(lootCounts[PowerUpType.RAPID_FIRE] / TRIALS).toBeCloseTo(0.30, 1);
      expect(lootCounts[PowerUpType.KINETIC_SHIELD] / TRIALS).toBeCloseTo(0.25, 1);
      expect(lootCounts[PowerUpType.SCATTER_SHOT] / TRIALS).toBeCloseTo(0.20, 1);
      expect(lootCounts[PowerUpType.ENGINE_BOOSTER] / TRIALS).toBeCloseTo(0.15, 1);
      expect(lootCounts[PowerUpType.EMP_BOMB] / TRIALS).toBeCloseTo(0.10, 1);
    });
  });

  // ==========================================================================
  // Dimension 3: Kinematics, Sway Physics & Boundary Clamping
  // ==========================================================================
  describe('Dimension 3: Kinematics, Sway Physics & Boundary Clamping', () => {
    let item: PowerUpItem;

    beforeEach(() => {
      item = new PowerUpItem();
    });

    it('drifts downward at exactly 60 px/s constant vertical velocity', () => {
      item.init(100, 50, PowerUpType.RAPID_FIRE);
      expect(item.y).toBe(50);

      // Step 0.5s -> y = 50 + 60 * 0.5 = 80
      item.update(0.5);
      expect(item.y).toBeCloseTo(80, 2);

      // Step 1.0s -> y = 80 + 60 * 1.0 = 140
      item.update(1.0);
      expect(item.y).toBeCloseTo(140, 2);

      // Step 2.0s -> y = 140 + 60 * 2.0 = 260
      item.update(2.0);
      expect(item.y).toBeCloseTo(260, 2);
    });

    it('executes horizontal sinusoidal sway conforming to x = clamp(baseX + 12 * sin(3.0 * t + phase))', () => {
      item.init(112, 100, PowerUpType.SCATTER_SHOT);
      const phase = item.swayPhase;
      const baseX = item.baseX;

      // Sample sway positions at small timestamps where y stays well above 288 (100 + 60 * 1.5 = 190 < 288)
      const sampleTimes = [0.1, 0.15, 0.2, 0.25, 0.3, 0.25, 0.25];
      let accumulatedTime = 0;

      for (const dt of sampleTimes) {
        accumulatedTime += dt;
        item.update(dt);

        const expectedSwayOffset = 12.0 * Math.sin(accumulatedTime * 3.0 + phase);
        const expectedClampedX = Math.max(10, Math.min(214, baseX + expectedSwayOffset));

        expect(item.x).toBeCloseTo(expectedClampedX, 2);
      }
    });

    it('strictly clamps horizontal position between x = [10, 214] when spawned near viewport edges', () => {
      // Extreme Left boundary: origin at left wall (x = 10)
      const leftItem = new PowerUpItem();
      leftItem.init(10, 50, PowerUpType.EMP_BOMB);

      // Simulate 100 frames across multiple sway cycles
      for (let f = 0; f < 100; f++) {
        leftItem.update(0.05);
        expect(leftItem.x).toBeGreaterThanOrEqual(10);
        expect(leftItem.x).toBeLessThanOrEqual(214);
      }

      // Extreme Right boundary: origin at right wall (x = 214)
      const rightItem = new PowerUpItem();
      rightItem.init(214, 50, PowerUpType.ENGINE_BOOSTER);

      for (let f = 0; f < 100; f++) {
        rightItem.update(0.05);
        expect(rightItem.x).toBeGreaterThanOrEqual(10);
        expect(rightItem.x).toBeLessThanOrEqual(214);
      }

      // Adversarial Out-of-Bounds spawn coordinates: x = -100, x = 999
      const outLeft = new PowerUpItem();
      outLeft.init(-100, 50, PowerUpType.RAPID_FIRE);
      expect(outLeft.baseX).toBe(10);
      expect(outLeft.x).toBe(10);

      const outRight = new PowerUpItem();
      outRight.init(999, 50, PowerUpType.RAPID_FIRE);
      expect(outRight.baseX).toBe(214);
      expect(outRight.x).toBe(214);
    });

    it('reliably despawns and triggers pool recycling at y > 288', () => {
      // Spawn item right before threshold (y = 286)
      const itemThreshold = manager.spawnPowerUp(112, 286, PowerUpType.RAPID_FIRE);
      expect(itemThreshold).not.toBeNull();
      expect(manager.getActiveCount()).toBe(1);

      // Update 0.02s: y advances 1.2px -> y = 287.2 <= 288 (still active)
      manager.update(0.02);
      expect(itemThreshold?.active).toBe(true);
      expect(manager.getActiveCount()).toBe(1);

      // Update 0.02s: y advances another 1.2px -> y = 288.4 > 288 (despawns)
      manager.update(0.02);
      expect(itemThreshold?.active).toBe(false);
      expect(manager.getActiveCount()).toBe(0);

      const stats = manager.getStats();
      expect(stats.totalDespawned).toBe(1);
    });
  });
});
