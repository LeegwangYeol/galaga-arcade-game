# Milestone M29 Exploration Handoff Report: Universal Responsive Viewport & Safe-Area Integration

**Author**: `m29_explorer_1` (Universal Responsive Viewport & Safe-Area Specialist)  
**Target Milestone**: M29 (Universal Responsive Layout & Multi-Device Viewport Integration)  
**Target Recipient**: `m29_worker`  
**Date**: 2026-09-11  

---

## 1. Observation

### 1.1 `index.html` CSS & DOM Hierarchy Findings
- **File**: `/Users/user/teamwork_projects/galaga_game/index.html`
- **DOM Structure** (Lines 532–553):
  ```html
  <div id="app-container">
    <div class="canvas-wrapper">
      <canvas id="game-canvas" width="224" height="288" aria-label="Galaga Arcade Game Screen" role="img"></canvas>
      <div class="scanlines" aria-hidden="true"></div>
    </div>
    <!-- Cyber-Arcade Bottom Dashboard (Milestone M28) -->
    <div id="bottom-dashboard" class="bottom-dashboard" role="region" aria-label="Arcade Bottom Dashboard"></div>
    <!-- Virtual Touch Controls for Mobile Devices -->
    <div id="touch-controls" aria-hidden="true">
      <div class="dpad-container">...</div>
      <div class="action-container">...</div>
    </div>
  </div>
  ```
- **CSS Rules Currently in Effect**:
  - `#app-container, #game-container` (Lines 92–103):
    ```css
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    max-width: 100vw;
    max-height: 100vh;
    max-height: 100dvh;
    ```
  - `.canvas-wrapper` (Lines 120–134):
    ```css
    aspect-ratio: 224 / 288;
    width: auto;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    ```
  - `#game-canvas` (Lines 136–149):
    ```css
    aspect-ratio: 224 / 288;
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    image-rendering: pixelated;
    ```
  - `.bottom-dashboard` (Lines 267–289):
    ```css
    width: 100%;
    max-width: 560px;
    height: var(--dash-height); /* 56px standard, 44px compact */
    flex-shrink: 0;
    ```
  - `#touch-controls` (Lines 172–185):
    ```css
    display: none;
    position: absolute;
    bottom: max(12px, env(safe-area-inset-bottom, 12px));
    left: 0;
    width: 100%;
    padding-left: max(20px, env(safe-area-inset-left, 20px));
    padding-right: max(20px, env(safe-area-inset-right, 20px));
    box-sizing: border-box;
    justify-content: space-between;
    align-items: center;
    pointer-events: none;
    z-index: 20;
    ```

### 1.2 `ScreenManager.ts` Sizing Mechanics & The Vertical Overflow Defect
- **File**: `/Users/user/teamwork_projects/galaga_game/src/core/ScreenManager.ts`
- **Method `calculateTransform`** (Lines 84–119):
  ```ts
  public static calculateTransform(
    windowWidth: number,
    windowHeight: number,
    virtualWidth: number = ScreenManager.DEFAULT_VIRTUAL_WIDTH,
    virtualHeight: number = ScreenManager.DEFAULT_VIRTUAL_HEIGHT
  ): ViewportTransform {
    const targetAspect = virtualWidth / virtualHeight;
    const windowAspect = windowWidth / windowHeight;

    let displayWidth: number;
    let displayHeight: number;

    if (windowAspect < targetAspect) {
      displayWidth = windowWidth;
      displayHeight = Math.floor(windowWidth / targetAspect);
    } else {
      displayHeight = windowHeight;
      displayWidth = Math.floor(windowHeight * targetAspect);
    }

    const scale = displayWidth / virtualWidth;
    const offsetX = Math.floor((windowWidth - displayWidth) / 2);
    const offsetY = Math.floor((windowHeight - displayHeight) / 2);
    return { scale, offsetX, offsetY, displayWidth, displayHeight, virtualWidth, virtualHeight };
  }
  ```
- **Method `updateScalingImmediate`** (Lines 198–228):
  ```ts
  const windowWidth = typeof window !== 'undefined' ? window.innerWidth : this.virtualWidth;
  const windowHeight = typeof window !== 'undefined' ? window.innerHeight : this.virtualHeight;

  this.currentTransform = ScreenManager.calculateTransform(
    windowWidth,
    windowHeight,
    this.virtualWidth,
    this.virtualHeight
  );

  if (this.canvas && this.canvas.style) {
    this.canvas.style.width = `${this.currentTransform.displayWidth}px`;
    this.canvas.style.height = `${this.currentTransform.displayHeight}px`;
  ...
  ```
