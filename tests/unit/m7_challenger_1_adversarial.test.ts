/**
 * Galaga Arcade Web Game — Milestone 7 Adversarial Challenger Test Suite (m7_challenger_1)
 * 
 * Deep empirical stress testing of:
 * 1. LocalStorage resilience (QuotaExceededError, SecurityError, corrupted JSON/NaN/Negative, missing window/Storage).
 * 2. Multi-leap extra life calculations (single frame +150k pts, +1M pts, exact boundary checks, threshold resets).
 * 3. Accuracy stats & telemetry (0/0 division defense, hits > shots, NaN/infinite counts, challenging stage bounds).
 * 4. Extreme stage badge decomposition (stages > 100, 255, 999, 10000, crowding clamp at x < 96).
 * 5. Procedural font atlas & HUD visual boundary stress tests.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ScoreManager, SCORE_MATRIX } from '../../src/systems/ScoreManager';
import { HUD, BadgeType } from '../../src/ui/HUD';
import { Screens, type ScreenRenderContext } from '../../src/ui/Screens';
import { EnemyType } from '../../src/types';

describe('M7 Challenger 1: Score Persistence & Stat Accuracy Adversarial Suite', () => {
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
  // Section 1: LocalStorage Adversarial & Failure Mode Tests
  // ==========================================================================

  describe('1. LocalStorage Failure Modes & Corrupted Storage Defense', () => {
    it('handles QuotaExceededError during saveHighScore without throwing', () => {
      const quotaErrorStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => {
          const err = new Error('The quota has been exceeded.');
          err.name = 'QuotaExceededError';
          throw err;
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };
      vi.stubGlobal('localStorage', quotaErrorStorage);

      const sm = new ScoreManager();
      expect(() => {
        const res = sm.addScore(50000);
        expect(res.highScore).toBe(50000);
      }).not.toThrow();

      // High score remains maintained in memory
      expect(sm.highScore).toBe(50000);
      expect(sm.saveHighScore()).toBe(false);
    });

    it('handles SecurityError (Access Denied / Private Mode) during probe and retrieval', () => {
      const securityErrorStorage = {
        getItem: vi.fn(() => {
          const err = new Error('SecurityError: Access is denied');
          err.name = 'SecurityError';
          throw err;
        }),
        setItem: vi.fn(() => {
          const err = new Error('SecurityError: Access is denied');
          err.name = 'SecurityError';
          throw err;
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };
      vi.stubGlobal('localStorage', securityErrorStorage);

      expect(() => {
        const sm = new ScoreManager();
        expect(sm.highScore).toBe(20000);
        sm.addScore(35000);
        expect(sm.highScore).toBe(35000);
      }).not.toThrow();
    });

    it('recovers gracefully from various corrupted storage values', () => {
      const corruptedTestCases = [
        'NaN',
        'undefined',
        'null',
        'CORRUPTED_STRING',
        '-999999',
        '{"score": 50000}',
        '[object Object]',
        'Infinity',
        '-Infinity',
        '0',
        '   ',
        '',
        '3.14159_invalid',
      ];

      for (const corruptedValue of corruptedTestCases) {
        mockStorage[SCORE_MATRIX.STORAGE_KEY] = corruptedValue;
        const sm = new ScoreManager();
        expect(sm.highScore).toBeGreaterThanOrEqual(SCORE_MATRIX.DEFAULT_HIGH_SCORE);
        expect(Number.isFinite(sm.highScore)).toBe(true);
      }
    });

    it('parses valid high scores with whitespace correctly', () => {
      mockStorage[SCORE_MATRIX.STORAGE_KEY] = '   48500   ';
      const sm = new ScoreManager();
      expect(sm.highScore).toBe(48500);
    });

    it('reads fallback storage key if primary key is absent', () => {
      mockStorage[SCORE_MATRIX.FALLBACK_STORAGE_KEY] = '99000';
      const sm = new ScoreManager({ storageKey: 'galaga_arcade_high_score' });
      expect(sm.highScore).toBe(99000);
    });

    it('does not downgrade high score if stored value is lower than default', () => {
      mockStorage[SCORE_MATRIX.STORAGE_KEY] = '5000';
      const sm = new ScoreManager();
      expect(sm.highScore).toBe(20000); // Must be at least DEFAULT_HIGH_SCORE (20,000)
    });

    it('handles total absence of localStorage / window object (SSR/Worker mock)', () => {
      vi.stubGlobal('localStorage', undefined);
      vi.stubGlobal('window', undefined);

      expect(() => {
        const sm = new ScoreManager();
        expect(sm.highScore).toBe(20000);
        sm.addScore(45000);
        expect(sm.highScore).toBe(45000);
        expect(sm.saveHighScore()).toBe(false);
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // Section 2: Extra Life Multi-Leap & Extend Calculations
  // ==========================================================================

  describe('2. Multi-Leap Extra Life & Threshold Calculations', () => {
    it('awards exactly 3 extra lives when jumping 0 -> 150,000 in a single frame (20k, 70k, 140k)', () => {
      const sm = new ScoreManager();
      const extraLifeSpy = vi.fn();
      sm.onExtraLife(extraLifeSpy);

      expect(sm.lives).toBe(3);

      const payload = sm.addScore(150000);
      expect(payload.addedScore).toBe(150000);
      expect(payload.currentScore).toBe(150000);
      expect(payload.extraLivesAwarded).toBe(3);
      expect(sm.lives).toBe(6); // 3 starting + 3 extends

      expect(extraLifeSpy).toHaveBeenCalledTimes(1);
      expect(extraLifeSpy).toHaveBeenCalledWith(3);
      expect(sm.getNextExtraLifeThreshold()).toBe(210000);
      expect(sm.getPointsToNextExtraLife()).toBe(60000);
    });

    it('awards exactly 15 extra lives when jumping 0 -> 1,000,000 in a single frame', () => {
      // Thresholds: 20k (1), 70k (2), 140k (3), 210k (4), 280k (5), 350k (6), 420k (7),
      // 490k (8), 560k (9), 630k (10), 700k (11), 770k (12), 840k (13), 910k (14), 980k (15).
      const sm = new ScoreManager();
      const extraLifeSpy = vi.fn();
      sm.onExtraLife(extraLifeSpy);

      const payload = sm.addScore(1000000);
      expect(payload.extraLivesAwarded).toBe(15);
      expect(sm.lives).toBe(18); // 3 starting + 15 extends
      expect(extraLifeSpy).toHaveBeenCalledWith(15);
      expect(sm.getNextExtraLifeThreshold()).toBe(1050000);
      expect(sm.getPointsToNextExtraLife()).toBe(50000);
    });

    it('correctly calculates exact threshold boundary edge cases', () => {
      const sm = new ScoreManager();
      const extraLifeSpy = vi.fn();
      sm.onExtraLife(extraLifeSpy);

      // Edge 1: 19,999 pts -> 0 extra lives
      sm.addScore(19999);
      expect(sm.lives).toBe(3);
      expect(extraLifeSpy).not.toHaveBeenCalled();
      expect(sm.getPointsToNextExtraLife()).toBe(1);

      // +1 pt -> 20,000 pts -> 1 extra life
      sm.addScore(1);
      expect(sm.lives).toBe(4);
      expect(extraLifeSpy).toHaveBeenCalledTimes(1);
      expect(extraLifeSpy).toHaveBeenCalledWith(1);
      expect(sm.getNextExtraLifeThreshold()).toBe(70000);
      expect(sm.getPointsToNextExtraLife()).toBe(50000);

      // Edge 2: 69,999 pts -> still 4 lives
      sm.addScore(49999);
      expect(sm.score).toBe(69999);
      expect(sm.lives).toBe(4);
      expect(sm.getPointsToNextExtraLife()).toBe(1);

      // +1 pt -> 70,000 pts -> 2nd extra life
      sm.addScore(1);
      expect(sm.lives).toBe(5);
      expect(extraLifeSpy).toHaveBeenCalledTimes(2);
      expect(extraLifeSpy).toHaveBeenLastCalledWith(1);
      expect(sm.getNextExtraLifeThreshold()).toBe(140000);

      // Edge 3: 139,999 pts -> still 5 lives
      sm.addScore(69999);
      expect(sm.score).toBe(139999);
      expect(sm.lives).toBe(5);

      // +1 pt -> 140,000 pts -> 3rd extra life
      sm.addScore(1);
      expect(sm.lives).toBe(6);
      expect(extraLifeSpy).toHaveBeenCalledTimes(3);
    });

    it('rejects negative, zero, non-finite, and NaN points safely', () => {
      const sm = new ScoreManager();
      const initialScore = sm.score;

      expect(sm.addScore(0).addedScore).toBe(0);
      expect(sm.addScore(-500).addedScore).toBe(0);
      expect(sm.addScore(NaN).addedScore).toBe(0);
      expect(sm.addScore(Infinity).addedScore).toBe(0);
      expect(sm.addScore(-Infinity).addedScore).toBe(0);

      expect(sm.score).toBe(initialScore);
      expect(sm.lives).toBe(3);
    });

    it('preserves high score and resets extra life index on reset()', () => {
      const sm = new ScoreManager();
      sm.addScore(85000); // 5 lives, high score 85000
      expect(sm.highScore).toBe(85000);
      expect(sm.lives).toBe(5);

      sm.reset(3, 1);
      expect(sm.score).toBe(0);
      expect(sm.lives).toBe(3);
      expect(sm.highScore).toBe(85000); // High score preserved across resets
      expect(sm.getNextExtraLifeThreshold()).toBe(20000);

      // Earning 20,000 pts awards extra life again in new session
      sm.addScore(20000);
      expect(sm.lives).toBe(4);
    });
  });

  // ==========================================================================
  // Section 3: Telemetry, Accuracy Stats & Challenging Stage Defenses
  // ==========================================================================

  describe('3. Telemetry, Accuracy Stats & Challenging Stage Defenses', () => {
    it('defends against 0 shots fired (0/0 division defense)', () => {
      const sm = new ScoreManager();
      expect(sm.shotsFired).toBe(0);
      expect(sm.shotsHit).toBe(0);
      expect(sm.getAccuracy()).toBe(0);
      expect(sm.getAccuracyPercentage()).toBe(0);
      expect(sm.getFormattedAccuracy()).toBe('0.0%');

      const stats = sm.getStatsSummary();
      expect(stats.accuracyRatio).toBe(0);
      expect(stats.accuracyPercentage).toBe(0);
      expect(stats.formattedAccuracy).toBe('0.0%');
      expect(Number.isNaN(stats.accuracyRatio)).toBe(false);
    });

    it('handles shots hit > shots fired (piercing laser multi-kill) without crash', () => {
      const sm = new ScoreManager();
      sm.recordShotFired(10);
      sm.recordShotHit(25); // e.g. 2.5 hits per shot with penetrating dual lasers

      expect(sm.getAccuracy()).toBe(2.5);
      expect(sm.getAccuracyPercentage()).toBe(250);
      expect(sm.getFormattedAccuracy(1)).toBe('250.0%');
      expect(sm.getStatsSummary().formattedAccuracy).toBe('250.0%');
    });

    it('rejects invalid or negative telemetry values defensively', () => {
      const sm = new ScoreManager();
      sm.recordShotFired(-5);
      sm.recordShotHit(-3);
      sm.recordShotFired(NaN);
      sm.recordShotHit(Infinity);

      expect(sm.shotsFired).toBe(0);
      expect(sm.shotsHit).toBe(0);

      sm.recordShotFired(10);
      sm.recordShotHit(10);
      expect(sm.getAccuracyPercentage()).toBe(100);
    });

    it('clamps challenging stage hits between 0 and 40', () => {
      const sm = new ScoreManager();

      // Negative hits -> 0 pts
      expect(sm.addChallengingStageBonus(-10).addedScore).toBe(0);

      // 0 hits -> 0 pts
      expect(sm.addChallengingStageBonus(0).addedScore).toBe(0);

      // 1 hit -> 100 pts
      expect(sm.addChallengingStageBonus(1).addedScore).toBe(100);

      // 39 hits -> 3900 pts
      expect(sm.addChallengingStageBonus(39).addedScore).toBe(3900);

      // 40 hits (perfect) -> 10,000 pts
      expect(sm.addChallengingStageBonus(40).addedScore).toBe(10000);

      // >40 hits (overshoot) -> clamped to 40 (perfect bonus)
      expect(sm.addChallengingStageBonus(999).addedScore).toBe(10000);
    });

    it('records challenging hit counts with maximum cap 40', () => {
      const sm = new ScoreManager();
      sm.recordChallengingHit(25);
      expect(sm.challengingHits).toBe(25);

      sm.recordChallengingHit(20);
      expect(sm.challengingHits).toBe(40); // Clamped at 40 max

      sm.resetChallengingHits();
      expect(sm.challengingHits).toBe(0);
    });
  });

  // ==========================================================================
  // Section 4: Extreme Stage Badges & HUD Rendering Defenses
  // ==========================================================================

  describe('4. Extreme Stage Badges & HUD Crowding Defenses', () => {
    it('correctly decomposes extreme stage numbers (e.g. 101, 150, 255, 999)', () => {
      // Stage 101: 2x50 + 1x1
      const s101 = HUD.decomposeStage(101);
      expect(s101.badges).toEqual([BadgeType.FLAG_50, BadgeType.FLAG_50, BadgeType.FLAG_1]);

      // Stage 150: 3x50
      const s150 = HUD.decomposeStage(150);
      expect(s150.badges).toEqual([BadgeType.FLAG_50, BadgeType.FLAG_50, BadgeType.FLAG_50]);

      // Stage 255: 5x50 + 1x5
      const s255 = HUD.decomposeStage(255);
      expect(s255.badges).toEqual([
        BadgeType.FLAG_50,
        BadgeType.FLAG_50,
        BadgeType.FLAG_50,
        BadgeType.FLAG_50,
        BadgeType.FLAG_50,
        BadgeType.FLAG_5,
      ]);

      // Stage 999
      const s999 = HUD.decomposeStage(999);
      const count50 = s999.badges.filter((b) => b === BadgeType.FLAG_50).length;
      expect(count50).toBe(19); // 19 * 50 = 950
    });

    it('enforces crowding clamp (x >= 96) during badge rendering on extreme stages', () => {
      const renderedXCoordinates: number[] = [];
      const mockCtx = {
        drawImage: vi.fn((_img: any, x: number) => {
          renderedXCoordinates.push(x);
        }),
      } as unknown as CanvasRenderingContext2D;

      const hud = new HUD();

      // Render Stage 999 (which has 26+ badges that would overflow into reserve lives)
      hud.renderStageBadges(mockCtx, 999);

      expect(renderedXCoordinates.length).toBeGreaterThan(0);
      // All rendered badges MUST respect x >= 96 to protect reserve lives icons
      for (const x of renderedXCoordinates) {
        expect(x).toBeGreaterThanOrEqual(96);
      }
    });

    it('renders all screens under extreme data contexts without throwing', () => {
      const mockCtx = {
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
      } as unknown as CanvasRenderingContext2D;

      const extremeContext: ScreenRenderContext = {
        ctx: mockCtx,
        width: 224,
        height: 288,
        stateTimer: 99999.9,
        blinkTimer: 12345.6,
        score: 9999990,
        highScore: 9999990,
        stage: 999,
        lives: 99,
        shotsFired: 0,
        hits: 0,
        challengingHits: 40,
        isDual: true,
      };

      expect(() => Screens.renderTitleScreen(extremeContext)).not.toThrow();
      expect(() => Screens.renderStageIntro(extremeContext)).not.toThrow();
      expect(() => Screens.renderChallengingResults(extremeContext)).not.toThrow();
      expect(() => Screens.renderPauseOverlay(extremeContext)).not.toThrow();
      expect(() => Screens.renderGameOver(extremeContext)).not.toThrow();
    });
  });

  // ==========================================================================
  // Section 5: Arcade Point Matrix Completeness & Invariants
  // ==========================================================================

  describe('5. Arcade Point Matrix Completeness & Invariants', () => {
    it('verifies all 1981 Namco Galaga score values conform strictly to arcade PROM', () => {
      const sm = new ScoreManager();

      // Zako
      expect(sm.addScoreForEnemy(EnemyType.ZAKO, false).addedScore).toBe(50);
      expect(sm.addScoreForEnemy(EnemyType.ZAKO, true).addedScore).toBe(100);

      // Goei
      expect(sm.addScoreForEnemy(EnemyType.GOEI, false).addedScore).toBe(80);
      expect(sm.addScoreForEnemy(EnemyType.GOEI, true).addedScore).toBe(160);

      // Boss Galaga
      expect(sm.addScoreForEnemy(EnemyType.BOSS, false).addedScore).toBe(150);
      expect(sm.addScoreForEnemy(EnemyType.BOSS, true, 0).addedScore).toBe(400);
      expect(sm.addScoreForEnemy(EnemyType.BOSS, true, 1).addedScore).toBe(800);
      expect(sm.addScoreForEnemy(EnemyType.BOSS, true, 2).addedScore).toBe(1600);

      // Captured Fighter
      expect(sm.addScoreForCapturedFighter(false).addedScore).toBe(500);
      expect(sm.addScoreForCapturedFighter(true).addedScore).toBe(1000);
    });

    it('emits onScoreChanged event with exact event payload', () => {
      const sm = new ScoreManager();
      const scoreChangedSpy = vi.fn();
      sm.onScoreChanged(scoreChangedSpy);

      sm.addScore(800);
      expect(scoreChangedSpy).toHaveBeenCalledTimes(1);
      expect(scoreChangedSpy).toHaveBeenCalledWith({
        addedScore: 800,
        currentScore: 800,
        highScore: 20000,
        extraLivesAwarded: 0,
      });
    });
  });
});
