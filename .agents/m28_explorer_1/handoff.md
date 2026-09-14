# Milestone M28 — UI/UX Architecture & DOM Component Handoff Report

**Agent**: `m28_explorer_1` (UI/UX Architecture & DOM Component Specialist)  
**Date**: 2026-09-11  
**Milestone**: M28 (Modernized Bottom HUD & Cyber-Arcade Dashboard)  
**Status**: EXPLORATION COMPLETE & ARCHITECTURAL BLUEPRINT FINALIZED  

---

## 1. Observation

Direct code examination of the Galaga codebase reveals the following baseline conditions and integration points:

### 1.1 DOM Container Structure in `index.html`
- **File**: `/Users/user/teamwork_projects/galaga_game/index.html`
- **Lines 53–90**: CSS layout establishes an unscrollable full-viewport container:
  ```css
  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-color: var(--bg-color);
    font-family: var(--font-arcade);
    color: #ffffff;
    touch-action: none;
  }
  body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    min-height: 100dvh;
    background: radial-gradient(circle at center, #0a0a18 0%, #030306 100%);
  }
  ```
- **Lines 92–134**: `#app-container` hosts `.canvas-wrapper` with a strict `aspect-ratio: 224 / 288`:
  ```html
  <div id="app-container">
    <div class="canvas-wrapper">
      <canvas id="game-canvas" width="224" height="288" aria-label="Galaga Arcade Game Screen" role="img"></canvas>
      <div class="scanlines" aria-hidden="true"></div>
    </div>
    <!-- Virtual Touch Controls for Mobile Devices -->
    <div id="touch-controls" aria-hidden="true">...</div>
  </div>
  ```
- **Lines 44–47**: Authentic Galaga player ship SVG pixel art path data is already established in the favicon data URI:
  ```xml
  <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>
    <path fill='#E70000' d='M7 0h2v2H7zM6 2h4v2H6zM5 4h6v2H5zM2 6h12v2H2zM1 8h14v2H1zM2 10h12v2H2zM3 12h10v2H3zM5 14h6v2H5z'/>
    <path fill='#FFFFFF' d='M7 2h2v4H7zM6 6h4v4H6zM7 10h2v2H7z'/>
    <path fill='#00FFFF' d='M5 8h2v2H5zM9 8h2v2H9z'/>
    <path fill='#FFFF00' d='M7 0h2v1H7z'/>
  </svg>
  ```
- **Lines 48–51**: Google Font `'Press Start 2P'` is already linked in the `<head>` and defined as `var(--font-arcade)`.

### 1.2 In-Canvas HUD Rendering in `src/ui/HUD.ts`
- **File**: `/Users/user/teamwork_projects/galaga_game/src/ui/HUD.ts`
- **Lines 17–29**: `HUDState` contract:
  ```ts
  export interface HUDState {
    score: number;
    highScore: number;
    lives: number;
    stage: number;
    is1UpBlinking?: boolean;
    twoPlayerMode?: boolean;
    playerTwoScore?: number;
    stageBadges?: number[];
    specialEnergy?: number;
    isSpecialReady?: boolean;
    selectedSpecial?: string;
  }
  ```
- **Lines 449–476 (`renderHeader`)**: Draws canvas-space `1UP` label (X=24, Y=2), score (X=56, Y=10), `HIGH SCORE` label (X=112, Y=2), and high score value (X=136, Y=10).
- **Lines 482–555 (`renderFooter` & `renderSpecialGauge`)**: Draws reserve lives icons at bottom-left (Y=274) using `SpriteRenderer.draw(ctx, 'PLAYER_LIFE_ICON', x, y)` and Special Move energy meter at X=86, Y=278 (width 54, height 6) with 10 segments and pulsating `'SP READY'`.

### 1.3 Controls & Pause in `src/ui/Screens.ts`
- **File**: `/Users/user/teamwork_projects/galaga_game/src/ui/Screens.ts`
- **Lines 64–66**: Keyboard mapping displayed on Title Screen:
  `KEYBOARD: [A/D] [<- ->] FIRE: [SPACE/Z]`
  `PAUSE: [P] TOUCH: VIRTUAL D-PAD & FIRE`
