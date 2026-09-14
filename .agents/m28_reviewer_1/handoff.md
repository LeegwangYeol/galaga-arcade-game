# Milestone M28: Modernized Bottom HUD & Cyber-Arcade Dashboard Panel — Reviewer & Adversarial Critic Report

**Agent**: `m28_reviewer_1` (Code Quality & DOM Conformance Reviewer / Adversarial Critic)  
**Date**: 2026-09-11T17:16:30+09:00  
**Roles**: reviewer, critic  
**Target Milestone**: M28 (Modernized Bottom HUD & Cyber-Arcade Dashboard Panel)  
**Definitive Verdict**: **`REQUEST_CHANGES`**  

---

## Executive Review Summary

As the designated Code Quality & DOM Conformance Reviewer and Adversarial Critic for Milestone M28, I conducted an independent, evidence-based verification of `src/ui/BottomDashboard.ts`, `src/core/Game.ts`, `index.html`, and `tests/unit/bottom_dashboard.test.ts`.

While the implementation demonstrates high engineering quality in layout partitioning (3-zone grid), aesthetic integration (cyber-arcade CRT styles), zero-DOM-thrashing dirty checking, and backward-compatible Node/DOM fallbacks, **two Major defects** were identified that fail explicit requirements:
1. **Accessibility Non-Conformance (`aria-pressed`)**: The dispatch explicitly required: *"Check accessibility: `role=\"region\"`, `aria-label`, `aria-pressed`."* In `src/ui/BottomDashboard.ts`, the three tactical action buttons (`#btn-dash-mute`, `#btn-dash-fullscreen`, `#btn-dash-pause`) update `aria-label` but completely omit `aria-pressed`, violating WAI-ARIA 1.2 toggle button specifications.
2. **Zero-GC Architectural Invariant Violation**: In `src/ui/BottomDashboard.ts` line 760, `updatePowerUpChips()` allocates `const activeIds = new Set<string>();` on **every single frame** of the 60 FPS update loop. This introduces 60 heap object allocations per second (3,600 allocations/minute) into the core engine loop, violating the project's non-negotiable Zero-GC steady-state invariant.

Per project protocol and adversarial review standards, I issue a definitive verdict of **`REQUEST_CHANGES`**.

---

## Review Findings

### [Major] Finding 1: Missing `aria-pressed` Attribute on Action Toggle Buttons

- **What**: The three interactive action buttons (`#btn-dash-mute`, `#btn-dash-fullscreen`, `#btn-dash-pause`) fail to declare or update `aria-pressed`.
- **Where**: `src/ui/BottomDashboard.ts`: lines 492–516 (`buildZoneRight()`) and lines 703–728 (`update()`).
- **Why**:
  - The M28 task mandate explicitly specifies: *"Check accessibility: `role=\"region\"`, `aria-label`, `aria-pressed`."*
  - WAI-ARIA 1.2 requires that binary toggle buttons convey their active/pressed state via `aria-pressed="true"` / `aria-pressed="false"`. Relying solely on `aria-label` text changes ("Mute Audio" vs "Unmute Audio") does not announce the control as a pressed/unpressed toggle widget to screen readers.
  - Notably, `src/ui/FullscreenManager.ts` line 298 properly enforces this: `button.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');`. However, `BottomDashboard.ts` creates independent action buttons without setting or synchronizing this attribute.
- **Suggested Fix**:
  1. In `buildZoneRight()`, initialize each button with `setAttribute('aria-pressed', 'false')`.
  2. In `update()`, synchronize `aria-pressed`:
     ```typescript
     if (this.elBtnMute) {
       this.elBtnMute.setAttribute('aria-pressed', telemetry.isMuted ? 'true' : 'false');
     }
     if (this.elBtnFullscreen) {
       this.elBtnFullscreen.setAttribute('aria-pressed', telemetry.isFullscreen ? 'true' : 'false');
     }
     if (this.elBtnPause) {
       this.elBtnPause.setAttribute('aria-pressed', telemetry.isPaused ? 'true' : 'false');
     }
     ```

---

### [Major] Finding 2: Steady-State Heap Allocation (`new Set()`) in 60 FPS Animation Loop

- **What**: `updatePowerUpChips()` allocates a new JavaScript `Set` instance on every frame.
- **Where**: `src/ui/BottomDashboard.ts`: line 760 (`const activeIds = new Set<string>();`).
- **Why**:
  - `BottomDashboard.update()` is called by `Game.update(dt)` every 16.6ms (60 times per second).
  - Even during steady-state gameplay with zero active power-ups, line 760 allocates `new Set<string>()`, creating 3,600 heap objects per minute in the core game loop.
  - This directly violates the project's non-negotiable invariant stated in `COLLABORATION.md` Section 1 R3:
    > *"2. Zero-GC & Bounded Capacity: Bottom dashboard telemetry and UI hooks must not allocate garbage objects in the 60 FPS animation loop."*
  - Over a 50-round continuous playthrough, unnecessary garbage collection churn can trigger browser micro-stutters and frame drops.
