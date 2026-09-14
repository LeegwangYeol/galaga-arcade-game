# M28 Exploration Report: Game State & Telemetry Integration Specialist

**Agent**: `m28_explorer_2` (Game State & Telemetry Integration Specialist)  
**Milestone**: M28 — Modernized Bottom HUD & Dashboard Bar  
**Working Directory**: `/Users/user/teamwork_projects/galaga_game/.agents/m28_explorer_2`  
**Dual Mirror**: `/Users/user/src/galog/.agents/m28_explorer_2`  
**Timestamp**: `2026-09-11T08:04:00Z`  

---

## 1. Observation

Direct observations from examining codebase entry points, data models, and subsystems:

### 1.1 Core Game State Sources & Entry Points

1. **`src/core/Game.ts`**:
   - Master coordinator declaring:
     - `this.scoreManager: ScoreManager` (lines 280–281)
     - `this.player: Player` (lines 313–318)
     - `this.powerUpManager: PowerUpManager` (line 491)
     - `this.specialMovesManager: SpecialMovesManager` (line 495)
     - `this.fullscreenManager: FullscreenManager` (lines 290–294)
     - `this.audioContextManager: AudioContextManager` (line 284)
     - `this.state: GameState` ('BOOT' | 'TITLE' | 'STAGE_INTRO' | 'PLAYING' | 'CHALLENGING_STAGE' | 'STAGE_CLEAR' | 'GAME_OVER' | 'PAUSED') (line 100)
   - Lifecycle orchestration:
     - `start()` / `stop()`: controls `GameLoop` (lines 561–574)
     - `pause()` / `resume()` / `togglePause()`: manages `'PAUSED'` state transition, starfield speed state, and audio suspend/resume (lines 579–614)
     - `update(dt)`: updates all subsystems at 60 FPS (lines 824–896)
     - `destroy()`: cleanly disposes subsystems and listeners (lines 619–654)

2. **`src/systems/ScoreManager.ts`**:
   - Live score accessors:
     - `score`: `number` (line 126)
     - `highScore`: `number` (line 130) with LocalStorage persistence under key `'galaga_arcade_high_score'` (fallback: `'galaga_high_score'`)
     - `lives`: `number` (line 134, defaults to 3)
     - `stage`: `number` (line 138, 1..50)
     - `shotsFired`, `shotsHit`, `challengingHits`: numbers (lines 142–152)
     - `getAccuracyPercentage()`: number (lines 387–392)
   - Event callbacks:
     - `onExtraLife((count: number) => void)` (lines 162–164)
     - `onScoreChanged((payload: ScoreEventPayload) => void)` (lines 166–168)

3. **`src/entities/Player.ts`**:
   - Ship state & geometry:
     - `x: number`, `y: number`, baseline Y = 250 (lines 75–76)
     - `state: PlayerStateType` ('normal' | 'capturing' | 'captured' | 'docking' | 'dual' | 'destroyed' | 'respawning') (line 81)
     - `lives: number` (line 82)
     - `isDual: boolean` (lines 163–173)
   - Active buff timers (lines 108–132, 384–428):
     - `rapidFireTimer: number` (duration up to 30.0s)
     - `scatterShotTimer: number` (duration up to 30.0s)
     - `engineBoosterTimer: number` (duration up to 30.0s)
     - `hasShield: boolean`, `shieldHp: number` (kinetic shield, 1 hit)
     - `chronoFieldTimer: number` (duration up to 20.0s, base 6.0s)
     - `hasReflectionShield: boolean`, `reflectionShieldTimer: number` (duration up to 30.0s, base 12.0s, hp: 3)
     - `empCollectorTimer: number` (duration up to 20.0s, base 5.0s)
     - `phaseDriveTimer: number` (duration up to 30.0s, base 15.0s)
     - `plasmaBlasterTimer: number` (duration up to 25.0s, base 7.0s)
     - `empBombCount: number` (stored tactical bomb charges)

