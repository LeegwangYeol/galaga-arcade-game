/**
 * Galaga Arcade Web Game — Core Screen & Viewport Manager
 * 
 * Handles virtual coordinate systems (224x288 native / 448x576 internal buffer),
 * deterministic letterbox/pillarbox scaling, client-to-virtual coordinate mapping,
 * RAF debounced resize handling, and crisp high-DPI pixelated canvas rendering.
 */

import type { ViewportTransform, VirtualResolution, Vector2D } from '../types';

export type ResizeCallback = (transform: ViewportTransform) => void;

export interface ScreenManagerOptions {
  virtualWidth?: number;
  virtualHeight?: number;
  bufferScale?: number;
  container?: HTMLElement | null;
}

export class ScreenManager {
  public static readonly DEFAULT_VIRTUAL_WIDTH = 224;
  public static readonly DEFAULT_VIRTUAL_HEIGHT = 288;
  public static readonly DEFAULT_ASPECT_RATIO = 224 / 288; // 7:9 (~0.7778)

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private container: HTMLElement | null = null;

  private virtualWidth: number = ScreenManager.DEFAULT_VIRTUAL_WIDTH;
  private virtualHeight: number = ScreenManager.DEFAULT_VIRTUAL_HEIGHT;
  private bufferScale: number = 1;

