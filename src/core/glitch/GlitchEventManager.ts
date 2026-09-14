/**
 * Milestone M18: Glitch Event Manager
 * 
 * Event Coordinator:
 * - Manages glitch state machine: IDLE -> WARNING -> ACTIVE -> COOLDOWN.
 * - Triggers dedicated "Glitch Sector" anomaly rounds on Stages 13, 26, 38.
 * - Triggers 35% random glitch anomalies post-Stage 15 with 2-stage cooldown.
 * - Enforces strict immunity for Challenging Stages and Epic Bosses.
 * - Orchestrates visual post-processing (GlitchRenderer) and procedural audio cues (SoundSynth).
 */

import { GlitchEventType, GlitchState, GlitchTelemetry } from './types';
import { GlitchRenderer } from '../../renderer/GlitchRenderer';
import { DifficultyCalculator } from '../../systems/DifficultyCalculator';
import { HUD } from '../../ui/HUD';

export class GlitchEventManager {
  public static readonly WARNING_DURATION = 1.5;
  public static readonly ACTIVE_DEFAULT_DURATION = 8.0;
  public static readonly COOLDOWN_DURATION = 2.0;
  public static readonly RANDOM_TRIGGER_CHANCE = 0.35;
  public static readonly COOLDOWN_STAGES = 2;

  // Dedicated Glitch Sector Anomaly Rounds
  public static readonly GLITCH_SECTOR_STAGES = [13, 26, 38] as const;

  private game: any;
  private state: GlitchState = 'IDLE';
  private activeType: GlitchEventType | null = null;
  private timer: number = 0;
  private isGlitchSector: boolean = false;
  private lastGlitchStage: number = -10;
  private elapsedGlitchTime: number = 0;
  private audioPulseTimer: number = 0;
  private pendingActiveDuration: number = GlitchEventManager.ACTIVE_DEFAULT_DURATION;

  constructor(game: any) {
    this.game = game;
    GlitchRenderer.initialize();
  }

  /**
   * Evaluates stage start triggers:
   * - Stages 13, 26, 38: Dedicated Glitch Sector Anomaly
   * - Stages >= 16: 35% random chance if cooldown elapsed, non-challenging, non-boss
   */
  public evaluateStageTrigger(stage: number): boolean {
    // 1. Strict Immunity: Challenging stages are 100% immune
    if (DifficultyCalculator.isChallengingStage(stage)) {
      this.clearGlitch();
      return false;
    }

    // 2. Strict Immunity: Epic Boss stages (10, 20, 30, 40, 50)
    if (stage > 0 && stage % 10 === 0) {
      this.clearGlitch();
      return false;
    }

    // 3. Dedicated Glitch Sector Stages
    if (GlitchEventManager.isGlitchSectorStage(stage)) {
      this.isGlitchSector = true;
      this.lastGlitchStage = stage;
      this.forceActivate(GlitchEventType.SECTOR_ANOMALY, 9999);
      return true;
    }

    // 4. Random Glitch Anomaly post-Stage 15
    if (stage >= 16) {
      if (stage - this.lastGlitchStage > GlitchEventManager.COOLDOWN_STAGES) {
        if (Math.random() < GlitchEventManager.RANDOM_TRIGGER_CHANCE) {
          const anomalyPool: GlitchEventType[] = [
            GlitchEventType.QUANTUM_TELEPORT,
            GlitchEventType.KINETIC_INVERSION,
            GlitchEventType.MIRAGE_CLONES,
            GlitchEventType.RASTER_TEAR,
            GlitchEventType.CHROMATIC_ABERRATION,
          ];
          const selected = anomalyPool[Math.floor(Math.random() * anomalyPool.length)]!;
          this.lastGlitchStage = stage;
          this.triggerWarning(selected, GlitchEventManager.ACTIVE_DEFAULT_DURATION);
          return true;
        }
      }
    }

    return false;
  }

  public static isGlitchSectorStage(stage: number): boolean {
    return (GlitchEventManager.GLITCH_SECTOR_STAGES as readonly number[]).includes(stage);
  }

