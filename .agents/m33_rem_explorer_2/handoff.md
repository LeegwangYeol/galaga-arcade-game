# Handoff Report: Milestone M33 Remediation — Player Death & Revive Pending Lifecycle Integration

- **Explorer**: `m33_rem_explorer_2` (Remediation Exploration Specialist)
- **Role**: `explorer`, `architecture_blueprint`, `synthesizer`
- **Milestone**: M33 Remediation (Phase 6: Local 2-Player Co-op Multiplayer Mode)
- **Target Working Directory**: `/Users/user/src/galog/.agents/m33_rem_explorer_2`
- **Parent Conversation ID**: `0236827c-a7d2-4115-a374-2f5c45ed8134`
- **Timestamp**: 2026-09-14T10:36:00Z

---

## Executive Summary
In Milestone M33 Iteration 1, `startRevivePending(10.0)` in `src/entities/Player.ts` was implemented as a dead/orphaned method with 0 call sites in production code because `Player.updateDestroyed()` unconditionally set `this._state = 'destroyed'` when `lives <= 0`. This investigation provides the complete architectural formulation to wire `startRevivePending(10.0)` into the co-op player death lifecycle, solves a critical latent race condition in `PlayerManager.areAllPlayersDead()` where 1-frame premature Game Over occurred during death animations, proves 100% backward compatibility for single-player mode, and supplies the exact code blueprints and test reconciliations needed for a clean pass.

---

## 1. Observation

### Observation 1.1: Production Code Disconnection in `Player.ts`
- **File**: `src/entities/Player.ts:613–624`
- **Verbatim Code**:
  ```typescript
  private updateDestroyed(dt: number): void {
    this.deathTimer -= dt;
    if (this.deathTimer <= 0) {
      this.deathTimer = 0;
      if (this.lives > 0) {
        this.respawn();
      } else {
        this._state = 'destroyed';
        this.onGameOver?.();
      }
    }
  }
  ```
- **File**: `src/entities/Player.ts:593–601` defines `startRevivePending`:
  ```typescript
  public startRevivePending(countdown: number = 10.0): void {
    this._state = 'revive_pending';
    this.reviveTimer = countdown;
    this.x = this.id === 'p1' ? 80 : 144;
    this.y = Player.BASELINE_Y;
    this.vx = 0;
    this.vy = 0;
    this.game?.soundSynth?.playReviveEmergencyBeacon?.();
  }
  ```
- **Repository Search Result**:
  A full grep across `src/` confirmed **0 production call sites** for `startRevivePending`.
  The only call sites existed in `tests/unit/m33_coop_balance_revive.test.ts` (lines 129, 153, 175, 205, 230, 244) where tests manually invoked `startRevivePending(10.0)` on mock/reset players rather than testing the real gameplay death cycle.

### Observation 1.2: Latent Premature Game Over Race Condition in `PlayerManager.ts`
- **File**: `src/systems/PlayerManager.ts:235–249`
- **Verbatim Code**:
  ```typescript
  public areAllPlayersDead(): boolean {
    const players = this.getPlayers();
    if (players.length === 0) return true;

    for (const p of players) {
      if (p.lives > 0) return false;
      if (
        (p.state === 'revive_pending' || (p.state as any) === 'REVIVE_PENDING') &&
        p.reviveTimer > 0
      ) {
        return false;
      }
    }
    return true;
  }
  ```
- **File**: `src/core/Game.ts:987–990`
- **Verbatim Code**:
  ```typescript
  if (this.isCoop() && this.playerManager.areAllPlayersDead()) {
    this.setState('GAME_OVER');
    return;
  }
  ```
- **Empirical Race Condition**:
  When P1 has already been eliminated (`lives = 0, state = 'eliminated'`) and P2 is destroyed (`p2.destroy()` setting `p2.lives = 0, p2.deathTimer = 1.5, p2._state = 'destroyed'`):
  On the very next 16.6ms tick, `Game.updatePlaying()` executes `this.playerManager.areAllPlayersDead()`.
  In `areAllPlayersDead()`, P1 has `lives === 0` and is not `revive_pending`. P2 has `lives === 0` and is in `'destroyed'` (not `'revive_pending'`).
  Therefore, `areAllPlayersDead()` returns `true` on frame 1!
  `Game.ts:988` immediately calls `this.setState('GAME_OVER')`, abruptly terminating gameplay after 1 frame.
  As a result, P2's 1.5-second death explosion is cut short, `p2.updateDestroyed()` never reaches `deathTimer <= 0`, and `p2.startRevivePending(10.0)` can never execute.
  A similar premature Game Over occurs if both players are destroyed simultaneously on the exact same frame.

