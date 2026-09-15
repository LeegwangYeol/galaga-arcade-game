/**
 * Galaga Arcade Web Game — Milestone M32 Adversarial Keyboard Concurrency & Ghosting Stress Suite
 * Challenger: m32_challenger_1 (Empirical Adversarial Verifier)
 * 
 * Exhaustively stress-tests under hostile and adversarial conditions:
 * 1. Simultaneous Mashing Concurrency (1,000 randomized interleaved keydown/keyup events, zero channel crosstalk)
 * 2. Key Release Isolation (Holding P1 KeyA while cycling P2 ArrowLeft 100 times, and vice versa)
 * 3. Dynamic Mode Switching Under Load (Switching single <-> coop with active keys on both channels)
 * 4. Pulse Action & Trigger Isolation (consumeAction fire, special, phaseWarp across p1 and p2)
 * 5. OS Key Repeat Invariant & Anti-Chatter (Repeat events suppress pulse firing)
 * 6. Simultaneous Multi-Directional Saturation & Rollover Ghosting Immunity
 * 7. Window Blur & Document Visibility Interruption Under Heavy Load
 * 8. Single-Player Backward Compatibility Under Adversarial Influx
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InputHandler } from '../../src/ui/InputHandler';
import { ScreenManager } from '../../src/core/ScreenManager';

// ============================================================================
// Lightweight Mock DOM & Event Infrastructure for Vitest Node.js Environment
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

  constructor(
    type: string,
    init: { code?: string; key?: string; repeat?: boolean; cancelable?: boolean } = {}
  ) {
    super(type, init);
    this.code = init.code ?? '';
    this.key = init.key ?? '';
    this.repeat = init.repeat ?? false;
  }
}

// Deterministic Pseudo-Random Number Generator (Mulberry32)
function createPrng(seed: number = 0xcafebabe) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Milestone M32: Adversarial Keyboard Concurrency & Ghosting Stress Suite', () => {
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

    screenManager = new ScreenManager(mockCanvas, 224, 288);
    handler = new InputHandler(mockCanvas, screenManager);
  });

  afterEach(() => {
    handler.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Track 1: Simultaneous Mashing Concurrency (1,000 Randomized Interleaved Events)
  // ==========================================================================
  describe('Track 1: Simultaneous Mashing Concurrency & Zero Channel Crosstalk', () => {
    it('dispatches 1,000 randomized interleaved key events with absolute zero crosstalk between channels', () => {
      handler.setMode('coop');

      const p1Keys = [
        { code: 'KeyW', key: 'w' },
        { code: 'KeyA', key: 'a' },
        { code: 'KeyS', key: 's' },
        { code: 'KeyD', key: 'd' },
        { code: 'Space', key: ' ' },
        { code: 'KeyX', key: 'x' },
      ];

      const p2Keys = [
        { code: 'ArrowUp', key: 'ArrowUp' },
        { code: 'ArrowLeft', key: 'ArrowLeft' },
        { code: 'ArrowDown', key: 'ArrowDown' },
        { code: 'ArrowRight', key: 'ArrowRight' },
        { code: 'Enter', key: 'Enter' },
        { code: 'Numpad0', key: '0' },
        { code: 'KeyM', key: 'm' },
      ];

      const rng = createPrng(0x12345678);

      const p1ActiveMap = new Map<string, boolean>();
      const p2ActiveMap = new Map<string, boolean>();

      p1Keys.forEach((k) => p1ActiveMap.set(k.code, false));
      p2Keys.forEach((k) => p2ActiveMap.set(k.code, false));

      const snapshotP1 = () => {
        const s = handler.getInputState('p1');
        return {
          moveLeft: s.moveLeft,
          moveRight: s.moveRight,
          moveUp: s.moveUp,
          moveDown: s.moveDown,
          fire: s.fire,
        };
      };

      const snapshotP2 = () => {
        const s = handler.getInputState('p2');
        return {
          moveLeft: s.moveLeft,
          moveRight: s.moveRight,
          moveUp: s.moveUp,
          moveDown: s.moveDown,
          fire: s.fire,
        };
      };

      for (let i = 0; i < 1000; i++) {
        const channel = rng() < 0.5 ? 'p1' : 'p2';
        const isKeyDown = rng() < 0.55;

        if (channel === 'p1') {
          const keyDef = p1Keys[Math.floor(rng() * p1Keys.length)]!;
          const prevP2 = snapshotP2();

          p1ActiveMap.set(keyDef.code, isKeyDown);

          mockWindow.dispatchEvent(
            new MockKeyboardEvent(isKeyDown ? 'keydown' : 'keyup', {
              code: keyDef.code,
              key: keyDef.key,
              repeat: false,
            })
          );

          // Invariant 1: P1 key event MUST NEVER mutate P2 gameplay state
          const currentP2 = snapshotP2();
          expect(currentP2.moveLeft).toBe(prevP2.moveLeft);
          expect(currentP2.moveRight).toBe(prevP2.moveRight);
          expect(currentP2.moveUp).toBe(prevP2.moveUp);
          expect(currentP2.moveDown).toBe(prevP2.moveDown);
          expect(currentP2.fire).toBe(prevP2.fire);

          // Invariant 2: P1 key event correctly drives P1 state
          const currentP1 = snapshotP1();
          const expectedP1Left = p1ActiveMap.get('KeyA')!;
          const expectedP1Right = p1ActiveMap.get('KeyD')!;
          const expectedP1Up = p1ActiveMap.get('KeyW')!;
          const expectedP1Down = p1ActiveMap.get('KeyS')!;
          const expectedP1Fire = p1ActiveMap.get('Space')!;

          expect(currentP1.moveLeft).toBe(expectedP1Left);
          expect(currentP1.moveRight).toBe(expectedP1Right);
          expect(currentP1.moveUp).toBe(expectedP1Up);
          expect(currentP1.moveDown).toBe(expectedP1Down);
          expect(currentP1.fire).toBe(expectedP1Fire);
        } else {
          const keyDef = p2Keys[Math.floor(rng() * p2Keys.length)]!;
          const prevP1 = snapshotP1();

          p2ActiveMap.set(keyDef.code, isKeyDown);

          mockWindow.dispatchEvent(
            new MockKeyboardEvent(isKeyDown ? 'keydown' : 'keyup', {
              code: keyDef.code,
              key: keyDef.key,
              repeat: false,
            })
          );

          // Invariant 3: P2 key event MUST NEVER mutate P1 gameplay state
          const currentP1 = snapshotP1();
          expect(currentP1.moveLeft).toBe(prevP1.moveLeft);
          expect(currentP1.moveRight).toBe(prevP1.moveRight);
          expect(currentP1.moveUp).toBe(prevP1.moveUp);
          expect(currentP1.moveDown).toBe(prevP1.moveDown);
          expect(currentP1.fire).toBe(prevP1.fire);

          // Invariant 4: P2 key event correctly drives P2 state (accounting for Enter / Numpad0 dual fire)
          const currentP2 = snapshotP2();
          const expectedP2Left = p2ActiveMap.get('ArrowLeft')!;
          const expectedP2Right = p2ActiveMap.get('ArrowRight')!;
          const expectedP2Up = p2ActiveMap.get('ArrowUp')!;
          const expectedP2Down = p2ActiveMap.get('ArrowDown')!;
          const expectedP2Fire =
            p2ActiveMap.get('Enter')! || p2ActiveMap.get('Numpad0')!;

          expect(currentP2.moveLeft).toBe(expectedP2Left);
          expect(currentP2.moveRight).toBe(expectedP2Right);
          expect(currentP2.moveUp).toBe(expectedP2Up);
          expect(currentP2.moveDown).toBe(expectedP2Down);
          expect(currentP2.fire).toBe(expectedP2Fire);
        }
      }

      // Cleanup: release all keys
      for (const k of p1Keys) {
        mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: k.code, key: k.key }));
      }
      for (const k of p2Keys) {
        mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: k.code, key: k.key }));
      }

      const endP1 = snapshotP1();
      const endP2 = snapshotP2();
      expect(endP1.moveLeft).toBe(false);
      expect(endP1.moveRight).toBe(false);
      expect(endP1.moveUp).toBe(false);
      expect(endP1.moveDown).toBe(false);
      expect(endP1.fire).toBe(false);

      expect(endP2.moveLeft).toBe(false);
      expect(endP2.moveRight).toBe(false);
      expect(endP2.moveUp).toBe(false);
      expect(endP2.moveDown).toBe(false);
      expect(endP2.fire).toBe(false);
    });
  });

  // ==========================================================================
  // Track 2: Key Release Isolation (100 Repetitive Release Cycles)
  // ==========================================================================
  describe('Track 2: Key Release Isolation', () => {
    it('holds P1 KeyA while cycling P2 ArrowLeft 100 times without clearing P1 moveLeft', () => {
      handler.setMode('coop');

      // Hold P1 KeyA
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      expect(handler.getInputState('p1').moveLeft).toBe(true);

      // Cycle P2 ArrowLeft 100 times
      for (let i = 0; i < 100; i++) {
        // Press P2 ArrowLeft
        mockWindow.dispatchEvent(
          new MockKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' })
        );
        expect(handler.getInputState('p2').moveLeft).toBe(true);
        expect(handler.getInputState('p1').moveLeft).toBe(true);

        // Release P2 ArrowLeft
        mockWindow.dispatchEvent(
          new MockKeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft' })
        );
        expect(handler.getInputState('p2').moveLeft).toBe(false);
        // CRITICAL INVARIANT: P1 moveLeft must remain persistently true throughout!
        expect(handler.getInputState('p1').moveLeft).toBe(true);
      }

      // Finally release P1 KeyA
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyA', key: 'a' }));
      expect(handler.getInputState('p1').moveLeft).toBe(false);
      expect(handler.getInputState('p2').moveLeft).toBe(false);
    });

    it('holds P2 ArrowLeft while cycling P1 KeyA 100 times without clearing P2 moveLeft', () => {
      handler.setMode('coop');

      // Hold P2 ArrowLeft
      mockWindow.dispatchEvent(
        new MockKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' })
      );
      expect(handler.getInputState('p2').moveLeft).toBe(true);

      // Cycle P1 KeyA 100 times
      for (let i = 0; i < 100; i++) {
        mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
        expect(handler.getInputState('p1').moveLeft).toBe(true);
        expect(handler.getInputState('p2').moveLeft).toBe(true);

        mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyA', key: 'a' }));
        expect(handler.getInputState('p1').moveLeft).toBe(false);
        // CRITICAL INVARIANT: P2 moveLeft must remain persistently true throughout!
        expect(handler.getInputState('p2').moveLeft).toBe(true);
      }

      mockWindow.dispatchEvent(
        new MockKeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft' })
      );
      expect(handler.getInputState('p2').moveLeft).toBe(false);
    });

    it('isolates simultaneous continuous firing: Space (P1) held while Enter/Numpad0 (P2) cycles 100 times', () => {
      handler.setMode('coop');

      // Hold P1 Space
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      expect(handler.getInputState('p1').fire).toBe(true);

      for (let i = 0; i < 100; i++) {
        const p2Code = i % 2 === 0 ? 'Enter' : 'Numpad0';
        const p2Key = i % 2 === 0 ? 'Enter' : '0';

        mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: p2Code, key: p2Key }));
        expect(handler.getInputState('p2').fire).toBe(true);
        expect(handler.getInputState('p1').fire).toBe(true);

        mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: p2Code, key: p2Key }));
        expect(handler.getInputState('p2').fire).toBe(false);
        expect(handler.getInputState('p1').fire).toBe(true);
      }

      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Space', key: ' ' }));
      expect(handler.getInputState('p1').fire).toBe(false);
    });
  });

  // ==========================================================================
  // Track 3: Dynamic Mode Switching Under Load
  // ==========================================================================
  describe('Track 3: Dynamic Mode Switching Under Load', () => {
    it('cleanly resets all channel states when switching single <-> coop with depressed keys', () => {
      handler.setMode('coop');

      // Depress multi-directional and combat keys on both channels
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyW', key: 'w' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyX', key: 'x' }));

      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyM', key: 'm' }));

      expect(handler.getInputState('p1').moveLeft).toBe(true);
      expect(handler.getInputState('p1').moveUp).toBe(true);
      expect(handler.getInputState('p1').fire).toBe(true);

      expect(handler.getInputState('p2').moveRight).toBe(true);
      expect(handler.getInputState('p2').moveUp).toBe(true);
      expect(handler.getInputState('p2').fire).toBe(true);

      // Abrupt mode switch to single under active keyboard load
      handler.setMode('single');
      expect(handler.getMode()).toBe('single');

      // Invariant: all states must cleanly reset without stuck keys
      const singleState = handler.getState();
      expect(singleState.moveLeft).toBe(false);
      expect(singleState.moveRight).toBe(false);
      expect(singleState.moveUp).toBe(false);
      expect(singleState.moveDown).toBe(false);
      expect(singleState.fire).toBe(false);
      expect(singleState.pause).toBe(false);
      expect(singleState.restart).toBe(false);
      expect(singleState.pointerX).toBeNull();
      expect(singleState.pointerActive).toBe(false);

      // P2 in single mode must return idle state (all false)
      const p2State = handler.getInputState('p2');
      expect(p2State.moveLeft).toBe(false);
      expect(p2State.moveRight).toBe(false);
      expect(p2State.fire).toBe(false);

      // Actions must be cleared
      expect(handler.consumeAction('fire')).toBe(false);
      expect(handler.consumeAction('special')).toBe(false);
      expect(handler.consumeAction('pause')).toBe(false);
      expect(handler.consumeAction('restart')).toBe(false);
      expect(handler.consumePhaseWarp('p1')).toBeNull();
      expect(handler.consumePhaseWarp('p2')).toBeNull();

      // Now press keys while in single mode
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      expect(handler.getState().moveLeft).toBe(true);
      expect(handler.getState().fire).toBe(true);

      // Abrupt switch back to coop mode
      handler.setMode('coop');
      expect(handler.getMode()).toBe('coop');

      // Both channels must reset cleanly
      const p1Coop = handler.getInputState('p1');
      const p2Coop = handler.getInputState('p2');
      expect(p1Coop.moveLeft).toBe(false);
      expect(p1Coop.fire).toBe(false);
      expect(p2Coop.moveLeft).toBe(false);
      expect(p2Coop.fire).toBe(false);

      // Verify no NaN or corrupt types
      for (const [, v] of Object.entries(p1Coop)) {
        if (typeof v === 'number') {
          expect(Number.isNaN(v)).toBe(false);
        }
      }
      for (const [, v] of Object.entries(p2Coop)) {
        if (typeof v === 'number') {
          expect(Number.isNaN(v)).toBe(false);
        }
      }
    });

    it('endures rapid 100-iteration mode thrashing without state corruption', () => {
      const keys = ['KeyA', 'KeyD', 'Space', 'ArrowLeft', 'ArrowRight', 'Enter'];

      for (let i = 0; i < 100; i++) {
        // Press random keys
        const k = keys[i % keys.length]!;
        mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: k, key: k }));

        // Flip mode
        handler.setMode(i % 2 === 0 ? 'single' : 'coop');

        const stateP1 = handler.getInputState('p1');
        expect(stateP1.moveLeft).toBe(false);
        expect(stateP1.moveRight).toBe(false);
        expect(stateP1.fire).toBe(false);

        if (handler.getMode() === 'coop') {
          const stateP2 = handler.getInputState('p2');
          expect(stateP2.moveLeft).toBe(false);
          expect(stateP2.moveRight).toBe(false);
          expect(stateP2.fire).toBe(false);
        }
      }
    });
  });

  // ==========================================================================
  // Track 4: Pulse Action Isolation
  // ==========================================================================
  describe('Track 4: Pulse Action Isolation', () => {
    it('verifies consumeAction("fire", "p1") does not clear p2FireTriggered and vice versa', () => {
      handler.setMode('coop');

      // Trigger Fire on both channels simultaneously
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }));

      // Consume P1 Fire first
      expect(handler.consumeAction('fire', 'p1')).toBe(true);
      // P1 subsequent consume must be false
      expect(handler.consumeAction('fire', 'p1')).toBe(false);

      // CRITICAL INVARIANT: P2 Fire pulse MUST still be active and untouched!
      expect(handler.consumeAction('fire', 'p2')).toBe(true);
      // P2 subsequent consume must be false
      expect(handler.consumeAction('fire', 'p2')).toBe(false);

      // Release keys
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Space', key: ' ' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Enter', key: 'Enter' }));

      // Reverse order test: Consume P2 first, then P1
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Numpad0', key: '0' }));

      expect(handler.consumeAction('fire', 'p2')).toBe(true);
      expect(handler.consumeAction('fire', 'p2')).toBe(false);

      // P1 must still be active
      expect(handler.consumeAction('fire', 'p1')).toBe(true);
      expect(handler.consumeAction('fire', 'p1')).toBe(false);
    });

    it('verifies special move pulse isolation between P1 (KeyX) and P2 (KeyM)', () => {
      handler.setMode('coop');

      // P1 triggers Special (KeyX), P2 triggers Special (KeyM)
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyX', key: 'x' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyM', key: 'm' }));

      // Consume P1 special
      expect(handler.consumeAction('special', 'p1')).toBe(true);
      expect(handler.consumeAction('special', 'p1')).toBe(false);

      // P2 special must remain intact
      expect(handler.consumeAction('special', 'p2')).toBe(true);
      expect(handler.consumeAction('special', 'p2')).toBe(false);

      // Release keys
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyX', key: 'x' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyM', key: 'm' }));

      // Reverse order check with KeyM for P2
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyX', key: 'x' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyM', key: 'm' }));

      expect(handler.consumeAction('special', 'p2')).toBe(true);
      expect(handler.consumeAction('special', 'p2')).toBe(false);

      expect(handler.consumeAction('special', 'p1')).toBe(true);
      expect(handler.consumeAction('special', 'p1')).toBe(false);
    });

    it('verifies phase warp pulse isolation between P1 and P2', () => {
      handler.setMode('coop');

      // ShiftLeft triggers P1 warp, ShiftRight triggers P2 warp
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ShiftLeft', key: 'Shift' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ShiftRight', key: 'Shift' }));

      // Consume P1 phase warp
      const p1Warp = handler.consumePhaseWarp('p1');
      expect(p1Warp).not.toBeNull();
      expect(handler.consumePhaseWarp('p1')).toBeNull();

      // P2 phase warp must be intact
      const p2Warp = handler.consumePhaseWarp('p2');
      expect(p2Warp).not.toBeNull();
      expect(handler.consumePhaseWarp('p2')).toBeNull();
    });
  });

  // ==========================================================================
  // Track 5: OS Key Repeat Invariant & Anti-Chatter
  // ==========================================================================
  describe('Track 5: OS Key Repeat Invariant & Anti-Chatter', () => {
    it('suppresses redundant pulse fire actions on OS keyboard repeat events', () => {
      handler.setMode('coop');

      // Initial keydown (repeat: false) triggers pulse
      mockWindow.dispatchEvent(
        new MockKeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: false })
      );
      mockWindow.dispatchEvent(
        new MockKeyboardEvent('keydown', { code: 'Enter', key: 'Enter', repeat: false })
      );

      expect(handler.consumeAction('fire', 'p1')).toBe(true);
      expect(handler.consumeAction('fire', 'p2')).toBe(true);

      // Subsequent 50 OS repeat keydown events (repeat: true)
      for (let i = 0; i < 50; i++) {
        mockWindow.dispatchEvent(
          new MockKeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true })
        );
        mockWindow.dispatchEvent(
          new MockKeyboardEvent('keydown', { code: 'Enter', key: 'Enter', repeat: true })
        );

        // Continuous states must remain active
        expect(handler.getInputState('p1').fire).toBe(true);
        expect(handler.getInputState('p2').fire).toBe(true);

        // Pulse action MUST NOT be re-triggered by repeat events!
        expect(handler.consumeAction('fire', 'p1')).toBe(false);
        expect(handler.consumeAction('fire', 'p2')).toBe(false);
      }

      // Cleanup
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Space', key: ' ' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Enter', key: 'Enter' }));

      expect(handler.getInputState('p1').fire).toBe(false);
      expect(handler.getInputState('p2').fire).toBe(false);
    });
  });

  // ==========================================================================
  // Track 6: Multi-Directional Saturation & Ghosting Immunity
  // ==========================================================================
  describe('Track 6: Multi-Directional Saturation & Ghosting Immunity', () => {
    it('handles simultaneous opposing direction inputs on both channels simultaneously', () => {
      handler.setMode('coop');

      // P1 holds both KeyA and KeyD (Left and Right)
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyD', key: 'd' }));

      // P2 holds both ArrowLeft and ArrowRight (Left and Right)
      mockWindow.dispatchEvent(
        new MockKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' })
      );
      mockWindow.dispatchEvent(
        new MockKeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' })
      );

      const p1 = handler.getInputState('p1');
      const p2 = handler.getInputState('p2');

      expect(p1.moveLeft).toBe(true);
      expect(p1.moveRight).toBe(true);
      expect(p2.moveLeft).toBe(true);
      expect(p2.moveRight).toBe(true);

      // Release P1 KeyA: P1 moveLeft clears, P1 moveRight remains true
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyA', key: 'a' }));
      expect(handler.getInputState('p1').moveLeft).toBe(false);
      expect(handler.getInputState('p1').moveRight).toBe(true);

      // P2 states must remain completely unchanged
      expect(handler.getInputState('p2').moveLeft).toBe(true);
      expect(handler.getInputState('p2').moveRight).toBe(true);

      // Release P2 ArrowRight: P2 moveRight clears, P2 moveLeft remains true
      mockWindow.dispatchEvent(
        new MockKeyboardEvent('keyup', { code: 'ArrowRight', key: 'ArrowRight' })
      );
      expect(handler.getInputState('p2').moveLeft).toBe(true);
      expect(handler.getInputState('p2').moveRight).toBe(false);

      // P1 states must remain completely unchanged
      expect(handler.getInputState('p1').moveLeft).toBe(false);
      expect(handler.getInputState('p1').moveRight).toBe(true);

      // Clean remaining
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyD', key: 'd' }));
      mockWindow.dispatchEvent(
        new MockKeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft' })
      );
      expect(handler.getInputState('p1').moveRight).toBe(false);
      expect(handler.getInputState('p2').moveLeft).toBe(false);
    });

    it('preserves P2 fire state when one of two pressed fire keys (Enter + Numpad0) is released', () => {
      handler.setMode('coop');

      // P2 presses both Enter and Numpad0
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Numpad0', key: '0' }));

      expect(handler.getInputState('p2').fire).toBe(true);

      // Release Enter: fire must STAY TRUE because Numpad0 is still depressed!
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Enter', key: 'Enter' }));
      expect(handler.getInputState('p2').fire).toBe(true);

      // Release Numpad0: fire now clears
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Numpad0', key: '0' }));
      expect(handler.getInputState('p2').fire).toBe(false);
    });
  });

  // ==========================================================================
  // Track 7: Window Blur & Visibility Change Interruption
  // ==========================================================================
  describe('Track 7: Window Blur & Visibility Interruption', () => {
    it('flushes all active depressed keys and states on window blur during active dual mashing', () => {
      handler.setMode('coop');

      // Hold all 10 fingers across both channels
      const keys = [
        'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space',
        'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Enter'
      ];
      for (const k of keys) {
        mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: k, key: k }));
      }

      expect(handler.getInputState('p1').moveLeft).toBe(true);
      expect(handler.getInputState('p2').moveRight).toBe(true);

      // Window loses focus (e.g. user Alt+Tabs or clicks away)
      mockWindow.dispatchEvent(new MockEvent('blur'));

      // All states on both channels must be cleanly cleared
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

      // Discarding keyup events that occurred while blurred should not cause negative state
      for (const k of keys) {
        mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: k, key: k }));
      }
      expect(p1.moveLeft).toBe(false);
      expect(p2.moveRight).toBe(false);
    });
  });

  // ==========================================================================
  // Track 8: Single-Player Backward Compatibility Under Adversarial Influx
  // ==========================================================================
  describe('Track 8: Single-Player Backward Compatibility Under Adversarial Influx', () => {
    it('verifies that in single mode both WASD and Arrows drive primary player state while P2 is strictly idle', () => {
      handler.setMode('single');

      // P1 keys drive primary state
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      expect(handler.getState().moveLeft).toBe(true);
      expect(handler.getInputState('p1').moveLeft).toBe(true);
      expect(handler.getInputState('p2').moveLeft).toBe(false);

      // P2 Arrow keys ALSO drive primary state in single-player mode
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyA', key: 'a' }));
      mockWindow.dispatchEvent(
        new MockKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' })
      );
      expect(handler.getState().moveLeft).toBe(true);
      expect(handler.getInputState('p1').moveLeft).toBe(true);
      // P2 query in single-player mode must ALWAYS return idle state!
      expect(handler.getInputState('p2').moveLeft).toBe(false);

      mockWindow.dispatchEvent(
        new MockKeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft' })
      );
      expect(handler.getState().moveLeft).toBe(false);
      expect(handler.getInputState('p2').moveLeft).toBe(false);
    });
  });
});
