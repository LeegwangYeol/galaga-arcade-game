# Milestone 2 Architectural Analysis: Screen Manager & Starfield Engine

**Author**: m2_explorer_2 (Milestone 2: Screen Manager & Starfield Specialist)  
**Date**: 2026-09-02  
**Target Systems**: `src/core/ScreenManager.ts`, `src/systems/Starfield.ts`  
**Dependencies**: `src/types/index.ts`  

---

## Executive Summary

This document specifies the complete mathematical derivations, architectural design, and production-ready TypeScript implementations for two foundational subsystems of the Galaga arcade engine:

1. **`ScreenManager` (`src/core/ScreenManager.ts`)**:
   - Enforces an authentic Galaga arcade portrait display ratio ($224 \times 288$, aspect ratio $7:9 \approx 0.7778$, commonly standardized as $3:4$ portrait).
   - Computes deterministic **Letterbox / Pillarbox** transformations across any viewport (4K desktop, ultra-wide, tablet, mobile portrait/landscape).
   - Provides bi-directional coordinate transformation (`clientToVirtual` and `virtualToClient`) with boundary clamping and out-of-bounds safety.
   - Implements RequestAnimationFrame (RAF) debounced resize throttling, multi-observer resize subscriptions, and razor-sharp CSS pixel art rendering flags.

2. **`Starfield` (`src/systems/Starfield.ts`)**:
   - Simulates a 3-layer parallax cosmic starfield with 100 stars calibrated for the $224 \times 288$ virtual resolution.
   - Employs authentic multi-spectral arcade color palettes (Brilliant White, Neon Blue, Electric Cyan, Warm Yellow, Vibrant Orange, Hot Magenta, Deep Indigo).
   - Implements sinusoidal twinkling phase modulation with independent frequency, phase, and brightness depth per star.
   - Features dynamic flight state transitions (`NORMAL`, `DIVING`, `WARP`, `PAUSED`) with smooth exponential lerp acceleration and hyperspace motion-blur streak rendering.
   - Eliminates garbage collection (GC) overhead through zero-allocation arrays and deterministic in-place mathematical updates.

---

## 1. System 1: `ScreenManager` Architecture & Mathematical Formulations

### 1.1 Virtual Resolution & Aspect Ratio Formulation

The original 1981 Galaga arcade hardware utilized a vertically oriented CRT monitor displaying $224 \times 288$ native pixels.

$$\text{Aspect Ratio } (AR_{\text{target}}) = \frac{W_{\text{virtual}}}{H_{\text{virtual}}} = \frac{224}{288} = \frac{7}{9} \approx 0.7777778$$

When rendered inside an arbitrary browser window of dimensions $W_{\text{window}} \times H_{\text{window}}$, the window aspect ratio is:

$$AR_{\text{window}} = \frac{W_{\text{window}}}{H_{\text{window}}}$$

### 1.2 Letterbox vs. Pillarbox Derivations

The scaling strategy must guarantee that the entire $224 \times 288$ game canvas fits inside the viewport without stretching, squashing, or cropping:

```
Case A: Window is wider than target (AR_window >= AR_target)
+-------------------------------------------------------------+
|              Pillarbox Margin (Black Background)             |
|          +-------------------------------+                  |
|          |                               |                  |
|          |      Active Game Canvas       |                  |
|          |     (Fitted to max height)    |                  |
|          |                               |                  |
|          +-------------------------------+                  |
+-------------------------------------------------------------+
OffsetX = (W_window - DisplayWidth) / 2, OffsetY = 0

Case B: Window is narrower/taller than target (AR_window < AR_target)
+----------------------------------+
|    Letterbox Margin (Black)      |
+----------------------------------+
|                                  |
|        Active Game Canvas        |
|      (Fitted to max width)       |
|                                  |
+----------------------------------+
|    Letterbox Margin (Black)      |
+----------------------------------+
OffsetX = 0, OffsetY = (H_window - DisplayHeight) / 2
```

#### Case 1: Pillarbox (Screen is wider than game aspect ratio, $AR_{\text{window}} \ge AR_{\text{target}}$)
- Display height fills the viewport height:
  $$H_{\text{display}} = H_{\text{window}}$$
