/**
 * Galaga Arcade Web Game — Milestone 14 Adversarial Audio Stress Test Suite
 * Author: m14_challenger_1 (Empirical Challenger)
 *
 * Adversarial Focus Dimensions:
 * 1. High-frequency rapid audio trigger spam (100+ simultaneous SFX calls in 1 frame):
 *    Verify 16-voice priority queue rejects/preempts correctly without crashing,
 *    without node accumulation, and without memory leaks.
 * 2. Dual-cleanup watchdog timer verification:
 *    Ensure all audio nodes register cleanup and disconnect properly on sound completion,
 *    verifying both the primarySource.onended path and the watchdog setTimeout fallback path.
 * 3. AudioContext state transitions (suspended, running, closed) and mock safety:
 *    Verify headless execution, rapid mute cycling, edge-case math parameters (NaN, negative),
 *    and clean teardown.
 * 4. Debouncing map efficiency:
 *    Verify rapid spam of identical SFX within debouncing window does not allocate redundant voices.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioContextManager } from '../../src/audio/AudioContextManager';
import { SoundSynth } from '../../src/audio/SoundSynth';
import { SOUND_PRIORITY } from '../../src/audio/types';

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
      throw new RangeError('The provided float value is non-positive, which is not supported by exponentialRampToValueAtTime.');
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

describe('Milestone 14 Adversarial Procedural Audio Stress Suite', () => {
  let originalAudioContext: any;
  let synth: SoundSynth;
  let mockContext: MockAudioContext;

  beforeEach(() => {
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
  });

  // ==========================================================================
  // Dimension 1: High-Frequency Rapid Audio Trigger Spam (100+ Calls / Frame)
  // ==========================================================================
  describe('Dimension 1: Rapid Audio Trigger Spam & 16-Voice Priority Queue', () => {
    it('throttles 150 simultaneous standard-priority SFX calls in 1 frame strictly to 12 voices with zero node leakage on rejects', () => {
      const initialNodeCount = mockContext.createdNodes.length;
      let successCount = 0;
      let rejectCount = 0;

      // 150 rapid triggers of standard priority SFX in a single synchronous frame
      for (let i = 0; i < 150; i++) {
        const result = synth.playHeavyLaserBlast();
        if (result) {
          successCount++;
        } else {
          rejectCount++;
        }
      }

      // Exactly 12 must succeed (MAX_CONCURRENT_VOICES = 12)
      expect(successCount).toBe(12);
      expect(rejectCount).toBe(138);
      expect(synth.getActiveVoiceCount()).toBe(12);

      // Node verification: 7 nodes per heavy laser blast (osc1, osc2, filter, gain, noise, noiseFilter, noiseGain)
      // 12 accepted voices = 84 nodes created.
      // 138 rejected calls must NOT create any audio nodes!
      const createdDuringSpam = mockContext.createdNodes.length - initialNodeCount;
      expect(createdDuringSpam).toBe(12 * 7);
    });

    it('manages 16-voice priority queue with standard (12) and high-priority (16) headroom preemption', () => {
      // 1. Fill 12 standard channels completely
      for (let i = 0; i < 12; i++) {
        const ok = synth.playHeavyLaserBlast();
        expect(ok).toBe(true);
      }
      expect(synth.getActiveVoiceCount()).toBe(12);

      // 2. Standard sound is now rejected
      expect(synth.playHeavyLaserBlast()).toBe(false);

      // 3. High-priority sounds (Priority 3) can access the 4-voice emergency headroom
      const highPriorityCalls = [
        () => synth.playWarpRamSonicBoom(),
        () => synth.playCrisisKlaxon(),
        () => synth.playChronoFreezeDrop(),
        () => synth.playEnrageSiren(),
      ];

      for (const call of highPriorityCalls) {
        expect(call()).toBe(true);
      }

      // Voice count must be exactly at absolute cap 16
      expect(synth.getActiveVoiceCount()).toBe(16);

      // 4. Any further call (even high priority) must be rejected
      expect(synth.playWarpRamSonicBoom()).toBe(false);
      expect(synth.playCrisisKlaxon()).toBe(false);
      expect(synth.playDarkMatterBeamRoar()).toBe(false);
      expect(synth.getActiveVoiceCount()).toBe(16);
    });

    it('enforces low-priority (Priority 1) voice ceiling at 10 active channels', () => {
      // Fill 9 voices with standard sounds (NORMAL priority)
      for (let i = 0; i < 9; i++) {
        expect(synth.playHeavyLaserBlast()).toBe(true);
      }
      expect(synth.getActiveVoiceCount()).toBe(9);

      // 10th voice with LOW priority succeeds (9 < 10)
      expect(synth.playHeavyLaserBlast({ priority: SOUND_PRIORITY.LOW })).toBe(true);
      expect(synth.getActiveVoiceCount()).toBe(10);

      // 11th call with LOW priority must be rejected (10 < 10 is false)
      expect(synth.playHeavyLaserBlast({ priority: SOUND_PRIORITY.LOW })).toBe(false);
      expect(synth.playWarpRamSonicBoom({ priority: SOUND_PRIORITY.LOW })).toBe(false);

      // But NORMAL priority can still enter channels 11 and 12 (activeVoiceCount < 12)
      expect(synth.playHeavyLaserBlast()).toBe(true);
      expect(synth.playHeavyLaserBlast()).toBe(true);
      expect(synth.getActiveVoiceCount()).toBe(12);

      // NORMAL now capped at 12
      expect(synth.playHeavyLaserBlast()).toBe(false);
    });

    it('survives massive 300-call burst of randomized audio events across all priorities without memory corruption', () => {
      const soundGenerators = [
        () => synth.playHeavyLaserBlast(),
        () => synth.playNaniteSplitShimmer(),
        () => synth.playPhantomDiveWarble(),
        () => synth.playTelekineticStunScreech(),
        () => synth.playShieldRepairChime(),
        () => synth.playBomberEngineSweep(),
        () => synth.playClusterBombThud(),
        () => synth.playNovaLockChime(),
        // High priority
        () => synth.playWarpRamSonicBoom(),
        () => synth.playCrisisKlaxon(),
        () => synth.playChronoFreezeDrop(),
        () => synth.playDarkMatterIgnition(),
        // Low priority
        () => synth.playEscortPlasmaBolt(),
        () => synth.playClockFreezeTick(),
      ];

      for (let i = 0; i < 300; i++) {
        const fn = soundGenerators[i % soundGenerators.length]!;
        fn();
      }

      // Active voice count must never exceed 16 under any stress condition
      expect(synth.getActiveVoiceCount()).toBeLessThanOrEqual(16);
      expect(synth.getActiveVoiceCount()).toBeGreaterThan(0);
    });

    it('recovers all voice channels cleanly after all active voices finish onended', () => {
      // Saturated with 16 voices
      for (let i = 0; i < 12; i++) {
        synth.playHeavyLaserBlast();
      }
      synth.playWarpRamSonicBoom();
      synth.playCrisisKlaxon();
      synth.playChronoFreezeDrop();
      synth.playEnrageSiren();
      expect(synth.getActiveVoiceCount()).toBe(16);

      // Trigger onended for all created oscillator/source nodes
      for (const node of mockContext.createdNodes) {
        if ('onended' in node && typeof (node as any).onended === 'function') {
          (node as any).onended();
        }
      }

      // Voice count must return to exactly 0
      expect(synth.getActiveVoiceCount()).toBe(0);

      // Channels are completely reopened: a new batch of 12 standard + 4 high priority sounds succeed
      for (let i = 0; i < 12; i++) {
        expect(synth.playHeavyLaserBlast()).toBe(true);
      }
      expect(synth.playWarpRamSonicBoom()).toBe(true);
      expect(synth.getActiveVoiceCount()).toBe(13);
    });
  });

  // ==========================================================================
  // Dimension 2: Dual-Cleanup & Watchdog Timer Node Teardown
  // ==========================================================================
  describe('Dimension 2: Dual-Cleanup Watchdog Timer & Node Disconnection', () => {
    it('executes clean node disconnection and voice recovery on primarySource.onended', () => {
      const initialNodeCount = mockContext.createdNodes.length;
      expect(synth.playHeavyLaserBlast()).toBe(true);
      expect(synth.getActiveVoiceCount()).toBe(1);

      // Collect nodes created for this sound
      const createdNodes = mockContext.createdNodes.slice(initialNodeCount);
      expect(createdNodes.length).toBe(7);

      // Nodes are initially connected and not disconnected
      for (const node of createdNodes) {
        expect(node.disconnected).toBe(false);
      }

      // Find the primary source oscillator with onended attached
      const primaryOsc = createdNodes.find(
        (n) => n instanceof MockOscillatorNode && typeof n.onended === 'function'
      ) as MockOscillatorNode;
      expect(primaryOsc).toBeDefined();

      // Trigger onended
      primaryOsc.onended!();

      // All 7 nodes must now be disconnected
      for (const node of createdNodes) {
        expect(node.disconnected).toBe(true);
      }
      expect(synth.getActiveVoiceCount()).toBe(0);
    });

    it('triggers watchdog setTimeout fallback when primarySource.onended fails to fire', () => {
      vi.useFakeTimers();
      try {
        const initialNodeCount = mockContext.createdNodes.length;
        // playHeavyLaserBlast has duration = 0.35s, watchdog timeout is ceil((0.35 + 0.05) * 1000) = 400ms
        expect(synth.playHeavyLaserBlast()).toBe(true);
        expect(synth.getActiveVoiceCount()).toBe(1);

        const createdNodes = mockContext.createdNodes.slice(initialNodeCount);

        // Advance timer partially (200ms) — watchdog has not fired yet
        vi.advanceTimersByTime(200);
        expect(synth.getActiveVoiceCount()).toBe(1);
        expect(createdNodes[0]!.disconnected).toBe(false);

        // Advance timer past 400ms without calling onended
        vi.advanceTimersByTime(250);

        // Watchdog must have executed cleanup!
        expect(synth.getActiveVoiceCount()).toBe(0);
        for (const node of createdNodes) {
          expect(node.disconnected).toBe(true);
        }
      } finally {
        vi.useRealTimers();
      }
    });

    it('guarantees idempotency: both onended and watchdog timer firing does not cause double-decrement', () => {
      vi.useFakeTimers();
      try {
        expect(synth.playHeavyLaserBlast()).toBe(true);
        expect(synth.getActiveVoiceCount()).toBe(1);

        const primaryOsc = mockContext.createdNodes.find(
          (n) => n instanceof MockOscillatorNode && typeof n.onended === 'function'
        ) as MockOscillatorNode;

        // 1. Fire onended first
        primaryOsc.onended!();
        expect(synth.getActiveVoiceCount()).toBe(0);

        // 2. Advance time so watchdog timeout also fires
        vi.advanceTimersByTime(1000);

        // Must still be 0, never negative (-1)
        expect(synth.getActiveVoiceCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('disconnects all nodes cleanly for continuous audio loops upon stop()', () => {
      // Start continuous loops
      expect(synth.playDimensionalTearHum(true)).toBe(true);
      expect(synth.playBlackHoleSuctionRumble(true)).toBe(true);
      expect(synth.playOrbitalShieldHum(true)).toBe(true);
      expect(synth.getActiveVoiceCount()).toBe(3);

      // Stop them individually
      synth.stopDimensionalTearHum();
      expect(synth.getActiveVoiceCount()).toBe(2);

      synth.stopBlackHoleSuctionRumble();
      expect(synth.getActiveVoiceCount()).toBe(1);

      synth.stopOrbitalShieldHum();
      expect(synth.getActiveVoiceCount()).toBe(0);

      // Calling stop again is safe and idempotent
      synth.stopDimensionalTearHum();
      synth.stopBlackHoleSuctionRumble();
      synth.stopOrbitalShieldHum();
      expect(synth.getActiveVoiceCount()).toBe(0);
    });

    it('verifies 100% node disconnection across all 24 M14 procedural audio synthesis methods', () => {
      vi.useFakeTimers();
      try {
        const methods: Array<{ name: string; invoke: () => boolean }> = [
          { name: 'playHeavyLaserBlast', invoke: () => synth.playHeavyLaserBlast() },
          { name: 'playSpiralRingWhoosh', invoke: () => synth.playSpiralRingWhoosh() },
          { name: 'playDimensionalTearHum', invoke: () => synth.playDimensionalTearHum(false) },
          { name: 'playBlackHoleSuctionRumble', invoke: () => synth.playBlackHoleSuctionRumble(false) },
          { name: 'playNaniteSplitShimmer', invoke: () => synth.playNaniteSplitShimmer() },
          { name: 'playGrayGooDissolveHiss', invoke: () => synth.playGrayGooDissolveHiss() },
          { name: 'playPhantomDiveWarble', invoke: () => synth.playPhantomDiveWarble() },
          { name: 'playTelekineticStunScreech', invoke: () => synth.playTelekineticStunScreech() },
          { name: 'playOrbitalShieldHum', invoke: () => synth.playOrbitalShieldHum(false) },
          { name: 'playDarkMatterBeamCharge', invoke: () => synth.playDarkMatterBeamCharge() },
          { name: 'playDarkMatterBeamRoar', invoke: () => synth.playDarkMatterBeamRoar() },
          { name: 'playEnrageSiren', invoke: () => synth.playEnrageSiren() },
          { name: 'playCrisisKlaxon', invoke: () => synth.playCrisisKlaxon() },
          { name: 'playDigitalGlitch', invoke: () => synth.playDigitalGlitch() },
          { name: 'playLightningCrackle', invoke: () => synth.playLightningCrackle() },
          { name: 'playDarkMatterIgnition', invoke: () => synth.playDarkMatterIgnition() },
          { name: 'playEscortPlasmaBolt', invoke: () => synth.playEscortPlasmaBolt() },
          { name: 'playShieldRepairChime', invoke: () => synth.playShieldRepairChime() },
          { name: 'playPointDefensePing', invoke: () => synth.playPointDefensePing() },
          { name: 'playBomberEngineSweep', invoke: () => synth.playBomberEngineSweep() },
          { name: 'playClusterBombThud', invoke: () => synth.playClusterBombThud() },
          { name: 'playNovaLockChime', invoke: () => synth.playNovaLockChime() },
          { name: 'playNovaMissileSwoosh', invoke: () => synth.playNovaMissileSwoosh() },
          { name: 'playChronoFreezeDrop', invoke: () => synth.playChronoFreezeDrop() },
          { name: 'playClockFreezeTick', invoke: () => synth.playClockFreezeTick() },
          { name: 'playWarpRamSonicBoom', invoke: () => synth.playWarpRamSonicBoom() },
        ];

        for (const item of methods) {
          // Advance currentTime to clear debouncing window
          mockContext.currentTime += 1.0;
          const beforeNodes = mockContext.createdNodes.length;

          const res = item.invoke();
          expect(res, `${item.name} failed to play`).toBe(true);

          const spawnedNodes = mockContext.createdNodes.slice(beforeNodes);
          expect(spawnedNodes.length, `${item.name} spawned no audio nodes`).toBeGreaterThan(0);

          // Fast forward watchdog timer past duration
          vi.advanceTimersByTime(4000);

          // Check that every single node created by this method was disconnected
          for (const node of spawnedNodes) {
            expect(node.disconnected, `${item.name} left node connected`).toBe(true);
          }
          expect(synth.getActiveVoiceCount(), `${item.name} leaked active voice count`).toBe(0);
        }
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ==========================================================================
  // Dimension 3: AudioContext State Transitions & Mock Safety
  // ==========================================================================
  describe('Dimension 3: AudioContext State Transitions & Mock Safety', () => {
    it('handles suspended AudioContext state gracefully and unlocks upon user gesture', async () => {
      mockContext.state = 'suspended';
      const acm = AudioContextManager.getInstance();
      expect(acm.isAudioUnlocked()).toBe(false);

      // Sound should still schedule without crashing in suspended state
      const played = synth.playHeavyLaserBlast();
      expect(played).toBe(true);

      // Unlock on user interaction gesture
      const unlocked = await acm.unlock();
      expect(unlocked).toBe(true);
      expect(mockContext.state).toBe('running');
      expect(acm.isAudioUnlocked()).toBe(true);
    });

    it('safely disables audio generation when AudioContext transitions to closed or is destroyed', async () => {
      const acm = AudioContextManager.getInstance();
      
      // Transition context state to closed
      await mockContext.close();
      expect(mockContext.state).toBe('closed');
      expect(acm.getStatus().state).toBe('closed');

      // Now destroy the audio manager
      await acm.destroy();
      expect(acm.getSfxGain()).toBeNull();
      expect(acm.getMasterGain()).toBeNull();
      expect(acm.isAudioUnlocked()).toBe(false);

      // Sound triggers safely handle closed/destroyed state without crashes
      expect(() => {
        synth.playHeavyLaserBlast();
        synth.playWarpRamSonicBoom();
      }).not.toThrow();
    });

    it('operates safely in headless / unsupported environments where AudioContext is undefined', () => {
      delete (window as any).AudioContext;
      delete (window as any).webkitAudioContext;

      AudioContextManager.resetInstance();
      SoundSynth.resetInstance();
      const headlessAcm = AudioContextManager.getInstance();

      expect(headlessAcm.isSupported()).toBe(false);
      expect(headlessAcm.init()).toBe(false);
      expect(headlessAcm.getContext()).toBeNull();
      expect(headlessAcm.getSfxGain()).toBeNull();

      const headlessSynth = SoundSynth.getInstance(headlessAcm);
      expect(headlessSynth.playHeavyLaserBlast()).toBe(false);
      expect(headlessSynth.playWarpRamSonicBoom()).toBe(false);
      expect(headlessSynth.getActiveVoiceCount()).toBe(0);
    });

    it('survives extreme, negative, and invalid arithmetic parameters without RangeError or NaN crashes', () => {
      // Exponential ramps in Web Audio require positive non-zero targets.
      // Audio engine must clamp or guard against pitch <= 0 or volume <= 0.
      const extremeOptions = [
        { volume: -1, pitch: -1 },
        { volume: 0, pitch: 0 },
        { volume: NaN, pitch: NaN },
        { volume: Infinity, pitch: Infinity },
        { volume: 100, pitch: 10 },
      ];

      for (const opt of extremeOptions) {
        expect(() => {
          synth.playHeavyLaserBlast(opt);
          synth.playWarpRamSonicBoom(opt);
          synth.playChronoFreezeDrop(opt);
          synth.playNovaMissileSwoosh(opt);
        }).not.toThrow();
      }
    });

    it('survives 200 rapid mute/unmute toggles while sounds are actively playing without audio pipeline crash', () => {
      const acm = AudioContextManager.getInstance();

      for (let i = 0; i < 200; i++) {
        acm.toggleMute();
        if (i % 10 === 0) {
          synth.playHeavyLaserBlast();
        }
      }

      // Restoring to unmuted state
      acm.setMuted(false);
      expect(acm.getIsMuted()).toBe(false);
      expect(synth.playHeavyLaserBlast()).toBe(true);
    });
  });

  // ==========================================================================
  // Dimension 4: Debouncing Map Efficiency
  // ==========================================================================
  describe('Dimension 4: Debouncing Map Efficiency & Spam Suppression', () => {
    it('suppresses 100 rapid calls to playSpiralRingWhoosh within 80ms debouncing window to exactly 1 voice', () => {
      const initialNodes = mockContext.createdNodes.length;
      let playedCount = 0;
      let debouncedCount = 0;

      for (let i = 0; i < 100; i++) {
        if (synth.playSpiralRingWhoosh()) {
          playedCount++;
        } else {
          debouncedCount++;
        }
      }

      // Exactly 1 voice played, 99 rejected by debouncing
      expect(playedCount).toBe(1);
      expect(debouncedCount).toBe(99);
      expect(synth.getActiveVoiceCount()).toBe(1);

      // Node count must only reflect the 1 accepted sound, zero nodes for the 99 debounced calls
      const spawnedNodes = mockContext.createdNodes.length - initialNodes;
      expect(spawnedNodes).toBeGreaterThan(0);
      expect(spawnedNodes).toBeLessThan(10);
    });

    it('suppresses rapid spam for all debounced SFX categories', () => {
      // grayGoo (40ms cooldown)
      expect(synth.playGrayGooDissolveHiss()).toBe(true);
      for (let i = 0; i < 20; i++) {
        expect(synth.playGrayGooDissolveHiss()).toBe(false);
      }

      // digitalGlitch (50ms cooldown)
      expect(synth.playDigitalGlitch()).toBe(true);
      for (let i = 0; i < 20; i++) {
        expect(synth.playDigitalGlitch()).toBe(false);
      }

      // flakPing (30ms cooldown)
      expect(synth.playPointDefensePing()).toBe(true);
      for (let i = 0; i < 20; i++) {
        expect(synth.playPointDefensePing()).toBe(false);
      }

      // novaSwoosh (40ms cooldown)
      expect(synth.playNovaMissileSwoosh()).toBe(true);
      for (let i = 0; i < 20; i++) {
        expect(synth.playNovaMissileSwoosh()).toBe(false);
      }
    });

    it('permits re-triggering of debounced SFX once the cooldown time has elapsed', () => {
      // First play
      expect(synth.playSpiralRingWhoosh()).toBe(true);

      // Immediate replay rejected
      expect(synth.playSpiralRingWhoosh()).toBe(false);

      // Advance mock AudioContext time past the 0.08s cooldown
      mockContext.currentTime += 0.085;

      // Re-trigger succeeds!
      expect(synth.playSpiralRingWhoosh()).toBe(true);
    });

    it('verifies that independent debouncing keys do not block each other', () => {
      // Triggering digitalGlitch must NOT debounce grayGoo
      expect(synth.playDigitalGlitch()).toBe(true);
      expect(synth.playGrayGooDissolveHiss()).toBe(true);
      expect(synth.playPointDefensePing()).toBe(true);
      expect(synth.playNovaMissileSwoosh()).toBe(true);
      expect(synth.playSpiralRingWhoosh()).toBe(true);

      // Each distinct key was accepted in the same frame
      expect(synth.getActiveVoiceCount()).toBe(5);
    });
  });
});
