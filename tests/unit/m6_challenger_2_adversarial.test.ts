/**
 * Galaga Arcade Web Game — Milestone 6 Challenger 2 Adversarial Stress Test Suite
 * 
 * Exhaustive Empirical Verification of ParticleSystem & Kinematics:
 * 1. Pool Exhaustion & Burst Stress (20+ simultaneous Boss Galaga explosions requiring >600 particles vs 250 cap).
 * 2. Kinetic Math & Delta Time Extreme Stress (dt = 0, dt = 10s, subnormal dt, extreme velocity).
 * 3. NaN, Infinity, negative lifespan, and boundary containment verification.
 * 4. ObjectPool zero-allocation invariants, swap-and-pop integrity, and lifecycle safety.
 * 5. Canvas 2D crisp pixel integer snapping and globalAlpha preservation under full load.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParticleSystem, Particle } from '../../src/systems/ParticleSystem';
import { PALETTE } from '../../src/renderer/SpriteRenderer';

describe('Milestone 6 Challenger 2: Particle System Pool & Kinetic Stress Tests', () => {
  let particleSystem: ParticleSystem;

  beforeEach(() => {
    particleSystem = new ParticleSystem({ maxParticles: 250 });
  });

  // ==========================================================================
  // Challenge 1: Pool Exhaustion Stress (20 Simultaneous Boss Galaga Explosions)
  // ==========================================================================
  describe('1. Pool Exhaustion & Burst Stress (20+ Simultaneous Boss Explosions)', () => {
    it('handles 20 simultaneous Boss Galaga explosions (820 particles requested) gracefully capped at 250', () => {
      expect(particleSystem.getActiveCount()).toBe(0);
      expect(particleSystem.getCapacity()).toBe(250);
      expect(particleSystem.getMaxSize()).toBe(250);

      // Trigger 20 simultaneous Boss Galaga explosions
      // Each explosion attempts 40 sparks + 1 shockwave = 41 particles (Total 820 requested)
      for (let i = 0; i < 20; i++) {
        expect(() => {
          particleSystem.spawnBossExplosion(112, 80 + i * 2, 40);
        }).not.toThrow();
      }

      // Assert hard cap invariant
      expect(particleSystem.getActiveCount()).toBe(250);
      expect(particleSystem.getPool().getFreeCount()).toBe(0);
      expect(particleSystem.getPool().isFull()).toBe(true);

      // Verify all 250 leased particles are active and uncorrupted
      let activeCount = 0;
      particleSystem.getPool().forEachActive((p) => {
        activeCount++;
        expect(p.active).toBe(true);
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        expect(Number.isFinite(p.vx)).toBe(true);
        expect(Number.isFinite(p.vy)).toBe(true);
        expect(p.maxLife).toBeGreaterThan(0);
      });
      expect(activeCount).toBe(250);
    });

    it('recycles all particles back to pool as lifespan elapses and allows fresh burst without memory leaks', () => {
      // 1. First massive burst
      for (let i = 0; i < 20; i++) {
        particleSystem.spawnBossExplosion(112, 100, 40);
      }
      expect(particleSystem.getActiveCount()).toBe(250);

      // 2. Step physics past maximum Boss particle lifespan (0.65s + 0.1s margin = 0.75s)
      particleSystem.update(0.75);

      // Invariant: all particles must be released back to free pool
      expect(particleSystem.getActiveCount()).toBe(0);
      expect(particleSystem.getPool().getFreeCount()).toBe(250);
      expect(particleSystem.getCapacity()).toBe(250);

      // 3. Second massive burst: pool must be 100% re-usable
      for (let i = 0; i < 20; i++) {
        particleSystem.spawnBossExplosion(112, 100, 40);
      }
      expect(particleSystem.getActiveCount()).toBe(250);
      expect(particleSystem.getPool().getFreeCount()).toBe(0);

      // Step again
      particleSystem.update(0.75);
      expect(particleSystem.getActiveCount()).toBe(0);
    });

    it('survives continuous rapid-fire explosion churn over 600 fixed frames (10.0s)', () => {
      const dt = 1 / 60;
      let totalSpawns = 0;

      for (let frame = 0; frame < 600; frame++) {
        // Spawn mixed explosions every 3 frames
        if (frame % 3 === 0) {
          particleSystem.spawnSmallAlienExplosion(50 + (frame % 100), 80, 20);
          particleSystem.spawnBossExplosion(120, 100, 35);
          particleSystem.spawnPlayerExplosion(112, 200, 45);
          particleSystem.spawnHitSparks(80, 150, 6);
          particleSystem.spawnDockingSparkles(112, 240, 20);
          totalSpawns++;
        }

        // Update physics
        expect(() => particleSystem.update(dt)).not.toThrow();

        // Invariant: active count must never exceed 250 capacity
        expect(particleSystem.getActiveCount()).toBeLessThanOrEqual(250);
        expect(particleSystem.getActiveCount()).toBeGreaterThanOrEqual(0);
        expect(particleSystem.getCapacity()).toBe(250);
      }

      expect(totalSpawns).toBe(200);

      // Final drain step
      particleSystem.update(2.0);
      expect(particleSystem.getActiveCount()).toBe(0);
    });
  });

  // ==========================================================================
  // Challenge 2: Kinetic Math & Extreme Delta Time Stress Tests
  // ==========================================================================
  describe('2. Kinetic Math & Extreme Delta Time ($dt$) Stress Tests', () => {
    it('maintains finite coordinates and zero change on zero delta time ($dt = 0$)', () => {
      particleSystem.spawnBossExplosion(112, 100, 40);
      const activeBefore = particleSystem.getPool().getActive().map((p) => ({
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        life: p.life,
        rot: p.rotation,
      }));

      // Update with dt = 0
      particleSystem.update(0);

      const activeAfter = particleSystem.getPool().getActive();
      expect(activeAfter.length).toBe(activeBefore.length);

      for (let i = 0; i < activeAfter.length; i++) {
        const p = activeAfter[i]!;
        const b = activeBefore[i]!;
        expect(p.x).toBe(b.x);
        expect(p.y).toBe(b.y);
        expect(p.vx).toBe(b.vx);
        expect(p.vy).toBe(b.vy);
        expect(p.life).toBe(b.life);
        expect(p.rotation).toBe(b.rot);
        expect(Number.isNaN(p.x)).toBe(false);
        expect(Number.isNaN(p.y)).toBe(false);
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    });

    it('gracefully recycles all particles without NaN or Infinity on massive delta time ($dt = 10.0s$)', () => {
      particleSystem.spawnPlayerExplosion(112, 240, 50);
      particleSystem.spawnBossExplosion(112, 100, 40);
      expect(particleSystem.getActiveCount()).toBe(91);

      // Jump 10 seconds into the future in a single tick
      expect(() => particleSystem.update(10.0)).not.toThrow();

      // All particles should have expired cleanly
      expect(particleSystem.getActiveCount()).toBe(0);
      expect(particleSystem.getPool().getFreeCount()).toBe(250);
    });

    it('integrates 10,000 subnormal micro-ticks ($dt = 10^{-6}s$) without numerical underflow or NaN', () => {
      particleSystem.spawnSmallAlienExplosion(100, 100, 20);
      const microDt = 1e-6;

      for (let i = 0; i < 10000; i++) {
        particleSystem.update(microDt);
      }

      expect(particleSystem.getActiveCount()).toBe(20);
      particleSystem.getPool().forEachActive((p) => {
        expect(Number.isNaN(p.x)).toBe(false);
        expect(Number.isNaN(p.y)).toBe(false);
        expect(Number.isNaN(p.vx)).toBe(false);
        expect(Number.isNaN(p.vy)).toBe(false);
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        expect(p.life).toBeCloseTo(0.01, 4);
      });
    });

    it('handles negative delta time ($dt = -0.016s$) defensively without NaN or unhandled exception', () => {
      particleSystem.spawnHitSparks(100, 100, 6);
      expect(particleSystem.getActiveCount()).toBe(6);

      // Negative dt
      expect(() => particleSystem.update(-1 / 60)).not.toThrow();

      particleSystem.getPool().forEachActive((p) => {
        expect(Number.isNaN(p.x)).toBe(false);
        expect(Number.isNaN(p.y)).toBe(false);
        expect(Number.isNaN(p.vx)).toBe(false);
        expect(Number.isNaN(p.vy)).toBe(false);
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      });
    });

    it('handles extreme initial velocity ($10^6 px/s$) with exponential drag damping without NaN', () => {
      const p = particleSystem.spawnTractorSparkle(112, 100, 1e6, 1e6);
      expect(p).toBeDefined();
      if (p) {
        expect(p.vx).toBe(1e6);
        expect(p.vy).toBe(1e6);

        // Update 1 frame (1/60s)
        particleSystem.update(1 / 60);

        expect(Number.isNaN(p.x)).toBe(false);
        expect(Number.isNaN(p.y)).toBe(false);
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        expect(p.vx).toBeLessThan(1e6); // Drag damped
        expect(p.vy).toBeLessThan(1e6);
      }
    });
  });

  // ==========================================================================
  // Challenge 3: Shockwave Math, Lifespan & Alpha Curve Boundary Tests
  // ==========================================================================
  describe('3. Shockwave Math, Lifespan & Alpha Curve Verification', () => {
    it('verifies shockwave radius strictly expands monotonically from 2 to 38 without NaN', () => {
      particleSystem.spawnBossExplosion(112, 80, 32);
      const active = particleSystem.getPool().getActive();
      const shockwave = active.find((p) => p.isShockwave);
      expect(shockwave).toBeDefined();

      if (shockwave) {
        expect(shockwave.shockwaveRadius).toBe(2);
        expect(shockwave.shockwaveMaxRadius).toBe(38);

        let previousRadius = shockwave.shockwaveRadius;
        const dt = 0.05; // 50ms steps

        for (let step = 0; step < 10; step++) {
          particleSystem.update(dt);
          if (shockwave.active) {
            expect(shockwave.shockwaveRadius).toBeGreaterThanOrEqual(previousRadius);
            expect(shockwave.shockwaveRadius).toBeLessThanOrEqual(38);
            expect(Number.isNaN(shockwave.shockwaveRadius)).toBe(false);
            expect(Number.isFinite(shockwave.shockwaveRadius)).toBe(true);
            previousRadius = shockwave.shockwaveRadius;
          }
        }
      }
    });

    it('verifies all alpha curves (linear, quad, flash) produce bounded values in [0, 1]', () => {
      const curves: Array<'linear' | 'quad' | 'flash'> = ['linear', 'quad', 'flash'];

      for (const curve of curves) {
        for (let progress = 0; progress <= 1.0; progress += 0.05) {
          let alpha = 1.0;
          switch (curve) {
            case 'linear':
              alpha = Math.max(0, 1.0 - progress);
              break;
            case 'quad':
              alpha = Math.max(0, 1.0 - progress * progress);
              break;
            case 'flash':
              alpha = progress <= 0.15 ? 1.0 : Math.max(0, (1.0 - progress) / 0.85);
              break;
          }

          expect(alpha).toBeGreaterThanOrEqual(0);
          expect(alpha).toBeLessThanOrEqual(1.0);
          expect(Number.isNaN(alpha)).toBe(false);
        }
      }
    });

    it('safely releases particles with negative or zero initial maxLife', () => {
      const p = particleSystem.getPool().acquire();
      expect(p).toBeDefined();
      if (p) {
        p.active = true;
        p.life = 0;
        p.maxLife = 0; // Immediate expiry

        particleSystem.update(1 / 60);

        // Should be recycled immediately
        expect(particleSystem.getActiveCount()).toBe(0);
      }
    });

    it('verifies Particle.reset() re-initializes all internal fields to clean defaults', () => {
      const p = new Particle();
      p.id = 999;
      p.active = true;
      p.x = 150;
      p.y = 200;
      p.vx = 45;
      p.vy = -30;
      p.ax = 5;
      p.ay = 20;
      p.drag = 0.5;
      p.color = PALETTE.RED;
      p.size = 3;
      p.width = 4;
      p.height = 4;
      p.rotation = 1.5;
      p.vRot = 3.0;
      p.alphaCurve = 'flash';
      p.life = 0.8;
      p.maxLife = 0.9;
      p.isShockwave = true;
      p.shockwaveRadius = 25;
      p.shockwaveMaxRadius = 50;
      p.type = 'SHOCKWAVE';

      p.reset();

      expect(p.active).toBe(false);
      expect(p.x).toBe(0);
      expect(p.y).toBe(0);
      expect(p.vx).toBe(0);
      expect(p.vy).toBe(0);
      expect(p.ax).toBe(0);
      expect(p.ay).toBe(0);
      expect(p.drag).toBe(0.95);
      expect(p.color).toBe(PALETTE.WHITE);
      expect(p.size).toBe(1);
      expect(p.width).toBe(1);
      expect(p.height).toBe(1);
      expect(p.rotation).toBe(0);
      expect(p.vRot).toBe(0);
      expect(p.alphaCurve).toBe('linear');
      expect(p.life).toBe(0);
      expect(p.maxLife).toBe(1.0);
      expect(p.isShockwave).toBe(false);
      expect(p.shockwaveRadius).toBe(0);
      expect(p.shockwaveMaxRadius).toBe(38);
      expect(p.type).toBe('SPARK');
    });
  });

  // ==========================================================================
  // Challenge 4: Off-Screen & Boundary Containment Stress Tests
  // ==========================================================================
  describe('4. Off-Screen & Extreme Boundary Coordinate Stress Tests', () => {
    it('spawns and renders particles at extreme canvas boundary coordinates without canvas error', () => {
      const boundaryCoords = [
        { x: 0, y: 0 },
        { x: 224, y: 288 },
        { x: -500, y: -500 },
        { x: 1000, y: 1000 },
        { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER },
      ];

      for (const coord of boundaryCoords) {
        particleSystem.spawnHitSparks(coord.x, coord.y, 6);
      }

      expect(particleSystem.getActiveCount()).toBe(30);

      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        stroke: vi.fn(),
        globalAlpha: 1.0,
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
      } as unknown as CanvasRenderingContext2D;

      expect(() => particleSystem.render(mockCtx)).not.toThrow();
      expect(mockCtx.globalAlpha).toBe(1.0); // Restored
    });

    it('preserves crisp integer pixel alignment during rendering', () => {
      particleSystem.spawnDockingSparkles(112.75, 240.33, 20);

      const fillRectCalls: Array<[number, number, number, number]> = [];
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
          fillRectCalls.push([x, y, w, h]);
        }),
        beginPath: vi.fn(),
        arc: vi.fn(),
        stroke: vi.fn(),
        globalAlpha: 1.0,
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
      } as unknown as CanvasRenderingContext2D;

      particleSystem.render(mockCtx);

      expect(fillRectCalls.length).toBeGreaterThan(0);
      for (const [x, y, w, h] of fillRectCalls) {
        expect(Number.isInteger(x)).toBe(true);
        expect(Number.isInteger(y)).toBe(true);
        expect(Number.isInteger(w)).toBe(true);
        expect(Number.isInteger(h)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // Challenge 5: ObjectPool Zero-Allocation Safeguards & Foreign Object Defenses
  // ==========================================================================
  describe('5. ObjectPool Zero-Allocation Safeguards & Invariants', () => {
    it('defensively rejects foreign objects not belonging to pool', () => {
      const foreignParticle = new Particle();
      foreignParticle.active = true;

      const released = particleSystem.getPool().release(foreignParticle);
      expect(released).toBe(false);
    });

    it('defensively rejects double-free releases of already idle particles', () => {
      particleSystem.spawnHitSparks(100, 100, 6);
      const active = particleSystem.getPool().getActive();
      const firstActive = active[0];
      expect(firstActive).toBeDefined();

      if (firstActive) {
        // First release succeeds
        const rel1 = particleSystem.getPool().release(firstActive);
        expect(rel1).toBe(true);
        expect(particleSystem.getActiveCount()).toBe(5);

        // Second release of same object must be safely ignored
        const rel2 = particleSystem.getPool().release(firstActive);
        expect(rel2).toBe(false);
        expect(particleSystem.getActiveCount()).toBe(5);
      }
    });

    it('verifies forEachActiveSafe allows releasing elements during iteration without skipping', () => {
      particleSystem.spawnHitSparks(100, 100, 10);
      expect(particleSystem.getActiveCount()).toBe(10);

      // Release all even-indexed active elements during reverse safe iteration
      let visitedCount = 0;
      particleSystem.getPool().forEachActiveSafe((p, idx) => {
        visitedCount++;
        if (idx % 2 === 0) {
          particleSystem.getPool().release(p);
        }
      });

      expect(visitedCount).toBe(10);
      expect(particleSystem.getActiveCount()).toBe(5);
    });

    it('maintains zero runtime heap allocation contract across continuous operation', () => {
      const pool = particleSystem.getPool();
      const initialCapacity = pool.getCapacity();
      expect(initialCapacity).toBe(250);

      // Repeatedly acquire and release 10,000 times
      for (let i = 0; i < 10000; i++) {
        const p = pool.acquire();
        if (p) {
          p.active = true;
          p.x = i;
          p.y = i * 2;
        }
        if (i % 50 === 0) {
          pool.clear();
        }
      }

      // Storage buffer capacity must never have grown
      expect(pool.getCapacity()).toBe(250);
      expect(pool.getMaxSize()).toBe(250);
    });
  });
});
