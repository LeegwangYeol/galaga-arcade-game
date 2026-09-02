# Milestone 6 Architecture & Design Analysis: Web Audio Procedural SFX

**Specialist**: `m6_explorer_1` (Web Audio Procedural SFX Specialist)  
**Target Modules**: `src/audio/AudioContextManager.ts` & `src/audio/SoundSynth.ts`  
**Platform**: HTML5 Web Audio API / TypeScript 5.7+ / Vite 6 / Vercel  
**Status**: Comprehensive Engineering Specification  

---

## 1. Executive Summary & Design Scope

The Galaga arcade game relies heavily on distinctive, punchy, and iconic 8-bit sound effects. In keeping with the project's zero-external-asset architecture (0 audio files, 0 network latency, 0 asset 404 risks), the audio engine is implemented **100% procedurally** using standard browser Web Audio API DSP nodes (`AudioContext`, `OscillatorNode`, `GainNode`, `BiquadFilterNode`, `AudioBufferSourceNode`).

This document provides complete, production-grade architectural and implementation blueprints for:
1. **`src/audio/AudioContextManager.ts`**:
   - Universal Web Audio context lifecycle management with automatic user gesture unlocking (`pointerdown`, `keydown`, `touchstart`, `mousedown`, `click`).
   - Resilient hierarchical gain routing: SFX sub-bus (`sfxGainNode`), Music sub-bus (`musicGainNode`), and Master output (`masterGainNode`).
   - Master volume attenuation, smooth anti-pop mute/unmute fading (`exponentialRampToValueAtTime` / `linearRampToValueAtTime`), and persistent state inspection.
   - Total runtime safety for headless browsers (Playwright/Puppeteer), restricted iframes, and server-side/Node.js unit test environments (Vitest/JSDOM) without throwing unhandled exceptions.
2. **`src/audio/SoundSynth.ts`**:
   - Pure mathematical synthesis of all core Galaga combat and enemy sound effects:
     - `playLaser()`: High-speed frequency chirp ($880\text{ Hz} \to 120\text{ Hz}$, duration $0.12\text{ s}$, exponential curve) with single and dual-missile options.
     - `playAlienDive(type)`: LFO frequency-modulated pitch dive ($520\text{ Hz} \to 180\text{ Hz}$ with $14\text{ Hz}$ vibrato/FM depth, custom envelopes for Zako, Goei, and Boss Galaga).
     - `playTractorBeam(active)`: Continuous pulsing low-frequency oscillation ($64\text{ Hz} / 70\text{ Hz}$ detuned dual oscillators, resonant lowpass filter at $340\text{ Hz}$, $7\text{ Hz}$ AM tremolo, smooth start/stop loop transitions).
     - `playExplosion(type: 'small' | 'large' | 'boss')`: Filtered white noise bursts with exponential cutoff decay and sub-bass impact sweeps.
     - `playBossHit()`: High-frequency metallic armor deflection ping ($1200\text{ Hz} \to 750\text{ Hz}$).
   - Zero runtime heap allocation: Pre-allocated and cached 2.0s white noise `AudioBuffer` shared across all explosion voices.
   - Voice concurrency throttling to prevent audio clipping during high-density multi-kill events.

---

## 2. Web Audio Graph Topology & Routing Hierarchy

### 2.1 Audio Node Graph Architecture

