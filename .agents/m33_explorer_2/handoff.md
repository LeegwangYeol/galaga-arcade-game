# Architectural Exploration Report — Milestone M33: Cooperative Revive, Life Sharing & Shared Game Over Logic

**Author**: `m33_explorer_2` (Explorer Agent)  
**Date**: 2026-09-14  
**Target Milestone**: M33 (Co-op Balance, Dynamic Scaling & Cooperative Revive Mechanics)  
**Working Directory**: `/Users/user/src/galog/.agents/m33_explorer_2`  

---

## 1. Observation

### 1.1 Source Code Inspections & Direct Evidence

#### A. Lives Tracking: `player.lives` vs. `scoreManager.lives`
1. **`src/entities/Player.ts`**:
   - Line 88: `public lives: number = 3;`
   - Line 569: In `updateCapturing(dt)` when tractor beam capture is completed:
     ```ts
     this._state = 'captured';
     this.lives -= 1;
     this.onCapturedComplete?.(this.captureTarget.x, this.captureTarget.y);
     if (this.lives > 0) {
       this.respawn();
     } else {
       this.onGameOver?.();
     }
     ```
   - Line 580–589: In `updateDestroyed(dt)` when ship explosion delay finishes:
     ```ts
     this.deathTimer -= dt;
     if (this.deathTimer <= 0) {
       this.deathTimer = 0;
       if (this.lives > 0) {
         this.respawn();
       } else {
         this.onGameOver?.();
       }
     }
     ```
   - Line 804: In `Player.destroy()`:
     ```ts
     this.onExplode?.(this.x, this.y, false);
     this._state = 'destroyed';
     this.deathTimer = Player.DEATH_DURATION;
     this.lives -= 1;
     ```
   - **Critical Observation**: `Player.ts` decrements `this.lives -= 1` locally upon destruction and capture. It does **not** call `ScoreManager.deductLife()`.

2. **`src/systems/ScoreManager.ts`**:
   - Lines 92, 103:
     ```ts
     private _lives: number = SCORE_MATRIX.INITIAL_LIVES; // P1
     private _p2Lives: number = SCORE_MATRIX.INITIAL_LIVES; // P2 (M31)
     ```
   - Lines 180–182: `getLives(playerId: PlayerId = 'p1'): number` returns `playerId === 'p2' ? this._p2Lives : this._lives;`
   - Lines 209–216: `setLives(val: number, playerId: PlayerId = 'p1'): void` updates `_p2Lives` or `_lives`.
   - Lines 260–271: `deductLife(count: number = 1, playerId: PlayerId = 'p1'): number` decrements `_lives` or `_p2Lives`.
   - Lines 336, 348: In `addScore()`, when score crosses extra life thresholds (20,000, 70,000, 140,000...), `_lives` or `_p2Lives` increments and `this._onExtraLifeCallback(count, playerId)` fires.

3. **`src/core/Game.ts`**:
   - Lines 359–365: Extra life callback wiring:
     ```ts
     this.scoreManager.onExtraLife((count: number, playerId?: PlayerId) => {
       const p = this.getPlayer(playerId ?? 'p1');
       if (p) {
         p.lives += count;
       }
       MusicJingles.playDockingJingle();
     });
     ```
   - Lines 536–541: Game lives proxy property:
     ```ts
     public get lives(): number {
       return this.player ? this.player.lives : (this.scoreManager ? this.scoreManager.lives : 3);
     }
     public set lives(val: number) {
       if (this.player) this.player.lives = val;
       if (this.scoreManager) this.scoreManager.lives = val;
     }
     ```
   - Line 1549 & 1574: HUD state assembly:
     `lives: this.player ? this.player.lives : this.scoreManager.lives`
   - Line 1809: Bottom dashboard telemetry assembly:
     `s.lives = this.player ? this.player.lives : (this.scoreManager ? this.scoreManager.lives : 3);`
     `s.reserveLives = Math.max(0, s.lives - 1);`