  /**
   * Initiates a glitch event with a visual warning countdown.
   */
  public triggerWarning(type: GlitchEventType, duration: number = GlitchEventManager.ACTIVE_DEFAULT_DURATION): void {
    this.state = 'WARNING';
    this.activeType = type;
    this.pendingActiveDuration = duration;
    this.timer = GlitchEventManager.WARNING_DURATION;
    this.elapsedGlitchTime = 0;
    this.audioPulseTimer = 0;

    // Play warning glitch audio buzz
    try {
      this.game?.soundSynth?.playGlitchBuzz?.({ volume: 0.7 });
    } catch {
      // Safe fallback
    }
  }

  /**
   * Immediately activates the specified glitch event (bypassing warning countdown if desired).
   */
  public forceActivate(type: GlitchEventType, duration: number = GlitchEventManager.ACTIVE_DEFAULT_DURATION): void {
    this.state = 'ACTIVE';
    this.activeType = type;
    this.timer = duration;
    this.elapsedGlitchTime = 0;
    this.audioPulseTimer = 0;

    if (type === GlitchEventType.SECTOR_ANOMALY) {
      this.isGlitchSector = true;
    }

    // Apply immediate glitch audio burst
    try {
      this.game?.soundSynth?.playDataStreamNoise?.({ volume: 0.6 });
    } catch {
      // Safe fallback
    }
  }

  /**
   * Immediately clears active glitch event.
   */
  public clearGlitch(): void {
    this.state = 'IDLE';
    this.activeType = null;
    this.timer = 0;
    this.isGlitchSector = false;
    this.elapsedGlitchTime = 0;
    this.audioPulseTimer = 0;
    GlitchRenderer.reset();

    // Clear phantom clones
    if (this.game?.formationManager?.phantomPool) {
      this.game.formationManager.phantomPool.clear();
    }

    // Reset all diving enemies' glitch state
    if (this.game?.formationManager?.enemies) {
      for (const enemy of this.game.formationManager.enemies) {
        if (enemy.active && enemy.isGlitched) {
          enemy.isGlitched = false;
          enemy.glitchOffsetX = 0;
          enemy.glitchOffsetY = 0;
          enemy.glitchDisplacementX = 0;
          enemy.glitchDisplacementY = 0;
          enemy.glitchKinematicVx = 0;
          enemy.glitchKinematicVy = 0;
        }
      }
    }
  }

  public onStageClear(): void {
    this.clearGlitch();
  }

  public reset(): void {
    this.clearGlitch();
    this.lastGlitchStage = -10;
  }

  /**
   * Fixed 60 FPS update loop.
   */
  public update(dt: number): void {
    if (this.state === 'IDLE') return;

    this.elapsedGlitchTime += dt;
    this.timer -= dt;

    if (this.state === 'WARNING') {
      if (this.timer <= 0) {
        this.state = 'ACTIVE';
        this.timer = this.isGlitchSector ? 9999 : this.pendingActiveDuration;
        try {
          this.game?.soundSynth?.playGlitchFrequencyChirp?.({ volume: 0.8 });
        } catch {
          // Safe fallback
        }
      }
      return;
    }

    if (this.state === 'ACTIVE') {
      // Periodic procedural audio during active glitch
      this.audioPulseTimer += dt;
      if (this.audioPulseTimer >= 2.5) {
        this.audioPulseTimer = 0;
        try {
          if (Math.random() < 0.5) {
            this.game?.soundSynth?.playGlitchFrequencyChirp?.({ volume: 0.4 });
          } else {
            this.game?.soundSynth?.playGlitchBuzz?.({ volume: 0.35 });
          }
        } catch {
          // Safe fallback
        }
      }

      if (!this.isGlitchSector && this.timer <= 0) {
        this.state = 'COOLDOWN';
        this.timer = GlitchEventManager.COOLDOWN_DURATION;
      }
      return;
    }

    if (this.state === 'COOLDOWN') {
      if (this.timer <= 0) {
        this.clearGlitch();
      }
    }
  }

