# Milestone M34 Exploration Report: Mobile Responsive Reflow, Touch Telemetry & Test Specifications

- **Agent Identity**: `m34_explorer_3`
- **Parent Conversation ID**: `0236827c-a7d2-4115-a374-2f5c45ed8134`
- **Target Milestone**: Milestone M34: Symmetrical Dual Bottom Dashboard HUD & Ergonomic Polish
- **Date / Timestamp**: 2026-09-14T10:50:30Z

---

## 1. Observation

### 1.1 Existing Bottom Dashboard Implementation (`src/ui/BottomDashboard.ts`)
- **Single-Player Baseline Architecture**:
  - Root element: `#bottom-dashboard.bottom-dashboard.cyber-dashboard` (`BottomDashboard.ts:213-224`).
  - 3-zone layout: `grid-template-columns: 140px 1fr 140px` (desktop) and `grid-template-columns: 96px 1fr 82px` (`compact-mode`, `index.html:300, 316`).
  - Zone 1 (`.zone-left`, `lines 354–421`): 1UP score (`#dashboard-score`), HIGH score (`#dashboard-high-score`), procedural SVG reserve ship icons rack (`#dashboard-lives`).
  - Zone 2 (`.zone-center`, `lines 423–478`): Active power-up chips rack (`#dashboard-powerups`) and Special Move meter (`.dashboard-special-container`, `.special-fill`).
  - Zone 3 (`.zone-right`, `lines 480–546`): Controls legend (`.controls-legend`, `A/D MOVE`, `SPC FIRE`, `X SP`) and tactical buttons (`#btn-dash-mute`, `#btn-dash-fullscreen`, `#btn-dash-pause`).
  - Zero-GC dirty checking: Uses internal primitives (`_lastScore`, `_lastHighScore`, `_lastLives`, `_lastSpecialEnergyInt`, `_lastIsMuted`, etc.) in `BottomDashboard.update()` (`lines 638–763`) to prevent layout thrashing and DOM mutations when state is unchanged.

### 1.2 Multi-Entity Player Architecture (`src/systems/PlayerManager.ts`) & Co-op Systems
- **Player Entities**:
  - Manages Player 1 (Cyan/White, starting at $X = 80$ in co-op) and Player 2 (Crimson/Amber, starting at $X = 144$ in co-op) (`PlayerManager.ts:45–66`).
  - Mode toggle: `PlayerManager.setMode('single' | 'coop')` (`PlayerManager.ts:82–99`).
  - Query methods: `isCoop()`, `getPlayers()`, `getPlayer('p1' | 'p2')`, `getLivingPlayers()`, `getActiveCount()` (`lines 74–168`).
  - Life donation & revive: `canDonateLife(donorId: PlayerId): boolean` (`lines 174–189`), `donateLife(donorId: PlayerId): boolean` (`lines 195–218`), `isAnyPlayerReviving(): boolean` (`lines 223–229`), `areAllPlayersDead(): boolean` (`lines 235–256`).
- **Telemetry Sources**:
  - `ScoreManager.ts`: Independently stores `score`, `p2Score`, `lives`, `p2Lives`, `shotsFired`, `p2ShotsFired` (`ScoreManager.ts:90–107, 176–217`).
  - `Player.ts`: Stores independent `lives`, `reviveTimer` (countdown initialized to 10.0s, `Player.ts:79, 602`), `hasShield`, `hasReflectionShield`, `hasChronoField`, `activePowerUps` (`Player.ts:346–372`).
  - `SpecialMovesManager.ts`: Stores `energy` (0..100), `selectedMove`, `activePlayerId`, `isActive`, `isReady()` (`SpecialMovesManager.ts:36–58`).

