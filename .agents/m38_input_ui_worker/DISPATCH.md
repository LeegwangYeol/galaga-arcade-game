## 2026-09-15T07:35:39Z

You are m38_input_ui_worker (Role: Input & UI Remediation Worker).
Working directory: /Users/user/src/galog/.agents/m38_input_ui_worker
Project root: /Users/user/src/galog

Read ORIGINAL_REQUEST.md and COLLABORATION.md first.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVELY OWNED FILES (You may ONLY modify these files):
- `src/ui/InputHandler.ts`
- `src/ui/FullscreenManager.ts`
- `src/ui/BottomDashboard.ts`

TASKS:
1. `src/ui/InputHandler.ts`:
   - Multi-Touch Active Session Counting in `handleTouchEnd` and `handleTouchCancel`:
     When a steer or fire touch session ends, iterate the remaining sessions in `this.touchSessions`. If another active steer session exists for that player, recalculate `moveLeft`/`moveRight` from that active session rather than zeroing it out. If another active fire session exists for that player, keep `fire`/`touchFire` active.
   - Coordinate sanitization in `renderTouchGuides`:
     Guard against `!Number.isFinite(virtCurrentX) || !Number.isFinite(virtCurrentY) || !Number.isFinite(dx) || !Number.isFinite(dy)`. Skip puck drawing if coordinates are not finite.
   - Browser Quick Find prevention: Add `'Slash'` and `'/'` to `PREVENT_DEFAULT_KEYS`.
   - Donate key isolation: In `isP2DonateKey`, remove `KeyL` so `KeyL` is exclusively P1's donate key.
   - P2 Special vs Phase Warp key isolation: In `isP2SpecialKey`, remove `ShiftRight` so `ShiftRight` is strictly P2's Phase Warp (symmetric with P1's `ShiftLeft`) and `KeyM` is P2's Special Move.
   - Teardown cleanup: In `destroy()`, nullify `this.canvas`, `this.domBtnLeft`, `this.domBtnRight`, `this.domBtnFire`, `this.domBtnSpecial`.

2. `src/ui/FullscreenManager.ts`:
   - Add `private boundButtonUnbinders: Set<() => void> = new Set();`
   - In `bindToggleButton`, register the returned unbind callback into `this.boundButtonUnbinders`.
   - In `destroy()`, invoke all callbacks in `this.boundButtonUnbinders` and clear the set.

3. `src/ui/BottomDashboard.ts`:
   - In `buildZoneLeft()`, cache `this.elSingleLivesRack` as an instance member to avoid repeated `querySelector` calls in `setMode()`.

VERIFICATION:
Run the following commands and ensure all pass cleanly:
`npx vitest run tests/unit/adversarial_chaos_input.test.ts` (all 22 tests must pass!)
`npx vitest run tests/unit/adversarial_m37_dom_audit.test.ts` (all 20 tests must pass!)
`npx tsc --noEmit` (0 errors!)

Write `handoff.md` in your working directory documenting the exact changes, test outputs, and verification commands. Notify parent when done.
