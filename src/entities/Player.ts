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
import type { Rect, Vector2D, InputState, PlayerData, PlayerState, PlayerId, PlayerColorScheme, PlayerStateType } from '../types';
import { PowerUpType, normalizePowerUpType } from '../core/powerups/types';

export type { PlayerStateType };

export interface RescuedFighterState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  active: boolean;
  angle: number;
}

export interface BulletSpawnRequest {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PlayerConfig {
  id?: PlayerId;
  colorScheme?: PlayerColorScheme;
  x?: number;
  y?: number;
  lives?: number;
  game?: any;
}

export class Player {
  // Movement & Geometry Constants
  public static readonly SPEED = 260; // 260 px/s (1.0x baseline speed)
  public static readonly BASELINE_Y = 250;
  public static readonly HITBOX_WIDTH_SINGLE = 12;
  public static readonly HITBOX_WIDTH_DUAL = 24;
  public static readonly HITBOX_HEIGHT = 12;
  public static readonly FIRE_COOLDOWN = 0.12; // 120ms baseline (halved to 60ms with Rapid Fire)
  public static readonly INVULNERABLE_DURATION = 3.0; // 3.0s respawn blinking intangibility
  public static readonly RESCUE_DESCENT_SPEED = 120; // Pixels per second
  public static readonly RESCUE_ANGULAR_VELOCITY = Math.PI * 4; // 720 deg/s
  public static readonly DEATH_DURATION = 0.5; // 0.5s explosion delay

  // Identity & Visual Styling
  public id: PlayerId = 'p1';
  public colorScheme: PlayerColorScheme = 'classic';

  // Spatial Coordinates
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
  public reviveTimer: number = 0;

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

  // Active Upgrade State
  public rapidFireTimer: number = 0;
  public scatterShotTimer: number = 0;
  public engineBoosterTimer: number = 0;
  public hasShield: boolean = false;
  public shieldHp: number = 0;
  public shieldFlashTimer: number = 0;
  public empBombCount: number = 0;
  public animTimer: number = 0;
  public isInvincibleCheat: boolean = false;
  public isWarpRamActive: boolean = false;
  public game?: any;

  // M19 Power-Up Buff States
  public chronoFieldTimer: number = 0;
  public reflectionShieldTimer: number = 0;
  public hasReflectionShield: boolean = false;
  public reflectionShieldHp: number = 0;
  public empCollectorTimer: number = 0;
  public phaseDriveTimer: number = 0;
  public phaseWarpCooldown: number = 0;
  public phaseGhostTimer: number = 0;
  public phaseGhostStartX: number = 0;
  public plasmaBlasterTimer: number = 0;
  public plasmaTickTimer: number = 0;

  // Events / Callbacks
  public onFire?: (spawns: BulletSpawnRequest[]) => void;
  public onExplode?: (x: number, y: number, isDualPartial: boolean) => void;
  public onDocked?: () => void;
  public onGameOver?: () => void;
  public onCapturedComplete?: (x: number, y: number) => void;
  public onShieldDeflect?: (x: number, y: number) => void;
  public onReflectionDeflect?: (x: number, y: number, threat?: Rect) => void;
  public onPlasmaBeamTick?: (x: number, y: number, isDual: boolean) => void;

  // Preallocated buffer & pool for zero-GC weapon discharge (Milestone M37-D5)
  private static readonly _spawnPool: BulletSpawnRequest[] = [
    { x: 0, y: 0, vx: 0, vy: 0 },
    { x: 0, y: 0, vx: 0, vy: 0 },
    { x: 0, y: 0, vx: 0, vy: 0 },
    { x: 0, y: 0, vx: 0, vy: 0 },
    { x: 0, y: 0, vx: 0, vy: 0 },
    { x: 0, y: 0, vx: 0, vy: 0 },
  ];
  private static readonly _spawnBuffer: BulletSpawnRequest[] = [];

  private static pushSpawn(x: number, y: number, vx: number, vy: number): void {
    const item = Player._spawnPool[Player._spawnBuffer.length];
    if (!item) return;
    item.x = x;
    item.y = y;
    item.vx = vx;
    item.vy = vy;
    Player._spawnBuffer.push(item);
  }