### Observation 1.3: Update Loop Dispatch in `Player.ts`
- **File**: `src/entities/Player.ts:398–405`
- **Verbatim Code**:
  ```typescript
  public update(dt: number, input?: InputState): void {
    if (this._state === 'revive_pending' || (this._state as any) === 'REVIVE_PENDING') {
      this.updateRevivePending(dt);
      return;
    }
    if (this._state === 'eliminated' || (this._state as any) === 'ELIMINATED') {
      return;
    }
  ```
- When a player transitions to `'revive_pending'`, `Player.update()` immediately diverts to `updateRevivePending(dt)` and returns early.
- In `updateRevivePending(dt)`:
  ```typescript
  private updateRevivePending(dt: number): void {
    this.reviveTimer = Math.max(0, this.reviveTimer - dt);
    this.animTimer += dt;

    if (this.reviveTimer <= 0) {
      this._state = 'eliminated';
      this.onGameOver?.();
    }
  }
  ```
  Once `this.reviveTimer <= 0`, `this._state` transitions to `'eliminated'` and `this.onGameOver?.()` fires once.
  On subsequent frames, `if (this._state === 'eliminated') return;` exits immediately, completely stopping any further updates and eliminating 60Hz callback spam.

### Observation 1.4: Pre-M33 Test Assertions in `adversarial_m31_challenger_2.test.ts`
- **File**: `tests/unit/adversarial_m31_challenger_2.test.ts:240–340`
- **Verbatim Code**:
  ```typescript
  // P1 loses life 3 (all lives exhausted)
  p1.destroy();
  expect(p1.lives).toBe(0);
  p1.update(Player.DEATH_DURATION + 0.1);

  // P1 is eliminated
  expect(p1.state).toBe('destroyed');
  expect(p1.lives).toBe(0);
  ```
- In Milestone M31, `revive_pending` did not exist in the codebase. The test verified that when P1 lost all lives, P1 was considered eliminated (which M31 represented as `state === 'destroyed'`), and Game Over did not trigger until P2 was also eliminated.
- In `adversarial_m33_revive_rescue.test.ts:163–176`, the author explicitly recorded the iteration 1 behavior:
  ```typescript
  it('empirical audit of Player.updateDestroyed lifecycle: observes state transition when lives drop to 0', () => {
    ...
    // Record empirical behavior: Player.updateDestroyed sets state to 'destroyed'
    expect(p1.state).toBe('destroyed');
  });
  ```

---

## 2. Logic Chain

1. **Root Cause of Disconnected Revive Lifecycle**:
   - From *Observation 1.1*, `Player.updateDestroyed(dt)` only checked `if (this.lives > 0) this.respawn() else { this._state = 'destroyed'; this.onGameOver?.(); }`.
   - It completely lacked an `else if (this.game?.isCoop?.())` branch to invoke `this.startRevivePending(10.0)`.
   - Therefore, in real gameplay, a player in co-op whose lives reached 0 never entered `startRevivePending(10.0)`, never displayed the visual beacon or "REVIVE 10S" badge, never sounded the distress siren, and never enabled the surviving partner to donate a life during the 10-second window.

2. **Integration into `Player.ts:updateDestroyed(dt)`**:
   - When a player's `deathTimer` reaches 0:
     - If `this.lives > 0`: standard respawn (`this.respawn()`).
     - Else if `this.game?.isCoop?.()`: cooperative revive pending (`this.startRevivePending(10.0)`).
     - Else: single-player game over transition (`this._state = 'destroyed'; this.onGameOver?.();`).
   - In single-player mode (`isCoop = false`), `this.game?.isCoop?.()` is `false`, maintaining exact historical single-player behavior.

