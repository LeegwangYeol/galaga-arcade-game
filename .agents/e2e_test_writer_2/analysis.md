# E2E Test Suite Analysis & Architecture Design: Browser Runtime & Playwright Verification

**Author**: `e2e_test_writer_2` (E2E Testing Track: Browser Runtime & Playwright Architect)  
**Date**: 2026-09-02  
**Target Application**: Galaga Arcade Web Game (`galog`)  
**Interface Contracts**: `PROJECT.md`, `TEST_INFRA.md`, `ORIGINAL_REQUEST.md`

---

## 1. Executive Summary & Testing Philosophy

In accordance with `ORIGINAL_REQUEST.md` (§R1, §R2, Acceptance Criteria) and `TEST_INFRA.md`, automated browser-level E2E verification is essential to prove that the Galaga arcade web application loads cleanly in modern web browsers, attaches the rendering canvas to the DOM with strict aspect ratio preservation, executes an active 60 FPS fixed-timestep game loop without dropping frames, and incurs **strictly zero JavaScript runtime errors or unhandled exceptions**.

The test harness is designed using an **opaque-box paradigm**:
- It does not rely on private JavaScript variables or internals.
- It observes public DOM nodes, HTTP responses, visual frame rendering, canvas pixel deltas, and standard browser event streams (`pageerror`, `console.error`, `touchstart`, `keydown`).
- It tests across desktop browsers (Chromium, Firefox, WebKit) and mobile devices (Mobile Chrome Pixel 5, Mobile Safari iPhone 12).

---

## 2. Test Inventory & Traceability Matrix

| Test ID | Test Name | Target Invariant / Requirement | Tier | File |
|---|---|---|:---:|---|
| **TC-E2E-01** | Page Load & HTTP 200 Status | Server responds with HTTP 200 and `text/html` content type | Tier 1 | `tests/e2e/browser.test.ts` |
| **TC-E2E-02** | Canvas DOM Attachment & Aspect Ratio | `#game-canvas` attached, visible, $224 \times 288$ native or $448 \times 576$ buffer (7:9 ratio) | Tier 1 | `tests/e2e/browser.test.ts` |
| **TC-E2E-03** | Zero Runtime Errors & Console Errors | 0 `pageerror`, 0 `console.error`, 0 unhandled rejections during $\ge 2.5\text{s}$ execution | Tier 1 | `tests/e2e/browser.test.ts` |
| **TC-E2E-04** | 60 FPS Game Loop Active Ticking | `requestAnimationFrame` ticking ($\ge 30\text{ FPS}$) and starfield pixel animation active | Tier 1 | `tests/e2e/browser.test.ts` |
| **TC-E2E-05** | Keyboard Input Controls Dispatch | `ArrowLeft`, `ArrowRight`, `Space`, `WASD`, `KeyZ`, `KeyK` dispatch cleanly | Tier 1 | `tests/e2e/browser.test.ts` |
| **TC-E2E-06** | State Transition & Pause Controls | `Enter` to start, `Escape` / `KeyP` to pause and resume | Tier 1 | `tests/e2e/browser.test.ts` |
| **TC-E2E-07** | Mobile Touch & Pointer Interaction | Virtual joystick drag and fire tap with `preventDefault()` on mobile viewport | Tier 1 | `tests/e2e/browser.test.ts` |
| **TC-E2E-08** | Adversarial Multi-Key Input Bursting | Simultaneous contradictory inputs (Left + Right + Space + KeyZ) under high frequency | Tier 2 | `tests/e2e/browser.test.ts` |
| **TC-E2E-09** | Multi-Viewport Resizing & Letterboxing | Scaling across 1080p, 720p, tablet portrait, and mobile portrait/landscape | Tier 2 | `tests/e2e/browser.test.ts` |
| **TC-E2E-10** | Tab Visibility & Focus/Blur Resilience | Backgrounding tab via `visibilitychange` / `blur` and smooth loop recovery on `focus` | Tier 2 | `tests/e2e/browser.test.ts` |
| **TC-E2E-11** | Title to Game Start Transition | Seamless transition from attract/title mode into stage gameplay | Tier 3/4 | `tests/e2e/gameplay.test.ts` |
| **TC-E2E-12** | Continuous Movement & Missile Firing | Ship traversing bounds and missile cooldown rate verification | Tier 3/4 | `tests/e2e/gameplay.test.ts` |
| **TC-E2E-13** | Pause State Loop Freeze & Resume | Clock freezing during pause, no physics advancement, clean unpause | Tier 3/4 | `tests/e2e/gameplay.test.ts` |
| **TC-E2E-14** | High Score LocalStorage Recovery | Saving and retrieving `galaga_high_score` across page refreshes | Tier 3/4 | `tests/e2e/gameplay.test.ts` |
| **TC-E2E-15** | Mobile Virtual Pad & Fire Button | Full touch control workflow on 375x667 mobile screen | Tier 3/4 | `tests/e2e/gameplay.test.ts` |

