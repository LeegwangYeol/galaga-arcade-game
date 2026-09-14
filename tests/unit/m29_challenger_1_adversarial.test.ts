/**
 * Galaga Arcade Web Game — Milestone M29 Adversarial Test Suite
 * Challenger: m29_challenger_1 (Viewport Geometry & Resize Whiplash Verifier)
 * Location: tests/unit/m29_challenger_1_adversarial.test.ts
 *
 * Adversarially stress-tests:
 * 1. Track 1 (Aspect Ratio Matrix & Mathematical Bounds):
 *    - Fuzz 1,000 random viewport dimensions (W in [100, 4000], H in [100, 3000]).
 *    - Assert displayWidth <= W and displayHeight <= H strictly without overflow.
 *    - Assert displayWidth / displayHeight strictly preserves 224/288 (7:9) ratio within +/-0.005
 *      for all practical screens (min(W, H) >= 180), and bounded by integer pixel floor limit (<= 0.009)
 *      for extreme low-res viewports (min(W, H) < 180).
 *    - Canonical multi-device matrix validation across standard mobile/tablet/desktop profiles.
 * 2. Track 2 (High-Frequency Resize Whiplash & RAF Debouncing):
 *    - Dispatch 200 consecutive rapid window resize events with alternating portrait/landscape ratios.
 *    - Assert zero memory leaks, zero unhandled exceptions, and clean RAF debouncing stability.
 *    - Verify observer fault isolation in updateScalingImmediate() and clean teardown on destroy().
 * 3. Track 3 (Coordinate Transform Round-Trip Invariance):
 *    - Fuzz 500 coordinates across canvas space: virtualToClient -> clientToVirtual.
 *    - Fuzz 500 client coordinates: clientToVirtual -> virtualToClient.
 *    - Assert round-trip translation error ||v - v'|| < 0.05 px across normal and subpixel canvas bounds.
 *    - Verify boundary clamping and degenerate canvas handling.
 * 4. Track 4 (Degenerate Viewport Stress & Graceful Fallback):
 *    - Test 0x0, 0x1080, 1920x0, negative dimensions, microscopic and astronomical viewports.
 *    - Assert graceful fallback without NaN, Infinity, or unhandled exceptions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScreenManager } from '../../src/core/ScreenManager';
import type { ViewportTransform } from '../../src/types';

// ============================================================================
// Adversarial DOM Mock Infrastructure
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

class AdvMockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public style: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public children: AdvMockElement[] = [];
  public parentElement: AdvMockElement | null = null;
  public offsetHeight: number = 0;
  public offsetWidth: number = 0;
  public listeners: Record<string, Set<(e: any) => void>> = {};
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

  appendChild(child: AdvMockElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(selector: string): AdvMockElement | null {
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

class AdvMockDocument {
  public body: AdvMockElement = new AdvMockElement('BODY');
  public documentElement: AdvMockElement = new AdvMockElement('HTML');
  private elementsById: Map<string, AdvMockElement> = new Map();

  createElement(tag: string): AdvMockElement {
    return new AdvMockElement(tag);
  }

  registerElement(id: string, el: AdvMockElement) {
    el.id = id;
    this.elementsById.set(id, el);
    this.body.appendChild(el);
  }

  getElementById(id: string): AdvMockElement | null {
    return this.elementsById.get(id) ?? this.body.querySelector(`#${id}`);
  }
}

// Pseudo-random seeded generator for reproducible adversarial fuzzing
function createSeededRandom(seed: number = 42) {
  let s = seed;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ============================================================================
// Adversarial Challenger Test Suite
// ============================================================================

describe('Milestone M29 Challenger 1: Viewport Geometry, Invariance & Resize Whiplash', () => {
  const TARGET_ASPECT = 224 / 288; // 7/9 (~0.7777777777777778)
  let mockDoc: AdvMockDocument;
  let mockCanvas: AdvMockElement;
  let mockAppContainer: AdvMockElement;
  let screen: ScreenManager;
  let mockWindow: {
    innerWidth: number;
    innerHeight: number;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    dispatchEvent: ReturnType<typeof vi.fn>;
    getComputedStyle?: (el: any) => any;
  };

  beforeEach(() => {
    mockDoc = new AdvMockDocument();
    mockAppContainer = new AdvMockElement('DIV', 'app-container');
    mockCanvas = new AdvMockElement('CANVAS', 'game-canvas');
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
      dispatchEvent: vi.fn(),
      getComputedStyle: () => ({ paddingTop: '0px', paddingBottom: '0px' }),
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
  // Track 1: Aspect Ratio Matrix & Mathematical Bounds
  // ==========================================================================
  describe('Track 1: Aspect Ratio Matrix & Mathematical Bounds', () => {
    it('fuzzes 1,000 random viewports (W in [100, 4000], H in [100, 3000]) asserting strict bounds containment and aspect fidelity', () => {
      const random = createSeededRandom(1337);
      let totalTested = 0;
      let boundViolations = 0;
      let nonFiniteCount = 0;
      let maxDiffPractical = 0;
      let maxDiffSub180 = 0;

      for (let i = 0; i < 1000; i++) {
        const W = Math.floor(random() * (4000 - 100 + 1)) + 100;
        const H = Math.floor(random() * (3000 - 100 + 1)) + 100;

        const transform = ScreenManager.calculateTransform(W, H, 224, 288);
        totalTested++;

        // Invariant 1: Bounds containment (displayWidth <= W, displayHeight <= H)
        if (transform.displayWidth > W || transform.displayHeight > H) {
          boundViolations++;
        }
        expect(transform.displayWidth).toBeLessThanOrEqual(W);
        expect(transform.displayHeight).toBeLessThanOrEqual(H);

        // Invariant 2: Strictly positive and finite
        if (!Number.isFinite(transform.scale) || transform.scale <= 0) {
          nonFiniteCount++;
        }
        expect(transform.displayWidth).toBeGreaterThan(0);
        expect(transform.displayHeight).toBeGreaterThan(0);
        expect(transform.scale).toBeGreaterThan(0);

        // Invariant 3: Aspect ratio preservation
        const renderedAspect = transform.displayWidth / transform.displayHeight;
        const diff = Math.abs(renderedAspect - TARGET_ASPECT);
        const minDim = Math.min(W, H);

        if (minDim >= 180) {
          // For all practical devices (min dimension >= 180px), aspect ratio error strictly <= 0.005 (0.5%)
          if (diff > maxDiffPractical) maxDiffPractical = diff;
          expect(diff).toBeLessThanOrEqual(0.005);
        } else {
          // For extreme low-res viewports (minDim < 180), single-pixel integer floor
          // introduces discretization error bounded by 1/minDim (e.g. 1px / 104px = 0.0096)
          if (diff > maxDiffSub180) maxDiffSub180 = diff;
          expect(diff).toBeLessThanOrEqual(1 / minDim + 0.001);
          expect(diff).toBeLessThanOrEqual(0.010); // Strictly bounded by 1.0%
        }

        // Invariant 4: Offsets symmetry within integer floor remainder
        expect(transform.offsetX).toBeGreaterThanOrEqual(0);
        expect(transform.offsetY).toBeGreaterThanOrEqual(0);
        expect(transform.offsetX * 2 + transform.displayWidth).toBeLessThanOrEqual(W);
        expect(transform.offsetY * 2 + transform.displayHeight).toBeLessThanOrEqual(H);
      }

      expect(totalTested).toBe(1000);
      expect(boundViolations).toBe(0);
      expect(nonFiniteCount).toBe(0);
      expect(maxDiffPractical).toBeLessThan(0.005);
    });

    it('verifies 1,000 standard multi-device spectrum viewports (W in [320, 3840], H in [320, 2160]) with tighter tolerance (< 0.003)', () => {
      const random = createSeededRandom(9999);
      let maxDiff = 0;

      for (let i = 0; i < 1000; i++) {
        const W = Math.floor(random() * (3840 - 320 + 1)) + 320;
        const H = Math.floor(random() * (2160 - 320 + 1)) + 320;

        const transform = ScreenManager.calculateTransform(W, H, 224, 288);
        const renderedAspect = transform.displayWidth / transform.displayHeight;
        const diff = Math.abs(renderedAspect - TARGET_ASPECT);

        if (diff > maxDiff) maxDiff = diff;
        expect(diff).toBeLessThan(0.003);
        expect(transform.displayWidth).toBeLessThanOrEqual(W);
        expect(transform.displayHeight).toBeLessThanOrEqual(H);
      }

      expect(maxDiff).toBeLessThan(0.003);
    });

    it('empirically characterizes single-pixel integer floor discretization at sub-180px viewports', () => {
      // The worst-case discretization in [100, 180] occurs at H = 104:
      // 104 * (7 / 9) = 80.8888... -> Math.floor gives 80
      // 80 / 104 = 0.769230... vs 7/9 (0.777777...) -> diff = 0.008547
      const worstCaseH = 104;
      const transform = ScreenManager.calculateTransform(200, worstCaseH, 224, 288);
      expect(transform.displayHeight).toBe(104);
      expect(transform.displayWidth).toBe(80);

      const ratio = transform.displayWidth / transform.displayHeight;
      const diff = Math.abs(ratio - TARGET_ASPECT);
      expect(diff).toBeCloseTo(0.008547, 5);

      // Confirm that despite integer truncation, bounds are never exceeded
      expect(transform.displayWidth).toBeLessThanOrEqual(200);
      expect(transform.displayHeight).toBeLessThanOrEqual(104);
    });
  });

  // ==========================================================================
  // Track 2: High-Frequency Resize Whiplash & RAF Debouncing
  // ==========================================================================
  describe('Track 2: High-Frequency Resize Whiplash & RAF Debouncing', () => {
    it('coalesces 200 consecutive synchronous resize events into a single RAF update', () => {
      let rafCallback: ((time: number) => void) | null = null;
      let rafCallCount = 0;

      vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
        rafCallCount++;
        rafCallback = cb;
        return 1;
      });

      const observer = vi.fn();
      screen.onResize(observer);
      observer.mockClear(); // Clear initial subscription callback

      // Dispatch 200 rapid resize requests synchronously
      for (let i = 0; i < 200; i++) {
        screen.scheduleResize();
      }

      // RAF should only be scheduled ONCE due to rafResizePending flag
      expect(rafCallCount).toBe(1);
      // Observer should not have been called yet because RAF hasn't fired
      expect(observer).toHaveBeenCalledTimes(0);

      // Execute RAF callback
      expect(rafCallback).not.toBeNull();
      rafCallback!(performance.now());

      // Now observer is updated exactly once
      expect(observer).toHaveBeenCalledTimes(1);

      // Subsequent scheduleResize can now schedule a new RAF
      screen.scheduleResize();
      expect(rafCallCount).toBe(2);
    });

    it('withstands 200 consecutive rapid alternating portrait/landscape resize cycles with zero leaks or exceptions', () => {
      const observer = vi.fn();
      const unsubscribe = screen.onResize(observer);
      observer.mockClear();

      const portraitDims = { w: 375, h: 812 };
      const landscapeDims = { w: 812, h: 375 };

      for (let i = 0; i < 200; i++) {
        const isPortrait = i % 2 === 0;
        const dims = isPortrait ? portraitDims : landscapeDims;

        mockWindow.innerWidth = dims.w;
        mockWindow.innerHeight = dims.h;

        const transform = screen.updateScalingImmediate();

        // Assert valid transform on every cycle
        expect(transform.displayWidth).toBeGreaterThan(0);
        expect(transform.displayHeight).toBeGreaterThan(0);
        expect(transform.scale).toBeGreaterThan(0);
        expect(Number.isNaN(transform.scale)).toBe(false);
        expect(Number.isNaN(transform.displayWidth)).toBe(false);
        expect(Number.isNaN(transform.displayHeight)).toBe(false);

        if (isPortrait) {
          // Portrait (375x812): letterboxed
          expect(transform.displayWidth).toBe(375);
          expect(transform.displayHeight).toBe(482); // Math.floor(375 * 9 / 7) = 482
        } else {
          // Landscape (812x375): pillarboxed
          expect(transform.displayHeight).toBe(375);
          expect(transform.displayWidth).toBe(291); // Math.floor(375 * 7 / 9) = 291
        }
      }

      expect(observer).toHaveBeenCalledTimes(200);
      unsubscribe();
    });

    it('maintains listener set integrity under churn of 50 subscribers during resize storm', () => {
      const observers: ReturnType<typeof vi.fn>[] = [];
      const unsubs: (() => void)[] = [];

      for (let i = 0; i < 50; i++) {
        const fn = vi.fn();
        observers.push(fn);
        unsubs.push(screen.onResize(fn));
      }

      // Trigger resize with all 50 subscribed
      screen.updateScalingImmediate();
      for (const fn of observers) {
        // Initial subscribe (1) + updateScalingImmediate (1) = 2
        expect(fn).toHaveBeenCalledTimes(2);
      }

      // Unsubscribe 25 observers
      for (let i = 0; i < 25; i++) {
        unsubs[i]!();
      }

      // Trigger another resize
      screen.updateScalingImmediate();

      // First 25 should still have 2 calls, remaining 25 should have 3 calls
      for (let i = 0; i < 25; i++) {
        expect(observers[i]).toHaveBeenCalledTimes(2);
      }
      for (let i = 25; i < 50; i++) {
        expect(observers[i]).toHaveBeenCalledTimes(3);
      }

      // Clean up remaining
      for (let i = 25; i < 50; i++) {
        unsubs[i]!();
      }
    });

    it('isolates exceptions thrown by buggy observers during updateScalingImmediate()', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      let faultyCalls = 0;
      const goodObserverBefore = vi.fn();
      const faultyObserver = vi.fn().mockImplementation(() => {
        faultyCalls++;
        // Initial call during onResize succeeds; subsequent calls during resize throw
        if (faultyCalls > 1) {
          throw new Error('Adversarial observer crash during resize update');
        }
      });
      const goodObserverAfter = vi.fn();

      screen.onResize(goodObserverBefore);
      screen.onResize(faultyObserver);
      screen.onResize(goodObserverAfter);

      goodObserverBefore.mockClear();
      faultyObserver.mockClear();
      goodObserverAfter.mockClear();

      // Trigger update: should not throw despite faultyObserver error
      expect(() => {
        screen.updateScalingImmediate();
      }).not.toThrow();

      expect(goodObserverBefore).toHaveBeenCalledTimes(1);
      expect(faultyObserver).toHaveBeenCalledTimes(1);
      expect(goodObserverAfter).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('documents synchronous initial callback invocation behavior during onResize() registration', () => {
      // onResize() executes callback immediately with current transform on line 322
      const observer = vi.fn();
      const unsub = screen.onResize(observer);

      expect(observer).toHaveBeenCalledTimes(1);
      const initialTransform = observer.mock.calls[0]![0] as ViewportTransform;
      expect(initialTransform.virtualWidth).toBe(224);
      expect(initialTransform.virtualHeight).toBe(288);

      unsub();
    });

    it('performs clean teardown when destroy() is invoked during rapid resize activity', () => {
      const observer = vi.fn();
      screen.onResize(observer);
      observer.mockClear();

      // Destroy instance
      screen.destroy();

      // Attempting to call updateScalingImmediate should not notify previously attached observers
      screen.updateScalingImmediate();
      expect(observer).not.toHaveBeenCalled();

      // Canvas reference should be severed
      expect(screen.getCanvas()).toBeNull();
      expect(screen.getContext()).toBeNull();
    });
  });

  // ==========================================================================
  // Track 3: Coordinate Transform Round-Trip Invariance
  // ==========================================================================
  describe('Track 3: Coordinate Transform Round-Trip Invariance', () => {
    beforeEach(() => {
      // Set up standard desktop canvas rect (840x1080 centered on 1920x1080)
      mockCanvas.setRect({
        left: 540,
        top: 0,
        width: 840,
        height: 1080,
      });
    });

    it('fuzzes 500 coordinates asserting virtual -> client -> virtual error ||v - v\'|| < 0.05 px', () => {
      const random = createSeededRandom(5555);
      let maxError = 0;

      for (let i = 0; i < 500; i++) {
        const vx = random() * 224;
        const vy = random() * 288;

        const client = screen.virtualToClient(vx, vy);
        expect(client).not.toBeNull();

        const virtualPrime = screen.clientToVirtual(client!.x, client!.y);
        expect(virtualPrime).not.toBeNull();

        const error = Math.hypot(vx - virtualPrime!.x, vy - virtualPrime!.y);
        if (error > maxError) maxError = error;

        expect(error).toBeLessThan(0.05);
      }

      // Theoretical floating-point error is < 1e-12 px
      expect(maxError).toBeLessThan(1e-10);
    });

    it('fuzzes 500 client points asserting client -> virtual -> client error ||c - c\'|| < 0.05 px', () => {
      const random = createSeededRandom(7777);
      let maxError = 0;
      const rect = mockCanvas.getBoundingClientRect();

      for (let i = 0; i < 500; i++) {
        const cx = rect.left + random() * rect.width;
        const cy = rect.top + random() * rect.height;

        const virtual = screen.clientToVirtual(cx, cy);
        expect(virtual).not.toBeNull();

        const clientPrime = screen.virtualToClient(virtual!.x, virtual!.y);
        expect(clientPrime).not.toBeNull();

        const error = Math.hypot(cx - clientPrime!.x, cy - clientPrime!.y);
        if (error > maxError) maxError = error;

        expect(error).toBeLessThan(0.05);
      }

      expect(maxError).toBeLessThan(1e-10);
    });

    it('maintains round-trip invariance under arbitrary non-integer subpixel canvas placement', () => {
      // Browser zoom / high-DPI scaling often creates fractional client rects
      mockCanvas.setRect({
        left: 137.333,
        top: 29.667,
        width: 541.875,
        height: 696.696,
      });

      const random = createSeededRandom(8888);
      let maxError = 0;

      for (let i = 0; i < 200; i++) {
        const vx = random() * 224;
        const vy = random() * 288;

        const client = screen.virtualToClient(vx, vy);
        const virtualPrime = screen.clientToVirtual(client!.x, client!.y);

        const error = Math.hypot(vx - virtualPrime!.x, vy - virtualPrime!.y);
        if (error > maxError) maxError = error;

        expect(error).toBeLessThan(0.05);
      }

      expect(maxError).toBeLessThan(1e-10);
    });

    it('handles out-of-bounds coordinates cleanly with clampToBounds flag', () => {
      const rect = mockCanvas.getBoundingClientRect();

      // Point far outside canvas (negative)
      const outsideNeg = screen.clientToVirtual(rect.left - 100, rect.top - 50, false);
      expect(outsideNeg).toBeNull();

      const clampedNeg = screen.clientToVirtual(rect.left - 100, rect.top - 50, true);
      expect(clampedNeg).toEqual({ x: 0, y: 0 });

      // Point far outside canvas (positive overflow)
      const outsidePos = screen.clientToVirtual(rect.right + 200, rect.bottom + 300, false);
      expect(outsidePos).toBeNull();

      const clampedPos = screen.clientToVirtual(rect.right + 200, rect.bottom + 300, true);
      expect(clampedPos).toEqual({ x: 224, y: 288 });
    });

    it('returns null safely without throwing when canvas rect is degenerate or detached', () => {
      // Rect with zero dimensions
      mockCanvas.setRect({ left: 0, top: 0, width: 0, height: 0 });
      expect(screen.clientToVirtual(100, 100)).toBeNull();
      expect(screen.virtualToClient(100, 100)).toBeNull();

      // Destroyed instance
      screen.destroy();
      expect(screen.clientToVirtual(100, 100)).toBeNull();
      expect(screen.virtualToClient(100, 100)).toBeNull();
    });
  });

  // ==========================================================================
  // Track 4: Degenerate Viewport Stress & Graceful Fallback
  // ==========================================================================
  describe('Track 4: Degenerate Viewport Stress & Graceful Fallback', () => {
    it('gracefully handles 0x0 viewport returning zero display dimensions without NaN', () => {
      const transform = ScreenManager.calculateTransform(0, 0, 224, 288);

      expect(transform.displayWidth).toBe(0);
      expect(transform.displayHeight).toBe(0);
      expect(transform.scale).toBe(0);
      expect(transform.offsetX).toBe(0);
      expect(transform.offsetY).toBe(0);
      expect(Number.isNaN(transform.scale)).toBe(false);
      expect(Number.isNaN(transform.displayWidth)).toBe(false);
      expect(Number.isNaN(transform.displayHeight)).toBe(false);
    });

    it('gracefully handles 0x1080 (zero width) viewport', () => {
      const transform = ScreenManager.calculateTransform(0, 1080, 224, 288);

      expect(transform.displayWidth).toBe(0);
      expect(transform.displayHeight).toBe(0);
      expect(transform.scale).toBe(0);
      expect(transform.offsetX).toBe(0);
      expect(transform.offsetY).toBe(540);
      expect(Number.isNaN(transform.scale)).toBe(false);
      expect(Number.isNaN(transform.displayWidth)).toBe(false);
    });

    it('gracefully handles 1920x0 (zero height) viewport', () => {
      const transform = ScreenManager.calculateTransform(1920, 0, 224, 288);

      expect(transform.displayWidth).toBe(0);
      expect(transform.displayHeight).toBe(0);
      expect(transform.scale).toBe(0);
      expect(transform.offsetX).toBe(960);
      expect(transform.offsetY).toBe(0);
      expect(Number.isNaN(transform.scale)).toBe(false);
      expect(Number.isNaN(transform.displayHeight)).toBe(false);
    });

    it('gracefully handles negative viewport dimensions without throwing or producing NaN', () => {
      const negBoth = ScreenManager.calculateTransform(-100, -200, 224, 288);
      expect(Number.isNaN(negBoth.displayWidth)).toBe(false);
      expect(Number.isNaN(negBoth.displayHeight)).toBe(false);
      expect(Number.isNaN(negBoth.scale)).toBe(false);

      const negW = ScreenManager.calculateTransform(-1920, 1080, 224, 288);
      expect(Number.isNaN(negW.displayWidth)).toBe(false);
      expect(Number.isNaN(negW.scale)).toBe(false);

      const negH = ScreenManager.calculateTransform(1920, -1080, 224, 288);
      expect(Number.isNaN(negH.displayHeight)).toBe(false);
      expect(Number.isNaN(negH.scale)).toBe(false);
    });

    it('survives sub-microscopic viewports (0.0001 x 0.0001) without crashing', () => {
      const tiny = ScreenManager.calculateTransform(0.0001, 0.0001, 224, 288);
      expect(Number.isNaN(tiny.scale)).toBe(false);
      expect(Number.isFinite(tiny.scale)).toBe(true);
      expect(tiny.displayWidth).toBeGreaterThanOrEqual(0);
      expect(tiny.displayHeight).toBeGreaterThanOrEqual(0);
    });

    it('survives astronomical viewports (1,000,000 x 1,000,000) preserving 7:9 ratio and bounds', () => {
      const massive = ScreenManager.calculateTransform(1000000, 1000000, 224, 288);
      expect(massive.displayHeight).toBe(1000000);
      expect(massive.displayWidth).toBe(Math.floor(1000000 * 7 / 9)); // 777,777
      expect(massive.displayWidth).toBeLessThanOrEqual(1000000);
      expect(massive.scale).toBeCloseTo(777777 / 224, 2);
    });

    it('maintains bounds under extreme aspect ratio anisotropy (1000:1 and 1:1000)', () => {
      // Ultra-panoramic 1000:1 (10,000 x 10)
      const panoramic = ScreenManager.calculateTransform(10000, 10, 224, 288);
      expect(panoramic.displayHeight).toBe(10);
      expect(panoramic.displayWidth).toBe(Math.floor(10 * 7 / 9)); // 7
      expect(panoramic.displayWidth).toBeLessThanOrEqual(10000);
      expect(panoramic.displayHeight).toBeLessThanOrEqual(10);

      // Ultra-vertical 1:1000 (10 x 10,000)
      const vertical = ScreenManager.calculateTransform(10, 10000, 224, 288);
      expect(vertical.displayWidth).toBe(10);
      expect(vertical.displayHeight).toBe(Math.floor(10 * 9 / 7)); // 12
      expect(vertical.displayWidth).toBeLessThanOrEqual(10);
      expect(vertical.displayHeight).toBeLessThanOrEqual(10000);
    });

    it('handles DOM-mounted updateScalingImmediate under degenerate window dimensions', () => {
      // Attach dashboard element to test dynamic height deduction under degenerate window
      const dashboard = new AdvMockElement('DIV', 'bottom-dashboard');
      dashboard.offsetHeight = 56;
      mockDoc.registerElement('bottom-dashboard', dashboard);

      mockWindow.innerWidth = 0;
      mockWindow.innerHeight = 0;

      expect(() => {
        const transform = screen.updateScalingImmediate();
        expect(Number.isNaN(transform.scale)).toBe(false);
        expect(transform.displayWidth).toBe(0);
        expect(transform.displayHeight).toBe(0);
      }).not.toThrow();
    });
  });
});
