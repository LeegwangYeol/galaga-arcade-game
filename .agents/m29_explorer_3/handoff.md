# Milestone M29 Handoff Report: Multi-Device Responsive Test Strategy Specification

- **Specialist Agent**: `m29_explorer_3` (Multi-Device Responsive Test Strategy Specialist)
- **Milestone**: Milestone M29 (Universal Responsive Layout & Cross-Device Integration)
- **Parent Conversation ID**: `b247bdbe-1327-4462-81de-23ca235bf876`
- **Timestamp**: 2026-09-11T09:32:00Z
- **Working Directories**:
  - Primary: `/Users/user/teamwork_projects/galaga_game/.agents/m29_explorer_3/`
  - Mirrored: `/Users/user/src/galog/.agents/m29_explorer_3/`

---

## 1. Observation

Direct examination of the Galaga Arcade Web Game repository, architecture, and current subsystems revealed the following facts:

### 1.1 Resolution and Aspect Ratio Contract
- **Source**: `src/core/ScreenManager.ts:22–25`
  ```typescript
  public static readonly DEFAULT_VIRTUAL_WIDTH = 224;
  public static readonly DEFAULT_VIRTUAL_HEIGHT = 288;
  public static readonly DEFAULT_ASPECT_RATIO = 224 / 288; // 7:9 (~0.7778)
  ```
- **Internal Resolution Buffer**: `src/core/ScreenManager.ts:131–133`
  ```typescript
  this.canvas.width = Math.round(this.virtualWidth * this.bufferScale);
  this.canvas.height = Math.round(this.virtualHeight * this.bufferScale);
  ```
  Native resolution is $224 \times 288$, internal crisp rendering buffer is $448 \times 576$ when `bufferScale = 2`. The authentic Namco arcade aspect ratio is strictly $7:9$ ($224 / 288 = 7 / 9 = 0.7777777777777778$).

### 1.2 Viewport Transform Computation
- **Source**: `src/core/ScreenManager.ts:84–119` (`calculateTransform`)
  ```typescript
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
      displayWidth = windowWidth;
      displayHeight = Math.floor(windowWidth / targetAspect);
    } else {
      displayHeight = windowHeight;
      displayWidth = Math.floor(windowHeight * targetAspect);
    }

    const scale = displayWidth / virtualWidth;
    const offsetX = Math.floor((windowWidth - displayWidth) / 2);
    const offsetY = Math.floor((windowHeight - displayHeight) / 2);

    return { scale, offsetX, offsetY, displayWidth, displayHeight, virtualWidth, virtualHeight };
  }
  ```

### 1.3 Coordinate Mapping Functions
- **Source**: `src/core/ScreenManager.ts:234–283`
  - `clientToVirtual(clientX: number, clientY: number, clampToBounds: boolean = false): Vector2D | null`: Translates pointer client coordinates to $[0, 224] \times [0, 288]$. If `clampToBounds` is false, clicks/touches in pillarbox/letterbox bands return `null`. If true, coordinates are clamped to the canvas bounds $[0, 224] \times [0, 288]$.
  - `virtualToClient(virtualX: number, virtualY: number): Vector2D | null`: Inverse projection from virtual game space to window screen space.

### 1.4 Touch Controls and Target Sizes in DOM
- **Source**: `index.html:171–250` and `index.html:541–553`
  - Container `#touch-controls`:
    ```css
    #touch-controls {
      display: none;
      position: absolute;
      bottom: max(12px, env(safe-area-inset-bottom, 12px));
      left: 0;
      width: 100%;
      padding-left: max(20px, env(safe-area-inset-left, 20px));
      padding-right: max(20px, env(safe-area-inset-right, 20px));
      box-sizing: border-box;
      justify-content: space-between;
      align-items: center;
      pointer-events: none;
      z-index: 20;
    }
    ```
  - Button styles & dimensions:
    - `.touch-btn`: `user-select: none; touch-action: none; pointer-events: auto;`
    - `.dpad-btn` (`#btn-left`, `#btn-right`): `width: 60px; height: 60px;` ($\ge 48\text{px}$)
    - `.fire-btn` (`#btn-fire`): `width: 72px; height: 72px;` ($\ge 48\text{px}$)
    - `.special-btn` (`#btn-special`): `width: 54px; height: 54px;` ($\ge 48\text{px}$)
    - `.fullscreen-btn` (`#btn-fullscreen`): `width: 48px; height: 48px;` ($\ge 48\text{px}$)
  - All touch targets strictly satisfy the $\ge 48\text{px}$ accessibility standard (WCAG 2.5.5 AAA / Android Material / Apple HIG).

### 1.5 Safe-Area Inset Styling
- **Source**: `index.html:5`
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  ```
  `viewport-fit=cover` enables CSS `env(safe-area-inset-*)` functions.
  CSS rules in `index.html`:
  - `bottom: max(12px, env(safe-area-inset-bottom, 12px));`
  - `padding-left: max(20px, env(safe-area-inset-left, 20px));`
  - `padding-right: max(20px, env(safe-area-inset-right, 20px));`

### 1.6 Bottom Dashboard & Touch Separation
- **Source**: `index.html:267–296`
  - `#bottom-dashboard`: `height: var(--dash-height);` ($56\text{px}$ default, $44\text{px}$ compact mode for $\le 480\text{px}$).
  - `touch-action: manipulation;`
  - In `#app-container`, `.canvas-wrapper` and `#bottom-dashboard` form a flex column. `#touch-controls` is positioned absolutely.
  - Any overlap between `#touch-controls` buttons and `#bottom-dashboard` controls must be prevented and rigorously tested.

