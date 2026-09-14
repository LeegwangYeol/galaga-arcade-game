# Architectural Handoff Report: Zero-GC 60 FPS Dirty-Checking Engine & State Diffing

**Agent**: `m34_explorer_2`  
**Milestone**: M34 — Symmetrical Dual Bottom Dashboard HUD & Ergonomic Polish  
**Parent Conversation ID**: `0236827c-a7d2-4115-a374-2f5c45ed8134`  
**Working Directory**: `/Users/user/src/galog/.agents/m34_explorer_2`  
**Timestamp**: 2026-09-14T19:50:30+09:00  

---

## 1. Observation

### 1.1 Source Code Telemetry & Execution Flow
Investigation of `src/core/Game.ts`, `src/ui/BottomDashboard.ts`, `src/systems/ScoreManager.ts`, and `src/systems/PlayerManager.ts` reveals the exact runtime lifecycle of the HUD within the 60 FPS loop:

1. **Invocation Point in `Game.ts`**:
   - In `src/core/Game.ts:833–836`:
     ```typescript
     // Update Bottom HUD & Dashboard Bar Telemetry (Milestone M28)
     this.updateDashboardTelemetry();
     if (this.bottomDashboard) {
       this.bottomDashboard.update(this._dashboardState);
     }
     ```
   - Invoked unconditionally every frame ($16.6667\text{ ms}$, 60 FPS), even during paused state or title screen transitions.
   - `this._dashboardState` is pre-allocated on initialization (`src/core/Game.ts:462–481`).
   - In `src/core/Game.ts:1855–1972`, `updateDashboardTelemetry()` mutates `this._dashboardState` properties in-place. However, it **only populates Player 1 data**; Player 2 telemetry is currently absent.

2. **Existing Dirty-Checking Invariants in `BottomDashboard.ts`**:
   - **Zero Layout Thrashing**: `BottomDashboard.update()` **never reads layout or geometry properties** (`offsetWidth`, `clientHeight`, `getBoundingClientRect()`, `getComputedStyle()`). All diffing is performed purely against JavaScript primitive values passed in the `telemetry` object.
   - **Primitive Dirty Caches**:
     - `_lastScore: number = -1` (line 150)
     - `_lastHighScore: number = -1` (line 151)
     - `_lastIsNewRecord: boolean | null = null` (line 152)
     - `_lastLives: number = -1` (line 153)
     - `_lastSpecialEnergyInt: number = -1` (line 154)
     - `_lastIsSpecialReady: boolean | null = null` (line 155)
     - `_lastSpecialCueText: string = ''` (line 156)
     - `_lastSpecialMove: string = ''` (line 157)
     - `_lastIsMuted: boolean | null = null` (line 158)
     - `_lastIsFullscreen: boolean | null = null` (line 159)
     - `_lastIsPaused: boolean | null = null` (line 160)
   - When inputs match cached values, all DOM setters (`textContent`, `style.width`, `classList.toggle`, `setAttribute`) are skipped.
   - **Pre-allocated Object Pools in HUD**:
     - 5 pre-created SVG ship icons in `this.lifeIcons: HTMLElement[]` (lines 409–414).
     - Pre-allocated power-up chip pool `this.chipPool: Map<string, PreallocatedChip>` (lines 817–826).
     - Recycled `this._activePowerUpIds = new Set<string>()` (cleared via `.clear()` each frame without heap allocation).

3. **Subtle Memory Allocation Defect Discovered in Existing Code**:
   - At `src/ui/BottomDashboard.ts:712`:
     ```typescript
     const cueText = isReady ? 'READY [X]' : `${energyInt}%`;
     if (cueText !== this._lastSpecialCueText) {
       if (this.elSpecialCue) {
         this.elSpecialCue.textContent = cueText;
         this.elSpecialCue.className = isReady
           ? 'special-cue special-ready-cue'
           : 'special-cue text-white';
       }
       this._lastSpecialCueText = cueText;
     }
     ```
   - **Defect**: The template literal `${energyInt}%` allocates a new string on the V8 heap **every single frame** when `isReady` is false, *before* the dirty check `if (cueText !== this._lastSpecialCueText)` executes. At 60 FPS, this generates 3,600 unnecessary temporary string allocations per minute in steady state.