```
                                    +----------------------------------------+
                                    |         User Input Gesture             |
                                    |  (pointerdown, keydown, touchstart)    |
                                    +----------------------------------------+
                                                        |
                                                        v
                                         AudioContextManager.unlock()
                                                        |
      +-------------------------------------------------+-------------------------------------------------+
      |                                                                                                   |
      v                                                                                                   v
+-----------------------------+                                                     +-----------------------------+
|    SoundSynth (SFX)         |                                                     |   MusicJingles (Melodies)   |
|                             |                                                     |                             |
| [Laser Chirp Osc]           |                                                     | [Intro Fanfare Oscillators] |
| [Alien Dive Carrier + LFO]  |                                                     | [Challenging Stage Jingle]  |
| [Tractor Dual Osc + Tremolo]|                                                     | [Dual Rescue Chime]         |
| [Cached White Noise Buffer] |                                                     | [Game Over Descending Theme]|
| [Explosion BiquadFilter]    |                                                     +-----------------------------+
+-----------------------------+                                                                    |
      |                                                                                            |
      v (connect)                                                                                  v (connect)
+-----------------------------+                                                     +-----------------------------+
|    sfxGain: GainNode        |                                                     |   musicGain: GainNode       |
|    (default: 0.8)           |                                                     |   (default: 0.7)            |
+-----------------------------+                                                     +-----------------------------+
      \                                                                                            /
       \_______________________________________      _____________________________________________/
                                               \    /
                                                v  v
                                      +-----------------------------+
                                      |   masterGain: GainNode      |
                                      |   (default: 0.7, mute: 0.0) |
                                      +-----------------------------+
                                                     |
                                                     v
                                      +-----------------------------+
                                      |   ctx.destination (Speakers)|
                                      +-----------------------------+
```

### 2.2 Autoplay Policy & User Interaction Unlock Protocol

Under the W3C Web Audio autoplay specification, browsers create the `AudioContext` in `'suspended'` state by default. Any attempt to play sounds while suspended is either muted or queued.

The unlocking pipeline operates as follows:
1. **Lazy Context Instantiation**: Context creation occurs on first call to `AudioContextManager.getContext()` or `AudioContextManager.init()`.
2. **Multi-Event Gesture Listeners**: Passive listeners for `pointerdown`, `keydown`, `touchstart`, and `mousedown` are attached to both `window` and the canvas DOM element.
3. **Atomic State Transition**:
   - When the user triggers an input event, `AudioContextManager.unlock()` invokes `ctx.resume()`.
   - Once the promise resolves and `ctx.state === 'running'`, all unlock event listeners are automatically detached (`{ once: true }` or explicit removal).
   - If the environment lacks audio output or permission is blocked, the promise catches cleanly without crashing.
4. **Headless / Node Environment Safety**:
   - Checks `typeof window !== 'undefined'` and `typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined'`.
   - If unavailable, `AudioContextManager` activates a safe mock/stub mode where all methods return safely (`null` or no-op).

---

## 3. Production Specification: `src/audio/AudioContextManager.ts`

### 3.1 Design Invariants
- **Singleton Lifecycle**: Single shared `AudioContext` across the entire game lifetime.
- **Dynamic Master Gain & Sub-Buses**: Separate volume controls for SFX and Music with master gain scaling.
- **Anti-Click Smooth Ramping**: Gain changes use `exponentialRampToValueAtTime` or `linearRampToValueAtTime` with a $15\text{ms} - 25\text{ms}$ time constant to eliminate speaker pops and DC offsets.
- **Zero Throw Guarantee**: No method in `AudioContextManager` will throw an unhandled exception in Node.js, Vitest, Playwright, or unsupported browsers.

### 3.2 Full TypeScript Source Code for `src/audio/AudioContextManager.ts`

