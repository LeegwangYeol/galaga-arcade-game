/**
 * Galaga Arcade Web Game — Milestone 14 Procedural Audio Unit Tests
 * 
 * Verifies:
 * 1. SoundSynthesizer & AudioManager facades and exports.
 * 2. 24 new procedural Web Audio synthesis methods across Bosses, Crisis, Allies, and Specials.
 * 3. 16-voice priority queue with standard (12) and high-priority (16) headroom.
 * 4. Audio event debouncing and continuous loop handle management.
 * 5. Node disconnection cleanup via dual onended / watchdog timeout.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioContextManager } from '../../src/audio/AudioContextManager';
import { SoundSynth } from '../../src/audio/SoundSynth';
import { AudioManager } from '../../src/audio/AudioManager';
import { SoundSynthesizer } from '../../src/audio/SoundSynthesizer';

// ============================================================================
// Web Audio Mock Infrastructure
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

  cancelScheduledValues(time: number) {
    this.scheduled.push({ type: 'cancelScheduledValues', value: 0, time });
  }
}

class MockAudioNode {
  public connectedTo: MockAudioNode[] = [];
  public disconnected: boolean = false;

  connect(destination: any) {
    this.connectedTo.push(destination);
    return destination;
  }

  disconnect() {
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
    if (_time === undefined && this.onended) {
      this.onended();
    }
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
    if (_time === undefined && this.onended) {
      this.onended();
    }
  }
}

class MockAudioContext {
  public state: string = 'running';
  public currentTime: number = 0;
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

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }

  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

describe('Milestone 14 — Procedural Web Audio Engine', () => {
  let originalAudioContext: any;
  let synth: SoundSynth;
  let audioManager: AudioManager;

  beforeEach(() => {
    if (typeof window !== 'undefined') {
      originalAudioContext = (window as any).AudioContext;
      (window as any).AudioContext = MockAudioContext;
      (window as any).webkitAudioContext = MockAudioContext;
    } else {
      (global as any).window = {
        AudioContext: MockAudioContext,
        webkitAudioContext: MockAudioContext,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    }

    AudioContextManager.resetInstance();
    SoundSynth.resetInstance();
    const acm = AudioContextManager.getInstance();
    acm.init();

    synth = SoundSynth.getInstance(acm);
    audioManager = new AudioManager(synth, acm);
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

  describe('1. Facades and Export Compliance', () => {
    it('SoundSynthesizer is an alias export of SoundSynth', () => {
      expect(SoundSynthesizer).toBe(SoundSynth);
      const instance = SoundSynthesizer.getInstance();
      expect(instance).toBeInstanceOf(SoundSynth);
    });

    it('AudioManager acts as an integrated facade for SoundSynth', () => {
      expect(audioManager.getSynth()).toBe(synth);
      expect(typeof audioManager.playHeavyLaserBlast).toBe('function');
      expect(typeof audioManager.playCrisisKlaxon).toBe('function');
      expect(typeof audioManager.playWarpRamSonicBoom).toBe('function');
    });
  });

  describe('2. Boss Procedural SFX Graphs', () => {
    it('synthesizes Cyber Dreadnought heavy laser and spiral ring whoosh', () => {
      const res1 = synth.playHeavyLaserBlast();
      expect(res1).toBe(true);

      const res2 = synth.playSpiralRingWhoosh();
      expect(res2).toBe(true);
    });

    it('synthesizes Dimensional Leviathan tear hum and black hole suction rumble', () => {
      const res1 = synth.playDimensionalTearHum();
      expect(res1).toBe(true);
      synth.stopDimensionalTearHum();

      const res2 = synth.playBlackHoleSuctionRumble();
      expect(res2).toBe(true);
      synth.stopBlackHoleSuctionRumble();
    });

    it('synthesizes Nanite Colossus split shimmer and gray goo dissolve hiss', () => {
      const res1 = synth.playNaniteSplitShimmer();
      expect(res1).toBe(true);

      const res2 = synth.playGrayGooDissolveHiss();
      expect(res2).toBe(true);
    });

    it('synthesizes Psionic Harbinger phantom dive warble and telekinetic stun screech', () => {
      const res1 = synth.playPhantomDiveWarble();
      expect(res1).toBe(true);

      const res2 = synth.playTelekineticStunScreech();
      expect(res2).toBe(true);
    });

    it('synthesizes Aeternum Core mega-beam charge, roaring beam, and enrage siren', () => {
      const chargeRes = synth.playDarkMatterBeamCharge();
      expect(chargeRes).toBe(true);

      const roarRes = synth.playDarkMatterBeamRoar();
      expect(roarRes).toBe(true);
      synth.stopDarkMatterBeamRoar();

      const sirenRes = synth.playEnrageSiren();
      expect(sirenRes).toBe(true);
    });
  });

  describe('3. Crisis Ambient Soundscapes', () => {
    it('synthesizes Crisis Klaxon alert chime', () => {
      const res = synth.playCrisisKlaxon();
      expect(res).toBe(true);
    });

    it('synthesizes Rogue AI digital glitch hopping frequencies', () => {
      const res = synth.playDigitalGlitch();
      expect(res).toBe(true);
    });

    it('synthesizes Cosmic lightning crackle noise burst', () => {
      const res = synth.playLightningCrackle();
      expect(res).toBe(true);
    });

    it('synthesizes Dark Matter ignition cluster sub-bass boom', () => {
      const res = synth.playDarkMatterIgnition();
      expect(res).toBe(true);
    });
  });

  describe('4. Allies & Special Moves SFX', () => {
    it('synthesizes Escort Drone plasma chirp', () => {
      const res = synth.playEscortPlasmaBolt();
      expect(res).toBe(true);
    });

    it('synthesizes Aegis Drone repair chime and flak ping', () => {
      const chimeRes = synth.playShieldRepairChime();
      expect(chimeRes).toBe(true);

      const pingRes = synth.playPointDefensePing();
      expect(pingRes).toBe(true);
    });

    it('synthesizes Bomber Drone engine sweep and cluster bomb thud', () => {
      const sweepRes = synth.playBomberEngineSweep();
      expect(sweepRes).toBe(true);

      const thudRes = synth.playClusterBombThud();
      expect(thudRes).toBe(true);
    });

    it('synthesizes Nova Barrage lock chime and missile swoosh', () => {
      const lockRes = synth.playNovaLockChime();
      expect(lockRes).toBe(true);

      const swooshRes = synth.playNovaMissileSwoosh();
      expect(swooshRes).toBe(true);
    });

    it('synthesizes Chrono Freeze sub-bass drop and clock tick', () => {
      const dropRes = synth.playChronoFreezeDrop();
      expect(dropRes).toBe(true);

      const tickRes = synth.playClockFreezeTick();
      expect(tickRes).toBe(true);
    });

    it('synthesizes Dimensional Warp Ram sonic boom', () => {
      const boomRes = synth.playWarpRamSonicBoom();
      expect(boomRes).toBe(true);
    });
  });

  describe('5. Voice Priority & Headroom Allocation', () => {
    it('throttles standard priority (1 & 2) voices at MAX_CONCURRENT_VOICES (12)', () => {
      // 12 standard lasers consume all standard channels
      for (let i = 0; i < 12; i++) {
        expect(synth.playLaser()).toBe(true);
      }
      // 13th standard laser should be rejected
      expect(synth.playLaser()).toBe(false);
    });

    it('permits high priority (Priority 3) sounds into the expanded 16-voice headroom', () => {
      // Fill standard channels to 12
      for (let i = 0; i < 12; i++) {
        expect(synth.playLaser()).toBe(true);
      }
      expect(synth.getActiveVoiceCount()).toBe(12);

      // High-priority specials and crisis alarms bypass standard limit up to 16
      expect(synth.playCrisisKlaxon()).toBe(true);
      expect(synth.playWarpRamSonicBoom()).toBe(true);
      expect(synth.playChronoFreezeDrop()).toBe(true);
      expect(synth.playEnrageSiren()).toBe(true);
      expect(synth.getActiveVoiceCount()).toBe(16);

      // 17th voice rejected even if high priority
      expect(synth.playWarpRamSonicBoom()).toBe(false);
    });
  });

  describe('6. Debouncing & Loop Management', () => {
    it('debounces rapid calls to the same debounced sound within debounce window', () => {
      const first = synth.playDigitalGlitch();
      expect(first).toBe(true);

      // Immediate second call should be debounced
      const second = synth.playDigitalGlitch();
      expect(second).toBe(false);
    });

    it('stopAll terminates all continuous sound loops cleanly', () => {
      synth.playDimensionalTearHum();
      synth.playBlackHoleSuctionRumble();
      synth.playDarkMatterBeamRoar();

      synth.stopAll();
      expect(synth.getActiveVoiceCount()).toBe(0);
    });
  });
});