- Display width is constrained by the target aspect ratio:
  $$W_{\text{display}} = \lfloor H_{\text{window}} \times AR_{\text{target}} \rfloor$$
- Scaling factor:
  $$S = \frac{W_{\text{display}}}{W_{\text{virtual}}} = \frac{H_{\text{display}}}{H_{\text{virtual}}}$$
- Centering offsets:
  $$O_x = \left\lfloor \frac{W_{\text{window}} - W_{\text{display}}}{2} \right\rfloor, \quad O_y = 0$$

#### Case 2: Letterbox (Screen is narrower than game aspect ratio, $AR_{\text{window}} < AR_{\text{target}}$)
- Display width fills the viewport width:
  $$W_{\text{display}} = W_{\text{window}}$$
- Display height is constrained by the target aspect ratio:
  $$H_{\text{display}} = \left\lfloor \frac{W_{\text{window}}}{AR_{\text{target}}} \right\rfloor$$
- Scaling factor:
  $$S = \frac{W_{\text{display}}}{W_{\text{virtual}}} = \frac{H_{\text{display}}}{H_{\text{virtual}}}$$
- Centering offsets:
  $$O_x = 0, \quad O_y = \left\lfloor \frac{H_{\text{window}} - H_{\text{display}}}{2} \right\rfloor$$

---

### 1.3 Client $\leftrightarrow$ Virtual Coordinate Transformations

User input events (mouse clicks, pointer movements, touch coordinates) provide client coordinates $(X_{\text{client}}, Y_{\text{client}})$ relative to the browser viewport. These must be translated into virtual game coordinates $(X_{\text{virtual}}, Y_{\text{virtual}}) \in [0, 224] \times [0, 288]$.

#### Direct Bounding Rect Translation Algorithm:
Given the canvas DOM element bounding rectangle $R = \text{canvas.getBoundingClientRect()}$:

$$X_{\text{local}} = X_{\text{client}} - R.\text{left}$$
$$Y_{\text{local}} = Y_{\text{client}} - R.\text{top}$$

If $X_{\text{local}} \notin [0, R.\text{width}]$ or $Y_{\text{local}} \notin [0, R.\text{height}]$ and `clampToBounds` is `false`:
$$\text{clientToVirtual}(X_{\text{client}}, Y_{\text{client}}) = \text{null}$$

When within bounds (or if `clampToBounds` is `true`):
$$X_{\text{clamped}} = \max(0, \min(R.\text{width}, X_{\text{local}}))$$
$$Y_{\text{clamped}} = \max(0, \min(R.\text{height}, Y_{\text{local}}))$$

$$X_{\text{virtual}} = \left( \frac{X_{\text{clamped}}}{R.\text{width}} \right) \times W_{\text{virtual}}$$
$$Y_{\text{virtual}} = \left( \frac{Y_{\text{clamped}}}{R.\text{height}} \right) \times H_{\text{virtual}}$$

#### Inverse Transformation (`virtualToClient`):
$$X_{\text{client}} = R.\text{left} + \left( \frac{X_{\text{virtual}}}{W_{\text{virtual}}} \right) \times R.\text{width}$$
$$Y_{\text{client}} = R.\text{top} + \left( \frac{Y_{\text{virtual}}}{H_{\text{virtual}}} \right) \times R.\text{height}$$

---

### 1.4 Resize Lifecycle & Layout Thrashing Prevention

In modern browser environments, `window.onresize` events can fire up to 120 times per second during rapid window dragging. Directly recalculating layout styles on every event causes forced synchronous layout thrashing.

`ScreenManager` implements a **RequestAnimationFrame (RAF) scheduled update loop**:
1. When `resize` triggers, if an RAF update is not already pending, request one via `requestAnimationFrame`.
2. On RAF execution, read viewport dimensions, recompute `ViewportTransform`, apply DOM style modifications, and broadcast the new transform to all registered subscribers.
3. Unsubscribe tokens are returned by `.onResize()` to guarantee leak-free lifecycle cleanup.

---

### 1.5 Context Configuration & Pixel Art CSS

To eliminate linear filtering blur on modern high-DPI displays:
- Canvas styles: `image-rendering: pixelated`, `image-rendering: -moz-crisp-edges`, `image-rendering: crisp-edges`, `touch-action: none`, `user-select: none`.
- Context configuration: `ctx.imageSmoothingEnabled = false`.
- Context creation: `{ alpha: false, desynchronized: true }` for maximum throughput and minimum frame latency.