4. **Power-Up Subsystem (`src/core/powerups/types.ts` & `PowerUpManager.ts`)**:
   - Registry configuration (`POWERUP_CONFIGS`, lines 119–220 in `types.ts`):
     - 10 distinct types: `RAPID_FIRE`, `KINETIC_SHIELD`, `SCATTER_SHOT`, `EMP_BOMB`, `ENGINE_BOOSTER`, `CHRONO_FIELD`, `REFLECTION_SHIELD`, `EMP_COLLECTOR`, `PHASE_DRIVE`, `ANTIMATTER_PLASMA`.
   - `PowerUpManager.buffState: ActiveBuffState`:
     - Holds active timers and boolean flags synchronized with `Player` in `PowerUpManager.update()` (lines 310–373 in `PowerUpManager.ts`).
     - Reset on stage clear / death via `powerUpManager.reset()` and `powerUpManager.onPlayerDeath()`.

5. **Special Moves Subsystem (`src/core/specials/types.ts` & `SpecialMovesManager.ts`)**:
   - Telemetry fields:
     - `energy`: `number` (0..100) (line 36)
     - `maxEnergy`: `number` (100) (line 37)
     - `isReady()`: `boolean` returns `energy >= maxEnergy && cooldownTimer <= 0 && !isActive` (lines 124–126)
     - `selectedMove`: `SpecialMoveType` (`NOVA_BARRAGE` | `CHRONO_FREEZE` | `WARP_RAM`) (line 42)
     - `isActive`: `boolean` (line 43)
     - `activeMove`: `SpecialMoveType | null` (line 44)
     - `activeTimer`: `number` (line 45)
     - `cooldownTimer`: `number` (line 38)
   - Interactive operations:
     - `trigger(move?)` / `triggerSpecial(move?)`: triggers active special move and spends gauge (lines 148–160)
     - `cycleSpecial()`: cycles between `NOVA_BARRAGE` -> `CHRONO_FREEZE` -> `WARP_RAM` (lines 128–144)

6. **Fullscreen & Audio Subsystems**:
   - `src/ui/FullscreenManager.ts`:
     - `isFullscreen(): boolean` (lines 160–173)
     - `toggleFullscreen(): Promise<boolean>` (lines 254–261)
     - `onChange(callback: FullscreenChangeCallback): () => void` (lines 266–277)
     - `bindToggleButton(button: HTMLElement): () => void` (lines 293–325)
   - `src/audio/AudioContextManager.ts` & `src/audio/AudioManager.ts`:
     - `getIsMuted(): boolean` (line 363 in `AudioContextManager.ts`)
     - `setMuted(muted: boolean): void` (lines 338–352)
     - `toggleMute(): boolean` (lines 358–361)

7. **Existing Test Suite Baseline**:
   - `npm test` executed across Vitest:
     - **98 passed test files**, **1,791 passed unit tests**, 0 failures.

---

## 2. Logic Chain

From these direct observations, we derive the structural and performance requirements for `BottomDashboard`:

### Step 1: Telemetry Data Completeness & Mapping
To satisfy Requirement R3 from `COLLABORATION.md` (score, high-score, lives, item status chips, special meter, utility buttons, controls guide), all necessary data points already exist within the engine:
- Score/HighScore/Lives: `Game.ts` -> `ScoreManager` (`score`, `highScore`, `lives`).
- High-Score Record Alert: `score > 20000 && score >= highScore`.
- Reserve Lives: in 1981 Galaga, reserve ships displayed are `Math.max(0, lives - 1)`.
- Active Items Status Rack: 9 duration/shield power-up types tracked in `PowerUpManager.buffState` with known baseline durations:
  1. `RAPID_FIRE`: duration 15.0s, palette `#FF7F00` / `#FFFF00`, label `"OVERCLOCK"`
  2. `KINETIC_SHIELD`: persistent until hit (`hasShield`), palette `#00FFFF` / `#5B93FF`, label `"SHIELD"`
  3. `SCATTER_SHOT`: duration 15.0s, palette `#00E700` / `#FFFFFF`, label `"SPREAD"`
  4. `ENGINE_BOOSTER`: duration 15.0s, palette `#5B93FF` / `#00FFFF`, label `"BOOSTER"`
  5. `CHRONO_FIELD`: duration 6.0s, palette `#00FFFF` / `#FFBF00`, label `"CHRONO"`
  6. `REFLECTION_SHIELD`: duration 12.0s, palette `#5B93FF` / `#00FFFF`, label `"REFLECT"`
  7. `EMP_COLLECTOR`: duration 5.0s, palette `#9900EE` / `#FF007F`, label `"COLLECTOR"`
  8. `PHASE_DRIVE`: duration 15.0s, palette `#FF007F` / `#00FFFF`, label `"PHASE"`
  9. `ANTIMATTER_PLASMA`: duration 7.0s, palette `#00E700` / `#FFFF00`, label `"PLASMA"`