---

## 3. Core Architectural Modules

### 3.1. Browser Runtime & Error Collection (`tests/e2e/helpers/test-utils.ts`)
The `createErrorCollector(page: Page)` fixture subscribes to browser runtime events:
1. `pageerror`: Catches uncaught runtime exceptions (e.g. `TypeError`, `ReferenceError`, null dereferences).
2. `console`: Listens to `msg.type() === 'error'`, catching unhandled promise rejections, Web Audio API instantiation failures, and missing asset 404s.
3. Every test asserts `expect(errorCollector.getErrors()).toEqual([])`.

### 3.2. Active Frame Rendering & Game Loop Verification
Testing that a canvas game is alive cannot rely merely on static DOM presence. The test suite utilizes `verifyCanvasRendering(page, selector, durationMs)`:
1. Spawns an internal `requestAnimationFrame` sampling loop inside the browser context for the test duration (e.g., 600ms - 800ms).
2. Takes an initial snapshot via `canvas.toDataURL('image/png')`.
3. Waits for the duration and captures a second snapshot.
4. Asserts:
   - Measured frame count $\ge 25\text{ frames}$ over 800ms ($\ge 30\text{ FPS}$).
   - `snapshotStart !== snapshotEnd`, proving the parallax starfield and background canvas buffers are actively animating and redrawing.

### 3.3. Canvas Aspect Ratio & Letterbox Centering
The arcade machine standard specifies a vertical aspect ratio of $224 \times 288$ (approximately $0.7778$ or 7:9). The E2E tests inspect:
- `canvas.width` and `canvas.height` (internal logical buffer $448 \times 576$ or $224 \times 288$).
- Bounding client rect `rect.width / rect.height` confirming consistent letterboxing across varying viewports (1920x1080 down to 375x812).
- Verification that `imageRendering` CSS style preserves pixelated retro aesthetics (`pixelated` or `crisp-edges`).

### 3.4. Multi-Platform Playwright Configuration (`playwright.config.ts`)
- Automatically spawns the local development server: `npm run dev -- --port 3000`.
- Manages cross-browser matrix: Chromium, Firefox, WebKit, Mobile Chrome (Pixel 5), Mobile Safari (iPhone 12).
- Configures automated test artifacts: screenshots on failure and traces on first retry.

### 3.5. Standalone Programmatic Runner (`tests/e2e/standalone-runner.ts`)
- Provides a standalone executable script that can be run directly via `npx tsx tests/e2e/standalone-runner.ts` or integrated into CI/CD without requiring full Playwright test runner wrappers.
- Emits structured JSON diagnostics reports with HTTP status, canvas dimensions, sampled FPS, pixel animation status, and captured runtime errors.

---

## 4. Verification & Validation Strategy

1. **Pre-flight Build Check**: Validate that TypeScript types, test files, and Playwright configurations compile without syntax or type errors.
2. **Local Server Integration**: Ensure test runner connects seamlessly to `http://localhost:3000` or dynamic port via `PLAYWRIGHT_TEST_BASE_URL`.
3. **Strict Zero-Error Tolerance**: Any console error or unhandled promise rejection results in an immediate assertion failure.
