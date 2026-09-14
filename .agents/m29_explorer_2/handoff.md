# Milestone M29 Exploration Report: Mobile Touch Ergonomics & UI Non-Collision Layout

- **Agent**: `m29_explorer_2` (Mobile Touch Ergonomics & UI Non-Collision Specialist)
- **Date**: 2026-09-11T09:35:00Z
- **Target Role**: `m29_worker` (Implementation Worker for Milestone M29)
- **Status**: COMPLETE & VERIFIED READ-ONLY ANALYSIS

---

## 1. Observation

Direct code observations from inspecting `index.html`, `src/ui/InputHandler.ts`, `src/core/ScreenManager.ts`, `src/ui/BottomDashboard.ts`, `src/entities/Player.ts`, and `src/core/Game.ts`:

### A. Markup & CSS Layout Architecture
1. **DOM Order in `#app-container`** (`index.html:532–553`):
   ```html
   <div id="app-container">
     <div class="canvas-wrapper">
       <canvas id="game-canvas" width="224" height="288" aria-label="Galaga Arcade Game Screen" role="img"></canvas>
       <div class="scanlines" aria-hidden="true"></div>
     </div>
     <div id="bottom-dashboard" class="bottom-dashboard" role="region" aria-label="Arcade Bottom Dashboard"></div>
     <div id="touch-controls" aria-hidden="true">
       <div class="dpad-container">
         <button id="btn-left" class="touch-btn dpad-btn" aria-label="Move Left">◀</button>
         <button id="btn-right" class="touch-btn dpad-btn" aria-label="Move Right">▶</button>
       </div>
       <div class="action-container">
         <button id="btn-fullscreen" class="touch-btn fullscreen-btn" aria-label="Toggle Fullscreen" title="Toggle Fullscreen (F / F11)">⛶</button>
         <button id="btn-special" class="touch-btn special-btn" aria-label="Special Move">SP</button>
         <button id="btn-fire" class="touch-btn fire-btn" aria-label="Fire Missile">FIRE</button>
       </div>
     </div>
   </div>
   ```
2. **Current Flex & Positioning Rules** (`index.html:92–103, 172–185, 267–289`):
   - `#app-container`: `display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; max-height: 100dvh;`
   - `.bottom-dashboard`: `width: 100%; max-width: 560px; height: var(--dash-height); flex-shrink: 0; z-index: 15;` (height is 56px default, 44px in compact mode under `@media (max-width: 480px)`).
   - `#touch-controls`: `position: absolute; bottom: max(12px, env(safe-area-inset-bottom, 12px)); left: 0; width: 100%; padding-left: max(20px, env(safe-area-inset-left, 20px)); padding-right: max(20px, env(safe-area-inset-right, 20px)); justify-content: space-between; align-items: center; pointer-events: none; z-index: 20;`
   - Media query (`index.html:524–528`):
     `@media (hover: none) and (pointer: coarse), (max-width: 600px) { #touch-controls { display: flex; } }`

3. **Current Touch Button Sizes** (`index.html:209–249`):
   - `.dpad-btn` (`#btn-left`, `#btn-right`): `width: 60px; height: 60px;` (gap: 16px). Total width = $60 + 16 + 60 = 136\text{px}$.
   - `.fullscreen-btn` (`#btn-fullscreen`): `width: 48px; height: 48px;`
   - `.special-btn` (`#btn-special`): `width: 54px; height: 54px; font-size: 11px;`
   - `.fire-btn` (`#btn-fire`): `width: 72px; height: 72px;`
   - `.action-container` total width = $48 + 12 + 54 + 12 + 72 = 198\text{px}$.
   - Combined horizontal footprint = $136\text{px} + 198\text{px} = 334\text{px}$.
   - Dashboard utility buttons (`index.html:447–449, 516–520`): `.dash-btn` is $32\text{px} \times 32\text{px}$ default, but shrinks to **$24\text{px} \times 24\text{px}$** when `@media (max-width: 480px)`.

4. **ScreenManager Canvas Scaling** (`src/core/ScreenManager.ts:90–104, 198–216`):
   - `ScreenManager.calculateTransform(windowWidth, windowHeight)` evaluates:
     - When `windowAspect > 224 / 288` (landscape): `displayHeight = windowHeight; displayWidth = Math.floor(windowHeight * (224 / 288));`.
     - In landscape (e.g. 812x375), `displayHeight = 375px` and inline styles set `this.canvas.style.height = '375px'`.
     - When `windowAspect < 224 / 288` (portrait): `displayWidth = windowWidth; displayHeight = Math.floor(windowWidth / (224 / 288));`.
     - In 375x812 portrait, `displayWidth = 375px; displayHeight = 482px`.

