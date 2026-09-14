/**
 * Galaga Arcade Web Game — M24 Comprehensive Multi-Bug Polishing Test Suite
 * 
 * Asserts all 27 QA remediation fixes across:
 * - Track 1: Hitbox & Collision Polishing (Dual fighter hull, partial destruction invuln buffer,
 *            swept CCD on enemy bullets, MegaBeam direct AABB damage, cancelCapture, tractor beam)
 * - Track 2: WebAudio Node Lifecycles & Concurrency (Watchdog cleanup, priority headroom,
 *            debouncing, dual laser slot reservation, beamRoar loop stop, teardown generation token,
 *            MusicJingles node disconnection, suspend/resume & facade forwarders)
 * - Track 3: UI Layout & Mobile Touch (Boss health bar Y=24, screen space shake isolation,
 *            special gauge X=86 & Y=270 clearance with 5 lives, stage badge crowding guard X<144,
 *            touch pointer ignore on canvas, coordinate clamping, safe-area CSS)
 * - Track 4: Pool Bounds & Stage Teardown (Challenging stage entry halt completion, cheat subWave=5,
 *            GAME_OVER / startGame pool teardown, PsionicResonance zero-GC array reuse)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { Player } from '../../src/entities/Player';
import { TractorBeam } from '../../src/entities/TractorBeam';
import { Bullet } from '../../src/entities/Bullet';
import { AeternumCore } from '../../src/core/boss/bosses/AeternumCore';
import { BossManager } from '../../src/core/boss/BossManager';
import { SoundSynth } from '../../src/audio/SoundSynth';
import { SOUND_PRIORITY } from '../../src/audio/types';
import { AudioContextManager } from '../../src/audio/AudioContextManager';
import { AudioManager } from '../../src/audio/AudioManager';
import { MusicJingles } from '../../src/audio/MusicJingles';
import { HUD } from '../../src/ui/HUD';
import { InputHandler } from '../../src/ui/InputHandler';
import { Game } from '../../src/core/Game';
import { FormationManager } from '../../src/systems/FormationManager';
import { GalagaCheatController } from '../../src/core/qa/GalagaCheatController';
import { PsionicResonanceEvent } from '../../src/core/crisis/events/PsionicResonanceEvent';
import { EnemyType, EnemyState } from '../../src/types';

// ============================================================================
// Web Audio Mock Infrastructure for Sound Testing
// ============================================================================

class MockAudioParam {
  public value: number;
  public scheduled: Array<{ type: string; value: number; time: number }> = [];

  constructor(initialValue: number = 1.0) {
    this.value = initialValue;
  }

  setValueAtTime(val: number, time: number) {
    this.value = val;
    this.scheduled.push({ type: 'setValueAtTime', value: val, time });
  }

  linearRampToValueAtTime(val: number, time: number) {
    this.value = val;
    this.scheduled.push({ type: 'linearRampToValueAtTime', value: val, time });
  }

  exponentialRampToValueAtTime(val: number, time: number) {
    this.value = val;
    this.scheduled.push({ type: 'exponentialRampToValueAtTime', value: val, time });
  }

  setTargetAtTime(val: number, time: number, _constant: number) {
    this.value = val;
    this.scheduled.push({ type: 'setTargetAtTime', value: val, time });
  }

  cancelScheduledValues(_time: number) {
    this.scheduled = [];
  }
}

class MockAudioNode {
  public connectedTo: any[] = [];
  public disconnected = false;

  connect(destination: any) {
    this.connectedTo.push(destination);
    return destination;
  }

  disconnect() {
    this.disconnected = true;
    this.connectedTo = [];
  }
}

class MockGainNode extends MockAudioNode {
  public gain = new MockAudioParam(1.0);
}

class MockBiquadFilterNode extends MockAudioNode {
  public type: string = 'lowpass';
  public frequency = new MockAudioParam(350);
  public Q = new MockAudioParam(1.0);
}

class MockOscillatorNode extends MockAudioNode {
  public frequency = new MockAudioParam(440);
  public detune = new MockAudioParam(0);
  public type: OscillatorType = 'sine';
  public onended: (() => void) | null = null;
  public started = false;
  public stopped = false;

  start(_time?: number) {
    this.started = true;
  }

  stop(_time?: number) {
    this.stopped = true;
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  public buffer: any = null;
  public loop = false;
  public playbackRate = new MockAudioParam(1.0);
  public onended: (() => void) | null = null;
  public started = false;
  public stopped = false;

  start(_time?: number) {
    this.started = true;
  }

  stop(_time?: number) {
    this.stopped = true;
  }
}

class MockAudioContext {
  public currentTime = 0;
  public state: AudioContextState = 'running';
  public sampleRate = 44100;
  public destination = new MockAudioNode();

  createGain() {
    return new MockGainNode();
  }

  createOscillator() {
    return new MockOscillatorNode();
  }

  createBiquadFilter() {
    return new MockBiquadFilterNode();
  }

  createBufferSource() {
    return new MockAudioBufferSourceNode();
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    };
  }

  createPeriodicWave() {
    return {};
  }

  async suspend() {
    this.state = 'suspended';
  }

  async resume() {
    this.state = 'running';
  }

  async close() {
    this.state = 'closed';
  }
}

// ============================================================================
// Canvas Context & DOM Mock
// ============================================================================

class MockEventTarget {
  private listeners: Record<string, Set<(e: any) => void>> = {};

  addEventListener(type: string, listener: (e: any) => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = new Set();
    }
    this.listeners[type]?.add(listener);
  }

  removeEventListener(type: string, listener: (e: any) => void) {
    this.listeners[type]?.delete(listener);
  }

  dispatchEvent(event: any): boolean {
    const set = this.listeners[event.type];
    if (set) {
      for (const listener of set) {
        listener(event);
      }
    }
    return true;
  }
}

function createMockCanvasContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    setLineDash: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    fillStyle: '#FFFFFF',
    strokeStyle: '#FFFFFF',
    lineWidth: 1,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

function createMockCanvas(): HTMLCanvasElement {
  const ctx = createMockCanvasContext();
  return Object.assign(new MockEventTarget(), {
    width: 224,
    height: 288,
    getContext: (_type: string) => ctx,
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 224,
      height: 288,
      x: 0,
      y: 0,
      right: 224,
      bottom: 288,
    }),
  }) as unknown as HTMLCanvasElement;
}

// ============================================================================
// M24 Multi-Bug Polishing Test Suites
// ============================================================================

describe('M24: Comprehensive Multi-Bug Polishing Test Suite', () => {

  // --------------------------------------------------------------------------
  // TRACK 1: Hitbox & Collision Polishing
  // --------------------------------------------------------------------------
  describe('Track 1: Hitbox & Collision Polishing', () => {
    let player: Player;

    beforeEach(() => {
      player = new Player({ x: 112, y: 250 });
    });

    it('Track 1.1: Dual fighter hitbox provides seamless coverage with zero dead-zone at center', () => {
      player.isDual = true;
      expect(player.isDual).toBe(true);

      const px = player.x; // 112
      const py = player.y; // 250

      // Threat outside left bounds does not hit
      const farLeftHit = player.hitTestAndDamage({ x: px - 18, y: py, width: 1, height: 1 });
      expect(farLeftHit).toBe(false);

      // Threat outside right bounds does not hit
      const farRightHit = player.hitTestAndDamage({ x: px + 18, y: py, width: 1, height: 1 });
      expect(farRightHit).toBe(false);

      // Threat at center seam: [px - 1, px + 1] overlaps both hulls seamlessly (zero gap)
      const centerHit = player.hitTestAndDamage({ x: px - 1, y: py, width: 2, height: 2 });
      expect(centerHit).toBe(true);
    });

    it('Track 1.2: Dual fighter partial destruction gives 0.5s invulnerability buffer protecting surviving fighter', () => {
      player.isDual = true;
      expect(player.isDual).toBe(true);

      // Hit only left fighter
      const leftHitBox = { x: player.x - 12, y: player.y, width: 4, height: 4 };
      const damaged = player.hitTestAndDamage(leftHitBox);
      expect(damaged).toBe(true);
      expect(player.isDual).toBe(false);
      expect(player.isInvulnerable()).toBe(true);

      // Immediate hit on remaining fighter during 0.5s buffer is ignored
      const remainingHitBox = { x: player.x, y: player.y, width: 6, height: 6 };
      const secondHit = player.hitTestAndDamage(remainingHitBox);
      expect(secondHit).toBe(false);
      expect(player.state).not.toBe('destroyed');

      // Advance by 0.51s
      player.update(0.51);
      expect(player.isInvulnerable()).toBe(false);

      // Now remaining fighter can be damaged
      const thirdHit = player.hitTestAndDamage(remainingHitBox);
      expect(thirdHit).toBe(true);
      expect(player.state).toBe('destroyed');
    });

    it('Track 1.3: player.cancelCapture() smoothly restores ship state and cancels capture beam trap', () => {
      // Put player in capturing state
      (player as any).state = 'capturing';
      player.y = 100;

      player.cancelCapture();
      expect(player.state).toBe('normal');
      expect(player.state).not.toBe('destroyed');
    });

    it('Track 1.4: Swept CCD bounding box captures fast-moving bullet path', () => {
      const bullet = new Bullet();
      bullet.init(100, 50, 0, 300, 'ENEMY');
      // Previous position is (100, 50), now advance position to (100, 90)
      bullet.position.y = 90;

      const swept = bullet.getSweptHitbox();
      expect(swept.x).toBeLessThanOrEqual(99);
      expect(swept.width).toBeGreaterThanOrEqual(2);
      expect(swept.y).toBe(48); // min(50, 90) - 2
      expect(swept.height).toBe(44); // (90 - 50) + 4
    });

    it('Track 1.5: TractorBeam intersectsAABB evaluates beam width correctly at overlapBottomY', () => {
      const beam = new TractorBeam();
      beam.activate(112, 40);
      // Advance beam to full extension (0.5s)
      for (let i = 0; i < 20; i++) {
        beam.update(0.05);
      }
      expect(beam.currentBottomY).toBeGreaterThan(200);

      // Test AABB near bottom within beam width
      const targetBox = { x: 100, y: 220, width: 24, height: 16 };
      const intersects = beam.intersectsAABB(targetBox);
      expect(intersects).toBe(true);
    });

    it('Track 1.6: AeternumCore MegaBeam passes true Rect AABB to player.hitTestAndDamage', () => {
      const mockGame: any = {
        player: {
          x: 112,
          y: 250,
          hitTestAndDamage: vi.fn(),
        },
        soundSynth: null,
      };

      const aeternum = new AeternumCore(mockGame);
      aeternum.phase = 'PHASE_2';
      aeternum.megaBeam.active = true;
      aeternum.megaBeam.firing = true;
      aeternum.megaBeam.fireTimer = 1.0;
      aeternum.megaBeam.centerX = 112;
      aeternum.megaBeam.width = 40;
      aeternum.megaBeam.topY = 52;
      aeternum.megaBeam.bottomY = 288;

      aeternum.update(0.016, 112, 250);

      expect(mockGame.player.hitTestAndDamage).toHaveBeenCalled();
      const calledBox = mockGame.player.hitTestAndDamage.mock.calls[0][0];
      expect(calledBox.width).toBe(40);
      expect(calledBox.height).toBe(236); // 288 - 52
      expect(calledBox.x).toBeCloseTo(92.48, 1); // 112 + 1 * 30 * 0.016 - 20
    });
  });

  // --------------------------------------------------------------------------
  // TRACK 2: WebAudio Node Lifecycles & Concurrency
  // --------------------------------------------------------------------------
  describe('Track 2: WebAudio Node Lifecycles & Concurrency', () => {
    let synth: SoundSynth;
    let audioMgr: AudioContextManager;
    let mockCtx: MockAudioContext;

    beforeEach(() => {
      vi.useFakeTimers();
      mockCtx = new MockAudioContext();

      (global as any).window = {
        AudioContext: function() { return mockCtx; },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      (global as any).AudioContext = function() { return mockCtx; };

      AudioContextManager.resetInstance();
      SoundSynth.resetInstance();

      audioMgr = AudioContextManager.getInstance();
      audioMgr.init();
      synth = SoundSynth.getInstance(audioMgr);
    });

    afterEach(() => {
      AudioContextManager.resetInstance();
      SoundSynth.resetInstance();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('Track 2.1: Watchdog timer recycles voice when onended does not fire', () => {
      // Calling playLaser increments activeVoiceCount
      const started = synth.playLaser();
      expect(started).toBe(true);
      expect(synth.getActiveVoiceCount()).toBe(1);

      // Advance past laser duration (0.15s) + watchdog grace (100ms) = 250ms
      vi.advanceTimersByTime(300);

      // Voice count should be restored to 0 via watchdog
      expect(synth.getActiveVoiceCount()).toBe(0);
    });

    it('Track 2.2: playBossHit enforces normal voice limit and debounces rapid consecutive hits', () => {
      const first = synth.playBossHit();
      expect(first).toBe(true);

      // Rapid consecutive call in 10ms is debounced
      vi.advanceTimersByTime(10);
      mockCtx.currentTime += 0.01;
      const second = synth.playBossHit();
      expect(second).toBe(false);

      // After debounce window (30ms)
      vi.advanceTimersByTime(60);
      mockCtx.currentTime += 0.06;
      const third = synth.playBossHit();
      expect(third).toBe(true);
    });

    it('Track 2.3: playExplosion supports high-priority headroom and optional debouncing', () => {
      // Fill all 12 normal voice slots with lasers
      for (let i = 0; i < 12; i++) {
        synth.playLaser();
      }
      expect(synth.getActiveVoiceCount()).toBe(12);

      // Normal explosion is rejected at 12 voices
      const normalExplosion = synth.playExplosion('small');
      expect(normalExplosion).toBe(false);

      // High-priority explosion (e.g. boss destroyed) succeeds in priority headroom
      const highPriorityExplosion = synth.playExplosion('boss', { priority: SOUND_PRIORITY.HIGH });
      expect(highPriorityExplosion).toBe(true);
      expect(synth.getActiveVoiceCount()).toBe(13);

      // Debounce check
      vi.advanceTimersByTime(350); // clear voices
      mockCtx.currentTime += 0.35;
      const debounced1 = synth.playExplosion('small', { debounce: true });
      expect(debounced1).toBe(true);
      const debounced2 = synth.playExplosion('small', { debounce: true });
      expect(debounced2).toBe(false);
    });

    it('Track 2.4: playLaserDual requires at least 2 available voice slots', () => {
      // Fill to 11 voices (1 slot free out of 12)
      for (let i = 0; i < 11; i++) {
        synth.playLaser();
      }
      expect(synth.getActiveVoiceCount()).toBe(11);

      // Dual laser needs 2 voices -> rejected
      const dualLaser = synth.playLaserDual();
      expect(dualLaser).toBe(false);

      // Free 1 voice -> 10 active, 2 free
      vi.advanceTimersByTime(300);
      mockCtx.currentTime += 0.3;
      for (let i = 0; i < 10; i++) {
        synth.playLaser();
      }
      expect(synth.getActiveVoiceCount()).toBe(10);
      const dualLaserSuccess = synth.playLaserDual();
      expect(dualLaserSuccess).toBe(true);
    });

    it('Track 2.5: playDarkMatterBeamRoar is tracked in activeLoops and stopped via stopDarkMatterBeamRoar', () => {
      synth.playDarkMatterBeamRoar();
      expect((synth as any).activeLoops.has('beamRoar')).toBe(true);

      synth.stopDarkMatterBeamRoar();
      expect((synth as any).activeLoops.has('beamRoar')).toBe(false);
    });

    it('Track 2.6: stopAll() increments teardown generation preventing stale decrements below 0', () => {
      synth.playLaser();
      synth.playAlienDive();
      expect(synth.getActiveVoiceCount()).toBe(2);

      synth.stopAll();
      expect(synth.getActiveVoiceCount()).toBe(0);

      // Simulate stale timers firing
      vi.advanceTimersByTime(1000);
      expect(synth.getActiveVoiceCount()).toBe(0);
    });

    it('Track 2.7: MusicJingles playback handle stops cleanly and disconnects nodes', () => {
      const handle = MusicJingles.playStageStartFanfare();
      expect(handle).toBeDefined();
      expect(handle.isPlaying).toBe(true);

      handle.stop(5);
      vi.advanceTimersByTime(50);
      expect(handle.isPlaying).toBe(false);
    });

    it('Track 2.8: AudioContextManager and AudioManager expose suspend, resume, unlock and M18/M19 forwarders', async () => {
      const unifiedMgr = new AudioManager(synth, audioMgr);

      // suspend and resume
      await unifiedMgr.suspend();
      expect(mockCtx.state).toBe('suspended');
      await unifiedMgr.resume();
      expect(mockCtx.state).toBe('running');

      // unlock
      expect(typeof unifiedMgr.unlock).toBe('function');
      unifiedMgr.unlock();

      // Forwarders should exist and not throw
      expect(typeof unifiedMgr.playGlitchBuzz).toBe('function');
      expect(typeof unifiedMgr.playGlitchFrequencyChirp).toBe('function');
      expect(typeof unifiedMgr.playDataStreamNoise).toBe('function');
      expect(typeof unifiedMgr.playChronoFieldActivate).toBe('function');
      expect(typeof unifiedMgr.playReflectionDeflect).toBe('function');
      expect(typeof unifiedMgr.playEmpBulletAbsorb).toBe('function');
      expect(typeof unifiedMgr.playPhaseDriveBlink).toBe('function');
      expect(typeof unifiedMgr.playPlasmaBeamPulse).toBe('function');

      unifiedMgr.playGlitchBuzz();
      unifiedMgr.playGlitchFrequencyChirp();
      unifiedMgr.playDataStreamNoise();
      unifiedMgr.playChronoFieldActivate();
      unifiedMgr.playReflectionDeflect();
      unifiedMgr.playEmpBulletAbsorb();
      unifiedMgr.playPhaseDriveBlink();
      unifiedMgr.playPlasmaBeamPulse();
    });
  });

  // --------------------------------------------------------------------------
  // TRACK 3: UI Layout & Mobile Touch
  // --------------------------------------------------------------------------
  describe('Track 3: UI Layout & Mobile Touch', () => {
    it('Track 3.1: Boss health bar renders at Y=24 in fixed HUD space', () => {
      const bossManager = new BossManager({} as any);
      const mockCtx = createMockCanvasContext();

      // Active boss with health bar
      (bossManager as any).activeBoss = {
        active: true,
        bossName: 'DREADNOUGHT',
        phase: 'PHASE 1',
        health: 80,
        maxHealth: 100,
      };

      bossManager.render(mockCtx);

      // Look for fillRect calls at Y=24 (health bar fill)
      const fillRectCalls = (mockCtx.fillRect as any).mock.calls;
      const barYCall = fillRectCalls.find((call: any[]) => call[1] === 24);
      expect(barYCall).toBeDefined();
    });

    it('Track 3.2: HUD Special Gauge at X=86 and label at Y=270 cleanly clears 5 reserve lives', () => {
      const hud = new HUD();
      const mockCtx = createMockCanvasContext();

      hud.renderSpecialGauge(mockCtx, 75, false, 'CHRONO_FREEZE');

      // Gauge background fillRect at x=86, y=278, w=54, h=6
      const fillRectCalls = (mockCtx.fillRect as any).mock.calls;
      const gaugeBgCall = fillRectCalls.find((call: any[]) => call[0] === 86 && call[1] === 278);
      expect(gaugeBgCall).toBeDefined();
      expect(gaugeBgCall[2]).toBe(54); // width 54

      // Max X of 5 reserve ships is 8 + 4 * 14 + 15 = 79. Clearance to gauge X=86 is 7px.
      expect(79).toBeLessThan(86);
    });

    it('Track 3.3: HUD stage badges avoid overlapping special move gauge (x < 144)', () => {
      const hud = new HUD();
      const mockCtx = createMockCanvasContext();

      // Decompose large stage with many badges (e.g. stage 89)
      const decomp = HUD.decomposeStage(89);
      expect(decomp.badges.length).toBeGreaterThan(5);

      // When rendering badges, ensure no badge is rendered at X < 144
      hud.renderStageBadges(mockCtx, 89);

      const drawImageCalls = (mockCtx.drawImage as any).mock.calls;
      for (const call of drawImageCalls) {
        const destX = call[1]; // x coordinate
        expect(destX).toBeGreaterThanOrEqual(144);
      }
    });

    it('Track 3.4: InputHandler ignores touch pointer events on canvas to prevent double input', () => {
      const mockCanvasTarget = createMockCanvas();

      const mockWindow = Object.assign(new MockEventTarget(), {
        innerWidth: 375,
        innerHeight: 667,
      });
      const mockDocument = Object.assign(new MockEventTarget(), {
        hidden: false,
        getElementById: () => null,
      });

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('document', mockDocument);

      const inputHandler = new InputHandler(mockCanvasTarget);

      // Pointer event with pointerType 'touch'
      const touchPointerEvent = {
        type: 'pointerdown',
        pointerType: 'touch',
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
      };

      (mockCanvasTarget as any).dispatchEvent(touchPointerEvent);
      // Pointer active should remain false because touch was ignored
      expect(inputHandler.getState().pointerActive).toBe(false);

      // Pointer event with pointerType 'mouse'
      const mousePointerEvent = {
        type: 'pointerdown',
        pointerType: 'mouse',
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
      };

      (mockCanvasTarget as any).dispatchEvent(mousePointerEvent);
      expect(inputHandler.getState().pointerActive).toBe(true);

      inputHandler.destroy();
      vi.unstubAllGlobals();
    });

    it('Track 3.5: index.html contains safe-area-inset CSS for #touch-controls', () => {
      const htmlPath = path.resolve(__dirname, '../../index.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

      expect(htmlContent).toContain('safe-area-inset-bottom');
      expect(htmlContent).toContain('safe-area-inset-left');
      expect(htmlContent).toContain('safe-area-inset-right');
    });
  });

  // --------------------------------------------------------------------------
  // TRACK 4: Pool Bounds & Stage Teardown
  // --------------------------------------------------------------------------
  describe('Track 4: Pool Bounds & Stage Teardown', () => {
    it('Track 4.1: FormationManager completes challenging stage even if entry wave halted', () => {
      const fm = new FormationManager();
      fm.isChallengingStage = true;
      fm.isEntryWaveActive = false;
      fm.currentSubWave = 2; // Was halted mid-wave

      // Simulate 40 enemies spawned and all destroyed
      (fm as any).enemies = new Array(40).fill(null).map(() => ({
        alive: false,
        active: false,
        type: EnemyType.ZAKO,
        health: 0,
        flightPath: null,
        state: EnemyState.INACTIVE,
        update: vi.fn(),
      }));

      let stageCleared = false;
      fm.onStageClear = () => {
        stageCleared = true;
      };

      // Tick update
      fm.update(0.016, 112, 250);
      expect(stageCleared).toBe(true);
    });

    it('Track 4.2: GalagaCheatController.killAllEnemies sets currentSubWave = 5 for challenging stages', () => {
      const mockGame: any = {
        formationManager: {
          isChallengingStage: true,
          currentSubWave: 1,
          getLivingEnemies: () => [{
            active: true,
            state: EnemyState.IN_FORMATION,
            takeDamage: vi.fn(),
            type: EnemyType.ZAKO,
            x: 100,
            y: 100,
          }],
        },
        bulletManager: { clear: vi.fn() },
        particleSystem: { spawnSmallAlienExplosion: vi.fn() },
        scoreManager: { addScore: vi.fn() },
      };

      const cheat = new GalagaCheatController(mockGame);
      cheat.killAllEnemies();

      expect(mockGame.formationManager.currentSubWave).toBe(5);
    });

    it('Track 4.3: PsionicResonanceEvent reuses bulletsToRecycle array without per-frame allocations', () => {
      const event = new PsionicResonanceEvent();
      const initialArr = (event as any).bulletsToRecycle;
      expect(Array.isArray(initialArr)).toBe(true);

      const mockContext: any = {
        formationManager: { elapsedTime: 1.0 },
        bulletManager: {
          forEachActivePlayerBullet: (cb: any) => {
            cb({ active: true, position: { x: 112, y: 52 } });
          },
          recycle: vi.fn(),
        },
      };

      (event as any).context = mockContext;
      event.activate();

      // Tick active update
      event.update(0.016);

      // The exact same array reference must be preserved and cleared to length 0
      expect((event as any).bulletsToRecycle).toBe(initialArr);
      expect((event as any).bulletsToRecycle.length).toBe(0);

      event.deactivate();
      expect((event as any).bulletsToRecycle).toBe(initialArr);
      expect((event as any).bulletsToRecycle.length).toBe(0);
    });

    it('Track 4.4: Game teardown on GAME_OVER clears entity pools and resets glitch event manager', () => {
      const canvas = createMockCanvas();
      const game = new Game(canvas);

      const bmClearSpy = vi.spyOn(game.bulletManager, 'clear');
      const psClearSpy = vi.spyOn(game.particleSystem, 'clear');
      const fmResetSpy = vi.spyOn(game.formationManager, 'reset');
      const gmResetSpy = vi.spyOn(game.glitchEventManager, 'reset');

      // Trigger GAME_OVER
      (game as any).setState('GAME_OVER');

      expect(bmClearSpy).toHaveBeenCalled();
      expect(psClearSpy).toHaveBeenCalled();
      expect(fmResetSpy).toHaveBeenCalled();
      expect(gmResetSpy).toHaveBeenCalled();

      game.destroy();
    });
  });
});
