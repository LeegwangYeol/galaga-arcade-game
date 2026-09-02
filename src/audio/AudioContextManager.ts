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

  // Static convenience accessors forwarding to singleton instance
  public static getContext(): AudioContext | null {
    return AudioContextManager.getInstance().getContext();
  }

  public static getMasterGain(): GainNode | null {
    return AudioContextManager.getInstance().getMasterGain();
  }

  public static getSfxGain(): GainNode | null {
    return AudioContextManager.getInstance().getSfxGain();
  }

  public static getMusicGain(): GainNode | null {
    return AudioContextManager.getInstance().getMusicGain();
  }

  public static unlock(): Promise<boolean> {
    return AudioContextManager.getInstance().unlock();
  }

  public static setMuted(muted: boolean): void {
    AudioContextManager.getInstance().setMuted(muted);
  }

  public static toggleMute(): boolean {
    return AudioContextManager.getInstance().toggleMute();
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

    const currentState = (this.ctx.state as unknown as AudioContextState);
    if (currentState === 'suspended') {
      try {
        await this.ctx.resume();
        this.isUnlocked = (this.ctx.state as unknown as string) === 'running';
      } catch {
        // Handled silently for non-interactive / test contexts
        this.isUnlocked = false;
      }
    } else if (currentState === 'running') {
      this.isUnlocked = true;
    }

    if (this.isUnlocked) {
      this.detachAutoUnlockListeners();
    }

    return this.isUnlocked;
  }

  /**
   * Attaches one-time gesture listeners to window to auto-unlock audio.
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
      try {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(this.masterVolume, now + 0.02);
      } catch {
        this.masterGain.gain.value = this.masterVolume;
      }
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
      try {
        this.sfxGain.gain.cancelScheduledValues(now);
        this.sfxGain.gain.setValueAtTime(this.sfxGain.gain.value, now);
        this.sfxGain.gain.linearRampToValueAtTime(this.sfxVolume, now + 0.02);
      } catch {
        this.sfxGain.gain.value = this.sfxVolume;
      }
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
      try {
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
        this.musicGain.gain.linearRampToValueAtTime(this.musicVolume, now + 0.02);
      } catch {
        this.musicGain.gain.value = this.musicVolume;
      }
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

      try {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(targetGain, now + 0.025);
      } catch {
        this.masterGain.gain.value = targetGain;
      }
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
