## 2026-09-02T12:40:23Z
You are m3_worker (Milestone 3 Implementation Worker).
Your working directory is /Users/user/src/galog/.agents/m3_worker/

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/m3_explorer_1/analysis.md
- /Users/user/src/galog/.agents/m3_explorer_2/analysis.md
- /Users/user/src/galog/.agents/m3_explorer_3/analysis.md
- /Users/user/src/galog/src/types/index.ts

SCOPE OF WORK & EXCLUSIVE FILE OWNERSHIP:
You exclusively own:
- `/Users/user/src/galog/src/entities/Player.ts`
- `/Users/user/src/galog/src/entities/Bullet.ts`
- `/Users/user/src/galog/src/renderer/SpriteRenderer.ts`
- `/Users/user/src/galog/src/core/Game.ts`
- `/Users/user/src/galog/tests/unit/player.test.ts`

EXECUTION INSTRUCTIONS:
1. Implement `src/entities/Player.ts` (7-state FSM: normal, capturing, captured, docking, dual, destroyed, respawning; 1D horizontal movement clamped to bounds; 2 vs 4 bullet limits; dual fighter docking animation; partial destruction; invulnerability blinking).
2. Implement `src/entities/Bullet.ts` (Bullet entity and BulletManager with ObjectPool; player vertical missiles; enemy directional bullets; swept continuous collision detection hitboxes).
3. Implement `src/renderer/SpriteRenderer.ts` (authentic procedural pixel matrices for Player, Dual Fighter, Captured Red Fighter, Missiles, Enemy Bullets; offscreen canvas pre-baking for 60fps rendering).
4. Update `src/core/Game.ts` to wire in Player, BulletManager, SpriteRenderer, player input steering & missile firing.
5. Implement exhaustive unit tests in `tests/unit/player.test.ts` verifying all player states, bullet quotas, docking, invulnerability, and boundary clamping.
6. Run `npm run typecheck`, `npm run build`, and `npm test`. Ensure 100% pass with 0 errors.
7. Commit changes: `git add . && git commit -m "feat(player): implement Player ship, Dual Fighter docking, Bullet system, and SpriteRenderer"`.

Output requirements:
Write your progress to `/Users/user/src/galog/.agents/m3_worker/progress.md` and handoff report to `/Users/user/src/galog/.agents/m3_worker/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
