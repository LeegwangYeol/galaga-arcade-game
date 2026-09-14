/**
 * Galaga Arcade Web Game — Power-Up Subsystem Type Definitions
 * Location: src/core/powerups/types.ts
 */

import type { EnemyType, StageTier } from '../../types';

/**
 * 5 Canonical Player Power-Up Upgrade Types
 */
export enum PowerUpType {
  RAPID_FIRE = 'RAPID_FIRE',         // Overclock: 2x fire rate, expanded on-screen missile quota
  KINETIC_SHIELD = 'KINETIC_SHIELD', // Energy Barrier: absorbs 1 fatal hit/collision without hull loss
  SCATTER_SHOT = 'SCATTER_SHOT',     // Multi-Blaster: 3-way divergent spread (0°, ±15°)
  EMP_BOMB = 'EMP_BOMB',             // Tactical Screen Wipe: clears enemy bullets & damages diving enemies
  ENGINE_BOOSTER = 'ENGINE_BOOSTER', // Hyper Drive: lateral speed boost (260 -> 390 px/s, 1.5x)
  // M19 Post-Launch Expansion Upgrades
  CHRONO_FIELD = 'CHRONO_FIELD',             // Temporal Dilation: slows bullets & dive speeds within 120px by 60%
  REFLECTION_SHIELD = 'REFLECTION_SHIELD',   // Kinetic Barrier: absorbs bullets and fires homing counter-missiles
  EMP_COLLECTOR = 'EMP_COLLECTOR',           // Singularity Vortex: siphons bullets within 90px into points & energy
  PHASE_DRIVE = 'PHASE_DRIVE',               // Quantum Blink: Shift/double-tap warps ship with 0.4s intangibility
  ANTIMATTER_PLASMA = 'ANTIMATTER_PLASMA',   // Plasma Lance: continuous vertical piercing beam slicing enemy ranks
}

/**
 * Normalizes case-insensitive aliases and canonical IDs to PowerUpType
 */
export function normalizePowerUpType(typeOrId: string | PowerUpType): PowerUpType {
  const map: Record<string, PowerUpType> = {
    rapid_fire: PowerUpType.RAPID_FIRE,
    rapid: PowerUpType.RAPID_FIRE,
    kinetic_shield: PowerUpType.KINETIC_SHIELD,
    shield: PowerUpType.KINETIC_SHIELD,
    scatter_shot: PowerUpType.SCATTER_SHOT,
    scatter: PowerUpType.SCATTER_SHOT,
    emp_bomb: PowerUpType.EMP_BOMB,
    emp: PowerUpType.EMP_BOMB,
    engine_booster: PowerUpType.ENGINE_BOOSTER,
    booster: PowerUpType.ENGINE_BOOSTER,
    chrono_field: PowerUpType.CHRONO_FIELD,
    chrono: PowerUpType.CHRONO_FIELD,
    reflection_shield: PowerUpType.REFLECTION_SHIELD,
    reflection: PowerUpType.REFLECTION_SHIELD,
    emp_collector: PowerUpType.EMP_COLLECTOR,
    collector: PowerUpType.EMP_COLLECTOR,
    phase_drive: PowerUpType.PHASE_DRIVE,
    phase: PowerUpType.PHASE_DRIVE,
    antimatter_plasma: PowerUpType.ANTIMATTER_PLASMA,
    plasma: PowerUpType.ANTIMATTER_PLASMA,
  };
  const key = String(typeOrId).toLowerCase();
  return map[key] ?? (typeOrId as PowerUpType);
}

/**
 * Backward-compatibility alias for survey & specification references
 */
export const KINETIC_DEFLECTOR = PowerUpType.KINETIC_SHIELD;

/**
 * Static metadata configuration for each power-up module
 */
export interface PowerUpConfig {
  readonly type: PowerUpType;
  readonly name: string;
  readonly duration: number;        // Duration in seconds (0 = persistent until hit or instant)
  readonly spriteId: string;        // SpriteRenderer cache key
  readonly primaryColor: string;    // Arcade palette hex
  readonly secondaryColor: string;  // Accent/flashing palette hex
  readonly baseWeight: number;      // Base probability weight in loot table
  readonly description: string;
}

/**
 * Snapshot of active upgrades and timers on the player
 */
export interface ActiveBuffState {
  rapidFireTimer: number;       // Remaining duration in seconds (0 = inactive)
  scatterShotTimer: number;     // Remaining duration in seconds (0 = inactive)
  engineBoosterTimer: number;   // Remaining duration in seconds (0 = inactive)
  hasShield: boolean;           // True if kinetic shield is active (absorbs 1 hit)
  empBombCount: number;         // Stored EMP charges (if consumable mode enabled)
  // M19 Post-Launch Buffs
  chronoFieldTimer: number;       // Remaining Chrono Field duration (0 = inactive)
  reflectionShieldTimer: number; // Remaining Reflection Shield duration (0 = inactive)
  hasReflectionShield: boolean;   // True if reflection shield is active
  empCollectorTimer: number;     // Remaining Singularity Collector duration (0 = inactive)
  phaseDriveTimer: number;       // Remaining Phase Drive duration (0 = inactive)
  plasmaBlasterTimer: number;    // Remaining Antimatter Plasma duration (0 = inactive)
}

/**
 * Context passed to drop calculations
 */
export interface EnemyDropContext {
  x: number;
  y: number;
  enemyType: EnemyType;
  isDiving: boolean;
  stage: number;
  stageTier: StageTier;
  isChallengingStage: boolean;
}

