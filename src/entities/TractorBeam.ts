/**
 * Galaga Arcade Web Game — Boss Galaga Tractor Beam Entity
 * 
 * Features:
 * 1. Trapezoidal cone geometry: Top width 8px at Boss base (x_b, y_b + 12),
 *    Bottom width 48px at screen bottom (Y = 280).
 * 2. Mathematical hit detection: Point-in-Trapezoid & AABB intersection tests.
 * 3. Procedural rendering: 12Hz pulsating blue/cyan/yellow energy waves,
 *    translucent gradient fill, diagonal edge shimmers, and spark particles.
 * 4. 5-phase lifecycle FSM: INACTIVE -> EXPANDING (0.5s) -> HOLDING (3.5s)
 *    -> CAPTURING -> RETRACTING (0.3s) -> INACTIVE.
 * 5. Zero Garbage Collection memory allocation during active update/render loops.
 */

import { EnemyState, type Rect } from '../types';
import { Enemy } from './Enemy';
import type { Player } from './Player';

export type TractorBeamPhase =
  | 'INACTIVE'
  | 'EXPANDING'
  | 'EMITTING'
  | 'HOLDING'
  | 'CAPTURING'
  | 'RETRACTING';

export interface TractorBeamGeometry {
  originX: number;
  originY: number;
  topWidth: number;
  bottomWidth: number;
  currentBottomY: number;
  targetBottomY: number;
  length: number;
  maxLength: number;
  extensionRatio: number;
}

export interface BeamParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  active: boolean;
}

export class TractorBeam {
  // Spatial & Geometry Constants
  public static readonly TOP_WIDTH = 8;
  public static readonly BOTTOM_WIDTH_TARGET = 48;
  public static readonly TARGET_BOTTOM_Y = 280;
  public static readonly EMITTER_OFFSET_Y = 12;

  // Timing Constants (Seconds)
  public static readonly EXPAND_DURATION = 0.5;
  public static readonly HOLD_DURATION = 3.5;
  public static readonly RETRACT_DURATION = 0.3;
  public static readonly COLOR_PULSE_FREQ = 12; // 12 Hz
  public static readonly WAVE_SCROLL_SPEED = 72; // Pixels per second
  public static readonly WAVE_BAND_SPACING = 6;  // Pixels between scanlines

  // State & Timers
  public state: TractorBeamPhase = 'INACTIVE';
  public timer: number = 0;
  public totalActiveTime: number = 0;

  // Boss Galaga Projector Anchors
  public bossX: number = 112;
  public bossY: number = 80;
  public topY: number = 92;
  public currentBottomY: number = 92;
  public currentBottomWidth: number = 8;
  public extensionRatio: number = 0;

  // Emitting Boss Enemy Reference
  public bossEnemy: Enemy | null = null;

  // Particle Engine Pool (Pre-allocated 16 particles)
  private static readonly MAX_PARTICLES = 16;
  public readonly particles: BeamParticle[] = [];

  // Callbacks
  public onStateChange?: (newState: TractorBeamPhase, oldState: TractorBeamPhase) => void;
  public onCaptureTriggered?: (targetX: number, targetY: number) => void;
  public onDeactivated?: () => void;

  constructor() {
    this.initParticlePool();
    this.reset();
  }

  // ==========================================================================
  // 1. Lifecycle Control Methods
  // ==========================================================================

  public reset(): void {
    this.state = 'INACTIVE';
    this.timer = 0;
    this.totalActiveTime = 0;
    this.bossX = 112;
    this.bossY = 80;
    this.topY = 92;
    this.currentBottomY = 92;
    this.currentBottomWidth = TractorBeam.TOP_WIDTH;
    this.extensionRatio = 0;
    this.bossEnemy = null;

    for (const p of this.particles) {
      p.active = false;
    }
  }

  public isActive(): boolean {
    return this.state !== 'INACTIVE';
  }

  public canCapture(): boolean {
    return (
      this.state === 'HOLDING' ||
      this.state === 'EMITTING' ||
      this.state === 'EXPANDING' ||
      this.state === 'CAPTURING'
    );
  }

  public getState(): TractorBeamPhase {
    return this.state;
  }

  public getBoss(): Enemy | null {
    return this.bossEnemy;
  }