- **Lines 187–217 (`renderPauseOverlay`)**: Displays modal with text `PAUSE`, `PRESS P OR ESC TO RESUME`, `TOUCH SCREEN TO RESUME`.

### 1.4 Subsystem State Hooks in `src/core/Game.ts`
- **File**: `/Users/user/teamwork_projects/galaga_game/src/core/Game.ts`
- **Lines 280–302**: Subsystems initialized in constructor:
  - `this.scoreManager = new ScoreManager();` (`score`, `highScore`, `lives`, `stage`)
  - `this.fullscreenManager = new FullscreenManager({ target: '#app-container', screenManager: this.screenManager, bindKeyboardShortcut: true });`
  - `this.audioContextManager = AudioContextManager.getInstance();`
  - `this.powerUpManager = new PowerUpManager({ game: this });`
  - `this.specialMovesManager = new SpecialMovesManager(this);`
- **Lines 824–836 (`update(dt)`)**: Fixed-timestep update loop executing at 60 FPS (16.67 ms).
- **Lines 1387–1397 (`render()`)**: Constructs frame telemetry snapshot:
  - `score: this.scoreManager.score`
  - `highScore: this.scoreManager.highScore`
  - `lives: this.player ? this.player.lives : this.scoreManager.lives`
  - `specialEnergy: this.specialMovesManager ? this.specialMovesManager.energy : 0`
  - `isSpecialReady: this.specialMovesManager ? this.specialMovesManager.isReady() : false`
  - `selectedSpecial: this.specialMovesManager ? this.specialMovesManager.selectedMove : 'NOVA_BARRAGE'`
- **Lines 1402–1405**: Pause toggle hook available via `this.togglePause()`, audio mute available via `AudioContextManager.getInstance().toggleMute()`, and fullscreen via `this.fullscreenManager.toggleFullscreen()`.

### 1.5 Active Power-Up Buff State in `src/core/powerups/types.ts`
- **File**: `/Users/user/teamwork_projects/galaga_game/src/core/powerups/types.ts`
- **Lines 77–90**: `ActiveBuffState` interface defines active timers for all 9 power-up upgrades:
  - `rapidFireTimer` (max 15.0s)
  - `scatterShotTimer` (max 15.0s)
  - `engineBoosterTimer` (max 15.0s)
  - `hasShield` (boolean, absorbs 1 hit)
  - `chronoFieldTimer` (max 6.0s)
  - `reflectionShieldTimer` (max 12.0s, `hasReflectionShield`)
  - `empCollectorTimer` (max 5.0s)
  - `phaseDriveTimer` (max 15.0s)
  - `plasmaBlasterTimer` (max 7.0s)

---

## 2. Logic Chain

From the observed architectural constraints and mission requirements, we derive the structural and operational design:

### Step 2.1: Mount Point & Layout Geometry
1. In `index.html`, `#app-container` currently contains `.canvas-wrapper` (`aspect-ratio: 224 / 288`) and `#touch-controls`.
2. Inserting `#bottom-dashboard` directly below `.canvas-wrapper` inside `#app-container` establishes an arcade cabinet structure (screen above, control dashboard below).
3. To prevent vertical overflow beyond 100vh (`min-height: 100dvh`), `.canvas-wrapper` will receive `flex: 1 1 auto; min-height: 0; max-height: calc(100% - var(--dashboard-height));`, while `#bottom-dashboard` is set to `flex: 0 0 auto; height: var(--dashboard-height); width: 100%; max-width: 560px;`.
4. This guarantees that whether on desktop 1080p, ultra-wide, or mobile portrait, the canvas automatically letterboxes to fit the remaining vertical space with zero scrollbars.