- Special Moves Meter: `SpecialMovesManager` (`energy`, `isReady()`, `selectedMove`, `isActive`).
- Utilities: `AudioContextManager` (`isMuted`), `FullscreenManager` (`isFullscreen`), `Game` (`isPaused`).

### Step 2: Zero-GC Telemetry Contract (`DashboardState`)
At 60 FPS, allocating a new telemetry payload object and array of active items every frame results in 3,600 object allocations/second, leading to GC pressure and framerate stutters during heavy combat (e.g. Stage 50 Enrage or Crisis events).
**Resolution**:
- `Game.ts` creates and retains a single, pre-allocated `DashboardState` instance.
- `DashboardState.activePowerUps` is a fixed, pre-allocated array of 9 `ActivePowerUpTelemetry` slots.
- During `Game.update(dt)`, `Game.ts` mutates the primitive fields and slots **in-place** (Zero-GC).
- No new closures, arrays, or objects are allocated inside the 60 Hz tick!

### Step 3: Zero-Layout-Thrashing DOM Update Strategy (Dirty Checking)
Writing to DOM elements (`element.textContent = ...`, `style.width = ...`, `classList.toggle(...)`) 60 times/second causes browser style recalcs and layout thrashing.
**Resolution**:
- `BottomDashboard` maintains internal cache values of previous telemetry (`_lastScore`, `_lastHighScore`, `_lastLives`, `_lastSpecialCharge`, etc.).
- It checks `if (state.score !== this._lastScore)` before modifying the DOM.
- Progress bars are quantized to 0.5% steps or updated using CSS custom properties (`--progress`), allowing GPU-accelerated rendering.

### Step 4: Component Decoupling & Action Handlers
`BottomDashboard` must not directly mutate game subsystems; it must remain a pure UI component.
User interactions on utility buttons (Mute, Fullscreen, Pause) and Special Move interactions are communicated to `Game.ts` via clean callback hooks (`onToggleMute`, `onToggleFullscreen`, `onTogglePause`, `onTriggerSpecial`, `onCycleSpecial`).

---

## 3. API Contract Specifications

### 3.1 Telemetry Data Interfaces (`src/ui/types.ts` or `src/ui/BottomDashboard.ts`)

```typescript
import type { PowerUpType } from '../core/powerups/types';
import type { SpecialMoveType } from '../core/specials/types';

/**
 * Telemetry slot representing a single power-up upgrade item in the status rack.
 * Pre-allocated to guarantee Zero-GC during 60 FPS frame updates.
 */
export interface ActivePowerUpTelemetry {
  readonly type: PowerUpType;
  readonly id: string;
  readonly label: string;
  readonly maxDuration: number;
  readonly primaryColor: string;
  readonly accentColor: string;
  remainingTime: number;
  progress: number; // 0.0 to 1.0
  isActive: boolean;
  count?: number;   // e.g. shield HP (1..3) or charges
}

/**
 * Unified telemetry state snapshot delivered to BottomDashboard each frame.
 */
export interface DashboardState {
  // Score & Progression
  score: number;
  highScore: number;
  isNewHighScore: boolean;
  lives: number;         // Total lives (e.g. 3)
  reserveLives: number;  // Reserve ship count (Math.max(0, lives - 1))
  stage: number;         // Current stage number (1..50)

  // Active Power-Up Upgrades
  activePowerUps: readonly ActivePowerUpTelemetry[];
  activePowerUpCount: number;

  // Special Move System
  specialCharge: number; // 0..100 percentage
  specialReady: boolean; // isReady()
  specialActive: boolean; // isActive
  selectedSpecial: SpecialMoveType;

  // Quick Utilities State
  isMuted: boolean;
  isFullscreen: boolean;
  isPaused: boolean;
  canPause: boolean;
}
```

