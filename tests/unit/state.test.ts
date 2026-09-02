import { describe, it, expect, beforeEach } from 'vitest';

export type GameStateType =
  | 'TITLE'
  | 'STAGE_INTRO'
  | 'PLAYING'
  | 'CHALLENGING_STAGE'
  | 'STAGE_CLEAR'
  | 'GAME_OVER'
  | 'PAUSED';

export function isChallengingStage(stageNumber: number): boolean {
  return stageNumber >= 3 && stageNumber % 4 === 3;
}

export class GameStateMachine {
  private _state: GameStateType = 'TITLE';
  private _stage: number = 1;
  private _previousState: GameStateType | null = null;
  private _lives: number = 3;

  constructor(initialState: GameStateType = 'TITLE', initialStage: number = 1) {
    this._state = initialState;
    this._stage = initialStage;
  }

  get state(): GameStateType {
    return this._state;
  }

  get stage(): number {
    return this._stage;
  }

  get lives(): number {
    return this._lives;
  }

  setLives(lives: number): void {
    this._lives = Math.max(0, lives);
  }

  startGame(): boolean {
    if (this._state === 'TITLE' || this._state === 'GAME_OVER') {
      this._stage = 1;
      this._lives = 3;
      this._state = 'STAGE_INTRO';
      return true;
    }
    return false;
  }

  finishStageIntro(): boolean {
    if (this._state !== 'STAGE_INTRO') return false;

    if (isChallengingStage(this._stage)) {
      this._state = 'CHALLENGING_STAGE';
    } else {
      this._state = 'PLAYING';
    }
    return true;
  }

  clearWave(): boolean {
    if (this._state === 'PLAYING' || this._state === 'CHALLENGING_STAGE') {
      this._state = 'STAGE_CLEAR';
      return true;
    }
    return false;
  }

  nextStage(): boolean {
    if (this._state !== 'STAGE_CLEAR') return false;
    this._stage += 1;
    this._state = 'STAGE_INTRO';
    return true;
  }

  loseLife(): boolean {
    if (this._state !== 'PLAYING' && this._state !== 'CHALLENGING_STAGE') return false;
    this._lives -= 1;
    if (this._lives <= 0) {
      this._state = 'GAME_OVER';
    }
    return true;
  }

  pause(): boolean {
    if (this._state === 'PLAYING' || this._state === 'CHALLENGING_STAGE') {
      this._previousState = this._state;
      this._state = 'PAUSED';
      return true;
    }
    return false;
  }

  resume(): boolean {
    if (this._state === 'PAUSED' && this._previousState) {
      this._state = this._previousState;
      this._previousState = null;
      return true;
    }
    return false;
  }

  restartToTitle(): boolean {
    if (this._state === 'GAME_OVER') {
      this._state = 'TITLE';
      this._stage = 1;
      this._lives = 3;
      return true;
    }
    return false;
  }
}

// ----------------------------------------------------------------------
// TEST SUITES
// ----------------------------------------------------------------------