4. **Co-op State Machine & Multi-Entity Telemetry in `PlayerManager.ts` & `Player.ts`**:
   - `PlayerManager.ts:105–120`: Provides `getPlayers(): Player[]` and `getPlayer(id: 'p1' | 'p2')`.
   - `Player.ts:79, 600–618`: Player state transitions to `'revive_pending'` when a co-op player exhausts all lives. `reviveTimer` counts down from `10.0` seconds to `0.0`. If timer reaches `0`, state transitions to `'eliminated'`.
   - `PlayerManager.ts:174–189`: `canDonateLife(donorId: PlayerId): boolean` evaluates whether the surviving donor has `donor.lives > 1` and recipient is in `'revive_pending'`.
   - `PlayerManager.ts:195–218`: `donateLife(donorId: PlayerId): boolean` executes atomic life transfer, deducting 1 life from donor, setting recipient to 1 life, and immediately calling `recipient.respawn()`.
   - `ScoreManager.ts:176–216`: Independently tracks `getScore('p1')`, `getScore('p2')`, `getLives('p1')`, and `getLives('p2')`.

---

## 2. Logic Chain

1. **Problem Statement**:
   Phase 6 introduces Local 2-Player Co-op. The Bottom Dashboard must transition from an asymmetrical single-player HUD into a **symmetrical 3-zone cyber-arcade dashboard**:
   - **Zone 1 (Left)**: Player 1 (Classic Cyan/White) Score, High Score, Reserve Ships, Power-Up Chips, Special Gauge, and Revive/Donation indicators.
   - **Zone 2 (Center)**: Stage Badge, High Score, Crisis Warning Marquee, and Global Controls (Mute, Fullscreen, Pause).
   - **Zone 3 (Right)**: Player 2 (Crimson/Amber) Symmetrically Mirrored Score, High Score, Reserve Ships, Power-Up Chips, Special Gauge, and Revive/Donation indicators.
   - **Zero-GC Constraint**: The dashboard must run at 60 FPS with **0 heap allocations** and **0 DOM mutations** per frame when telemetry is steady.

2. **Decoupling State Diffing by Player Entity**:
   - Because P1 and P2 can independently score, take damage, activate buffs, and die, dirty checking cannot rely on a single set of primitives.
   - Maintaining flat, primitive cache fields on the `BottomDashboard` instance (`_p1LastScore`, `_p2LastScore`, `_p1LastLives`, `_p2LastLives`, etc.) ensures direct V8 hidden-class scalar comparisons with zero pointer dereference or object boxing overhead.

3. **Eliminating All String Allocations via Lookup Tables**:
   - Integer percentages $0 \dots 100$ and revive countdown seconds $0 \dots 15$ are bounded.
   - By creating frozen, pre-allocated lookup arrays (`PERCENT_STRINGS` for `'0%'` through `'100%'`, and `REVIVE_COUNTDOWN_STRINGS` for `'REVIVE: 0S'` through `'REVIVE: 15S'`), string formatting is replaced with $O(1)$ indexed array reads of existing static string pointers.
   - Furthermore, checking `if (energyInt !== this._lastEnergyInt || isReady !== this._lastIsReady)` *before* accessing the lookup string guarantees zero overhead when unchanged.

4. **DOM Mutation Elimination via Strict Guarding**:
   - By structuring all DOM write operations behind strict inequality guards:
     ```typescript
     if (p1Score !== this._p1LastScore) {
       this.elP1Score.textContent = this.formatScore6(p1Score);
       this._p1LastScore = p1Score;
     }
     ```
     DOM mutations occur only on real game events (e.g., enemy killed, life lost). When the player is moving, dodging, or stationary, **0 DOM properties are touched**.

5. **Pre-allocated Double-Buffered Element Pools**:
   - Instead of creating and removing SVG/DOM nodes during gameplay:
     - Pre-allocate 5 ship icons for P1 (Cyan fill) and 5 ship icons for P2 (Crimson fill).
     - Pre-allocate 9 power-up chips for P1 and 9 power-up chips for P2 (18 total chips across both racks).
     - Mount/unmount chips solely by moving them into or out of the pre-allocated rack container using `appendChild` / `removeChild` when active state toggles.
     - Progress bar widths are updated via `PERCENT_STRINGS[progressPct]`, and only when `progressPct !== chip.lastProgressInt`.

