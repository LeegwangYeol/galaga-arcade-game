# Exploration & Verification Blueprint Report: Milestone M33 Iteration 2 (Remediation)

- **Agent**: `m33_rem_explorer_3` (Test Suite Integration & Baseline Safety Explorer)
- **Role**: `explorer`, `qa`, `synthesizer`
- **Milestone**: M33 Iteration 2 (Local 2-Player Co-op Multiplayer Mode: Remediation)
- **Parent Conversation ID**: `0236827c-a7d2-4115-a374-2f5c45ed8134`
- **Working Directory**: `/Users/user/src/galog/.agents/m33_rem_explorer_3`
- **Timestamp**: 2026-09-14T10:35:00Z

---

## 1. Observation

### 1.1 Root Cause in `Player.ts:updateDestroyed`
Inspection of `/Users/user/src/galog/src/entities/Player.ts` lines 593–625:
```typescript
593:   public startRevivePending(countdown: number = 10.0): void {
594:     this._state = 'revive_pending';
595:     this.reviveTimer = countdown;
596:     this.x = this.id === 'p1' ? 80 : 144;
597:     this.y = Player.BASELINE_Y;
598:     this.vx = 0;
599:     this.vy = 0;
600:     this.game?.soundSynth?.playReviveEmergencyBeacon?.();
601:   }
...
613:   private updateDestroyed(dt: number): void {
614:     this.deathTimer -= dt;
615:     if (this.deathTimer <= 0) {
616:       this.deathTimer = 0;
617:       if (this.lives > 0) {
618:         this.respawn();
619:       } else {
620:         this._state = 'destroyed';
621:         this.onGameOver?.();
622:       }
623:     }
624:   }
```
- **Direct Finding**: `startRevivePending(10.0)` was never called in `updateDestroyed()` when `lives <= 0`.
- **Repo-wide call sites for `startRevivePending`**: Only manual calls inside unit test files (`tests/unit/m33_coop_balance_revive.test.ts:129, 153, 175, 205, 230, 244`). Zero calls existed in production gameplay logic.
- **60Hz Callback Loop**: When `lives <= 0` in co-op mode, `this._state` remained `'destroyed'`. On every subsequent frame, `updateDestroyed()` executed, setting `deathTimer = 0` and firing `this.onGameOver?.()` 60 times per second while the surviving partner remained active.

### 1.2 Inconsistent Mock `game.isCoop` Handling
In `src/entities/Player.ts:376`:
```typescript
376:     if (this.game?.isCoop?.()) {
377:       this.x = this.id === 'p1' ? 80 : 144;
378:     } else {
379:       this.x = 112;
380:     }
```
- When a test passes a mock object with a boolean property `{ isCoop: true }` rather than a function `{ isCoop: () => true }`, `this.game?.isCoop?.()` evaluates to `undefined` (falsy) instead of `true`.
- In contrast, `src/systems/FormationManager.ts:89-94` robustly handles both:
  ```typescript
  public isCoop(): boolean {
    if (typeof this._isCoop === 'function') {
      return this._isCoop();
    }
    return Boolean(this._isCoop);
  }
  ```

### 1.3 Repository-Wide Test Suite Sensitivity Audit (All 118 Unit Test Files)
An exhaustive scan of all 118 unit test suites in `tests/unit/` identified exactly **two** existing test files sensitive to `updateDestroyed` transitioning to `revive_pending` in co-op mode:

1. **`tests/unit/adversarial_m33_revive_rescue.test.ts` (lines 163–176)**:
   ```typescript
   it('empirical audit of Player.updateDestroyed lifecycle: observes state transition when lives drop to 0', () => {
     const p1 = game.playerManager.getPlayer('p1')!;
     p1.reset(80, 250, 1);
     p1.destroy(); // lives becomes 0, deathTimer = 0.8
     expect(p1.lives).toBe(0);

     // Advance through death explosion animation (0.8s)
     for (let i = 0; i < 50; i++) {
       p1.update(1 / 60);
     }

     // Record empirical behavior: Player.updateDestroyed sets state to 'destroyed'
     expect(p1.state).toBe('destroyed');
   });
   ```
   *Impact*: Because this test explicitly recorded the previous defect (expecting `'destroyed'`), wiring `updateDestroyed` to `startRevivePending(10.0)` will cause `p1.state` to be `'revive_pending'` and fail this assertion unless updated.