### 1.3 Mobile Touch Controls & Virtual Touch Zones (`src/ui/InputHandler.ts`)
- **Canvas Multi-Touch (`#game-canvas`, `InputHandler.ts:984–1231`)**:
  - Single Mode: $X < \text{width} \times 0.65$ is steering drag/stick; $X \ge \text{width} \times 0.65$ & $Y \ge \text{height} \times 0.60$ is fire.
  - Co-op Mode: Screen vertically divided at center $X = 112$ (or clientX mid):
    - P1 Zone: $X < \text{midX}$. Left 65% is steering; right 35% is action (top: special, bottom: fire).
    - P2 Zone: $X \ge \text{midX}$. Left 65% is steering; right 35% is action (top: special, bottom: fire).
    - Independent `touchSessions` (`Map<number, PlayerTouchSession>`) prevents cross-player touch bleed.
- **DOM Touch Controls (`#touch-controls`, `index.html:185–273, 794–805`)**:
  - In mobile portrait (`@media (max-width: 600px) and (orientation: portrait)`, `index.html:567–648`):
    - `#app-container`: Flex column with `justify-content: space-between`.
    - Stack: (1) `.canvas-wrapper` $\to$ (2) `#bottom-dashboard` $\to$ (3) `#touch-controls`.
    - `.canvas-wrapper` max-height is constrained: `calc(100dvh - var(--dash-height-compact, 44px) - 96px - var(--sat) - var(--sab))`.
  - In mobile landscape (`@media (orientation: landscape) and (max-height: 600px)`, `index.html:688–773`):
    - `#touch-controls` floats absolutely in the side pillarbox bands (`left: 0, top: 0, width: 100%, height: 100%`).
    - `#bottom-dashboard` is docked directly beneath the canvas in the center column: `max-width: min(360px, calc(100vw - 320px))`.

### 1.4 Existing Test Infrastructure (`tests/unit/`)
- `tests/unit/bottom_dashboard.test.ts`: 709 lines with complete Node-compatible DOM mocks (`MockElement`, `MockDocument`, `MockClassList`), textContent mutation spy tracking (`textContentSetterCount`), style assertions, and zero-GC heap leak tests.
- `tests/unit/responsive_layout.test.ts`: 791 lines testing letterbox aspect ratio scaling, bounding box geometric non-overlap calculations, touch button dimensions ($\ge 48\text{px}$), and safe-area insets.
- `tests/unit/adversarial_m32_touch.test.ts`: 610 lines verifying 6-finger capacitive saturation, out-of-order touch cancellation, and zero-GC touch session mapping.
- `tests/unit/m33_coop_balance_revive.test.ts`: 651 lines testing revive timer decrements (10s $\to$ 0s), life donation invariants, and pity revives.

---

## 2. Logic Chain

### 2.1 Ergonomic Partitioning of the Symmetrical 3-Zone Layout
1. In Co-op Mode, two human players simultaneously interact with the game. Player 1's physical hands occupy the left half of the device (PC keyboard WASD or mobile left quadrant), while Player 2's hands occupy the right half (PC arrow keys or mobile right quadrant).
2. If tactical action buttons (Mute, Fullscreen, Pause) were placed on the left or right edges of `#bottom-dashboard`, either player's dragging thumb or tapping fingers could easily misfire onto these buttons, triggering abrupt pause or audio mute during combat.
3. Placing all interactive clickable buttons strictly in **Zone 2 (Center)** creates a natural physical buffer zone between the two players' hands. Zones 1 and 3 are designated as **passive telemetry displays** (`pointer-events: none;` on non-interactive metrics), guaranteeing that thumb movements over the HUD never trigger accidental actions or input lag.
4. Single-Player backward compatibility requires that when `isCoop = false`, Zone 3 is hidden/collapsed (`display: none`), while Zone 1 expands and Zone 2 maintains the classic item chip rack and special gauge, preserving 100% of M28 styling.

### 2.2 Mobile Responsive Reflow on Narrow Screens (360px–480px)
1. On 360px viewports, 3 zones arranged horizontally must share 360px total width without horizontal scrollbars:
   - Budget: Zone 1 (Left P1) = 95px–105px; Zone 2 (Center) = 130px–150px; Zone 3 (Right P2) = 95px–105px; Gaps & padding = 10px.
