# Milestone M37 Handoff Report: Detached DOM & Listener Leak Audit

**Agent**: `m37_dom_auditor` (Role: Detached DOM & Listener Leak Auditor)  
**Date**: 2026-09-15T07:32:00Z  
**Target Subsystems**: `src/ui/BottomDashboard.ts`, `src/ui/InputHandler.ts`, `src/core/Game.ts`, `src/ui/FullscreenManager.ts`, `src/audio/AudioContextManager.ts`, `src/core/ScreenManager.ts`, `src/main.ts`  
**Verification Suite**: `tests/unit/adversarial_m37_dom_audit.test.ts` (20/20 tests passing 100%)  

---

## 1. Observation

### Obs 1.1: Symmetrical Dual Bottom Dashboard Steady-State Dirty Checking & String Lookup Invariants
- **File & Lines**: `src/ui/BottomDashboard.ts:87-101`, `1169-1257`, `1263-1342`, `1348-1645`
- **Verbatim Code**:
  - `PERCENT_STRINGS`:
    ```ts
    export const PERCENT_STRINGS: readonly string[] = Object.freeze(
      Array.from({ length: 101 }, (_, i) => `${i}%`)
    );
    ```
  - `REVIVE_COUNTDOWN_STRINGS`:
    ```ts
    export const REVIVE_COUNTDOWN_STRINGS: readonly string[] = Object.freeze(
      Array.from({ length: 16 }, (_, i) => `REVIVE: ${i}S`)
    );
    ```
  - `formatScore6` Dirty Check Gate:
    ```ts
    if (clampedScore !== this._lastScore) {
      if (this.elScoreVal) {
        this.elScoreVal.textContent = this.formatScore6(clampedScore);
      }
      this._lastScore = clampedScore;
    }
    ```
- **Direct Measurement**:
  - In `tests/unit/adversarial_m37_dom_audit.test.ts:TC-M37-01` and `TC-M37-02`, running 10,000 consecutive frames with static telemetry in both single-player and co-op mode yielded:
    * `textContent` mutations: **0**
    * `style` mutations: **0**
    * `classList` mutations: **0**
    * `attribute` mutations: **0**
    * Tree mutations (`appendChild`/`removeChild`): **0**
    * Invocations of `formatScore6`: **0**

### Obs 1.2: Power-Up Chip Pooling & Element Reuse
- **File & Lines**: `src/ui/BottomDashboard.ts:1677-1758`
- **Verbatim Code**:
  ```ts
  let chip = pool.get(id);
  if (!chip) {
    chip = this.createPowerUpChip(id, type, item);
    pool.set(id, chip);
  }

  if (!chip.isMounted) {
    rackEl.appendChild(chip.element);
    chip.isMounted = true;
  }
  ```
  ```ts
  // Unmount inactive chips
  for (const [id, chip] of pool.entries()) {
    if (chip.isMounted && !activeIds.has(id)) {
      if (chip.element.parentElement) {
        chip.element.parentElement.removeChild(chip.element);
      }
      chip.isMounted = false;
      chip.lastProgressInt = -1;
    }
  }
  ```
- **Direct Measurement**:
  - In `TC-M37-05`, power-ups activated, deactivated, and reactivated reused the exact same DOM element instance (`reactivatedChipElement === firstChipElement`).
  - Over 5,000 frames under heavy simulated gameplay (`TC-M37-20`), the total created DOM elements remained strictly bounded (<= 20 total chip instances across both players), with 0 detached chip accumulation.

### Obs 1.3: Mode Switching Reparenting & Invariance
- **File & Lines**: `src/ui/BottomDashboard.ts:322-382`
- **Verbatim Code**:
  ```ts
  // Reparent elActionsContainer between Zone 3 (single) and Zone 2 (co-op)
  if (this.elActionsContainer) {
    if (isCoop && this.elCoopActionsRow) {
      this.elCoopActionsRow.appendChild(this.elActionsContainer);
    } else if (!isCoop && this.elSingleActionsRow) {
      this.elSingleActionsRow.appendChild(this.elActionsContainer);
    }
  }

  // Reparent elHighVal between Zone 1 (single) and Zone 2 (co-op)
  if (this.elHighVal) {
    if (isCoop && this.elCoopHighContainer) {
      this.elCoopHighContainer.appendChild(this.elHighVal);
    } else if (!isCoop && this.elSingleHighContainer) {
      this.elSingleHighContainer.appendChild(this.elHighVal);
    }
  }
  ```
