# Handoff Report — Milestone M31 Empirical Adversarial Verification

**Agent**: `m31_challenger_1` (Empirical Challenger / Red Team)  
**Parent Conversation ID**: `0236827c-a7d2-4115-a374-2f5c45ed8134`  
**Verdict**: ❌ **`REQUEST_CHANGES`** (1 critical defect discovered and empirically isolated)

---

## 1. Observation

### Test Execution Results
1. **Adversarial Stress Test Suite**:
   Command: `npx vitest run tests/unit/adversarial_m31_player_stress.test.ts`
   Result:
   ```
   RUN v3.2.7 /Users/user/src/galog
   ✓ Track 1: Concurrent Firing Saturation & Pool Capacity Bounds (4/4 passed)
     - sustains simultaneous 60Hz dual firing across 600 frames without mutual starvation (38 bullets each, 100% parity)
     - enforces quota independence when P1 is at max quota and P2 fires continuously
     - handles asymmetric weapon levels (P1 Single vs P2 Dual Rapid Scatter) without quota crosstalk
     - preserves strict zero-GC capacity (<= 256) under 10,000 continuous burst cycles
   ✓ Track 2: Independent Kinematics, Extremal Clamping & NaN Resistance (4/4 passed)
     - enforces simultaneous opposing boundary clamps without coordinate crosstalk (P1 x=12/16, P2 x=212/208)
     - allows smooth trajectory crossing without entity collision jamming or sticking
     - resists adversarial inputs, micro-steps, huge dt, and prevents NaN propagation
     - isolates Phase Warp execution so P1 teleportation does not alter P2 position
   ✓ Track 3: Independent Power-Up Decoupling & Damage Isolation (3/3 passed)
     - absorbs lethal damage via P1 Kinetic Shield while P2 is destructible by enemy threat
     - deflects enemy threat via P2 Kinetic Reflection Shield without harming P1
     - maintains independent buff durations and purges only the deceased player buffs on death
   × Track 4: Asymmetrical Scoring, Extra Life Extensions & Game Over Lifecycle (2/3 passed, 1 FAILED)
     - maintains active game state when P1 is eliminated, triggering GAME_OVER only when both fall (passed)
     - handles clean reset and mode toggle under high simulation stress (passed)
     - awards independent scores and triggers independent extra life extensions (FAILED)
   ```

2. **Verbatim Test Failure Error Output**:
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

3. **Codebase Inspection**:
   - `src/systems/ScoreManager.ts`:
     - Line 110:
       ```typescript
       private _onExtraLifeCallback: ((count: number) => void) | null = null;
       ```
     - Lines 222–224:
       ```typescript
       public onExtraLife(callback: (count: number) => void): void {
         this._onExtraLifeCallback = callback;
       }
       ```
     - Lines 358–360:
       ```typescript
       if (extraLivesAwarded > 0 && this._onExtraLifeCallback) {
         this._onExtraLifeCallback(extraLivesAwarded);
       }
       ```
     Notice `this._onExtraLifeCallback(extraLivesAwarded)` **does not pass `playerId`**!

   - `src/core/Game.ts`:
     - Lines 357–362:
       ```typescript
       // Wire extra life callback to add life to player and trigger audio
       this.scoreManager.onExtraLife((count: number, playerId?: PlayerId) => {
         const p = this.getPlayer(playerId ?? 'p1');
         if (p) {
           p.lives += count;
         }
         this.soundSynth.playExtraLife();
       });
       ```
     Notice `Game.ts` expects `(count: number, playerId?: PlayerId)`, but because `ScoreManager.ts` does not pass `playerId`, `playerId` is received as `undefined`.

---

## 2. Logic Chain

1. **Intended Contract**:
   According to `SCOPE.md` (F31: Multi-Entity Player Architecture) and `m31_worker/handoff.md`:
   Player 1 and Player 2 must have independent lives, scores, and extra-life extensions. When Player 2 accumulates 20,000 points, Player 2 should gain an extra life in both `ScoreManager` and `Player(p2)`.

2. **Mechanism of the Defect**:
   - In `ScoreManager.ts:334-344`, when `playerId === 'p2'`, `_p2Score` increments by 20,000.
   - The loop `while (this._p2Score >= this.getExtraLifeThreshold(...))` fires, incrementing `this._p2Lives += 1` and `extraLivesAwarded += 1`.
   - At line 358, `ScoreManager` invokes `this._onExtraLifeCallback(extraLivesAwarded)`.
   - The second argument (`playerId`) is **omitted**.
   - `Game.ts:357`'s callback is invoked with `(extraLivesAwarded=1, playerId=undefined)`.
   - `const p = this.getPlayer(playerId ?? 'p1')` executes `undefined ?? 'p1'`, which returns `p1` (Player 1)!
   - `p.lives += count` increments **Player 1's entity lives (`p1.lives`)** instead of Player 2's!

