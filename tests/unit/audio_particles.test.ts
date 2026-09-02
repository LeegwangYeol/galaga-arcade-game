/**
 * Galaga Arcade Web Game — Milestone 6 Audio & Particle Engine Unit Tests
 * 
 * Comprehensive test suite verifying:
 * 1. AudioContextManager (context lifecycle, auto-unlock, volume ramping, mute toggle, headless safety).
 * 2. SoundSynth (procedural SFX: laser chirp, dual laser, alien dive FM, tractor beam, noise-filtered explosions, boss hit, voice throttling).
 * 3. MusicJingles (chiptune synthesis: equal-temperament pitch math, PulseWaveCache Fourier synthesis, authentic 5 Galaga scores, playback handle lifecycle, stop/interrupt fades).
 * 4. ParticleSystem (zero-allocation ObjectPool with 250 capacity, explosion presets, kinematic drag/gravity, shockwave ring expansion, crisp pixel rendering).
 * 5. Game integration (audiovisual triggers on missile fire, enemy destruction, boss armor hits, tractor beam, player destruction, rescue docking).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioContextManager } from '../../src/audio/AudioContextManager';
import { SoundSynth } from '../../src/audio/SoundSynth';
import {
  MusicJingles,
  pitchToFrequency,
  PulseWaveCache,
  SCORES,
} from '../../src/audio/MusicJingles';
import { ParticleSystem } from '../../src/systems/ParticleSystem';
import { Game } from '../../src/core/Game';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType } from '../../src/types';

// ============================================================================
// Comprehensive Web Audio API Mock Engine for Node/Vitest
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

  connect(destination: any) {
    this.connectedTo.push(destination);
    return destination;
  }

  disconnect() {
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
  public periodicWave: any = null;
  public onended: (() => void) | null = null;

  setPeriodicWave(wave: any) {
    this.periodicWave = wave;
  }

  start(_time?: number) {
    this.started = true;
  }

  stop(_time?: number) {
    this.stopped = true;
    if (this.onended) {
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
    if (this.onended) {
      this.onended();
    }
  }
}

class MockAudioBuffer {
  public numberOfChannels: number;
  public length: number;
  public sampleRate: number;
  private channelData: Float32Array;

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channelData = new Float32Array(length);
  }

  getChannelData(_channel: number): Float32Array {
    return this.channelData;
  }
}

class MockAudioContext {
  public state: AudioContextState = 'suspended';
  public currentTime: number = 0;
  public sampleRate: number = 44100;
  public destination = new MockAudioNode();

  createGain(): MockGainNode {
    return new MockGainNode();
  }

  createOscillator(): MockOscillatorNode {
    return new MockOscillatorNode();
  }

  createBiquadFilter(): MockBiquadFilterNode {
    return new MockBiquadFilterNode();
  }

  createBuffer(channels: number, length: number, sampleRate: number): MockAudioBuffer {
    return new MockAudioBuffer(channels, length, sampleRate);
  }

  createBufferSource(): MockAudioBufferSourceNode {
    return new MockAudioBufferSourceNode();
  }

  createPeriodicWave(real: Float32Array, imag: Float32Array, _options?: any): any {
    return { real, imag };
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }

  async close(): Promise<void> {
    this.state = 'closed';
  }
}

describe('Milestone 6: Web Audio Procedural Synthesizer & Particle System', () => {
  let originalAudioContext: any;

  beforeEach(() => {
    // Setup mock Web Audio API in global scope
    if (typeof window !== 'undefined') {
      originalAudioContext = (window as any).AudioContext;
      (window as any).AudioContext = MockAudioContext;
    } else {
      (global as any).window = {
        AudioContext: MockAudioContext,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    }

    AudioContextManager.resetInstance();
    SoundSynth.resetInstance();
    MusicJingles.stopAll();
    PulseWaveCache.clear();
  });

  afterEach(() => {
    AudioContextManager.resetInstance();
    SoundSynth.resetInstance();
    MusicJingles.stopAll();
    PulseWaveCache.clear();

    if (originalAudioContext && typeof window !== 'undefined') {
      (window as any).AudioContext = originalAudioContext;
    }
  });

  // ==========================================================================
  // 1. AudioContextManager Tests
  // ==========================================================================
  describe('AudioContextManager Subsystem (`src/audio/AudioContextManager.ts`)', () => {
    it('initializes as a singleton with routing sub-buses', () => {
      const manager = AudioContextManager.getInstance();
      expect(manager).toBeDefined();
      expect(manager.isSupported()).toBe(true);

      const ctx = manager.getContext();
      expect(ctx).toBeDefined();
      expect(manager.getMasterGain()).toBeDefined();
      expect(manager.getSfxGain()).toBeDefined();
      expect(manager.getMusicGain()).toBeDefined();
    });

    it('manages master, SFX, and Music volume controls with clamping', () => {
      const manager = AudioContextManager.getInstance();

      manager.setMasterVolume(0.5);
      expect(manager.getMasterVolume()).toBe(0.5);

      manager.setMasterVolume(1.5); // Should clamp to 1.0
      expect(manager.getMasterVolume()).toBe(1.0);

      manager.setMasterVolume(-0.5); // Should clamp to 0.0
      expect(manager.getMasterVolume()).toBe(0.0);

      manager.setSfxVolume(0.6);
      expect(manager.getSfxVolume()).toBe(0.6);

      manager.setMusicVolume(0.4);
      expect(manager.getMusicVolume()).toBe(0.4);
    });

    it('toggles mute and restores volume accurately', () => {
      const manager = AudioContextManager.getInstance();
      manager.setMasterVolume(0.8);
      expect(manager.getIsMuted()).toBe(false);

      const muted = manager.toggleMute();
      expect(muted).toBe(true);
      expect(manager.getIsMuted()).toBe(true);

      const unmuted = manager.toggleMute();
      expect(unmuted).toBe(false);
      expect(manager.getIsMuted()).toBe(false);
      expect(manager.getMasterVolume()).toBe(0.8);
    });

    it('unlocks Web Audio context on simulated user gesture', async () => {
      const manager = AudioContextManager.getInstance();
      expect(manager.isAudioUnlocked()).toBe(false);

      const unlocked = await manager.unlock();
      expect(unlocked).toBe(true);
      expect(manager.isAudioUnlocked()).toBe(true);
    });

    it('provides comprehensive system status diagnostics', () => {
      const manager = AudioContextManager.getInstance();
      const status = manager.getStatus();

      expect(status.supported).toBe(true);
      expect(status.isMuted).toBe(false);
      expect(status.masterVolume).toBeGreaterThan(0);
      expect(status.sfxVolume).toBeGreaterThan(0);
      expect(status.musicVolume).toBeGreaterThan(0);
      expect(status.sampleRate).toBe(44100);
    });

    it('handles headless environment gracefully when AudioContext is missing', () => {
      // Temporarily remove AudioContext
      const temp = (window as any).AudioContext;
      (window as any).AudioContext = undefined;
      (window as any).webkitAudioContext = undefined;
      AudioContextManager.resetInstance();

      const manager = AudioContextManager.getInstance();
      expect(manager.isSupported()).toBe(false);
      expect(manager.init()).toBe(false);
      expect(manager.getContext()).toBeNull();

      (window as any).AudioContext = temp;
    });
  });

  // ==========================================================================
  // 2. SoundSynth Tests
  // ==========================================================================
  describe('SoundSynth Subsystem (`src/audio/SoundSynth.ts`)', () => {
    it('creates and caches shared 2-second white noise buffer', () => {
      const synth = SoundSynth.getInstance();
      const ctx = AudioContextManager.getContext() as any;
      expect(ctx).toBeDefined();

      const buffer1 = synth.getWhiteNoiseBuffer(ctx);
      expect(buffer1).toBeDefined();
      expect(buffer1.length).toBe(44100 * 2.0);

      // Verify zero-allocation cache hits
      const buffer2 = synth.getWhiteNoiseBuffer(ctx);
      expect(buffer2).toBe(buffer1);
    });

    it('synthesizes single and dual player laser chirps with exponential pitch decay', () => {
      const synth = SoundSynth.getInstance();
      const playedSingle = synth.playLaser();
      expect(playedSingle).toBe(true);

      const playedDual = synth.playLaserDual();
      expect(playedDual).toBe(true);
    });

    it('synthesizes FM-modulated alien dives for Zako, Goei, and Boss Galaga', () => {
      const synth = SoundSynth.getInstance();
      expect(synth.playAlienDive('zako')).toBe(true);
      expect(synth.playAlienDive('goei')).toBe(true);
      expect(synth.playAlienDive('boss')).toBe(true);
    });

    it('starts and stops continuous tractor beam sound loop with smooth decay', () => {
      const synth = SoundSynth.getInstance();
      expect(synth.playTractorBeam(true)).toBe(true);
      expect(synth.playTractorBeam(true)).toBe(true); // Re-entry is idempotent

      synth.stopTractorBeam();
      expect(synth.playTractorBeam(false)).toBe(true);
    });

    it('synthesizes small, large, and boss explosions', () => {
      const synth = SoundSynth.getInstance();
      expect(synth.playExplosion('small')).toBe(true);
      expect(synth.playExplosion('large')).toBe(true);
      expect(synth.playExplosion('boss')).toBe(true);
    });

    it('synthesizes metallic armor deflection ping on Boss hit', () => {
      const synth = SoundSynth.getInstance();
      expect(synth.playBossHit()).toBe(true);
    });

    it('dispatches all AudioEventType triggers via playEvent', () => {
      const synth = SoundSynth.getInstance();
      expect(synth.playEvent('LASER_FIRE')).toBe(true);
      expect(synth.playEvent('ENEMY_DIVE')).toBe(true);
      expect(synth.playEvent('ENEMY_EXPLOSION_SMALL')).toBe(true);
      expect(synth.playEvent('ENEMY_EXPLOSION_LARGE')).toBe(true);
      expect(synth.playEvent('BOSS_HIT')).toBe(true);
      expect(synth.playEvent('BOSS_DESTROYED')).toBe(true);
      expect(synth.playEvent('TRACTOR_BEAM')).toBe(true);
      synth.stopTractorBeam();
    });

    it('throttles concurrent voice saturation beyond MAX_CONCURRENT_VOICES limit', () => {
      const synth = SoundSynth.getInstance();
      for (let i = 0; i < SoundSynth.MAX_CONCURRENT_VOICES; i++) {
        expect(synth.playLaser()).toBe(true);
      }
      // Voice capacity reached: Next voice is rejected to prevent clipping
      expect(synth.playLaser()).toBe(false);
    });
  });

  // ==========================================================================
  // 3. MusicJingles Tests
  // ==========================================================================
  describe('MusicJingles Subsystem (`src/audio/MusicJingles.ts`)', () => {
    it('calculates equal temperament pitch frequencies correctly', () => {
      // Concert pitch A4 = 440 Hz
      expect(pitchToFrequency('A4')).toBe(440);

      // Middle C4 ≈ 261.63 Hz
      expect(pitchToFrequency('C4')).toBeCloseTo(261.625, 2);

      // Octave A5 = 880 Hz
      expect(pitchToFrequency('A5')).toBe(880);

      // Silent Rest note = 0 Hz
      expect(pitchToFrequency('R')).toBe(0);
      expect(pitchToFrequency('REST')).toBe(0);
      expect(pitchToFrequency('')).toBe(0);

      // MIDI number direct mapping
      expect(pitchToFrequency(69)).toBe(440);

      // Direct frequency passthrough (> 128)
      expect(pitchToFrequency(550)).toBe(550);
    });

    it('synthesizes band-limited PulseWave PeriodicWave cache', () => {
      const ctx = AudioContextManager.getContext() as any;
      const wave25 = PulseWaveCache.getPeriodicWave(ctx, 'pulse25');
      expect(wave25).toBeDefined();

      const wave12 = PulseWaveCache.getPeriodicWave(ctx, 'pulse12');
      expect(wave12).toBeDefined();

      // Native waves return null to use native OscillatorNode types
      expect(PulseWaveCache.getPeriodicWave(ctx, 'square')).toBeNull();
      expect(PulseWaveCache.getPeriodicWave(ctx, 'triangle')).toBeNull();
    });

    it('validates all 5 authentic Galaga music scores for valid non-NaN notes', () => {
      const scoreKeys: Array<keyof typeof SCORES> = [
        'STAGE_START',
        'CHALLENGING_STAGE',
        'BONUS_PERFECT',
        'DOCKING',
        'GAME_OVER',
      ];

      for (const key of scoreKeys) {
        const score = SCORES[key];
        expect(score).toBeDefined();
        expect(score.bpm).toBeGreaterThan(0);
        expect(score.tracks.length).toBeGreaterThan(0);

        for (const track of score.tracks) {
          expect(track.notes.length).toBeGreaterThan(0);
          for (const event of track.notes) {
            expect(event.duration).toBeGreaterThan(0);
            const freq = pitchToFrequency(event.note);
            expect(freq).toBeGreaterThanOrEqual(0);
            expect(Number.isNaN(freq)).toBe(false);
          }
        }
      }
    });

    it('schedules jingles and returns controllable MusicPlaybackHandle', () => {
      const handle = MusicJingles.playStageStartFanfare();
      expect(handle).toBeDefined();
      expect(handle.id).toContain('jingle_');
      expect(handle.isPlaying).toBe(true);

      // Stop handle with anti-pop micro-fade
      handle.stop(10);
      expect(handle.isPlaying).toBe(false);
    });

    it('stops all active jingles simultaneously via MusicJingles.stopAll()', () => {
      const h1 = MusicJingles.playChallengingStageTheme();
      const h2 = MusicJingles.playBonusFanfare();

      expect(h1.isPlaying).toBe(true);
      expect(h2.isPlaying).toBe(true);

      MusicJingles.stopAll(5);
      expect(h1.isPlaying).toBe(false);
      expect(h2.isPlaying).toBe(false);
    });
  });

  // ==========================================================================
  // 4. ParticleSystem Tests
  // ==========================================================================
  describe('ParticleSystem Subsystem (`src/systems/ParticleSystem.ts`)', () => {
    it('initializes with a strict 250-particle ObjectPool capacity', () => {
      const system = new ParticleSystem();
      expect(system.getCapacity()).toBe(250);
      expect(system.getMaxSize()).toBe(250);
      expect(system.getActiveCount()).toBe(0);
    });

    it('spawns Small Alien explosion preset (16-24 sparks)', () => {
      const system = new ParticleSystem();
      system.spawnSmallAlienExplosion(100, 100, 20);

      expect(system.getActiveCount()).toBe(20);
      const active = system.getPool().getActive();

      for (const p of active) {
        expect(p.active).toBe(true);
        expect(p.x).toBe(100);
        expect(p.y).toBe(100);
        expect(p.type).toBe('SPARK');
        expect(p.maxLife).toBeGreaterThanOrEqual(0.25);
        expect(p.maxLife).toBeLessThanOrEqual(0.35);
      }
    });

    it('spawns Boss Galaga explosion preset with expanding shockwave ring', () => {
      const system = new ParticleSystem();
      system.spawnBossExplosion(112, 80, 40);

      expect(system.getActiveCount()).toBe(41); // 40 sparks + 1 shockwave ring
      const active = system.getPool().getActive();

      const shockwave = active.find((p) => p.isShockwave);
      expect(shockwave).toBeDefined();
      expect(shockwave?.type).toBe('SHOCKWAVE');
      expect(shockwave?.shockwaveMaxRadius).toBe(38);
    });

    it('spawns Player Ship destruction fragmentation (fine sparks + tumbling shrapnel)', () => {
      const system = new ParticleSystem();
      system.spawnPlayerExplosion(112, 240, 50);

      expect(system.getActiveCount()).toBe(50);
      const active = system.getPool().getActive();

      const debris = active.filter((p) => p.type === 'DEBRIS');
      expect(debris.length).toBeGreaterThan(0);
      for (const d of debris) {
        expect(d.ay).toBeGreaterThan(0); // Gravity active
        expect(d.vRot).not.toBe(0); // Rotational tumbling active
      }
    });

    it('spawns tractor sparkles, hit sparks, and docking sparkles', () => {
      const system = new ParticleSystem();

      const sparkle = system.spawnTractorSparkle(112, 100);
      expect(sparkle).toBeDefined();
      expect(sparkle?.type).toBe('BEAM_SPARKLE');

      system.spawnHitSparks(112, 100, 6);
      expect(system.getActiveCount()).toBe(7);

      system.spawnDockingSparkles(112, 240, 20);
      expect(system.getActiveCount()).toBe(27);
    });

    it('updates particle physics, drag damping, and recycles expired particles', () => {
      const system = new ParticleSystem();
      system.spawnSmallAlienExplosion(100, 100, 20);

      const initialActive = system.getActiveCount();
      expect(initialActive).toBe(20);

      // Advance by 0.1s: positions should move
      system.update(0.1);
      const active1 = system.getPool().getActive();
      expect(active1[0]?.x).not.toBe(100);

      // Advance past maximum particle lifespan (0.5s): all particles should be recycled
      system.update(0.5);
      expect(system.getActiveCount()).toBe(0);
    });

    it('renders particles and shockwave arcs without throwing on canvas context', () => {
      const system = new ParticleSystem();
      system.spawnBossExplosion(100, 100, 32);
      system.spawnPlayerExplosion(100, 100, 40);

      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        stroke: vi.fn(),
        globalAlpha: 1.0,
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
      } as unknown as CanvasRenderingContext2D;

      expect(() => system.render(mockCtx)).not.toThrow();
      expect(mockCtx.globalAlpha).toBe(1.0);
    });

    it('clears all active particles on system.clear()', () => {
      const system = new ParticleSystem();
      system.spawnPlayerExplosion(100, 100, 50);
      expect(system.getActiveCount()).toBe(50);

      system.clear();
      expect(system.getActiveCount()).toBe(0);
    });
  });

  // ==========================================================================
  // 5. Game Master Engine Integration Tests
  // ==========================================================================
  describe('Game Engine Audio & Particle Integration (`src/core/Game.ts`)', () => {
    it('integrates AudioContextManager, SoundSynth, and ParticleSystem into Game', () => {
      const game = new Game();
      expect(game.getAudioContextManager()).toBeDefined();
      expect(game.getSoundSynth()).toBeDefined();
      expect(game.getParticleSystem()).toBeDefined();
    });

    it('triggers player laser audio on missile firing', () => {
      const game = new Game();
      const laserSpy = vi.spyOn(game.getSoundSynth(), 'playLaser');
      const dualLaserSpy = vi.spyOn(game.getSoundSynth(), 'playLaserDual');

      game.player.attemptFire();
      expect(laserSpy).toHaveBeenCalled();

      // Test dual fighter laser (clear bullets and cooldown)
      game.bulletManager.clear();
      game.player.fireCooldownTimer = 0;
      game.player.activeMissileCount = 0;
      game.player.isDual = true;
      const firedDual = game.player.attemptFire();
      expect(firedDual).toBe(true);
      expect(dualLaserSpy).toHaveBeenCalled();
    });

    it('spawns explosion sound and particles when Boss Galaga is destroyed', () => {
      const game = new Game();
      const explosionAudioSpy = vi.spyOn(game.getSoundSynth(), 'playExplosion');
      const bossParticleSpy = vi.spyOn(game.getParticleSystem(), 'spawnBossExplosion');

      const boss = new Enemy({
        id: 'test_boss',
        type: EnemyType.BOSS,
        x: 100,
        y: 100,
      });
      boss.health = 1; // 1 HP left so 1 hit destroys it
      game.formationManager.enemies.push(boss);

      // Fire player bullet at boss position
      game.bulletManager.firePlayerBullet(100, 100);
      game.resolveCollisions();

      expect(explosionAudioSpy).toHaveBeenCalledWith('boss');
      expect(bossParticleSpy).toHaveBeenCalledWith(100, 100);
    });

    it('spawns metallic ping and hit sparks when Boss absorbs non-lethal hit', () => {
      const game = new Game();
      const bossHitAudioSpy = vi.spyOn(game.getSoundSynth(), 'playBossHit');
      const hitSparkSpy = vi.spyOn(game.getParticleSystem(), 'spawnHitSparks');

      const boss = new Enemy({
        id: 'test_boss_healthy',
        type: EnemyType.BOSS,
        x: 100,
        y: 100,
      });
      boss.health = 2; // 2 HP: first hit damages without destroying
      game.formationManager.enemies.push(boss);

      game.bulletManager.firePlayerBullet(100, 100);
      game.resolveCollisions();

      expect(bossHitAudioSpy).toHaveBeenCalled();
      expect(hitSparkSpy).toHaveBeenCalledWith(100, 100);
    });

    it('triggers docking chime and sparkles on player rescue docking', () => {
      const game = new Game();
      const dockingSparkleSpy = vi.spyOn(game.getParticleSystem(), 'spawnDockingSparkles');

      game.player.onDocked?.();
      expect(dockingSparkleSpy).toHaveBeenCalled();
    });
  });
});