6. **Revive & Life Donation Visual Mechanics**:
   - When a player enters `revive_pending`:
     - Toggle class `.revive-warning-pulse` on the respective player's zone container.
     - Display the pre-allocated `#p1-revive-badge` / `#p2-revive-badge` with text from `REVIVE_COUNTDOWN_STRINGS[seconds]`.
     - When `seconds <= 3`, add `.revive-urgent` to trigger a high-frequency (4Hz) red warning flash.
     - If the partner has reserve lives (`canDonateLife === true`), display the tactile prompt `"[L] DONATE LIFE"` on the surviving partner's HUD and in the center telemetry bar.
     - If `donateLife()` is triggered or countdown expires, state changes and the UI immediately clears the pulse and badge.

7. **Backward Compatibility Preservation**:
   - All existing single-player test suites (`tests/unit/bottom_dashboard.test.ts`, `tests/unit/m28_challenger_1_adversarial.test.ts`, `tests/unit/m30_dom_leak_verifier.test.ts`) query legacy element IDs (`#dashboard-score`, `#dashboard-high-score`, `#dashboard-lives`, `#dashboard-powerups`, `.special-charge-bar`, `#btn-dash-mute`, etc.).
   - Maintaining these exact IDs on the P1 elements and center controls ensures 100% backward compatibility with all 2,166 existing tests without breaking any selector contracts.

---

## 3. Caveats

1. **Single-Player Mode Visual Treatment of Zone 3 (P2)**:
   - In Single-Player mode, Player 2 is inactive. Zone 3 should render a dimmed retro-arcade prompt: `"2P PRESS [ENTER] TO JOIN"` or `"1P SOLO MODE"`, or be hidden via `.p2-inactive` class, while preserving DOM nodes so switching to Co-op mode does not require DOM recreation.
2. **Float Precision in Revive Timer**:
   - `Player.reviveTimer` is a floating-point number in seconds ($10.0 \dots 0.0$). Comparing raw float `reviveTimer` would trigger 60 DOM updates per second! The dirty-check must diff against `Math.ceil(reviveTimer)` (integer seconds $10, 9, 8 \dots 0$), ensuring exactly **one DOM update per second** during countdown.
3. **CSS Animation Performance**:
   - The pulsing warning border must animate via GPU-accelerated CSS properties (`box-shadow`, `opacity`, `transform`) using `@keyframes` rather than JavaScript-driven style mutations, keeping the 60 FPS thread completely unblocked.
4. **Co-op Mode Toggle Mid-Session**:
   - If the game transitions between single-player and co-op, the state cache must reset its comparison baselines to `-1` / `null` to trigger a clean, one-time full refresh of both zones.

---

## 4. Conclusion & Technical Specifications

### 4.1 Pre-Allocated Static Lookup Tables (Zero Allocation)

```typescript
// Bounded static lookup for all 0..100 percentage values (Zero string allocations at 60 FPS)
export const PERCENT_STRINGS: readonly string[] = Object.freeze(
  Array.from({ length: 101 }, (_, i) => `${i}%`)
);

// Bounded static lookup for revive countdown badges (0..15 seconds)
export const REVIVE_COUNTDOWN_STRINGS: readonly string[] = Object.freeze(
  Array.from({ length: 16 }, (_, i) => `REVIVE: ${i}S`)
);
```

### 4.2 Comprehensive Multi-Entity Telemetry Interface (`DashboardTelemetry`)

