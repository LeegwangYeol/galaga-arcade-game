/**
 * Galaga Arcade Web Game — Generic ObjectPool Unit Test Suite
 * Location: tests/unit/pool.test.ts
 *
 * Comprehensive coverage of ObjectPool subsystem:
 * - Pre-allocation & initialization (positional & config object signatures)
 * - Acquisition lifecycle & active count tracking
 * - O(1) swap-and-pop release & reset execution
 * - Defensive double-free & foreign entity rejection
 * - Bounded dynamic auto-expansion (autoExpand: true)
 * - Strict fixed-capacity saturation (autoExpand: false)
 * - Sequential iteration (forEachActive, getActive)
 * - Safe mutation reverse traversal (forEachActiveSafe)
 * - Active clearing vs total array draining
 * - Edge cases & parameter clamping
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ObjectPool, ObjectPoolConfig } from '../../src/core/ObjectPool';

interface MockEntity {
  id: number;
  x: number;
  y: number;
  active: boolean;
  tag?: string;
}

describe('ObjectPool Subsystem Unit Suite', () => {
  let nextEntityId: number;

  const mockFactory = (): MockEntity => ({
    id: nextEntityId++,
    x: 0,
    y: 0,
    active: false,
  });

  const mockReset = (entity: MockEntity): void => {
    entity.x = 0;
    entity.y = 0;
    entity.active = false;
    entity.tag = undefined;
  };

  beforeEach(() => {
    nextEntityId = 1;
  });

  describe('Initialization & Preallocation', () => {
    it('pre-allocates storage according to positional initialSize', () => {
      const pool = new ObjectPool<MockEntity>(mockFactory, mockReset, 16, 64);
      expect(pool.getCapacity()).toBe(16);
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getFreeCount()).toBe(16);
      expect(pool.getMaxSize()).toBe(64);
      expect(pool.isFull()).toBe(false);
    });

    it('initializes correctly using an ObjectPoolConfig object', () => {
      const config: ObjectPoolConfig<MockEntity> = {
        factory: mockFactory,
        reset: mockReset,
        initialSize: 32,
        maxSize: 128,
        autoExpand: false,
      };
      const pool = new ObjectPool<MockEntity>(config);
      expect(pool.getCapacity()).toBe(32);
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getFreeCount()).toBe(32);
      expect(pool.getMaxSize()).toBe(128);
      expect((pool as any).autoExpand).toBe(false);
    });

    it('clamps initialSize to maxSize if initialSize > maxSize', () => {
      const pool = new ObjectPool<MockEntity>(mockFactory, mockReset, 100, 50);
      // maxSize is Math.max(initCapacity, maxSize) in positional constructor
      expect(pool.getCapacity()).toBe(100);
      expect(pool.getMaxSize()).toBe(100);

      // In config constructor: maxSize clamped to Math.max(initCapacity, config.maxSize)
      const configPool = new ObjectPool<MockEntity>({
        factory: mockFactory,
        reset: mockReset,
        initialSize: 64,
        maxSize: 32,
      });
      expect(configPool.getCapacity()).toBe(64);
      expect(configPool.getMaxSize()).toBe(64);
    });

    it('clamps non-positive initialSize to minimum 1', () => {
      const pool = new ObjectPool<MockEntity>(mockFactory, mockReset, 0, 10);
      expect(pool.getCapacity()).toBe(1);
    });
  });

  describe('Acquisition Lifecycle', () => {
    it('acquires distinct active entities and tracks active/free counts', () => {
      const pool = new ObjectPool<MockEntity>(mockFactory, mockReset, 4, 16);
      const e1 = pool.acquire();
      const e2 = pool.acquire();

      expect(e1).not.toBeNull();
      expect(e2).not.toBeNull();
      expect(e1).not.toBe(e2);
      expect(e1!.id).not.toBe(e2!.id);

      expect(pool.getActiveCount()).toBe(2);
      expect(pool.getFreeCount()).toBe(2);
      expect(pool.getCapacity()).toBe(4);
    });

    it('applies resetFn immediately upon acquisition', () => {
      const pool = new ObjectPool<MockEntity>(mockFactory, mockReset, 2, 4);
      const e = pool.acquire()!;
      e.x = 999;
      e.tag = 'dirty';

      pool.release(e);

      // Next acquire should re-apply reset
      const reacquired = pool.acquire()!;
      expect(reacquired.x).toBe(0);
      expect(reacquired.tag).toBeUndefined();
    });
  });

  describe('O(1) Swap-and-Pop Release', () => {
    it('releases active entities, restores free partition, and executes reset', () => {
      const pool = new ObjectPool<MockEntity>(mockFactory, mockReset, 4, 16);
      const e1 = pool.acquire()!;
      const e2 = pool.acquire()!;
      const e3 = pool.acquire()!;

      e2.x = 120;
      e2.y = 240;
      e2.active = true;

      expect(pool.getActiveCount()).toBe(3);
      const released = pool.release(e2);

      expect(released).toBe(true);
      expect(pool.getActiveCount()).toBe(2);
      expect(pool.getFreeCount()).toBe(2);

      // Verify reset executed
      expect(e2.x).toBe(0);
      expect(e2.y).toBe(0);
      expect(e2.active).toBe(false);

      // In swap-and-pop, e3 was at last active index, so active partition now has e1 and e3
      const active = pool.getActive();
      expect(active).toContain(e1);
      expect(active).toContain(e3);
      expect(active).not.toContain(e2);
    });

    it('releases last active element without swap', () => {
      const pool = new ObjectPool<MockEntity>(mockFactory, mockReset, 4, 16);
      const e1 = pool.acquire()!;
      const e2 = pool.acquire()!;

      expect(pool.release(e2)).toBe(true);
      expect(pool.getActiveCount()).toBe(1);
      expect(pool.getActive()[0]).toBe(e1);
    });
  });

  describe('Double-Free & Foreign Object Safeguards', () => {
    it('defensively rejects double release of the same object', () => {
      const pool = new ObjectPool<MockEntity>(mockFactory, mockReset, 4, 16);
      const e1 = pool.acquire()!;
      expect(pool.release(e1)).toBe(true);
      expect(pool.getActiveCount()).toBe(0);

      // Second release must return false and not corrupt activeCount
      expect(pool.release(e1)).toBe(false);
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getFreeCount()).toBe(4);
    });

    it('defensively rejects release of foreign unpooled object', () => {
      const pool = new ObjectPool<MockEntity>(mockFactory, mockReset, 4, 16);
      pool.acquire();
      const foreign: MockEntity = { id: 9999, x: 50, y: 50, active: true };

      expect(pool.release(foreign)).toBe(false);
      expect(pool.getActiveCount()).toBe(1);
    });
  });

  describe('Capacity Bounds & autoExpand Invariants', () => {
    it('auto-expands storage dynamically when autoExpand: true', () => {
      const pool = new ObjectPool<MockEntity>({
        factory: mockFactory,
        reset: mockReset,
        initialSize: 2,
        maxSize: 8,
        autoExpand: true,
      });

      expect(pool.getCapacity()).toBe(2);
      const e1 = pool.acquire();
      const e2 = pool.acquire();
      expect(e1).not.toBeNull();
      expect(e2).not.toBeNull();

      // Third acquire triggers automatic growth
      const e3 = pool.acquire();
      expect(e3).not.toBeNull();
      expect(pool.getCapacity()).toBeGreaterThan(2);
      expect(pool.getActiveCount()).toBe(3);
    });

    it('strictly halts growth and returns null at maxSize when autoExpand: true', () => {
      const pool = new ObjectPool<MockEntity>({
        factory: mockFactory,
        reset: mockReset,
        initialSize: 2,
        maxSize: 4,
        autoExpand: true,
      });

      expect(pool.acquire()).not.toBeNull();
      expect(pool.acquire()).not.toBeNull();
      expect(pool.acquire()).not.toBeNull();
      expect(pool.acquire()).not.toBeNull();

      // Pool is now at maxSize: 4
      expect(pool.getCapacity()).toBe(4);
      expect(pool.isFull()).toBe(true);
      expect(pool.acquire()).toBeNull();
      expect(pool.getActiveCount()).toBe(4);
    });

    it('strictly returns null and never expands when autoExpand: false', () => {
      const pool = new ObjectPool<MockEntity>({
        factory: mockFactory,
        reset: mockReset,
        initialSize: 4,
        maxSize: 16,
        autoExpand: false,
      });

      for (let i = 0; i < 4; i++) {
        expect(pool.acquire()).not.toBeNull();
      }

      // 5th acquire returns null because autoExpand is disabled
      expect(pool.acquire()).toBeNull();
      expect(pool.getCapacity()).toBe(4);
      expect(pool.getActiveCount()).toBe(4);
      expect(pool.getFreeCount()).toBe(0);
    });
  });

  describe('Active Iteration (forEachActive, getActive, forEachActiveSafe)', () => {
    it('iterates through all active entities sequentially via forEachActive', () => {
      const pool = new ObjectPool<MockEntity>(mockFactory, mockReset, 4, 8);
      const e1 = pool.acquire()!;
      const e2 = pool.acquire()!;
      e1.x = 10;
      e2.x = 20;

      const visited: number[] = [];
      pool.forEachActive((item, idx) => {
        visited.push(item.x);
        expect(idx).toBe(visited.length - 1);
      });

      expect(visited).toEqual([10, 20]);
    });

    it('returns a shallow array slice of active items via getActive', () => {
      const pool = new ObjectPool<MockEntity>(mockFactory, mockReset, 4, 8);
      const e1 = pool.acquire()!;
      const e2 = pool.acquire()!;

      const activeSlice = pool.getActive();
      expect(activeSlice.length).toBe(2);
      expect(activeSlice[0]).toBe(e1);
      expect(activeSlice[1]).toBe(e2);
    });

    it('supports safe in-loop release during forEachActiveSafe reverse iteration', () => {
      const pool = new ObjectPool<MockEntity>(mockFactory, mockReset, 6, 8);
      const e1 = pool.acquire()!;
      const e2 = pool.acquire()!;
      const e3 = pool.acquire()!;
      const e4 = pool.acquire()!;

      e1.y = 10;
      e2.y = 80; // filter target
      e3.y = 20;
      e4.y = 90; // filter target

      pool.forEachActiveSafe((item) => {
        if (item.y > 50) {
          pool.release(item);
        }
      });

      expect(pool.getActiveCount()).toBe(2);
      const remainingY = pool.getActive().map((e) => e.y).sort((a, b) => a - b);
      expect(remainingY).toEqual([10, 20]);
    });
  });

  describe('Lifecycle Teardown: clear vs drain', () => {
    it('clear() deactivates all entities and resets activeCount to 0 while keeping storage buffer', () => {
      const pool = new ObjectPool<MockEntity>(mockFactory, mockReset, 4, 16);
      const e1 = pool.acquire()!;
      const e2 = pool.acquire()!;
      e1.x = 100;
      e2.x = 200;

      expect(pool.getActiveCount()).toBe(2);
      pool.clear();

      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getFreeCount()).toBe(4);
      expect(pool.getCapacity()).toBe(4);
      expect(e1.x).toBe(0);
      expect(e2.x).toBe(0);
    });

    it('drain() empties active items and deallocates internal storage buffer', () => {
      const pool = new ObjectPool<MockEntity>(mockFactory, mockReset, 4, 16);
      pool.acquire();
      pool.acquire();

      expect(pool.getCapacity()).toBe(4);
      pool.drain();

      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getCapacity()).toBe(0);
      expect(pool.getFreeCount()).toBe(0);

      // Acquire on drained pool with autoExpand: true triggers allocation from 0
      const e = pool.acquire();
      expect(e).not.toBeNull();
      expect(pool.getCapacity()).toBeGreaterThanOrEqual(1);
    });
  });
});