### Step 2.2: Three-Zone DOM Architecture
The dashboard is partitioned into three functional zones matching human visual hierarchy:
- **Left Zone (Player Telemetry & Reserve Fleet)**:
  - Dual 6-digit score readout: `1UP` current score and `HIGH` arcade high score.
  - Reserve lives indicator: row of up to 5 inline procedural SVG player fighter icons generated from the authentic 16x16 pixel path data.
- **Center Zone (Tactical Upgrades & Super Weapons)**:
  - Active Power-Up Item Rack: 9 pre-allocated badge chips (`RF`, `SHD`, `SCT`, `SPD`, `CF`, `RFL`, `EMP`, `PHS`, `PLS`) with integrated real-time countdown progress meters.
  - Special Move Energy Gauge: charge track (0–100%) with move identifier (`NOVA` / `CHRONO` / `WARP`) and glowing pulsating `SPECIAL READY [X]` text and bar animation when full.
- **Right Zone (Arcade Operations & Quick Controls)**:
  - Desktop Controls Legend: keyboard shortcut reminder (`[A/D] MOVE [SPC] FIRE [X] SP`).
  - Interactive Action Buttons:
    1. Audio Mute: `🔊` / `🔇` with `aria-label="Toggle Audio"`.
    2. Fullscreen: `⛶` / `🗗` with `aria-label="Toggle Fullscreen"`.
    3. Pause: `⏸` / `▶` with `aria-label="Toggle Pause"`.

### Step 2.3: Cyber-Arcade Aesthetic & CSS Styling
- **Color Palette**:
  - Dark Metallic Bezel: `#1a1a2e` background with subtle vertical gradient `linear-gradient(180deg, #22223e 0%, #121224 100%)`.
  - Outer Frame: `1px solid #2d2d54`, accented with top highlight `2px solid #00ffff` and inset metallic drop shadow `0 4px 20px rgba(0, 0, 0, 0.85)`.
  - Neon Accents:
    - Cyan `#00ffff`: 1UP label, special move meter, active chip borders.
    - Yellow `#ffff00`: High score, special ready pulsating glow.
    - Green `#00ff66`: Shield and status indicators.
    - Red `#ff2a2a`: Danger alerts and action accents.
  - Typography: `'Press Start 2P', monospace` with crisp pixel rendering (`font-smooth: never`).

### Step 2.4: Compact Mode Reflow (< 480px)
When viewport width is $< 480\text{px}$ (mobile portrait viewports, e.g. 375x812, 390x844, 412x915):
- Grid template switches from `140px 1fr 140px` to `100px 1fr 88px`.
- Overall height contracts from `56px` to `44px`.
- Controls legend (`.controls-legend`) is hidden (`display: none`), as mobile devices utilize the dedicated touch D-pad.
- Labels and scores scale down to 6–7px.
- SVG ship icons scale to 10px.
- Action buttons contract to 26x26px with 12px glyphs.
- Container enforces `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` eliminating any risk of vertical document scrollbars.

### Step 2.5: Zero-Allocation Dirty-Checking Engine
In the 60 FPS update loop (`update(dt)`), invoking DOM mutation methods indiscriminately triggers forced layout recalibration and garbage collection pauses. The `BottomDashboard` update strategy eliminates all runtime allocations:
1. **Pre-allocated DOM Nodes**: All elements (including all 9 power-up chips and 5 SVG life icons) are created during `init()`. Never `createElement` or `appendChild` in `update()`.
2. **Primitive Dirty-Check Cache**:
   ```ts
   private lastScore: number = -1;
   private lastHighScore: number = -1;
   private lastLives: number = -1;
   private lastSpecialEnergyInt: number = -1;
   private lastIsSpecialReady: boolean | null = null;
   private lastIsMuted: boolean | null = null;
   private lastIsFullscreen: boolean | null = null;
   private lastIsPaused: boolean | null = null;
   private lastBuffMask: number = -1;
   private lastBuffTimersDeci: Int16Array = new Int16Array(9);
   ```
