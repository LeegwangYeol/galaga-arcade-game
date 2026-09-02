import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

export type EnemyType = 'zako' | 'goei' | 'boss';

export interface ScoreEventPayload {
  addedScore: number;
  currentScore: number;
  highScore: number;
  extraLivesAwarded: number;
}

export const SCORE_MATRIX = {
  ZAKO_FORMATION: 50,
  ZAKO_DIVING: 100,
  GOEI_FORMATION: 80,
  GOEI_DIVING: 160,
  BOSS_FORMATION: 150,
  BOSS_DIVING_SOLO: 400,
  BOSS_DIVING_1_ESCORT: 800,
  BOSS_DIVING_2_ESCORTS: 1600,
  CAPTURED_FIGHTER_FORMATION: 500,
  CAPTURED_FIGHTER_DIVING: 1000,
  CHALLENGING_STAGE_HIT: 100,
  CHALLENGING_STAGE_PERFECT_BONUS: 10000,
  DEFAULT_HIGH_SCORE: 20000,
  STORAGE_KEY: 'galaga_high_score',
} as const;

export class ScoreManager {
  private _score: number = 0;
  private _highScore: number = SCORE_MATRIX.DEFAULT_HIGH_SCORE;
  private _lives: number = 3;
  private _nextExtraLifeThresholdIndex: number = 0;
  private _onExtraLifeCallback: ((count: number) => void) | null = null;
  private _storageKey: string = SCORE_MATRIX.STORAGE_KEY;

  constructor(storageKey: string = SCORE_MATRIX.STORAGE_KEY) {
    this._storageKey = storageKey;
    this.loadHighScore();
  }

  get score(): number {
    return this._score;
  }

  get highScore(): number {
    return this._highScore;
  }

  get lives(): number {
    return this._lives;
  }

  onExtraLife(cb: (count: number) => void): void {
    this._onExtraLifeCallback = cb;
  }

  reset(): void {
    this._score = 0;
    this._lives = 3;
    this._nextExtraLifeThresholdIndex = 0;
  }

  private getExtraLifeThreshold(index: number): number {
    if (index === 0) return 20000;
    if (index === 1) return 70000;
    return 70000 + (index - 1) * 70000; // 140000, 210000, 280000...
  }

  addScore(points: number): ScoreEventPayload {
    if (points <= 0) {
      return {
        addedScore: 0,
        currentScore: this._score,
        highScore: this._highScore,
        extraLivesAwarded: 0,
      };
    }

    this._score += points;

    // Check extra life thresholds
    let extraLivesAwarded = 0;
    while (this._score >= this.getExtraLifeThreshold(this._nextExtraLifeThresholdIndex)) {
      this._lives += 1;
      extraLivesAwarded += 1;
      this._nextExtraLifeThresholdIndex += 1;
    }

    if (extraLivesAwarded > 0 && this._onExtraLifeCallback) {
      this._onExtraLifeCallback(extraLivesAwarded);
    }

    // High Score updates
    if (this._score > this._highScore) {
      this._highScore = this._score;
      this.saveHighScore();
    }

    return {
      addedScore: points,
      currentScore: this._score,
      highScore: this._highScore,
      extraLivesAwarded,
    };
  }

  addScoreForEnemy(
    type: EnemyType,
    isDiving: boolean,
    escortCount: number = 0
  ): ScoreEventPayload {
    let points = 0;
    if (type === 'zako') {
      points = isDiving ? SCORE_MATRIX.ZAKO_DIVING : SCORE_MATRIX.ZAKO_FORMATION;
    } else if (type === 'goei') {
      points = isDiving ? SCORE_MATRIX.GOEI_DIVING : SCORE_MATRIX.GOEI_FORMATION;
    } else if (type === 'boss') {
      if (!isDiving) {
        points = SCORE_MATRIX.BOSS_FORMATION;
      } else {
        if (escortCount >= 2) {
          points = SCORE_MATRIX.BOSS_DIVING_2_ESCORTS;
        } else if (escortCount === 1) {
          points = SCORE_MATRIX.BOSS_DIVING_1_ESCORT;
        } else {
          points = SCORE_MATRIX.BOSS_DIVING_SOLO;
        }
      }
    }
    return this.addScore(points);
  }

  addScoreForCapturedFighter(isDiving: boolean): ScoreEventPayload {
    const points = isDiving
      ? SCORE_MATRIX.CAPTURED_FIGHTER_DIVING
      : SCORE_MATRIX.CAPTURED_FIGHTER_FORMATION;
    return this.addScore(points);
  }

