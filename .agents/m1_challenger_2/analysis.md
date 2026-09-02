# Milestone 1 Runtime & Dev Server Challenge Analysis

**Challenger**: `m1_challenger_2` (Empirical Challenger)  
**Target Milestone**: Milestone 1 (Project Setup, Build, Dev/Preview Server & Core Foundation)  
**Date**: 2026-09-02  
**Verdict**: `FAIL` (2 Critical Defects Discovered & Empirically Verified)

---

## 1. Executive Summary

An adversarial empirical verification of the Milestone 1 runtime, dev/preview server capability, static distribution assets, DOM canvas mounting, and letterbox layout geometry was conducted against `dist/` and `index.html`.

While the static build pipeline (`npm run build`), preview serving (`npm run preview`), relative asset bundling (`./assets/index-*.js`), and Vercel headers (`vercel.json`) operate without 404s, **two high-severity defects were uncovered and empirically verified**:
1. **DOM Selector Mismatch (`#game-canvas` vs `id="gameCanvas"`)**: `index.html` renders `<canvas id="gameCanvas">` and `src/main.ts` targets `CANVAS_ID = 'gameCanvas'`, while the Milestone 1 task contract and entire E2E test suite target `#game-canvas`. As a result, E2E test automation and standalone runners fail immediately (`canvasFound: false`, exit code 1).
2. **Canvas Double-Offset / Viewport Displacement Defect**: `index.html` uses CSS Flexbox centering (`align-items: center; justify-content: center;` with `position: relative` on `.canvas-wrapper`), but `src/main.ts` applies `canvas.style.position = 'absolute'` with viewport-level centering offsets `(offsetX, offsetY)`. This causes the canvas to be centered once by flexbox and shifted a second time by `(offsetX, offsetY)`, pushing the canvas completely off-center and outside the viewport across **100% of tested screen resolutions**.

---

## 2. Empirical Verification Matrix

| # | Verification Area | Claim / Expectation | Actual Empirical Result | Status |
|---|---|---|---|---|
| **V1** | Static Build | `npm run build` generates `dist/` with 0 errors | `tsc --noEmit && vite build` built in 306ms, exited code 0 | **PASS** |
| **V2** | Static Preview Server | `npm run preview` serves `dist/` on port 3000 | Responded HTTP 200 OK on `http://localhost:3000/` | **PASS** |
| **V3** | Relative Asset Resolution | No 404s on scripts/styles, relative links in `dist/index.html` | `<script src="./assets/index-C_23zRfY.js">` loaded HTTP 200 OK, MIME `text/javascript` | **PASS** |
| **V4** | Vercel & Security Headers | CSP, X-Frame-Options, MIME sniff prevention | Configured in `vercel.json` with strict CSP and asset cache controls | **PASS** |
| **V5** | Canvas Element ID Binding | `index.html` canvas element `#game-canvas` exists | Canvas has `id="gameCanvas"`; `#game-canvas` locator returns 0 elements | **FAIL** |
| **V6** | E2E Runner Execution | `npx tsx tests/e2e/standalone-runner.ts` passes | Exited with code 1 (`canvasFound: false`, `passed: false`) | **FAIL** |
| **V7** | 3:4 Letterbox Centering | Canvas fits within viewport and is centered | Canvas has double offset from flexbox + absolute styles, overflows viewport | **FAIL** |

---

## 3. Detailed Failure Findings

### Finding 1: DOM ID Selector Inconsistency (`#game-canvas` vs `id="gameCanvas"`)
- **Severity**: HIGH (Automated Test & Contract Breakage)
- **Observations**:
  - `index.html` line 176: `<canvas id="gameCanvas" width="224" height="288" ...>`
  - `src/main.ts` line 21: `export const CANVAS_ID = 'gameCanvas';`
  - `tests/e2e/browser.test.ts` line 36: `const canvas = page.locator('#game-canvas');`
  - `tests/e2e/standalone-runner.ts` line 84: `const canvasElement = page.locator('#game-canvas');`
