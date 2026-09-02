/**
 * Galaga Arcade Web Game — Enemy Unit Entity Hierarchy
 * 
 * Implements Zako, Goei, Boss Galaga, and Captured Fighter entities with:
 * - 7-state finite-state machine (entering, formation, diving, tractor_beam, captured_escort, destroyed, inactive).
 * - Authentic hit points: Zako (1), Goei (1), Boss Galaga (2 hits: Green -> Blue -> Destroyed).
 * - Exact arcade point matrix (formation kills vs diving solo/escort kills).
 * - 2-frame wing fluttering animation (0.25s frame duration, 4Hz).
 * - Directed bullet firing towards player baseline position with stage speed scaling.
 * - Zero-allocation ObjectPool reuse lifecycle integration.
 */

import { SpriteRenderer } from '../renderer/SpriteRenderer';
import { EnemyType, EnemyState } from '../types';
import type { Poolable, Rect } from '../types';
import type { CompositeBezierPath } from '../math/Bezier';

export interface EnemyConfig {
  id?: number | string;
  type?: EnemyType;
  row?: number;
  col?: number;
  x?: number;
  y?: number;
}

export interface EnemyDamageResult {
  destroyed: boolean;
  points: number;
  wasDamaged: boolean;
}

export interface EnemyBulletRequest {
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  speed?: number;
}

export class Enemy implements Poolable {
  // Static Constants
  public static readonly WING_FRAME_DURATION = 0.25; // 250ms per animation frame
  public static readonly DAMAGE_FLASH_DURATION = 0.08; // 80ms white/color flash
  public static readonly EXPLOSION_DURATION = 0.30; // 300ms explosion delay
  public static readonly BASE_WIDTH = 16;
  public static readonly BASE_HEIGHT = 16;
  public static readonly CORE_HITBOX_SIZE = 12;

  // Identity & Grid Placement
  public id: number | string = 0;
  public type: EnemyType = EnemyType.ZAKO;
  public state: EnemyState = EnemyState.IN_FORMATION;
  public active: boolean = false;
  public row: number = 0;
  public col: number = 0;

  // Position, Velocity & Orientation
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public rotation: number = 0; // Radians (0 = facing straight UP / -Y, PI = facing DOWN)

  // Health & Visual Hit Feedback
  public maxHealth: number = 1;
  public health: number = 1;
  public damageFlashTimer: number = 0;
  public deathTimer: number = 0;

  // Wing Flutter Animation State
  public animTimer: number = 0;
  public animFrame: number = 0; // 0 or 1

  // Dive Flight & Escort State
  public escortCount: number = 0; // 0, 1, or 2 (used for Boss dive scoring)
  public escortBossId: number | string | null = null;
  public escortBoss: Enemy | null = null;
  public diveTimer: number = 0;
  public diveSpeed: number = 160; // Pixels per second
  public returnSlotX: number = 0;
  public returnSlotY: number = 0;

  // Path Tracking
  public flightPath: CompositeBezierPath | null = null;
  public pathElapsedMs: number = 0;

  // Weapon / Firing Parameters
  public canShoot: boolean = true;
  public fireCooldownTimer: number = 0;

  // Callbacks
  public onFireBullet?: (request: EnemyBulletRequest) => void;
  public onExplode?: (x: number, y: number, type: EnemyType) => void;

  constructor(config?: EnemyConfig) {
    if (config) {
      this.init(
        config.id ?? 0,
        config.type ?? EnemyType.ZAKO,
        config.row ?? 0,
        config.col ?? 0,
        config.x ?? 0,
        config.y ?? 0
      );
    } else {
      this.reset();
    }
  }

  /**
   * Initializes enemy unit upon acquisition from ObjectPool.
   */
  public init(
    id: number | string,
    type: EnemyType,
    row: number,
    col: number,
    x: number,
    y: number
  ): this {
    this.id = id;
    this.type = type;
    this.row = row;
    this.col = col;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.rotation = 0;
    this.active = true;
    this.state = EnemyState.IN_FORMATION;

    // Set Max Health based on hierarchy
    if (type === EnemyType.BOSS) {
      this.maxHealth = 2;
      this.health = 2;
    } else {
      this.maxHealth = 1;
      this.health = 1;
    }

    this.damageFlashTimer = 0;
    this.deathTimer = 0;
    this.animTimer = Math.random() * Enemy.WING_FRAME_DURATION; // Stagger wing flutter phase
    this.animFrame = 0;
    this.escortCount = 0;
    this.escortBossId = null;
    this.escortBoss = null;
    this.diveTimer = 0;
    this.diveSpeed = 160;
    this.flightPath = null;
    this.pathElapsedMs = 0;
    this.canShoot = true;
    this.fireCooldownTimer = 0;

    return this;
  }