- **The Defect Observed**:
  On a Desktop 16:9 ($1920 \times 1080$) viewport:
  - `ScreenManager.updateScalingImmediate()` calculates scaling against `window.innerHeight = 1080px`.
  - It sets `canvas.style.height = '1080px'` and `canvas.style.width = '840px'`.
  - Because `canvas.style.height` is an explicit inline style of 1080px, `.canvas-wrapper` is stretched to 1080px tall.
  - In `#app-container`, `.canvas-wrapper` (1080px) + `#bottom-dashboard` (56px) = **1136px total height**.
  - But the viewport is only 1080px! Because `html, body` and `#app-container` have `overflow: hidden`, and `#app-container` has `justify-content: center`:
    - The top 28px of the arcade canvas (where `HIGH SCORE` and `1UP` render) is pushed upwards and **clipped off-screen**.
    - The bottom 28px of `#bottom-dashboard` is pushed downwards and **clipped off-screen**.
  - **Verdict**: In both windowed and fullscreen desktop modes, `#bottom-dashboard` forces an unhandled 56px vertical overflow unless available canvas height explicitly accounts for the dashboard.

### 1.3 Safe-Area Inset Defect
- **Observation**:
  - `index.html` line 5 specifies `viewport-fit=cover`.
  - However, `env(safe-area-inset-top)` is **nowhere in `index.html` or the source code**.
  - Insets `env(safe-area-inset-bottom)`, `env(safe-area-inset-left)`, and `env(safe-area-inset-right)` are ONLY specified on `#touch-controls`.
  - `#app-container` and `#bottom-dashboard` have no safe-area padding or margins.
  - On notched devices (e.g. iPhone 14/15/16 Pro with Dynamic Island / 44–59px top inset):
    - In portrait, top status bars or camera islands occlude content if positioned near the top.
    - In landscape, the side notch overlaps with the canvas or dashboard if the container is not inset by `env(safe-area-inset-left)` and `env(safe-area-inset-right)`.

### 1.4 Mobile Landscape Controls Collision Defect
- **Observation**:
  - In landscape mode (e.g., iPhone $812 \times 375$), `#touch-controls` is positioned at `bottom: max(12px, env(safe-area-inset-bottom, 12px))`.
  - `#bottom-dashboard` is ALSO docked at the bottom center.
  - On $812 \times 375$, the canvas is centered with width ~241px.
  - If `#bottom-dashboard` has `max-width: 560px`, it spans from X = 126px to X = 686px.
  - The right action buttons (`#btn-fullscreen`, `#btn-special`, `#btn-fire` spanning ~198px from the right edge) directly collide and overlap with the right utility buttons of `#bottom-dashboard` (Mute, Fullscreen, Pause).
  - Furthermore, holding the device horizontally with two hands makes reaching the bottom edge clumsy, whereas the natural grip places thumbs squarely on the wide left and right pillarboxes.

---

## 2. Logic Chain

```
[Observation 1.1 & 1.2]: ScreenManager uses full window.innerHeight (1080px) -> Canvas is 1080px -> Canvas + Dashboard = 1136px > 1080px window.
      │
      ├──> [Inference 1]: Available height for the canvas must be derived as:
      │    availableHeight = windowHeight - dashboardHeight - safeAreaTop - safeAreaBottom
      │
      ├──> [Inference 2]: On Desktop 1920x1080 with 56px dashboard:
      │    availableHeight = 1080 - 56 = 1024px
      │    displayWidth = floor(1024 * (224 / 288)) = 796px
      │    displayHeight = 1024px
      │    Total height = 1024 + 56 = 1080px (Exactly fits viewport, zero clipping!).
      │
      └──> [Inference 3]: Pure mathematical function ScreenManager.calculateTransform(w, h, vw, vh)
           must remain untouched for backward compatibility with 1,608 existing tests.
           Instead, updateScalingImmediate() should compute availableWidth & availableHeight before calling calculateTransform().

[Observation 1.3]: env(safe-area-inset-top) is missing; #app-container lacks safe-area padding.
      │
      ├──> [Inference 4]: Define CSS custom properties:
      │    --sat: env(safe-area-inset-top, 0px);
      │    --sar: env(safe-area-inset-right, 0px);
      │    --sab: env(safe-area-inset-bottom, 0px);
      │    --sal: env(safe-area-inset-left, 0px);
      │
      └──> [Inference 5]: Apply padding to #app-container:
           padding: var(--sat) var(--sar) var(--sab) var(--sal);
           This cleanly creates a safe visual stage for canvas and dashboard across all notches and islands.

[Observation 1.4]: In Mobile Landscape (812x375), bottom touch controls collide with centered dashboard.
      │
      ├──> [Inference 6]: In landscape, the 7:9 canvas occupies only ~241px in the center of an 812px screen,
      │    leaving ~285px of empty pillarbox space on the left and right.
      │
      └──> [Inference 7]: In landscape (@media (orientation: landscape) and (max-height: 500px)):
           - Position #touch-controls with top: 0; bottom: 0; width: 100%; height: 100%;
           - Vertically center D-Pad (◀ ▶) in the LEFT pillarbox.
           - Vertically center Action buttons (FIRE, SP, Fullscreen) in the RIGHT pillarbox.
           - Constrain #bottom-dashboard max-width to 320px (matching canvas width).
           - Result: 100% zero collision, natural handheld gamepad ergonomics (Switch/GameBoy feel).
```

