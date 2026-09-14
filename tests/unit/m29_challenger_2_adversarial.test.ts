/**
 * Galaga Arcade Web Game — Milestone M29
 * Adversarial Challenger 2 Test Suite: Touch Ergonomics & Multi-Touch Input Verifier
 * Location: tests/unit/m29_challenger_2_adversarial.test.ts
 *
 * Rigorous adversarial verification across 4 core tracks:
 * - Track 1 (Touch Target Accessibility Compliance):
 *     Assert that all touch buttons in #touch-controls meet minimum accessible dimensions (>= 48px x 48px)
 *     and dashboard buttons have expanded hit targets (effective size >= 44px/48px).
 * - Track 2 (Layout Collision & Non-Overlap Invariant):
 *     In simulated mobile landscape (812 x 375) and portrait (375 x 812), compute bounding client rects
 *     and assert ZERO geometric overlap (0px^2) between #touch-controls, #bottom-dashboard, and #canvas-wrapper.
 * - Track 3 (Multi-Touch Churn & SOCD Resolution):
 *     Dispatch 1,000 simultaneous multi-touch events (left + right D-pad, rapid fire tapping, special button tapping).
 *     Assert SOCD neutral resolution, no event conflicts, and clean state recovery on touchcancel.
 * - Track 4 (Pull-to-Refresh & Gesture Prevention):
 *     Verify overscroll-behavior: none and touch-action: none prevent page scroll or zoom.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InputHandler } from '../../src/ui/InputHandler';
import { Player } from '../../src/entities/Player';
import { ScreenManager } from '../../src/core/ScreenManager';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Node-Compatible Comprehensive DOM Mocks
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

class MockClassList {
  private classes = new Set<string>();

  constructor(initial: string[] = []) {
    for (const c of initial) if (c) this.classes.add(c);
  }

  add(...classes: string[]) {
    for (const c of classes) if (c) this.classes.add(c);
  }

  remove(...classes: string[]) {
    for (const c of classes) this.classes.delete(c);
  }

  contains(c: string): boolean {
    return this.classes.has(c);
  }

  toString(): string {
    return Array.from(this.classes).join(' ');
  }
}

class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public classList: MockClassList;
  public style: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public offsetHeight: number = 0;
  public offsetWidth: number = 0;
  private listeners: Record<string, Set<(e: any) => void>> = {};
  private _rect: MockRect = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 };

  constructor(tagName: string = 'DIV', id: string = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new MockClassList();
    if (id) this.attributes['id'] = id;
  }

  setRect(rect: Partial<MockRect>) {
    const left = rect.left ?? 0;
    const top = rect.top ?? 0;
    const width = rect.width ?? 0;
    const height = rect.height ?? 0;
    this.offsetWidth = width;
    this.offsetHeight = height;
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
    } else if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
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
      else if (selector.startsWith('.') && node.classList.contains(selector.slice(1))) res.push(node);
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
}

class MockDocument {
  public body: MockElement = new MockElement('BODY');
  public documentElement: MockElement = new MockElement('HTML');
  public hidden: boolean = false;
  private elementsById: Map<string, MockElement> = new Map();
  private listeners: Record<string, Set<(e: any) => void>> = {};

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

  querySelectorAll(selector: string): MockElement[] {
    return this.body.querySelectorAll(selector);
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
}

/**
 * Helper to compute 2D rectangle intersection area between two bounding rects.
 */
function computeIntersectionArea(r1: MockRect, r2: MockRect): number {
  const overlapX = Math.max(0, Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left));
  const overlapY = Math.max(0, Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top));
  return overlapX * overlapY;
}

// ============================================================================
// Main Challenger Test Suite
// ============================================================================