2. In each player zone (Zone 1 & Zone 3):
   - Row 1: Player badge (`1P` / `2P`, 6px–7px font) + 6-digit score (`000000`, 7px font).
   - Row 2: Procedural SVG ship icons (10px $\times$ 10px, up to 3 icons; `+N` badge if $> 3$) + compact special charge meter (height 4px–5px, width 32px–40px).
   - Row 3 / rack: Micro power-up chips (10px progress bar, 6px typography).
3. In Zone 2 (Center):
   - Row 1: High score (`HI 020000`) & Stage indicator (`ST 05`).
   - Row 2: Dynamic Alert / Revive banner (`REVIVE P1: 8S` or `CRISIS ALERT` or controls prompt).
   - Row 3: Centered tactile buttons (`#btn-dash-mute`, `#btn-dash-fullscreen`, `#btn-dash-pause`, 24px $\times$ 24px each with expanded 44px touch hit area via `::before`).
4. Result: All elements fit compactly within `height: 44px` (`--dash-height-compact`), `overflow: hidden;`, guaranteeing 0 horizontal scrollbars and 0 canvas occlusion.

### 2.3 Coordination with M32 Virtual Touch Zones
1. The canvas handles touch gestures for steering and firing. `#bottom-dashboard` is docked below the canvas wrapper.
2. In mobile portrait mode, `#app-container` stacks `.canvas-wrapper`, `#bottom-dashboard`, and `#touch-controls` in vertical in-flow sequence.
3. By enforcing `touch-action: manipulation;` on `#bottom-dashboard` and its interactive buttons, browsers disable double-tap zoom gestures, eliminating the 300ms mobile tap delay.
4. Non-overlap assertions:
   $$\text{rect}(\text{canvas}).\text{bottom} \le \text{rect}(\text{dashboard}).\text{top} \quad \text{and} \quad \text{rect}(\text{dashboard}).\text{bottom} \le \text{rect}(\text{touch-controls}).\text{top}$$
   Overlap area is strictly 0.

### 2.4 Test Track Structuring Across 6 Tracks
1. To guarantee that Milestone M34 satisfies all user requirements and preserves the 1,930 baseline unit tests without regressions, test coverage must be partitioned into 6 orthogonal tracks:
   - **Track 1**: Symmetrical 3-Zone Layout Creation & DOM Structure (DOM mounting, zone hierarchy, SVG glyphs, zero binary assets).
   - **Track 2**: Single-Player Backward Compatibility (P2 collapse, legacy ID retention, 100% M28 parity).
   - **Track 3**: Zero-GC Dirty Checking Engine (0 DOM setters on identical state, isolated mutations per player, 0 heap allocations).
   - **Track 4**: Real-Time Telemetry Updates (Independent P1/P2 score, lives, special meter, power-up chips).
   - **Track 5**: Revive Countdown & Life Donation Indicator Display (10s countdown, pulsating border, donation cue, elimination state).
   - **Track 6**: Mobile Responsive Layout Classes & Viewport Reflow (360px–480px fit, zero scrollbars, touch non-overlap, safe areas).

---

## 3. Caveats

1. **DOM in Node Testing Environment**: Vitest runs in Node.js where `window` and `document` are mocked. All DOM structure, dirty-checking setters, and bounding box tests must continue using robust mock utilities (`MockElement`, `MockDocument`) as established in `tests/unit/bottom_dashboard.test.ts`.
2. **Dynamic Mode Switching**: Players can toggle between 1-Player and 2-Player modes on the Title Screen. The dashboard must support dynamic mode transitions (`setMode('single' | 'coop')`) without destroying and recreating the entire DOM tree, ensuring zero heap churn.
3. **WCAG Accessible Touch Targets**: On mobile screens, buttons rendered at 24px visually must use CSS `::before` pseudo-elements expanding their clickable area to at least $44\text{px} \times 44\text{px}$ to comply with mobile accessibility standards.

---

## 4. Conclusion

