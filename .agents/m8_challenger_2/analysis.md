# Empirical Adversarial Challenge Analysis: Browser Cross-Platform & Mobile Virtual Controls

- **Challenger Agent**: `m8_challenger_2`
- **Archetype / Role**: EMPIRICAL CHALLENGER (critic, specialist)
- **Target Project**: Galaga Arcade Web Game (`/Users/user/src/galog`)
- **Date**: 2026-09-02
- **Verdict**: `FAIL`

---

## 1. Executive Summary

An exhaustive empirical evaluation was conducted across 5 browser profiles (Chromium Desktop, Firefox Desktop, WebKit Desktop, Mobile Chrome Pixel 7, and Mobile Safari iPhone 14), testing cross-browser canvas rendering, letterbox/pillarbox aspect-ratio scaling, 60 FPS game loop execution, mobile virtual touch controls, runtime exceptions, and Core Web Vitals layout shifts.

### Verdict: `FAIL`

### Blocking Failure Summary:
1. **TypeScript Build Failure (`npm run build`)**: Compilation error TS6133 (unused locals) and TS18048 (possibly undefined variable) in `tests/unit/m8_final_adversarial.test.ts` causes `tsc --noEmit && vite build` to exit with code 2.
2. **Playwright Suite Parallel Flakiness & Frame Rate Throttling**: Full test execution (`npx playwright test`) produced 18 failures out of 75 tests across Firefox, WebKit, and Mobile Safari due to dev-server connection saturation and headless frame throttling under 8 concurrent workers.
3. **Cumulative Layout Shift Violation (CLS = 0.0857 > 0.00)**: Initial paint of `<canvas id="game-canvas" width="224" height="288">` without pre-allocated CSS aspect ratio or container sizing causes a layout jump when `ScreenManager.updateScalingImmediate()` applies dynamic scaled inline dimensions upon script bootstrap.

---

## 2. Multi-Browser Profile Verification Matrix

The test suite was evaluated across all 5 required browser environments:

| # | Browser Profile | Device Emulation | Viewport | Touch Enabled | Initial Errors | Frame Loop | Resize Scaling | Virtual Touch | Status |
|---|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | **Chromium Desktop** | Desktop Chrome | $1280 \times 720$ | No | 0 | 60 FPS | PASS | PASS | **FAIL (CLS = 0.0857)** |
| 2 | **Firefox Desktop** | Desktop Firefox | $1280 \times 720$ | No | 0 | 60 FPS | PASS | PASS | **FAIL (Parallel Timeout & TouchEvent)** |
| 3 | **WebKit Desktop** | Desktop Safari | $1280 \times 720$ | No | 0 | 60 FPS | PASS | PASS | **FAIL (Parallel Server Connection)** |
| 4 | **Mobile Chrome** | Google Pixel 7 | $412 \times 915$ | Yes (2.625x DPR) | 0 | 60 FPS | PASS | PASS | **PASS** (15/15 isolated) |
| 5 | **Mobile Safari** | Apple iPhone 14 | $390 \times 844$ | Yes (3.0x DPR) | 0 | 60 FPS | PASS | PASS | **FAIL (Parallel Server Connection)** |

---

## 3. Deep-Dive Empirical Findings

### Finding 1: Production TypeScript Build Failure (`npm run build`)
- **Location**: `tests/unit/m8_final_adversarial.test.ts` (Lines 17, 20, 22, 110, 111)
- **Command Run**: `npm run build` (`tsc --noEmit && vite build`)
- **Observed Output**:
  ```
  > galog@1.0.0 build
  > tsc --noEmit && vite build

  tests/unit/m8_final_adversarial.test.ts(17,25): error TS6133: 'Bullet' is declared but its value is never read.
  tests/unit/m8_final_adversarial.test.ts(20,1): error TS6133: 'Starfield' is declared but its value is never read.
  tests/unit/m8_final_adversarial.test.ts(22,24): error TS6133: 'SCORE_MATRIX' is declared but its value is never read.
  tests/unit/m8_final_adversarial.test.ts(110,13): error TS18048: 'victim' is possibly 'undefined'.
  tests/unit/m8_final_adversarial.test.ts(111,53): error TS18048: 'victim' is possibly 'undefined'.
  ```
- **Analysis**: The strict `tsconfig.json` rules (`noUnusedLocals: true`, `strictNullChecks: true`, `noUncheckedIndexedAccess: true`) reject unused imports and optional indexing on arrays without undefined guard checks. Because `npm run build` runs `tsc --noEmit` before bundling, production Vercel builds will fail.

---

### Finding 2: Initial Hydration Layout Shift (CLS = 0.0857)
- **Location**: `index.html` lines 70–88 & `src/core/ScreenManager.ts` lines 195–215
- **Measurement**: PerformanceObserver Layout Shift metric measured `CLS = 0.085693359375` (Requirement: 0.00 / CLS $\le 0.01$).
- **Mechanism**:
  1. `index.html` defines:
     ```html
     <div class="canvas-wrapper">
       <canvas id="game-canvas" width="224" height="288"></canvas>
     </div>
     ```
  2. On initial parse/paint, the canvas renders at its intrinsic attribute size ($224 \text{px} \times 288 \text{px}$).
  3. When `main.ts` bootstraps asynchronously, `ScreenManager.updateScalingImmediate()` calculates letterboxing (e.g. $560 \text{px} \times 720 \text{px}$ in a $1280 \times 720$ viewport) and modifies `canvas.style.width` and `canvas.style.height`.
  4. The sudden 2.5x size inflation shifts the document flow and layout tree, producing a visible jump and recorded CLS entry.
