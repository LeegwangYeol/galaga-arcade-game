## 2026-09-15T08:27:13Z
<USER_REQUEST>
You are m39_test_harmonizer_2 (Role: Full-Suite Test Harmonizer & Verification Worker).
Working directory: /Users/user/src/galog/.agents/m39_test_harmonizer_2
Project root: /Users/user/src/galog

Read ORIGINAL_REQUEST.md and COLLABORATION.md first.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MISSION:
Our Strict Invariant #1 is: "100% test pass for all existing 2,244 tests + all new tests (`npm test`)."
Currently, 124 of 129 test files pass, but 9 tests in 5 files fail due to slight specification tensions between M38 remediations and earlier M32/M33/M35 tests.
You must investigate, harmonize, and achieve 100% passing tests across ALL test suites without regressing any fixes from M36/M37/M38.

KEY ROOT CAUSE ANALYSIS FOR YOU TO VERIFY & RESOLVE:
1. `src/systems/PlayerManager.ts:areAllPlayersDead()`:
   - In Galaga, `player.lives` represents *reserve* lives. When a player has 0 reserve lives (`lives === 0`), they are still actively flying their last ship if `player.isAlive()`!
   - In M38, line 280 checked `if (p.lives > 0) allLivesZero = false;`. When Player 2 is alive on their last ship (`lives === 0` and `p.isAlive() === true`), `allLivesZero` became `true`, causing `areAllPlayersDead()` to return `true` (Game Over) while Player 2 was still flying and Player 1 was in `revive_pending`!
   - Fix: If ANY player `p.isAlive()` (or `p.isAlive()` with `lives >= 0`), the game is NEVER over! `if (players.some(p => p.isAlive())) return false;`.
   - Furthermore, if a player is in `revive_pending` with `reviveTimer > 0` and their partner is alive (even with 0 reserve lives), they must get their full 10-second emergency respawn window!
   - Only when BOTH players are NOT alive (neither player `isAlive()`), then if neither has reserve lives (`lives <= 0`), Game Over triggers immediately without waiting 10s (satisfying M36 `revive-3.1`).
2. `src/ui/InputHandler.ts` & `tests/unit/adversarial_m32_keyboard.test.ts`:
   - In M32, `ShiftRight` was tested as P2 special. In M38, `ShiftRight` was set to P2 Phase Warp and `KeyM` to P2 special. Check `adversarial_m32_keyboard.test.ts` and ensure keybindings are cleanly harmonized so both P2 special (`KeyM` and/or ShiftRight alias if appropriate) and Phase Warp work without conflict.
3. `tests/unit/adversarial_m35_challenger_concurrency.test.ts`:
   - Check the memory heap drift threshold test; ensure `forceGC()` runs and heap drift is checked against standard tolerance.

VERIFICATION STEPS:
1. Run `npx vitest run tests/unit/adversarial_m32_keyboard.test.ts tests/unit/adversarial_m33_revive_rescue.test.ts tests/unit/m33_coop_balance_revive.test.ts tests/unit/m33_rem_challenger_2_adversarial.test.ts tests/unit/adversarial_m35_challenger_concurrency.test.ts`
2. Run `npx vitest run tests/unit/adversarial_chaos_boundary_revive.test.ts tests/unit/adversarial_chaos_input.test.ts tests/unit/adversarial_m37_memory_soak.test.ts tests/unit/adversarial_m37_dom_audit.test.ts` (MUST ALL PASS 100%!)
3. Run `npm test` across ALL 129 test files — MUST PASS 100% (2,327+ tests, 0 failures)!
4. Run `npm run build` and verify bundle size <= 307.2 KB.
5. Write `handoff.md` in your working directory and notify parent with `send_message`.
</USER_REQUEST>