#### B. Game Over Condition & `PlayerManager.areAllPlayersDead()`
1. **`src/systems/PlayerManager.ts`**:
   - Lines 150–159:
     ```ts
     public getLivingPlayers(): Player[] {
       return this.getPlayers().filter((p) => {
         const s = p.state;
         return (
           s !== 'destroyed' &&
           s !== 'DESTROYED' &&
           (p.lives > 0 || s === 'respawning' || s === 'RESPAWNING')
         );
       });
     }
     ```
   - Lines 171–179:
     ```ts
     public areAllPlayersDead(): boolean {
       const players = this.getPlayers();
       if (players.length === 0) return true;

       for (const p of players) {
         if (p.lives > 0) return false;
       }
       return true;
     }
     ```
2. **`src/core/Game.ts`**:
   - Lines 1109–1113:
     ```ts
     player.onGameOver = () => {
       if (this.playerManager.areAllPlayersDead()) {
         this.setState('GAME_OVER');
       }
     };
     ```

#### C. Input Mappings in `src/ui/InputHandler.ts`
1. **Current Co-op Controls**:
   - Lines 784–812: P1 keys: `KeyA`, `KeyD`, `KeyW`, `KeyS` (Move), `Space` (Fire), `KeyX` (Special), `ShiftLeft` (Phase Warp).
   - Lines 815–842: P2 keys: `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown` (Move), `Enter` / `Numpad0` (Fire), `KeyM` / `ShiftRight` (Special).
   - Lines 328–390: `consumeAction(action: string, playerId?: PlayerId): boolean` supports discrete action consumption per player channel.
   - Lines 481–550: `renderTouchGuides(ctx: CanvasRenderingContext2D)` draws split-screen center divider at $X = 112$, 1P and 2P touch zones, and virtual steering thumbsticks.
   - **Missing Keys**: `KeyL` (P1 donate) and `NumpadDecimal` / `Period` (P2 donate) are not currently tracked or consumed in `InputHandler.ts`.

---

## 2. Logic Chain

### 2.1 Diagnosis of Deficiencies in Current Baseline
1. **Unbounded Invocation Hazard on Death** (Ref: `Player.ts:580–589` & `Game.ts:1109–1113`):
   - When P1 dies with 0 lives in Co-op, `p1.deathTimer` hits 0 and `p1.onGameOver?.()` fires.
   - `playerManager.areAllPlayersDead()` evaluates `p2.lives > 0`, returning `false`. Game Over is not triggered.
   - However, `p1._state` remains `'destroyed'` and `p1.deathTimer` remains `0`.
   - On the very next animation frame (16.6ms later), `Player.update()` invokes `updateDestroyed(dt)`, which checks `if (this.deathTimer <= 0)` and triggers `this.onGameOver?.()` **again**.
   - Result: `onGameOver` fires 60 times per second indefinitely until P2 also dies, causing unnecessary CPU cycles and spamming state evaluations.
2. **Lack of Downed / Revive State**:
   - When a player reaches 0 lives, their entity is completely hidden from the canvas (`Player.render()` returns immediately when state is `'destroyed'`).
   - The surviving player cannot see their fallen partner, cannot see any revive prompt, and has no mechanism to donate a life.
3. **Absence of Shared Game Over Timer Invariant**:
   - The user specification dictates that Game Over should only trigger when **both** players are permanently eliminated (0 lives AND 0 revive timers).
   - Currently, if P1 dies with 0 lives and P2 dies with 0 lives 1 second later, `areAllPlayersDead()` immediately returns `true` because both have `lives === 0`, prematurely ending the game without giving either player the required 10-second emergency revive window or allowing stage-clear pity revives.
4. **Lives State Synchronization**:
   - Since `player.lives` is decremented directly in `Player.ts` without notifying `ScoreManager`, `ScoreManager.getLives(pId)` drifts from `player.lives`.
   - Solution: Ensure `scoreManager.setLives(player.lives, player.id)` is synchronized whenever lives change.

---

### 2.2 Cooperative Revive & Life Sharing System Architecture

#### A. Player State Machine Expansion
We extend `PlayerStateType` with two dedicated states:
- `'revive_pending'` / `'REVIVE_PENDING'`:
  - Entered when a player in Co-op mode loses their last life (`lives === 0`) upon death delay completion.
  - Duration: 10.0 seconds emergency countdown (`player.reviveTimer = 10.0`).
  - Kinematics & Vulnerability:
    - Ship is anchored at baseline: $X = \text{startX}$ (80 for P1, 144 for P2), $Y = 250$.
    - Velocity is clamped to 0 (`vx = 0, vy = 0`).
    - Intangible & Invulnerable: immune to all enemy collisions, alien bullets, and tractor beams.
    - Controllability: Cannot move, cannot fire weapons, cannot trigger special moves.
    - Audio: Plays emergency distress beacon ping (`soundSynth.playReviveEmergencyBeacon()`).