```typescript
export interface PlayerDashboardTelemetry {
  readonly id: 'p1' | 'p2';
  score: number;
  lives: number;
  reserveLives?: number;
  state: 'normal' | 'capturing' | 'captured' | 'destroyed' | 'respawning' | 'revive_pending' | 'eliminated';
  reviveTimer: number;        // Float seconds remaining (10.0 .. 0.0)
  canDonateLife: boolean;     // Partner has reserve lives to donate
  specialEnergy: number;      // 0 .. 100
  specialCharge?: number;
  isSpecialReady: boolean;
  selectedSpecial: string;    // 'NOVA_BARRAGE' | 'CHRONO_FREEZE' | 'WARP_RAM'
  activePowerUps: readonly ActivePowerUpTelemetry[];
  activePowerUpCount: number;
}

export interface DashboardTelemetry {
  // Mode flag
  isCoop?: boolean;
  mode?: 'single' | 'coop';

  // Backward-compatible 1P legacy fields (maps directly to P1)
  score?: number;
  highScore: number;
  isNewHighScore?: boolean;
  lives?: number;
  reserveLives?: number;
  stage?: number;
  activePowerUps?: readonly ActivePowerUpTelemetry[];
  activePowerUpCount?: number;
  specialEnergy?: number;
  specialCharge?: number;
  isSpecialReady?: boolean;
  specialReady?: boolean;
  specialActive?: boolean;
  selectedSpecial?: string;

  // Independent Dual Player Telemetry
  p1?: PlayerDashboardTelemetry;
  p2?: PlayerDashboardTelemetry;

  // Center Tactical Telemetry
  crisisState?: 'IDLE' | 'WARNING' | 'ACTIVE' | 'COOLDOWN';
  crisisType?: string;
  crisisWarningText?: string;
  isCrisisActive?: boolean;

  // Global Controls
  isMuted?: boolean;
  isFullscreen?: boolean;
  isPaused?: boolean;
  canPause?: boolean;
}
```

### 4.3 `BottomDashboard` State Cache Structure (V8 Scalar Properties)

```typescript
export class BottomDashboard {
  // --- Mode State ---
  private _isCoop: boolean = false;

  // --- Player 1 Primitive Cache ---
  private _p1Score: number = -1;
  private _p1Lives: number = -1;
  private _p1SpecialEnergyInt: number = -1;
  private _p1IsSpecialReady: boolean | null = null;
  private _p1SpecialMove: string = '';
  private _p1State: string = '';
  private _p1ReviveSeconds: number = -1;
  private _p1CanDonate: boolean | null = null;

  // --- Player 2 Primitive Cache ---
  private _p2Score: number = -1;
  private _p2Lives: number = -1;
  private _p2SpecialEnergyInt: number = -1;
  private _p2IsSpecialReady: boolean | null = null;
  private _p2SpecialMove: string = '';
  private _p2State: string = '';
  private _p2ReviveSeconds: number = -1;
  private _p2CanDonate: boolean | null = null;

  // --- Center Telemetry Cache ---
  private _lastStage: number = -1;
  private _lastHighScore: number = -1;
  private _lastIsNewRecord: boolean | null = null;
  private _lastCrisisState: string = '';
  private _lastCrisisWarningText: string = '';

  // --- Global Tactical Controls Cache ---
  private _lastIsMuted: boolean | null = null;
  private _lastIsFullscreen: boolean | null = null;
  private _lastIsPaused: boolean | null = null;

  // --- Pre-allocated Chip & Icon Pools ---
  private _p1LifeIcons: HTMLElement[] = [];
  private _p2LifeIcons: HTMLElement[] = [];
  private _p1MountedLives: number = 0;
  private _p2MountedLives: number = 0;

  private _p1ChipPool: Map<string, PreallocatedChip> = new Map();
  private _p2ChipPool: Map<string, PreallocatedChip> = new Map();
  private _p1ActiveChipIds: Set<string> = new Set();
  private _p2ActiveChipIds: Set<string> = new Set();
  ...
}
```

### 4.4 Symmetrical 3-Zone DOM Hierarchy & Backward Compatibility IDs

