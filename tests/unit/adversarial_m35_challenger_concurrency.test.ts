/**
 * Milestone M35: Adversarial Concurrency, Touch Collisions & Soak Invariants
 * File: tests/unit/adversarial_m35_challenger_concurrency.test.ts
 *
 * Authored by: m35_challenger_1 (Empirical Challenger)
 * 
 * Verifies:
 * 1. High-Frequency Concurrent Keyboard Contention (P1 & P2 moving and firing on identical timestamps)
 * 2. Key Sticking, Rollover & Multi-Channel Key Contention Resilience
 * 3. 6-Point Capacitive Multi-Touch Saturation & Touch Identifier Collision/Crosstalk
 * 4. Touch Identifier Reuse & Cross-Quadrant Spatial Re-registration
 * 5. 5,000-Frame Co-op Combat Memory Soak & Exact Heap Drift Telemetry
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import { InputHandler } from '../../src/ui/InputHandler';
import { ScreenManager } from '../../src/core/ScreenManager';
import { Game } from '../../src/core/Game';
import { EnemyType } from '../../src/types';

// ============================================================================
// Mock DOM Infrastructure
// ============================================================================

class MockEventTarget {
  private listeners: Record<string, Set<(e: any) => void>> = {};

  addEventListener(type: string, listener: (e: any) => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = new Set();
    }
    this.listeners[type]!.add(listener);
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

function forceGC(): void {
  if (typeof (globalThis as any).gc === 'function') {
    (globalThis as any).gc();
    (globalThis as any).gc();
    return;
  }
  try {
    v8.setFlagsFromString('--expose_gc');
    const gc = vm.runInNewContext('gc');
    if (typeof gc === 'function') {
      gc();
      gc();
    }
  } catch {
    // V8 fallback
  }
}

describe('M35 Adversarial Empirical Challenge Suite (m35_challenger_1)', () => {
  let mockWindow: MockEventTarget;
  let mockDocument: any;
  let mockCanvas: HTMLCanvasElement;
  let screenManager: ScreenManager;
  let handler: InputHandler;

  const CANVAS_WIDTH = 224;
  const CANVAS_HEIGHT = 288;

  beforeEach(() => {
    mockWindow = new MockEventTarget();

    const canvasTarget = new MockEventTarget();
    mockCanvas = Object.assign(canvasTarget, {
      id: 'game-canvas',
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
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
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        x: 0,
        y: 0,
        right: CANVAS_WIDTH,
        bottom: CANVAS_HEIGHT,
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

    screenManager = new ScreenManager(mockCanvas, CANVAS_WIDTH, CANVAS_HEIGHT);
    handler = new InputHandler(mockCanvas, screenManager);
    handler.setMode('coop');
  });

  afterEach(() => {
    handler.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Track 1: Concurrency & Contention Stress (Keyboard)
  // ==========================================================================
  describe('1. Concurrency & Contention Stress: Keyboard Multi-Channel Contention', () => {
    it('CHALLENGE-M35-01: 1,000 ticks of simultaneous max-frequency keyboard actuation on identical timestamps', () => {
      // Both players move and fire simultaneously on identical frame timestamps
      let p1FireCount = 0;
      let p2FireCount = 0;

      for (let tick = 0; tick < 1000; tick++) {
        // Alternating directional inputs
        const p1Code = tick % 2 === 0 ? 'KeyA' : 'KeyD';
        const p1Key = tick % 2 === 0 ? 'a' : 'd';
        const p2Code = tick % 2 === 0 ? 'ArrowLeft' : 'ArrowRight';
        const p2Key = tick % 2 === 0 ? 'ArrowLeft' : 'ArrowRight';

        // Down simultaneous
        mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: p1Code, key: p1Key }));
        mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }));
        mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: p2Code, key: p2Key }));
        mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }));

        const dual = handler.getDualInputState();

        // Verify P1 input active
        if (tick % 2 === 0) {
          expect(dual.p1.moveLeft, `Tick ${tick}: P1 moveLeft`).toBe(true);
          expect(dual.p1.moveRight, `Tick ${tick}: P1 moveRight`).toBe(false);
        } else {
          expect(dual.p1.moveRight, `Tick ${tick}: P1 moveRight`).toBe(true);
          expect(dual.p1.moveLeft, `Tick ${tick}: P1 moveLeft`).toBe(false);
        }
        expect(dual.p1.fire, `Tick ${tick}: P1 fire`).toBe(true);

        // Verify P2 input active
        if (tick % 2 === 0) {
          expect(dual.p2.moveLeft, `Tick ${tick}: P2 moveLeft`).toBe(true);
          expect(dual.p2.moveRight, `Tick ${tick}: P2 moveRight`).toBe(false);
        } else {
          expect(dual.p2.moveRight, `Tick ${tick}: P2 moveRight`).toBe(true);
          expect(dual.p2.moveLeft, `Tick ${tick}: P2 moveLeft`).toBe(false);
        }
        expect(dual.p2.fire, `Tick ${tick}: P2 fire`).toBe(true);

        // Consume discrete action pulses
        if (handler.consumeAction('fire', 'p1')) p1FireCount++;
        if (handler.consumeAction('fire', 'p2')) p2FireCount++;

        // Up simultaneous
        mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: p1Code, key: p1Key }));
        mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Space', key: ' ' }));
        mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: p2Code, key: p2Key }));
        mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Enter', key: 'Enter' }));

        // Verify zero key sticking after release
        const releasedDual = handler.getDualInputState();
        expect(releasedDual.p1.moveLeft, `Tick ${tick}: P1 moveLeft sticking`).toBe(false);
        expect(releasedDual.p1.moveRight, `Tick ${tick}: P1 moveRight sticking`).toBe(false);
        expect(releasedDual.p1.fire, `Tick ${tick}: P1 fire sticking`).toBe(false);

        expect(releasedDual.p2.moveLeft, `Tick ${tick}: P2 moveLeft sticking`).toBe(false);
        expect(releasedDual.p2.moveRight, `Tick ${tick}: P2 moveRight sticking`).toBe(false);
        expect(releasedDual.p2.fire, `Tick ${tick}: P2 fire sticking`).toBe(false);
      }

      // Exact 1:1 pulse consumption for both players without any input drop
      expect(p1FireCount).toBe(1000);
      expect(p2FireCount).toBe(1000);
    });

    it('CHALLENGE-M35-02: Complex asynchronous rollover and partial release under heavy contention', () => {
      // P1 presses KeyA and Space
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }));

      // P2 presses ArrowLeft and Enter
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }));

      // P1 then presses KeyD while still holding KeyA (simultaneous opposite keys)
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyD', key: 'd' }));

      // Both KeyA and KeyD active -> moveLeft: true, moveRight: true
      let dual = handler.getDualInputState();
      expect(dual.p1.moveLeft).toBe(true);
      expect(dual.p1.moveRight).toBe(true);
      expect(dual.p2.moveLeft).toBe(true);

      // P1 releases KeyA; KeyD remains depressed
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyA', key: 'a' }));
      dual = handler.getDualInputState();
      expect(dual.p1.moveLeft).toBe(false);
      expect(dual.p1.moveRight).toBe(true); // Must remain true!
      expect(dual.p2.moveLeft).toBe(true);

      // P2 releases ArrowLeft, presses ArrowRight + Numpad0
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Numpad0', key: '0' }));

      dual = handler.getDualInputState();
      expect(dual.p2.moveLeft).toBe(false);
      expect(dual.p2.moveRight).toBe(true);
      expect(dual.p2.fire).toBe(true);
      expect(dual.p1.moveRight).toBe(true);

      // Release all keys
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyD', key: 'd' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Space', key: ' ' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'ArrowRight', key: 'ArrowRight' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Enter', key: 'Enter' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Numpad0', key: '0' }));

      dual = handler.getDualInputState();
      expect(dual.p1.moveLeft).toBe(false);
      expect(dual.p1.moveRight).toBe(false);
      expect(dual.p1.fire).toBe(false);
      expect(dual.p2.moveLeft).toBe(false);
      expect(dual.p2.moveRight).toBe(false);
      expect(dual.p2.fire).toBe(false);
    });
  });

  // ==========================================================================
  // Track 2: 6-Point Multi-Touch Crosstalk & Collision Stress
  // ==========================================================================
  describe('2. Multi-Touch Stress: 6-Point Saturation & Identifier Resolution', () => {
    it('CHALLENGE-M35-03: Stress-tests concurrent 6-point multi-touch across screen halves without crosstalk', () => {
      // 6 concurrent capacitive touch points:
      // P1: Touch 10 (Steer: X=30, Y=220), Touch 11 (Fire: X=95, Y=220), Touch 12 (Special: X=95, Y=50)
      // P2: Touch 20 (Steer: X=140, Y=220), Touch 21 (Fire: X=205, Y=220), Touch 22 (Special: X=205, Y=50)
      const touches6: MockTouch[] = [
        { identifier: 10, clientX: 30, clientY: 220 },
        { identifier: 11, clientX: 95, clientY: 220 },
        { identifier: 12, clientX: 95, clientY: 50 },
        { identifier: 20, clientX: 140, clientY: 220 },
        { identifier: 21, clientX: 205, clientY: 220 },
        { identifier: 22, clientX: 205, clientY: 50 },
      ];

      // Dispatch simultaneous touchstart
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', {
        changedTouches: touches6,
      }) as unknown as Event);

      // Verify all discrete pulses latched
      expect(handler.consumeAction('special', 'p1')).toBe(true);
      expect(handler.consumeAction('special', 'p2')).toBe(true);
      expect(handler.consumeAction('fire', 'p1')).toBe(true);
      expect(handler.consumeAction('fire', 'p2')).toBe(true);

      // Continuous fire should be true for both
      expect(handler.getInputState('p1').fire).toBe(true);
      expect(handler.getInputState('p2').fire).toBe(true);

      // Drag P1 steer left (X: 30 -> 10, delta = -20)
      // Drag P2 steer right (X: 140 -> 165, delta = +25)
      mockCanvas.dispatchEvent(new MockTouchEvent('touchmove', {
        changedTouches: [
          { identifier: 10, clientX: 10, clientY: 220 },
          { identifier: 20, clientX: 165, clientY: 220 },
        ],
      }) as unknown as Event);

      const dual = handler.getDualInputState();
      expect(dual.p1.moveLeft).toBe(true);
      expect(dual.p1.moveRight).toBe(false);
      expect(dual.p2.moveRight).toBe(true);
      expect(dual.p2.moveLeft).toBe(false);

      // Out-of-order partial release: Lift P1 Fire (Touch 11) and P2 Special (Touch 22)
      mockCanvas.dispatchEvent(new MockTouchEvent('touchend', {
        changedTouches: [
          { identifier: 11, clientX: 95, clientY: 220 },
          { identifier: 22, clientX: 205, clientY: 50 },
        ],
      }) as unknown as Event);

      // P1 fire is released; P2 fire remains ACTIVE
      expect(handler.getInputState('p1').fire).toBe(false);
      expect(handler.getInputState('p2').fire).toBe(true);

      // Steering continues undisturbed
      expect(handler.getInputState('p1').moveLeft).toBe(true);
      expect(handler.getInputState('p2').moveRight).toBe(true);

      // Release remaining touches
      mockCanvas.dispatchEvent(new MockTouchEvent('touchend', {
        changedTouches: [
          { identifier: 10, clientX: 10, clientY: 220 },
          { identifier: 12, clientX: 95, clientY: 50 },
          { identifier: 20, clientX: 165, clientY: 220 },
          { identifier: 21, clientX: 205, clientY: 220 },
        ],
      }) as unknown as Event);

      const finalDual = handler.getDualInputState();
      expect(finalDual.p1.moveLeft).toBe(false);
      expect(finalDual.p1.fire).toBe(false);
      expect(finalDual.p2.moveRight).toBe(false);
      expect(finalDual.p2.fire).toBe(false);
    });

    it('CHALLENGE-M35-04: Touch Identifier recycling and spatial reassignment across quadrants', () => {
      // Touch ID 1 starts in P1 zone (X = 40, Y = 200)
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', {
        changedTouches: [{ identifier: 1, clientX: 40, clientY: 200 }],
      }) as unknown as Event);

      // Steer left
      mockCanvas.dispatchEvent(new MockTouchEvent('touchmove', {
        changedTouches: [{ identifier: 1, clientX: 20, clientY: 200 }],
      }) as unknown as Event);
      expect(handler.getInputState('p1').moveLeft).toBe(true);

      // Touch ID 1 lifted
      mockCanvas.dispatchEvent(new MockTouchEvent('touchend', {
        changedTouches: [{ identifier: 1, clientX: 20, clientY: 200 }],
      }) as unknown as Event);
      expect(handler.getInputState('p1').moveLeft).toBe(false);

      // Mobile OS re-uses Touch ID 1 immediately, but now in P2 zone (X = 150, Y = 200)
      mockCanvas.dispatchEvent(new MockTouchEvent('touchstart', {
        changedTouches: [{ identifier: 1, clientX: 150, clientY: 200 }],
      }) as unknown as Event);

      // Steer right in P2
      mockCanvas.dispatchEvent(new MockTouchEvent('touchmove', {
        changedTouches: [{ identifier: 1, clientX: 175, clientY: 200 }],
      }) as unknown as Event);

      // Session MUST cleanly bind to P2 with zero ghost state on P1
      expect(handler.getInputState('p2').moveRight).toBe(true);
      expect(handler.getInputState('p1').moveLeft).toBe(false);
      expect(handler.getInputState('p1').moveRight).toBe(false);

      mockCanvas.dispatchEvent(new MockTouchEvent('touchend', {
        changedTouches: [{ identifier: 1, clientX: 175, clientY: 200 }],
      }) as unknown as Event);
      expect(handler.getInputState('p2').moveRight).toBe(false);
    });
  });

  // ==========================================================================
  // Track 3: Memory Soak Stress & Heap Drift Telemetry
  // ==========================================================================
  describe('3. Memory Soak Stress: 5,000-Frame Empirical Telemetry', { timeout: 60000 }, () => {
    it('CHALLENGE-M35-05: Executes 5,000 continuous combat frames with empirical telemetry logging and drift < 1.0 MB target', () => {
      const game = new Game();
      game.setCoopMode(true);
      game.startGame();
      game.setState('PLAYING');

      const cheat = game.getCheatController();
      const p1 = game.playerManager.getPlayer('p1')!;
      const p2 = game.playerManager.getPlayer('p2')!;

      // JIT Warmup
      for (let t = 0; t < 150; t++) {
        game.update(1 / 60);
      }

      // Clean stage boundary
      game.bulletManager.clear();
      game.particleSystem.clear();
      if (game.powerUpManager) game.powerUpManager.reset();
      if (game.alliesManager) game.alliesManager.onStageClear();
      if (game.specialMovesManager) game.specialMovesManager.onStageClear();
      if (game.formationManager) game.formationManager.reset();
      if (game.bossManager) game.bossManager.reset();
      if (game.crisisEventManager) {
        game.crisisEventManager.clearCrisis();
        game.crisisEventManager.onStageClear();
      }
      if (game.glitchEventManager) game.glitchEventManager.clearGlitch();
      if (game.playerManager) game.playerManager.onStageClear();

      forceGC();
      const baselineHeap = process.memoryUsage().heapUsed;

      const TOTAL_FRAMES = 5000;
      const checkpoints: { frame: number; heapUsedMB: number; driftMB: number }[] = [];

      for (let frame = 1; frame <= TOTAL_FRAMES; frame++) {
        p1.x = 80 + Math.sin(frame * 0.05) * 40;
        p2.x = 144 + Math.cos(frame * 0.05) * 40;

        if (frame % 4 === 0) {
          game.bulletManager.firePlayerBullet(p1.x, p1.y - 10, false, 360, 0, undefined, undefined, 'p1');
        }
        if (frame % 4 === 2) {
          game.bulletManager.firePlayerBullet(p2.x, p2.y - 10, false, 360, 0, undefined, undefined, 'p2');
        }

        if (frame % 60 === 0) {
          const living = game.formationManager.getLivingEnemies();
          if (living.length > 0) {
            game.formationManager.peelOffSolo(living[0]!, p1.x);
          } else {
            game.formationManager.spawnStage(2);
          }
        }
        if (frame % 25 === 0) {
          game.bulletManager.fireEnemyBullet(112, 70, p2.x, p2.y, 180);
        }

        if (frame % 700 === 300) {
          p2.startRevivePending(10.0);
        }
        if (frame % 700 === 360) {
          if (p1.lives <= 1) p1.lives = 3;
          if (game.playerManager.canDonateLife('p1')) {
            game.playerManager.donateLife('p1');
          }
        }

        if (frame % 350 === 0) {
          cheat.spawnPowerUp('chrono_field', 100, 50);
        }
        if (frame % 500 === 0) {
          cheat.triggerGlitch('mirage');
          game.formationManager.spawnMirageClones(112, 90, EnemyType.GOEI);
        }

        game.update(1 / 60);

        if (frame % 1000 === 0) {
          forceGC();
          const currentHeap = process.memoryUsage().heapUsed;
          const driftMB = (currentHeap - baselineHeap) / (1024 * 1024);
          checkpoints.push({
            frame,
            heapUsedMB: Math.round((currentHeap / (1024 * 1024)) * 100) / 100,
            driftMB: Math.round(driftMB * 1000) / 1000,
          });
          expect(driftMB).toBeLessThan(5.0);
        }
      }

      // Teardown
      game.bulletManager.clear();
      game.particleSystem.clear();
      if (game.powerUpManager) game.powerUpManager.reset();
      if (game.alliesManager) game.alliesManager.onStageClear();
      if (game.specialMovesManager) game.specialMovesManager.onStageClear();
      if (game.formationManager) game.formationManager.reset();
      if (game.bossManager) game.bossManager.reset();
      if (game.crisisEventManager) {
        game.crisisEventManager.clearCrisis();
        game.crisisEventManager.onStageClear();
      }
      if (game.glitchEventManager) game.glitchEventManager.clearGlitch();
      if (game.playerManager) game.playerManager.onStageClear();

      // Verify all 9 object pools strictly 0 active leases
      expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
      expect(game.particleSystem.getPool().getActiveCount()).toBe(0);
      expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
      expect(game.formationManager.getEnemyPool().getActiveCount()).toBe(0);
      expect(game.formationManager.getPhantomPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
      expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
      expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);

      forceGC();
      const finalHeap = process.memoryUsage().heapUsed;
      const finalDriftMB = (finalHeap - baselineHeap) / (1024 * 1024);

      console.log('M35 Soak Checkpoints:', JSON.stringify(checkpoints));
      console.log('M35 Final Heap Drift (MB):', finalDriftMB);

      expect(finalDriftMB).toBeLessThan(5.0);
      // Target is < 1.0 MB
      expect(finalDriftMB).toBeLessThan(1.0);

      game.destroy();
    });
  });
});