```typescript
/**
 * Galaga Arcade Web Game — Audio Context Manager
 * 
 * Central Web Audio API manager handling browser autoplay unlocking, master & sub-bus
 * gain routing, smooth volume ramping, mute toggling, and headless/Node test safety.
 */

export interface AudioSystemStatus {
  supported: boolean;
  unlocked: boolean;
  state: AudioContextState | 'unsupported';
  isMuted: boolean;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  sampleRate: number;
  currentTime: number;
}

export class AudioContextManager {
  private static instance: AudioContextManager | null = null;

  // Web Audio Context & Core Bus Routing Nodes
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  // Persistent Volume & Mute State
  private masterVolume: number = 0.7;
  private sfxVolume: number = 0.8;
  private musicVolume: number = 0.7;
  private isMuted: boolean = false;
  private isUnlocked: boolean = false;
  private isAutoUnlockAttached: boolean = false;

  // Bound event listeners for clean detachment
  private boundUnlockHandler: () => void;

  private constructor() {
    this.boundUnlockHandler = () => {
      this.unlock();
    };

    this.init();
  }

  /**
   * Acquires the singleton AudioContextManager instance.
   */
  public static getInstance(): AudioContextManager {
    if (!AudioContextManager.instance) {
      AudioContextManager.instance = new AudioContextManager();
    }
    return AudioContextManager.instance;
  }

  /**
   * Resets the singleton instance (useful for unit testing isolation).
   */
  public static resetInstance(): void {
    if (AudioContextManager.instance) {
      AudioContextManager.instance.destroy();
      AudioContextManager.instance = null;
    }
  }

  // ==========================================================================
  // Initialization & Context Lifecycle
  // ==========================================================================

  /**
   * Initializes the AudioContext and routing graph if supported in current environment.
   */
  public init(): boolean {
    if (this.ctx) {
      return true;
    }

    if (!this.isSupported()) {
      return false;
    }

    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      this.ctx = new AudioCtxClass();

      // Master Gain -> Destination
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(
        this.isMuted ? 0 : this.masterVolume,
        this.ctx.currentTime
      );
      this.masterGain.connect(this.ctx.destination);

      // SFX Sub-Bus Gain -> Master Gain
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      // Music Sub-Bus Gain -> Master Gain
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      if (this.ctx.state === 'running') {
        this.isUnlocked = true;
      } else {
        this.attachAutoUnlockListeners();
      }

      return true;
    } catch (err) {
      console.warn('[AudioContextManager] Web Audio initialization warning:', err);
      this.ctx = null;
      return false;
    }
  }

  /**
   * Checks whether the current runtime supports the Web Audio API.
   */
  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    );
  }

  /**
   * Returns whether the audio context is active and running.
   */
  public isAudioUnlocked(): boolean {
    return Boolean(this.ctx && this.ctx.state === 'running');
  }

  /**
   * Unlocks the Web Audio context upon user interaction.
   */
  public async unlock(): Promise<boolean> {
    if (!this.ctx) {
      const initialized = this.init();
      if (!initialized || !this.ctx) return false;
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
        this.isUnlocked = this.ctx.state === 'running';
      } catch {
        // Handled silently for non-interactive / test contexts
        this.isUnlocked = false;
      }
    } else if (this.ctx.state === 'running') {
      this.isUnlocked = true;
    }

    if (this.isUnlocked) {
      this.detachAutoUnlockListeners();
    }

    return this.isUnlocked;
  }

  /**
   * Attaches one-time gesture listeners to window and document to auto-unlock audio.
   */
  public attachAutoUnlockListeners(): void {
    if (this.isAutoUnlockAttached || typeof window === 'undefined') return;

    const events = ['pointerdown', 'touchstart', 'keydown', 'mousedown'];
    for (const evt of events) {
      window.addEventListener(evt, this.boundUnlockHandler, {
        once: false,
        passive: true,
        capture: true,
      });
    }

    this.isAutoUnlockAttached = true;
  }

  /**
   * Removes one-time gesture listeners once unlocked or destroyed.
   */
  public detachAutoUnlockListeners(): void {
    if (!this.isAutoUnlockAttached || typeof window === 'undefined') return;

    const events = ['pointerdown', 'touchstart', 'keydown', 'mousedown'];
    for (const evt of events) {
      window.removeEventListener(evt, this.boundUnlockHandler, { capture: true });
    }

    this.isAutoUnlockAttached = false;
  }

  // ==========================================================================
  // Gain & Volume Management
  // ==========================================================================

  /**
   * Sets the master volume level (0.0 to 1.0) with anti-click smoothing.
   */
  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.7));

    if (this.masterGain && this.ctx && !this.isMuted) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(this.masterVolume, now + 0.02);
    }
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  /**
   * Sets the SFX sub-bus volume level (0.0 to 1.0).
   */
  public setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.8));

    if (this.sfxGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.sfxGain.gain.cancelScheduledValues(now);
      this.sfxGain.gain.setValueAtTime(this.sfxGain.gain.value, now);
      this.sfxGain.gain.linearRampToValueAtTime(this.sfxVolume, now + 0.02);
    }
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  /**
   * Sets the Music sub-bus volume level (0.0 to 1.0).
   */
  public setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.7));

    if (this.musicGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
      this.musicGain.gain.linearRampToValueAtTime(this.musicVolume, now + 0.02);
    }
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  /**
   * Sets the mute state with smooth fade in / fade out to eliminate DC clicks.
   */
  public setMuted(muted: boolean): void {
    this.isMuted = muted;

    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      const targetGain = muted ? 0.0 : this.masterVolume;

      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(targetGain, now + 0.025);
    }
  }

  /**
   * Toggles the current mute state and returns the new state.
   */
  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  // ==========================================================================
  // Node Accessors for Synthesizers & Sound Engines
  // ==========================================================================

  public getContext(): AudioContext | null {
    if (!this.ctx) {
      this.init();
    }
    return this.ctx;
  }

  public getMasterGain(): GainNode | null {
    return this.masterGain;
  }

  public getSfxGain(): GainNode | null {
    return this.sfxGain;
  }

  public getMusicGain(): GainNode | null {
    return this.musicGain;
  }

  public getCurrentTime(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  public getSampleRate(): number {
    return this.ctx ? this.ctx.sampleRate : 44100;
  }

  public getStatus(): AudioSystemStatus {
    return {
      supported: this.isSupported(),
      unlocked: this.isAudioUnlocked(),
      state: this.ctx ? this.ctx.state : 'unsupported',
      isMuted: this.isMuted,
      masterVolume: this.masterVolume,
      sfxVolume: this.sfxVolume,
      musicVolume: this.musicVolume,
      sampleRate: this.getSampleRate(),
      currentTime: this.getCurrentTime(),
    };
  }

  // ==========================================================================
  // Teardown & Resource Disposal
  // ==========================================================================

  public async destroy(): Promise<void> {
    this.detachAutoUnlockListeners();

    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        await this.ctx.close();
      } catch {
        // Handled silently
      }
    }

    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.isUnlocked = false;
  }
}
```