```
<div id="bottom-dashboard" class="bottom-dashboard cyber-dashboard [coop-mode]">
  <!-- ZONE 1: PLAYER 1 (LEFT) -->
  <div class="dash-zone zone-left zone-p1" id="dash-zone-p1">
    <div class="dash-score-rack">
      <div class="dash-score-entry">
        <span class="dash-label text-cyan">1UP</span>
        <!-- Legacy backward compatible ID -->
        <span id="dashboard-score" class="dash-val text-white dashboard-score">000000</span>
      </div>
    </div>
    <div class="dash-lives-rack">
      <span class="dash-label text-cyan">SHIPS</span>
      <!-- Legacy backward compatible ID -->
      <div id="dashboard-lives" class="dash-lives-icons dashboard-lives">
        <!-- 5 pre-allocated cyan SVG icons appended/removed -->
      </div>
    </div>
    <!-- Legacy backward compatible ID -->
    <div id="dashboard-powerups" class="dash-chip-rack p1-powerups"></div>
    <div id="p1-special-container" class="dash-special-rack dashboard-special-container">
      <div class="dash-special-header">
        <span class="special-name text-cyan">SP</span>
        <span class="special-cue text-white">0%</span>
      </div>
      <div class="special-track" role="progressbar" aria-valuenow="0">
        <!-- Legacy backward compatible class -->
        <div class="special-fill special-charge-bar" style="width: 0%;"></div>
      </div>
    </div>
    <!-- Revive & Donation Prompts -->
    <div id="p1-revive-badge" class="dash-revive-badge hidden">REVIVE: 10S</div>
    <div id="p1-donate-prompt" class="dash-donate-prompt hidden">[L] DONATE LIFE</div>
  </div>

  <!-- ZONE 2: CENTER TACTICAL TELEMETRY & GLOBAL CONTROLS -->
  <div class="dash-zone zone-center" id="dash-zone-center">
    <div class="dash-stage-badge text-yellow" id="dashboard-stage">STAGE 1</div>
    <div class="dash-high-score-entry">
      <span class="dash-label text-yellow">HIGH</span>
      <!-- Legacy backward compatible ID -->
      <span id="dashboard-high-score" class="dash-val text-yellow dashboard-high-score">020000</span>
    </div>
    <div class="dash-crisis-marquee" id="dashboard-crisis-marquee"></div>
    <div class="dash-actions">
      <!-- Legacy backward compatible action button IDs -->
      <button id="btn-dash-mute" class="dash-btn btn-dash-mute" title="Mute/Unmute Audio (M)">🔊</button>
      <button id="btn-dash-fullscreen" class="dash-btn btn-dash-fullscreen" title="Toggle Fullscreen (F)">⛶</button>
      <button id="btn-dash-pause" class="dash-btn btn-dash-pause" title="Pause/Resume Game (P)">⏸</button>
    </div>
  </div>

  <!-- ZONE 3: PLAYER 2 (RIGHT, SYMMETRICALLY MIRRORED) -->
  <div class="dash-zone zone-right zone-p2" id="dash-zone-p2">
    <div class="dash-score-rack">
      <div class="dash-score-entry">
        <span class="dash-label text-crimson">2UP</span>
        <span id="p2-dashboard-score" class="dash-val text-white p2-dashboard-score">000000</span>
      </div>
    </div>
    <div class="dash-lives-rack">
      <span class="dash-label text-crimson">SHIPS</span>
      <div id="p2-dashboard-lives" class="dash-lives-icons p2-dashboard-lives">
        <!-- 5 pre-allocated crimson SVG icons appended/removed -->
      </div>
    </div>
    <div id="p2-dashboard-powerups" class="dash-chip-rack p2-powerups"></div>
    <div id="p2-special-container" class="dash-special-rack p2-special-container">
      <div class="dash-special-header">
        <span class="special-name text-crimson">SP</span>
        <span class="special-cue text-white">0%</span>
      </div>
      <div class="special-track" role="progressbar" aria-valuenow="0">
        <div class="special-fill p2-special-charge-bar" style="width: 0%;"></div>
      </div>
    </div>
    <!-- Revive & Donation Prompts -->
    <div id="p2-revive-badge" class="dash-revive-badge hidden">REVIVE: 10S</div>
    <div id="p2-donate-prompt" class="dash-donate-prompt hidden">[DONATE LIFE]</div>
    <div id="p2-join-prompt" class="dash-join-prompt">2P PRESS ENTER</div>
  </div>
</div>
```

### 4.5 Core Zero-GC Update Algorithm Pseudocode

