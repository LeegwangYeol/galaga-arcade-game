/**
 * Galaga Arcade Web Game — Master Crisis Event Manager Coordinator
 * Milestone 10: Lifecycle Management, Stage Progression Evaluation, and Game Loop Hooks
 */

import type { Game } from '../Game';
import {
  CrisisEventType,
  type CrisisEventContext,
  type CrisisState,
  type ICrisisEvent,
} from './types';
import { CrisisEventFactory } from './CrisisEventFactory';
import { DifficultyCalculator } from '../../systems/DifficultyCalculator';

export interface CrisisEventManagerConfig {
  /** Minimum stage required before crises can naturally trigger (default: 11) */
  minStage?: number;
  /** Probability of triggering a crisis on eligible non-challenging stages (default: 0.40) */
  triggerProbability?: number;
  /** Mandatory stage cooldown between natural crisis events (default: 1) */
  cooldownStages?: number;
  /** Global enablement flag (default: true) */
  enabled?: boolean;
}

export class CrisisEventManager {
  private readonly game: Game;

  // Active Crisis Instance & State
  private currentCrisis: ICrisisEvent | null = null;
  private state: CrisisState = 'IDLE';

  // Timers
  private warningTimer: number = 0;
  private activeTimer: number = 0;
  private currentWarningDuration: number = 3.0;
  private currentActiveDuration: number = 20.0;

  // Stage Scaling & Roll Configuration
  private minStage: number = 11;
  private triggerProbability: number = 0.40;
  private cooldownStages: number = 1;
  private lastCrisisStage: number = -1;
  private enabled: boolean = true;

  // History & Telemetry
  private readonly crisisHistory: CrisisEventType[] = [];
  private totalCrisesTriggered: number = 0;

  constructor(game: Game, config?: CrisisEventManagerConfig) {
    this.game = game;
    if (config) {
      if (config.minStage !== undefined) this.minStage = config.minStage;
      if (config.triggerProbability !== undefined) this.triggerProbability = config.triggerProbability;
      if (config.cooldownStages !== undefined) this.cooldownStages = config.cooldownStages;
      if (config.enabled !== undefined) this.enabled = config.enabled;
    }
  }

  // ==========================================================================
  // 1. Stage Progression Evaluation
  // ==========================================================================

  /**
   * Evaluates if a crisis should trigger upon starting a new stage.
   * Invariants:
   * 1. Stage must be > 10 (stage >= 11).
   * 2. Must NOT be a Challenging Stage (DifficultyCalculator.isChallengingStage(stage)).
   *    (Note: Stage 11 is challenging, so Stage 12 is the first eligible stage).
   * 3. Must respect stage cooldown (e.g. stage - lastCrisisStage > cooldownStages).
   * 4. Milestone stage guarantee: Stage 12 is guaranteed (first post-10 combat round).
   * 5. Subsequent non-challenging stages roll with 40% probability.
   */
  public evaluateStageTrigger(stage: number): ICrisisEvent | null {
    if (!this.enabled) return null;
    if (stage < this.minStage) return null;

    // Invariant: Never trigger on challenging stages
    if (DifficultyCalculator.isChallengingStage(stage)) {
      return null;
    }

    // Cooldown check (prevent back-to-back crises unless forced)
    if (this.lastCrisisStage > 0 && (stage - this.lastCrisisStage) <= this.cooldownStages) {
      return null;
    }

    // Guaranteed on Stage 12 (first combat stage of Elite tier) or milestone boss rounds
    const isGuaranteedStage = (stage === 12 || stage === 25 || stage === 50);
    const roll = Math.random();

    if (isGuaranteedStage || roll < this.triggerProbability) {
      const lastType = this.crisisHistory.length > 0
        ? this.crisisHistory[this.crisisHistory.length - 1]
        : undefined;
      const selectedType = CrisisEventFactory.getRandomType(lastType);
      return this.triggerCrisis(selectedType, stage);
    }

    return null;
  }

  // ==========================================================================
  // 2. Crisis Lifecycle Management
  // ==========================================================================

  /**
   * Triggers a specific crisis event, initiating its 3-second warning phase.
   */
  public triggerCrisis(type: CrisisEventType, stage?: number): ICrisisEvent {
    // If another crisis is active or warning, cleanly deactivate it first
    if (this.currentCrisis) {
      this.clearCrisis();
    }

    const currentStage = stage ?? (this.game ? this.game.stage : 12);
    const context = this.buildContext(currentStage);
    const event = CrisisEventFactory.create(type, context);

    this.currentCrisis = event;
    this.state = 'WARNING';
    this.warningTimer = event.warningDuration;
    this.currentWarningDuration = event.warningDuration;
    this.activeTimer = event.activeDuration;
    this.currentActiveDuration = event.activeDuration;

    // Record Telemetry
    this.lastCrisisStage = currentStage;
    this.totalCrisesTriggered++;
    this.crisisHistory.push(type);

    // Audio & Lifecycle Triggers
    event.onWarningStart();
    try {
      (this.game?.soundSynth as any)?.playCrisisKlaxon?.();
    } catch {
      // Defensive fallback if audio context is locked
    }

    return event;
  }

  /**
   * Immediately activates a crisis, bypassing the warning countdown.
   * Useful for unit tests, debug tools, and runtime cheats.
   */
  public forceActivate(type: CrisisEventType, stage?: number): ICrisisEvent {
    const event = this.triggerCrisis(type, stage);
    this.state = 'ACTIVE';
    this.warningTimer = 0;
    event.onActivate();
    return event;
  }