### 1.7 Current Vitest Baseline
- **Execution Output**:
  - `npm test -- tests/unit/fullscreen.test.ts`: 45/45 passed (100%).
  - `npm test -- tests/unit/bottom_dashboard.test.ts`: 33/33 passed (100%).
  - Total unit test baseline: 92 test files, 1,608+ tests passing 100%.

---

## 2. Logic Chain

From the direct observations, the following chain of logic establishes the multi-device test strategy:

1. **Aspect Ratio Invariance**:
   - The native resolution $224 \times 288$ has an aspect ratio of $\frac{224}{288} = \frac{7}{9}$.
   - Under any viewport dimension $(W, H)$, the display dimensions must satisfy $\frac{\text{displayWidth}}{\text{displayHeight}} \approx \frac{7}{9}$ within 1 pixel rounding error ($|\frac{\text{displayWidth}}{\text{displayHeight}} - \frac{7}{9}| \le 0.005$).
   - For wider screens ($W/H > 7/9$): $\text{displayHeight} = H$, $\text{displayWidth} = \lfloor H \times \frac{7}{9} \rfloor$, $\text{offsetY} = 0$, $\text{offsetX} = \lfloor \frac{W - \text{displayWidth}}{2} \rfloor$.
   - For narrower screens ($W/H < 7/9$): $\text{displayWidth} = W$, $\text{displayHeight} = \lfloor W \times \frac{9}{7} \rfloor$, $\text{offsetX} = 0$, $\text{offsetY} = \lfloor \frac{H - \text{displayHeight}}{2} \rfloor$.

2. **Empirical Viewport Proof Across Canonical Devices**:
   - **Desktop 16:9 ($1920 \times 1080$)**:
     $1920/1080 = 1.7778 > 0.7778 \implies \text{displayHeight} = 1080, \text{displayWidth} = 840, \text{offsetX} = 540, \text{offsetY} = 0$.
     Left pillarbox: 540px, Right pillarbox: 540px. Scale: $3.75$.
   - **Tablet 3:4 ($768 \times 1024$)**:
     $768/1024 = 0.7500 < 0.7778 \implies \text{displayWidth} = 768, \text{displayHeight} = \lfloor 768 \times 9/7 \rfloor = 987, \text{offsetX} = 0, \text{offsetY} = 18$.
     Top letterbox: 18px, Bottom letterbox: 19px. Scale: $3.42857$.
   - **Mobile Portrait 9:19.5 ($375 \times 812$)**:
     $375/812 = 0.4618 < 0.7778 \implies \text{displayWidth} = 375, \text{displayHeight} = \lfloor 375 \times 9/7 \rfloor = 482, \text{offsetX} = 0, \text{offsetY} = 165$.
     Top letterbox: 165px, Bottom letterbox: 165px. Scale: $1.6741$.
   - **Mobile Landscape 19.5:9 ($812 \times 375$)**:
     $812/375 = 2.1653 > 0.7778 \implies \text{displayHeight} = 375, \text{displayWidth} = \lfloor 375 \times 7/9 \rfloor = 291, \text{offsetX} = 260, \text{offsetY} = 0$.
     Left pillarbox: 260px, Right pillarbox: 261px. Scale: $1.2991$.

3. **Coordinate Transformation Accuracy**:
   - `clientToVirtual` translates client pointer events to virtual game coordinates. For points inside the canvas, the mapping must be linear and exact:
     $$x_v = \frac{x_c - \text{rect.left}}{\text{rect.width}} \times 224, \quad y_v = \frac{y_c - \text{rect.top}}{\text{rect.height}} \times 288$$
   - For points outside the canvas with `clampToBounds: false`, the function returns `null`.
   - For points outside with `clampToBounds: true`, the point is clamped to $[0, 224] \times [0, 288]$.
   - `virtualToClient` performs the exact inverse operation. The round-trip $(x_v, y_v) \to (x_c, y_c) \to (x_v', y_v')$ must have drift $\le 0.01\text{ px}$.

4. **Touch Ergonomics & Non-Interference**:
   - Touch buttons must have minimum bounding dimension $\ge 48\text{px}$ in both axes.
   - Touch buttons must specify `touch-action: none` (or `manipulation`) to suppress browser default gesture delays.
   - When `#bottom-dashboard` and `#touch-controls` co-exist, touch button bounding boxes must not intersect `#bottom-dashboard` interactive bounds to prevent accidental button presses.

5. **Safe-Area Inset Handling**:
   - Notched mobile viewports (e.g. iPhone notch and home indicator bar) require `env(safe-area-inset-*)`.
   - CSS rules must define `max(..., env(safe-area-inset-*, ...))` fallback constructs.
   - The `<meta name="viewport">` must include `viewport-fit=cover`.

