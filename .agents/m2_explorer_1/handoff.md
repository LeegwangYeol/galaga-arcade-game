# Handoff Report — Milestone 2: Game Loop & Object Pool Design

**Author**: m2_explorer_1 (Game Loop & Object Pool Specialist)  
**Recipient**: parent (Milestone 2 Orchestrator)  
**Date**: 2026-09-02  
**Handoff Type**: Hard (Task Complete)  

---

## 1. Observation

1. **PROJECT.md Contract Specification** (`/Users/user/src/galog/PROJECT.md:5-9, 17, 84-86`):
   - F3 Feature: "Core Game Loop & Fixed Timestep Engine: 60 FPS accumulator loop, object pooling, tick orchestration"
   - Architecture: "Fixed-timestep accumulator loop ($16.6667\text{ ms}$, 60 FPS) with `requestAnimationFrame` and zero-allocation object pools for bullets, enemies, and particles."
   - Target files specified: `src/core/GameLoop.ts` and `src/core/ObjectPool.ts`.

2. **Types & Global Contracts** (`/Users/user/src/galog/src/types/index.ts:398-423`):
   - Section 13: `Poolable` interface defined with `{ active: boolean; reset(): void }`.
   - Section 14: `IGameEngine` interface with `start()`, `stop()`, `pause()`, `resume()`, `update(deltaTimeMs: number)`, `render(ctx: CanvasRenderingContext2D)`.

3. **Survey Findings** (`/Users/user/src/galog/.agents/survey_explorer_2/analysis.md:1180-1311`):
   - Section 4.1 establishes the mathematical requirement for delta-time accumulator loop: $FIXED\_DT = 1/60\text{ s}$, clamping at $MAX\_DELTA = 0.1\text{ s} = 100\text{ ms}$ to avoid spiral of death on tab unfocus.
   - Section 4.2 establishes the need for zero-allocation pooling across bullet, particle, and star entities to eradicate Garbage Collection (GC) pauses during 60 FPS gameplay.

4. **Existing Test Harness** (`/Users/user/src/galog/tests/e2e/browser.test.ts:78-95` & `tests/unit/`):
   - `TC-E2E-04`: "Game loop is actively ticking and rendering frames at target 60 FPS" measuring $\ge 30\text{ fps}$ and pixel variation over 800ms.
   - `TC-E2E-06`: Pause toggle (Escape / KeyP) and Game Start (Enter / Space) key events.
   - `TC-E2E-10`: "Tab visibility and blur/focus transitions execute gracefully".

---

## 2. Logic Chain

1. **Deterministic Physics & Frame Rate Independence**:
   - High refresh rate monitors (120Hz, 144Hz, 240Hz) fire `requestAnimationFrame` more frequently than 60Hz.
   - Using a raw delta $\Delta t$ causes non-deterministic collision detection, bullet speed jitter, and Bézier curve desynchronization.
   - *Therefore*, `GameLoop.ts` must use Glenn Fiedler's accumulator loop pattern where physics `update(dt)` always receives a constant $1/60\text{ s}$, and `render(alpha)` receives an interpolation factor $\alpha = \text{accumulator} / \text{fixedDt} \in [0, 1)$ for smooth sub-frame visual interpolation.

2. **Spiral of Death & Background Throttling Mitigation**:
   - Background tab switching or GC spikes can yield $\Delta t > 1.0\text{ s}$. Without bounds, the loop attempts $>60$ updates in a single animation frame, locking the CPU and cascading into further lag.
   - *Therefore*, `GameLoop.ts` clamps $\Delta t \le 0.1\text{ s}$ ($100\text{ ms}$), capping updates to at most $6$ ticks per animation frame. When unpausing or regaining focus, `lastTime` is explicitly reset to `performance.now()` with `accumulator` cleared.

3. **Zero-Allocation & Memory Architecture**:
   - Galaga creates up to 48 player/enemy bullets, 250 explosion particles, and 40 active enemies simultaneously. Allocating and deallocating these dynamically triggers frequent V8 Minor GC sweeps (1–6ms pauses).
   - *Therefore*, `ObjectPool<T>` must be implemented as a contiguous dense-array buffer with $O(1)$ Swap-and-Pop deallocation and cache-friendly contiguous iteration (`forEachActive()`). Double-free protection and a configurable `maxSize` ceiling ensure strict bounded memory consumption.

---

## 3. Caveats

1. **Browser Autoplay & Audio Interaction**: While `GameLoop` is purely graphical and mathematical, audio scheduling in downstream systems must synchronize with `update(dt)` tick timestamps rather than raw wall-clock time.
2. **Headless / Node.js Test Environments**: In Vitest / Node.js test runners where `window.requestAnimationFrame` and `performance.now()` may be mocked or polyfilled, `GameLoop` incorporates fallback checks for `Date.now()` and standard callback timers.
3. **No Project Source Modification**: In accordance with the explorer archetype rules, this analysis provides complete, production-ready TypeScript code designs in `.agents/m2_explorer_1/analysis.md` without directly modifying project source files in `/src/`.

---

## 4. Conclusion

The architectural blueprints and complete production-ready TypeScript implementations for `src/core/GameLoop.ts` and `src/core/ObjectPool.ts` have been fully designed, typed, and documented in `/Users/user/src/galog/.agents/m2_explorer_1/analysis.md`.

Key deliverables ready for implementer execution:
1. `GameLoop.ts`: Fixed timestep accumulator ($1/60\text{ s}$), $100\text{ ms}$ max delta clamping, `start()`, `stop()`, `pause()`, `resume()`, `isPaused()`, `isRunning()`, sub-frame $\alpha$ interpolation, and dual-mode (EMA + 1-second window) FPS profiling.
2. `ObjectPool.ts`: Generic `ObjectPool<T>` with `factory`, `reset`, `initialSize`, `maxSize`, $O(1)$ Swap-and-Pop `release()`, defensive double-free checks, zero-allocation `forEachActive()`, safe reverse iteration `forEachActiveSafe()`, and `clear()`.
3. Unit test specification for `tests/unit/core.test.ts`.

---

## 5. Verification Method

To verify the design and subsequent implementation:

1. **Unit Test Execution**:
   ```bash
   npm run test
   # or
   npx vitest run tests/unit/
   ```
2. **TypeScript Strict Typecheck**:
   ```bash
   npx tsc --noEmit
   ```
3. **E2E Headless Browser Tick & Loop Verification**:
   ```bash
   npx playwright test tests/e2e/browser.test.ts -g "TC-E2E-04"
   ```
4. **Inspect Design Deliverables**:
   - Analysis report: `/Users/user/src/galog/.agents/m2_explorer_1/analysis.md`