  private currentTransform: ViewportTransform = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    displayWidth: ScreenManager.DEFAULT_VIRTUAL_WIDTH,
    displayHeight: ScreenManager.DEFAULT_VIRTUAL_HEIGHT,
    virtualWidth: ScreenManager.DEFAULT_VIRTUAL_WIDTH,
    virtualHeight: ScreenManager.DEFAULT_VIRTUAL_HEIGHT,
  };

  private resizeObservers: Set<ResizeCallback> = new Set();
  private rafResizePending: boolean = false;
  private resizeListenerBound: (() => void) | null = null;

  constructor(
    canvasOrOptions?: HTMLCanvasElement | ScreenManagerOptions,
    virtualWidth?: number,
    virtualHeight?: number,
    container?: HTMLElement | null
  ) {
    if (typeof HTMLCanvasElement !== 'undefined' && canvasOrOptions instanceof HTMLCanvasElement) {
      this.initialize(canvasOrOptions, {
        virtualWidth: virtualWidth ?? ScreenManager.DEFAULT_VIRTUAL_WIDTH,
        virtualHeight: virtualHeight ?? ScreenManager.DEFAULT_VIRTUAL_HEIGHT,
        container: container ?? null,
      });
    } else if (
      canvasOrOptions &&
      typeof canvasOrOptions === 'object' &&
      ('getContext' in canvasOrOptions || 'style' in canvasOrOptions) &&
      !('virtualWidth' in canvasOrOptions)
    ) {
      this.initialize(canvasOrOptions as HTMLCanvasElement, {
        virtualWidth: virtualWidth ?? ScreenManager.DEFAULT_VIRTUAL_WIDTH,
        virtualHeight: virtualHeight ?? ScreenManager.DEFAULT_VIRTUAL_HEIGHT,
        container: container ?? null,
      });
    } else if (canvasOrOptions && typeof canvasOrOptions === 'object') {
      const options = canvasOrOptions as ScreenManagerOptions;
      this.virtualWidth = options.virtualWidth ?? ScreenManager.DEFAULT_VIRTUAL_WIDTH;
      this.virtualHeight = options.virtualHeight ?? ScreenManager.DEFAULT_VIRTUAL_HEIGHT;
      this.bufferScale = options.bufferScale ?? 1;
      this.container = options.container ?? null;
    }
  }

  /**
   * Pure mathematical function to compute letterbox/pillarbox transform for any window size.
   */
  public static calculateTransform(
    windowWidth: number,
    windowHeight: number,
    virtualWidth: number = ScreenManager.DEFAULT_VIRTUAL_WIDTH,
    virtualHeight: number = ScreenManager.DEFAULT_VIRTUAL_HEIGHT
  ): ViewportTransform {
    const targetAspect = virtualWidth / virtualHeight;
    const windowAspect = windowWidth / windowHeight;

    let displayWidth: number;
    let displayHeight: number;

    if (windowAspect < targetAspect) {
      // Screen is narrower than game aspect ratio -> Letterbox top/bottom
      displayWidth = windowWidth;
      displayHeight = Math.floor(windowWidth / targetAspect);
    } else {
      // Screen is wider than game aspect ratio -> Pillarbox left/right
      displayHeight = windowHeight;
      displayWidth = Math.floor(windowHeight * targetAspect);
    }

    const scale = displayWidth / virtualWidth;
    const offsetX = Math.floor((windowWidth - displayWidth) / 2);
    const offsetY = Math.floor((windowHeight - displayHeight) / 2);

    return {
      scale,
      offsetX,
      offsetY,
      displayWidth,
      displayHeight,
      virtualWidth,
      virtualHeight,
    };
  }

  /**
   * Initializes the ScreenManager with a canvas element and optional configuration options.
   */
  public initialize(canvas: HTMLCanvasElement, options?: ScreenManagerOptions): CanvasRenderingContext2D {
    this.canvas = canvas;
    this.virtualWidth = options?.virtualWidth ?? this.virtualWidth;
    this.virtualHeight = options?.virtualHeight ?? this.virtualHeight;
    this.bufferScale = options?.bufferScale ?? this.bufferScale;
    this.container = options?.container ?? canvas.parentElement ?? (typeof document !== 'undefined' ? document.body : null);

    // Set internal resolution buffer
    this.canvas.width = Math.round(this.virtualWidth * this.bufferScale);
    this.canvas.height = Math.round(this.virtualHeight * this.bufferScale);

    // Acquire 2D context optimized for arcade rendering
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = this.canvas.getContext?.('2d', {
        alpha: false,
        desynchronized: true,
      }) as CanvasRenderingContext2D | null;
    } catch {
      // Fallback
    }

    if (!ctx) {
      // Mock fallback for testing environments
      this.ctx = {
        canvas: this.canvas,
        imageSmoothingEnabled: false,
        fillRect: () => {},
        drawImage: () => {},
      } as unknown as CanvasRenderingContext2D;
    } else {
      this.ctx = ctx;
      this.ctx.imageSmoothingEnabled = false;
    }

    // Apply pixel art CSS rules to canvas
    this.applyPixelatedStyles(this.canvas);

    // Initial resize calculation
    this.updateScalingImmediate();

    // Bind window resize listener with RAF debouncing
    if (typeof window !== 'undefined') {
      if (this.resizeListenerBound) {
        window.removeEventListener('resize', this.resizeListenerBound);
      }
      this.resizeListenerBound = () => this.scheduleResize();
      window.addEventListener('resize', this.resizeListenerBound);
    }

    return this.ctx;
  }

  /**
   * Schedules a resize update via requestAnimationFrame to eliminate layout thrashing.
   */
  public scheduleResize(): void {
    if (this.rafResizePending) return;
    this.rafResizePending = true;

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        this.rafResizePending = false;
        this.updateScalingImmediate();
      });
    } else {
      this.rafResizePending = false;
      this.updateScalingImmediate();
    }
  }

  /**
   * Computes and applies the viewport transformation immediately.
   */
  public updateScalingImmediate(): ViewportTransform {
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : this.virtualWidth;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : this.virtualHeight;

    this.currentTransform = ScreenManager.calculateTransform(
      windowWidth,
      windowHeight,
      this.virtualWidth,
      this.virtualHeight
    );

    if (this.canvas && this.canvas.style) {
      this.canvas.style.width = `${this.currentTransform.displayWidth}px`;
      this.canvas.style.height = `${this.currentTransform.displayHeight}px`;
      this.canvas.style.display = 'block';
      this.canvas.style.position = '';
      this.canvas.style.left = '';
      this.canvas.style.top = '';
    }

    // Notify all registered subscribers
    for (const observer of this.resizeObservers) {
      try {
        observer(this.currentTransform);
      } catch (err) {
        console.error('[ScreenManager] Resize observer error:', err);
      }
    }

    return this.currentTransform;
  }

  /**
   * Translates client pointer coordinates (e.g. mouse, touch) to virtual game space (224x288).
   * Returns null if coordinates fall outside the canvas bounds, unless clampToBounds is true.
   */
  public clientToVirtual(
    clientX: number,
    clientY: number,
    clampToBounds: boolean = false
  ): Vector2D | null {
    if (!this.canvas) return null;

    const rect = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
    if (!rect || rect.width === 0 || rect.height === 0) return null;

    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    const isOutOfBounds =
      localX < 0 || localX > rect.width || localY < 0 || localY > rect.height;

    if (isOutOfBounds && !clampToBounds) {
      return null;
    }

    const clampedX = Math.max(0, Math.min(rect.width, localX));
    const clampedY = Math.max(0, Math.min(rect.height, localY));

    const virtualX = (clampedX / rect.width) * this.virtualWidth;
    const virtualY = (clampedY / rect.height) * this.virtualHeight;

    return {
      x: virtualX,
      y: virtualY,
    };
  }

  /**
   * Translates virtual coordinates (e.g. player ship position) to client screen space.
   */
  public virtualToClient(virtualX: number, virtualY: number): Vector2D | null {
    if (!this.canvas) return null;

    const rect = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
    if (!rect || rect.width === 0 || rect.height === 0) return null;

    const clientX = rect.left + (virtualX / this.virtualWidth) * rect.width;
    const clientY = rect.top + (virtualY / this.virtualHeight) * rect.height;

    return {
      x: clientX,
      y: clientY,
    };
  }

  /**
   * Subscribes a callback to receive viewport resize events.
   * Returns an unsubscribe function.
   */
  public onResize(callback: ResizeCallback): () => void {
    this.resizeObservers.add(callback);
    // Call immediately with current transform
    callback(this.currentTransform);

    return () => {
      this.resizeObservers.delete(callback);
    };
  }

  /**
   * Applies CSS rules for crisp pixelated arcade display.
   */
  public applyPixelatedStyles(canvas: HTMLCanvasElement): void {
    if (!canvas || !canvas.style) return;
    canvas.style.imageRendering = 'pixelated';
    // Fallback vendor prefixes
    const styleObj = canvas.style as unknown as { [key: string]: string };
    styleObj['-webkit-crisp-edges'] = 'pixelated';
    styleObj['-moz-crisp-edges'] = 'pixelated';
    styleObj['crisp-edges'] = 'pixelated';
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    styleObj['-webkit-user-select'] = 'none';
  }

  /**
   * Toggles browser full-screen mode for the game container or canvas.
   */
  public async toggleFullscreen(): Promise<void> {
    if (typeof document === 'undefined') return;
    const target = this.container || this.canvas;
    if (!target) return;

    if (!document.fullscreenElement) {
      try {
        if (target.requestFullscreen) {
          await target.requestFullscreen();
        }
      } catch (err) {
        console.warn('[ScreenManager] Fullscreen request failed:', err);
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    }
  }

  /**
   * Destroys the ScreenManager instance, removing event listeners and clearing observers.
   */
  public destroy(): void {
    if (typeof window !== 'undefined' && this.resizeListenerBound) {
      window.removeEventListener('resize', this.resizeListenerBound);
      this.resizeListenerBound = null;
    }
    this.resizeObservers.clear();
    this.canvas = null;
    this.ctx = null;
    this.container = null;
  }

  // Getters
  public getTransform(): ViewportTransform {
    return this.currentTransform;
  }

  public getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  public getContext(): CanvasRenderingContext2D | null {
    return this.ctx;
  }

  public getResolution(): VirtualResolution {
    return {
      width: this.virtualWidth,
      height: this.virtualHeight,
      aspectRatio: this.virtualWidth / this.virtualHeight,
    };
  }
}