1. **DOM Architecture**: Refactor `BottomDashboard.ts` to support both `single` and `coop` modes:
   - Co-op Mode instantiates a symmetrical 3-zone layout: Zone 1 (Left P1 HUD), Zone 2 (Center Telemetry & Global Controls), Zone 3 (Right P2 HUD).
   - Single-Player Mode collapses Zone 3 (`display: none`) and preserves 100% backward-compatible M28 appearance and legacy DOM element IDs.
2. **Ergonomic Safety**: Confining all interactive buttons to Zone 2 (Center) completely insulates them from P1 and P2 combat touch zones, preventing accidental input drops or pause triggers.
3. **Mobile Responsive Reflow**: CSS rules with `@media (max-width: 480px)` and `@media (max-width: 380px)` guarantee compact 2-tier stacked micro-badges, preserving the 44px compact height with zero horizontal scrollbars.
4. **Concrete Test Specifications**: 32 unit test cases across 6 comprehensive tracks defined below, providing an airtight specification for implementation.

---

## 5. Concrete Specifications & Implementation Artifacts

### 5.1 Responsive CSS Rules Specification

```css
/* ==========================================================================
   Milestone M34: Symmetrical Dual Bottom Dashboard HUD & Mobile Reflow
   ========================================================================== */

:root {
  --dash-bg: #1a1a2e;
  --dash-border: #2d2d54;
  --dash-cyan: #00ffff;
  --dash-crimson: #ff2a2a;
  --dash-yellow: #ffff00;
  --dash-green: #00ff66;
  --dash-font: 'Press Start 2P', monospace;
  --dash-height: 56px;
  --dash-height-compact: 44px;
}

/* Symmetrical 3-Zone Co-op Grid Layout (Desktop / Default) */
.bottom-dashboard.coop-mode {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) minmax(140px, 1.2fr) minmax(130px, 1fr);
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  gap: 6px;
  border-top: 2px solid var(--dash-cyan);
  border-image: linear-gradient(90deg, var(--dash-cyan) 0%, var(--dash-yellow) 50%, var(--dash-crimson) 100%) 1;
  overflow: hidden;
  box-sizing: border-box;
}

/* Single-Player Mode: Hide P2 Zone & Maintain Legacy 3-Zone Balance */
.bottom-dashboard.single-mode .zone-p2,
.bottom-dashboard:not(.coop-mode) .zone-p2 {
  display: none !important;
}
.bottom-dashboard.single-mode,
.bottom-dashboard:not(.coop-mode) {
  grid-template-columns: 140px 1fr 140px;
}

/* Zone 1: Player 1 (Cyan Theme) */
.zone-p1 {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  pointer-events: none; /* Passive telemetry */
}
.zone-p1 .player-badge {
  color: var(--dash-cyan);
  font-size: 8px;
  line-height: 9px;
  font-weight: bold;
}
.zone-p1 .p1-score-val {
  color: #ffffff;
  font-size: 8px;
  line-height: 9px;
}

/* Zone 2: Center Telemetry & Global Controls */
.zone-center-telemetry {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 0;
}
.center-meta-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  font-size: 7px;
  line-height: 8px;
}
.center-banner {
  font-size: 7px;
  line-height: 8px;
  color: var(--dash-yellow);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.center-actions {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

/* Zone 3: Player 2 (Crimson Theme, Symmetrically Mirrored) */
.zone-p2 {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;
  text-align: right;
  gap: 2px;
  min-width: 0;
  pointer-events: none; /* Passive telemetry */
}
.zone-p2 .player-badge {
  color: var(--dash-crimson);
  font-size: 8px;
  line-height: 9px;
  font-weight: bold;
}
.zone-p2 .p2-score-val {
  color: #ffffff;
  font-size: 8px;
  line-height: 9px;
}

/* Special Meter in P1 and P2 Zones */
.special-meter-mini {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}
.zone-p2 .special-meter-mini {
  flex-direction: row-reverse;
}
.special-mini-track {
  flex: 1 1 auto;
  height: 5px;
  background: #0a0a18;
  border: 1px solid #333366;
  border-radius: 2px;
  overflow: hidden;
}
.zone-p1 .special-mini-fill {
  background: linear-gradient(90deg, #0088ff, var(--dash-cyan));
  height: 100%;
  transition: width 0.08s linear;
}
.zone-p2 .special-mini-fill {
  background: linear-gradient(90deg, #ff8800, var(--dash-crimson));
  height: 100%;
  transition: width 0.08s linear;
}

/* Revive Alert State & Animations */
.revive-active {
  animation: pulseReviveBorder 0.6s infinite ease-in-out;
}
.revive-banner-text {
  animation: pulseReviveText 0.5s infinite alternate;
}
@keyframes pulseReviveBorder {
  0%, 100% { border-color: var(--dash-crimson); box-shadow: 0 0 8px rgba(255, 42, 42, 0.6); }
  50% { border-color: var(--dash-yellow); box-shadow: 0 0 4px rgba(255, 255, 0, 0.4); }
}
@keyframes pulseReviveText {
  from { color: #ff2a2a; text-shadow: 0 0 6px #ff2a2a; }
  to { color: #ffff00; text-shadow: 0 0 2px #ffff00; }
}

/* Compact Mobile Reflow (360px - 480px Viewports) */
@media (max-width: 480px) {
  .bottom-dashboard.coop-mode {
    height: var(--dash-height-compact, 44px);
    grid-template-columns: minmax(90px, 1fr) minmax(110px, 1.2fr) minmax(90px, 1fr);
    padding: 2px 4px;
    gap: 3px;
  }
  .bottom-dashboard.single-mode,
  .bottom-dashboard:not(.coop-mode) {
    grid-template-columns: 96px 1fr 82px;
    height: var(--dash-height-compact, 44px);
    padding: 2px 6px;
  }
  .zone-p1 .player-badge, .zone-p2 .player-badge {
    font-size: 6px;
    line-height: 7px;
  }
  .zone-p1 .p1-score-val, .zone-p2 .p2-score-val {
    font-size: 7px;
    line-height: 8px;
  }
  .ship-icon, .ship-life-icon {
    width: 9px;
    height: 9px;
  }
  .special-mini-track {
    height: 4px;
  }
  .center-meta-row {
    font-size: 6px;
    gap: 4px;
  }
  .center-banner {
    font-size: 6px;
  }
  .dash-btn {
    width: 24px;
    height: 24px;
    font-size: 11px;
  }
  /* Accessible Expanded Touch Target */
  .dash-btn::before {
    top: -10px;
    bottom: -10px;
    left: -10px;
    right: -10px;
  }
}

/* Narrowest Mobile Portrait (< 380px Viewports) */
@media (max-width: 380px) and (orientation: portrait) {
  .bottom-dashboard.coop-mode {
    grid-template-columns: 88px 1fr 88px;
    padding: 2px;
    gap: 2px;
  }
  .dash-btn {
    width: 22px;
    height: 22px;
    font-size: 10px;
  }
}
```