  constructor(config?: PlayerConfig) {
    this.id = config?.id ?? 'p1';
    this.colorScheme = config?.colorScheme ?? (this.id === 'p2' ? 'crimson' : 'classic');
    this.x = config?.x ?? (this.id === 'p2' ? 144 : 112);
    this.y = config?.y ?? Player.BASELINE_Y;
    this.lives = config?.lives ?? 3;
    this.game = config?.game;
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

  public get hasRapidFire(): boolean {
    return this.rapidFireTimer > 0;
  }

  public get hasScatterShot(): boolean {
    return this.scatterShotTimer > 0;
  }

  public get hasEngineBooster(): boolean {
    return this.engineBoosterTimer > 0;
  }

  public get hasChronoField(): boolean {
    return this.chronoFieldTimer > 0;
  }

  public get hasReflectionShieldActive(): boolean {
    return this.hasReflectionShield || this.reflectionShieldTimer > 0;
  }

  public get hasEmpCollector(): boolean {
    return this.empCollectorTimer > 0;
  }

  public get hasPhaseDrive(): boolean {
    return this.phaseDriveTimer > 0;
  }

  public get hasAntimatterPlasma(): boolean {
    return this.plasmaBlasterTimer > 0;
  }

  public get speed(): number {
    return this.hasEngineBooster ? Player.SPEED * 1.5 : Player.SPEED;
  }

  public get currentSpeed(): number {
    return this.speed;
  }

  public getMaxMissileQuota(): number {
    if (this.isDual) {
      if (this.hasScatterShot) {
        return this.hasRapidFire ? 16 : 12;
      }
      return this.hasRapidFire ? 8 : 4;
    } else {
      if (this.hasScatterShot) {
        return this.hasRapidFire ? 8 : 6;
      }
      return this.hasRapidFire ? 4 : 2;
    }
  }

  public get canFire(): boolean {
    const s = this._state;
    const isControllable =
      s === 'normal' ||
      s === 'ALIVE' ||
      s === 'dual' ||
      s === 'DUAL' ||
      s === 'respawning' ||
      s === 'RESPAWNING';

    if (!isControllable) {
      return false;
    }

    if (this.hasAntimatterPlasma) {
      return this.fireCooldownTimer <= 0;
    }

    const quota = this.getMaxMissileQuota();
    const volleySize = (this.isDual ? 2 : 1) * (this.hasScatterShot ? 3 : 1);
    return this.fireCooldownTimer <= 0 && (this.activeMissileCount + volleySize <= quota);
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
    else if (this._state === 'revive_pending' || (this._state as any) === 'REVIVE_PENDING') contractState = 'REVIVE_PENDING';
    else if (this._state === 'eliminated' || (this._state as any) === 'ELIMINATED') contractState = 'ELIMINATED';

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

  public isAlive(): boolean {
    const s = this._state;
    return (
      s !== 'destroyed' &&
      s !== 'DESTROYED' &&
      s !== 'eliminated' &&
      (s as any) !== 'ELIMINATED' &&
      (this.lives > 0 || s === 'respawning' || (s as any) === 'RESPAWNING')
    );
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
    this.reviveTimer = 0;
    this.captureTimer = 0;
    this.captureAngle = 0;
    this.rescuedFighter.active = false;
    this.activeMissileCount = 0;
    this.rapidFireTimer = 0;
    this.scatterShotTimer = 0;
    this.engineBoosterTimer = 0;
    this.hasShield = false;
    this.shieldHp = 0;
    this.shieldFlashTimer = 0;
    this.empBombCount = 0;
    this.animTimer = 0;
    this.isWarpRamActive = false;
    this.chronoFieldTimer = 0;
    this.reflectionShieldTimer = 0;
    this.hasReflectionShield = false;
    this.reflectionShieldHp = 0;
    this.empCollectorTimer = 0;
    this.phaseDriveTimer = 0;
    this.phaseWarpCooldown = 0;
    this.phaseGhostTimer = 0;
    this.plasmaBlasterTimer = 0;
    this.plasmaTickTimer = 0;
  }

  public applyPowerUp(type: PowerUpType | string): void {
    const norm = normalizePowerUpType(type);
    if (norm === PowerUpType.RAPID_FIRE) {
      this.rapidFireTimer = Math.min(30.0, this.rapidFireTimer + 15.0);
    } else if (norm === PowerUpType.SCATTER_SHOT) {
      this.scatterShotTimer = Math.min(30.0, this.scatterShotTimer + 15.0);
    } else if (norm === PowerUpType.ENGINE_BOOSTER) {
      this.engineBoosterTimer = Math.min(30.0, this.engineBoosterTimer + 15.0);
    } else if (norm === PowerUpType.KINETIC_SHIELD) {
      this.hasShield = true;
      this.shieldHp = 1;
    } else if (norm === PowerUpType.EMP_BOMB) {
      this.empBombCount = Math.min(3, this.empBombCount + 1);
    } else if (norm === PowerUpType.CHRONO_FIELD) {
      this.chronoFieldTimer = Math.min(20.0, this.chronoFieldTimer + 6.0);
      this.game?.soundSynth?.playChronoFieldActivate?.();
    } else if (norm === PowerUpType.REFLECTION_SHIELD) {
      this.hasReflectionShield = true;
      this.reflectionShieldTimer = Math.min(30.0, this.reflectionShieldTimer + 12.0);
      this.reflectionShieldHp = 3;
    } else if (norm === PowerUpType.EMP_COLLECTOR) {
      this.empCollectorTimer = Math.min(20.0, this.empCollectorTimer + 5.0);
    } else if (norm === PowerUpType.PHASE_DRIVE) {
      this.phaseDriveTimer = Math.min(30.0, this.phaseDriveTimer + 15.0);
    } else if (norm === PowerUpType.ANTIMATTER_PLASMA) {
      this.plasmaBlasterTimer = Math.min(25.0, this.plasmaBlasterTimer + 7.0);
    }
  }

  public isCoop(): boolean {
    if (!this.game) return false;
    return typeof this.game.isCoop === 'function'
      ? Boolean(this.game.isCoop())
      : Boolean(this.game.isCoop);
  }

  public respawn(): void {
    if (this.isCoop()) {
      this.x = this.id === 'p1' ? 80 : 144;
    } else {
      this.x = 112;
    }
    this.y = Player.BASELINE_Y;
    this.vx = 0;
    this.vy = 0;
    this._state = 'respawning';
    this.invulnerableTimer = Player.INVULNERABLE_DURATION;
    this.fireCooldownTimer = 0;
    this.deathTimer = 0;
    this.reviveTimer = 0;
    this.captureTimer = 0;
    this.captureAngle = 0;
    this.rescuedFighter.active = false;
  }

  // ==========================================================================
  // Update Pipeline (60 FPS Fixed Timestep)
  // ==========================================================================

  public update(dt: number, input?: InputState): void {
    const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);

    if (this._state === 'revive_pending' || (this._state as any) === 'REVIVE_PENDING') {
      this.updateRevivePending(safeDt);
      this.clampPosition();
      return;
    }
    if (this._state === 'eliminated' || (this._state as any) === 'ELIMINATED') {
      this.clampPosition();
      return;
    }

    this.animTimer += safeDt;

    if (this.shieldFlashTimer > 0) {
      this.shieldFlashTimer = Math.max(0, this.shieldFlashTimer - safeDt);
    }

    // 0. Update buff timers (paused during tractor beam capture)
    if (this._state !== 'capturing' && this._state !== 'CAPTURING') {
      if (this.rapidFireTimer > 0) {
        this.rapidFireTimer = Math.max(0, this.rapidFireTimer - safeDt);
      }
      if (this.scatterShotTimer > 0) {
        this.scatterShotTimer = Math.max(0, this.scatterShotTimer - safeDt);
      }
      if (this.engineBoosterTimer > 0) {
        this.engineBoosterTimer = Math.max(0, this.engineBoosterTimer - safeDt);
      }
      if (this.chronoFieldTimer > 0) {
        this.chronoFieldTimer = Math.max(0, this.chronoFieldTimer - safeDt);
      }
      if (this.reflectionShieldTimer > 0) {
        this.reflectionShieldTimer = Math.max(0, this.reflectionShieldTimer - safeDt);
        if (this.reflectionShieldTimer <= 0 && this.reflectionShieldHp <= 0) {
          this.hasReflectionShield = false;
        }
      }
      if (this.empCollectorTimer > 0) {
        this.empCollectorTimer = Math.max(0, this.empCollectorTimer - safeDt);
      }
      if (this.phaseDriveTimer > 0) {
        this.phaseDriveTimer = Math.max(0, this.phaseDriveTimer - safeDt);
      }
      if (this.plasmaBlasterTimer > 0) {
        this.plasmaBlasterTimer = Math.max(0, this.plasmaBlasterTimer - safeDt);
        this.plasmaTickTimer += safeDt;
        while (this.plasmaTickTimer >= 0.1) {
          this.plasmaTickTimer -= 0.1;
          this.onPlasmaBeamTick?.(this.x, this.y, this.isDual);
        }
      } else {
        this.plasmaTickTimer = 0;
      }
    }

    // 1. Update timers
    if (this.phaseWarpCooldown > 0) {
      this.phaseWarpCooldown = Math.max(0, this.phaseWarpCooldown - safeDt);
    }
    if (this.phaseGhostTimer > 0) {
      this.phaseGhostTimer = Math.max(0, this.phaseGhostTimer - safeDt);
    }
    if (this.fireCooldownTimer > 0) {
      this.fireCooldownTimer = Math.max(0, this.fireCooldownTimer - safeDt);
    }

    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - safeDt);
      if (this.invulnerableTimer === 0 && (this._state === 'respawning' || this._state === 'RESPAWNING')) {
        this._state = 'normal';
      }
    }

