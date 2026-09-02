/**
 * Galaga Arcade Web Game — Procedural Sound Synthesizer
 * 
 * 100% procedural sound effect synthesis using Web Audio API nodes.
 * Features zero-allocation shared noise buffer caching, voice concurrency management,
 * and authentic 1981 Galaga acoustic signatures.
 */

import { AudioContextManager } from './AudioContextManager';
import type { AudioEventType, SoundOptions } from '../types';

export type ExplosionType = 'small' | 'large' | 'boss';
export type AlienType = 'zako' | 'goei' | 'boss';

interface ActiveTractorBeamHandle {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  lfo: OscillatorNode;
  masterGain: GainNode;
  tremoloGain: GainNode;
  filter: BiquadFilterNode;
  stop: () => void;
}

export class SoundSynth {
  private static instance: SoundSynth | null = null;
  private audioManager: AudioContextManager;

  // Shared pre-rendered white noise buffer for zero GC allocation during combat
  private whiteNoiseBuffer: AudioBuffer | null = null;
  public static readonly NOISE_BUFFER_DURATION_SEC = 2.0;

  // Active tractor beam audio loop state
  private activeTractorBeam: ActiveTractorBeamHandle | null = null;

  // Active voice concurrency tracking to prevent clipping in intense waves
  private activeVoiceCount: number = 0;
  public static readonly MAX_CONCURRENT_VOICES = 12;

  private constructor(audioManager?: AudioContextManager) {
    this.audioManager = audioManager ?? AudioContextManager.getInstance();
  }

  public static getInstance(audioManager?: AudioContextManager): SoundSynth {
    if (!SoundSynth.instance) {
      SoundSynth.instance = new SoundSynth(audioManager);
    }
    return SoundSynth.instance;
  }

  public static resetInstance(): void {
    if (SoundSynth.instance) {
      SoundSynth.instance.stopAll();
      SoundSynth.instance = null;
    }
  }

  // ==========================================================================
  // Noise Buffer Initialization & Caching
  // ==========================================================================