- **Suggested Fix**:
  1. Add a pre-allocated instance field in `BottomDashboard`:
     ```typescript
     private _activePowerUpIds: Set<string> = new Set<string>();
     ```
  2. In `updatePowerUpChips()`, clear and reuse the existing set:
     ```typescript
     this._activePowerUpIds.clear();
     // use this._activePowerUpIds.add(id) and this._activePowerUpIds.has(id)
     ```
  3. In `destroy()`, clear `this._activePowerUpIds.clear()`.

---

### [Minor] Finding 3: Incomplete Unit Test Assertions for `aria-pressed` and Allocations

- **What**: The unit test suite `tests/unit/bottom_dashboard.test.ts` fails to assert `aria-pressed` states and does not detect the per-frame `Set` allocation.
- **Where**: `tests/unit/bottom_dashboard.test.ts`: lines 465–528 (Describe Block 6: "Action Buttons & Click Dispatching") and lines 563–575 (Test 8.2: "dirty-checking stress").
- **Why**:
  - Describe Block 6 asserts `textContent` and `aria-label`, but omits `getAttribute('aria-pressed')`.
  - Test 8.2 measures DOM mutations (`scoreEl.textContentSetterCount`), but does not spy on or verify JS object allocations during `update()`.
- **Suggested Fix**:
  Add unit assertions verifying `btnMute.getAttribute('aria-pressed') === 'true'`, `btnFs.getAttribute('aria-pressed') === 'true'`, and `btnPause.getAttribute('aria-pressed') === 'true'`.

---

## Verified Claims

| Claim from Worker / Prompt | Verification Method | Result | Notes |
|---|---|---|---|
| Three-zone arcade dashboard layout | Inspected `BottomDashboard.ts` lines 331–521 & `index.html` lines 267–428 | **PASS** | Left (score/lives), Center (chips/gauge), Right (legend/actions). |
| 6-digit score and high score zero-padding | Ran `tests/unit/bottom_dashboard.test.ts` (Block 2) | **PASS** | `000000`, `004500`, `020000`, preserves $>6$ digits. |
| High-score record pulsating animation | Inspected `BottomDashboard.ts` line 639 & `index.html` lines 470–475 | **PASS** | `.high-score-flash` toggled on record beat. |
| Procedural SVG ship lives rack (0–5) | Inspected `createShipIcon()` lines 526–546 & Test Block 3 | **PASS** | 5 pre-allocated SVG icons; safely clamped between 0 and 5. |
| 9 power-up chips with countdown progress | Inspected `DEFAULT_CHIP_META` & `createPowerUpChip()` lines 836–885 | **PASS** | Overclock, Shield, Spread, Booster, Chrono, Reflect, Collector, Phase, Plasma. |
| Special move charge meter & ready state | Inspected `update()` lines 653–698 & Test Block 5 | **PASS** | Proportional width, `.special-ready`, `READY [X]` cue. |
| DOM element adoption & mounting | Inspected `init()` lines 174–233 & Test Block 1 | **PASS** | Adopts existing `#bottom-dashboard` or creates new one. Safe in Node. |
| Clean teardown without memory leaks | Inspected `destroy()` lines 298–325 & Test Block 1 | **PASS** | Unbinds click handlers, unmounts root, nullifies references. Idempotent. |
| Responsive compact mode ($< 480\text{px}$) | Inspected `index.html` media queries & `setCompactMode()` | **PASS** | Height 44px, grid reflow, controls legend hidden (`display: none !important`). |
| Accessibility attributes (`role="region"`, `aria-label`) | Inspected `init()` lines 213–222 & buttons lines 492–516 | **PASS** | `role="region"`, `aria-label="Arcade Bottom Dashboard"`, button labels. |
| Accessibility attribute (`aria-pressed`) | Grep & code inspection of `BottomDashboard.ts` | **FAIL** | Attribute is missing from all action buttons. |
| Steady-state zero heap allocations | Inspected `updatePowerUpChips()` line 760 | **FAIL** | `new Set<string>()` allocated every frame at 60 FPS. |
| TypeScript strict typechecking | Ran `npx tsc --noEmit` | **PASS** | Exit code 0, 0 compilation errors. |
| Unit test pass rate | Ran `npx vitest run tests/unit/bottom_dashboard.test.ts` | **PASS** | 30/30 tests passed (100%). |
| Full regression suite pass rate | Ran `npm test` | **PASS** | 99/99 test files passed, 1,821/1,821 tests passed (100%). |
| Production build compliance | Ran `npm run build` | **PASS** | Built in 455ms (`dist/index.html` 17.55 kB, chunks cleanly bundled). |
| Workspace bitwise parity | Ran `diff -u` across modified files in both workspaces | **PASS** | 0 differences (100% bitwise parity). |

---

## Adversarial Challenge & Stress-Testing Report