3. **Interactions with `PlayerManager.areAllPlayersDead()`**:
   - From *Observation 1.2*, if `areAllPlayersDead()` only checks `lives > 0` and `state === 'revive_pending'`, a player currently in `deathTimer` (1.5s death explosion) with `lives === 0` is prematurely treated as dead.
   - If one player is already eliminated and the other dies, or if both die together, `areAllPlayersDead()` would return `true` on the very first tick of `p.destroy()`, triggering `GAME_OVER` immediately and aborting the 1.5s explosion before `startRevivePending(10.0)` can ever be reached!
   - Adding `if ((p.state === 'destroyed' || (p.state as any) === 'DESTROYED') && p.deathTimer > 0) return false;` guarantees that dying players finish their death explosion and successfully transition into `startRevivePending(10.0)`.

4. **Interactions across All Co-op Death Scenarios**:
   - **Scenario A: P1 dies with 0 lives, P2 alive**:
     - P1 explodes for 1.5s $\to$ enters `revive_pending` (10.0s countdown).
     - `areAllPlayersDead()` returns `false` (P2 alive, P1 reviveTimer > 0).
     - P2 can donate life (`KeyL` / `Period`) or clear the wave for a pity revive.
     - If timer expires: P1 transitions to `'eliminated'`, `onGameOver` fires once, `areAllPlayersDead()` returns `false` (P2 still alive), P2 plays on solo.
   - **Scenario B: P1 in `revive_pending`, P2 dies with 0 lives**:
     - P2 enters death explosion (1.5s) $\to$ `areAllPlayersDead()` is `false` (P1 in revive_pending, P2 in deathTimer).
     - P2 finishes death explosion $\to$ enters `startRevivePending(10.0)`. Both are in `revive_pending`.
     - `areAllPlayersDead()` remains `false`.
     - When P1 expires $\to$ P1 becomes `'eliminated'`. `areAllPlayersDead()` is still `false` (P2 has remaining time).
     - When P2 expires $\to$ P2 becomes `'eliminated'`. Both are eliminated $\to$ `areAllPlayersDead()` returns `true` $\to$ `GAME_OVER`.
   - **Scenario C: Simultaneous wipeout (both die at $t=0$)**:
     - Both explode for 1.5s (`deathTimer > 0`).
     - Both enter `startRevivePending(10.0)`.
     - 10.0 seconds count down in parallel.
     - At $t = 10.0\text{s}$, both expire to `'eliminated'`, `areAllPlayersDead()` returns `true`, triggering `GAME_OVER`.

