/**
 * Galaga Arcade Web Game — Procedural Chiptune Melodies & Fanfares Engine
 * 100% Code-Synthesized Web Audio API Implementation (0 Audio Files).
 * Features:
 * - 2-Channel Polyphonic Chiptune Synthesis (Lead + Bass/Counterpoint)
 * - Authentic 1981 Namco WSG Emulation via 12.5%, 25%, and 50% PeriodicWave pulse synthesis
 * - Exact equal-temperament pitch conversion: f = 440 * 2^((n - 69) / 12)
 * - ADSR Envelope shaping with anti-click zero-crossing dynamics
 * - Stop/interrupt cancellation handles and headless test resilience
 */

import { AudioContextManager } from './AudioContextManager';

// ============================================================================
// 1. Types & Interfaces
// ============================================================================

export type NotePitch = number | string;

export interface NoteEvent {
  /** Note pitch: MIDI number (e.g. 60), frequency in Hz, or note name ('C4', 'G#5', 'R' for rest) */
  note: NotePitch;
  /** Duration in sixteenth-note units (1 = 16th, 2 = 8th, 4 = quarter, 16 = whole) */
  duration: number;
  /** Optional velocity scale [0.0 - 1.0] (default: 1.0) */
  volume?: number;
  /** Optional staccato gate ratio [0.1 - 1.0] (default: 0.82) */
  gate?: number;
}

export type WaveformType = 'pulse25' | 'pulse12' | 'square' | 'triangle' | 'sawtooth';

export interface VoiceTrack {
  waveform: WaveformType;
  baseVolume: number;
  notes: NoteEvent[];
}

export interface JingleScore {
  name: string;
  bpm: number;
  tracks: VoiceTrack[];
}

export interface MusicPlaybackHandle {
  readonly id: string;
  readonly isPlaying: boolean;
  stop(fadeDurationMs?: number): void;
  readonly finished: Promise<void>;
}

// ============================================================================
// 2. Math & Pitch Utility Helpers
// ============================================================================

const NOTE_NAME_OFFSETS: Record<string, number> = {
  'C': 0, 'C#': 1, 'DB': 1, 'D': 2, 'D#': 3, 'EB': 3,
  'E': 4, 'F': 5, 'F#': 6, 'GB': 6, 'G': 7, 'G#': 8,
  'AB': 8, 'A': 9, 'A#': 10, 'BB': 10, 'B': 11,
};

/**
 * Converts note name string ('C4', 'G#5', 'R') or MIDI number to frequency in Hz.
 * Mathematical formula: f = 440 * 2^((n - 69) / 12)
 */
