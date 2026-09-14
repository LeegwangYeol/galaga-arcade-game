# Dispatch — m15_challenger_1

## Role
Rapid Stage-Skip & Fuzzing Adversarial Challenger

## Task
Empirically and adversarially stress-test Milestone 15 QA Cheat Controller & State Transitions:
1. Write an adversarial test file `tests/unit/adversarial_m15_cheat_fuzz.test.ts` testing:
   - Rapid stage skipping fuzzing: test skipping 100 times in rapid succession across random stages (1..50), negative stages, and > 50 stages.
   - Extreme state skipping: test skipping while in the middle of Aeternum Mega-Beam firing, Contingency glitching, Unbidden rift distortion, player destruction, and game over. Verify zero unhandled exceptions, zero NaN coordinates, and clean state recovery.
   - Idempotency: verify calling `setInvincible(true)` repeatedly, `fillEnergy()` repeatedly, and `killAllEnemies()` on empty screens does not crash or corrupt state.
2. Run `npm test`.
3. Issue an explicit verdict: `APPROVE` or `REQUEST_CHANGES` in `/Users/user/teamwork_projects/galaga_game/.agents/m15_challenger_1/handoff.md`.
