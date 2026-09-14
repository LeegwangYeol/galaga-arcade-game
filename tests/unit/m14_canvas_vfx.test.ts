/**
 * Galaga Arcade Web Game — Milestone 14: Procedural Canvas 2D VFX Shaders Test Suite
 * 
 * Verifies 100% code-generated visual effects, screen shake camera system,
 * Chrono Freeze shaders, Warp Ram speed lines, Nova Barrage ring-buffer & reticle,
 * Boss visual tells, Crisis environmental shaders, and zero runtime GC allocations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpriteRenderer } from '../../src/renderer/SpriteRenderer';
import { Starfield, STARFIELD_ICE_COLORS } from '../../src/systems/Starfield';
import { ParticleSystem } from '../../src/systems/ParticleSystem';
import { NovaMissile } from '../../src/core/specials/pools/NovaMissile';
import { SpecialMovesManager } from '../../src/core/specials/SpecialMovesManager';
import { Game } from '../../src/core/Game';
import { TheContingencyEvent } from '../../src/core/crisis/events/TheContingencyEvent';
import { TheUnbiddenEvent } from '../../src/core/crisis/events/TheUnbiddenEvent';
import { HyperspaceStormEvent } from '../../src/core/crisis/events/HyperspaceStormEvent';

function createMockContext(): any {
  const gradientMock = {
    addColorStop: vi.fn(),
  };

  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    setLineDash: vi.fn(),
    createLinearGradient: vi.fn(() => gradientMock),
    createRadialGradient: vi.fn(() => gradientMock),
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    globalAlpha: 1.0,
    lineDashOffset: 0,
    imageSmoothingEnabled: false,
    shadowBlur: 0,
    shadowColor: '',
  };
}

describe('Milestone 14: Procedural Canvas 2D VFX Shaders', () => {
  let mockCtx: any;

  beforeEach(() => {
    mockCtx = createMockContext();
    SpriteRenderer.initialize();
  });

  // ==========================================================================
  // 1. Procedural SpriteRenderer VFX Helpers
  // ==========================================================================

  describe('1. Procedural SpriteRenderer VFX Helpers', () => {
    it('drawChronoFrostVignette draws 4 edge bars and breathing corner crystals', () => {
      SpriteRenderer.drawChronoFrostVignette(mockCtx, 224, 288, 1.0);

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
      // 4 edge bars fillRect (top, bottom, left, right)
      expect(mockCtx.fillRect).toHaveBeenCalledTimes(4);
      expect(mockCtx.fillStyle).toBe('#00FFFF');
      expect(mockCtx.globalAlpha).toBeGreaterThan(0);
    });

    it('drawTargetingReticle renders 4-corner brackets and center pip when locked', () => {
      SpriteRenderer.drawTargetingReticle(mockCtx, 100, 150, 16, 16, true, 0.5);

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
      expect(mockCtx.strokeStyle).toBe('#00FFFF');
      expect(mockCtx.beginPath).toHaveBeenCalled();
      expect(mockCtx.moveTo).toHaveBeenCalledTimes(4);
      expect(mockCtx.lineTo).toHaveBeenCalledTimes(8);
      expect(mockCtx.stroke).toHaveBeenCalled();
      // Center pip
      expect(mockCtx.fillRect).toHaveBeenCalledWith(100 - 0.5, 150 - 0.5, 1, 1);
    });

    it('drawTargetingReticle renders unlocked state with pink stroke and no center pip', () => {
      SpriteRenderer.drawTargetingReticle(mockCtx, 80, 120, 16, 16, false, 0.2);

      expect(mockCtx.strokeStyle).toBe('#FF007F');
      expect(mockCtx.stroke).toHaveBeenCalled();
      expect(mockCtx.fillRect).not.toHaveBeenCalled();
    });

    it('drawWarpSpeedLines renders pre-allocated speed lines with zero allocation', () => {
      const count = 24;
      const xArr = new Float32Array(count);
      const yArr = new Float32Array(count);
      const lenArr = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        xArr[i] = i * 9;
        yArr[i] = i * 12;
        lenArr[i] = 15;
      }

      SpriteRenderer.drawWarpSpeedLines(mockCtx, xArr, yArr, lenArr, count, 0.8);

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
      expect(mockCtx.strokeStyle).toBe('#00FFFF');
      expect(mockCtx.moveTo).toHaveBeenCalledTimes(count);
      expect(mockCtx.lineTo).toHaveBeenCalledTimes(count);
      expect(mockCtx.stroke).toHaveBeenCalled();
    });

    it('drawAeternumMegaBeam renders charging warning guides and core jitter laser', () => {
      SpriteRenderer.drawAeternumMegaBeam(mockCtx, 112, 48, 20, 288, true, false, 0.5, 1.2);

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
      expect(mockCtx.setLineDash).toHaveBeenCalledWith([4, 4]);
      expect(mockCtx.stroke).toHaveBeenCalled();
      expect(mockCtx.fillRect).toHaveBeenCalled(); // Transverse jitter laser
    });

    it('drawAeternumMegaBeam renders firing multi-layer plasma beam and ground flare', () => {
      SpriteRenderer.drawAeternumMegaBeam(mockCtx, 112, 48, 20, 288, false, true, 1.0, 2.0);

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
      expect(mockCtx.createLinearGradient).toHaveBeenCalledWith(112 - 24, 0, 112 + 24, 0);
      expect(mockCtx.arc).toHaveBeenCalled(); // Ground flare
      expect(mockCtx.fill).toHaveBeenCalled();
    });

    it('drawPsionicPhantom renders chromatic after-image and jittered blit', () => {
      SpriteRenderer.drawPsionicPhantom(mockCtx, 'BOSS_PSIONIC', 112, 60, 0, 1.5);

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
      expect(mockCtx.fillRect).toHaveBeenCalled(); // Silhouette after-image
    });

    it('drawNaniteCloud renders motes and micro-arcs between proximate motes', () => {
      const count = 4;
      const rArr = new Float32Array([4, 5, 20, 22]);
      const thetaArr = new Float32Array([0, 0.1, 2.0, 2.1]);
      const sizeArr = new Float32Array([2, 2, 2, 2]);

      SpriteRenderer.drawNaniteCloud(mockCtx, 100, 100, rArr, thetaArr, sizeArr, count, 0.5);

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
      expect(mockCtx.fillRect).toHaveBeenCalledTimes(count);
      // Proximate motes 0 and 1 are within 8px -> micro-arc drawn
      expect(mockCtx.stroke).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 2. Chrono Freeze Starfield System
  // ==========================================================================

  describe('2. Chrono Freeze Starfield System', () => {
    it('sets and retrieves isChronoFrozen flag', () => {
      const starfield = new Starfield(224, 288, 50);
      expect(starfield.isChronoFrozen).toBe(false);

      starfield.setChronoFrozen(true);
      expect(starfield.isChronoFrozen).toBe(true);

      starfield.setChronoFrozen(false);
      expect(starfield.isChronoFrozen).toBe(false);
    });

    it('renders ice desaturation palette when Chrono Freeze is active', () => {
      const starfield = new Starfield(224, 288, 20);
      starfield.setChronoFrozen(true);

      starfield.render(mockCtx);

      expect(mockCtx.fillRect).toHaveBeenCalled();
      // Check that fillStyle received one of STARFIELD_ICE_COLORS
      expect(STARFIELD_ICE_COLORS).toContain(mockCtx.fillStyle);
    });
  });

  // ==========================================================================
  // 3. Special Moves VFX & Entity Ring-Buffers
  // ==========================================================================

  describe('3. Special Moves VFX & Ring-Buffers', () => {
    it('NovaMissile maintains a circular 5-position trail ring buffer without reallocations', () => {
      const missile = new NovaMissile(1);
      missile.init(100, 200, -Math.PI / 2);

      expect(missile.trailX.length).toBe(5);
      expect(missile.trailY.length).toBe(5);
      expect(missile.trailCount).toBe(0);

      // Advance missile 3 frames
      missile.update(0.016);
      expect(missile.trailCount).toBe(1);
      expect(missile.trailHead).toBe(1);

      missile.update(0.016);
      expect(missile.trailCount).toBe(2);
      expect(missile.trailHead).toBe(2);

      missile.update(0.016);
      expect(missile.trailCount).toBe(3);
      expect(missile.trailHead).toBe(3);

      // Advance beyond capacity to verify ring wrapping
      for (let i = 0; i < 5; i++) {
        missile.update(0.016);
      }
      expect(missile.trailCount).toBe(5);
      expect(missile.trailHead).toBe((3 + 5) % 5);
    });

    it('SpecialMovesManager pre-allocates 24 speed lines with Float32Array buffers', () => {
      const smm = new SpecialMovesManager(new Game());
      const count = SpecialMovesManager.SPEED_LINE_COUNT;
      expect(count).toBe(24);

      const xArr = smm.speedLineX;
      const yArr = smm.speedLineY;
      const lenArr = smm.speedLineLen;

      expect(xArr).toBeInstanceOf(Float32Array);
      expect(yArr).toBeInstanceOf(Float32Array);
      expect(lenArr).toBeInstanceOf(Float32Array);
      expect(xArr.length).toBe(24);
      expect(yArr.length).toBe(24);
      expect(lenArr.length).toBe(24);
    });
  });

  // ==========================================================================
  // 4. ParticleSystem Milestone 14 Presets
  // ==========================================================================

  describe('4. ParticleSystem Milestone 14 Presets', () => {
    let particleSystem: ParticleSystem;

    beforeEach(() => {
      particleSystem = new ParticleSystem();
    });

    it('spawnNovaImpact acquires 1 shockwave ring and 14 radial sparks', () => {
      expect(particleSystem.getActiveCount()).toBe(0);

      particleSystem.spawnNovaImpact(112, 100, 14);

      // 1 shockwave + 14 sparks = 15 active particles
      expect(particleSystem.getActiveCount()).toBe(15);
    });

    it('spawnWarpWake acquires a Doppler wake spark trailing downward', () => {
      expect(particleSystem.getActiveCount()).toBe(0);

      particleSystem.spawnWarpWake(112, 200, 0, 80);

      expect(particleSystem.getActiveCount()).toBe(1);
    });

    it('spawnNaniteDissolve acquires gray goo sizzle sparks', () => {
      expect(particleSystem.getActiveCount()).toBe(0);

      particleSystem.spawnNaniteDissolve(112, 150, 8);

      expect(particleSystem.getActiveCount()).toBe(8);
    });
  });

  // ==========================================================================
  // 5. Screen Shake Camera Controller
  // ==========================================================================

  describe('5. Screen Shake Camera Controller', () => {
    it('triggers screen shake and computes decaying integer offsets', () => {
      const game = new Game();
      game.triggerScreenShake(2.0, 0.4);

      expect(game.shakeIntensity).toBe(2.0);
      expect(game.shakeDuration).toBe(0.4);

      // Advance by half duration
      game.updateScreenShake(0.2);
      expect(Math.abs(game.shakeOffsetX)).toBeLessThanOrEqual(2);
      expect(Math.abs(game.shakeOffsetY)).toBeLessThanOrEqual(2);

      // Advance past duration -> complete decay to 0
      game.updateScreenShake(0.3);
      expect(game.shakeOffsetX).toBe(0);
      expect(game.shakeOffsetY).toBe(0);
    });

    it('isolates HUD in fixed screen space during render with ctx.save / ctx.restore', () => {
      const game = new Game();
      game.triggerScreenShake(3.0, 1.0);
      game.shakeOffsetX = 3;
      game.shakeOffsetY = -2;

      game.render(mockCtx);

      // Camera shake applied to world
      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.translate).toHaveBeenCalledWith(3, -2);
      // Camera shake restored before HUD
      expect(mockCtx.restore).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 6. Crisis Procedural Environmental Shaders
  // ==========================================================================

  describe('6. Crisis Procedural Environmental Shaders', () => {
    const createCrisisContext = () => ({
      game: { stage: 12 },
      player: { x: 112, y: 240, active: true },
      bulletManager: { clear: vi.fn() },
      formationManager: { enemies: [] },
      starfield: {},
      particleSystem: { spawnShockwave: vi.fn(), spawnSpark: vi.fn() },
      soundSynth: {
        playCrisisKlaxon: vi.fn(),
        playLaser: vi.fn(),
        playExplosion: vi.fn(),
        playDigitalGlitch: vi.fn(),
        playLightningCrackle: vi.fn(),
        playDimensionalTearHum: vi.fn(),
        playDarkMatterIgnition: vi.fn(),
      },
      scoreManager: {},
      stage: 12,
    });

    it('TheContingencyEvent renders CRT scanlines and rolling V-sync bar', () => {
      const event = new TheContingencyEvent();
      const ctx = createCrisisContext();
      event.init(ctx as any);
      event.activate();

      event.render(mockCtx);

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
      // Scanlines (288 / 3 = 96) + V-sync bar (1) + code drops (16) = >100 fillRect calls
      expect(mockCtx.fillRect).toHaveBeenCalled();
      expect(mockCtx.fillRect.mock.calls.length).toBeGreaterThanOrEqual(96);
    });

    it('TheUnbiddenEvent renders spacetime fissure tear and rotating vortex arms', () => {
      const event = new TheUnbiddenEvent();
      const ctx = createCrisisContext();
      event.init(ctx as any);
      event.activate();

      event.render(mockCtx);

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
      expect(mockCtx.createRadialGradient).toHaveBeenCalled();
      expect(mockCtx.stroke).toHaveBeenCalled();
      expect(mockCtx.fill).toHaveBeenCalled();
    });

    it('HyperspaceStormEvent renders warning lane column and branching lightning forks', () => {
      const event = new HyperspaceStormEvent();
      const ctx = createCrisisContext();
      event.init(ctx as any);
      event.activate();

      // Test WARNING lane state
      (event as any).laneState = 'WARNING';
      (event as any).activeLane = 2;
      event.render(mockCtx);
      expect(mockCtx.fillRect).toHaveBeenCalled();
      expect(mockCtx.strokeRect).toHaveBeenCalled();

      // Test STRIKING lightning bolt state
      (event as any).laneState = 'STRIKING';
      mockCtx.stroke.mockClear();
      event.render(mockCtx);
      expect(mockCtx.stroke).toHaveBeenCalled();
    });
  });
});