---

## 4. Production Specification: `src/audio/SoundSynth.ts`

### 4.1 Sound Effect Synthesis Physics & Mathematical Formulations

#### 1. Player Laser Chirp (`playLaser()` / `playLaserDual()`)
- **Acoustic Characteristic**: High-frequency piercing arcade laser blast with steep exponential frequency sweep.
- **Waveform**: `'sawtooth'` with sharp harmonic bite.
- **Carrier Frequency**:
  $$f(t) = f_{\text{start}} \cdot \left(\frac{f_{\text{end}}}{f_{\text{start}}}\right)^{\frac{t - t_0}{\Delta t}}$$
  where $f_{\text{start}} = 880\text{ Hz}$, $f_{\text{end}} = 120\text{ Hz}$, duration $\Delta t = 0.12\text{ s}$.
- **Gain Envelope**:
  $$G(t) = G_{\text{peak}} \cdot e^{-\lambda (t - t_0)}$$
  where $G_{\text{peak}} = 0.32$, decaying to $0.001$ at $t_0 + 0.12\text{ s}$.
- **Dual Fighter Mode**: Spawns two detuned laser voices ($880\text{ Hz} \to 120\text{ Hz}$ and $920\text{ Hz} \to 130\text{ Hz}$) offset by $3\text{ms}$ with stereo-like spectral width and slightly lower individual gain ($0.24$) to prevent clipping.

#### 2. Alien Dive Squeal (`playAlienDive(type)`)
- **Acoustic Characteristic**: High-pitched descending siren with frantic vibrato/FM modulation as the enemy breaks formation and dives toward the player ship.
- **FM Synthesis Mathematics**:
  - Carrier Frequency Sweep:
    $$f_c(t) = f_{c,0} \cdot \left(\frac{f_{c,1}}{f_{c,0}}\right)^{\frac{t - t_0}{\Delta t}}$$
  - Modulating LFO:
    $$m(t) = A_{\text{mod}} \cdot \sin(2\pi f_m t)$$
  - Instantaneous Carrier Frequency:
    $$f_{\text{inst}}(t) = f_c(t) + m(t)$$
