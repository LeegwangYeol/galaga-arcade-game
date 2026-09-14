# Milestone M34: DOM Architecture & Symmetrical 3-Zone Layout Investigation Report

## 1. Observation

### 1.1 Existing DOM Hierarchy & Mounting
From `src/ui/BottomDashboard.ts` (lines 177–236) and `index.html` (lines 784–805):
- **Container Mounting**:
  - `index.html:791`:
    ```html
    <div id="bottom-dashboard" class="bottom-dashboard" role="region" aria-label="Arcade Bottom Dashboard"></div>
    ```
  - `BottomDashboard.init()` (`src/ui/BottomDashboard.ts:202–227`): Adopts the existing `#bottom-dashboard` element from `#app-container` or creates it if missing. Sets `className = 'bottom-dashboard cyber-dashboard'`.
- **Current Zone Construction** (`src/ui/BottomDashboard.ts:229–232, 354–547`):
  - **Zone 1 (Left)** (`.dash-zone.zone-left.dashboard-zone-left`):
    - `.dash-score-rack`:
      - 1UP entry: `<span class="dash-label text-cyan">1UP</span>` + `<span id="dashboard-score" class="dash-val text-white dashboard-score">000000</span>`
      - HIGH entry: `<span class="dash-label text-yellow">HIGH</span>` + `<span id="dashboard-high-score" class="dash-val text-yellow dashboard-high-score">020000</span>`
    - `.dash-lives-rack`:
      - `<span class="dash-label text-grey">SHIPS</span>` + `<div id="dashboard-lives" class="dash-lives-icons dashboard-lives">`
      - Pre-allocated pool of 5 procedural SVG icons (`.ship-icon.ship-life-icon`).
  - **Zone 2 (Center)** (`.dash-zone.zone-center.dashboard-zone-center`):
    - `<div id="dashboard-powerups" class="dash-chip-rack dashboard-powerups">` containing pre-allocated `.powerup-chip.dash-chip` elements with `.chip-meter` and `.chip-bar.powerup-progress-bar`.
    - `<div class="dash-special-rack dashboard-special-container">`:
      - `.dash-special-header`: `<span class="special-name text-cyan">SP</span>` + `<span class="special-cue text-white">0%</span>`
      - `.special-track` with `<div class="special-fill special-charge-bar">`
  - **Zone 3 (Right)** (`.dash-zone.zone-right.dashboard-zone-right`):
    - `<div class="controls-legend" aria-hidden="true">`: 3 rows ("A/D MOVE", "SPC FIRE", "X SP").
    - `.dash-actions`: 3 action buttons (`#btn-dash-mute`, `#btn-dash-fullscreen`, `#btn-dash-pause`).

### 1.2 Existing CSS Rules
From `index.html` (lines 280–319):
```css
.bottom-dashboard, .cyber-dashboard {
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
  touch-action: manipulation;
  z-index: 15;
  flex-shrink: 0;
  overflow: hidden;
}
.bottom-dashboard.compact-mode, .cyber-dashboard.compact-mode {
  height: var(--dash-height-compact);
  grid-template-columns: 96px 1fr 82px;
  padding: 2px 6px;
}
```

### 1.3 Subsystem Integration & Contracts
- **Game Engine** (`src/core/Game.ts:483–493, 832–836, 1855–1972`):
  - In `Game.update(dt)`, `this.updateDashboardTelemetry()` populates `this._dashboardState`, followed by `this.bottomDashboard.update(this._dashboardState)`.
- **PlayerManager** (`src/systems/PlayerManager.ts:74–120`):
  - `isCoop(): boolean` differentiates mode `'single'` vs `'coop'`.
  - `getPlayer('p1')` returns P1 `Player` instance (classic cyan/white).
  - `getPlayer('p2')` returns P2 `Player` instance (crimson/amber) in co-op mode.
  - `canDonateLife(donorId)` / `donateLife(donorId)` manages cooperative life-sharing.