export function pitchToFrequency(pitch: NotePitch): number {
  if (typeof pitch === 'number') {
    if (pitch <= 0) return 0;
    // If number is already a direct Hz frequency (> 128)
    if (pitch > 128) return pitch;
    return 440 * Math.pow(2, (pitch - 69) / 12);
  }

  const str = pitch.trim().toUpperCase();
  if (str === 'R' || str === 'REST' || str === '-' || str === '') {
    return 0;
  }

  const match = str.match(/^([A-G][#B]?)(-?\d+)$/);
  if (!match || !match[1] || !match[2]) return 0;

  const noteName = match[1];
  const octave = parseInt(match[2], 10);
  const offset = NOTE_NAME_OFFSETS[noteName];
  if (offset === undefined) return 0;

  const midi = (octave + 1) * 12 + offset;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ============================================================================
// 3. PeriodicWave Pulse Wave Synthesizer
// ============================================================================

export class PulseWaveCache {
  private static cache: Map<string, PeriodicWave> = new Map();

  public static getPeriodicWave(ctx: AudioContext, type: WaveformType): PeriodicWave | null {
    if (type === 'square' || type === 'triangle' || type === 'sawtooth') {
      return null; // Uses standard native oscillator types
    }

    const duty = type === 'pulse25' ? 0.25 : 0.125;
    const key = `pulse_${duty.toFixed(3)}`;

    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    try {
      const harmonics = 64;
      const real = new Float32Array(harmonics);
      const imag = new Float32Array(harmonics);

      for (let k = 1; k < harmonics; k++) {
        const angle = 2 * Math.PI * k * duty;
        real[k] = (2 / (k * Math.PI)) * Math.sin(angle);
        imag[k] = (2 / (k * Math.PI)) * (1 - Math.cos(angle));
      }

      const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
      this.cache.set(key, wave);
      return wave;
    } catch {
      return null;
    }
  }

  public static clear(): void {
    this.cache.clear();
  }
}

// ============================================================================
// 4. Authentic Galaga Jingle Scores
// ============================================================================

export const SCORES: Record<
  'STAGE_START' | 'CHALLENGING_STAGE' | 'BONUS_PERFECT' | 'DOCKING' | 'GAME_OVER',
  JingleScore
> = {
  STAGE_START: {
    name: 'Stage Start Fanfare',
    bpm: 150,
    tracks: [
      {
        waveform: 'pulse25',
        baseVolume: 0.32,
        notes: [
          { note: 'C5', duration: 1 },
          { note: 'G4', duration: 1 },
          { note: 'E4', duration: 1 },
          { note: 'C4', duration: 1 },
          { note: 'G3', duration: 1 },
          { note: 'C4', duration: 1 },
          { note: 'E4', duration: 1 },
          { note: 'G4', duration: 1 },
          { note: 'C5', duration: 2 },
          { note: 'E5', duration: 1 },
          { note: 'G5', duration: 3 },
          { note: 'R',  duration: 1 },
          { note: 'G5', duration: 1.5 },
          { note: 'G5', duration: 1.5 },
          { note: 'E5', duration: 1 },
          { note: 'C5', duration: 1.5 },
          { note: 'D5', duration: 1 },
          { note: 'E5', duration: 1.5 },
          { note: 'F5', duration: 1 },
          { note: 'E5', duration: 1 },
          { note: 'D5', duration: 1.5 },
          { note: 'C5', duration: 2.5 },
          { note: 'A4', duration: 1 },
          { note: 'C5', duration: 1 },
          { note: 'E5', duration: 1 },
          { note: 'G5', duration: 2 },
          { note: 'F5', duration: 1 },
          { note: 'E5', duration: 1 },
          { note: 'D5', duration: 1 },
          { note: 'E5', duration: 1 },
          { note: 'D5', duration: 1 },
          { note: 'C5', duration: 4 },
          { note: 'G5', duration: 2 },
          { note: 'C6', duration: 6, gate: 0.95 },
        ],
      },
      {
        waveform: 'square',
        baseVolume: 0.22,
        notes: [
          { note: 'C3', duration: 2 },
          { note: 'G3', duration: 2 },
          { note: 'E3', duration: 2 },
          { note: 'G3', duration: 2 },
          { note: 'C4', duration: 2 },
          { note: 'C3', duration: 1 },
          { note: 'G3', duration: 3 },
          { note: 'R',  duration: 1 },
          { note: 'E3', duration: 1.5 },
          { note: 'E3', duration: 1.5 },
          { note: 'C3', duration: 1 },
          { note: 'F3', duration: 1.5 },
          { note: 'G3', duration: 1 },
          { note: 'C3', duration: 1.5 },
          { note: 'D3', duration: 1 },
          { note: 'C3', duration: 1 },
          { note: 'G2', duration: 1.5 },
          { note: 'C3', duration: 2.5 },
          { note: 'F3', duration: 1 },
          { note: 'A3', duration: 1 },
          { note: 'C4', duration: 1 },
          { note: 'G3', duration: 2 },
          { note: 'D3', duration: 1 },
          { note: 'C3', duration: 1 },
          { note: 'G2', duration: 1 },
          { note: 'C3', duration: 1 },
          { note: 'G2', duration: 1 },
          { note: 'C3', duration: 4 },
          { note: 'G3', duration: 2 },
          { note: 'C4', duration: 6, gate: 0.95 },
        ],
      },
    ],
  },

  CHALLENGING_STAGE: {
    name: 'Challenging Stage Intro',
    bpm: 160,
    tracks: [
      {
        waveform: 'pulse25',
        baseVolume: 0.30,
        notes: [
          { note: 'D5', duration: 1 },
          { note: 'F#5', duration: 1 },
          { note: 'A5', duration: 1 },
          { note: 'D6', duration: 1 },
          { note: 'A5', duration: 1 },
          { note: 'F#5', duration: 1 },
          { note: 'E5', duration: 1 },
          { note: 'G5', duration: 1 },
          { note: 'B5', duration: 1 },
          { note: 'E6', duration: 1 },
          { note: 'B5', duration: 1 },
          { note: 'G5', duration: 1 },
          { note: 'F#5', duration: 1 },
          { note: 'A5', duration: 1 },
          { note: 'C#6', duration: 1 },
          { note: 'F#6', duration: 1 },
          { note: 'C#6', duration: 1 },
          { note: 'A5', duration: 1 },
          { note: 'G5', duration: 1 },
          { note: 'B5', duration: 1 },
          { note: 'D6', duration: 1 },
          { note: 'G6', duration: 1 },
          { note: 'D6', duration: 1 },
          { note: 'B5', duration: 1 },
          { note: 'A5', duration: 1 },
          { note: 'C#6', duration: 1 },
          { note: 'E6', duration: 1 },
          { note: 'G6', duration: 1 },
          { note: 'E6', duration: 1 },
          { note: 'C#6', duration: 1 },
          { note: 'D6', duration: 2 },
          { note: 'D6', duration: 1 },
          { note: 'A5', duration: 1 },
          { note: 'F#5', duration: 2 },
          { note: 'D5', duration: 6, gate: 0.95 },
        ],
      },
      {
        waveform: 'square',
        baseVolume: 0.22,
        notes: [
          { note: 'D3', duration: 2 }, { note: 'A3', duration: 2 }, { note: 'D3', duration: 2 },
          { note: 'E3', duration: 2 }, { note: 'B3', duration: 2 }, { note: 'E3', duration: 2 },
          { note: 'F#3', duration: 2 }, { note: 'C#4', duration: 2 }, { note: 'F#3', duration: 2 },
          { note: 'G3', duration: 2 }, { note: 'D4', duration: 2 }, { note: 'G3', duration: 2 },
          { note: 'A3', duration: 2 }, { note: 'E4', duration: 2 }, { note: 'A3', duration: 2 },
          { note: 'D3', duration: 2 }, { note: 'A3', duration: 2 }, { note: 'D4', duration: 8, gate: 0.95 },
        ],
      },
    ],
  },

  BONUS_PERFECT: {
    name: 'Perfect Score Bonus Fanfare',
    bpm: 175,
    tracks: [
      {
        waveform: 'pulse25',
        baseVolume: 0.32,
        notes: [
          { note: 'G5', duration: 1 },
          { note: 'B5', duration: 1 },
          { note: 'D6', duration: 1 },
          { note: 'G6', duration: 1 },
          { note: 'G6', duration: 1.5 },
          { note: 'F#6', duration: 1 },
          { note: 'G6', duration: 1.5 },
          { note: 'E6', duration: 1 },
          { note: 'G6', duration: 1 },
          { note: 'D6', duration: 3 },
          { note: 'B5', duration: 1 },
          { note: 'C6', duration: 1 },
          { note: 'D6', duration: 1 },
          { note: 'E6', duration: 1 },
          { note: 'F#6', duration: 1 },
          { note: 'G6', duration: 4 },
          { note: 'D6', duration: 2 },
          { note: 'G6', duration: 2 },
          { note: 'B6', duration: 6, gate: 0.95 },
        ],
      },
      {
        waveform: 'square',
        baseVolume: 0.22,
        notes: [
          { note: 'G3', duration: 2 },
          { note: 'B3', duration: 2 },
          { note: 'D4', duration: 2 },
          { note: 'G4', duration: 2 },
          { note: 'C4', duration: 2 },
          { note: 'E4', duration: 2 },
          { note: 'G4', duration: 2 },
          { note: 'D4', duration: 2 },
          { note: 'F#4', duration: 2 },
          { note: 'A4', duration: 2 },
          { note: 'G3', duration: 2 },
          { note: 'D4', duration: 2 },
          { note: 'G4', duration: 8, gate: 0.95 },
        ],
      },
    ],
  },

  DOCKING: {
    name: 'Dual Fighter Rescue Docking Chime',
    bpm: 150,
    tracks: [
      {
        waveform: 'triangle',
        baseVolume: 0.35,
        notes: [
          { note: 'E5', duration: 1 },
          { note: 'G#5', duration: 1 },
          { note: 'B5', duration: 1 },
          { note: 'E6', duration: 1.5 },
          { note: 'G#6', duration: 1.5 },
          { note: 'B6', duration: 4, gate: 0.95 },
        ],
      },
      {
        waveform: 'pulse25',
        baseVolume: 0.25,
        notes: [
          { note: 'R', duration: 3 },
          { note: 'E5', duration: 1.5 },
          { note: 'B5', duration: 1.5 },
          { note: 'E6', duration: 4, gate: 0.95 },
        ],
      },
    ],
  },

  GAME_OVER: {
    name: 'Game Over Tune',
    bpm: 95,
    tracks: [
      {
        waveform: 'square',
        baseVolume: 0.28,
        notes: [
          { note: 'F#4', duration: 1.5 },
          { note: 'F4', duration: 1.5 },
          { note: 'E4', duration: 1.5 },
          { note: 'Eb4', duration: 1.5 },
          { note: 'D4', duration: 2.5 },
          { note: 'C#4', duration: 1.5 },
          { note: 'C4', duration: 1.5 },
          { note: 'B3', duration: 2.5 },
          { note: 'Bb3', duration: 2 },
          { note: 'A3', duration: 2.5 },
          { note: 'D3', duration: 6, gate: 0.95 },
        ],
      },
      {
        waveform: 'square',
        baseVolume: 0.25,
        notes: [
          { note: 'D3', duration: 3 },
          { note: 'C#3', duration: 3 },
          { note: 'C3', duration: 3 },
          { note: 'B2', duration: 3 },
          { note: 'Bb2', duration: 3 },
          { note: 'A2', duration: 3 },
          { note: 'D2', duration: 8, gate: 0.95 },
        ],
      },
    ],
  },
};

// ============================================================================
// 5. MusicJingles Orchestrator Engine
// ============================================================================

export class MusicJingles {
  private static activeHandles: Map<string, MusicPlaybackHandle> = new Map();
  private static handleCounter = 0;

  /**
   * Plays the classic 1981 Galaga Stage Intro Fanfare.
   */
  public static playStageStartFanfare(): MusicPlaybackHandle {
    return this.playScore(SCORES.STAGE_START);
  }

  /**
   * Plays the Challenging Stage introductory theme.
   */
  public static playChallengingStageTheme(): MusicPlaybackHandle {
    return this.playScore(SCORES.CHALLENGING_STAGE);
  }

  /**
   * Plays the 40/40 Perfect Score Bonus Fanfare (Special 10,000 Pts).
   */
  public static playBonusFanfare(): MusicPlaybackHandle {
    return this.playScore(SCORES.BONUS_PERFECT);
  }

  /**
   * Plays the Dual Fighter rescue docking arpeggio chime.
   */
  public static playDockingJingle(): MusicPlaybackHandle {
    return this.playScore(SCORES.DOCKING);
  }

  /**
   * Plays the Game Over descending cadence tune.
   */
  public static playGameOverTune(): MusicPlaybackHandle {
    return this.playScore(SCORES.GAME_OVER);
  }

  /**
   * Immediately stops all currently playing music jingles with a smooth anti-click fade.
   */
  public static stopAll(fadeDurationMs: number = 15): void {
    const handles = Array.from(this.activeHandles.values());
    for (const handle of handles) {
      handle.stop(fadeDurationMs);
    }
    this.activeHandles.clear();
  }

  /**
   * Internal procedural scheduling engine.
   */
  public static playScore(score: JingleScore): MusicPlaybackHandle {
    const ctx = AudioContextManager.getContext();
    const handleId = `jingle_${++this.handleCounter}_${score.name.replace(/\s+/g, '_')}`;

    // Headless / AudioContext unavailable fallback
    if (!ctx) {
      return {
        id: handleId,
        isPlaying: false,
        stop: () => {},
        finished: Promise.resolve(),
      };
    }

    const musicGain = AudioContextManager.getMusicGain();
    let jingleGain: GainNode | null = null;
    try {
      jingleGain = ctx.createGain();
      jingleGain.gain.setValueAtTime(1.0, ctx.currentTime);
      jingleGain.connect(musicGain || ctx.destination);
    } catch {
      // Ignore
    }

    let isPlaying = true;
    const activeOscillators: OscillatorNode[] = [];
    const activeGainNodes: GainNode[] = [];
    const activeTimerIds: number[] = [];

    let resolveFinished: () => void;
    const finishedPromise = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });

    const sixteenthDuration = 60 / (score.bpm * 4);
    const startTime = ctx.currentTime + 0.03; // 30ms lookahead safety buffer

    let maxEndTime = startTime;

    // Schedule all polyphonic tracks
    for (const track of score.tracks) {
      let trackTime = startTime;
      const periodicWave = PulseWaveCache.getPeriodicWave(ctx, track.waveform);

      for (const event of track.notes) {
        const noteDuration = event.duration * sixteenthDuration;
        const gateRatio = Math.max(0.1, Math.min(1.0, event.gate ?? 0.82));
        const gateDuration = noteDuration * gateRatio;
        const freq = pitchToFrequency(event.note);

        if (freq > 0) {
          try {
            const osc = ctx.createOscillator();
            const noteGain = ctx.createGain();

            if (periodicWave) {
              osc.setPeriodicWave(periodicWave);
            } else {
              osc.type = track.waveform === 'triangle' || track.waveform === 'sawtooth' ? track.waveform : 'square';
            }

            osc.frequency.setValueAtTime(freq, trackTime);

            const targetVol = track.baseVolume * (event.volume ?? 1.0);
            const attackTime = 0.004;
            const decayTime = 0.020;
            const sustainVol = targetVol * 0.75;
            const releaseTime = 0.015;

            // ADSR Envelope
            noteGain.gain.setValueAtTime(0.0001, trackTime);
            noteGain.gain.linearRampToValueAtTime(targetVol, trackTime + attackTime);
            noteGain.gain.linearRampToValueAtTime(sustainVol, trackTime + attackTime + decayTime);

            const noteReleaseStart = trackTime + gateDuration;
            noteGain.gain.setValueAtTime(sustainVol, noteReleaseStart);
            noteGain.gain.exponentialRampToValueAtTime(0.0001, noteReleaseStart + releaseTime);

            osc.connect(noteGain);
            if (jingleGain) {
              noteGain.connect(jingleGain);
            }

            const noteEndTime = noteReleaseStart + releaseTime + 0.005;
            osc.start(trackTime);
            osc.stop(noteEndTime);

            osc.onended = () => {
              try {
                osc.disconnect();
                noteGain.disconnect();
              } catch { /* ignored */ }
            };

            activeOscillators.push(osc);
            activeGainNodes.push(noteGain);
          } catch {
            // Ignored in test mocks
          }
        }

        trackTime += noteDuration;
      }

      if (trackTime > maxEndTime) {
        maxEndTime = trackTime;
      }
    }

    const totalDurationMs = Math.max(0, (maxEndTime - ctx.currentTime) * 1000);

    const cleanup = () => {
      if (!isPlaying) return;
      isPlaying = false;
      MusicJingles.activeHandles.delete(handleId);

      for (const timer of activeTimerIds) {
        clearTimeout(timer);
      }
      activeTimerIds.length = 0;

      if (jingleGain) {
        try {
          jingleGain.disconnect();
        } catch { /* ignored */ }
      }

      for (const osc of activeOscillators) {
        try {
          osc.disconnect();
        } catch { /* ignored */ }
      }
      for (const gain of activeGainNodes) {
        try {
          gain.disconnect();
        } catch { /* ignored */ }
      }
      activeOscillators.length = 0;
      activeGainNodes.length = 0;

      resolveFinished();
    };

    const completionTimer = setTimeout(cleanup, totalDurationMs + 50) as unknown as number;
    activeTimerIds.push(completionTimer);

    const stop = (fadeDurationMs: number = 15) => {
      if (!isPlaying) return;
      isPlaying = false;
      MusicJingles.activeHandles.delete(handleId);

      for (const timer of activeTimerIds) {
        clearTimeout(timer);
      }
      activeTimerIds.length = 0;

      const now = ctx.currentTime;
      const fadeSec = Math.max(0.005, fadeDurationMs / 1000);

      if (jingleGain) {
        try {
          jingleGain.gain.cancelScheduledValues(now);
          jingleGain.gain.setValueAtTime(jingleGain.gain.value, now);
          jingleGain.gain.exponentialRampToValueAtTime(0.0001, now + fadeSec);
        } catch { /* ignored */ }
      }

      for (const osc of activeOscillators) {
        try {
          osc.stop(now + fadeSec + 0.005);
        } catch { /* ignored */ }
      }

      setTimeout(() => {
        try {
          if (jingleGain) jingleGain.disconnect();
          for (const osc of activeOscillators) {
            osc.disconnect();
          }
          for (const gain of activeGainNodes) {
            gain.disconnect();
          }
        } catch { /* ignored */ }
        resolveFinished();
      }, fadeDurationMs + 20);
    };

    const handle: MusicPlaybackHandle = {
      id: handleId,
      get isPlaying() {
        return isPlaying;
      },
      stop,
      finished: finishedPromise,
    };

    this.activeHandles.set(handleId, handle);
    return handle;
  }
}