3. **Consequences & Blast Radius**:
   - **Cross-Player Life Theft**: In 2-player co-op, every time Player 2 achieves an extra-life milestone (20,000, 70,000, 140,000, etc.), the extra ship is granted to Player 1 (`p1.lives` becomes 5, 6, etc.), while Player 2 (`p2.lives`) receives zero additional reserve ships!
   - **State Desynchronization**: Inside `ScoreManager`, `scoreManager.getLives('p2')` reports 4, but `playerManager.getPlayer('p2').lives` remains 3. If Player 2 takes fatal damage 3 times, Player 2 is permanently eliminated, despite `ScoreManager` believing Player 2 has lives remaining.

---

## 3. Caveats

- **Tracks 1, 2, and 3 are Extremely Robust**:
  - **Concurrent Firing**: Firing at 60 Hz across 600 frames demonstrated zero starvation. Both players fired exactly 38 missiles (the theoretical maximum possible with single missile travel time across the 248px bounds). Quota limits (2 for single, 4 for dual, 8/16 for rapid/scatter) are strictly respected independently. Object pool capacity never exceeded 256 over 10,000 continuous burst cycles.
  - **Kinematics & Boundaries**: Simultaneous opposing boundary clamps (P1 at x=12/16 and P2 at x=212/208) executed cleanly with zero coordinate crosstalk. Crossing trajectories and adversarial inputs (micro-steps, dt=50, extreme pointer values) caused zero NaN values and remained bounded.
  - **Power-Up Decoupling**: Kinetic Shield on P1 absorbed damage without affecting P2. Threat to P2 damaged P2 without affecting P1. Player death correctly purged only the deceased player's buffs, preserving the partner's buffs.
  - **Game Over**: Game Over triggers only when both players are eliminated.
- **Review-Only Constraint Followed**: Per rule instructions ("Review-only — do NOT modify implementation code. Report any failures as findings — do NOT fix them yourself"), `src/systems/ScoreManager.ts` has NOT been edited by `m31_challenger_1`. The bug was recorded via empirical test in `tests/unit/adversarial_m31_player_stress.test.ts`.

---

## 4. Conclusion

**Verdict**: ❌ **`REQUEST_CHANGES`**

Milestone M31 cannot be approved until Defect `M31-DEFECT-01` is resolved by the worker:

### Required Remediation (`M31-DEFECT-01`):
1. In `src/systems/ScoreManager.ts`:
   - Update callback declaration at line 110:
     ```typescript
     private _onExtraLifeCallback: ((count: number, playerId?: PlayerId) => void) | null = null;
     ```
   - Update `onExtraLife` method signature at line 222:
     ```typescript
     public onExtraLife(callback: (count: number, playerId?: PlayerId) => void): void {
       this._onExtraLifeCallback = callback;
     }
     ```
   - Pass `playerId` when invoking callback at line 359:
     ```typescript
     if (extraLivesAwarded > 0 && this._onExtraLifeCallback) {
       this._onExtraLifeCallback(extraLivesAwarded, playerId);
     }
     ```
2. Also note: A peer agent created `tests/unit/adversarial_m31_challenger_2.test.ts` with TypeScript errors (`TS2339: Property 'getBulletPool' does not exist on type 'BulletManager'`, `TS6133: unused variables`) which should be cleaned up so `npm run build` succeeds.

---

## 5. Verification Method

To independently verify this defect and its subsequent fix:

1. **Run the Adversarial Test Suite**:
   ```bash
   npx vitest run tests/unit/adversarial_m31_player_stress.test.ts
   ```
   - **Current Output**: 13 passed, 1 failed (`awards independent scores and triggers independent extra life extensions`).
   - **Post-Fix Output**: 14/14 passed.

2. **Verify Cross-Player Life Extension Test**:
   Inspect `tests/unit/adversarial_m31_player_stress.test.ts:492-515`.
   Confirm that when `game.scoreManager.addScore(20000, 'p2')` is called:
   - `p2.lives === 4` (expected)
   - `p1.lives === 4` (unchanged from P1's own 20,000 extend)
   - Currently, `p1.lives === 5` and `p2.lives === 3`.

3. **Full Project Test Suite**:
   ```bash
   npm test
   ```
   Expected once fixed: All test files passing 100%.
