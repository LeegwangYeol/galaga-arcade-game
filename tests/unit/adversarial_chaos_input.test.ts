/**
 * Galaga Arcade Web Game — Milestone M36 Phase 7
 * Adversarial QA Chaos Test Suite: Input Handling & Multi-Touch Concurrency
 * 
 * Focus Areas:
 * 1. 5+ simultaneous touch points arriving in random order and rapid succession across P1 & P2 screen halves.
 * 2. Simultaneous opposite inputs (e.g. Left + Right keys pressed simultaneously on P1 or P2).
 * 3. Window blur / focus loss / visibilitychange events while firing buttons and directional keys are held down.
 * 4. Rapid touchcancel and touchmove off the canvas boundaries (including NaN and extreme coords).
 * 5. Keyboard ghosting and simultaneous WASD + Arrow keys + Space + Enter + X + / keys in a single tick,
 *    plus Co-op Special Move / Phase Warp / Donate Life multiplexing collisions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { InputHandler } from '../../src/ui/InputHandler';
import { Player } from '../../src/entities/Player';
import { ScreenManager } from '../../src/core/ScreenManager';
import { AudioContextManager } from '../../src/audio/AudioContextManager';

// ============================================================================
// Mock DOM Infrastructure
// ============================================================================

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

class MockEvent {
  public type: string;
  public cancelable: boolean;
  public defaultPrevented = false;

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

class MockKeyboardEvent extends MockEvent {
  public code: string;
  public key: string;
  public repeat: boolean;
  public ctrlKey: boolean;
  public metaKey: boolean;
  public altKey: boolean;

  constructor(
    type: string,
    init: {
      code?: string;
      key?: string;
      repeat?: boolean;
      cancelable?: boolean;
      ctrlKey?: boolean;
      metaKey?: boolean;
      altKey?: boolean;
    } = {}
  ) {
    super(type, init);
    this.code = init.code ?? '';
    this.key = init.key ?? '';
    this.repeat = init.repeat ?? false;
    this.ctrlKey = init.ctrlKey ?? false;
    this.metaKey = init.metaKey ?? false;
    this.altKey = init.altKey ?? false;
  }
}

interface MockTouch {
  identifier: number;
  clientX: number;
  clientY: number;
}

class MockTouchEvent extends MockEvent {
  public changedTouches: MockTouch[];
  public touches: MockTouch[];

  constructor(
    type: string,
    init: { changedTouches?: MockTouch[]; touches?: MockTouch[]; cancelable?: boolean } = {}
  ) {
    super(type, init);
    this.changedTouches = init.changedTouches ?? [];
    this.touches = init.touches ?? [];
  }
}

class MockPointerEvent extends MockEvent {
  public pointerId: number;
  public pointerType: string;
  public clientX: number;
  public clientY: number;
  public buttons: number;

  constructor(
    type: string,
    init: {
      pointerId?: number;
      pointerType?: string;
      clientX?: number;
      clientY?: number;
      buttons?: number;
      cancelable?: boolean;
    } = {}
  ) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.buttons = init.buttons ?? 0;
  }
}

describe('Milestone M36: Adversarial Chaos Input & Multi-Touch Stress Suite', () => {
  let mockWindow: MockEventTarget;
  let mockDocument: any;
  let mockCanvas: HTMLCanvasElement;
  let screenManager: ScreenManager;
  let handler: InputHandler;

  beforeEach(() => {
    mockWindow = new MockEventTarget();

    const canvasTarget = new MockEventTarget();
    mockCanvas = Object.assign(canvasTarget, {
      id: 'game-canvas',
      width: 375,
      height: 667,
      style: {} as CSSStyleDeclaration,
      getContext: () => ({
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        beginPath: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        fillText: vi.fn(),
        setLineDash: vi.fn(),
        imageSmoothingEnabled: false,
      }),
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

    mockDocument = Object.assign(new MockEventTarget(), {
      hidden: false,
      createElement: () => mockCanvas,
      getElementById: (id: string) => (id === 'game-canvas' ? mockCanvas : null),
    });

    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('document', mockDocument);
    vi.stubGlobal('Event', MockEvent);
    vi.stubGlobal('KeyboardEvent', MockKeyboardEvent);
    vi.stubGlobal('TouchEvent', MockTouchEvent);
    vi.stubGlobal('PointerEvent', MockPointerEvent);

    screenManager = new ScreenManager(mockCanvas, 224, 288);
    handler = new InputHandler(mockCanvas, screenManager);
  });

  afterEach(() => {
    handler.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Suite 1: 5+ Simultaneous Touch Points in Random Order & Rapid Succession
  // ==========================================================================
  describe('Suite 1: 5+ Simultaneous Touch Points Concurrency & Session Isolation', () => {
    beforeEach(() => {
      handler.setMode('coop');
    });

    it('TC-CHAOS-01: 6+ simultaneous touch points across P1 and P2 allocate cleanly to touchSessions', () => {
      // P1 zone is [0, 187.5), P2 zone is [187.5, 375].
      // In P1: steer is [0, 121.875), action is [121.875, 187.5)
      // In P2: steer is [187.5, 309.375), action is [309.375, 375]
      const t1: MockTouch = { identifier: 1, clientX: 50, clientY: 400 };  // P1 steer
      const t2: MockTouch = { identifier: 2, clientX: 150, clientY: 500 }; // P1 fire (clientY >= 366.85)
      const t3: MockTouch = { identifier: 3, clientX: 150, clientY: 200 }; // P1 special (clientY < 366.85)
      const t4: MockTouch = { identifier: 4, clientX: 250, clientY: 400 }; // P2 steer
      const t5: MockTouch = { identifier: 5, clientX: 350, clientY: 500 }; // P2 fire
      const t6: MockTouch = { identifier: 6, clientX: 350, clientY: 200 }; // P2 special

      // Dispatch all 6 in a single event
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [t1, t2, t3, t4, t5, t6] }) as unknown as Event);

      const dual = handler.getDualInputState();
      expect(dual.p1.fire).toBe(true);
      expect(dual.p2.fire).toBe(true);
      expect(handler.consumeAction('special', 'p1')).toBe(true);
      expect(handler.consumeAction('special', 'p2')).toBe(true);

      // Verify sessions exist in private map via any cast
      const sessions = (handler as any).touchSessions as Map<number, any>;
      expect(sessions.size).toBe(6);
      expect(sessions.get(1)?.role).toBe('steer');
      expect(sessions.get(2)?.role).toBe('fire');
      expect(sessions.get(3)?.role).toBe('special');
      expect(sessions.get(4)?.role).toBe('steer');
      expect(sessions.get(5)?.role).toBe('fire');
      expect(sessions.get(6)?.role).toBe('special');
    });

    it('TC-CHAOS-02: Rapid out-of-order touch arrival, movement, and release leaves zero orphaned sessions', () => {
      const t1: MockTouch = { identifier: 10, clientX: 60, clientY: 300 };
      const t2: MockTouch = { identifier: 20, clientX: 140, clientY: 500 };
      const t3: MockTouch = { identifier: 30, clientX: 240, clientY: 300 };
      const t4: MockTouch = { identifier: 40, clientX: 340, clientY: 500 };
      const t5: MockTouch = { identifier: 50, clientX: 80, clientY: 450 };

      // Arrive in staggered sequence
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [t3, t1] }) as unknown as Event);
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [t5] }) as unknown as Event);
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [t4, t2] }) as unknown as Event);

      const sessions = (handler as any).touchSessions as Map<number, any>;
      expect(sessions.size).toBe(5);

      // Rapid movement in scrambled order
      mockCanvas.dispatchEvent(
        new MockTouchEvent('touchmove', {
          changedTouches: [
            { identifier: 10, clientX: 20, clientY: 300 },
            { identifier: 30, clientX: 280, clientY: 300 },
          ],
        }) as unknown as Event
      );

      expect(handler.getInputState('p1').moveLeft).toBe(true);
      expect(handler.getInputState('p2').moveRight).toBe(true);

      // Release in non-chronological order: [20, 50, 10, 40, 30]
      mockCanvas.dispatchEvent(new MockTouchEvent('touchend', { changedTouches: [t2] }) as unknown as Event);
      expect(sessions.size).toBe(4);
      mockCanvas.dispatchEvent(new MockTouchEvent('touchend', { changedTouches: [t5, t1] }) as unknown as Event);
      expect(sessions.size).toBe(2);
      mockCanvas.dispatchEvent(new MockTouchEvent('touchend', { changedTouches: [t4, t3] }) as unknown as Event);
      expect(sessions.size).toBe(0);

      // All states must be cleanly neutral
      const p1 = handler.getInputState('p1');
      const p2 = handler.getInputState('p2');
      expect(p1.moveLeft).toBe(false);
      expect(p1.moveRight).toBe(false);
      expect(p1.fire).toBe(false);
      expect(p2.moveLeft).toBe(false);
      expect(p2.moveRight).toBe(false);
      expect(p2.fire).toBe(false);
    });

    it('TC-CHAOS-03: Defensive Regression — Duplicate steer fingers: lifting one finger keeps player moving while other steer finger remains active', () => {
      // Finger 1 touches steer zone for P1 at X = 60
      const finger1: MockTouch = { identifier: 101, clientX: 60, clientY: 300 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [finger1] }) as unknown as Event);

      // Finger 1 drags left to X = 20 (delta = -40, steers left)
      mockCanvas.dispatchEvent(
        new MockTouchEvent('touchmove', { changedTouches: [{ identifier: 101, clientX: 20, clientY: 300 }] }) as unknown as Event
      );
      expect(handler.getInputState('p1').moveLeft).toBe(true);

      // Finger 2 touches steer zone for P1 at X = 80
      const finger2: MockTouch = { identifier: 102, clientX: 80, clientY: 300 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [finger2] }) as unknown as Event);

      // Finger 2 lifts up (touchend)
      mockCanvas.dispatchEvent(new MockTouchEvent('touchend', { changedTouches: [finger2] }) as unknown as Event);

      const p1State = handler.getInputState('p1');
      const sessions = (handler as any).touchSessions as Map<number, any>;
      expect(sessions.has(101)).toBe(true); // Finger 1 is still active
      // Defensive regression check: P1's movement remains active because Finger 1 is still steering
      expect(p1State.moveLeft).toBe(true);
    });

    it('TC-CHAOS-04: Defensive Regression — Duplicate fire fingers: lifting one fire finger keeps firing enabled while another finger is held down', () => {
      // Finger A touches fire zone for P1 (X = 150, Y = 500)
      const fingerA: MockTouch = { identifier: 201, clientX: 150, clientY: 500 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [fingerA] }) as unknown as Event);
      expect(handler.getInputState('p1').fire).toBe(true);

      // Finger B also touches fire zone for P1 (X = 160, Y = 520)
      const fingerB: MockTouch = { identifier: 202, clientX: 160, clientY: 520 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [fingerB] }) as unknown as Event);
      expect(handler.getInputState('p1').fire).toBe(true);

      // Finger B is lifted while Finger A is still pressing down
      mockCanvas.dispatchEvent(new MockTouchEvent('touchend', { changedTouches: [fingerB] }) as unknown as Event);

      const sessions = (handler as any).touchSessions as Map<number, any>;
      expect(sessions.has(201)).toBe(true); // Finger A still active
      // Defensive regression check: Fire remains enabled because Finger A is still held
      expect(handler.getInputState('p1').fire).toBe(true);
    });
  });

  // ==========================================================================
  // Suite 2: Simultaneous Opposite Inputs & Kinematic Invariants
  // ==========================================================================
  describe('Suite 2: Simultaneous Opposite Inputs & Kinematic Drift', () => {
    beforeEach(() => {
      handler.setMode('coop');
    });

    it('TC-CHAOS-05: P1 Left + Right simultaneous keys produce zero kinematic drift on Player entity', () => {
      const p1 = new Player({ id: 'p1', x: 80, y: 250, lives: 3 });
      const initialX = p1.x;

      // Both KeyA and KeyD pressed simultaneously
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyD', key: 'd' }));

      const p1Input = handler.getInputState('p1');
      expect(p1Input.moveLeft).toBe(true);
      expect(p1Input.moveRight).toBe(true);

      // Simulate 60 frames (1 second) of simultaneous opposite inputs
      for (let i = 0; i < 60; i++) {
        p1.update(0.0166, p1Input);
      }

      // X must not have drifted by even a single subpixel
      expect(p1.x).toBe(initialX);
      expect(p1.vx).toBe(0);
    });

    it('TC-CHAOS-06: P2 Left + Right simultaneous keys produce zero kinematic drift on Player entity', () => {
      const p2 = new Player({ id: 'p2', x: 144, y: 250, lives: 3 });
      const initialX = p2.x;

      // Both ArrowLeft and ArrowRight pressed simultaneously
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }));

      const p2Input = handler.getInputState('p2');
      expect(p2Input.moveLeft).toBe(true);
      expect(p2Input.moveRight).toBe(true);

      for (let i = 0; i < 60; i++) {
        p2.update(0.0166, p2Input);
      }

      expect(p2.x).toBe(initialX);
      expect(p2.vx).toBe(0);
    });

    it('TC-CHAOS-07: Key rollover resolution when one opposite key is released', () => {
      const p1 = new Player({ id: 'p1', x: 80, y: 250, lives: 3 });

      // P1 presses KeyA (moveLeft)
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      p1.update(0.1, handler.getInputState('p1'));
      expect(p1.x).toBeLessThan(80);
      const stoppedX = p1.x;

      // P1 presses KeyD while still holding KeyA -> Opposites cancel
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyD', key: 'd' }));
      p1.update(0.1, handler.getInputState('p1'));
      expect(p1.x).toBe(stoppedX);

      // P1 releases KeyA while continuing to hold KeyD -> Resumes moving Right
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyA', key: 'a' }));
      p1.update(0.1, handler.getInputState('p1'));
      expect(p1.x).toBeGreaterThan(stoppedX);
    });

    it('TC-CHAOS-08: 60Hz rapid direction flapping (alternating opposite edges) maintains stable bounds', () => {
      const p1 = new Player({ id: 'p1', x: 80, y: 250, lives: 3 });

      for (let frame = 0; frame < 120; frame++) {
        if (frame % 2 === 0) {
          mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
          mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyD', key: 'd' }));
        } else {
          mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyD', key: 'd' }));
          mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyA', key: 'a' }));
        }
        p1.update(0.0166, handler.getInputState('p1'));
      }

      // Ship must remain strictly within canonical boundaries [12, 212]
      expect(p1.x).toBeGreaterThanOrEqual(12);
      expect(p1.x).toBeLessThanOrEqual(212);
      expect(Number.isFinite(p1.x)).toBe(true);
    });
  });

  // ==========================================================================
  // Suite 3: Window Blur, Focus Loss & VisibilityChange Invariants
  // ==========================================================================
  describe('Suite 3: Window Blur, Focus Loss & VisibilityChange Clean Release', () => {
    beforeEach(() => {
      handler.setMode('coop');
    });

    it('TC-CHAOS-09: Window blur cleanly releases all directional keys and firing states on both players', () => {
      // P1 holds KeyA, KeyW, Space
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyW', key: 'w' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }));

      // P2 holds ArrowRight, ArrowDown, Enter
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowDown', key: 'ArrowDown' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }));

      expect(handler.getInputState('p1').moveLeft).toBe(true);
      expect(handler.getInputState('p1').moveUp).toBe(true);
      expect(handler.getInputState('p1').fire).toBe(true);

      expect(handler.getInputState('p2').moveRight).toBe(true);
      expect(handler.getInputState('p2').moveDown).toBe(true);
      expect(handler.getInputState('p2').fire).toBe(true);

      // Window blur triggers
      mockWindow.dispatchEvent(new MockEvent('blur'));

      // Verify ALL states cleanly released (NO STUCK KEYS)
      const p1 = handler.getInputState('p1');
      const p2 = handler.getInputState('p2');

      expect(p1.moveLeft).toBe(false);
      expect(p1.moveRight).toBe(false);
      expect(p1.moveUp).toBe(false);
      expect(p1.moveDown).toBe(false);
      expect(p1.fire).toBe(false);

      expect(p2.moveLeft).toBe(false);
      expect(p2.moveRight).toBe(false);
      expect(p2.moveUp).toBe(false);
      expect(p2.moveDown).toBe(false);
      expect(p2.fire).toBe(false);

      expect(handler.consumeAction('fire', 'p1')).toBe(false);
      expect(handler.consumeAction('fire', 'p2')).toBe(false);
      expect((handler as any).activeKeys.size).toBe(0);
    });

    it('TC-CHAOS-10: VisibilityChange (tab hidden) resets inputs and suspends audio without state leaks', () => {
      const suspendSpy = vi.spyOn(AudioContextManager, 'suspend').mockImplementation(vi.fn());
      const resumeSpy = vi.spyOn(AudioContextManager, 'resume').mockImplementation(vi.fn());

      // P1 firing
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      expect(handler.getInputState('p1').fire).toBe(true);

      // Tab hidden
      mockDocument.hidden = true;
      mockDocument.dispatchEvent(new MockEvent('visibilitychange'));

      expect(handler.getInputState('p1').fire).toBe(false);
      expect(suspendSpy).toHaveBeenCalled();

      // Tab visible again
      mockDocument.hidden = false;
      mockDocument.dispatchEvent(new MockEvent('visibilitychange'));

      expect(resumeSpy).toHaveBeenCalled();
      // Input must NOT spontaneously re-enable
      expect(handler.getInputState('p1').fire).toBe(false);
    });

    it('TC-CHAOS-11: KeyUp event received after blur does not invert or corrupt state', () => {
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      expect(handler.getInputState('p1').moveLeft).toBe(true);

      // Blur clears state
      mockWindow.dispatchEvent(new MockEvent('blur'));
      expect(handler.getInputState('p1').moveLeft).toBe(false);

      // KeyUp received after blur
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyA', key: 'a' }));
      expect(handler.getInputState('p1').moveLeft).toBe(false);
      expect((handler as any).activeKeys.size).toBe(0);
    });

    it('TC-CHAOS-12: Touch sessions and pointerActive during window blur are fully cleared', () => {
      const t1: MockTouch = { identifier: 301, clientX: 50, clientY: 400 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [t1] }) as unknown as Event);

      expect((handler as any).touchSessions.size).toBe(1);

      mockWindow.dispatchEvent(new MockEvent('blur'));

      expect((handler as any).touchSessions.size).toBe(0);
      expect(handler.getInputState('p1').touchLeft).toBe(false);
      expect(handler.getInputState('p1').moveLeft).toBe(false);
    });
  });

  // ==========================================================================
  // Suite 4: Rapid TouchCancel & Boundary Drift Anomaly
  // ==========================================================================
  describe('Suite 4: Rapid TouchCancel and Off-Canvas Boundary Stress', () => {
    beforeEach(() => {
      handler.setMode('coop');
    });

    it('TC-CHAOS-13: Touch dragging off-screen to extreme negative and positive coordinates clamps gracefully', () => {
      const t1: MockTouch = { identifier: 401, clientX: 50, clientY: 400 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [t1] }) as unknown as Event);

      // Rapidly fling finger far outside viewport
      mockCanvas.dispatchEvent(
        new MockTouchEvent('touchmove', { changedTouches: [{ identifier: 401, clientX: -9999, clientY: -5000 }] }) as unknown as Event
      );
      expect(handler.getInputState('p1').moveLeft).toBe(true);
      expect(handler.getInputState('p1').moveRight).toBe(false);

      mockCanvas.dispatchEvent(
        new MockTouchEvent('touchmove', { changedTouches: [{ identifier: 401, clientX: 99999, clientY: 50000 }] }) as unknown as Event
      );
      expect(handler.getInputState('p1').moveRight).toBe(true);
      expect(handler.getInputState('p1').moveLeft).toBe(false);

      // Clean release
      mockCanvas.dispatchEvent(new MockTouchEvent('touchend', { changedTouches: [t1] }) as unknown as Event);
      expect(handler.getInputState('p1').moveRight).toBe(false);
    });

    it('TC-CHAOS-14: TouchCancel event removes active sessions identical to TouchEnd', () => {
      const t1: MockTouch = { identifier: 501, clientX: 50, clientY: 400 };
      const t2: MockTouch = { identifier: 502, clientX: 150, clientY: 500 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [t1, t2] }) as unknown as Event);

      expect((handler as any).touchSessions.size).toBe(2);
      expect(handler.getInputState('p1').fire).toBe(true);

      // OS cancels touches (e.g. incoming phone call or gesture system swipe)
      mockCanvas.dispatchEvent(new MockTouchEvent('touchcancel', { changedTouches: [t1, t2] }) as unknown as Event);

      expect((handler as any).touchSessions.size).toBe(0);
      expect(handler.getInputState('p1').fire).toBe(false);
      expect(handler.getInputState('p1').moveLeft).toBe(false);
    });

    it('TC-CHAOS-15: TouchCancel with unknown identifier does not crash and leaves valid sessions intact', () => {
      const validTouch: MockTouch = { identifier: 601, clientX: 50, clientY: 400 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [validTouch] }) as unknown as Event);

      // TouchCancel with unknown ID 9999
      const rogueTouch: MockTouch = { identifier: 9999, clientX: 0, clientY: 0 };
      expect(() => {
        mockCanvas.dispatchEvent(new MockTouchEvent('touchcancel', { changedTouches: [rogueTouch] }) as unknown as Event);
      }).not.toThrow();

      // Valid session 601 is still preserved
      expect((handler as any).touchSessions.size).toBe(1);
    });

    it('TC-CHAOS-16: Defensive Regression — NaN coordinate touchmove does not propagate NaN to renderTouchGuides', () => {
      const t1: MockTouch = { identifier: 701, clientX: 50, clientY: 400 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [t1] }) as unknown as Event);

      // Corrupted event dispatching NaN
      mockCanvas.dispatchEvent(
        new MockTouchEvent('touchmove', { changedTouches: [{ identifier: 701, clientX: NaN, clientY: NaN }] }) as unknown as Event
      );

      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        setLineDash: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        font: '',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        textAlign: 'center',
        imageSmoothingEnabled: false,
      } as unknown as CanvasRenderingContext2D;

      handler.renderTouchGuides(mockCtx);

      // Defensive regression check: arc is NOT called with NaN puck coordinates because NaN is sanitized
      const arcCalls = (mockCtx.arc as any).mock.calls;
      const hasNaN = arcCalls.some((callArgs: any[]) => callArgs.some((arg: any) => typeof arg === 'number' && Number.isNaN(arg)));
      expect(hasNaN).toBe(false);
    });
  });

  // ==========================================================================
  // Suite 5: Keyboard Ghosting, Mega-Chord & Input Pipeline Collisions
  // ==========================================================================
  describe('Suite 5: Keyboard Ghosting & Single-Tick Mega-Chord Collisions', () => {
    beforeEach(() => {
      handler.setMode('coop');
    });

    it('TC-CHAOS-17: 11-key mega-chord pressed in a single tick routes to respective player channels', () => {
      // Mega-chord: WASD (P1) + Arrows (P2) + Space (P1 fire) + Enter (P2 fire) + KeyX (P1 special) + Slash (/)
      const megaKeys = [
        { code: 'KeyW', key: 'w' },
        { code: 'KeyA', key: 'a' },
        { code: 'KeyS', key: 's' },
        { code: 'KeyD', key: 'd' },
        { code: 'ArrowUp', key: 'ArrowUp' },
        { code: 'ArrowLeft', key: 'ArrowLeft' },
        { code: 'ArrowDown', key: 'ArrowDown' },
        { code: 'ArrowRight', key: 'ArrowRight' },
        { code: 'Space', key: ' ' },
        { code: 'Enter', key: 'Enter' },
        { code: 'KeyX', key: 'x' },
        { code: 'Slash', key: '/' },
      ];

      const events = megaKeys.map((k) => new MockKeyboardEvent('keydown', { code: k.code, key: k.key, cancelable: true }));

      // Dispatch all in single tick
      for (const ev of events) {
        mockWindow.dispatchEvent(ev);
      }

      const dual = handler.getDualInputState();
      expect(dual.p1.moveLeft).toBe(true);
      expect(dual.p1.moveRight).toBe(true);
      expect(dual.p1.moveUp).toBe(true);
      expect(dual.p1.moveDown).toBe(true);
      expect(dual.p1.fire).toBe(true);

      expect(dual.p2.moveLeft).toBe(true);
      expect(dual.p2.moveRight).toBe(true);
      expect(dual.p2.moveUp).toBe(true);
      expect(dual.p2.moveDown).toBe(true);
      expect(dual.p2.fire).toBe(true);

      expect(handler.consumeAction('special', 'p1')).toBe(true);
    });

    it('TC-CHAOS-18: Defensive Regression — Slash key (/) default is prevented by InputHandler', () => {
      // In browsers, "/" key triggers "Quick Find" / search bar unless prevented!
      const slashEvent = new MockKeyboardEvent('keydown', { code: 'Slash', key: '/', cancelable: true });
      mockWindow.dispatchEvent(slashEvent);

      // Defensive regression check: Slash key is prevented to avoid browser quick find hijacking
      expect(slashEvent.defaultPrevented).toBe(true);
    });

    it('TC-CHAOS-19: Defensive Regression — KeyL triggers Life Donation for P1 ONLY', () => {
      // P1 presses KeyL
      const keyLEvent = new MockKeyboardEvent('keydown', { code: 'KeyL', key: 'l' });
      mockWindow.dispatchEvent(keyLEvent);

      // Defensive regression check: KeyL triggers life donation for P1 ONLY (no crosstalk to P2)
      const p1Donate = handler.consumeAction('donateLife', 'p1');
      const p2Donate = handler.consumeAction('donateLife', 'p2');

      expect(p1Donate).toBe(true);
      expect(p2Donate).toBe(false);
    });

    it('TC-CHAOS-20: Defensive Regression — ShiftRight key triggers P2 Phase Warp but NOT P2 Special Move', () => {
      // P2 presses ShiftRight
      const shiftRightEvent = new MockKeyboardEvent('keydown', { code: 'ShiftRight', key: 'Shift' });
      mockWindow.dispatchEvent(shiftRightEvent);

      // Defensive regression check: ShiftRight triggers Phase Warp without triggering Special Move
      const p2Special = handler.consumeAction('special', 'p2');
      const p2Warp = handler.consumePhaseWarp('p2');

      expect(p2Special).toBe(false);
      expect(p2Warp).not.toBeNull();
    });

    it('TC-CHAOS-21: Defensive Regression — Player.updateControllable consumes P2 phase warp correctly', () => {
      const p2 = new Player({ id: 'p2', x: 144, y: 250, lives: 3 });
      p2.phaseDriveTimer = 5.0; // Phase Drive active
      p2.phaseWarpCooldown = 0;
      p2.game = { inputHandler: handler };

      // Set p2PhaseWarpTriggered directly via InputHandler double-tap simulation
      (handler as any).p2PhaseWarpTriggered = 1;

      const p2StartX = p2.x;

      // Update P2 with neutral direction (p2Input has moveRight: false)
      p2.update(0.0166, handler.getInputState('p2'));

      // Defensive regression check: P2 consumes its own phase warp and warps right by 40px
      expect(p2.x).toBe(p2StartX + 40);
      expect((handler as any).p2PhaseWarpTriggered).toBeNull();
    });

    it('TC-CHAOS-22: Defensive Regression — Game.updatePlaying consumes special move for P2 and sets activePlayerId to p2', () => {
      const game = new Game(mockCanvas);
      game.setCoopMode(true);
      game.startGame();
      game.setState('PLAYING');

      // Fill energy for specials
      game.specialMovesManager.energy = 100;
      expect(game.specialMovesManager.isReady()).toBe(true);

      // P2 triggers special move via KeyM
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyM', key: 'm' }));

      // Update Game frame
      game.update(0.0166);

      // Defensive regression check: P2 triggers special and activePlayerId is set to 'p2' (not P1)
      expect(game.specialMovesManager.activePlayerId).toBe('p2');

      game.destroy();
    });
  });
});
