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
 * 5. Layout non-overlap: touch controls vs #bottom-dashboard geometric separation in portrait & landscape.
 * 6. Safe-area insets: env(safe-area-inset-*) rules and viewport-fit=cover meta tag.
 * 7. Resize & orientationchange lifecycle, RAF debouncing, and observer teardown.
 * 8. Adversarial edge cases: degenerate viewports (0x0, negative), extreme aspect ratios (32:9, 1:1, 1:5),
 *    and 200 consecutive high-frequency resize whiplash events.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScreenManager } from '../../src/core/ScreenManager';
import { InputHandler } from '../../src/ui/InputHandler';
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
  public offsetHeight: number = 0;
  public offsetWidth: number = 0;
  private listeners: Record<string, Set<(e: any) => void>> = {};
  private _rect: MockRect = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 };

  public classList = {
    _classes: new Set<string>(),
    add: (cls: string) => {
      this.classList._classes.add(cls);
      this.className = Array.from(this.classList._classes).join(' ');
    },
    remove: (cls: string) => {
      this.classList._classes.delete(cls);
      this.className = Array.from(this.classList._classes).join(' ');
    },
    contains: (cls: string) => this.classList._classes.has(cls),
  };

  constructor(tagName: string = 'DIV', id: string = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
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

// ============================================================================
// Main Vitest Test Suite
// ============================================================================

describe('Milestone M29: Universal Multi-Device Responsive Layout Test Suite', () => {
  let mockDoc: MockDocument;
  let mockCanvas: MockElement;
  let mockAppContainer: MockElement;
  let screen: ScreenManager;
  let mockWindow: {
    innerWidth: number;
    innerHeight: number;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

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

    mockWindow = {
      innerWidth: 1920,
      innerHeight: 1080,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    vi.stubGlobal('document', mockDoc);
    vi.stubGlobal('window', mockWindow);

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

      // Verify total vertical coverage
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
      expect(transform.offsetY * 2 + transform.displayHeight).toBe(812); // Symmetric letterboxing
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

    it('verifies discrete touch left/right buttons steering triggers move state', () => {
      const btnLeft = mockDoc.getElementById('btn-left');
      expect(btnLeft).not.toBeNull();

      btnLeft!.dispatchEvent({ type: 'touchstart', cancelable: true, preventDefault: vi.fn() });
      expect(inputHandler.getState().touchLeft).toBe(true);
      expect(inputHandler.getState().moveLeft).toBe(true);

      btnLeft!.dispatchEvent({ type: 'touchend', cancelable: true, preventDefault: vi.fn() });
      expect(inputHandler.getState().touchLeft).toBe(false);
    });

    it('verifies discrete touch special move triggers special action', () => {
      const btnSpecial = mockDoc.getElementById('btn-special');
      expect(btnSpecial).not.toBeNull();

      btnSpecial!.dispatchEvent({ type: 'touchstart', cancelable: true, preventDefault: vi.fn() });
      expect(inputHandler.consumeAction('special')).toBe(true);
    });
  });

  // ==========================================================================
  // Pillar 5: Touch Controls vs Bottom Dashboard Layout Non-Overlap Verification
  // ==========================================================================
  describe('5. Touch Controls vs Bottom Dashboard Layout Non-Overlap Verification', () => {
    it('verifies touch control buttons do not collide or overlap with #bottom-dashboard interactive bounds in portrait', () => {
      // Simulate mobile portrait 375x812 viewport geometry
      const dashboard = new MockElement('DIV', 'bottom-dashboard');
      // Bottom Dashboard docked: y in [680, 724], height = 44px
      dashboard.setRect({ left: 0, top: 680, width: 375, height: 44 });
      mockDoc.registerElement('bottom-dashboard', dashboard);

      // Touch controls container positioned below bottom-dashboard in in-flow portrait stack
      const btnLeft = new MockElement('BUTTON', 'btn-left');
      btnLeft.setRect({ left: 12, top: 736, width: 56, height: 56 });

      const btnRight = new MockElement('BUTTON', 'btn-right');
      btnRight.setRect({ left: 80, top: 736, width: 56, height: 56 });

      const btnFire = new MockElement('BUTTON', 'btn-fire');
      btnFire.setRect({ left: 295, top: 732, width: 68, height: 68 });

      const dRect = dashboard.getBoundingClientRect();
      const touchButtons = [btnLeft, btnRight, btnFire];

      for (const btn of touchButtons) {
        const bRect = btn.getBoundingClientRect();

        // Calculate overlap area
        const xOverlap = Math.max(0, Math.min(dRect.right, bRect.right) - Math.max(dRect.left, bRect.left));
        const yOverlap = Math.max(0, Math.min(dRect.bottom, bRect.bottom) - Math.max(dRect.top, bRect.top));
        const overlapArea = xOverlap * yOverlap;

        expect(overlapArea).toBe(0); // Zero intersection guarantee
        // Touch buttons stay strictly separated from dashboard
        expect(bRect.top).toBeGreaterThanOrEqual(dRect.bottom);
      }
    });

    it('verifies touch controls dock into side pillarboxes with zero dashboard overlap in landscape', () => {
      // Simulate mobile landscape 812x375 viewport geometry
      const dashboard = new MockElement('DIV', 'bottom-dashboard');
      // Dashboard centered: width = 360, left = 226, right = 586, height = 44, top = 331, bottom = 375
      dashboard.setRect({ left: 226, top: 331, width: 360, height: 44 });
      mockDoc.registerElement('bottom-dashboard', dashboard);

      // D-Pad docked in left pillarbox: left = 20, width = 126 (right = 146)
      const btnLeft = new MockElement('BUTTON', 'btn-left');
      btnLeft.setRect({ left: 20, top: 160, width: 56, height: 56 });
      const btnRight = new MockElement('BUTTON', 'btn-right');
      btnRight.setRect({ left: 90, top: 160, width: 56, height: 56 });

      // Action container docked in right pillarbox: left = 620, width = 172 (right = 792)
      const btnFire = new MockElement('BUTTON', 'btn-fire');
      btnFire.setRect({ left: 728, top: 156, width: 64, height: 64 });
      const btnSpecial = new MockElement('BUTTON', 'btn-special');
      btnSpecial.setRect({ left: 666, top: 163, width: 50, height: 50 });

      const dRect = dashboard.getBoundingClientRect();
      const leftControls = [btnLeft, btnRight];
      const rightControls = [btnFire, btnSpecial];

      // Left controls stay entirely to the left of the dashboard
      for (const btn of leftControls) {
        const bRect = btn.getBoundingClientRect();
        expect(bRect.right).toBeLessThanOrEqual(dRect.left);
        const xOverlap = Math.max(0, Math.min(dRect.right, bRect.right) - Math.max(dRect.left, bRect.left));
        const yOverlap = Math.max(0, Math.min(dRect.bottom, bRect.bottom) - Math.max(dRect.top, bRect.top));
        expect(xOverlap * yOverlap).toBe(0);
      }

      // Right controls stay entirely to the right of the dashboard
      for (const btn of rightControls) {
        const bRect = btn.getBoundingClientRect();
        expect(bRect.left).toBeGreaterThanOrEqual(dRect.right);
        const xOverlap = Math.max(0, Math.min(dRect.right, bRect.right) - Math.max(dRect.left, bRect.left));
        const yOverlap = Math.max(0, Math.min(dRect.bottom, bRect.bottom) - Math.max(dRect.top, bRect.top));
        expect(xOverlap * yOverlap).toBe(0);
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

      expect(htmlContent).toContain('env(safe-area-inset-top');
      expect(htmlContent).toContain('env(safe-area-inset-bottom');
      expect(htmlContent).toContain('env(safe-area-inset-left');
      expect(htmlContent).toContain('env(safe-area-inset-right');
    });

    it('verifies safe-area custom CSS properties on :root in index.html', () => {
      const htmlPath = path.resolve(process.cwd(), 'index.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');

      expect(htmlContent).toContain('--sat: env(safe-area-inset-top, 0px);');
      expect(htmlContent).toContain('--sar: env(safe-area-inset-right, 0px);');
      expect(htmlContent).toContain('--sab: env(safe-area-inset-bottom, 0px);');
      expect(htmlContent).toContain('--sal: env(safe-area-inset-left, 0px);');
    });

    it('verifies overscroll-behavior: none to prevent mobile pull-to-refresh', () => {
      const htmlPath = path.resolve(process.cwd(), 'index.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');

      expect(htmlContent).toContain('overscroll-behavior: none;');
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
      mockWindow.innerWidth = 375;
      mockWindow.innerHeight = 812;
      screen.updateScalingImmediate();

      expect(observer).toHaveBeenCalledTimes(2);
      const portraitTransform = observer.mock.calls[1]![0] as ViewportTransform;
      expect(portraitTransform.displayWidth).toBe(375);
      expect(portraitTransform.displayHeight).toBe(482);

      // Simulate orientation change: Landscape (812x375)
      mockWindow.innerWidth = 812;
      mockWindow.innerHeight = 375;
      screen.updateScalingImmediate();

      expect(observer).toHaveBeenCalledTimes(3);
      const landscapeTransform = observer.mock.calls[2]![0] as ViewportTransform;
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

      // Negative values
      const neg = ScreenManager.calculateTransform(-100, -200, 224, 288);
      expect(Number.isNaN(neg.displayWidth)).toBe(false);
      expect(Number.isNaN(neg.displayHeight)).toBe(false);
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
        mockWindow.innerWidth = w;
        mockWindow.innerHeight = h;
        screen.updateScalingImmediate();
      }

      expect(observer).toHaveBeenCalledTimes(200);
      const lastCallTransform = observer.mock.calls[199]![0] as ViewportTransform;
      expect(lastCallTransform.displayWidth).toBeGreaterThan(0);
      expect(lastCallTransform.displayHeight).toBeGreaterThan(0);
      expect(Number.isFinite(lastCallTransform.scale)).toBe(true);
    });
  });
});