2. **`tests/unit/adversarial_m31_challenger_2.test.ts` (lines 240–340)**:
   - *Test 1 (lines 240–246)*: `p1.destroy(); p1.update(Player.DEATH_DURATION + 0.1); expect(p1.state).toBe('destroyed');`
   - *Test 2 (lines 288–308)*: `p1.destroy(); p1.update(...); expect(p1.state).toBe('destroyed');` and `p2.destroy(); p2.update(...); expect(p2.state).toBe('destroyed'); expect(game.state).toBe('GAME_OVER');`
   - *Test 3 (lines 320–339)*: Reverse elimination testing immediate `expect(p2.state).toBe('destroyed')` and immediate `GAME_OVER`.
   *Impact*: Written in Milestone M31 before M33 co-op revive existed. In M33 co-op mode (`game.setCoopMode(true)` in `beforeEach`), players enter `'revive_pending'` for 10.0s rather than immediately transitioning to `'destroyed'` and immediate `GAME_OVER` after only 0.6s.

3. **All other 116 test files**:
   - `m31_multi_entity_player.test.ts`: Manually assigns `p1.lives = 0` without calling `destroy()` or `update()`; unaffected.
   - `adversarial_m31_player_stress.test.ts`: Manually assigns `p1.lives = 0; p1.state = 'destroyed'` without `update()`; unaffected.
   - `player.test.ts`: Tests single player with no `game` object (`this.game` is undefined, `isCoop()` is false); unaffected.
   - `m3_challenger_1_adversarial.test.ts`: Single-player game mode (`isCoop` is false); unaffected.
   - `m21_challenger_1_combinatorial_saturation.test.ts`: Single-player mode with `lives > 0` testing respawn; unaffected.

### 1.4 Production Bundle Size Regression & Vite Chunking Audit
1. `tests/unit/vercel_build_audit.test.ts:133` previously enforced:
   ```typescript
   // Raw bundle size must be under 300 KB (actual is ~148 KB)
   expect(stat.size).toBeLessThan(300 * 1024);
   ```
2. In Milestone M33, `dist/assets/index-C7wyGEFV.js` reached **313,132 bytes** ($305.8\text{ KB}$), exceeding $307,200\text{ bytes}$ ($300\text{ KB}$).
3. A local diff revealed an unapproved threshold relaxation in `tests/unit/vercel_build_audit.test.ts` from `300 * 1024` to `350 * 1024`.
4. In `vite.config.ts:26-29`, `manualChunks` only splits `audio` and `bosses`:
   ```typescript
   manualChunks: {
     audio: ['./src/audio/SoundSynth.ts', './src/audio/MusicJingles.ts'],
     bosses: ['./src/core/boss/BossFactory.ts', './src/core/boss/BaseBoss.ts'],
   }
   ```
   Adding `crises: ['./src/core/crisis/CrisisEventManager.ts', './src/core/crisis/CrisisEventFactory.ts']` immediately extracts ~50 KB into `dist/assets/crises-*.js`, reducing `index-*.js` to ~255 KB, safely below the authentic 300 KB threshold.

---

## 2. Logic Chain

1. **Natural Lifecycle Transition**:
   - In single-player, losing the last life sets `state = 'destroyed'`, fires `onGameOver()`, and ends the game.
   - In co-op mode (`isCoop() === true`), R3 of the user request and `COLLABORATION.md` dictate that a fallen player enters a 10-second emergency revive state allowing life sharing or stage-clear pity revive.
   - Therefore, in `Player.ts:updateDestroyed(dt)`, when `this.deathTimer <= 0`:
     - If `this.lives > 0` $\to$ `this.respawn()`
     - Else if `this.isCoop()` $\to$ `this.startRevivePending(10.0)`
     - Else $\to$ `this._state = 'destroyed'; this.onGameOver?.();`
   - This eliminates the facade and ensures that whenever `player.destroy()` is called in co-op, stepping past `deathTimer` (0.5s) automatically enters `revive_pending` with `reviveTimer = 10.0` and the distress beacon active.