- **ScoreManager** (`src/systems/ScoreManager.ts:176–216`):
  - `getScore('p1')` / `getScore('p2')` returns independent scores.
  - `getLives('p1')` / `getLives('p2')` returns independent lives.
  - `highScore` returns global high score.

### 1.4 Test Suite Assertions on Dashboard
- `tests/unit/bottom_dashboard.test.ts` asserts:
  - Root element has class `.bottom-dashboard`
  - Elements exist by ID/class: `#dashboard-score`, `#dashboard-high-score`, `#dashboard-lives`, `.ship-life-icon`, `#dashboard-powerups`, `.powerup-chip`, `.dashboard-special-container`, `.special-charge-bar`, `.special-cue`, `#btn-dash-mute`, `#btn-dash-fullscreen`, `#btn-dash-pause`, `.compact-mode`, `.controls-legend`.
- `tests/e2e/desktop_chromium.spec.ts:170–210` asserts:
  - `#bottom-dashboard` is attached and visible.
  - `#dashboard-score` matches `/^\d{6}$/`.
  - `#dashboard-high-score` matches `/^\d{6}$/`.
  - `#dashboard-lives .ship-icon` count >= 1.
  - Geometric docking sits directly beneath `.canvas-wrapper`.

---

## 2. Logic Chain

1. **Premise**: In Single-Player mode (`isCoop = false`), existing automated test suites (104 Vitest files and 120 Playwright tests) rely strictly on the existing DOM element IDs, CSS classes, and spatial layout of `#bottom-dashboard`.
2. **Inference**: Replacing or deleting existing single-player DOM elements would break existing tests (`tests/unit/bottom_dashboard.test.ts` and `tests/e2e/desktop_chromium.spec.ts`).
3. **Design Decision (Hybrid Mode Structure)**:
   - Rather than destroying and recreating the DOM tree when toggling between single-player and co-op, `#bottom-dashboard` must support dual layout states managed by a root modifier class: `.mode-single` (default) vs `.mode-coop`.
   - In Single-Player mode (`.mode-single` / `:not(.mode-coop)`):
     - Grid layout remains `grid-template-columns: 140px 1fr 140px;` (or `96px 1fr 82px` in compact mode).
     - Single-player specific racks (classic Zone 1 score/high/lives rack, Zone 2 powerup/special rack, Zone 3 controls legend) are visible (`.single-only`).
     - Co-op specific elements (`.coop-only`) are hidden (`display: none !important;`).
   - In Co-op mode (`.mode-coop`):
     - Grid layout transitions to symmetrical 3-zone layout: `grid-template-columns: minmax(130px, 1fr) minmax(170px, 1.3fr) minmax(130px, 1fr);` with `max-width: 620px;`.
     - Single-player specific elements (`.single-only`) are hidden (`display: none !important;`).
     - Co-op specific elements (`.coop-only`) are displayed.