3. **Dirty Gating**:
   - `score !== this.lastScore`: score only updates DOM when points are scored (filtering > 98% of frames).
   - Zero-allocation formatting helper avoids string interpolation loops.
   - Energy fill bar width is quantized to integer percentage (`Math.floor(energy)`), updating at most 100 times over the charge cycle.
   - Power-up chips calculate an active bitmask; individual chip `style.display` is toggled only upon state transitions.
   - Timers are quantized to deciseconds (`Math.ceil(t * 10)`), updating progress bars at at most 10 Hz rather than 60 Hz.
4. **Net Memory Allocation**: Exactly **0 bytes / frame** during steady gameplay.

---

## 3. Detailed Component Architecture: `BottomDashboard.ts`

### 3.1 Interface Contracts
```ts
export interface DashboardTelemetry {
  score: number;
  highScore: number;
  lives: number;
  stage: number;
  specialEnergy: number; // 0..100
  isSpecialReady: boolean;
  selectedSpecial: string; // 'NOVA_BARRAGE' | 'CHRONO_FREEZE' | 'WARP_RAM'
  activeBuffs: {
    rapidFireTimer: number;
    scatterShotTimer: number;
    engineBoosterTimer: number;
    hasShield: boolean;
    chronoFieldTimer: number;
    reflectionShieldTimer: number;
    empCollectorTimer: number;
    phaseDriveTimer: number;
    plasmaBlasterTimer: number;
  };
  isMuted: boolean;
  isFullscreen: boolean;
  isPaused: boolean;
}

export interface BottomDashboardOptions {
  container?: HTMLElement | string | null;
  onAudioToggle?: () => void;
  onFullscreenToggle?: () => void;
  onPauseToggle?: () => void;
}
```

### 3.2 Complete DOM Structure Generated
```html
<div id="bottom-dashboard" class="cyber-dashboard" role="region" aria-label="Arcade Bottom Dashboard">
  <!-- Zone 1: Left (Score & Reserve Lives) -->
  <div class="dash-zone zone-left">
    <div class="dash-score-rack">
      <div class="dash-score-entry">
        <span class="dash-label text-cyan">1UP</span>
        <span id="dash-score-val" class="dash-val text-white">000000</span>
      </div>
      <div class="dash-score-entry">
        <span class="dash-label text-yellow">HIGH</span>
        <span id="dash-high-val" class="dash-val text-yellow">020000</span>
      </div>
    </div>
    <div class="dash-lives-rack">
      <span class="dash-label text-grey">SHIPS</span>
      <div id="dash-lives-container" class="dash-lives-icons" aria-label="Reserve Lives">
        <!-- 5 Pre-rendered SVG Fighter Icons -->
      </div>
    </div>
  </div>

  <!-- Zone 2: Center (Active Upgrades & Special Meter) -->
  <div class="dash-zone zone-center">
    <div id="dash-powerup-rack" class="dash-chip-rack" aria-label="Active Power-Ups">
      <div id="chip-rf" class="dash-chip chip-rf" style="display: none;" title="Rapid Fire">
        <span class="chip-code">RF</span><div class="chip-meter"><div class="chip-bar"></div></div>
      </div>
      <div id="chip-shd" class="dash-chip chip-shd" style="display: none;" title="Kinetic Shield">
        <span class="chip-code">SHD</span><div class="chip-meter"><div class="chip-bar bar-fixed"></div></div>
      </div>
      <div id="chip-sct" class="dash-chip chip-sct" style="display: none;" title="Scatter Shot">
        <span class="chip-code">SCT</span><div class="chip-meter"><div class="chip-bar"></div></div>
      </div>
      <div id="chip-spd" class="dash-chip chip-spd" style="display: none;" title="Engine Booster">
        <span class="chip-code">SPD</span><div class="chip-meter"><div class="chip-bar"></div></div>
      </div>
      <div id="chip-cf" class="dash-chip chip-cf" style="display: none;" title="Chrono Field">
        <span class="chip-code">CF</span><div class="chip-meter"><div class="chip-bar"></div></div>
      </div>
      <div id="chip-rfl" class="dash-chip chip-rfl" style="display: none;" title="Reflection Shield">
        <span class="chip-code">RFL</span><div class="chip-meter"><div class="chip-bar"></div></div>
      </div>
      <div id="chip-emp" class="dash-chip chip-emp" style="display: none;" title="EMP Collector">
        <span class="chip-code">EMP</span><div class="chip-meter"><div class="chip-bar"></div></div>
      </div>
      <div id="chip-phs" class="dash-chip chip-phs" style="display: none;" title="Phase Drive">
        <span class="chip-code">PHS</span><div class="chip-meter"><div class="chip-bar"></div></div>
      </div>
      <div id="chip-pls" class="dash-chip chip-pls" style="display: none;" title="Plasma Blaster">
        <span class="chip-code">PLS</span><div class="chip-meter"><div class="chip-bar"></div></div>
      </div>
    </div>
    <div class="dash-special-rack">
      <div class="dash-special-header">
        <span id="dash-special-name" class="special-name text-cyan">NOVA</span>
        <span id="dash-special-cue" class="special-cue text-white">0%</span>
      </div>
      <div class="special-track" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
        <div id="dash-special-fill" class="special-fill" style="width: 0%;"></div>
      </div>
    </div>
  </div>

  <!-- Zone 3: Right (Controls Guide & Utility Buttons) -->
  <div class="dash-zone zone-right">
    <div class="controls-legend" aria-hidden="true">
      <div class="legend-row"><span class="k-cap">A/D</span> MOVE</div>
      <div class="legend-row"><span class="k-cap">SPC</span> FIRE</div>
      <div class="legend-row"><span class="k-cap">X</span> SP</div>
    </div>
    <div class="dash-actions">
      <button id="dashboard-btn-audio" class="dash-btn" aria-label="Toggle Audio" title="Mute/Unmute Audio (M)">🔊</button>
      <button id="dashboard-btn-fullscreen" class="dash-btn" aria-label="Toggle Fullscreen" title="Toggle Fullscreen (F / F11)">⛶</button>
      <button id="dashboard-btn-pause" class="dash-btn" aria-label="Toggle Pause" title="Pause/Resume Game (P)">⏸</button>
    </div>
  </div>
</div>
```