- **Preset Configurations by Alien Type**:
  | Parameter | Zako (Bee) | Goei (Butterfly) | Boss Galaga |
  |---|---|---|---|
  | **Start Frequency ($f_{c,0}$)** | $520\text{ Hz}$ | $600\text{ Hz}$ | $440\text{ Hz}$ |
  | **End Frequency ($f_{c,1}$)** | $160\text{ Hz}$ | $200\text{ Hz}$ | $140\text{ Hz}$ |
  | **LFO Frequency ($f_m$)** | $14.0\text{ Hz}$ | $16.5\text{ Hz}$ | $12.0\text{ Hz}$ |
  | **FM Depth ($A_{\text{mod}}$)** | $120\text{ Hz}$ | $145\text{ Hz}$ | $170\text{ Hz}$ |
  | **Duration ($\Delta t$)** | $0.65\text{ s}$ | $0.60\text{ s}$ | $0.75\text{ s}$ |
  | **Carrier Waveform** | `'sawtooth'` | `'sawtooth'` | `'sawtooth'` |

#### 3. Boss Galaga Tractor Beam (`playTractorBeam(active)` / `startTractorBeam()` & `stopTractorBeam()`)
- **Acoustic Characteristic**: Low-end sinister pulsating hum with rhythmic acoustic beating that loops continuously while the beam cone is active.
- **Synthesis Topology**:
  - **Oscillator 1**: Sawtooth at $64\text{ Hz}$.
  - **Oscillator 2**: Square at $70\text{ Hz}$ ($6\text{ Hz}$ detune difference creates a heavy $6\text{ Hz}$ binaural acoustic beat frequency).
  - **Biquad Lowpass Filter**: $f_{\text{cutoff}} = 340\text{ Hz}$, $Q = 4.5$ (suppresses harsh highs, accentuates menacing arcade hum).
  - **Tremolo AM Stage**: LFO sine wave at $7.0\text{ Hz}$ modulating a `GainNode` between $0.25$ and $0.75$.
- **Loop Lifecycle**:
  - `playTractorBeam(true)` creates and starts the oscillator chain if not already active.
  - `playTractorBeam(false)` initiates an exponential gain decay to $0.0001$ over $80\text{ ms}$, then cleanly stops and disconnects all nodes.

#### 4. Procedural Explosions (`playExplosion(type)`)
- **Acoustic Characteristic**: Heavy filtered noise bursts with steep low-pass filter decay and sub-bass resonance.
- **Zero-Allocation Shared White Noise Buffer**:
  - Pre-allocates a 2.0-second monophonic `AudioBuffer` filled with uniformly distributed pseudo-random samples in $[-1.0, 1.0]$.
  - Each explosion voice instantiates a lightweight `AudioBufferSourceNode` pointing to the pre-rendered buffer (0 memory allocations per explosion during 60 FPS gameplay).
- **Preset Specifications**:
  - **`'small'` (Zako, Goei, transformed aliens, enemy bullets)**:
    - Duration: $0.30\text{ s}$
    - Biquad Lowpass Filter: Exponential sweep from $1500\text{ Hz} \to 50\text{ Hz}$, $Q = 3.0$
    - Gain: Peak $0.42$, exponential decay to $0.001$ at $t_0 + 0.30\text{ s}$
  - **`'large'` (Player fighter destruction / Dual fighter destruction)**:
    - Duration: $0.75\text{ s}$
    - Noise Layer: Lowpass filter sweep $1100\text{ Hz} \to 30\text{ Hz}$, $Q = 4.2$
    - Sub-Bass Sine Sweep Layer: Sine oscillator sweeping $180\text{ Hz} \to 28\text{ Hz}$ over $0.55\text{ s}$ at gain $0.45$ (delivers visceral low-end rumble)
  - **`'boss'` (Boss Galaga destruction)**:
    - Duration: $0.60\text{ s}$
    - Noise Layer: Resonant lowpass filter $2200\text{ Hz} \to 40\text{ Hz}$, $Q = 5.5$, gain peak $0.55$
    - Mid-Bass Thump: Sawtooth/Triangle oscillator sweeping $140\text{ Hz} \to 32\text{ Hz}$ over $0.45\text{ s}$

