/**
 * Galaga Arcade Web Game — Milestone 2 Core Engine Unit Tests
 * 
 * Comprehensive test suite verifying:
 * 1. GameLoop (60fps fixed-timestep accumulator, spiral-of-death clamp, pause/resume, FPS tracking).
 * 2. ObjectPool (generic zero-allocation pool, O(1) swap-and-pop, auto-expansion, double-free safety).
 * 3. ScreenManager (224x288 letterbox/pillarbox scaling, clientToVirtual/virtualToClient mapping, resize observer).
 * 4. Starfield (3-layer parallax scrolling, speed states NORMAL/DIVING/WARP/PAUSED, lerp speed progression).
 * 5. InputHandler (keyboard, pointer, touch virtual controls, discrete action consumption, blur reset).
 * 6. Game (master engine coordinator, state machine transitions, double-buffered rendering pipeline, persistence).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameLoop } from '../../src/core/GameLoop';
import { ObjectPool } from '../../src/core/ObjectPool';
import { ScreenManager } from '../../src/core/ScreenManager';
import { Starfield } from '../../src/systems/Starfield';
import { InputHandler } from '../../src/ui/InputHandler';
import { Game } from '../../src/core/Game';

// ============================================================================
// Node Environment DOM Event Target Mock Helper
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

  constructor(type: string, init: { code?: string; key?: string; repeat?: boolean } = {}) {
    this.type = type;
    this.code = init.code ?? '';
    this.key = init.key ?? '';
    this.repeat = init.repeat ?? false;
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

describe('Milestone 2: Core Game Engine Test Suite', () => {
  // ==========================================================================
  // 1. GameLoop Test Suite
  // ==========================================================================
  describe('GameLoop Subsystem', () => {
    it('initializes with default 60fps fixed timestep and stopped state', () => {
      const onUpdate = vi.fn();
      const onRender = vi.fn();
      const loop = new GameLoop({ onUpdate, onRender });

      expect(loop.isRunning()).toBe(false);
      expect(loop.isPaused()).toBe(false);
      expect(loop.getTickCount()).toBe(0);
      expect(loop.getFrameCount()).toBe(0);
      expect(loop.getFPS()).toBe(60);
    });

    it('starts, ticks, and stops cleanly', () => {
      const onUpdate = vi.fn();
      const onRender = vi.fn();
      const loop = new GameLoop({ onUpdate, onRender, fixedDt: 1 / 60 });

      loop.start();
      expect(loop.isRunning()).toBe(true);

      // Manual step simulation
      loop.step(1 / 60);
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onRender).toHaveBeenCalledTimes(1);
      expect(loop.getTickCount()).toBe(1);
      expect(loop.getFrameCount()).toBe(1);

      loop.stop();
      expect(loop.isRunning()).toBe(false);
    });

    it('executes exact number of physics updates according to accumulated time', () => {
      let updateCount = 0;
      let totalDt = 0;
      const loop = new GameLoop({
        fixedDt: 0.016, // 16ms
        onUpdate: (dt) => {
          updateCount++;
          totalDt += dt;
        },
        onRender: () => {},
      });

      // Stepping 48ms should trigger exactly 3 updates of 16ms
      loop.step(0.048);
      expect(updateCount).toBe(3);
      expect(totalDt).toBeCloseTo(0.048, 5);
      expect(loop.getTickCount()).toBe(3);
    });

    it('pauses and resumes without accumulator corruption or time jumps', () => {
      const onUpdate = vi.fn();
      const onRender = vi.fn();
      const loop = new GameLoop({ onUpdate, onRender });

      loop.start();
      loop.pause();
      expect(loop.isPaused()).toBe(true);

      // In paused state, step executes render(0) but no physics update
      loop.step(0.05);
      expect(onUpdate).not.toHaveBeenCalled();
      expect(onRender).toHaveBeenCalledWith(0);

      loop.resume();
      expect(loop.isPaused()).toBe(false);

      loop.step(1 / 60);
      expect(onUpdate).toHaveBeenCalledTimes(1);
      loop.stop();
    });

    it('clamps delta time to maxDelta on large time jumps (Spiral of Death protection)', () => {
      let updates = 0;
      const loop = new GameLoop({
        fixedDt: 1 / 60, // ~16.67ms
        maxDelta: 0.1, // 100ms maximum
        onUpdate: () => {
          updates++;
        },
        onRender: () => {},
      });

      // Simulating a 5.0-second browser freeze / tab switch
      loop.step(5.0);

      // Max 100ms / (1/60s) = 6 fixed updates
      expect(updates).toBe(6);
      expect(loop.getTickCount()).toBe(6);
    });

    it('tracks metrics and returns valid metrics snapshot', () => {
      const loop = new GameLoop({ onUpdate: () => {}, onRender: () => {} });
      loop.start();
      loop.step(1 / 60);
      const metrics = loop.getMetrics();

      expect(metrics).toHaveProperty('fps');
      expect(metrics).toHaveProperty('averageFps');
      expect(metrics).toHaveProperty('frameTimeMs');
      expect(metrics).toHaveProperty('tickCount', 1);
      expect(metrics).toHaveProperty('frameCount', 1);
      expect(metrics).toHaveProperty('runningTimeSeconds');
      loop.stop();
    });
  });

  // ==========================================================================
  // 2. ObjectPool Test Suite
  // ==========================================================================
  describe('ObjectPool Subsystem', () => {
    interface TestBullet {
      id: number;
      x: number;
      y: number;
      active: boolean;
    }

    let nextId = 1;
    const factory = (): TestBullet => ({
      id: nextId++,
      x: 0,
      y: 0,
      active: false,
    });

    const reset = (item: TestBullet) => {
      item.x = 0;
      item.y = 0;
      item.active = false;
    };

    beforeEach(() => {
      nextId = 1;
    });

    it('pre-allocates storage according to initialSize', () => {
      const pool = new ObjectPool<TestBullet>(factory, reset, 16, 64);
      expect(pool.getCapacity()).toBe(16);
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getFreeCount()).toBe(16);
      expect(pool.getMaxSize()).toBe(64);
      expect(pool.isFull()).toBe(false);
    });

    it('supports config object constructor', () => {
      const pool = new ObjectPool<TestBullet>({
        factory,
        reset,
        initialSize: 8,
        maxSize: 32,
        autoExpand: true,
      });
      expect(pool.getCapacity()).toBe(8);
      expect(pool.getMaxSize()).toBe(32);
    });

    it('acquires items and tracks active count correctly', () => {
      const pool = new ObjectPool<TestBullet>(factory, reset, 4, 16);
      const b1 = pool.acquire();
      const b2 = pool.acquire();

      expect(b1).not.toBeNull();
      expect(b2).not.toBeNull();
      expect(b1).not.toBe(b2);
      expect(pool.getActiveCount()).toBe(2);
      expect(pool.getFreeCount()).toBe(2);
    });

    it('releases items via O(1) swap-and-pop and resets item state', () => {
      const pool = new ObjectPool<TestBullet>(factory, reset, 4, 16);
      const b1 = pool.acquire()!;
      const b2 = pool.acquire()!;
      const b3 = pool.acquire()!;
      expect(b1).toBeDefined();
      expect(b3).toBeDefined();

      b2.x = 150;
      b2.y = 250;
      b2.active = true;

      expect(pool.getActiveCount()).toBe(3);
      const success = pool.release(b2);

      expect(success).toBe(true);
      expect(pool.getActiveCount()).toBe(2);
      expect(b2.x).toBe(0); // Confirms reset
      expect(b2.y).toBe(0);
      expect(b2.active).toBe(false);
    });

    it('defensively ignores double releases and unallocated foreign objects', () => {
      const pool = new ObjectPool<TestBullet>(factory, reset, 4, 16);
      const b1 = pool.acquire()!;
      expect(pool.release(b1)).toBe(true);
      // Double release should return false
      expect(pool.release(b1)).toBe(false);

      // Foreign object
      const foreign: TestBullet = { id: 999, x: 10, y: 10, active: true };
      expect(pool.release(foreign)).toBe(false);
    });

    it('automatically expands storage when capacity is exceeded up to maxSize', () => {
      const pool = new ObjectPool<TestBullet>(factory, reset, 2, 8);
      const b1 = pool.acquire();
      const b2 = pool.acquire();
      expect(b1).not.toBeNull();
      expect(b2).not.toBeNull();
      expect(pool.getCapacity()).toBe(2);

      // Third acquisition triggers expansion
      const b3 = pool.acquire();
      expect(b3).not.toBeNull();
      expect(pool.getCapacity()).toBeGreaterThan(2);
      expect(pool.getActiveCount()).toBe(3);
    });

    it('returns null when maxSize limit is reached', () => {
      const pool = new ObjectPool<TestBullet>(factory, reset, 2, 3);
      const b1 = pool.acquire();
      const b2 = pool.acquire();
      const b3 = pool.acquire();
      const b4 = pool.acquire();

      expect(b1).not.toBeNull();
      expect(b2).not.toBeNull();
      expect(b3).not.toBeNull();
      expect(b4).toBeNull();
      expect(pool.isFull()).toBe(true);
    });

    it('iterates through active items via forEachActive and getActive', () => {
      const pool = new ObjectPool<TestBullet>(factory, reset, 4, 16);
      const b1 = pool.acquire()!;
      const b2 = pool.acquire()!;
      b1.x = 10;
      b2.x = 20;

      const collected: number[] = [];
      pool.forEachActive((item) => {
        collected.push(item.x);
      });

      expect(collected).toEqual([10, 20]);
      expect(pool.getActive().length).toBe(2);
    });

    it('supports safe in-loop release with forEachActiveSafe', () => {
      const pool = new ObjectPool<TestBullet>(factory, reset, 4, 16);
      const b1 = pool.acquire()!;
      const b2 = pool.acquire()!;
      const b3 = pool.acquire()!;

      b1.y = 50;
      b2.y = 300; // Will be released
      b3.y = 75;

      pool.forEachActiveSafe((item) => {
        if (item.y > 200) {
          pool.release(item);
        }
      });

      expect(pool.getActiveCount()).toBe(2);
    });

    it('clears active items and drains storage', () => {
      const pool = new ObjectPool<TestBullet>(factory, reset, 4, 16);
      const b1 = pool.acquire();
      const b2 = pool.acquire();
      expect(b1).not.toBeNull();
      expect(b2).not.toBeNull();
      expect(pool.getActiveCount()).toBe(2);

      pool.clear();
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getCapacity()).toBe(4);

      pool.drain();
      expect(pool.getCapacity()).toBe(0);
    });
  });

  // ==========================================================================
  // 3. ScreenManager Test Suite
  // ==========================================================================
  describe('ScreenManager Subsystem', () => {
    it('calculates 16:9 widescreen pillarbox scaling correctly', () => {
      const transform = ScreenManager.calculateTransform(1920, 1080, 224, 288);
      // Window aspect 1920/1080 = 1.7778 > target 224/288 = 0.7778 -> Pillarbox
      expect(transform.displayHeight).toBe(1080);
      expect(transform.displayWidth).toBe(Math.floor(1080 * (224 / 288))); // 840
      expect(transform.scale).toBeCloseTo(840 / 224, 4);
      expect(transform.offsetX).toBe(Math.floor((1920 - 840) / 2)); // 540
      expect(transform.offsetY).toBe(0);
      expect(transform.virtualWidth).toBe(224);
      expect(transform.virtualHeight).toBe(288);
    });

    it('calculates 9:16 mobile portrait letterbox scaling correctly', () => {
      const transform = ScreenManager.calculateTransform(375, 812, 224, 288);
      // Window aspect 375/812 = 0.4618 < target 224/288 = 0.7778 -> Letterbox
      expect(transform.displayWidth).toBe(375);
      expect(transform.displayHeight).toBe(Math.floor(375 / (224 / 288))); // 482
      expect(transform.scale).toBeCloseTo(375 / 224, 4);
      expect(transform.offsetX).toBe(0);
      expect(transform.offsetY).toBe(Math.floor((812 - 482) / 2)); // 165
    });

    it('maps client coordinates to virtual 224x288 space with clientToVirtual', () => {
      const mockCanvas = {
        width: 224,
        height: 288,
        style: {} as CSSStyleDeclaration,
        getBoundingClientRect: () => ({
          left: 100,
          top: 50,
          width: 448, // 2x scale
          height: 576,
          x: 100,
          y: 50,
          right: 548,
          bottom: 626,
          toJSON: () => ({}),
        }),
      } as unknown as HTMLCanvasElement;

      const screen = new ScreenManager(mockCanvas, 224, 288);

      // Center point: client (100 + 224, 50 + 288) = (324, 338) -> virtual (112, 144)
      const virtualCenter = screen.clientToVirtual(324, 338);
      expect(virtualCenter).not.toBeNull();
      expect(virtualCenter!.x).toBeCloseTo(112, 1);
      expect(virtualCenter!.y).toBeCloseTo(144, 1);

      // Out of bounds without clamp
      const outOfBounds = screen.clientToVirtual(10, 10, false);
      expect(outOfBounds).toBeNull();

      // Out of bounds with clamp
      const clamped = screen.clientToVirtual(10, 10, true);
      expect(clamped).not.toBeNull();
      expect(clamped!.x).toBe(0);
      expect(clamped!.y).toBe(0);
    });

    it('maps virtual coordinates to client space with virtualToClient', () => {
      const mockCanvas = {
        width: 224,
        height: 288,
        style: {} as CSSStyleDeclaration,
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

      const screen = new ScreenManager(mockCanvas, 224, 288);
      const clientPos = screen.virtualToClient(112, 144);

      expect(clientPos).not.toBeNull();
      expect(clientPos!.x).toBeCloseTo(324, 1);
      expect(clientPos!.y).toBeCloseTo(338, 1);
    });

    it('subscribes and unsubscribes resize observers', () => {
      const screen = new ScreenManager({ virtualWidth: 224, virtualHeight: 288 });
      const observer = vi.fn();

      const unsubscribe = screen.onResize(observer);
      expect(observer).toHaveBeenCalledTimes(1); // Called immediately on subscription

      screen.updateScalingImmediate();
      expect(observer).toHaveBeenCalledTimes(2);

      unsubscribe();
      screen.updateScalingImmediate();
      expect(observer).toHaveBeenCalledTimes(2); // No further calls
    });

    it('returns valid resolution descriptor', () => {
      const screen = new ScreenManager({ virtualWidth: 224, virtualHeight: 288 });
      const res = screen.getResolution();
      expect(res.width).toBe(224);
      expect(res.height).toBe(288);
      expect(res.aspectRatio).toBeCloseTo(224 / 288, 5);
    });
  });

  // ==========================================================================
  // 4. Starfield Test Suite
  // ==========================================================================
  describe('Starfield Subsystem', () => {
    it('generates 100 stars partitioned across 3 parallax depth layers', () => {
      const starfield = new Starfield(224, 288, 100);
      const stars = starfield.getStars();

      expect(stars.length).toBe(100);

      const layer0 = stars.filter((s) => s.layer === 0);
      const layer1 = stars.filter((s) => s.layer === 1);
      const layer2 = stars.filter((s) => s.layer === 2);

      expect(layer0.length).toBe(40);
      expect(layer1.length).toBe(35);
      expect(layer2.length).toBe(25);

      // Verify layer speed hierarchy: Layer 0 < Layer 1 < Layer 2
      const avgSpeed0 = layer0.reduce((acc, s) => acc + s.speed, 0) / layer0.length;
      const avgSpeed1 = layer1.reduce((acc, s) => acc + s.speed, 0) / layer1.length;
      const avgSpeed2 = layer2.reduce((acc, s) => acc + s.speed, 0) / layer2.length;

      expect(avgSpeed0).toBeLessThan(avgSpeed1);
      expect(avgSpeed1).toBeLessThan(avgSpeed2);
    });

    it('transitions speed states: NORMAL, DIVING, WARP, PAUSED', () => {
      const starfield = new Starfield(224, 288);

      starfield.setSpeedState('NORMAL');
      expect(starfield.getSpeedState()).toBe('NORMAL');

      starfield.setSpeedState('DIVING');
      expect(starfield.getSpeedState()).toBe('DIVING');

      starfield.setSpeedState('WARP');
      expect(starfield.getSpeedState()).toBe('WARP');

      starfield.setSpeedState('PAUSED');
      expect(starfield.getSpeedState()).toBe('PAUSED');
    });

    it('smoothly interpolates speed multiplier towards target with lerp', () => {
      const starfield = new Starfield(224, 288);
      expect(starfield.getSpeedMultiplier()).toBe(1.0);

      starfield.setSpeedState('WARP'); // Target 6.5
      expect(starfield.getSpeedMultiplier()).toBe(1.0); // Has not ticked yet

      starfield.update(0.1); // Advance time
      expect(starfield.getSpeedMultiplier()).toBeGreaterThan(1.0);
      expect(starfield.getSpeedMultiplier()).toBeLessThanOrEqual(6.5);

      // Run several frames to converge
      for (let i = 0; i < 30; i++) {
        starfield.update(0.1);
      }
      expect(starfield.getSpeedMultiplier()).toBeCloseTo(6.5, 1);
    });

    it('wraps stars around screen boundaries during update', () => {
      const starfield = new Starfield(224, 288);
      const stars = starfield.getStars();

      // Force a star to boundary
      const star = stars[0];
      if (star) {
        star.y = 287;
        star.speed = 100;

        starfield.update(0.1); // Will move star past 288
        expect(star.y).toBeLessThan(288);
      }
    });

    it('renders stars onto canvas context without throwing errors', () => {
      const starfield = new Starfield(224, 288);
      const mockCtx = {
        fillRect: vi.fn(),
        fillStyle: '',
        globalAlpha: 1.0,
      } as unknown as CanvasRenderingContext2D;

      starfield.render(mockCtx);
      expect(mockCtx.fillRect).toHaveBeenCalledTimes(100);
      expect(mockCtx.globalAlpha).toBe(1.0); // Reset alpha
    });
  });

  // ==========================================================================
  // 5. InputHandler Test Suite
  // ==========================================================================
  describe('InputHandler Subsystem', () => {
    let mockCanvas: HTMLCanvasElement;
    let mockWindow: MockEventTarget & { innerWidth: number; innerHeight: number };
    let mockDocument: MockEventTarget & { hidden: boolean; getElementById: (id: string) => null };
    let handler: InputHandler;

    beforeEach(() => {
      mockWindow = Object.assign(new MockEventTarget(), {
        innerWidth: 375,
        innerHeight: 667,
      });
      mockDocument = Object.assign(new MockEventTarget(), {
        hidden: false,
        getElementById: () => null,
      });

      vi.stubGlobal('window', mockWindow);
      vi.stubGlobal('document', mockDocument);
      vi.stubGlobal('KeyboardEvent', MockKeyboardEvent);
      vi.stubGlobal('Event', MockEvent);

      const canvasTarget = new MockEventTarget();
      mockCanvas = Object.assign(canvasTarget, {
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 224,
          height: 288,
          x: 0,
          y: 0,
          right: 224,
          bottom: 288,
          toJSON: () => ({}),
        }),
      }) as unknown as HTMLCanvasElement;

      handler = new InputHandler(mockCanvas);
    });

    afterEach(() => {
      handler.destroy();
      vi.unstubAllGlobals();
    });

    it('handles keyboard arrow and WASD steering keys', () => {
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' }));
      expect(handler.getState().moveLeft).toBe(true);

      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft' }));
      expect(handler.getState().moveLeft).toBe(false);

      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyD', key: 'd' }));
      expect(handler.getState().moveRight).toBe(true);

      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyD', key: 'd' }));
      expect(handler.getState().moveRight).toBe(false);
    });

    it('handles keyboard fire keys: Space, KeyZ, KeyK, KeyJ', () => {
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      expect(handler.getState().fire).toBe(true);
      expect(handler.consumeAction('fire')).toBe(true);
      // Second consume returns false (pulse consumed)
      expect(handler.consumeAction('fire')).toBe(false);

      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'Space', key: ' ' }));
      expect(handler.getState().fire).toBe(false);
    });

    it('handles pause and restart action keys with discrete pulse consumption', () => {
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyP', key: 'p' }));
      expect(handler.getState().pause).toBe(true);
      expect(handler.consumeAction('pause')).toBe(true);
      expect(handler.consumeAction('pause')).toBe(false);

      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }));
      expect(handler.getState().restart).toBe(true);
      expect(handler.consumeAction('restart')).toBe(true);
      expect(handler.consumeAction('restart')).toBe(false);
    });

    it('maintains continuous move state if duplicate/rollover key is still pressed', () => {
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
      expect(handler.getState().moveLeft).toBe(true);

      // Release only ArrowLeft while KeyA is still active
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft' }));
      expect(handler.getState().moveLeft).toBe(true);

      // Release KeyA
      mockWindow.dispatchEvent(new MockKeyboardEvent('keyup', { code: 'KeyA', key: 'a' }));
      expect(handler.getState().moveLeft).toBe(false);
    });

    it('resets all active input states upon window blur', () => {
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' }));
      mockWindow.dispatchEvent(new MockKeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      expect(handler.getState().moveLeft).toBe(true);
      expect(handler.getState().fire).toBe(true);

      mockWindow.dispatchEvent(new MockEvent('blur'));
      expect(handler.getState().moveLeft).toBe(false);
      expect(handler.getState().fire).toBe(false);
    });
  });

  // ==========================================================================
  // 6. Game Master Coordinator Test Suite
  // ==========================================================================
  describe('Game Coordinator Subsystem', () => {
    let game: Game;

    beforeEach(() => {
      game = new Game();
    });

    afterEach(() => {
      game.destroy();
    });

    it('initializes in TITLE state with standard arcade configuration', () => {
      expect(game.isReady()).toBe(true);
      expect(game.state).toBe('TITLE');
      expect(game.stage).toBe(1);
      expect(game.score).toBe(0);
      expect(game.lives).toBe(3);
      expect(game.highScore).toBeGreaterThanOrEqual(20000);
    });

    it('transitions from TITLE to STAGE_INTRO upon startGame()', () => {
      game.startGame();
      expect(game.state).toBe('STAGE_INTRO');
      expect(game.stage).toBe(1);
    });

    it('correctly identifies Challenging Stages: 3, 7, 11, 15, 19, 23...', () => {
      expect(game.isChallengingStage(1)).toBe(false);
      expect(game.isChallengingStage(2)).toBe(false);
      expect(game.isChallengingStage(3)).toBe(true);
      expect(game.isChallengingStage(4)).toBe(false);
      expect(game.isChallengingStage(7)).toBe(true);
      expect(game.isChallengingStage(11)).toBe(true);
      expect(game.isChallengingStage(15)).toBe(true);
    });

    it('transitions from STAGE_INTRO to PLAYING after intro delay', () => {
      game.startGame();
      expect(game.state).toBe('STAGE_INTRO');

      // Update past 2.2s intro duration
      game.update(2.5);
      expect(game.state).toBe('PLAYING');
    });

    it('transitions from STAGE_INTRO to CHALLENGING_STAGE on Stage 3', () => {
      game.stage = 3;
      game.setState('STAGE_INTRO');

      game.update(2.5);
      expect(game.state).toBe('CHALLENGING_STAGE');
    });

    it('handles pause and resume lifecycle transitions', () => {
      game.startGame();
      game.update(2.5); // Now PLAYING
      expect(game.state).toBe('PLAYING');

      expect(game.pause()).toBe(true);
      expect(game.state).toBe('PAUSED');
      expect(game.getStarfield().getSpeedState()).toBe('PAUSED');

      expect(game.resume()).toBe(true);
      expect(game.state).toBe('PLAYING');
      expect(game.getStarfield().getSpeedState()).toBe('NORMAL');
    });

    it('toggles pause on togglePause()', () => {
      game.startGame();
      game.update(2.5); // PLAYING

      game.togglePause();
      expect(game.state).toBe('PAUSED');

      game.togglePause();
      expect(game.state).toBe('PLAYING');
    });

    it('renders full arcade frame without throwing errors', () => {
      expect(() => {
        game.render();
      }).not.toThrow();
    });

    it('provides subsystem accessors', () => {
      expect(game.getScreenManager()).toBeInstanceOf(ScreenManager);
      expect(game.getStarfield()).toBeInstanceOf(Starfield);
      expect(game.getInputHandler()).toBeInstanceOf(InputHandler);
      expect(game.getGameLoop()).toBeInstanceOf(GameLoop);
      expect(game.getCanvas()).toBeDefined();
      expect(game.getContext()).toBeDefined();
    });
  });
});
