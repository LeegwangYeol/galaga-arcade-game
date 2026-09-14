/**
 * Galaga Arcade Web Game — Milestone 14: Adversarial Canvas 2D VFX Shaders & Particle Bounds
 * 
 * Challenger Agent: m14_challenger_2
 * Role: EMPIRICAL CHALLENGER (critic, specialist)
 * 
 * Rigorous adversarial verification suite targeting Milestone 14:
 * 1. 1,000-frame continuous extreme saturation test under simultaneous:
 *    - Warp Ram (Float32Array speed lines, Doppler wake particles, invulnerable surge)
 *    - Chrono Freeze (Frost vignette rim bars, breathing corner crystals, starfield freeze)
 *    - Aeternum Mega-Beam (60% danger zone dashed guides, jitter core laser, linear gradient firing beam)
 *    - Nanite Swarm Cloud (Brownian motes Float32Array, electric micro-arcs)
 *    - Psionic Phantoms (Dual phantoms, horizontal jitter, chromatic silhouette after-images, breathing alpha)
 *    - Continuous 50+ active particles (Nova impacts, Warp wakes, Nanite dissolves, Shockwaves)
 *    - The Contingency (96 CRT scanlines, rolling V-sync bar, matrix digital rain drops)
 *    - Camera screen shake (intermittent high-amplitude triggers with decay verification)
 * 2. Zero TypedArray re-allocations (strict buffer pointer identity and invariant byte lengths).
 * 3. Zero ObjectPool capacity expansions with autoExpand: false (exhaustion and boundary clamping).
 * 4. Camera screen shake mathematical decay to 0 and HUD isolation.
 * 5. Canvas coordinate bounds sanity (strict oracle interceptor verifying 0 NaN, 0 Infinity, valid alpha).
 * 6. Starfield freeze state halting velocity and restoring cleanly upon freeze expiry.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { Starfield, STARFIELD_ICE_COLORS, STARFIELD_COLORS } from '../../src/systems/Starfield';
import { ParticleSystem, Particle } from '../../src/systems/ParticleSystem';
import { SpriteRenderer } from '../../src/renderer/SpriteRenderer';
import { SpecialMovesManager } from '../../src/core/specials/SpecialMovesManager';
import { SpecialMoveType } from '../../src/core/specials/types';
import { NovaMissile } from '../../src/core/specials/pools/NovaMissile';
import { TheContingencyEvent } from '../../src/core/crisis/events/TheContingencyEvent';

function createStrictAdversarialContext() {
  function assertFinite(val: any, method: string, paramName: string) {
    if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
      throw new Error(`[Canvas Bounds Violation] Method '${method}' received invalid '${paramName}': ${val}`);
    }
  }

  const gradientMock = {
    addColorStop: vi.fn((offset: number, _color: string) => {
      assertFinite(offset, 'addColorStop', 'offset');
      if (offset < 0 || offset > 1) {
        throw new Error(`[Canvas Bounds Violation] addColorStop offset out of [0, 1] range: ${offset}`);
      }
    }),
  };

  let currentGlobalAlpha = 1.0;
  let saveRestoreStackDepth = 0;

  const ctx = {
    get stackDepth() {
      return saveRestoreStackDepth;
    },
    save: vi.fn(() => {
      saveRestoreStackDepth++;
    }),
    restore: vi.fn(() => {
      saveRestoreStackDepth--;
    }),
    translate: vi.fn((x: number, y: number) => {
      assertFinite(x, 'translate', 'x');
      assertFinite(y, 'translate', 'y');
    }),
    rotate: vi.fn((angle: number) => {
      assertFinite(angle, 'rotate', 'angle');
    }),
    scale: vi.fn((x: number, y: number) => {
      assertFinite(x, 'scale', 'x');
      assertFinite(y, 'scale', 'y');
    }),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn((x: number, y: number) => {
      assertFinite(x, 'moveTo', 'x');
      assertFinite(y, 'moveTo', 'y');
    }),
    lineTo: vi.fn((x: number, y: number) => {
      assertFinite(x, 'lineTo', 'x');
      assertFinite(y, 'lineTo', 'y');
    }),
    arc: vi.fn((x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
      assertFinite(x, 'arc', 'x');
      assertFinite(y, 'arc', 'y');
      assertFinite(radius, 'arc', 'radius');
      assertFinite(startAngle, 'arc', 'startAngle');
      assertFinite(endAngle, 'arc', 'endAngle');
      if (radius < 0) {
        throw new Error(`[Canvas Bounds Violation] Negative radius in arc: ${radius}`);
      }
    }),
    rect: vi.fn((x: number, y: number, w: number, h: number) => {
      assertFinite(x, 'rect', 'x');
      assertFinite(y, 'rect', 'y');
      assertFinite(w, 'rect', 'w');
      assertFinite(h, 'rect', 'h');
    }),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      assertFinite(x, 'fillRect', 'x');
      assertFinite(y, 'fillRect', 'y');
      assertFinite(w, 'fillRect', 'w');
      assertFinite(h, 'fillRect', 'h');
    }),
    strokeRect: vi.fn((x: number, y: number, w: number, h: number) => {
      assertFinite(x, 'strokeRect', 'x');
      assertFinite(y, 'strokeRect', 'y');
      assertFinite(w, 'strokeRect', 'w');
      assertFinite(h, 'strokeRect', 'h');
    }),
    clearRect: vi.fn((x: number, y: number, w: number, h: number) => {
      assertFinite(x, 'clearRect', 'x');
      assertFinite(y, 'clearRect', 'y');
      assertFinite(w, 'clearRect', 'w');
      assertFinite(h, 'clearRect', 'h');
    }),
    stroke: vi.fn(),
    fill: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    setLineDash: vi.fn((dash: number[]) => {
      for (const d of dash) {
        assertFinite(d, 'setLineDash', 'dash element');
      }
    }),
    createLinearGradient: vi.fn((x0: number, y0: number, x1: number, y1: number) => {
      assertFinite(x0, 'createLinearGradient', 'x0');
      assertFinite(y0, 'createLinearGradient', 'y0');
      assertFinite(x1, 'createLinearGradient', 'x1');
      assertFinite(y1, 'createLinearGradient', 'y1');
      return gradientMock;
    }),
    createRadialGradient: vi.fn((x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => {
      assertFinite(x0, 'createRadialGradient', 'x0');
      assertFinite(y0, 'createRadialGradient', 'y0');
      assertFinite(r0, 'createRadialGradient', 'r0');
      assertFinite(x1, 'createRadialGradient', 'x1');
      assertFinite(y1, 'createRadialGradient', 'y1');
      assertFinite(r1, 'createRadialGradient', 'r1');
      return gradientMock;
    }),
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    get globalAlpha() {
      return currentGlobalAlpha;
    },
    set globalAlpha(val: number) {
      assertFinite(val, 'set globalAlpha', 'value');
      if (val < -0.001 || val > 1.001) {
        throw new Error(`[Canvas Bounds Violation] globalAlpha out of bounds [0, 1]: ${val}`);
      }
      currentGlobalAlpha = Math.max(0, Math.min(1.0, val));
    },
    lineDashOffset: 0,
    imageSmoothingEnabled: false,
    shadowBlur: 0,
    shadowColor: '',
  };

  return ctx;
}

describe('Milestone 14 Adversarial Verification: Canvas 2D VFX Shaders & Particle Bounds', () => {
  let strictCtx: ReturnType<typeof createStrictAdversarialContext>;

  beforeEach(() => {
    strictCtx = createStrictAdversarialContext();
    SpriteRenderer.initialize();
  });

  // ==========================================================================
  // Dimension 1: 1,000-Frame Continuous Extreme Saturation Test
  // ==========================================================================

  describe('Dimension 1: 1,000-Frame Continuous Extreme Saturation Test', () => {
    it('survives 1,000 frames under full concurrent VFX saturation without NaN, Infinity, or pool expansion', () => {
      const game = new Game();
      const ps = game.getParticleSystem();
      const smm = game.getSpecialMovesManager();
      const starfield = game.getStarfield();

      // Crisis context setup for The Contingency
      const contingency = new TheContingencyEvent();
      const crisisContext = {
        game,
        player: game.player,
        bulletManager: game.bulletManager,
        formationManager: game.formationManager,
        starfield,
        particleSystem: ps,
        soundSynth: game.soundSynth,
        scoreManager: game.scoreManager,
        stage: 25,
      };
      contingency.init(crisisContext as any);
      contingency.activate();

      // Pre-allocated Nanite Swarm Brownian motes
      const naniteMoteCount = 20;
      const naniteR = new Float32Array(naniteMoteCount);
      const naniteTheta = new Float32Array(naniteMoteCount);
      const naniteSize = new Float32Array(naniteMoteCount);
      for (let i = 0; i < naniteMoteCount; i++) {
        naniteR[i] = 8 + (i % 6) * 2;
        naniteTheta[i] = (i * 2 * Math.PI) / naniteMoteCount;
        naniteSize[i] = (i % 2) + 1;
      }

      // Track initial TypedArray buffer identities
      const initialSpeedLineXBuf = smm.speedLineX.buffer;
      const initialSpeedLineYBuf = smm.speedLineY.buffer;
      const initialSpeedLineLenBuf = smm.speedLineLen.buffer;
      const initialSpeedLineSpeedBuf = smm.speedLineSpeed.buffer;
      const initialNaniteRBuf = naniteR.buffer;
      const initialNaniteThetaBuf = naniteTheta.buffer;
      const initialNaniteSizeBuf = naniteSize.buffer;

      // Particle pool baseline capacity
      const initialParticleCapacity = ps.getCapacity();
      const maxParticleCapacity = ps.getMaxSize();
      expect(initialParticleCapacity).toBe(250);
      expect(maxParticleCapacity).toBe(250);

      const fixedDt = 1 / 60; // 0.016667s

      // Set initial Chrono Freeze on starfield
      starfield.setChronoFrozen(true);

      for (let frame = 0; frame < 1000; frame++) {
        const simTime = frame * fixedDt;

        // 1. Maintain Warp Ram active continuously
        smm.warpRamTimer = 1.0;
        smm.selectedMove = SpecialMoveType.WARP_RAM;

        // 2. Maintain Chrono Freeze active
        smm.chronoFreezeTimer = 3.0;

        // 3. Trigger Screen Shake periodically with high amplitude
        if (frame % 200 === 0 && frame < 800) {
          game.triggerScreenShake(3.0, 0.4); // High shake intensity 3.0px
        }

        // 4. Maintain continuous 50+ active particles
        while (ps.getActiveCount() < 50) {
          ps.spawnNovaImpact(112, 100, 14);
          ps.spawnWarpWake(112, 200, 0, 80);
          ps.spawnNaniteDissolve(100, 150, 6);
          ps.spawnBossExplosion(112, 80, 20);
        }

        // Verify active particles count is strictly within pool capacity
        expect(ps.getActiveCount()).toBeGreaterThanOrEqual(50);
        expect(ps.getActiveCount()).toBeLessThanOrEqual(250);

        // 5. Update Game Engine & Crisis
        game.update(fixedDt);
        (contingency as any).onActiveUpdate(fixedDt);

        // 6. Update Nanite motes Brownian motion
        for (let i = 0; i < naniteMoteCount; i++) {
          naniteR[i] = 10 + Math.sin(simTime * 8.0 + i) * 5;
          naniteTheta[i] = (naniteTheta[i]! + 0.08) % (Math.PI * 2);
        }

        // 7. Render all concurrent Milestone 14 VFX shaders onto strict adversarial context
        // 7a. Chrono Freeze frost vignette
        SpriteRenderer.drawChronoFrostVignette(strictCtx as any, 224, 288, simTime);

        // 7b. Targeting Reticles
        SpriteRenderer.drawTargetingReticle(strictCtx as any, 112, 120, 16, 16, true, simTime);
        SpriteRenderer.drawTargetingReticle(strictCtx as any, 50, 80, 20, 20, false, simTime);

        // 7c. Warp Speed Lines
        SpriteRenderer.drawWarpSpeedLines(
          strictCtx as any,
          smm.speedLineX,
          smm.speedLineY,
          smm.speedLineLen,
          SpecialMovesManager.SPEED_LINE_COUNT,
          0.85
        );

        // 7d. Aeternum Mega-Beam: alternate charging guides and full-bore plasma firing
        const isMegaBeamCharging = (frame % 120) < 50;
        const isMegaBeamFiring = (frame % 120) >= 50;
        const beamChargeProgress = isMegaBeamCharging ? ((frame % 120) / 50) : 1.0;
        SpriteRenderer.drawAeternumMegaBeam(
          strictCtx as any,
          112, // Center of 224 virtual canvas
          134, // 60% of canvas width (224 * 0.6 = 134.4)
          30,  // Top Y
          288, // Bottom Y
          isMegaBeamCharging,
          isMegaBeamFiring,
          beamChargeProgress,
          simTime
        );

        // 7e. Psionic Phantoms (Phantom 0 and Phantom 1)
        SpriteRenderer.drawPsionicPhantom(strictCtx as any, 'BOSS_PSIONIC', 60, 90, 0, simTime);
        SpriteRenderer.drawPsionicPhantom(strictCtx as any, 'BOSS_PSIONIC', 164, 90, 1, simTime);

        // 7f. Nanite Swarm Cloud (Brownian motes + micro-arcs)
        SpriteRenderer.drawNaniteCloud(
          strictCtx as any,
          112,
          140,
          naniteR,
          naniteTheta,
          naniteSize,
          naniteMoteCount,
          simTime
        );

        // 7g. Contingency CRT Scanlines & V-sync refresh bar
        contingency.render(strictCtx as any);

        // 7h. Particle System Render Pass
        ps.render(strictCtx as any);

        // 7i. Starfield Render Pass (in frozen state)
        starfield.render(strictCtx as any);

        // 7j. Game master render pass
        game.render(strictCtx as any);
      }

      // Assert zero TypedArray re-allocations occurred across the 1,000-frame run
      expect(smm.speedLineX.buffer).toBe(initialSpeedLineXBuf);
      expect(smm.speedLineY.buffer).toBe(initialSpeedLineYBuf);
      expect(smm.speedLineLen.buffer).toBe(initialSpeedLineLenBuf);
      expect(smm.speedLineSpeed.buffer).toBe(initialSpeedLineSpeedBuf);
      expect(naniteR.buffer).toBe(initialNaniteRBuf);
      expect(naniteTheta.buffer).toBe(initialNaniteThetaBuf);
      expect(naniteSize.buffer).toBe(initialNaniteSizeBuf);

      // Assert Particle pool capacity did not expand (autoExpand: false invariant)
      expect(ps.getCapacity()).toBe(initialParticleCapacity);
      expect(ps.getMaxSize()).toBe(maxParticleCapacity);

      // By frame 1000 (>200 frames after last shake at frame 799), screen shake MUST have decayed to 0
      expect(game.shakeOffsetX).toBe(0);
      expect(game.shakeOffsetY).toBe(0);
    }, 25000);
  });

  // ==========================================================================
  // Dimension 2: TypedArray Re-allocation & Reference Invariance
  // ==========================================================================

  describe('Dimension 2: TypedArray Re-allocation Invariance', () => {
    it('guarantees SpecialMovesManager, Starfield, and Contingency buffers never reallocate', () => {
      const game = new Game();
      const smm = game.getSpecialMovesManager();
      const starfield = game.getStarfield();
      const contingency = new TheContingencyEvent();
      contingency.init({
        game,
        player: game.player,
        bulletManager: game.bulletManager,
        formationManager: game.formationManager,
        starfield,
        particleSystem: game.particleSystem,
        soundSynth: game.soundSynth,
        scoreManager: game.scoreManager,
        stage: 10,
      } as any);

      // Extract internal buffers
      const initialSmmX = smm.speedLineX;
      const initialSmmY = smm.speedLineY;
      const initialSmmLen = smm.speedLineLen;
      const initialSmmSpeed = smm.speedLineSpeed;

      const starDepths = (starfield as any).starDepths as Float32Array;
      const starSizes = (starfield as any).starSizes as Uint8Array;
      const initialStarDepthsBuf = starDepths.buffer;
      const initialStarSizesBuf = starSizes.buffer;

      const matrixDropX = (contingency as any).matrixDropX as Float32Array;
      const matrixDropY = (contingency as any).matrixDropY as Float32Array;
      const matrixDropSpeed = (contingency as any).matrixDropSpeed as Float32Array;
      const initialDropXBuf = matrixDropX.buffer;
      const initialDropYBuf = matrixDropY.buffer;
      const initialDropSpeedBuf = matrixDropSpeed.buffer;

      // Advance 500 ticks of rapid state changes
      for (let i = 0; i < 500; i++) {
        smm.warpRamTimer = 1.0;
        smm.update(0.016);
        starfield.update(0.016);
        (contingency as any).onActiveUpdate(0.016);
      }

      // Assert references and buffer byte lengths are identical
      expect(smm.speedLineX).toBe(initialSmmX);
      expect(smm.speedLineY).toBe(initialSmmY);
      expect(smm.speedLineLen).toBe(initialSmmLen);
      expect(smm.speedLineSpeed).toBe(initialSmmSpeed);

      expect((starfield as any).starDepths.buffer).toBe(initialStarDepthsBuf);
      expect((starfield as any).starSizes.buffer).toBe(initialStarSizesBuf);

      expect((contingency as any).matrixDropX.buffer).toBe(initialDropXBuf);
      expect((contingency as any).matrixDropY.buffer).toBe(initialDropYBuf);
      expect((contingency as any).matrixDropSpeed.buffer).toBe(initialDropSpeedBuf);
    });

    it('NovaMissile ring buffer retains exact 5-element size across full trajectory', () => {
      const missile = new NovaMissile(1);
      missile.init(100, 200, -Math.PI / 2);

      const trailXBuf = missile.trailX.buffer;
      const trailYBuf = missile.trailY.buffer;

      // Update missile for 200 ticks beyond its max lifecycle
      for (let i = 0; i < 200; i++) {
        missile.update(0.016);
      }

      expect(missile.trailX.buffer).toBe(trailXBuf);
      expect(missile.trailY.buffer).toBe(trailYBuf);
      expect(missile.trailX.length).toBe(5);
      expect(missile.trailY.length).toBe(5);
    });
  });

  // ==========================================================================
  // Dimension 3: ObjectPool Bounds & autoExpand: false Protection
  // ==========================================================================

  describe('Dimension 3: ObjectPool Bounds & autoExpand: false Protection', () => {
    it('strictly caps ParticleSystem pool at 250 without heap expansion under overflow requests', () => {
      const ps = new ParticleSystem({ maxParticles: 250 });
      const pool = ps.getPool();

      expect(pool.getCapacity()).toBe(250);
      expect(pool.getMaxSize()).toBe(250);
      expect(pool.getActiveCount()).toBe(0);

      // Acquire all 250 particles
      const acquired: Particle[] = [];
      for (let i = 0; i < 250; i++) {
        const p = pool.acquire();
        expect(p).not.toBeNull();
        if (p) acquired.push(p);
      }

      expect(pool.getActiveCount()).toBe(250);
      expect(pool.isFull()).toBe(true);

      // Attempt to acquire 50 more particles when pool is 100% saturated
      for (let i = 0; i < 50; i++) {
        const overflow = pool.acquire();
        expect(overflow).toBeNull(); // Must gracefully return null without throwing
      }

      // Capacity must remain strictly 250
      expect(pool.getCapacity()).toBe(250);
      expect(pool.getActiveCount()).toBe(250);

      // Clean release of 100 particles
      for (let i = 0; i < 100; i++) {
        const p = acquired.pop();
        if (p) pool.release(p);
      }

      expect(pool.getActiveCount()).toBe(150);
      expect(pool.getFreeCount()).toBe(100);

      // Immediate re-acquisition operates cleanly from recycled storage
      for (let i = 0; i < 50; i++) {
        const reacquired = pool.acquire();
        expect(reacquired).not.toBeNull();
      }

      expect(pool.getActiveCount()).toBe(200);
      expect(pool.getCapacity()).toBe(250);
    });

    it('NovaMissile and EnergySpark pools in SpecialMovesManager are bounded to 32', () => {
      const game = new Game();
      const smm = game.getSpecialMovesManager();
      const missilePool = smm.getMissilePool();
      const sparkPool = smm.getSparkPool();

      expect(missilePool.getCapacity()).toBe(32);
      expect(missilePool.getMaxSize()).toBe(32);
      expect(sparkPool.getCapacity()).toBe(32);
      expect(sparkPool.getMaxSize()).toBe(32);

      // Acquire all 32 missiles
      const missiles = [];
      for (let i = 0; i < 32; i++) {
        missiles.push(missilePool.acquire());
      }
      expect(missilePool.acquire()).toBeNull(); // 33rd acquisition rejected
      expect(missilePool.getCapacity()).toBe(32);

      // Acquire all 32 sparks
      const sparks = [];
      for (let i = 0; i < 32; i++) {
        sparks.push(sparkPool.acquire());
      }
      expect(sparkPool.acquire()).toBeNull(); // 33rd acquisition rejected
      expect(sparkPool.getCapacity()).toBe(32);

      // Clear returns all to idle pool
      missilePool.clear();
      sparkPool.clear();
      expect(missilePool.getActiveCount()).toBe(0);
      expect(sparkPool.getActiveCount()).toBe(0);
      expect(missilePool.getCapacity()).toBe(32);
      expect(sparkPool.getCapacity()).toBe(32);
    });
  });

  // ==========================================================================
  // Dimension 4: Camera Screen Shake Mathematical Decay & Layer Isolation
  // ==========================================================================

  describe('Dimension 4: Camera Screen Shake Decay & Layer Isolation', () => {
    it('decays shake offset to strictly (0, 0) past duration', () => {
      const game = new Game();

      // Trigger 2.5px shake for 0.4s
      game.triggerScreenShake(2.5, 0.4);
      expect(game.shakeIntensity).toBe(2.5);
      expect(game.shakeDuration).toBe(0.4);

      // Half duration: active shake with bounded integer offsets
      game.updateScreenShake(0.2);
      expect(Math.abs(game.shakeOffsetX)).toBeLessThanOrEqual(3);
      expect(Math.abs(game.shakeOffsetY)).toBeLessThanOrEqual(3);
      expect(Number.isInteger(game.shakeOffsetX)).toBe(true);
      expect(Number.isInteger(game.shakeOffsetY)).toBe(true);

      // Beyond duration: strict zero decay
      game.updateScreenShake(0.25);
      expect(game.shakeOffsetX).toBe(0);
      expect(game.shakeOffsetY).toBe(0);

      // Extra frames remain at (0, 0)
      game.updateScreenShake(0.1);
      expect(game.shakeOffsetX).toBe(0);
      expect(game.shakeOffsetY).toBe(0);
    });

    it('handles zero or negative duration defensively', () => {
      const game = new Game();

      // Zero duration
      game.triggerScreenShake(2.0, 0);
      game.updateScreenShake(0.016);
      expect(game.shakeOffsetX).toBe(0);
      expect(game.shakeOffsetY).toBe(0);

      // Negative duration
      game.triggerScreenShake(2.0, -0.5);
      game.updateScreenShake(0.016);
      expect(game.shakeOffsetX).toBe(0);
      expect(game.shakeOffsetY).toBe(0);
    });

    it('survives rapid-fire shake triggers every single frame without NaN or divergence', () => {
      const game = new Game();

      for (let i = 0; i < 120; i++) {
        game.triggerScreenShake(3.0, 0.2);
        game.updateScreenShake(0.016);

        expect(Number.isFinite(game.shakeOffsetX)).toBe(true);
        expect(Number.isFinite(game.shakeOffsetY)).toBe(true);
        expect(Number.isNaN(game.shakeOffsetX)).toBe(false);
        expect(Number.isNaN(game.shakeOffsetY)).toBe(false);
        expect(Math.abs(game.shakeOffsetX)).toBeLessThanOrEqual(4);
        expect(Math.abs(game.shakeOffsetY)).toBeLessThanOrEqual(4);
      }

      // After rapid firing stops, let 0.3s pass -> must decay to 0
      for (let i = 0; i < 30; i++) {
        game.updateScreenShake(0.016);
      }
      expect(game.shakeOffsetX).toBe(0);
      expect(game.shakeOffsetY).toBe(0);
    });

    it('isolates world layer camera translation and restores HUD in un-translated space', () => {
      const game = new Game();
      game.triggerScreenShake(3.0, 1.0);
      game.shakeOffsetX = 3;
      game.shakeOffsetY = -2;

      game.render(strictCtx as any);

      // Check translate was called with current offsets
      expect(strictCtx.translate).toHaveBeenCalledWith(3, -2);

      // Stack depth must return to 0 (all ctx.save() balanced by ctx.restore())
      expect(strictCtx.stackDepth).toBe(0);
    });
  });

  // ==========================================================================
  // Dimension 5: Starfield Freeze Kinematic Halting & Clean Resumption
  // ==========================================================================

  describe('Dimension 5: Starfield Freeze Kinematics & Resumption', () => {
    it('halts star positions and twinkle phases during Chrono Freeze, then restores cleanly', () => {
      const starfield = new Starfield(224, 288, 50);
      starfield.setSpeedState('WARP'); // High speed multiplier ~6.5

      // Step 1: Advance 5 frames in normal unfrozen mode to establish baseline motion
      for (let i = 0; i < 5; i++) {
        starfield.update(0.016);
      }

      const stars = starfield.getStars();
      expect(stars.length).toBe(50);

      // Snapshot positions and twinkle phases
      const frozenY = stars.map((s) => s.y);
      const frozenTwinkle = stars.map((s) => s.twinklePhase);

      // Step 2: Activate Chrono Freeze
      starfield.setChronoFrozen(true);
      expect(starfield.isChronoFrozen).toBe(true);

      // Advance 100 frames during freeze
      for (let i = 0; i < 100; i++) {
        starfield.update(0.016);
      }

      // Invariant 1: Not a single star coordinate or twinkle phase moved
      for (let i = 0; i < stars.length; i++) {
        expect(stars[i]!.y).toBe(frozenY[i]);
        expect(stars[i]!.twinklePhase).toBe(frozenTwinkle[i]);
      }

      // Invariant 2: Render in frozen state outputs ice colors
      starfield.render(strictCtx as any);
      expect(strictCtx.fillRect).toHaveBeenCalled();
      expect(STARFIELD_ICE_COLORS).toContain(strictCtx.fillStyle);

      // Step 3: Release Chrono Freeze
      starfield.setChronoFrozen(false);
      expect(starfield.isChronoFrozen).toBe(false);

      // Advance 1 frame in unfrozen state
      starfield.update(0.016);

      // Invariant 3: Velocity and twinkling immediately resume
      let movedCount = 0;
      for (let i = 0; i < stars.length; i++) {
        if (stars[i]!.y !== frozenY[i] || stars[i]!.twinklePhase !== frozenTwinkle[i]) {
          movedCount++;
        }
      }
      expect(movedCount).toBe(50); // 100% of stars resumed motion

      // Invariant 4: Render in normal state restores standard color palette
      strictCtx.fillRect.mockClear();
      starfield.render(strictCtx as any);
      expect(strictCtx.fillRect).toHaveBeenCalled();
      const allStandardColors = [
        ...STARFIELD_COLORS.LAYER_0,
        ...STARFIELD_COLORS.LAYER_1,
        ...STARFIELD_COLORS.LAYER_2,
      ];
      expect(allStandardColors).toContain(strictCtx.fillStyle);
    });

    it('survives rapid freeze/unfreeze toggling without position jumps or NaN', () => {
      const starfield = new Starfield(224, 288, 30);
      starfield.setSpeedState('DIVING');

      for (let i = 0; i < 60; i++) {
        starfield.setChronoFrozen(i % 2 === 0);
        starfield.update(0.016);

        for (const star of starfield.getStars()) {
          expect(Number.isFinite(star.x)).toBe(true);
          expect(Number.isFinite(star.y)).toBe(true);
          expect(Number.isFinite(star.twinklePhase)).toBe(star.twinklePhase !== undefined);
          expect(star.y).toBeGreaterThanOrEqual(0);
          expect(star.y).toBeLessThanOrEqual(288);
        }
      }
    }, 15000);
  });

  // ==========================================================================
  // Dimension 6: Procedural VFX Canvas Coordinate Bounds & Numerical Oracles
  // ==========================================================================

  describe('Dimension 6: Procedural VFX Canvas Coordinate Bounds', () => {
    it('drawChronoFrostVignette produces 0 NaN with boundary screen sizes', () => {
      // Standard resolution
      SpriteRenderer.drawChronoFrostVignette(strictCtx as any, 224, 288, 0.5);

      // Micro resolution
      SpriteRenderer.drawChronoFrostVignette(strictCtx as any, 16, 16, 1.2);

      // Large virtual resolution
      SpriteRenderer.drawChronoFrostVignette(strictCtx as any, 896, 1152, 99.9);

      // Zero timer
      SpriteRenderer.drawChronoFrostVignette(strictCtx as any, 224, 288, 0);

      // Negative timer
      SpriteRenderer.drawChronoFrostVignette(strictCtx as any, 224, 288, -5.0);
    });

    it('drawTargetingReticle produces 0 NaN with negative or zero target dimensions', () => {
      // Normal target
      SpriteRenderer.drawTargetingReticle(strictCtx as any, 100, 100, 16, 16, true, 0.5);

      // Zero dimensions (clamped by Math.max)
      SpriteRenderer.drawTargetingReticle(strictCtx as any, 100, 100, 0, 0, true, 1.0);

      // Negative dimensions
      SpriteRenderer.drawTargetingReticle(strictCtx as any, 100, 100, -10, -10, false, 2.0);

      // Extreme coordinates
      SpriteRenderer.drawTargetingReticle(strictCtx as any, -50, 400, 24, 24, true, 3.5);
    });

    it('drawWarpSpeedLines handles 0 count and extreme bounds gracefully', () => {
      const count = 24;
      const xArr = new Float32Array(count);
      const yArr = new Float32Array(count);
      const lenArr = new Float32Array(count);

      // Empty count -> returns early without draw calls
      SpriteRenderer.drawWarpSpeedLines(strictCtx as any, xArr, yArr, lenArr, 0, 0.5);

      // Negative count -> returns early
      SpriteRenderer.drawWarpSpeedLines(strictCtx as any, xArr, yArr, lenArr, -5, 0.5);

      // Active count with extreme coordinates
      for (let i = 0; i < count; i++) {
        xArr[i] = i * 10;
        yArr[i] = -20 + i * 15;
        lenArr[i] = 30;
      }
      SpriteRenderer.drawWarpSpeedLines(strictCtx as any, xArr, yArr, lenArr, count, 1.0);
    });

    it('drawAeternumMegaBeam produces 0 NaN with charging and firing transitions', () => {
      // Charging with chargeProgress 0.0 to 1.0
      for (let p = 0; p <= 1.0; p += 0.2) {
        SpriteRenderer.drawAeternumMegaBeam(strictCtx as any, 112, 134, 40, 288, true, false, p, p * 2);
      }

      // Firing with various stateTimers
      for (let t = 0; t <= 5.0; t += 0.5) {
        SpriteRenderer.drawAeternumMegaBeam(strictCtx as any, 112, 134, 40, 288, false, true, 1.0, t);
      }

      // Both false -> early return
      SpriteRenderer.drawAeternumMegaBeam(strictCtx as any, 112, 134, 40, 288, false, false, 0, 0);
    });

    it('drawPsionicPhantom handles high stateTimers and negative coordinates', () => {
      // High timer (e.g. 10,000s) to stress test sinusoidal jitter precision
      SpriteRenderer.drawPsionicPhantom(strictCtx as any, 'BOSS_PSIONIC', 112, 60, 0, 10000.5);
      SpriteRenderer.drawPsionicPhantom(strictCtx as any, 'BOSS_PSIONIC', -20, 350, 1, 10000.5);
    });

    it('drawNaniteCloud handles 0 count and proximate motes cleanly', () => {
      const rArr = new Float32Array([5, 6, 20, 21]);
      const thetaArr = new Float32Array([0, 0.05, 2.0, 2.05]);
      const sizeArr = new Float32Array([2, 2, 2, 2]);

      // Count = 0 -> early return
      SpriteRenderer.drawNaniteCloud(strictCtx as any, 112, 100, rArr, thetaArr, sizeArr, 0, 0);

      // Normal rendering with proximate micro-arcs
      SpriteRenderer.drawNaniteCloud(strictCtx as any, 112, 100, rArr, thetaArr, sizeArr, 4, 1.5);
    });
  });
});