- `'eliminated'` / `'ELIMINATED'`:
  - Entered when `reviveTimer <= 0` expires without a donation.
  - Ship sprite is hidden from canvas.
  - Player remains in this state until stage is cleared (where pity revive can grant 1 life) or until Game Over occurs.

#### B. State Transition Diagram
```
                    ┌────────────────────────────────────────────────────────┐
                    │                      [NORMAL / DUAL]                   │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                                                │ Lethal damage (no shield)
                                                ▼
                                    ┌───────────────────────┐
                                    │      [DESTROYED]      │
                                    │ (0.5s explosion delay)│
                                    └───────────┬───────────┘
                                                │
                          ┌─────────────────────┴─────────────────────┐
                          │ deathTimer <= 0                           │ deathTimer <= 0
                          │ lives > 0                                 │ lives === 0
                          ▼                                           ▼
             ┌─────────────────────────┐               ┌──────────────────────────────┐
             │       [RESPAWNING]      │               │       Is Single-Player?      │
             │ (3.0s invulnerability)  │               └──────┬────────────────┬──────┘
             └────────────┬────────────┘                      │ YES            │ NO (Co-op)
                          │                                   ▼                ▼
                          │ 3.0s timer expires         ┌─────────────┐  ┌─────────────────────────┐
                          ▼                            │ [GAME OVER] │  │     [REVIVE_PENDING]    │
             ┌─────────────────────────┐               └─────────────┘  │   (10s emergency timer) │
             │         [NORMAL]        │                                └────┬───────────────┬────┘
             └─────────────────────────┘                                     │               │
                                                                 Partner     │               │ 10.0s Timer
                                                            donates life     │               │ expires
                                                            (KeyL/Numpad.)   │               │
                                                                             ▼               ▼
                                                               ┌─────────────┐ ┌──────────────────┐
                                                               │ [RESPAWNING]│ │   [ELIMINATED]   │
                                                               └─────────────┘ └────────┬─────────┘
                                                                                        │
                                                     Both players eliminated (0L, 0s)  │ Stage Cleared
                                                     ─────────────────────────────────►│ ────────────────► [RESPAWNING]
                                                                  [GAME OVER]           │ (+1 life pity)
```

#### C. Life Donation Transfer Rules
1. **Donor Eligibility Criteria**:
   - Mode is `'coop'`.
   - Donor must be alive: state $\in \{\text{'normal'}, \text{'dual'}, \text{'docking'}, \text{'respawning'}\}$.
   - Donor must possess **reserve lives**: `donor.lives > 1` (i.e. `reserveLives = donor.lives - 1 >= 1`). A player with only 1 life cannot donate, as it would cause self-destruction.
2. **Recipient Eligibility Criteria**:
   - Partner entity must be in `state === 'revive_pending'` with `reviveTimer > 0`.
3. **Trigger Keys & Actions**:
   - **Player 1 Donating to Player 2**:
     - Key: `KeyL` (or `l` / `L`).
     - Touch: P1 Virtual "DONATE LIFE" Button in left screen quadrant ($X < 112$).
   - **Player 2 Donating to Player 1**:
     - Key: `NumpadDecimal` (or `Period` `.` / `KeyO`).
     - Touch: P2 Virtual "DONATE LIFE" Button in right screen quadrant ($X \ge 112$).
4. **Atomic Transfer Execution**:
   ```ts
   // In PlayerManager.donateLife(donorId: PlayerId): boolean
   const donor = this.getPlayer(donorId);
   const recipient = this.getPlayer(donorId === 'p1' ? 'p2' : 'p1');

   if (!donor || !recipient) return false;
   if (donor.lives <= 1) return false;
   if (recipient.state !== 'revive_pending' || recipient.reviveTimer <= 0) return false;

   // 1. Decrement donor reserve life
   donor.lives -= 1;
   this.game?.scoreManager?.setLives(donor.lives, donor.id);

   // 2. Grant life to recipient
   recipient.lives = 1;
   recipient.reviveTimer = 0;
   this.game?.scoreManager?.setLives(recipient.lives, recipient.id);

   // 3. Respawn recipient with 3.0s invulnerability
   recipient.respawn();

   // 4. Audio & VFX Feedback
   this.game?.soundSynth?.playLifeDonatedChime?.();
   this.game?.particleSystem?.spawnReviveSparkles?.(donor.x, donor.y, recipient.x, recipient.y);

   return true;
   ```

