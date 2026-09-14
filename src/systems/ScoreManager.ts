/**
 * Galaga Arcade Web Game — ScoreManager Subsystem
 * 
 * Manages active score tracking, high score persistence across browser sessions
 * with fault-tolerant LocalStorage fallbacks, arcade-accurate extra-life extends
 * (20k, 70k, +70k), challenging stage bonus scoring, and end-of-game telemetry
 * accuracy metrics.
 * 
 * Strictly typed for Vite 6 / TypeScript 5.7+ compilation.
 */

import { EnemyType } from '../types';
import type { ScoreRecord, HUDState, PlayerId } from '../types';

/**
 * Result payload emitted after adding score.
 */
export interface ScoreEventPayload {
  addedScore: number;
  currentScore: number;
  highScore: number;
  extraLivesAwarded: number;
}

/**
 * Complete performance statistics summary for HUD and Game Over screen.
 */
export interface GameStatsSummary {
  score: number;
  highScore: number;
  stage: number;
  lives: number;
  shotsFired: number;
  shotsHit: number;
  accuracyRatio: number; // [0.0 .. 1.0]
  accuracyPercentage: number; // [0.0 .. 100.0]
  formattedAccuracy: string; // e.g. "85.4%"
}

/**
 * Configuration options for ScoreManager initialization.
 */
export interface ScoreManagerConfig {
  storageKey?: string;
  defaultHighScore?: number;
  initialLives?: number;
  startingStage?: number;
}

/**
 * Canonical 1981 Namco Galaga point distribution and storage constants.
 */
export const SCORE_MATRIX = {
  // Zako (Blue Bug)
  ZAKO_FORMATION: 50,
  ZAKO_DIVING: 100,

  // Goei (Red Butterfly)
  GOEI_FORMATION: 80,
  GOEI_DIVING: 160,

  // Boss Galaga
  BOSS_FORMATION: 150,
  BOSS_DIVING_SOLO: 400,
  BOSS_DIVING_1_ESCORT: 800,
  BOSS_DIVING_2_ESCORTS: 1600,

  // Captured Fighter (Turncoat / Hostile)
  CAPTURED_FIGHTER_FORMATION: 500,
  CAPTURED_FIGHTER_DIVING: 1000,

  // Challenging Stage
  CHALLENGING_STAGE_HIT: 100,
  CHALLENGING_STAGE_PERFECT_BONUS: 10000,
  CHALLENGING_STAGE_TOTAL_ENEMIES: 40,

  // Defaults & Storage Keys
  DEFAULT_HIGH_SCORE: 20000,
  STORAGE_KEY: 'galaga_arcade_high_score',
  FALLBACK_STORAGE_KEY: 'galaga_high_score',
  INITIAL_LIVES: 3,

  // Extra Life (Extend) Milestones
  FIRST_EXTEND_SCORE: 20000,
  SECOND_EXTEND_SCORE: 70000,
  SUBSEQUENT_EXTEND_INTERVAL: 70000,
} as const;

export class ScoreManager {
  private _score: number = 0;
  private _highScore: number = SCORE_MATRIX.DEFAULT_HIGH_SCORE;
  private _lives: number = SCORE_MATRIX.INITIAL_LIVES;
  private _stage: number = 1;

  // Player 1 Telemetry Metrics & Extend Threshold Tracker
  private _shotsFired: number = 0;
  private _shotsHit: number = 0;
  private _challengingHits: number = 0;
  private _nextExtraLifeThresholdIndex: number = 0;

  // Player 2 State & Telemetry Metrics (M31 Co-op Multiplayer)
  private _p2Score: number = 0;
  private _p2Lives: number = SCORE_MATRIX.INITIAL_LIVES;
  private _p2ShotsFired: number = 0;
  private _p2ShotsHit: number = 0;
  private _p2ChallengingHits: number = 0;
  private _p2NextExtraLifeThresholdIndex: number = 0;

  // Callbacks
  private _onExtraLifeCallback: ((count: number, playerId?: PlayerId) => void) | null = null;
  private _onScoreChangedCallback: ((payload: ScoreEventPayload) => void) | null = null;