---

### 1.6 Production Implementation: `src/core/ScreenManager.ts`

```typescript
/**
 * Galaga Arcade Web Game — Core Screen & Viewport Manager
 * Standardized for Vite 6 / TypeScript 5.7+ strict compilation.
 * 
 * Handles virtual coordinate systems (224x288 native / 448x576 internal buffer),
 * deterministic letterbox/pillarbox scaling, client-to-virtual coordinate mapping,
 * and high-DPI pixelated canvas rendering.
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
   * Initializes the ScreenManager with a canvas element and optional container.
   */
  public initialize(canvas: HTMLCanvasElement, options?: ScreenManagerOptions): CanvasRenderingContext2D {
    this.canvas = canvas;
    this.virtualWidth = options?.virtualWidth ?? ScreenManager.DEFAULT_VIRTUAL_WIDTH;
    this.virtualHeight = options?.virtualHeight ?? ScreenManager.DEFAULT_VIRTUAL_HEIGHT;
    this.bufferScale = options?.bufferScale ?? 1;
    this.container = options?.container ?? canvas.parentElement ?? document.body;

    // Set internal resolution buffer
    this.canvas.width = Math.round(this.virtualWidth * this.bufferScale);
    this.canvas.height = Math.round(this.virtualHeight * this.bufferScale);

    // Acquire 2D context optimized for arcade rendering
    const ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });

    if (!ctx) {
      throw new Error('[ScreenManager] Failed to acquire CanvasRenderingContext2D');
    }

    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    // Apply pixel art CSS rules to canvas
    this.applyPixelatedStyles(this.canvas);

    // Initial resize calculation
    this.updateScalingImmediate();

    // Bind window resize listener with RAF debouncing
    this.resizeListenerBound = () => this.scheduleResize();
    window.addEventListener('resize', this.resizeListenerBound);

    return this.ctx;
  }

  /**
   * Schedules a resize update via requestAnimationFrame to eliminate layout thrashing.
   */
  public scheduleResize(): void {
    if (this.rafResizePending) return;
    this.rafResizePending = true;

    requestAnimationFrame(() => {
      this.rafResizePending = false;
      this.updateScalingImmediate();
    });
  }

  /**
   * Computes and applies the viewport transformation immediately.
   */
  public updateScalingImmediate(): ViewportTransform {
    if (!this.canvas) return this.currentTransform;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    this.currentTransform = ScreenManager.calculateTransform(
      windowWidth,
      windowHeight,
      this.virtualWidth,
      this.virtualHeight
    );

    this.canvas.style.width = `${this.currentTransform.displayWidth}px`;
    this.canvas.style.height = `${this.currentTransform.displayHeight}px`;
    this.canvas.style.display = 'block';
    this.canvas.style.position = '';
    this.canvas.style.left = '';
    this.canvas.style.top = '';

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

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

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

    const rect = this.canvas.getBoundingClientRect();
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
  private applyPixelatedStyles(canvas: HTMLCanvasElement): void {
    canvas.style.imageRendering = 'pixelated';
    // Fallback prefixes for older WebKit / Gecko
    (canvas.style as unknown as { [key: string]: string })['-webkit-crisp-edges'] = 'pixelated';
    (canvas.style as unknown as { [key: string]: string })['-moz-crisp-edges'] = 'pixelated';
    (canvas.style as unknown as { [key: string]: string })['crisp-edges'] = 'pixelated';
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    (canvas.style as unknown as { [key: string]: string })['-webkit-user-select'] = 'none';
  }

  /**
   * Toggles browser full-screen mode for the game container or canvas.
   */
  public async toggleFullscreen(): Promise<void> {
    const target = this.container || this.canvas;
    if (!target) return;

    if (!document.fullscreenElement) {
      try {
        await target.requestFullscreen();
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
    if (this.resizeListenerBound) {
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
```

---

## 2. System 2: `Starfield` Architecture & Algorithmic Specifications

### 2.1 3-Layer Parallax Astronomy Model

The Galaga starfield creates the illusion of deep space velocity by partitioning stars into 3 distinct parallax depth layers.