4. **Symmetrical 3-Zone Architecture**:
   - **Zone 1 (Left): Player 1 HUD**:
     - Player 1 Header: `<span class="badge-p1">1P</span>` in yellow/cyan (`#ffff00` on `#00ffff`).
     - Player 1 Score: `#dashboard-score` (or `#dashboard-p1-score`), formatted to 6 zero-padded digits.
     - Player 1 Lives: `#dashboard-lives` (or `#dashboard-p1-lives`), rendering cyan/white SVG ship icons (0–5).
     - Player 1 Special Gauge: `.p1-special-rack` with cyan/yellow gradient fill, displaying charging percent or `READY [X]`.
     - Player 1 Combo / Power-Up Tag: `<span class="combo-badge p1-combo">1X</span>`.
     - Player 1 Revive Countdown: `.p1-revive-alert` ("REVIVE: 10S", "[L] DONATE LIFE") when in `revive_pending`.
   - **Zone 2 (Center): Shared Telemetry & Tactical Controls**:
     - Co-op Stage Indicator: `<span class="coop-stage-badge">STAGE 01</span>`.
     - Shared High Score: `#dashboard-high-score` (or `#dashboard-coop-high-score`), flashing on new high score.
     - Active Crisis / Boss Warning: `#dashboard-warning` (e.g. `⚠️ CRISIS: UNBIDDEN` or `⚠️ BOSS DETECTED`).
     - Controls Quick Prompt: `<div class="center-controls-prompt"><span class="text-cyan">P1: WASD+SPC</span> | <span class="text-magenta">P2: ARW+ENT</span></div>`.
     - Tactical Utility Buttons: `#btn-dash-mute` (🔊), `#btn-dash-fullscreen` (⛶), `#btn-dash-pause` (⏸).
   - **Zone 3 (Right): Player 2 HUD (Symmetrically Mirrored)**:
     - Player 2 Header: `<span class="badge-p2">2P</span>` in yellow/magenta (`#ffff00` on `#ff00aa`).
     - Player 2 Score: `#dashboard-p2-score`, formatted to 6 zero-padded digits.
     - Player 2 Lives: `#dashboard-p2-lives`, rendering crimson/gold SVG ship icons (0–5).
     - Player 2 Special Gauge: `.p2-special-rack` with magenta/yellow gradient fill, displaying charging percent or `READY [M]` / `READY [ENT]`.
     - Player 2 Combo / Power-Up Tag: `<span class="combo-badge p2-combo">1X</span>`.
     - Player 2 Revive Countdown: `.p2-revive-alert` ("REVIVE: 10S", "[L] DONATE LIFE") when in `revive_pending`.
5. **Zero External Assets Guarantee**:
   - P1 ship icon: Inline SVG `<path>` (White hull, Cyan wings `#00FFFF`, Red tip, Yellow nose).
   - P2 ship icon: Inline SVG `<path>` (Crimson hull `#FF0055`, Amber/Gold wings `#FFB700`, Dark Red body `#880022`, Yellow nose).
   - Button icons: Pure Unicode characters (`🔊`, `🔇`, `⛶`, `🗗`, `⏸`, `▶`, `⚠️`).
   - Fonts & Styling: 100% CSS3 (`Press Start 2P`, flexbox, grid, linear-gradient, keyframe animations).
   - Absolute 0 external media files (`.png`, `.jpg`, `.svg`, `.mp3`).

---

## 3. Caveats

1. **Single-Player Test Regression Hazard**:
   - If `#dashboard-high-score` is moved exclusively into a co-op-only container, tests expecting it in single player will fail.
   - *Mitigation*: In Single-Player mode, `#dashboard-high-score` remains in Zone 1. In Co-op mode, `#dashboard-high-score` is either placed in Zone 2 or aliased so both `#dashboard-high-score` and `#dashboard-coop-high-score` stay synchronized.
2. **Special Gauge Class Naming**:
   - Existing tests search for `.dashboard-special-container`, `.special-charge-bar`, and `.special-cue`.
   - *Mitigation*: Keep `.dashboard-special-container` in Zone 2 for single player, and also add `.dashboard-special-container` / `.special-charge-bar` / `.special-cue` to P1's special gauge in Zone 1, ensuring all query selectors resolve cleanly regardless of mode.
3. **Mobile Screen Width Constraint**:
   - On viewports < 480px, a 3-zone grid can feel compact.
   - *Mitigation*: In compact mode (`.compact-mode`), abbreviations are used (`1P`, `2P`, `STG`, `HI`), and the controls reminder is hidden via `.hidden-compact` to ensure zero horizontal scrollbars.

---

## 4. Conclusion & Concrete Architectural Specifications

