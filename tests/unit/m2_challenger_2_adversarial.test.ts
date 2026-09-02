/**
 * Milestone 2 Screen Transform & Input Edge Case Adversarial Test Suite
 * 
 * Empirical challenger suite for:
 * 1. ScreenManager coordinate transforms under extreme geometry, letterbox pillars, NaN, negative, sub-pixel rounding.
 * 2. InputHandler multi-modal concurrency, multi-touch + keyboard interleaving, rapid fire tapping, action pulses.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScreenManager } from '../../src/core/ScreenManager';
import { InputHandler } from '../../src/ui/InputHandler';

// Mock helpers for Node.js test environment
class MockEventTarget {
  private listeners: Record<string, Set<(e: any) => void>> = {};

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
      for (const listener of set) {
        listener(event);
      }
    }
    return true;
  }
}

class MockKeyboardEvent {
  public type: string;
  public code: string;
  public key: string;
  public repeat: boolean;
  public ctrlKey: boolean = false;
  public metaKey: boolean = false;
  public altKey: boolean = false;
  public cancelable: boolean = true;
  public defaultPrevented: boolean = false;

  constructor(type: string, init: {
    code?: string;
    key?: string;
    repeat?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    cancelable?: boolean;
  } = {}) {
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

class MockPointerEvent {
  public type: string;
  public clientX: number;
  public clientY: number;
  public buttons: number;
  public pointerType: string;
  public cancelable: boolean = true;
  public defaultPrevented: boolean = false;

  constructor(type: string, init: { clientX?: number; clientY?: number; buttons?: number; pointerType?: string } = {}) {
    this.type = type;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.buttons = init.buttons ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

interface MockTouch {
  identifier: number;
  clientX: number;
  clientY: number;
}

class MockTouchEvent {
  public type: string;
  public changedTouches: MockTouch[];
  public touches: MockTouch[];
  public cancelable: boolean = true;
  public defaultPrevented: boolean = false;

  constructor(type: string, init: { changedTouches?: MockTouch[]; touches?: MockTouch[] } = {}) {
    this.type = type;
    this.changedTouches = init.changedTouches ?? [];
    this.touches = init.touches ?? [];
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

class MockEvent {
  public type: string;
  public cancelable: boolean = true;
  public defaultPrevented: boolean = false;

  constructor(type: string) {
    this.type = type;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

describe('M2 Adversarial Challenge Suite: ScreenManager & InputHandler', () => {
  describe('1. ScreenManager Transform & Coordinate Mapping Edge Cases', () => {
    let mockCanvas: HTMLCanvasElement;
    let screen: ScreenManager;

    beforeEach(() => {
      // Mock canvas with bounding rect at (left: 100, top: 50, width: 448, height: 576) (2x scale)
      mockCanvas = {
        width: 224,
        height: 288,
        style: {} as CSSStyleDeclaration,
        getContext: () => null,
        getBoundingClientRect: () => ({
          left: 100,
          top: 50,
          width: 448,
          height: 576,
          x: 100,
          y: 50,
          right: 548,
          bottom: 626,
          toJSON: () => ({}),
        }),
      } as unknown as HTMLCanvasElement;

      screen = new ScreenManager(mockCanvas, 224, 288);
    });

    it('handles extreme window aspect ratios in calculateTransform', () => {
      // Ultra-wide 32:9 (5120 x 1440)
      const ultraWide = ScreenManager.calculateTransform(5120, 1440, 224, 288);
      expect(ultraWide.displayHeight).toBe(1440);
      expect(ultraWide.displayWidth).toBe(Math.floor(1440 * (224 / 288))); // 1120
      expect(ultraWide.offsetX).toBe(Math.floor((5120 - 1120) / 2)); // 2000
      expect(ultraWide.offsetY).toBe(0);

      // Ultra-tall 1:4 (250 x 1000)
      const ultraTall = ScreenManager.calculateTransform(250, 1000, 224, 288);
      expect(ultraTall.displayWidth).toBe(250);
      expect(ultraTall.displayHeight).toBe(Math.floor(250 / (224 / 288))); // 321
      expect(ultraTall.offsetX).toBe(0);
      expect(ultraTall.offsetY).toBe(Math.floor((1000 - 321) / 2)); // 339

      // Small screen (10x10)
      const small = ScreenManager.calculateTransform(10, 10, 224, 288);
      expect(small.displayWidth).toBe(7);
      expect(small.displayHeight).toBe(10);
      expect(small.scale).toBeGreaterThan(0);

      // 1x1 Minimal boundary screen
      const minimal = ScreenManager.calculateTransform(1, 1, 224, 288);
      expect(minimal.displayWidth).toBeGreaterThanOrEqual(0);
      expect(minimal.displayHeight).toBeGreaterThanOrEqual(0);
      expect(minimal.scale).toBeGreaterThanOrEqual(0);
    });

    it('rejects coordinates outside letterbox pillars when clampToBounds=false', () => {
      // Canvas is at [100, 548] horizontally, [50, 626] vertically

      // In left pillarbox
      expect(screen.clientToVirtual(50, 300, false)).toBeNull();
      // In right pillarbox
      expect(screen.clientToVirtual(600, 300, false)).toBeNull();
      // In top letterbox
      expect(screen.clientToVirtual(300, 10, false)).toBeNull();
      // In bottom letterbox
      expect(screen.clientToVirtual(300, 700, false)).toBeNull();
      // Negative client coordinates
      expect(screen.clientToVirtual(-100, -200, false)).toBeNull();
      // Far off positive coordinates
      expect(screen.clientToVirtual(99999, 99999, false)).toBeNull();
    });

    it('clamps coordinates outside letterbox pillars when clampToBounds=true', () => {
      // Left pillarbox -> clamped to x=0
      const leftClamped = screen.clientToVirtual(50, 338, true);
      expect(leftClamped).not.toBeNull();
      expect(leftClamped!.x).toBe(0);
      expect(leftClamped!.y).toBeCloseTo(144, 1);

      // Right pillarbox -> clamped to x=224
      const rightClamped = screen.clientToVirtual(600, 338, true);
      expect(rightClamped).not.toBeNull();
      expect(rightClamped!.x).toBe(224);
      expect(rightClamped!.y).toBeCloseTo(144, 1);

      // Top letterbox -> clamped to y=0
      const topClamped = screen.clientToVirtual(324, 10, true);
      expect(topClamped).not.toBeNull();
      expect(topClamped!.x).toBeCloseTo(112, 1);
      expect(topClamped!.y).toBe(0);

      // Bottom letterbox -> clamped to y=288
      const bottomClamped = screen.clientToVirtual(324, 700, true);
      expect(bottomClamped).not.toBeNull();
      expect(bottomClamped!.x).toBeCloseTo(112, 1);
      expect(bottomClamped!.y).toBe(288);

      // Extreme negative coordinates -> clamped to (0, 0)
      const negClamped = screen.clientToVirtual(-9999, -9999, true);
      expect(negClamped).not.toBeNull();
      expect(negClamped!.x).toBe(0);
      expect(negClamped!.y).toBe(0);

      // Extreme positive coordinates -> clamped to (224, 288)
      const posClamped = screen.clientToVirtual(99999, 99999, true);
      expect(posClamped).not.toBeNull();
      expect(posClamped!.x).toBe(224);
      expect(posClamped!.y).toBe(288);
    });

    it('preserves high precision with sub-pixel and floating-point coordinates', () => {
      // Sub-pixel client coordinates
      const p1 = screen.clientToVirtual(100.25, 50.75);
      expect(p1).not.toBeNull();
      expect(p1!.x).toBeCloseTo((0.25 / 448) * 224, 5);
      expect(p1!.y).toBeCloseTo((0.75 / 576) * 288, 5);

      // Precise 4 corners
      const topLeft = screen.clientToVirtual(100, 50);
      expect(topLeft).toEqual({ x: 0, y: 0 });

      const topRight = screen.clientToVirtual(548, 50);
      expect(topRight).toEqual({ x: 224, y: 0 });

      const bottomLeft = screen.clientToVirtual(100, 626);
      expect(bottomLeft).toEqual({ x: 0, y: 288 });

      const bottomRight = screen.clientToVirtual(548, 626);
      expect(bottomRight).toEqual({ x: 224, y: 288 });
    });

    it('evaluates Infinity and NaN inputs in clientToVirtual', () => {
      // Infinity values with clampToBounds=false -> out of bounds -> returns null
      expect(screen.clientToVirtual(Infinity, 300, false)).toBeNull();
      expect(screen.clientToVirtual(-Infinity, 300, false)).toBeNull();

      // Infinity values with clampToBounds=true -> clamped
      const posInfClamped = screen.clientToVirtual(Infinity, 300, true);
      expect(posInfClamped).not.toBeNull();
      expect(posInfClamped!.x).toBe(224);

      const negInfClamped = screen.clientToVirtual(-Infinity, 300, true);
      expect(negInfClamped).not.toBeNull();
      expect(negInfClamped!.x).toBe(0);

      // NaN coordinates
      const nanResult = screen.clientToVirtual(NaN, NaN, false);
      if (nanResult !== null) {
        expect(Number.isNaN(nanResult.x)).toBe(true);
        expect(Number.isNaN(nanResult.y)).toBe(true);
      }
    });

    it('guarantees bidirectional bijection: virtualToClient(clientToVirtual(p)) == p', () => {
      // Test 100 sample points inside virtual space
      for (let vx = 0; vx <= 224; vx += 24.5) {
        for (let vy = 0; vy <= 288; vy += 31.5) {
          const client = screen.virtualToClient(vx, vy);
          expect(client).not.toBeNull();

          const roundTrip = screen.clientToVirtual(client!.x, client!.y);
          expect(roundTrip).not.toBeNull();
          expect(roundTrip!.x).toBeCloseTo(vx, 4);
          expect(roundTrip!.y).toBeCloseTo(vy, 4);
        }
      }
    });

    it('returns null safely when canvas is uninitialized or has zero dimensions', () => {
      const emptyScreen = new ScreenManager({ virtualWidth: 224, virtualHeight: 288 });
      expect(emptyScreen.clientToVirtual(100, 100)).toBeNull();
      expect(emptyScreen.virtualToClient(100, 100)).toBeNull();

      const zeroCanvas = {
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          right: 0,
          bottom: 0,
          toJSON: () => ({}),
        }),
      } as unknown as HTMLCanvasElement;
      const zeroScreen = new ScreenManager(zeroCanvas, 224, 288);
      expect(zeroScreen.clientToVirtual(50, 50)).toBeNull();
      expect(zeroScreen.virtualToClient(50, 50)).toBeNull();
    });

    it('handles fractional sub-pixel canvas offsets correctly', () => {
      const subPixelCanvas = {
        width: 224,
        height: 288,
        style: {} as CSSStyleDeclaration,
        getContext: () => null,
        getBoundingClientRect: () => ({
          left: 12.345,
          top: 67.89,
          width: 448.5,
          height: 576.5,
          x: 12.345,
          y: 67.89,
          right: 460.845,
          bottom: 644.39,
          toJSON: () => ({}),
        }),
      } as unknown as HTMLCanvasElement;

      const subPixelScreen = new ScreenManager(subPixelCanvas, 224, 288);
      const vPoint = subPixelScreen.clientToVirtual(12.345 + 224.25, 67.89 + 288.25);
      expect(vPoint).not.toBeNull();
      expect(vPoint!.x).toBeCloseTo(112, 1);
      expect(vPoint!.y).toBeCloseTo(144, 1);
    });
  });

  describe('2. InputHandler Concurrency, Multi-Touch & Rapid-Fire Edge Cases', () => {
    let mockCanvas: HTMLCanvasElement;
    let mockWindow: MockEventTarget & { innerWidth: number; innerHeight: number };
    let mockDocument: MockEventTarget & { hidden: boolean; getElementById: (id: string) => any };
    let mockBtnLeft: MockEventTarget & { classList: { add: any; remove: any } };
    let mockBtnRight: MockEventTarget & { classList: { add: any; remove: any } };
    let mockBtnFire: MockEventTarget & { classList: { add: any; remove: any } };
    let screenManager: ScreenManager;
    let handler: InputHandler;

    beforeEach(() => {
      mockBtnLeft = Object.assign(new MockEventTarget(), {
        classList: { add: vi.fn(), remove: vi.fn() },
      });
      mockBtnRight = Object.assign(new MockEventTarget(), {
        classList: { add: vi.fn(), remove: vi.fn() },
      });
      mockBtnFire = Object.assign(new MockEventTarget(), {
        classList: { add: vi.fn(), remove: vi.fn() },
      });

      mockWindow = Object.assign(new MockEventTarget(), {
        innerWidth: 375,
        innerHeight: 667,
      });
      mockDocument = Object.assign(new MockEventTarget(), {
        hidden: false,
        getElementById: (id: string) => {
          if (id === 'btn-left') return mockBtnLeft;
          if (id === 'btn-right') return mockBtnRight;
          if (id === 'btn-fire') return mockBtnFire;
          return null;
        },
      });

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('document', mockDocument);
      vi.stubGlobal('KeyboardEvent', MockKeyboardEvent);
      vi.stubGlobal('PointerEvent', MockPointerEvent);
      vi.stubGlobal('TouchEvent', MockTouchEvent);
      vi.stubGlobal('Event', MockEvent);

      const canvasTarget = new MockEventTarget();
      mockCanvas = Object.assign(canvasTarget, {
        width: 375,
        height: 667,
        style: {} as CSSStyleDeclaration,
        getContext: () => null,
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 375,
          height: 667,
          x: 0,
          y: 0,
          right: 375,
          bottom: 667,
          toJSON: () => ({}),
        }),
      }) as unknown as HTMLCanvasElement;

      screenManager = new ScreenManager(mockCanvas, 224, 288);
      handler = new InputHandler(mockCanvas, screenManager);
    });

    afterEach(() => {
      handler.destroy();
      vi.unstubAllGlobals();
    });

    it('correctly handles simultaneous keyboard and multi-touch steering conflicts', () => {
      // Step 1: User holds keyboard ArrowLeft
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' }) as unknown as Event);
      expect(handler.getState().moveLeft).toBe(true);
      expect(handler.getState().moveRight).toBe(false);

      // Step 2: User simultaneously taps DOM button Right (#btn-right)
      mockBtnRight.dispatchEvent(new MockEvent('touchstart') as unknown as Event);
      expect(handler.getState().moveLeft).toBe(true);
      expect(handler.getState().moveRight).toBe(true);
      expect(handler.getState().touchRight).toBe(true);

      // Step 3: User releases DOM button Right
      mockBtnRight.dispatchEvent(new MockEvent('touchend') as unknown as Event);
      expect(handler.getState().touchRight).toBe(false);
      expect(handler.getState().moveRight).toBe(false);
      // Key ArrowLeft is still depressed -> moveLeft MUST stay true!
      expect(handler.getState().moveLeft).toBe(true);

      // Step 4: User releases ArrowLeft
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft' }) as unknown as Event);
      expect(handler.getState().moveLeft).toBe(false);
    });

    it('correctly handles simultaneous multi-touch steering (touch 1) and firing (touch 2)', () => {
      // Touch 1 starts in steering area (left side: X = 50, Y = 300)
      const touch1: MockTouch = { identifier: 101, clientX: 50, clientY: 300 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [touch1] }) as unknown as Event);

      expect(handler.getState().touchLeft).toBe(true);
      expect(handler.getState().moveLeft).toBe(true);
      expect(handler.getState().fire).toBe(false);

      // Touch 2 starts in fire area (bottom-right: X = 300, Y = 500)
      const touch2: MockTouch = { identifier: 102, clientX: 300, clientY: 500 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [touch2] }) as unknown as Event);

      expect(handler.getState().touchFire).toBe(true);
      expect(handler.getState().fire).toBe(true);
      expect(handler.consumeAction('fire')).toBe(true);
      expect(handler.getState().touchLeft).toBe(true);
      expect(handler.getState().moveLeft).toBe(true);

      // Touch 1 moves to center deadzone (X = 187.5)
      const touch1Moved: MockTouch = { identifier: 101, clientX: 187.5, clientY: 300 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchmove', { changedTouches: [touch1Moved] }) as unknown as Event);

      expect(handler.getState().touchLeft).toBe(false);
      expect(handler.getState().touchRight).toBe(false);
      expect(handler.getState().moveLeft).toBe(false);
      // Fire touch 2 must remain undisturbed
      expect(handler.getState().touchFire).toBe(true);
      expect(handler.getState().fire).toBe(true);

      // Touch 1 moves to right side (X = 350)
      const touch1Right: MockTouch = { identifier: 101, clientX: 350, clientY: 300 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchmove', { changedTouches: [touch1Right] }) as unknown as Event);

      expect(handler.getState().touchRight).toBe(true);
      expect(handler.getState().moveRight).toBe(true);

      // Touch 2 released (touchend)
      mockCanvas.dispatchEvent(new MockTouchEvent('touchend', { changedTouches: [touch2] }) as unknown as Event);
      expect(handler.getState().touchFire).toBe(false);
      expect(handler.getState().fire).toBe(false);
      expect(handler.getState().touchRight).toBe(true);
      expect(handler.getState().moveRight).toBe(true);

      // Touch 1 cancelled (touchcancel)
      mockCanvas.dispatchEvent(new MockTouchEvent('touchcancel', { changedTouches: [touch1Right] }) as unknown as Event);
      expect(handler.getState().touchRight).toBe(false);
      expect(handler.getState().moveRight).toBe(false);
    });

    it('maintains fire state when keyboard Space and Touch Fire overlap', () => {
      // Touch fire active
      const touchFire: MockTouch = { identifier: 201, clientX: 300, clientY: 500 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [touchFire] }) as unknown as Event);
      expect(handler.getState().fire).toBe(true);
      expect(handler.consumeAction('fire')).toBe(true);

      // Keyboard Space down while touch is active
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }) as unknown as Event);
      expect(handler.getState().fire).toBe(true);
      expect(handler.consumeAction('fire')).toBe(true);

      // Touch released, but keyboard still pressed
      mockCanvas.dispatchEvent(new MockTouchEvent('touchend', { changedTouches: [touchFire] }) as unknown as Event);
      expect(handler.getState().touchFire).toBe(false);
      // Fire MUST remain true because keyboard Space is still held
      expect(handler.getState().fire).toBe(true);

      // Keyboard released
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Space', key: ' ' }) as unknown as Event);
      expect(handler.getState().fire).toBe(false);
    });

    it('survives 1000 rapid fire keystroke pulses without dropping triggers or getting stuck', () => {
      let consumedPulses = 0;

      for (let i = 0; i < 1000; i++) {
        // Press
        mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }) as unknown as Event);
        expect(handler.getState().fire).toBe(true);

        if (handler.consumeAction('fire')) {
          consumedPulses++;
        }

        // Release
        mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Space', key: ' ' }) as unknown as Event);
        expect(handler.getState().fire).toBe(false);
      }

      expect(consumedPulses).toBe(1000);
      expect(handler.getState().fire).toBe(false);
      expect(handler.consumeAction('fire')).toBe(false);
    });

    it('does not trigger duplicate action consumption on key repeat (e.repeat = true)', () => {
      // First keydown (initial press)
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: false }) as unknown as Event);
      expect(handler.consumeAction('fire')).toBe(true);

      // Subsequent keydown events with repeat: true
      for (let i = 0; i < 10; i++) {
        mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true }) as unknown as Event);
        expect(handler.getState().fire).toBe(true);
        // Repeat events MUST NOT generate new action pulses
        expect(handler.consumeAction('fire')).toBe(false);
      }

      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Space', key: ' ' }) as unknown as Event);
      expect(handler.getState().fire).toBe(false);
    });

    it('consumes pause and restart actions exactly once per trigger', () => {
      // Pause key 'KeyP'
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyP', key: 'p' }) as unknown as Event);
      expect(handler.getState().pause).toBe(true);
      expect(handler.consumeAction('pause')).toBe(true);
      expect(handler.consumeAction('pause')).toBe(false);
      expect(handler.consumeAction('pause')).toBe(false);

      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyP', key: 'p' }) as unknown as Event);
      expect(handler.getState().pause).toBe(false);

      // Restart key 'Enter'
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }) as unknown as Event);
      expect(handler.getState().restart).toBe(true);
      expect(handler.consumeAction('restart')).toBe(true);
      expect(handler.consumeAction('restart')).toBe(false);

      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Enter', key: 'Enter' }) as unknown as Event);
      expect(handler.getState().restart).toBe(false);

      // Invalid action consumption
      expect(handler.consumeAction('invalid' as any)).toBe(false);
    });

    it('clears all active states, touches, and DOM classes on window blur and tab hide', () => {
      // Put handler into dirty state
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' }) as unknown as Event);
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }) as unknown as Event);
      mockBtnLeft.dispatchEvent(new MockEvent('touchstart') as unknown as Event);

      expect(handler.getState().moveLeft).toBe(true);
      expect(handler.getState().fire).toBe(true);

      // Window blur
      mockWindow.dispatchEvent(new MockEvent('blur') as unknown as Event);

      expect(handler.getState().moveLeft).toBe(false);
      expect(handler.getState().moveRight).toBe(false);
      expect(handler.getState().fire).toBe(false);
      expect(handler.getState().touchLeft).toBe(false);
      expect(handler.consumeAction('fire')).toBe(false);

      // Put into dirty state again
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }) as unknown as Event);
      expect(handler.getState().moveRight).toBe(true);

      // Document hidden
      mockDocument.hidden = true;
      mockDocument.dispatchEvent(new MockEvent('visibilitychange') as unknown as Event);

      expect(handler.getState().moveRight).toBe(false);
    });

    it('selectively calls preventDefault on game keys but spares system hotkeys', () => {
      // Normal game key Space -> preventDefault called
      const spaceEvent = new MockKeyboardEvent('keydown', { code: 'Space', key: ' ', cancelable: true });
      mockWindow.dispatchEvent(spaceEvent as unknown as Event);
      expect(spaceEvent.defaultPrevented).toBe(true);

      // ArrowRight -> preventDefault called
      const arrowEvent = new MockKeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', cancelable: true });
      mockWindow.dispatchEvent(arrowEvent as unknown as Event);
      expect(arrowEvent.defaultPrevented).toBe(true);

      // Ctrl+R (reload shortcut) -> preventDefault NOT called
      const ctrlREvent = new MockKeyboardEvent('keydown', { code: 'KeyR', key: 'r', ctrlKey: true, cancelable: true });
      mockWindow.dispatchEvent(ctrlREvent as unknown as Event);
      expect(ctrlREvent.defaultPrevented).toBe(false);

      // Cmd+KeyP (print shortcut) -> preventDefault NOT called
      const cmdPEvent = new MockKeyboardEvent('keydown', { code: 'KeyP', key: 'p', metaKey: true, cancelable: true });
      mockWindow.dispatchEvent(cmdPEvent as unknown as Event);
      expect(cmdPEvent.defaultPrevented).toBe(false);

      // Non-game key (KeyT) -> preventDefault NOT called
      const tEvent = new MockKeyboardEvent('keydown', { code: 'KeyT', key: 't', cancelable: true });
      mockWindow.dispatchEvent(tEvent as unknown as Event);
      expect(tEvent.defaultPrevented).toBe(false);
    });

    it('clamps pointerX within the playable bounds [8, 216]', () => {
      // Pointer down at far left (X = 0) -> clamped to 8
      mockCanvas.dispatchEvent(new MockPointerEvent('pointerdown', { clientX: 0, clientY: 100 }) as unknown as Event);
      expect(handler.getState().pointerX).toBe(8);
      expect(handler.getState().pointerActive).toBe(true);

      // Pointer move to far right (X = 375) -> clamped to 216
      mockCanvas.dispatchEvent(new MockPointerEvent('pointermove', { clientX: 375, clientY: 100, buttons: 1 }) as unknown as Event);
      expect(handler.getState().pointerX).toBe(216);

      // Pointer move to center
      mockCanvas.dispatchEvent(new MockPointerEvent('pointermove', { clientX: 187.5, clientY: 100, buttons: 1 }) as unknown as Event);
      expect(handler.getState().pointerX).toBeCloseTo(112, 1);

      // Pointer leave
      mockCanvas.dispatchEvent(new MockPointerEvent('pointerleave', {}) as unknown as Event);
      expect(handler.getState().pointerActive).toBe(false);
    });
  });
});