- **Direct Measurement**:
  - In `TC-M37-06`, 100 consecutive rapid mode toggles (`setMode('coop')` <-> `setMode('single')`) created **0 new DOM elements** and resulted in **0 orphaned DOM nodes**. Total subtree nodes inside `#bottom-dashboard` before and after 100 switches remained strictly identical (72 nodes).
  - In `TC-M37-07`, 0 duplicate listeners were created on `#btn-dash-mute`, `#btn-dash-fullscreen`, or `#btn-dash-pause` (remained exactly 1 listener per button).
  - In `TC-M37-08`, `actionsContainer` and `highScoreElement` maintained identical element references (`===`) across reparenting.

### Obs 1.4: InputHandler Event Listener Attachment & Teardown
- **File & Lines**: `src/ui/InputHandler.ts:592-636`, `638-719`
- **Verbatim Code**:
  - `attachEventListeners()`:
    * `window.addEventListener('keydown', this.boundKeyDown, { passive: false });`
    * `window.addEventListener('keyup', this.boundKeyUp, { passive: false });`
    * `window.addEventListener('blur', this.boundWindowBlur);`
    * `document.addEventListener('visibilitychange', this.boundVisibilityChange);`
    * `canvas.addEventListener('pointerdown' | 'pointermove' | 'pointerup' | 'pointerleave', ...)`
    * `canvas.addEventListener('touchstart' | 'touchmove' | 'touchend' | 'touchcancel', ...)`
  - `attachDomTouchControls()`:
    * `#btn-left`, `#btn-right`, `#btn-fire`, `#btn-special`: each bound to `touchstart`, `touchend`, `touchcancel`, `mousedown`, `mouseup`, `mouseleave` (6 listeners each = 24 listeners).
  - `destroy()`:
    * Calls `this.detachEventListeners()` and `this.detachDomTouchControls()`.
- **Direct Measurement**:
  - In `TC-M37-11` and `TC-M37-12`, 50 consecutive `new InputHandler()` followed by `destroy()` left **0 active listeners** across window, document, canvas, and virtual touch buttons.
  - However, inspection of `InputHandler.ts:582-586` reveals:
    ```ts
    public destroy(): void {
      this.detachEventListeners();
      this.detachDomTouchControls();
      this.reset();
    }
    ```
    DOM references `this.canvas`, `this.domBtnLeft`, `this.domBtnRight`, `this.domBtnFire`, `this.domBtnSpecial` are **NOT nulled out** upon destruction.

### Obs 1.5: Critical Defect 1 — FullscreenManager `bindToggleButton` Listener Leak
- **File & Lines**: `src/core/Game.ts:331-336`, `src/ui/FullscreenManager.ts:293-325`, `382-396`
- **Verbatim Code**:
  In `src/core/Game.ts:331-336`:
  ```ts
  if (typeof document !== 'undefined') {
    const btnFullscreen = document.getElementById('btn-fullscreen');
    if (btnFullscreen) {
      this.fullscreenManager.bindToggleButton(btnFullscreen);
    }
  }
  ```
  In `src/ui/FullscreenManager.ts:318-324`:
  ```ts
  button.addEventListener('click', clickHandler);
  const unbindChange = this.onChange(updateButtonState);

  return () => {
    button.removeEventListener('click', clickHandler);
    unbindChange();
  };
  ```
  In `src/ui/FullscreenManager.ts:382-396`:
  ```ts
  public destroy(): void {
    this.detachEventListeners();
    if (this.watchdogTimeout1) {
      clearTimeout(this.watchdogTimeout1);
      this.watchdogTimeout1 = null;
    }
    if (this.watchdogTimeout2) {
      clearTimeout(this.watchdogTimeout2);
      this.watchdogTimeout2 = null;
    }
    this.changeListeners.clear();
    this.errorListeners.clear();
    this.targetElement = null;
    this.screenManager = null;
  }
  ```
