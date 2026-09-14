## 2026-09-14T11:36:36Z

You are m35_worker_1, the Core Implementation & E2E Worker for Milestone M35: 50+ Subagent Swarm Mobilization, Dual-Input E2E Matrix & Victory Audit.

# Working Directory & Identity
- Working Directory: /Users/user/src/galog/.agents/m35_worker_1
- Identity: m35_worker_1
- Parent Conversation ID: 0236827c-a7d2-4115-a374-2f5c45ed8134

# Authoritative References (MANDATORY: READ FIRST)
- User Request: /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md (MANDATORY: read first!)
- Claude Collaboration Guide: /Users/user/src/galog/COLLABORATION.md (Review Milestone M35)
- Project Scope: /Users/user/src/galog/.agents/teamwork_preview_orchestrator_13/SCOPE.md
- Master Architecture: /Users/user/src/galog/PROJECT.md
- Explorer 1 Report (E2E Test Architecture & Patch): /Users/user/src/galog/.agents/m35_explorer_1/handoff.md
- Explorer 1 Proposed E2E Suite: /Users/user/src/galog/.agents/m35_explorer_1/proposed_coop_multiplayer_dual_input.spec.ts
- Explorer 1 Fixes Patch: /Users/user/src/galog/.agents/m35_explorer_1/m35_coop_fixes.patch
- Explorer 2 Report (Zero-GC Soak Test Blueprint): /Users/user/src/galog/.agents/m35_explorer_2/handoff.md

# MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

# Exclusively Owned Files
You have exclusive write access to:
- `src/core/Game.ts`
- `src/ui/InputHandler.ts`
- `src/ui/BottomDashboard.ts`
- `tests/e2e/coop_multiplayer_dual_input.spec.ts`
- `tests/unit/m35_coop_zero_gc_soak.test.ts`

# Implementation Directives

## 1. Apply Latent Co-op Fixes (per Explorer 1 Patch)
1. In `src/core/Game.ts` (around line 1009):
   When handling co-op life donation:
   ```typescript
   if (this.inputHandler.consumeAction('donateLife' as any, 'p1')) {
     if (!this.playerManager.donateLife('p1')) {
       this.playerManager.donateLife('p2');
     }
   }
   if (this.inputHandler.consumeAction('donateLife' as any, 'p2')) {
     if (!this.playerManager.donateLife('p2')) {
       this.playerManager.donateLife('p1');
     }
   }
   ```
2. In `src/ui/InputHandler.ts` (around line 1309):
   In `isP2DonateKey(c, k)`:
   Add `'KeyL'`, `'l'`, and `'L'` so Player 2 can also use KeyL to donate life to downed Player 1:
   ```typescript
   private isP2DonateKey(c: string, k: string): boolean {
     return c === 'NumpadDecimal' || c === 'Period' || k === '.' || c === 'KeyO' || k === 'o' || k === 'O' || c === 'KeyL' || k === 'l' || k === 'L';
   }
   ```
3. In `src/ui/BottomDashboard.ts` (around line 342):
   Remove the conditional hiding of `this.zoneRight` (`this.zoneRight.style.display = isCoop ? '' : 'none';`) so that action buttons (`#btn-dash-fullscreen`, `#btn-dash-mute`, `#btn-dash-pause`) remain visible and accessible in single-player mode.

## 2. Deploy Automated Playwright Dual-Input E2E Matrix Test Suite
Create `tests/e2e/coop_multiplayer_dual_input.spec.ts` based on `/Users/user/src/galog/.agents/m35_explorer_1/proposed_coop_multiplayer_dual_input.spec.ts`.
Ensure all 4 test cases are implemented:
- TC-M35-COOP-01: Concurrent PC Dual Keyboard Input (WASD/Space + Arrows/Enter, 600 frames, no stalls, dual bullets, FPS >= 25).
- TC-M35-COOP-02: Concurrent Mobile Multi-Touch Split-Screen (Pixel 5 / iPhone 12, independent left/right quadrant steering and shooting).
- TC-M35-COOP-03: Symmetrical Dual Bottom Dashboard HUD Telemetry (independent P1 and P2 scores, combo multipliers, special gauges, lives racks).
- TC-M35-COOP-04: Co-op Death, Revive Countdown & Life Donation Flow (KeyL donation, P2 life decrement, P1 respawn with invulnerability, alert dismissed).

## 3. Deploy 5,000-Frame Co-op Zero-GC Soak Test
Create `tests/unit/m35_coop_zero_gc_soak.test.ts` based on `/Users/user/src/galog/.agents/m35_explorer_2/handoff.md` (lines 113–311).
Verify:
- 5,000 frames of intensive 2-player combat simulation.
- Net heap drift strictly $< 5.0\text{ MB}$ (target $< 1.0\text{ MB}$).
- Strictly 0 pool leaks across all 9 object pools (`bulletPool`, `particlePool`, `powerUpPool`, `enemyPool`, `phantomPool`, `bombPool`, `explosionPool`, `missilePool`, `sparkPool`).
- Zero coordinate NaNs (`assertZeroNaN`).

# Mandatory Verification Commands
Run and confirm exit code 0 for:
1. `npx tsc --noEmit`
2. `npm run build` (confirm bundle size < 250 KB and strictly < 300 KB)
3. `npx vitest run tests/unit/m35_coop_zero_gc_soak.test.ts`
4. `npm test` (all 124 test files must pass 100%, 0 failures)
5. `npx playwright test tests/e2e/coop_multiplayer_dual_input.spec.ts --project=chromium`
6. `npx playwright test tests/e2e/desktop_chromium.spec.ts --project=chromium`
7. `npx playwright test tests/e2e/mobile_chrome_touch.spec.ts --project="Mobile Chrome"`

Record detailed results in `/Users/user/src/galog/.agents/m35_worker_1/handoff.md` and send a completion message to parent when finished.
