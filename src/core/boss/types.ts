/**
 * Galaga Arcade Web Game — Epic Boss Type Contracts & Interfaces
 * 
 * Standards for Milestone 12: 5 Epic Multi-Phase Boss Encounters (Stages 10, 20, 30, 40, 50).
 * Strictly enforced zero-runtime GC allocations during 60 FPS gameplay loops.
 */

export type BossPhaseId =
  | 'INTRO'
  | 'PHASE_1'
  | 'TRANSITION_1_2'
  | 'PHASE_2'
  | 'TRANSITION_2_3'
  | 'PHASE_3'
  | 'DEFEATED';

export type BossType =
  | 'CYBER_DREADNOUGHT'
  | 'DIMENSIONAL_LEVIATHAN'
  | 'NANITE_COLOSSUS'
  | 'PSIONIC_HARBINGER'
  | 'AETERNUM_CORE';

export interface IBossEntity {
  readonly id: number | string;
  readonly bossType: BossType;
  readonly name: string;
  readonly stage: number;
  readonly maxHealth: number;
  health: number;
  shield: number;
  phase: BossPhaseId;
  active: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  invulnerableTimer: number;
  stateTimer: number;

  isInvulnerable(): boolean;
  takeDamage(amount?: number): {
    destroyed: boolean;
    points: number;
    wasDamaged: boolean;
    shieldAbsorbed?: boolean;
    remainingHealth?: number;
  };
  update(dt: number, playerX: number, playerY: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  reset(): void;
}

export interface DimensionalTear {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  active: boolean;
}

export interface GrayGooCloud {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  active: boolean;
}

export interface RadialShockwave {
  centerX: number;
  centerY: number;
  radius: number;
  speed: number;
  maxRadius: number;
  thickness: number;
  safeAngle: number;       // Center of safe-sector gap in radians
  safeWidthRad: number;    // Width of safe gap (40 deg = 0.70 rad)
  active: boolean;
  hasDamagedPlayer?: boolean;
}

export interface DarkMatterBeam {
  charging: boolean;
  firing: boolean;
  chargeTimer: number;
  fireTimer: number;
  centerX: number;
  width: number;
  sweepSpeed: number;
  sweepDir: number;
  topY: number;
  bottomY: number;
  active: boolean;
}

export interface TelekineticStunWave {
  y: number;
  speed: number;
  height: number;
  active: boolean;
}

export const BOSS_CONFIGS = {
  STAGE_10: {
    type: 'CYBER_DREADNOUGHT' as BossType,
    name: 'CYBER DREADNOUGHT',
    stage: 10,
    maxHealth: 80,
    width: 48,
    height: 32,
    scoreBonus: 10000,
  },
  STAGE_20: {
    type: 'DIMENSIONAL_LEVIATHAN' as BossType,
    name: 'DIMENSIONAL LEVIATHAN',
    stage: 20,
    maxHealth: 120,
    width: 48,
    height: 36,
    scoreBonus: 20000,
  },
  STAGE_30: {
    type: 'NANITE_COLOSSUS' as BossType,
    name: 'NANITE SWARM COLOSSUS',
    stage: 30,
    maxHealth: 150,
    width: 48,
    height: 40,
    scoreBonus: 30000,
  },
  STAGE_40: {
    type: 'PSIONIC_HARBINGER' as BossType,
    name: 'PSIONIC SHROUD HARBINGER',
    stage: 40,
    maxHealth: 180,
    width: 44,
    height: 36,
    scoreBonus: 40000,
  },
  STAGE_50: {
    type: 'AETERNUM_CORE' as BossType,
    name: 'AETERNUM STAR-EATER CORE',
    stage: 50,
    maxHealth: 300,
    width: 56,
    height: 40,
    scoreBonus: 50000,
  },
} as const;
