/**
 * Galaga Arcade Web Game — Parallax Starfield System
 * 
 * Implements a 3-layer parallax starfield with 100 stars, dynamic color palettes,
 * sinusoidal twinkling, smooth speed state transitions (NORMAL, DIVING, WARP, PAUSED),
 * relativistic motion blur streaks, and zero-allocation runtime performance.
 */

import type { Star } from '../types';
import { ScreenManager } from '../core/ScreenManager';

export type StarfieldState = 'NORMAL' | 'DIVING' | 'WARP' | 'PAUSED';

export interface StarfieldConfig {
  virtualWidth?: number;
  virtualHeight?: number;
  starCount?: number;
}

export const STARFIELD_COLORS = {
  LAYER_0: ['#3A506B', '#48CAE4', '#7209B7', '#A0AAB2', '#5A677D'],
  LAYER_1: ['#00FFFF', '#FFE66D', '#FF9F1C', '#FF007F', '#5B93FF', '#FFFFFF'],
  LAYER_2: ['#FFFFFF', '#5B93FF', '#00FFFF', '#FFFF00', '#FF007F'],
} as const;

export const STARFIELD_ICE_COLORS = ['#FFFFFF', '#C0F0FF', '#00FFFF', '#B0E0E6'] as const;

export class Starfield {
  private stars: Star[] = [];
  private starSizes: Uint8Array;
  private starDepths: Float32Array;

  private virtualWidth: number;
  private virtualHeight: number;

  private speedMultiplier: number = 1.0;
  private targetSpeedMultiplier: number = 1.0;
  private currentState: StarfieldState = 'NORMAL';

  public isChronoFrozen: boolean = false;

  public static readonly DEFAULT_STAR_COUNT = 100;
  public static readonly LERP_SPEED = 4.5; // Smooth transition speed (s^-1)

  public setChronoFrozen(frozen: boolean): void {
    this.isChronoFrozen = frozen;
  }

  constructor(
    configOrWidth?: number | StarfieldConfig,
    virtualHeight?: number,
    starCount?: number
  ) {
    if (typeof configOrWidth === 'number') {
      this.virtualWidth = configOrWidth;
      this.virtualHeight = virtualHeight ?? ScreenManager.DEFAULT_VIRTUAL_HEIGHT;
      const count = starCount ?? Starfield.DEFAULT_STAR_COUNT;
      this.starSizes = new Uint8Array(count);
      this.starDepths = new Float32Array(count);
      this.generateStars(count);
    } else {
      const config = configOrWidth;
      this.virtualWidth = config?.virtualWidth ?? ScreenManager.DEFAULT_VIRTUAL_WIDTH;
      this.virtualHeight = config?.virtualHeight ?? ScreenManager.DEFAULT_VIRTUAL_HEIGHT;
      const count = config?.starCount ?? Starfield.DEFAULT_STAR_COUNT;
      this.starSizes = new Uint8Array(count);
      this.starDepths = new Float32Array(count);
      this.generateStars(count);
    }
  }

  /**
   * Generates and distributes stars across 3 parallax layers.
   */
  public generateStars(count: number = Starfield.DEFAULT_STAR_COUNT): void {
    this.stars = [];
    if (this.starSizes.length !== count) {
      this.starSizes = new Uint8Array(count);
      this.starDepths = new Float32Array(count);
    }

    // Distribution: 40% Layer 0 (distant), 35% Layer 1 (mid), 25% Layer 2 (foreground)
    const layer0Count = Math.floor(count * 0.40);
    const layer1Count = Math.floor(count * 0.35);

    for (let i = 0; i < count; i++) {
      let layer = 0;
      let baseSpeed = 14;
      let size = 1;
      let baseBrightness = 0.45;
      let palette: readonly string[] = STARFIELD_COLORS.LAYER_0;

      if (i < layer0Count) {
        layer = 0;
        baseSpeed = 12 + Math.random() * 4; // 12 - 16 px/s
        size = 1;
        baseBrightness = 0.25 + Math.random() * 0.3;
        palette = STARFIELD_COLORS.LAYER_0;
      } else if (i < layer0Count + layer1Count) {
        layer = 1;
        baseSpeed = 28 + Math.random() * 8; // 28 - 36 px/s
        size = 1;
        baseBrightness = 0.50 + Math.random() * 0.35;
        palette = STARFIELD_COLORS.LAYER_1;
      } else {
        layer = 2;
        baseSpeed = 55 + Math.random() * 20; // 55 - 75 px/s
        size = Math.random() > 0.65 ? 2 : 1;
        baseBrightness = 0.75 + Math.random() * 0.25;
        palette = STARFIELD_COLORS.LAYER_2;
      }

      const color = palette[Math.floor(Math.random() * palette.length)] ?? '#FFFFFF';
      const twinkleSpeed = 1.5 + Math.random() * 4.5;
      const twinkleDepth = 0.2 + Math.random() * 0.5;

      this.starSizes[i] = size;
      this.starDepths[i] = twinkleDepth;

      this.stars.push({
        x: Math.random() * this.virtualWidth,
        y: Math.random() * this.virtualHeight,
        speed: baseSpeed,
        layer,
        color,
        brightness: baseBrightness,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed,
      });
    }
  }

