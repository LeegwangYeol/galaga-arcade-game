/**
 * Galaga Arcade Web Game — Fixed-Timestep Deterministic Game Loop
 * 
 * Architecture:
 * - 60 FPS fixed-timestep accumulator loop for bit-identical arcade physics determinism.
 * - Alpha sub-frame interpolation factor [0, 1) for stutter-free visual rendering.
 * - Spiral-of-Death delta-time clamping (<= 100ms) on browser tab blur, GC, or lag spikes.
 * - Explicit lifecycle control: start, stop, pause, resume, isPaused, isRunning.
 * - Real-time instantaneous, EMA-smoothed, and 1-second windowed FPS tracking.
 */

export type UpdateCallback = (dt: number) => void;
export type RenderCallback = (alpha: number) => void;

export interface GameLoopOptions {
  /** Target fixed physics timestep in seconds (Default: 1/60 = 0.0166667s) */
  fixedDt?: number;
  /** Maximum allowable frame delta in seconds to avoid spiral of death (Default: 0.1s = 100ms) */
  maxDelta?: number;
  /** Target frames per second (Default: 60) */
  targetFps?: number;
  /** Physics update callback executed at exact fixed intervals */
  onUpdate?: UpdateCallback;
  /** Visual render callback executed every display refresh frame with interpolation factor */
  onRender?: RenderCallback;
  /** Alias for onUpdate */
  update?: UpdateCallback;
  /** Alias for onRender */
  render?: RenderCallback;
}

export interface GameLoopMetrics {
  fps: number;
  averageFps: number;
  frameTimeMs: number;
  tickCount: number;
  frameCount: number;
  runningTimeSeconds: number;
}

export class GameLoop {
  // Timing parameters
  private readonly fixedDt: number;
  private readonly maxDelta: number;

  // Callbacks
  private readonly onUpdate: UpdateCallback;
  private readonly onRender: RenderCallback;

  // Lifecycle state
  private isRunningState: boolean = false;
  private isPausedState: boolean = false;
  private rafId: number | null = null;

  // Timestamps & Accumulator
  private lastTime: number = 0;
  private accumulator: number = 0;
  private totalRunningTime: number = 0;

  // Performance & Profiling Counters
  private tickCounter: number = 0;
  private frameCounter: number = 0;
  private currentFps: number = 60.0;
  private smoothedFps: number = 60.0;
  private lastFrameDurationMs: number = 16.67;

  // 1-second FPS sample window
  private fpsWindowStart: number = 0;
  private fpsWindowFrames: number = 0;
  private windowedFps: number = 60.0;

  constructor(options: GameLoopOptions) {
    if (options.fixedDt && options.fixedDt > 0) {
      this.fixedDt = options.fixedDt;
    } else if (options.targetFps && options.targetFps > 0) {
      this.fixedDt = 1 / options.targetFps;
    } else {
      this.fixedDt = 1 / 60;
    }

    this.maxDelta = options.maxDelta && options.maxDelta > 0 ? options.maxDelta : 0.1;
    this.onUpdate = options.onUpdate ?? options.update ?? (() => {});
    this.onRender = options.onRender ?? options.render ?? (() => {});

    // Bound tick callback for requestAnimationFrame
    this.tick = this.tick.bind(this);
  }

  /**
   * Starts the game loop. If already running, this is a no-op.
   */
  public start(): void {
    if (this.isRunningState) return;

    this.isRunningState = true;
    this.isPausedState = false;
    this.lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.accumulator = 0;
    this.fpsWindowStart = this.lastTime;
    this.fpsWindowFrames = 0;

    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  /**
   * Stops the game loop and cancels pending animation frame requests.
   */
  public stop(): void {
    if (!this.isRunningState) return;

    this.isRunningState = false;
    this.isPausedState = false;

    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = null;
    }
  }

  /**
   * Pauses the simulation. While paused, physics updates are suspended.
   * Render callbacks continue to fire with alpha=0 to allow overlay rendering.
   */
  public pause(): void {
    if (!this.isRunningState || this.isPausedState) return;
    this.isPausedState = true;
  }

  /**
   * Resumes the simulation from a paused state without time-jump artifacts.
   */
  public resume(): void {
    if (!this.isRunningState || !this.isPausedState) return;

    this.isPausedState = false;
    // Reset lastTime to current timestamp to prevent massive delta accumulation
    this.lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.accumulator = 0;
  }

  /**
   * Returns whether the game loop is currently running (either playing or paused).
   */
  public isRunning(): boolean {
    return this.isRunningState;
  }

  /**
   * Returns whether the simulation is currently in a paused state.
   */
  public isPaused(): boolean {
    return this.isPausedState;
  }