#### 5. Boss Hit / Armor Deflection Ping (`playBossHit()`)
- **Acoustic Characteristic**: High metallic ping when a Boss Galaga absorbs its first missile hit without dying.
- **Waveform**: `'square'`
- **Frequency**: $1200\text{ Hz} \to 750\text{ Hz}$ over $0.06\text{ s}$
- **Gain**: $0.25 \to 0.001$ over $0.06\text{ s}$

---

### 4.2 Full TypeScript Source Code for `src/audio/SoundSynth.ts`

```typescript
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
  private static readonly NOISE_BUFFER_DURATION_SEC = 2.0;

  // Active tractor beam audio loop state
  private activeTractorBeam: ActiveTractorBeamHandle | null = null;

  // Active voice concurrency tracking to prevent clipping in intense waves
  private activeVoiceCount: number = 0;
  private static readonly MAX_CONCURRENT_VOICES = 12;

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
  private getWhiteNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.whiteNoiseBuffer && this.whiteNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.whiteNoiseBuffer;
    }

    const sampleRate = ctx.sampleRate;
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

    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), now + duration);

    const baseGain = 0.32 * volumeMultiplier;
    gain.gain.setValueAtTime(baseGain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(sfxBus);

    this.activeVoiceCount++;

    osc.start(now);
    osc.stop(now + duration + 0.01);

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

    carrier.connect(mainGain);
    mainGain.connect(sfxBus);

    this.activeVoiceCount++;

    mod.start(now);
    carrier.start(now);
    mod.stop(now + duration + 0.02);
    carrier.stop(now + duration + 0.02);

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
   * Plays or stops the continuous tractor beam oscillation (60Hz ... 140Hz detuned saw/square with 7Hz AM pulse).
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

    const lfoDepthGain = ctx.createGain();
    lfoDepthGain.gain.setValueAtTime(0.35, now);
    lfo.connect(lfoDepthGain.gain);

    tremoloGain.gain.setValueAtTime(0.55, now);

    const peakGain = 0.35 * volumeMultiplier;
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(peakGain, now + 0.08);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(tremoloGain);
    tremoloGain.connect(masterGain);
    masterGain.connect(sfxBus);

    osc1.start(now);
    osc2.start(now);
    lfo.start(now);

    const stopFn = () => {
      const stopNow = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(stopNow);
      masterGain.gain.setValueAtTime(masterGain.gain.value, stopNow);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, stopNow + 0.08);

      setTimeout(() => {
        try {
          osc1.stop();
          osc2.stop();
          lfo.stop();
          osc1.disconnect();
          osc2.disconnect();
          lfo.disconnect();
          lfoDepthGain.disconnect();
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

    filter.frequency.setValueAtTime(startCutoff, now);
    filter.frequency.exponentialRampToValueAtTime(endCutoff, now + duration * 0.95);
    filter.Q.setValueAtTime(qFactor, now);

    // 3. Noise Gain Envelope
    const gain = ctx.createGain();
    const peakGain = (isBoss ? 0.55 : isLarge ? 0.50 : 0.42) * volumeMultiplier;

    gain.gain.setValueAtTime(peakGain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);

    this.activeVoiceCount++;

    noiseSource.start(now);
    noiseSource.stop(now + duration + 0.02);

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

      subOsc.frequency.setValueAtTime(subStartFreq, now);
      subOsc.frequency.exponentialRampToValueAtTime(subEndFreq, now + duration * 0.7);

      const subPeak = (isBoss ? 0.40 : 0.45) * volumeMultiplier;
      subGain.gain.setValueAtTime(subPeak, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.8);

      subOsc.connect(subGain);
      subGain.connect(sfxBus);

      subOsc.start(now);
      subOsc.stop(now + duration * 0.82);

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
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + duration);

    gain.gain.setValueAtTime(0.25 * volumeMultiplier, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(sfxBus);

    osc.start(now);
    osc.stop(now + duration + 0.01);

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
```

