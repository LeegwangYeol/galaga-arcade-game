## 2026-09-04T11:47:33Z

You are m16_worker.
Your working directory is `/Users/user/teamwork_projects/galaga_game/.agents/m16_worker`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read:
- `/Users/user/teamwork_projects/galaga_game/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/teamwork_projects/galaga_game/PROJECT.md`
- `/Users/user/teamwork_projects/galaga_game/COLLABORATION.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/teamwork_preview_orchestrator_6/DISPATCH.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/teamwork_preview_orchestrator_6/M16_SYNTHESIS.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/m16_explorer_2/analysis.md` and `handoff.md`

Your Objective: Implement Milestone 16: Swarm Adversarial Hardening Test Suites.

Write Ownership:
You have exclusive write ownership over:
- `tests/unit/adversarial_m16_combinatorial_saturation.test.ts` (new)
- `tests/unit/adversarial_m16_long_session_memory.test.ts` (new)
- `tests/unit/adversarial_m16_voice_headroom_canvas_bounds.test.ts` (new)
- Any necessary core fixes in `src/` if an adversarial stress test uncovers an edge-case bug.

Detailed Requirements:
1. Combinatorial Saturation Suite (`tests/unit/adversarial_m16_combinatorial_saturation.test.ts`):
   - Implement the test blueprint from `m16_explorer_2/analysis.md`.
   - Simultaneous Stage 50 Aeternum Core Phase 3 Enrage + The Contingency glitch + Chrono Freeze time stop + Dual Fighter + 3 Drones + Warp Ram.
   - Verify enemy bullets freeze in place (`enemyDt = 0`), player moves and fires normally, and Warp Ram vaporizes flight-lane bullets safely.
   - Verify zero NaN coordinates, zero unhandled rejections, and clean teardown.
2. Long-Session Memory Endurance Suite (`tests/unit/adversarial_m16_long_session_memory.test.ts`):
   - Implement 1,000-tick continuous combat simulation under extreme multi-hazard conditions.
   - Assert net heap drift `< 5.0 MB`.
   - Verify bounded capacities across all 8 pools (`bulletPool`, `particlePool`, `powerUpPool`, `bombPool`, `explosionPool`, `missilePool`, `sparkPool`, `enemyPool`).
3. Audio Headroom & Canvas Math Bounds Suite (`tests/unit/adversarial_m16_voice_headroom_canvas_bounds.test.ts`):
   - 100+ concurrent SFX trigger spam stressing the 16-voice priority queue.
   - Verify high-priority voice reservation, low-priority dropping, debouncing, and dual-cleanup watchdogs.
   - Stress Canvas 2D math bounds (coordinates finite, non-negative radii, valid alpha [0, 1], balanced save/restore depth).
4. Testing & Verification:
   - Run `npm test` and `npm run build` directly and ensure 100% pass rate across all 62+ test files and 1,087+ tests with 0 regressions.
5. Deliver handoff report to `/Users/user/teamwork_projects/galaga_game/.agents/m16_worker/handoff.md` and message parent when complete.
