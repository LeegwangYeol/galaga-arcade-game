# Handoff Report — Failure Investigation & Fix Strategy for M31-DEFECT-01

**Agent**: `m31_rem_explorer_1` (Remediation Architecture Explorer)  
**Parent Conversation ID**: `0236827c-a7d2-4115-a374-2f5c45ed8134`  
**Milestone**: M31 Iteration 2  
**Status**: COMPLETE (Investigation finished, remediation fix strategy and verification plan formulated)  

---

## 1. Observation

### A. Failing Test in `tests/unit/adversarial_m31_player_stress.test.ts`
- **Command**: `npx vitest run tests/unit/adversarial_m31_player_stress.test.ts`
- **Verbatim Error Output**:
  ```
  FAIL tests/unit/adversarial_m31_player_stress.test.ts > Milestone M31 Adversarial Empirical Verification Suite > Track 4: Asymmetrical Scoring, Extra Life Extensions & Game Over Lifecycle > awards independent scores and triggers independent extra life extensions
  AssertionError: expected 5 to be 4 // Object.is equality

  - Expected
  + Received

  - 4
  + 5 

   ❯ tests/unit/adversarial_m31_player_stress.test.ts:513:24
      511|       // Because playerId is omitted, it defaults to 'p1', granting the extra life to P1!
      512|       // Consequently: p1.lives erroneously increments to 5, while p2.lives remains stuck at 3!
      513|       expect(p1.lives).toBe(4); // Fails here if P1 stole life: received 5
         |                        ^
      514|       expect(p2.lives).toBe(4); // Fails here if P2 was starved: received 3
  ```
- **Overall Suite Status**: 111 test files passed, 1 test file failed (`2,040 passed, 1 failed`).

### B. Code Inspection in `src/systems/ScoreManager.ts`
1. **Line 110**:
   ```typescript
   private _onExtraLifeCallback: ((count: number) => void) | null = null;
   ```
2. **Lines 222–224**:
   ```typescript
   public onExtraLife(callback: (count: number) => void): void {
     this._onExtraLifeCallback = callback;
   }
   ```
3. **Lines 321 & 358–360**:
   ```typescript
   public addScore(points: number, playerId: PlayerId = 'p1'): ScoreEventPayload {
     ...
     if (extraLivesAwarded > 0 && this._onExtraLifeCallback) {
       this._onExtraLifeCallback(extraLivesAwarded); // OMITTED playerId!
     }
   ```

### C. Code Inspection in `src/core/Game.ts`
- **Lines 357–363**:
  ```typescript
  // Wire extra life callback to add life to player and trigger audio
  this.scoreManager.onExtraLife((count: number, playerId?: PlayerId) => {
    const p = this.getPlayer(playerId ?? 'p1');
    if (p) {
      p.lives += count;
    }
    MusicJingles.playDockingJingle();
  });
  ```
  `Game.ts` is already wired to accept `playerId?: PlayerId`, but because `ScoreManager.ts:359` calls `this._onExtraLifeCallback(extraLivesAwarded)` with only 1 argument, `playerId` is received as `undefined`. `playerId ?? 'p1'` evaluates to `'p1'`, granting Player 2's extra life to Player 1.

### D. Build & Typecheck Errors in `tests/unit/adversarial_m31_challenger_2.test.ts`
- **Command**: `npm run build` (`tsc --noEmit && vite build`)
- **Verbatim Error Output**:
  ```
  tests/unit/adversarial_m31_challenger_2.test.ts(14,1): error TS6133: 'PlayerManager' is declared but its value is never read.
  tests/unit/adversarial_m31_challenger_2.test.ts(15,1): error TS6133: 'BulletManager' is declared but its value is never read.
  tests/unit/adversarial_m31_challenger_2.test.ts(17,1): error TS6133: 'TractorBeam' is declared but its value is never read.
  ```
- **Root Cause**: `tsconfig.json` enforces `"noUnusedLocals": true`. Lines 14, 15, and 17 in `adversarial_m31_challenger_2.test.ts` import unused symbols.

### E. Baseline Backward-Compatibility Test Invariants
- **`tests/unit/hud_screens.test.ts:316`**:
  ```typescript
  // 1st extra life at 20,000
  scoreManager.addScore(20000);
  expect(scoreManager.lives).toBe(4);
  expect(extraLifeCallback).toHaveBeenCalledWith(1);
  ```
- **`tests/unit/m7_challenger_1_adversarial.test.ts:172, 187`**:
  ```typescript
  expect(extraLifeSpy).toHaveBeenCalledWith(3);
  ...
  expect(extraLifeSpy).toHaveBeenCalledWith(15);
  ```