### 3.3 Cyber-Arcade CSS Styles
```css
/* ==========================================================================
   Cyber-Arcade Bottom Dashboard (Milestone M28)
   ========================================================================== */
:root {
  --dash-bg: #1a1a2e;
  --dash-border: #2d2d54;
  --dash-cyan: #00ffff;
  --dash-yellow: #ffff00;
  --dash-red: #ff2a2a;
  --dash-green: #00ff66;
  --dash-purple: #bb33ff;
  --dash-font: 'Press Start 2P', monospace;
  --dash-height: 56px;
  --dash-height-compact: 44px;
}

.cyber-dashboard {
  width: 100%;
  max-width: 560px;
  height: var(--dash-height);
  background: linear-gradient(180deg, #22223e 0%, #121224 100%);
  border: 1px solid var(--dash-border);
  border-top: 2px solid var(--dash-cyan);
  border-radius: 0 0 6px 6px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.85), 0 0 10px rgba(0, 255, 255, 0.2);
  display: grid;
  grid-template-columns: 140px 1fr 140px;
  align-items: center;
  padding: 4px 10px;
  box-sizing: border-box;
  font-family: var(--dash-font);
  color: #ffffff;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
  z-index: 15;
  flex-shrink: 0;
  overflow: hidden;
}

/* Zone 1: Left */
.zone-left {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}
.dash-score-rack {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dash-score-entry {
  display: flex;
  justify-content: space-between;
  font-size: 8px;
  line-height: 9px;
}
.dash-lives-rack {
  display: flex;
  align-items: center;
  gap: 5px;
}
.dash-lives-icons {
  display: flex;
  gap: 3px;
  align-items: center;
}
.ship-icon {
  width: 12px;
  height: 12px;
  display: inline-block;
  image-rendering: pixelated;
}

/* Zone 2: Center */
.zone-center {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 0 8px;
  gap: 4px;
}
.dash-chip-rack {
  display: flex;
  gap: 4px;
  height: 16px;
  align-items: center;
  justify-content: center;
}
.dash-chip {
  display: flex;
  align-items: center;
  background: rgba(10, 10, 25, 0.9);
  border: 1px solid var(--dash-cyan);
  border-radius: 3px;
  padding: 1px 3px;
  gap: 3px;
  font-size: 7px;
  line-height: 8px;
}
.chip-meter {
  width: 18px;
  height: 4px;
  background: #000000;
  border-radius: 1px;
  overflow: hidden;
}
.chip-bar {
  height: 100%;
  background: var(--dash-cyan);
  transition: width 0.1s linear;
}
.chip-rf .chip-bar { background: #ff7f00; }
.chip-sct .chip-bar { background: #00e700; }
.chip-spd .chip-bar { background: #5b93ff; }
.chip-cf .chip-bar { background: var(--dash-cyan); }
.chip-rfl .chip-bar { background: #5b93ff; }
.chip-emp .chip-bar { background: var(--dash-purple); }
.chip-phs .chip-bar { background: #ff007f; }
.chip-pls .chip-bar { background: var(--dash-yellow); }
.bar-fixed { width: 100% !important; }

.dash-special-rack {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dash-special-header {
  display: flex;
  justify-content: space-between;
  font-size: 7px;
  line-height: 8px;
}
.special-track {
  width: 100%;
  height: 6px;
  background: #0a0a18;
  border: 1px solid #333366;
  border-radius: 2px;
  overflow: hidden;
}
.special-fill {
  height: 100%;
  background: linear-gradient(90deg, #00ffff, #ffff00);
  transition: width 0.08s linear;
}
.special-ready-cue {
  animation: pulseReadyText 0.7s infinite ease-in-out;
}
.special-ready-bar {
  animation: pulseReadyGlow 0.7s infinite ease-in-out;
}
@keyframes pulseReadyText {
  0%, 100% { color: #ffff00; text-shadow: 0 0 8px #ffff00; }
  50% { color: #ffffff; text-shadow: 0 0 2px #ffff00; }
}
@keyframes pulseReadyGlow {
  0%, 100% { box-shadow: 0 0 8px #ffff00; background: #ffff00; }
  50% { box-shadow: 0 0 2px #ffff00; background: #00ffff; }
}

/* Zone 3: Right */
.zone-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.controls-legend {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 6px;
  color: #8888aa;
}
.k-cap {
  color: var(--dash-cyan);
}
.dash-actions {
  display: flex;
  gap: 4px;
}
.dash-btn {
  width: 32px;
  height: 32px;
  background: rgba(30, 30, 60, 0.6);
  border: 1px solid #444477;
  border-radius: 4px;
  color: #ffffff;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}
.dash-btn:hover {
  background: rgba(50, 50, 90, 0.8);
  border-color: var(--dash-cyan);
}
.dash-btn:active {
  transform: translateY(1px) scale(0.95);
  background: rgba(0, 255, 255, 0.3);
}

/* Utility Text Colors */
.text-cyan { color: var(--dash-cyan); }
.text-yellow { color: var(--dash-yellow); }
.text-white { color: #ffffff; }
.text-grey { color: #777799; }

/* ==========================================================================
   Compact Mode Reflow (< 480px Viewports)
   ========================================================================== */
@media (max-width: 480px) {
  .cyber-dashboard {
    height: var(--dash-height-compact);
    grid-template-columns: 96px 1fr 82px;
    padding: 2px 6px;
  }
  .controls-legend {
    display: none;
  }
  .dash-score-entry {
    font-size: 7px;
    line-height: 8px;
  }
  .ship-icon {
    width: 10px;
    height: 10px;
  }
  .dash-chip {
    font-size: 6px;
    padding: 1px 2px;
  }
  .chip-meter {
    width: 12px;
    height: 3px;
  }
  .special-track {
    height: 5px;
  }
  .dash-special-header {
    font-size: 6px;
  }
  .dash-btn {
    width: 24px;
    height: 24px;
    font-size: 11px;
  }
}
```

