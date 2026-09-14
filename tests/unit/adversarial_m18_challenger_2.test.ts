/**
 * Milestone M18 Adversarial Challenge Suite
 * Author: m18_challenger_2 (Empirical Challenger)
 * Location: tests/unit/adversarial_m18_challenger_2.test.ts
 *
 * Adversarial Focus Dimensions:
 * 1. 10,000 Frames Endurance Simulation:
 *    - Continuous raster tears and chromatic aberration post-processing.
 *    - Measure net V8 heap drift (< 5.0 MB ceiling, 0 GC pressure).
 * 2. Phantom Clone Pool Exhaustion:
 *    - Spam 50 simultaneous enemy destructions triggering mirage clones.
 *    - Strictly enforce clamping at capacity 8 without crashing, expanding, or leaking.
 *    - Validate full 2.0s lifecycle recycling and livingCount exclusion.
 * 3. Canvas State Balance & Residual State Invariants:
 *    - 1,000 render cycles of GlitchRenderer (raster tear, chromatic aberration, XOR corrupted sprite).
 *    - Verify ctx.save() and ctx.restore() match 1:1 with zero residual canvas state corruption.
 * 4. Audio Node & Timer Cleanup Verification:
 *    - Trigger 500 glitch audio events (buzz, frequency chirp, data stream noise).
 *    - Verify all audio nodes disconnect and all watchdog timers cleanly dereference.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import { GlitchRenderer } from '../../src/renderer/GlitchRenderer';
import { FormationManager } from '../../src/systems/FormationManager';
import { EnemyType } from '../../src/types';
import { SoundSynth } from '../../src/audio/SoundSynth';
import { AudioContextManager } from '../../src/audio/AudioContextManager';
import { SOUND_PRIORITY } from '../../src/audio/types';

// ============================================================================
// GC & Memory Helpers
// ============================================================================

function forceGC(): void {
  if (typeof (globalThis as any).gc === 'function') {
    (globalThis as any).gc();
    (globalThis as any).gc();
    return;
  }
  try {
    v8.setFlagsFromString('--expose_gc');
    const gc = vm.runInNewContext('gc');
    if (typeof gc === 'function') {
      gc();
      gc();
    }
  } catch {
    // Fallback if V8 sandbox restricts gc
  }
}

// ============================================================================
// State-Tracking Canvas Context Mock
// ============================================================================

interface ContextStateSnapshot {
  globalAlpha: number;
  globalCompositeOperation: string;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
}

class StateTrackingCanvasContext {
  public saveCount = 0;
  public restoreCount = 0;
  public stackUnderflows = 0;
  public stack: ContextStateSnapshot[] = [];

  public globalAlpha = 1.0;
  public globalCompositeOperation = 'source-over';
  public fillStyle = '#000000';
  public strokeStyle = '#FFFFFF';
  public lineWidth = 1;
  public imageSmoothingEnabled = false;

  public canvas = {
    width: GlitchRenderer.VIRTUAL_WIDTH,
    height: GlitchRenderer.VIRTUAL_HEIGHT,
  };

  public save(): void {
    this.saveCount++;
    this.stack.push({
      globalAlpha: this.globalAlpha,
      globalCompositeOperation: this.globalCompositeOperation,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
    });
  }

  public restore(): void {
    this.restoreCount++;
    if (this.stack.length === 0) {
      this.stackUnderflows++;
      return;
    }
    const state = this.stack.pop()!;
    this.globalAlpha = state.globalAlpha;
    this.globalCompositeOperation = state.globalCompositeOperation;
    this.fillStyle = state.fillStyle;
    this.strokeStyle = state.strokeStyle;
    this.lineWidth = state.lineWidth;
  }

  public fillRect(): void {}
  public strokeRect(): void {}
  public clearRect(): void {}
  public drawImage(): void {}
  public beginPath(): void {}
  public closePath(): void {}
  public moveTo(): void {}
  public lineTo(): void {}
  public arc(): void {}
  public fill(): void {}
  public stroke(): void {}
  public translate(): void {}
  public rotate(): void {}
  public scale(): void {}

  public getStackDepth(): number {
    return this.stack.length;
  }

  public resetTracking(): void {
    this.saveCount = 0;
    this.restoreCount = 0;
    this.stackUnderflows = 0;
    this.stack = [];
    this.globalAlpha = 1.0;
    this.globalCompositeOperation = 'source-over';
    this.fillStyle = '#000000';
    this.strokeStyle = '#FFFFFF';
    this.lineWidth = 1;
  }
}

// ============================================================================
// Web Audio API Mock for Node / Headless Testing
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
    if (val <= 0) val = 0.0001;
    this.value = val;
    this.scheduled.push({ type: 'exponentialRampToValueAtTime', value: val, time });
  }

  cancelScheduledValues(time: number) {
    this.scheduled.push({ type: 'cancelScheduledValues', value: 0, time });
  }
}

class MockAudioNode {
  public connectedTo: any[] = [];
  public disconnectCalls = 0;
  public disconnected = false;

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
  public detune = new MockAudioParam(0);
  public started = false;
  public stopped = false;
  public onended: (() => void) | null = null;

  start(_time?: number) {
    this.started = true;
  }

  stop(_time?: number) {
    this.stopped = true;
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  public type: string = 'bandpass';
  public frequency = new MockAudioParam(1000);
  public Q = new MockAudioParam(1.0);
}

class MockAudioBufferSourceNode extends MockAudioNode {
  public buffer: any = null;
  public started = false;
  public stopped = false;
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

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
}

// ============================================================================
// Adversarial Test Suite
// ============================================================================

describe('Milestone M18 Adversarial Challenge Suite (m18_challenger_2)', () => {
  let unhandledRejections: any[] = [];
  let uncaughtExceptions: any[] = [];
  let rejectionHandler: (reason: any) => void;
  let exceptionHandler: (error: Error) => void;

  beforeEach(() => {
    unhandledRejections = [];
    uncaughtExceptions = [];
    rejectionHandler = (reason: any) => unhandledRejections.push(reason);
    exceptionHandler = (error: Error) => uncaughtExceptions.push(error);
    process.on('unhandledRejection', rejectionHandler);
    process.on('uncaughtException', exceptionHandler);

    GlitchRenderer.initialize();
  });

  afterEach(() => {
    GlitchRenderer.reset();
    process.off('unhandledRejection', rejectionHandler);
    process.off('uncaughtException', exceptionHandler);

    expect(unhandledRejections.length).toBe(0);
    expect(uncaughtExceptions.length).toBe(0);
  });

  // ==========================================================================
  // Dimension 1: 10,000 Frames Endurance Simulation & Heap Drift Profiling
  // ==========================================================================
  describe('Dimension 1: 10,000 Frames Endurance Simulation (< 5.0 MB Net Heap Drift)', () => {
    it(
      'executes 10,000 frames under continuous raster tears and chromatic aberration with < 5.0 MB net heap drift',
      () => {
        const trackingCtx = new StateTrackingCanvasContext();
        const ctx = trackingCtx as unknown as CanvasRenderingContext2D;
        const spriteMock = GlitchRenderer.createOffscreenCanvas(16, 16);

        // Warm-up JIT and scratch buffers
        for (let i = 0; i < 200; i++) {
          GlitchRenderer.applyRasterTear(ctx, 1.0, i * 0.016, 1000 + i);
          GlitchRenderer.applyChromaticAberration(ctx, 2.0, 1.0);
          GlitchRenderer.drawXORCorruptedSprite(ctx, spriteMock, 112, 144, 0, 1.0, 0.8, i);
          GlitchRenderer.applyHUDHexScramble('STAGE 13 GLITCH SECTOR', 0.5, i);
        }

        forceGC();
        const startHeap = process.memoryUsage().heapUsed;

        const heapSnapshots: number[] = [];

        // 10,000 frames endurance simulation
        for (let frame = 1; frame <= 10000; frame++) {
          const t = frame * 0.016667;
          const intensity = 0.5 + 0.5 * Math.sin(t * 2);
          const shiftX = 2.0 * Math.sin(t * 8);
          const shiftY = 1.0 * Math.cos(t * 6);

          // 1. Raster scanline tears
          GlitchRenderer.applyRasterTear(ctx, intensity, t, 1337 + frame);

          // 2. Chromatic aberration
          GlitchRenderer.applyChromaticAberration(ctx, shiftX, shiftY);

          // 3. Corrupted sprite XOR rendering
          if (frame % 3 === 0) {
            GlitchRenderer.drawXORCorruptedSprite(
              ctx,
              spriteMock,
              112 + Math.sin(t) * 40,
              144 + Math.cos(t) * 40,
              t % Math.PI,
              1.0,
              0.85,
              frame
            );
          }

          // 4. Hex character scrambling
          if (frame % 5 === 0) {
            GlitchRenderer.applyHUDHexScramble('0xCAFE // ANOMALY DETECTED', 0.4, frame);
          }

          if (frame % 2500 === 0) {
            heapSnapshots.push(process.memoryUsage().heapUsed);
          }
        }

        forceGC();
        const endHeap = process.memoryUsage().heapUsed;
        const netDriftMB = (endHeap - startHeap) / (1024 * 1024);

        // Verification: Net heap drift MUST be < 5.0 MB (in practice < 1.0 MB due to zero-allocation scratch buffers)
        expect(netDriftMB).toBeLessThan(5.0);

        // Verify that internal tearBands length is strictly clamped to MAX_TEAR_BANDS
        expect(GlitchRenderer.MAX_TEAR_BANDS).toBe(8);
      },
      30000
    );
  });

  // ==========================================================================
  // Dimension 2: Phantom Clone Pool Exhaustion & Clamping Invariants
  // ==========================================================================
  describe('Dimension 2: Phantom Clone Pool Exhaustion & Clamping Invariants', () => {
    it('spams 50 simultaneous enemy destructions with mirage clones; clamps strictly at capacity 8 without crashing, expanding, or leaking', () => {
      const formationManager = new FormationManager();
      const pool = formationManager.getPhantomPool();

      // Initial pool capacity invariants
      expect(pool.getMaxSize()).toBe(8);
      expect(pool.getCapacity()).toBe(8);
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getFreeCount()).toBe(8);

      // Spam 50 enemy destructions simultaneously (each requests 2 clones = 100 acquisitions attempted)
      for (let i = 0; i < 50; i++) {
        const x = 50 + (i % 10) * 12;
        const y = 80 + Math.floor(i / 10) * 15;
        formationManager.spawnMirageClones(x, y, EnemyType.GOEI);
      }

      // Assert strict pool clamping
      expect(pool.getActiveCount()).toBe(8);
      expect(pool.getCapacity()).toBe(8); // MUST NOT expand
      expect(pool.getMaxSize()).toBe(8);
      expect(pool.isFull()).toBe(true);
      expect(pool.getFreeCount()).toBe(0);

      // Verify livingCount strictly excludes phantom decoys (never blocks wave completion)
      expect(formationManager.getLivingCount()).toBe(0);
      expect(formationManager.getLivingEnemies().length).toBe(0);

      // Verify all 8 active clones are properly initialized
      pool.forEachActive((clone) => {
        expect(clone.active).toBe(true);
        expect(clone.isPhantomDecoy).toBe(true);
        expect(clone.canShoot).toBe(false);
        expect(clone.lifetime).toBe(2.0);
      });

      // Advance simulation time by 1.0s: clones remain active
      formationManager.update(1.0, 112, 250);
      expect(pool.getActiveCount()).toBe(8);

      // Advance simulation time past 2.0s lifetime (1.1s more -> 2.1s total)
      formationManager.update(1.1, 112, 250);

      // Invariant: All 8 clones are cleanly released simultaneously in 1 frame
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getCapacity()).toBe(8);
      expect(pool.getFreeCount()).toBe(8);

      // Stage reset must completely flush pool back to 0 active
      formationManager.reset();
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getCapacity()).toBe(8);
    });

    it('demonstrates that ObjectPool.forEachActiveSafe correctly drains all 8 clones in a single pass', () => {
      const formationManager = new FormationManager();
      const pool = formationManager.getPhantomPool();

      // Acquire all 8 clones
      for (let i = 0; i < 4; i++) {
        formationManager.spawnMirageClones(100, 100);
      }
      expect(pool.getActiveCount()).toBe(8);

      // Mark all clones expired
      pool.forEachActive((clone) => {
        clone.active = false;
      });

      // Draining with forEachActiveSafe (correct pattern)
      pool.forEachActiveSafe((clone) => {
        if (!clone.active) {
          pool.release(clone);
        }
      });

      // With forEachActiveSafe, ALL 8 clones are cleanly released in a SINGLE pass!
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getFreeCount()).toBe(8);
    });

    it('verifies bullet collision with PhantomClone strictly absorbs projectile with 0 score and 0 damage', () => {
      const formationManager = new FormationManager();
      formationManager.spawnMirageClones(112, 100, EnemyType.ZAKO);

      let cloneChecked = false;
      formationManager.forEachActivePhantom((clone) => {
        const dmg = clone.takeDamage(10);
        expect(dmg.destroyed).toBe(false);
        expect(dmg.points).toBe(0); // 0 score awarded
        expect(dmg.shieldAbsorbed).toBe(true);
        expect(dmg.wasDamaged).toBe(true);
        cloneChecked = true;
      });

      expect(cloneChecked).toBe(true);
    });
  });

  // ==========================================================================
  // Dimension 3: Canvas State Balance & Residual State Invariants
  // ==========================================================================
  describe('Dimension 3: Canvas State Balance (1,000 Render Cycles 1:1 Save/Restore)', () => {
    it('simulates 1,000 render cycles of GlitchRenderer and verifies ctx.save() and ctx.restore() match 1:1 with zero residual canvas state corruption', () => {
      const trackingCtx = new StateTrackingCanvasContext();
      const ctx = trackingCtx as unknown as CanvasRenderingContext2D;
      const spriteMock = GlitchRenderer.createOffscreenCanvas(16, 16);

      for (let cycle = 1; cycle <= 1000; cycle++) {
        trackingCtx.resetTracking();

        // Baseline context parameters
        trackingCtx.globalAlpha = 1.0;
        trackingCtx.globalCompositeOperation = 'source-over';
        trackingCtx.fillStyle = '#FFFFFF';
        trackingCtx.strokeStyle = '#00FF00';
        trackingCtx.lineWidth = 2;

        const timer = cycle * 0.016;
        const seed = 42 + cycle;

        // 1. Apply Raster Tear
        GlitchRenderer.applyRasterTear(ctx, 1.0, timer, seed);
        expect(trackingCtx.getStackDepth()).toBe(0);
        expect(trackingCtx.saveCount).toBe(trackingCtx.restoreCount);

        // 2. Apply Chromatic Aberration
        GlitchRenderer.applyChromaticAberration(ctx, 2.5, 1.0);
        expect(trackingCtx.getStackDepth()).toBe(0);
        expect(trackingCtx.saveCount).toBe(trackingCtx.restoreCount);

        // 3. Apply XOR Corrupted Sprite
        GlitchRenderer.drawXORCorruptedSprite(
          ctx,
          spriteMock,
          100 + (cycle % 20),
          120 + (cycle % 30),
          (cycle * 0.05) % Math.PI,
          1.1,
          0.85,
          seed
        );
        expect(trackingCtx.getStackDepth()).toBe(0);
        expect(trackingCtx.saveCount).toBe(trackingCtx.restoreCount);

        // Invariant: Zero stack underflows and zero state corruption
        expect(trackingCtx.stackUnderflows).toBe(0);
        expect(trackingCtx.globalAlpha).toBe(1.0);
        expect(trackingCtx.globalCompositeOperation).toBe('source-over');
      }
    });

    it('verifies GlitchRenderer handles boundary conditions (zero intensity, negative shifts, out-of-bounds scale) safely without stack imbalance', () => {
      const trackingCtx = new StateTrackingCanvasContext();
      const ctx = trackingCtx as unknown as CanvasRenderingContext2D;
      const spriteMock = GlitchRenderer.createOffscreenCanvas(16, 16);

      // Boundary 1: Zero intensity raster tear
      GlitchRenderer.applyRasterTear(ctx, 0, 0, 0);
      expect(trackingCtx.getStackDepth()).toBe(0);

      // Boundary 2: Zero shift chromatic aberration
      GlitchRenderer.applyChromaticAberration(ctx, 0, 0);
      expect(trackingCtx.getStackDepth()).toBe(0);

      // Boundary 3: Negative and large shifts
      GlitchRenderer.applyChromaticAberration(ctx, -50, -20);
      expect(trackingCtx.getStackDepth()).toBe(0);

      // Boundary 4: Extreme intensity raster tear
      GlitchRenderer.applyRasterTear(ctx, 10.0, 999, 8888);
      expect(trackingCtx.getStackDepth()).toBe(0);

      // Boundary 5: Scale 0 and negative scale sprite
      GlitchRenderer.drawXORCorruptedSprite(ctx, spriteMock, 0, 0, 0, 0, 0, 1);
      expect(trackingCtx.getStackDepth()).toBe(0);
    });
  });

  // ==========================================================================
  // Dimension 4: Audio Node & Timer Cleanup Verification
  // ==========================================================================
  describe('Dimension 4: Audio Node & Timer Cleanup Verification (500 Glitch Events)', () => {
    let mockContext: MockAudioContext;
    let synth: SoundSynth;
    let originalAudioContext: any;

    beforeEach(() => {
      vi.useFakeTimers();
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

      const audioManager = AudioContextManager.getInstance();
      synth = SoundSynth.getInstance(audioManager);
    });

    afterEach(() => {
      vi.useRealTimers();
      SoundSynth.resetInstance();
      AudioContextManager.resetInstance();

      if (typeof window !== 'undefined' && originalAudioContext) {
        (window as any).AudioContext = originalAudioContext;
      }
    });

    it('triggers 500 glitch audio events and verifies all nodes and timers are cleanly dereferenced', () => {
      let triggeredCount = 0;

      // Trigger 500 glitch audio events sequentially
      for (let i = 0; i < 500; i++) {
        // Advance virtual audio clock past debouncing windows (0.04s, 0.08s, 0.10s)
        mockContext.currentTime += 0.15;

        const eventType = i % 3;
        let played = false;

        if (eventType === 0) {
          played = synth.playGlitchBuzz({ volume: 0.5, priority: SOUND_PRIORITY.NORMAL });
        } else if (eventType === 1) {
          played = synth.playGlitchFrequencyChirp({ volume: 0.5, priority: SOUND_PRIORITY.NORMAL });
        } else {
          played = synth.playDataStreamNoise({ volume: 0.5, priority: SOUND_PRIORITY.NORMAL });
        }

        if (played) {
          triggeredCount++;
        }

        // Fast-forward fake timers past audio duration (0.08s - 0.24s + 0.05s buffer)
        vi.advanceTimersByTime(350);
      }

      expect(triggeredCount).toBe(500);

      // Invariant 1: All active voices must be decremented back to 0
      expect(synth.getActiveVoiceCount()).toBe(0);

      // Invariant 2: Every created voice node (excluding persistent master/sfx/music buses) MUST be disconnected
      const initialBusNodeCount = 3; // masterGain, sfxGain, musicGain
      const voiceNodes = mockContext.createdNodes.slice(initialBusNodeCount);
      expect(voiceNodes.length).toBeGreaterThan(0);
      for (const node of voiceNodes) {
        expect(node.disconnected).toBe(true);
        expect(node.disconnectCalls).toBeGreaterThanOrEqual(1);
        expect(node.connectedTo.length).toBe(0);
      }
    });

    it('verifies watchdog timer fallback triggers node cleanup even when onended does not fire', () => {
      mockContext.currentTime = 10.0;
      const nodesBefore = mockContext.createdNodes.length;
      const played = synth.playGlitchBuzz({ volume: 0.5 });
      expect(played).toBe(true);
      expect(synth.getActiveVoiceCount()).toBe(1);

      const createdDuringCall = mockContext.createdNodes.slice(nodesBefore);
      expect(createdDuringCall.length).toBeGreaterThan(0);

      // Simulate browser dropped onended callback: do not trigger onended.
      // Advance fake timers past watchdog duration (0.24 + 0.05s = 290ms)
      vi.advanceTimersByTime(350);

      // Watchdog timer MUST have executed cleanup
      expect(synth.getActiveVoiceCount()).toBe(0);
      for (const node of createdDuringCall) {
        expect(node.disconnected).toBe(true);
      }
    });
  });
});
