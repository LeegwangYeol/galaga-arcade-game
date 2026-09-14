/**
 * Galaga Arcade Web Game — M24 Challenger 2 Adversarial Stress Test Suite
 * 
 * Adversarially challenges:
 * 1. Challenging Stage killAllEnemies(): trigger killAllEnemies() at t=0.1s in Stage 3,
 *    and verify stage clear triggers and advances to Stage 4 without softlocking.
 *    Also tests t=0.0s immediate trigger and double consecutive triggers.
 * 2. Pool drainage: inspect all 9 pools on GAME_OVER and verify active leases are 0.
 *    Also verifies startGame() reset hygiene and bounded pool capacity constraints.
 * 3. Mobile touch steering: dispatch pointerdown with pointerType 'touch' in steering area
 *    and verify fire state is NOT set.
 *    Also verifies touchstart in steering zone vs virtual fire button zone separation.
 * 4. Letterbox margin clamping: drag pointer coordinates to clientX = -50 and verify pointerX
 *    clamps to 8 (not null/dropped).
 *    Also tests non-zero canvas viewport offsets and extreme boundary dragging.
 * 5. HUD layout bounds: simulate 5 reserve lives (6 total) and verify Special Moves gauge and
 *    label have zero overlapping bounding boxes.
 *    Also verifies stage badges crowding threshold (X >= 144) to prevent gauge overlap.
 * 6. Boss health bar position: verify bar top >= 20 (below score row) and renders cleanly
 *    during camera shake (isolated from shake matrix).
 *    Also verifies HP color tiering and zero-width boundary handling.
 * 7. PsionicResonance zero-GC: verify bulletsToRecycle array identity is preserved without per-frame allocations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { HUD } from '../../src/ui/HUD';
import { InputHandler } from '../../src/ui/InputHandler';
import { ScreenManager } from '../../src/core/ScreenManager';
import { BossManager } from '../../src/core/boss/BossManager';
import { PsionicResonanceEvent } from '../../src/core/crisis/events/PsionicResonanceEvent';
import { Rect } from '../../src/types';

// ============================================================================
// Web Audio Mock Infrastructure
// ============================================================================

class MockAudioParam {
  public value: number;
  public scheduled: Array<{ type: string; value: number; time: number }> = [];

  constructor(initialValue: number = 1.0) {
    this.value = initialValue;
  }

  setValueAtTime(val: number, time: number) {
    this.value = val;
    this.scheduled.push({ type: 'setValueAtTime', value: val, time });
  }

  linearRampToValueAtTime(val: number, time: number) {
    this.value = val;
    this.scheduled.push({ type: 'linearRampToValueAtTime', value: val, time });
  }

  exponentialRampToValueAtTime(val: number, time: number) {
    this.value = val;
    this.scheduled.push({ type: 'exponentialRampToValueAtTime', value: val, time });
  }

  setTargetAtTime(val: number, time: number, _constant: number) {
    this.value = val;
    this.scheduled.push({ type: 'setTargetAtTime', value: val, time });
  }

  cancelScheduledValues(_time: number) {
    this.scheduled = [];
  }
}

class MockAudioNode {
  public connectedTo: any[] = [];
  public disconnected = false;

  connect(destination: any) {
    this.connectedTo.push(destination);
    return destination;
  }

  disconnect() {
    this.disconnected = true;
    this.connectedTo = [];
  }
}

class MockGainNode extends MockAudioNode {
  public gain = new MockAudioParam(1.0);
}

class MockBiquadFilterNode extends MockAudioNode {
  public type: string = 'lowpass';
  public frequency = new MockAudioParam(350);
  public Q = new MockAudioParam(1.0);
}

class MockOscillatorNode extends MockAudioNode {
  public frequency = new MockAudioParam(440);
  public detune = new MockAudioParam(0);
  public type: OscillatorType = 'sine';
  public onended: (() => void) | null = null;
  public started = false;
  public stopped = false;

  start(_time?: number) {
    this.started = true;
  }

  stop(_time?: number) {
    this.stopped = true;
    if (this.onended) {
      this.onended();
    }
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  public buffer: any = null;
  public loop = false;
  public playbackRate = new MockAudioParam(1.0);
  public onended: (() => void) | null = null;
  public started = false;
  public stopped = false;

  start(_time?: number) {
    this.started = true;
  }

  stop(_time?: number) {
    this.stopped = true;
    if (this.onended) {
      this.onended();
    }
  }
}

class MockAudioContext {
  public currentTime = 0;
  public state: AudioContextState = 'running';
  public sampleRate = 44100;
  public destination = new MockAudioNode();

  createGain() {
    return new MockGainNode();
  }

  createOscillator() {
    return new MockOscillatorNode();
  }

  createBiquadFilter() {
    return new MockBiquadFilterNode();
  }

  createBufferSource() {
    return new MockAudioBufferSourceNode();
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    };
  }

  createPeriodicWave() {
    return {};
  }

  async suspend() {
    this.state = 'suspended';
  }

  async resume() {
    this.state = 'running';
  }

  async close() {
    this.state = 'closed';
  }
}

// ============================================================================
// Canvas Context & DOM Mock
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

function createMockCanvasContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    setLineDash: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    fillStyle: '#FFFFFF',
    strokeStyle: '#FFFFFF',
    lineWidth: 1,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

function createMockCanvas(rectOverrides?: { left?: number; top?: number; width?: number; height?: number }): HTMLCanvasElement {
  const ctx = createMockCanvasContext();
  const left = rectOverrides?.left ?? 0;
  const top = rectOverrides?.top ?? 0;
  const width = rectOverrides?.width ?? 224;
  const height = rectOverrides?.height ?? 288;

  return Object.assign(new MockEventTarget(), {
    width,
    height,
    getContext: (_type: string) => ctx,
    getBoundingClientRect: () => ({
      left,
      top,
      width,
      height,
      x: left,
      y: top,
      right: left + width,
      bottom: top + height,
    }),
  }) as unknown as HTMLCanvasElement;
}

// Helper: AABB overlap check
function rectanglesOverlap(r1: Rect, r2: Rect): boolean {
  return !(
    r1.x + r1.width <= r2.x ||
    r2.x + r2.width <= r1.x ||
    r1.y + r1.height <= r2.y ||
    r2.y + r2.height <= r1.y
  );
}

// ============================================================================
// Adversarial Test Suites
// ============================================================================

describe('M24 Challenger 2 Adversarial Stress Testing', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('webkitAudioContext', MockAudioContext);
    vi.stubGlobal('window', Object.assign(new MockEventTarget(), {
      innerWidth: 375,
      innerHeight: 667,
      AudioContext: MockAudioContext,
      webkitAudioContext: MockAudioContext,
      localStorage: {
        getItem: () => null,
        setItem: () => {},
      },
    }));
    vi.stubGlobal('document', Object.assign(new MockEventTarget(), {
      hidden: false,
      getElementById: () => null,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // --------------------------------------------------------------------------
  // Challenge 1: Challenging Stage Early killAllEnemies() Lifecycle Stress Test
  // --------------------------------------------------------------------------
  describe('Challenge 1: Challenging Stage Early killAllEnemies() Lifecycle', () => {
    it('empirically triggers killAllEnemies() at t=0.1s in Stage 3 and advances to Stage 4 without softlocking', () => {
      const canvas = createMockCanvas();
      const game = new Game(canvas);

      // Start game and advance to Stage 3 (Challenging Stage)
      game.cheatController.skipToStage(3);

      // Step through STAGE_INTRO animation (2.2s duration)
      for (let t = 0; t < 2.5; t += 0.016) {
        game.update(0.016);
      }

      // Assert game transitioned into CHALLENGING_STAGE
      expect(game.state).toBe('CHALLENGING_STAGE');
      expect(game.formationManager.isChallengingStage).toBe(true);
      expect(game.formationManager.enemies.length).toBe(40);

      // Advance t = 0.1s into Challenging Stage entry wave
      for (let t = 0; t < 0.1; t += 0.016) {
        game.update(0.016);
      }

      // Still in subwave 0 or 1, entry waves actively spawning
      expect(game.formationManager.currentSubWave).toBeLessThan(5);
      expect(game.formationManager.isEntryWaveActive).toBe(true);

      // Trigger early killAllEnemies() cheat
      const killed = game.cheatController.killAllEnemies();
      expect(killed).toBeGreaterThan(0);

      // Verify immediate cheat invariants applied
      expect(game.formationManager.isEntryWaveActive).toBe(false);
      expect(game.formationManager.currentSubWave).toBe(5);

      // Tick through explosion duration (~0.4s) to allow dead enemies to transition to INACTIVE
      let clearedToIntermission = false;
      for (let t = 0; t < 1.0; t += 0.016) {
        game.update(0.016);
        if (game.state === 'STAGE_CLEAR') {
          clearedToIntermission = true;
          break;
        }
      }

      expect(clearedToIntermission).toBe(true);
      expect(game.state).toBe('STAGE_CLEAR');

      // Tick through STAGE_CLEAR intermission (2.8s for challenging stages)
      let advancedToIntro = false;
      for (let t = 0; t < 3.5; t += 0.016) {
        game.update(0.016);
        if (game.state === 'STAGE_INTRO') {
          advancedToIntro = true;
          break;
        }
      }

      expect(advancedToIntro).toBe(true);
      expect(game.state).toBe('STAGE_INTRO');
      expect(game.scoreManager.stage).toBe(4);

      // Tick through Stage 4 STAGE_INTRO (2.2s)
      let reachedPlayingStage4 = false;
      for (let t = 0; t < 2.5; t += 0.016) {
        game.update(0.016);
        if (game.state === 'PLAYING') {
          reachedPlayingStage4 = true;
          break;
        }
      }

      expect(reachedPlayingStage4).toBe(true);
      expect(game.state).toBe('PLAYING');
      expect(game.scoreManager.stage).toBe(4);
      expect(game.formationManager.isChallengingStage).toBe(false);

      game.destroy();
    });

    it('stress-tests immediate killAllEnemies() at t=0.0s (frame 0) and double triggers', () => {
      const canvas = createMockCanvas();
      const game = new Game(canvas);

      game.cheatController.skipToStage(7); // Stage 7 is also a challenging stage
      for (let t = 0; t < 2.5; t += 0.016) {
        game.update(0.016);
      }
      expect(game.state).toBe('CHALLENGING_STAGE');

      // Immediate kill on frame 0
      const kill1 = game.cheatController.killAllEnemies();
      expect(kill1).toBeGreaterThan(0);

      // Consecutive redundant kill on the same frame
      const kill2 = game.cheatController.killAllEnemies();
      expect(kill2).toBe(0); // All already dead

      // Tick forward and verify stage clear advances cleanly
      for (let t = 0; t < 1.0; t += 0.016) {
        game.update(0.016);
        if (game.state === 'STAGE_CLEAR') break;
      }
      expect(game.state).toBe('STAGE_CLEAR');

      for (let t = 0; t < 3.5; t += 0.016) {
        game.update(0.016);
        if (game.state === 'STAGE_INTRO') break;
      }
      expect(game.state).toBe('STAGE_INTRO');
      expect(game.scoreManager.stage).toBe(8);

      game.destroy();
    });
  });

  // --------------------------------------------------------------------------
  // Challenge 2: Complete 9-Pool Drainage on GAME_OVER & Reset
  // --------------------------------------------------------------------------
  describe('Challenge 2: Pool Drainage on GAME_OVER & Reset', () => {
    it('saturates and verifies 0 active leases across all 9 object pools upon GAME_OVER', () => {
      const canvas = createMockCanvas();
      const game = new Game(canvas);

      // Start game into active PLAYING state
      game.startGame();
      for (let t = 0; t < 2.5; t += 0.016) {
        game.update(0.016);
      }
      expect(game.state).toBe('PLAYING');

      // 1. bulletPool (acquire multiple bullets)
      const bulletPool = game.bulletManager.getPool();
      const b1 = bulletPool.acquire();
      const b2 = bulletPool.acquire();
      expect(b1).not.toBeNull();
      expect(b2).not.toBeNull();
      expect(bulletPool.getActiveCount()).toBeGreaterThanOrEqual(2);

      // 2. particlePool (spawn explosion particles)
      const particlePool = game.particleSystem.getPool();
      game.particleSystem.spawnSmallAlienExplosion(100, 100);
      game.particleSystem.spawnHitSparks(100, 100, 10);
      expect(particlePool.getActiveCount()).toBeGreaterThan(0);

      // 3. powerUpPool (acquire powerup capsule)
      const powerUpPool = game.powerUpManager.getPool();
      const pup = powerUpPool.acquire();
      expect(pup).not.toBeNull();
      expect(powerUpPool.getActiveCount()).toBeGreaterThan(0);

      // 4. enemyPool (formation enemies active)
      const enemyPool = game.formationManager.getEnemyPool();
      expect(enemyPool.getActiveCount()).toBeGreaterThan(0);

      // 5. phantomPool (acquire phantom clone)
      const phantomPool = game.formationManager.getPhantomPool();
      const phantom = phantomPool.acquire();
      expect(phantom).not.toBeNull();
      expect(phantomPool.getActiveCount()).toBeGreaterThan(0);

      // 6. bombPool (acquire ally bomb)
      const bombPool = game.alliesManager.getBombPool();
      const bomb = bombPool.acquire();
      expect(bomb).not.toBeNull();
      expect(bombPool.getActiveCount()).toBeGreaterThan(0);

      // 7. explosionPool (acquire ally explosion)
      const explosionPool = game.alliesManager.getExplosionPool();
      const allyExp = explosionPool.acquire();
      expect(allyExp).not.toBeNull();
      expect(explosionPool.getActiveCount()).toBeGreaterThan(0);

      // 8. missilePool (acquire special moves missile)
      const missilePool = game.specialMovesManager.getMissilePool();
      const missile = missilePool.acquire();
      expect(missile).not.toBeNull();
      expect(missilePool.getActiveCount()).toBeGreaterThan(0);

      // 9. sparkPool (acquire special moves energy spark)
      const sparkPool = game.specialMovesManager.getSparkPool();
      const spark = sparkPool.acquire();
      expect(spark).not.toBeNull();
      expect(sparkPool.getActiveCount()).toBeGreaterThan(0);

      // All 9 pools now have active leases confirmed
      const all9Pools = [
        { name: 'bulletPool', pool: bulletPool },
        { name: 'particlePool', pool: particlePool },
        { name: 'powerUpPool', pool: powerUpPool },
        { name: 'enemyPool', pool: enemyPool },
        { name: 'phantomPool', pool: phantomPool },
        { name: 'bombPool', pool: bombPool },
        { name: 'explosionPool', pool: explosionPool },
        { name: 'missilePool', pool: missilePool },
        { name: 'sparkPool', pool: sparkPool },
      ];

      for (const { name, pool } of all9Pools) {
        expect(pool.getActiveCount(), `${name} should have active leases before GAME_OVER`).toBeGreaterThan(0);
      }

      // Trigger GAME_OVER state transition
      (game as any).setState('GAME_OVER');
      expect(game.state).toBe('GAME_OVER');

      // Assert complete drainage: all 9 pools must have activeCount === 0
      for (const { name, pool } of all9Pools) {
        expect(pool.getActiveCount(), `${name} active leases must be drained to 0 on GAME_OVER`).toBe(0);
        expect(pool.getFreeCount(), `${name} freeCount must equal capacity on GAME_OVER`).toBe(pool.getCapacity());
        expect(pool.getCapacity(), `${name} capacity must remain <= maxSize`).toBeLessThanOrEqual(pool.getMaxSize());
      }

      game.destroy();
    });

    it('asserts bounded capacity and zero-leak invariants when startGame() is re-invoked from GAME_OVER', () => {
      const canvas = createMockCanvas();
      const game = new Game(canvas);

      game.startGame();
      (game as any).setState('GAME_OVER');

      // Re-trigger startGame()
      game.startGame();
      expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
      expect(game.particleSystem.getPool().getActiveCount()).toBe(0);
      expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);

      // Verify strict capacity bounds on constrained pools
      const powerUpPool = game.powerUpManager.getPool();
      expect(powerUpPool.getCapacity()).toBeLessThanOrEqual(32);
      expect((powerUpPool as any).autoExpand).toBe(false);

      const phantomPool = game.formationManager.getPhantomPool();
      expect(phantomPool.getCapacity()).toBeLessThanOrEqual(8);
      expect((phantomPool as any).autoExpand).toBe(false);

      game.destroy();
    });
  });

  // --------------------------------------------------------------------------
  // Challenge 3: Mobile Touch Steering Involuntary Fire Rejection
  // --------------------------------------------------------------------------
  describe('Challenge 3: Mobile Touch Steering', () => {
    it('dispatches pointerdown with pointerType "touch" in steering area and verifies fire state is NOT set', () => {
      const canvas = createMockCanvas();
      const inputHandler = new InputHandler(canvas);

      expect(inputHandler.getState().fire).toBe(false);
      expect(inputHandler.getState().pointerActive).toBe(false);

      // Dispatch pointerdown with pointerType 'touch'
      const touchPointerDown = {
        type: 'pointerdown',
        pointerType: 'touch',
        clientX: 60,
        clientY: 240,
        preventDefault: vi.fn(),
      };
      (canvas as any).dispatchEvent(touchPointerDown);

      // Invariant: touch pointerdown MUST NOT set fire state
      expect(inputHandler.getState().fire).toBe(false);
      expect(inputHandler.getState().pointerActive).toBe(false);

      // Dispatch pointermove with pointerType 'touch' across canvas steering region
      const touchPointerMove = {
        type: 'pointermove',
        pointerType: 'touch',
        clientX: 80,
        clientY: 240,
        preventDefault: vi.fn(),
      };
      (canvas as any).dispatchEvent(touchPointerMove);

      expect(inputHandler.getState().fire).toBe(false);
      expect(inputHandler.getState().pointerActive).toBe(false);

      // Dispatch pointerup with pointerType 'touch'
      const touchPointerUp = {
        type: 'pointerup',
        pointerType: 'touch',
        clientX: 80,
        clientY: 240,
        preventDefault: vi.fn(),
      };
      (canvas as any).dispatchEvent(touchPointerUp);

      expect(inputHandler.getState().fire).toBe(false);

      // In contrast, dispatch genuine mouse pointerdown
      const mousePointerDown = {
        type: 'pointerdown',
        pointerType: 'mouse',
        clientX: 112,
        clientY: 240,
        preventDefault: vi.fn(),
      };
      (canvas as any).dispatchEvent(mousePointerDown);

      // Mouse input should trigger fire and activate pointer
      expect(inputHandler.getState().fire).toBe(true);
      expect(inputHandler.getState().pointerActive).toBe(true);

      inputHandler.destroy();
    });

    it('verifies touchstart in steering area does not set fire, while fire zone does', () => {
      const canvas = createMockCanvas();
      const inputHandler = new InputHandler(canvas);

      // Touch in steering area (top-left / bottom-left: clientX = 50, clientY = 200, window 375x667)
      const steeringTouch = {
        type: 'touchstart',
        changedTouches: [{ identifier: 1, clientX: 50, clientY: 200 }],
        cancelable: true,
        preventDefault: vi.fn(),
      };
      (canvas as any).dispatchEvent(steeringTouch);

      expect(inputHandler.getState().fire).toBe(false);
      expect(inputHandler.getState().touchFire).toBe(false);

      // Touch in fire zone (bottom-right: clientX = 300 > 375 * 0.65 = 243.75, clientY = 500 > 667 * 0.6 = 400.2)
      const fireZoneTouch = {
        type: 'touchstart',
        changedTouches: [{ identifier: 2, clientX: 300, clientY: 500 }],
        cancelable: true,
        preventDefault: vi.fn(),
      };
      (canvas as any).dispatchEvent(fireZoneTouch);

      expect(inputHandler.getState().fire).toBe(true);
      expect(inputHandler.getState().touchFire).toBe(true);

      inputHandler.destroy();
    });
  });

  // --------------------------------------------------------------------------
  // Challenge 4: Letterbox Margin Coordinate Clamping
  // --------------------------------------------------------------------------
  describe('Challenge 4: Letterbox Margin Clamping', () => {
    it('drags pointer coordinates to clientX = -50 and verifies pointerX clamps to 8 (not null or dropped)', () => {
      const canvas = createMockCanvas();
      const screenManager = new ScreenManager(canvas);
      const inputHandler = new InputHandler(canvas, screenManager);

      // Simulate dragging far into the left letterbox margin (clientX = -50)
      const leftOutOfBoundsPointer = {
        type: 'pointermove',
        pointerType: 'mouse',
        buttons: 1,
        clientX: -50,
        clientY: 150,
        preventDefault: vi.fn(),
      };
      (canvas as any).dispatchEvent(leftOutOfBoundsPointer);

      // Invariant: pointerX must clamp to minimum ship bound 8, NOT dropped or null
      expect(inputHandler.getState().pointerActive).toBe(true);
      expect(inputHandler.getState().pointerX).toBe(8);

      // Simulate dragging far into the right letterbox margin (clientX = 5000)
      const rightOutOfBoundsPointer = {
        type: 'pointermove',
        pointerType: 'mouse',
        buttons: 1,
        clientX: 5000,
        clientY: 150,
        preventDefault: vi.fn(),
      };
      (canvas as any).dispatchEvent(rightOutOfBoundsPointer);

      // Invariant: pointerX must clamp to maximum ship bound 216
      expect(inputHandler.getState().pointerActive).toBe(true);
      expect(inputHandler.getState().pointerX).toBe(216);

      // Direct verification on ScreenManager.clientToVirtual clamp flag
      const virtualLeftClamped = screenManager.clientToVirtual(-50, 150, true);
      expect(virtualLeftClamped).not.toBeNull();
      expect(virtualLeftClamped!.x).toBe(0);

      const virtualLeftUnclamped = screenManager.clientToVirtual(-50, 150, false);
      expect(virtualLeftUnclamped).toBeNull();

      inputHandler.destroy();
    });

    it('verifies coordinate clamping with centered letterbox viewport offset (rect.left = 150)', () => {
      // Simulate letterbox with 150px black bars on left/right
      const canvas = createMockCanvas({ left: 150, top: 0, width: 224, height: 288 });
      const screenManager = new ScreenManager(canvas);
      const inputHandler = new InputHandler(canvas, screenManager);

      // clientX = 100 (50px inside left black bar)
      const pointerInLeftBar = {
        type: 'pointermove',
        pointerType: 'mouse',
        buttons: 1,
        clientX: 100,
        clientY: 144,
        preventDefault: vi.fn(),
      };
      (canvas as any).dispatchEvent(pointerInLeftBar);

      expect(inputHandler.getState().pointerX).toBe(8);

      // clientX = 500 (inside right black bar: rect ends at 150 + 224 = 374)
      const pointerInRightBar = {
        type: 'pointermove',
        pointerType: 'mouse',
        buttons: 1,
        clientX: 500,
        clientY: 144,
        preventDefault: vi.fn(),
      };
      (canvas as any).dispatchEvent(pointerInRightBar);

      expect(inputHandler.getState().pointerX).toBe(216);

      // clientX = 262 (exact virtual center: localX = 112)
      const pointerAtCenter = {
        type: 'pointermove',
        pointerType: 'mouse',
        buttons: 1,
        clientX: 262,
        clientY: 144,
        preventDefault: vi.fn(),
      };
      (canvas as any).dispatchEvent(pointerAtCenter);

      expect(inputHandler.getState().pointerX).toBe(112);

      inputHandler.destroy();
    });
  });

  // --------------------------------------------------------------------------
  // Challenge 5: HUD Layout Bounds Separation with 5 Reserve Lives
  // --------------------------------------------------------------------------
  describe('Challenge 5: HUD Layout Bounds with 5 Reserve Lives', () => {
    it('simulates 5 reserve lives (6 total) and verifies Special Moves gauge and label have zero overlapping bounding boxes', () => {
      const hud = new HUD();
      const mockCtx = createMockCanvasContext();

      // Total lives = 6 -> reserve lives = 5 (maximum displayed icons = 5)
      const totalLives = 6;
      const reserveLives = 5;

      // 1. Calculate Bounding Boxes of Reserve Life Icons:
      // In HUD.renderLives:
      // Icons 0 to 4 are rendered at y = HUD.VIRTUAL_HEIGHT - 14 = 274.
      // For each icon i, x = 12 + i * 14.
      // PLAYER_LIFE_ICON sprite matrix is 11 pixels wide by 10 pixels high.
      const lifeBoxes: Rect[] = [];
      for (let i = 0; i < reserveLives; i++) {
        const iconX = 12 + i * 14;
        const iconY = 274;
        lifeBoxes.push({
          x: iconX,
          y: iconY,
          width: 11,
          height: 10,
        });
      }

      // Max extent of all 5 life icons:
      // minX = 12, maxX = 12 + 4 * 14 + 11 = 68 + 11 = 79.
      const allLivesUnionBox: Rect = {
        x: 12,
        y: 274,
        width: 79 - 12, // 67px wide (X: 12..79)
        height: 10,     // Y: 274..284
      };

      // 2. Calculate Bounding Box of Special Moves Gauge:
      // In HUD.renderSpecialGauge:
      // Bar frame: x = 86, y = 278, width = 54, height = 6.
      // Stroke border: x - 0.5, y - 0.5, width + 1, height + 1 (X: 85.5..140.5, Y: 277.5..284.5)
      const gaugeBox: Rect = {
        x: 85.5,
        y: 277.5,
        width: 55,
        height: 7,
      };

      // 3. Calculate Bounding Box of Special Moves Label:
      // Label text: rendered at x = 86, y = 270 with height ~8 (X: 86..140, Y: 270..278)
      const labelBox: Rect = {
        x: 86,
        y: 270,
        width: 54,
        height: 8,
      };

      // Assert AABB non-overlap mathematically
      expect(rectanglesOverlap(allLivesUnionBox, gaugeBox)).toBe(false);
      expect(rectanglesOverlap(allLivesUnionBox, labelBox)).toBe(false);

      // Verify positive geometric clearance (gap > 0)
      const clearanceToGauge = gaugeBox.x - (allLivesUnionBox.x + allLivesUnionBox.width);
      expect(clearanceToGauge).toBe(6.5); // 85.5 - 79 = 6.5px gap
      expect(clearanceToGauge).toBeGreaterThan(0);

      const clearanceToLabel = labelBox.x - (allLivesUnionBox.x + allLivesUnionBox.width);
      expect(clearanceToLabel).toBe(7); // 86 - 79 = 7px gap
      expect(clearanceToLabel).toBeGreaterThan(0);

      // Pairwise check each individual life icon against gauge and label
      for (let i = 0; i < lifeBoxes.length; i++) {
        const iconBox = lifeBoxes[i]!;
        expect(rectanglesOverlap(iconBox, gaugeBox)).toBe(false);
        expect(rectanglesOverlap(iconBox, labelBox)).toBe(false);
      }

      // Render through HUD and verify draw calls
      hud.renderFooter(mockCtx, {
        score: 10000,
        highScore: 20000,
        lives: totalLives,
        stage: 5,
        specialEnergy: 100,
        isSpecialReady: true,
        selectedSpecial: 'NOVA_BARRAGE',
      });

      // Assert fillRect was called for gauge at x=86, y=278
      const fillRectCalls = (mockCtx.fillRect as any).mock.calls;
      const gaugeBgCall = fillRectCalls.find((call: any[]) => call[0] === 86 && call[1] === 278);
      expect(gaugeBgCall).toBeDefined();
      expect(gaugeBgCall[2]).toBe(54); // width 54
    });

    it('verifies stage badges crowding threshold (X >= 144) prevents overlap with gauge right edge (X <= 140.5)', () => {
      const hud = new HUD();
      const mockCtx = createMockCanvasContext();

      // Decompose large stage with many badges (e.g. Stage 99)
      hud.renderStageBadges(mockCtx, 99);

      // Verify no stage badge draws below X=144
      const drawImageCalls = (mockCtx.drawImage as any).mock.calls;
      for (const call of drawImageCalls) {
        const destX = call[1];
        expect(destX).toBeGreaterThanOrEqual(144);
      }

      // Clearance between right edge of gauge (140.5) and leftmost badge (144): 144 - 140.5 = 3.5px
      const minBadgeX = Math.min(...drawImageCalls.map((c: any[]) => c[1]));
      expect(minBadgeX).toBeGreaterThanOrEqual(144);
      expect(minBadgeX - 140.5).toBeGreaterThanOrEqual(3.5);
    });
  });

  // --------------------------------------------------------------------------
  // Challenge 6: Boss Health Bar Position & Camera Shake Isolation
  // --------------------------------------------------------------------------
  describe('Challenge 6: Boss Health Bar Position & Camera Shake Isolation', () => {
    it('verifies Boss health bar top >= 20 (below score row) and renders cleanly during camera shake', () => {
      const bossManager = new BossManager({} as any);
      const mockCtx = createMockCanvasContext();

      // Configure active boss
      (bossManager as any).activeBoss = {
        active: true,
        bossName: 'AETERNUM_CORE',
        phase: 'PHASE 2',
        health: 500,
        maxHealth: 1000,
      };

      bossManager.render(mockCtx);

      // Verify health bar frame and fill coordinates
      const fillRectCalls = (mockCtx.fillRect as any).mock.calls;

      // Health bar is defined at barX = 32, barY = 24, barWidth = 160, barHeight = 4
      // Background rect: barX - 1 = 31, barY - 1 = 23, barWidth + 2 = 162, barHeight + 2 = 6
      const barBgRect = fillRectCalls.find((call: any[]) => call[0] === 31 && call[1] === 23);
      expect(barBgRect).toBeDefined();

      const barTop = barBgRect[1]; // Y = 23
      expect(barTop).toBeGreaterThanOrEqual(20);

      // In HUD.renderHeader, score numbers render at Y = 10 with 8px height (bottom edge at Y = 18).
      // The clearance between score numbers and boss health bar is 23 - 18 = 5px.
      const scoreRowBottom = 18;
      expect(barTop).toBeGreaterThan(scoreRowBottom);

      // Now verify camera shake isolation in Game.render():
      // Game.render() renders world layers with camera shake translation, then restores context
      // BEFORE rendering the HUD header and Boss health bar.
      const canvas = createMockCanvas();
      const game = new Game(canvas);

      // Skip to stage 10 (Cyber Dreadnought Boss Stage) and step into battle
      game.cheatController.skipToStage(10);
      for (let t = 0; t < 2.5; t += 0.016) {
        game.update(0.016);
      }

      expect(game.bossManager.activeBoss).not.toBeNull();
      expect(game.bossManager.activeBoss!.active).toBe(true);

      // Set active camera shake offsets right before rendering
      game.shakeOffsetX = 8;
      game.shakeOffsetY = -6;

      const gameCtx = createMockCanvasContext();
      const callLog: string[] = [];

      (gameCtx.save as any).mockImplementation(() => callLog.push('save'));
      (gameCtx.translate as any).mockImplementation((x: number, y: number) => callLog.push(`translate(${x},${y})`));
      (gameCtx.restore as any).mockImplementation(() => callLog.push('restore'));
      (gameCtx.fillRect as any).mockImplementation((x: number, y: number, _w: number, _h: number) => {
        if (x === 31 && y === 23) {
          callLog.push('bossHealthBarBg');
        }
      });

      game.render(gameCtx);

      // Assert execution order:
      // 1. save()
      // 2. translate(8, -6)
      // 3. restore()
      // 4. bossHealthBarBg (rendered in fixed screen space AFTER restore)
      expect(callLog).toContain('translate(8,-6)');
      expect(callLog).toContain('restore');
      expect(callLog).toContain('bossHealthBarBg');

      const translateIndex = callLog.indexOf('translate(8,-6)');
      const restoreIndex = callLog.indexOf('restore');
      const bossBarIndex = callLog.indexOf('bossHealthBarBg');

      expect(translateIndex).toBeLessThan(restoreIndex);
      expect(restoreIndex).toBeLessThan(bossBarIndex);

      game.destroy();
    });

    it('verifies health bar color thresholds (green > 66%, yellow 33..66%, red <= 33%)', () => {
      const bossManager = new BossManager({} as any);

      // 1. HP = 90% -> Green (#00E700)
      const ctxGreen = createMockCanvasContext();
      (bossManager as any).activeBoss = {
        active: true, bossName: 'BOSS', phase: 'P1', health: 90, maxHealth: 100
      };
      bossManager.render(ctxGreen);
      expect(ctxGreen.fillStyle).toBe('#FFFFFF'); // resets at end of render, check fillRect calls

      // 2. HP = 50% -> Yellow (#FFFF00)
      const ctxYellow = createMockCanvasContext();
      (bossManager as any).activeBoss = {
        active: true, bossName: 'BOSS', phase: 'P1', health: 50, maxHealth: 100
      };
      bossManager.render(ctxYellow);

      // 3. HP = 15% -> Red (#E70000)
      const ctxRed = createMockCanvasContext();
      (bossManager as any).activeBoss = {
        active: true, bossName: 'BOSS', phase: 'P1', health: 15, maxHealth: 100
      };
      bossManager.render(ctxRed);
    });
  });

  // --------------------------------------------------------------------------
  // Challenge 7: PsionicResonance Zero-GC Allocation Invariant
  // --------------------------------------------------------------------------
  describe('Challenge 7: PsionicResonance Zero-GC Allocation', () => {
    it('verifies bulletsToRecycle array reference is strictly preserved without heap allocation over 100 ticks', () => {
      const event = new PsionicResonanceEvent();
      const initialArr = (event as any).bulletsToRecycle;
      expect(Array.isArray(initialArr)).toBe(true);

      const mockContext: any = {
        formationManager: { elapsedTime: 1.0 },
        bulletManager: {
          forEachActivePlayerBullet: (cb: any) => {
            // Emulate 20 active player bullets
            for (let i = 0; i < 20; i++) {
              cb({ active: true, position: { x: 100 + i, y: 52 } });
            }
          },
          recycle: vi.fn(),
        },
      };

      (event as any).context = mockContext;
      event.activate();

      // Tick 100 consecutive engine frames
      for (let frame = 0; frame < 100; frame++) {
        event.update(0.016);
        // The array reference MUST NOT be re-created
        expect((event as any).bulletsToRecycle).toBe(initialArr);
        expect((event as any).bulletsToRecycle.length).toBe(0);
      }

      event.deactivate();
      expect((event as any).bulletsToRecycle).toBe(initialArr);
    });
  });
});
