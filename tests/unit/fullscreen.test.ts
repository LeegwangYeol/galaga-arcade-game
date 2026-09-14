/**
 * Galaga Arcade Web Game — Milestone M27 Fullscreen Unit Test Suite
 * 
 * Verifies the cross-browser FullscreenManager API under Node.js environment:
 * 1. Target element resolution and defaults.
 * 2. Feature detection (standard W3C, WebKit vendor fallback, unsupported runtimes).
 * 3. State query accuracy (standard fullscreenElement vs webkitFullscreenElement).
 * 4. Request / Exit / Toggle transition lifecycles.
 * 5. Event listener subscriptions (onChange, onError, immediate dispatch, unsubscribe).
 * 6. Error handling, permission denial rejections, and fullscreenerror events.
 * 7. Keyboard shortcuts: 'F' and 'F11' interception, preventDefault, repeat suppression, modifier key isolation.
 * 8. Dedicated toggle button binding, icon state switching (⛶ / 🗗), and accessibility attributes.
 * 9. Viewport synchronization hooks with ScreenManager.
 * 10. Memory lifecycle and cleanup (destroy).
 * 11. ScreenManager & Game integration delegates.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FullscreenManager } from '../../src/ui/FullscreenManager';
import { ScreenManager } from '../../src/core/ScreenManager';
import { Game } from '../../src/core/Game';

// ============================================================================
// Node Environment DOM Mocks for Fullscreen API
// ============================================================================

class MockEventTarget {
  protected listeners: Record<string, Set<(e: any) => void>> = {};

  addEventListener(type: string, listener: (e: any) => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = new Set();
    }
    this.listeners[type]?.add(listener);
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
        } catch (err) {
          // Keep dispatching to other listeners
        }
      }
    }
    return true;
  }

  getListenerCount(type: string): number {
    return this.listeners[type]?.size ?? 0;
  }
}

class MockElement extends MockEventTarget {
  public tagName: string;
  public id: string = '';
  public nodeType: number = 1;
  public classList: {
    classes: Set<string>;
    add: (c: string) => void;
    remove: (c: string) => void;
    contains: (c: string) => boolean;
    toggle: (c: string, force?: boolean) => boolean;
  };
  public attributes: Record<string, string> = {};
  public textContent: string = '';
  public isContentEditable: boolean = false;
  public style: Record<string, string> = {};

  public requestFullscreen: any = null;
  public webkitRequestFullscreen: any = null;

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
      toggle: (c: string, force?: boolean) => {
        if (force !== undefined) {
          if (force) classes.add(c);
          else classes.delete(c);
          return force;
        }
        if (classes.has(c)) {
          classes.delete(c);
          return false;
        } else {
          classes.add(c);
          return true;
        }
      },
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

  querySelector(_selector: string): any {
    return null;
  }
}

class MockDocument extends MockEventTarget {
  public fullscreenElement: MockElement | null = null;
  public webkitFullscreenElement: MockElement | null = null;
  public fullscreenEnabled: boolean = true;
  public webkitFullscreenEnabled: boolean = true;
  public activeElement: MockElement | null = null;

  public documentElement: MockElement;
  public body: MockElement;

  public exitFullscreen: any = null;
  public webkitExitFullscreen: any = null;

  private elementsById: Map<string, MockElement> = new Map();

  constructor() {
    super();
    this.documentElement = new MockElement('HTML');
    this.body = new MockElement('BODY');
    this.activeElement = this.body;
  }

  registerElement(id: string, el: MockElement) {
    el.id = id;
    this.elementsById.set(id, el);
  }

  getElementById(id: string): MockElement | null {
    return this.elementsById.get(id) ?? null;
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      return this.getElementById(selector.slice(1));
    }
    return null;
  }
}

class MockWindow extends MockEventTarget {
  public innerWidth: number = 1920;
  public innerHeight: number = 1080;
}

class MockKeyboardEvent {
  public type: string;
  public code: string;
  public key: string;
  public repeat: boolean;
  public ctrlKey: boolean;
  public metaKey: boolean;
  public altKey: boolean;
  public shiftKey: boolean;
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
      shiftKey?: boolean;
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
    this.shiftKey = init.shiftKey ?? false;
    this.cancelable = init.cancelable ?? true;
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }
}

class MockEvent {
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
// FullscreenManager Unit Tests
// ============================================================================

describe('FullscreenManager Subsystem Suite', () => {
  let mockWindow: MockWindow;
  let mockDocument: MockDocument;
  let mockAppContainer: MockElement;
  let manager: FullscreenManager;

  beforeEach(() => {
    mockWindow = new MockWindow();
    mockDocument = new MockDocument();
    mockAppContainer = new MockElement('DIV', 'app-container');

    // Default standard Fullscreen API on mock element and document
    mockAppContainer.requestFullscreen = vi.fn().mockImplementation(async () => {
      mockDocument.fullscreenElement = mockAppContainer;
      mockDocument.dispatchEvent(new MockEvent('fullscreenchange'));
    });

    mockDocument.exitFullscreen = vi.fn().mockImplementation(async () => {
      mockDocument.fullscreenElement = null;
      mockDocument.dispatchEvent(new MockEvent('fullscreenchange'));
    });

    mockDocument.registerElement('app-container', mockAppContainer);

    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('document', mockDocument);
    vi.stubGlobal('KeyboardEvent', MockKeyboardEvent);
    vi.stubGlobal('Event', MockEvent);

    manager = new FullscreenManager({ target: mockAppContainer as any });
  });

  afterEach(() => {
    manager.destroy();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 1. Initialization & Target Resolution
  // ==========================================================================
  describe('1. Initialization & Target Resolution', () => {
    it('resolves target from options when an HTMLElement is explicitly provided', () => {
      const customElement = new MockElement('DIV', 'custom-target');
      const customMgr = new FullscreenManager({ target: customElement as any });
      expect(customMgr.getTarget()).toBe(customElement);
      customMgr.destroy();
    });

    it('resolves target by string selector (#app-container)', () => {
      const customMgr = new FullscreenManager({ target: '#app-container' });
      expect(customMgr.getTarget()).toBe(mockAppContainer);
      customMgr.destroy();
    });

    it('falls back to #app-container when target is not specified', () => {
      const defaultMgr = new FullscreenManager();
      expect(defaultMgr.getTarget()).toBe(mockAppContainer);
      defaultMgr.destroy();
    });

    it('falls back to documentElement if #app-container is not present', () => {
      const emptyDoc = new MockDocument();
      vi.stubGlobal('document', emptyDoc);
      const fallbackMgr = new FullscreenManager();
      expect(fallbackMgr.getTarget()).toBe(emptyDoc.documentElement);
      fallbackMgr.destroy();
    });

    it('allows dynamically changing target with setTarget', () => {
      const newTarget = new MockElement('DIV', 'new-target');
      manager.setTarget(newTarget as any);
      expect(manager.getTarget()).toBe(newTarget);
    });
  });

  // ==========================================================================
  // 2. Feature Detection (isSupported)
  // ==========================================================================
  describe('2. Feature Detection (isSupported)', () => {
    it('returns true when standard requestFullscreen and exitFullscreen are available', () => {
      expect(manager.isSupported()).toBe(true);
    });

    it('returns true when WebKit vendor methods are available', () => {
      // Remove standard methods, provide WebKit methods
      mockAppContainer.requestFullscreen = null;
      mockDocument.exitFullscreen = null;
      mockAppContainer.webkitRequestFullscreen = vi.fn();
      (mockDocument as any).webkitExitFullscreen = vi.fn();

      const webkitMgr = new FullscreenManager({ target: mockAppContainer as any });
      expect(webkitMgr.isSupported()).toBe(true);
      webkitMgr.destroy();
    });

    it('returns false when neither standard nor vendor methods exist', () => {
      mockAppContainer.requestFullscreen = null;
      mockAppContainer.webkitRequestFullscreen = null;
      mockDocument.exitFullscreen = null;
      (mockDocument as any).webkitExitFullscreen = null;

      const unsuppMgr = new FullscreenManager({ target: mockAppContainer as any });
      expect(unsuppMgr.isSupported()).toBe(false);
      unsuppMgr.destroy();
    });
  });

  // ==========================================================================
  // 3. State Querying (isFullscreen)
  // ==========================================================================
  describe('3. State Querying (isFullscreen)', () => {
    it('returns false initially when document.fullscreenElement is null', () => {
      expect(manager.isFullscreen()).toBe(false);
    });

    it('returns true when standard document.fullscreenElement is set', () => {
      mockDocument.fullscreenElement = mockAppContainer;
      expect(manager.isFullscreen()).toBe(true);
    });

    it('returns true when vendor document.webkitFullscreenElement is set', () => {
      mockDocument.fullscreenElement = null;
      mockDocument.webkitFullscreenElement = mockAppContainer;
      expect(manager.isFullscreen()).toBe(true);
    });
  });

  // ==========================================================================
  // 4. Request / Exit / Toggle Transitions
  // ==========================================================================
  describe('4. Request / Exit / Toggle Transitions', () => {
    it('requests fullscreen mode and transitions state to true', async () => {
      const result = await manager.requestFullscreen();
      expect(result).toBe(true);
      expect(mockAppContainer.requestFullscreen).toHaveBeenCalledTimes(1);
      expect(manager.isFullscreen()).toBe(true);
    });

    it('does not re-request fullscreen if already in fullscreen mode (idempotent)', async () => {
      mockDocument.fullscreenElement = mockAppContainer;
      const result = await manager.requestFullscreen();
      expect(result).toBe(true);
      expect(mockAppContainer.requestFullscreen).not.toHaveBeenCalled();
    });

    it('exits fullscreen mode and transitions state to false', async () => {
      mockDocument.fullscreenElement = mockAppContainer;
      const result = await manager.exitFullscreen();
      expect(result).toBe(true);
      expect(mockDocument.exitFullscreen).toHaveBeenCalledTimes(1);
      expect(manager.isFullscreen()).toBe(false);
    });

    it('does not call exitFullscreen if already windowed (idempotent)', async () => {
      mockDocument.fullscreenElement = null;
      const result = await manager.exitFullscreen();
      expect(result).toBe(true);
      expect(mockDocument.exitFullscreen).not.toHaveBeenCalled();
    });

    it('toggles from windowed to fullscreen and back to windowed', async () => {
      expect(manager.isFullscreen()).toBe(false);

      const state1 = await manager.toggleFullscreen();
      expect(state1).toBe(true);
      expect(manager.isFullscreen()).toBe(true);

      const state2 = await manager.toggleFullscreen();
      expect(state2).toBe(false);
      expect(manager.isFullscreen()).toBe(false);
    });

    it('falls back to WebKit methods when standard methods are absent', async () => {
      mockAppContainer.requestFullscreen = null;
      mockDocument.exitFullscreen = null;

      mockAppContainer.webkitRequestFullscreen = vi.fn().mockImplementation(async () => {
        mockDocument.webkitFullscreenElement = mockAppContainer;
        mockDocument.dispatchEvent(new MockEvent('webkitfullscreenchange'));
      });
      (mockDocument as any).webkitExitFullscreen = vi.fn().mockImplementation(async () => {
        mockDocument.webkitFullscreenElement = null;
        mockDocument.dispatchEvent(new MockEvent('webkitfullscreenchange'));
      });

      const webkitMgr = new FullscreenManager({ target: mockAppContainer as any });
      const req = await webkitMgr.requestFullscreen();
      expect(req).toBe(true);
      expect(mockAppContainer.webkitRequestFullscreen).toHaveBeenCalledTimes(1);
      expect(webkitMgr.isFullscreen()).toBe(true);

      const exit = await webkitMgr.exitFullscreen();
      expect(exit).toBe(true);
      expect((mockDocument as any).webkitExitFullscreen).toHaveBeenCalledTimes(1);
      expect(webkitMgr.isFullscreen()).toBe(false);

      webkitMgr.destroy();
    });
  });

  // ==========================================================================
  // 5. Subscription Callbacks (onChange & onError)
  // ==========================================================================
  describe('5. Subscription Callbacks (onChange & onError)', () => {
    it('invokes onChange listener immediately upon subscription with current state', () => {
      const listener = vi.fn();
      manager.onChange(listener);
      expect(listener).toHaveBeenCalledWith(false);
    });

    it('invokes onChange listener upon fullscreen transition events', async () => {
      const listener = vi.fn();
      manager.onChange(listener);
      listener.mockClear();

      await manager.requestFullscreen();
      expect(listener).toHaveBeenCalledWith(true);

      await manager.exitFullscreen();
      expect(listener).toHaveBeenCalledWith(false);
    });

    it('unsubscribes listener via returned dispose function', async () => {
      const listener = vi.fn();
      const unsubscribe = manager.onChange(listener);
      listener.mockClear();

      unsubscribe();
      await manager.requestFullscreen();
      expect(listener).not.toHaveBeenCalled();
    });

    it('handles listener exceptions gracefully without crashing manager', async () => {
      const faultyListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener explosion');
      });
      const goodListener = vi.fn();

      manager.onChange(faultyListener);
      manager.onChange(goodListener);
      goodListener.mockClear();

      await manager.requestFullscreen();
      expect(goodListener).toHaveBeenCalledWith(true);
    });

    it('invokes onError listener when requestFullscreen rejects', async () => {
      const errorListener = vi.fn();
      manager.onError(errorListener);

      const error = new Error('Permission denied');
      mockAppContainer.requestFullscreen = vi.fn().mockRejectedValue(error);

      const result = await manager.requestFullscreen();
      expect(result).toBe(false);
      expect(errorListener).toHaveBeenCalledWith(error);
    });

    it('invokes onError listener when fullscreenerror event fires on document', () => {
      const errorListener = vi.fn();
      manager.onError(errorListener);

      const errEvent = new MockEvent('fullscreenerror');
      mockDocument.dispatchEvent(errEvent);
      expect(errorListener).toHaveBeenCalledWith(errEvent);
    });
  });

  // ==========================================================================
  // 6. Keyboard Shortcut Interception ('F' and 'F11')
  // ==========================================================================
  describe('6. Keyboard Shortcut Interception', () => {
    it('intercepts "KeyF" and triggers toggleFullscreen with preventDefault', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f' });

      mockWindow.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(spyToggle).toHaveBeenCalledTimes(1);
    });

    it('intercepts "F11" and triggers toggleFullscreen with preventDefault', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'F11', key: 'F11' });

      mockWindow.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(spyToggle).toHaveBeenCalledTimes(1);
    });

    it('CRITICAL: suppresses repeated triggers when key is held down (e.repeat === true)', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f', repeat: true });

      mockWindow.dispatchEvent(event);

      // Must NOT trigger toggle on key-repeat
      expect(spyToggle).not.toHaveBeenCalled();
    });

    it('CRITICAL: prevents default on repeating F11 but does not trigger toggleFullscreen', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'F11', key: 'F11', repeat: true });

      mockWindow.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(spyToggle).not.toHaveBeenCalled();
    });

    it('does NOT intercept "F" when Ctrl is held (allows browser Find in Page)', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f', ctrlKey: true });

      mockWindow.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(spyToggle).not.toHaveBeenCalled();
    });

    it('does NOT intercept "F" when Meta (Cmd) is held (allows macOS Find in Page)', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f', metaKey: true });

      mockWindow.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(spyToggle).not.toHaveBeenCalled();
    });

    it('does NOT intercept "F" when Alt is held', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f', altKey: true });

      mockWindow.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(spyToggle).not.toHaveBeenCalled();
    });

    it('does NOT intercept "F" when Shift is held (allows typing capital F / in-game actions)', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const isShiftF = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'F', shiftKey: true });

      mockWindow.dispatchEvent(isShiftF);

      expect(isShiftF.defaultPrevented).toBe(false);
      expect(spyToggle).not.toHaveBeenCalled();
    });

    it('does NOT intercept "F" when typing inside an active INPUT element', () => {
      const inputElement = new MockElement('INPUT');
      mockDocument.activeElement = inputElement;

      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f' });

      mockWindow.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(spyToggle).not.toHaveBeenCalled();
    });

    it('does NOT bind shortcuts when bindKeyboardShortcut option is false', () => {
      manager.destroy();
      const unboundMgr = new FullscreenManager({ bindKeyboardShortcut: false });
      const spyToggle = vi.spyOn(unboundMgr, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f' });

      mockWindow.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(spyToggle).not.toHaveBeenCalled();
      unboundMgr.destroy();
    });
  });

  // ==========================================================================
  // 7. Dedicated Toggle Button Integration
  // ==========================================================================
  describe('7. Dedicated Toggle Button Integration', () => {
    it('binds to a DOM button, attaches click handler, and initialises state icons', () => {
      const btn = new MockElement('BUTTON', 'btn-fullscreen');
      const unbind = manager.bindToggleButton(btn as any);

      // Initial windowed state
      expect(btn.textContent).toBe('⛶');
      expect(btn.getAttribute('aria-pressed')).toBe('false');
      expect(btn.getAttribute('aria-label')).toBe('Toggle Fullscreen');

      unbind();
    });

    it('toggles fullscreen on button click', () => {
      const btn = new MockElement('BUTTON', 'btn-fullscreen');
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      manager.bindToggleButton(btn as any);

      const clickEvent = new MockEvent('click');
      btn.dispatchEvent(clickEvent);

      expect(clickEvent.defaultPrevented).toBe(true);
      expect(spyToggle).toHaveBeenCalledTimes(1);
    });

    it('updates button icon to 🗗 and aria-pressed="true" when entering fullscreen', async () => {
      const btn = new MockElement('BUTTON', 'btn-fullscreen');
      manager.bindToggleButton(btn as any);

      await manager.requestFullscreen();

      expect(btn.textContent).toBe('🗗');
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect(btn.getAttribute('aria-label')).toBe('Exit Fullscreen');
      expect(btn.classList.contains('fullscreen-active')).toBe(true);
    });

    it('updates button icon to ⛶ and aria-pressed="false" when exiting fullscreen', async () => {
      const btn = new MockElement('BUTTON', 'btn-fullscreen');
      manager.bindToggleButton(btn as any);

      await manager.requestFullscreen();
      await manager.exitFullscreen();

      expect(btn.textContent).toBe('⛶');
      expect(btn.getAttribute('aria-pressed')).toBe('false');
      expect(btn.getAttribute('aria-label')).toBe('Toggle Fullscreen');
      expect(btn.classList.contains('fullscreen-active')).toBe(false);
    });

    it('unbinding button removes click listener', () => {
      const btn = new MockElement('BUTTON', 'btn-fullscreen');
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const unbind = manager.bindToggleButton(btn as any);

      unbind();

      const clickEvent = new MockEvent('click');
      btn.dispatchEvent(clickEvent);

      expect(spyToggle).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 8. Viewport Synchronization Hooks
  // ==========================================================================
  describe('8. Viewport Synchronization Hooks', () => {
    it('triggers updateScalingImmediate on associated ScreenManager when fullscreen changes', async () => {
      const mockScreenManager = {
        updateScalingImmediate: vi.fn(),
      };
      manager.setScreenManager(mockScreenManager as any);

      await manager.requestFullscreen();
      expect(mockScreenManager.updateScalingImmediate).toHaveBeenCalled();
    });

    it('triggers watchdog stabilization timeouts (150ms and 300ms)', async () => {
      vi.useFakeTimers();
      const mockScreenManager = {
        updateScalingImmediate: vi.fn(),
      };
      manager.setScreenManager(mockScreenManager as any);

      manager.triggerViewportSync();
      expect(mockScreenManager.updateScalingImmediate).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(150);
      expect(mockScreenManager.updateScalingImmediate).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(150);
      expect(mockScreenManager.updateScalingImmediate).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });
  });

  // ==========================================================================
  // 9. Lifecycle Cleanup (destroy)
  // ==========================================================================
  describe('9. Lifecycle Cleanup (destroy)', () => {
    it('removes document and window event listeners upon destroy', () => {
      const docChangeListenersBefore = mockDocument.getListenerCount('fullscreenchange');
      const winKeyListenersBefore = mockWindow.getListenerCount('keydown');

      expect(docChangeListenersBefore).toBeGreaterThan(0);
      expect(winKeyListenersBefore).toBeGreaterThan(0);

      manager.destroy();

      expect(mockDocument.getListenerCount('fullscreenchange')).toBe(0);
      expect(mockWindow.getListenerCount('keydown')).toBe(0);
    });

    it('clears all internal change and error subscriber sets upon destroy', async () => {
      const listener = vi.fn();
      manager.onChange(listener);
      listener.mockClear();

      manager.destroy();

      // Trigger change on mock document directly
      mockDocument.dispatchEvent(new MockEvent('fullscreenchange'));
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 10. ScreenManager & Game Integration Delegates
  // ==========================================================================
  describe('10. ScreenManager & Game Integration Delegates', () => {
    it('screenManager.getFullscreenManager() lazily instantiates FullscreenManager', () => {
      const mockCanvas = new MockElement('CANVAS') as any;
      const screen = new ScreenManager(mockCanvas, 224, 288);

      const fsMgr = screen.getFullscreenManager();
      expect(fsMgr).toBeInstanceOf(FullscreenManager);
      expect(screen.getFullscreenManager()).toBe(fsMgr); // Same instance cached

      screen.destroy();
    });

    it('screenManager.toggleFullscreen() delegates to FullscreenManager.toggleFullscreen()', async () => {
      const mockCanvas = new MockElement('CANVAS') as any;
      const screen = new ScreenManager(mockCanvas, 224, 288);
      const fsMgr = screen.getFullscreenManager();
      const spyToggle = vi.spyOn(fsMgr, 'toggleFullscreen').mockResolvedValue(true);

      await screen.toggleFullscreen();
      expect(spyToggle).toHaveBeenCalledTimes(1);

      screen.destroy();
    });

    it('game exposes getFullscreenManager() and toggleFullscreen()', async () => {
      const mockCanvas = new MockElement('CANVAS', 'game-canvas') as any;
      mockDocument.registerElement('game-canvas', mockCanvas);

      const game = new Game(mockCanvas);
      expect(game.getFullscreenManager()).toBeInstanceOf(FullscreenManager);

      const spyToggle = vi.spyOn(game.getFullscreenManager(), 'toggleFullscreen').mockResolvedValue(true);
      const result = await game.toggleFullscreen();

      expect(result).toBe(true);
      expect(spyToggle).toHaveBeenCalledTimes(1);

      game.destroy();
    });
  });
});
