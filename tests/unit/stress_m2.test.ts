/**
 * Galaga Arcade Web Game — Milestone 2 Adversarial & Stress Test Suite
 * 
 * Empirical challenger test harness validating:
 * 1. ObjectPool under heavy adversarial conditions:
 *    - 1,000+ item rapid churn (10,000 random operations)
 *    - Strict capacity bounding & autoExpand limit exhaustion
 *    - Double-release & foreign object release immunity
 *    - Swap-and-pop internal partition integrity under arbitrary release orders
 *    - In-flight safe deletion during traversal (forEachActiveSafe)
 *    - Post-drain lifecycle restoration
 * 
 * 2. GameLoop under hostile temporal environments:
 *    - Tab suspension / freeze (10s & 60s time jumps -> Spiral of Death clamp)
 *    - Zero delta time (dt = 0, instantaneous double-ticks)
 *    - Negative delta time (clock skew / backward jump)
 *    - High refresh rates (120Hz & 240Hz frame subdivision & alpha pacing)
 *    - Irregular jittery frame delta simulation
 *    - Tab suspension during pause state (zero burst on resume)
 */

import { describe, it, expect, vi } from 'vitest';
import { ObjectPool } from '../../src/core/ObjectPool';
import { GameLoop } from '../../src/core/GameLoop';

