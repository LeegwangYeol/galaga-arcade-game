/**
 * Galaga Arcade Web Game — Milestone M27 Adversarial Test Suite
 * Challenger: m27_challenger_2 (Keyboard Shortcuts & Key-Repeat Throttling Verifier)
 * 
 * Adversarial Focus Areas:
 * 1. Typematic key-repeat throttling: 100 consecutive keydown events with repeat: true
 *    for KeyF and F11. Assert toggleFullscreen() is NOT repeatedly invoked while default
 *    F11 browser maximize remains prevented.
 * 2. Modifier key isolation: verify Ctrl+F, Meta+F (Cmd+F), Alt+F, Shift+F do NOT trigger fullscreen.
 * 3. Form input isolation: verify typing 'f' into <input> or <textarea> does NOT trigger fullscreen.
 * 4. Toggle button state synchronization: verify button text/icon flips between ⛶ and 🗗,
 *    and aria-pressed accurately tracks fullscreen state across external browser changes (e.g. Esc key).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FullscreenManager } from '../../src/ui/FullscreenManager';

// ============================================================================
// Adversarial Node DOM Mocks
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
          // Swallow listener exception to continue dispatch
        }
      }
    }
    return true;
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

interface MockKeyboardEventInit {
  code?: string;
  key?: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  cancelable?: boolean;
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

  constructor(type: string, init: MockKeyboardEventInit = {}) {
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
// Adversarial Test Suites
// ============================================================================

describe('Milestone M27 Adversarial Suite — Keyboard Shortcuts & State Sync (Challenger 2)', () => {
  let originalWindow: any;
  let originalDocument: any;
  let mockWindow: MockWindow;
  let mockDocument: MockDocument;
  let mockAppContainer: MockElement;
  let manager: FullscreenManager;

  beforeEach(() => {
    originalWindow = (globalThis as any).window;
    originalDocument = (globalThis as any).document;

    mockWindow = new MockWindow();
    mockDocument = new MockDocument();
    mockAppContainer = new MockElement('DIV', 'app-container');

    mockAppContainer.requestFullscreen = vi.fn().mockImplementation(async () => {
      mockDocument.fullscreenElement = mockAppContainer;
      mockDocument.dispatchEvent(new MockEvent('fullscreenchange'));
    });

    mockDocument.exitFullscreen = vi.fn().mockImplementation(async () => {
      mockDocument.fullscreenElement = null;
      mockDocument.dispatchEvent(new MockEvent('fullscreenchange'));
    });

    mockDocument.registerElement('app-container', mockAppContainer);

    (globalThis as any).window = mockWindow;
    (globalThis as any).document = mockDocument;

    manager = new FullscreenManager({
      target: mockAppContainer as any,
      bindKeyboardShortcut: true,
      syncViewport: false,
    });
  });

  afterEach(() => {
    manager.destroy();
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
  });

  // ==========================================================================
  // Track 1: Typematic Key-Repeat Throttling & Browser Maximize Prevention
  // ==========================================================================
  describe('Track 1: Typematic Key-Repeat Throttling', () => {
    it('CRITICAL: 100 consecutive repeat keydown events for KeyF do NOT thrash toggleFullscreen', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);

      // Initial press (repeat: false)
      const initialEvent = new MockKeyboardEvent('keydown', {
        code: 'KeyF',
        key: 'f',
        repeat: false,
      });
      mockWindow.dispatchEvent(initialEvent);
      expect(initialEvent.defaultPrevented).toBe(true);
      expect(spyToggle).toHaveBeenCalledTimes(1);

      // 100 consecutive repeating keydown events (user holding down 'F' key)
      for (let i = 0; i < 100; i++) {
        const repeatEvent = new MockKeyboardEvent('keydown', {
          code: 'KeyF',
          key: 'f',
          repeat: true,
        });
        mockWindow.dispatchEvent(repeatEvent);
        expect(repeatEvent.defaultPrevented).toBe(true);
      }

      // Must strictly remain at 1 call — zero typematic repeat thrashing
      expect(spyToggle).toHaveBeenCalledTimes(1);
    });

    it('CRITICAL: 100 consecutive repeat keydown events for F11 do NOT trigger toggleFullscreen while default F11 maximize remains prevented', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);

      // Initial F11 press (repeat: false)
      const initialEvent = new MockKeyboardEvent('keydown', {
        code: 'F11',
        key: 'F11',
        repeat: false,
      });
      mockWindow.dispatchEvent(initialEvent);
      expect(initialEvent.defaultPrevented).toBe(true);
      expect(spyToggle).toHaveBeenCalledTimes(1);

      // 100 consecutive repeating keydown events for F11
      for (let i = 0; i < 100; i++) {
        const repeatEvent = new MockKeyboardEvent('keydown', {
          code: 'F11',
          key: 'F11',
          repeat: true,
        });
        mockWindow.dispatchEvent(repeatEvent);

        // Invariant: defaultPrevented must be true on every repeat event to block browser window maximize
        expect(repeatEvent.defaultPrevented).toBe(true);
      }

      // Must strictly remain at 1 call — zero typematic repeat thrashing
      expect(spyToggle).toHaveBeenCalledTimes(1);
    });

    it('suppresses toggleFullscreen entirely if all events are repeat: true without initial press', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);

      for (let i = 0; i < 100; i++) {
        const eventF = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f', repeat: true });
        const eventF11 = new MockKeyboardEvent('keydown', { code: 'F11', key: 'F11', repeat: true });
        mockWindow.dispatchEvent(eventF);
        mockWindow.dispatchEvent(eventF11);
      }

      expect(spyToggle).not.toHaveBeenCalled();
    });

    it('allows clean toggle reactivation after key release (repeat: true followed by repeat: false)', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);

      // Hold KeyF for 10 repeats
      for (let i = 0; i < 10; i++) {
        mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f', repeat: true }));
      }
      expect(spyToggle).not.toHaveBeenCalled();

      // Release and press again (repeat: false)
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f', repeat: false }));
      expect(spyToggle).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Track 2: Modifier Key Isolation (Ctrl+F, Meta+F, Alt+F, Shift+F)
  // ==========================================================================
  describe('Track 2: Modifier Key Isolation', () => {
    it('does NOT trigger fullscreen on Ctrl+F (allows browser find-in-page)', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f', ctrlKey: true });

      mockWindow.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(spyToggle).not.toHaveBeenCalled();
    });

    it('does NOT trigger fullscreen on Meta+F / Cmd+F (allows macOS find-in-page)', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f', metaKey: true });

      mockWindow.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(spyToggle).not.toHaveBeenCalled();
    });

    it('does NOT trigger fullscreen on Alt+F (allows OS/browser menu shortcuts)', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f', altKey: true });

      mockWindow.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(spyToggle).not.toHaveBeenCalled();
    });

    it('CRITICAL: does NOT trigger fullscreen on Shift+F (allows typing capital F / game actions)', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'F', shiftKey: true });

      mockWindow.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(spyToggle).not.toHaveBeenCalled();
    });

    it('does NOT trigger fullscreen on combinatorial modifiers (Ctrl+Shift+F, Meta+Alt+F, etc.)', () => {
      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);

      const combinations: MockKeyboardEventInit[] = [
        { code: 'KeyF', key: 'F', ctrlKey: true, shiftKey: true },
        { code: 'KeyF', key: 'f', metaKey: true, altKey: true },
        { code: 'KeyF', key: 'F', altKey: true, shiftKey: true },
        { code: 'KeyF', key: 'F', ctrlKey: true, metaKey: true, altKey: true, shiftKey: true },
        { code: 'F11', key: 'F11', ctrlKey: true },
        { code: 'F11', key: 'F11', metaKey: true },
        { code: 'F11', key: 'F11', altKey: true },
        { code: 'F11', key: 'F11', shiftKey: true },
      ];

      for (const combo of combinations) {
        const event = new MockKeyboardEvent('keydown', combo);
        mockWindow.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      }

      expect(spyToggle).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Track 3: Form Input Isolation
  // ==========================================================================
  describe('Track 3: Form Input Isolation', () => {
    it('does NOT trigger fullscreen when typing "f" into an <input> element', () => {
      const inputEl = new MockElement('INPUT', 'player-name-input');
      mockDocument.activeElement = inputEl;

      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f' });

      mockWindow.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(spyToggle).not.toHaveBeenCalled();
    });

    it('does NOT trigger fullscreen when typing "f" into a <textarea> element', () => {
      const textareaEl = new MockElement('TEXTAREA', 'feedback-text');
      mockDocument.activeElement = textareaEl;

      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f' });

      mockWindow.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(spyToggle).not.toHaveBeenCalled();
    });

    it('does NOT trigger fullscreen when typing "f" into a contenteditable element', () => {
      const editableEl = new MockElement('DIV', 'rich-editor');
      editableEl.isContentEditable = true;
      mockDocument.activeElement = editableEl;

      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
      const event = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f' });

      mockWindow.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(spyToggle).not.toHaveBeenCalled();
    });

    it('resumes fullscreen shortcut when input element loses focus (blur)', () => {
      const inputEl = new MockElement('INPUT', 'player-name');
      mockDocument.activeElement = inputEl;

      const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);

      // Typing while focused -> blocked
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f' }));
      expect(spyToggle).not.toHaveBeenCalled();

      // Blur: active element reverts to document.body
      mockDocument.activeElement = mockDocument.body;

      // Typing after blur -> triggers fullscreen
      const validEvent = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'f' });
      mockWindow.dispatchEvent(validEvent);
      expect(validEvent.defaultPrevented).toBe(true);
      expect(spyToggle).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Track 4: Toggle Button State Synchronization Across External Browser Events
  // ==========================================================================
  describe('Track 4: Toggle Button State Synchronization', () => {
    it('initializes button text, aria-pressed, and aria-label in windowed state', () => {
      const btn = new MockElement('BUTTON', 'fullscreen-toggle-btn');
      const unbind = manager.bindToggleButton(btn as any);

      expect(btn.textContent).toBe('⛶');
      expect(btn.getAttribute('aria-pressed')).toBe('false');
      expect(btn.getAttribute('aria-label')).toBe('Toggle Fullscreen');
      expect(btn.classList.contains('fullscreen-active')).toBe(false);

      unbind();
    });

    it('synchronizes button state when entering fullscreen via requestFullscreen', async () => {
      const btn = new MockElement('BUTTON', 'fullscreen-toggle-btn');
      manager.bindToggleButton(btn as any);

      await manager.requestFullscreen();

      expect(btn.textContent).toBe('🗗');
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect(btn.getAttribute('aria-label')).toBe('Exit Fullscreen');
      expect(btn.classList.contains('fullscreen-active')).toBe(true);
    });

    it('CRITICAL: accurately synchronizes button state when user exits fullscreen externally (e.g. Esc key)', async () => {
      const btn = new MockElement('BUTTON', 'fullscreen-toggle-btn');
      manager.bindToggleButton(btn as any);

      // 1. Enter fullscreen
      await manager.requestFullscreen();
      expect(manager.isFullscreen()).toBe(true);
      expect(btn.textContent).toBe('🗗');
      expect(btn.getAttribute('aria-pressed')).toBe('true');

      // 2. Simulate user pressing Esc key in browser:
      // Browser exits fullscreen natively without calling manager.exitFullscreen()
      mockDocument.fullscreenElement = null;
      mockDocument.dispatchEvent(new MockEvent('fullscreenchange'));

      // Invariant check: FullscreenManager must immediately reflect windowed state
      expect(manager.isFullscreen()).toBe(false);
      expect(btn.textContent).toBe('⛶');
      expect(btn.getAttribute('aria-pressed')).toBe('false');
      expect(btn.getAttribute('aria-label')).toBe('Toggle Fullscreen');
      expect(btn.classList.contains('fullscreen-active')).toBe(false);
    });

    it('synchronizes across WebKit vendor external fullscreen exit', async () => {
      const btn = new MockElement('BUTTON', 'fullscreen-toggle-btn');
      manager.bindToggleButton(btn as any);

      // Simulate entering via WebKit vendor
      mockDocument.webkitFullscreenElement = mockAppContainer;
      mockDocument.dispatchEvent(new MockEvent('webkitfullscreenchange'));

      expect(manager.isFullscreen()).toBe(true);
      expect(btn.textContent).toBe('🗗');
      expect(btn.getAttribute('aria-pressed')).toBe('true');

      // Simulate Esc press under WebKit
      mockDocument.webkitFullscreenElement = null;
      mockDocument.dispatchEvent(new MockEvent('webkitfullscreenchange'));

      expect(manager.isFullscreen()).toBe(false);
      expect(btn.textContent).toBe('⛶');
      expect(btn.getAttribute('aria-pressed')).toBe('false');
    });

    it('synchronizes multiple bound toggle buttons simultaneously upon external Esc exit', async () => {
      const hudBtn = new MockElement('BUTTON', 'hud-fs-btn');
      const bottomBtn = new MockElement('BUTTON', 'bottom-dashboard-fs-btn');

      manager.bindToggleButton(hudBtn as any);
      manager.bindToggleButton(bottomBtn as any);

      // Enter fullscreen
      await manager.requestFullscreen();
      expect(hudBtn.textContent).toBe('🗗');
      expect(bottomBtn.textContent).toBe('🗗');
      expect(hudBtn.getAttribute('aria-pressed')).toBe('true');
      expect(bottomBtn.getAttribute('aria-pressed')).toBe('true');

      // External Esc key exit
      mockDocument.fullscreenElement = null;
      mockDocument.dispatchEvent(new MockEvent('fullscreenchange'));

      expect(hudBtn.textContent).toBe('⛶');
      expect(bottomBtn.textContent).toBe('⛶');
      expect(hudBtn.getAttribute('aria-pressed')).toBe('false');
      expect(bottomBtn.getAttribute('aria-pressed')).toBe('false');
    });

    it('stops updating button after unbind() is invoked', async () => {
      const btn = new MockElement('BUTTON', 'fs-btn');
      const unbind = manager.bindToggleButton(btn as any);

      await manager.requestFullscreen();
      expect(btn.textContent).toBe('🗗');

      // Unbind button
      unbind();

      // External exit
      mockDocument.fullscreenElement = null;
      mockDocument.dispatchEvent(new MockEvent('fullscreenchange'));

      // Unbound button retains its last assigned text without leaking callbacks
      expect(btn.textContent).toBe('🗗');
    });
  });
});