#### D. Shared Game Over Logic
In `PlayerManager.ts`:
```ts
public areAllPlayersDead(): boolean {
  const players = this.getPlayers();
  if (players.length === 0) return true;

  for (const p of players) {
    // If any player has active lives remaining, game continues
    if (p.lives > 0) return false;

    // If any player is in emergency revive countdown, game continues
    if (p.state === 'revive_pending' && p.reviveTimer > 0) return false;
  }

  // Both players have 0 lives AND 0 pending revive timers
  return true;
}
```

In `Game.ts`:
```ts
// Evaluated on every tick or player state change
if (this.isCoop() && (this.state === 'PLAYING' || this.state === 'CHALLENGING_STAGE')) {
  if (this.playerManager.areAllPlayersDead()) {
    this.setState('GAME_OVER');
  }
}
```

#### E. Stage Clear Pity Revive
In `Game.updateStageClear(dt)`:
When the surviving player defeats all enemies in the formation and clears the wave:
```ts
// Pity revive for downed or eliminated partner upon stage victory
if (this.isCoop()) {
  for (const p of this.playerManager.getPlayers()) {
    if (p.lives <= 0 || p.state === 'revive_pending' || p.state === 'eliminated') {
      p.lives = 1;
      p.reviveTimer = 0;
      this.scoreManager.setLives(1, p.id);
      p.respawn();
    }
  }
}
```
This fosters deep cooperative camaraderie: the surviving player can heroically clear the remaining aliens to rescue their fallen comrade without having to sacrifice a reserve life!

---

### 2.3 HUD & Screen Feedback Design

#### A. Virtual Canvas Rendering (`Player.render()` & `HUD.ts`)
1. **Downed Ship Hologram Sprite**:
   - When `player.state === 'revive_pending'`:
     - Render fighter sprite with 50% opacity (`ctx.globalAlpha = 0.5`).
     - Overlay a cyan/crimson wireframe strobe (2Hz blinking).
     - Render expanding distress beacon wavefront:
       $$\text{waveRadius} = ((\text{animTimer} \times 24) \pmod{32}) \text{ px}$$
       Drawn with `ctx.arc(this.x, this.y, waveRadius, 0, Math.PI * 2)`.
2. **Overhead Emergency Countdown Badge**:
   - Location: Directly above downed ship at $(X = p.x, Y = p.y - 16)$.
   - Text: `REVIVE ${Math.ceil(p.reviveTimer)}S`
   - Color:
     - $t > 3.0\text{s}$: Bright Yellow (`#FFFF00`).
     - $t \le 3.0\text{s}$: Flashing Alert Red (`#FF2222`) at 5Hz.
3. **Surviving Partner Action Prompt**:
   - Drawn in partner's screen half or near their ship:
   - If surviving partner has `lives > 1`:
     - P1 Donor Prompt: `DONATE LIFE [L]` (flashing at 3Hz in `#00FFFF`).
     - P2 Donor Prompt: `DONATE LIFE [.]` (flashing at 3Hz in `#FF4444`).
   - If surviving partner has `lives === 1` (no reserve lives):
     - Prompt: `SURVIVE! NO SPARES` (subtle grey/orange `#FFAA00`).

#### B. Mobile Split-Screen Touch Button (`InputHandler.renderTouchGuides()`)
- In `InputHandler.renderTouchGuides(ctx)`:
  - If P2 is in `REVIVE_PENDING` and P1 can donate (`p1.lives > 1`):
    - Draw rounded neon cyan button at $(X = 56, Y = 190, W = 80, H = 26)$.
    - Label: `[DONATE LIFE]`
  - If P1 is in `REVIVE_PENDING` and P2 can donate (`p2.lives > 1`):
    - Draw rounded neon crimson button at $(X = 168, Y = 190, W = 80, H = 26)$.
    - Label: `[DONATE LIFE]`
  - Tapping within the bounding box sets `p1DonateTriggered = true` or `p2DonateTriggered = true`.

