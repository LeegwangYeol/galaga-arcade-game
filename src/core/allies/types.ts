/**
 * Galaga Arcade Web Game — Milestone 13: Allies Support System Types & Contracts
 */

import type { Rect, Poolable } from '../../types';

export enum DroneType {
  ESCORT = 'ESCORT',
  AEGIS = 'AEGIS',
  BOMBER = 'BOMBER',
}

export enum DroneState {
  INACTIVE = 'INACTIVE',
  DEPLOYING = 'DEPLOYING',
  ACTIVE = 'ACTIVE',
  RETURNING = 'RETURNING',
  COOLDOWN = 'COOLDOWN',
}

export interface DroneStats {
  activeCount: number;
  totalSummoned: number;
  totalBombsDropped: number;
  totalShieldsRepaired: number;
  totalShotsFired: number;
}

export interface IClusterBomb extends Poolable {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  timer: number;
  maxLife: number;
  width: number;
  height: number;
  getHitbox(): Rect;
}

export interface IBombExplosion extends Poolable {
  x: number;
  y: number;
  currentRadius: number;
  maxRadius: number;
  damage: number;
  timer: number;
  maxLife: number;
  hitEnemyIds: string[];
}
