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
import { EnemyType, EnemyState, type StageTier, type EnemyDamageResult } from '../types';
import type { Poolable, Rect } from '../types';
import type { CompositeBezierPath } from '../math/Bezier';

export { type EnemyDamageResult };

export interface EnemyConfig {
  id?: number | string;
  type?: EnemyType;
  row?: number;
  col?: number;
  x?: number;
  y?: number;
  tier?: StageTier;
  health?: number;
  maxHealth?: number;
  shield?: number;
  maxShield?: number;
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
  public static readonly SHIELD_FLASH_DURATION = 0.10; // 100ms shield impact flash
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

  // Tier, Health & Kinetic Shield Defense
  public tier: StageTier = 'CLASSIC';
  public maxHealth: number = 1;
  public health: number = 1;
  public maxShield: number = 0;
  public shield: number = 0;
  public damageFlashTimer: number = 0;
  public shieldFlashTimer: number = 0;
  public deathTimer: number = 0;

  // Wing Flutter Animation State
  public animTimer: number = 0;
  public animFrame: number = 0; // 0 or 1

  // Dive Flight & Escort State
  public escortCount: number = 0; // 0, 1, or 2 (used for Boss dive scoring)
  public escortBossId: number | string | null = null;
  public escortBoss: Enemy | null = null;
  public hasCapturedFighter: boolean = false;
  public capturedFighterEnemy: Enemy | null = null;
  public diveTimer: number = 0;
  public diveSpeed: number = 160; // Pixels per second
  public speedMultiplier: number = 1.0;
  public returnSlotX: number = 0;
  public returnSlotY: number = 0;

  // Path Tracking
  public flightPath: CompositeBezierPath | null = null;
  public pathElapsedMs: number = 0;
  public hasStartedPath: boolean = false;

  // Weapon / Firing Parameters
  public canShoot: boolean = true;
  public fireCooldownTimer: number = 0;
  public shotsRemainingInDive: number = 1;
  public isChallenging: boolean = false;

  // M18 Glitch & Anomalous Kinematics
  public isGlitched: boolean = false;
  public glitchOffsetX: number = 0;
  public glitchOffsetY: number = 0;
  public glitchDisplacementX: number = 0;
  public glitchDisplacementY: number = 0;
  public glitchKinematicVx: number = 0;
  public glitchKinematicVy: number = 0;
  public isTeleporting: boolean = false;
  public teleportTimer: number = 0;
  public isKineticInverted: boolean = false;
  public kineticInversionTimer: number = 0;
  public canSpawnMirageClone: boolean = false;
  public isTractorDiving: boolean = false;

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
        config.y ?? 0,
        config.tier ?? 'CLASSIC',
        config.health ?? config.maxHealth,
        config.shield ?? config.maxShield
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
    y: number,
    tier: StageTier = 'CLASSIC',
    health?: number,
    shield?: number
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
    this.tier = tier;

    // Set Max Health based on hierarchy or explicit override
    if (health !== undefined) {
      this.maxHealth = health;
      this.health = health;
    } else if (type === EnemyType.BOSS) {
      this.maxHealth = 2;
      this.health = 2;
    } else {
      this.maxHealth = 1;
      this.health = 1;
    }

    if (shield !== undefined) {
      this.maxShield = shield;
      this.shield = shield;
    } else {
      this.maxShield = 0;
      this.shield = 0;
    }

    this.damageFlashTimer = 0;
    this.shieldFlashTimer = 0;
    this.deathTimer = 0;
    this.animTimer = Math.random() * Enemy.WING_FRAME_DURATION; // Stagger wing flutter phase
    this.animFrame = 0;
    this.escortCount = 0;
    this.escortBossId = null;
    this.escortBoss = null;
    this.hasCapturedFighter = false;
    this.capturedFighterEnemy = null;
    this.diveTimer = 0;
    this.diveSpeed = 160;
    this.speedMultiplier = 1.0;
    this.flightPath = null;
    this.pathElapsedMs = 0;
    this.hasStartedPath = false;
    this.canShoot = true;
    this.fireCooldownTimer = 0;
    this.shotsRemainingInDive = tier === 'DREADNOUGHT' ? 3 : tier === 'ELITE' ? 2 : 1;
    this.isChallenging = false;