### Challenge 1: Allocation Stress in Long Gameplay Sessions (50 Rounds)
- **Assumption Challenged**: Allocating `new Set<string>()` inside `updatePowerUpChips()` is negligible.
- **Attack Scenario**: Player engages in a 50-round playthrough (~25 minutes, ~90,000 frames). At 60 FPS, line 760 instantiates 90,000 temporary `Set` objects.
- **Blast Radius**: Increased minor GC activity in V8, causing periodic micro-jank (1–3ms frame drops) during bullet-hell boss encounters.
- **Mitigation**: Pre-allocate a single permanent `private _activePowerUpIds = new Set<string>()` instance variable on `BottomDashboard`, clearing and repopulating it in-place every frame.

### Challenge 2: Assistive Technology Mismatch on Toggle Buttons
- **Assumption Challenged**: Screen readers can distinguish button states solely via dynamic `aria-label` text changes.
- **Attack Scenario**: A visually impaired user relying on VoiceOver or NVDA interacts with the dashboard. Because the buttons lack `aria-pressed`, the screen reader announces them as regular push buttons rather than binary toggle switches, causing ambiguity as to whether audio or pause is currently engaged.
- **Blast Radius**: Accessibility compliance failure under WCAG 2.1 Section 4.1.2 (Name, Role, Value).
- **Mitigation**: Explicitly manage `aria-pressed="true"|"false"` on `#btn-dash-mute`, `#btn-dash-fullscreen`, and `#btn-dash-pause`.

---

## 5-Component Handoff Protocol

### 1. Observation
- `src/ui/BottomDashboard.ts`:
  - Lines 492–516: Action buttons are created with `aria-label` and `title`, but no `aria-pressed` attribute is initialized.
  - Lines 703–728: Telemetry updates `textContent` and `aria-label`, but does not set or toggle `aria-pressed`.
  - Line 760: `const activeIds = new Set<string>();` is executed unconditionally on each invocation of `updatePowerUpChips()`.
- `tests/unit/bottom_dashboard.test.ts`:
  - Lines 465–528: Describe Block 6 tests dispatching and `aria-label`, but does not assert `aria-pressed`.
- Terminal Verification:
  - `npx tsc --noEmit`: Exited 0 with 0 errors.
  - `npx vitest run tests/unit/bottom_dashboard.test.ts`: 30 passed in 165ms.
  - `npm test`: 99 test files passed, 1,821 passed (100%) in 5.38s.
  - `npm run build`: Exited 0, built in 455ms.
  - Dual workspace parity confirmed across all files with `diff -u`.

### 2. Logic Chain
1. The dispatch instructions specifically commanded: *"Check accessibility: `role=\"region\"`, `aria-label`, `aria-pressed`."*
2. Inspection of `src/ui/BottomDashboard.ts` confirms that while `role="region"` and `aria-label` are present, `aria-pressed` is omitted from all three action toggle buttons.
3. The project architectural guidelines and COLLABORATION.md Section 1 R3 strictly mandate: *"Zero-GC & Bounded Capacity: Bottom dashboard telemetry and UI hooks must not allocate garbage objects in the 60 FPS animation loop."*
4. `BottomDashboard.update()` runs 60 times per second during active gameplay. In `updatePowerUpChips()`, `const activeIds = new Set<string>();` allocates an object on every tick, producing 3,600 heap allocations per minute.
5. While overall architecture, CSS styling, tests, and build stability are exemplary, these two defects violate core project specifications and must be resolved before Milestone M28 can be certified.

### 3. Caveats
- No other unhandled exceptions or memory leaks were found. The DOM detachment logic, SVG rendering, and 10,000-frame dirty checking for score and text content are completely leak-free.
- The in-canvas HUD (`HUD.ts`) remains intact and functional alongside the external bottom dashboard.

### 4. Conclusion
- Final Verdict: **`REQUEST_CHANGES`**.
- Remediation tasks required from worker:
  1. Add `aria-pressed` initialization ('false') and dynamic state updates ('true' / 'false') for `#btn-dash-mute`, `#btn-dash-fullscreen`, and `#btn-dash-pause`.
  2. Eliminate the per-frame `new Set<string>()` allocation in `updatePowerUpChips()` by reusing a pre-allocated instance set (`this._activePowerUpIds.clear()`).
  3. Update `tests/unit/bottom_dashboard.test.ts` to assert `aria-pressed` transitions on the action buttons.
  4. Ensure 100% bitwise parity is synchronized between `/Users/user/teamwork_projects/galaga_game` and `/Users/user/src/galog`.

### 5. Verification Method
To verify the remediation:
1. Check `aria-pressed` presence and updates:
   ```bash
   grep -n "aria-pressed" /Users/user/teamwork_projects/galaga_game/src/ui/BottomDashboard.ts
   ```
2. Verify zero per-frame `Set` allocations:
   ```bash
   grep -n "new Set" /Users/user/teamwork_projects/galaga_game/src/ui/BottomDashboard.ts
   ```
   *(Must not occur inside `updatePowerUpChips()`)*
3. Run test suites and build:
   ```bash
   npx tsc --noEmit
   npx vitest run tests/unit/bottom_dashboard.test.ts
   npm test
   npm run build
   ```
