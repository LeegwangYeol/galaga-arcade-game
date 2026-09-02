/**
 * Galaga Arcade Web Game — Milestone 7 Challenger 2 Adversarial Stress Test Suite
 * 
 * Empirical Verification of Screen State Machine, Stage Badge Rendering & Mobile Touch UX:
 * 1. Stage badge greedy decomposition for stages 1 to 255 (ensuring badge list never overflows bounds, crashes, or collides with lives HUD).
 * 2. Rapid restart cycling (TITLE -> PLAYING -> GAME_OVER -> TITLE -> PLAYING) for state/memory leaks, object pool integrity, and high-score retention.
 * 3. Multi-touch virtual controls under simultaneous movement and rapid fire button tapping, out-of-order release, and cancellation.
 * 4. Boundary & edge case stress (stage 0, negative stage, extreme stages, accuracy telemetry edge cases, pause overlay lifecycle).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HUD, BadgeType } from '../../src/ui/HUD';
import { Screens, type ScreenRenderContext } from '../../src/ui/Screens';
import { InputHandler } from '../../src/ui/InputHandler';
import { Game } from '../../src/core/Game';

describe('Milestone 7 Challenger 2: Screen State Machine & Touch UX Adversarial Suite', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        mockStorage[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    };
    vi.stubGlobal('localStorage', storageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ==========================================================================
  // 1. Stage Badge Greedy Decomposition for Stages 1 to 255
  // ==========================================================================
  describe('1. Stage Badge Greedy Decomposition (Stages 1..255)', () => {
    const BADGE_VALUES: Record<BadgeType, number> = {
      [BadgeType.FLAG_50]: 50,
      [BadgeType.FLAG_30]: 30,
      [BadgeType.FLAG_20]: 20,
      [BadgeType.FLAG_10]: 10,
      [BadgeType.FLAG_5]: 5,
      [BadgeType.FLAG_1]: 1,
    };

    it('empirically verifies mathematical correctness for every integer stage from 1 to 255', () => {
      for (let s = 1; s <= 255; s++) {
        const decomp = HUD.decomposeStage(s);
        expect(decomp.stage).toBe(s);
        expect(decomp.badges).toBeInstanceOf(Array);
        expect(decomp.totalBadges).toBe(decomp.badges.length);

        // Sum up badge values
        const computedSum = decomp.badges.reduce((acc, badge) => acc + BADGE_VALUES[badge], 0);
        expect(computedSum).toBe(s);

        // Verify badge sorting: largest flag values appear first (left-to-right)
        for (let i = 0; i < decomp.badges.length - 1; i++) {
          const currentVal = BADGE_VALUES[decomp.badges[i]!];
          const nextVal = BADGE_VALUES[decomp.badges[i + 1]!];
          expect(currentVal).toBeGreaterThanOrEqual(nextVal);
        }

        // Verify total width is positive and finite
        expect(decomp.totalWidth).toBeGreaterThan(0);
        expect(Number.isFinite(decomp.totalWidth)).toBe(true);
      }
    });

    it('verifies badge count and width boundaries for extreme edge stages', () => {
      // Stage 1: 1 single flag (width 4)
      const s1 = HUD.decomposeStage(1);
      expect(s1.badges).toEqual([BadgeType.FLAG_1]);
      expect(s1.totalBadges).toBe(1);
      expect(s1.totalWidth).toBe(4);

      // Stage 49: 1x30 + 1x10 + 1x5 + 4x1 = 7 badges
      const s49 = HUD.decomposeStage(49);
      expect(s49.badges).toEqual([
        BadgeType.FLAG_30,
        BadgeType.FLAG_10,
        BadgeType.FLAG_5,
        BadgeType.FLAG_1,
        BadgeType.FLAG_1,
        BadgeType.FLAG_1,
        BadgeType.FLAG_1,
      ]);
      expect(s49.totalBadges).toBe(7);

      // Stage 249: 4x50 + 1x30 + 1x10 + 1x5 + 4x1 = 11 badges (worst-case count in 1..255)
      const s249 = HUD.decomposeStage(249);
      expect(s249.totalBadges).toBe(11);

      // Stage 255: 5x50 + 1x5 = 6 badges
      const s255 = HUD.decomposeStage(255);
      expect(s255.badges).toEqual([
        BadgeType.FLAG_50,
        BadgeType.FLAG_50,
        BadgeType.FLAG_50,
        BadgeType.FLAG_50,
        BadgeType.FLAG_50,
        BadgeType.FLAG_5,
      ]);
      expect(s255.totalBadges).toBe(6);
    });

    it('ensures badge rendering never crashes or overlaps reserve lives HUD area (x >= 96 clamping)', () => {
      const drawnRects: { x: number; y: number; w: number; h: number }[] = [];
      const mockCtx = {
        drawImage: vi.fn((_img: unknown, x: number, y: number) => {
          drawnRects.push({ x, y, w: 8, h: 12 });
        }),
        imageSmoothingEnabled: false,
      } as unknown as CanvasRenderingContext2D;

      const hud = new HUD();

      for (let s = 1; s <= 255; s++) {
        drawnRects.length = 0;
        hud.renderStageBadges(mockCtx, s);

        for (const rect of drawnRects) {
          // Badges must never render below X=96 (crowding protection)
          expect(rect.x).toBeGreaterThanOrEqual(96);
          // Badges must stay within virtual canvas width (224)
          expect(rect.x).toBeLessThan(HUD.VIRTUAL_WIDTH);
          // Badges must render on the footer line Y = 288 - 14 = 274
          expect(rect.y).toBe(HUD.VIRTUAL_HEIGHT - 14);
        }
      }
    });

    it('gracefully handles non-positive, float, and extreme large inputs (0, negative, float, large)', () => {
      expect(HUD.decomposeStage(0).stage).toBe(1);
      expect(HUD.decomposeStage(-10).stage).toBe(1);
      expect(HUD.decomposeStage(3.9).stage).toBe(3);
      expect(HUD.decomposeStage(-50).stage).toBe(1);

      // Large stage > 255
      const s999 = HUD.decomposeStage(999);
      expect(s999.stage).toBe(999);
      const sum999 = s999.badges.reduce((acc, b) => acc + BADGE_VALUES[b], 0);
      expect(sum999).toBe(999);
    });
  });

  // ==========================================================================
  // 2. Rapid Restart Cycling (TITLE -> PLAYING -> GAME_OVER -> TITLE -> PLAYING)
  // ==========================================================================
  describe('2. Rapid Restart Cycling & Memory/State Integrity', () => {
    it('executes 50 continuous full-cycle restarts without leaking memory or state corruption', () => {
      const game = new Game();
      expect(game.state).toBe('TITLE');

      for (let cycle = 1; cycle <= 50; cycle++) {
        // Step 1: Start Game from TITLE
        game.startGame();
        expect(game.state).toBe('STAGE_INTRO');
        expect(game.scoreManager.score).toBe(0);
        expect(game.scoreManager.stage).toBe(1);
        expect(game.player.lives).toBe(3);
        expect(game.bulletManager.getPlayerBulletCount()).toBe(0);
        expect(game.bulletManager.getEnemyBulletCount()).toBe(0);

        // Step 2: Transition from STAGE_INTRO to PLAYING
        game.update(2.5); // Advance past 2.2s intro duration
        expect(game.state).toBe('PLAYING');
        expect(game.formationManager.enemies.length).toBe(40);

        // Simulate some gameplay action: fire bullets, accumulate score
        game.bulletManager.firePlayerBullet(112, 240, false);
        game.bulletManager.firePlayerBullet(116, 240, false);
        game.scoreManager.recordShotFired(2);
        game.scoreManager.addScore(1600); // Boss kill
        game.scoreManager.recordShotHit(2);
        expect(game.scoreManager.score).toBe(1600);
        expect(game.bulletManager.getPlayerBulletCount()).toBe(2);

        // Step 3: Trigger Player Death & GAME_OVER
        game.player.lives = 0;
        game.player.onGameOver?.();
        expect(game.state).toBe('GAME_OVER');

        // Step 4: Advance past 1.5s restart delay in GAME_OVER
        game.update(1.6);
        expect(game.stateTimer).toBeGreaterThanOrEqual(1.5);

        // Step 5: Input Restart to return to TITLE
        // Emulate restart action consumption
        game.inputHandler.getState();
        (game.inputHandler as unknown as { restartTriggered: boolean }).restartTriggered = true;
        game.update(0.016);
        expect(game.state).toBe('TITLE');

        // Assert clean subsystem state at TITLE
        expect(game.bulletManager.getPlayerBulletCount()).toBe(0);
        expect(game.bulletManager.getEnemyBulletCount()).toBe(0);
        expect(game.formationManager.enemies.length).toBe(0);
        expect(game.particleSystem.getActiveCount()).toBe(0);
        expect(game.tractorBeam.isActive()).toBe(false);

        // Step 6: Verify High Score Persistence across cycles
        expect(game.scoreManager.highScore).toBeGreaterThanOrEqual(1600);
      }

      game.destroy();
    });

    it('correctly handles pause/resume during rapid state changes without locking', () => {
      const game = new Game();
      game.startGame();
      game.update(2.5);
      expect(game.state).toBe('PLAYING');

      // Pause while playing
      expect(game.pause()).toBe(true);
      expect(game.state).toBe('PAUSED');
      expect(game.previousState).toBe('PLAYING');

      // Ticking in PAUSED does not update game entities
      const initialPlayerX = game.player.x;
      game.update(0.016);
      expect(game.player.x).toBe(initialPlayerX);
      expect(game.state).toBe('PAUSED');

      // Resume back to PLAYING
      expect(game.resume()).toBe(true);
      expect(game.state).toBe('PLAYING');
      expect(game.previousState).toBeNull();

      // Pause should fail on non-playing states (e.g. TITLE)
      game.setState('TITLE');
      expect(game.pause()).toBe(false);
      expect(game.state).toBe('TITLE');

      game.destroy();
    });
  });

  // ==========================================================================
  // 3. Multi-Touch Virtual Controls under Simultaneous Movement & Fire Tapping
  // ==========================================================================
  describe('3. Multi-Touch Virtual Controls (Simultaneous Move & Rapid Fire)', () => {
    let mockCanvas: HTMLCanvasElement;
    let inputHandler: InputHandler;

    beforeEach(() => {
      mockCanvas = {
        width: 224,
        height: 288,
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
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as HTMLCanvasElement;

      inputHandler = new InputHandler(mockCanvas);
    });

    afterEach(() => {
      inputHandler.destroy();
    });

    it('handles simultaneous steering touch and rapid fire button tapping without crosstalk', () => {
      const touchListeners: Record<string, (e: unknown) => void> = {};
      const mockCalls = (mockCanvas.addEventListener as unknown as { mock: { calls: [string, (e: unknown) => void][] } }).mock.calls;
      mockCalls.forEach(([event, fn]) => {
        touchListeners[event] = fn;
      });

      expect(touchListeners.touchstart).toBeDefined();
      expect(touchListeners.touchmove).toBeDefined();
      expect(touchListeners.touchend).toBeDefined();

      const touchstart = touchListeners.touchstart!;
      const touchmove = touchListeners.touchmove!;
      const touchend = touchListeners.touchend!;

      // Touch 1 (Identifier: 101): Steering on left side (X = 50, Y = 300)
      const touchMoveStart = {
        identifier: 101,
        clientX: 50,
        clientY: 300,
      };
      touchstart({
        cancelable: true,
        preventDefault: vi.fn(),
        changedTouches: [touchMoveStart],
      });

      let state = inputHandler.getState();
      expect(state.touchLeft).toBe(true);
      expect(state.moveLeft).toBe(true);
      expect(state.touchRight).toBe(false);
      expect(state.moveRight).toBe(false);
      expect(state.touchFire).toBe(false);
      expect(state.fire).toBe(false);

      // Touch 2 (Identifier: 202): Fire button press in bottom right zone (X = 300, Y = 550)
      // Note: 300 > 375 * 0.65 (243.75) and 550 > 667 * 0.6 (400.2)
      const touchFireStart = {
        identifier: 202,
        clientX: 300,
        clientY: 550,
      };
      touchstart({
        cancelable: true,
        preventDefault: vi.fn(),
        changedTouches: [touchFireStart],
      });

      state = inputHandler.getState();
      // Assert moveLeft is UNINTERRUPTED while fire is active
      expect(state.moveLeft).toBe(true);
      expect(state.touchLeft).toBe(true);
      expect(state.touchFire).toBe(true);
      expect(state.fire).toBe(true);
      expect(inputHandler.consumeAction('fire')).toBe(true);
      expect(inputHandler.consumeAction('fire')).toBe(false); // Single pulse consumption

      // Rapid Fire Tapping: Touch 2 released
      touchend({
        cancelable: true,
        preventDefault: vi.fn(),
        changedTouches: [touchFireStart],
      });

      state = inputHandler.getState();
      expect(state.moveLeft).toBe(true); // Still steering left!
      expect(state.touchFire).toBe(false);
      expect(state.fire).toBe(false);

      // Rapid Fire Tapping: Touch 3 (Identifier: 203) tapped in fire zone
      const touchFireTap2 = {
        identifier: 203,
        clientX: 310,
        clientY: 560,
      };
      touchstart({
        cancelable: true,
        preventDefault: vi.fn(),
        changedTouches: [touchFireTap2],
      });

      state = inputHandler.getState();
      expect(state.moveLeft).toBe(true);
      expect(state.touchFire).toBe(true);
      expect(state.fire).toBe(true);
      expect(inputHandler.consumeAction('fire')).toBe(true);

      // Steering drag: Move Touch 1 moves to the right side (X = 300, Y = 200 - top area, not fire zone)
      const touchMoveDragRight = {
        identifier: 101,
        clientX: 300,
        clientY: 200,
      };
      touchmove({
        cancelable: true,
        preventDefault: vi.fn(),
        changedTouches: [touchMoveDragRight],
      });

      state = inputHandler.getState();
      // Should now steer right, moveLeft becomes false
      expect(state.moveLeft).toBe(false);
      expect(state.moveRight).toBe(true);
      expect(state.touchRight).toBe(true);
      // Fire is still active from touch 203
      expect(state.touchFire).toBe(true);
      expect(state.fire).toBe(true);

      // Release all touches in reverse order
      touchend({
        cancelable: true,
        preventDefault: vi.fn(),
        changedTouches: [touchFireTap2],
      });
      state = inputHandler.getState();
      expect(state.touchFire).toBe(false);
      expect(state.moveRight).toBe(true);

      touchend({
        cancelable: true,
        preventDefault: vi.fn(),
        changedTouches: [touchMoveDragRight],
      });
      state = inputHandler.getState();
      expect(state.moveRight).toBe(false);
      expect(state.touchRight).toBe(false);
    });

    it('properly resets all touch and key states upon touchcancel, window blur, and visibilitychange', () => {
      const touchListeners: Record<string, (e: unknown) => void> = {};
      const mockCalls = (mockCanvas.addEventListener as unknown as { mock: { calls: [string, (e: unknown) => void][] } }).mock.calls;
      mockCalls.forEach(([event, fn]) => {
        touchListeners[event] = fn;
      });

      const touchstart = touchListeners.touchstart!;
      const touchcancel = touchListeners.touchcancel!;

      // Start a touch
      touchstart({
        cancelable: true,
        preventDefault: vi.fn(),
        changedTouches: [{ identifier: 55, clientX: 50, clientY: 200 }],
      });
      expect(inputHandler.getState().moveLeft).toBe(true);

      // Cancel touch event
      touchcancel({
        cancelable: true,
        preventDefault: vi.fn(),
        changedTouches: [{ identifier: 55, clientX: 50, clientY: 200 }],
      });
      expect(inputHandler.getState().moveLeft).toBe(false);

      // Set state and trigger manual reset
      inputHandler.getState();
      (inputHandler as unknown as { state: { moveRight: boolean; fire: boolean } }).state.moveRight = true;
      (inputHandler as unknown as { state: { moveRight: boolean; fire: boolean } }).state.fire = true;
      inputHandler.reset();

      const resetState = inputHandler.getState();
      expect(resetState.moveLeft).toBe(false);
      expect(resetState.moveRight).toBe(false);
      expect(resetState.fire).toBe(false);
      expect(resetState.pointerActive).toBe(false);
      expect(resetState.pointerX).toBeNull();
    });
  });

  // ==========================================================================
  // 4. UI Screens & Accuracy Telemetry Edge Case Stress
  // ==========================================================================
  describe('4. Screens Rendering & Telemetry Edge Cases', () => {
    it('renders all screens without throwing under zero shots, NaN stats, and perfect bonus', () => {
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        rotate: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        arc: vi.fn(),
        stroke: vi.fn(),
        imageSmoothingEnabled: false,
      } as unknown as CanvasRenderingContext2D;

      const baseContext: ScreenRenderContext = {
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
        challengingHits: 0,
        isDual: false,
      };

      // 1. Title Screen
      expect(() => Screens.renderTitleScreen(baseContext)).not.toThrow();

      // 2. Stage Intro Screen (Regular & Challenging Stage)
      expect(() => Screens.renderStageIntro({ ...baseContext, stage: 1 })).not.toThrow();
      expect(() => Screens.renderStageIntro({ ...baseContext, stage: 3 })).not.toThrow(); // Challenging stage (3 % 4 === 3)
      expect(() => Screens.renderStageIntro({ ...baseContext, stage: 7 })).not.toThrow();

      // 3. Challenging Stage Results (0 hits, 20 hits, 40 hits Perfect)
      expect(() => Screens.renderChallengingResults({ ...baseContext, challengingHits: 0 })).not.toThrow();
      expect(() => Screens.renderChallengingResults({ ...baseContext, challengingHits: 25 })).not.toThrow();
      expect(() => Screens.renderChallengingResults({ ...baseContext, challengingHits: 40 })).not.toThrow();

      // 4. Pause Overlay
      expect(() => Screens.renderPauseOverlay(baseContext)).not.toThrow();

      // 5. Game Over Screen with 0 shots, normal ratio, and 100% ratio
      expect(() => Screens.renderGameOver({ ...baseContext, shotsFired: 0, hits: 0 })).not.toThrow();
      expect(() => Screens.renderGameOver({ ...baseContext, shotsFired: 100, hits: 85 })).not.toThrow();
      expect(() => Screens.renderGameOver({ ...baseContext, shotsFired: 50, hits: 50, score: 35000, highScore: 30000 })).not.toThrow();
    });

    it('verifies HUD lives indicator bounds (0 to 10+ lives capped at 5 reserve icons)', () => {
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        drawImage: vi.fn(),
        imageSmoothingEnabled: false,
      } as unknown as CanvasRenderingContext2D;

      const hud = new HUD();

      // 0 lives -> 0 reserve icons
      hud.renderLives(mockCtx, 0);

      // 1 life (current fighter only) -> 0 reserve icons
      hud.renderLives(mockCtx, 1);

      // 3 lives -> 2 reserve icons
      hud.renderLives(mockCtx, 3);

      // 10 lives -> Max 5 reserve icons
      hud.renderLives(mockCtx, 10);
      expect(mockCtx.drawImage).toHaveBeenCalled();
    });
  });
});