- **Empirical Vitest Matcher Verification**:
  In Vitest / Jest, `expect(spy).toHaveBeenCalledWith(expectedArg)` checks that the argument array matches in length and values.
  Calling `spy(1, 'p1')` or `spy(1, undefined)` fails `toHaveBeenCalledWith(1)` with:
  `AssertionError: expected "spy" to be called with arguments: [ 1 ], but got [ 1, "p1" ]`.
  Therefore, when `playerId` is not specified by the caller (single-player legacy calls), the callback must be called with exactly 1 argument `(extraLivesAwarded)`.

---

## 2. Logic Chain

1. **Intended Architecture (`SCOPE.md` F31)**:
   In 2-Player Co-op mode, Player 1 and Player 2 maintain independent life counts, score tallies, and extra life extends. Earning 20,000 points on Player 2 must increment Player 2's reserve ships (`p2.lives = 4`), without modifying Player 1's reserve ships (`p1.lives = 4`).

2. **Mechanism of Defect `M31-DEFECT-01`**:
   - When `game.scoreManager.addScore(20000, 'p2')` is invoked:
     - `ScoreManager` increments `this._p2Score` to 20,000.
     - `this._p2Lives` increments to 4, and `extraLivesAwarded = 1`.
     - `ScoreManager:359` invokes `this._onExtraLifeCallback(extraLivesAwarded)`.
     - The second argument `playerId` is omitted.
   - `Game.ts:357`'s callback is invoked:
     - Signature: `(count: number, playerId?: PlayerId) => void`.
     - Parameters received: `count = 1`, `playerId = undefined`.
     - Fallback expression: `const p = this.getPlayer(playerId ?? 'p1')`.
     - Because `undefined ?? 'p1'` evaluates to `'p1'`, `p` resolves to `p1` (Player 1).
     - `p.lives += count` increments `p1.lives` from 4 to 5!
     - `p2.lives` remains unchanged at 3!
   - In `tests/unit/adversarial_m31_player_stress.test.ts:513`, `expect(p1.lives).toBe(4)` fails because `p1.lives === 5`.

3. **Backward-Compatibility Constraint for 1,930 Baseline Tests**:
   - If `this._onExtraLifeCallback` were changed to unconditionally pass `(extraLivesAwarded, playerId)` while `addScore` defaults `playerId: PlayerId = 'p1'`:
     - Any single-player test calling `sm.addScore(20000)` would invoke `this._onExtraLifeCallback(1, 'p1')`.
     - `tests/unit/hud_screens.test.ts:316` asserting `expect(extraLifeCallback).toHaveBeenCalledWith(1)` would fail.
     - `tests/unit/m7_challenger_1_adversarial.test.ts:172, 187` asserting `expect(extraLifeSpy).toHaveBeenCalledWith(3)` would fail.
   - **Resolution**:
     Make `playerId?: PlayerId` optional across `ScoreManager`:
     ```typescript
     if (extraLivesAwarded > 0 && this._onExtraLifeCallback) {
       if (playerId !== undefined) {
         this._onExtraLifeCallback(extraLivesAwarded, playerId);
       } else {
         this._onExtraLifeCallback(extraLivesAwarded);
       }
     }
     ```
     - When called without `playerId` (legacy single-player / baseline tests), `_onExtraLifeCallback` is called with 1 argument (`1`), passing all baseline unit tests.
     - When called with `playerId` (`'p1'` or `'p2'`), `_onExtraLifeCallback` is called with 2 arguments, routing the extra life to the intended player entity in `Game.ts`.

4. **Build Fix Logic**:
   - `tests/unit/adversarial_m31_challenger_2.test.ts` imports `PlayerManager`, `BulletManager`, and `TractorBeam` from `../../src/...` on lines 14, 15, and 17.
   - The test interacts with these subsystems exclusively through `game.playerManager`, `game.bulletManager`, and `game.tractorBeam`.
   - Removing lines 14, 15, and 17 eliminates the TS6133 errors and restores clean `npm run build` compilation.

---

## 3. Caveats

1. **Review-Only Role**:
   As `m31_rem_explorer_1`, no source files in `src/` or `tests/` were modified. The proposed modifications are provided as exact code snippets below for implementation by `m31_worker`.
2. **`tests/unit/score.test.ts` Independence**:
   `tests/unit/score.test.ts` defines its own isolated in-file `ScoreManager` mock class from Milestone M7. It does not import `src/systems/ScoreManager.ts` and is completely unaffected.
3. **Subsequent Milestones Scope**:
   - Hardware key multiplexing (WASD vs Arrow keys non-blocking tracking) is scoped for Milestone M32.
   - Cooperative revive and reserve life-sharing are scoped for Milestone M33.

---

## 4. Conclusion & Proposed Fix Implementation