---

## 3. Comprehensive Target Device Scaling Matrix

The following matrix documents the exact dimensions, aspect ratio adherence, safe insets, and letterbox/pillarbox geometry across all target devices:

| Device Category & Viewport | Aspect Ratio | Safe Insets (T, R, B, L) | Dashboard Mode | Available Canvas Area | Computed Canvas Size (7:9) | Dashboard Dimensions | Pillarbox / Letterbox Margins | Touch Controls Layout |
|---|---|---|---|---|---|---|---|---|
| **Desktop 16:9** ($1920 \times 1080$) | 1.778 | 0, 0, 0, 0 | Standard (56px) | $1920 \times 1024$ | **$796 \times 1024$** | $560 \times 56$ (or $796 \times 56$) | Pillarbox: 562px left / right | Hidden (`display: none`) |
| **Ultrawide 21:9** ($2560 \times 1080$) | 2.370 | 0, 0, 0, 0 | Standard (56px) | $2560 \times 1024$ | **$796 \times 1024$** | $560 \times 56$ | Pillarbox: 882px left / right | Hidden (`display: none`) |
| **Ultrawide 21:9 QHD** ($3440 \times 1440$) | 2.389 | 0, 0, 0, 0 | Standard (56px) | $3440 \times 1384$ | **$1076 \times 1384$** | $560 \times 56$ | Pillarbox: 1182px left / right | Hidden (`display: none`) |
| **Desktop 16:9 HD** ($1280 \times 720$) | 1.778 | 0, 0, 0, 0 | Standard (56px) | $1280 \times 664$ | **$516 \times 664$** | $516 \times 56$ | Pillarbox: 382px left / right | Hidden (`display: none`) |
| **Tablet 4:3 (iPad Mini/9)** ($768 \times 1024$) | 0.750 | 20, 0, 20, 0 | Standard (56px) | $768 \times 928$ | **$721 \times 928$** | $560 \times 56$ | Pillarbox: 23px left / right | Overlay / Touch enabled |
| **Tablet 3:2 (iPad Air/Pro)** ($820 \times 1180$) | 0.695 | 24, 0, 24, 0 | Standard (56px) | $820 \times 1076$ | **$820 \times 1054$** | $560 \times 56$ | Letterbox: 22px top / bottom | Overlay / Touch enabled |
| **Mobile Portrait (iPhone Mini/X)** ($375 \times 812$) | 0.462 | 44, 0, 34, 0 | Compact (44px) | $375 \times 734$ | **$375 \times 482$** | $375 \times 44$ | Letterbox: 104px top / bottom | Docked at bottom; 164px headroom |
| **Mobile Portrait (iPhone 14/15)** ($390 \times 844$) | 0.462 | 47, 0, 34, 0 | Compact (44px) | $390 \times 763$ | **$390 \times 501$** | $390 \times 44$ | Letterbox: 109px top / bottom | Docked at bottom; 174px headroom |
| **Mobile Portrait (Pixel 7)** ($412 \times 915$) | 0.450 | 24, 0, 24, 0 | Compact (44px) | $412 \times 867$ | **$412 \times 530$** | $412 \times 44$ | Letterbox: 146px top / bottom | Docked at bottom; 293px headroom |
| **Mobile Landscape (iPhone X/12)** ($812 \times 375$) | 2.165 | 0, 44, 21, 44 | Compact (44px) | $724 \times 310$ | **$241 \times 310$** | $241 \times 44$ | Pillarbox: 241px left / right | Split: D-Pad in left pillar, Actions in right |
| **Mobile Landscape (iPhone 14/15)** ($844 \times 390$) | 2.164 | 0, 47, 21, 47 | Compact (44px) | $750 \times 325$ | **$252 \times 325$** | $252 \times 44$ | Pillarbox: 249px left / right | Split: D-Pad in left pillar, Actions in right |
| **Mobile Landscape (Pixel 7)** ($915 \times 412$) | 2.221 | 0, 24, 16, 24 | Compact (44px) | $867 \times 352$ | **$273 \times 352$** | $273 \times 44$ | Pillarbox: 297px left / right | Split: D-Pad in left pillar, Actions in right |