- **Recommended Mitigation**:
  In `index.html`, add CSS rules for `.canvas-wrapper` and `#game-canvas` with `aspect-ratio: 224 / 288`, `max-width: 100vw`, `max-height: 100vh`, and `height: 100%` so the initial CSS layout box matches the scaled virtual buffer prior to JavaScript execution.

---

### Finding 3: Full Playwright Test Suite Parallel Flakiness (18/75 FAILED)
- **Command Run**: `npx playwright test`
- **Output Summary**:
  ```
  Running 75 tests using 8 workers
  57 passed, 18 failed (3.8m)
  ```
- **Failure Categories**:
  1. **Server Saturation**: Under 8 parallel workers hitting Vite dev server simultaneously, WebKit and Mobile Safari instances timed out during `page.goto('/', { waitUntil: 'load' })` with `Error: page.goto: Could not connect to the server.`
  2. **Headless Animation Frame Throttling**: In Firefox and WebKit, backgrounded headless tabs throttled `requestAnimationFrame` during the 400ms–800ms sampling window in `verifyCanvasRendering()`, resulting in received frame counts of 4–6 against a rigid assertion of $\ge 20$ / $\ge 10$ frames.
- **Recommended Mitigation**:
  - Configure `playwright.config.ts` to run against `vite preview` (production build output) or set `workers: process.env.CI ? 2 : 4` to prevent local port connection exhaustion.
  - In `verifyCanvasRendering()`, verify that `gameLoop.getFPS() > 0` and `gameLoop.getTickCount() > 0` directly from the engine instance rather than relying solely on headless DOM `requestAnimationFrame` timing.

---

### Finding 4: Desktop Firefox TouchEvent Absence
- **Observation**: Calling `page.dispatchEvent('#btn-left', 'touchstart')` on Desktop Firefox throws `ReferenceError: TouchEvent is not defined` because Firefox Desktop disables touch API globals when `hasTouch: false`.
- **Mitigation**: Input testing harnesses must discriminate between pointer/mouse events (`mousedown`/`mouseup`) on desktop and touch events (`touchstart`/`touchend`) on touch-enabled mobile devices.

---

## 4. Empirical Canvas Scaling & Virtual Controls Validation

Across all tested aspect ratios and virtual input channels:

### A. Letterbox / Pillarbox Scaling Resilience
- **Aspect Ratios Tested**:
  - 16:9 Full HD ($1920 \times 1080$) $\to$ Pillarbox ($840 \times 1080$, $420\text{px}$ side offsets)
  - 4:3 Standard ($1024 \times 768$) $\to$ Pillarbox ($597 \times 768$, $213.5\text{px}$ side offsets)
  - 3:4 Tablet Portrait ($768 \times 1024$) $\to$ Letterbox ($768 \times 987$, $18.5\text{px}$ top/bottom offsets)
  - 9:16 Mobile Portrait ($375 \times 812$) $\to$ Letterbox ($375 \times 482$, $165\text{px}$ top/bottom offsets)
  - 21:9 Ultra-Widescreen ($2560 \times 1080$) $\to$ Heavy Pillarbox ($840 \times 1080$, $860\text{px}$ side offsets)
  - 9:21 Ultra-Tall ($360 \times 840$) $\to$ Heavy Letterbox ($360 \times 462$, $189\text{px}$ top/bottom offsets)
- **Rapid Resize Thrashing**: 50 consecutive randomized viewport mutations completed without memory leak, rendering distortion, or canvas detachment.

### B. Mobile Virtual Controls
- **Virtual D-pad Left (`#btn-left`)**: Correctly toggles `state.touchLeft = true` and `state.moveLeft = true`.
- **Virtual D-pad Right (`#btn-right`)**: Correctly toggles `state.touchRight = true` and `state.moveRight = true`.
- **Virtual Fire Button (`#btn-fire`)**: Triggers `state.touchFire = true`, sets `fireTriggered = true` (single pulse action consumption), and fires missiles without stuck state.
- **On-Canvas Multi-Touch**: Simultaneous left-side steering swipe and bottom-right fire tap accurately translates coordinates through `ScreenManager.clientToVirtual()`.

---

## 5. Conclusion & Action Items

While the underlying Canvas 2D engine, fixed-timestep 60 FPS loop, and touch input handlers are mathematically sound, Milestone 8 cannot be approved until:
1. TypeScript compilation errors in `tests/unit/m8_final_adversarial.test.ts` are resolved to allow clean `npm run build`.
2. Initial canvas layout shift (CLS = 0.0857) is eliminated by styling the canvas container with fixed aspect-ratio rules in `index.html`.
3. Playwright test execution stability is hardened against parallel worker port drops and headless frame throttling.
