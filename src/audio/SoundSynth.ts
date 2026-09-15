/**
 * Galaga Arcade Web Game — Procedural Sound Synthesizer
 * 
 * 100% procedural sound effect synthesis using Web Audio API nodes.
 * Features zero-allocation shared noise buffer caching, voice concurrency management,
 * and authentic 1981 Galaga acoustic signatures.
 */

import { AudioContextManager } from './AudioContextManager';
import type { AudioEventType, SoundOptions } from '../types';
import { SOUND_PRIORITY, type SoundPriority, type SoundPlaybackOptions } from './types';

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
  public static readonly MAX_HIGH_PRIORITY_VOICES = 16;

  // Active loop states
  private activeLoops: Map<string, { stop: () => void }> = new Map();

  // Rate limiting / debouncing map
  private lastPlayedMap: Map<string, number> = new Map();

  // Teardown generation token to prevent stale deferred decrements on stopAll
  private teardownGeneration: number = 0;
  private readonly activeCleanups: Set<() => void> = new Set();

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

  public getActiveVoiceCount(): number {
    return this.activeVoiceCount;
  }

  public isDebounced(key: string, cooldownSec: number = 0.04): boolean {
    const ctx = this.audioManager.getContext();
    const now = ctx ? ctx.currentTime : Date.now() / 1000;
    const last = this.lastPlayedMap.get(key) ?? -1;
    if (now - last < cooldownSec) {
      return true;
    }
    this.lastPlayedMap.set(key, now);
    return false;
  }

  public canPlayVoice(priority: SoundPriority = SOUND_PRIORITY.NORMAL): boolean {
    if (priority === SOUND_PRIORITY.HIGH) {
      return this.activeVoiceCount < SoundSynth.MAX_HIGH_PRIORITY_VOICES;
    }
    if (priority === SOUND_PRIORITY.LOW) {
      return this.activeVoiceCount < 10;
    }
    return this.activeVoiceCount < SoundSynth.MAX_CONCURRENT_VOICES;
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
  public playLaser(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;

    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

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

    try {
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }

    this.registerNodeCleanup([osc, gain], osc, duration);

    return true;
  }

  /**
   * Synthesizes a dual-fighter simultaneous laser shot with detuned stereo width.
   */
  public playLaserDual(options?: SoundPlaybackOptions): boolean {
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    if (this.activeVoiceCount > SoundSynth.MAX_CONCURRENT_VOICES - 2) {
      return false;
    }

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
  public playAlienDive(type: AlienType = 'zako', options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;

    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

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

    try {
      mod.start(now);
      carrier.start(now);
      mod.stop(now + duration + 0.02);
      carrier.stop(now + duration + 0.02);
    } catch {
      // Safe fallback
    }

    this.registerNodeCleanup([mod, modGain, carrier, mainGain], carrier, duration);

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
  public playExplosion(type: ExplosionType = 'small', options?: SoundPlaybackOptions): boolean {
    const isBoss = type === 'boss';
    const isLarge = type === 'large';
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;

    if (!this.canPlayVoice(priority)) {
      return false;
    }

    if (type === 'small' && options?.debounce && this.isDebounced('explosion_small', 0.025)) {
      return false;
    }

    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const volumeMultiplier = options?.volume ?? 1.0;

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

    try {
      noiseSource.start(now);
      noiseSource.stop(now + duration + 0.02);
    } catch {
      // Safe fallback
    }

    const nodes: Array<{ disconnect: () => void }> = [noiseSource, filter, gain];

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

      nodes.push(subOsc, subGain);
    }

    this.registerNodeCleanup(nodes, noiseSource, duration);

    return true;
  }

  // ==========================================================================
  // 5. Boss Hit / Armor Deflection Ping
  // ==========================================================================

  /**
   * Synthesizes metallic click/ping when Boss Galaga is struck once without being destroyed.
   */
  public playBossHit(options?: SoundPlaybackOptions): boolean {
    if (this.isDebounced('bossHit', 0.03)) {
      return false;
    }

    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) {
      return false;
    }

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

    this.registerNodeCleanup([osc, gain], osc, duration);

    return true;
  }

  // ==========================================================================
  // Node Cleanup & Watchdog Helper
  // ==========================================================================

  private registerNodeCleanup(
    nodes: Array<{ disconnect: () => void }>,
    primarySource: { onended: ((this: any, ev?: any) => any) | null },
    durationSec: number
  ): void {
    this.activeVoiceCount++;
    const currentGeneration = this.teardownGeneration;
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      this.activeCleanups.delete(cleanup);
      if (this.teardownGeneration === currentGeneration) {
        this.activeVoiceCount = Math.max(0, this.activeVoiceCount - 1);
      }
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          // Handled silently in mock/headless contexts
        }
      }
    };
    this.activeCleanups.add(cleanup);
    primarySource.onended = cleanup;
    setTimeout(cleanup, Math.ceil((durationSec + 0.05) * 1000));
  }

  // ==========================================================================
  // 6. Milestone 12: Epic Boss Procedural Sound Synthesis
  // ==========================================================================

  /**
   * Stage 10 Cyber Dreadnought — Heavy Laser Cannon Blast
   */
  public playHeavyLaserBlast(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.35;
    const vol = (options?.volume ?? 1.0) * 0.38;
    const pitch = options?.pitch ?? 1.0;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'square';
    filter.type = 'lowpass';

    try {
      osc1.frequency.setValueAtTime(540 * pitch, now);
      osc1.frequency.exponentialRampToValueAtTime(Math.max(10, 75 * pitch), now + duration);

      osc2.frequency.setValueAtTime(270 * pitch, now);
      osc2.frequency.exponentialRampToValueAtTime(Math.max(10, 45 * pitch), now + duration);

      filter.frequency.setValueAtTime(3200, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + duration);
      filter.Q.setValueAtTime(5.5, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.003);
      gain.gain.setValueAtTime(vol * 0.4, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);

    // Muzzle snap transient
    const noiseBuffer = this.getWhiteNoiseBuffer(ctx);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    const noiseGain = ctx.createGain();

    try {
      noiseFilter.frequency.setValueAtTime(2400, now);
      noiseGain.gain.setValueAtTime(0.30 * (options?.volume ?? 1.0), now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    } catch {
      // Safe fallback
    }

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(sfxBus);

    this.registerNodeCleanup([osc1, osc2, filter, gain, noise, noiseFilter, noiseGain], osc1, duration);

    try {
      osc1.start(now);
      osc1.stop(now + duration + 0.01);
      osc2.start(now);
      osc2.stop(now + duration + 0.01);
      noise.start(now);
      noise.stop(now + 0.07);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Stage 10 Cyber Dreadnought — Rotating Spiral Bullet Ring Whoosh
   */
  public playSpiralRingWhoosh(options?: SoundPlaybackOptions): boolean {
    if (this.isDebounced('spiralRing', 0.08)) return false;
    const priority = options?.priority ?? SOUND_PRIORITY.LOW;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.28;
    const vol = (options?.volume ?? 1.0) * 0.24;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getWhiteNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(4.2, now);

    const tremoloGain = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.setValueAtTime(7.5, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0.45, now);

    const masterGain = ctx.createGain();

    try {
      filter.frequency.setValueAtTime(380, now);
      filter.frequency.linearRampToValueAtTime(1050, now + 0.12);
      filter.frequency.linearRampToValueAtTime(420, now + duration);

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.03);
      masterGain.gain.setValueAtTime(vol * 0.75, now + 0.16);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      tremoloGain.gain.setValueAtTime(0.65, now);
    } catch {
      // Safe fallback
    }

    lfo.connect(lfoGain);
    lfoGain.connect(tremoloGain.gain);

    noise.connect(filter);
    filter.connect(tremoloGain);
    tremoloGain.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([noise, filter, tremoloGain, lfo, lfoGain, masterGain], noise, duration);

    try {
      noise.start(now);
      noise.stop(now + duration + 0.01);
      lfo.start(now);
      lfo.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Stage 20 Dimensional Leviathan — Gravitational Dimensional Tear Hum
   */
  public playDimensionalTearHum(loop: boolean = false, options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    this.stopDimensionalTearHum();

    const now = ctx.currentTime;
    const duration = 0.75;
    const vol = (options?.volume ?? 1.0) * 0.30;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'triangle';

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(3.5, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(6.0, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(175, now);
    filter.Q.setValueAtTime(4.0, now);

    const masterGain = ctx.createGain();

    try {
      osc1.frequency.setValueAtTime(58.5, now);
      osc2.frequency.setValueAtTime(63.2, now);

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.12);
      if (!loop) {
        masterGain.gain.setValueAtTime(vol * 0.8, now + 0.47);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      }
    } catch {
      // Safe fallback
    }

    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(sfxBus);

    if (loop) {
      this.activeVoiceCount++;
      const stop = () => {
        try {
          osc1.stop();
          osc2.stop();
          lfo.stop();
          osc1.disconnect();
          osc2.disconnect();
          lfo.disconnect();
          lfoGain.disconnect();
          filter.disconnect();
          masterGain.disconnect();
        } catch {
          // Handled silently
        }
        this.activeVoiceCount = Math.max(0, this.activeVoiceCount - 1);
        this.activeLoops.delete('tearHum');
      };
      this.activeLoops.set('tearHum', { stop });
      try {
        osc1.start(now);
        osc2.start(now);
        lfo.start(now);
      } catch {
        // Safe fallback
      }
    } else {
      this.registerNodeCleanup([osc1, osc2, lfo, lfoGain, filter, masterGain], osc1, duration);
      try {
        osc1.start(now);
        osc1.stop(now + duration + 0.01);
        osc2.start(now);
        osc2.stop(now + duration + 0.01);
        lfo.start(now);
        lfo.stop(now + duration + 0.01);
      } catch {
        // Safe fallback
      }
    }
    return true;
  }

  public stopDimensionalTearHum(): void {
    const handle = this.activeLoops.get('tearHum');
    if (handle) {
      handle.stop();
    }
  }

  /**
   * Stage 20 Dimensional Leviathan — Black-Hole Vortex Suction Rumble
   */
  public playBlackHoleSuctionRumble(loop: boolean = false, options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    this.stopBlackHoleSuctionRumble();

    const now = ctx.currentTime;
    const duration = 0.85;
    const vol = (options?.volume ?? 1.0) * 0.38;

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';

    const noise = ctx.createBufferSource();
    noise.buffer = this.getWhiteNoiseBuffer(ctx);
    noise.loop = loop;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.Q.setValueAtTime(6.0, now);

    const tremoloGain = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(11, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0.35, now);

    const masterGain = ctx.createGain();

    try {
      subOsc.frequency.setValueAtTime(90, now);
      subOsc.frequency.exponentialRampToValueAtTime(24, now + duration);

      noiseFilter.frequency.setValueAtTime(480, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(40, now + duration);

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.08);
      if (!loop) {
        masterGain.gain.setValueAtTime(vol * 0.84, now + 0.45);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      }
      tremoloGain.gain.setValueAtTime(0.65, now);
    } catch {
      // Safe fallback
    }

    lfo.connect(lfoGain);
    lfoGain.connect(tremoloGain.gain);

    subOsc.connect(tremoloGain);
    noise.connect(noiseFilter);
    noiseFilter.connect(tremoloGain);
    tremoloGain.connect(masterGain);
    masterGain.connect(sfxBus);

    if (loop) {
      this.activeVoiceCount++;
      const stop = () => {
        try {
          subOsc.stop();
          noise.stop();
          lfo.stop();
          subOsc.disconnect();
          noise.disconnect();
          lfo.disconnect();
          lfoGain.disconnect();
          noiseFilter.disconnect();
          tremoloGain.disconnect();
          masterGain.disconnect();
        } catch {
          // Handled silently
        }
        this.activeVoiceCount = Math.max(0, this.activeVoiceCount - 1);
        this.activeLoops.delete('blackHole');
      };
      this.activeLoops.set('blackHole', { stop });
      try {
        subOsc.start(now);
        noise.start(now);
        lfo.start(now);
      } catch {
        // Safe fallback
      }
    } else {
      this.registerNodeCleanup([subOsc, noise, noiseFilter, lfo, lfoGain, tremoloGain, masterGain], subOsc, duration);
      try {
        subOsc.start(now);
        subOsc.stop(now + duration + 0.01);
        noise.start(now);
        noise.stop(now + duration + 0.01);
        lfo.start(now);
        lfo.stop(now + duration + 0.01);
      } catch {
        // Safe fallback
      }
    }
    return true;
  }

  public stopBlackHoleSuctionRumble(): void {
    const handle = this.activeLoops.get('blackHole');
    if (handle) {
      handle.stop();
    }
  }

  /**
   * Stage 30 Nanite Colossus — Mini-Construct Split Shimmer
   */
  public playNaniteSplitShimmer(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.28;
    const vol = (options?.volume ?? 1.0) * 0.30;

    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const modGain = ctx.createGain();

    const overtone = ctx.createOscillator();
    carrier.type = 'sine';
    modulator.type = 'sine';
    overtone.type = 'sine';

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2000, now);

    const masterGain = ctx.createGain();

    try {
      carrier.frequency.setValueAtTime(1760, now);
      modulator.frequency.setValueAtTime(880, now);
      modGain.gain.setValueAtTime(450, now);
      modGain.gain.exponentialRampToValueAtTime(20, now + 0.20);

      overtone.frequency.setValueAtTime(2640, now);

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.003);
      masterGain.gain.setValueAtTime(vol * 0.4, now + 0.10);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    carrier.connect(filter);
    overtone.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([carrier, modulator, modGain, overtone, filter, masterGain], carrier, duration);

    try {
      carrier.start(now);
      carrier.stop(now + duration + 0.01);
      modulator.start(now);
      modulator.stop(now + duration + 0.01);
      overtone.start(now);
      overtone.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Stage 30 Nanite Colossus — Gray Goo Dissolve Hiss
   */
  public playGrayGooDissolveHiss(options?: SoundPlaybackOptions): boolean {
    if (this.isDebounced('grayGoo', 0.04)) return false;
    const priority = options?.priority ?? SOUND_PRIORITY.LOW;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.14;
    const vol = (options?.volume ?? 1.0) * 0.26;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getWhiteNoiseBuffer(ctx);

    const hpFilter = ctx.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.setValueAtTime(3500, now);

    const bpFilter = ctx.createBiquadFilter();
    bpFilter.type = 'bandpass';
    bpFilter.Q.setValueAtTime(7.0, now);

    const flutterGain = ctx.createGain();
    const flutterLfo = ctx.createOscillator();
    flutterLfo.type = 'sine';
    flutterLfo.frequency.setValueAtTime(32, now);
    const flutterLfoGain = ctx.createGain();
    flutterLfoGain.gain.setValueAtTime(0.5, now);

    const masterGain = ctx.createGain();

    try {
      bpFilter.frequency.setValueAtTime(2800, now);
      bpFilter.frequency.linearRampToValueAtTime(6800, now + duration);

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.002);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      flutterGain.gain.setValueAtTime(0.5, now);
    } catch {
      // Safe fallback
    }

    flutterLfo.connect(flutterLfoGain);
    flutterLfoGain.connect(flutterGain.gain);

    noise.connect(hpFilter);
    hpFilter.connect(bpFilter);
    bpFilter.connect(flutterGain);
    flutterGain.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([noise, hpFilter, bpFilter, flutterLfo, flutterLfoGain, flutterGain, masterGain], noise, duration);

    try {
      noise.start(now);
      noise.stop(now + duration + 0.01);
      flutterLfo.start(now);
      flutterLfo.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Stage 40 Psionic Harbinger — Phantom Clone Dive Warble
   */
  public playPhantomDiveWarble(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.60;
    const vol = (options?.volume ?? 1.0) * 0.28;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'sine';

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(22, now);
    const lfoGain = ctx.createGain();

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500, now);
    filter.Q.setValueAtTime(3.5, now);

    const masterGain = ctx.createGain();

    try {
      osc1.frequency.setValueAtTime(720, now);
      osc1.frequency.exponentialRampToValueAtTime(210, now + duration);

      osc2.frequency.setValueAtTime(728, now);
      osc2.frequency.exponentialRampToValueAtTime(218, now + duration);

      lfoGain.gain.setValueAtTime(95, now);
      lfoGain.gain.exponentialRampToValueAtTime(30, now + duration);

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.04);
      masterGain.gain.setValueAtTime(vol * 0.78, now + 0.35);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([osc1, osc2, lfo, lfoGain, filter, masterGain], osc1, duration);

    try {
      osc1.start(now);
      osc1.stop(now + duration + 0.01);
      osc2.start(now);
      osc2.stop(now + duration + 0.01);
      lfo.start(now);
      lfo.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Stage 40 Psionic Harbinger — Telekinetic Stun Distortion Screech
   */
  public playTelekineticStunScreech(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.36;
    const vol = (options?.volume ?? 1.0) * 0.32;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'square';
    osc2.type = 'sawtooth';

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(45, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(380, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1650, now);
    filter.Q.setValueAtTime(8.0, now);

    const masterGain = ctx.createGain();

    try {
      osc1.frequency.setValueAtTime(2200, now);
      osc1.frequency.exponentialRampToValueAtTime(780, now + duration);

      osc2.frequency.setValueAtTime(2240, now);
      osc2.frequency.exponentialRampToValueAtTime(810, now + duration);

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.004);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([osc1, osc2, lfo, lfoGain, filter, masterGain], osc1, duration);

    try {
      osc1.start(now);
      osc1.stop(now + duration + 0.01);
      osc2.start(now);
      osc2.stop(now + duration + 0.01);
      lfo.start(now);
      lfo.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Stage 50 Aeternum Core — Satellite Orbital Shield Hum
   */
  public playOrbitalShieldHum(loop: boolean = false, options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    this.stopOrbitalShieldHum();

    const now = ctx.currentTime;
    const duration = 0.85;
    const vol = (options?.volume ?? 1.0) * 0.28;

    const freqs = [110, 220, 330, 550];
    const weights = [1.0, 0.6, 0.35, 0.20];
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(850, now);
    filter.Q.setValueAtTime(2.5, now);

    const tremoloGain = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(1.1, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0.3, now);

    const masterGain = ctx.createGain();

    try {
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.15);
      if (!loop) {
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      }
      tremoloGain.gain.setValueAtTime(0.7, now);
    } catch {
      // Safe fallback
    }

    lfo.connect(lfoGain);
    lfoGain.connect(tremoloGain.gain);

    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      try {
        osc.frequency.setValueAtTime(freqs[i]!, now);
        g.gain.setValueAtTime(weights[i]!, now);
      } catch {
        // Safe fallback
      }
      osc.connect(g);
      g.connect(filter);
      oscs.push(osc);
      gains.push(g);
    }

    filter.connect(tremoloGain);
    tremoloGain.connect(masterGain);
    masterGain.connect(sfxBus);

    if (loop) {
      this.activeVoiceCount++;
      const stop = () => {
        try {
          for (const osc of oscs) osc.stop();
          lfo.stop();
          for (const osc of oscs) osc.disconnect();
          for (const g of gains) g.disconnect();
          lfo.disconnect();
          lfoGain.disconnect();
          filter.disconnect();
          tremoloGain.disconnect();
          masterGain.disconnect();
        } catch {
          // Handled silently
        }
        this.activeVoiceCount = Math.max(0, this.activeVoiceCount - 1);
        this.activeLoops.delete('orbitalShield');
      };
      this.activeLoops.set('orbitalShield', { stop });
      try {
        for (const osc of oscs) osc.start(now);
        lfo.start(now);
      } catch {
        // Safe fallback
      }
    } else {
      this.registerNodeCleanup([...oscs, ...gains, lfo, lfoGain, filter, tremoloGain, masterGain], oscs[0]!, duration);
      try {
        for (const osc of oscs) {
          osc.start(now);
          osc.stop(now + duration + 0.01);
        }
        lfo.start(now);
        lfo.stop(now + duration + 0.01);
      } catch {
        // Safe fallback
      }
    }
    return true;
  }

  public stopOrbitalShieldHum(): void {
    const handle = this.activeLoops.get('orbitalShield');
    if (handle) {
      handle.stop();
    }
  }

  /**
   * Stage 50 Aeternum Core — Dark Matter Mega-Beam Charge (1.55s)
   */
  public playDarkMatterBeamCharge(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.HIGH;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 1.55;
    const vol = (options?.volume ?? 1.0) * 0.40;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(5.0, now);

    const tremoloGain = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0.4, now);

    const masterGain = ctx.createGain();

    try {
      osc.frequency.setValueAtTime(65, now);
      osc.frequency.exponentialRampToValueAtTime(1450, now + duration);

      filter.frequency.setValueAtTime(200, now);
      filter.frequency.exponentialRampToValueAtTime(3800, now + duration);

      lfo.frequency.setValueAtTime(14, now);
      lfo.frequency.linearRampToValueAtTime(42, now + duration);

      tremoloGain.gain.setValueAtTime(0.6, now);

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol * 0.8, now + 0.10);
      masterGain.gain.linearRampToValueAtTime(vol, now + duration);
      masterGain.gain.setValueAtTime(0.0001, now + duration + 0.01);
    } catch {
      // Safe fallback
    }

    lfo.connect(lfoGain);
    lfoGain.connect(tremoloGain.gain);

    osc.connect(filter);
    filter.connect(tremoloGain);
    tremoloGain.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([osc, filter, lfo, lfoGain, tremoloGain, masterGain], osc, duration);

    try {
      osc.start(now);
      osc.stop(now + duration + 0.01);
      lfo.start(now);
      lfo.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Stage 50 Aeternum Core — Dark Matter Mega-Beam Sweeping Roar (1.8s)
   */
  public playDarkMatterBeamRoar(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.HIGH;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    this.stopDarkMatterBeamRoar();

    const now = ctx.currentTime;
    const duration = 1.80;
    const vol = (options?.volume ?? 1.0) * 0.42;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getWhiteNoiseBuffer(ctx);

    const bpFilter = ctx.createBiquadFilter();
    bpFilter.type = 'bandpass';
    bpFilter.Q.setValueAtTime(4.8, now);

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sawtooth';
    const subFilter = ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(180, now);
    subFilter.Q.setValueAtTime(3.0, now);

    const masterGain = ctx.createGain();

    try {
      bpFilter.frequency.setValueAtTime(350, now);
      bpFilter.frequency.linearRampToValueAtTime(1800, now + 0.6);
      bpFilter.frequency.linearRampToValueAtTime(450, now + duration);

      subOsc.frequency.setValueAtTime(55, now);

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.05);
      masterGain.gain.setValueAtTime(vol * 0.9, now + 1.2);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    noise.connect(bpFilter);
    bpFilter.connect(masterGain);

    subOsc.connect(subFilter);
    subFilter.connect(masterGain);

    masterGain.connect(sfxBus);

    const roarStop = () => {
      this.activeLoops.delete('beamRoar');
      try {
        noise.stop();
        subOsc.stop();
      } catch {
        // Safe fallback
      }
    };
    this.activeLoops.set('beamRoar', { stop: roarStop });

    try {
      noise.start(now);
      noise.stop(now + duration + 0.01);
      subOsc.start(now);
      subOsc.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }

    this.registerNodeCleanup([noise, bpFilter, subOsc, subFilter, masterGain], noise, duration);
    return true;
  }

  public stopDarkMatterBeamRoar(): void {
    const handle = this.activeLoops.get('beamRoar');
    if (handle) {
      handle.stop();
    }
  }

  /**
   * Stage 50 Aeternum Core — Phase 3 Overdrive Enrage Siren
   */
  public playEnrageSiren(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.HIGH;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 1.15;
    const vol = (options?.volume ?? 1.0) * 0.36;

    const osc = ctx.createOscillator();
    osc.type = 'square';

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(3.2, now);

    const masterGain = ctx.createGain();

    try {
      for (let i = 0; i < 4; i++) {
        const t = now + i * 0.28;
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.setValueAtTime(660, t + 0.14);
      }

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.02);
      masterGain.gain.setValueAtTime(vol, now + 1.0);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    osc.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([osc, filter, masterGain], osc, duration);

    try {
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  // ==========================================================================
  // 7. Milestone 10: 11 Stellaris-Inspired Crisis Event Audio Synthesis
  // ==========================================================================

  /**
   * Cosmic Crisis Warning Phase — Retro Emergency Klaxon Alert
   */
  public playCrisisKlaxon(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.HIGH;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.95;
    const vol = (options?.volume ?? 1.0) * 0.35;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(4.0, now);

    const masterGain = ctx.createGain();

    try {
      // Pulse 1
      osc1.frequency.setValueAtTime(370, now);
      osc1.frequency.linearRampToValueAtTime(520, now + 0.42);
      osc2.frequency.setValueAtTime(374, now);
      osc2.frequency.linearRampToValueAtTime(526, now + 0.42);

      // Pulse 2
      osc1.frequency.setValueAtTime(370, now + 0.48);
      osc1.frequency.linearRampToValueAtTime(520, now + 0.90);
      osc2.frequency.setValueAtTime(374, now + 0.48);
      osc2.frequency.linearRampToValueAtTime(526, now + 0.90);

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.05);
      masterGain.gain.setValueAtTime(vol * 0.2, now + 0.45);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.50);
      masterGain.gain.setValueAtTime(vol * 0.9, now + 0.85);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([osc1, osc2, filter, masterGain], osc1, duration);

    try {
      osc1.start(now);
      osc1.stop(now + duration + 0.01);
      osc2.start(now);
      osc2.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * The Contingency — Rogue AI Bitcrushed Digital Glitch
   */
  public playDigitalGlitch(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    if (this.isDebounced('digitalGlitch', 0.05)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.15;
    const vol = (options?.volume ?? 1.0) * 0.28;

    const osc = ctx.createOscillator();
    osc.type = 'square';

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(600, now);

    const masterGain = ctx.createGain();

    const glitchFreqs = [1760, 440, 3520, 880, 2200, 330, 2640, 110];
    const stepDuration = 0.018;

    try {
      for (let i = 0; i < glitchFreqs.length; i++) {
        osc.frequency.setValueAtTime(glitchFreqs[i]!, now + i * stepDuration);
      }

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.005);
      masterGain.gain.setValueAtTime(vol, now + 0.12);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    osc.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([osc, filter, masterGain], osc, duration);

    try {
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Milestone M18: Glitch Buzz & Mains Hum Synthesis
   * Low-frequency 60Hz/120Hz harsh hum with tremolo square LFO and bandpass filter.
   */
  public playGlitchBuzz(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    if (this.isDebounced('glitchBuzz', 0.08)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.24;
    const vol = (options?.volume ?? 1.0) * 0.30;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(60, now);

    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(120, now);
    osc2.detune.setValueAtTime(4, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(320, now);
    filter.Q.setValueAtTime(4.0, now);

    const masterGain = ctx.createGain();

    try {
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.01);
      masterGain.gain.setValueAtTime(vol, now + 0.18);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([osc1, osc2, filter, masterGain], osc1, duration);

    try {
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration + 0.01);
      osc2.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Milestone M18: Glitch Frequency Chirp
   * High-speed frequency hopping arpeggio simulating CPU register corruption.
   */
  public playGlitchFrequencyChirp(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    if (this.isDebounced('glitchChirp', 0.04)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.08;
    const vol = (options?.volume ?? 1.0) * 0.25;

    const osc = ctx.createOscillator();
    osc.type = 'square';

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(500, now);

    const masterGain = ctx.createGain();

    const freqs = [2400, 350, 4200, 800, 1600];
    const step = 0.016;

    try {
      for (let i = 0; i < freqs.length; i++) {
        osc.frequency.setValueAtTime(freqs[i]!, now + i * step);
      }
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.003);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    osc.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([osc, filter, masterGain], osc, duration);

    try {
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Milestone M18: Data Stream Noise
   * High-baud telemetry burst / modem packet handshake simulation with white noise buffer.
   */
  public playDataStreamNoise(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    if (this.isDebounced('dataStreamNoise', 0.10)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.22;
    const vol = (options?.volume ?? 1.0) * 0.22;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getWhiteNoiseBuffer(ctx);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1200, now);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2200, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.Q.setValueAtTime(5.0, now);

    const masterGain = ctx.createGain();

    try {
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.01);
      masterGain.gain.setValueAtTime(vol * 0.8, now + 0.12);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    noise.connect(filter);
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([noise, osc1, osc2, filter, masterGain], noise, duration);

    try {
      noise.start(now);
      osc1.start(now);
      osc2.start(now);
      noise.stop(now + duration + 0.01);
      osc1.stop(now + duration + 0.01);
      osc2.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Hyperspace Storm — Cosmic Lightning Arc Crackle & Thunder
   */
  public playLightningCrackle(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.45;
    const vol = (options?.volume ?? 1.0) * 0.35;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getWhiteNoiseBuffer(ctx);

    const snapFilter = ctx.createBiquadFilter();
    snapFilter.type = 'highpass';
    snapFilter.frequency.setValueAtTime(4000, now);

    const rollFilter = ctx.createBiquadFilter();
    rollFilter.type = 'bandpass';
    rollFilter.Q.setValueAtTime(3.5, now);

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sawtooth';

    const masterGain = ctx.createGain();

    try {
      rollFilter.frequency.setValueAtTime(3000, now);
      rollFilter.frequency.exponentialRampToValueAtTime(400, now + duration);

      subOsc.frequency.setValueAtTime(130, now);
      subOsc.frequency.exponentialRampToValueAtTime(30, now + duration);

      masterGain.gain.setValueAtTime(vol * 1.2, now);
      masterGain.gain.setValueAtTime(vol * 0.6, now + 0.05);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    noise.connect(snapFilter);
    snapFilter.connect(masterGain);

    noise.connect(rollFilter);
    rollFilter.connect(masterGain);

    subOsc.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([noise, snapFilter, rollFilter, subOsc, masterGain], noise, duration);

    try {
      noise.start(now);
      noise.stop(now + duration + 0.01);
      subOsc.start(now);
      subOsc.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Nemesis Star-Eater — Dark Matter Cosmic Ignition & Implosion
   */
  public playDarkMatterIgnition(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.HIGH;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 1.35;
    const vol = (options?.volume ?? 1.0) * 0.40;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getWhiteNoiseBuffer(ctx);

    const suctionFilter = ctx.createBiquadFilter();
    suctionFilter.type = 'bandpass';
    suctionFilter.Q.setValueAtTime(5.0, now);

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';

    const blastFilter = ctx.createBiquadFilter();
    blastFilter.type = 'lowpass';
    blastFilter.Q.setValueAtTime(6.5, now);

    const masterGain = ctx.createGain();

    try {
      suctionFilter.frequency.setValueAtTime(2200, now);
      suctionFilter.frequency.exponentialRampToValueAtTime(100, now + 0.22);

      subOsc.frequency.setValueAtTime(42, now + 0.22);

      blastFilter.frequency.setValueAtTime(900, now + 0.22);
      blastFilter.frequency.exponentialRampToValueAtTime(25, now + duration);

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol * 0.4, now + 0.20);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.25);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    noise.connect(suctionFilter);
    suctionFilter.connect(masterGain);

    subOsc.connect(masterGain);

    noise.connect(blastFilter);
    blastFilter.connect(masterGain);

    masterGain.connect(sfxBus);

    this.registerNodeCleanup([noise, suctionFilter, subOsc, blastFilter, masterGain], noise, duration);

    try {
      noise.start(now);
      noise.stop(now + duration + 0.01);
      subOsc.start(now + 0.22);
      subOsc.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  // ==========================================================================
  // 8. Milestone 13: Allies Support System Audio Synthesis
  // ==========================================================================

  /**
   * Escort Wingman Drone — Forward Plasma Bolt Chirp
   */
  public playEscortPlasmaBolt(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.08;
    const vol = (options?.volume ?? 1.0) * 0.22;
    const pitch = options?.pitch ?? 1.0;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc2.type = 'sine';

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, now);

    const masterGain = ctx.createGain();

    try {
      osc1.frequency.setValueAtTime(1400 * pitch, now);
      osc1.frequency.exponentialRampToValueAtTime(Math.max(10, 380 * pitch), now + duration);

      osc2.frequency.setValueAtTime(2800 * pitch, now);
      osc2.frequency.exponentialRampToValueAtTime(Math.max(10, 760 * pitch), now + duration);

      masterGain.gain.setValueAtTime(vol, now);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([osc1, osc2, filter, masterGain], osc1, duration);

    try {
      osc1.start(now);
      osc1.stop(now + duration + 0.01);
      osc2.start(now);
      osc2.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Kinetic Aegis Drone — Celestial Shield Repair Triad Chime
   */
  public playShieldRepairChime(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const totalDuration = 0.45;
    const vol = (options?.volume ?? 1.0) * 0.25;

    const notes = [1046.5, 1318.5, 1567.9, 2093.0]; // C6, E6, G6, C7
    const noteSpacing = 0.045;
    const noteDecay = 0.25;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(vol, now);
    masterGain.connect(sfxBus);

    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];

    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';

      const startTime = now + i * noteSpacing;
      try {
        osc.frequency.setValueAtTime(notes[i]!, startTime);
        g.gain.setValueAtTime(0.001, startTime);
        g.gain.linearRampToValueAtTime(1.0, startTime + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, startTime + noteDecay);
      } catch {
        // Safe fallback
      }

      osc.connect(g);
      g.connect(masterGain);
      oscs.push(osc);
      gains.push(g);
    }

    this.registerNodeCleanup([...oscs, ...gains, masterGain], oscs[0]!, totalDuration);

    for (let i = 0; i < oscs.length; i++) {
      try {
        const startTime = now + i * noteSpacing;
        oscs[i]!.start(startTime);
        oscs[i]!.stop(startTime + noteDecay + 0.01);
      } catch {
        // Safe fallback
      }
    }
    return true;
  }

  /**
   * Kinetic Aegis Drone — Point-Defense Flak Deflection Ping
   */
  public playPointDefensePing(options?: SoundPlaybackOptions): boolean {
    if (this.isDebounced('flakPing', 0.03)) return false;
    const priority = options?.priority ?? SOUND_PRIORITY.LOW;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.045;
    const vol = (options?.volume ?? 1.0) * 0.26;

    const osc = ctx.createOscillator();
    osc.type = 'square';

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2600, now);
    filter.Q.setValueAtTime(9.0, now);

    const masterGain = ctx.createGain();

    try {
      osc.frequency.setValueAtTime(2800, now);
      osc.frequency.exponentialRampToValueAtTime(2200, now + duration);

      masterGain.gain.setValueAtTime(vol, now);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    osc.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([osc, filter, masterGain], osc, duration);

    try {
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Bomber Support Wing — Heavy Engine Flyby Sweep
   */
  public playBomberEngineSweep(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 1.60;
    const vol = (options?.volume ?? 1.0) * 0.32;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getWhiteNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(3.6, now);

    const sub1 = ctx.createOscillator();
    const sub2 = ctx.createOscillator();
    sub1.type = 'triangle';
    sub2.type = 'triangle';

    const masterGain = ctx.createGain();

    try {
      filter.frequency.setValueAtTime(160, now);
      filter.frequency.linearRampToValueAtTime(620, now + 0.7);
      filter.frequency.linearRampToValueAtTime(180, now + duration);

      sub1.frequency.setValueAtTime(75, now);
      sub2.frequency.setValueAtTime(79, now);

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.4);
      masterGain.gain.setValueAtTime(vol, now + 1.1);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    noise.connect(filter);
    filter.connect(masterGain);

    sub1.connect(masterGain);
    sub2.connect(masterGain);

    masterGain.connect(sfxBus);

    this.registerNodeCleanup([noise, filter, sub1, sub2, masterGain], noise, duration);

    try {
      noise.start(now);
      noise.stop(now + duration + 0.01);
      sub1.start(now);
      sub1.stop(now + duration + 0.01);
      sub2.start(now);
      sub2.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Bomber Munition — Cluster Bomb Shockwave Impact Thud
   */
  public playClusterBombThud(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.24;
    const vol = (options?.volume ?? 1.0) * 0.38;

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';

    const noise = ctx.createBufferSource();
    noise.buffer = this.getWhiteNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(4.2, now);

    const masterGain = ctx.createGain();

    try {
      subOsc.frequency.setValueAtTime(170, now);
      subOsc.frequency.exponentialRampToValueAtTime(26, now + duration);

      filter.frequency.setValueAtTime(450, now);
      filter.frequency.exponentialRampToValueAtTime(35, now + duration);

      masterGain.gain.setValueAtTime(vol, now);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    subOsc.connect(masterGain);
    noise.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([subOsc, noise, filter, masterGain], subOsc, duration);

    try {
      subOsc.start(now);
      subOsc.stop(now + duration + 0.01);
      noise.start(now);
      noise.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  // ==========================================================================
  // 9. Milestone 13: Special Moves Audio Synthesis
  // ==========================================================================

  /**
   * Nova Barrage — 3-Tone Target Acquisition Lock Chime
   */
  public playNovaLockChime(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.09;
    const vol = (options?.volume ?? 1.0) * 0.24;

    const freqs = [1200, 1600, 2400];

    const osc = ctx.createOscillator();
    osc.type = 'square';
    const masterGain = ctx.createGain();

    try {
      for (let i = 0; i < 3; i++) {
        osc.frequency.setValueAtTime(freqs[i]!, now + i * 0.025);
      }
      masterGain.gain.setValueAtTime(vol, now);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    osc.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([osc, masterGain], osc, duration);

    try {
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Nova Barrage — Missile Rocket Booster Acceleration Swoosh
   */
  public playNovaMissileSwoosh(options?: SoundPlaybackOptions): boolean {
    if (this.isDebounced('novaSwoosh', 0.04)) return false;
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.28;
    const vol = (options?.volume ?? 1.0) * 0.26;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getWhiteNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(4.5, now);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';

    const masterGain = ctx.createGain();

    try {
      filter.frequency.setValueAtTime(500, now);
      filter.frequency.exponentialRampToValueAtTime(2200, now + duration);

      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + duration);

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.04);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    noise.connect(filter);
    filter.connect(masterGain);

    osc.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([noise, filter, osc, masterGain], noise, duration);

    try {
      noise.start(now);
      noise.stop(now + duration + 0.01);
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Chrono Freeze — Sub-Bass Time-Dilation Pitch Drop
   */
  public playChronoFreezeDrop(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.HIGH;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.70;
    const vol = (options?.volume ?? 1.0) * 0.42;

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(240, now);

    const masterGain = ctx.createGain();

    try {
      subOsc.frequency.setValueAtTime(180, now);
      subOsc.frequency.exponentialRampToValueAtTime(22, now + 0.65);

      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.02);
      masterGain.gain.setValueAtTime(vol, now + 0.45);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    subOsc.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([subOsc, filter, masterGain], subOsc, duration);

    try {
      subOsc.start(now);
      subOsc.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Chrono Freeze — Mechanical Clock Freeze Click Tick
   */
  public playClockFreezeTick(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.025;
    const vol = (options?.volume ?? 1.0) * 0.32;

    const osc = ctx.createOscillator();
    osc.type = 'square';

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200, now);
    filter.Q.setValueAtTime(14.0, now);

    const masterGain = ctx.createGain();

    try {
      osc.frequency.setValueAtTime(3200, now);
      masterGain.gain.setValueAtTime(vol, now);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    osc.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([osc, filter, masterGain], osc, duration);

    try {
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Dimensional Warp Ram — Barrier Shear Chirp & Sonic Shockwave Boom
   */
  public playWarpRamSonicBoom(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.HIGH;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.70;
    const vol = (options?.volume ?? 1.0) * 0.44;

    // Stage 1: shear chirp
    const chirpOsc = ctx.createOscillator();
    chirpOsc.type = 'sawtooth';

    // Stage 2: shockwave sine + lowpass noise
    const shockOsc = ctx.createOscillator();
    shockOsc.type = 'sine';

    const noise = ctx.createBufferSource();
    noise.buffer = this.getWhiteNoiseBuffer(ctx);

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.Q.setValueAtTime(5.2, now);

    const masterGain = ctx.createGain();

    try {
      chirpOsc.frequency.setValueAtTime(150, now);
      chirpOsc.frequency.exponentialRampToValueAtTime(2400, now + 0.035);

      shockOsc.frequency.setValueAtTime(240, now + 0.03);
      shockOsc.frequency.exponentialRampToValueAtTime(22, now + duration);

      noiseFilter.frequency.setValueAtTime(3500, now + 0.03);
      noiseFilter.frequency.exponentialRampToValueAtTime(45, now + duration);

      masterGain.gain.setValueAtTime(vol * 0.7, now);
      masterGain.gain.linearRampToValueAtTime(vol, now + 0.04);
      masterGain.gain.setValueAtTime(vol * 0.8, now + 0.35);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch {
      // Safe fallback
    }

    chirpOsc.connect(masterGain);
    shockOsc.connect(masterGain);
    noise.connect(noiseFilter);
    noiseFilter.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup([chirpOsc, shockOsc, noise, noiseFilter, masterGain], shockOsc, duration);

    try {
      chirpOsc.start(now);
      chirpOsc.stop(now + 0.04);
      shockOsc.start(now + 0.03);
      shockOsc.stop(now + duration + 0.01);
      noise.start(now + 0.03);
      noise.stop(now + duration + 0.01);
    } catch {
      // Safe fallback
    }
    return true;
  }

  // ==========================================================================
  // 9.5. Milestone M19 Power-Up & Utility Items Procedural SFX
  // ==========================================================================

  /**
   * Milestone 19: Chrono Field Activation (Time-dilation pitch bend & deep phase sweep).
   */
  public playChronoFieldActivate(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.HIGH;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.75;
    const vol = (options?.volume ?? 1.0) * 0.42;
    const pitch = options?.pitch ?? 1.0;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const masterGain = ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';
    subOsc.type = 'sine';
    filter.type = 'lowpass';
    filter.Q.value = 5.0;

    // Downward frequency sweep from 440Hz -> 65Hz
    osc1.frequency.setValueAtTime(440 * pitch, now);
    osc1.frequency.exponentialRampToValueAtTime(Math.max(10, 65 * pitch), now + 0.65);

    // 4Hz detuned secondary oscillator for phase beating
    osc2.frequency.setValueAtTime(444 * pitch, now);
    osc2.frequency.exponentialRampToValueAtTime(Math.max(10, 67 * pitch), now + 0.65);

    // Sub-bass resonance rumble at 55Hz
    subOsc.frequency.setValueAtTime(55 * pitch, now);

    // Filter sweep 2200Hz -> 180Hz
    filter.frequency.setValueAtTime(2200, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.70);

    // Volume envelope
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    masterGain.gain.setValueAtTime(1.0, now);

    // Audio Graph
    osc1.connect(filter);
    osc2.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup(
      [osc1, osc2, subOsc, filter, gain, masterGain],
      osc1,
      duration
    );

    try {
      osc1.start(now);
      osc2.start(now);
      subOsc.start(now);
      osc1.stop(now + duration);
      osc2.stop(now + duration);
      subOsc.stop(now + duration);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Milestone 19: Reflection Shield Bullet Deflection (Metallic ping + missile launch chirp).
   */
  public playReflectionDeflect(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.28;
    const vol = (options?.volume ?? 1.0) * 0.40;
    const pitch = options?.pitch ?? 1.0;

    // 1. Metallic Impact Ping (Dual non-harmonic square/triangle oscillators)
    const pingOsc1 = ctx.createOscillator();
    const pingOsc2 = ctx.createOscillator();
    const pingFilter = ctx.createBiquadFilter();
    const pingGain = ctx.createGain();

    pingOsc1.type = 'square';
    pingOsc2.type = 'triangle';
    pingFilter.type = 'bandpass';
    pingFilter.Q.value = 7.0;

    pingOsc1.frequency.setValueAtTime(1760 * pitch, now);
    pingOsc2.frequency.setValueAtTime(2480 * pitch, now);
    pingFilter.frequency.setValueAtTime(2100 * pitch, now);

    pingGain.gain.setValueAtTime(vol * 0.6, now);
    pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    // 2. Counter-Missile Upward Chirp
    const chirpOsc = ctx.createOscillator();
    const chirpGain = ctx.createGain();
    chirpOsc.type = 'sawtooth';

    chirpOsc.frequency.setValueAtTime(320 * pitch, now + 0.03);
    chirpOsc.frequency.exponentialRampToValueAtTime(1400 * pitch, now + 0.25);

    chirpGain.gain.setValueAtTime(0.01, now + 0.03);
    chirpGain.gain.linearRampToValueAtTime(vol * 0.5, now + 0.08);
    chirpGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1.0, now);

    // Audio Graph
    pingOsc1.connect(pingFilter);
    pingOsc2.connect(pingFilter);
    pingFilter.connect(pingGain);
    pingGain.connect(masterGain);

    chirpOsc.connect(chirpGain);
    chirpGain.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup(
      [pingOsc1, pingOsc2, pingFilter, pingGain, chirpOsc, chirpGain, masterGain],
      chirpOsc,
      duration
    );

    try {
      pingOsc1.start(now);
      pingOsc2.start(now);
      chirpOsc.start(now + 0.03);

      pingOsc1.stop(now + 0.12);
      pingOsc2.stop(now + 0.12);
      chirpOsc.stop(now + duration);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Milestone 19: EMP Collector Bullet Absorption (Singularity suction hum + electric zap pop).
   */
  public playEmpBulletAbsorb(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.LOW;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.14;
    const vol = (options?.volume ?? 1.0) * 0.32;
    const pitch = options?.pitch ?? 1.0;

    const humOsc = ctx.createOscillator();
    const zapOsc = ctx.createOscillator();
    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const masterGain = ctx.createGain();

    humOsc.type = 'sine';
    zapOsc.type = 'sawtooth';
    filter.type = 'bandpass';
    filter.Q.value = 4.0;

    noise.buffer = this.getWhiteNoiseBuffer(ctx);

    // Suction downward pitch slide
    humOsc.frequency.setValueAtTime(240 * pitch, now);
    humOsc.frequency.exponentialRampToValueAtTime(Math.max(10, 80 * pitch), now + 0.12);

    // Fast electric zap chirp
    zapOsc.frequency.setValueAtTime(920 * pitch, now);
    zapOsc.frequency.exponentialRampToValueAtTime(Math.max(10, 180 * pitch), now + 0.06);

    filter.frequency.setValueAtTime(3200 * pitch, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(10, 600 * pitch), now + 0.10);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    masterGain.gain.setValueAtTime(1.0, now);

    humOsc.connect(gain);
    zapOsc.connect(filter);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup(
      [humOsc, zapOsc, noise, filter, gain, masterGain],
      humOsc,
      duration
    );

    try {
      humOsc.start(now);
      zapOsc.start(now);
      noise.start(now);

      humOsc.stop(now + duration);
      zapOsc.stop(now + 0.06);
      noise.stop(now + 0.08);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Milestone 19: Quantum Phase Drive Warp Blink (Sub-bass punch + frequency jump).
   */
  public playPhaseDriveBlink(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.HIGH;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.26;
    const vol = (options?.volume ?? 1.0) * 0.45;
    const pitch = options?.pitch ?? 1.0;

    const subThump = ctx.createOscillator();
    const jumpOsc = ctx.createOscillator();
    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const masterGain = ctx.createGain();

    subThump.type = 'sine';
    jumpOsc.type = 'triangle';
    filter.type = 'highpass';
    filter.Q.value = 2.0;
    filter.frequency.setValueAtTime(2400, now);

    noise.buffer = this.getWhiteNoiseBuffer(ctx);

    // Sub-bass teleport thump (85Hz -> 30Hz)
    subThump.frequency.setValueAtTime(85 * pitch, now);
    subThump.frequency.exponentialRampToValueAtTime(Math.max(10, 30 * pitch), now + 0.07);

    // Quantum leap sweep (220Hz -> 2400Hz -> 1100Hz)
    jumpOsc.frequency.setValueAtTime(220 * pitch, now);
    jumpOsc.frequency.exponentialRampToValueAtTime(2400 * pitch, now + 0.06);
    jumpOsc.frequency.exponentialRampToValueAtTime(1100 * pitch, now + duration);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    masterGain.gain.setValueAtTime(1.0, now);

    subThump.connect(gain);
    jumpOsc.connect(gain);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup(
      [subThump, jumpOsc, noise, filter, gain, masterGain],
      jumpOsc,
      duration
    );

    try {
      subThump.start(now);
      jumpOsc.start(now);
      noise.start(now);

      subThump.stop(now + 0.08);
      jumpOsc.stop(now + duration);
      noise.stop(now + 0.12);
    } catch {
      // Safe fallback
    }
    return true;
  }

  /**
   * Milestone 19: Antimatter Plasma Blaster Continuous Beam Pulse (Crackling high-energy laser buzz).
   */
  public playPlasmaBeamPulse(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.NORMAL;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.16;
    const vol = (options?.volume ?? 1.0) * 0.38;
    const pitch = options?.pitch ?? 1.0;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const lfoMod = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const noise = ctx.createBufferSource();
    const noiseFilter = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();
    const mainFilter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const masterGain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    lfoMod.type = 'sawtooth'; // 60Hz mains buzz FM
    mainFilter.type = 'lowpass';
    mainFilter.frequency.setValueAtTime(1600, now);
    mainFilter.Q.value = 3.0;

    noise.buffer = this.getWhiteNoiseBuffer(ctx);
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(2400, now);
    noiseFilter.Q.value = 3.0;

    // Base frequencies with 3Hz detune
    osc1.frequency.setValueAtTime(130 * pitch, now);
    osc2.frequency.setValueAtTime(133 * pitch, now);

    // 60Hz FM modulation
    lfoMod.frequency.setValueAtTime(60, now);
    lfoGain.gain.setValueAtTime(45, now);
    lfoMod.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    noiseGain.gain.setValueAtTime(vol * 0.25, now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    masterGain.gain.setValueAtTime(1.0, now);

    osc1.connect(mainFilter);
    osc2.connect(mainFilter);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(gain);
    mainFilter.connect(gain);
    gain.connect(masterGain);
    masterGain.connect(sfxBus);

    this.registerNodeCleanup(
      [osc1, osc2, lfoMod, lfoGain, noise, noiseFilter, noiseGain, mainFilter, gain, masterGain],
      osc1,
      duration
    );

    try {
      osc1.start(now);
      osc2.start(now);
      lfoMod.start(now);
      noise.start(now);

      osc1.stop(now + duration);
      osc2.stop(now + duration);
      lfoMod.stop(now + duration);
      noise.stop(now + duration);
    } catch {
      // Safe fallback
    }
    return true;
  }

  // ==========================================================================
  // 10. Generic Event Dispatcher (Contract with types/index.ts)
  // ==========================================================================

  /**
   * Dispatches sound synthesis according to AudioEventType.
   */
  public playEvent(eventType: AudioEventType, options?: SoundPlaybackOptions): boolean {
    switch (eventType) {
      case 'LASER_FIRE':
        return this.playLaser(options);
      case 'ENEMY_DIVE':
        return this.playAlienDive('zako', options);
      case 'ENEMY_EXPLOSION_SMALL':
        return this.playExplosion('small', options?.debounce !== undefined ? options : { ...options, debounce: true });
      case 'ENEMY_EXPLOSION_LARGE':
        return this.playExplosion('large', options);
      case 'PLAYER_EXPLOSION':
        return this.playExplosion('large', { priority: SOUND_PRIORITY.HIGH, ...options });
      case 'BOSS_HIT':
        return this.playBossHit(options);
      case 'BOSS_DESTROYED':
        return this.playExplosion('boss', { priority: SOUND_PRIORITY.HIGH, ...options });
      case 'TRACTOR_BEAM':
        return this.playTractorBeam(options?.loop ?? true, options);
      case 'HEAVY_LASER_BLAST':
        return this.playHeavyLaserBlast(options);
      case 'SPIRAL_RING_WHOOSH':
        return this.playSpiralRingWhoosh(options);
      case 'DIMENSIONAL_TEAR_HUM':
        return this.playDimensionalTearHum(options?.loop ?? false, options);
      case 'BLACK_HOLE_SUCTION_RUMBLE':
        return this.playBlackHoleSuctionRumble(options?.loop ?? false, options);
      case 'NANITE_SPLIT_SHIMMER':
        return this.playNaniteSplitShimmer(options);
      case 'GRAY_GOO_DISSOLVE_HISS':
        return this.playGrayGooDissolveHiss(options);
      case 'PHANTOM_DIVE_WARBLE':
        return this.playPhantomDiveWarble(options);
      case 'TELEKINETIC_STUN_SCREECH':
        return this.playTelekineticStunScreech(options);
      case 'ORBITAL_SHIELD_HUM':
        return this.playOrbitalShieldHum(options?.loop ?? false, options);
      case 'DARK_MATTER_BEAM_CHARGE':
        return this.playDarkMatterBeamCharge(options);
      case 'DARK_MATTER_BEAM_ROAR':
        return this.playDarkMatterBeamRoar(options);
      case 'ENRAGE_SIREN':
        return this.playEnrageSiren(options);
      case 'CRISIS_KLAXON':
        return this.playCrisisKlaxon(options);
      case 'DIGITAL_GLITCH':
        return this.playDigitalGlitch(options);
      case 'LIGHTNING_CRACKLE':
        return this.playLightningCrackle(options);
      case 'DARK_MATTER_IGNITION':
        return this.playDarkMatterIgnition(options);
      case 'ESCORT_PLASMA_BOLT':
        return this.playEscortPlasmaBolt(options);
      case 'SHIELD_REPAIR_CHIME':
        return this.playShieldRepairChime(options);
      case 'POINT_DEFENSE_PING':
        return this.playPointDefensePing(options);
      case 'BOMBER_ENGINE_SWEEP':
        return this.playBomberEngineSweep(options);
      case 'CLUSTER_BOMB_THUD':
        return this.playClusterBombThud(options);
      case 'NOVA_LOCK_CHIME':
        return this.playNovaLockChime(options);
      case 'NOVA_MISSILE_SWOOSH':
        return this.playNovaMissileSwoosh(options);
      case 'CHRONO_FREEZE_DROP':
        return this.playChronoFreezeDrop(options);
      case 'CLOCK_FREEZE_TICK':
        return this.playClockFreezeTick(options);
      case 'WARP_RAM_SONIC_BOOM':
        return this.playWarpRamSonicBoom(options);
      case 'CHRONO_FIELD_ACTIVATE':
        return this.playChronoFieldActivate(options);
      case 'REFLECTION_DEFLECT':
        return this.playReflectionDeflect(options);
      case 'EMP_BULLET_ABSORB':
        return this.playEmpBulletAbsorb(options);
      case 'PHASE_DRIVE_BLINK':
        return this.playPhaseDriveBlink(options);
      case 'PLASMA_BEAM_PULSE':
        return this.playPlasmaBeamPulse(options);
      default:
        return false;
    }
  }

  public playReviveEmergencyBeacon(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.HIGH;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.25;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    try {
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + duration);
      const vol = 0.25 * (options?.volume ?? 1.0);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    } catch {
      // safe fallback
    }
    osc.connect(gain);
    gain.connect(sfxBus);
    this.registerNodeCleanup([osc, gain], osc, duration);
    try {
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch {
      // safe fallback
    }
    return true;
  }

  public playLifeDonatedChime(options?: SoundPlaybackOptions): boolean {
    const priority = options?.priority ?? SOUND_PRIORITY.HIGH;
    if (!this.canPlayVoice(priority)) return false;
    const ctx = this.audioManager.getContext();
    const sfxBus = this.audioManager.getSfxGain();
    if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

    const now = ctx.currentTime;
    const duration = 0.35;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    try {
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2);
      const vol = 0.3 * (options?.volume ?? 1.0);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    } catch {
      // safe fallback
    }
    osc.connect(gain);
    gain.connect(sfxBus);
    this.registerNodeCleanup([osc, gain], osc, duration);
    try {
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch {
      // safe fallback
    }
    return true;
  }

  // ==========================================================================
  // Teardown & Reset
  // ==========================================================================

  public stopAll(): void {
    this.stopTractorBeam();
    for (const [_, handle] of this.activeLoops) {
      try {
        handle.stop();
      } catch {
        // Handled silently
      }
    }
    this.activeLoops.clear();

    for (const cleanup of this.activeCleanups) {
      try {
        cleanup();
      } catch {
        // Handled silently
      }
    }
    this.activeCleanups.clear();

    this.teardownGeneration++;
    this.activeVoiceCount = 0;
  }
}