    // 2. Dispatch state-specific update routines
    const s = this._state;
    if (s === 'normal' || s === 'ALIVE' || s === 'dual' || s === 'DUAL' || s === 'respawning' || s === 'RESPAWNING') {
      this.updateControllable(safeDt, input);
    } else if (s === 'docking' || s === 'DOCKING') {
      this.updateDocking(safeDt, input);
    } else if (s === 'capturing' || s === 'CAPTURING') {
      this.updateCapturing(safeDt);
    } else if (s === 'captured' || s === 'CAPTURED') {
      // Idle in captured state waiting for stage/boss logic
    } else if (s === 'destroyed' || s === 'DESTROYED') {
      this.updateDestroyed(safeDt);
    }

    // Unconditionally clamp position at end of frame
    this.clampPosition();
  }

  private updateControllable(dt: number, input?: InputState): void {
    if (!input) return;

    // A. 1D Horizontal Steering
    let targetVx = 0;
    const currentSpeed = this.speed;

    const left = input.moveLeft || input.touchLeft;
    const right = input.moveRight || input.touchRight;

    if (left && !right) {
      targetVx = -currentSpeed;
    } else if (right && !left) {
      targetVx = currentSpeed;
    } else if (input.pointerActive && input.pointerX !== null && Number.isFinite(input.pointerX)) {
      // Pointer absolute steering with anti-jitter deadzone
      const dx = input.pointerX - this.x;
      if (Math.abs(dx) <= currentSpeed * dt) {
        this.x = input.pointerX;
        targetVx = 0;
      } else {
        targetVx = Math.sign(dx) * currentSpeed;
      }
    }

    this.vx = targetVx;
    this.x += this.vx * dt;

    // B. Boundary Clamping
    this.clampPosition();

    // Phase Warp input check (Milestone M19)
    if (this.phaseDriveTimer > 0 && this.phaseWarpCooldown <= 0 && this.game?.inputHandler) {
      const warpDir = this.game.inputHandler.consumePhaseWarp(this.id);
      if (warpDir !== null) {
        this.triggerPhaseWarp(warpDir);
      }
    }

    // C. Weapon Firing Logic
    if (input.fire || input.touchFire) {
      this.attemptFire();
    }
  }