  /**
   * Resets all fields for zero-allocation pool recycling.
   */
  public reset(): void {
    this.id = 0;
    this.type = EnemyType.ZAKO;
    this.state = EnemyState.INACTIVE;
    this.active = false;
    this.row = 0;
    this.col = 0;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.rotation = 0;
    this.maxHealth = 1;
    this.health = 1;
    this.damageFlashTimer = 0;
    this.deathTimer = 0;
    this.animTimer = 0;
    this.animFrame = 0;
    this.escortCount = 0;
    this.escortBossId = null;
    this.escortBoss = null;
    this.diveTimer = 0;
    this.diveSpeed = 160;
    this.returnSlotX = 0;
    this.returnSlotY = 0;
    this.flightPath = null;
    this.pathElapsedMs = 0;
    this.canShoot = true;
    this.fireCooldownTimer = 0;
  }

  // ==========================================================================
  // Scoring Matrix Engine
  // ==========================================================================

  /**
   * Calculates point value awarded for destroying this enemy in its current state.
   */
  public getScoreValue(): number {
    const isDiving =
      this.state === EnemyState.DIVING_SOLO ||
      this.state === EnemyState.DIVING_ESCORT ||
      this.state === EnemyState.TRACTOR_BEAM_ACTIVE;

    switch (this.type) {
      case EnemyType.ZAKO:
        return isDiving ? 100 : 50;

      case EnemyType.GOEI:
        return isDiving ? 160 : 80;

      case EnemyType.BOSS:
        if (!isDiving) {
          return 150;
        }
        if (this.escortCount === 0) {
          return 400; // Solo dive
        } else if (this.escortCount === 1) {
          return 800; // Diving with 1 escort
        } else {
          return 1600; // Diving with 2 escorts
        }

      case EnemyType.CAPTURED_FIGHTER:
        return 1000;

      case EnemyType.TRANSFORM:
        return 160; // Base morph bonus

      default:
        return 50;
    }
  }

  // ==========================================================================
  // Hit & Damage Handling
  // ==========================================================================

  /**
   * Applies damage to this enemy unit.
   * Returns outcome containing destroyed status, score points, and damage indicator.
   */
  public takeDamage(amount: number = 1): EnemyDamageResult {
    if (!this.active || this.state === EnemyState.EXPLODING || this.state === EnemyState.INACTIVE) {
      return { destroyed: false, points: 0, wasDamaged: false };
    }

    this.health -= amount;
    this.damageFlashTimer = Enemy.DAMAGE_FLASH_DURATION;

    if (this.health <= 0) {
      const awardedPoints = this.getScoreValue();
      this.state = EnemyState.EXPLODING;
      this.deathTimer = Enemy.EXPLOSION_DURATION;

      // Decrement diving Boss active escortCount when escort is killed mid-dive
      if (this.escortBoss && this.escortBoss.active && this.escortBoss.escortCount > 0) {
        this.escortBoss.escortCount = Math.max(0, this.escortBoss.escortCount - 1);
      }

      this.onExplode?.(this.x, this.y, this.type);
      return { destroyed: true, points: awardedPoints, wasDamaged: true };
    } else {
      // Non-fatal hit (e.g. Boss Galaga Hit 1: 2 HP -> 1 HP)
      return { destroyed: false, points: 0, wasDamaged: true };
    }
  }

  // ==========================================================================
  // Update Pipeline (60 FPS Fixed Timestep)
  // ==========================================================================