#### C. Bottom Dashboard Panel (`BottomDashboard.ts`)
- Zero-GC dirty-checking telemetry update in `Game.updateDashboardTelemetry()`:
  - Pass `p1ReviveTimer` and `p2ReviveTimer` into dashboard state.
  - When P1 is downed: Zone 1 reserve ship icons replaced with an animated pulsing countdown badge `<span class="badge-revive">REVIVE: 8s</span>`.
  - When P2 is downed: Zone 3 reserve ship icons replaced with `<span class="badge-revive">REVIVE: 8s</span>`.
  - If donor has reserve lives: render an interactive button `#btn-donate-p1` or `#btn-donate-p2` with `title="Press L / Tap to donate life"`.

---

## 3. Type Definitions & Implementation Specifications

### 3.1 Type Definitions (`src/types/index.ts`)

```typescript
export type PlayerStateType =
  | 'normal'
  | 'capturing'
  | 'captured'
  | 'docking'
  | 'dual'
  | 'destroyed'
  | 'respawning'
  | 'revive_pending'
  | 'eliminated'
  | 'ALIVE'
  | 'CAPTURING'
  | 'CAPTURED'
  | 'DOCKING'
  | 'DUAL'
  | 'DESTROYED'
  | 'RESPAWNING'
  | 'REVIVE_PENDING'
  | 'ELIMINATED';

export interface PlayerReviveTelemetry {
  playerId: PlayerId;
  state: PlayerStateType;
  lives: number;
  reviveTimer: number; // [0.0 .. 10.0]
  isRevivePending: boolean;
  canReceiveDonation: boolean;
  canDonateLife: boolean;
}

export interface DualReviveStatus {
  p1: PlayerReviveTelemetry;
  p2: PlayerReviveTelemetry;
  allDead: boolean;
}
```

### 3.2 Method Specifications for `PlayerManager.ts`

```typescript
export class PlayerManager {
  // ... existing fields ...

  /**
   * Evaluates whether a donor player possesses reserve lives (>1)
   * and the target player is in a valid REVIVE_PENDING state.
   */
  public canDonateLife(donorId: PlayerId): boolean {
    if (this.mode !== 'coop') return false;
    const donor = this.getPlayer(donorId);
    const recipient = this.getPlayer(donorId === 'p1' ? 'p2' : 'p1');
    if (!donor || !recipient) return false;

    // Donor must have at least 1 reserve life (lives > 1)
    if (donor.lives <= 1) return false;

    // Recipient must be in revive_pending with time remaining
    return recipient.state === 'revive_pending' && recipient.reviveTimer > 0;
  }

  /**
   * Executes atomic life donation transfer from donor to recipient.
   * Returns true if donation succeeded, false otherwise.
   */
  public donateLife(donorId: PlayerId): boolean {
    if (!this.canDonateLife(donorId)) return false;

    const donor = this.getPlayer(donorId)!;
    const recipient = this.getPlayer(donorId === 'p1' ? 'p2' : 'p1')!;

    // 1. Deduct donor life
    donor.lives -= 1;
    this.game?.scoreManager?.setLives(donor.lives, donor.id);

    // 2. Grant life to recipient and reset timer
    recipient.lives = 1;
    recipient.reviveTimer = 0;
    this.game?.scoreManager?.setLives(recipient.lives, recipient.id);

    // 3. Trigger recipient respawn (3.0s invulnerability at baseline)
    recipient.respawn();

    // 4. Feedback audio & particles
    this.game?.soundSynth?.playLifeDonatedChime?.();
    this.game?.particleSystem?.spawnReviveSparkles?.(donor.x, donor.y, recipient.x, recipient.y);

    return true;
  }

  /**
   * Returns true if any player is actively in REVIVE_PENDING.
   */
  public isAnyPlayerReviving(): boolean {
    return this.getPlayers().some(
      (p) => p.state === 'revive_pending' && p.reviveTimer > 0
    );
  }

  /**
   * Evaluates if all managed players are permanently eliminated.
   * Returns false if any player has lives > 0 OR has an active revive timer > 0.
   */
  public areAllPlayersDead(): boolean {
    const players = this.getPlayers();
    if (players.length === 0) return true;

    for (const p of players) {
      if (p.lives > 0) return false;
      if (p.state === 'revive_pending' && p.reviveTimer > 0) return false;
    }
    return true;
  }

  /**
   * Pity revive hook executed upon wave/stage clear.
   */
  public onStageClear(): void {
    if (this.mode !== 'coop') return;

    for (const p of this.getPlayers()) {
      if (p.lives <= 0 || p.state === 'revive_pending' || p.state === 'eliminated') {
        p.lives = 1;
        p.reviveTimer = 0;
        this.game?.scoreManager?.setLives(1, p.id);
        p.respawn();
      }
    }
  }
}
```