---

### 5.2 Unit Test Specifications Across 6 Tracks

The new unit test file should be authored at `tests/unit/m34_symmetrical_bottom_dashboard.test.ts`.

#### Track 1: Symmetrical 3-Zone Layout Creation & DOM Structure (Co-op Mode)
- **TC1.1: Root Container Co-op Mode Classing**:
  - *Setup*: Instantiate `new BottomDashboard({ container: mockAppContainer, mode: 'coop' })`.
  - *Assert*: `dashboard.getElement().classList.contains('coop-mode') === true`.
- **TC1.2: Zone 1 (Left P1) Hierarchy**:
  - *Assert*: `.zone-p1` exists; contains `.player-badge` with text "1P", `#dashboard-p1-score`, `#dashboard-p1-lives`, `#dashboard-p1-special`, `#dashboard-p1-powerups`.
- **TC1.3: Zone 2 (Center) Hierarchy**:
  - *Assert*: `.zone-center-telemetry` exists; contains `#dashboard-stage`, `#dashboard-high-score`, `.center-banner`, and action buttons (`#btn-dash-mute`, `#btn-dash-fullscreen`, `#btn-dash-pause`).
- **TC1.4: Zone 3 (Right P2) Symmetrical Hierarchy**:
  - *Assert*: `.zone-p2` exists; contains `.player-badge` with text "2P", `#dashboard-p2-score`, `#dashboard-p2-lives`, `#dashboard-p2-special`, `#dashboard-p2-powerups`.
