/**
 * Galaga Arcade Web Game — Milestone 11 Fix 2 Adversarial Stress Suite (m11_fix2_challenger_2)
 * PowerUpManager ObjectPool Invariants & 10,000-Cycle Endurance Stress Testing
 *
 * Empirical Challenges:
 * 1. Strict Pool Capacity Invariants:
 *    - Initial capacity strictly 32.
 *    - Max size strictly 32.
 *    - Auto-expand strictly disabled (false).
 *    - Zero heap allocation under rapid saturation leasing (leasing 60+ items in a single frame).
 * 2. Defensive Release Safeguards:
 *    - Double-free protection: releasing the same item twice returns false and does not corrupt pool.
 *    - Foreign object protection: releasing an unmanaged entity returns false and does not corrupt pool.
 *    - Null / undefined release: defensive handling returning false without throwing.
 *    - Out-of-order releases with swap-and-pop O(1) integrity verification.
 * 3. 10,000 Randomized Lease/Release Endurance Stress Cycles:
 *    - High-frequency multi-phase randomized acquire and release operations across:
 *      * Phase 1: Saturation Stress (85% lease probability) — repeatedly pushing pool to 32 and challenging overflow.
 *      * Phase 2: Draining Stress (85% release probability) — rapidly reclaiming back towards 0.
 *      * Phase 3: Balanced Random Walk (50% lease / 50% release).
 *      * Phase 4: High-Frequency Burst Waves (alternating bursts of 40 leases and 40 releases).
 *    - Constant assertion of storage buffer length === 32, activeCount in [0, 32], and item uniqueness.
 * 4. High-Volume Saturation and Recovery Cycles:
 *    - Repeatedly saturate to 32 items, verify null overflow, clear/recycle, and repeat 1,000 times.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PowerUpManager } from '../../src/core/powerups/PowerUpManager';
import { PowerUpItem } from '../../src/core/powerups/PowerUpItem';
import { PowerUpType } from '../../src/core/powerups/types';

describe('m11_fix2_challenger_2: PowerUpManager Pool Invariants & 10k Stress Suite', () => {
  let manager: PowerUpManager;
  const ALL_POWERUP_TYPES: PowerUpType[] = Object.values(PowerUpType);

  beforeEach(() => {
    manager = new PowerUpManager();
  });

  // ==========================================================================
  // 1. Strict Pool Capacity & Zero-Heap Allocation Invariants
  // ==========================================================================
  describe('1. Strict Pool Capacity & Zero-Heap Allocation Invariants', () => {
    it('initializes with capacity strictly 32 and max size strictly 32', () => {
      const pool = manager.getPool();
      expect(pool.getCapacity()).toBe(32);
      expect(pool.getMaxSize()).toBe(32);
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getFreeCount()).toBe(32);
      expect(manager.getPoolSize()).toBe(32);
      expect(manager.getActiveCount()).toBe(0);
    });

    it('enforces zero heap allocation under rapid saturation leasing (attempting 60 spawns)', () => {
      const pool = manager.getPool();
      const initialCapacity = pool.getCapacity();
      expect(initialCapacity).toBe(32);

      const acquired: (PowerUpItem | null)[] = [];

      // Attempt to lease 60 items in a single frame
      expect(() => {
        for (let i = 0; i < 60; i++) {
          const item = manager.spawnPowerUp(100, 100, PowerUpType.RAPID_FIRE);
          acquired.push(item);
        }
      }).not.toThrow();

      // Invariant: Exactly 32 items acquired successfully
      for (let i = 0; i < 32; i++) {
        expect(acquired[i]).not.toBeNull();
        expect(acquired[i]?.active).toBe(true);
      }

      // Invariant: Requests 33 to 60 return null (pool exhaustion)
      for (let i = 32; i < 60; i++) {
        expect(acquired[i]).toBeNull();
      }

      // Invariant: Pool capacity must remain strictly clamped at 32 (ZERO heap expansion)
      expect(pool.getCapacity()).toBe(32);
      expect(pool.getMaxSize()).toBe(32);
      expect(pool.getActiveCount()).toBe(32);
      expect(pool.getFreeCount()).toBe(0);
      expect(pool.isFull()).toBe(true);

      // Verify all 32 leased items are unique object references
      const itemSet = new Set(acquired.slice(0, 32));
      expect(itemSet.size).toBe(32);
    });
  });

  // ==========================================================================
  // 2. Defensive Release Safeguards
  // ==========================================================================
  describe('2. Defensive Release Safeguards', () => {
    it('safeguards against double-free: releasing same item twice returns false and does not corrupt activeCount', () => {
      const pool = manager.getPool();
      const item = manager.spawnPowerUp(100, 100, PowerUpType.KINETIC_SHIELD);
      expect(item).not.toBeNull();
      expect(pool.getActiveCount()).toBe(1);

      if (item) {
        // First release should succeed
        const firstRelease = pool.release(item);
        expect(firstRelease).toBe(true);
        expect(pool.getActiveCount()).toBe(0);

        // Second release must fail defensively
        const secondRelease = pool.release(item);
        expect(secondRelease).toBe(false);
        expect(pool.getActiveCount()).toBe(0);
        expect(pool.getCapacity()).toBe(32);
      }
    });

    it('safeguards against foreign objects: releasing unmanaged entity returns false without side effects', () => {
      const pool = manager.getPool();
      const foreignItem = new PowerUpItem(9999);

      // Lease 5 legitimate items
      for (let i = 0; i < 5; i++) {
        manager.spawnPowerUp(100, 100, PowerUpType.EMP_BOMB);
      }
      expect(pool.getActiveCount()).toBe(5);

      // Attempt to release foreign item
      const releaseResult = pool.release(foreignItem);
      expect(releaseResult).toBe(false);

      // Active count and pool capacity remain completely unchanged
      expect(pool.getActiveCount()).toBe(5);
      expect(pool.getCapacity()).toBe(32);
    });

    it('safeguards against null and undefined releases', () => {
      const pool = manager.getPool();
      manager.spawnPowerUp(100, 100, PowerUpType.RAPID_FIRE);
      expect(pool.getActiveCount()).toBe(1);

      expect(pool.release(null as any)).toBe(false);
      expect(pool.release(undefined as any)).toBe(false);
      expect(pool.getActiveCount()).toBe(1);
    });

    it('maintains active list integrity during arbitrary out-of-order releases (O(1) swap-and-pop)', () => {
      const pool = manager.getPool();
      const items: PowerUpItem[] = [];

      // Lease all 32 items
      for (let i = 0; i < 32; i++) {
        const item = manager.spawnPowerUp(i * 5, 50, PowerUpType.SCATTER_SHOT);
        expect(item).not.toBeNull();
        if (item) items.push(item);
      }
      expect(pool.getActiveCount()).toBe(32);

      // Release items in irregular, non-sequential order:
      // Release index 10, 0, 31, 15, 20
      const releaseIndices = [10, 0, 31, 15, 20];
      const releasedSet = new Set<PowerUpItem>();

      for (const idx of releaseIndices) {
        const target = items[idx]!;
        expect(pool.release(target)).toBe(true);
        releasedSet.add(target);
      }

      expect(pool.getActiveCount()).toBe(32 - releaseIndices.length);

      // Verify all remaining active items are genuinely active and not in released set
      const activeItems = pool.getActive();
      expect(activeItems.length).toBe(32 - releaseIndices.length);

      for (const active of activeItems) {
        expect(releasedSet.has(active)).toBe(false);
      }

      // Release all remaining active items
      for (const item of items) {
        if (!releasedSet.has(item)) {
          expect(pool.release(item)).toBe(true);
        }
      }

      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getCapacity()).toBe(32);
    });
  });

  // ==========================================================================
  // 3. 10,000 Randomized Lease/Release Endurance Stress Cycles
  // ==========================================================================
  describe('3. 10,000 Randomized Lease/Release Endurance Stress Cycles', () => {
    it('executes 10,000 randomized lease and release operations across 4 distinct regimes with continuous invariant assertions', () => {
      const pool = manager.getPool();
      const activeLeased: PowerUpItem[] = [];

      // Pseudo-random linear congruential generator for deterministic reproducibility
      let seed = 123456789;
      function nextRandom(): number {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }

      const TOTAL_CYCLES = 10_000;
      let leaseAttempts = 0;
      let releaseAttempts = 0;
      let successfulLeases = 0;
      let successfulReleases = 0;
      let rejectedLeases = 0;

      for (let cycle = 0; cycle < TOTAL_CYCLES; cycle++) {
        // Multi-phase stress regimes:
        // Phase 1 (0-2500): Saturation stress (85% acquire)
        // Phase 2 (2500-5000): Draining stress (15% acquire, 85% release)
        // Phase 3 (5000-7500): Balanced walk (50% acquire, 50% release)
        // Phase 4 (7500-10000): Periodic wave bursts (40 acquire burst, 40 release burst)
        const phase = Math.floor(cycle / 2500);
        let shouldAcquire: boolean;
        if (phase === 0) {
          shouldAcquire = nextRandom() < 0.85;
        } else if (phase === 1) {
          shouldAcquire = nextRandom() < 0.15;
        } else if (phase === 2) {
          shouldAcquire = nextRandom() < 0.50;
        } else {
          shouldAcquire = (cycle % 80) < 40;
        }

        if (shouldAcquire) {
          leaseAttempts++;
          const type = ALL_POWERUP_TYPES[cycle % ALL_POWERUP_TYPES.length]!;
          const item = manager.spawnPowerUp(112, 100, type);

          if (activeLeased.length < 32) {
            // Must succeed
            expect(item).not.toBeNull();
            if (item) {
              successfulLeases++;
              activeLeased.push(item);
            }
          } else {
            // Must be rejected with null when pool is at maximum capacity (32)
            expect(item).toBeNull();
            rejectedLeases++;
          }
        } else {
          releaseAttempts++;
          if (activeLeased.length > 0) {
            // Pick a random active item to release
            const releaseIdx = Math.floor(nextRandom() * activeLeased.length);
            const target = activeLeased[releaseIdx]!;
            const success = pool.release(target);
            expect(success).toBe(true);
            successfulReleases++;
            // Remove from local tracked active array (swap and pop)
            activeLeased[releaseIdx] = activeLeased[activeLeased.length - 1]!;
            activeLeased.pop();
          }
        }

        // --- Invariant assertions verified EVERY cycle ---
        expect(pool.getCapacity()).toBe(32);
        expect(pool.getMaxSize()).toBe(32);
        expect(pool.getActiveCount()).toBe(activeLeased.length);
        expect(pool.getActiveCount()).toBeGreaterThanOrEqual(0);
        expect(pool.getActiveCount()).toBeLessThanOrEqual(32);

        // Every 500 cycles, verify deep uniqueness and set equality
        if (cycle % 500 === 0) {
          const activeFromPool = pool.getActive();
          expect(activeFromPool.length).toBe(activeLeased.length);
          const activeSet = new Set(activeFromPool);
          expect(activeSet.size).toBe(activeLeased.length);
          for (const item of activeLeased) {
            expect(activeSet.has(item)).toBe(true);
          }
        }
      }

      // Post-10,000 cycle verification: Cleanly release all remaining items
      while (activeLeased.length > 0) {
        const item = activeLeased.pop()!;
        expect(pool.release(item)).toBe(true);
      }

      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getCapacity()).toBe(32);
      expect(pool.getMaxSize()).toBe(32);

      // Verify statistical coverage across all regimes
      expect(successfulLeases).toBeGreaterThan(2500);
      expect(successfulReleases).toBeGreaterThan(2500);
      expect(rejectedLeases).toBeGreaterThan(1500);
      expect(leaseAttempts + releaseAttempts).toBe(TOTAL_CYCLES);
    });
  });

  // ==========================================================================
  // 4. Repeated Saturation and Pool Reset Endurance
  // ==========================================================================
  describe('4. Repeated Saturation and Pool Reset Endurance', () => {
    it('survives 1,000 rapid saturation-clear cycles with zero capacity leakage', () => {
      const pool = manager.getPool();

      for (let iter = 0; iter < 1000; iter++) {
        // Saturate all 32
        for (let i = 0; i < 32; i++) {
          const item = manager.spawnPowerUp(100, 100, PowerUpType.ENGINE_BOOSTER);
          expect(item).not.toBeNull();
        }
        expect(pool.getActiveCount()).toBe(32);
        expect(pool.isFull()).toBe(true);

        // 33rd must be null
        const overflow = manager.spawnPowerUp(100, 100, PowerUpType.ENGINE_BOOSTER);
        expect(overflow).toBeNull();

        // Clear all active
        manager.reset();
        expect(pool.getActiveCount()).toBe(0);
        expect(pool.getCapacity()).toBe(32);
      }

      expect(pool.getCapacity()).toBe(32);
      expect(pool.getMaxSize()).toBe(32);
    });
  });
});
