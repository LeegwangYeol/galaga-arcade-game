## 2026-09-11T09:20:14Z

<USER_REQUEST>
You are m28_rem_worker (Milestone M28 Remediation Worker - Replacement).
Your Working Directory: /Users/user/teamwork_projects/galaga_game/.agents/m28_rem_worker (and mirror to /Users/user/src/galog/.agents/m28_rem_worker)
Your Identity: Worker responsible for remedying all defects identified by Reviewer 1, Challenger 1, Challenger 2, and Forensic Auditor in Milestone M28.

MANDATORY Context to Read First:
- Authoritative User Request: /Users/user/teamwork_projects/galaga_game/.agents/ORIGINAL_REQUEST.md
- Architecture & Milestones: /Users/user/teamwork_projects/galaga_game/PROJECT.md
- Collaboration Guide: /Users/user/teamwork_projects/galaga_game/COLLABORATION.md
- Auditor Evidence Report: /Users/user/teamwork_projects/galaga_game/.agents/m28_auditor_1/handoff.md
- Reviewer 1 Handoff: /Users/user/teamwork_projects/galaga_game/.agents/m28_reviewer_1/handoff.md
- Challenger 1 Handoff: /Users/user/teamwork_projects/galaga_game/.agents/m28_challenger_1/handoff.md
- Challenger 2 Handoff: /Users/user/teamwork_projects/galaga_game/.agents/m28_challenger_2/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Write Ownership (You own exclusively):
- `src/ui/BottomDashboard.ts`
- `tests/unit/bottom_dashboard.test.ts`
- `tests/unit/m28_challenger_1_adversarial.test.ts`
- `tests/unit/m28_challenger_2_adversarial.test.ts`
- Mirror all modified and test files to `/Users/user/src/galog/`!

Exact Remediation Objectives:
1. Fix Special Move Textual Cue Dirty Checking in `src/ui/BottomDashboard.ts` (lines 676–697):
   - Currently, `this.elSpecialCue.textContent = \`${energyInt}%\`` is erroneously placed inside `if (isReady !== this._lastIsSpecialReady || moveName !== this._lastSpecialMove)`. Because `isReady` remains `false` while charging from 0% to 99%, the cue text stays frozen at `'0%'` while the charge bar fills to 99%.
   - Fix: Ensure `this.elSpecialCue.textContent` updates whenever `!isReady && energyInt !== this._lastSpecialEnergyInt`, displaying `${energyInt}%`. When `isReady` becomes `true`, display `'READY [X]'`.
2. Fix Zero-GC Set Allocation in `src/ui/BottomDashboard.ts` (lines 750–780):
   - Currently, `updatePowerUpChips()` allocates `const activeIds = new Set<string>();` on every frame of the 60 FPS loop.
   - Fix: Pre-allocate a private instance property `private _activePowerUpIds: Set<string> = new Set();` on `BottomDashboard`. Inside `updatePowerUpChips()`, call `this._activePowerUpIds.clear()`, populate it, and use it for unmounting inactive chips without ANY per-frame heap allocations.
3. Add `aria-pressed` to Action Buttons in `src/ui/BottomDashboard.ts`:
   - Initialize and synchronize `aria-pressed` on `#btn-dash-mute` (`state.isMuted ? 'true' : 'false'`), `#btn-dash-fullscreen` (`state.isFullscreen ? 'true' : 'false'`), and `#btn-dash-pause` (`state.isPaused ? 'true' : 'false'`).
4. Fix TypeScript Compilation Errors in Challenger Test Suites:
   - Inspect `tests/unit/m28_challenger_1_adversarial.test.ts` and `tests/unit/m28_challenger_2_adversarial.test.ts`.
   - Ensure all mock objects implement the required DOM properties (`ariaPressed`, `role`, `setAttribute`, `getAttribute`, etc.) without type errors.
   - Run `npx tsc --noEmit` and ensure 0 errors.
5. Update `tests/unit/bottom_dashboard.test.ts`:
   - Add tests asserting that `aria-pressed` transitions accurately on click / state change for all 3 buttons.
   - Add tests asserting that the special cue text reflects charging percentage (e.g. 42% displays "42%").
   - Add tests verifying 0 Set allocations.
6. Dual Workspace Parity:
   - Ensure all modified source files and all test files (`tests/unit/m28_challenger_1_adversarial.test.ts`, `tests/unit/m28_challenger_2_adversarial.test.ts`, `tests/unit/bottom_dashboard.test.ts`) are mirrored identically to `/Users/user/src/galog/`.
7. Verify:
   - `npx tsc --noEmit` (0 errors).
   - `npx vitest run tests/unit/m28_challenger_1_adversarial.test.ts` (all tests pass).
   - `npx vitest run tests/unit/m28_challenger_2_adversarial.test.ts` (all tests pass).
   - `npx vitest run tests/unit/bottom_dashboard.test.ts` (all tests pass).
   - `npm test` (MUST PASS 100% across all 101 test files).
   - `npm run build` (clean Vite build).
   - Confirm 100% bitwise parity between `/Users/user/teamwork_projects/galaga_game` and `/Users/user/src/galog`.
8. Write complete handoff report to `/Users/user/teamwork_projects/galaga_game/.agents/m28_rem_worker/handoff.md` (and mirror to `/Users/user/src/galog/.agents/m28_rem_worker/handoff.md`).
9. Send message to parent with your test and build results.
</USER_REQUEST>