  /**
   * Fixed-timestep update tick for crisis warning timers, active durations, and shaders.
   */
  public update(dt: number): void {
    if (this.state === 'IDLE' || !this.currentCrisis) {
      return;
    }

    if (this.state === 'WARNING') {
      this.warningTimer -= dt;
      this.currentCrisis.update(dt);
      if (this.warningTimer <= 0) {
        this.state = 'ACTIVE';
        this.warningTimer = 0;
        this.currentCrisis.onActivate();
      }
      return;
    }

    if (this.state === 'ACTIVE') {
      this.activeTimer -= dt;
      this.currentCrisis.update(dt);

      if (this.currentCrisis.isComplete() || this.activeTimer <= 0) {
        this.completeCrisis();
      }
    }
  }

  /**
   * Renders active crisis visuals onto the canvas context.
   * Includes hazard strobe, warning banner during WARNING, and crisis shaders during ACTIVE.
   */
  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.currentCrisis) return;

    if (this.state === 'WARNING') {
      this.renderWarningBanner(ctx);
    }

    if (this.state === 'ACTIVE' || this.state === 'WARNING') {
      this.currentCrisis.render(ctx);
    }
  }

  /**
   * Renders retro arcade pulsing warning banner and hazard stripes.
   */
  private renderWarningBanner(ctx: CanvasRenderingContext2D): void {
    const width = 224;
    const height = 288;
    const progress = Math.max(0, this.warningTimer / (this.currentWarningDuration || 3.0));
    const blinkOn = Math.floor(progress * 10) % 2 === 0;

    ctx.save();

    // Red perimeter hazard vignette strobe
    const alpha = 0.25 * (0.5 + 0.5 * Math.sin(Date.now() * 0.015));
    ctx.fillStyle = `rgba(255, 0, 0, ${alpha.toFixed(2)})`;
    ctx.fillRect(0, 0, width, 4);
    ctx.fillRect(0, height - 4, width, 4);
    ctx.fillRect(0, 0, 4, height);
    ctx.fillRect(width - 4, 0, 4, height);

    // Centered Hazard Warning Box (y: 80 - 124)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(8, 80, width - 16, 44);

    ctx.strokeStyle = blinkOn ? '#FF0000' : '#FFFF00';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(8.5, 80.5, width - 17, 43);

    // Hazard Stripes (top & bottom)
    const stripeY = [83, 120];
    for (const sy of stripeY) {
      ctx.fillStyle = '#FFFF00';
      for (let x = 12; x < width - 16; x += 12) {
        ctx.fillRect(x, sy, 6, 2);
      }
    }

    // Text Banners
    ctx.fillStyle = blinkOn ? '#FF3333' : '#FFFFFF';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('! CRISIS DETECTED !', width / 2, 94);

    ctx.fillStyle = '#FFFF00';
    ctx.fillText(this.currentCrisis?.name ?? 'UNKNOWN CRISIS', width / 2, 106);

    ctx.fillStyle = '#AAAAAA';
    ctx.fillText(`ACTIVE IN: ${Math.max(0, this.warningTimer).toFixed(1)}s`, width / 2, 116);

    ctx.restore();
  }

  /**
   * Deactivates the active crisis upon completion.
   */
  public completeCrisis(): void {
    if (this.currentCrisis) {
      this.currentCrisis.onDeactivate();
    }
    this.currentCrisis = null;
    this.state = 'IDLE';
    this.warningTimer = 0;
    this.activeTimer = 0;
  }

  /**
   * Immediately clears any active crisis and restores normal gameplay.
   */
  public clearCrisis(): void {
    this.completeCrisis();
  }

  /**
   * Stage Clear hook: guarantees all crisis modifiers are torn down when stage ends.
   */
  public onStageClear(): void {
    this.clearCrisis();
  }

  /**
   * Resets the entire crisis manager state (new game / game over).
   */
  public reset(): void {
    this.clearCrisis();
    this.lastCrisisStage = -1;
    this.crisisHistory.length = 0;
    this.totalCrisesTriggered = 0;
  }

  /**
   * Destroys subsystem and clears references.
   */
  public destroy(): void {
    this.clearCrisis();
  }

  // ==========================================================================
  // 3. Telemetry & Accessors
  // ==========================================================================

  public getActiveCrisis(): ICrisisEvent | null {
    return this.currentCrisis;
  }

  public getState(): CrisisState {
    return this.state;
  }

  public getWarningTimer(): number {
    return this.warningTimer;
  }

  public getCurrentWarningDuration(): number {
    return this.currentWarningDuration;
  }

  public getActiveTimer(): number {
    return this.activeTimer;
  }

  public getCurrentActiveDuration(): number {
    return this.currentActiveDuration;
  }

  public getLastCrisisStage(): number {
    return this.lastCrisisStage;
  }

  public getTotalCrisesTriggered(): number {
    return this.totalCrisesTriggered;
  }

  public getCrisisHistory(): readonly CrisisEventType[] {
    return this.crisisHistory;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setTriggerProbability(prob: number): void {
    this.triggerProbability = Math.max(0, Math.min(1.0, prob));
  }

  public getTriggerProbability(): number {
    return this.triggerProbability;
  }

  // ==========================================================================
  // 4. Helper: Context Builder
  // ==========================================================================

  private buildContext(stage: number): CrisisEventContext {
    return {
      game: this.game,
      player: this.game?.player,
      bulletManager: this.game?.bulletManager,
      formationManager: this.game?.formationManager,
      starfield: this.game?.starfield,
      particleSystem: this.game?.particleSystem,
      soundSynth: this.game?.soundSynth,
      scoreManager: this.game?.scoreManager,
      hud: this.game?.hud,
      stage,
    };
  }
}