- **Defect Mechanism**:
  `Game.ts` calls `this.fullscreenManager.bindToggleButton(btnFullscreen)` on line 334. The returned unbind function `() => void` is **discarded**. Furthermore, `FullscreenManager` does not retain or track bound toggle buttons or their unbind callbacks. When `game.destroy()` invokes `fullscreenManager.destroy()`, the `click` listener attached to `#btn-fullscreen` is **NEVER removed**.
  If a new `Game` is instantiated, `#btn-fullscreen` accumulates a duplicate `click` handler, and the dead `FullscreenManager` instance (and its closure references) cannot be garbage-collected.

### Obs 1.6: Critical Defect 2 — AudioContextManager Window Auto-Unlock Listeners Retention
- **File & Lines**: `src/audio/AudioContextManager.ts:236-263`, `src/core/Game.ts:651-689`
- **Verbatim Code**:
  In `src/audio/AudioContextManager.ts:239-246`:
  ```ts
  const events = ['pointerdown', 'touchstart', 'keydown', 'mousedown'];
  for (const evt of events) {
    window.addEventListener(evt, this.boundUnlockHandler, {
      once: false,
      passive: true,
      capture: true,
    });
  }
  this.isAutoUnlockAttached = true;
  ```
- **Defect Mechanism**:
  `AudioContextManager.getInstance()` attaches 4 capture listeners to `window`. In `Game.destroy()`, `this.soundSynth.stopAll()` and `MusicJingles.stopAll()` are called, but `this.audioContextManager.detachAutoUnlockListeners()` (or `audioContextManager.destroy()`) is **NEVER called**. If `game.destroy()` is executed before user interaction (e.g. during headless automated test runs or immediate page transitions), these 4 listeners remain bound to `window`.

### Obs 1.7: Non-Critical Optimization Vectors
- In `BottomDashboard.ts:348`:
  ```ts
  const singleLives = this.zoneLeft?.querySelector('.dash-lives-rack');
  ```
  Called repeatedly inside `setMode()` on every mode switch instead of using a pre-cached instance member `this.elSingleLivesRack`.
- In `main.ts:1-166`:
  Does not export a `teardown()` method. External consumers embedding the game in an SPA container cannot cleanly invoke `gameInstance.destroy()`.

---

## 2. Logic Chain

1. **Premise 1 (Zero-GC Dirty Checking)**:
   - In `BottomDashboard.ts`, telemetry values (`clampedScore`, `clampedHigh`, `energyInt`, `clampedLives`, `secP1`, etc.) are compared against cached previous primitive values (`_lastScore`, `_lastHighScore`, `_lastSpecialIntP1`, `_lastLivesP1`, etc.).
   - If values match, the setter branches are bypassed completely.
   - For string formatting, `PERCENT_STRINGS` and `REVIVE_COUNTDOWN_STRINGS` provide static pre-allocated frozen strings.
   - `formatScore6()` is called solely inside dirty-check conditional blocks.
   - **Inference**: Steady-state frame updates at 60 FPS perform zero DOM property writes and zero heap allocations.

2. **Premise 2 (Zero Detached Nodes on Mode Switch)**:
   - When transitioning between `'single'` and `'coop'`, `BottomDashboard.setMode()` toggles `.style.display` between `''` and `'none'` for zone-specific containers.
   - For shared elements (`elActionsContainer` and `elHighVal`), `appendChild()` is invoked on the new target container. Per DOM specification, `Node.appendChild` on a mounted child relocates it from its former parent directly without cloning, creating, or orphaning elements.
   - No event listeners are added or removed during `setMode()`.
   - **Inference**: Mode switching is structurally leak-free and preserves element identity with 0 orphaned nodes and 0 duplicate listeners.

3. **Premise 3 (EventListener Leaks in Subsystems)**:
   - `ScreenManager.destroy()` correctly removes `resize` from `window`.
   - `InputHandler.destroy()` correctly removes all 28 registered listeners across `window`, `document`, `canvas`, and virtual touch buttons.
   - However, `FullscreenManager.bindToggleButton()` attaches a `click` listener to an external DOM element (`#btn-fullscreen`), returns an unbind closure that is discarded in `Game.ts:334`, and does not track bound buttons in `FullscreenManager.destroy()`.
   - Similarly, `AudioContextManager` attaches 4 capture listeners to `window` that are not torn down if the game is destroyed before user interaction.
   - **Inference**: While `BottomDashboard` and `InputHandler` are self-cleaning, `Game.ts` contains 2 listener leak vectors in its integration with `FullscreenManager` and `AudioContextManager`.

