/**
 * Galaga Arcade Web Game — Player Fighter Entity & Dual Docking System
 * 
 * Implements the 7-state Player finite-state machine:
 * - normal (single hull baseline fighter)
 * - capturing (tractor beam rotation & ascension)
 * - captured (docked as alien escort, life decremented)
 * - docking (rescued fighter descent & convergence)
 * - dual (twin hulls, double width, twin missiles)
 * - destroyed (explosion delay & life check)
 * - respawning (3.0s blinking invulnerability)
 * 
 * Features 1D horizontal movement (260 px/s), strict boundary clamping,
 * twin-missile firing limits (2 vs 4), asymmetrical partial destruction,
 * and high-performance SpriteRenderer procedural offscreen rendering.
 */

import { SpriteRenderer } from '../renderer/SpriteRenderer';
import type { Rect, Vector2D, InputState, PlayerData, PlayerState } from '../types';

export type PlayerStateType =
  | 'normal'
  | 'capturing'
  | 'captured'
  | 'docking'
  | 'dual'
  | 'destroyed'
  | 'respawning'
  | 'ALIVE'
  | 'CAPTURING'
  | 'CAPTURED'
  | 'DOCKING'
  | 'DUAL'
  | 'DESTROYED'
  | 'RESPAWNING';

export interface PlayerConfig {
  x?: number;
  y?: number;
  speed?: number;
  lives?: number;
}

export interface BulletSpawnRequest {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface RescuedFighterState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  active: boolean;
  angle: number;
}

export class Player {
  // Spatial & Physics Constants
  public static readonly BASELINE_Y = 250;
  public static readonly SPEED = 260; // Pixels per second
  public static readonly SINGLE_WIDTH = 16;
  public static readonly DUAL_WIDTH = 32;
  public static readonly HEIGHT = 16;
  public static readonly FIRE_COOLDOWN = 0.12; // 120ms between trigger cycles
  public static readonly INVULNERABLE_DURATION = 3.0; // 3.0 seconds blinking invulnerability
  public static readonly DEATH_DURATION = 1.2; // 1.2 seconds explosion delay
  public static readonly RESCUE_DESCENT_SPEED = 120; // Pixels per second

  // Position & Velocity
  public x: number = 112;
  public y: number = Player.BASELINE_Y;
  public vx: number = 0;
  public vy: number = 0;

  // State Machine
  private _state: PlayerStateType = 'normal';
  public lives: number = 3;
  public score: number = 0;
  public fireCooldownTimer: number = 0;
  public invulnerableTimer: number = 0;
  public deathTimer: number = 0;

  // Capture Animation State
  public captureTimer: number = 0;
  public captureAngle: number = 0;
  public captureOrigin: Vector2D = { x: 112, y: Player.BASELINE_Y };
  public captureTarget: Vector2D = { x: 112, y: 100 };

