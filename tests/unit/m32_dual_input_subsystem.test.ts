/**
 * Galaga Arcade Web Game — Milestone M32: Concurrent Platform-Agnostic Dual-Input Subsystem
 * 
 * Exhaustive unit test suite verifying:
 * Track 1: Mode Selection & Title Screen UI Tests (TC-M32-01 to TC-M32-08)
 * Track 2: Multi-Channel PC Keyboard Concurrency Tests (TC-M32-09 to TC-M32-13)
 * Track 3: Single-Player Backward Compatibility Tests (TC-M32-14 to TC-M32-16)
 * Track 4: PlayerManager Multiplexing & In-Game Simulation Tests (TC-M32-17 to TC-M32-18)
 * Track 5: Zero-GC Memory & Lifecycle Hygiene Tests (TC-M32-19 to TC-M32-20)
 * Track 6: Mobile Split-Screen Touch Concurrency & Isolation Tests (TC-M32-21 to TC-M32-24)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { InputHandler } from '../../src/ui/InputHandler';
import { Screens, type ScreenRenderContext } from '../../src/ui/Screens';
import { HUD } from '../../src/ui/HUD';
import { Player } from '../../src/entities/Player';
import { PlayerManager } from '../../src/systems/PlayerManager';
import { ScreenManager } from '../../src/core/ScreenManager';
import type { DualInputState } from '../../src/types';

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

  constructor(type: string, init: { code?: string; key?: string; repeat?: boolean; cancelable?: boolean } = {}) {
    super(type, init);
    this.code = init.code ?? '';
    this.key = init.key ?? '';
    this.repeat = init.repeat ?? false;
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

  constructor(type: string, init: { changedTouches?: MockTouch[]; touches?: MockTouch[]; cancelable?: boolean } = {}) {
    super(type, init);
    this.changedTouches = init.changedTouches ?? [];
    this.touches = init.touches ?? [];
  }
}

describe('Milestone M32: Concurrent Platform-Agnostic Dual-Input Subsystem', () => {
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

    screenManager = new ScreenManager(mockCanvas, 224, 288);
    handler = new InputHandler(mockCanvas, screenManager);
  });

  afterEach(() => {
    handler.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Track 1: Mode Selection & Title Screen UI Tests
  // ==========================================================================
  describe('Track 1: Mode Selection & Title Screen UI', () => {
    let mockCtx: CanvasRenderingContext2D;
    let baseContext: ScreenRenderContext;

    beforeEach(() => {
      mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        fillText: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        drawImage: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        setLineDash: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        font: '',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        textAlign: 'center',
        textBaseline: 'middle',
        imageSmoothingEnabled: false,
      } as unknown as CanvasRenderingContext2D;

      baseContext = {
        ctx: mockCtx,
        width: 224,
        height: 288,
        stateTimer: 2.0,
        blinkTimer: 1.0,
        score: 0,
        highScore: 20000,
        stage: 1,
        lives: 3,
        shotsFired: 0,
        hits: 0,
        isCoop: false,
      };
    });

    it('TC-M32-01: Title Screen Renders 1-PLAYER (SOLO) Active State by Default', () => {
      const drawTextSpy = vi.spyOn(HUD, 'drawText');
      Screens.renderTitleScreen(baseContext);

      // Verify active 1-PLAYER cursor and inactive 2-PLAYER option
      const p1Call = drawTextSpy.mock.calls.find(([_, text]) => text.includes('1-PLAYER (SOLO)'));
      const p2Call = drawTextSpy.mock.calls.find(([_, text]) => text.includes('2-PLAYER (CO-OP)'));

      expect(p1Call).toBeDefined();
      expect(p1Call?.[1]).toBe('> 1-PLAYER (SOLO)   [1] <');
      expect(p2Call).toBeDefined();
      expect(p2Call?.[1]).toBe('  2-PLAYER (CO-OP)  [2]  ');
    });

    it('TC-M32-02: Title Screen Renders 2-PLAYER (CO-OP) Active State when isCoop === true', () => {
      const drawTextSpy = vi.spyOn(HUD, 'drawText');
      Screens.renderTitleScreen({ ...baseContext, isCoop: true });

      const p1Call = drawTextSpy.mock.calls.find(([_, text]) => text.includes('1-PLAYER (SOLO)'));
      const p2Call = drawTextSpy.mock.calls.find(([_, text]) => text.includes('2-PLAYER (CO-OP)'));

      expect(p1Call).toBeDefined();
      expect(p1Call?.[1]).toBe('  1-PLAYER (SOLO)   [1]  ');
      expect(p2Call).toBeDefined();
      expect(p2Call?.[1]).toBe('> 2-PLAYER (CO-OP)  [2] <');
    });

    it('TC-M32-03: Title Screen Updates Input Banners Dynamically based on Mode', () => {
      // Solo Mode Banners
      Screens.renderTitleScreen({ ...baseContext, isCoop: false });
      const fillTextCallsSolo = (mockCtx.fillText as any).mock.calls;
      const soloBanner1 = fillTextCallsSolo.some(([text]: [string]) => typeof text === 'string' && text.includes('KEYBOARD: [A/D]'));
      const soloBanner2 = fillTextCallsSolo.some(([text]: [string]) => typeof text === 'string' && text.includes('PAUSE: [P]'));
      expect(soloBanner1).toBe(true);
      expect(soloBanner2).toBe(true);

      (mockCtx.fillText as any).mockClear();

      // Co-op Mode Banners
      Screens.renderTitleScreen({ ...baseContext, isCoop: true });
      const fillTextCallsCoop = (mockCtx.fillText as any).mock.calls;
      const coopBanner1 = fillTextCallsCoop.some(([text]: [string]) => typeof text === 'string' && text.includes('P1: WASD+SPACE | P2: ARROWS+ENTER'));
      const coopBanner2 = fillTextCallsCoop.some(([text]: [string]) => typeof text === 'string' && text.includes('P1: [X] SPECIAL | P2: [M] SPECIAL'));
      expect(coopBanner1).toBe(true);
      expect(coopBanner2).toBe(true);
    });

    it('TC-M32-04: Backward Compatibility — renderTitleScreen with isCoop: undefined', () => {
      const drawTextSpy = vi.spyOn(HUD, 'drawText');
      const legacyCtx = { ...baseContext };
      delete legacyCtx.isCoop;

      expect(() => Screens.renderTitleScreen(legacyCtx)).not.toThrow();
      const p1Call = drawTextSpy.mock.calls.find(([_, text]) => text.includes('1-PLAYER (SOLO)'));
      expect(p1Call?.[1]).toBe('> 1-PLAYER (SOLO)   [1] <');
    });

    it('TC-M32-05: Stage Intro Displays "PLAYERS ONE & TWO" in Co-op Mode', () => {
      const drawTextSpy = vi.spyOn(HUD, 'drawText');
      Screens.renderStageIntro({ ...baseContext, isCoop: true });

      const stageIntroCall = drawTextSpy.mock.calls.some(([_, text]) => text.includes('PLAYERS ONE & TWO'));
      expect(stageIntroCall).toBe(true);
    });

    it('TC-M32-06: Pause Overlay Displays "CO-OP PAUSED" and Dual Controls Legend', () => {
      const drawTextSpy = vi.spyOn(HUD, 'drawText');
      Screens.renderPauseOverlay({ ...baseContext, isCoop: true });

      const pausedCall = drawTextSpy.mock.calls.some(([_, text]) => text.includes('CO-OP PAUSED'));
      const legendCall = (mockCtx.fillText as any).mock.calls.some(([text]: [string]) => typeof text === 'string' && text.includes('P1: WASD+SPACE | P2: ARROWS+ENTER'));
      expect(pausedCall).toBe(true);
      expect(legendCall).toBe(true);
    });

    it('TC-M32-07: game.setCoopMode(boolean) Toggles Subsystem Modes in Lockstep', () => {
      const game = new Game(mockCanvas);
      expect(game.isCoop()).toBe(false);
      expect(game.playerManager.isCoop()).toBe(false);
      expect(game.inputHandler.isCoop()).toBe(false);

      game.setCoopMode(true);
      expect(game.isCoop()).toBe(true);
      expect(game.playerManager.isCoop()).toBe(true);
      expect(game.inputHandler.isCoop()).toBe(true);

      game.setCoopMode(false);
      expect(game.isCoop()).toBe(false);
      expect(game.playerManager.isCoop()).toBe(false);
      expect(game.inputHandler.isCoop()).toBe(false);

      game.destroy();
    });

    it('TC-M32-08: Keyboard Mode Selection via Digit1 and Digit2 on Title Screen', () => {
      const game = new Game(mockCanvas);
      expect(game.state).toBe('TITLE');
      expect(game.isCoop()).toBe(false);

      // Press Digit2 on Title Screen -> Should switch to Co-op Mode
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Digit2', key: '2' }));
      game.update(0.016);
      expect(game.isCoop()).toBe(true);

      // Press Digit1 on Title Screen -> Should switch back to Solo Mode
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Digit1', key: '1' }));
      game.update(0.016);
      expect(game.isCoop()).toBe(false);

      game.destroy();
    });
  });

  // ==========================================================================
  // Track 2: Multi-Channel PC Keyboard Concurrency Tests
  // ==========================================================================
  describe('Track 2: Multi-Channel PC Keyboard Concurrency', () => {
    beforeEach(() => {
      handler.setMode('coop');
    });

    it('TC-M32-09: Player 1 Channel Exclusively Responds to WASD + Space in Co-op', () => {
      // P1 presses KeyA (moveLeft), KeyD (moveRight), Space (fire)
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }));

      const p1State = handler.getInputState('p1');
      const p2State = handler.getInputState('p2');

      expect(p1State.moveLeft).toBe(true);
      expect(p1State.fire).toBe(true);

      // P2 must be completely idle
      expect(p2State.moveLeft).toBe(false);
      expect(p2State.moveRight).toBe(false);
      expect(p2State.fire).toBe(false);
    });

    it('TC-M32-10: Player 2 Channel Exclusively Responds to Arrow Keys + Enter / Numpad0 in Co-op', () => {
      // P2 presses ArrowRight and Enter
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }));

      const p1State = handler.getInputState('p1');
      const p2State = handler.getInputState('p2');

      expect(p2State.moveRight).toBe(true);
      expect(p2State.fire).toBe(true);

      // P1 must be completely idle
      expect(p1State.moveLeft).toBe(false);
      expect(p1State.moveRight).toBe(false);
      expect(p1State.fire).toBe(false);

      // Test Numpad0 for P2 fire
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Enter', key: 'Enter' }));
      expect(handler.getInputState('p2').fire).toBe(false);

      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Numpad0', key: '0' }));
      expect(handler.getInputState('p2').fire).toBe(true);
      expect(handler.getInputState('p1').fire).toBe(false);
    });

    it('TC-M32-11: Simultaneous Dual-Input Non-Blocking Concurrency', () => {
      // P1 presses KeyA + Space
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }));

      // P2 presses ArrowRight + Enter
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }));

      const dual = handler.getDualInputState();

      expect(dual.p1.moveLeft).toBe(true);
      expect(dual.p1.moveRight).toBe(false);
      expect(dual.p1.fire).toBe(true);

      expect(dual.p2.moveLeft).toBe(false);
      expect(dual.p2.moveRight).toBe(true);
      expect(dual.p2.fire).toBe(true);
    });

    it('TC-M32-12: Independent Key Release and Rollover Isolation', () => {
      // P1 holds KeyA, P2 holds ArrowRight
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }));

      expect(handler.getInputState('p1').moveLeft).toBe(true);
      expect(handler.getInputState('p2').moveRight).toBe(true);

      // P1 releases KeyA
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyA', key: 'a' }));

      // P1 movement ceases; P2 movement remains active and undisturbed
      expect(handler.getInputState('p1').moveLeft).toBe(false);
      expect(handler.getInputState('p2').moveRight).toBe(true);

      // P2 releases ArrowRight
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'ArrowRight', key: 'ArrowRight' }));
      expect(handler.getInputState('p2').moveRight).toBe(false);
    });

    it('TC-M32-13: Independent Discrete Pulse Actions (Fire & Special)', () => {
      // P1 triggers KeyX (Special), P2 triggers KeyM (Special)
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyX', key: 'x' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyM', key: 'm' }));

      // Both special latches are active
      expect(handler.consumeAction('special', 'p1')).toBe(true);
      // Consuming P1 does NOT consume P2
      expect(handler.consumeAction('special', 'p1')).toBe(false);
      expect(handler.consumeAction('special', 'p2')).toBe(true);
      expect(handler.consumeAction('special', 'p2')).toBe(false);
    });
  });

  // ==========================================================================
  // Track 3: Single-Player Backward Compatibility Tests
  // ==========================================================================
  describe('Track 3: Single-Player Backward Compatibility', () => {
    it('TC-M32-14: InputHandler.getState() Backward Compatibility in Single Mode', () => {
      handler.setMode('single');

      // Both WASD and Arrow keys drive legacy getState() in single mode
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' }));
      expect(handler.getState().moveLeft).toBe(true);

      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft' }));
      expect(handler.getState().moveLeft).toBe(false);

      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      expect(handler.getState().moveLeft).toBe(true);

      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      expect(handler.getState().fire).toBe(true);
      expect(handler.consumeAction('fire')).toBe(true);
    });

    it('TC-M32-15: Single Mode Rollover Latching (KeyA + ArrowLeft)', () => {
      handler.setMode('single');

      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' }));

      expect(handler.getState().moveLeft).toBe(true);

      // Release ArrowLeft while KeyA is still depressed
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft' }));
      expect(handler.getState().moveLeft).toBe(true);

      // Release KeyA -> now moveLeft is false
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyA', key: 'a' }));
      expect(handler.getState().moveLeft).toBe(false);
    });

    it('TC-M32-16: getInputState("p2") Returns Inactive Idle State in Single Mode', () => {
      handler.setMode('single');

      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }));

      // In single mode, P2 state is permanently idle
      const p2State = handler.getInputState('p2');
      expect(p2State.moveLeft).toBe(false);
      expect(p2State.moveRight).toBe(false);
      expect(p2State.fire).toBe(false);
      expect(p2State.pause).toBe(false);
    });
  });

  // ==========================================================================
  // Track 4: PlayerManager Multiplexing & In-Game Simulation Tests
  // ==========================================================================
  describe('Track 4: PlayerManager Multiplexing & In-Game Simulation', () => {
    it('TC-M32-17: PlayerManager.update Routes Dual Inputs Independently', () => {
      const p1 = new Player({ id: 'p1', x: 80, y: 250, lives: 3 });
      const p2 = new Player({ id: 'p2', x: 144, y: 250, lives: 3 });
      const pm = new PlayerManager(p1);
      pm.setPlayer2(p2);

      const dualInputs: DualInputState = {
        p1: {
          moveLeft: true,
          moveRight: false,
          fire: false,
          pause: false,
          restart: false,
          pointerX: null,
          pointerActive: false,
          touchLeft: false,
          touchRight: false,
          touchFire: false,
        },
        p2: {
          moveLeft: false,
          moveRight: true,
          fire: false,
          pause: false,
          restart: false,
          pointerX: null,
          pointerActive: false,
          touchLeft: false,
          touchRight: false,
          touchFire: false,
        },
      };

      pm.update(0.05, dualInputs);

      // P1 moved left (X < 80), P2 moved right (X > 144)
      expect(p1.x).toBeLessThan(80);
      expect(p2.x).toBeGreaterThan(144);
    });

    it('TC-M32-18: Game Update Loop Feeds Dual Inputs to PlayerManager in Co-op', () => {
      const game = new Game(mockCanvas);
      game.setCoopMode(true);
      game.startGame();
      game.setState('PLAYING');

      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;
      const p1StartX = p1.x;
      const p2StartX = p2.x;

      // P1 presses KeyA, P2 presses ArrowRight
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }));

      game.update(0.05);

      expect(p1.x).toBeLessThan(p1StartX);
      expect(p2.x).toBeGreaterThan(p2StartX);

      game.destroy();
    });
  });

  // ==========================================================================
  // Track 5: Zero-GC Memory & Lifecycle Hygiene Tests
  // ==========================================================================
  describe('Track 5: Zero-GC Memory & Lifecycle Hygiene', () => {
    it('TC-M32-19: Zero Runtime Allocations across 1,000 Frames of Input Queries', () => {
      handler.setMode('coop');

      const refDual1 = handler.getDualInputState();
      const refP1_1 = handler.getInputState('p1');
      const refP2_1 = handler.getInputState('p2');

      for (let i = 0; i < 1000; i++) {
        const dual = handler.getDualInputState();
        const p1 = handler.getInputState('p1');
        const p2 = handler.getInputState('p2');

        expect(dual).toBe(refDual1);
        expect(p1).toBe(refP1_1);
        expect(p2).toBe(refP2_1);
      }
    });

    it('TC-M32-20: Clean Reset on Window Blur / State Transition', () => {
      handler.setMode('coop');

      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }));

      expect(handler.getInputState('p1').moveLeft).toBe(true);
      expect(handler.getInputState('p2').moveRight).toBe(true);

      // Window blur triggers reset
      mockWindow.dispatchEvent(new MockEvent('blur'));

      expect(handler.getInputState('p1').moveLeft).toBe(false);
      expect(handler.getInputState('p1').fire).toBe(false);
      expect(handler.getInputState('p2').moveRight).toBe(false);
      expect(handler.getInputState('p2').fire).toBe(false);
      expect(handler.consumeAction('fire', 'p1')).toBe(false);
      expect(handler.consumeAction('fire', 'p2')).toBe(false);
    });
  });

  // ==========================================================================
  // Track 6: Mobile Split-Screen Touch Concurrency & Session Isolation Tests
  // ==========================================================================
  describe('Track 6: Mobile Split-Screen Touch Concurrency & Isolation', () => {
    beforeEach(() => {
      handler.setMode('coop');
    });

    it('TC-M32-21: Multi-touch session allocation to P1 (left screen) and P2 (right screen)', () => {
      // Mock canvas width is 375. Midpoint is 187.5.
      // Touch 101 in P1 zone (X = 50, Y = 300)
      const touch1: MockTouch = { identifier: 101, clientX: 50, clientY: 300 };
      // Touch 102 in P2 zone (X = 250, Y = 300)
      const touch2: MockTouch = { identifier: 102, clientX: 250, clientY: 300 };

      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [touch1, touch2] }) as unknown as Event);

      // Touch 101 steers left (X = 20)
      const touch1Moved: MockTouch = { identifier: 101, clientX: 20, clientY: 300 };
      // Touch 102 steers right (X = 300)
      const touch2Moved: MockTouch = { identifier: 102, clientX: 300, clientY: 300 };

      mockCanvas.dispatchEvent(new MockTouchEvent('touchmove', { changedTouches: [touch1Moved, touch2Moved] }) as unknown as Event);

      expect(handler.getInputState('p1').moveLeft).toBe(true);
      expect(handler.getInputState('p1').moveRight).toBe(false);

      expect(handler.getInputState('p2').moveRight).toBe(true);
      expect(handler.getInputState('p2').moveLeft).toBe(false);
    });

    it('TC-M32-22: Zero crossover when touch drifts across center', () => {
      // Touch 101 originates in P1 Zone (X = 60, Y = 300)
      const touch1: MockTouch = { identifier: 101, clientX: 60, clientY: 300 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [touch1] }) as unknown as Event);

      // Move touch across the center line to X = 250 (P2 half)
      const touch1Crossed: MockTouch = { identifier: 101, clientX: 250, clientY: 300 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchmove', { changedTouches: [touch1Crossed] }) as unknown as Event);

      // Session remains locked to P1; P2 must not be activated
      expect(handler.getInputState('p2').moveLeft).toBe(false);
      expect(handler.getInputState('p2').moveRight).toBe(false);
      expect(handler.getInputState('p1').moveRight).toBe(true);
    });

    it('TC-M32-23: Independent touch release does not disturb other player session', () => {
      const touch1: MockTouch = { identifier: 101, clientX: 50, clientY: 300 };
      const touch2: MockTouch = { identifier: 102, clientX: 250, clientY: 300 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', { changedTouches: [touch1, touch2] }) as unknown as Event);

      const touch1Moved: MockTouch = { identifier: 101, clientX: 20, clientY: 300 };
      const touch2Moved: MockTouch = { identifier: 102, clientX: 300, clientY: 300 };
      mockCanvas.dispatchEvent(new MockTouchEvent('touchmove', { changedTouches: [touch1Moved, touch2Moved] }) as unknown as Event);

      expect(handler.getInputState('p1').moveLeft).toBe(true);
      expect(handler.getInputState('p2').moveRight).toBe(true);

      // P1 lifts finger (touchend)
      mockCanvas.dispatchEvent(new MockTouchEvent('touchend', { changedTouches: [touch1Moved] }) as unknown as Event);

      // P1 movement stops, P2 remains active
      expect(handler.getInputState('p1').moveLeft).toBe(false);
      expect(handler.getInputState('p2').moveRight).toBe(true);
    });

    it('TC-M32-24: renderTouchGuides renders center divider and zone indicators without allocating', () => {
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

      expect(() => handler.renderTouchGuides(mockCtx)).not.toThrow();
      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
      expect(mockCtx.setLineDash).toHaveBeenCalled();
      expect(mockCtx.fillText).toHaveBeenCalledWith('1P ZONE', 56, 280);
      expect(mockCtx.fillText).toHaveBeenCalledWith('2P ZONE', 168, 280);
    });
  });
});