describe('Adversarial Stress Test: ObjectPool Subsystem', () => {
  interface StressParticle {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    active: boolean;
  }

  let particleId = 0;
  const createParticle = (): StressParticle => ({
    id: ++particleId,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 1.0,
    active: false,
  });

  const resetParticle = (p: StressParticle) => {
    p.x = 0;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    p.life = 1.0;
    p.active = false;
  };

  it('handles rapid acquire and release of 1,000+ items without memory leaks or index corruption', () => {
    particleId = 0;
    const pool = new ObjectPool<StressParticle>(createParticle, resetParticle, 500, 2000);

    // 1. Acquire 1,500 items (triggers auto-expansion from 500 to 2000)
    const acquired: StressParticle[] = [];
    for (let i = 0; i < 1500; i++) {
      const item = pool.acquire();
      expect(item).not.toBeNull();
      if (item) {
        item.active = true;
        item.x = i;
        acquired.push(item);
      }
    }

    expect(pool.getActiveCount()).toBe(1500);
    expect(pool.getCapacity()).toBeGreaterThanOrEqual(1500);
    expect(acquired.length).toBe(1500);

    // 2. Release all 1,500 items in reverse order
    for (let i = acquired.length - 1; i >= 0; i--) {
      const released = pool.release(acquired[i]!);
      expect(released).toBe(true);
    }

    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getFreeCount()).toBe(pool.getCapacity());

    // 3. Re-acquire 1,500 items - verify all are properly reset and reused without capacity increase
    const currentCap = pool.getCapacity();
    const reacquired: StressParticle[] = [];
    for (let i = 0; i < 1500; i++) {
      const item = pool.acquire();
      expect(item).not.toBeNull();
      if (item) {
        expect(item.x).toBe(0); // Confirms reset
        expect(item.active).toBe(false);
        reacquired.push(item);
      }
    }

    expect(pool.getCapacity()).toBe(currentCap); // Zero allocation on re-acquisition
    expect(pool.getActiveCount()).toBe(1500);
  });

  it('survives 10,000 random acquire/release operations while preserving active partition invariants', () => {
    particleId = 0;
    const pool = new ObjectPool<StressParticle>(createParticle, resetParticle, 100, 1500);
    const activeSet = new Set<StressParticle>();

    // Deterministic pseudo-random number generator (LCG)
    let seed = 123456789;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let cycle = 0; cycle < 10000; cycle++) {
      const shouldAcquire = activeSet.size === 0 || (rnd() > 0.45 && activeSet.size < 1200);

      if (shouldAcquire) {
        const item = pool.acquire();
        if (item) {
          expect(activeSet.has(item)).toBe(false); // Must not re-issue an already active item
          activeSet.add(item);
        }
      } else {
        // Pick an item from activeSet to release
        const items = Array.from(activeSet);
        const indexToRelease = Math.floor(rnd() * items.length);
        const itemToRelease = items[indexToRelease]!;

        const released = pool.release(itemToRelease);
        expect(released).toBe(true);
        activeSet.delete(itemToRelease);
      }

      // Invariant check: activeCount must exactly match activeSet size
      expect(pool.getActiveCount()).toBe(activeSet.size);
    }

    // Clean up all remaining active items
    for (const item of activeSet) {
      expect(pool.release(item)).toBe(true);
    }
    expect(pool.getActiveCount()).toBe(0);
  });

  it('enforces hard capacity limits and returns null on pool exhaustion when autoExpand is disabled', () => {
    const pool = new ObjectPool<StressParticle>({
      factory: createParticle,
      reset: resetParticle,
      initialSize: 50,
      maxSize: 50,
      autoExpand: false,
    });

    const items: StressParticle[] = [];
    for (let i = 0; i < 50; i++) {
      const item = pool.acquire();
      expect(item).not.toBeNull();
      if (item) items.push(item);
    }

    expect(pool.isFull()).toBe(true);
    expect(pool.getActiveCount()).toBe(50);
    expect(pool.getFreeCount()).toBe(0);

    // 51st acquire must return null safely
    const overflowItem = pool.acquire();
    expect(overflowItem).toBeNull();
    expect(pool.getActiveCount()).toBe(50);

    // Release 1 item -> can acquire 1 item
    expect(pool.release(items[0]!)).toBe(true);
    expect(pool.isFull()).toBe(false);

    const replacement = pool.acquire();
    expect(replacement).not.toBeNull();
    expect(pool.isFull()).toBe(true);
  });

  it('bounds auto-expansion strictly at maxSize and handles auto-growth incrementally', () => {
    const pool = new ObjectPool<StressParticle>({
      factory: createParticle,
      reset: resetParticle,
      initialSize: 4,
      maxSize: 100,
      autoExpand: true,
    });

    expect(pool.getCapacity()).toBe(4);

    const items: StressParticle[] = [];
    for (let i = 0; i < 100; i++) {
      const item = pool.acquire();
      expect(item).not.toBeNull();
      if (item) items.push(item);
    }

    expect(pool.getCapacity()).toBe(100);
    expect(pool.getActiveCount()).toBe(100);
    expect(pool.isFull()).toBe(true);

    // 101st item must return null
    expect(pool.acquire()).toBeNull();
    expect(pool.getCapacity()).toBe(100);
  });

  it('defensively repels repeated double-releases and unmanaged foreign objects', () => {
    const pool = new ObjectPool<StressParticle>(createParticle, resetParticle, 10, 20);
    const p1 = pool.acquire()!;
    const p2 = pool.acquire()!;
    const p3 = pool.acquire()!;

    expect(pool.getActiveCount()).toBe(3);

    // Release p2 once
    expect(pool.release(p2)).toBe(true);
    expect(pool.getActiveCount()).toBe(2);

    // Attempt releasing p2 5 more times
    for (let i = 0; i < 5; i++) {
      expect(pool.release(p2)).toBe(false);
      expect(pool.getActiveCount()).toBe(2); // Count must never decrement below actual active count
    }

    // Foreign unmanaged object
    const foreignObj: StressParticle = {
      id: 999999,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      active: true,
    };
    expect(pool.release(foreignObj)).toBe(false);
    expect(pool.getActiveCount()).toBe(2);

    // Release remaining
    expect(pool.release(p1)).toBe(true);
    expect(pool.release(p3)).toBe(true);
    expect(pool.getActiveCount()).toBe(0);

    // Release on empty pool
    expect(pool.release(p1)).toBe(false);
    expect(pool.getActiveCount()).toBe(0);
  });

  it('maintains dense-array partition integrity across non-sequential prime-indexed releases', () => {
    const pool = new ObjectPool<StressParticle>(createParticle, resetParticle, 60, 60);
    const items: StressParticle[] = [];
    for (let i = 0; i < 50; i++) {
      items.push(pool.acquire()!);
    }

    const primeIndices = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
    const releasedItems = new Set<StressParticle>();

    // Release prime-indexed items in reverse order
    for (let i = primeIndices.length - 1; i >= 0; i--) {
      const idx = primeIndices[i]!;
      const item = items[idx]!;
      expect(pool.release(item)).toBe(true);
      releasedItems.add(item);
    }

    expect(pool.getActiveCount()).toBe(50 - primeIndices.length); // 35

    // Verify all active items returned by forEachActive are unique and non-released
    const observedActive = new Set<StressParticle>();
    pool.forEachActive((item) => {
      expect(releasedItems.has(item)).toBe(false);
      expect(observedActive.has(item)).toBe(false);
      observedActive.add(item);
    });

    expect(observedActive.size).toBe(35);
  });

  it('allows safe element release during reverse traversal with forEachActiveSafe', () => {
    const pool = new ObjectPool<StressParticle>(createParticle, resetParticle, 100, 100);
    for (let i = 0; i < 100; i++) {
      const p = pool.acquire()!;
      p.x = i; // Assign IDs 0..99
    }

    const visited: number[] = [];
    // Release all even-indexed particles during traversal
    pool.forEachActiveSafe((item) => {
      visited.push(item.x);
      if (item.x % 2 === 0) {
        pool.release(item);
      }
    });

    // Verify exactly 50 odd items remain
    expect(pool.getActiveCount()).toBe(50);
    pool.forEachActive((item) => {
      expect(item.x % 2).toBe(1);
    });
  });

  it('restores operational capability after drain() followed by auto-expansion', () => {
    const pool = new ObjectPool<StressParticle>(createParticle, resetParticle, 32, 64);
    for (let i = 0; i < 10; i++) {
      pool.acquire();
    }
    expect(pool.getActiveCount()).toBe(10);

    pool.drain();
    expect(pool.getActiveCount()).toBe(0);
    expect(pool.getCapacity()).toBe(0);

    // Re-acquire on drained pool
    const newItem = pool.acquire();
    expect(newItem).not.toBeNull();
    expect(pool.getActiveCount()).toBe(1);
    expect(pool.getCapacity()).toBeGreaterThanOrEqual(1);
  });
});