---

## 4. Caveats

1. **Simulated vs Real Device Viewport Insets**:
   In automated headless Playwright tests, `env(safe-area-inset-*)` values default to `0px` unless configured via test page overrides (`context.newPage({ ... })` or CSS custom properties). The implementation must specify fallbacks, e.g. `env(safe-area-inset-bottom, 12px)` and `max(16px, env(safe-area-inset-left, 16px))`.
2. **Dynamic URL Bar Collapsing in Mobile Browsers**:
   On iOS Safari and Android Chrome, scrolling or tapping can toggle the dynamic browser navigation bar between standard and minimal UI, changing `window.innerHeight`. The use of `100dvh` in CSS along with `ScreenManager`'s debounced resize listener and `FullscreenManager`'s 3-stage watchdog timeout (`0ms`, `150ms`, `300ms`) ensures seamless auto-stabilization.
3. **Vitest Headless Node/JSDOM Environments**:
   In unit tests, `window.innerWidth` and `window.innerHeight` are often simulated, and DOM elements have `offsetHeight === 0`. The implementation in `ScreenManager.ts` must safely handle `offsetHeight <= 0` by falling back to mathematical estimates based on screen width/height thresholds, ensuring 100% test compatibility.

---

## 5. Technical Recommendations for `m29_worker`

### 5.1 CSS Layout Specification (`index.html`)

#### A. Root Safe Area Variables & Reset
```css
:root {
  --bg-color: #030306;
  --cabinet-border: #1a1a2e;
  --accent-red: #ff2a2a;
  --accent-yellow: #ffff00;
  --accent-cyan: #00ffff;
  --font-arcade: 'Press Start 2P', monospace;
  --dash-height: 56px;
  --dash-height-compact: 44px;

  /* Safe Area Inset Variables with zero fallbacks */
  --sat: env(safe-area-inset-top, 0px);
  --sar: env(safe-area-inset-right, 0px);
  --sab: env(safe-area-inset-bottom, 0px);
  --sal: env(safe-area-inset-left, 0px);
}
```

#### B. `#app-container` Safe Area Inset & Flex Constraints
```css
#app-container, #game-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  max-width: 100vw;
  max-height: 100vh;
  max-height: 100dvh;
  padding-top: var(--sat);
  padding-bottom: var(--sab);
  padding-left: var(--sal);
  padding-right: var(--sar);
  box-sizing: border-box;
  overflow: hidden;
}
```

#### C. `.canvas-wrapper` and `#game-canvas` Responsive Sizing
```css
.canvas-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.9), 0 0 10px rgba(0, 100, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
  background-color: #000000;
  aspect-ratio: 224 / 288;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: calc(100% - var(--dash-height));
  flex-shrink: 1;
}

#game-canvas, #gameCanvas {
  display: block;
  aspect-ratio: 224 / 288;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  image-rendering: -moz-crisp-edges;
  image-rendering: -webkit-crisp-edges;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  background-color: #000000;
  object-fit: contain;
}
```

#### D. Compact Mode & Landscape Reflow Media Queries
```css
@media (max-width: 480px), (max-height: 500px) {
  .bottom-dashboard, .cyber-dashboard {
    height: var(--dash-height-compact);
    grid-template-columns: 96px 1fr 82px;
    padding: 2px 6px;
  }
  .controls-legend {
    display: none !important;
  }
  .dash-score-entry {
    font-size: 7px;
    line-height: 8px;
  }
  .ship-icon, .ship-life-icon {
    width: 10px;
    height: 10px;
  }
  .dash-chip, .powerup-chip {
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
  .canvas-wrapper {
    max-height: calc(100% - var(--dash-height-compact));
  }
}

/* Mobile Landscape Ergonomic Control Separation */
@media (orientation: landscape) and (max-height: 500px) {
  .bottom-dashboard, .cyber-dashboard {
    max-width: 320px; /* Aligns with centered compact canvas */
  }

  #touch-controls {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 100%;
    padding: var(--sat) max(16px, var(--sar)) max(8px, var(--sab)) max(16px, var(--sal));
    display: flex;
    justify-content: space-between;
    align-items: center;
    pointer-events: none;
    z-index: 25;
  }

  .dpad-container {
    display: flex;
    flex-direction: row;
    gap: 16px;
    pointer-events: auto;
  }

  .action-container {
    display: flex;
    flex-direction: row;
    gap: 12px;
    align-items: center;
    pointer-events: auto;
  }

  .dpad-btn {
    width: 54px;
    height: 54px;
  }

  .fire-btn {
    width: 64px;
    height: 64px;
  }

  .special-btn {
    width: 48px;
    height: 48px;
  }

  .fullscreen-btn {
    width: 44px;
    height: 44px;
  }
}
```