  // Storage Key
  private _storageKey: string = SCORE_MATRIX.STORAGE_KEY;

  constructor(config?: ScoreManagerConfig | string) {
    if (typeof config === 'string') {
      this._storageKey = config;
    } else if (config) {
      if (config.storageKey) this._storageKey = config.storageKey;
      if (config.defaultHighScore !== undefined) this._highScore = config.defaultHighScore;
      if (config.initialLives !== undefined) {
        this._lives = Math.max(0, config.initialLives);
        this._p2Lives = Math.max(0, config.initialLives);
      }
      if (config.startingStage !== undefined) this._stage = Math.max(1, config.startingStage);
    }
    this.loadHighScore();
  }

  // ==========================================================================
  // Public Accessors
  // ==========================================================================

  public get score(): number {
    return this._score;
  }

  public set score(val: number) {
    this.setScore(val, 'p1');
  }

  public get highScore(): number {
    return this._highScore;
  }

  public get lives(): number {
    return this._lives;
  }

  public set lives(val: number) {
    this.setLives(val, 'p1');
  }

  public get stage(): number {
    return this._stage;
  }

  public get shotsFired(): number {
    return this._shotsFired;
  }

  public get shotsHit(): number {
    return this._shotsHit;
  }

  public get challengingHits(): number {
    return this._challengingHits;
  }

  public get storageKey(): string {
    return this._storageKey;
  }

  // Multi-Player Discriminator Accessors
  public getScore(playerId: PlayerId = 'p1'): number {
    return playerId === 'p2' ? this._p2Score : this._score;
  }

  public getLives(playerId: PlayerId = 'p1'): number {
    return playerId === 'p2' ? this._p2Lives : this._lives;
  }

  public getShotsFired(playerId: PlayerId = 'p1'): number {
    return playerId === 'p2' ? this._p2ShotsFired : this._shotsFired;
  }

  public getShotsHit(playerId: PlayerId = 'p1'): number {
    return playerId === 'p2' ? this._p2ShotsHit : this._shotsHit;
  }

  public getChallengingHits(playerId: PlayerId = 'p1'): number {
    return playerId === 'p2' ? this._p2ChallengingHits : this._challengingHits;
  }

  public setScore(val: number, playerId: PlayerId = 'p1'): void {
    const sanitized = Math.max(0, Math.floor(val));
    if (playerId === 'p2') {
      this._p2Score = sanitized;
    } else {
      this._score = sanitized;
    }
    if (sanitized > this._highScore) {
      this._highScore = sanitized;
      this.saveHighScore();
    }
  }

  public setLives(val: number, playerId: PlayerId = 'p1'): void {
    const sanitized = Math.max(0, Math.floor(val));
    if (playerId === 'p2') {
      this._p2Lives = sanitized;
    } else {
      this._lives = sanitized;
    }
  }

  // ==========================================================================
  // Event Subscriptions
  // ==========================================================================

  public onExtraLife(callback: (count: number, playerId?: PlayerId) => void): void {
    this._onExtraLifeCallback = callback;
  }

  public onScoreChanged(callback: (payload: ScoreEventPayload) => void): void {
    this._onScoreChangedCallback = callback;
  }

  // ==========================================================================
  // Game Lifecycle & State Mutation
  // ==========================================================================

  public reset(initialLives: number = SCORE_MATRIX.INITIAL_LIVES, stage: number = 1): void {
    this._score = 0;
    this._lives = Math.max(0, initialLives);
    this._stage = Math.max(1, stage);
    this._shotsFired = 0;
    this._shotsHit = 0;
    this._challengingHits = 0;
    this._nextExtraLifeThresholdIndex = 0;

    this._p2Score = 0;
    this._p2Lives = Math.max(0, initialLives);
    this._p2ShotsFired = 0;
    this._p2ShotsHit = 0;
    this._p2ChallengingHits = 0;
    this._p2NextExtraLifeThresholdIndex = 0;
  }

  public setStage(stage: number): void {
    this._stage = Math.max(1, stage);
  }