describe('Adversarial Stress Test: GameLoop Subsystem', () => {
  it('prevents spiral of death on tab suspension (10s and 60s time jumps) by clamping to maxDelta', () => {
    let updateTicks = 0;
    const loop = new GameLoop({
      fixedDt: 1 / 60, // ~0.0166667s
      maxDelta: 0.1, // Clamp to 100ms
      onUpdate: () => {
        updateTicks++;
      },
    });

    loop.start();

    // 1. Simulate a 10.0-second tab suspension / freeze
    // Without maxDelta clamp, 10s would run 600 physics updates in a single frame.
    // With 0.1s maxDelta clamp: 0.1 / (1/60) = 6 fixed updates.
    loop.step(10.0);

    expect(updateTicks).toBe(6);
    expect(loop.getTickCount()).toBe(6);

    // 2. Simulate a 60.0-second extreme sleep
    loop.step(60.0);
    expect(updateTicks).toBe(12); // +6 updates
    expect(loop.getTickCount()).toBe(12);

    loop.stop();
  });

  it('handles zero delta time (dt = 0) without divide-by-zero, NaN, or spurious updates', () => {
    const onUpdate = vi.fn();
    const onRender = vi.fn();

    const loop = new GameLoop({
      fixedDt: 1 / 60,
      onUpdate,
      onRender,
    });

    loop.start();

    // Step with 0 delta time
    loop.step(0);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(onRender).toHaveBeenCalledTimes(1);

    // Verify alpha is a valid finite number in [0, 1]
    const alphaPassed = onRender.mock.calls[0]![0] as number;
    expect(Number.isFinite(alphaPassed)).toBe(true);
    expect(alphaPassed).toBeGreaterThanOrEqual(0);
    expect(alphaPassed).toBeLessThanOrEqual(1);

    // Verify metrics snapshot does not have NaN
    const metrics = loop.getMetrics();
    expect(Number.isNaN(metrics.fps)).toBe(false);
    expect(Number.isNaN(metrics.averageFps)).toBe(false);

    loop.stop();
  });

  it('gracefully discards negative delta times caused by system clock backwards jumps', () => {
    const onUpdate = vi.fn();
    const onRender = vi.fn();

    const loop = new GameLoop({
      fixedDt: 1 / 60,
      onUpdate,
      onRender,
    });

    loop.start();

    // Negative delta time: -5.0s (e.g. NTP time sync jump)
    loop.step(-5.0);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(onRender).toHaveBeenCalledTimes(1);
    expect(loop.getTickCount()).toBe(0);

    // Ensure normal operation resumes immediately on next valid frame
    loop.step(1 / 60);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(loop.getTickCount()).toBe(1);

    loop.stop();
  });

  it('accurately distributes physics steps and smooth alpha at 120Hz display refresh rate', () => {
    let updateCount = 0;
    const alphas: number[] = [];

    const loop = new GameLoop({
      fixedDt: 1 / 60, // 16.6667ms
      onUpdate: () => {
        updateCount++;
      },
      onRender: (alpha) => {
        alphas.push(alpha);
      },
    });

    loop.start();

    // 120Hz = 1 frame every 8.3333ms. Simulate 120 frames (= 1.0 second).
    const frameDt = 1 / 120; // 0.0083333s
    for (let frame = 0; frame < 120; frame++) {
      loop.step(frameDt);
    }

    // Over 1.0 second, exactly 60 physics updates should execute
    expect(updateCount).toBe(60);
    expect(loop.getFrameCount()).toBe(120);

    // Check that all alpha values are in [0, 1]
    for (const alpha of alphas) {
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }

    // In 120Hz, odd frames have alpha ~0.5 and even frames have alpha ~0.0
    expect(alphas[0]).toBeCloseTo(0.5, 2); // First 8.33ms: accumulator 8.33ms / 16.67ms = 0.5
    expect(alphas[1]).toBeCloseTo(0.0, 2); // Second 8.33ms: 1 update fires, accumulator 0.0ms

    loop.stop();
  });

  it('accurately distributes physics steps and smooth alpha at 240Hz ultra-high refresh rate', () => {
    let updateCount = 0;
    const loop = new GameLoop({
      fixedDt: 1 / 60, // 16.6667ms
      onUpdate: () => {
        updateCount++;
      },
      onRender: () => {},
    });

    loop.start();

    // 240Hz = 1 frame every 4.1667ms. Simulate 240 frames (= 1.0 second).
    const frameDt = 1 / 240;
    for (let frame = 0; frame < 240; frame++) {
      loop.step(frameDt);
    }

    // Exactly 60 physics updates across 240 render frames
    expect(updateCount).toBe(60);
    expect(loop.getFrameCount()).toBe(240);

    loop.stop();
  });

  it('maintains strict physics determinism under extreme frame delta jitter', () => {
    let updateCount = 0;
    let accumulatedPhysicsDt = 0;

    const loop = new GameLoop({
      fixedDt: 1 / 60,
      onUpdate: (dt) => {
        updateCount++;
        accumulatedPhysicsDt += dt;
      },
      onRender: () => {},
    });

    loop.start();

    // Jitter profile: 100 frames oscillating between 2ms and 32ms, averaging 16.67ms (total = 1.667s)
    const jitterDts = [0.002, 0.031, 0.015, 0.020, 0.005, 0.027];
    let totalElapsed = 0;

    for (let i = 0; i < 100; i++) {
      const dt = jitterDts[i % jitterDts.length]!;
      totalElapsed += dt;
      loop.step(dt);
    }

    const expectedTicks = Math.floor(totalElapsed / (1 / 60));
    expect(updateCount).toBe(expectedTicks);
    expect(accumulatedPhysicsDt).toBeCloseTo(expectedTicks * (1 / 60), 5);

    loop.stop();
  });

  it('prevents accumulated burst ticks when tab is suspended during pause state and resumed', () => {
    const onUpdate = vi.fn();
    const onRender = vi.fn();

    const loop = new GameLoop({
      fixedDt: 1 / 60,
      onUpdate,
      onRender,
    });

    loop.start();
    loop.step(1 / 60);
    expect(onUpdate).toHaveBeenCalledTimes(1);

    // 1. Pause the game
    loop.pause();
    expect(loop.isPaused()).toBe(true);

    // 2. While paused, simulate 30 seconds passing
    loop.step(30.0);
    expect(onUpdate).toHaveBeenCalledTimes(1); // No physics updates while paused
    expect(onRender).toHaveBeenCalledWith(0);

    // 3. Resume the game
    loop.resume();
    expect(loop.isPaused()).toBe(false);

    // 4. Next normal frame (16.67ms) must trigger exactly ONE update, not a burst
    loop.step(1 / 60);
    expect(onUpdate).toHaveBeenCalledTimes(2);

    loop.stop();
  });
});
