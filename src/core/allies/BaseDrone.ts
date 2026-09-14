/**
 * Galaga Arcade Web Game — Abstract Base Drone Entity
 */

import { DroneType, DroneState } from './types';
import type { Game } from '../Game';

export abstract class BaseDrone {
  public abstract readonly type: DroneType;
  public state: DroneState = DroneState.INACTIVE;
  public active: boolean = false;

  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;

  public duration: number = 0; // 0 = permanent until stage clear/death
  public lifetimeTimer: number = 0;

  public animTimer: number = 0;
  public animFrame: number = 0;

  protected game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  public activate(duration: number = 0, initialX: number = 112, initialY: number = 250): void {
    this.active = true;
    this.state = DroneState.ACTIVE;
    this.duration = duration;
    this.lifetimeTimer = 0;
    this.x = initialX;
    this.y = initialY;
    this.animTimer = 0;
    this.animFrame = 0;
    this.onActivate();
  }

  public deactivate(): void {
    this.active = false;
    this.state = DroneState.INACTIVE;
    this.duration = 0;
    this.lifetimeTimer = 0;
    this.onDeactivate();
  }

  public reset(): void {
    this.deactivate();
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
  }

  protected onActivate(): void {}
  protected onDeactivate(): void {}

  public abstract update(dt: number, playerX?: number, playerY?: number): void;
  public abstract render(ctx: CanvasRenderingContext2D): void;
}