```
+-------------------------------------------------------------------------+
| Layer 0: Deep Background (Distant Galaxies)                             |
| - 40 stars                                                              |
| - Base Speed: 12 - 16 px/s (virtual space)                              |
| - Size: 1 x 1 px                                                        |
| - Brightness: 0.25 - 0.55 (Faint)                                       |
| - Colors: Dark Navy (#3A506B), Dim Cyan (#48CAE4), Dim Purple (#7209B7)|
+-------------------------------------------------------------------------+
| Layer 1: Midground (Intermediate Field)                                 |
| - 35 stars                                                              |
| - Base Speed: 28 - 36 px/s                                              |
| - Size: 1 x 1 px                                                        |
| - Brightness: 0.50 - 0.85 (Medium)                                      |
| - Colors: Cyan (#00FFFF), Yellow (#FFE66D), Orange (#FF9F1C), Magenta   |
+-------------------------------------------------------------------------+
| Layer 2: Foreground (Near Field)                                        |
| - 25 stars                                                              |
| - Base Speed: 55 - 75 px/s                                              |
| - Size: 1 x 1 px or 2 x 2 px                                            |
| - Brightness: 0.75 - 1.00 (Brilliant)                                    |
| - Dynamic sinusoidal twinkling oscillation                              |
| - Colors: Pure White (#FFFFFF), Neon Blue (#5B93FF), Bright Cyan, Yellow|
+-------------------------------------------------------------------------+
Total Count: 100 stars (optimal density for 224 x 288)
```

---

### 2.2 Star Properties & Astronomical Color Palette

```typescript
export interface StarInstance {
  x: number;
  y: number;
  speed: number;
  layer: number;          // 0 = distant, 1 = mid, 2 = foreground
  size: number;           // 1 or 2 pixels
  color: string;
  baseBrightness: number; // [0.2, 1.0]
  twinklePhase: number;   // [0, 2π]
  twinkleSpeed: number;   // [1.5, 6.0] rad/s
  twinkleDepth: number;   // [0.2, 0.7] amplitude modulation
}
```

#### Palette Table & Layer Distribution:
```typescript
export const STAR_PALETTES = {
  LAYER_0: ['#3A506B', '#48CAE4', '#7209B7', '#A0AAB2', '#5A677D'],
  LAYER_1: ['#00FFFF', '#FFE66D', '#FF9F1C', '#FF007F', '#5B93FF', '#FFFFFF'],
  LAYER_2: ['#FFFFFF', '#5B93FF', '#00FFFF', '#FFFF00', '#FF007F'],
} as const;
```

---

### 2.3 Twinkling Modulation Equations

To prevent abrupt blinking and create organic stellar shimmer, each star modulates its opacity via a continuous sinusoidal equation:

$$\text{Oscillation}(t) = 0.5 + 0.5 \times \sin(\phi_{\text{twinkle}})$$

$$\alpha(t) = \text{clamp}\Big( \text{baseBrightness} \times \big( (1 - \text{twinkleDepth}) + \text{twinkleDepth} \times \text{Oscillation}(t) \big), 0.05, 1.0 \Big)$$

Where:
- $\phi_{\text{twinkle}}(t + \Delta t) = \phi_{\text{twinkle}}(t) + \omega_{\text{twinkle}} \times \Delta t$
- $\omega_{\text{twinkle}} \in [1.5, 6.0]\text{ rad/s}$ is randomized per star.
- $\text{twinkleDepth} \in [0.2, 0.7]$ determines the maximum amplitude dip.

---

### 2.4 State-Based Velocity Transitions & Smooth Lerp

The starfield responds to gameplay states with four primary operational modes:

| Mode | Multiplier ($M_{\text{target}}$) | Context / Description |
|---|---|---|
| `NORMAL` | $1.0\times$ | Standard cruising speed during wave dogfights. |
| `DIVING` | $2.8\times$ | Dynamic dive bombing attacks by Goei/Boss Galaga. |
| `WARP` | $6.5\times$ | Hyperspace stage transition & Challenging Stage entry. |
| `PAUSED` | $0.0\times$ | Game freeze, ship capture sequence, or pause menu. |

#### Exponential Lerp Acceleration Equation:
To prevent jarring instantaneous jumps in star speeds when switching modes:

$$M(t + \Delta t) = M(t) + \big( M_{\text{target}} - M(t) \big) \times \min(1.0, k_{\text{lerp}} \times \Delta t)$$

Where $k_{\text{lerp}} = 4.5\text{ s}^{-1}$ ensures a smooth, cinematic $250\text{ ms}$ transition curve.

---

### 2.5 Hyperspace Warp Mode & Motion Blur Streaks

When accelerating into `WARP` mode ($M(t) > 3.0$), foreground stars stretch into vertical light streaks representing relativistic Doppler motion blur:

$$\text{StreakLength} = \min\big( 10, \lfloor M(t) \times 1.5 \rfloor \big)$$

Rendering:
```typescript
if (star.layer === 2 && this.speedMultiplier > 3.0) {
  const streak = Math.min(10, Math.floor(this.speedMultiplier * 1.5));
  ctx.fillRect(px, py - streak, star.size, streak + star.size);
} else {
  ctx.fillRect(px, py, star.size, star.size);
}
```

---

### 2.6 Wrap-Around Boundary Logic & Anti-Stripe Reseeding

When stars scroll past the bottom boundary ($Y \ge H_{\text{virtual}}$):
1. Wrap $Y$ back to top: $Y \leftarrow Y - H_{\text{virtual}}$.
2. Re-randomize $X$ across $[0, W_{\text{virtual}}]$:
   $$X \leftarrow \text{random}() \times W_{\text{virtual}}$$
   *Crucial Arcade Detail*: Re-randomizing $X$ upon wrap-around prevents visible repetitive vertical striping patterns that occur with static loops.
3. Randomize a new twinkle phase to prevent synchronized flashing artifacts.

---

### 2.7 Production Implementation: `src/systems/Starfield.ts`

```typescript
/**
 * Galaga Arcade Web Game — Parallax Starfield System
 * Standardized for Vite 6 / TypeScript 5.7+ strict compilation.
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

export class Starfield {
  private stars: Star[] = [];
  private starSizes: Uint8Array;
  private starDepths: Float32Array;

  private virtualWidth: number;
  private virtualHeight: number;

  private speedMultiplier: number = 1.0;
  private targetSpeedMultiplier: number = 1.0;
  private currentState: StarfieldState = 'NORMAL';

  public static readonly DEFAULT_STAR_COUNT = 100;
  public static readonly LERP_SPEED = 4.5; // Smooth transition speed

  constructor(config?: StarfieldConfig) {
    this.virtualWidth = config?.virtualWidth ?? ScreenManager.DEFAULT_VIRTUAL_WIDTH;
    this.virtualHeight = config?.virtualHeight ?? ScreenManager.DEFAULT_VIRTUAL_HEIGHT;
    const count = config?.starCount ?? Starfield.DEFAULT_STAR_COUNT;

    this.starSizes = new Uint8Array(count);
    this.starDepths = new Float32Array(count);

    this.generateStars(count);
  }

  /**
   * Generates and distributes stars across 3 parallax layers.
   */
  private generateStars(count: number): void {
    this.stars = [];

    // Distribution: 40% Layer 0 (distant), 35% Layer 1 (mid), 25% Layer 2 (foreground)
    const layer0Count = Math.floor(count * 0.40);
    const layer1Count = Math.floor(count * 0.35);

    for (let i = 0; i < count; i++) {
      let layer = 0;
      let baseSpeed = 14;
      let size = 1;
      let baseBrightness = 0.45;
      let palette = STARFIELD_COLORS.LAYER_0;

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

      const color = palette[Math.floor(Math.random() * palette.length)];
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
   * Directly sets custom target speed multiplier for scripting.
   */
  public setTargetSpeedMultiplier(multiplier: number): void {
    this.targetSpeedMultiplier = Math.max(0, multiplier);
  }

  /**
   * Updates star positions, twinkling phases, and speed lerp.
   * Delta time (dt) is in seconds.
   */
  public update(dt: number): void {
    // Smooth speed lerp
    if (Math.abs(this.targetSpeedMultiplier - this.speedMultiplier) > 0.001) {
      this.speedMultiplier +=
        (this.targetSpeedMultiplier - this.speedMultiplier) *
        Math.min(1.0, dt * Starfield.LERP_SPEED);
    } else {
      this.speedMultiplier = this.targetSpeedMultiplier;
    }

    const currentSpeed = this.speedMultiplier;

    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];

      // Update vertical position
      star.y += star.speed * currentSpeed * dt;

      // Update twinkling phase
      star.twinklePhase += star.twinkleSpeed * dt;

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
   * Renders all stars onto the canvas context with subpixel integer snapping.
   */
  public render(ctx: CanvasRenderingContext2D): void {
    const isWarping = this.speedMultiplier > 3.0;
    const streakLength = isWarping
      ? Math.min(10, Math.floor(this.speedMultiplier * 1.5))
      : 0;

    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];
      const depth = this.starDepths[i];
      const size = this.starSizes[i];

      // Sinusoidal brightness modulation
      const sinOsc = 0.5 + 0.5 * Math.sin(star.twinklePhase);
      const alpha = Math.max(
        0.05,
        Math.min(1.0, star.brightness * ((1 - depth) + depth * sinOsc))
      );

      ctx.globalAlpha = alpha;
      ctx.fillStyle = star.color;

      const px = Math.floor(star.x);
      const py = Math.floor(star.y);

      if (isWarping && star.layer === 2) {
        // Render motion blur streak in hyperspace warp
        ctx.fillRect(px, py - streakLength, size, streakLength + size);
      } else {
        ctx.fillRect(px, py, size, size);
      }
    }

    // Reset alpha for subsequent layers
    ctx.globalAlpha = 1.0;
  }

  /**
   * Handles canvas virtual dimension adjustments.
   */
  public setVirtualDimensions(width: number, height: number): void {
    this.virtualWidth = width;
    this.virtualHeight = height;
  }

  // Getters
  public getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  public getTargetSpeedMultiplier(): number {
    return this.targetSpeedMultiplier;
  }

  public getState(): StarfieldState {
    return this.currentState;
  }

  public getStarCount(): number {
    return this.stars.length;
  }

  public getStars(): readonly Star[] {
    return this.stars;
  }
}
```