  /**
   * Activates the tractor beam from Boss Galaga.
   * Accepts either an Enemy instance or explicit coordinates.
   * Returns true if successfully activated, false if already active.
   */
  public activate(bossOrX: Enemy | number, bossY?: number): boolean {
    if (this.isActive()) {
      return false;
    }

    const oldState = this.state;
    this.state = 'EMITTING';
    this.timer = 0;
    this.totalActiveTime = 0;

    if (bossOrX instanceof Enemy || (typeof bossOrX === 'object' && bossOrX !== null && 'x' in bossOrX)) {
      this.bossEnemy = bossOrX as Enemy;
      this.bossX = bossOrX.x;
      this.bossY = bossOrX.y;
    } else {
      this.bossEnemy = null;
      this.bossX = bossOrX;
      this.bossY = bossY ?? 80;
    }

    this.topY = this.bossY + TractorBeam.EMITTER_OFFSET_Y;
    this.currentBottomY = this.topY;
    this.currentBottomWidth = TractorBeam.TOP_WIDTH;
    this.extensionRatio = 0;

    this.onStateChange?.('EMITTING', oldState);
    return true;
  }

  /**
   * Transitions beam to capturing state when player is caught.
   */
  public startCapture(_player?: Player | null): void {
    if (this.state === 'INACTIVE') return;
    const oldState = this.state;
    this.state = 'CAPTURING';
    this.onStateChange?.('CAPTURING', oldState);
  }

  /**
   * Start capture sequence alias.
   */
  public startCapturing(): void {
    this.startCapture();
  }

  /**
   * Prematurely or normally deactivates/collapses the beam.
   */
  public deactivate(immediate: boolean = false): void {
    if (this.state === 'INACTIVE') return;

    const oldState = this.state;
    if (immediate) {
      this.reset();
      this.onStateChange?.('INACTIVE', oldState);
      this.onDeactivated?.();
    } else if (this.state !== 'RETRACTING') {
      this.state = 'RETRACTING';
      this.timer = 0;
      this.onStateChange?.('RETRACTING', oldState);
    }
  }

  // ==========================================================================
  // 2. Fixed Timestep Update Pipeline
  // ==========================================================================

  public update(dt: number, bossX?: number, bossY?: number): void {
    if (this.state === 'INACTIVE') return;

    // Follow attached Boss enemy if present
    if (this.bossEnemy && this.bossEnemy.active) {
      this.bossX = this.bossEnemy.x;
      this.bossY = this.bossEnemy.y;
      this.topY = this.bossEnemy.y + TractorBeam.EMITTER_OFFSET_Y;
    } else {
      if (bossX !== undefined) this.bossX = bossX;
      if (bossY !== undefined) {
        this.bossY = bossY;
        this.topY = bossY + TractorBeam.EMITTER_OFFSET_Y;
      }
    }

    this.timer += dt;
    this.totalActiveTime += dt;

    const maxReach = Math.max(this.topY + 1, TractorBeam.TARGET_BOTTOM_Y);
    const fullHeight = maxReach - this.topY;

    switch (this.state) {
      case 'EMITTING':
      case 'EXPANDING': {
        this.extensionRatio = Math.min(1.0, this.timer / TractorBeam.EXPAND_DURATION);
        this.currentBottomY = this.topY + this.extensionRatio * fullHeight;
        this.currentBottomWidth =
          TractorBeam.TOP_WIDTH +
          this.extensionRatio * (TractorBeam.BOTTOM_WIDTH_TARGET - TractorBeam.TOP_WIDTH);

        if (this.timer >= TractorBeam.EXPAND_DURATION) {
          const oldState = this.state;
          this.state = 'HOLDING';
          this.timer = 0;
          this.extensionRatio = 1.0;
          this.currentBottomY = maxReach;
          this.currentBottomWidth = TractorBeam.BOTTOM_WIDTH_TARGET;
          this.onStateChange?.('HOLDING', oldState);
        }
        break;
      }

      case 'HOLDING': {
        this.extensionRatio = 1.0;
        this.currentBottomY = maxReach;
        this.currentBottomWidth = TractorBeam.BOTTOM_WIDTH_TARGET;

        if (this.timer >= TractorBeam.HOLD_DURATION) {
          const oldState = this.state;
          this.state = 'RETRACTING';
          this.timer = 0;
          this.onStateChange?.('RETRACTING', oldState);
        }
        break;
      }

      case 'CAPTURING': {
        // Full beam cone maintained during capture ascension
        this.extensionRatio = 1.0;
        this.currentBottomY = maxReach;
        this.currentBottomWidth = TractorBeam.BOTTOM_WIDTH_TARGET;
        break;
      }

      case 'RETRACTING': {
        const retractProgress = Math.min(1.0, this.timer / TractorBeam.RETRACT_DURATION);
        this.extensionRatio = 1.0 - retractProgress;
        this.currentBottomY = this.topY + this.extensionRatio * fullHeight;
        this.currentBottomWidth =
          TractorBeam.TOP_WIDTH +
          this.extensionRatio * (TractorBeam.BOTTOM_WIDTH_TARGET - TractorBeam.TOP_WIDTH);

        if (this.timer >= TractorBeam.RETRACT_DURATION) {
          // Resume Boss Galaga into downward dive if player was not captured
          if (
            this.bossEnemy &&
            this.bossEnemy.active &&
            this.bossEnemy.state === EnemyState.TRACTOR_BEAM_ACTIVE
          ) {
            this.bossEnemy.state = EnemyState.DIVING_SOLO;
            this.bossEnemy.vx = 0;
            this.bossEnemy.vy = this.bossEnemy.diveSpeed;
            this.bossEnemy.rotation = 0;
          }
          this.reset();
          this.onStateChange?.('INACTIVE', 'RETRACTING');
          this.onDeactivated?.();
        }
        break;
      }
    }

    // Update Spark Particles
    this.updateParticles(dt);
  }

