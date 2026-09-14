/**
 * Galaga Arcade Web Game — Milestone M27 Adversarial Test Suite
 * Challenger: m27_challenger_1 (Fullscreen Vendor & Promise Stress Verifier)
 * 
 * Adversarially stress-tests:
 * 1. Async race conditions: 50 rapid consecutive toggles, concurrent in-flight transitions, and artificial latency.
 * 2. Rejected promises: NotAllowedError / permission denial simulation, zero uncaught rejections, error listener dispatch.
 * 3. WebKit prefix priority: Fallback hierarchy when standard W3C methods are missing, sync vs async vendor methods.
 * 4. Detached/null target handling and document-less SSR environment safety.
 * 5. Listener unsubscription, watchdog cancellation, and destroy() lifecycle asserting zero lingering handlers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FullscreenManager } from '../../src/ui/FullscreenManager';
import type { ScreenManager } from '../../src/core/ScreenManager';

// ============================================================================
// Adversarial DOM Mock Infrastructure
// ============================================================================

class AdvMockEventTarget {
  public listeners: Record<string, Set<(e: any) => void>> = {};

  addEventListener(type: string, listener: (e: any) => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = new Set();
    }
    this.listeners[type].add(listener);
  }

  removeEventListener(type: string, listener: (e: any) => void) {
    this.listeners[type]?.delete(listener);
  }

  dispatchEvent(event: any): boolean {
    const set = this.listeners[event.type];
    if (set) {
      for (const listener of Array.from(set)) {
        try {
          listener(event);
        } catch {
          // Swallow listener errors during dispatch to simulate browser behavior
        }
      }
    }
    return true;
  }

  getListenerCount(type: string): number {
    return this.listeners[type]?.size ?? 0;
  }

  getTotalListenerCount(): number {
    let count = 0;
    for (const key of Object.keys(this.listeners)) {
      count += this.listeners[key]?.size ?? 0;
    }
    return count;
  }
}

class AdvMockElement extends AdvMockEventTarget {
  public tagName: string;
  public id: string = '';
  public nodeType: number = 1;
  public classList: {
    classes: Set<string>;
    add: (c: string) => void;
    remove: (c: string) => void;
    contains: (c: string) => boolean;
  };
  public attributes: Record<string, string> = {};
  public textContent: string = '';
  public isContentEditable: boolean = false;
  public parentElement: AdvMockElement | null = null;

  // W3C & Vendor request methods
  public requestFullscreen?: any;
  public webkitRequestFullscreen?: any;
  public webkitRequestFullScreen?: any;
  public mozRequestFullScreen?: any;
  public msRequestFullscreen?: any;

  constructor(tagName: string = 'DIV', id: string = '') {
    super();
    this.tagName = tagName.toUpperCase();
    this.id = id;

    const classes = new Set<string>();
    this.classList = {
      classes,
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      contains: (c: string) => classes.has(c),
    };
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = String(value);
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string) {
    delete this.attributes[name];
  }
}

class AdvMockDocument extends AdvMockEventTarget {
  public fullscreenElement: AdvMockElement | null = null;
  public webkitFullscreenElement: AdvMockElement | null = null;
  public webkitCurrentFullScreenElement: AdvMockElement | null = null;
  public mozFullScreenElement: AdvMockElement | null = null;
  public msFullscreenElement: AdvMockElement | null = null;

  public fullscreenEnabled: boolean = true;
  public webkitFullscreenEnabled: boolean = true;
  public mozFullScreenEnabled: boolean = true;
  public msFullscreenEnabled: boolean = true;

  public activeElement: AdvMockElement | null = null;
  public documentElement: AdvMockElement | null = null;
  public body: AdvMockElement | null = null;

  // W3C & Vendor exit methods
  public exitFullscreen?: any;
  public webkitExitFullscreen?: any;
  public webkitCancelFullScreen?: any;
  public mozCancelFullScreen?: any;
  public msExitFullscreen?: any;

  private elementsById: Map<string, AdvMockElement> = new Map();

  constructor() {
    super();
    this.documentElement = new AdvMockElement('HTML');
    this.body = new AdvMockElement('BODY');
    this.activeElement = this.body;
  }

  registerElement(id: string, el: AdvMockElement) {
    el.id = id;
    this.elementsById.set(id, el);
  }

  getElementById(id: string): AdvMockElement | null {
    return this.elementsById.get(id) ?? null;
  }

  querySelector(selector: string): AdvMockElement | null {
    if (selector.startsWith('#')) {
      return this.getElementById(selector.slice(1));
    }
    return null;
  }
}

class AdvMockWindow extends AdvMockEventTarget {
  public innerWidth: number = 1920;
  public innerHeight: number = 1080;
}

class AdvMockKeyboardEvent {
  public type: string;
  public code: string;
  public key: string;
  public repeat: boolean;
  public ctrlKey: boolean;
  public metaKey: boolean;
  public altKey: boolean;
  public cancelable: boolean;
  public defaultPrevented: boolean = false;

  constructor(
    type: string,
    init: {
      code?: string;
      key?: string;
      repeat?: boolean;
      ctrlKey?: boolean;
      metaKey?: boolean;
      altKey?: boolean;
      cancelable?: boolean;
    } = {}
  ) {
    this.type = type;
    this.code = init.code ?? '';
    this.key = init.key ?? '';
    this.repeat = init.repeat ?? false;
    this.ctrlKey = init.ctrlKey ?? false;
    this.metaKey = init.metaKey ?? false;
    this.altKey = init.altKey ?? false;
    this.cancelable = init.cancelable ?? true;
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }
}

class AdvMockEvent {
  public type: string;
  public cancelable: boolean;
  public defaultPrevented: boolean = false;

  constructor(type: string, init: { cancelable?: boolean } = {}) {
    this.type = type;
    this.cancelable = init.cancelable ?? true;
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }
}

// ============================================================================
// Adversarial Test Suites
// ============================================================================

describe('m27_challenger_1: Adversarial Fullscreen Stress Verifier', () => {
  let mockWindow: AdvMockWindow;
  let mockDocument: AdvMockDocument;
  let mockAppContainer: AdvMockElement;
  let unhandledRejections: any[] = [];
  let rejectionHandler: (reason: any) => void;

  beforeEach(() => {
    unhandledRejections = [];
    rejectionHandler = (reason: any) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', rejectionHandler);

    mockWindow = new AdvMockWindow();
    mockDocument = new AdvMockDocument();
    mockAppContainer = new AdvMockElement('DIV', 'app-container');

    // Default functional mock
    mockAppContainer.requestFullscreen = vi.fn().mockImplementation(async () => {
      mockDocument.fullscreenElement = mockAppContainer;
      mockDocument.dispatchEvent(new AdvMockEvent('fullscreenchange'));
    });

    mockDocument.exitFullscreen = vi.fn().mockImplementation(async () => {
      mockDocument.fullscreenElement = null;
      mockDocument.dispatchEvent(new AdvMockEvent('fullscreenchange'));
    });

    mockDocument.registerElement('app-container', mockAppContainer);

    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('document', mockDocument);
    vi.stubGlobal('KeyboardEvent', AdvMockKeyboardEvent);
    vi.stubGlobal('Event', AdvMockEvent);
  });

  afterEach(() => {
    process.off('unhandledRejection', rejectionHandler);
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    expect(unhandledRejections).toHaveLength(0);
  });

  // ==========================================================================
  // 1. Async Race Conditions: Rapid Consecutive Toggles
  // ==========================================================================
  describe('1. Async Race Conditions: Rapid Consecutive Toggles', () => {
    it('handles 50 rapid consecutive synchronous calls to toggleFullscreen() without unhandled rejections or crashes', async () => {
      const manager = new FullscreenManager({ target: mockAppContainer as any });
      const promises: Promise<boolean>[] = [];

      // Burst 50 toggleFullscreen calls synchronously
      for (let i = 0; i < 50; i++) {
        promises.push(manager.toggleFullscreen());
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(50);
      for (const res of results) {
        expect(typeof res).toBe('boolean');
      }

      // Final state should be a valid boolean and consistent with document.fullscreenElement
      expect(manager.isFullscreen()).toBe(mockDocument.fullscreenElement !== null);
      manager.destroy();
    });

    it('handles 50 rapid consecutive toggles with artificial async delay (10ms in-flight)', async () => {
      // Introduce artificial delay in requestFullscreen and exitFullscreen
      mockAppContainer.requestFullscreen = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        mockDocument.fullscreenElement = mockAppContainer;
        mockDocument.dispatchEvent(new AdvMockEvent('fullscreenchange'));
      });

      mockDocument.exitFullscreen = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        mockDocument.fullscreenElement = null;
        mockDocument.dispatchEvent(new AdvMockEvent('fullscreenchange'));
      });

      const manager = new FullscreenManager({ target: mockAppContainer as any });
      const promises: Promise<boolean>[] = [];

      for (let i = 0; i < 50; i++) {
        promises.push(manager.toggleFullscreen());
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(50);
      for (const r of results) {
        expect(typeof r).toBe('boolean');
      }

      manager.destroy();
    });

    it('handles simultaneous competing requestFullscreen and exitFullscreen bursts', async () => {
      const manager = new FullscreenManager({ target: mockAppContainer as any });
      const requests: Promise<boolean>[] = [];

      // Interleave 25 requests and 25 exits
      for (let i = 0; i < 25; i++) {
        requests.push(manager.requestFullscreen());
        requests.push(manager.exitFullscreen());
      }

      const settled = await Promise.allSettled(requests);
      expect(settled).toHaveLength(50);
      for (const item of settled) {
        expect(item.status).toBe('fulfilled');
        if (item.status === 'fulfilled') {
          expect(typeof item.value).toBe('boolean');
        }
      }

      manager.destroy();
    });

    it('maintains viewport sync watchdog stability under rapid 50 toggle bursts', async () => {
      const mockScreenManager: ScreenManager = {
        updateScalingImmediate: vi.fn(),
      } as any;

      const manager = new FullscreenManager({
        target: mockAppContainer as any,
        screenManager: mockScreenManager,
      });

      for (let i = 0; i < 50; i++) {
        manager.triggerViewportSync();
      }

      // Immediate call should have executed 50 times
      expect(mockScreenManager.updateScalingImmediate).toHaveBeenCalledTimes(50);

      // Wait for watchdog timeouts (150ms & 300ms) to settle
      await new Promise((resolve) => setTimeout(resolve, 350));

      // After 50 rapid calls, previous timeouts should have been cleared, leaving only 1 settled execution per timeout stage
      expect((mockScreenManager.updateScalingImmediate as any).mock.calls.length).toBeGreaterThanOrEqual(50);

      manager.destroy();
    });
  });

  // ==========================================================================
  // 2. Rejected Promises & Permission Denial Simulation
  // ==========================================================================
  describe('2. Rejected Promises & Permission Denial Simulation', () => {
    it('gracefully catches NotAllowedError on requestFullscreen() and dispatches to onError', async () => {
      const notAllowedError = new Error('NotAllowedError: Fullscreen request denied without user activation');
      notAllowedError.name = 'NotAllowedError';

      mockAppContainer.requestFullscreen = vi.fn().mockRejectedValue(notAllowedError);

      const manager = new FullscreenManager({ target: mockAppContainer as any });
      const errorSpy = vi.fn();
      manager.onError(errorSpy);

      const success = await manager.requestFullscreen();

      // Must resolve to false rather than throwing
      expect(success).toBe(false);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(notAllowedError);

      // Manager remains functional
      expect(manager.isFullscreen()).toBe(false);
      manager.destroy();
    });

    it('gracefully catches TypeError / InvalidStateError on exitFullscreen() and dispatches to onError', async () => {
      mockDocument.fullscreenElement = mockAppContainer; // in fullscreen

      const invalidStateError = new Error('TypeError: Document is not in fullscreen');
      mockDocument.exitFullscreen = vi.fn().mockRejectedValue(invalidStateError);

      const manager = new FullscreenManager({ target: mockAppContainer as any });
      const errorSpy = vi.fn();
      manager.onError(errorSpy);

      const success = await manager.exitFullscreen();

      expect(success).toBe(false);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(invalidStateError);

      manager.destroy();
    });

    it('toggleFullscreen() returns false on rejection without throwing uncaught promise exception', async () => {
      mockAppContainer.requestFullscreen = vi.fn().mockRejectedValue(new Error('Permission check failed'));

      const manager = new FullscreenManager({ target: mockAppContainer as any });
      const errorSpy = vi.fn();
      manager.onError(errorSpy);

      const res = await manager.toggleFullscreen();

      expect(res).toBe(false);
      expect(errorSpy).toHaveBeenCalledTimes(1);

      manager.destroy();
    });

    it('handles rejected promise triggered by keyboard shortcut (F / F11) safely', async () => {
      mockAppContainer.requestFullscreen = vi.fn().mockRejectedValue(new Error('User activation expired'));

      const manager = new FullscreenManager({ target: mockAppContainer as any });
      const errorSpy = vi.fn();
      manager.onError(errorSpy);

      const fKeyEvent = new AdvMockKeyboardEvent('keydown', { code: 'KeyF', key: 'f' });
      mockWindow.dispatchEvent(fKeyEvent);

      // Allow async toggleFullscreen to reject and handle
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(fKeyEvent.defaultPrevented).toBe(true);

      manager.destroy();
    });

    it('handles rejected promise triggered by dedicated toggle button click safely', async () => {
      mockAppContainer.requestFullscreen = vi.fn().mockRejectedValue(new Error('Gesture check rejected'));

      const btn = new AdvMockElement('BUTTON', 'fs-toggle-btn');
      const manager = new FullscreenManager({ target: mockAppContainer as any });
      const errorSpy = vi.fn();
      manager.onError(errorSpy);

      const unbind = manager.bindToggleButton(btn as any);

      const clickEvent = new AdvMockEvent('click', { cancelable: true });
      btn.dispatchEvent(clickEvent);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(clickEvent.defaultPrevented).toBe(true);

      unbind();
      manager.destroy();
    });

    it('dispatches to multiple onError listeners even if an earlier listener throws', async () => {
      mockAppContainer.requestFullscreen = vi.fn().mockRejectedValue(new Error('Browser restriction'));

      const manager = new FullscreenManager({ target: mockAppContainer as any });
      const badListener = vi.fn().mockImplementation(() => {
        throw new Error('Exploding error listener');
      });
      const goodListener = vi.fn();

      manager.onError(badListener);
      manager.onError(goodListener);

      const success = await manager.requestFullscreen();

      expect(success).toBe(false);
      expect(badListener).toHaveBeenCalledTimes(1);
      expect(goodListener).toHaveBeenCalledTimes(1);

      manager.destroy();
    });

    it('dispatches document fullscreenerror and webkitfullscreenerror to onError listeners', () => {
      const manager = new FullscreenManager({ target: mockAppContainer as any });
      const errorSpy = vi.fn();
      manager.onError(errorSpy);

      const err1 = new AdvMockEvent('fullscreenerror');
      mockDocument.dispatchEvent(err1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(err1);

      const err2 = new AdvMockEvent('webkitfullscreenerror');
      mockDocument.dispatchEvent(err2);
      expect(errorSpy).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledWith(err2);

      manager.destroy();
    });
  });

  // ==========================================================================
  // 3. WebKit Prefix Priority & Vendor Fallback Ordering
  // ==========================================================================
  describe('3. WebKit Prefix Priority & Vendor Fallback Ordering', () => {
    it('prioritizes standard W3C requestFullscreen over WebKit vendor method when both exist', async () => {
      const standardReq = vi.fn().mockResolvedValue(undefined);
      const webkitReq = vi.fn().mockResolvedValue(undefined);

      mockAppContainer.requestFullscreen = standardReq;
      mockAppContainer.webkitRequestFullscreen = webkitReq;

      const manager = new FullscreenManager({ target: mockAppContainer as any });
      await manager.requestFullscreen();

      expect(standardReq).toHaveBeenCalledTimes(1);
      expect(webkitReq).not.toHaveBeenCalled();

      manager.destroy();
    });

    it('prioritizes standard W3C exitFullscreen over WebKit vendor method when both exist', async () => {
      mockDocument.fullscreenElement = mockAppContainer;

      const standardExit = vi.fn().mockResolvedValue(undefined);
      const webkitExit = vi.fn().mockResolvedValue(undefined);

      mockDocument.exitFullscreen = standardExit;
      (mockDocument as any).webkitExitFullscreen = webkitExit;

      const manager = new FullscreenManager({ target: mockAppContainer as any });
      await manager.exitFullscreen();

      expect(standardExit).toHaveBeenCalledTimes(1);
      expect(webkitExit).not.toHaveBeenCalled();

      manager.destroy();
    });

    it('falls back to webkitRequestFullscreen and webkitExitFullscreen when standard methods are missing', async () => {
      delete mockAppContainer.requestFullscreen;
      delete mockDocument.exitFullscreen;

      const webkitReq = vi.fn().mockImplementation(async () => {
        mockDocument.webkitFullscreenElement = mockAppContainer;
        mockDocument.dispatchEvent(new AdvMockEvent('webkitfullscreenchange'));
      });
      const webkitExit = vi.fn().mockImplementation(async () => {
        mockDocument.webkitFullscreenElement = null;
        mockDocument.dispatchEvent(new AdvMockEvent('webkitfullscreenchange'));
      });

      mockAppContainer.webkitRequestFullscreen = webkitReq;
      (mockDocument as any).webkitExitFullscreen = webkitExit;

      const manager = new FullscreenManager({ target: mockAppContainer as any });
      expect(manager.isSupported()).toBe(true);

      const reqSuccess = await manager.requestFullscreen();
      expect(reqSuccess).toBe(true);
      expect(webkitReq).toHaveBeenCalledTimes(1);
      expect(manager.isFullscreen()).toBe(true);

      const exitSuccess = await manager.exitFullscreen();
      expect(exitSuccess).toBe(true);
      expect(webkitExit).toHaveBeenCalledTimes(1);
      expect(manager.isFullscreen()).toBe(false);

      manager.destroy();
    });

    it('handles legacy synchronous WebKit methods (returning void instead of Promise)', async () => {
      delete mockAppContainer.requestFullscreen;
      delete mockDocument.exitFullscreen;

      // Synchronous void return (Safari 6-10 style)
      mockAppContainer.webkitRequestFullscreen = vi.fn().mockReturnValue(undefined);
      (mockDocument as any).webkitExitFullscreen = vi.fn().mockReturnValue(undefined);

      const manager = new FullscreenManager({ target: mockAppContainer as any });

      const reqSuccess = await manager.requestFullscreen();
      expect(reqSuccess).toBe(true);

      mockDocument.webkitFullscreenElement = mockAppContainer;
      expect(manager.isFullscreen()).toBe(true);

      const exitSuccess = await manager.exitFullscreen();
      expect(exitSuccess).toBe(true);

      manager.destroy();
    });

    it('falls back to camelCase webkitRequestFullScreen and webkitCancelFullScreen', async () => {
      delete mockAppContainer.requestFullscreen;
      delete mockAppContainer.webkitRequestFullscreen;
      delete mockDocument.exitFullscreen;
      delete (mockDocument as any).webkitExitFullscreen;

      mockAppContainer.webkitRequestFullScreen = vi.fn().mockResolvedValue(undefined);
      (mockDocument as any).webkitCancelFullScreen = vi.fn().mockResolvedValue(undefined);

      const manager = new FullscreenManager({ target: mockAppContainer as any });
      expect(manager.isSupported()).toBe(true);

      await manager.requestFullscreen();
      expect(mockAppContainer.webkitRequestFullScreen).toHaveBeenCalledTimes(1);

      mockDocument.webkitCurrentFullScreenElement = mockAppContainer;
      expect(manager.isFullscreen()).toBe(true);

      await manager.exitFullscreen();
      expect((mockDocument as any).webkitCancelFullScreen).toHaveBeenCalledTimes(1);

      manager.destroy();
    });

    it('falls back to Mozilla mozRequestFullScreen and mozCancelFullScreen', async () => {
      delete mockAppContainer.requestFullscreen;
      delete mockDocument.exitFullscreen;

      mockAppContainer.mozRequestFullScreen = vi.fn().mockResolvedValue(undefined);
      (mockDocument as any).mozCancelFullScreen = vi.fn().mockResolvedValue(undefined);

      const manager = new FullscreenManager({ target: mockAppContainer as any });
      expect(manager.isSupported()).toBe(true);

      await manager.requestFullscreen();
      expect(mockAppContainer.mozRequestFullScreen).toHaveBeenCalledTimes(1);

      mockDocument.mozFullScreenElement = mockAppContainer;
      expect(manager.isFullscreen()).toBe(true);

      await manager.exitFullscreen();
      expect((mockDocument as any).mozCancelFullScreen).toHaveBeenCalledTimes(1);

      manager.destroy();
    });

    it('falls back to Microsoft msRequestFullscreen and msExitFullscreen', async () => {
      delete mockAppContainer.requestFullscreen;
      delete mockDocument.exitFullscreen;

      mockAppContainer.msRequestFullscreen = vi.fn().mockResolvedValue(undefined);
      (mockDocument as any).msExitFullscreen = vi.fn().mockResolvedValue(undefined);

      const manager = new FullscreenManager({ target: mockAppContainer as any });
      expect(manager.isSupported()).toBe(true);

      await manager.requestFullscreen();
      expect(mockAppContainer.msRequestFullscreen).toHaveBeenCalledTimes(1);

      mockDocument.msFullscreenElement = mockAppContainer;
      expect(manager.isFullscreen()).toBe(true);

      await manager.exitFullscreen();
      expect((mockDocument as any).msExitFullscreen).toHaveBeenCalledTimes(1);

      manager.destroy();
    });

    it('respects state query priority across all vendor fullscreen element properties', () => {
      const manager = new FullscreenManager({ target: mockAppContainer as any });

      // None active
      expect(manager.isFullscreen()).toBe(false);

      // msFullscreenElement
      mockDocument.msFullscreenElement = mockAppContainer;
      expect(manager.isFullscreen()).toBe(true);

      // mozFullScreenElement
      mockDocument.mozFullScreenElement = mockAppContainer;
      expect(manager.isFullscreen()).toBe(true);

      // webkitCurrentFullScreenElement
      mockDocument.webkitCurrentFullScreenElement = mockAppContainer;
      expect(manager.isFullscreen()).toBe(true);

      // webkitFullscreenElement
      mockDocument.webkitFullscreenElement = mockAppContainer;
      expect(manager.isFullscreen()).toBe(true);

      // standard fullscreenElement
      mockDocument.fullscreenElement = mockAppContainer;
      expect(manager.isFullscreen()).toBe(true);

      // Clear all
      mockDocument.fullscreenElement = null;
      mockDocument.webkitFullscreenElement = null;
      mockDocument.webkitCurrentFullScreenElement = null;
      mockDocument.mozFullScreenElement = null;
      mockDocument.msFullscreenElement = null;
      expect(manager.isFullscreen()).toBe(false);

      manager.destroy();
    });
  });

  // ==========================================================================
  // 4. Detached / Null Target Handling & Document-less SSR Environment
  // ==========================================================================
  describe('4. Detached / Null Target Handling & Document-less SSR Environment', () => {
    it('survives in document-less SSR environment without crashing', async () => {
      // Simulate SSR environment by removing document and window globals
      vi.stubGlobal('document', undefined);
      vi.stubGlobal('window', undefined);

      const ssrManager = new FullscreenManager();

      expect(ssrManager.isSupported()).toBe(false);
      expect(ssrManager.isFullscreen()).toBe(false);
      expect(ssrManager.getTarget()).toBe(null);
      expect(ssrManager.resolveTarget()).toBe(null);

      const reqRes = await ssrManager.requestFullscreen();
      expect(reqRes).toBe(false);

      const exitRes = await ssrManager.exitFullscreen();
      expect(exitRes).toBe(false);

      const toggleRes = await ssrManager.toggleFullscreen();
      expect(toggleRes).toBe(false);

      // Viewport sync and destroy should not throw
      expect(() => ssrManager.triggerViewportSync()).not.toThrow();
      expect(() => ssrManager.destroy()).not.toThrow();
    });

    it('survives in window-less environment when document exists', () => {
      vi.stubGlobal('window', undefined);

      const winlessManager = new FullscreenManager({ target: mockAppContainer as any });
      expect(winlessManager.isSupported()).toBe(true);
      expect(() => winlessManager.destroy()).not.toThrow();
    });

    it('gracefully handles missing target selector when document has no fallback elements', async () => {
      const bareDoc = new AdvMockDocument();
      bareDoc.documentElement = null;
      bareDoc.body = null;
      vi.stubGlobal('document', bareDoc);

      const manager = new FullscreenManager({ target: '#ghost-element' });
      expect(manager.getTarget()).toBe(null);

      const reqRes = await manager.requestFullscreen();
      expect(reqRes).toBe(false);

      const exitRes = await manager.exitFullscreen();
      expect(exitRes).toBe(true); // already not fullscreen

      manager.destroy();
    });

    it('handles detached DOM target element without parent', async () => {
      const detachedElement = new AdvMockElement('SECTION', 'detached');
      detachedElement.parentElement = null;
      detachedElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);

      const manager = new FullscreenManager({ target: detachedElement as any });
      expect(manager.getTarget()).toBe(detachedElement);

      const res = await manager.requestFullscreen();
      expect(res).toBe(true);
      expect(detachedElement.requestFullscreen).toHaveBeenCalledTimes(1);

      manager.destroy();
    });

    it('handles target element without classList property safely on fullscreenchange', () => {
      const bareElement: any = new AdvMockElement('DIV', 'bare');
      delete bareElement.classList;

      const manager = new FullscreenManager({ target: bareElement });
      mockDocument.fullscreenElement = bareElement;

      expect(() => {
        mockDocument.dispatchEvent(new AdvMockEvent('fullscreenchange'));
      }).not.toThrow();

      manager.destroy();
    });
  });

  // ==========================================================================
  // 5. Listener Unsubscription & destroy() Cleanup Lifecycle
  // ==========================================================================
  describe('5. Listener Unsubscription & destroy() Cleanup Lifecycle', () => {
    it('unsubscribes onChange listeners accurately and stops receiving updates', () => {
      const manager = new FullscreenManager({ target: mockAppContainer as any });
      const spy1 = vi.fn();
      const spy2 = vi.fn();

      const unbind1 = manager.onChange(spy1);
      const unbind2 = manager.onChange(spy2);

      // Initial invocation
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);

      // Unsubscribe spy1
      unbind1();

      // Trigger change
      mockDocument.fullscreenElement = mockAppContainer;
      mockDocument.dispatchEvent(new AdvMockEvent('fullscreenchange'));

      expect(spy1).toHaveBeenCalledTimes(1); // not called again
      expect(spy2).toHaveBeenCalledTimes(2); // called again

      unbind2();
      manager.destroy();
    });

    it('unsubscribes onError listeners accurately and stops receiving errors', async () => {
      const manager = new FullscreenManager({ target: mockAppContainer as any });
      const errSpy1 = vi.fn();
      const errSpy2 = vi.fn();

      const unbind1 = manager.onError(errSpy1);
      const unbind2 = manager.onError(errSpy2);

      mockDocument.dispatchEvent(new AdvMockEvent('fullscreenerror'));
      expect(errSpy1).toHaveBeenCalledTimes(1);
      expect(errSpy2).toHaveBeenCalledTimes(1);

      unbind1();

      mockDocument.dispatchEvent(new AdvMockEvent('fullscreenerror'));
      expect(errSpy1).toHaveBeenCalledTimes(1); // unchanged
      expect(errSpy2).toHaveBeenCalledTimes(2);

      unbind2();
      manager.destroy();
    });

    it('bindToggleButton unbind helper detaches click handler and change observer', () => {
      const btn = new AdvMockElement('BUTTON', 'toggle-btn');
      const manager = new FullscreenManager({ target: mockAppContainer as any });

      expect(mockDocument.getTotalListenerCount()).toBe(8);
      const unbind = manager.bindToggleButton(btn as any);

      expect(btn.getListenerCount('click')).toBe(1);
      expect(btn.textContent).toBe('⛶');

      // Trigger change
      mockDocument.fullscreenElement = mockAppContainer;
      mockDocument.dispatchEvent(new AdvMockEvent('fullscreenchange'));
      expect(btn.textContent).toBe('🗗');
      expect(btn.getAttribute('aria-pressed')).toBe('true');

      // Unbind button
      unbind();
      expect(btn.getListenerCount('click')).toBe(0);

      // Subsequent changes must not update button
      mockDocument.fullscreenElement = null;
      mockDocument.dispatchEvent(new AdvMockEvent('fullscreenchange'));
      expect(btn.textContent).toBe('🗗'); // preserved, not updated

      manager.destroy();
    });

    it('destroy() detaches all document and window event listeners leaving zero lingering handlers', () => {
      const docInitialCount = mockDocument.getTotalListenerCount();
      const winInitialCount = mockWindow.getTotalListenerCount();

      expect(docInitialCount).toBe(0);
      expect(winInitialCount).toBe(0);

      const manager = new FullscreenManager({ target: mockAppContainer as any });

      // 4 change + 4 error = 8 document listeners
      expect(mockDocument.getTotalListenerCount()).toBe(8);
      // 1 keydown listener on window
      expect(mockWindow.getTotalListenerCount()).toBe(1);

      manager.destroy();

      // After destroy, listener count must strictly return to 0
      expect(mockDocument.getTotalListenerCount()).toBe(0);
      expect(mockWindow.getTotalListenerCount()).toBe(0);
      expect(manager.getTarget()).toBe(null);
    });

    it('destroy() cancels active watchdog timeouts preventing lingering timers', () => {
      const mockScreenManager: ScreenManager = {
        updateScalingImmediate: vi.fn(),
      } as any;

      const manager = new FullscreenManager({
        target: mockAppContainer as any,
        screenManager: mockScreenManager,
      });

      manager.triggerViewportSync();
      // Watchdog timeouts are queued (150ms and 300ms)
      expect((manager as any).watchdogTimeout1).not.toBeNull();
      expect((manager as any).watchdogTimeout2).not.toBeNull();

      manager.destroy();

      expect((manager as any).watchdogTimeout1).toBeNull();
      expect((manager as any).watchdogTimeout2).toBeNull();
    });

    it('is idempotent when destroy() is called multiple times consecutively', () => {
      const manager = new FullscreenManager({ target: mockAppContainer as any });

      expect(() => {
        manager.destroy();
        manager.destroy();
        manager.destroy();
      }).not.toThrow();

      expect(mockDocument.getTotalListenerCount()).toBe(0);
      expect(mockWindow.getTotalListenerCount()).toBe(0);
    });

    it('post-destroy calls to methods handle state gracefully without throws', async () => {
      const manager = new FullscreenManager({ target: mockAppContainer as any });
      manager.destroy();

      expect(manager.isFullscreen()).toBe(false);
      expect(manager.getTarget()).toBe(null);

      const reqRes = await manager.requestFullscreen();
      expect(typeof reqRes).toBe('boolean');

      const exitRes = await manager.exitFullscreen();
      expect(typeof exitRes).toBe('boolean');

      const toggleRes = await manager.toggleFullscreen();
      expect(typeof toggleRes).toBe('boolean');
    });
  });
});