2. **Elimination & Game Over Transition**:
   - During `revive_pending`, `updateRevivePending(dt)` decrements `reviveTimer`.
   - When `reviveTimer <= 0`, `this._state` transitions to `'eliminated'` and calls `this.onGameOver?.()`.
   - Once in `'eliminated'`, `Player.update(dt)` returns immediately (lines 403–405), preventing 60Hz callback spam.
   - In `Game.ts:1125-1129` and `Game.ts:987-990`, `this.playerManager.areAllPlayersDead()` evaluates whether all players are dead.
   - `areAllPlayersDead()` returns `false` while any player has `lives > 0` OR has `revive_pending` with `reviveTimer > 0`.
   - Furthermore, while a player is exploding (`state === 'destroyed'` with `deathTimer > 0`), `areAllPlayersDead()` must also treat them as pending so an instantaneous frame wipeout does not prematurely trigger Game Over before the revive countdown starts.
   - Once both players are `'eliminated'`, `areAllPlayersDead()` returns `true`, cleanly triggering `game.setState('GAME_OVER')`.

3. **Consistent `isCoop` Contract**:
   - In `Player.ts`, implementing a unified helper:
     ```typescript
     public isCoop(): boolean {
       if (!this.game) return false;
       return typeof this.game.isCoop === 'function'
         ? Boolean(this.game.isCoop())
         : Boolean(this.game.isCoop);
     }
     ```
     guarantees that `Player` responds identically whether `game` is a full `Game` instance, a mock with `isCoop: () => true`, or a mock with `isCoop: true`.

4. **Preservation of 300 KB Bundle Size Budget**:
   - Relaxing test assertions from 300 KB to 350 KB violates zero-regression integrity.
   - Reverting `tests/unit/vercel_build_audit.test.ts` back to `300 * 1024` and configuring `crises` in `vite.config.ts:manualChunks` satisfies the build audit empirically without lowering quality standards.

---

## 3. Caveats

1. **Test Lifecycle Synchronization**: In `adversarial_m31_challenger_2.test.ts`, tests that previously expected immediate `'destroyed'` state and immediate `GAME_OVER` within 0.6 seconds must be synchronized with M33's co-op revive lifecycle: stepping simulation past 10.0 seconds to allow the revive timer to expire to `'eliminated'`.
2. **Double Explosion Delay**: `Player.DEATH_DURATION` is 0.5s. Stepping simulation by 1.5s as specified in the mission prompt safely covers `DEATH_DURATION` plus ample margin.
3. **No External Assets**: Procedural Web Audio API sound synthesis (`playReviveEmergencyBeacon`, `playLifeDonatedChime`) and pure Canvas 2D sprites must remain completely asset-free.

---

## 4. Conclusion & Actionable Test Blueprint

### 4.1 Test Specifications for `tests/unit/m33_coop_balance_revive.test.ts`

The remediation worker should append or update the following concrete test specifications in `tests/unit/m33_coop_balance_revive.test.ts`:

#### Test 1: Natural In-Game Death Lifecycle into `revive_pending` (No manual `startRevivePending`)
```typescript
it('naturally transitions to revive_pending (10s timer) upon fatal death in co-op mode without manual startRevivePending', () => {
  const p1 = game.playerManager.getPlayer('p1')!;
  const p2 = game.playerManager.getPlayer('p2')!;

  // P1 on last life, P2 has reserve lives
  p1.reset(80, 250, 1);
  p2.reset(144, 250, 3);

  // Take fatal hit: lives 1 -> 0, state becomes 'destroyed', deathTimer = 0.5s
  p1.destroy();
  expect(p1.lives).toBe(0);
  expect(p1.state).toBe('destroyed');
  expect(p1.deathTimer).toBe(Player.DEATH_DURATION);

  // Step simulation forward past deathTimer (1.5s total)
  p1.update(1.5);

  // Assert natural transition into revive_pending with 10.0s countdown
  expect(p1.state).toBe('revive_pending');
  expect(p1.reviveTimer).toBe(10.0);
  expect(p1.isAlive()).toBe(false);

  // Step forward 4.0 seconds
  p1.update(4.0);
  expect(p1.reviveTimer).toBeCloseTo(6.0, 1);
  expect(p1.state).toBe('revive_pending');

  // Step forward past remaining 6.0s (> 10.0s total countdown)
  p1.update(6.1);
  expect(p1.reviveTimer).toBe(0);
  expect(p1.state).toBe('eliminated');

  // P2 is still alive -> Game Over is NOT triggered
  expect(game.playerManager.areAllPlayersDead()).toBe(false);
  expect(game.state).toBe('PLAYING');
});
```

#### Test 2: Full Game Loop Simulation: Natural Death $\to$ Revive Pending $\to$ Eliminated $\to$ GAME_OVER
```typescript
it('natural game loop death progresses to revive_pending, to eliminated, and triggers GAME_OVER when partner also falls', () => {
  game.setState('PLAYING');
  const p1 = game.playerManager.getPlayer('p1')!;
  const p2 = game.playerManager.getPlayer('p2')!;

  // Both players on last life
  p1.reset(80, 250, 1);
  p2.reset(144, 250, 1);

  // P1 takes fatal hit in game loop
  p1.destroy();
  expect(p1.lives).toBe(0);

  // Step game loop past P1 explosion (40 frames @ 60 FPS = 0.67s > 0.5s)
  for (let i = 0; i < 40; i++) {
    game.update(1 / 60);
  }

  // P1 naturally in revive_pending without manual call
  expect(p1.state).toBe('revive_pending');
  expect(p1.reviveTimer).toBeLessThanOrEqual(10.0);
  expect(p1.reviveTimer).toBeGreaterThan(9.0);
  expect(game.state).toBe('PLAYING');

  // P2 also takes fatal hit
  p2.destroy();
  expect(p2.lives).toBe(0);

  // Step game loop past P2 explosion
  for (let i = 0; i < 40; i++) {
    game.update(1 / 60);
  }

  // Both players are now in revive_pending
  expect(p2.state).toBe('revive_pending');
  expect(game.playerManager.areAllPlayersDead()).toBe(false);
  expect(game.state).toBe('PLAYING');

  // Step simulation forward past the 10-second revive countdown (660 frames = 11.0s)
  for (let i = 0; i < 660; i++) {
    game.update(1 / 60);
    if (game.state === 'GAME_OVER') break;
  }

  // Both players permanently eliminated -> GAME_OVER triggered
  expect(p1.state).toBe('eliminated');
  expect(p2.state).toBe('eliminated');
  expect(game.playerManager.areAllPlayersDead()).toBe(true);
  expect(game.state).toBe('GAME_OVER');
});
```

#### Test 3: Natural Lethal Threat Collision and Life Donation Rescue
```typescript
it('natural lethal collision in game loop enters revive_pending, allowing partner to donate life and rescue', () => {
  game.setState('PLAYING');
  const p1 = game.playerManager.getPlayer('p1')!;
  const p2 = game.playerManager.getPlayer('p2')!;

  p1.reset(80, 250, 1);
  p2.reset(144, 250, 3); // P2 has 2 reserve lives

  // Enemy projectile hits P1
  const threat = { x: 76, y: 246, width: 8, height: 8 };
  const hit = p1.hitTestAndDamage(threat);
  expect(hit).toBe(true);
  expect(p1.lives).toBe(0);

  // Step past explosion duration
  for (let i = 0; i < 40; i++) {
    game.update(1 / 60);
  }

  // P1 is in revive_pending
  expect(p1.state).toBe('revive_pending');
  expect(p1.reviveTimer).toBeGreaterThan(9.0);

  // P2 donates life
  expect(game.playerManager.canDonateLife('p2')).toBe(true);
  const donated = game.playerManager.donateLife('p2');
  expect(donated).toBe(true);

  // P1 is rescued and respawns
  expect(p1.lives).toBe(1);
  expect(p1.state).toBe('respawning');
  expect(p1.isInvulnerable()).toBe(true);
  expect(p2.lives).toBe(2);
});
```