### 3.3 Method Specifications for `Player.ts`

```typescript
export class Player {
  // ... existing fields ...
  public reviveTimer: number = 0; // 10.0s emergency timer

  public update(dt: number, input?: InputState): void {
    // ...
    if (this._state === 'revive_pending') {
      this.updateRevivePending(dt);
      return;
    } else if (this._state === 'eliminated') {
      // Idle in eliminated state until stage clear or game over
      return;
    }
    // ...
  }

  private updateRevivePending(dt: number): void {
    this.reviveTimer = Math.max(0, this.reviveTimer - dt);
    this.animTimer += dt;

    if (this.reviveTimer <= 0) {
      this._state = 'eliminated';
      this.onGameOver?.();
    }
  }

  private updateDestroyed(dt: number): void {
    this.deathTimer -= dt;
    if (this.deathTimer <= 0) {
      this.deathTimer = 0;
      if (this.lives > 0) {
        this.respawn();
      } else {
        // Check if Co-op mode allows emergency revive
        if (this.game?.isCoop?.()) {
          this._state = 'revive_pending';
          this.reviveTimer = 10.0;
          this.x = this.id === 'p1' ? 80 : 144;
          this.y = Player.BASELINE_Y;
          this.vx = 0;
          this.vy = 0;
          this.game?.soundSynth?.playReviveEmergencyBeacon?.();
        } else {
          this._state = 'destroyed';
          this.onGameOver?.();
        }
      }
    }
  }
}
```

### 3.4 Method Specifications for `InputHandler.ts`

```typescript
export class InputHandler {
  private p1DonateTriggered: boolean = false;
  private p2DonateTriggered: boolean = false;

  // Key detection helpers
  private isP1DonateKey(c: string, k: string): boolean {
    return c === 'KeyL' || k === 'l' || k === 'L';
  }

  private isP2DonateKey(c: string, k: string): boolean {
    return c === 'NumpadDecimal' || c === 'Period' || k === '.' || c === 'KeyO' || k === 'o' || k === 'O';
  }

  // In handleKeyDown(e):
  if (this.mode === 'coop') {
    if (this.isP1DonateKey(e.code, e.key) && !e.repeat) {
      this.p1DonateTriggered = true;
    }
    if (this.isP2DonateKey(e.code, e.key) && !e.repeat) {
      this.p2DonateTriggered = true;
    }
  }

  // In consumeAction(action, playerId):
  if (action === 'donateLife') {
    if (playerId === 'p1') {
      const v = this.p1DonateTriggered;
      this.p1DonateTriggered = false;
      return v;
    }
    if (playerId === 'p2') {
      const v = this.p2DonateTriggered;
      this.p2DonateTriggered = false;
      return v;
    }
    const anyDonate = this.p1DonateTriggered || this.p2DonateTriggered;
    this.p1DonateTriggered = false;
    this.p2DonateTriggered = false;
    return anyDonate;
  }
}
```

---

## 4. Caveats

1. **No External Asset Invariant**:
   - All visual assets (downed hologram, distress beacon wavefronts, countdown text, donate prompts) must use 100% Canvas 2D procedural drawing. No PNG, SVG, or GIF assets may be introduced.
2. **Single-Player Regression Safety**:
   - Single-Player mode must retain 100% authentic 1981 Galaga arcade behavior: when P1 reaches 0 lives, death delay triggers immediate Game Over without entering `REVIVE_PENDING`.
3. **Zero-GC Invariant**:
   - Frame-by-frame telemetry updates and prompt rendering must not allocate new objects in the 60 FPS animation loop. Countdown numbers must use pre-allocated buffers or direct integer rendering.
4. **Keyboard Layout Variability**:
   - Many compact laptops and modern keyboards lack a dedicated numpad. Providing `Period` (`.`) and `KeyO` as fallback donation keys for Player 2 ensures universal accessibility across all hardware.