    return this;
  }

  /**
   * Updates enemy difficulty parameters dynamically.
   */
  public setDifficulty(
    health: number,
    shield: number,
    tier: StageTier = 'CLASSIC',
    speedMultiplier: number = 1.0
  ): void {
    this.maxHealth = health;
    this.health = health;
    this.maxShield = shield;
    this.shield = shield;
    this.tier = tier;
    this.speedMultiplier = speedMultiplier;
    this.diveSpeed = 160 * speedMultiplier;
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
    this.tier = 'CLASSIC';
    this.maxHealth = 1;
    this.health = 1;
    this.maxShield = 0;
    this.shield = 0;
    this.damageFlashTimer = 0;
    this.shieldFlashTimer = 0;
    this.deathTimer = 0;
    this.animTimer = 0;
    this.animFrame = 0;
    this.escortCount = 0;
    this.escortBossId = null;
    this.escortBoss = null;
    this.hasCapturedFighter = false;
    this.capturedFighterEnemy = null;
    this.diveTimer = 0;
    this.diveSpeed = 160;
    this.speedMultiplier = 1.0;
    this.returnSlotX = 0;
    this.returnSlotY = 0;
    this.flightPath = null;
    this.pathElapsedMs = 0;
    this.hasStartedPath = false;
    this.canShoot = true;
    this.fireCooldownTimer = 0;
    this.shotsRemainingInDive = 1;
    this.isChallenging = false;
    this.isGlitched = false;
    this.glitchOffsetX = 0;
    this.glitchOffsetY = 0;
    this.glitchDisplacementX = 0;
    this.glitchDisplacementY = 0;
    this.glitchKinematicVx = 0;
    this.glitchKinematicVy = 0;
    this.isTeleporting = false;
    this.teleportTimer = 0;
    this.isKineticInverted = false;
    this.kineticInversionTimer = 0;
    this.canSpawnMirageClone = false;
    this.isTractorDiving = false;
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
      return {
        destroyed: false,
        points: 0,
        wasDamaged: false,
        shieldAbsorbed: false,
        remainingShield: this.shield,
        remainingHealth: this.health,
      };
    }

    // 1. Kinetic Shield Absorption (Dreadnought Tier / Crisis Shield)
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      const overflow = amount - absorbed;
      this.shieldFlashTimer = Enemy.SHIELD_FLASH_DURATION;
      this.damageFlashTimer = Enemy.DAMAGE_FLASH_DURATION;

      // Handle massive catastrophic overflow (e.g. ship collision amount >= 99)
      if (overflow > 0 && amount >= 99) {
        this.health -= overflow;
        if (this.health <= 0) {
          const awardedPoints = this.getScoreValue();
          this.state = EnemyState.EXPLODING;
          this.deathTimer = Enemy.EXPLOSION_DURATION;

          if (this.escortBoss && this.escortBoss.active && this.escortBoss.escortCount > 0) {
            this.escortBoss.escortCount = Math.max(0, this.escortBoss.escortCount - 1);
          }

          this.onExplode?.(this.x, this.y, this.type);
          return {
            destroyed: true,
            points: awardedPoints,
            wasDamaged: true,
            shieldAbsorbed: true,
            remainingShield: 0,
            remainingHealth: 0,
          };
        }
      }

      return {
        destroyed: false,
        points: 0,
        wasDamaged: true,
        shieldAbsorbed: true,
        remainingShield: this.shield,
        remainingHealth: this.health,
      };
    }

    // 2. Hull Health Depletion
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
      return {
        destroyed: true,
        points: awardedPoints,
        wasDamaged: true,
        shieldAbsorbed: false,
        remainingShield: 0,
        remainingHealth: 0,
      };
    } else {
      // Non-fatal hit (e.g. Boss Galaga Hit 1: 2 HP -> 1 HP or Elite Zako/Goei 2 HP -> 1 HP)
      return {
        destroyed: false,
        points: 0,
        wasDamaged: true,
        shieldAbsorbed: false,
        remainingShield: 0,
        remainingHealth: this.health,
      };
    }
  }

  // ==========================================================================
  // Update Pipeline (60 FPS Fixed Timestep)
  // ==========================================================================

  public update(dt: number, playerX: number = 112, playerY: number = 250): void {
    if (!this.active || this.state === EnemyState.INACTIVE) {
      return;
    }

    // 1. Update Damage & Shield Flash Timers
    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt);
    }
    if (this.shieldFlashTimer > 0) {
      this.shieldFlashTimer = Math.max(0, this.shieldFlashTimer - dt);
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
    if (
      this.type === EnemyType.CAPTURED_FIGHTER &&
      this.escortBoss &&
      this.escortBoss.active &&
      this.state !== EnemyState.CAPTURED_HOSTILE &&
      this.state !== EnemyState.EXPLODING
    ) {
      if (this.escortBoss.state === EnemyState.IN_FORMATION) {
        this.x = this.escortBoss.x;
        this.y = this.escortBoss.y - 16;
        this.rotation = 0;
        this.state = EnemyState.IN_FORMATION;
      } else if (
        this.escortBoss.state === EnemyState.DIVING_ESCORT ||
        this.escortBoss.state === EnemyState.DIVING_SOLO ||
        this.escortBoss.state === EnemyState.TRACTOR_BEAM_ACTIVE
      ) {
        const angle = this.escortBoss.rotation;
        this.x = this.escortBoss.x - 16 * Math.sin(angle);
        this.y = this.escortBoss.y - 16 * Math.cos(angle);
        this.rotation = this.escortBoss.rotation;
        this.state = EnemyState.DIVING_ESCORT;
      } else if (this.escortBoss.state === EnemyState.RETURNING_TO_FORMATION) {
        this.x = this.escortBoss.x;
        this.y = this.escortBoss.y - 16;
        this.rotation = this.escortBoss.rotation;
        this.state = EnemyState.RETURNING_TO_FORMATION;
      }
      return;
    }

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
      case EnemyState.CAPTURED_HOSTILE:
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
      if (!this.hasStartedPath || this.y < 0 || this.x < 0 || this.x > 224) {
        // Offscreen waiting for subwave launch; do not dock or transition yet
        return;
      }

      if (nextState === EnemyState.IN_FORMATION) {
        // Closed-loop terminal docking blend toward live slot
        const dx = this.returnSlotX - this.x;
        const dy = this.returnSlotY - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= 0.8) {
          this.x = this.returnSlotX;
          this.y = this.returnSlotY;
          this.vx = 0;
          this.vy = 0;
          this.rotation = 0;
          this.state = EnemyState.IN_FORMATION;
          this.escortCount = 0;
          this.escortBossId = null;
          this.escortBoss = null;
        } else {
          // Smoothly glide remaining sub-pixel / multi-pixel delta at <= 2.5 px/frame
          const dockingSpeed = Math.max(75, dist * 10);
          const step = Math.min(2.5, Math.min(dist, dockingSpeed * dt));
          this.x += (dx / dist) * step;
          this.y += (dy / dist) * step;
          const invDt = dt > 0.0001 ? 1 / dt : 60;
          this.vx = (dx / dist) * (step * invDt);
          this.vy = (dy / dist) * (step * invDt);

          const angleDiff = ((-this.rotation + Math.PI) % (2 * Math.PI)) - Math.PI;
          this.rotation += angleDiff * Math.min(1.0, 12.0 * dt);
        }
      } else {
        this.state = nextState;
        this.rotation = 0;
      }
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
      if (nextState === EnemyState.IN_FORMATION) {
        // Do not snap immediately if distance to live slot > 0.8px; allow 1-3 docking frames
        const distToSlot = Math.hypot(this.returnSlotX - this.x, this.returnSlotY - this.y);
        if (distToSlot <= 0.8) {
          this.x = this.returnSlotX;
          this.y = this.returnSlotY;
          this.state = EnemyState.IN_FORMATION;
          this.rotation = 0;
          this.escortCount = 0;
          this.escortBossId = null;
          this.escortBoss = null;
        }
        // If distToSlot > 0.8, flightPath is now null, next tick will execute smooth arrival docking above
      } else {
        this.state = nextState;
        this.rotation = 0;
      }
    }
  }

  private updateDiving(dt: number, _playerX: number, _playerY: number): void {
    this.diveTimer += dt;

    if (this.flightPath) {
      this.pathElapsedMs += dt * 1000;
      const sample = this.flightPath.evaluateTime(this.pathElapsedMs, Math.PI / 2);

      // Strict Immunity Invariant: Challenging stages and Epic Bosses are never afflicted
      const isImmune = this.isChallenging || Boolean((this as any).isEpicBoss);

      if (!isImmune && this.isGlitched) {
        // 1. Quantum Teleportation Update
        if (this.isTeleporting) {
          this.teleportTimer -= dt;
          if (this.teleportTimer <= 0) {
            this.isTeleporting = false;
          }
        }

        // 2. Kinetic Inversion Update
        if (this.isKineticInverted) {
          this.kineticInversionTimer -= dt;
          // Anti-gravity upward acceleration (-450 px/s^2)
          this.glitchKinematicVy -= 450 * dt;
          this.glitchDisplacementY += this.glitchKinematicVy * dt;

          // Tangent-normal orthogonal lateral impulse
          const tangentX = sample.velocity.x;
          const tangentY = sample.velocity.y;
          const tangentLen = Math.hypot(tangentX, tangentY);
          if (tangentLen > 0.001) {
            const normalX = -tangentY / tangentLen;
            this.glitchDisplacementX += normalX * this.glitchKinematicVx * dt;
          }

          if (this.kineticInversionTimer <= 0) {
            this.isKineticInverted = false;
          }
        } else {
          // Smooth decay back to zero displacement (bounded step ensures displacement change <= 5 px/frame at 60Hz)
          const decay = Math.exp(-2.0 * dt);
          const maxStep = 300 * dt; // 5 px per frame at 60Hz
          const targetX = this.glitchDisplacementX * decay;
          const targetY = this.glitchDisplacementY * decay;

          if (targetX > this.glitchDisplacementX) {
            this.glitchDisplacementX = Math.min(targetX, this.glitchDisplacementX + maxStep);
          } else {
            this.glitchDisplacementX = Math.max(targetX, this.glitchDisplacementX - maxStep);
          }

          if (targetY > this.glitchDisplacementY) {
            this.glitchDisplacementY = Math.min(targetY, this.glitchDisplacementY + maxStep);
          } else {
            this.glitchDisplacementY = Math.max(targetY, this.glitchDisplacementY - maxStep);
          }

          this.glitchKinematicVx *= decay;
          this.glitchKinematicVy *= decay;
        }

        // Additive lateral & vertical displacement evaluation
        const rawX = sample.position.x + this.glitchOffsetX + this.glitchDisplacementX;
        const rawY = sample.position.y + this.glitchOffsetY + this.glitchDisplacementY;

        this.x = Math.max(16, Math.min(208, rawX));
        this.y = rawY;

        const effectiveVx = sample.velocity.x + this.glitchKinematicVx;
        const effectiveVy = sample.velocity.y + this.glitchKinematicVy;
        this.vx = effectiveVx;
        this.vy = effectiveVy;

        if (Math.abs(effectiveVx) > 0.1 || Math.abs(effectiveVy) > 0.1) {
          this.rotation = Math.atan2(effectiveVy, effectiveVx) + Math.PI / 2;
        } else {
          this.rotation = sample.heading;
        }

        // Ceiling wrap guard: If ascended past y < -20 in anti-gravity loop
        if (this.y < -20 && this.glitchKinematicVy < 0) {
          this.flightPath = null;
          this.pathElapsedMs = 0;
          this.glitchOffsetX = 0;
          this.glitchOffsetY = 0;
          this.glitchDisplacementX = 0;
          this.glitchDisplacementY = 0;
          this.glitchKinematicVx = 0;
          this.glitchKinematicVy = 0;
          this.isKineticInverted = false;
          this.isTeleporting = false;
          this.teleportTimer = 0;
          this.y = -Enemy.BASE_HEIGHT;
          this.state = EnemyState.RETURNING_TO_FORMATION;
          this.vx = 0;
          this.vy = this.diveSpeed * 0.8;
          this.rotation = 0;
          return;
        }
      } else {
        this.x = sample.position.x;
        this.y = sample.position.y;
        this.vx = sample.velocity.x;
        this.vy = sample.velocity.y;
        this.rotation = sample.heading;
      }

      // ======================================================================
      // DECOUPLING FIX (WARP-3 & WARP-4): Physical Bottom Wrap vs Path Completion
      // ======================================================================

      // Condition 1: Physical screen bottom wrap-around
      // ONLY wrap to ceiling (-16) when the enemy has physically exited the bottom (Y > 288 + BASE_HEIGHT)
      if (this.y > 288 + Enemy.BASE_HEIGHT) {
        this.flightPath = null;
        this.pathElapsedMs = 0;
        this.glitchOffsetX = 0;
        this.glitchOffsetY = 0;
        this.glitchDisplacementX = 0;
        this.glitchDisplacementY = 0;
        this.glitchKinematicVx = 0;
        this.glitchKinematicVy = 0;
        this.isKineticInverted = false;
        this.isTeleporting = false;
        this.teleportTimer = 0;
        this.isTractorDiving = false;
        this.y = -Enemy.BASE_HEIGHT;
        this.state = EnemyState.RETURNING_TO_FORMATION;
        this.vx = 0;
        this.vy = this.diveSpeed * 0.8;
        this.rotation = 0;
        return;
      }

      // Condition 2: Parametric flight curve completed while still on-screen (Y <= 288 + BASE_HEIGHT)
      if (sample.isComplete) {
        // Sub-case A: Boss Galaga Tractor Beam Dive (WARP-3)
        // Halts at mid-screen (haltY ≈ 100). Do NOT wrap to ceiling!
        const isTractor =
          this.isTractorDiving ||
          (this.flightPath !== null && this.flightPath.id === 'TRACTOR_DIVE') ||
          (this.type === EnemyType.BOSS && Math.abs(this.y - 100) <= 10);

        if (isTractor) {
          this.flightPath = null;
          this.pathElapsedMs = 0;
          this.isTractorDiving = true;
          this.vx = 0;
          this.vy = 0;
          this.rotation = 0;
          // Hold position at tractor altitude. FormationManager will detect
          // (isTractorDiving && state === DIVING_SOLO && flightPath === null && y ∈ [95, 105])
          // and transition to TRACTOR_BEAM_ACTIVE, clearing isTractorDiving and dispatching onTractorBeamRequest.
          return;
        }

        // Sub-case B: Glitch kinetic inversion or mid-air path expiration (WARP-4)
        // Decouple from ceiling wrap: transition smoothly to ballistic kinematic continuation downward!
        this.flightPath = null;
        this.pathElapsedMs = 0;
        this.glitchOffsetX = 0;
        this.glitchOffsetY = 0;
        this.glitchDisplacementX = 0;
        this.glitchDisplacementY = 0;
        this.glitchKinematicVx = 0;
        this.glitchKinematicVy = 0;
        this.isKineticInverted = false;
        this.isTeleporting = false;
        this.teleportTimer = 0;

        // Preserve current velocity direction but ensure positive downward velocity
        this.vx = sample.velocity.x * 0.5;
        this.vy = Math.max(this.diveSpeed * 0.8, sample.velocity.y);
        if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1) {
          this.rotation = Math.atan2(this.vy, this.vx) + Math.PI / 2;
        } else {
          this.rotation = 0;
        }
        return;
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
        this.isTeleporting = false;
        this.teleportTimer = 0;
        this.isTractorDiving = false;
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
    const dist = Math.hypot(dx, dy);

    // Terminal lock threshold: Sub-pixel lock into formation grid
    if (dist <= 0.8) {
      this.x = targetX;
      this.y = targetY;
      this.vx = 0;
      this.vy = 0;
      this.rotation = 0;
      this.isTeleporting = false;
      this.teleportTimer = 0;
      this.state = EnemyState.IN_FORMATION;
      this.escortCount = 0;
      this.escortBossId = null;
      this.escortBoss = null;
      return;
    }

    // Kinematic smoothing across cruise vs docking phases
    const maxDisplacement = 2.5; // Strictly bounded: 2.5 px at 60Hz <= 3.0 px threshold
    let step: number;

    if (dist > 16.0) {
      // Cruise phase: Linear approach toward live dynamic slot
      const cruiseSpeed = this.diveSpeed * 0.9;
      step = Math.min(dist, cruiseSpeed * dt);
      this.rotation = Math.atan2(dy, dx) + Math.PI / 2;
    } else {
      // Docking phase (final 8-12 frames): Exponential blend with guaranteed minimum closing speed
      // (v >= 75 px/s guarantees catching slot even at peak grid velocity of 66.1 px/s)
      const dockingSpeed = Math.max(75, dist * 10);
      step = Math.min(dist, dockingSpeed * dt);

      // Smoothly slerp rotation toward 0 (facing UP in formation)
      const angleDiff = ((-this.rotation + Math.PI) % (2 * Math.PI)) - Math.PI;
      this.rotation += angleDiff * Math.min(1.0, 12.0 * dt);
    }

    // Strictly enforce displacement clamp
    step = Math.min(step, maxDisplacement);

    const nx = dx / dist;
    const ny = dy / dist;
    this.x += nx * step;
    this.y += ny * step;
    const invDt = dt > 0.0001 ? 1 / dt : 60;
    this.vx = nx * (step * invDt);
    this.vy = ny * (step * invDt);
  }

  // ==========================================================================
  // Attack & Firing Routines
  // ==========================================================================

  /**
   * Attempts to discharge an aimed bullet toward the player ship position.
   */
  public attemptFire(playerX: number, playerY: number, bulletSpeed: number = 200): boolean {
    if (!this.canShoot || !this.active || this.fireCooldownTimer > 0 || this.isChallenging) {
      return false;
    }

    if (this.shotsRemainingInDive <= 0) {
      return false;
    }

    // Prohibit firing if offscreen
    if (this.y < 0 || this.y > 270) {
      return false;
    }

    this.shotsRemainingInDive--;
    if (this.tier === 'DREADNOUGHT') {
      this.fireCooldownTimer = 0.45;
    } else if (this.tier === 'ELITE') {
      this.fireCooldownTimer = 0.75;
    } else {
      this.fireCooldownTimer = 1.5 + Math.random() * 2.0; // 1.5s - 3.5s cooldown
    }

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
  // M18 Anomalous Kinematics Triggers
  // ==========================================================================

  public triggerQuantumTeleport(lateralDelta?: number): boolean {
    if (this.isChallenging || (this as any).isEpicBoss || !this.active) {
      return false;
    }
    this.isTeleporting = true;
    this.teleportTimer = 0.08;
    const delta =
      lateralDelta !== undefined
        ? lateralDelta
        : (Math.random() < 0.5 ? -1 : 1) * (35 + Math.random() * 35);
    this.glitchOffsetX = Math.max(-60, Math.min(60, this.glitchOffsetX + delta));
    return true;
  }

  public triggerKineticInversion(duration: number = 0.75, lateralImpulse: number = 180): boolean {
    if (this.isChallenging || (this as any).isEpicBoss || !this.active) {
      return false;
    }
    this.isKineticInverted = true;
    this.kineticInversionTimer = duration;
    this.glitchKinematicVy = -90; // Initial upward anti-gravity velocity
    this.glitchKinematicVx = (Math.random() < 0.5 ? -1 : 1) * lateralImpulse;
    return true;
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

    if (this.isTeleporting) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.translate((Math.random() - 0.5) * 4, 0);
    }

    SpriteRenderer.drawEnemy(
      ctx,
      this.type,
      this.x,
      this.y,
      this.animFrame,
      this.health,
      this.rotation,
      1.0,
      this.tier,
      this.shield,
      this.damageFlashTimer,
      this.shieldFlashTimer,
      this.animTimer
    );

    if (this.isTeleporting) {
      ctx.restore();
    }
  }
}