  public triggerPhaseWarp(direction: number = 1): void {
    if (this.phaseWarpCooldown > 0) return;
    this.phaseGhostStartX = this.x;
    const offset = (direction >= 0 ? 1 : -1) * 40;
    const minX = this.isDual ? 16 : 12;
    const maxX = this.isDual ? 208 : 212;
    this.x = Math.max(minX, Math.min(maxX, this.x + offset));
    this.invulnerableTimer = Math.max(this.invulnerableTimer, 0.4);
    this.phaseGhostTimer = 0.4;
    this.phaseWarpCooldown = 0.5;
    this.game?.soundSynth?.playPhaseDriveBlink?.();
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
    // Rotate ship at 4.0 rot/s = 8*PI rad/s (1440 deg/s)
    this.captureAngle += Math.PI * 8 * dt;

    // Ascend along beam towards Boss Galaga
    const progress = Math.min(1.0, this.captureTimer / 2.5);
    this.y = this.captureOrigin.y + (this.captureTarget.y - this.captureOrigin.y) * progress;
    this.x = this.captureOrigin.x + (this.captureTarget.x - this.captureOrigin.x) * progress;

    if (progress >= 1.0) {
      this._state = 'captured';
      this.lives -= 1;
      this.onCapturedComplete?.(this.captureTarget.x, this.captureTarget.y);
      if (this.lives > 0) {
        this.respawn();
      } else if (this.isCoop()) {
        this._state = 'captured';
      } else {
        this.onGameOver?.();
      }
    }
  }