  public advanceStage(): number {
    this._stage += 1;
    return this._stage;
  }

  public deductLife(count: number = 1, playerId: PlayerId = 'p1'): number {
    if (playerId === 'p2') {
      if (this._p2Lives > 0) {
        this._p2Lives = Math.max(0, this._p2Lives - count);
      }
      return this._p2Lives;
    }
    if (this._lives > 0) {
      this._lives = Math.max(0, this._lives - count);
    }
    return this._lives;
  }

  public addLife(count: number = 1, playerId: PlayerId = 'p1'): number {
    if (count > 0) {
      if (playerId === 'p2') {
        this._p2Lives += count;
      } else {
        this._lives += count;
      }
    }
    return playerId === 'p2' ? this._p2Lives : this._lives;
  }

  // ==========================================================================
  // Extend (Extra Life) Calculations
  // ==========================================================================

  /**
   * Calculates the exact score required for the n-th extra life extend.
   * Index 0 -> 20,000
   * Index 1 -> 70,000
   * Index 2 -> 140,000
   * Index 3 -> 210,000
   */
  public getExtraLifeThreshold(index: number): number {
    if (index <= 0) {
      return SCORE_MATRIX.FIRST_EXTEND_SCORE;
    }
    if (index === 1) {
      return SCORE_MATRIX.SECOND_EXTEND_SCORE;
    }
    return (
      SCORE_MATRIX.SECOND_EXTEND_SCORE +
      (index - 1) * SCORE_MATRIX.SUBSEQUENT_EXTEND_INTERVAL
    );
  }

  public getNextExtraLifeThreshold(): number {
    return this.getExtraLifeThreshold(this._nextExtraLifeThresholdIndex);
  }

  public getPointsToNextExtraLife(): number {
    const nextTarget = this.getNextExtraLifeThreshold();
    return Math.max(0, nextTarget - this._score);
  }

  // ==========================================================================
  // Score Mutation & Point Calculation
  // ==========================================================================

  public addScore(points: number, playerId: PlayerId = 'p1'): ScoreEventPayload {
    if (points <= 0 || !Number.isFinite(points)) {
      return {
        addedScore: 0,
        currentScore: this.getScore(playerId),
        highScore: this._highScore,
        extraLivesAwarded: 0,
      };
    }

    const sanitizedPoints = Math.floor(points);
    let extraLivesAwarded = 0;

    if (playerId === 'p2') {
      this._p2Score += sanitizedPoints;
      while (this._p2Score >= this.getExtraLifeThreshold(this._p2NextExtraLifeThresholdIndex)) {
        this._p2Lives += 1;
        extraLivesAwarded += 1;
        this._p2NextExtraLifeThresholdIndex += 1;
      }
      if (this._p2Score > this._highScore) {
        this._highScore = this._p2Score;
        this.saveHighScore();
      }
    } else {
      this._score += sanitizedPoints;
      while (this._score >= this.getExtraLifeThreshold(this._nextExtraLifeThresholdIndex)) {
        this._lives += 1;
        extraLivesAwarded += 1;
        this._nextExtraLifeThresholdIndex += 1;
      }
      if (this._score > this._highScore) {
        this._highScore = this._score;
        this.saveHighScore();
      }
    }

    if (extraLivesAwarded > 0 && this._onExtraLifeCallback) {
      if (playerId === 'p2') {
        this._onExtraLifeCallback(extraLivesAwarded, 'p2');
      } else if (this._onExtraLifeCallback.length >= 2) {
        this._onExtraLifeCallback(extraLivesAwarded, playerId);
      } else {
        this._onExtraLifeCallback(extraLivesAwarded);
      }
    }

    const payload: ScoreEventPayload = {
      addedScore: sanitizedPoints,
      currentScore: this.getScore(playerId),
      highScore: this._highScore,
      extraLivesAwarded,
    };

    if (this._onScoreChangedCallback) {
      this._onScoreChangedCallback(payload);
    }

    return payload;
  }