describe('Game State Machine & Stage Sequencing Suite', () => {
  let sm: GameStateMachine;

  beforeEach(() => {
    sm = new GameStateMachine('TITLE', 1);
  });

  describe('Initial State & Game Initialization', () => {
    it('starts in TITLE state with stage 1 and 3 lives', () => {
      expect(sm.state).toBe('TITLE');
      expect(sm.stage).toBe(1);
      expect(sm.lives).toBe(3);
    });

    it('transitions from TITLE to STAGE_INTRO upon startGame()', () => {
      const success = sm.startGame();
      expect(success).toBe(true);
      expect(sm.state).toBe('STAGE_INTRO');
      expect(sm.stage).toBe(1);
    });

    it('rejects invalid startGame() if not in TITLE or GAME_OVER', () => {
      sm.startGame(); // Now STAGE_INTRO
      const retry = sm.startGame();
      expect(retry).toBe(false);
      expect(sm.state).toBe('STAGE_INTRO');
    });
  });

  describe('Normal Stage Intro & Dogfight Loop', () => {
    it('transitions from STAGE_INTRO to PLAYING for Stage 1 (normal wave)', () => {
      sm.startGame(); // STAGE_INTRO, stage 1
      expect(sm.finishStageIntro()).toBe(true);
      expect(sm.state).toBe('PLAYING');
    });

    it('transitions from PLAYING to STAGE_CLEAR upon wave completion', () => {
      sm.startGame();
      sm.finishStageIntro();
      expect(sm.state).toBe('PLAYING');

      expect(sm.clearWave()).toBe(true);
      expect(sm.state).toBe('STAGE_CLEAR');
    });

    it('transitions from STAGE_CLEAR to STAGE_INTRO and increments stage number to 2', () => {
      sm.startGame();
      sm.finishStageIntro();
      sm.clearWave();

      expect(sm.nextStage()).toBe(true);
      expect(sm.state).toBe('STAGE_INTRO');
      expect(sm.stage).toBe(2);

      // Stage 2 is also normal stage
      expect(sm.finishStageIntro()).toBe(true);
      expect(sm.state).toBe('PLAYING');
    });
  });

  describe('Challenging Stage Sequencing & Frequency Formula', () => {
    it('verifies authentic Galaga challenging stage recurrence: Stages 3, 7, 11, 15, 19, 23, 27, 31...', () => {
      const expectedChallengingStages = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51, 55, 59, 63, 67, 71, 75, 79, 83, 87, 91, 95, 99];
      for (let s = 1; s <= 100; s++) {
        const isChallenging = isChallengingStage(s);
        if (expectedChallengingStages.includes(s)) {
          expect(isChallenging, `Stage ${s} should be a Challenging Stage`).toBe(true);
        } else {
          expect(isChallenging, `Stage ${s} should NOT be a Challenging Stage`).toBe(false);
        }
      }
    });

    it('enters CHALLENGING_STAGE automatically when completing Stage 2 and entering Stage 3', () => {
      // Simulate clearing stage 1
      sm.startGame(); // Stage 1 intro
      sm.finishStageIntro(); // Stage 1 playing
      sm.clearWave();
      sm.nextStage(); // Stage 2 intro

      // Simulate clearing stage 2
      sm.finishStageIntro(); // Stage 2 playing
      sm.clearWave();
      sm.nextStage(); // Stage 3 intro

      expect(sm.stage).toBe(3);
      expect(sm.state).toBe('STAGE_INTRO');

      // Finish stage intro on Stage 3 -> must enter CHALLENGING_STAGE
      expect(sm.finishStageIntro()).toBe(true);
      expect(sm.state).toBe('CHALLENGING_STAGE');
    });

    it('transitions CHALLENGING_STAGE -> STAGE_CLEAR -> STAGE_INTRO -> PLAYING (Stage 4)', () => {
      // Direct jump to Stage 3
      const stage3Machine = new GameStateMachine('STAGE_INTRO', 3);
      stage3Machine.finishStageIntro();
      expect(stage3Machine.state).toBe('CHALLENGING_STAGE');

      // Finish challenging stage wave
      expect(stage3Machine.clearWave()).toBe(true);
      expect(stage3Machine.state).toBe('STAGE_CLEAR');

      // Advance to Stage 4
      expect(stage3Machine.nextStage()).toBe(true);
      expect(stage3Machine.stage).toBe(4);
      expect(stage3Machine.state).toBe('STAGE_INTRO');

      // Stage 4 intro finish -> PLAYING (normal wave)
      expect(stage3Machine.finishStageIntro()).toBe(true);
      expect(stage3Machine.state).toBe('PLAYING');
    });
  });

  describe('Pause and Resume Lifecycle', () => {
    it('pauses and resumes active PLAYING state', () => {
      sm.startGame();
      sm.finishStageIntro();
      expect(sm.state).toBe('PLAYING');

      expect(sm.pause()).toBe(true);
      expect(sm.state).toBe('PAUSED');

      expect(sm.resume()).toBe(true);
      expect(sm.state).toBe('PLAYING');
    });

    it('pauses and resumes active CHALLENGING_STAGE state', () => {
      const stage3 = new GameStateMachine('STAGE_INTRO', 3);
      stage3.finishStageIntro();
      expect(stage3.state).toBe('CHALLENGING_STAGE');

      expect(stage3.pause()).toBe(true);
      expect(stage3.state).toBe('PAUSED');

      expect(stage3.resume()).toBe(true);
      expect(stage3.state).toBe('CHALLENGING_STAGE');
    });

    it('rejects pause when already in TITLE or GAME_OVER or STAGE_CLEAR', () => {
      expect(sm.pause()).toBe(false);
      expect(sm.state).toBe('TITLE');
    });
  });

  describe('Game Over & Restart Cycle', () => {
    it('decrements lives and triggers GAME_OVER when lives reach 0', () => {
      sm.startGame();
      sm.finishStageIntro();
      expect(sm.lives).toBe(3);

      sm.loseLife();
      expect(sm.lives).toBe(2);
      expect(sm.state).toBe('PLAYING');

      sm.loseLife();
      expect(sm.lives).toBe(1);
      expect(sm.state).toBe('PLAYING');

      sm.loseLife();
      expect(sm.lives).toBe(0);
      expect(sm.state).toBe('GAME_OVER');
    });

    it('restarts game back to TITLE or starts a new game from GAME_OVER', () => {
      sm.startGame();
      sm.finishStageIntro();
      sm.setLives(0);
      sm.loseLife(); // Trigger GAME_OVER
      expect(sm.state).toBe('GAME_OVER');

      expect(sm.restartToTitle()).toBe(true);
      expect(sm.state).toBe('TITLE');
      expect(sm.stage).toBe(1);
      expect(sm.lives).toBe(3);

      // Direct restart from GAME_OVER
      sm.setLives(0);
      const gameOverSM = new GameStateMachine('GAME_OVER', 5);
      expect(gameOverSM.startGame()).toBe(true);
      expect(gameOverSM.state).toBe('STAGE_INTRO');
      expect(gameOverSM.stage).toBe(1);
      expect(gameOverSM.lives).toBe(3);
    });
  });
});