---

## 3. Unit & Integration Test Specifications

To ensure mathematical precision and 100% test pass rates under Vitest:

### 3.1 `tests/unit/ScreenManager.test.ts` Specification

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ScreenManager } from '../../src/core/ScreenManager';

describe('ScreenManager Core Suite', () => {
  describe('Static Aspect Ratio & Letterbox/Pillarbox Formulations', () => {
    it('standardizes on 224x288 virtual resolution with 7:9 aspect ratio', () => {
      expect(ScreenManager.DEFAULT_VIRTUAL_WIDTH).toBe(224);
      expect(ScreenManager.DEFAULT_VIRTUAL_HEIGHT).toBe(288);
      expect(ScreenManager.DEFAULT_ASPECT_RATIO).toBeCloseTo(224 / 288, 6);
    });

    it('calculates 1080p (1920x1080) pillarbox transform accurately', () => {
      const transform = ScreenManager.calculateTransform(1920, 1080);
      expect(transform.displayHeight).toBe(1080);
      expect(transform.displayWidth).toBe(Math.floor(1080 * (224 / 288))); // 840
      expect(transform.scale).toBeCloseTo(840 / 224, 4);
      expect(transform.offsetX).toBe(540);
      expect(transform.offsetY).toBe(0);
      expect(transform.virtualWidth).toBe(224);
      expect(transform.virtualHeight).toBe(288);
    });

    it('calculates 720p (1280x720) pillarbox transform accurately', () => {
      const transform = ScreenManager.calculateTransform(1280, 720);
      expect(transform.displayHeight).toBe(720);
      expect(transform.displayWidth).toBe(560);
      expect(transform.offsetX).toBe(360);
      expect(transform.offsetY).toBe(0);
    });

    it('calculates mobile portrait (375x812) letterbox transform accurately', () => {
      const transform = ScreenManager.calculateTransform(375, 812);
      expect(transform.displayWidth).toBe(375);
      expect(transform.displayHeight).toBe(Math.floor(375 / (224 / 288))); // 482
      expect(transform.offsetX).toBe(0);
      expect(transform.offsetY).toBe(Math.floor((812 - 482) / 2)); // 165
    });

    it('calculates exact 2x integer scale (448x576) with zero offsets', () => {
      const transform = ScreenManager.calculateTransform(448, 576);
      expect(transform.displayWidth).toBe(448);
      expect(transform.displayHeight).toBe(576);
      expect(transform.scale).toBe(2);
      expect(transform.offsetX).toBe(0);
      expect(transform.offsetY).toBe(0);
    });
  });

  describe('Client to Virtual Coordinate Mapping', () => {
    let screenManager: ScreenManager;
    let mockCanvas: HTMLCanvasElement;

    beforeEach(() => {
      screenManager = new ScreenManager();
      mockCanvas = {
        width: 224,
        height: 288,
        style: {} as CSSStyleDeclaration,
        getContext: vi.fn().mockReturnValue({
          imageSmoothingEnabled: true,
        }),
        getBoundingClientRect: vi.fn().mockReturnValue({
          left: 100,
          top: 50,
          width: 448,
          height: 576,
        }),
      } as unknown as HTMLCanvasElement;

      screenManager.initialize(mockCanvas);
    });

    afterEach(() => {
      screenManager.destroy();
    });

    it('maps top-left canvas corner to virtual (0, 0)', () => {
      const point = screenManager.clientToVirtual(100, 50);
      expect(point).not.toBeNull();
      expect(point!.x).toBeCloseTo(0);
      expect(point!.y).toBeCloseTo(0);
    });

    it('maps bottom-right canvas corner to virtual (224, 288)', () => {
      const point = screenManager.clientToVirtual(100 + 448, 50 + 576);
      expect(point).not.toBeNull();
      expect(point!.x).toBeCloseTo(224);
      expect(point!.y).toBeCloseTo(288);
    });

    it('maps center point accurately to virtual (112, 144)', () => {
      const point = screenManager.clientToVirtual(100 + 224, 50 + 288);
      expect(point).not.toBeNull();
      expect(point!.x).toBeCloseTo(112);
      expect(point!.y).toBeCloseTo(144);
    });

    it('returns null for out-of-bounds client coordinates when clampToBounds is false', () => {
      const point = screenManager.clientToVirtual(50, 20, false);
      expect(point).toBeNull();
    });

    it('clamps out-of-bounds coordinates to edge when clampToBounds is true', () => {
      const point = screenManager.clientToVirtual(50, 20, true);
      expect(point).not.toBeNull();
      expect(point!.x).toBe(0);
      expect(point!.y).toBe(0);
    });

    it('translates virtual coordinates back to client space via virtualToClient', () => {
      const clientPos = screenManager.virtualToClient(112, 144);
      expect(clientPos).not.toBeNull();
      expect(clientPos!.x).toBeCloseTo(324);
      expect(clientPos!.y).toBeCloseTo(338);
    });
  });

  describe('Resize Observer Subscriptions', () => {
    it('notifies registered observers and supports unsubscribe', () => {
      const screenManager = new ScreenManager();
      const callback = vi.fn();

      const unsubscribe = screenManager.onResize(callback);
      expect(callback).toHaveBeenCalledTimes(1);

      screenManager.scheduleResize();
      unsubscribe();

      screenManager.updateScalingImmediate();
      expect(callback).toHaveBeenCalledTimes(1); // Not called again after unsubscribe
    });
  });
});
```

---

### 3.2 `tests/unit/Starfield.test.ts` Specification

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Starfield } from '../../src/systems/Starfield';

describe('Starfield Parallax & Simulation Suite', () => {
  let starfield: Starfield;

  beforeEach(() => {
    starfield = new Starfield({
      virtualWidth: 224,
      virtualHeight: 288,
      starCount: 100,
    });
  });

  describe('Initialization & Layer Partitioning', () => {
    it('creates exact number of requested stars (100)', () => {
      expect(starfield.getStarCount()).toBe(100);
    });

    it('distributes stars across 3 parallax layers (0, 1, 2)', () => {
      const stars = starfield.getStars();
      const layer0 = stars.filter((s) => s.layer === 0);
      const layer1 = stars.filter((s) => s.layer === 1);
      const layer2 = stars.filter((s) => s.layer === 2);

      expect(layer0.length).toBe(40);
      expect(layer1.length).toBe(35);
      expect(layer2.length).toBe(25);
    });

    it('enforces layer speed hierarchy (Layer 0 < Layer 1 < Layer 2)', () => {
      const stars = starfield.getStars();
      const layer0Max = Math.max(...stars.filter((s) => s.layer === 0).map((s) => s.speed));
      const layer1Min = Math.min(...stars.filter((s) => s.layer === 1).map((s) => s.speed));
      const layer1Max = Math.max(...stars.filter((s) => s.layer === 1).map((s) => s.speed));
      const layer2Min = Math.min(...stars.filter((s) => s.layer === 2).map((s) => s.speed));

      expect(layer0Max).toBeLessThanOrEqual(layer1Min);
      expect(layer1Max).toBeLessThanOrEqual(layer2Min);
    });
  });

  describe('Speed State Transitions & Lerp', () => {
    it('transitions target multiplier on state change', () => {
      starfield.setSpeedState('NORMAL');
      expect(starfield.getTargetSpeedMultiplier()).toBe(1.0);

      starfield.setSpeedState('DIVING');
      expect(starfield.getTargetSpeedMultiplier()).toBe(2.8);

      starfield.setSpeedState('WARP');
      expect(starfield.getTargetSpeedMultiplier()).toBe(6.5);

      starfield.setSpeedState('PAUSED');
      expect(starfield.getTargetSpeedMultiplier()).toBe(0.0);
    });

    it('smoothly interpolates speed multiplier toward target over time', () => {
      starfield.setSpeedState('WARP');
      expect(starfield.getSpeedMultiplier()).toBe(1.0);

      starfield.update(0.1); // 100ms
      expect(starfield.getSpeedMultiplier()).toBeGreaterThan(1.0);
      expect(starfield.getSpeedMultiplier()).toBeLessThan(6.5);

      // After several updates, converges to 6.5
      for (let i = 0; i < 50; i++) {
        starfield.update(0.1);
      }
      expect(starfield.getSpeedMultiplier()).toBeCloseTo(6.5, 2);
    });
  });

  describe('Wrap-Around Boundary Logic', () => {
    it('wraps stars past bottom virtualHeight back to top and randomizes X', () => {
      const stars = starfield.getStars() as any[];
      stars[0].y = 287.9;
      stars[0].speed = 100;

      starfield.update(0.1); // moves down by 10px -> 297.9 >= 288

      expect(stars[0].y).toBeLessThan(288);
      expect(stars[0].x).toBeGreaterThanOrEqual(0);
      expect(stars[0].x).toBeLessThanOrEqual(224);
    });
  });
});
```