  /**
   * Sets the operational speed state.
   */
  public setSpeedState(state: StarfieldState): void {
    this.currentState = state;
    switch (state) {
      case 'NORMAL':
        this.targetSpeedMultiplier = 1.0;
        break;
      case 'DIVING':
        this.targetSpeedMultiplier = 2.8;
        break;
      case 'WARP':
        this.targetSpeedMultiplier = 6.5;
        break;
      case 'PAUSED':
        this.targetSpeedMultiplier = 0.0;
        break;
    }
  }

  /**
   * Returns current starfield speed state.
   */
  public getSpeedState(): StarfieldState {
    return this.currentState;
  }

  /**
   * Directly sets custom target speed multiplier for scripted sequences.
   */
  public setTargetSpeedMultiplier(multiplier: number): void {
    this.targetSpeedMultiplier = Math.max(0, multiplier);
  }

  /**
   * Returns current effective speed multiplier.
   */
  public getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  /**
   * Returns readonly reference to all star objects.
   */
  public getStars(): readonly Star[] {
    return this.stars;
  }

  /**
   * Updates star positions, twinkling phases, and smooth speed lerping.
   * Delta time (dt) is in seconds.
   */
  public update(dt: number): void {
    // If Chrono Freeze is active, freeze starfield kinematic updates and twinkling
    const effectiveDt = this.isChronoFrozen ? 0 : dt;

    // Smooth speed lerp
    if (Math.abs(this.targetSpeedMultiplier - this.speedMultiplier) > 0.001) {
      this.speedMultiplier +=
        (this.targetSpeedMultiplier - this.speedMultiplier) *
        Math.min(1.0, effectiveDt * Starfield.LERP_SPEED);
    } else {
      this.speedMultiplier = this.targetSpeedMultiplier;
    }

    const currentSpeed = this.speedMultiplier;

    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];
      if (!star) continue;

      // Update vertical position
      star.y += star.speed * currentSpeed * effectiveDt;

      // Update twinkling phase
      star.twinklePhase += star.twinkleSpeed * effectiveDt;

      // Bottom wrap-around
      if (star.y >= this.virtualHeight) {
        star.y -= this.virtualHeight;
        star.x = Math.random() * this.virtualWidth;
        star.twinklePhase = Math.random() * Math.PI * 2;
      } else if (star.y < 0) {
        star.y += this.virtualHeight;
        star.x = Math.random() * this.virtualWidth;
      }
    }
  }

  /**
   * Renders all stars onto the canvas context with integer pixel snapping.
   */
  public render(ctx: CanvasRenderingContext2D): void {
    const isWarping = this.speedMultiplier > 3.0 && !this.isChronoFrozen;
    const streakLength = isWarping
      ? Math.min(10, Math.floor(this.speedMultiplier * 1.5))
      : 0;

    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];
      if (!star) continue;

      const depth = this.starDepths[i] ?? 0.3;
      const size = this.starSizes[i] ?? 1;

      // Sinusoidal brightness modulation
      const sinOsc = 0.5 + 0.5 * Math.sin(star.twinklePhase);
      const alpha = Math.max(
        0.05,
        Math.min(1.0, star.brightness * ((1 - depth) + depth * sinOsc))
      );

      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.isChronoFrozen
        ? STARFIELD_ICE_COLORS[i % STARFIELD_ICE_COLORS.length]!
        : star.color;

      const px = Math.floor(star.x);
      const py = Math.floor(star.y);

      if (isWarping && star.layer === 2) {
        // Render motion blur streak in hyperspace warp
        ctx.fillRect(px, py - streakLength, size, streakLength + size);
      } else {
        ctx.fillRect(px, py, size, size);
      }
    }

    // Reset alpha for subsequent render passes
    ctx.globalAlpha = 1.0;
  }

  /**
   * Resets the starfield positions and speeds.
   */
  public reset(): void {
    this.speedMultiplier = 1.0;
    this.targetSpeedMultiplier = 1.0;
    this.currentState = 'NORMAL';
    this.generateStars(this.stars.length || Starfield.DEFAULT_STAR_COUNT);
  }
}