```typescript
public update(telemetry: DashboardTelemetry): void {
  if (!this.element || !telemetry) return;

  const isCoop = telemetry.isCoop ?? (telemetry.mode === 'coop') ?? !!telemetry.p2;
  if (isCoop !== this._isCoop) {
    this.element.classList.toggle('coop-mode', isCoop);
    this._isCoop = isCoop;
  }

  // --------------------------------------------------------------------------
  // 1. Player 1 Updates (Zero-GC Diffing)
  // --------------------------------------------------------------------------
  const p1 = telemetry.p1;
  const p1RawScore = p1?.score ?? telemetry.score ?? 0;
  const p1ClampedScore = isNaN(p1RawScore) || p1RawScore < 0 ? 0 : Math.floor(p1RawScore);
  if (p1ClampedScore !== this._p1Score) {
    if (this.elP1Score) this.elP1Score.textContent = this.formatScore6(p1ClampedScore);
    this._p1Score = p1ClampedScore;
  }

  const p1RawLives = p1?.lives ?? telemetry.lives ?? 0;
  const p1ClampedLives = Math.max(0, Math.min(5, Math.floor(isNaN(p1RawLives) ? 0 : p1RawLives)));
  if (p1ClampedLives !== this._p1Lives) {
    this.updateLivesIcons(this.elP1LivesContainer, this._p1LifeIcons, this._p1MountedLives, p1ClampedLives);
    this._p1MountedLives = p1ClampedLives;
    this._p1Lives = p1ClampedLives;
  }

  const p1Energy = p1?.specialEnergy ?? telemetry.specialEnergy ?? 0;
  const p1EnergyInt = Math.max(0, Math.min(100, Math.floor(isNaN(p1Energy) ? 0 : p1Energy)));
  if (p1EnergyInt !== this._p1SpecialEnergyInt) {
    if (this.elP1SpecialFill) this.elP1SpecialFill.style.width = PERCENT_STRINGS[p1EnergyInt];
    if (this.elP1SpecialTrack) this.elP1SpecialTrack.setAttribute('aria-valuenow', p1EnergyInt.toString());
    this._p1SpecialEnergyInt = p1EnergyInt;
  }

  const p1IsReady = p1?.isSpecialReady ?? telemetry.isSpecialReady ?? (p1EnergyInt >= 100);
  if (p1IsReady !== this._p1IsSpecialReady || p1EnergyInt !== this._p1SpecialEnergyInt) {
    if (this.elP1SpecialContainer) this.elP1SpecialContainer.classList.toggle('special-ready', p1IsReady);
    if (this.elP1SpecialCue) {
      this.elP1SpecialCue.textContent = p1IsReady ? 'READY [X]' : PERCENT_STRINGS[p1EnergyInt];
      this.elP1SpecialCue.className = p1IsReady ? 'special-cue special-ready-cue' : 'special-cue text-white';
    }
    this._p1IsSpecialReady = p1IsReady;
  }

  // P1 Revive State Diffing
  const p1State = p1?.state ?? 'normal';
  const p1ReviveTimer = p1?.reviveTimer ?? 0;
  const p1ReviveSec = p1State === 'revive_pending' ? Math.max(0, Math.min(15, Math.ceil(p1ReviveTimer))) : 0;
  if (p1State !== this._p1State || p1ReviveSec !== this._p1ReviveSeconds) {
    this.updatePlayerReviveState('p1', p1State, p1ReviveSec);
    this._p1State = p1State;
    this._p1ReviveSeconds = p1ReviveSec;
  }

  const p1CanDonate = p1?.canDonateLife ?? false;
  if (p1CanDonate !== this._p1CanDonate) {
    if (this.elP1DonatePrompt) this.elP1DonatePrompt.classList.toggle('active', p1CanDonate);
    this._p1CanDonate = p1CanDonate;
  }

  this.updatePowerUpChipsForPlayer('p1', p1?.activePowerUps ?? telemetry.activePowerUps);

  // --------------------------------------------------------------------------
  // 2. Player 2 Updates (Only when Co-op Active)
  // --------------------------------------------------------------------------
  if (isCoop) {
    const p2 = telemetry.p2;
    const p2RawScore = p2?.score ?? 0;
    const p2ClampedScore = isNaN(p2RawScore) || p2RawScore < 0 ? 0 : Math.floor(p2RawScore);
    if (p2ClampedScore !== this._p2Score) {
      if (this.elP2Score) this.elP2Score.textContent = this.formatScore6(p2ClampedScore);
      this._p2Score = p2ClampedScore;
    }

    const p2RawLives = p2?.lives ?? 0;
    const p2ClampedLives = Math.max(0, Math.min(5, Math.floor(isNaN(p2RawLives) ? 0 : p2RawLives)));
    if (p2ClampedLives !== this._p2Lives) {
      this.updateLivesIcons(this.elP2LivesContainer, this._p2LifeIcons, this._p2MountedLives, p2ClampedLives);
      this._p2MountedLives = p2ClampedLives;
      this._p2Lives = p2ClampedLives;
    }

    const p2Energy = p2?.specialEnergy ?? 0;
    const p2EnergyInt = Math.max(0, Math.min(100, Math.floor(isNaN(p2Energy) ? 0 : p2Energy)));
    if (p2EnergyInt !== this._p2SpecialEnergyInt) {
      if (this.elP2SpecialFill) this.elP2SpecialFill.style.width = PERCENT_STRINGS[p2EnergyInt];
      if (this.elP2SpecialTrack) this.elP2SpecialTrack.setAttribute('aria-valuenow', p2EnergyInt.toString());
      this._p2SpecialEnergyInt = p2EnergyInt;
    }

    const p2IsReady = p2?.isSpecialReady ?? (p2EnergyInt >= 100);
    if (p2IsReady !== this._p2IsSpecialReady || p2EnergyInt !== this._p2SpecialEnergyInt) {
      if (this.elP2SpecialContainer) this.elP2SpecialContainer.classList.toggle('special-ready', p2IsReady);
      if (this.elP2SpecialCue) {
        this.elP2SpecialCue.textContent = p2IsReady ? 'READY [M]' : PERCENT_STRINGS[p2EnergyInt];
        this.elP2SpecialCue.className = p2IsReady ? 'special-cue special-ready-cue' : 'special-cue text-white';
      }
      this._p2IsSpecialReady = p2IsReady;
    }

    // P2 Revive State Diffing
    const p2State = p2?.state ?? 'normal';
    const p2ReviveTimer = p2?.reviveTimer ?? 0;
    const p2ReviveSec = p2State === 'revive_pending' ? Math.max(0, Math.min(15, Math.ceil(p2ReviveTimer))) : 0;
    if (p2State !== this._p2State || p2ReviveSec !== this._p2ReviveSeconds) {
      this.updatePlayerReviveState('p2', p2State, p2ReviveSec);
      this._p2State = p2State;
      this._p2ReviveSeconds = p2ReviveSec;
    }

    const p2CanDonate = p2?.canDonateLife ?? false;
    if (p2CanDonate !== this._p2CanDonate) {
      if (this.elP2DonatePrompt) this.elP2DonatePrompt.classList.toggle('active', p2CanDonate);
      this._p2CanDonate = p2CanDonate;
    }

    this.updatePowerUpChipsForPlayer('p2', p2?.activePowerUps);
  }

  // --------------------------------------------------------------------------
  // 3. Center Telemetry (Stage, High Score, Crisis Alert)
  // --------------------------------------------------------------------------
  const rawHigh = telemetry.highScore ?? 20000;
  const clampedHigh = isNaN(rawHigh) || rawHigh < 0 ? 0 : Math.floor(rawHigh);
  if (clampedHigh !== this._lastHighScore) {
    if (this.elHighVal) this.elHighVal.textContent = this.formatScore6(clampedHigh);
    this._lastHighScore = clampedHigh;
  }

  const stage = telemetry.stage ?? 1;
  if (stage !== this._lastStage) {
    if (this.elStageBadge) this.elStageBadge.textContent = `STAGE ${stage}`;
    this._lastStage = stage;
  }

  const crisisText = telemetry.crisisWarningText || '';
  if (crisisText !== this._lastCrisisWarningText) {
    if (this.elCrisisMarquee) {
      this.elCrisisMarquee.textContent = crisisText;
      this.elCrisisMarquee.classList.toggle('active', crisisText.length > 0);
    }
    this._lastCrisisWarningText = crisisText;
  }

  // --------------------------------------------------------------------------
  // 4. Global Action Buttons Diffing
  // --------------------------------------------------------------------------
  if (telemetry.isMuted !== undefined && telemetry.isMuted !== this._lastIsMuted) {
    if (this.elBtnMute) {
      this.elBtnMute.textContent = telemetry.isMuted ? '🔇' : '🔊';
      this.elBtnMute.setAttribute('aria-pressed', telemetry.isMuted ? 'true' : 'false');
    }
    this._lastIsMuted = telemetry.isMuted;
  }

  if (telemetry.isFullscreen !== undefined && telemetry.isFullscreen !== this._lastIsFullscreen) {
    if (this.elBtnFullscreen) {
      this.elBtnFullscreen.textContent = telemetry.isFullscreen ? '🗗' : '⛶';
      this.elBtnFullscreen.setAttribute('aria-pressed', telemetry.isFullscreen ? 'true' : 'false');
    }
    this._lastIsFullscreen = telemetry.isFullscreen;
  }

  if (telemetry.isPaused !== undefined && telemetry.isPaused !== this._lastIsPaused) {
    if (this.elBtnPause) {
      this.elBtnPause.textContent = telemetry.isPaused ? '▶' : '⏸';
      this.elBtnPause.setAttribute('aria-pressed', telemetry.isPaused ? 'true' : 'false');
    }
    this._lastIsPaused = telemetry.isPaused;
  }
}
```