  addChallengingStageBonus(hits: number, totalEnemies: number = 40): ScoreEventPayload {
    const clampedHits = Math.max(0, Math.min(totalEnemies, hits));
    let bonus = 0;
    if (clampedHits === totalEnemies) {
      bonus = SCORE_MATRIX.CHALLENGING_STAGE_PERFECT_BONUS;
    } else {
      bonus = clampedHits * SCORE_MATRIX.CHALLENGING_STAGE_HIT;
    }
    return this.addScore(bonus);
  }

  saveHighScore(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this._storageKey, String(this._highScore));
      }
    } catch {
      // In-memory fallback on quota or security exceptions
    }
  }

  loadHighScore(): number {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(this._storageKey);
        if (stored !== null) {
          const parsed = parseInt(stored, 10);
          if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0) {
            this._highScore = Math.max(SCORE_MATRIX.DEFAULT_HIGH_SCORE, parsed);
            return this._highScore;
          }
        }
      }
    } catch {
      // Catch storage permission/security errors
    }
    this._highScore = SCORE_MATRIX.DEFAULT_HIGH_SCORE;
    return this._highScore;
  }
}

// ----------------------------------------------------------------------
// TEST SUITES
// ----------------------------------------------------------------------

describe('ScoreManager & Arcade Point Matrix Suite', () => {
  let scoreManager: ScoreManager;
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
    scoreManager = new ScoreManager();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Enemy Kill Scoring Values', () => {
    it('scores Zako: 50 pts in formation, 100 pts in diving attack', () => {
      const formRes = scoreManager.addScoreForEnemy('zako', false);
      expect(formRes.addedScore).toBe(50);
      expect(scoreManager.score).toBe(50);

      const diveRes = scoreManager.addScoreForEnemy('zako', true);
      expect(diveRes.addedScore).toBe(100);
      expect(scoreManager.score).toBe(150);
    });

    it('scores Goei: 80 pts in formation, 160 pts in diving attack', () => {
      const formRes = scoreManager.addScoreForEnemy('goei', false);
      expect(formRes.addedScore).toBe(80);
      expect(scoreManager.score).toBe(80);

      const diveRes = scoreManager.addScoreForEnemy('goei', true);
      expect(diveRes.addedScore).toBe(160);
      expect(scoreManager.score).toBe(240);
    });

    it('scores Boss Galaga: 150 in formation, 400 solo dive, 800 with 1 escort, 1600 with 2 escorts', () => {
      // Formation
      expect(scoreManager.addScoreForEnemy('boss', false).addedScore).toBe(150);

      // Solo Dive
      expect(scoreManager.addScoreForEnemy('boss', true, 0).addedScore).toBe(400);

      // Dive with 1 escort
      expect(scoreManager.addScoreForEnemy('boss', true, 1).addedScore).toBe(800);

      // Dive with 2 escorts
      expect(scoreManager.addScoreForEnemy('boss', true, 2).addedScore).toBe(1600);

      expect(scoreManager.score).toBe(150 + 400 + 800 + 1600);
    });

    it('scores Captured Fighter: 500 in formation, 1000 during dive rescue', () => {
      expect(scoreManager.addScoreForCapturedFighter(false).addedScore).toBe(500);
      expect(scoreManager.addScoreForCapturedFighter(true).addedScore).toBe(1000);
    });

    it('scores Challenging Stage: 10,000 pts for perfect 40/40, hits * 100 for partial', () => {
      // Partial: 35 hits -> 3,500 pts
      expect(scoreManager.addChallengingStageBonus(35, 40).addedScore).toBe(3500);

      // 0 hits -> 0 pts
      expect(scoreManager.addChallengingStageBonus(0, 40).addedScore).toBe(0);

      // Perfect 40 hits -> 10,000 pts
      expect(scoreManager.addChallengingStageBonus(40, 40).addedScore).toBe(10000);
    });
  });

  describe('Extra Life Threshold Logic & Event Emission', () => {
    it('starts with 3 lives and awards 1st extra life at 20,000 pts', () => {
      const extraLifeSpy = vi.fn();
      scoreManager.onExtraLife(extraLifeSpy);

      expect(scoreManager.lives).toBe(3);

      scoreManager.addScore(19990);
      expect(scoreManager.lives).toBe(3);
      expect(extraLifeSpy).not.toHaveBeenCalled();

      scoreManager.addScore(10); // Reaches 20,000 exactly
      expect(scoreManager.lives).toBe(4);
      expect(extraLifeSpy).toHaveBeenCalledTimes(1);
      expect(extraLifeSpy).toHaveBeenCalledWith(1);
    });

    it('awards 2nd extra life at 70,000 pts and subsequent every 70,000 pts thereafter', () => {
      const extraLifeSpy = vi.fn();
      scoreManager.onExtraLife(extraLifeSpy);

      // Reach 20,000 pts -> 4 lives
      scoreManager.addScore(20000);
      expect(scoreManager.lives).toBe(4);

      // Advance to 69,990 pts -> still 4 lives
      scoreManager.addScore(49990);
      expect(scoreManager.score).toBe(69990);
      expect(scoreManager.lives).toBe(4);

      // Reach 70,000 pts -> 5 lives (2nd milestone)
      scoreManager.addScore(10);
      expect(scoreManager.lives).toBe(5);

      // Reach 140,000 pts -> 6 lives (3rd milestone)
      scoreManager.addScore(70000);
      expect(scoreManager.score).toBe(140000);
      expect(scoreManager.lives).toBe(6);

      // Reach 210,000 pts -> 7 lives (4th milestone)
      scoreManager.addScore(70000);
      expect(scoreManager.score).toBe(210000);
      expect(scoreManager.lives).toBe(7);

      expect(extraLifeSpy).toHaveBeenCalledTimes(4);
    });

    it('handles multiple milestone crossings in a single score leap (Adversarial)', () => {
      const extraLifeSpy = vi.fn();
      scoreManager.onExtraLife(extraLifeSpy);

      // Leap from 0 to 150,000 pts in a single call (crosses 20k, 70k, 140k milestones)
      const res = scoreManager.addScore(150000);
      expect(res.extraLivesAwarded).toBe(3);
      expect(scoreManager.lives).toBe(6); // 3 starting + 3 extra
      expect(extraLifeSpy).toHaveBeenCalledWith(3);
    });

    it('resets score and extra life thresholds on reset()', () => {
      scoreManager.addScore(30000); // 4 lives
      expect(scoreManager.lives).toBe(4);

      scoreManager.reset();
      expect(scoreManager.score).toBe(0);
      expect(scoreManager.lives).toBe(3);

      // Should award extra life again at 20,000
      scoreManager.addScore(20000);
      expect(scoreManager.lives).toBe(4);
    });
  });

  describe('HighScore & LocalStorage Persistence & Fault Tolerance', () => {
    it('initializes with default high score 20,000', () => {
      expect(scoreManager.highScore).toBe(20000);
    });

    it('updates and persists high score when score exceeds current high score', () => {
      scoreManager.addScore(25000);
      expect(scoreManager.highScore).toBe(25000);
      expect(mockStorage[SCORE_MATRIX.STORAGE_KEY]).toBe('25000');
    });

    it('does not mutate high score when score is below high score', () => {
      scoreManager.addScore(15000);
      expect(scoreManager.highScore).toBe(20000);
      expect(mockStorage[SCORE_MATRIX.STORAGE_KEY]).toBeUndefined();
    });

    it('loads previously saved high score from localStorage on startup', () => {
      mockStorage[SCORE_MATRIX.STORAGE_KEY] = '88400';
      const freshManager = new ScoreManager();
      expect(freshManager.highScore).toBe(88400);
    });

    it('recovers gracefully from corrupted / non-numeric localStorage data (Adversarial)', () => {
      mockStorage[SCORE_MATRIX.STORAGE_KEY] = 'INVALID_NAN_VALUE';
      const corruptedManager = new ScoreManager();
      expect(corruptedManager.highScore).toBe(20000);

      mockStorage[SCORE_MATRIX.STORAGE_KEY] = '-500';
      const negativeManager = new ScoreManager();
      expect(negativeManager.highScore).toBe(20000);
    });

    it('handles localStorage throwing QuotaExceededError or SecurityError gracefully', () => {
      const errorStorage = {
        getItem: vi.fn(() => {
          throw new Error('SecurityError: Access is denied');
        }),
        setItem: vi.fn(() => {
          throw new Error('QuotaExceededError: Storage quota exceeded');
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
      };
      vi.stubGlobal('localStorage', errorStorage);

      expect(() => {
        const resilientManager = new ScoreManager();
        resilientManager.addScore(50000);
      }).not.toThrow();
    });
  });
});