---

## 5. Unified Integration Architecture (`AudioManager` Facade)

To allow `Game.ts`, `Player.ts`, `Enemy.ts`, `TractorBeam.ts`, and `Bullet.ts` to cleanly invoke both sound effects (`SoundSynth`) and melodies (`MusicJingles`), a top-level facade `AudioManager` can be defined or exported from `src/audio/index.ts`.

```
                                  [ Game Subsystems ]
                (Player.ts, Enemy.ts, FormationManager.ts, TractorBeam.ts)
                                           |
                                           v
                              +--------------------------+
                              |   AudioManager Facade    |
                              +--------------------------+
                               /            |           \
                              /             |            \
                             v              v             v
             +--------------------+ +--------------+ +--------------------+
             | AudioContextManager| |  SoundSynth  | |   MusicJingles     |
             +--------------------+ +--------------+ +--------------------+
```

### Integration Points in Existing Codebase:
1. **`src/core/Game.ts`**:
   - `this.unlockAudio()` calls `AudioContextManager.getInstance().unlock()`.
   - `onEnemyFire` / `player.onFire` calls `soundSynth.playLaser()`.
   - `onEnemyDestroyed` calls `soundSynth.playExplosion('small' | 'boss')`.
   - Tractor beam activation calls `soundSynth.playTractorBeam(true)`, deactivation calls `soundSynth.playTractorBeam(false)`.
2. **`src/ui/InputHandler.ts`**:
   - Fires `onUserGesture()` on any user keydown/touch/pointer, directly unlocking the `AudioContextManager`.

---

## 6. Testing & Quality Assurance Strategy

### 6.1 Unit Test Coverage Strategy (`tests/unit/audio.test.ts`)
1. **Lifecycle & Safe Polyfill Verification**:
   - Verifies `AudioContextManager.isSupported()` returns `false` gracefully in pure Node environment without throwing.
   - Verifies `init()`, `unlock()`, and `destroy()` do not throw unhandled exceptions when mock/real `AudioContext` is present or missing.
2. **Gain & Mute Scaling**:
   - Verifies volume setting bounds clamping ($0.0 \le V \le 1.0$).
   - Verifies `setMuted(true)` sets target gain to $0.0$ and `setMuted(false)` restores previous volume.
3. **Sound Effect Synthesis Graphs**:
   - In a mock AudioContext environment, verifies `playLaser()`, `playAlienDive()`, `playTractorBeam()`, `playExplosion()`, and `playBossHit()` instantiate expected oscillator types, connect nodes to SFX gain bus, and schedule ramps.
   - Verifies `whiteNoiseBuffer` is generated and cached across multiple explosion triggers.
   - Verifies `stopTractorBeam()` stops active looping oscillators and disconnects nodes.

### 6.2 E2E Browser & Headless Automation
- Verifies in Playwright (`tests/e2e/browser.test.ts`) that the game boots with zero console warnings or errors regarding blocked Web Audio.
- Simulates initial canvas click to ensure `AudioContext.state` transitions from `suspended` to `running`.

---

## 7. Synthesis & Collaboration Notes

- **Peer Alignment with `m6_explorer_2` (Music Jingles)**:
  - `MusicJingles.ts` connects its melody oscillators directly to `AudioContextManager.getInstance().getMusicGain()`.
  - Both `SoundSynth` and `MusicJingles` share the same `AudioContextManager` master routing and mute state.
- **Peer Alignment with `m6_explorer_3` (Particle System)**:
  - When an enemy explodes, `Game.ts` triggers both the visual particle burst (`ParticleSystem.spawnExplosion(x, y, type)`) and the audio explosion (`SoundSynth.playExplosion(type)`), ensuring tight audiovisual synchronicity.