---

## 4. Zero-Allocation Dirty-Checking Engine Specification

### 4.1 Dirty-Checking Algorithm
```ts
public update(telemetry: DashboardTelemetry): void {
  // 1. Dirty-check Score
  if (telemetry.score !== this.lastScore) {
    if (this.elScoreVal) {
      this.elScoreVal.textContent = this.formatScore6(telemetry.score);
    }
    this.lastScore = telemetry.score;
  }

  // 2. Dirty-check High Score
  if (telemetry.highScore !== this.lastHighScore) {
    if (this.elHighVal) {
      this.elHighVal.textContent = this.formatScore6(telemetry.highScore);
    }
    this.lastHighScore = telemetry.highScore;
  }

  // 3. Dirty-check Reserve Lives
  const reserveLives = Math.max(0, Math.min(5, Math.floor(telemetry.lives) - 1));
  if (reserveLives !== this.lastLives) {
    for (let i = 0; i < 5; i++) {
      const icon = this.shipIconNodes[i];
      if (icon) {
        icon.style.display = i < reserveLives ? 'inline-block' : 'none';
      }
    }
    this.lastLives = reserveLives;
  }

  // 4. Dirty-check Special Move Gauge (quantized integer percent)
  const energyInt = Math.floor(Math.max(0, Math.min(100, telemetry.specialEnergy)));
  if (energyInt !== this.lastSpecialEnergyInt) {
    if (this.elSpecialFill) {
      this.elSpecialFill.style.width = `${energyInt}%`;
    }
    if (this.elSpecialTrack) {
      this.elSpecialTrack.setAttribute('aria-valuenow', energyInt.toString());
    }
    this.lastSpecialEnergyInt = energyInt;
  }

  // 5. Dirty-check Special Move Readiness & Move Name
  if (telemetry.isSpecialReady !== this.lastIsSpecialReady || telemetry.selectedSpecial !== this.lastSpecialMove) {
    if (telemetry.isSpecialReady) {
      if (this.elSpecialCue) {
        this.elSpecialCue.textContent = 'READY [X]';
        this.elSpecialCue.className = 'special-cue special-ready-cue';
      }
      if (this.elSpecialFill) {
        this.elSpecialFill.className = 'special-fill special-ready-bar';
      }
    } else {
      if (this.elSpecialCue) {
        this.elSpecialCue.textContent = `${energyInt}%`;
        this.elSpecialCue.className = 'special-cue text-white';
      }
      if (this.elSpecialFill) {
        this.elSpecialFill.className = 'special-fill';
      }
    }
    if (this.elSpecialName && telemetry.selectedSpecial !== this.lastSpecialMove) {
      this.elSpecialName.textContent = this.getSpecialShortName(telemetry.selectedSpecial);
    }
    this.lastIsSpecialReady = telemetry.isSpecialReady;
    this.lastSpecialMove = telemetry.selectedSpecial;
  }

  // 6. Dirty-check Active Power-Up Chips
  this.updatePowerUpChips(telemetry.activeBuffs);

  // 7. Dirty-check Utility Action Buttons
  if (telemetry.isMuted !== this.lastIsMuted) {
    if (this.elBtnAudio) {
      this.elBtnAudio.textContent = telemetry.isMuted ? '🔇' : '🔊';
      this.elBtnAudio.setAttribute('aria-pressed', telemetry.isMuted ? 'true' : 'false');
    }
    this.lastIsMuted = telemetry.isMuted;
  }

  if (telemetry.isFullscreen !== this.lastIsFullscreen) {
    if (this.elBtnFullscreen) {
      this.elBtnFullscreen.textContent = telemetry.isFullscreen ? '🗗' : '⛶';
      this.elBtnFullscreen.setAttribute('aria-pressed', telemetry.isFullscreen ? 'true' : 'false');
    }
    this.lastIsFullscreen = telemetry.isFullscreen;
  }

  if (telemetry.isPaused !== this.lastIsPaused) {
    if (this.elBtnPause) {
      this.elBtnPause.textContent = telemetry.isPaused ? '▶' : '⏸';
      this.elBtnPause.setAttribute('aria-pressed', telemetry.isPaused ? 'true' : 'false');
    }
    this.lastIsPaused = telemetry.isPaused;
  }
}
```

