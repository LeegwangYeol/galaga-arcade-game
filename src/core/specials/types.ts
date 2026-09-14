/**
 * Galaga Arcade Web Game — Milestone 13: Special Moves Subsystem Types & Contracts
 */

import type { Rect, Poolable } from '../../types';
import type { Enemy } from '../../entities/Enemy';
import type { BaseBoss } from '../boss/BaseBoss';

export enum SpecialMoveType {
  NOVA_BARRAGE = 'NOVA_BARRAGE',
  CHRONO_FREEZE = 'CHRONO_FREEZE',
  WARP_RAM = 'WARP_RAM',
}

export interface SpecialMoveState {
  energy: number;
  maxEnergy: number;
  selectedMove: SpecialMoveType;
  isActive: boolean;
  activeMove: SpecialMoveType | null;
  activeTimer: number;
  cooldownTimer: number;
  isReady: boolean;
}

export interface INovaMissile extends Poolable {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  target: Enemy | BaseBoss | null;
  timer: number;
  maxLife: number;
  damage: number;
  getHitbox(): Rect;
}

export interface IEnergySpark extends Poolable {
  x: number;
  y: number;
  baseX: number;
  vx: number;
  vy: number;
  timer: number;
  maxLife: number;
  value: number;
  points: number;
  getHitbox(): Rect;
}