5. **InputHandler & Multi-Touch Architecture** (`src/ui/InputHandler.ts:138–216, 683–795`):
   - DOM buttons (`#btn-left`, `#btn-right`, `#btn-fire`, `#btn-special`) register independent `{ passive: false }` `touchstart`, `touchend`, and `touchcancel` listeners.
   - Steering state (`state.moveLeft`, `state.moveRight`, `state.touchLeft`, `state.touchRight`) and discrete actions (`fireTriggered`, `specialTriggered`) update independently.
   - `Player.ts:469–475` implements SOCD neutral resolution: `if (left && !right) targetVx = -currentSpeed; else if (right && !left) targetVx = currentSpeed; else targetVx = 0;`.
   - Double-tap detection within 250ms on left/right triggers Phase Warp (`phaseWarpTriggered = -1 | 1`).
   - Pointer events with `e.pointerType === 'touch'` are explicitly dropped on canvas to prevent duplicate events (`InputHandler.ts:626, 638`).
   - Haptic vibration feedback (`navigator.vibrate`) triggers at 10ms (steering), 15ms (fire), 20ms (special).

---

## 2. Logic Chain

From the observations above, we establish the step-by-step logic chain leading to the four critical failure modes and their mathematical remediations:

### Step 1: Landscape Mode Visual Clipping & Off-Screen Overflow
- **Observation Ref**: Obs 1 & Obs 4.
- In mobile landscape (e.g. iPhone X/12/13/14 landscape: $812\text{px} \times 375\text{px}$):
  1. `ScreenManager` calculates canvas `displayHeight = windowHeight = 375px`.
  2. Canvas wrapper takes $375\text{px}$ height.
  3. `#bottom-dashboard` is docked below the canvas with `height: 44px`.
  4. Total column height in `#app-container` is $375\text{px} + 44\text{px} = 419\text{px}$.
  5. Because `#app-container` has `height: 100% (375px); overflow: hidden; justify-content: center;`, the centered offset is $(375 - 419) / 2 = -22\text{px}$.
  6. **Direct Result**: The top 22px of the game canvas is clipped off-screen at the top, and the bottom 22px of the dashboard is clipped off-screen at the bottom.

### Step 2: Landscape Mode Touch Controls Overlapping Dashboard
- **Observation Ref**: Obs 2 & Obs 3.
- In $812\text{px}$ wide landscape:
  1. `#bottom-dashboard` has `max-width: 560px` and is centered, spanning horizontal coordinates $x \in [126, 686]\text{px}$.
  2. `#touch-controls` is absolutely positioned at `bottom: 12px` across the full width.
  3. The left `.dpad-container` (width 136px) with 20px padding spans $x \in [20, 156]\text{px}$ (or $[44, 180]\text{px}$ with 44px notch safe-area).
  4. $156\text{px} > 126\text{px}$ (or $180\text{px} > 126\text{px}$): D-pad **overlaps the left side of the dashboard by 30px to 54px**, obstructing the 1UP score and reserve ships display.
  5. The right `.action-container` (width 198px) with 20px padding spans $x \in [594, 792]\text{px}$ (or $[570, 768]\text{px}$ with 44px notch safe-area).
  6. $594\text{px} < 686\text{px}$: Action buttons **overlap the right side of the dashboard by 92px to 116px**, covering the mute, fullscreen, and pause buttons and legend.

### Step 3: Short Portrait Viewport Overlap
- **Observation Ref**: Obs 2, Obs 3 & Obs 4.
- In shorter portrait screens ($375\text{px} \times 667\text{px}$, e.g. iPhone SE, or Android with browser chrome / software navigation bars):
  1. Canvas takes $482\text{px}$ height; dashboard takes $44\text{px}$ height ($526\text{px}$ total).
  2. Centered in 667px, dashboard ends at $y = 596.5\text{px}$.
  3. `#touch-controls` is `position: absolute; bottom: 12px`.
  4. `.fire-btn` has height 72px. Its top edge reaches $y = 667 - 12 - 72 = 583\text{px}$.
  5. $583\text{px} < 596.5\text{px}$: `.fire-btn` **overlaps `#bottom-dashboard` vertically by 13.5px**.
  6. If viewport height is $\le 620\text{px}$ (common when mobile browser URL bar is active), overlap reaches $> 45\text{px}$, completely covering the dashboard.

### Step 4: Horizontal Jamming on 360px–375px Widths
- **Observation Ref**: Obs 3.
- Combined width of `.dpad-container` (136px) + `.action-container` (198px) is $334\text{px}$.
- With 20px left/right padding, required width is $374\text{px}$.
- On a 375px screen, clearance is only 1px.
- On a 360px screen (standard Android viewport width), available width is $320\text{px}$, causing button collision or horizontal overflow.