### 3.2 `BottomDashboard` Class API & Lifecycle Contract

```typescript
export interface BottomDashboardOptions {
  /** Target parent container in DOM. Defaults to '#app-container' or document.body */
  container?: HTMLElement | string | null;
  /** Action callbacks dispatched on user button interaction */
  onToggleMute?: () => void;
  onToggleFullscreen?: () => void;
  onTogglePause?: () => void;
  onTriggerSpecial?: () => void;
  onCycleSpecial?: () => void;
}

export class BottomDashboard {
  /** DOM root element (<div id="bottom-dashboard" class="bottom-dashboard">) */
  public element: HTMLElement | null;

  constructor(options?: BottomDashboardOptions);

  /** Mounts the component into DOM, constructs zones, and attaches click listeners */
  public init(container?: HTMLElement | string | null): boolean;

  /** 60 FPS Fixed-Timestep Telemetry Update with Zero-Allocation Dirty Checking */
  public update(state: Readonly<DashboardState>): void;

  /** Resets display back to initial idle/attract state */
  public reset(): void;

  /** Detaches event listeners and unmounts DOM nodes */
  public destroy(): void;

  /** Returns root container element */
  public getElement(): HTMLElement | null;
}
```

### 3.3 `Game.ts` Coordinator Integration Pattern