  // ==========================================================================
  // 3. Mathematical Hit Detection & Spatial Tests
  // ==========================================================================

  /**
   * Computes the beam half-width at any given vertical coordinate y.
   */
  public getHalfWidthAtY(y: number): number {
    if (y < this.topY || y > this.currentBottomY) return 0;

    const fullHeight = Math.max(1, TractorBeam.TARGET_BOTTOM_Y - this.topY);
    const spanRatio = Math.max(0, Math.min(1, (y - this.topY) / fullHeight));

    const halfTop = TractorBeam.TOP_WIDTH / 2; // 4px
    const halfBottomTarget = TractorBeam.BOTTOM_WIDTH_TARGET / 2; // 24px

    return halfTop + spanRatio * (halfBottomTarget - halfTop);
  }

  /**
   * Exact Point-in-Trapezoid test.
   */
  public containsPoint(px: number, py: number): boolean {
    if (this.state === 'INACTIVE') return false;

    // 1. Vertical bounds check
    if (py < this.topY || py > this.currentBottomY) {
      return false;
    }

    // 2. Horizontal span check
    const halfWidth = this.getHalfWidthAtY(py);
    return Math.abs(px - this.bossX) <= halfWidth;
  }

  /**
   * AABB Hitbox vs Trapezoid intersection test.
   */
  public intersectsAABB(box: Rect): boolean {
    if (this.state === 'INACTIVE') return false;

    const boxTop = box.y;
    const boxBottom = box.y + box.height;
    const boxLeft = box.x;
    const boxRight = box.x + box.width;

    // 1. Vertical interval overlap
    if (boxBottom < this.topY || boxTop > this.currentBottomY) {
      return false;
    }

    // 2. Test bottom Y of overlapping segment (maximum width across vertical overlap)
    const overlapBottomY = Math.min(boxBottom, this.currentBottomY);
    const halfWidth = this.getHalfWidthAtY(overlapBottomY);

    const beamLeft = this.bossX - halfWidth;
    const beamRight = this.bossX + halfWidth;

    // 1D horizontal overlap
    return Math.max(boxLeft, beamLeft) <= Math.min(boxRight, beamRight);
  }

  /**
   * Alias for intersectsAABB.
   */
  public intersectsHitbox(box: Rect): boolean {
    return this.intersectsAABB(box);
  }

  /**
   * Returns current geometric snapshot.
   */
  public getGeometry(): TractorBeamGeometry {
    const fullHeight = Math.max(1, TractorBeam.TARGET_BOTTOM_Y - this.topY);
    return {
      originX: this.bossX,
      originY: this.topY,
      topWidth: TractorBeam.TOP_WIDTH,
      bottomWidth: this.currentBottomWidth,
      currentBottomY: this.currentBottomY,
      targetBottomY: TractorBeam.TARGET_BOTTOM_Y,
      length: this.currentBottomY - this.topY,
      maxLength: fullHeight,
      extensionRatio: this.extensionRatio,
    };
  }

