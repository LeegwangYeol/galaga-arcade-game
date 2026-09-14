/**
 * Galaga Arcade Web Game — Milestone M11 PowerUp Pool Invariants Suite
 * Location: tests/unit/m11_powerup_pool.test.ts
 *
 * Comprehensive coverage of PowerUpManager object pool invariants:
 * - Fixed pre-allocation capacity (initialSize = 32, maxSize = 32)
 * - Strict non-expansion invariant (autoExpand = false)
 * - Saturation bounds (32 active items max, 33rd returns null)
 * - Acquisition & release lifecycle
 * - Complete pool flush on powerUpManager.reset() (activeCount === 0)
 * - Offscreen boundary recycling & player collection recycling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PowerUpManager } from '../../src/core/powerups/PowerUpManager';
import { PowerUpType } from '../../src/core/powerups/types';
import { Player } from '../../src/entities/Player';

describe('Milestone M11: PowerUpManager Object Pool Invariants', () => {
  let manager: PowerUpManager;

  beforeEach(() => {
    manager = new PowerUpManager();
  });

  describe('Pool Pre-allocation & Capacity Invariants', () => {
    it('initializes pool with exact capacity 32, maxSize 32, and autoExpand false', () => {
      const pool = manager.getPool();
      expect(pool).toBeDefined();
      expect(pool.getCapacity()).toBe(32);
      expect(pool.getMaxSize()).toBe(32);
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getFreeCount()).toBe(32);
      expect((pool as any).autoExpand).toBe(false);
      expect(PowerUpManager.POOL_CAPACITY).toBe(32);
      expect(PowerUpManager.POOL_MAX_SIZE).toBe(32);
    });

    it('reports consistent pool capacity via getStats()', () => {
      const stats = manager.getStats();
      expect(stats.poolCapacity).toBe(32);
      expect(stats.activeCount).toBe(0);
    });
  });

  describe('Acquisition, Saturation & autoExpand: false Bounds', () => {
    it('leases up to 32 active items and strictly saturates without auto-expansion', () => {
      const pool = manager.getPool();
      const acquiredItems = [];

      for (let i = 0; i < 32; i++) {
        const item = pool.acquire();
        expect(item).not.toBeNull();
        acquiredItems.push(item);
      }

      expect(pool.getActiveCount()).toBe(32);
      expect(pool.getFreeCount()).toBe(0);
      expect(pool.getCapacity()).toBe(32);

      // 33rd lease must strictly return null due to autoExpand: false
      const overflowItem = pool.acquire();
      expect(overflowItem).toBeNull();
      expect(pool.getCapacity()).toBe(32);
      expect(pool.getActiveCount()).toBe(32);
    });

    it('leases items with distinct IDs and applies reset on acquire', () => {
      const pool = manager.getPool();
      const item1 = pool.acquire()!;
      const item2 = pool.acquire()!;

      expect(item1.id).not.toBe(item2.id);
      expect(item1.x).toBe(0);
      expect(item1.y).toBe(0);
      expect(item2.x).toBe(0);
      expect(item2.y).toBe(0);

      // Initialized items have active = true
      item1.init(100, 50, PowerUpType.RAPID_FIRE);
      expect(item1.active).toBe(true);
      expect(item1.x).toBe(100);
      expect(item1.y).toBe(50);
    });
  });

  describe('Release & Swap-and-Pop Lifecycle', () => {
    it('releases items back to the free pool, restoring freeCount', () => {
      const pool = manager.getPool();
      const item1 = pool.acquire()!;
      const item2 = pool.acquire()!;
      const item3 = pool.acquire()!;

      expect(item1).toBeDefined();
      expect(item3).toBeDefined();
      item2.init(120, 240, PowerUpType.KINETIC_SHIELD);
      expect(pool.getActiveCount()).toBe(3);
      expect(pool.getFreeCount()).toBe(29);

      const released = pool.release(item2);
      expect(released).toBe(true);

      expect(pool.getActiveCount()).toBe(2);
      expect(pool.getFreeCount()).toBe(30);

      // Verifies reset execution on item2
      expect(item2.active).toBe(false);
      expect(item2.x).toBe(0);
      expect(item2.y).toBe(0);
    });

    it('safely handles double release and unallocated foreign objects', () => {
      const pool = manager.getPool();
      const item = pool.acquire()!;
      expect(pool.release(item)).toBe(true);
      expect(pool.release(item)).toBe(false);

      const foreign: any = { id: 9999, active: true };
      expect(pool.release(foreign)).toBe(false);
    });
  });

  describe('Manager Reset & Stage Boundary Hygiene', () => {
    it('flushes all active items to getActiveCount() === 0 upon manager.reset()', () => {
      const pool = manager.getPool();

      // Acquire multiple items
      for (let i = 0; i < 15; i++) {
        pool.acquire();
      }
      expect(pool.getActiveCount()).toBe(15);

      // Execute manager reset
      manager.reset();

      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getFreeCount()).toBe(32);
      expect(pool.getCapacity()).toBe(32);
    });

    it('clears active buff states on manager.reset()', () => {
      manager.buffState.hasShield = true;
      manager.buffState.rapidFireTimer = 10.0;
      manager.buffState.scatterShotTimer = 15.0;
      manager.buffState.chronoFieldTimer = 5.0;
      manager.buffState.hasReflectionShield = true;

      manager.reset();

      expect(manager.buffState.hasShield).toBe(false);
      expect(manager.buffState.rapidFireTimer).toBe(0);
      expect(manager.buffState.scatterShotTimer).toBe(0);
      expect(manager.buffState.chronoFieldTimer).toBe(0);
      expect(manager.buffState.hasReflectionShield).toBe(false);
      expect(manager.getPool().getActiveCount()).toBe(0);
    });
  });

  describe('In-Game Lifecycle: Spawning, Despawn & Collection', () => {
    it('spawns drop items and recycles them when falling off-screen (y > 288)', () => {
      const pool = manager.getPool();
      const mockPlayer = new Player({ x: 112, y: 250 });

      // Spawn item near the bottom edge
      const activeItem = manager.spawnPowerUp(100, 280, PowerUpType.KINETIC_SHIELD)!;
      expect(activeItem).not.toBeNull();
      expect(pool.getActiveCount()).toBe(1);

      // Update simulation: item moves downwards past 288
      manager.update(0.5, mockPlayer);

      // Should be recycled when y > 288
      expect(activeItem.active).toBe(false);
      expect(pool.getActiveCount()).toBe(0);
    });

    it('recycles item to pool when collected by player and activates buff', () => {
      const pool = manager.getPool();
      const mockPlayer = new Player({ x: 100, y: 200 });

      const item = manager.spawnPowerUp(100, 200, PowerUpType.KINETIC_SHIELD)!;
      expect(item).not.toBeNull();
      expect(pool.getActiveCount()).toBe(1);

      // Simulate player collection (overlapping coordinates)
      manager.checkPlayerCollection(mockPlayer);

      // Item should be collected and released back to pool
      expect(mockPlayer.hasShield).toBe(true);
      expect(manager.buffState.hasShield).toBe(true);
      expect(pool.getActiveCount()).toBe(0);
    });
  });
});