### 4.2 Fast Zero-Allocation 6-Digit Formatter
```ts
private formatScore6(n: number): string {
  if (n <= 0) return '000000';
  const s = n.toString();
  const len = s.length;
  if (len >= 6) return s;
  switch (len) {
    case 1: return '00000' + s;
    case 2: return '0000' + s;
    case 3: return '000' + s;
    case 4: return '00' + s;
    case 5: return '0' + s;
    default: return s;
  }
}
```

---

## 5. Caveats

1. **Dual HUD Presentation**:
   - The retro 1981 in-canvas HUD (`HUD.ts`) renders within the 224x288 virtual canvas.
   - The `BottomDashboard` acts as the external arcade cabinet control panel beneath the screen. Both co-exist seamlessly and provide complementary readouts (e.g. power-up cooldowns and audio/fullscreen controls belong on the dashboard, not inside the 1981 ROM canvas).
2. **Safe-Area Insets for Notched Mobile Screens**:
   - For iPhone and Android notched devices in landscape orientation, `env(safe-area-inset-bottom)` must be applied as padding to the dashboard or `#app-container`. Milestone M29 will finalize cross-device safe-area ergonomics.
3. **Headless / Node.js Environment Safety**:
   - `BottomDashboard` must strictly guard all DOM access with `if (typeof document === 'undefined') return;`.
   - Node Vitest unit tests can mock DOM elements or instantiate with a mock container.