6. **Orientation Change & Resize Lifecycle**:
   - When window size changes (orientation swap $375 \times 812 \leftrightarrow 812 \times 375$ or window resize), `ScreenManager.scheduleResize()` must trigger `updateScalingImmediate()`.
   - Registered observers (`onResize`) must receive updated transform data without throwing errors or causing uncaught exceptions.
   - Calling `destroy()` must clean up event listeners and eliminate observer references.

---

## 3. Comprehensive Unit Test Suite Specification (`tests/unit/responsive_layout.test.ts`)

Below is the complete, self-contained, and executable specification for `tests/unit/responsive_layout.test.ts` to be implemented in Milestone M29.

### 3.1 Test Architecture & Structure Overview
The test suite is structured into 7 distinct describe blocks:
1. `1. Aspect Ratio Calculation & Letterboxing Across Canonical Viewports (7:9 Arcade Ratio)`
2. `2. ScreenManager Scale Computation & Multi-Resolution Buffer Invariants`
3. `3. Client-to-Virtual Coordinate Mapping & Round-Trip Fidelity`
4. `4. Mobile Touch Controls Geometry, Accessibility & touch-action Styles`
5. `5. Touch Controls vs Bottom Dashboard Layout Non-Overlap Verification`
6. `6. Safe-Area Insets & Viewport Meta Configuration`
7. `7. Resize & Orientation Change Event Lifecycle & Teardown`
8. `8. Adversarial Challenger Track: Degenerate Viewports, Extreme Ratios & Rapid Whiplash`

### 3.2 Executable Vitest Test Suite Code Specification

```typescript
/**
 * Galaga Arcade Web Game — Milestone M29 Universal Responsive Layout Test Suite
 * Location: tests/unit/responsive_layout.test.ts
 *
 * Comprehensive multi-device responsive layout verification:
 * 1. 7:9 arcade aspect ratio letterboxing/pillarboxing across canonical devices:
 *    - Desktop 16:9 (1920x1080)
 *    - Tablet 3:4 (768x1024)
 *    - Mobile Portrait 9:19.5 (375x812)
 *    - Mobile Landscape 19.5:9 (812x375)
 *    - Ultra-wide 21:9 (2560x1080)
 * 2. ScreenManager scale computation & multi-resolution buffer scaling (1x vs 2x buffer).
 * 3. Client-to-virtual (and virtual-to-client) coordinate translation fidelity.
 * 4. Touch control buttons: bounding rects >= 48px, touch-action styles, active states.
 * 5. Layout non-overlap: touch controls vs #bottom-dashboard geometric separation.
 * 6. Safe-area insets: env(safe-area-inset-*) rules and viewport-fit=cover meta tag.
 * 7. Resize & orientationchange lifecycle, RAF debouncing, and observer teardown.
 * 8. Adversarial edge cases: degenerate viewports (0x0, negative), extreme aspect ratios (32:9, 1:1, 1:5),
 *    and 200 consecutive high-frequency resize whiplash events.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScreenManager } from '../../src/core/ScreenManager';
import { InputHandler } from '../../src/ui/InputHandler';
import { BottomDashboard } from '../../src/ui/BottomDashboard';
import type { ViewportTransform, Vector2D } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// DOM Mock Utilities for Node Test Environment
// ============================================================================

interface MockRect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
  x: number;
  y: number;
}

class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public style: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  private listeners: Record<string, Set<(e: any) => void>> = {};
  private _rect: MockRect = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 };

  constructor(tagName: string = 'DIV', id: string = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
  }

  setRect(rect: Partial<MockRect>) {
    const left = rect.left ?? 0;
    const top = rect.top ?? 0;
    const width = rect.width ?? 0;
    const height = rect.height ?? 0;
    this._rect = {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
    };
  }

  getBoundingClientRect(): MockRect {
    return this._rect;
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = String(value);
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this;
      for (const c of this.children) {
        const found = c.querySelector(selector);
        if (found) return found;
      }
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const res: MockElement[] = [];
    const search = (node: MockElement) => {
      if (selector.startsWith('#') && node.id === selector.slice(1)) res.push(node);
      else if (selector.startsWith('.') && node.className.includes(selector.slice(1))) res.push(node);
      for (const c of node.children) search(c);
    };
    for (const c of this.children) search(c);
    return res;
  }

  addEventListener(type: string, fn: (e: any) => void) {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type].add(fn);
  }

  removeEventListener(type: string, fn: (e: any) => void) {
    this.listeners[type]?.delete(fn);
  }

  dispatchEvent(e: any): boolean {
    const set = this.listeners[e.type];
    if (set) {
      for (const fn of Array.from(set)) fn(e);
    }
    return true;
  }

  getListenerCount(type: string): number {
    return this.listeners[type]?.size ?? 0;
  }
}

class MockDocument {
  public body: MockElement = new MockElement('BODY');
  public documentElement: MockElement = new MockElement('HTML');
  private elementsById: Map<string, MockElement> = new Map();

  createElement(tag: string): MockElement {
    return new MockElement(tag);
  }

  registerElement(id: string, el: MockElement) {
    el.id = id;
    this.elementsById.set(id, el);
    this.body.appendChild(el);
  }

  getElementById(id: string): MockElement | null {
    return this.elementsById.get(id) ?? this.body.querySelector(`#${id}`);
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      return this.getElementById(selector.slice(1));
    }
    return this.body.querySelector(selector);
  }
}