  /**
   * Renders glitch visual overlays and post-processing passes.
   */
  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'IDLE' || !ctx) return;

    // 1. WARNING Phase: Cyberpunk glitch banner
    if (this.state === 'WARNING') {
      ctx.save();
      const blink = Math.floor(this.elapsedGlitchTime * 12) % 2 === 0;
      if (blink) {
        ctx.fillStyle = 'rgba(0, 255, 255, 0.25)';
        ctx.fillRect(0, 24, GlitchRenderer.VIRTUAL_WIDTH, 14);

        HUD.drawText(
          ctx,
          this.isGlitchSector ? '!! GLITCH SECTOR DETECTED !!' : '! ANOMALY DETECTED !',
          GlitchRenderer.VIRTUAL_WIDTH / 2,
          27,
          {
            color: '#00FFFF',
            align: 'center',
            scale: 1,
            scramble: true,
            scrambleRatio: 0.3,
            scrambleSeed: Math.floor(this.elapsedGlitchTime * 100),
          }
        );
      }
      ctx.restore();
      return;
    }

    // 2. ACTIVE Phase: Visual Post-Processing
    if (this.state === 'ACTIVE') {
      const type = this.activeType;
      const isSector = this.isGlitchSector || type === GlitchEventType.SECTOR_ANOMALY;

      // Raster Scanline Tear
      if (type === GlitchEventType.RASTER_TEAR || isSector) {
        const intensity = isSector ? 0.75 : 1.0;
        GlitchRenderer.applyRasterTear(
          ctx,
          intensity,
          this.elapsedGlitchTime,
          Math.floor(this.elapsedGlitchTime * 60)
        );
      }

      // Chromatic Aberration
      if (type === GlitchEventType.CHROMATIC_ABERRATION || isSector) {
        const shiftX = 2.0 * Math.sin(this.elapsedGlitchTime * 8);
        const shiftY = 1.0 * Math.cos(this.elapsedGlitchTime * 6);
        GlitchRenderer.applyChromaticAberration(ctx, shiftX, shiftY);
      }

      // Sector Indicator Banner
      if (isSector) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 0, 128, 0.15)';
        ctx.fillRect(0, 0, GlitchRenderer.VIRTUAL_WIDTH, 8);
        HUD.drawText(
          ctx,
          'ERR:0x7F // CORRUPTED SECTOR',
          GlitchRenderer.VIRTUAL_WIDTH / 2,
          1,
          {
            color: '#FF00FF',
            align: 'center',
            scale: 1,
            scramble: true,
            scrambleRatio: 0.2,
            scrambleSeed: Math.floor(this.elapsedGlitchTime * 30),
          }
        );
        ctx.restore();
      }
    }
  }

  public getTelemetry(): GlitchTelemetry {
    return {
      active: this.state === 'ACTIVE',
      state: this.state,
      type: this.activeType,
      isGlitchSector: this.isGlitchSector,
      timer: Math.max(0, this.timer),
      activeGlitchedEnemies: 0,
      activePhantomClones: 0,
    };
  }

  public getState(): GlitchState {
    return this.state;
  }

  public getActiveType(): GlitchEventType | null {
    return this.activeType;
  }

  public getTimer(): number {
    return this.timer;
  }

  public isSectorActive(): boolean {
    return this.isGlitchSector;
  }

  /**
   * Checks whether the active event modifies enemy kinematics.
   */
  public hasActiveKinematicAnomaly(): boolean {
    if (this.state !== 'ACTIVE') return false;
    return (
      this.isGlitchSector ||
      this.activeType === GlitchEventType.QUANTUM_TELEPORT ||
      this.activeType === GlitchEventType.KINETIC_INVERSION ||
      this.activeType === GlitchEventType.MIRAGE_CLONES ||
      this.activeType === GlitchEventType.SECTOR_ANOMALY
    );
  }
}