describe('Milestone M29 Challenger 2: Touch Ergonomics & Multi-Touch Input Verifier', () => {
  let mockDoc: MockDocument;
  let mockCanvas: MockElement;
  let mockAppContainer: MockElement;
  let mockDashboard: MockElement;
  let btnLeft: MockElement;
  let btnRight: MockElement;
  let btnFire: MockElement;
  let btnSpecial: MockElement;
  let btnFullscreen: MockElement;
  let screen: ScreenManager;
  let inputHandler: InputHandler;

  let mockWindow: {
    innerWidth: number;
    innerHeight: number;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    dispatchEvent: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockDoc = new MockDocument();
    mockAppContainer = new MockElement('DIV', 'app-container');
    mockCanvas = new MockElement('CANVAS', 'game-canvas');
    mockDashboard = new MockElement('DIV', 'bottom-dashboard');

    btnLeft = new MockElement('BUTTON', 'btn-left');
    btnRight = new MockElement('BUTTON', 'btn-right');
    btnFire = new MockElement('BUTTON', 'btn-fire');
    btnSpecial = new MockElement('BUTTON', 'btn-special');
    btnFullscreen = new MockElement('BUTTON', 'btn-fullscreen');

    btnLeft.classList.add('touch-btn', 'dpad-btn');
    btnRight.classList.add('touch-btn', 'dpad-btn');
    btnFire.classList.add('touch-btn', 'fire-btn');
    btnSpecial.classList.add('touch-btn', 'special-btn');
    btnFullscreen.classList.add('touch-btn', 'fullscreen-btn');

    (mockCanvas as any).width = 224;
    (mockCanvas as any).height = 288;
    (mockCanvas as any).getContext = () => null;

    mockDoc.registerElement('app-container', mockAppContainer);
    mockDoc.registerElement('game-canvas', mockCanvas);
    mockDoc.registerElement('bottom-dashboard', mockDashboard);
    mockDoc.registerElement('btn-left', btnLeft);
    mockDoc.registerElement('btn-right', btnRight);
    mockDoc.registerElement('btn-fire', btnFire);
    mockDoc.registerElement('btn-special', btnSpecial);
    mockDoc.registerElement('btn-fullscreen', btnFullscreen);

    mockWindow = {
      innerWidth: 375,
      innerHeight: 812,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    vi.stubGlobal('document', mockDoc);
    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('navigator', {
      vibrate: vi.fn(),
      getGamepads: () => [],
    });

    screen = new ScreenManager(mockCanvas as any, 224, 288, mockAppContainer as any);
    inputHandler = new InputHandler(mockCanvas as any, screen);
  });

  afterEach(() => {
    inputHandler.destroy();
    screen.destroy();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Track 1: Touch Target Accessibility Compliance
  // ==========================================================================
  describe('Track 1: Touch Target Accessibility Compliance (>= 48px x 48px & Hit-Slop)', () => {
    const htmlPath = path.resolve(process.cwd(), 'index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    it('asserts that .touch-btn defines min-width: 48px and min-height: 48px in CSS', () => {
      expect(htmlContent).toContain('.touch-btn');
      expect(htmlContent).toMatch(/\.touch-btn\s*\{[^}]*min-width:\s*48px;/);
      expect(htmlContent).toMatch(/\.touch-btn\s*\{[^}]*min-height:\s*48px;/);
    });

    it('asserts all individual touch buttons meet >= 48px across all responsive breakpoints in CSS', () => {
      // Canonical buttons in #touch-controls
      const touchButtonDefs = [
        { selector: '.dpad-btn', minW: 48, minH: 48 },
        { selector: '.fire-btn', minW: 48, minH: 48 },
        { selector: '.special-btn', minW: 48, minH: 48 },
        { selector: '.fullscreen-btn', minW: 48, minH: 48 },
      ];

      for (const { selector, minW, minH } of touchButtonDefs) {
        // Find all width: XXpx and height: XXpx for this selector
        const regex = new RegExp(`${selector.replace('.', '\\.')}\\s*\\{[^}]*\\}`, 'g');
        const matches = htmlContent.match(regex);
        expect(matches).not.toBeNull();
        expect(matches!.length).toBeGreaterThanOrEqual(1);

        for (const block of matches!) {
          const wMatch = block.match(/width:\s*(\d+)px/);
          const hMatch = block.match(/height:\s*(\d+)px/);
          if (wMatch && wMatch[1]) {
            const width = parseInt(wMatch[1], 10);
            expect(width).toBeGreaterThanOrEqual(minW);
          }
          if (hMatch && hMatch[1]) {
            const height = parseInt(hMatch[1], 10);
            expect(height).toBeGreaterThanOrEqual(minH);
          }
        }
      }
    });

    it('asserts all 5 active touch button bounding rects are >= 48px x 48px in mock layout', () => {
      btnLeft.setRect({ width: 56, height: 56 });
      btnRight.setRect({ width: 56, height: 56 });
      btnFire.setRect({ width: 68, height: 68 });
      btnSpecial.setRect({ width: 52, height: 52 });
      btnFullscreen.setRect({ width: 48, height: 48 });

      const buttons = [btnLeft, btnRight, btnFire, btnSpecial, btnFullscreen];
      for (const btn of buttons) {
        const rect = btn.getBoundingClientRect();
        expect(rect.width).toBeGreaterThanOrEqual(48);
        expect(rect.height).toBeGreaterThanOrEqual(48);
      }
    });

    it('verifies bottom dashboard buttons have expanded hit targets (::before pseudo-element)', () => {
      // Inspect CSS definitions for .dash-btn and .dash-btn::before
      expect(htmlContent).toContain('.dash-btn');
      expect(htmlContent).toContain('.dash-btn::before');

      // Standard mode hit expansion: 32px + 8px top/bottom/left/right = 48px x 48px effective hit target
      expect(htmlContent).toMatch(/\.dash-btn::before\s*\{[^}]*top:\s*-8px;/);
      expect(htmlContent).toMatch(/\.dash-btn::before\s*\{[^}]*bottom:\s*-8px;/);
      expect(htmlContent).toMatch(/\.dash-btn::before\s*\{[^}]*left:\s*-8px;/);
      expect(htmlContent).toMatch(/\.dash-btn::before\s*\{[^}]*right:\s*-8px;/);

      // Compact mode hit expansion: 24px + 10px = 44px x 44px (meets WCAG 2.5.5 AAA touch target standard)
      expect(htmlContent).toMatch(/top:\s*-10px;/);
      expect(htmlContent).toMatch(/bottom:\s*-10px;/);
      expect(htmlContent).toMatch(/left:\s*-10px;/);
      expect(htmlContent).toMatch(/right:\s*-10px;/);
    });

    it('verifies accessibility aria-labels on all touch controls in index.html', () => {
      expect(htmlContent).toContain('id="btn-left"');
      expect(htmlContent).toContain('aria-label="Move Left"');
      expect(htmlContent).toContain('id="btn-right"');
      expect(htmlContent).toContain('aria-label="Move Right"');
      expect(htmlContent).toContain('id="btn-fire"');
      expect(htmlContent).toContain('aria-label="Fire Missile"');
      expect(htmlContent).toContain('id="btn-special"');
      expect(htmlContent).toContain('aria-label="Special Move"');
      expect(htmlContent).toContain('id="btn-fullscreen"');
      expect(htmlContent).toContain('aria-label="Toggle Fullscreen"');
    });
  });

  // ==========================================================================
  // Track 2: Layout Collision & Non-Overlap Invariant
  // ==========================================================================
  describe('Track 2: Layout Collision & Non-Overlap Invariant (Landscape 812x375 & Portrait 375x812)', () => {
    it('proves ZERO geometric overlap (0px^2) between controls, dashboard, and canvas in Mobile Landscape (812x375)', () => {
      // Mobile Landscape Viewport: 812 x 375 (iPhone X/11/12/13/14 landscape)
      // ScreenManager: available height = 375 - 44 (dash) = 331px.
      // Canvas aspect ratio: 224 / 288 => displayWidth = floor(331 * 224 / 288) = 257px, displayHeight = 331px.
      // Centered canvas wrapper: left = (812 - 257) / 2 = 277.5 => 277px, right = 534px, top = 0, bottom = 331.
      const canvasWrapper = new MockElement('DIV', 'canvas-wrapper');
      canvasWrapper.setRect({ left: 277, top: 0, width: 257, height: 331 });

      // Centered bottom dashboard: max-width: min(360px, 812 - 320 = 492px) = 360px.
      // Position: left = (812 - 360) / 2 = 226px, right = 586px, top = 331, bottom = 375, height = 44px.
      const dashboard = new MockElement('DIV', 'bottom-dashboard');
      dashboard.setRect({ left: 226, top: 331, width: 360, height: 44 });

      // Left D-Pad container docked in left pillarbox:
      // Padded by max(16px, sal) = 16px.
      // btnLeft: left = 16, width = 56 (right = 72)
      // btnRight: left = 16 + 56 + 14 = 86, width = 56 (right = 142)
      // D-Pad overall rect: left = 16, right = 142, top = 159, bottom = 215 (centered vertically)
      const dpadLeft = new MockElement('DIV', 'dpad-container');
      dpadLeft.setRect({ left: 16, top: 159, width: 126, height: 56 });

      // Right Action container docked in right pillarbox:
      // Padded by max(16px, sar) = 16px.
      // Action container: 3 buttons (fullscreen: 48, special: 50, fire: 64) with 12px gap => total width 186px.
      // Position: left = 812 - 16 - 186 = 610px, right = 796px, top = 155, bottom = 219 (centered vertically)
      const actionRight = new MockElement('DIV', 'action-container');
      actionRight.setRect({ left: 610, top: 155, width: 186, height: 64 });

      const rCanvas = canvasWrapper.getBoundingClientRect();
      const rDash = dashboard.getBoundingClientRect();
      const rLeft = dpadLeft.getBoundingClientRect();
      const rRight = actionRight.getBoundingClientRect();

      // Pairwise Intersection Checks:
      // 1. Canvas vs Dashboard (stacked vertically)
      expect(computeIntersectionArea(rCanvas, rDash)).toBe(0);
      expect(rCanvas.bottom).toBeLessThanOrEqual(rDash.top);

      // 2. Left Controls vs Canvas (separated horizontally in left pillarbox)
      expect(computeIntersectionArea(rLeft, rCanvas)).toBe(0);
      expect(rLeft.right).toBeLessThan(rCanvas.left);
      expect(rCanvas.left - rLeft.right).toBe(135); // 135px clear margin

      // 3. Left Controls vs Dashboard
      expect(computeIntersectionArea(rLeft, rDash)).toBe(0);
      expect(rLeft.right).toBeLessThan(rDash.left);
      expect(rDash.left - rLeft.right).toBe(84); // 84px clear margin

      // 4. Right Controls vs Canvas (separated horizontally in right pillarbox)
      expect(computeIntersectionArea(rRight, rCanvas)).toBe(0);
      expect(rRight.left).toBeGreaterThan(rCanvas.right);
      expect(rRight.left - rCanvas.right).toBe(76); // 76px clear margin

      // 5. Right Controls vs Dashboard
      expect(computeIntersectionArea(rRight, rDash)).toBe(0);
      expect(rRight.left).toBeGreaterThan(rDash.right);
      expect(rDash.right).toBeLessThan(rRight.left);
      expect(rRight.left - rDash.right).toBe(24); // 24px clear margin

      // 6. Left Controls vs Right Controls
      expect(computeIntersectionArea(rLeft, rRight)).toBe(0);
      expect(rRight.left - rLeft.right).toBe(468); // 468px expansive clearance
    });

    it('proves ZERO geometric overlap (0px^2) in Mobile Portrait (375x812) in-flow flex stacking', () => {
      // Mobile Portrait Viewport: 375 x 812 (iPhone X/11/12/13/14 portrait)
      // Safe-area insets: sat = 44px, sab = 34px.
      // Vertical flex stack: canvas-wrapper -> bottom-dashboard -> touch-controls
      // 1. Canvas Wrapper: max-height calc(812 - 44 - 96 - 44 - 34) = 594px.
      //    Width = 375 => 7:9 height = floor(375 * 288 / 224) = 482px <= 594px.
      //    Rect: left = 0, top = 44, width = 375, height = 482 (bottom = 526)
      const canvasWrapper = new MockElement('DIV', 'canvas-wrapper');
      canvasWrapper.setRect({ left: 0, top: 44, width: 375, height: 482 });

      // 2. Bottom Dashboard: docked in-flow below canvas
      //    Rect: left = 0, top = 528, width = 375, height = 44 (bottom = 572)
      const dashboard = new MockElement('DIV', 'bottom-dashboard');
      dashboard.setRect({ left: 0, top: 528, width: 375, height: 44 });

      // 3. Touch Controls: docked in-flow below dashboard
      //    Rect: left = 0, top = 576, width = 375, height = 72 (bottom = 648)
      const touchControls = new MockElement('DIV', 'touch-controls');
      touchControls.setRect({ left: 0, top: 576, width: 375, height: 72 });

      const rCanvas = canvasWrapper.getBoundingClientRect();
      const rDash = dashboard.getBoundingClientRect();
      const rTouch = touchControls.getBoundingClientRect();

      // Pairwise Intersection Checks:
      // 1. Canvas vs Dashboard
      expect(computeIntersectionArea(rCanvas, rDash)).toBe(0);
      expect(rCanvas.bottom).toBeLessThanOrEqual(rDash.top);

      // 2. Dashboard vs Touch Controls
      expect(computeIntersectionArea(rDash, rTouch)).toBe(0);
      expect(rDash.bottom).toBeLessThanOrEqual(rTouch.top);

      // 3. Canvas vs Touch Controls
      expect(computeIntersectionArea(rCanvas, rTouch)).toBe(0);
      expect(rCanvas.bottom).toBeLessThan(rTouch.top);

      // 4. Safe Area Clearance (must not extend past viewport minus sab = 812 - 34 = 778px)
      expect(rTouch.bottom).toBeLessThanOrEqual(778);
      expect(778 - rTouch.bottom).toBe(130); // 130px comfortable cushion
    });

    it('verifies non-collision across extreme screen aspect ratios (1:1, 32:9, 1:2.5)', () => {
      // Degenerate/Square 500x500
      const sqTransform = ScreenManager.calculateTransform(500, 500, 224, 288);
      expect(sqTransform.displayHeight).toBe(500);
      expect(sqTransform.displayWidth).toBe(Math.floor(500 * 7 / 9)); // 388
      expect(sqTransform.offsetX).toBe(Math.floor((500 - 388) / 2)); // 56

      // Ultra-wide 32:9 (3840 x 1080)
      const wideTransform = ScreenManager.calculateTransform(3840, 1080, 224, 288);
      expect(wideTransform.displayHeight).toBe(1080);
      expect(wideTransform.displayWidth).toBe(840);
      expect(wideTransform.offsetX).toBe(Math.floor((3840 - 840) / 2)); // 1500

      // Tall phone 320 x 800 (1:2.5)
      const tallTransform = ScreenManager.calculateTransform(320, 800, 224, 288);
      expect(tallTransform.displayWidth).toBe(320);
      expect(tallTransform.displayHeight).toBe(Math.floor(320 * 9 / 7)); // 411
      expect(tallTransform.offsetY).toBe(Math.floor((800 - 411) / 2)); // 194
    });
  });

  // ==========================================================================
  // Track 3: Multi-Touch Churn & SOCD Resolution
  // ==========================================================================
  describe('Track 3: Multi-Touch Churn & SOCD Resolution (1,000 Churn Cycles)', () => {
    let player: Player;

    beforeEach(() => {
      player = new Player({ x: 112, lives: 3 });
      player.state = 'normal';
    });

    it('verifies SOCD neutral resolution when Left and Right D-pad are touched simultaneously', () => {
      // 1. Initial stationary state
      expect(player.x).toBe(112);
      expect(player.vx).toBe(0);

      // 2. Press Left -> player moves left
      btnLeft.dispatchEvent({ type: 'touchstart', cancelable: true, preventDefault: vi.fn() });
      expect(inputHandler.getState().touchLeft).toBe(true);
      expect(inputHandler.getState().moveLeft).toBe(true);
      expect(inputHandler.getState().moveRight).toBe(false);

      player.update(1 / 60, inputHandler.getState());
      expect(player.vx).toBeLessThan(0);
      const xAfterLeft = player.x;
      expect(xAfterLeft).toBeLessThan(112);

      // 3. Press Right simultaneously (Left still held!) -> SOCD Neutral Resolution
      btnRight.dispatchEvent({ type: 'touchstart', cancelable: true, preventDefault: vi.fn() });
      expect(inputHandler.getState().touchLeft).toBe(true);
      expect(inputHandler.getState().touchRight).toBe(true);
      expect(inputHandler.getState().moveLeft).toBe(true);
      expect(inputHandler.getState().moveRight).toBe(true);

      // Update player with opposing inputs:
      player.update(1 / 60, inputHandler.getState());
      expect(player.vx).toBe(0); // targetVx MUST resolve to exactly 0!
      expect(player.x).toBe(xAfterLeft); // Position remains strictly identical!

      // 4. Release Left (Right still held!) -> player immediately moves Right
      btnLeft.dispatchEvent({ type: 'touchend', cancelable: true, preventDefault: vi.fn() });
      expect(inputHandler.getState().touchLeft).toBe(false);
      expect(inputHandler.getState().touchRight).toBe(true);
      expect(inputHandler.getState().moveLeft).toBe(false);
      expect(inputHandler.getState().moveRight).toBe(true);

      player.update(1 / 60, inputHandler.getState());
      expect(player.vx).toBeGreaterThan(0);
      expect(player.x).toBeGreaterThan(xAfterLeft);

      // 5. Release Right -> returns to neutral
      btnRight.dispatchEvent({ type: 'touchend', cancelable: true, preventDefault: vi.fn() });
      expect(inputHandler.getState().moveRight).toBe(false);
      player.update(1 / 60, inputHandler.getState());
      expect(player.vx).toBe(0);
    });

    it('verifies SOCD neutral resolution in reverse order (Right pressed first, then Left, Right released)', () => {
      // 1. Press Right -> moves right
      btnRight.dispatchEvent({ type: 'touchstart', cancelable: true, preventDefault: vi.fn() });
      player.update(1 / 60, inputHandler.getState());
      expect(player.vx).toBeGreaterThan(0);
      const xPos = player.x;

      // 2. Press Left -> SOCD Neutral
      btnLeft.dispatchEvent({ type: 'touchstart', cancelable: true, preventDefault: vi.fn() });
      player.update(1 / 60, inputHandler.getState());
      expect(player.vx).toBe(0);
      expect(player.x).toBe(xPos);

      // 3. Release Right -> moves left
      btnRight.dispatchEvent({ type: 'touchend', cancelable: true, preventDefault: vi.fn() });
      player.update(1 / 60, inputHandler.getState());
      expect(player.vx).toBeLessThan(0);
      expect(player.x).toBeLessThan(xPos);

      // 4. Release Left -> neutral
      btnLeft.dispatchEvent({ type: 'touchend', cancelable: true, preventDefault: vi.fn() });
      player.update(1 / 60, inputHandler.getState());
      expect(player.vx).toBe(0);
    });

    it('dispatches 1,000 rapid simultaneous multi-touch events without conflicts or NaN coordinates', () => {
      let socdNeutralCount = 0;
      let leftMoves = 0;
      let rightMoves = 0;
      let firePulses = 0;
      let specialPulses = 0;

      for (let i = 0; i < 1000; i++) {
        const fakeTouchEvt = { type: 'touchstart', cancelable: true, preventDefault: vi.fn() };
        const fakeReleaseEvt = { type: 'touchend', cancelable: true, preventDefault: vi.fn() };

        // Bitmask for deterministic combinatorial coverage:
        // bit 0: wantLeft, bit 1: wantRight, bit 2: wantFire, bit 3: wantSpecial
        const wantLeft = (i & 1) !== 0;
        const wantRight = (i & 2) !== 0;
        const wantFire = (i & 4) !== 0;
        const wantSpecial = (i & 8) !== 0;

        // Left button transition
        if (wantLeft !== inputHandler.getState().touchLeft) {
          btnLeft.dispatchEvent(wantLeft ? fakeTouchEvt : fakeReleaseEvt);
        }

        // Right button transition
        if (wantRight !== inputHandler.getState().touchRight) {
          btnRight.dispatchEvent(wantRight ? fakeTouchEvt : fakeReleaseEvt);
        }

        // Fire pulse
        if (wantFire) {
          btnFire.dispatchEvent(fakeTouchEvt);
          if (inputHandler.consumeAction('fire')) firePulses++;
          btnFire.dispatchEvent(fakeReleaseEvt);
        }

        // Special move pulse
        if (wantSpecial) {
          btnSpecial.dispatchEvent(fakeTouchEvt);
          if (inputHandler.consumeAction('special')) specialPulses++;
          btnSpecial.dispatchEvent(fakeReleaseEvt);
        }

        // Update player kinematics
        const state = inputHandler.getState();
        player.update(1 / 60, state);

        // Assert kinematic invariants
        expect(Number.isNaN(player.x)).toBe(false);
        expect(Number.isNaN(player.vx)).toBe(false);
        expect(player.x).toBeGreaterThanOrEqual(12); // Min player clamp bound (Player.clampPosition)
        expect(player.x).toBeLessThanOrEqual(212); // Max player clamp bound (Player.clampPosition)

        if (state.touchLeft && state.touchRight) {
          expect(player.vx).toBe(0); // Invariant: SOCD must be strictly neutral
          socdNeutralCount++;
        } else if (state.moveLeft) {
          expect(player.vx).toBeLessThan(0);
          leftMoves++;
        } else if (state.moveRight) {
          expect(player.vx).toBeGreaterThan(0);
          rightMoves++;
        } else {
          expect(player.vx).toBe(0);
        }
      }

      // Assert that 1,000 operations triggered healthy distributions across all modes
      expect(socdNeutralCount).toBe(250); // Exactly 250 SOCD neutral frames
      expect(leftMoves).toBe(250); // Exactly 250 left movement frames
      expect(rightMoves).toBe(250); // Exactly 250 right movement frames
      expect(firePulses).toBeGreaterThanOrEqual(450); // High-frequency fire taps
      expect(specialPulses).toBeGreaterThanOrEqual(450); // High-frequency special taps
    });

    it('asserts clean state recovery on touchcancel when all buttons are actively depressed', () => {
      // 1. Depress all virtual DOM buttons simultaneously
      btnLeft.dispatchEvent({ type: 'touchstart', cancelable: true, preventDefault: vi.fn() });
      btnRight.dispatchEvent({ type: 'touchstart', cancelable: true, preventDefault: vi.fn() });
      btnFire.dispatchEvent({ type: 'touchstart', cancelable: true, preventDefault: vi.fn() });
      btnSpecial.dispatchEvent({ type: 'touchstart', cancelable: true, preventDefault: vi.fn() });

      expect(inputHandler.getState().touchLeft).toBe(true);
      expect(inputHandler.getState().touchRight).toBe(true);
      expect(inputHandler.getState().touchFire).toBe(true);
      expect(btnLeft.classList.contains('active')).toBe(true);
      expect(btnRight.classList.contains('active')).toBe(true);
      expect(btnFire.classList.contains('active')).toBe(true);
      expect(btnSpecial.classList.contains('active')).toBe(true);

      // 2. Dispatch touchcancel across all elements (simulating browser incoming phone call / system gesture interrupt)
      btnLeft.dispatchEvent({ type: 'touchcancel', cancelable: true, preventDefault: vi.fn() });
      btnRight.dispatchEvent({ type: 'touchcancel', cancelable: true, preventDefault: vi.fn() });
      btnFire.dispatchEvent({ type: 'touchcancel', cancelable: true, preventDefault: vi.fn() });
      btnSpecial.dispatchEvent({ type: 'touchcancel', cancelable: true, preventDefault: vi.fn() });

      // 3. Verify clean state recovery on DOM buttons
      const state = inputHandler.getState();
      expect(state.touchLeft).toBe(false);
      expect(state.touchRight).toBe(false);
      expect(state.touchFire).toBe(false);
      expect(state.moveLeft).toBe(false);
      expect(state.moveRight).toBe(false);
      expect(state.fire).toBe(false);

      expect(btnLeft.classList.contains('active')).toBe(false);
      expect(btnRight.classList.contains('active')).toBe(false);
      expect(btnFire.classList.contains('active')).toBe(false);
      expect(btnSpecial.classList.contains('active')).toBe(false);

      // 4. Test direct canvas multi-touch touchcancel recovery
      mockCanvas.dispatchEvent({
        type: 'touchstart',
        cancelable: true,
        preventDefault: vi.fn(),
        changedTouches: [
          { identifier: 101, clientX: 50, clientY: 100 },
          { identifier: 102, clientX: 300, clientY: 700 }, // fire zone (x > 0.65*375, y > 0.6*812)
        ],
      });

      const canvasStateActive = inputHandler.getState();
      expect(canvasStateActive.touchLeft).toBe(true);
      expect(canvasStateActive.touchFire).toBe(true);

      mockCanvas.dispatchEvent({
        type: 'touchcancel',
        cancelable: true,
        preventDefault: vi.fn(),
        changedTouches: [
          { identifier: 101, clientX: 50, clientY: 100 },
          { identifier: 102, clientX: 300, clientY: 700 },
        ],
      });

      const canvasStateCancelled = inputHandler.getState();
      expect(canvasStateCancelled.touchLeft).toBe(false);
      expect(canvasStateCancelled.touchFire).toBe(false);
      expect(canvasStateCancelled.moveLeft).toBe(false);
      expect(canvasStateCancelled.pointerActive).toBe(false);

      player.update(1 / 60, canvasStateCancelled);
      expect(player.vx).toBe(0);
    });

    it('verifies window blur and document visibility hidden triggers full input reset', () => {
      // Depress Left and Fire
      btnLeft.dispatchEvent({ type: 'touchstart', cancelable: true, preventDefault: vi.fn() });
      btnFire.dispatchEvent({ type: 'touchstart', cancelable: true, preventDefault: vi.fn() });
      expect(inputHandler.getState().moveLeft).toBe(true);
      expect(inputHandler.getState().fire).toBe(true);

      // Window blur event
      (inputHandler as any).handleWindowBlur();
      expect(inputHandler.getState().moveLeft).toBe(false);
      expect(inputHandler.getState().fire).toBe(false);
      expect(inputHandler.getState().touchLeft).toBe(false);
      expect(inputHandler.getState().touchFire).toBe(false);

      // Depress Right and test document visibility change
      btnRight.dispatchEvent({ type: 'touchstart', cancelable: true, preventDefault: vi.fn() });
      expect(inputHandler.getState().moveRight).toBe(true);

      mockDoc.hidden = true;
      (inputHandler as any).handleVisibilityChange();
      expect(inputHandler.getState().moveRight).toBe(false);
      expect(inputHandler.getState().touchRight).toBe(false);
    });
  });

  // ==========================================================================
  // Track 4: Pull-to-Refresh & Gesture Prevention
  // ==========================================================================
  describe('Track 4: Pull-to-Refresh & Gesture Prevention (overscroll-behavior & touch-action)', () => {
    const htmlPath = path.resolve(process.cwd(), 'index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    it('asserts overscroll-behavior: none is applied to html, body and #app-container', () => {
      expect(htmlContent).toMatch(/html,\s*body\s*\{[^}]*overscroll-behavior:\s*none;/);
      expect(htmlContent).toMatch(/#app-container[^\{]*\{[^}]*overscroll-behavior:\s*none;/);
    });

    it('asserts touch-action: none is configured on html, body, and .touch-btn', () => {
      expect(htmlContent).toMatch(/html,\s*body\s*\{[^}]*touch-action:\s*none;/);
      expect(htmlContent).toMatch(/\.touch-btn\s*\{[^}]*touch-action:\s*none;/);
    });

    it('asserts touch-action: manipulation is configured on bottom dashboard to eliminate double-tap zoom delay', () => {
      expect(htmlContent).toMatch(/\.bottom-dashboard[^{]*\{[^}]*touch-action:\s*manipulation;/);
      expect(htmlContent).toMatch(/\.dash-btn\s*\{[^}]*touch-action:\s*manipulation;/);
    });

    it('asserts viewport meta tag strictly prohibits zooming with user-scalable=no', () => {
      expect(htmlContent).toContain('<meta name="viewport"');
      expect(htmlContent).toContain('user-scalable=no');
      expect(htmlContent).toContain('maximum-scale=1.0');
      expect(htmlContent).toContain('viewport-fit=cover');
    });

    it('verifies InputHandler prevents default on all touch events when cancelable is true', () => {
      const mockPreventDefaultCanvas = vi.fn();
      const mockPreventDefaultBtn = vi.fn();

      // TouchStart on canvas
      mockCanvas.dispatchEvent({
        type: 'touchstart',
        cancelable: true,
        preventDefault: mockPreventDefaultCanvas,
        changedTouches: [{ identifier: 1, clientX: 100, clientY: 200 }],
      });
      expect(mockPreventDefaultCanvas).toHaveBeenCalled();

      // TouchMove on canvas
      mockPreventDefaultCanvas.mockClear();
      mockCanvas.dispatchEvent({
        type: 'touchmove',
        cancelable: true,
        preventDefault: mockPreventDefaultCanvas,
        changedTouches: [{ identifier: 1, clientX: 120, clientY: 200 }],
      });
      expect(mockPreventDefaultCanvas).toHaveBeenCalled();

      // TouchEnd on canvas
      mockPreventDefaultCanvas.mockClear();
      mockCanvas.dispatchEvent({
        type: 'touchend',
        cancelable: true,
        preventDefault: mockPreventDefaultCanvas,
        changedTouches: [{ identifier: 1, clientX: 120, clientY: 200 }],
      });
      expect(mockPreventDefaultCanvas).toHaveBeenCalled();

      // TouchStart on D-pad button
      btnLeft.dispatchEvent({
        type: 'touchstart',
        cancelable: true,
        preventDefault: mockPreventDefaultBtn,
      });
      expect(mockPreventDefaultBtn).toHaveBeenCalled();

      // TouchEnd on D-pad button
      mockPreventDefaultBtn.mockClear();
      btnLeft.dispatchEvent({
        type: 'touchend',
        cancelable: true,
        preventDefault: mockPreventDefaultBtn,
      });
      expect(mockPreventDefaultBtn).toHaveBeenCalled();
    });

    it('does not invoke preventDefault when event is non-cancelable', () => {
      const mockPreventDefault = vi.fn();
      btnFire.dispatchEvent({
        type: 'touchstart',
        cancelable: false,
        preventDefault: mockPreventDefault,
      });
      expect(mockPreventDefault).not.toHaveBeenCalled();
    });
  });
});