  public update(dt: number, playerX: number = 112, playerY: number = 250): void {
    if (!this.active || this.state === EnemyState.INACTIVE) {
      return;
    }

    // 1. Update Damage Flash Timer
    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt);
    }

    // 2. Update Wing Flutter Animation
    this.animTimer += dt;
    if (this.animTimer >= Enemy.WING_FRAME_DURATION) {
      this.animTimer -= Enemy.WING_FRAME_DURATION;
      this.animFrame = (this.animFrame + 1) % 2;
    }

    // 3. Update Fire Cooldown
    if (this.fireCooldownTimer > 0) {
      this.fireCooldownTimer = Math.max(0, this.fireCooldownTimer - dt);
    }

    // 4. State Dispatch
    switch (this.state) {
      case EnemyState.IN_FORMATION:
        // Position is driven externally by FormationManager slot coordinates
        this.rotation = 0;
        break;

      case EnemyState.ENTERING:
        this.updatePathFlight(dt, EnemyState.IN_FORMATION);
        break;

      case EnemyState.DIVING_SOLO:
      case EnemyState.DIVING_ESCORT:
        this.updateDiving(dt, playerX, playerY);
        break;

      case EnemyState.TRACTOR_BEAM_ACTIVE:
        // Hover at tractor beam altitude
        this.rotation = 0;
        break;

      case EnemyState.RETURNING_TO_FORMATION:
        this.updateReturning(dt);
        break;

      case EnemyState.EXPLODING:
        this.deathTimer -= dt;
        if (this.deathTimer <= 0) {
          this.active = false;
          this.state = EnemyState.INACTIVE;
        }
        break;

      default:
        break;
    }
  }

  private updatePathFlight(dt: number, nextState: EnemyState): void {
    if (!this.flightPath) {
      this.state = nextState;
      this.rotation = 0;
      return;
    }

    this.pathElapsedMs += dt * 1000;
    const sample = this.flightPath.evaluateTime(this.pathElapsedMs, Math.PI / 2);

    this.x = sample.position.x;
    this.y = sample.position.y;
    this.vx = sample.velocity.x;
    this.vy = sample.velocity.y;
    this.rotation = sample.heading;

    if (sample.isComplete) {
      this.flightPath = null;
      this.pathElapsedMs = 0;
      this.state = nextState;
      this.rotation = 0;
      if (nextState === EnemyState.IN_FORMATION) {
        this.escortCount = 0;
        this.escortBossId = null;
        this.escortBoss = null;
      }
    }
  }

  private updateDiving(dt: number, _playerX: number, _playerY: number): void {
    this.diveTimer += dt;

    if (this.flightPath) {
      this.pathElapsedMs += dt * 1000;
      const sample = this.flightPath.evaluateTime(this.pathElapsedMs, Math.PI / 2);

      this.x = sample.position.x;
      this.y = sample.position.y;
      this.vx = sample.velocity.x;
      this.vy = sample.velocity.y;
      this.rotation = sample.heading;

      // Bottom screen wrap-around or path completion past bottom
      if (sample.isComplete || this.y > 288 + Enemy.BASE_HEIGHT) {
        this.flightPath = null;
        this.pathElapsedMs = 0;
        this.y = -Enemy.BASE_HEIGHT;
        this.state = EnemyState.RETURNING_TO_FORMATION;
        this.vx = 0;
        this.vy = this.diveSpeed * 0.8;
        this.rotation = 0;
      }
    } else {
      // Kinematic fallback
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1) {
        this.rotation = Math.atan2(this.vy, this.vx) + Math.PI / 2;
      }

      // Check bottom-of-screen wrap-around (Y > 288 + 16)
      if (this.y > 288 + Enemy.BASE_HEIGHT) {
        this.y = -Enemy.BASE_HEIGHT;
        this.state = EnemyState.RETURNING_TO_FORMATION;
        this.vx = 0;
        this.vy = this.diveSpeed * 0.8;
        this.rotation = 0;
      }
    }
  }

  private updateReturning(dt: number): void {
    if (this.flightPath) {
      this.updatePathFlight(dt, EnemyState.IN_FORMATION);
      return;
    }

    // Direct interpolation downward toward assigned home slot
    const targetX = this.returnSlotX;
    const targetY = this.returnSlotY;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 4 || (this.y >= targetY && Math.abs(dx) < 6)) {
      this.x = targetX;
      this.y = targetY;
      this.vx = 0;
      this.vy = 0;
      this.rotation = 0;
      this.state = EnemyState.IN_FORMATION;
      this.escortCount = 0;
      this.escortBossId = null;
      this.escortBoss = null;
    } else {
      const speed = this.diveSpeed * 0.9;
      this.x += (dx / dist) * speed * dt;
      this.y += (dy / dist) * speed * dt;
      this.rotation = Math.atan2(dy, dx) + Math.PI / 2;
    }
  }

  // ==========================================================================
  // Attack & Firing Routines
  // ==========================================================================

  /**
   * Attempts to discharge an aimed bullet toward the player ship position.
   */
  public attemptFire(playerX: number, playerY: number, bulletSpeed: number = 200): boolean {
    if (!this.canShoot || !this.active || this.fireCooldownTimer > 0) {
      return false;
    }

    // Prohibit firing if offscreen
    if (this.y < 0 || this.y > 270) {
      return false;
    }

    this.fireCooldownTimer = 1.5 + Math.random() * 2.0; // 1.5s - 3.5s cooldown

    this.onFireBullet?.({
      originX: this.x,
      originY: this.y + 6,
      targetX: playerX,
      targetY: playerY,
      speed: bulletSpeed,
    });

    return true;
  }

  // ==========================================================================
  // Hitbox & Collision Bounds
  // ==========================================================================

  public getHitbox(): Rect {
    const halfSize = Enemy.CORE_HITBOX_SIZE / 2;
    return {
      x: this.x - halfSize,
      y: this.y - halfSize,
      width: Enemy.CORE_HITBOX_SIZE,
      height: Enemy.CORE_HITBOX_SIZE,
    };
  }

  // ==========================================================================
  // Canvas Rendering Pipeline
  // ==========================================================================

  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.active || this.state === EnemyState.INACTIVE) {
      return;
    }

    if (this.state === EnemyState.EXPLODING) {
      // Small explosion / flash indicator
      ctx.save();
      ctx.fillStyle = '#FFFF00';
      const rad = 6 * (1 - this.deathTimer / Enemy.EXPLOSION_DURATION) + 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    SpriteRenderer.drawEnemy(
      ctx,
      this.type,
      this.x,
      this.y,
      this.animFrame,
      this.health,
      this.rotation
    );
  }
}