---

## 4. Integration Blueprint & System Coupling

```
+-----------------------------------------------------------------------------+
|                                 main.ts                                     |
|  - Bootstraps ScreenManager instance                                        |
|  - Creates Game instance, passing ScreenManager and Starfield               |
+-----------------------------------------------------------------------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
+------------------------------------+  +------------------------------------+
|       src/core/ScreenManager       |  |       src/systems/Starfield        |
| - Manages canvas resize & scaling  |  | - 3-layer parallax background      |
| - clientToVirtual coordinate map   |  | - NORMAL / DIVING / WARP modes     |
| - Registers resize observers       |  | - Rendered at z-index 0 in Game    |
+------------------------------------+  +------------------------------------+
                   |                                       |
                   v                                       v
+-----------------------------------------------------------------------------+
|                          src/ui/InputHandler.ts                             |
| - Consumes ScreenManager.clientToVirtual() for mouse/touch aiming           |
| - Translates touch button regions in virtual coordinates (224x288)          |
+-----------------------------------------------------------------------------+
```

---

## 5. Verification Strategy & Invalidation Conditions

1. **Aspect Ratio Preservation**:
   - `calculateViewportTransform(1920, 1080)` MUST produce `displayWidth = 840`, `displayHeight = 1080`, `offsetX = 540`, `offsetY = 0`.
   - `calculateViewportTransform(375, 812)` MUST produce `displayWidth = 375`, `displayHeight = 482`, `offsetX = 0`, `offsetY = 165`.
2. **Coordinate Invariance**:
   - `clientToVirtual` on canvas midpoint MUST evaluate to virtual $(112, 144) \pm 0.1\text{px}$.
3. **Starfield Memory Stability**:
   - Running `starfield.update(0.016)` and `starfield.render(ctx)` across 10,000 frames MUST NOT allocate any new heap objects (`0` GC pressure).