### 4.1 Recommended DOM Hierarchy
```html
<div id="bottom-dashboard" class="bottom-dashboard cyber-dashboard mode-single" role="region" aria-label="Arcade Bottom Dashboard">
  <!-- ZONE 1: LEFT -->
  <div class="dash-zone zone-left dashboard-zone-left">
    <!-- Single-Player View -->
    <div class="dash-score-rack single-only">
      <div class="dash-score-entry">
        <span class="dash-label text-cyan">1UP</span>
        <span id="dashboard-score" class="dash-val text-white dashboard-score">000000</span>
      </div>
      <div class="dash-score-entry">
        <span class="dash-label text-yellow">HIGH</span>
        <span id="dashboard-high-score" class="dash-val text-yellow dashboard-high-score">020000</span>
      </div>
    </div>
    <div class="dash-lives-rack single-only">
      <span class="dash-label text-grey">SHIPS</span>
      <div id="dashboard-lives" class="dash-lives-icons dashboard-lives" aria-label="Reserve Lives"></div>
    </div>

    <!-- Co-op Player 1 View -->
    <div class="p1-hud-container coop-only">
      <div class="p1-header-row">
        <span class="badge-player badge-p1">1P</span>
        <span id="dashboard-p1-score" class="p1-score-val text-white">000000</span>
        <span class="combo-badge p1-combo" id="dashboard-p1-combo">1X</span>
      </div>
      <div class="p1-stats-row">
        <div class="p1-lives-icons" id="dashboard-p1-lives"></div>
        <div class="p1-revive-alert" id="dashboard-p1-revive" style="display: none;"></div>
      </div>
      <div class="p1-special-rack dashboard-special-container" id="dashboard-p1-special">
        <div class="dash-special-header">
          <span class="special-name text-cyan">SP</span>
          <span class="special-cue text-white" id="p1-special-cue">0%</span>
        </div>
        <div class="special-track" role="progressbar" aria-valuenow="0">
          <div class="special-fill special-charge-bar p1-fill" style="width: 0%;"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- ZONE 2: CENTER -->
  <div class="dash-zone zone-center dashboard-zone-center">
    <!-- Single-Player View -->
    <div id="dashboard-powerups" class="dash-chip-rack dashboard-powerups single-only" aria-label="Active Power-Ups"></div>
    <div class="dash-special-rack dashboard-special-container single-only" id="dashboard-single-special">
      <div class="dash-special-header">
        <span class="special-name text-cyan">SP</span>
        <span class="special-cue text-white" id="single-special-cue">0%</span>
      </div>
      <div class="special-track" role="progressbar" aria-valuenow="0">
        <div class="special-fill special-charge-bar" style="width: 0%;"></div>
      </div>
    </div>

    <!-- Co-op Center Telemetry & Shared Controls View -->
    <div class="coop-center-telemetry coop-only">
      <div class="center-top-row">
        <span class="coop-stage-badge text-cyan" id="dashboard-stage-badge">STAGE 01</span>
        <div class="coop-high-entry">
          <span class="dash-label text-yellow">HIGH</span>
          <span class="dash-val text-yellow" id="dashboard-coop-high-score">020000</span>
        </div>
      </div>
      <div class="center-warning-banner" id="dashboard-warning" style="display: none;">
        <span class="warning-text">⚠️ CRISIS</span>
      </div>
      <div class="center-controls-prompt">
        <span class="prompt-p1 text-cyan">P1:WASD+SPC</span><span class="prompt-sep">|</span><span class="prompt-p2 text-magenta">P2:ARW+ENT</span>
      </div>
      <div class="coop-actions-row">
        <!-- Buttons shared across modes -->
      </div>
    </div>
  </div>

  <!-- ZONE 3: RIGHT -->
  <div class="dash-zone zone-right dashboard-zone-right">
    <!-- Single-Player View -->
    <div class="controls-legend single-only" aria-hidden="true">
      <div class="legend-row"><span class="k-cap">A/D</span> MOVE</div>
      <div class="legend-row"><span class="k-cap">SPC</span> FIRE</div>
      <div class="legend-row"><span class="k-cap">X</span> SP</div>
    </div>

    <!-- Co-op Player 2 View (Symmetrically Mirrored) -->
    <div class="p2-hud-container coop-only">
      <div class="p2-header-row">
        <span class="badge-player badge-p2">2P</span>
        <span id="dashboard-p2-score" class="p2-score-val text-white">000000</span>
        <span class="combo-badge p2-combo" id="dashboard-p2-combo">1X</span>
      </div>
      <div class="p2-stats-row">
        <div class="p2-lives-icons" id="dashboard-p2-lives"></div>
        <div class="p2-revive-alert" id="dashboard-p2-revive" style="display: none;"></div>
      </div>
      <div class="p2-special-rack dashboard-special-container" id="dashboard-p2-special">
        <div class="dash-special-header">
          <span class="special-name text-magenta">SP</span>
          <span class="special-cue text-white" id="p2-special-cue">0%</span>
        </div>
        <div class="special-track" role="progressbar" aria-valuenow="0">
          <div class="special-fill special-charge-bar p2-fill" style="width: 0%;"></div>
        </div>
      </div>
    </div>

    <!-- Tactical Action Buttons (Attached in Zone 3 in single-player, or Zone 2 in co-op) -->
    <div class="dash-actions">
      <button id="btn-dash-mute" class="dash-btn btn-dash-mute" aria-label="Mute Audio" title="Mute/Unmute Audio (M)">🔊</button>
      <button id="btn-dash-fullscreen" class="dash-btn btn-dash-fullscreen" aria-label="Toggle Fullscreen" title="Toggle Fullscreen (F / F11)">⛶</button>
      <button id="btn-dash-pause" class="dash-btn btn-dash-pause" aria-label="Pause Game" title="Pause/Resume Game (P)">⏸</button>
    </div>
  </div>
</div>
```

