# Handoff Report — Milestone M31 Adversarial Empirical Verification (m31_challenger_2)

## 1. Observation

Direct tool executions and empirical test results:

1. **Challenger 2 Adversarial Test Suite Execution**:
   - Command: `npx vitest run tests/unit/adversarial_m31_challenger_2.test.ts`
   - Output:
     ```
     ✓ tests/unit/adversarial_m31_challenger_2.test.ts (10 tests) 142ms
     Test Files  1 passed (1)
          Tests  10 passed (10)
       Duration  664ms
     ```
   - All 10 adversarial tests covering Co-op Tractor Beam Capture, Cross-Player Rescue, Independent Elimination, and 1,000-Frame Zero-GC Stress passed cleanly.

2. **Project Test Suite Execution (`npm test`)**:
   - Command: `npm test`
   - Output:
     ```
     FAIL  tests/unit/adversarial_m31_player_stress.test.ts > Milestone M31 Adversarial Empirical Verification Suite > Track 4: Asymmetrical Scoring, Extra Life Extensions & Game Over Lifecycle > awards independent scores and triggers independent extra life extensions
     AssertionError: expected 5 to be 4 // Object.is equality

     - Expected
     + Received

     - 4
     + 5

      ❯ tests/unit/adversarial_m31_player_stress.test.ts:513:24
         511|       // Because playerId is omitted, it defaults to 'p1', granting the extra life to P1!
         512|       // Consequently: p1.lives erroneously increments to 5, while p2.lives remains 3!
         513|       expect(p1.lives).toBe(4); // Fails here if P1 stole life: received 5
            |                        ^
         514|       expect(p2.lives).toBe(4); // Fails here if P2 was starved: received 3
         515|     });

      Test Files  1 failed | 111 passed (112)
           Tests  1 failed | 2040 passed (2041)
        Duration  8.78s
     ```

3. **Codebase Forensic Inspection — Extra Life Dispatch Defect**:
   - In `src/systems/ScoreManager.ts`:
     - Line 110:
       ```typescript
       private _onExtraLifeCallback: ((count: number) => void) | null = null;
       ```
     - Line 222–224:
       ```typescript
       public onExtraLife(callback: (count: number) => void): void {
         this._onExtraLifeCallback = callback;
       }
       ```
     - Line 358–360:
       ```typescript
       if (extraLivesAwarded > 0 && this._onExtraLifeCallback) {
         this._onExtraLifeCallback(extraLivesAwarded);
       }
       ```
   - In `src/core/Game.ts`:
     - Line 357–363:
       ```typescript
       this.scoreManager.onExtraLife((count: number, playerId?: PlayerId) => {
         const p = this.getPlayer(playerId ?? 'p1');
         if (p) {
           p.lives += count;
         }
         MusicJingles.playDockingJingle();
       });
       ```

4. **Codebase Inspection — Rescue Docking & Dual Fighter Formation**:
   - In `src/core/Game.ts`:
     - Line 1269–1271:
       ```typescript
       const rescuer = (ownerId ? this.playerManager.getPlayer(ownerId) : undefined) ?? this.player;
       rescuer.startRescue(enemy.x, enemy.y);
       this.scoreManager.addScore(1000, ownerId); // Rescue bonus
       ```
   - In `src/entities/Player.ts`:
     - Line 836–845:
       ```typescript
       public startRescue(bossX: number, bossY: number): void {
         this._state = 'docking';
         this.rescuedFighter = {
           x: bossX,
           y: bossY,
           targetX: this.x < bossX ? this.x + 16 : this.x - 16,
           targetY: Player.BASELINE_Y,
           active: true,
           angle: 0,
         };
       }
       ```

---

## 2. Logic Chain

1. **Co-op Tractor Beam Capture & Cross-Player Rescue Flow**:
   - **Tractor Beam Mobility**: When Boss Galaga initiates its tractor beam targeting P1, P2 remains outside the beam cone ($x = 180$, beam centered at $x = 112$). P2 remains in `normal` state, retains 100% horizontal mobility, and fires missiles without starvation (`adversarial_m31_challenger_2.test.ts:31–81`).
   - **Mid-Capture Interception**: If P2 destroys Boss Galaga while the beam is capturing P1, the beam collapses immediately, P1's capture is aborted via `cancelCapture()`, returning P1 to `normal` with 1.0s invulnerability grace (`adversarial_m31_challenger_2.test.ts:83–118`).
   - **Captured Escort Destruction**: Once P1 is captured, P1 loses 1 life and respawns if lives remain. Boss Galaga gains an escort (`CAPTURED_FIGHTER`) and enters `DIVING_ESCORT`.
   - **Rescue Bonus Attribution**: When P2 fires the fatal missile at diving Boss Galaga (`ownerId === 'p2'`), P2 is credited with the 1,000 pts rescue bonus (`scoreManager.getScore('p2') >= 1000`), while P1's score is untouched (`adversarial_m31_challenger_2.test.ts:120–175`).
   - **Docking Descent Dynamics**: In `Game.ts:1269`, `rescuer` is resolved to `p2` (the shooter). `rescuer.startRescue()` activates `p2.rescuedFighter.active = true` and `p2.state = 'docking'`. The captured ship descends towards P2 at 120 px/s (`Player.RESCUE_DESCENT_SPEED`) and docks, transforming P2 into a Dual Fighter with a 4-missile limit. P1 remains in single-fighter mode (or eliminated if 0 lives). This adheres to `SCOPE.md` F37 ("P2 can attack and destroy boss capturing P1 to free them into dual-fighter formation").

