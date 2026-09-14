/**
 * Galaga Arcade Web Game — Audio Engine Types & Channel Contracts
 * Milestone 14: Procedural Web Audio API Sound Synthesis
 */

import type { SoundOptions } from '../types';

export type SoundPriority = 1 | 2 | 3;

export const SOUND_PRIORITY = {
  LOW: 1 as SoundPriority,
  NORMAL: 2 as SoundPriority,
  HIGH: 3 as SoundPriority,
} as const;

export type M14AudioEventType =
  // Classic Galaga Events
  | 'LASER_FIRE'
  | 'ENEMY_DIVE'
  | 'ENEMY_EXPLOSION_SMALL'
  | 'ENEMY_EXPLOSION_LARGE'
  | 'BOSS_HIT'
  | 'BOSS_DESTROYED'
  | 'PLAYER_EXPLOSION'
  | 'TRACTOR_BEAM'
  | 'STAGE_START_FANFARE'
  | 'CHALLENGING_STAGE_START'
  | 'CHALLENGING_STAGE_PERFECT'
  | 'DOCKING_CHIME'
  | 'GAME_OVER_FANFARE'
  | 'EXTRA_LIFE'
  // Epic Boss Encounters (Milestone 12)
  | 'HEAVY_LASER_BLAST'
  | 'SPIRAL_RING_WHOOSH'
  | 'DIMENSIONAL_TEAR_HUM'
  | 'BLACK_HOLE_SUCTION_RUMBLE'
  | 'NANITE_SPLIT_SHIMMER'
  | 'GRAY_GOO_DISSOLVE_HISS'
  | 'PHANTOM_DIVE_WARBLE'
  | 'TELEKINETIC_STUN_SCREECH'
  | 'ORBITAL_SHIELD_HUM'
  | 'DARK_MATTER_BEAM_CHARGE'
  | 'DARK_MATTER_BEAM_ROAR'
  | 'ENRAGE_SIREN'
  // Crisis Events (Milestone 10)
  | 'CRISIS_KLAXON'
  | 'DIGITAL_GLITCH'
  | 'LIGHTNING_CRACKLE'
  | 'DARK_MATTER_IGNITION'
  // Allies Support System (Milestone 13)
  | 'ESCORT_PLASMA_BOLT'
  | 'SHIELD_REPAIR_CHIME'
  | 'POINT_DEFENSE_PING'
  | 'BOMBER_ENGINE_SWEEP'
  | 'CLUSTER_BOMB_THUD'
  // Special Moves System (Milestone 13)
  | 'NOVA_LOCK_CHIME'
  | 'NOVA_MISSILE_SWOOSH'
  | 'CHRONO_FREEZE_DROP'
  | 'CLOCK_FREEZE_TICK'
  | 'WARP_RAM_SONIC_BOOM';

export interface ContinuousSoundHandle {
  stop: () => void;
  isActive: () => boolean;
}

export interface SoundPlaybackOptions extends SoundOptions {
  priority?: SoundPriority;
  debounce?: boolean;
}
