/**
 * Galaga Arcade Web Game — Crisis Subsystem Type Definitions & Contracts
 * Milestone 10: Stellaris-Inspired Crisis Engine Architecture
 */

import type { Game } from '../Game';
import type { Player } from '../../entities/Player';
import type { BulletManager } from '../../entities/Bullet';
import type { FormationManager } from '../../systems/FormationManager';
import type { Starfield } from '../../systems/Starfield';
import type { ParticleSystem } from '../../systems/ParticleSystem';
import type { SoundSynth } from '../../audio/SoundSynth';
import type { ScoreManager } from '../../systems/ScoreManager';
import type { HUD } from '../../ui/HUD';
import { EnemyType } from '../../types';

export { EnemyType };

// ============================================================================
// 1. Crisis Event Enumeration
// ============================================================================

/**
 * Enumeration of all 11 distinct Stellaris-inspired crisis events.
 */
export enum CrisisEventType {
  THE_CONTINGENCY = 'THE_CONTINGENCY',
  THE_UNBIDDEN = 'THE_UNBIDDEN',
  THE_PRETHORYN_SCOURGE = 'THE_PRETHORYN_SCOURGE',
  SHIELD_OVERLOAD = 'SHIELD_OVERLOAD',
  PHYSICS_INVERSION = 'PHYSICS_INVERSION',
  HYPERSPACE_STORM = 'HYPERSPACE_STORM',
  NANITE_CLOUD = 'NANITE_CLOUD',
  PSIONIC_RESONANCE = 'PSIONIC_RESONANCE',
  DEVOURING_SWARM_FRENZY = 'DEVOURING_SWARM_FRENZY',
  NEMESIS_STAR_EATER = 'NEMESIS_STAR_EATER',
  TIME_DILATION_FIELD = 'TIME_DILATION_FIELD',
}

// ============================================================================
// 2. Crisis State Machine Types
// ============================================================================

/**
 * Discrete lifecycle phases of the crisis subsystem.
 */
export type CrisisState = 'IDLE' | 'WARNING' | 'ACTIVE' | 'COOLDOWN' | 'COMPLETED';

// ============================================================================
// 3. Execution Context
// ============================================================================

/**
 * Execution context passed to crisis events upon initialization.
 * Provides controlled access to core game engine subsystems without circular leaks.
 */
export interface CrisisEventContext {
  readonly game: Game | any;
  readonly player: Player | any;
  readonly bulletManager: BulletManager | any;
  readonly formationManager: FormationManager | any;
  readonly starfield: Starfield | any;
  readonly particleSystem: ParticleSystem | any;
  readonly soundSynth?: SoundSynth | any;
  readonly scoreManager?: ScoreManager | any;
  readonly hud?: HUD | any;
  readonly stage: number;
}

// ============================================================================
// 4. Crisis Event Interface
// ============================================================================

/**
 * Master interface contract for all concrete crisis event implementations.
 */
export interface ICrisisEvent {
  /** Unique crisis type identifier */
  readonly type: CrisisEventType;

  /** Display title for HUD warning banner (e.g. "THE CONTINGENCY") */
  readonly name: string;

  /** Narrative flavor text or sub-header (e.g. "GHOST SIGNAL OVERRIDE") */
  readonly flavorText: string;

  /** Alias for flavorText for backwards compatibility */
  readonly subtitle?: string;

  /** Duration of warning phase in seconds (default: 3.0s) */
  readonly warningDuration: number;

  /** Alias for warningDuration */
  readonly warningDurationSec?: number;

  /** Total active duration in seconds before self-completion (e.g. 20.0s) */
  readonly activeDuration: number;

  /** Alias for activeDuration */
  readonly durationSec?: number;

  /** Current lifecycle state of this specific crisis */
  readonly state: CrisisState;

  /**
   * Initializes the crisis with engine subsystem references.
   * Called immediately upon factory creation.
   */
  init(context: CrisisEventContext): void;

  /**
   * Invoked when the 3-second warning phase begins.
   * Audio sirens, visual strobes, and HUD warning banners are initiated here.
   */
  onWarningStart(): void;