### 4.6 Revive State Update Method

```typescript
private updatePlayerReviveState(playerId: 'p1' | 'p2', state: string, secondsRemaining: number): void {
  const isP1 = playerId === 'p1';
  const zoneEl = isP1 ? this.zoneLeft : this.zoneRight;
  const badgeEl = isP1 ? this.elP1ReviveBadge : this.elP2ReviveBadge;
  if (!zoneEl || !badgeEl) return;

  const isReviving = state === 'revive_pending';
  zoneEl.classList.toggle('revive-warning-pulse', isReviving);
  zoneEl.classList.toggle('player-eliminated', state === 'eliminated');
  zoneEl.classList.toggle('player-captured', state === 'captured');

  if (isReviving) {
    badgeEl.classList.remove('hidden');
    badgeEl.textContent = REVIVE_COUNTDOWN_STRINGS[secondsRemaining] || `REVIVE: ${secondsRemaining}S`;
    badgeEl.classList.toggle('revive-urgent', secondsRemaining <= 3);
  } else {
    badgeEl.classList.add('hidden');
  }
}
```

---

## 5. Verification Method

To independently verify this Zero-GC 60 FPS Dirty-Checking Engine, execute:

1. **Full Baseline Preservation Test**:
   ```bash
   npx vitest run
   ```
   *Expectation*: All 119 test files and 2,166 tests pass 100%.