---

## 5. Conclusion

1. **Core Problem Solved**: The current baseline lacks a downed state, an emergency revive timer, and a life donation pipeline. Players reaching 0 lives in Co-op get trapped in an unbounded 60Hz `onGameOver` callback loop without any way to be revived.
2. **Robust Solution Designed**:
   - `REVIVE_PENDING` (10-second emergency countdown with holographic distress beacon).
   - Life Donation Mechanic (`KeyL` for P1, `NumpadDecimal`/`Period`/Touch for P2) transferring 1 reserve life when `donor.lives > 1`.
   - Shared Game Over Invariant: `areAllPlayersDead()` strictly enforces that the game continues as long as at least one player is alive OR has an active revive timer. Game Over triggers **only** when both players are permanently eliminated (0 lives and 0 revive timers).
   - Stage Clear Pity Revive: Surviving players who clear the stage heroically revive their fallen partner with 1 life for the next round.
   - Symmetrical HUD & Touch feedback: On-screen countdown, blinking "DONATE LIFE [L]" prompts, and responsive touch buttons.

---

## 6. Verification Method

### 6.1 Independent Automated Test Verification

To independently verify the implementation once coded, run:

```bash
# 1. Run Vitest on the new Co-op Revive test suite
npm test -- tests/unit/m33_coop_revive_life_sharing.test.ts --run

# 2. Run full regression suite across all 115 test files
npm test -- --run

# 3. Verify production TypeScript build compilation
npm run build
```

### 6.2 Unit Test Matrix Specification for M33 Implementers

The implementing worker should construct `tests/unit/m33_coop_revive_life_sharing.test.ts` covering the following 6 test tracks:

1. **Track 1: Downed State & Emergency Timer Initialization**:
   - Single-player death at 0 lives triggers `GAME_OVER` immediately.
   - Co-op P1 death at 0 lives transitions P1 to `'revive_pending'` with `reviveTimer === 10.0`.
   - P1 is invulnerable to bullets, enemy dive impacts, and tractor beams while in `'revive_pending'`.
2. **Track 2: 10-Second Countdown & Elimination**:
   - `p1.update(1.0)` ticks `reviveTimer` from 10.0 down to 9.0.
   - When `reviveTimer <= 0`, P1 transitions to `'eliminated'`.
   - Game continues with P2 playing solo if P2 has lives.
3. **Track 3: Life Donation via Keyboard & Touch**:
   - P1 has 2 lives, P2 is in `'revive_pending'`: P1 triggers `KeyL` $\to$ P1 lives become 1, P2 lives become 1, P2 respawns at baseline with 3.0s invulnerability.
   - Symmetrical: P2 has 2 lives, P1 in `'revive_pending'`: P2 triggers `NumpadDecimal` / `Period` $\to$ P2 lives become 1, P1 lives become 1, P1 respawns.
   - If donor has only 1 life (`lives === 1`), `canDonateLife` returns false and donation attempt is rejected.
4. **Track 4: Shared Game Over Invariant**:
   - When P1 is eliminated (0 lives, 0s timer) and P2 dies with 0 lives, P2 enters `'revive_pending'` (10s timer). `areAllPlayersDead()` remains `false`.
   - When P2's timer reaches 0, `areAllPlayersDead()` returns `true` and `Game.setState('GAME_OVER')` triggers.
5. **Track 5: Stage Clear Pity Revive**:
   - P1 is in `'revive_pending'` or `'eliminated'`. P2 clears all enemies, triggering `onStageClear()`.
   - P1 is restored with 1 life and respawns cleanly for the next stage.
6. **Track 6: Zero-GC & HUD Telemetry**:
   - 1,000 frames of downed/reviving simulation produce 0 garbage collection allocations.
   - Telemetry correctly reports `isRevivePending`, `reviveTimer`, and donation eligibility to the bottom dashboard.

---

### Invalidation Conditions
This architecture would be invalidated if:
1. A downed player could still be hit or destroyed by enemy bullets, causing NaN or negative lives.
2. Life donation could be triggered by a donor with only 1 life, killing the donor.
3. Single-player mode failed to trigger Game Over upon reaching 0 lives (regression on 1P baseline).
4. Any external image or audio assets were introduced.
