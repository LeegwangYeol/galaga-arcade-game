# Milestone M27 Remediation Worker Handoff Report

- **Agent**: `m27_rem_worker` (Milestone M27 Remediation Worker)
- **Role**: Implementer / QA / Specialist
- **Date**: 2026-09-11T16:56:45+09:00
- **Status**: Complete & Verified (100% Passing)

---

## 1. Observation

### 1.1 Initial Failure Evidence from Auditor & Challenger 2
`m27_auditor_1` reported 2 test failures in `tests/unit/m27_challenger_2_adversarial.test.ts` during `npm test`:
```
FAIL tests/unit/m27_challenger_2_adversarial.test.ts > Milestone M27 Adversarial Suite — Keyboard Shortcuts & State Sync (Challenger 2) > Track 2: Modifier Key Isolation > CRITICAL: does NOT trigger fullscreen on Shift+F (allows typing capital F / game actions)
AssertionError: expected true to be false
- false
+ true
  ❯ tests/unit/m27_challenger_2_adversarial.test.ts:391:38

FAIL tests/unit/m27_challenger_2_adversarial.test.ts > Milestone M27 Adversarial Suite — Keyboard Shortcuts & State Sync (Challenger 2) > Track 2: Modifier Key Isolation > does NOT trigger fullscreen on combinatorial modifiers (Ctrl+Shift+F, Meta+Alt+F, etc.)
AssertionError: expected true to be false
- false
+ true
  ❯ tests/unit/m27_challenger_2_adversarial.test.ts:412:40
```

### 1.2 Inspection of Source Code Defect
In `src/ui/FullscreenManager.ts` (lines 448–452):
```typescript
// Ignore if modifier keys are depressed (avoids intercepting Cmd+F, Ctrl+F, Alt+F)
if (e.ctrlKey || e.metaKey || e.altKey) {
  return;
}
```
`e.shiftKey` was missing from the modifier check. When `Shift+F` or combinatorial modifiers like `Ctrl+Shift+F` were pressed, the event bypassed the guard, resulting in `e.preventDefault()` execution and `toggleFullscreen()` calls.

### 1.3 Applied Code Changes
1. **`src/ui/FullscreenManager.ts` (line 449)**:
   Updated the modifier key condition:
   ```typescript
   // Ignore if modifier keys are depressed (avoids intercepting Cmd+F, Ctrl+F, Alt+F, Shift+F)
   if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
     return;
   }
   ```
   Mirrored identically to `/Users/user/src/galog/src/ui/FullscreenManager.ts`.

2. **`tests/unit/fullscreen.test.ts`**:
   - Added `shiftKey: boolean` property and `shiftKey?: boolean` init option defaulting to `false` in `MockKeyboardEvent`.
   - Added unit test:
     ```typescript
     it('does NOT intercept "F" when Shift is held (allows typing capital F / in-game actions)', () => {
       const spyToggle = vi.spyOn(manager, 'toggleFullscreen').mockResolvedValue(true);
       const isShiftF = new MockKeyboardEvent('keydown', { code: 'KeyF', key: 'F', shiftKey: true });

       mockWindow.dispatchEvent(isShiftF);

       expect(isShiftF.defaultPrevented).toBe(false);
       expect(spyToggle).not.toHaveBeenCalled();
     });
     ```
   - Mirrored identically to `/Users/user/src/galog/tests/unit/fullscreen.test.ts`.

### 1.4 Post-Remediation Verification Results
- `npx vitest run tests/unit/m27_challenger_2_adversarial.test.ts`: **19/19 passed** (100%).
- `npx vitest run tests/unit/fullscreen.test.ts`: **45/45 passed** (100%).
- `npx tsc --noEmit`: **0 errors**.
- `npm test`: **98/98 test files passed, 1,791/1,791 tests passed** (100%).
- `npm run build`: Exit code 0, bundled production assets in 374ms.
- Workspace Parity: `diff -r --no-dereference` between `/Users/user/teamwork_projects/galaga_game` and `/Users/user/src/galog` across `src/` and `tests/` yielded **0 diffs** (100% bitwise parity).

---

## 2. Logic Chain

1. **Root Cause Analysis**:
   - `FullscreenManager.handleKeyDown` is designed to intercept standalone `F` and `F11` key presses to toggle fullscreen.
   - Browser conventions and game controls require that modifier combinations (e.g. `Ctrl+F` for Find, `Shift+F` for in-game commands like Phase Warp or typing uppercase 'F') are passed through unhindered.
   - The prior modifier guard `if (e.ctrlKey || e.metaKey || e.altKey)` omitted `e.shiftKey`.
   - Consequently, `keydown` events with `shiftKey: true` bypassed the guard, causing `e.preventDefault()` and calling `toggleFullscreen()`.
2. **Targeted Remediation**:
   - Expanding the guard to `if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)` guarantees immediate early return whenever `Shift` is active.
   - Updating `MockKeyboardEvent` in unit tests ensures accurate simulation of `shiftKey` state.
   - Adding a dedicated unit test verifies both that `toggleFullscreen()` is not called and `defaultPrevented` remains `false`.
3. **Validation & Regression Safety**:
   - Running `m27_challenger_2_adversarial.test.ts` confirmed that both failing tests now pass.
   - Running `fullscreen.test.ts` confirmed all 45 test cases pass cleanly.
   - Running the full suite (`npm test`) confirmed that all 98 test files and 1,791 tests across all subsystems (M1–M27) pass with zero regressions.
   - Building with `npm run build` confirmed zero TypeScript compilation or Vite bundling issues.

---

## 3. Caveats

No caveats. The fix is minimal, precise, and addresses the root cause directly without introducing side effects or performance overhead.

---

## 4. Conclusion

The keyboard modifier isolation defect in Milestone M27 has been completely resolved.
`Shift+F`, `Shift+F11`, and all combinatorial modifiers containing Shift are now properly isolated, preventing default-interception and fullscreen toggles.
All 98 test files and 1,791 tests in the repository pass with 100% success rate, TypeScript typecheck passes with 0 errors, production build succeeds cleanly, and dual workspaces remain in 100% bitwise parity.

---

## 5. Verification Method

To independently verify this remediation:

1. **Verify Challenger 2 Adversarial Suite**:
   ```bash
   npx vitest run tests/unit/m27_challenger_2_adversarial.test.ts
   ```
   *Expected*: 19/19 tests pass (100%).

2. **Verify Fullscreen Unit Suite**:
   ```bash
   npx vitest run tests/unit/fullscreen.test.ts
   ```
   *Expected*: 45/45 tests pass (100%).

3. **Verify TypeScript Compilation**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected*: 0 errors.

4. **Verify Full Repository Test Suite**:
   ```bash
   npm test
   ```
   *Expected*: 98 test files passed, 1,791 tests passed (100%).

5. **Verify Production Build**:
   ```bash
   npm run build
   ```
   *Expected*: Clean Vite build in `dist/` with exit code 0.

6. **Verify Dual Workspace Bitwise Parity**:
   ```bash
   diff -r --no-dereference /Users/user/teamwork_projects/galaga_game/src /Users/user/src/galog/src
   diff -r --no-dereference /Users/user/teamwork_projects/galaga_game/tests /Users/user/src/galog/tests
   ```
   *Expected*: 0 diffs.