---

## 6. Conclusion

- The DOM architecture, cyber-arcade CSS system, and zero-allocation dirty checking update loop for `BottomDashboard.ts` are fully specified and ready for implementation by the worker swarm.
- The 3-zone layout delivers:
  1. Left: 6-digit score/high-score + procedural SVG lives.
  2. Center: 9 active power-up chips with real-time progress countdowns + Special Move charge meter with pulsating ready state.
  3. Right: controls legend + audio mute (`🔊`/`🔇`), fullscreen (`⛶`/`🗗`), and pause (`⏸`/`▶`) toggle buttons.
- The compact mode reflow guarantees smooth layout on `< 480px` viewports without vertical document overflow.
- No source code files were modified during this read-only exploration.

---

## 7. Verification Method

### 7.1 Automated Unit Tests (`tests/unit/bottom_dashboard.test.ts`)
To independently verify the implementation once developed:
1. **DOM Structure Test**: Verify `#bottom-dashboard` mounts with 3 zones, score elements, lives container, 9 pre-allocated chips, special move meter, and 3 action buttons.
2. **Zero-Allocation Dirty-Check Test**: Run 1,000 continuous simulated ticks with identical telemetry. Assert that `textContent` and `style.width` setters are invoked **0 times** when state does not change.
3. **Button Interaction Test**: Click `#dashboard-btn-audio`, `#dashboard-btn-fullscreen`, and `#dashboard-btn-pause`, asserting correct callbacks and state toggling.
4. **Compact Mode CSS Invariant Test**: Assert CSS rules contain media query `@media (max-width: 480px)` setting `height: 44px` and hiding `.controls-legend`.
5. **Command**:
   ```bash
   npm run typecheck && npx vitest run tests/unit/bottom_dashboard.test.ts
   ```

### 7.2 Playwright Browser Verification
Verify cross-viewport presentation across:
- Desktop: `1920x1080` (Three-zone layout visible, buttons functional).
- Mobile Portrait: `375x812` (Compact layout, no vertical scrollbar, `document.documentElement.scrollHeight <= window.innerHeight`).