  public addScoreForEnemy(
    type: EnemyType | string,
    isDiving: boolean,
    escortCount: number = 0,
    playerId: PlayerId = 'p1'
  ): ScoreEventPayload {
    const rawType = String(type).toUpperCase();
    let points = 0;

    if (rawType === EnemyType.ZAKO || rawType === 'ZAKO') {
      points = isDiving ? SCORE_MATRIX.ZAKO_DIVING : SCORE_MATRIX.ZAKO_FORMATION;
    } else if (rawType === EnemyType.GOEI || rawType === 'GOEI') {
      points = isDiving ? SCORE_MATRIX.GOEI_DIVING : SCORE_MATRIX.GOEI_FORMATION;
    } else if (rawType === EnemyType.BOSS || rawType === 'BOSS') {
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
    } else if (
      rawType === EnemyType.CAPTURED_FIGHTER ||
      rawType === 'CAPTURED_FIGHTER' ||
      rawType === 'CAPTURED'
    ) {
      points = isDiving
        ? SCORE_MATRIX.CAPTURED_FIGHTER_DIVING
        : SCORE_MATRIX.CAPTURED_FIGHTER_FORMATION;
    } else {
      points = isDiving ? 100 : 50;
    }

    return this.addScore(points, playerId);
  }

  public addScoreForCapturedFighter(isDiving: boolean, playerId: PlayerId = 'p1'): ScoreEventPayload {
    const points = isDiving
      ? SCORE_MATRIX.CAPTURED_FIGHTER_DIVING
      : SCORE_MATRIX.CAPTURED_FIGHTER_FORMATION;
    return this.addScore(points, playerId);
  }

  public addChallengingStageBonus(
    hits: number,
    totalEnemies: number = SCORE_MATRIX.CHALLENGING_STAGE_TOTAL_ENEMIES,
    playerId: PlayerId = 'p1'
  ): ScoreEventPayload {
    const clampedHits = Math.max(0, Math.min(totalEnemies, Math.floor(hits)));
    let bonus = 0;

    if (clampedHits === totalEnemies) {
      bonus = SCORE_MATRIX.CHALLENGING_STAGE_PERFECT_BONUS;
    } else {
      bonus = clampedHits * SCORE_MATRIX.CHALLENGING_STAGE_HIT;
    }

    return this.addScore(bonus, playerId);
  }

  // ==========================================================================
  // Telemetry & Accuracy Statistics Tracking
  // ==========================================================================

  public recordShotFired(countOrPlayerId: number | PlayerId = 1, maybePlayerId: PlayerId = 'p1'): void {
    const count = typeof countOrPlayerId === 'number' ? countOrPlayerId : 1;
    const playerId = typeof countOrPlayerId === 'string' ? countOrPlayerId : maybePlayerId;
    if (count > 0 && Number.isFinite(count)) {
      const sanitized = Math.floor(count);
      if (playerId === 'p2') {
        this._p2ShotsFired += sanitized;
      } else {
        this._shotsFired += sanitized;
      }
    }
  }

  public recordShotHit(countOrPlayerId: number | PlayerId = 1, maybePlayerId: PlayerId = 'p1'): void {
    const count = typeof countOrPlayerId === 'number' ? countOrPlayerId : 1;
    const playerId = typeof countOrPlayerId === 'string' ? countOrPlayerId : maybePlayerId;
    if (count > 0 && Number.isFinite(count)) {
      const sanitized = Math.floor(count);
      if (playerId === 'p2') {
        this._p2ShotsHit += sanitized;
      } else {
        this._shotsHit += sanitized;
      }
    }
  }

  public recordChallengingHit(countOrPlayerId: number | PlayerId = 1, maybePlayerId: PlayerId = 'p1'): void {
    const count = typeof countOrPlayerId === 'number' ? countOrPlayerId : 1;
    const playerId = typeof countOrPlayerId === 'string' ? countOrPlayerId : maybePlayerId;
    if (count > 0 && Number.isFinite(count)) {
      const added = Math.floor(count);
      if (playerId === 'p2') {
        this._p2ChallengingHits = Math.min(
          SCORE_MATRIX.CHALLENGING_STAGE_TOTAL_ENEMIES,
          this._p2ChallengingHits + added
        );
      } else {
        this._challengingHits = Math.min(
          SCORE_MATRIX.CHALLENGING_STAGE_TOTAL_ENEMIES,
          this._challengingHits + added
        );
      }
    }
  }