```typescript
export class Game implements IGameEngine {
  // ...
  public bottomDashboard: BottomDashboard;
  private _dashboardState: DashboardState;

  constructor(canvasElementOrId?: HTMLCanvasElement | string) {
    // ...
    // Pre-allocate fixed ActivePowerUpTelemetry slots (Zero-GC)
    const powerUpSlots: ActivePowerUpTelemetry[] = [
      { type: PowerUpType.RAPID_FIRE, id: 'rapid', label: 'OVERCLOCK', maxDuration: 15, primaryColor: '#FF7F00', accentColor: '#FFFF00', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.KINETIC_SHIELD, id: 'shield', label: 'SHIELD', maxDuration: 1, primaryColor: '#00FFFF', accentColor: '#5B93FF', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.SCATTER_SHOT, id: 'scatter', label: 'SPREAD', maxDuration: 15, primaryColor: '#00E700', accentColor: '#FFFFFF', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.ENGINE_BOOSTER, id: 'booster', label: 'BOOSTER', maxDuration: 15, primaryColor: '#5B93FF', accentColor: '#00FFFF', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.CHRONO_FIELD, id: 'chrono', label: 'CHRONO', maxDuration: 6, primaryColor: '#00FFFF', accentColor: '#FFBF00', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.REFLECTION_SHIELD, id: 'reflect', label: 'REFLECT', maxDuration: 12, primaryColor: '#5B93FF', accentColor: '#00FFFF', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.EMP_COLLECTOR, id: 'collector', label: 'COLLECTOR', maxDuration: 5, primaryColor: '#9900EE', accentColor: '#FF007F', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.PHASE_DRIVE, id: 'phase', label: 'PHASE', maxDuration: 15, primaryColor: '#FF007F', accentColor: '#00FFFF', remainingTime: 0, progress: 0, isActive: false },
      { type: PowerUpType.ANTIMATTER_PLASMA, id: 'plasma', label: 'PLASMA', maxDuration: 7, primaryColor: '#00E700', accentColor: '#FFFF00', remainingTime: 0, progress: 0, isActive: false },
    ];

    this._dashboardState = {
      score: 0,
      highScore: 20000,
      isNewHighScore: false,
      lives: 3,
      reserveLives: 2,
      stage: 1,
      activePowerUps: powerUpSlots,
      activePowerUpCount: 0,
      specialCharge: 0,
      specialReady: false,
      specialActive: false,
      selectedSpecial: SpecialMoveType.NOVA_BARRAGE,
      isMuted: false,
      isFullscreen: false,
      isPaused: false,
      canPause: false,
    };

    this.bottomDashboard = new BottomDashboard({
      container: typeof document !== 'undefined' ? document.getElementById('app-container') : null,
      onToggleMute: () => this.audioContextManager?.toggleMute(),
      onToggleFullscreen: () => this.fullscreenManager?.toggleFullscreen(),
      onTogglePause: () => this.togglePause(),
      onTriggerSpecial: () => this.specialMovesManager?.trigger(),
      onCycleSpecial: () => this.specialMovesManager?.cycleSpecial(),
    });
    // ...
  }

  public update(dt: number): void {
    // ... standard engine update ...
    this.updateDashboardTelemetry();
    this.bottomDashboard.update(this._dashboardState);
  }

  private updateDashboardTelemetry(): void {
    const s = this._dashboardState;
    s.score = this.scoreManager.score;
    s.highScore = this.scoreManager.highScore;
    s.isNewHighScore = s.score > 20000 && s.score >= s.highScore;
    s.lives = this.player ? this.player.lives : this.scoreManager.lives;
    s.reserveLives = Math.max(0, s.lives - 1);
    s.stage = this.scoreManager.stage;

    // Mutate power-up slots in-place
    const buffs = this.powerUpManager.buffState;
    let count = 0;
    const slots = s.activePowerUps as ActivePowerUpTelemetry[];

    // Rapid Fire
    slots[0].remainingTime = buffs.rapidFireTimer;
    slots[0].progress = Math.min(1.0, buffs.rapidFireTimer / 15.0);
    slots[0].isActive = buffs.rapidFireTimer > 0;
    if (slots[0].isActive) count++;

    // Kinetic Shield
    slots[1].isActive = buffs.hasShield || (this.player ? this.player.hasShield : false);
    slots[1].progress = slots[1].isActive ? 1.0 : 0.0;
    slots[1].remainingTime = slots[1].isActive ? 1 : 0;
    if (slots[1].isActive) count++;

    // Scatter Shot
    slots[2].remainingTime = buffs.scatterShotTimer;
    slots[2].progress = Math.min(1.0, buffs.scatterShotTimer / 15.0);
    slots[2].isActive = buffs.scatterShotTimer > 0;
    if (slots[2].isActive) count++;

    // Engine Booster
    slots[3].remainingTime = buffs.engineBoosterTimer;
    slots[3].progress = Math.min(1.0, buffs.engineBoosterTimer / 15.0);
    slots[3].isActive = buffs.engineBoosterTimer > 0;
    if (slots[3].isActive) count++;

    // Chrono Field
    slots[4].remainingTime = buffs.chronoFieldTimer;
    slots[4].progress = Math.min(1.0, buffs.chronoFieldTimer / 6.0);
    slots[4].isActive = buffs.chronoFieldTimer > 0;
    if (slots[4].isActive) count++;

    // Reflection Shield
    slots[5].remainingTime = buffs.reflectionShieldTimer;
    slots[5].progress = Math.min(1.0, buffs.reflectionShieldTimer / 12.0);
    slots[5].isActive = buffs.hasReflectionShield || (this.player ? this.player.hasReflectionShield : false) || buffs.reflectionShieldTimer > 0;
    slots[5].count = this.player ? this.player.reflectionShieldHp : 3;
    if (slots[5].isActive) count++;

    // EMP Collector
    slots[6].remainingTime = buffs.empCollectorTimer;
    slots[6].progress = Math.min(1.0, buffs.empCollectorTimer / 5.0);
    slots[6].isActive = buffs.empCollectorTimer > 0;
    if (slots[6].isActive) count++;

    // Phase Drive
    slots[7].remainingTime = buffs.phaseDriveTimer;
    slots[7].progress = Math.min(1.0, buffs.phaseDriveTimer / 15.0);
    slots[7].isActive = buffs.phaseDriveTimer > 0;
    if (slots[7].isActive) count++;

    // Antimatter Plasma
    slots[8].remainingTime = buffs.plasmaBlasterTimer;
    slots[8].progress = Math.min(1.0, buffs.plasmaBlasterTimer / 7.0);
    slots[8].isActive = buffs.plasmaBlasterTimer > 0;
    if (slots[8].isActive) count++;

    s.activePowerUpCount = count;

    // Special moves telemetry
    if (this.specialMovesManager) {
      s.specialCharge = (this.specialMovesManager.energy / this.specialMovesManager.maxEnergy) * 100;
      s.specialReady = this.specialMovesManager.isReady();
      s.specialActive = this.specialMovesManager.isActive;
      s.selectedSpecial = this.specialMovesManager.selectedMove;
    }

    // Utilities
    s.isMuted = this.audioContextManager ? this.audioContextManager.getIsMuted() : false;
    s.isFullscreen = this.fullscreenManager ? this.fullscreenManager.isFullscreen() : false;
    s.isPaused = this.state === 'PAUSED';
    s.canPause = this.state === 'PLAYING' || this.state === 'CHALLENGING_STAGE' || this.state === 'PAUSED';
  }

  public destroy(): void {
    // ...
    if (this.bottomDashboard) {
      this.bottomDashboard.destroy();
    }
    // ...
  }
```