---

## 3. Caveats

1. **Vitest Node.js Mock Environment**: The test suite runs in Node.js where `window`, `document`, `HTMLCanvasElement`, and `MockElement` are mocked. While the prototype tracking, DOM mutation counters, and `ListenerAuditRegistry` faithfully replicate the WHATWG DOM event model and tree manipulation specifications, real browser-specific engine quirks (e.g. Safari WebKit touch identifier caching or Chrome layout thrashing heuristics) must be validated via Playwright in M40.
2. **WebGL / Canvas Context Hardware Acceleration**: The Canvas 2D context was mocked for memory and listener tracking. GPU texture memory leaks were not in scope for this DOM & listener audit.
3. **No Code Modifications Undertaken**: Adhering strictly to Explorer read-only protocol and user instructions, source code in `src/` was not modified during Milestone M37.

---

## 4. Conclusion

- **Audit Status**: **PASSED (with 2 Actionable Remediation Targets identified for M38)**.
- **Symmetrical Dual Bottom Dashboard**: Fully compliant with zero-GC invariants. 0 DOM mutations and 0 string allocations occur when telemetry is unchanged. Preallocated frozen string lookup tables (`PERCENT_STRINGS`, `REVIVE_COUNTDOWN_STRINGS`, `REVIVE_P1_STRINGS`, `REVIVE_P2_STRINGS`) and chip pooling (`chipPool`, `chipPoolP1`, `chipPoolP2`) operate with 0 detached node growth.
- **Mode Switching**: Completely deterministic. 100 consecutive mode toggles result in 0 orphaned DOM nodes, 0 duplicate listeners, and 100% identity preservation during reparenting.
- **Remediation Action Items for Milestone M38 Swarm**:
  1. **Fix `FullscreenManager.bindToggleButton` Leak**:
     - In `src/ui/FullscreenManager.ts`: Store unbind functions in a `private boundButtonUnbinders: Set<() => void> = new Set()` and call all unbinders during `FullscreenManager.destroy()`.
     - In `src/core/Game.ts`: Store the unbind callback returned by `bindToggleButton` and invoke it in `Game.destroy()`.
  2. **Fix `AudioContextManager` Auto-Unlock Listener Retention**:
     - In `src/core/Game.ts:destroy()`: Add `this.audioContextManager?.detachAutoUnlockListeners();`.
  3. **Nullify Stored DOM References on Teardown**:
     - In `src/ui/InputHandler.ts:destroy()`: Add `this.canvas = null as any; this.domBtnLeft = null; this.domBtnRight = null; this.domBtnFire = null; this.domBtnSpecial = null;`.
     - In `src/core/Game.ts:destroy()`: Add `this.canvas = null as any;` and remove dynamically created canvas from DOM if attached.
  4. **Cache `singleLives` Rack Query in `BottomDashboard`**:
     - Store `this.elSingleLivesRack` as a member variable in `buildZoneLeft()` to avoid repeated `querySelector` execution inside `setMode()`.
  5. **Export `teardown()` in `main.ts`**:
     - Add `export function teardown(): void { if (gameInstance) { gameInstance.destroy(); gameInstance = null; } }` for clean SPA lifecycle integration.

---

## 5. Verification Method

### Automated Unit Test Command
Run the newly created adversarial DOM audit verification suite:
```bash
npx vitest run tests/unit/adversarial_m37_dom_audit.test.ts
```
**Observed Result**:
- `tests/unit/adversarial_m37_dom_audit.test.ts`: **20/20 tests passed (100%)** in 68ms.

### Invalidation Conditions
The findings and invariants of this audit are invalidated if:
1. Running 10,000 steady-state frames produces `postTextMutations - baselineTextMutations > 0` or any non-zero style/tree mutations.
2. Toggling `setMode('coop')` and `setMode('single')` 100 times alters the total node count of `#bottom-dashboard` or creates duplicate click listeners on action buttons.
3. Instantiating and destroying `InputHandler` 50 times leaves `auditRegistry.getActiveCount() > 0`.
4. Power-up chips create new elements when reactivated instead of retrieving them from `chipPool`.