2. **Targeted Bottom Dashboard Unit Test**:
   ```bash
   npx vitest run tests/unit/bottom_dashboard.test.ts
   ```
   *Expectation*: All 33 tests pass in < 50ms.

3. **Adversarial Zero-GC Verification Tests**:
   ```bash
   npx vitest run tests/unit/m28_challenger_1_adversarial.test.ts
   npx vitest run tests/unit/m30_dom_leak_verifier.test.ts
   ```
   *Expectation*:
   - 10,000 frames of steady telemetry produce strictly 0 DOM mutations after frame 1.
   - 500 frames of steady gameplay loop produce strictly 0 `Set` and 0 `Map` allocations.

4. **Proposed M34 Co-op Symmetrical HUD Test Specification**:
   Write `tests/unit/m34_coop_bottom_dashboard.test.ts` asserting:
   - **Test 1**: Dual-player telemetry renders independent P1 and P2 scores, lives racks (Cyan vs Crimson), and powerup chips.
   - **Test 2**: 10,000 consecutive identical dual-player frames incur strictly 0 `textContent` setter calls, 0 `style.width` mutations, and 0 `classList` modifications.
   - **Test 3**: Setting P1 to `state: 'revive_pending'` with `reviveTimer: 10.0` mounts the pulsing warning border and displays `"REVIVE: 10S"`.
   - **Test 4**: Decrementing `reviveTimer` from 10.0 to 9.1 triggers 0 DOM mutations; passing 9.0 triggers exactly 1 text update to `"REVIVE: 9S"`.
   - **Test 5**: Setting `canDonateLife: true` immediately reveals the tactile `"[L] DONATE LIFE"` cue on the surviving partner's HUD.
   - **Test 6**: Single-player telemetry updates cleanly without error, maintaining 100% backward compatibility with legacy IDs (`#dashboard-score`, `#dashboard-lives`, `#dashboard-powerups`).

---
*Report certified by `m34_explorer_2`.*
