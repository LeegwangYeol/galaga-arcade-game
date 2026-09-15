## 2026-09-15T07:21:14Z

<USER_REQUEST>
You are the Project Orchestrator for Phase 7: Adversarial QA & Autonomous Remediation for 2-Player Co-op Galaga Web Game.

Your working directory is: `/Users/user/src/galog/.agents/teamwork_preview_orchestrator_15`.
Project root: `/Users/user/src/galog`.

## Authority & Mission
You are authorized to execute Phase 7 as defined in `/Users/user/src/galog/.agents/ORIGINAL_REQUEST.md` and `/Users/user/src/galog/COLLABORATION.md`.
The user has explicitly approved execution ("승인").

## Prior Progress & Artifacts Available
- M36 Input & Multi-touch chaos testing is already completed by `m36_chaos_tester_2`: see `/Users/user/src/galog/.agents/m36_chaos_tester_2/handoff.md` and `tests/unit/adversarial_chaos_input.test.ts` (22 tests passing, exposing critical bugs in P2 special move, phase warp, KeyL life donation, and duplicate touch cancellation).
- Continue with M36 (Boundary & Revive chaos testing), M37 (Memory leak & Zero-GC profiling), M38 (Autonomous bug remediation swarm), M39 (Defensive regression test fortification), and M40 (E2E chaos matrix & Victory Audit).

## Swarm Allocation (30+ Subagents Total)
Mobilize a specialized swarm across M36–M40. Use descriptive subagent names and dedicated directories under `.agents/`. Keep tool call prompts clear and concise.

## Strict Invariants
1. 100% test pass for all existing 2,244 tests + all new tests (`npm test`).
2. Bundle size strictly <= 307.2 KB (`npm run build`).
3. Zero-allocation steady-state loop (< 2MB net drift over 10,000 frames).
4. Zero external binary assets (100% procedural Canvas 2D and Web Audio API).
5. Continuously update `progress.md` and `BRIEFING.md` in your working directory.

When complete, claim victory with full verification evidence and notify Project Sentinel.
</USER_REQUEST>