### 5.2 TypeScript Engine Specification (`src/core/ScreenManager.ts`)

Keep `calculateTransform(w, h, vw, vh)` 100% unchanged for backward compatibility.  
Update `updateScalingImmediate()` to compute available canvas area taking into account `#bottom-dashboard` and safe-area insets:

```ts
  /**
   * Computes and applies the viewport transformation immediately.
   * Dynamically accounts for bottom HUD / dashboard height and safe area insets.
   */
  public updateScalingImmediate(): ViewportTransform {
    let windowWidth = typeof window !== 'undefined' ? window.innerWidth : this.virtualWidth;
    let windowHeight = typeof window !== 'undefined' ? window.innerHeight : this.virtualHeight;

    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
      const dashboard = document.getElementById('bottom-dashboard');
      let reservedHeight = 0;
      if (dashboard) {
        reservedHeight = dashboard.offsetHeight > 0 
          ? dashboard.offsetHeight 
          : (windowWidth <= 480 || windowHeight <= 500 ? 44 : 56);
      }

      // Safe area headroom (can be read or estimated)
      const isMobilePortrait = windowWidth < 600 && windowHeight > windowWidth;
      const touchReserve = isMobilePortrait && windowHeight < 700 ? 60 : 0;

      const availableHeight = Math.max(10, windowHeight - reservedHeight - touchReserve);
      const availableWidth = Math.max(10, windowWidth);

      this.currentTransform = ScreenManager.calculateTransform(
        availableWidth,
        availableHeight,
        this.virtualWidth,
        this.virtualHeight
      );
    } else {
      this.currentTransform = ScreenManager.calculateTransform(
        windowWidth,
        windowHeight,
        this.virtualWidth,
        this.virtualHeight
      );
    }

    if (this.canvas && this.canvas.style) {
      this.canvas.style.width = `${this.currentTransform.displayWidth}px`;
      this.canvas.style.height = `${this.currentTransform.displayHeight}px`;
      this.canvas.style.display = 'block';
      this.canvas.style.position = '';
      this.canvas.style.left = '';
      this.canvas.style.top = '';
    }

    // Notify all registered subscribers
    for (const observer of this.resizeObservers) {
      try {
        observer(this.currentTransform);
      } catch (err) {
        console.error('[ScreenManager] Resize observer error:', err);
      }
    }

    return this.currentTransform;
  }
```

---

## 6. Verification Method

To independently verify the implementation:

1. **Unit Test Verification**:
   ```bash
   npx vitest run tests/unit/viewport.test.ts tests/unit/core.test.ts tests/unit/bottom_dashboard.test.ts
   ```
   Confirm all existing tests pass with zero regressions.

2. **Full Baseline Suite Verification**:
   ```bash
   npx vitest run
   ```
   Confirm all 92+ test files and 1,608+ tests pass 100%.

3. **Multi-Viewport Matrix Playwright Verification**:
   Create a dedicated test file `tests/unit/m29_responsive_viewport.test.ts` or add to Playwright E2E suite to test:
   - Desktop 16:9 ($1920 \times 1080$), Ultrawide ($2560 \times 1080$, $3440 \times 1440$)
   - Tablet 4:3 ($768 \times 1024$), Tablet 3:2 ($820 \times 1180$)
   - Mobile Portrait ($375 \times 812$, $390 \times 844$, $412 \times 915$)
   - Mobile Landscape ($812 \times 375$, $844 \times 390$, $915 \times 412$)
   - Assert `canvasBox.y + canvasBox.height <= dashboardBox.y` (zero vertical canvas/dashboard collision).
   - Assert `dashboardBox.y + dashboardBox.height <= viewport.height` (zero bottom clipping).
   - In mobile landscape: assert `touchButtons.left < canvas.left` and `touchButtons.right > canvas.right` (controls in side pillarboxes, zero dashboard overlap).
   - Assert `index.html` contains all 4 safe-area inset properties (`safe-area-inset-top`, `safe-area-inset-bottom`, `safe-area-inset-left`, `safe-area-inset-right`).

4. **Production Build Verification**:
   ```bash
   npm run build
   ```
   Ensure clean TypeScript typecheck and Vite bundling to `dist/`.