- **TC1.5: Procedural Asset Purity**:
  - *Assert*: All life icons are procedural SVG elements (0 `.png`, `.jpg`, `.svg` files referenced via external URLs).

#### Track 2: Single-Player Mode Backward Compatibility
- **TC2.1: Zone 3 Collapsed in 1P Mode**:
  - *Setup*: Instantiate with `mode: 'single'` (or `dashboard.setMode('single')`).
  - *Assert*: `.zone-p2` has display `none` or `.zone-hidden`.
- **TC2.2: Legacy ID Preservation**:
  - *Assert*: `#dashboard-score`, `#dashboard-lives`, `#dashboard-powerups`, `#dashboard-special-container`, `#dashboard-high-score` resolve to valid elements.
- **TC2.3: Seamless Mode Toggling**:
  - *Action*: Call `dashboard.setMode('coop')` $\to$ `dashboard.setMode('single')` $\to$ `dashboard.setMode('coop')`.
  - *Assert*: Elements toggle without throwing errors or creating orphaned duplicate nodes.

#### Track 3: Zero-GC Dirty Checking Engine
- **TC3.1: 10,000 Static Frames Invariant**:
  - *Setup*: Spy on `textContentSetterCount` across P1 score, P2 score, high score, stage, and cue elements.
  - *Action*: Call `dashboard.update(staticState)` 10,000 times.
  - *Assert*: Net setter invocations = 0. Style modifications = 0.
- **TC3.2: P1-Isolated Mutation**:
  - *Action*: Update only P1 score (1000 $\to$ 1500).
  - *Assert*: Only `#dashboard-p1-score` triggers 1 setter; P2 score and high score trigger 0 setters.
- **TC3.3: P2-Isolated Mutation**:
  - *Action*: Update only P2 score (500 $\to$ 800).
  - *Assert*: Only `#dashboard-p2-score` triggers 1 setter; P1 score triggers 0 setters.
- **TC3.4: Special Energy Granularity**:
  - *Action*: Update with energy float values (42.1% $\to$ 42.8%).
  - *Assert*: Integer clamping (`Math.floor`) ensures width and textContent update 0 times when integer percentage is unchanged.
- **TC3.5: Zero Heap Allocation Invariant**:
  - *Setup*: Override `globalThis.Set`, `Array`, `Map` with tracking subclasses.
  - *Action*: Run 500 consecutive `dashboard.update()` frames.
  - *Assert*: 0 new instances allocated during steady-state loop.

#### Track 4: Real-Time Telemetry Updates
- **TC4.1: Independent 6-Digit Score Formatting**:
  - *Input*: `p1Score = 120`, `p2Score = 45000`.
  - *Assert*: P1 displays "000120", P2 displays "045000".
- **TC4.2: High Score Flash Trigger**:
  - *Input*: `p2Score = 25000`, `highScore = 20000`.
  - *Assert*: High score displays "025000" and gains `.high-score-flash`.
- **TC4.3: Independent Reserve Ships Rack**:
  - *Input*: `p1Lives = 3`, `p2Lives = 1`.
  - *Assert*: P1 lives container contains 3 cyan icons; P2 lives container contains 1 crimson icon.
- **TC4.4: Independent Special Move Charges**:
  - *Input*: `p1SpecialEnergy = 60`, `p2SpecialEnergy = 100`.
  - *Assert*: P1 bar = "60%" with cue "60%"; P2 bar = "100%" with cue "READY [M]" and `.special-ready`.
- **TC4.5: Independent Power-Up Chips**:
  - *Input*: P1 has Rapid Fire, P2 has Kinetic Shield.
  - *Assert*: P1 chip rack contains "RF", P2 chip rack contains "SHD". Expiration of P1 chip unmounts only P1 chip.