  public resetChallengingHits(playerId?: PlayerId): void {
    if (!playerId || playerId === 'p1') this._challengingHits = 0;
    if (!playerId || playerId === 'p2') this._p2ChallengingHits = 0;
  }

  public getAccuracy(): number {
    if (this._shotsFired <= 0) {
      return 0;
    }
    return this._shotsHit / this._shotsFired;
  }

  public getAccuracyPercentage(): number {
    if (this._shotsFired <= 0) {
      return 0;
    }
    return (this._shotsHit / Math.max(1, this._shotsFired)) * 100;
  }

  public getFormattedAccuracy(decimals: number = 1): string {
    const pct = this.getAccuracyPercentage();
    return `${pct.toFixed(decimals)}%`;
  }

  public getStatsSummary(): GameStatsSummary {
    return {
      score: this._score,
      highScore: this._highScore,
      stage: this._stage,
      lives: this._lives,
      shotsFired: this._shotsFired,
      shotsHit: this._shotsHit,
      accuracyRatio: this.getAccuracy(),
      accuracyPercentage: this.getAccuracyPercentage(),
      formattedAccuracy: this.getFormattedAccuracy(1),
    };
  }

  public getScoreRecord(): ScoreRecord {
    return {
      score: this._score,
      highScore: this._highScore,
      stage: this._stage,
      lives: this._lives,
      shotsFired: this._shotsFired,
      hits: this._shotsHit,
    };
  }

  public getHUDState(stageBadges: number[] = []): HUDState {
    return {
      score: this._score,
      highScore: this._highScore,
      lives: this._lives,
      stage: this._stage,
      stageBadges,
    };
  }

  // ==========================================================================
  // LocalStorage Persistence & Fault-Tolerant Probe
  // ==========================================================================

  private getStorage(): Storage | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const probeKey = '__galaga_storage_probe__';
        window.localStorage.setItem(probeKey, '1');
        window.localStorage.removeItem(probeKey);
        return window.localStorage;
      } else if (typeof localStorage !== 'undefined') {
        const probeKey = '__galaga_storage_probe__';
        localStorage.setItem(probeKey, '1');
        localStorage.removeItem(probeKey);
        return localStorage;
      }
    } catch {
      // Storage unavailable / private mode / security restricted
    }
    return null;
  }

  public loadHighScore(): number {
    const storage = this.getStorage();
    if (storage) {
      try {
        let stored = storage.getItem(this._storageKey);
        if (stored === null && this._storageKey !== SCORE_MATRIX.FALLBACK_STORAGE_KEY) {
          stored = storage.getItem(SCORE_MATRIX.FALLBACK_STORAGE_KEY);
        }

        if (stored !== null) {
          const parsed = parseInt(stored, 10);
          if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0) {
            this._highScore = Math.max(SCORE_MATRIX.DEFAULT_HIGH_SCORE, parsed);
            return this._highScore;
          }
        }
      } catch {
        // Fallback to default
      }
    }
    this._highScore = SCORE_MATRIX.DEFAULT_HIGH_SCORE;
    return this._highScore;
  }

  public saveHighScore(): boolean {
    if (this._score > this._highScore) {
      this._highScore = this._score;
    }
    const storage = this.getStorage();
    if (storage) {
      try {
        storage.setItem(this._storageKey, String(this._highScore));
        return true;
      } catch {
        // QuotaExceededError or SecurityError -> safe in-memory fallback
        return false;
      }
    }
    return false;
  }

  public resetHighScore(persist: boolean = true): void {
    this._highScore = SCORE_MATRIX.DEFAULT_HIGH_SCORE;
    if (persist) {
      const storage = this.getStorage();
      if (storage) {
        try {
          storage.removeItem(this._storageKey);
          storage.removeItem(SCORE_MATRIX.FALLBACK_STORAGE_KEY);
        } catch {
          // Safe catch
        }
      }
    }
  }
}