  public startRevivePending(countdown: number = 10.0): void {
    this._state = 'revive_pending';
    this.reviveTimer = countdown;
    this.x = this.id === 'p1' ? 80 : 144;
    this.y = Player.BASELINE_Y;
    this.vx = 0;
    this.vy = 0;
    this.game?.soundSynth?.playReviveEmergencyBeacon?.();
  }

  private updateRevivePending(dt: number): void {
    this.reviveTimer = Math.max(0, this.reviveTimer - dt);
    this.animTimer += dt;

    if (this.reviveTimer <= 0) {
      this._state = 'eliminated';
      this.onGameOver?.();
    }
  }

  private updateDestroyed(dt: number): void {
    this.deathTimer -= dt;
    if (this.deathTimer <= 0) {
      this.deathTimer = 0;
      if (this.lives > 0) {
        this.respawn();
      } else if (this.isCoop()) {
        this.startRevivePending(10.0);
      } else {
        this._state = 'destroyed';
        this.onGameOver?.();
      }
    }
  }

  // ==========================================================================
  // Weapon Firing Mechanism
  // ==========================================================================

  public attemptFire(): boolean {
    if (!this.canFire) {
      return false;
    }

    if (this.hasAntimatterPlasma) {
      this.fireCooldownTimer = 0.05;
      this.game?.soundSynth?.playPlasmaBeamPulse?.();
      return true;
    }

    // Rapid Fire halves weapon cooldown (120ms -> 60ms)
    this.fireCooldownTimer = this.hasRapidFire
      ? Player.FIRE_COOLDOWN * 0.5
      : Player.FIRE_COOLDOWN;

    const V = 480;
    const sin15 = 0.258819;
    const cos15 = 0.965926;
    const vxSpread = V * sin15; // ~124.23 px/s
    const vySpread = -V * cos15; // ~-463.64 px/s

    Player._spawnBuffer.length = 0;

    if (this.isDual) {
      const leftX = this.x - 8;
      const rightX = this.x + 8;
      const gunY = this.y - 8;

      if (this.hasScatterShot) {
        // Twin 3-way spreads (6 streams total)
        // Left Cannon
        Player.pushSpawn(leftX, gunY, -vxSpread, vySpread);
        Player.pushSpawn(leftX, gunY, 0, -V);
        Player.pushSpawn(leftX, gunY, vxSpread, vySpread);
        // Right Cannon
        Player.pushSpawn(rightX, gunY, -vxSpread, vySpread);
        Player.pushSpawn(rightX, gunY, 0, -V);
        Player.pushSpawn(rightX, gunY, vxSpread, vySpread);
      } else {
        // Standard Twin Parallel Missiles
        Player.pushSpawn(leftX, gunY, 0, -V);
        Player.pushSpawn(rightX, gunY, 0, -V);
      }
    } else {
      const gunX = this.x;
      const gunY = this.y - 8;

      if (this.hasScatterShot) {
        // Single Fighter 3-way spread (0°, ±15°)
        Player.pushSpawn(gunX, gunY, -vxSpread, vySpread);
        Player.pushSpawn(gunX, gunY, 0, -V);
        Player.pushSpawn(gunX, gunY, vxSpread, vySpread);
      } else {
        // Standard Single Missile
        Player.pushSpawn(gunX, gunY, 0, -V);
      }
    }

    this.onFire?.(Player._spawnBuffer);
    return true;
  }