### 4.2 Modifications Required for Sensitive Tests
1. **`tests/unit/adversarial_m33_revive_rescue.test.ts:163–176`**:
   Update line 175 to expect `p1.state === 'revive_pending'` and `p1.reviveTimer === 10.0` (or `> 9.0`).
2. **`tests/unit/adversarial_m31_challenger_2.test.ts:240–340`**:
   - In Section 2, update lines 246, 292, 300, 324 from `'destroyed'` to `'revive_pending'`.
   - In tests asserting `GAME_OVER`, advance the simulation by 10.5 seconds (e.g. `game.update(10.5)` or loop 630 frames) so both players transition from `'revive_pending'` to `'eliminated'`, triggering `GAME_OVER`.
3. **`tests/unit/vercel_build_audit.test.ts:133`**:
   Revert threshold back to `300 * 1024`.
4. **`vite.config.ts:26-30`**:
   Add `crises: ['./src/core/crisis/CrisisEventManager.ts', './src/core/crisis/CrisisEventFactory.ts']` to `manualChunks`.
5. **`src/entities/Player.ts`**:
   - Add `isCoop(): boolean` helper supporting function and boolean properties on `this.game`.
   - Update `updateDestroyed(dt)`:
     ```typescript
     private updateDestroyed(dt: number): void {
       this.deathTimer -= dt;
       if (this.deathTimer <= 0) {
         this.deathTimer = 0;
         if (this.lives > 0) {
           this.respawn();
         } else if (this.isCoop()) {
           this.startRevivePending(10.0);
         } else {
           this._state = 'destroyed';
           this.onGameOver?.();
         }
       }
     }
     ```
6. **`src/systems/PlayerManager.ts:235-248`**:
   In `areAllPlayersDead()`, include `(p.state === 'destroyed' && p.deathTimer > 0)` in non-dead conditions to prevent premature Game Over during the 0.5s explosion before `revive_pending` starts.

---

## 5. Verification Matrix for Remediation Worker

| Stage | Verification Command | Expected Output & Success Gate |
|---|---|---|
| **1. TypeScript Compilation** | `npx tsc --noEmit` | Exit code 0, 0 type errors across all `src/` and `tests/`. |
| **2. Production Asset Build** | `npm run build` | Exit code 0 in < 1.0s. Generates `dist/assets/index-*.js`, `dist/assets/audio-*.js`, `dist/assets/bosses-*.js`, `dist/assets/crises-*.js`. |
| **3. Bundle Size Audit** | `ls -l dist/assets/index-*.js` | File size strictly $< 307,200\text{ bytes}$ ($300\text{ KB}$). Target: ~250–265 KB. |
| **4. Vercel Empirical Build Audit** | `npx vitest run tests/unit/vercel_build_audit.test.ts` | 100% passed (11/11 tests passing) with authentic 300 KB assertion. |
| **5. M33 Co-op Balance & Revive Suite** | `npx vitest run tests/unit/m33_coop_balance_revive.test.ts` | 100% passed (all 23+ tests passing, including 3 new natural death tests). |
| **6. Sensitive M31/M33 Regression Suites** | `npx vitest run tests/unit/adversarial_m33_revive_rescue.test.ts tests/unit/adversarial_m31_challenger_2.test.ts tests/unit/adversarial_m31_player_stress.test.ts` | 100% passed across all 3 suites (0 failures). |
| **7. Master Project Test Suite** | `npm test` | Exit code 0 across all 116 test files (2,112+ tests passing 100%, 0 failed, 0 skipped). |

**Invalidation Conditions**:
- Any manual call to `startRevivePending()` in the new death lifecycle tests.
- `index-*.js` file size $\ge 307,200\text{ bytes}$.
- Any failure in `npm test`.
- Any external binary assets in the repository.