  /**
   * Returns the instantaneous smoothed FPS estimate.
   */
  public getFPS(): number {
    return Math.round(this.smoothedFps * 10) / 10;
  }

  /**
   * Returns the stable 1-second windowed average FPS.
   */
  public getAverageFPS(): number {
    return Math.round(this.windowedFps * 10) / 10;
  }

  /**
   * Returns the duration in milliseconds of the last rendered frame.
   */
  public getFrameTime(): number {
    return this.lastFrameDurationMs;
  }

  /**
   * Returns the total count of fixed physics updates (ticks) executed since start.
   */
  public getTickCount(): number {
    return this.tickCounter;
  }

  /**
   * Returns the total count of visual render frames drawn since start.
   */
  public getFrameCount(): number {
    return this.frameCounter;
  }

  /**
   * Returns a snapshot of runtime metrics for debugging and HUD overlays.
   */
  public getMetrics(): GameLoopMetrics {
    return {
      fps: this.getFPS(),
      averageFps: this.getAverageFPS(),
      frameTimeMs: Math.round(this.lastFrameDurationMs * 100) / 100,
      tickCount: this.tickCounter,
      frameCount: this.frameCounter,
      runningTimeSeconds: Math.round(this.totalRunningTime * 100) / 100,
    };
  }

  /**
   * Core frame tick executed by requestAnimationFrame or manual stepping.
   */
  public tick(timestamp: number = typeof performance !== 'undefined' ? performance.now() : Date.now()): void {
    if (!this.isRunningState) return;

    // Schedule next frame if in browser environment
    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(this.tick);
    }

    // Compute frame delta time in seconds
    const deltaMs = timestamp - this.lastTime;
    this.lastTime = timestamp;
    this.lastFrameDurationMs = deltaMs;

    // Convert to seconds
    let dt = deltaMs / 1000;

    // Guard against negative delta or extreme clock anomalies
    if (dt < 0 || isNaN(dt)) {
      dt = 0;
    }

    // Clamp delta time to avoid spiral of death
    if (dt > this.maxDelta) {
      dt = this.maxDelta;
    }

    // Update FPS metrics
    this.updateMetrics(deltaMs, timestamp);

    // If paused, skip physics accumulation and render with alpha = 0
    if (this.isPausedState) {
      this.onRender(0);
      this.frameCounter++;
      return;
    }

    // Accumulate elapsed simulation time
    this.accumulator += dt;
    this.totalRunningTime += dt;

    // Fixed-timestep simulation update loop
    while (this.accumulator >= this.fixedDt) {
      this.onUpdate(this.fixedDt);
      this.accumulator -= this.fixedDt;
      this.tickCounter++;
    }

    // Compute interpolation alpha factor for sub-frame smoothing [0, 1)
    const alpha = this.accumulator / this.fixedDt;

    // Visual rendering callback
    this.onRender(Math.max(0, Math.min(1, alpha)));
    this.frameCounter++;
  }

  /**
   * Manually steps the loop forward by a specified delta time in seconds.
   * Useful for deterministic testing and replay simulation.
   */
  public step(dt: number): void {
    let clampedDt = dt;
    if (clampedDt < 0 || isNaN(clampedDt)) clampedDt = 0;
    if (clampedDt > this.maxDelta) clampedDt = this.maxDelta;

    if (this.isPausedState) {
      this.onRender(0);
      this.frameCounter++;
      return;
    }

    this.accumulator += clampedDt;
    this.totalRunningTime += clampedDt;

    while (this.accumulator >= this.fixedDt) {
      this.onUpdate(this.fixedDt);
      this.accumulator -= this.fixedDt;
      this.tickCounter++;
    }

    const alpha = this.accumulator / this.fixedDt;
    this.onRender(Math.max(0, Math.min(1, alpha)));
    this.frameCounter++;
  }

  /**
   * Updates rolling and windowed FPS metrics.
   */
  private updateMetrics(deltaMs: number, timestamp: number): void {
    if (deltaMs > 0) {
      this.currentFps = 1000 / deltaMs;
      // Exponential Moving Average filter (alpha = 0.05)
      this.smoothedFps = this.smoothedFps * 0.95 + this.currentFps * 0.05;
    }

    this.fpsWindowFrames++;
    const windowElapsed = timestamp - this.fpsWindowStart;
    if (windowElapsed >= 1000) {
      this.windowedFps = (this.fpsWindowFrames * 1000) / windowElapsed;
      this.fpsWindowStart = timestamp;
      this.fpsWindowFrames = 0;
    }
  }
}