### Proposed Changes for `m31_worker`

#### File 1: `src/systems/ScoreManager.ts`
1. **Callback Declaration (Line 110)**:
   ```typescript
   // Before:
   private _onExtraLifeCallback: ((count: number) => void) | null = null;

   // After:
   private _onExtraLifeCallback: ((count: number, playerId?: PlayerId) => void) | null = null;
   ```

2. **Event Subscription Method (Lines 222–224)**:
   ```typescript
   // Before:
   public onExtraLife(callback: (count: number) => void): void {
     this._onExtraLifeCallback = callback;
   }

   // After:
   public onExtraLife(callback: (count: number, playerId?: PlayerId) => void): void {
     this._onExtraLifeCallback = callback;
   }
   ```

3. **`addScore` Signature & Callback Invocation (Lines 321 & 358–360)**:
   ```typescript
   // Before:
   public addScore(points: number, playerId: PlayerId = 'p1'): ScoreEventPayload {
     ...
     if (extraLivesAwarded > 0 && this._onExtraLifeCallback) {
       this._onExtraLifeCallback(extraLivesAwarded);
     }

   // After:
   public addScore(points: number, playerId?: PlayerId): ScoreEventPayload {
     if (points <= 0 || !Number.isFinite(points)) {
       return {
         addedScore: 0,
         currentScore: this.getScore(playerId ?? 'p1'),
         highScore: this._highScore,
         extraLivesAwarded: 0,
       };
     }
     ...
     if (extraLivesAwarded > 0 && this._onExtraLifeCallback) {
       if (playerId !== undefined) {
         this._onExtraLifeCallback(extraLivesAwarded, playerId);
       } else {
         this._onExtraLifeCallback(extraLivesAwarded);
       }
     }
   ```

4. **Helper Methods Optional PlayerId (Lines 376–438)**:
   Ensure `addScoreForEnemy`, `addScoreForCapturedFighter`, and `addChallengingStageBonus` forward optional `playerId?: PlayerId`:
   ```typescript
   public addScoreForEnemy(
     type: EnemyType | string,
     isDiving: boolean,
     escortCount: number = 0,
     playerId?: PlayerId
   ): ScoreEventPayload {
     ...
     return this.addScore(points, playerId);
   }

   public addScoreForCapturedFighter(isDiving: boolean, playerId?: PlayerId): ScoreEventPayload {
     ...
     return this.addScore(points, playerId);
   }

   public addChallengingStageBonus(
     hits: number,
     totalEnemies: number = SCORE_MATRIX.CHALLENGING_STAGE_TOTAL_ENEMIES,
     playerId?: PlayerId
   ): ScoreEventPayload {
     ...
     return this.addScore(bonus, playerId);
   }
   ```

#### File 2: `tests/unit/adversarial_m31_challenger_2.test.ts`
Remove unused imports at lines 14, 15, and 17:
```typescript
// Before:
import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { Player } from '../../src/entities/Player';
import { PlayerManager } from '../../src/systems/PlayerManager';
import { BulletManager } from '../../src/entities/Bullet';
import { Enemy } from '../../src/entities/Enemy';
import { TractorBeam } from '../../src/entities/TractorBeam';
import { EnemyType, EnemyState, InputState } from '../../src/types';

// After:
import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { Player } from '../../src/entities/Player';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState, InputState } from '../../src/types';
```

---

## 5. Verification Method

### Step 1: Verify Unit Test Resolution
Run the adversarial player stress test:
```bash
npx vitest run tests/unit/adversarial_m31_player_stress.test.ts
```
- **Current State**: 13 passed, 1 failed (`Track 4 > awards independent scores and triggers independent extra life extensions`).
- **Post-Fix Expected State**: 14 passed (100% pass).

### Step 2: Verify Baseline Regression Invariance
Run the tests with single-argument `toHaveBeenCalledWith` assertions:
```bash
npx vitest run tests/unit/hud_screens.test.ts
npx vitest run tests/unit/m7_challenger_1_adversarial.test.ts
```
- **Post-Fix Expected State**: All tests in both suites pass cleanly.

### Step 3: Verify TypeScript Compilation & Production Build
Run typecheck and build commands:
```bash
npm run typecheck
npm run build
```
- **Current State**: TS6133 errors on `adversarial_m31_challenger_2.test.ts`.
- **Post-Fix Expected State**: 0 TypeScript diagnostics, Vite build succeeds in < 500ms.

### Step 4: Run Full Project Test Suite
```bash
npm test
```
- **Post-Fix Expected State**: 112/112 test suites passed, 2,041/2,041 tests passed (100%).

---
*Report prepared by m31_rem_explorer_1 — ready for worker remediation dispatch.*