5. **Resolution of Pre-M33 Test Assumptions**:
   - From *Observation 1.4*, tests in `adversarial_m31_challenger_2.test.ts` asserted `expect(p1.state).toBe('destroyed')` because M31 did not have M33's revive feature.
   - Reconciling `adversarial_m31_challenger_2.test.ts` to accept `expect(['destroyed', 'revive_pending']).toContain(p1.state)` and letting the 10-second timer expire when testing Game Over aligns the M31 suite with the M33 architecture without breaking its intent (verifying that one player's death does not end the game, and both players falling does end the game).
   - In `adversarial_m33_revive_rescue.test.ts:175`, updating the empirical audit assertion from `'destroyed'` to `'revive_pending'` directly proves the remediation.

---

## 3. Caveats

- **Captive Player Death (`updateCapturing`)**: If a player is captured by Boss Galaga when `lives <= 0`, their state becomes `'captured'`. In co-op, they remain captured while the partner plays; destroying the diving boss triggers Case A rescue docking, reviving the captive with 1 life and 1,000 pts.
- **Single Player Isolation**: When `isCoop = false`, `this.game?.isCoop?.()` is strictly `false`. Single-player mode never enters `revive_pending` or `eliminated`, and transitions directly to `'destroyed'` and `onGameOver()`.
- **Bundle Size Remediation**: The secondary failure noted by Auditor 1 and Reviewers 1/2 in `tests/unit/vercel_build_audit.test.ts` (main bundle size > 300 KB) is addressed by splitting chunks in `vite.config.ts` (handled in parallel by Explorer 1).

---

## 4. Conclusion & Code Changes Blueprint

### Blueprint Component 1: `src/entities/Player.ts`
Replace `updateDestroyed(dt: number)`:

```typescript
// Location: src/entities/Player.ts:613–625
  private updateDestroyed(dt: number): void {
    this.deathTimer -= dt;
    if (this.deathTimer <= 0) {
      this.deathTimer = 0;
      if (this.lives > 0) {
        this.respawn();
      } else if (this.game?.isCoop?.()) {
        this.startRevivePending(10.0);
      } else {
        this._state = 'destroyed';
        this.onGameOver?.();
      }
    }
  }
```

### Blueprint Component 2: `src/systems/PlayerManager.ts`
Update `areAllPlayersDead()` to guard against premature 1-frame Game Over during active death animations:

```typescript
// Location: src/systems/PlayerManager.ts:235–250
  public areAllPlayersDead(): boolean {
    const players = this.getPlayers();
    if (players.length === 0) return true;

    for (const p of players) {
      if (p.lives > 0) return false;
      if (
        (p.state === 'revive_pending' || (p.state as any) === 'REVIVE_PENDING') &&
        p.reviveTimer > 0
      ) {
        return false;
      }
      if (
        (p.state === 'destroyed' || (p.state as any) === 'DESTROYED') &&
        p.deathTimer > 0
      ) {
        return false;
      }
    }
    return true;
  }
```

### Blueprint Component 3: `tests/unit/m33_coop_balance_revive.test.ts`
Add integration test in Track 2 verifying natural death transition to `revive_pending`:

```typescript
    it('automatically transitions into revive_pending when fatal death occurs in co-op mode', () => {
      const p1 = game.playerManager.getPlayer('p1')!;
      p1.reset(80, 250, 1);
      p1.destroy(); // p1.lives becomes 0, deathTimer = 1.5s
      expect(p1.lives).toBe(0);
      expect(p1.state).toBe('destroyed');

      // Tick past deathTimer (1.5s)
      p1.update(Player.DEATH_DURATION + 0.1);

      expect(p1.state).toBe('revive_pending');
      expect(p1.reviveTimer).toBe(10.0);
    });
```

### Blueprint Component 4: Test Reconciliation for Legacy & Adversarial Suites
1. **`tests/unit/adversarial_m33_revive_rescue.test.ts:163–176`**:
   Update line 175 from:
   ```typescript
   // Record empirical behavior: Player.updateDestroyed sets state to 'destroyed'
   expect(p1.state).toBe('destroyed');
   ```
   To:
   ```typescript
   // Verified M33 remediation: in co-op mode, Player.updateDestroyed transitions to 'revive_pending'
   expect(p1.state).toBe('revive_pending');
   expect(p1.reviveTimer).toBe(10.0);
   ```

2. **`tests/unit/adversarial_m31_challenger_2.test.ts:240–340`**:
   - In lines 246, 292, 300, 324: update `expect(p.state).toBe('destroyed')` to `expect(['destroyed', 'revive_pending']).toContain(p.state)`.
   - In lines 301 and 336: when asserting final `GAME_OVER` after both players lose all lives, advance 10.1 seconds (`for (let i = 0; i < 610; i++) game.update(1 / 60);`) so that the co-op revive countdown finishes and transitions both players to `'eliminated'`.

---

## 5. Verification Method

To independently verify the remediation once applied by the worker:

```bash
# 1. Type check
npx tsc --noEmit

# 2. Run M33 unit test suite (including new natural death transition test)
npx vitest run tests/unit/m33_coop_balance_revive.test.ts

# 3. Run M33 adversarial revive/rescue test suite
npx vitest run tests/unit/adversarial_m33_revive_rescue.test.ts

# 4. Run M31 adversarial challenger suite
npx vitest run tests/unit/adversarial_m31_challenger_2.test.ts

# 5. Run single-player core tests to verify 0 regressions
npx vitest run tests/unit/player.test.ts tests/unit/m31_multi_entity_player.test.ts

# 6. Full unit test regression suite across the repository
npm test

# 7. Production build verification
npm run build
```

**Invalidation Conditions**:
- Any occurrence where a player with 0 lives in co-op mode remains in `'destroyed'` with `reviveTimer === 0`.
- Any occurrence where `areAllPlayersDead()` returns `true` while a dying player has `deathTimer > 0`.
- Any failure in `npm test` or `npx tsc --noEmit`.
