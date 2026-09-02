# Milestone 1 Handoff Report — Runtime & Dev Server Challenge

## 1. Observation

1. **Static Build & Asset Compilation**:
   - Command: `npm run build` (`tsc --noEmit && vite build`) executed with exit code 0.
   - Output: `dist/index.html` (5.33 kB), `dist/assets/index-C_23zRfY.js` (3.39 kB), `dist/assets/index-C_23zRfY.js.map` (12.13 kB).
   - In `dist/index.html` line 172: `<script type="module" crossorigin src="./assets/index-C_23zRfY.js"></script>`. Asset links resolve relatively (`./assets/`) without 404s.

2. **Dev/Preview Server Serving**:
   - Command: `npx vite preview --port 3000` served `dist/` on `http://localhost:3000/`.
   - `curl -I http://localhost:3000/` returned `HTTP/1.1 200 OK`, `Content-Type: text/html`.
   - `curl -I http://localhost:3000/assets/index-C_23zRfY.js` returned `HTTP/1.1 200 OK`, `Content-Type: text/javascript`.

3. **DOM Selector Mismatch (`#game-canvas` vs `id="gameCanvas"`)**:
   - `index.html` line 176: `<canvas id="gameCanvas" width="224" height="288" aria-label="Galaga Arcade Game Screen" role="img"></canvas>`.
   - `src/main.ts` line 21: `export const CANVAS_ID = 'gameCanvas';`.
   - `tests/e2e/browser.test.ts` lines 36-37: `const canvas = page.locator('#game-canvas'); await expect(canvas).toBeAttached();`.
   - `tests/e2e/standalone-runner.ts` line 84: `const canvasElement = page.locator('#game-canvas');`.
   - Verbatim error on `npx playwright test tests/e2e/browser.test.ts:31 --project=chromium`:
     ```
     Error: expect(locator).toBeAttached() failed
     Locator: locator('#game-canvas')
     Expected: attached
     Timeout: 5000ms
     Error: element(s) not found
     ```
   - Verbatim output on `npx tsx tests/e2e/standalone-runner.ts`:
     ```json
     {
       "httpStatus": 200,
       "canvasFound": false,
       "runtimeErrors": [],
       "consoleErrors": [],
       "passed": false
     }
     ```
     Exited with code 1.

4. **Canvas Double-Offset & Viewport Overflow**:
   - `index.html` lines 46-78 apply CSS Flexbox centering (`display: flex; align-items: center; justify-content: center;`) to `body`, `#app-container`, and `.canvas-wrapper` (with `position: relative`).
   - `src/main.ts` lines 87-94 in `applyCanvasScaling()` apply:
     `canvas.style.position = 'absolute';`
     `canvas.style.left = `${transform.offsetX}px`;`
     `canvas.style.top = `${transform.offsetY}px`;`
   - Playwright headless browser measurement across standard viewports:
     - 1080p (1920x1080): Bounding rect `x: 1500, y: 540, width: 840, height: 1080, right: 2340, bottom: 1620`. `fitsInViewport: false`.
     - 720p (1280x720): Bounding rect `x: 1000, y: 360, width: 560, height: 720, right: 1560, bottom: 1080`. `fitsInViewport: false`.
     - iPad Portrait (768x1024): Bounding rect `x: 384, y: 530, right: 1152, bottom: 1517`. `fitsInViewport: false`.
     - Mobile Portrait (375x812): Bounding rect `x: 187.5, y: 571, right: 562.5, bottom: 1053`. `fitsInViewport: false`.
     - Mobile Landscape (812x375): Bounding rect `x: 666, y: 187.5, right: 957, bottom: 562.5`. `fitsInViewport: false`.

---

## 2. Logic Chain

1. From **Observation 1 & 2**: `npm run build` and `npm run preview` generate a valid static distribution with relative URLs and 0 HTTP 404 errors.
2. From **Observation 3**: `index.html` names the canvas `id="gameCanvas"`, whereas the task specification and test harness query `#game-canvas`. Because DOM selectors are case-sensitive and match exact IDs, all Playwright queries for `#game-canvas` fail with element not found.
3. From **Observation 4**: The letterbox math in `src/main.ts` computes absolute screen offsets `offsetX` and `offsetY` relative to $(0,0)$, but injects them into a DOM element already centered via CSS flexbox. This doubles the offset and pushes the canvas 50% outside the visible viewport on both X and Y axes across 100% of tested screen sizes.
4. Synthesizing Steps 1-3: While build packaging and static hosting are sound, the runtime display geometry and testable DOM contract fail acceptance criteria.

---

## 3. Caveats

- Audio context unlocking was not verified with real sound playback in this headless test pass because audio synthesis implementation is scoped for Milestone 6.
- Firefox and WebKit browser binaries are not installed in the local environment, but Chromium and Mobile Chrome emulation were fully executed and tested.

---

## 4. Conclusion

- **Verdict**: **`FAIL`**
- **Actionable Fixes Required**:
  1. Fix Canvas ID: Update `index.html` line 176 and CSS line 80 to use `id="game-canvas"` (or update `src/main.ts` `CANVAS_ID = 'game-canvas'`) so `#game-canvas` is present and matches the E2E test suite.
  2. Fix Centering: Remove `canvas.style.left` and `canvas.style.top` from `applyCanvasScaling` in `src/main.ts` (relying on flexbox centering), OR remove flexbox centering from `.canvas-wrapper` and make container `top: 0; left: 0`.

---

## 5. Verification Method

To independently verify these findings:
```bash
# 1. Build and start preview server
npm run build
npx vite preview --port 3000 &
PREVIEW_PID=$!

# 2. Run standalone runner (verifies #game-canvas presence)
npx tsx tests/e2e/standalone-runner.ts
# Observed: exits with code 1, canvasFound: false

# 3. Run Playwright E2E TC-02
npx playwright test tests/e2e/browser.test.ts:31 --project=chromium
# Observed: element(s) not found: locator('#game-canvas')

# 4. Kill preview server
kill $PREVIEW_PID
```
- Invalidation condition: `standalone-runner.ts` exits with code 0 and canvas bounding client rect matches centered viewport geometry (`rect.left >= 0 && rect.right <= viewportWidth`).