### 4.2 Recommended CSS Grid & Theming Specifications
```css
/* Mode-dependent Grid Layout */
.bottom-dashboard.mode-single,
.bottom-dashboard:not(.mode-coop) {
  grid-template-columns: 140px 1fr 140px;
}
.bottom-dashboard.mode-coop {
  grid-template-columns: minmax(130px, 1fr) minmax(170px, 1.2fr) minmax(130px, 1fr);
  max-width: 620px;
  border-top: 2px solid #ffff00;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.85), 0 0 12px rgba(255, 255, 0, 0.25);
}

/* Visibility Switching */
.bottom-dashboard:not(.mode-coop) .coop-only {
  display: none !important;
}
.bottom-dashboard.mode-coop .single-only {
  display: none !important;
}

/* P1 Theming (Cyan & Yellow) */
.badge-p1 {
  background: rgba(0, 255, 255, 0.2);
  border: 1px solid #00ffff;
  color: #ffff00;
  font-size: 7px;
  padding: 1px 4px;
  border-radius: 2px;
  font-weight: bold;
  text-shadow: 0 0 4px #ffff00;
}
.p1-fill {
  background: linear-gradient(90deg, #00ffff, #ffff00);
}
.p1-combo {
  font-size: 6px;
  color: #00ffff;
  background: rgba(0, 255, 255, 0.15);
  padding: 0 3px;
  border-radius: 2px;
}

/* P2 Theming (Magenta/Crimson & Amber) */
.badge-p2 {
  background: rgba(255, 0, 127, 0.2);
  border: 1px solid #ff007f;
  color: #ffff00;
  font-size: 7px;
  padding: 1px 4px;
  border-radius: 2px;
  font-weight: bold;
  text-shadow: 0 0 4px #ffff00;
}
.p2-fill {
  background: linear-gradient(90deg, #ff007f, #ffff00);
}
.p2-combo {
  font-size: 6px;
  color: #ff007f;
  background: rgba(255, 0, 127, 0.15);
  padding: 0 3px;
  border-radius: 2px;
}

/* Center Telemetry */
.coop-center-telemetry {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-align: center;
  padding: 0 4px;
}
.center-top-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 7px;
}
.center-controls-prompt {
  font-size: 6px;
  color: #aaaaaa;
  white-space: nowrap;
}
.prompt-sep {
  margin: 0 3px;
  color: #555577;
}
.prompt-p1 {
  color: #00ffff;
}
.prompt-p2 {
  color: #ff00aa;
}
.center-warning-banner {
  font-size: 6px;
  color: #ff2a2a;
  animation: pulseWarning 0.8s infinite ease-in-out;
}
@keyframes pulseWarning {
  0%, 100% { opacity: 1; text-shadow: 0 0 6px #ff2a2a; }
  50% { opacity: 0.4; text-shadow: none; }
}

/* Revive Alerts */
.p1-revive-alert, .p2-revive-alert {
  font-size: 6px;
  color: #ffff00;
  animation: pulseRevive 0.6s infinite ease-in-out;
}
@keyframes pulseRevive {
  0%, 100% { color: #ffff00; text-shadow: 0 0 6px #ffff00; }
  50% { color: #ff2a2a; text-shadow: 0 0 3px #ff2a2a; }
}
```