  /**
   * Generates or retrieves the cached 2-second white noise AudioBuffer.
   */
  public getWhiteNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.whiteNoiseBuffer && this.whiteNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.whiteNoiseBuffer;
    }

    const sampleRate = ctx.sampleRate || 44100;
    const bufferSize = Math.floor(sampleRate * SoundSynth.NOISE_BUFFER_DURATION_SEC);
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      // Uniform random samples in [-1.0, 1.0]
      data[i] = Math.random() * 2 - 1;
    }

    this.whiteNoiseBuffer = buffer;
    return buffer;
  }

  // ==========================================================================
  // 1. Player Laser Fire Chirp
  // ==========================================================================

  /**
   * Synthesizes the authentic Galaga player laser chirp:
   * Exponential frequency sweep from 880Hz down to 120Hz over 0.12s.
   */
  public playLaser(options?: SoundOptions): boolean {
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    if (this.activeVoiceCount >= SoundSynth.MAX_CONCURRENT_VOICES) {
      return false;
    }

    const now = ctx.currentTime;
    const duration = 0.12;
    const volumeMultiplier = options?.volume ?? 1.0;
    const pitchMultiplier = options?.pitch ?? 1.0;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';

    const startFreq = 880 * pitchMultiplier;
    const endFreq = 120 * pitchMultiplier;

    try {
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), now + duration);

      const baseGain = 0.32 * volumeMultiplier;
      gain.gain.setValueAtTime(baseGain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    } catch {
      // Safe fallback
    }

    osc.connect(gain);
    gain.connect(sfxBus);

    this.activeVoiceCount++;

    try {
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }

    osc.onended = () => {
      this.activeVoiceCount = Math.max(0, this.activeVoiceCount - 1);
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Handled silently
      }
    };

    return true;
  }

  /**
   * Synthesizes a dual-fighter simultaneous laser shot with detuned stereo width.
   */
  public playLaserDual(options?: SoundOptions): boolean {
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const vol = (options?.volume ?? 1.0) * 0.85;

    // Fire two slightly detuned chirps
    this.playLaser({ volume: vol, pitch: (options?.pitch ?? 1.0) * 0.98 });
    this.playLaser({ volume: vol, pitch: (options?.pitch ?? 1.0) * 1.04 });

    return true;
  }

  // ==========================================================================
  // 2. Alien Dive Squeal (LFO Modulated FM Pitch Dive)
  // ==========================================================================

  /**
   * Synthesizes the LFO frequency-modulated pitch dive (520Hz -> 180Hz with 14Hz vibrato).
   */
  public playAlienDive(type: AlienType = 'zako', options?: SoundOptions): boolean {
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    if (this.activeVoiceCount >= SoundSynth.MAX_CONCURRENT_VOICES) {
      return false;
    }

    const now = ctx.currentTime;
    const volumeMultiplier = options?.volume ?? 1.0;
    const pitchMultiplier = options?.pitch ?? 1.0;

    let startFreq = 520;
    let endFreq = 160;
    let lfoFreq = 14.0;
    let fmDepth = 120;
    let duration = 0.65;

    if (type === 'goei') {
      startFreq = 600;
      endFreq = 200;
      lfoFreq = 16.5;
      fmDepth = 145;
      duration = 0.60;
    } else if (type === 'boss') {
      startFreq = 440;
      endFreq = 140;
      lfoFreq = 12.0;
      fmDepth = 170;
      duration = 0.75;
    }

    startFreq *= pitchMultiplier;
    endFreq *= pitchMultiplier;

    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const mainGain = ctx.createGain();

    carrier.type = 'sawtooth';
    try {
      carrier.frequency.setValueAtTime(startFreq, now);
      carrier.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

      mod.type = 'sine';
      mod.frequency.setValueAtTime(lfoFreq, now);

      modGain.gain.setValueAtTime(fmDepth, now);
      modGain.gain.exponentialRampToValueAtTime(fmDepth * 0.4, now + duration);

      mod.connect(carrier.frequency);

      const peakGain = 0.28 * volumeMultiplier;
      mainGain.gain.setValueAtTime(0.001, now);
      mainGain.gain.linearRampToValueAtTime(peakGain, now + 0.04);
      mainGain.gain.setValueAtTime(peakGain, now + duration * 0.5);
      mainGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    } catch {
      // Safe fallback
    }

    carrier.connect(mainGain);
    mainGain.connect(sfxBus);

    this.activeVoiceCount++;

    try {
      mod.start(now);
      carrier.start(now);
      mod.stop(now + duration + 0.02);
      carrier.stop(now + duration + 0.02);
    } catch {
      // Safe fallback
    }

    carrier.onended = () => {
      this.activeVoiceCount = Math.max(0, this.activeVoiceCount - 1);
      try {
        mod.disconnect();
        modGain.disconnect();
        carrier.disconnect();
        mainGain.disconnect();
      } catch {
        // Handled silently
      }
    };

    return true;
  }

  // ==========================================================================
  // 3. Boss Galaga Tractor Beam (Continuous Pulsing Oscillation)
  // ==========================================================================

  /**
   * Plays or stops the continuous tractor beam oscillation (64Hz/70Hz detuned saw/square with 7Hz AM pulse).
   */
  public playTractorBeam(active: boolean, options?: SoundOptions): boolean {
    if (!active) {
      this.stopTractorBeam();
      return true;
    }

    if (this.activeTractorBeam) {
      return true; // Already running
    }

    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const volumeMultiplier = options?.volume ?? 1.0;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const tremoloGain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const masterGain = ctx.createGain();

    // Dual detuned oscillators for sinister beating
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(64, now);

    osc2.type = 'square';
    osc2.frequency.setValueAtTime(70, now);

    // Resonant lowpass filter to produce the characteristic arcade hum
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(340, now);
    filter.Q.setValueAtTime(4.5, now);

    // 7Hz AM tremolo pulse
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(7.0, now);

    tremoloGain.gain.setValueAtTime(0.55, now);

    const peakGain = 0.35 * volumeMultiplier;
    try {
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(peakGain, now + 0.08);
    } catch {
      masterGain.gain.value = peakGain;
    }

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(tremoloGain);
    tremoloGain.connect(masterGain);
    masterGain.connect(sfxBus);

    try {
      osc1.start(now);
      osc2.start(now);
      lfo.start(now);
    } catch {
      // Safe fallback
    }

    const stopFn = () => {
      const stopNow = ctx.currentTime;
      try {
        masterGain.gain.cancelScheduledValues(stopNow);
        masterGain.gain.setValueAtTime(masterGain.gain.value, stopNow);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, stopNow + 0.08);
      } catch {
        masterGain.gain.value = 0;
      }

      setTimeout(() => {
        try {
          osc1.stop();
          osc2.stop();
          lfo.stop();
          osc1.disconnect();
          osc2.disconnect();
          lfo.disconnect();
          filter.disconnect();
          tremoloGain.disconnect();
          masterGain.disconnect();
        } catch {
          // Handled silently
        }
      }, 100);
    };

    this.activeTractorBeam = {
      osc1,
      osc2,
      lfo,
      masterGain,
      tremoloGain,
      filter,
      stop: stopFn,
    };

    return true;
  }

  /**
   * Stops the active tractor beam sound loop with smooth anti-pop fadeout.
   */
  public stopTractorBeam(): void {
    if (this.activeTractorBeam) {
      this.activeTractorBeam.stop();
      this.activeTractorBeam = null;
    }
  }

  // ==========================================================================
  // 4. Procedural Explosion Sounds (White Noise + Filter Decay)
  // ==========================================================================

  /**
   * Synthesizes explosion sounds: procedural white noise with exponential low-pass filter decay.
   */
  public playExplosion(type: ExplosionType = 'small', options?: SoundOptions): boolean {
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    if (this.activeVoiceCount >= SoundSynth.MAX_CONCURRENT_VOICES) {
      return false;
    }

    const now = ctx.currentTime;
    const volumeMultiplier = options?.volume ?? 1.0;
    const isBoss = type === 'boss';
    const isLarge = type === 'large';

    const duration = isLarge ? 0.75 : isBoss ? 0.60 : 0.32;

    // 1. Noise Buffer Source
    const noiseBuffer = this.getWhiteNoiseBuffer(ctx);
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    // 2. Resonant Lowpass Filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    const startCutoff = isBoss ? 2200 : isLarge ? 1100 : 1500;
    const endCutoff = isBoss ? 40 : isLarge ? 30 : 50;
    const qFactor = isBoss ? 5.5 : isLarge ? 4.2 : 3.0;

    try {
      filter.frequency.setValueAtTime(startCutoff, now);
      filter.frequency.exponentialRampToValueAtTime(endCutoff, now + duration * 0.95);
      filter.Q.setValueAtTime(qFactor, now);
    } catch {
      // Safe fallback
    }

    // 3. Noise Gain Envelope
    const gain = ctx.createGain();
    const peakGain = (isBoss ? 0.55 : isLarge ? 0.50 : 0.42) * volumeMultiplier;

    try {
      gain.gain.setValueAtTime(peakGain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    } catch {
      // Safe fallback
    }

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);

    this.activeVoiceCount++;

    try {
      noiseSource.start(now);
      noiseSource.stop(now + duration + 0.02);
    } catch {
      // Safe fallback
    }

    noiseSource.onended = () => {
      this.activeVoiceCount = Math.max(0, this.activeVoiceCount - 1);
      try {
        noiseSource.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {
        // Handled silently
      }
    };

    // 4. Sub-Bass Layer for Large/Boss explosions (visceral physical impact)
    if (isLarge || isBoss) {
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();

      subOsc.type = isBoss ? 'triangle' : 'sine';
      const subStartFreq = isBoss ? 140 : 180;
      const subEndFreq = isBoss ? 32 : 28;

      try {
        subOsc.frequency.setValueAtTime(subStartFreq, now);
        subOsc.frequency.exponentialRampToValueAtTime(subEndFreq, now + duration * 0.7);

        const subPeak = (isBoss ? 0.40 : 0.45) * volumeMultiplier;
        subGain.gain.setValueAtTime(subPeak, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.8);
      } catch {
        // Safe fallback
      }

      subOsc.connect(subGain);
      subGain.connect(sfxBus);

      try {
        subOsc.start(now);
        subOsc.stop(now + duration * 0.82);
      } catch {
        // Safe fallback
      }

      subOsc.onended = () => {
        try {
          subOsc.disconnect();
          subGain.disconnect();
        } catch {
          // Handled silently
        }
      };
    }

    return true;
  }

  // ==========================================================================
  // 5. Boss Hit / Armor Deflection Ping
  // ==========================================================================

  /**
   * Synthesizes metallic click/ping when Boss Galaga is struck once without being destroyed.
   */
  public playBossHit(options?: SoundOptions): boolean {
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.06;
    const volumeMultiplier = options?.volume ?? 1.0;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    try {
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + duration);

      gain.gain.setValueAtTime(0.25 * volumeMultiplier, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    } catch {
      // Safe fallback
    }

    osc.connect(gain);
    gain.connect(sfxBus);

    try {
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }

    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Handled silently
      }
    };

    return true;
  }

  // ==========================================================================
  // 6. Generic Event Dispatcher (Contract with types/index.ts)
  // ==========================================================================

  /**
   * Dispatches sound synthesis according to AudioEventType.
   */
  public playEvent(eventType: AudioEventType, options?: SoundOptions): boolean {
    switch (eventType) {
      case 'LASER_FIRE':
        return this.playLaser(options);
      case 'ENEMY_DIVE':
        return this.playAlienDive('zako', options);
      case 'ENEMY_EXPLOSION_SMALL':
        return this.playExplosion('small', options);
      case 'ENEMY_EXPLOSION_LARGE':
      case 'PLAYER_EXPLOSION':
        return this.playExplosion('large', options);
      case 'BOSS_HIT':
        return this.playBossHit(options);
      case 'BOSS_DESTROYED':
        return this.playExplosion('boss', options);
      case 'TRACTOR_BEAM':
        return this.playTractorBeam(options?.loop ?? true, options);
      default:
        return false;
    }
  }

  // ==========================================================================
  // Teardown & Reset
  // ==========================================================================

  public stopAll(): void {
    this.stopTractorBeam();
    this.activeVoiceCount = 0;
  }
}