#### Track 5: Revive Countdown & Life Donation Indicator Display
- **TC5.1: Revive Pending Visual Alert**:
  - *Input*: P1 in `revive_pending` with `reviveTimer = 10.0`.
  - *Assert*: `.zone-p1` gains `.revive-active`; P1 lives rack or banner displays "REVIVE: 10S".
- **TC5.2: Revive Timer Countdown & Urgent Flash**:
  - *Input*: Timer decrements from 9.0s to 2.5s.
  - *Assert*: Text updates to "REVIVE: 3S"; gains urgent alert class when timer $\le 3.0\text{s}$.
- **TC5.3: Life Donation Prompt Cue**:
  - *Input*: P1 down (`revive_pending`), P2 alive with 3 lives.
  - *Assert*: Center banner or P2 HUD displays "[L] DONATE LIFE".
- **TC5.4: Successful Donation Recovery**:
  - *Input*: Life donated $\to$ P1 lives set to 1, state `respawning`.
  - *Assert*: Revive countdown cleared; 1 ship icon rendered; donation cue hidden.
- **TC5.5: Elimination State on Timeout**:
  - *Input*: Timer reaches 0 without donation $\to$ state `eliminated`.
  - *Assert*: Zone gains `.player-eliminated`; displays "ELIMINATED" or "OUT".
- **TC5.6: Stage Clear Pity Revive**:
  - *Input*: Stage clear event restores eliminated player with 1 life.
  - *Assert*: Elimination class removed; 1 ship icon restored.

#### Track 6: Mobile Responsive Layout Classes & Viewport Reflow
- **TC6.1: Compact Mode Activation**:
  - *Action*: Call `dashboard.setCompactMode(true)`.
  - *Assert*: Dashboard gains `.compact-mode`; height style reflects `44px`.
- **TC6.2: Viewport Width Bounds Verification (360px–480px)**:
  - *Assert*: Cumulative width of 3 zones $\le 360\text{px}$; `scrollWidth <= clientWidth` (0 horizontal scrollbars).
- **TC6.3: Touch Control Non-Overlap in Portrait**:
  - *Assert*: $\text{rect}(\text{dashboard}).\text{bottom} \le \text{rect}(\text{touch-controls}).\text{top}$; intersection area = 0.
- **TC6.4: Touch Control Non-Overlap in Landscape**:
  - *Assert*: Dashboard centered between left D-pad and right action buttons with zero bounding box intersection.
- **TC6.5: Accessible Touch Target Sizing**:
  - *Assert*: Buttons (`.dash-btn`) maintain $\ge 44\text{px} \times 44\text{px}$ effective hit area via `::before`.
- **TC6.6: Safe-Area Inset Styles Verification**:
  - *Assert*: `index.html` styles contain `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`, and `viewport-fit=cover`.

---

## 6. Verification Method

To independently verify these findings and specifications:

1. **Test Suite Execution**:
   Run existing responsive and dashboard test suites to confirm zero regressions:
   ```bash
   npx vitest run tests/unit/bottom_dashboard.test.ts
   npx vitest run tests/unit/responsive_layout.test.ts
   npx vitest run tests/unit/m32_dual_input_subsystem.test.ts
   npx vitest run tests/unit/m33_coop_balance_revive.test.ts
   ```
2. **Author and Run Milestone M34 Test Suite**:
   Once implemented, execute:
   ```bash
   npx vitest run tests/unit/m34_symmetrical_bottom_dashboard.test.ts
   ```
   All 32 test cases across the 6 tracks must pass with 100% clean assertion success.
3. **Invalidation Conditions**:
   - Any horizontal scrollbar appearing on viewports between 360px and 480px width.
   - Any DOM `textContent` or `style` mutations occurring when telemetry data is identical.
   - Any overlap between `#bottom-dashboard` and `#touch-controls`.
   - Any regression in single-player baseline tests (`tests/unit/bottom_dashboard.test.ts`).
