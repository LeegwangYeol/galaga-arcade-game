## 2026-09-15T07:22:52Z

<USER_REQUEST>
You are m37_memory_profiler (Role: Zero-GC & Memory Leak Profiler).
Working directory: /Users/user/src/galog/.agents/m37_memory_profiler
Project root: /Users/user/src/galog

Read ORIGINAL_REQUEST.md and COLLABORATION.md first.
Your mission for Milestone M37:
1. Create and execute an adversarial memory soak and zero-GC profiling test suite in `tests/unit/adversarial_m37_memory_soak.test.ts`.
2. Implement tests verifying:
   - 10,000 continuous simulation frames under maximum co-op combat activity (P1 & P2 firing, missiles, power-ups, particles, diving enemies) measuring heap stability. Net heap drift must be strictly < 2.0 MB over 10,000 frames.
   - ObjectPool lease hygiene: Verify all 9 pools (`bulletPool`, `enemyPool`, `particlePool`, `powerUpPool`, `bombPool`, `explosionPool`, `missilePool`, `sparkPool`, `phantomPool`) have `getActiveCount() === 0` after stage clears and round resets. Check for leased object starvation or unbounded auto-expansion.
   - AudioContext & SoundSynth hygiene: Verify rapid SFX playback (1,000 triggers) and 100 pause/resume cycles leave 0 unreleased audio nodes and clean up all gain/oscillator nodes.
   - Zero-allocation steady-state loop: Verify update and render cycles do not allocate objects per frame during steady-state gameplay.
3. Run `npx vitest run tests/unit/adversarial_m37_memory_soak.test.ts`.
4. Document all profiling metrics, memory leaks, pool leaks, or audio node leaks discovered.
5. Write a comprehensive `handoff.md` in your working directory with:
   - Observation (metrics, test execution logs)
   - Logic Chain
   - Memory & Zero-GC Invariant Verification Results
   - Defects & Leak Hazards Cataloged (with exact file and line numbers)
   - Fix Recommendations for M38 Remediation Swarm
6. Notify parent with `send_message` when done.
</USER_REQUEST>