- **Empirical Proof**:
  - Running `npx tsx tests/e2e/standalone-runner.ts` against the live preview server produced:
    ```json
    {
      "httpStatus": 200,
      "canvasFound": false,
      "runtimeErrors": [],
      "passed": false
    }
    ```
  - Running `npx playwright test tests/e2e/browser.test.ts:31 --project=chromium` failed with:
    ```
    Error: expect(locator).toBeAttached() failed
    Locator: locator('#game-canvas')
    Expected: attached
    Timeout: 5000ms
    Error: element(s) not found
    ```
- **Remediation Recommendation**:
  - Standardize canvas ID to `game-canvas` in `index.html` (`<canvas id="game-canvas">`), `src/main.ts` (`export const CANVAS_ID = 'game-canvas'`), and CSS (`#game-canvas { ... }`).

---

### Finding 2: Canvas Geometry & Viewport Double-Centering Offset Bug
- **Severity**: HIGH (Visual & Gameplay Layout Defect)
- **Observations**:
  - `index.html` CSS:
    ```css
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    #app-container {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .canvas-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    ```
  - `src/main.ts` lines 87-94 (`applyCanvasScaling`):
    ```ts
    canvas.style.width = `${transform.displayWidth}px`;
    canvas.style.height = `${transform.displayHeight}px`;
    canvas.style.left = `${transform.offsetX}px`;
    canvas.style.top = `${transform.offsetY}px`;
    canvas.style.position = 'absolute';
    ```
- **The Defect**:
  - `offsetX` and `offsetY` are calculated in `src/main.ts` as `Math.floor((windowWidth - displayWidth) / 2)` and `Math.floor((windowHeight - displayHeight) / 2)`. This represents an absolute coordinate offset from the top-left $(0, 0)$ of the entire viewport.
  - However, the canvas DOM element is a child of `.canvas-wrapper`, which is positioned at the flex center of the viewport $(windowWidth / 2, windowHeight / 2)$ with `position: relative`.
  - Setting `canvas.style.left = offsetX` shifts the canvas *starting from the flex-centered parent*, effectively applying the offset twice!
- **Empirical Geometry Measurements via Playwright**:
  - **1080p (1920x1080)**:
    - Expected Bounding Box: `x: 540, y: 0, width: 840, height: 1080`
    - Actual Bounding Box: `x: 1500, y: 540, right: 2340, bottom: 1620`
    - `fitsInViewport`: **false** (overflows viewport by 420px on right, 540px on bottom)
  - **720p (1280x720)**:
    - Expected Bounding Box: `x: 360, y: 0, width: 560, height: 720`
    - Actual Bounding Box: `x: 1000, y: 360, right: 1560, bottom: 1080`
    - `fitsInViewport`: **false** (overflows viewport by 280px on right, 360px on bottom)
  - **iPad Portrait (768x1024)**:
    - Actual Bounding Box: `x: 384, y: 530, right: 1152, bottom: 1517`
    - `fitsInViewport`: **false**
  - **Mobile Portrait (375x812)**:
    - Actual Bounding Box: `x: 187.5, y: 571, right: 562.5, bottom: 1053`
    - `fitsInViewport`: **false**
  - **Mobile Landscape (812x375)**:
    - Actual Bounding Box: `x: 666, y: 187.5, right: 957, bottom: 562.5`
    - `fitsInViewport`: **false**
- **Remediation Recommendation**:
  - Choose one layout paradigm:
    - **Option A (Pure CSS Flexbox centering)**: Let `.canvas-wrapper` and flexbox handle centering. In `applyCanvasScaling()`, only set `width` and `height`, and remove `position: absolute`, `left`, and `top`.
    - **Option B (Absolute pixel coordinate letterboxing)**: Make `#app-container` or `.canvas-wrapper` occupy `position: absolute; top: 0; left: 0; width: 100%; height: 100%` without flexbox centering, allowing `left: offsetX` and `top: offsetY` to position the canvas directly.

---

## 4. Final Verdict

- **Milestone 1 Dev Server & Runtime Verdict**: **`FAIL`**
- Reason: Although build and static asset serving work cleanly, the canvas ID mismatch breaks all E2E automation and the double-centering offset bug pushes the game canvas off-screen on all devices. Both issues must be resolved before proceeding to Milestone 2.