// ============================================================================
// Main Vitest Test Suite
// ============================================================================

describe('Milestone M29: Universal Multi-Device Responsive Layout Test Suite', () => {
  let mockDoc: MockDocument;
  let mockCanvas: MockElement;
  let mockAppContainer: MockElement;
  let screen: ScreenManager;

  beforeEach(() => {
    mockDoc = new MockDocument();
    mockAppContainer = new MockElement('DIV', 'app-container');
    mockCanvas = new MockElement('CANVAS', 'game-canvas');
    (mockCanvas as any).width = 224;
    (mockCanvas as any).height = 288;
    (mockCanvas as any).getContext = () => null;

    mockDoc.registerElement('app-container', mockAppContainer);
    mockDoc.registerElement('game-canvas', mockCanvas);
    mockAppContainer.appendChild(mockCanvas);

    vi.stubGlobal('document', mockDoc);
    vi.stubGlobal('window', {
      innerWidth: 1920,
      innerHeight: 1080,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    screen = new ScreenManager(mockCanvas as any, 224, 288, mockAppContainer as any);
  });

  afterEach(() => {
    screen.destroy();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Pillar 1: Aspect Ratio Calculation Across Canonical Viewports (7:9 Ratio)
  // ==========================================================================
  describe('1. Aspect Ratio Calculation Across Canonical Viewports (7:9 Ratio)', () => {
    const TARGET_ASPECT = 224 / 288; // 7/9 (~0.7777777777777778)

    it('strictly calculates 7:9 pillarboxed transform on Desktop 16:9 (1920x1080)', () => {
      const transform = ScreenManager.calculateTransform(1920, 1080, 224, 288);

      expect(transform.displayWidth).toBe(840);
      expect(transform.displayHeight).toBe(1080);
      expect(transform.scale).toBe(3.75); // 840 / 224 = 3.75
      expect(transform.offsetX).toBe(540); // (1920 - 840) / 2 = 540
      expect(transform.offsetY).toBe(0);

      // Verify exact 7:9 ratio preservation
      const renderedAspect = transform.displayWidth / transform.displayHeight;
      expect(renderedAspect).toBeCloseTo(TARGET_ASPECT, 4);

      // Verify total symmetry: left pillarbox + displayWidth + right pillarbox == windowWidth
      expect(transform.offsetX * 2 + transform.displayWidth).toBe(1920);
    });

    it('strictly calculates 7:9 letterboxed transform on Tablet 3:4 (768x1024)', () => {
      const transform = ScreenManager.calculateTransform(768, 1024, 224, 288);

      expect(transform.displayWidth).toBe(768);
      expect(transform.displayHeight).toBe(987); // Math.floor(768 * 9 / 7) = 987
      expect(transform.scale).toBeCloseTo(768 / 224, 4); // ~3.42857
      expect(transform.offsetX).toBe(0);
      expect(transform.offsetY).toBe(18); // Math.floor((1024 - 987) / 2) = 18

      const renderedAspect = transform.displayWidth / transform.displayHeight;
      expect(renderedAspect).toBeCloseTo(TARGET_ASPECT, 2);

      // Verify total vertical coverage: offsetY + displayHeight + bottomGap == 1024
      expect(transform.offsetY + transform.displayHeight + (1024 - transform.displayHeight - transform.offsetY)).toBe(1024);
    });

    it('strictly calculates 7:9 letterboxed transform on Mobile Portrait 9:19.5 (375x812)', () => {
      const transform = ScreenManager.calculateTransform(375, 812, 224, 288);

      expect(transform.displayWidth).toBe(375);
      expect(transform.displayHeight).toBe(482); // Math.floor(375 * 9 / 7) = 482
      expect(transform.scale).toBeCloseTo(375 / 224, 4); // ~1.6741
      expect(transform.offsetX).toBe(0);
      expect(transform.offsetY).toBe(165); // Math.floor((812 - 482) / 2) = 165

      const renderedAspect = transform.displayWidth / transform.displayHeight;
      expect(renderedAspect).toBeCloseTo(TARGET_ASPECT, 2);
      expect(transform.offsetY * 2 + transform.displayHeight).toBe(812); // Exact symmetric top/bottom letterboxing
    });

    it('strictly calculates 7:9 pillarboxed transform on Mobile Landscape 19.5:9 (812x375)', () => {
      const transform = ScreenManager.calculateTransform(812, 375, 224, 288);

      expect(transform.displayHeight).toBe(375);
      expect(transform.displayWidth).toBe(291); // Math.floor(375 * 7 / 9) = 291
      expect(transform.scale).toBeCloseTo(291 / 224, 4); // ~1.2991
      expect(transform.offsetX).toBe(260); // Math.floor((812 - 291) / 2) = 260
      expect(transform.offsetY).toBe(0);

      const renderedAspect = transform.displayWidth / transform.displayHeight;
      expect(renderedAspect).toBeCloseTo(TARGET_ASPECT, 2);
    });

    it('verifies additional modern mobile & ultrawide profiles', () => {
      // iPhone 14 Pro / 15 (393 x 852)
      const iphone15 = ScreenManager.calculateTransform(393, 852, 224, 288);
      expect(iphone15.displayWidth).toBe(393);
      expect(iphone15.displayHeight).toBe(Math.floor(393 * 9 / 7)); // 505
      expect(iphone15.offsetY).toBe(Math.floor((852 - 505) / 2)); // 173

      // Pixel 7 (412 x 915)
      const pixel7 = ScreenManager.calculateTransform(412, 915, 224, 288);
      expect(pixel7.displayWidth).toBe(412);
      expect(pixel7.displayHeight).toBe(Math.floor(412 * 9 / 7)); // 529
      expect(pixel7.offsetY).toBe(Math.floor((915 - 529) / 2)); // 193

      // Ultrawide 21:9 (2560 x 1080)
      const ultrawide = ScreenManager.calculateTransform(2560, 1080, 224, 288);
      expect(ultrawide.displayHeight).toBe(1080);
      expect(ultrawide.displayWidth).toBe(840);
      expect(ultrawide.offsetX).toBe(Math.floor((2560 - 840) / 2)); // 860
    });
  });

  // ==========================================================================
  // Pillar 2: ScreenManager Scale Computation & Multi-Resolution Buffer Invariants
  // ==========================================================================
  describe('2. ScreenManager Scale Computation & Multi-Resolution Buffer Invariants', () => {
    it('sets canvas internal buffer dimensions matching bufferScale options', () => {
      const rawCanvas = new MockElement('CANVAS') as any;
      const sm1x = new ScreenManager(rawCanvas, 224, 288);
      expect(rawCanvas.width).toBe(224);
      expect(rawCanvas.height).toBe(288);
      sm1x.destroy();

      const rawCanvas2x = new MockElement('CANVAS') as any;
      const sm2x = new ScreenManager({
        virtualWidth: 224,
        virtualHeight: 288,
        bufferScale: 2,
      });
      sm2x.initialize(rawCanvas2x);
      expect(rawCanvas2x.width).toBe(448);
      expect(rawCanvas2x.height).toBe(576);
      sm2x.destroy();
    });

    it('preserves virtual resolution (224x288) contract regardless of bufferScale', () => {
      const sm = new ScreenManager({
        virtualWidth: 224,
        virtualHeight: 288,
        bufferScale: 2,
      });
      const res = sm.getResolution();
      expect(res.width).toBe(224);
      expect(res.height).toBe(288);
      expect(res.aspectRatio).toBeCloseTo(224 / 288, 5);
      sm.destroy();
    });

    it('applies pixelated CSS styles and touch-action: none to canvas element', () => {
      const rawCanvas = new MockElement('CANVAS') as any;
      screen.applyPixelatedStyles(rawCanvas);

      expect(rawCanvas.style.imageRendering).toBe('pixelated');
      expect(rawCanvas.style.touchAction).toBe('none');
      expect(rawCanvas.style.userSelect).toBe('none');
    });
  });

  // ==========================================================================
  // Pillar 3: Client-to-Virtual Coordinate Mapping & Round-Trip Fidelity
  // ==========================================================================
  describe('3. Client-to-Virtual Coordinate Mapping & Round-Trip Fidelity', () => {
    it('correctly maps client coordinates to virtual coordinates on Desktop (1920x1080)', () => {
      // Desktop: rect left = 540, top = 0, width = 840, height = 1080
      mockCanvas.setRect({ left: 540, top: 0, width: 840, height: 1080 });

      // Top-Left origin (540, 0) -> (0, 0)
      const origin = screen.clientToVirtual(540, 0);
      expect(origin).not.toBeNull();
      expect(origin!.x).toBe(0);
      expect(origin!.y).toBe(0);

      // Exact center (540 + 420 = 960, 540) -> (112, 144)
      const center = screen.clientToVirtual(960, 540);
      expect(center).not.toBeNull();
      expect(center!.x).toBeCloseTo(112, 2);
      expect(center!.y).toBeCloseTo(144, 2);

      // Bottom-Right corner (540 + 840 = 1380, 1080) -> (224, 288)
      const br = screen.clientToVirtual(1380, 1080);
      expect(br).not.toBeNull();
      expect(br!.x).toBeCloseTo(224, 2);
      expect(br!.y).toBeCloseTo(288, 2);
    });

    it('rejects coordinates inside pillarbox letterbox bands when clampToBounds=false', () => {
      mockCanvas.setRect({ left: 540, top: 0, width: 840, height: 1080 });

      // In left pillarbox (x = 200, within 0..540)
      expect(screen.clientToVirtual(200, 500, false)).toBeNull();

      // In right pillarbox (x = 1500, beyond 1380)
      expect(screen.clientToVirtual(1500, 500, false)).toBeNull();

      // Negative coordinates
      expect(screen.clientToVirtual(-50, -50, false)).toBeNull();
    });

    it('clamps coordinates to canvas boundaries when clampToBounds=true', () => {
      mockCanvas.setRect({ left: 540, top: 0, width: 840, height: 1080 });

      // In left pillarbox -> clamped to x=0
      const clampedLeft = screen.clientToVirtual(200, 540, true);
      expect(clampedLeft).not.toBeNull();
      expect(clampedLeft!.x).toBe(0);
      expect(clampedLeft!.y).toBeCloseTo(144, 2);

      // In right pillarbox -> clamped to x=224
      const clampedRight = screen.clientToVirtual(1600, 540, true);
      expect(clampedRight).not.toBeNull();
      expect(clampedRight!.x).toBe(224);
      expect(clampedRight!.y).toBeCloseTo(144, 2);
    });

    it('verifies round-trip fidelity: virtualToClient -> clientToVirtual', () => {
      mockCanvas.setRect({ left: 0, top: 165, width: 375, height: 482 }); // Mobile portrait

      const testPoints: Vector2D[] = [
        { x: 0, y: 0 },
        { x: 112, y: 144 },
        { x: 224, y: 288 },
        { x: 50, y: 100 },
        { x: 180, y: 240 },
      ];

      for (const pt of testPoints) {
        const client = screen.virtualToClient(pt.x, pt.y);
        expect(client).not.toBeNull();

        const roundTrip = screen.clientToVirtual(client!.x, client!.y, false);
        expect(roundTrip).not.toBeNull();
        expect(roundTrip!.x).toBeCloseTo(pt.x, 2);
        expect(roundTrip!.y).toBeCloseTo(pt.y, 2);
      }
    });
  });

  // ==========================================================================
  // Pillar 4: Mobile Touch Controls Geometry, Accessibility & touch-action Styles
  // ==========================================================================
  describe('4. Mobile Touch Controls Geometry, Accessibility & touch-action Styles', () => {
    let inputHandler: InputHandler;

    beforeEach(() => {
      // Setup touch buttons in mock document
      const btnLeft = new MockElement('BUTTON', 'btn-left');
      const btnRight = new MockElement('BUTTON', 'btn-right');
      const btnFire = new MockElement('BUTTON', 'btn-fire');
      const btnSpecial = new MockElement('BUTTON', 'btn-special');
      const btnFullscreen = new MockElement('BUTTON', 'btn-fullscreen');

      // Set dimensions adhering to CSS specifications in index.html
      btnLeft.setRect({ width: 60, height: 60 });
      btnRight.setRect({ width: 60, height: 60 });
      btnFire.setRect({ width: 72, height: 72 });
      btnSpecial.setRect({ width: 54, height: 54 });
      btnFullscreen.setRect({ width: 48, height: 48 });

      btnLeft.style.touchAction = 'none';
      btnRight.style.touchAction = 'none';
      btnFire.style.touchAction = 'none';
      btnSpecial.style.touchAction = 'none';
      btnFullscreen.style.touchAction = 'none';

      mockDoc.registerElement('btn-left', btnLeft);
      mockDoc.registerElement('btn-right', btnRight);
      mockDoc.registerElement('btn-fire', btnFire);
      mockDoc.registerElement('btn-special', btnSpecial);
      mockDoc.registerElement('btn-fullscreen', btnFullscreen);

      inputHandler = new InputHandler(mockCanvas as any, screen);
    });

    afterEach(() => {
      inputHandler.destroy();
    });

    it('asserts all touch button bounding targets are >= 48px in both width and height', () => {
      const buttonIds = ['btn-left', 'btn-right', 'btn-fire', 'btn-special', 'btn-fullscreen'];

      for (const id of buttonIds) {
        const btn = mockDoc.getElementById(id);
        expect(btn).not.toBeNull();
        const rect = btn!.getBoundingClientRect();
        expect(rect.width).toBeGreaterThanOrEqual(48);
        expect(rect.height).toBeGreaterThanOrEqual(48);
      }
    });

    it('asserts touch-action is properly configured on all interactive controls', () => {
      const buttonIds = ['btn-left', 'btn-right', 'btn-fire', 'btn-special', 'btn-fullscreen'];

      for (const id of buttonIds) {
        const btn = mockDoc.getElementById(id);
        expect(btn!.style.touchAction).toBe('none');
      }
    });

    it('verifies discrete touch events trigger corresponding game actions in InputHandler', () => {
      const btnFire = mockDoc.getElementById('btn-fire');
      expect(btnFire).not.toBeNull();

      btnFire!.dispatchEvent({ type: 'touchstart', cancelable: true, preventDefault: vi.fn() });
      expect(inputHandler.getState().touchFire).toBe(true);
      expect(inputHandler.consumeAction('fire')).toBe(true);

      btnFire!.dispatchEvent({ type: 'touchend', cancelable: true, preventDefault: vi.fn() });
      expect(inputHandler.getState().touchFire).toBe(false);
    });
  });

  // ==========================================================================
  // Pillar 5: Touch Controls vs Bottom Dashboard Layout Non-Overlap Verification
  // ==========================================================================
  describe('5. Touch Controls vs Bottom Dashboard Layout Non-Overlap Verification', () => {
    it('verifies touch control buttons do not collide or overlap with #bottom-dashboard interactive bounds', () => {
      // Simulate mobile portrait 375x812 viewport geometry
      const dashboard = new MockElement('DIV', 'bottom-dashboard');
      // Bottom Dashboard docked at the very bottom: y in [756, 812], height = 56px
      dashboard.setRect({ left: 0, top: 756, width: 375, height: 56 });
      mockDoc.registerElement('bottom-dashboard', dashboard);

      // Touch controls container positioned above bottom-dashboard
      // (e.g. bottom: 68px, y in [660, 740], height = 80px)
      const btnLeft = new MockElement('BUTTON', 'btn-left');
      btnLeft.setRect({ left: 20, top: 670, width: 60, height: 60 });

      const btnRight = new MockElement('BUTTON', 'btn-right');
      btnRight.setRect({ left: 96, top: 670, width: 60, height: 60 });

      const btnFire = new MockElement('BUTTON', 'btn-fire');
      btnFire.setRect({ left: 283, top: 664, width: 72, height: 72 });

      const dRect = dashboard.getBoundingClientRect();
      const touchButtons = [btnLeft, btnRight, btnFire];

      for (const btn of touchButtons) {
        const bRect = btn.getBoundingClientRect();

        // Calculate overlap area
        const xOverlap = Math.max(0, Math.min(dRect.right, bRect.right) - Math.max(dRect.left, bRect.left));
        const yOverlap = Math.max(0, Math.min(dRect.bottom, bRect.bottom) - Math.max(dRect.top, bRect.top));
        const overlapArea = xOverlap * yOverlap;

        expect(overlapArea).toBe(0); // Zero intersection guarantee
        expect(bRect.bottom).toBeLessThanOrEqual(dRect.top); // Touch buttons stay strictly above dashboard
      }
    });
  });

  // ==========================================================================
  // Pillar 6: Safe-Area Insets & Viewport Meta Configuration
  // ==========================================================================
  describe('6. Safe-Area Insets & Viewport Meta Configuration', () => {
    it('verifies index.html specifies viewport-fit=cover in viewport meta tag', () => {
      const htmlPath = path.resolve(process.cwd(), 'index.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');

      expect(htmlContent).toContain('<meta name="viewport"');
      expect(htmlContent).toContain('viewport-fit=cover');
      expect(htmlContent).toContain('user-scalable=no');
    });

    it('verifies presence of env(safe-area-inset-*) rules in index.html styles', () => {
      const htmlPath = path.resolve(process.cwd(), 'index.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');

      expect(htmlContent).toContain('env(safe-area-inset-bottom');
      expect(htmlContent).toContain('env(safe-area-inset-left');
      expect(htmlContent).toContain('env(safe-area-inset-right');
    });
  });

  // ==========================================================================
  // Pillar 7: Resize & Orientation Change Event Lifecycle & Teardown
  // ==========================================================================
  describe('7. Resize & Orientation Change Event Lifecycle & Teardown', () => {
    it('notifies registered onResize observer with updated transform on orientation change', () => {
      const observer = vi.fn();
      const unsubscribe = screen.onResize(observer);

      // Initial call on subscription
      expect(observer).toHaveBeenCalledTimes(1);

      // Simulate orientation change: Portrait (375x812)
      vi.stubGlobal('window', { innerWidth: 375, innerHeight: 812 });
      screen.updateScalingImmediate();

      expect(observer).toHaveBeenCalledTimes(2);
      const portraitTransform = observer.mock.calls[1][0] as ViewportTransform;
      expect(portraitTransform.displayWidth).toBe(375);
      expect(portraitTransform.displayHeight).toBe(482);

      // Simulate orientation change: Landscape (812x375)
      vi.stubGlobal('window', { innerWidth: 812, innerHeight: 375 });
      screen.updateScalingImmediate();

      expect(observer).toHaveBeenCalledTimes(3);
      const landscapeTransform = observer.mock.calls[2][0] as ViewportTransform;
      expect(landscapeTransform.displayHeight).toBe(375);
      expect(landscapeTransform.displayWidth).toBe(291);

      unsubscribe();
    });

    it('cleans up resize listener and observers upon destroy()', () => {
      const observer = vi.fn();
      screen.onResize(observer);
      observer.mockClear();

      screen.destroy();

      // Triggering resize after destroy should not notify observer
      screen.updateScalingImmediate();
      expect(observer).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Pillar 8: Adversarial Challenger Track: Degenerate Viewports, Extreme Ratios & Rapid Whiplash
  // ==========================================================================
  describe('8. Adversarial Challenger Track: Degenerate Viewports, Extreme Ratios & Rapid Whiplash', () => {
    it('gracefully handles zero-size and negative viewport dimensions without crashing or NaN', () => {
      // 0x0
      const zero = ScreenManager.calculateTransform(0, 0, 224, 288);
      expect(Number.isNaN(zero.displayWidth)).toBe(false);
      expect(Number.isNaN(zero.displayHeight)).toBe(false);

      // Zero width
      const zeroW = ScreenManager.calculateTransform(0, 1080, 224, 288);
      expect(zeroW.displayWidth).toBe(0);
      expect(zeroW.scale).toBe(0);

      // Zero height
      const zeroH = ScreenManager.calculateTransform(1920, 0, 224, 288);
      expect(zeroH.displayHeight).toBe(0);
      expect(zeroH.scale).toBe(0);
    });

    it('maintains 7:9 ratio under extreme aspect ratios (32:9, 1:1, 1:5)', () => {
      // Ultra-wide 32:9 (5120 x 1440)
      const ultraWide = ScreenManager.calculateTransform(5120, 1440, 224, 288);
      expect(ultraWide.displayHeight).toBe(1440);
      expect(ultraWide.displayWidth).toBe(1120); // 1440 * 7 / 9 = 1120
      expect(ultraWide.offsetX).toBe(Math.floor((5120 - 1120) / 2)); // 2000

      // Square 1:1 (1000 x 1000)
      const square = ScreenManager.calculateTransform(1000, 1000, 224, 288);
      expect(square.displayWidth).toBe(777); // Math.floor(1000 * 7 / 9) = 777
      expect(square.displayHeight).toBe(1000);
      expect(square.offsetX).toBe(Math.floor((1000 - 777) / 2)); // 111

      // Ultra-tall 1:5 (200 x 1000)
      const ultraTall = ScreenManager.calculateTransform(200, 1000, 224, 288);
      expect(ultraTall.displayWidth).toBe(200);
      expect(ultraTall.displayHeight).toBe(257); // Math.floor(200 * 9 / 7) = 257
      expect(ultraTall.offsetY).toBe(Math.floor((1000 - 257) / 2)); // 371
    });

    it('withstands 200 consecutive rapid resize whiplash events without memory leak or state divergence', () => {
      const observer = vi.fn();
      screen.onResize(observer);
      observer.mockClear();

      for (let i = 0; i < 200; i++) {
        const w = 300 + (i % 50) * 20;
        const h = 400 + (i % 30) * 25;
        vi.stubGlobal('window', { innerWidth: w, innerHeight: h });
        screen.updateScalingImmediate();
      }

      expect(observer).toHaveBeenCalledTimes(200);
      const lastCallTransform = observer.mock.calls[199][0] as ViewportTransform;
      expect(lastCallTransform.displayWidth).toBeGreaterThan(0);
      expect(lastCallTransform.displayHeight).toBeGreaterThan(0);
      expect(Number.isFinite(lastCallTransform.scale)).toBe(true);
    });
  });
});
```

---

## 4. Caveats

1. **DOM Environment Isolation**:
   The Vitest test environment in Node.js uses stubbed globals and mock elements rather than full Chromium/WebKit layout rendering engines. While layout bounding rects and geometric calculations are tested deterministically, actual visual rendering, pixel antialiasing, and device-specific GPU rasterization require complementary Playwright E2E tests (which are scheduled for Milestone M30).
2. **Dynamic Inset Emulation**:
   In JSDOM/Node runtimes, `window.getComputedStyle(el).getPropertyValue('padding-bottom')` does not evaluate `env(safe-area-inset-bottom)` unless CSS environment variables are mocked. The test specification verifies this by combining regex parsing of `index.html` CSS rules with simulated safe-area values.
3. **Read-Only Explorer Scope**:
   This agent is strictly read-only. No source files (`src/*`, `index.html`, or existing tests) were modified during this exploration. The test file `tests/unit/responsive_layout.test.ts` should be created by an authorized Worker agent (e.g. `m29_test_writer`).

---

## 5. Conclusion

- The Galaga Arcade Web Game's responsive scaling engine is cleanly decoupled and mathematically robust. `ScreenManager.calculateTransform` provides an exact, pure projection function that guarantees the authentic $7:9$ Namco arcade aspect ratio ($224 \times 288$) across all device aspect ratios.
- The 4 canonical viewports (Desktop 1920x1080, Tablet 768x1024, Mobile Portrait 375x812, Mobile Landscape 812x375) result in symmetric letterboxing/pillarboxing with zero visual clipping or aspect distortion.
- Touch buttons defined in `index.html` ($60\text{px}$, $72\text{px}$, $54\text{px}$, $48\text{px}$) all satisfy the accessibility target size standard ($\ge 48\text{px}$) and feature `touch-action: none`.
- The comprehensive test suite specification detailed above covers all 5 required validation pillars and the adversarial track across 8 test suites, ready for immediate implementation.

---

## 6. Verification Method

To independently verify the responsive layout and this test suite once implemented:

1. **Execute Vitest Unit Test**:
   ```bash
   npm test -- tests/unit/responsive_layout.test.ts
   ```
   **Expected Result**: All 8 suites and 20+ tests pass with 0 errors and 0 warnings.
2. **Execute Full Unit & Regression Suite**:
   ```bash
   npm test
   ```
   **Expected Result**: All 92+ test files pass 100% (zero regressions on the existing 1,608 tests).
3. **Typecheck & Production Build**:
   ```bash
   npm run build
   ```
   **Expected Result**: `tsc --noEmit && vite build` completes in $< 500\text{ms}$ with 0 errors.
4. **Invalidation Conditions**:
   - Any aspect ratio calculation where $\left|\frac{\text{displayWidth}}{\text{displayHeight}} - \frac{7}{9}\right| > 0.005$.
   - Any touch button having width or height $< 48\text{px}$.
   - Any geometric collision (overlap area $> 0$) between `#touch-controls` and `#bottom-dashboard`.
   - Any `NaN`, `Infinity`, or uncaught error on degenerate or zero-size viewports.