  // ==========================================================================
  // 4. Procedural Canvas 2D Rendering Engine
  // ==========================================================================

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'INACTIVE' || this.currentBottomY <= this.topY + 1) {
      return;
    }

    ctx.save();

    const topHalf = TractorBeam.TOP_WIDTH / 2;
    const bottomHalf = this.currentBottomWidth / 2;
    const leftTop = this.bossX - topHalf;
    const rightTop = this.bossX + topHalf;
    const leftBottom = this.bossX - bottomHalf;
    const rightBottom = this.bossX + bottomHalf;

    // A. Build Trapezoid Path
    ctx.beginPath();
    ctx.moveTo(leftTop, this.topY);
    ctx.lineTo(rightTop, this.topY);
    ctx.lineTo(rightBottom, this.currentBottomY);
    ctx.lineTo(leftBottom, this.currentBottomY);
    ctx.closePath();

    // B. Semi-Transparent Energy Gradient Fill
    const gradient = ctx.createLinearGradient(
      this.bossX,
      this.topY,
      this.bossX,
      this.currentBottomY
    );
    gradient.addColorStop(0.0, 'rgba(0, 255, 255, 0.40)'); // Cyan emitter core
    gradient.addColorStop(0.5, 'rgba(91, 147, 255, 0.20)'); // Soft blue mid-wave
    gradient.addColorStop(1.0, 'rgba(0, 100, 255, 0.06)');  // Base aura
    ctx.fillStyle = gradient;
    ctx.fill();

    // C. 12Hz Pulsating Horizontal Scanline Waves
    const pulsePhase = Math.floor(this.totalActiveTime * TractorBeam.COLOR_PULSE_FREQ) % 3;
    const scrollOffset =
      (this.totalActiveTime * TractorBeam.WAVE_SCROLL_SPEED) % TractorBeam.WAVE_BAND_SPACING;

    ctx.lineWidth = 1.5;

    let lineY = this.topY + scrollOffset;
    let bandIdx = 0;

    while (lineY <= this.currentBottomY) {
      const halfW = this.getHalfWidthAtY(lineY);
      const colorType = (bandIdx + pulsePhase) % 3;

      if (colorType === 0) {
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.85)'; // Cyan
      } else if (colorType === 1) {
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.90)'; // Yellow
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)'; // White
      }

      ctx.beginPath();
      ctx.moveTo(this.bossX - halfW + 1, lineY);
      ctx.lineTo(this.bossX + halfW - 1, lineY);
      ctx.stroke();

      lineY += TractorBeam.WAVE_BAND_SPACING;
      bandIdx++;
    }

    // D. Diagonal Shimmer Border Edges
    const edgeColor =
      pulsePhase === 1 ? 'rgba(255, 255, 0, 0.95)' : 'rgba(0, 255, 255, 0.95)';
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 1.0;

    ctx.beginPath();
    // Left diagonal edge
    ctx.moveTo(leftTop, this.topY);
    ctx.lineTo(leftBottom, this.currentBottomY);
    // Right diagonal edge
    ctx.moveTo(rightTop, this.topY);
    ctx.lineTo(rightBottom, this.currentBottomY);
    // Top emitter line
    ctx.moveTo(leftTop, this.topY);
    ctx.lineTo(rightTop, this.topY);
    ctx.stroke();

    // E. Render Sparkling Energy Particles
    this.renderParticles(ctx);

    ctx.restore();
  }

  // ==========================================================================
  // 5. Zero-Allocation Spark Particle Subsystem
  // ==========================================================================

  private initParticlePool(): void {
    for (let i = 0; i < TractorBeam.MAX_PARTICLES; i++) {
      this.particles.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0.4,
        color: '#FFFF00',
        size: 1.5,
        active: false,
      });
    }
  }

  private updateParticles(dt: number): void {
    const colors = ['#FFFF00', '#00FFFF', '#FFFFFF'];

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!;

      if (!p.active) {
        // Periodically spawn new particle inside active cone
        if (Math.random() < 0.25) {
          const spawnY = this.topY + Math.random() * (this.currentBottomY - this.topY);
          const halfW = this.getHalfWidthAtY(spawnY);
          p.x = this.bossX + (Math.random() * 2 - 1) * halfW * 0.9;
          p.y = spawnY;
          p.vx = (Math.random() - 0.5) * 20;
          p.vy = 40 + Math.random() * 60;
          p.life = 0;
          p.maxLife = 0.2 + Math.random() * 0.3;
          p.color = colors[Math.floor(Math.random() * colors.length)]!;
          p.size = Math.random() < 0.5 ? 1.0 : 1.5;
          p.active = true;
        }
      } else {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Deactivate if out of cone or life expired
        if (p.life >= p.maxLife || p.y > this.currentBottomY || !this.containsPoint(p.x, p.y)) {
          p.active = false;
        }
      }
    }
  }

  private renderParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      const alpha = 1.0 - p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
  }
}
