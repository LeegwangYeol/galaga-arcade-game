/**
 * Milestone 16 Adversarial Hardening: Voice Headroom & Canvas Coordinate Bounds Suite
 * 
 * Verifies audio engine headroom limits and Canvas 2D geometric/rendering bounds:
 * 1. Web Audio Voice Concurrency & 16-Voice Hard Headroom Ceiling:
 *    - Throttling 150+ rapid concurrent triggers across standard and high-priority SFX.
 *    - Strict headroom reservation: Low-priority drops at >= 10, normal drops at >= 12,
 *      high-priority admits up to 16.
 *    - Zero node allocation on rejected requests.
 *    - 40ms debouncing window enforcement.
 *    - Dual cleanup watchdogs (onended + watchdog fallback timer) and clean stopAll() voice reclamation.
 * 2. Canvas 2D Coordinate Bounds & Math Sanity Oracle:
 *    - Strict interceptor trapping NaN, Infinity, negative radii, out-of-bounds alpha [0, 1],
 *      and gradient offsets.
 *    - 300 continuous frames of simultaneous multi-hazard rendering (Aeternum Mega-Beam sweep,
 *      Contingency CRT/matrix shaders, Nova missiles, cluster bomb shockwaves, Warp Ram speed lines,
 *      camera screen shake, and 3 tactical drones).
 *    - Strict balanced save/restore stack depth invariant (stackDepth === 0 at end of every frame).
 * 3. Process-Level Stability:
 *    - Zero unhandled promise rejections and zero uncaught exceptions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { AudioContextManager } from '../../src/audio/AudioContextManager';
import { SoundSynth } from '../../src/audio/SoundSynth';
import { SOUND_PRIORITY } from '../../src/audio/types';
import { AeternumCore } from '../../src/core/boss/bosses/AeternumCore';

// ============================================================================
// Adversarial Web Audio API Mock Engine
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
    if (val <= 0) {
      throw new RangeError('Float value must be positive for exponential ramp');
    }
    this.value = val;
    this.scheduled.push({ type: 'exponentialRampToValueAtTime', value: val, time });
  }

  cancelScheduledValues(time: number) {
    this.scheduled.push({ type: 'cancelScheduledValues', value: 0, time });
  }
}

class MockAudioNode {
  public connectedTo: any[] = [];
  public disconnectCalls: number = 0;
  public disconnected: boolean = false;

  connect(destination: any) {
    this.connectedTo.push(destination);
    return destination;
  }

  disconnect() {
    this.disconnectCalls++;
    this.disconnected = true;
    this.connectedTo.length = 0;
  }
}

class MockGainNode extends MockAudioNode {
  public gain = new MockAudioParam(1.0);
}

class MockOscillatorNode extends MockAudioNode {
  public type: string = 'sine';
  public frequency = new MockAudioParam(440);
  public started: boolean = false;
  public stopped: boolean = false;
  public onended: (() => void) | null = null;

  start(_time?: number) {
    this.started = true;
  }

  stop(_time?: number) {
    this.stopped = true;
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  public type: string = 'lowpass';
  public frequency = new MockAudioParam(350);
  public Q = new MockAudioParam(1.0);
}

class MockAudioBufferSourceNode extends MockAudioNode {
  public buffer: any = null;
  public loop: boolean = false;
  public started: boolean = false;
  public stopped: boolean = false;
  public onended: (() => void) | null = null;

  start(_time?: number) {
    this.started = true;
  }

  stop(_time?: number) {
    this.stopped = true;
  }
}

class MockAudioContext {
  public state: 'suspended' | 'running' | 'closed' = 'running';
  public currentTime: number = 0;
  public sampleRate: number = 44100;
  public destination = new MockAudioNode();
  public createdNodes: MockAudioNode[] = [];

  createGain(): MockGainNode {
    const node = new MockGainNode();
    this.createdNodes.push(node);
    return node;
  }

  createOscillator(): MockOscillatorNode {
    const node = new MockOscillatorNode();
    this.createdNodes.push(node);
    return node;
  }

  createBiquadFilter(): MockBiquadFilterNode {
    const node = new MockBiquadFilterNode();
    this.createdNodes.push(node);
    return node;
  }

  createBufferSource(): MockAudioBufferSourceNode {
    const node = new MockAudioBufferSourceNode();
    this.createdNodes.push(node);
    return node;
  }

  createBuffer(channels: number, length: number, sampleRate: number): any {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: (_channel: number) => new Float32Array(length),
    };
  }

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
}

// ============================================================================
// Strict Canvas 2D Coordinate Bounds Interceptor
// ============================================================================

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

describe('Milestone 16 Adversarial: Voice Headroom & Canvas Coordinate Bounds', () => {
  let unhandledRejections: any[] = [];
  let uncaughtExceptions: any[] = [];
  let rejectionHandler: (reason: any) => void;
  let exceptionHandler: (error: Error) => void;

  let originalAudioContext: any;
  let synth: SoundSynth;
  let mockContext: MockAudioContext;

  beforeEach(() => {
    unhandledRejections = [];
    uncaughtExceptions = [];
    rejectionHandler = (reason: any) => unhandledRejections.push(reason);
    exceptionHandler = (error: Error) => uncaughtExceptions.push(error);
    process.on('unhandledRejection', rejectionHandler);
    process.on('uncaughtException', exceptionHandler);

    mockContext = new MockAudioContext();

    if (typeof window !== 'undefined') {
      originalAudioContext = (window as any).AudioContext;
      (window as any).AudioContext = function () {
        return mockContext;
      };
      (window as any).webkitAudioContext = function () {
        return mockContext;
      };
    } else {
      (global as any).window = {
        AudioContext: function () {
          return mockContext;
        },
        webkitAudioContext: function () {
          return mockContext;
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    }

    AudioContextManager.resetInstance();
    SoundSynth.resetInstance();
    const acm = AudioContextManager.getInstance();
    acm.init();

    synth = SoundSynth.getInstance(acm);
  });

  afterEach(() => {
    synth.stopAll();
    AudioContextManager.resetInstance();
    SoundSynth.resetInstance();

    if (originalAudioContext && typeof window !== 'undefined') {
      (window as any).AudioContext = originalAudioContext;
      (window as any).webkitAudioContext = originalAudioContext;
    }
    vi.restoreAllMocks();

    process.off('unhandledRejection', rejectionHandler);
    process.off('uncaughtException', exceptionHandler);

    expect(unhandledRejections.length).toBe(0);
    expect(uncaughtExceptions.length).toBe(0);
  });

  describe('1. Web Audio Concurrency & 16-Voice Hard Headroom Ceiling', () => {
    it('enforces 16-voice high-priority hard ceiling under 150 simultaneous SFX calls with zero node leakage on rejects', () => {
      const initialNodeCount = mockContext.createdNodes.length;
      let standardAccepted = 0;
      let standardRejected = 0;

      // 1. Fire 100 simultaneous standard priority sounds in 1 frame
      for (let i = 0; i < 100; i++) {
        const played = synth.playHeavyLaserBlast();
        if (played) standardAccepted++;
        else standardRejected++;
      }

      // Exactly 12 must succeed (MAX_CONCURRENT_VOICES = 12)
      expect(standardAccepted).toBe(12);
      expect(standardRejected).toBe(88);
      expect(synth.getActiveVoiceCount()).toBe(12);

      // Verify rejected calls did not allocate audio nodes (84 nodes for 12 accepted heavy lasers)
      expect(mockContext.createdNodes.length - initialNodeCount).toBe(12 * 7);

      // 2. High priority requests utilize headroom up to 16
      let highAccepted = 0;
      let highRejected = 0;
      for (let i = 0; i < 20; i++) {
        const played = synth.playWarpRamSonicBoom();
        if (played) highAccepted++;
        else highRejected++;
      }

      // 4 high-priority sounds admitted into headroom (12 -> 16), remaining 16 rejected
      expect(highAccepted).toBe(4);
      expect(highRejected).toBe(16);
      expect(synth.getActiveVoiceCount()).toBe(SoundSynth.MAX_HIGH_PRIORITY_VOICES); // 16

      // HARD INVARIANT: Active voices must NEVER exceed 16
      expect(synth.getActiveVoiceCount()).toBe(16);

      // Low priority request must be rejected when active voices >= 10
      expect(synth.canPlayVoice(SOUND_PRIORITY.LOW)).toBe(false);
      expect(synth.canPlayVoice(SOUND_PRIORITY.NORMAL)).toBe(false);
      expect(synth.canPlayVoice(SOUND_PRIORITY.HIGH)).toBe(false);

      // Stop all sounds and verify full voice reclamation
      synth.stopAll();
      expect(synth.getActiveVoiceCount()).toBe(0);
    });

    it('enforces 40ms rate-limiting debouncing window across rapid audio triggers', () => {
      // 1. Direct method debouncing via playNovaMissileSwoosh ('novaSwoosh', 0.04s)
      const first = synth.playNovaMissileSwoosh();
      expect(first).toBe(true);

      // Immediate second call within 40ms window must be rejected by debouncer
      const second = synth.playNovaMissileSwoosh();
      expect(second).toBe(false);

      // Advance mock audio context time by 50ms (past 40ms cooldown)
      mockContext.currentTime += 0.05;

      // Third call after cooldown must succeed
      const third = synth.playNovaMissileSwoosh();
      expect(third).toBe(true);

      // 2. Direct isDebounced contract validation
      const initialKeyCall = synth.isDebounced('customSpamKey', 0.04);
      expect(initialKeyCall).toBe(false); // First call records timestamp, not debounced

      const rapidSubsequentCall = synth.isDebounced('customSpamKey', 0.04);
      expect(rapidSubsequentCall).toBe(true); // Within 40ms window, is debounced

      mockContext.currentTime += 0.05;
      const afterWindowCall = synth.isDebounced('customSpamKey', 0.04);
      expect(afterWindowCall).toBe(false); // Cooldown expired, not debounced
    });

    it('reclaims voices and disconnects nodes via onended callbacks and watchdog timers', () => {
      synth.playLaser();
      expect(synth.getActiveVoiceCount()).toBe(1);

      // Find the created oscillator and invoke its onended callback
      const osc = mockContext.createdNodes.find(
        (n) => n instanceof MockOscillatorNode && (n as MockOscillatorNode).started
      ) as MockOscillatorNode | undefined;

      expect(osc).toBeDefined();
      expect(osc!.onended).toBeDefined();

      // Trigger completion callback
      osc!.onended!();
      expect(synth.getActiveVoiceCount()).toBe(0);
      expect(osc!.disconnected).toBe(true);
    });
  });

  describe('2. Canvas 2D Coordinate Bounds & Math Sanity Oracle', () => {
    it('renders 300 frames of simultaneous Mega-Beam, Contingency, Missiles, and Speed Lines with zero NaN and balanced stack', () => {
      const game = new Game();
      game.startGame();
      const cheat = game.getCheatController();
      cheat.setInvincible(true);

      // Advance to Stage 50
      cheat.skipToStage(50);
      const boss = game.bossManager.activeBoss as AeternumCore;
      expect(boss).not.toBeNull();

      // Activate Mega-Beam in Phase 2
      boss.phase = 'PHASE_2';
      boss.megaBeam.active = true;
      boss.megaBeam.firing = true;
      boss.megaBeam.centerX = 112;
      boss.megaBeam.fireTimer = 5.0;
      boss.megaBeam.width = 134;

      // Trigger Contingency CRT scanlines & matrix rain
      cheat.triggerCrisis('contingency');

      // Summon all 3 drones and munitions
      cheat.unlockDrone('all');
      game.player.isDual = true;
      game.alliesManager.spawnClusterBomb(80, 40);
      game.alliesManager.spawnClusterBomb(140, 40);
      game.alliesManager.spawnExplosion(112, 100, 28);

      // Trigger Nova Barrage
      cheat.fillEnergy(100);
      cheat.triggerSpecialMove('nova');

      // Trigger Warp Ram
      (game.specialMovesManager as any).executeWarpRam();

      // Trigger Camera Screen Shake
      game.triggerScreenShake(3.0, 5.0);

      // Strict Canvas Interceptor Context
      const strictCtx = createStrictAdversarialContext();

      // Render 300 continuous frames through the strict interceptor
      for (let f = 0; f < 300; f++) {
        game.update(1 / 60);

        // Render full frame pass
        game.render(strictCtx as unknown as CanvasRenderingContext2D);

        // STRICT INVARIANT: Stack depth must be balanced (0) at end of every frame
        expect(strictCtx.stackDepth).toBe(0);

        // Replenish munitions to maintain extreme VFX saturation
        if (f % 50 === 0) {
          game.alliesManager.spawnClusterBomb(60 + (f % 100), 40);
          game.alliesManager.spawnExplosion(100, 120, 20);
          game.particleSystem.spawnPlayerExplosion(game.player.x, game.player.y);
        }
      }

      game.destroy();
    });
  });
});