### 4.3 Procedural SVG Ship Factory
```typescript
private createShipIcon(scheme: 'classic' | 'crimson' = 'classic'): HTMLElement {
  let icon: HTMLElement;
  if (document.createElementNS) {
    icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as HTMLElement;
  } else {
    icon = document.createElement('div');
  }
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('width', '12');
  icon.setAttribute('height', '12');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('class', `ship-icon ship-life-icon ${scheme === 'crimson' ? 'p2-ship-icon' : 'p1-ship-icon'}`);

  if (scheme === 'crimson') {
    // P2 Crimson/Amber Ship
    icon.innerHTML =
      '<path fill="#FF0055" d="M7 0h2v2H7zM6 2h4v2H6zM5 4h6v2H5zM2 6h12v2H2zM1 8h14v2H1zM2 10h12v2H2zM3 12h10v2H3zM5 14h6v2H5z"/>' +
      '<path fill="#FFB700" d="M7 2h2v4H7zM6 6h4v4H6zM7 10h2v2H7z"/>' +
      '<path fill="#FF00AA" d="M5 8h2v2H5zM9 8h2v2H9z"/>' +
      '<path fill="#FFFF00" d="M7 0h2v1H7z"/>';
  } else {
    // P1 Classic White/Cyan Ship
    icon.innerHTML =
      '<path fill="#E70000" d="M7 0h2v2H7zM6 2h4v2H6zM5 4h6v2H5zM2 6h12v2H2zM1 8h14v2H1zM2 10h12v2H2zM3 12h10v2H3zM5 14h6v2H5z"/>' +
      '<path fill="#FFFFFF" d="M7 2h2v4H7zM6 6h4v4H6zM7 10h2v2H7z"/>' +
      '<path fill="#00FFFF" d="M5 8h2v2H5zM9 8h2v2H9z"/>' +
      '<path fill="#FFFF00" d="M7 0h2v1H7z"/>';
  }
  return icon;
}
```

---

## 5. Verification Method

### 5.1 Independent Commands to Verify
1. **Unit & Integration Suite**:
   ```bash
   npm run test:unit
   ```
   Must pass all 104 existing test files (1,930 tests) with 0 failures and 0 regressions.
2. **Dedicated Bottom Dashboard Test**:
   ```bash
   npx vitest run tests/unit/bottom_dashboard.test.ts
   ```
   Must pass all existing test cases asserting `#dashboard-score`, `#dashboard-high-score`, `#dashboard-lives`, and action buttons.
3. **Production Build Check**:
   ```bash
   npm run build
   ```
   Must compile TypeScript cleanly (`tsc --noEmit`) and bundle Vite production output without any errors.

### 5.2 Files to Inspect
- `src/ui/BottomDashboard.ts`: Inspect `buildZoneLeft()`, `buildZoneCenter()`, `buildZoneRight()`, `setMode()`, and `update()`.
- `index.html`: Inspect CSS `.mode-single`, `.mode-coop`, `.p1-hud-container`, `.p2-hud-container`, and `.coop-center-telemetry`.
- `src/core/Game.ts`: Inspect `updateDashboardTelemetry()` to verify `isCoop` telemetry assembly.

### 5.3 Invalidation Conditions
- Any test in `tests/unit/bottom_dashboard.test.ts` failing because element IDs were moved or renamed.
- Any layout overflow causing horizontal or vertical scrollbars on viewports between 360px and 1920px.
- Presence of any external `.png`, `.jpg`, `.mp3`, or `.svg` asset files in the repo.
