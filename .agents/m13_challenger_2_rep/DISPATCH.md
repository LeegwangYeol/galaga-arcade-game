## 2026-09-04T10:27:06Z
You are m13_challenger_2_rep, replacing m13_challenger_2 who encountered a network socket disconnect.
Your working directory is `/Users/user/teamwork_projects/galaga_game/.agents/m13_challenger_2_rep`.
You MUST read:
- `/Users/user/teamwork_projects/galaga_game/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/teamwork_projects/galaga_game/PROJECT.md`
- `/Users/user/teamwork_projects/galaga_game/COLLABORATION.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/teamwork_preview_orchestrator_6/DISPATCH.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/m13_worker/handoff.md`

Your task:
Empirically and adversarially stress-test Milestone 13 Special Moves & Pool Saturation:
1. Write an adversarial test file `tests/unit/adversarial_m13_specials.test.ts` testing:
   - Chrono Freeze delta-time split invariant: verify that while frozen, enemy bullets, formation oscillation, diving Béziers, and boss timers receive dt = 0, while player movement and firing update with full dt.
   - Dimensional Warp Ram invulnerability and collision: verify player is invulnerable to enemy bullets and collisions during charge (vy = -800px/s) and retains a 0.5s grace window upon reentry.
   - Energy gauge boundary conditions: test negative inputs, overflow beyond 100, and rapid drain on activation.
   - Bounded pool saturation: simulate 1,000 ticks of rapid special move and drone activations under max enemy count. Verify zero heap growth, zero un-recycled pool entities, and zero crashes with autoExpand: false.
2. Run `npm test`.
3. Issue an explicit verdict: `APPROVE` or `REQUEST_CHANGES` in `/Users/user/teamwork_projects/galaga_game/.agents/m13_challenger_2_rep/handoff.md`.
Update your `progress.md` before and after work. When finished, send a message back to parent.