  // ==========================================================================
  // Damage & Collision Handling
  // ==========================================================================

  public isInvulnerable(): boolean {
    if (this.isInvincibleCheat) {
      return true;
    }
    return (
      this.invulnerableTimer > 0 ||
      this._state === 'respawning' ||
      this._state === 'RESPAWNING' ||
      this._state === 'destroyed' ||
      this._state === 'DESTROYED' ||
      this._state === 'revive_pending' ||
      (this._state as any) === 'REVIVE_PENDING' ||
      this._state === 'eliminated' ||
      (this._state as any) === 'ELIMINATED'
    );
  }

  /**
   * Evaluates collision against a threat AABB (bullet or diving alien).
   * Supports Kinetic Deflector Shield absorption and asymmetrical partial destruction.
   */
  public hitTestAndDamage(threat: Rect): boolean {
    if (
      this.isInvulnerable() ||
      this._state === 'capturing' ||
      this._state === 'CAPTURING' ||
      this._state === 'captured' ||
      this._state === 'CAPTURED' ||
      this._state === 'revive_pending' ||
      (this._state as any) === 'REVIVE_PENDING' ||
      this._state === 'eliminated' ||
      (this._state as any) === 'ELIMINATED'
    ) {
      return false;
    }

    if (this.isDual) {
      const leftHull: Rect = {
        x: this.x - 16,
        y: this.y - 6,
        width: 16,
        height: 12,
      };
      const rightHull: Rect = {
        x: this.x,
        y: this.y - 6,
        width: 16,
        height: 12,
      };

      const hitLeft = this.checkAABB(threat, leftHull);
      const hitRight = this.checkAABB(threat, rightHull);

      if (hitLeft || hitRight) {
        // 0. Kinetic Reflection Shield Interception (Protects BOTH hulls & returns counter-missile)
        if (this.hasReflectionShieldActive) {
          this.reflectionShieldHp = Math.max(0, this.reflectionShieldHp - 1);
          if (this.reflectionShieldHp <= 0 && this.reflectionShieldTimer <= 0) {
            this.hasReflectionShield = false;
          }
          this.shieldFlashTimer = 0.3;
          this.invulnerableTimer = Math.max(this.invulnerableTimer, 0.5);
          this.onReflectionDeflect?.(this.x, this.y, threat);
          this.game?.soundSynth?.playReflectionDeflect?.();
          return false;
        }

        // 1. Kinetic Deflector Shield Interception (Protects BOTH hulls!)
        if (this.hasShield || this.shieldHp > 0) {
          this.hasShield = false;
          this.shieldHp = 0;
          this.shieldFlashTimer = 0.3;
          this.invulnerableTimer = Math.max(this.invulnerableTimer, 1.0);
          this.onShieldDeflect?.(this.x, this.y);
          return false;
        }

        // 2. Asymmetrical Damage Processing (Shield Depleted)
        if (hitLeft && !hitRight) {
          // Partial destruction: Left hull destroyed
          this.onExplode?.(this.x - 8, this.y, true);
          this._state = 'normal';
          this.x = Math.min(212, Math.max(12, this.x + 8));
          this.invulnerableTimer = Math.max(this.invulnerableTimer, 0.5);
          return true;
        } else if (hitRight && !hitLeft) {
          // Partial destruction: Right hull destroyed
          this.onExplode?.(this.x + 8, this.y, true);
          this._state = 'normal';
          this.x = Math.min(212, Math.max(12, this.x - 8));
          this.invulnerableTimer = Math.max(this.invulnerableTimer, 0.5);
          return true;
        } else if (hitLeft && hitRight) {
          // Catastrophic hit: Both hulls destroyed
          this.destroy();
          return true;
        }
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
        // 0. Kinetic Reflection Shield Interception
        if (this.hasReflectionShieldActive) {
          this.reflectionShieldHp = Math.max(0, this.reflectionShieldHp - 1);
          if (this.reflectionShieldHp <= 0 && this.reflectionShieldTimer <= 0) {
            this.hasReflectionShield = false;
          }
          this.shieldFlashTimer = 0.3;
          this.invulnerableTimer = Math.max(this.invulnerableTimer, 0.5);
          this.onReflectionDeflect?.(this.x, this.y, threat);
          this.game?.soundSynth?.playReflectionDeflect?.();
          return false;
        }

        // Kinetic Deflector Shield Interception
        if (this.hasShield || this.shieldHp > 0) {
          this.hasShield = false;
          this.shieldHp = 0;
          this.shieldFlashTimer = 0.3;
          this.invulnerableTimer = Math.max(this.invulnerableTimer, 1.0);
          this.onShieldDeflect?.(this.x, this.y);
          return false;
        }

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
    this.rapidFireTimer = 0;
    this.scatterShotTimer = 0;
    this.engineBoosterTimer = 0;
    this.hasShield = false;
    this.shieldHp = 0;
    this.shieldFlashTimer = 0;
    this.chronoFieldTimer = 0;
    this.reflectionShieldTimer = 0;
    this.hasReflectionShield = false;
    this.reflectionShieldHp = 0;
    this.empCollectorTimer = 0;
    this.phaseDriveTimer = 0;
    this.phaseWarpCooldown = 0;
    this.plasmaBlasterTimer = 0;
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

  public cancelCapture(): void {
    if (this._state === 'capturing' || (this._state as any) === 'CAPTURING') {
      this._state = 'normal';
      this.captureTimer = 0;
      this.captureAngle = 0;
      this.clampPosition();
      this.invulnerableTimer = 1.0;
    }
  }

  // ==========================================================================
  // Helper & Math Methods
  // ==========================================================================

  public clampPosition(): void {
    const isDual = this.isDual;
    const minX = isDual ? 16 : 12;
    const maxX = isDual ? 208 : 212;

    if (!Number.isFinite(this.x)) {
      this.x = this.id === 'p2' ? 144 : (minX + maxX) / 2;
      this.vx = 0;
    } else {
      this.x = Math.max(minX, Math.min(maxX, this.x));
    }

    if (!Number.isFinite(this.vx)) {
      this.vx = 0;
    }

    const isWarpRam = this.isWarpRamActive || (this.game?.specialMovesManager?.isWarpRamActive?.() ?? false);
    const isCapturing = this._state === 'capturing' || (this._state as any) === 'CAPTURING';
    if (!isWarpRam && !isCapturing) {
      this.y = Player.BASELINE_Y;
    }
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
      this._state === 'CAPTURED' ||
      this._state === 'eliminated' ||
      (this._state as any) === 'ELIMINATED'
    ) {
      return;
    }

    const isP2 = this.id === 'p2' || this.colorScheme === 'crimson';
    const fighterSprite = isP2 ? 'PLAYER_FIGHTER_P2' : 'PLAYER_FIGHTER';
    const dualSprite = isP2 ? 'DUAL_FIGHTER_P2' : 'DUAL_FIGHTER';

    const s = this._state;

    // Special rendering for Co-op REVIVE_PENDING state
    if (s === 'revive_pending' || (s as any) === 'REVIVE_PENDING') {
      ctx.save();
      // Expanding circular beacon pulse
      const waveRadius = ((this.animTimer * 24) % 32);
      ctx.strokeStyle = isP2 ? '#FF3333' : '#00FFFF';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, waveRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Ship at 50% opacity
      ctx.globalAlpha = 0.5;
      SpriteRenderer.draw(ctx, fighterSprite, this.x, this.y);

      // Cyan/crimson wireframe strobe
      if (Math.floor(this.animTimer * 4) % 2 === 0) {
        ctx.strokeStyle = isP2 ? '#FF4444' : '#00E5FF';
        ctx.strokeRect(this.x - 7, this.y - 7, 14, 14);
      }

      // Overhead text badge: REVIVE ${Math.ceil(this.reviveTimer)}S in yellow/red
      ctx.globalAlpha = 1.0;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.reviveTimer > 3.0 ? '#FFFF00' : (Math.floor(this.animTimer * 10) % 2 === 0 ? '#FF2222' : '#FFFFFF');
      ctx.fillText(`REVIVE ${Math.ceil(this.reviveTimer)}S`, Math.round(this.x), Math.round(this.y - 14));
      ctx.restore();
      return;
    }

    // 10Hz blinking during invulnerability / respawn
    if (!this.isInvincibleCheat && this.isInvulnerable()) {
      const isVisible = Math.floor(this.invulnerableTimer * 10) % 2 === 0;
      if (!isVisible) return;
    }
    if (s === 'capturing' || s === 'CAPTURING') {
      // Spinning capture sprite
      SpriteRenderer.draw(ctx, 'CAPTURED_FIGHTER', this.x, this.y, {
        rotation: this.captureAngle,
      });
    } else if (this.isDual) {
      // Dual fighter composite sprite
      SpriteRenderer.draw(ctx, dualSprite, this.x, this.y);
    } else if (s === 'docking' || s === 'DOCKING') {
      // Active ship
      SpriteRenderer.draw(ctx, fighterSprite, this.x, this.y);
      // Rescued ship descending
      if (this.rescuedFighter.active) {
        SpriteRenderer.draw(
          ctx,
          fighterSprite,
          this.rescuedFighter.x,
          this.rescuedFighter.y
        );
      }
    } else {
      // Standard single fighter
      SpriteRenderer.draw(ctx, fighterSprite, this.x, this.y);
    }

    // Render Engine Booster Thrusters
    if (this.hasEngineBooster) {
      ctx.save();
      ctx.fillStyle = isP2 ? '#FF7F00' : '#00FFFF';
      if (this.isDual) {
        ctx.fillRect(Math.round(this.x - 8 - 1), Math.round(this.y + 7), 2, 4);
        ctx.fillRect(Math.round(this.x + 8 - 1), Math.round(this.y + 7), 2, 4);
      } else {
        ctx.fillRect(Math.round(this.x - 1), Math.round(this.y + 7), 2, 4);
      }
      ctx.restore();
    }

    // Render Chrono Field Distortion Ring
    if (this.hasChronoField) {
      SpriteRenderer.drawChronoFieldRing(ctx, this.x, this.y, 120, this.animTimer);
    }

    // Render Singularity EMP Collector Vortex
    if (this.hasEmpCollector) {
      SpriteRenderer.drawEmpCollectorVortex(ctx, this.x, this.y, 90, this.animTimer);
    }

    // Render Quantum Phase Drive Ghost Trail
    if (this.phaseGhostTimer > 0) {
      SpriteRenderer.drawPhaseDriveGhostTrail(
        ctx,
        this.phaseGhostStartX,
        this.y,
        this.x,
        this.y,
        this.isDual,
        this.phaseGhostTimer,
        isP2 ? 'crimson' : 'classic'
      );
    }

    // Render Antimatter Plasma Beam
    if (this.hasAntimatterPlasma) {
      SpriteRenderer.drawAntimatterPlasmaBeam(ctx, this.x, this.y, this.isDual, this.animTimer);
    }

    // Render Kinetic Reflection Shield Barrier
    if (this.hasReflectionShieldActive) {
      SpriteRenderer.drawReflectionHexShield(
        ctx,
        this.x,
        this.y,
        this.isDual,
        this.shieldFlashTimer,
        this.animTimer
      );
    } else if (this.hasShield || this.shieldFlashTimer > 0) {
      // Render Kinetic Deflector Shield Barrier (Amber for P2, Cyan for P1)
      SpriteRenderer.drawPlayerShieldBarrier(
        ctx,
        this.x,
        this.y,
        this.isDual,
        this.shieldFlashTimer,
        this.animTimer,
        isP2 ? 'amber' : 'classic'
      );
    }
  }
}

export { Player as PlayerEntity };
