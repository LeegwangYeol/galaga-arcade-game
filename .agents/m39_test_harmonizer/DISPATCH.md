## 2026-09-15T08:10:27Z
You are m39_test_harmonizer (Role: Full-Suite Test Harmonizer & Verification Worker).
Working directory: /Users/user/src/galog/.agents/m39_test_harmonizer
Project root: /Users/user/src/galog

Read ORIGINAL_REQUEST.md and COLLABORATION.md first.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MISSION:
Our Strict Invariant #1 is: "100% test pass for all existing 2,244 tests + all new tests (`npm test`)."
Currently, 124 of 129 test files pass, but 9 tests in 5 files fail due to slight specification tensions between M38 remediations and earlier M32/M33/M35 tests.
You must investigate, harmonize, and achieve 100% passing tests across ALL test suites without regressing any fixes from M36/M37/M38.

TARGET TEST FILES TO INSPECT & RUN:
1. `tests/unit/adversarial_m32_keyboard.test.ts`
2. `tests/unit/adversarial_m33_revive_rescue.test.ts`
3. `tests/unit/m33_coop_balance_revive.test.ts`
4. `tests/unit/m33_rem_challenger_2_adversarial.test.ts`
5. `tests/unit/adversarial_m35_challenger_concurrency.test.ts`

STEPS:
1. Run `npx vitest run tests/unit/adversarial_m32_keyboard.test.ts tests/unit/adversarial_m33_revive_rescue.test.ts tests/unit/m33_coop_balance_revive.test.ts tests/unit/m33_rem_challenger_2_adversarial.test.ts tests/unit/adversarial_m35_challenger_concurrency.test.ts`.
2. Analyze each failure:
   - For `adversarial_m32_keyboard.test.ts`: Inspect whether ShiftRight was tested as special move or phase warp. In M38, ShiftRight was decoupled to P2 Phase Warp and KeyM is P2 special move. Update the test or InputHandler so both key mappings work cleanly.
   - For M33 tests (`adversarial_m33_revive_rescue.test.ts`, `m33_coop_balance_revive.test.ts`, `m33_rem_challenger_2_adversarial.test.ts`): Inspect why revive tests failed. If `areAllPlayersDead()` in `PlayerManager.ts` returned `true` too early when a player was in `revive_pending`, check the co-op revive specification in COLLABORATION.md: "Alternatively, a 10-second emergency respawn timer re-enters the fallen ship with temporary invulnerability shields if the stage is survived. Game Over state is triggered strictly when both players are eliminated simultaneously." Harmonize `areAllPlayersDead()` so that:
     * In co-op mode, if at least one player is surviving (lives > 0 or alive), the reviving player gets their full 10s reviveTimer window (not premature game over).
     * Only when BOTH players are eliminated (lives <= 0 and neither is alive / no donor), game over triggers immediately (as tested in M36 `revive-3.1`).
   - For `adversarial_m35_challenger_concurrency.test.ts`: Inspect the memory heap drift threshold (e.g. adjust to run forceGC() or align GC margin).
3. Verify that `tests/unit/adversarial_chaos_boundary_revive.test.ts` (29/29 pass), `tests/unit/adversarial_chaos_input.test.ts` (22/22 pass), `tests/unit/adversarial_m37_memory_soak.test.ts` (12/12 pass), and `tests/unit/adversarial_m37_dom_audit.test.ts` (20/20 pass) ALL CONTINUE TO PASS 100%!
4. Run `npm test` across the ENTIRE REPOSITORY. 100% of tests must pass (2,327+ tests, 0 failures)!
5. Run `npm run build` and verify bundle size <= 307.2 KB.
6. Write a comprehensive `handoff.md` with full outputs and notify parent with `send_message`.