  // Rescued Fighter Docking State
  public rescuedFighter: RescuedFighterState = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: Player.BASELINE_Y,
    active: false,
    angle: 0,
  };

  // Active missile reference counter (tracked synchronously with Bullet pool)
  public activeMissileCount: number = 0;

  // Events / Callbacks
  public onFire?: (spawns: BulletSpawnRequest[]) => void;
  public onExplode?: (x: number, y: number, isDualPartial: boolean) => void;
  public onDocked?: () => void;
  public onGameOver?: () => void;

  constructor(config?: PlayerConfig) {
    this.x = config?.x ?? 112;
    this.y = config?.y ?? Player.BASELINE_Y;
    this.lives = config?.lives ?? 3;
    this.reset(this.x, this.y, this.lives);
  }

  // ==========================================================================
  // State Property Getter / Setter
  // ==========================================================================

  public get state(): PlayerStateType {
    return this._state;
  }

  public set state(val: PlayerStateType) {
    this._state = val;
  }

  public get isDual(): boolean {
    return this._state === 'dual' || this._state === 'DUAL';
  }

  public set isDual(value: boolean) {
    if (value) {
      this._state = 'dual';
    } else if (this.isDual) {
      this._state = 'normal';
    }
  }

  public get position(): Vector2D {
    return { x: this.x, y: this.y };
  }

  public set position(pos: Vector2D) {
    this.x = pos.x;
    this.y = pos.y;
  }

  public get velocity(): Vector2D {
    return { x: this.vx, y: this.vy };
  }

  public set velocity(vel: Vector2D) {
    this.vx = vel.x;
    this.vy = vel.y;
  }

  public get canFire(): boolean {
    const isDual = this.isDual;
    const maxMissiles = isDual ? 4 : 2;
    if (isDual) {
      return this.fireCooldownTimer <= 0 && this.activeMissileCount <= maxMissiles - 2;
    }
    return this.fireCooldownTimer <= 0 && this.activeMissileCount < maxMissiles;
  }

  public get respawnTimerMs(): number {
    return this.invulnerableTimer * 1000;
  }

  /**
   * Returns snapshot conforming to PlayerData interface contract.
   */
  public toData(): PlayerData {
    let contractState: PlayerState = 'ALIVE';
    if (this._state === 'capturing' || this._state === 'CAPTURING') contractState = 'CAPTURING';
    else if (this._state === 'captured' || this._state === 'CAPTURED') contractState = 'CAPTURED';
    else if (this._state === 'docking' || this._state === 'DOCKING') contractState = 'DOCKING';
    else if (this._state === 'dual' || this._state === 'DUAL') contractState = 'DUAL';
    else if (this._state === 'destroyed' || this._state === 'DESTROYED') contractState = 'DESTROYED';
    else if (this._state === 'respawning' || this._state === 'RESPAWNING') contractState = 'RESPAWNING';

    return {
      position: { x: this.x, y: this.y },
      velocity: { x: this.vx, y: this.vy },
      state: contractState,
      lives: this.lives,
      isDual: this.isDual,
      canFire: this.canFire,
      respawnTimerMs: this.respawnTimerMs,
      score: this.score,
    };
  }

  // ==========================================================================
  // Lifecycle & Reset
  // ==========================================================================

  public reset(x: number = 112, y: number = Player.BASELINE_Y, lives: number = 3): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.lives = lives;
    this._state = 'normal';
    this.fireCooldownTimer = 0;
    this.invulnerableTimer = 0;
    this.deathTimer = 0;
    this.captureTimer = 0;
    this.captureAngle = 0;
    this.rescuedFighter.active = false;
    this.activeMissileCount = 0;
  }

  public respawn(): void {
    this.x = 112;
    this.y = Player.BASELINE_Y;
    this.vx = 0;
    this.vy = 0;
    this._state = 'respawning';
    this.invulnerableTimer = Player.INVULNERABLE_DURATION;
    this.fireCooldownTimer = 0;
    this.deathTimer = 0;
    this.captureTimer = 0;
    this.captureAngle = 0;
    this.rescuedFighter.active = false;
  }

  // ==========================================================================
  // Update Pipeline (60 FPS Fixed Timestep)
  // ==========================================================================

  public update(dt: number, input?: InputState): void {
    // 1. Update timers
    if (this.fireCooldownTimer > 0) {
      this.fireCooldownTimer = Math.max(0, this.fireCooldownTimer - dt);
    }

    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
      if (this.invulnerableTimer === 0 && (this._state === 'respawning' || this._state === 'RESPAWNING')) {
        this._state = 'normal';
      }
    }

    // 2. Dispatch state-specific update routines
    const s = this._state;
    if (s === 'normal' || s === 'ALIVE' || s === 'dual' || s === 'DUAL' || s === 'respawning' || s === 'RESPAWNING') {
      this.updateControllable(dt, input);
    } else if (s === 'docking' || s === 'DOCKING') {
      this.updateDocking(dt, input);
    } else if (s === 'capturing' || s === 'CAPTURING') {
      this.updateCapturing(dt);
    } else if (s === 'captured' || s === 'CAPTURED') {
      // Idle in captured state waiting for stage/boss logic
    } else if (s === 'destroyed' || s === 'DESTROYED') {
      this.updateDestroyed(dt);
    }
  }

  private updateControllable(dt: number, input?: InputState): void {
    if (!input) return;

    // A. 1D Horizontal Steering
    let targetVx = 0;

    const left = input.moveLeft || input.touchLeft;
    const right = input.moveRight || input.touchRight;

    if (left && !right) {
      targetVx = -Player.SPEED;
    } else if (right && !left) {
      targetVx = Player.SPEED;
    } else if (input.pointerActive && input.pointerX !== null) {
      // Pointer absolute steering with anti-jitter deadzone
      const dx = input.pointerX - this.x;
      if (Math.abs(dx) <= Player.SPEED * dt) {
        this.x = input.pointerX;
        targetVx = 0;
      } else {
        targetVx = Math.sign(dx) * Player.SPEED;
      }
    }

    this.vx = targetVx;
    this.x += this.vx * dt;

    // B. Boundary Clamping
    this.clampPosition();

    // C. Weapon Firing Logic
    if (input.fire || input.touchFire) {
      this.attemptFire();
    }
  }

  private updateDocking(dt: number, input?: InputState): void {
    // Player retains single ship steering & firing while rescued ship docks
    this.updateControllable(dt, input);

    if (!this.rescuedFighter.active) {
      this._state = 'normal';
      return;
    }

    // Move rescued fighter down toward baseline
    const rf = this.rescuedFighter;
    rf.y += Player.RESCUE_DESCENT_SPEED * dt;

    // Target docking slot alongside active player ship
    const targetDockX = rf.x < this.x ? this.x - 16 : this.x + 16;
    rf.x += (targetDockX - rf.x) * Math.min(1.0, 6.0 * dt);

    // Docking convergence check
    if (rf.y >= Player.BASELINE_Y - 1) {
      rf.y = Player.BASELINE_Y;
      rf.active = false;
      this._state = 'dual';
      // Center the dual pair
      this.x = Math.max(16, Math.min(208, (this.x + rf.x) / 2));
      this.clampPosition();
      this.onDocked?.();
    }
  }

  private updateCapturing(dt: number): void {
    this.captureTimer += dt;
    // Rotate ship at 720 degrees/sec (2 rev/sec)
    this.captureAngle += Math.PI * 4 * dt;

    // Ascend along beam towards Boss Galaga
    const progress = Math.min(1.0, this.captureTimer / 2.5);
    this.y = this.captureOrigin.y + (this.captureTarget.y - this.captureOrigin.y) * progress;
    this.x = this.captureOrigin.x + (this.captureTarget.x - this.captureOrigin.x) * progress;

    if (progress >= 1.0) {
      this._state = 'captured';
      this.lives -= 1;
      if (this.lives > 0) {
        this.respawn();
      } else {
        this.onGameOver?.();
      }
    }
  }

  private updateDestroyed(dt: number): void {
    this.deathTimer -= dt;
    if (this.deathTimer <= 0) {
      this.deathTimer = 0;
      if (this.lives > 0) {
        this.respawn();
      } else {
        this.onGameOver?.();
      }
    }
  }

  // ==========================================================================
  // Weapon Firing Mechanism
  // ==========================================================================

  public attemptFire(): boolean {
    if (this.fireCooldownTimer > 0) {
      return false;
    }

    const isDual = this.isDual;
    const maxMissiles = isDual ? 4 : 2;

    if (isDual) {
      // Dual mode requires capacity for 2 simultaneous bullets
      if (this.activeMissileCount > maxMissiles - 2) {
        return false;
      }

      this.fireCooldownTimer = Player.FIRE_COOLDOWN;
      const spawns: BulletSpawnRequest[] = [
        { x: this.x - 8, y: this.y - 8, vx: 0, vy: -480 },
        { x: this.x + 8, y: this.y - 8, vx: 0, vy: -480 },
      ];
      this.onFire?.(spawns);
      return true;
    } else {
      // Single mode
      if (this.activeMissileCount >= maxMissiles) {
        return false;
      }

      this.fireCooldownTimer = Player.FIRE_COOLDOWN;
      const spawns: BulletSpawnRequest[] = [
        { x: this.x, y: this.y - 8, vx: 0, vy: -480 },
      ];
      this.onFire?.(spawns);
      return true;
    }
  }

  // ==========================================================================
  // Damage & Collision Handling
  // ==========================================================================

  public isInvulnerable(): boolean {
    return (
      this.invulnerableTimer > 0 ||
      this._state === 'respawning' ||
      this._state === 'RESPAWNING' ||
      this._state === 'destroyed' ||
      this._state === 'DESTROYED'
    );
  }

  /**
   * Evaluates collision against a threat AABB (bullet or diving alien).
   * Supports asymmetrical partial destruction for Dual Fighters.
   */
  public hitTestAndDamage(threat: Rect): boolean {
    if (
      this.isInvulnerable() ||
      this._state === 'capturing' ||
      this._state === 'CAPTURING' ||
      this._state === 'captured' ||
      this._state === 'CAPTURED'
    ) {
      return false;
    }

    if (this.isDual) {
      const leftHull: Rect = {
        x: this.x - 16,
        y: this.y - 6,
        width: 15,
        height: 12,
      };
      const rightHull: Rect = {
        x: this.x + 1,
        y: this.y - 6,
        width: 15,
        height: 12,
      };

      const hitLeft = this.checkAABB(threat, leftHull);
      const hitRight = this.checkAABB(threat, rightHull);

      if (hitLeft && !hitRight) {
        // Partial destruction: Left hull destroyed
        this.onExplode?.(this.x - 8, this.y, true);
        this._state = 'normal';
        this.x = Math.min(212, Math.max(12, this.x + 8));
        return true;
      } else if (hitRight && !hitLeft) {
        // Partial destruction: Right hull destroyed
        this.onExplode?.(this.x + 8, this.y, true);
        this._state = 'normal';
        this.x = Math.min(212, Math.max(12, this.x - 8));
        return true;
      } else if (hitLeft && hitRight) {
        // Catastrophic hit: Both hulls destroyed
        this.destroy();
        return true;
      }
      return false;
    } else if (
      this._state === 'normal' ||
      this._state === 'ALIVE' ||
      this._state === 'docking' ||
      this._state === 'DOCKING'
    ) {
      const singleHitbox: Rect = {
        x: this.x - 6,
        y: this.y - 6,
        width: 12,
        height: 12,
      };

      if (this.checkAABB(threat, singleHitbox)) {
        this.destroy();
        return true;
      }
    }

    return false;
  }

  public destroy(): void {
    if (this._state === 'destroyed' || this._state === 'DESTROYED') return;

    this.onExplode?.(this.x, this.y, false);
    this._state = 'destroyed';
    this.deathTimer = Player.DEATH_DURATION;
    this.lives -= 1;
    this.rescuedFighter.active = false;
  }

  // ==========================================================================
  // Tractor Beam Capture & Rescue Triggers
  // ==========================================================================

  public startCapture(beamCenterX: number, bossY: number): void {
    if (this.isInvulnerable() || (this._state !== 'normal' && this._state !== 'ALIVE')) return;

    this._state = 'capturing';
    this.captureTimer = 0;
    this.captureAngle = 0;
    this.captureOrigin = { x: this.x, y: this.y };
    this.captureTarget = { x: beamCenterX, y: bossY + 16 };
  }

  public startRescue(bossX: number, bossY: number): void {
    this._state = 'docking';
    this.rescuedFighter = {
      x: bossX,
      y: bossY,
      targetX: this.x < bossX ? this.x + 16 : this.x - 16,
      targetY: Player.BASELINE_Y,
      active: true,
      angle: 0,
    };
  }

  // ==========================================================================
  // Helper & Math Methods
  // ==========================================================================

  public clampPosition(): void {
    const isDual = this.isDual;
    const minX = isDual ? 16 : 12;
    const maxX = isDual ? 208 : 212;
    this.x = Math.max(minX, Math.min(maxX, this.x));
    this.y = Player.BASELINE_Y;
  }

  public getHitbox(): Rect {
    if (this.isDual) {
      return {
        x: this.x - 16,
        y: this.y - 6,
        width: 32,
        height: 12,
      };
    }
    return {
      x: this.x - 6,
      y: this.y - 6,
      width: 12,
      height: 12,
    };
  }

  private checkAABB(a: Rect, b: Rect): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  // ==========================================================================
  // Procedural Pixel Rendering
  // ==========================================================================

  public render(ctx: CanvasRenderingContext2D): void {
    if (
      this._state === 'destroyed' ||
      this._state === 'DESTROYED' ||
      this._state === 'captured' ||
      this._state === 'CAPTURED'
    ) {
      return;
    }

    // 10Hz blinking during invulnerability / respawn
    if (this.isInvulnerable()) {
      const isVisible = Math.floor(this.invulnerableTimer * 10) % 2 === 0;
      if (!isVisible) return;
    }

    const s = this._state;
    if (s === 'capturing' || s === 'CAPTURING') {
      // Spinning capture sprite
      SpriteRenderer.draw(ctx, 'CAPTURED_FIGHTER', this.x, this.y, {
        rotation: this.captureAngle,
      });
    } else if (this.isDual) {
      // Dual fighter composite sprite
      SpriteRenderer.draw(ctx, 'DUAL_FIGHTER', this.x, this.y);
    } else if (s === 'docking' || s === 'DOCKING') {
      // Active ship
      SpriteRenderer.draw(ctx, 'PLAYER_FIGHTER', this.x, this.y);
      // Rescued ship descending
      if (this.rescuedFighter.active) {
        SpriteRenderer.draw(
          ctx,
          'PLAYER_FIGHTER',
          this.rescuedFighter.x,
          this.rescuedFighter.y
        );
      }
    } else {
      // Standard single fighter
      SpriteRenderer.draw(ctx, 'PLAYER_FIGHTER', this.x, this.y);
    }
  }
}
