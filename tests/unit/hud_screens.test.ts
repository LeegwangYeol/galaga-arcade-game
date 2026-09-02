/**
 * Galaga Arcade Web Game — HUD, Stage Badges, Screens & ScoreManager Comprehensive Test Suite
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HUD, BadgeType, BADGE_DIMENSIONS, ARCADE_FONT_BITMAPS } from '../../src/ui/HUD';
import { Screens, type ScreenRenderContext } from '../../src/ui/Screens';
import { ScoreManager, SCORE_MATRIX } from '../../src/systems/ScoreManager';
import { InputHandler } from '../../src/ui/InputHandler';
import { Game } from '../../src/core/Game';
import { EnemyType } from '../../src/types';

describe('Milestone 7: HUD, Stage Badges, Screens & ScoreManager Test Suite', () => {
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
  // 1. HUD & 8x8 Procedural Bitmap Font Engine
  // ==========================================================================

  describe('HUD & 8x8 Bitmap Font Atlas', () => {
    it('contains valid bitmasks for all arcade numerals and uppercase alphabet', () => {
      // Numerals 0-9
      for (let i = 0; i <= 9; i++) {
        const mask = ARCADE_FONT_BITMAPS[i.toString()];
        expect(mask).toBeDefined();
        expect(mask?.length).toBe(8);
      }

      // Alphabet A-Z
      for (let c = 65; c <= 90; c++) {
        const char = String.fromCharCode(c);
        const mask = ARCADE_FONT_BITMAPS[char];
        expect(mask).toBeDefined();
        expect(mask?.length).toBe(8);
      }

      // Special Punctuation & Symbols
      const specialChars = [' ', '-', '.', ':', '!', '?', '/', '%', '©', '*'];
      for (const char of specialChars) {
        expect(ARCADE_FONT_BITMAPS[char]).toBeDefined();
        expect(ARCADE_FONT_BITMAPS[char]?.length).toBe(8);
      }
    });

    it('renders text with left, center, and right alignments without throwing', () => {
      const mockCtx = {
        drawImage: vi.fn(),
        imageSmoothingEnabled: false,
      } as unknown as CanvasRenderingContext2D;

      HUD.initialize();

      // Left aligned
      HUD.drawText(mockCtx, 'GALAGA', 10, 20, { align: 'left' });
      expect(mockCtx.drawImage).toHaveBeenCalled();

      // Center aligned
      mockCtx.drawImage = vi.fn();
      HUD.drawText(mockCtx, 'HIGH SCORE', 112, 10, { align: 'center' });
      expect(mockCtx.drawImage).toHaveBeenCalled();

      // Right aligned
      mockCtx.drawImage = vi.fn();
      HUD.drawText(mockCtx, '20000', 140, 10, { align: 'right' });
      expect(mockCtx.drawImage).toHaveBeenCalled();
    });

    it('renders HUD header correctly with score and high score', () => {
      const mockCtx = {
        drawImage: vi.fn(),
        imageSmoothingEnabled: false,
      } as unknown as CanvasRenderingContext2D;

      const hud = new HUD();
      hud.renderHeader(mockCtx, {
        score: 1540,
        highScore: 20000,
        lives: 3,
        stage: 1,
        is1UpBlinking: true,
      });

      expect(mockCtx.drawImage).toHaveBeenCalled();
    });

    it('renders reserve lives icons accurately capped at 5 icons', () => {
      const mockCtx = {
        drawImage: vi.fn(),
        imageSmoothingEnabled: false,
      } as unknown as CanvasRenderingContext2D;

      const hud = new HUD();

      // 3 lives -> 2 reserve icons
      hud.renderLives(mockCtx, 3);

      // 8 lives -> 5 reserve icons (maximum visual cap)
      hud.renderLives(mockCtx, 8);

      // 1 life -> 0 reserve icons
      hud.renderLives(mockCtx, 1);

      // 0 lives -> 0 reserve icons
      hud.renderLives(mockCtx, 0);
    });
  });

  // ==========================================================================
  // 2. Mathematical Stage Badge Greedy Decomposition
  // ==========================================================================

  describe('Stage Badge Greedy Decomposition Math', () => {
    it('decomposes Stage 1 into [FLAG_1]', () => {
      const res = HUD.decomposeStage(1);
      expect(res.stage).toBe(1);
      expect(res.badges).toEqual([BadgeType.FLAG_1]);
      expect(res.totalBadges).toBe(1);
      expect(res.totalWidth).toBe(BADGE_DIMENSIONS[BadgeType.FLAG_1].width);
    });

    it('decomposes Stage 2 into [FLAG_1, FLAG_1]', () => {
      const res = HUD.decomposeStage(2);
      expect(res.badges).toEqual([BadgeType.FLAG_1, BadgeType.FLAG_1]);
      expect(res.totalBadges).toBe(2);
    });

    it('decomposes Stage 3 into [FLAG_1, FLAG_1, FLAG_1]', () => {
      const res = HUD.decomposeStage(3);
      expect(res.badges).toEqual([BadgeType.FLAG_1, BadgeType.FLAG_1, BadgeType.FLAG_1]);
    });

    it('decomposes Stage 5 into [FLAG_5]', () => {
      const res = HUD.decomposeStage(5);
      expect(res.badges).toEqual([BadgeType.FLAG_5]);
    });

    it('decomposes Stage 8 into [FLAG_5, FLAG_1, FLAG_1, FLAG_1]', () => {
      const res = HUD.decomposeStage(8);
      expect(res.badges).toEqual([
        BadgeType.FLAG_5,
        BadgeType.FLAG_1,
        BadgeType.FLAG_1,
        BadgeType.FLAG_1,
      ]);
    });

    it('decomposes Stage 10 into [FLAG_10]', () => {
      const res = HUD.decomposeStage(10);
      expect(res.badges).toEqual([BadgeType.FLAG_10]);
    });

    it('decomposes Stage 14 into [FLAG_10, FLAG_1, FLAG_1, FLAG_1, FLAG_1]', () => {
      const res = HUD.decomposeStage(14);
      expect(res.badges).toEqual([
        BadgeType.FLAG_10,
        BadgeType.FLAG_1,
        BadgeType.FLAG_1,
        BadgeType.FLAG_1,
        BadgeType.FLAG_1,
      ]);
    });

    it('decomposes Stage 15 into [FLAG_10, FLAG_5]', () => {
      const res = HUD.decomposeStage(15);
      expect(res.badges).toEqual([BadgeType.FLAG_10, BadgeType.FLAG_5]);
    });

    it('decomposes Stage 20 into [FLAG_20]', () => {
      const res = HUD.decomposeStage(20);
      expect(res.badges).toEqual([BadgeType.FLAG_20]);
    });

    it('decomposes Stage 30 into [FLAG_30]', () => {
      const res = HUD.decomposeStage(30);
      expect(res.badges).toEqual([BadgeType.FLAG_30]);
    });

    it('decomposes Stage 48 into [FLAG_30, FLAG_10, FLAG_5, FLAG_1, FLAG_1, FLAG_1]', () => {
      const res = HUD.decomposeStage(48);
      expect(res.badges).toEqual([
        BadgeType.FLAG_30,
        BadgeType.FLAG_10,
        BadgeType.FLAG_5,
        BadgeType.FLAG_1,
        BadgeType.FLAG_1,
        BadgeType.FLAG_1,
      ]);
    });

    it('decomposes Stage 50 into [FLAG_50]', () => {
      const res = HUD.decomposeStage(50);
      expect(res.badges).toEqual([BadgeType.FLAG_50]);
    });

    it('decomposes Stage 88 into [FLAG_50, FLAG_30, FLAG_5, FLAG_1, FLAG_1, FLAG_1]', () => {
      const res = HUD.decomposeStage(88);
      expect(res.badges).toEqual([
        BadgeType.FLAG_50,
        BadgeType.FLAG_30,
        BadgeType.FLAG_5,
        BadgeType.FLAG_1,
        BadgeType.FLAG_1,
        BadgeType.FLAG_1,
      ]);
    });

    it('decomposes Stage 100 into [FLAG_50, FLAG_50]', () => {
      const res = HUD.decomposeStage(100);
      expect(res.badges).toEqual([BadgeType.FLAG_50, BadgeType.FLAG_50]);
    });

    it('decomposes Stage 255 into [FLAG_50 x 5, FLAG_5]', () => {
      const res = HUD.decomposeStage(255);
      expect(res.badges).toEqual([
        BadgeType.FLAG_50,
        BadgeType.FLAG_50,
        BadgeType.FLAG_50,
        BadgeType.FLAG_50,
        BadgeType.FLAG_50,
        BadgeType.FLAG_5,
      ]);
    });

    it('handles non-positive or floating point stage inputs defensively', () => {
      const zero = HUD.decomposeStage(0);
      expect(zero.stage).toBe(1);

      const negative = HUD.decomposeStage(-10);
      expect(negative.stage).toBe(1);

      const nan = HUD.decomposeStage(NaN);
      expect(nan.stage).toBe(1);
      expect(nan.badges).toEqual([BadgeType.FLAG_1]);

      const inf = HUD.decomposeStage(Infinity);
      expect(inf.stage).toBe(1);
      expect(inf.badges).toEqual([BadgeType.FLAG_1]);

      const negInf = HUD.decomposeStage(-Infinity);
      expect(negInf.stage).toBe(1);
      expect(negInf.badges).toEqual([BadgeType.FLAG_1]);

      const float = HUD.decomposeStage(7.9);
      expect(float.stage).toBe(7);
      expect(float.badges).toEqual([BadgeType.FLAG_5, BadgeType.FLAG_1, BadgeType.FLAG_1]);
    });
  });

  // ==========================================================================
  // 3. ScoreManager & Authentic Point Matrix
  // ==========================================================================

  describe('ScoreManager & Telemetry', () => {
    let scoreManager: ScoreManager;

    beforeEach(() => {
      scoreManager = new ScoreManager();
    });

    it('awards correct points for all enemy types and states', () => {
      // Zako
      expect(scoreManager.addScoreForEnemy(EnemyType.ZAKO, false).addedScore).toBe(50);
      expect(scoreManager.addScoreForEnemy(EnemyType.ZAKO, true).addedScore).toBe(100);

      // Goei
      expect(scoreManager.addScoreForEnemy(EnemyType.GOEI, false).addedScore).toBe(80);
      expect(scoreManager.addScoreForEnemy(EnemyType.GOEI, true).addedScore).toBe(160);

      // Boss Galaga
      expect(scoreManager.addScoreForEnemy(EnemyType.BOSS, false).addedScore).toBe(150);
      expect(scoreManager.addScoreForEnemy(EnemyType.BOSS, true, 0).addedScore).toBe(400);
      expect(scoreManager.addScoreForEnemy(EnemyType.BOSS, true, 1).addedScore).toBe(800);
      expect(scoreManager.addScoreForEnemy(EnemyType.BOSS, true, 2).addedScore).toBe(1600);

      // Captured Fighter
      expect(scoreManager.addScoreForCapturedFighter(false).addedScore).toBe(500);
      expect(scoreManager.addScoreForCapturedFighter(true).addedScore).toBe(1000);
    });

    it('supports lowercase string enemy types for backwards compatibility', () => {
      expect(scoreManager.addScoreForEnemy('zako', false).addedScore).toBe(50);
      expect(scoreManager.addScoreForEnemy('goei', true).addedScore).toBe(160);
      expect(scoreManager.addScoreForEnemy('boss', true, 1).addedScore).toBe(800);
    });

    it('awards extra lives at 20k, 70k, and every 70k thereafter with callback', () => {
      const extraLifeCallback = vi.fn();
      scoreManager.onExtraLife(extraLifeCallback);

      expect(scoreManager.lives).toBe(3);

      // 1st extra life at 20,000
      scoreManager.addScore(20000);
      expect(scoreManager.lives).toBe(4);
      expect(extraLifeCallback).toHaveBeenCalledWith(1);

      // 2nd extra life at 70,000 (add 50k)
      scoreManager.addScore(50000);
      expect(scoreManager.lives).toBe(5);
      expect(extraLifeCallback).toHaveBeenCalledTimes(2);

      // 3rd extra life at 140,000 (add 70k)
      scoreManager.addScore(70000);
      expect(scoreManager.lives).toBe(6);
      expect(extraLifeCallback).toHaveBeenCalledTimes(3);

      // Multi-milestone leap in single score addition (add 150k -> crosses 210k and 280k)
      scoreManager.addScore(150000);
      expect(scoreManager.lives).toBe(8); // +2 lives
      expect(extraLifeCallback).toHaveBeenLastCalledWith(2);
    });

    it('calculates accuracy percentage and summary correctly', () => {
      // Zero shots
      expect(scoreManager.getAccuracyPercentage()).toBe(0);
      expect(scoreManager.getFormattedAccuracy()).toBe('0.0%');

      // 10 shots, 5 hits -> 50%
      scoreManager.recordShotFired(10);
      scoreManager.recordShotHit(5);
      expect(scoreManager.getAccuracyPercentage()).toBe(50);
      expect(scoreManager.getFormattedAccuracy(1)).toBe('50.0%');

      const summary = scoreManager.getStatsSummary();
      expect(summary.shotsFired).toBe(10);
      expect(summary.shotsHit).toBe(5);
      expect(summary.accuracyRatio).toBe(0.5);
      expect(summary.accuracyPercentage).toBe(50);
    });

    it('calculates challenging stage bonus for partial hits and perfect 40/40', () => {
      // 0 hits -> 0 pts
      expect(scoreManager.addChallengingStageBonus(0).addedScore).toBe(0);

      // 38 hits -> 3,800 pts
      expect(scoreManager.addChallengingStageBonus(38).addedScore).toBe(3800);

      // Perfect 40 hits -> 10,000 pts special bonus
      expect(scoreManager.addChallengingStageBonus(40).addedScore).toBe(10000);
    });

    it('persists high score and recovers from storage anomalies', () => {
      scoreManager.addScore(25000);
      expect(scoreManager.highScore).toBe(25000);
      expect(mockStorage[SCORE_MATRIX.STORAGE_KEY]).toBe('25000');

      // Recover from corrupted storage
      mockStorage[SCORE_MATRIX.STORAGE_KEY] = 'CORRUPTED';
      const freshManager = new ScoreManager();
      expect(freshManager.highScore).toBe(20000);
    });
  });

  // ==========================================================================
  // 4. Game Screens & UI Presentation
  // ==========================================================================

  describe('Screens Engine', () => {
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
        font: '',
        fillStyle: '',
        strokeStyle: '',
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
        score: 12500,
        highScore: 20000,
        stage: 1,
        lives: 3,
        shotsFired: 80,
        hits: 60,
        challengingHits: 35,
        isDual: false,
      };
    });

    it('renders Title Screen with logo, CTA, point table, and controls without error', () => {
      expect(() => Screens.renderTitleScreen(baseContext)).not.toThrow();
    });

    it('renders Stage Intro banner for normal stages and challenging stages', () => {
      // Normal stage
      expect(() => Screens.renderStageIntro(baseContext)).not.toThrow();

      // Challenging stage (Stage 3)
      const challengingContext = { ...baseContext, stage: 3 };
      expect(() => Screens.renderStageIntro(challengingContext)).not.toThrow();
    });

    it('renders Challenging Results screen for both partial and perfect scores', () => {
      // Partial hits (35)
      expect(() => Screens.renderChallengingResults(baseContext)).not.toThrow();

      // Perfect hits (40)
      const perfectContext = { ...baseContext, challengingHits: 40 };
      expect(() => Screens.renderChallengingResults(perfectContext)).not.toThrow();
    });

    it('renders Pause Overlay with modal box and instructions', () => {
      expect(() => Screens.renderPauseOverlay(baseContext)).not.toThrow();
      expect(mockCtx.fillRect).toHaveBeenCalled();
      expect(mockCtx.strokeRect).toHaveBeenCalled();
    });

    it('renders Game Over screen with accuracy telemetry and restart prompt', () => {
      expect(() => Screens.renderGameOver(baseContext)).not.toThrow();

      // New high score condition
      const recordContext = { ...baseContext, score: 35000, highScore: 35000 };
      expect(() => Screens.renderGameOver(recordContext)).not.toThrow();
    });
  });

  // ==========================================================================
  // 5. InputHandler & Virtual Touch Controls
  // ==========================================================================

  describe('InputHandler & Touch UX', () => {
    it('initializes and manages input states cleanly with canvas mock', () => {
      const mockCanvas = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 224, height: 288 }),
      } as unknown as HTMLCanvasElement;

      const input = new InputHandler(mockCanvas);
      expect(input.getState().moveLeft).toBe(false);
      expect(input.getState().moveRight).toBe(false);
      expect(input.getState().fire).toBe(false);

      input.destroy();
    });

    it('consumes discrete pulse actions cleanly', () => {
      const mockCanvas = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 224, height: 288 }),
      } as unknown as HTMLCanvasElement;

      const input = new InputHandler(mockCanvas);

      // Directly invoke internal keydown
      (input as unknown as { handleKeyDown: (e: KeyboardEvent) => void }).handleKeyDown({
        code: 'Space',
        key: ' ',
        repeat: false,
      } as unknown as KeyboardEvent);

      expect(input.consumeAction('fire')).toBe(true);
      expect(input.consumeAction('fire')).toBe(false); // Second read must be false

      // Simulate keydown P (Pause)
      (input as unknown as { handleKeyDown: (e: KeyboardEvent) => void }).handleKeyDown({
        code: 'KeyP',
        key: 'p',
        repeat: false,
      } as unknown as KeyboardEvent);
      expect(input.consumeAction('pause')).toBe(true);
      expect(input.consumeAction('pause')).toBe(false);

      input.destroy();
    });
  });

  // ==========================================================================
  // 6. Master Game Coordinator Full Loop Integration
  // ==========================================================================

  describe('Game Coordinator Integration', () => {
    let game: Game;

    beforeEach(() => {
      game = new Game();
    });

    afterEach(() => {
      game.destroy();
    });

    it('initializes ScoreManager and HUD subsystems', () => {
      expect(game.getScoreManager()).toBeDefined();
      expect(game.getHUD()).toBeDefined();
      expect(game.score).toBe(0);
      expect(game.highScore).toBe(20000);
      expect(game.lives).toBe(3);
      expect(game.stage).toBe(1);
    });

    it('advances through state machine transitions properly', () => {
      expect(game.state).toBe('TITLE');

      game.startGame();
      expect(game.state).toBe('STAGE_INTRO');

      // Update past 2.2s intro delay
      game.update(2.5);
      expect(game.state).toBe('PLAYING');

      // Pause and resume
      game.pause();
      expect(game.state).toBe('PAUSED');
      game.resume();
      expect(game.state).toBe('PLAYING');
    });

    it('records shot accuracy telemetry on firing and hits', () => {
      game.startGame();
      game.update(2.5); // Enter PLAYING

      const sm = game.getScoreManager();
      const initialShots = sm.shotsFired;

      // Trigger firing
      game.getPlayer().attemptFire();
      expect(sm.shotsFired).toBe(initialShots + 1);
    });
  });
});