/**
 * Diagnostic statistics for pool and drop monitoring
 */
export interface PowerUpStats {
  totalSpawned: number;
  totalCollected: number;
  totalDespawned: number;
  activeCount: number;
  poolCapacity: number;
}

/**
 * Configuration registry for all 5 power-up types
 */
export const POWERUP_CONFIGS: Record<PowerUpType, PowerUpConfig> = {
  [PowerUpType.RAPID_FIRE]: {
    type: PowerUpType.RAPID_FIRE,
    name: 'RAPID FIRE',
    duration: 15.0,
    spriteId: 'POWERUP_RAPID_FIRE',
    primaryColor: '#FF7F00',   // Orange
    secondaryColor: '#FFFF00', // Yellow
    baseWeight: 30,
    description: 'Doubles fire rate (120ms -> 60ms) and expands on-screen missile quota (Single: 4, Dual: 8)',
  },
  [PowerUpType.KINETIC_SHIELD]: {
    type: PowerUpType.KINETIC_SHIELD,
    name: 'KINETIC SHIELD',
    duration: 0, // Persists until absorbed by a hit
    spriteId: 'POWERUP_KINETIC_SHIELD',
    primaryColor: '#00FFFF',   // Cyan
    secondaryColor: '#5B93FF', // Light Blue
    baseWeight: 25,
    description: 'Deploys an energy barrier absorbing 1 lethal hit or ship collision, preserving Dual hulls',
  },
  [PowerUpType.SCATTER_SHOT]: {
    type: PowerUpType.SCATTER_SHOT,
    name: 'SCATTER SHOT',
    duration: 15.0,
    spriteId: 'POWERUP_SCATTER_SHOT',
    primaryColor: '#00E700',   // Green
    secondaryColor: '#FFFFFF', // White
    baseWeight: 20,
    description: 'Fires 3-way spread volleys (Single: 3 streams, Dual: twin 3-way / 6 streams)',
  },
  [PowerUpType.ENGINE_BOOSTER]: {
    type: PowerUpType.ENGINE_BOOSTER,
    name: 'ENGINE BOOSTER',
    duration: 15.0,
    spriteId: 'POWERUP_ENGINE_BOOSTER',
    primaryColor: '#5B93FF',   // Light Blue
    secondaryColor: '#00FFFF', // Cyan
    baseWeight: 15,
    description: 'Accelerates lateral thrusters from 260 px/s to 390 px/s (1.5x) with enhanced agility',
  },
  [PowerUpType.EMP_BOMB]: {
    type: PowerUpType.EMP_BOMB,
    name: 'EMP BOMB',
    duration: 0, // Instant screen clear upon collection
    spriteId: 'POWERUP_EMP_BOMB',
    primaryColor: '#E70000',   // Red
    secondaryColor: '#FFFF00', // Yellow
    baseWeight: 10,
    description: 'Instant tactical EMP shockwave vaporizing enemy bullets and damaging diving craft',
  },
  [PowerUpType.CHRONO_FIELD]: {
    type: PowerUpType.CHRONO_FIELD,
    name: 'CHRONO FIELD',
    duration: 6.0,
    spriteId: 'POWERUP_CHRONO_FIELD',
    primaryColor: '#00FFFF',   // Cyan
    secondaryColor: '#FFBF00', // Amber
    baseWeight: 10,
    description: 'Deploys a 120px temporal field slowing enemy bullets and dive speeds by 60% for 6s',
  },
  [PowerUpType.REFLECTION_SHIELD]: {
    type: PowerUpType.REFLECTION_SHIELD,
    name: 'REFLECTION SHIELD',
    duration: 12.0,
    spriteId: 'POWERUP_REFLECTION_SHIELD',
    primaryColor: '#5B93FF',   // Light Blue
    secondaryColor: '#00FFFF', // Cyan
    baseWeight: 10,
    description: 'Hexagonal barrier absorbing enemy bullets and converting them into homing counter-missiles',
  },
  [PowerUpType.EMP_COLLECTOR]: {
    type: PowerUpType.EMP_COLLECTOR,
    name: 'EMP COLLECTOR',
    duration: 5.0,
    spriteId: 'POWERUP_EMP_COLLECTOR',
    primaryColor: '#9900EE',   // Purple
    secondaryColor: '#FF007F', // Magenta
    baseWeight: 8,
    description: 'Gravitational vortex siphoning and disintegrating enemy bullets within 90px into +50 pts and +5% special energy',
  },
  [PowerUpType.PHASE_DRIVE]: {
    type: PowerUpType.PHASE_DRIVE,
    name: 'PHASE DRIVE',
    duration: 15.0,
    spriteId: 'POWERUP_PHASE_DRIVE',
    primaryColor: '#FF007F',   // Magenta
    secondaryColor: '#00FFFF', // Cyan
    baseWeight: 8,
    description: 'Quantum phase warp thrusters enabling Shift / double-tap blink evasions with 0.4s intangibility',
  },
  [PowerUpType.ANTIMATTER_PLASMA]: {
    type: PowerUpType.ANTIMATTER_PLASMA,
    name: 'ANTIMATTER PLASMA',
    duration: 7.0,
    spriteId: 'POWERUP_ANTIMATTER_PLASMA',
    primaryColor: '#00E700',   // Green
    secondaryColor: '#FFFF00', // Yellow
    baseWeight: 7,
    description: 'Continuous vertical piercing plasma lance slicing through all enemy ranks with 10 Hz throttled damage',
  },
};