---

## 4. Caveats

1. **Zero-DOM Headless Test Isolation**:
   - In Node.js / Vitest unit test environments without DOM (`typeof document === 'undefined'`), `BottomDashboard` must safely no-op during `init()`, `update()`, and `destroy()` without throwing errors.
2. **In-Canvas HUD Preservation**:
   - The in-canvas `HUD.ts` (canvas 224x288 pixel header and footer) remains intact for authentic arcade emulation. The `BottomDashboard` serves as the modernized companion bar docked beneath the canvas wrapper, providing rich real-time item countdowns, special move gauges, and accessible utility controls.
3. **Double-Tap / Gesture Coexistence with Virtual Touch Controls**:
   - On mobile viewports, the existing `#touch-controls` overlay can coordinate with `BottomDashboard` without overlapping buttons. The compact mode handles screen widths `< 480px` gracefully.

---

## 5. Conclusion

1. Game state and telemetry exposure across `ScoreManager`, `Player`, `PowerUpManager`, `SpecialMovesManager`, `FullscreenManager`, and `AudioContextManager` is completely mapped and verified.
2. The `DashboardState` data contract provides an airtight, 100% typed, Zero-GC telemetry pipeline.
3. `BottomDashboard` lifecycle (`init`, `update`, `reset`, `destroy`) cleanly decouples UI rendering from core game mechanics while providing immediate responsive user interaction via injected callbacks.
4. The system is ready for the Implementation Workers in Milestone M28.

---

## 6. Verification Method

Independent verification steps:
1. **Vitest Unit Test Suite Baseline**:
   ```bash
   npm test
   ```
   Must pass 100% across all 98 test files and 1,791 tests.
2. **Typecheck & Production Build**:
   ```bash
   npm run build
   ```
   Ensures zero TypeScript compilation warnings and Vite bundle generation.
3. **Telemetry Invariant Assertions**:
   - `DashboardState.activePowerUps.length === 9`
   - `DashboardState.score` matches `ScoreManager.score`
   - `DashboardState.specialCharge` equals `(SpecialMovesManager.energy / 100) * 100`
   - `BottomDashboard.destroy()` removes event listeners and unmounts cleanly without detached node leaks.