  /**
   * Invoked when the warning countdown completes and crisis mechanics go live.
   * Gameplay modifiers, physics changes, and alien buffs activate here.
   */
  onActivate(): void;

  /**
   * Fixed-timestep update tick (60 FPS).
   * @param dt Elapsed delta time in seconds
   */
  update(dt: number): void;

  /**
   * Double-buffered canvas render pass.
   * Renders procedural visual shaders, overlays, distortion waves, or hazard lines.
   * @param ctx 2D Canvas rendering context
   */
  render(ctx: CanvasRenderingContext2D): void;

  /**
   * Invoked when the crisis completes, times out, or stage is cleared.
   * Must restore all modified engine state (gravity, fire rate, enemy speed).
   */
  onDeactivate(): void;

  /**
   * Evaluates if this crisis has satisfied its completion criteria.
   */
  isComplete(): boolean;

  /** Resets internal timers and state back to IDLE */
  reset(): void;

  // Ergonomic Lifecycle Aliases
  startWarning?(): void;
  activate?(): void;
  deactivate?(): void;
  isFinished?(): boolean;
}

// ============================================================================
// 5. Factory & Metadata Definitions
// ============================================================================

export interface CrisisMetadata {
  readonly type: CrisisEventType;
  readonly name: string;
  readonly flavorText: string;
  readonly warningDuration: number;
  readonly activeDuration: number;
  readonly description: string;
}

export type CrisisEventConstructor = (context: CrisisEventContext) => ICrisisEvent;

// ============================================================================
// 6. Base Abstract Class
// ============================================================================

export abstract class BaseCrisisEvent implements ICrisisEvent {
  public abstract readonly type: CrisisEventType;
  public abstract readonly name: string;
  public abstract readonly flavorText: string;
  public readonly warningDuration: number = 3.0;
  public readonly activeDuration: number = 20.0;

  public get warningDurationSec(): number {
    return this.warningDuration;
  }

  public get durationSec(): number {
    return this.activeDuration;
  }

  public get subtitle(): string {
    return this.flavorText;
  }

  public state: CrisisState = 'IDLE';
  public elapsedTime: number = 0;
  public warningTimer: number = 0;
  protected context!: CrisisEventContext;

  public init(context: CrisisEventContext): void {
    this.context = context;
    this.state = 'IDLE';
    this.elapsedTime = 0;
    this.warningTimer = 0;
    this.onInit();
  }

  public onWarningStart(): void {
    this.state = 'WARNING';
    this.warningTimer = 0;
    this.onWarningStarted();
  }

  public onActivate(): void {
    this.state = 'ACTIVE';
    this.elapsedTime = 0;
    this.onActivated();
  }

  public update(dt: number): void {
    if (this.state === 'WARNING') {
      this.warningTimer += dt;
      this.onWarningUpdate(dt);
      if (this.warningTimer >= this.warningDuration) {
        this.onActivate();
      }
      return;
    }

    if (this.state === 'ACTIVE') {
      this.elapsedTime += dt;
      this.onActiveUpdate(dt);
      if (this.activeDuration > 0 && this.elapsedTime >= this.activeDuration) {
        this.onDeactivate();
      }
    }
  }

  public abstract render(ctx: CanvasRenderingContext2D): void;

  public onDeactivate(): void {
    if (this.state === 'COMPLETED') return;
    this.onDeactivated();
    this.state = 'COMPLETED';
  }

  public reset(): void {
    this.onDeactivate();
    this.state = 'IDLE';
    this.elapsedTime = 0;
    this.warningTimer = 0;
    this.onReset();
  }

  public isComplete(): boolean {
    return this.state === 'COMPLETED';
  }

  // Interoperability aliases
  public startWarning(): void {
    this.onWarningStart();
  }

  public activate(): void {
    this.onActivate();
  }

  public deactivate(): void {
    this.onDeactivate();
  }

  public isFinished(): boolean {
    return this.isComplete();
  }

  // Subclass extension hooks
  protected onInit(): void {}
  protected onWarningStarted(): void {}
  protected onWarningUpdate(_dt: number): void {}
  protected onActivated(): void {}
  protected abstract onActiveUpdate(dt: number): void;
  protected onDeactivated(): void {}
  protected onReset(): void {}
}