2. **Independent Elimination & Game Over Invariants**:
   - When P1 exhausts all 3 lives, P1 transitions through `destroyed` state and is eliminated.
   - `playerManager.areAllPlayersDead()` checks all players and returns `false` because P2 has lives remaining.
   - In `Game.ts:1088`, `player.onGameOver` checks `if (this.playerManager.areAllPlayersDead()) this.setState('GAME_OVER')`. Since P2 is alive, `GAME_OVER` is NOT triggered.
   - P2 continues playing, steering, firing, and scoring normally (`adversarial_m31_challenger_2.test.ts:204–276`).
   - `GAME_OVER` triggers strictly when BOTH P1 and P2 have exhausted all lives (`adversarial_m31_challenger_2.test.ts:278–310`).
   - Symmetrical reverse order (P2 eliminated first, P1 surviving) exhibits identical behavior (`adversarial_m31_challenger_2.test.ts:312–344`).

3. **Zero-GC & Memory Leak Stress (1,000 Co-op Frames)**:
   - During 1,000 continuous 60Hz co-op simulation ticks under concurrent firing, weapon tier shifts (single $\leftrightarrow$ dual), and respawns:
     - `bulletPool.getCapacity() <= 256` was maintained unconditionally.
     - Active bullets never exceeded 8 (max 4 per player).
     - Coordinates and velocities remained finite with 0 NaNs.
     - `bulletManager.clear()` reliably reset active counts (`p1Active = 0`, `p2Active = 0`, `totalActive = 0`).
   - 10,000 rapid acquire and release cycles resulted in 0 pool expansion beyond initial capacity (`adversarial_m31_challenger_2.test.ts:347–488`).

4. **Root Cause of Failing `npm test` (`ScoreManager` Life Steal Bug)**:
   - In `src/systems/ScoreManager.ts:334–340`, when P2 reaches the extra-life threshold (20,000 points), `this._p2Lives` increments and `extraLivesAwarded` is computed.
   - However, in line 359:
     ```typescript
     this._onExtraLifeCallback(extraLivesAwarded); // OMITTED playerId!
     ```
   - In `src/core/Game.ts:358`:
     ```typescript
     const p = this.getPlayer(playerId ?? 'p1'); // playerId is undefined, defaults to p1!
     ```
   - As a result, when P2 earns an extra life, the physical `Player` entity awarded the life is P1 instead of P2.
   - P1's lives increment to 5, while P2's lives remain at 3.
   - This failure was empirically captured in `tests/unit/adversarial_m31_player_stress.test.ts:513` and causes `npm test` to fail.

---

## 3. Caveats

- **Strict Review-Only Discipline**: As an empirical verifier (`critic`, `specialist`), implementation files in `src/` were not modified. The bug must be resolved by `m31_worker`.
- **Milestone Phasing**: Hardware input multiplexing (non-blocking WASD vs Arrow keys, split-screen touch) is scheduled for Milestone M32. Dual input was verified programmatically via `PlayerManager.update(dt, inputs)`.
- **Revive & Life Sharing**: Reviving a fallen ally with 0 lives via life donation or stage-clear revive is scheduled for Milestone M33. In M31, an eliminated player remains inactive while the surviving ally finishes the stage.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

- **Verified Strengths**:
  - Multi-Entity Player Architecture (`PlayerManager`, `PlayerEntity`) operates cleanly with independent kinematics, screen clamping, and state transitions.
  - Co-op Tractor Beam: P2 remains uninhibited and mobile while P1 is captured; beam collapses cleanly on mid-capture boss kill; P2 receives 1,000 pts rescue bonus and initiates dual docking upon killing diving boss.
  - Independent Elimination: Game does NOT prematurely trigger `GAME_OVER` when one player falls. Game Over is triggered strictly when both players are eliminated.
  - Zero-GC Invariants: Bullet pool capacity strictly adheres to $\le 256$, with 0 leaks across 1,000 co-op frames and 10,000 stress cycles.
  - `tests/unit/adversarial_m31_challenger_2.test.ts` (10/10 passing).

- **Required Remediation for Worker**:
  1. In `src/systems/ScoreManager.ts:110`:
     Update callback type to include `playerId?: PlayerId`:
     ```typescript
     private _onExtraLifeCallback: ((count: number, playerId?: PlayerId) => void) | null = null;
     ```
  2. In `src/systems/ScoreManager.ts:222–224`:
     Update method signature:
     ```typescript
     public onExtraLife(callback: (count: number, playerId?: PlayerId) => void): void {
       this._onExtraLifeCallback = callback;
     }
     ```
  3. In `src/systems/ScoreManager.ts:358–360`:
     Pass `playerId` to the callback:
     ```typescript
     if (extraLivesAwarded > 0 && this._onExtraLifeCallback) {
       this._onExtraLifeCallback(extraLivesAwarded, playerId);
     }
     ```

---

## 5. Verification Method

To independently verify this evaluation:

1. **Run Challenger 2 Test Suite**:
   ```bash
   npx vitest run tests/unit/adversarial_m31_challenger_2.test.ts
   ```
   Expected: 10/10 tests pass.

2. **Run Full Test Suite (Demonstrating Failure Prior to Worker Remediation)**:
   ```bash
   npm test
   ```
   Expected: 111 passed test files, 1 failed test file (`adversarial_m31_player_stress.test.ts:513`).

3. **Post-Fix Verification (Once Worker Applies 3-Line Fix in ScoreManager.ts)**:
   ```bash
   npm test
   npm run build
   ```
   Expected: 112 passed test files (2,041+ tests passed), 0 failures, clean Vite build.