### Step 5: Accessibility Target Size Defect on Dashboard Buttons
- **Observation Ref**: Obs 3.
- All 5 virtual touch buttons in `#touch-controls` satisfy accessibility standards ($\ge 48\text{px} \times 48\text{px}$).
- However, `.dash-btn` on `#bottom-dashboard` shrinks to **$24\text{px} \times 24\text{px}$** under `@media (max-width: 480px)`.
- This violates WCAG 2.5.5 / 2.5.8 recommendations and causes accidental mis-taps on mobile.

### Step 6: Accidental Pull-to-Refresh & Overscroll
- **Observation Ref**: `html, body` has `touch-action: none` and `user-select: none`, but lacks `overscroll-behavior: none`.
- On Chromium mobile browsers, dragging on `#app-container` borders can trigger native pull-to-refresh, refreshing the tab and aborting gameplay.

---

## 3. Caveats

1. **Hardware Gamepad Overrides**: When a Bluetooth physical gamepad is connected, `InputHandler.pollGamepad()` captures directional and button inputs without using virtual DOM buttons.
2. **Device Orientation Sensor**: While CSS media queries `@media (orientation: portrait)` and `@media (orientation: landscape)` provide primary layout switching, some mobile browsers experience a 100–300ms delay during rotation before `window.innerHeight` updates. A debounced resize handler handles this gracefully.
3. **Browser Address Bar Reflows (Dynamic Viewport Units)**: Using `100dvh` ensures the layout responds dynamically as mobile Safari and Chrome expand/collapse their URL bars.
4. **Existing Fullscreen Test Dependency**: `tests/unit/fullscreen.test.ts` references `#btn-fullscreen`. This element must be preserved in `index.html`.

---

## 4. Conclusion & Technical Recommendations for `m29_worker`

To achieve a flawless, ergonomic, and non-colliding layout across all mobile, tablet, and desktop devices, `m29_worker` should implement the following specifications:

### Specification 1: Portrait Layout — In-Flow Stacking
In portrait mode, `#touch-controls` must transition from `position: absolute` to **in-flow flex sibling** below `#bottom-dashboard`:

```css
@media (max-width: 600px) and (orientation: portrait) {
  #app-container {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100dvh;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: max(6px, env(safe-area-inset-bottom, 6px));
    box-sizing: border-box;
  }

  .canvas-wrapper {
    flex: 1 1 auto;
    min-height: 0;
    max-height: calc(100dvh - var(--dash-height-compact, 44px) - 96px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    width: auto;
    aspect-ratio: 224 / 288;
    margin: 0 auto;
  }

  .bottom-dashboard {
    flex-shrink: 0;
    width: 100%;
    max-width: 500px;
    margin: 4px 0;
  }

  #touch-controls {
    display: flex;
    position: relative;
    bottom: auto;
    left: auto;
    width: 100%;
    max-width: 500px;
    padding: 4px 12px;
    flex-shrink: 0;
    justify-content: space-between;
    align-items: center;
    box-sizing: border-box;
    z-index: 20;
    pointer-events: none;
  }
}
```
*Proof of Non-Collision*: In flex-column flow, Sibling 1 (`.canvas-wrapper`), Sibling 2 (`#bottom-dashboard`), and Sibling 3 (`#touch-controls`) never overlap.

### Specification 2: Landscape Layout — Dedicated Pillarbox Docking
In landscape mode, the canvas and dashboard occupy the center column, while touch controls dock into the left and right pillarboxes:

```css
@media (orientation: landscape) and (max-height: 600px) {
  #app-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100dvh;
    position: relative;
  }

  .canvas-wrapper {
    height: calc(100dvh - var(--dash-height-compact, 44px));
    max-height: calc(100dvh - var(--dash-height-compact, 44px));
    aspect-ratio: 224 / 288;
    width: auto;
  }

  .bottom-dashboard {
    height: var(--dash-height-compact, 44px);
    max-width: min(420px, calc(100vw - 320px));
    flex-shrink: 0;
  }

  #touch-controls {
    display: flex;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    padding: 0 max(16px, env(safe-area-inset-right, 16px)) max(16px, env(safe-area-inset-bottom, 16px)) max(16px, env(safe-area-inset-left, 16px));
    justify-content: space-between;
    align-items: flex-end;
    box-sizing: border-box;
    pointer-events: none;
    z-index: 20;
  }

  .dpad-container {
    margin-bottom: 8px;
  }

  .action-container {
    margin-bottom: 8px;
  }
}
```
*Proof of Non-Collision*:
- In 812x375: Canvas takes height $375 - 44 = 331\text{px}$, width $257\text{px}$.
- Dashboard is clamped to `max-width: 420px` (or canvas width).
- D-pad in left pillarbox ends at $x = 156\text{px}$, leaving $> 100\text{px}$ clearance to the dashboard ($x \ge 277\text{px}$).
- Action cluster in right pillarbox starts at $x = 642\text{px}$, leaving $> 100\text{px}$ clearance to the dashboard ($x \le 535\text{px}$).
- Zero canvas clipping at top and bottom.

### Specification 3: Compact Device Touch Target Tuning (< 400px Width)
Tune button sizes and gaps on compact portrait devices while maintaining $\ge 48\text{px} \times 48\text{px}$:
```css
@media (max-width: 400px) and (orientation: portrait) {
  .dpad-container {
    gap: 10px;
  }
  .dpad-btn {
    width: 52px;
    height: 52px;
    font-size: 13px;
  }
  .action-container {
    gap: 8px;
  }
  .fullscreen-btn {
    width: 48px;
    height: 48px;
  }
  .special-btn {
    width: 50px;
    height: 50px;
    font-size: 10px;
  }
  .fire-btn {
    width: 64px;
    height: 64px;
    font-size: 12px;
  }
}
```
- Total width = $114\text{px} (\text{dpad}) + 178\text{px} (\text{action}) = 292\text{px}$.
- Leaves $48\text{px} \sim 83\text{px}$ center breathing room on 360px–375px screens!
- Every button satisfies $\ge 48\text{px} \times 48\text{px}$.

### Specification 4: Safeguard against Pull-to-Refresh & Overscroll
Add to `html, body, #app-container`:
```css
html, body, #app-container {
  overscroll-behavior: none;
  overscroll-behavior-y: none;
}
```

### Specification 5: Accessible Touch Hit-Slop on Dashboard Buttons
Expand effective tap hitboxes on `.dash-btn` without changing visual 24px/32px dimensions:
```css
.dash-btn {
  position: relative;
}
.dash-btn::before {
  content: '';
  position: absolute;
  top: -8px;
  bottom: -8px;
  left: -8px;
  right: -8px;
  pointer-events: auto;
}
```

---

## 5. Verification Method

To independently verify this analysis and ensure `m29_worker` implementation correctness:

1. **Accessibility Target Size Audit**:
   Inspect computed CSS bounding box of all buttons in Playwright or Vitest DOM:
   - `#btn-left`: width $\ge 48\text{px}$, height $\ge 48\text{px}$.
   - `#btn-right`: width $\ge 48\text{px}$, height $\ge 48\text{px}$.
   - `#btn-fire`: width $\ge 48\text{px}$, height $\ge 48\text{px}$.
   - `#btn-special`: width $\ge 48\text{px}$, height $\ge 48\text{px}$.
   - `#btn-fullscreen`: width $\ge 48\text{px}$, height $\ge 48\text{px}$.

2. **Non-Collision Geometry Verification (Bounding Box Bounding Test)**:
   In Playwright E2E across viewports:
   - **Portrait (375x812, 375x667, 360x640)**:
     ```ts
     const canvasBox = await page.locator('.canvas-wrapper').boundingBox();
     const dashBox = await page.locator('#bottom-dashboard').boundingBox();
     const touchBox = await page.locator('#touch-controls').boundingBox();
     // Assert strictly ordered vertical stacking
     expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(dashBox.y);
     expect(dashBox.y + dashBox.height).toBeLessThanOrEqual(touchBox.y);
     expect(touchBox.y + touchBox.height).toBeLessThanOrEqual(windowHeight);
     ```
   - **Landscape (812x375, 667x375)**:
     ```ts
     const dpadBox = await page.locator('.dpad-container').boundingBox();
     const dashBox = await page.locator('#bottom-dashboard').boundingBox();
     const actionBox = await page.locator('.action-container').boundingBox();
     // Assert non-overlapping horizontal segments
     expect(dpadBox.x + dpadBox.width).toBeLessThanOrEqual(dashBox.x);
     expect(dashBox.x + dashBox.width).toBeLessThanOrEqual(actionBox.x);
     // Assert canvas fits vertically without clipping
     const canvasBox = await page.locator('.canvas-wrapper').boundingBox();
     expect(canvasBox.y).toBeGreaterThanOrEqual(0);
     expect(dashBox.y + dashBox.height).toBeLessThanOrEqual(windowHeight);
     ```

3. **Multi-Touch Concurrency & Double-Tap Test**:
   - Dispatch simultaneous touchstart on `#btn-left` and `#btn-fire`.
   - Verify `inputHandler.getState().moveLeft === true` and `inputHandler.consumeAction('fire') === true`.
   - Dispatch double-tap within 250ms on `#btn-left` and verify `inputHandler.consumePhaseWarp() === -1`.

4. **Vitest & Playwright Regression Commands**:
   - `npm test` (verify all existing 92 test files pass 100%).
   - `npx playwright test` (verify cross-browser tests pass).
   - `npm run build` (`tsc --noEmit && vite build` clean build).
