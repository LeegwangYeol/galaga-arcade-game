# DISPATCH — 2026-09-02T12:58:00Z

<USER_REQUEST>
You are m4_worker (Milestone 4 Implementation Worker).
Your working directory is /Users/user/src/galog/.agents/m4_worker/

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/m4_explorer_1/analysis.md
- /Users/user/src/galog/.agents/m4_explorer_2/analysis.md
- /Users/user/src/galog/.agents/m4_explorer_3/analysis.md
- /Users/user/src/galog/src/types/index.ts

SCOPE OF WORK & EXCLUSIVE FILE OWNERSHIP:
You exclusively own:
- `/Users/user/src/galog/src/math/Bezier.ts`
- `/Users/user/src/galog/src/entities/Enemy.ts`
- `/Users/user/src/galog/src/systems/FormationManager.ts`
- `/Users/user/src/galog/src/systems/FlightPathManager.ts`
- `/Users/user/src/galog/src/renderer/SpriteRenderer.ts`
- `/Users/user/src/galog/src/core/Game.ts`
- `/Users/user/src/galog/tests/unit/enemy.test.ts`

EXECUTION INSTRUCTIONS:
1. Implement `src/math/Bezier.ts` (Cubic & quadratic Bézier evaluators, analytical tangent, heading calculation, arc-length LUT constant speed mapping).
2. Implement `src/entities/Enemy.ts` (Zako, Goei, Boss Galaga 2-hit state, point values, wing animation frames, dive states).
3. Implement `src/systems/FormationManager.ts` (40 enemies across 5 rows, breathing expansion & sway oscillation, slot mapping, dive attack scheduler).
4. Implement `src/systems/FlightPathManager.ts` (5 entry sub-waves, solo/paired dives, Boss Galaga escorted dives, off-screen bottom wrap-around return spline).
5. Update `src/renderer/SpriteRenderer.ts` to include authentic procedural pixel art for Zako, Goei, Boss Galaga (undamaged and damaged frames), and smooth rotation caching.
6. Update `src/core/Game.ts` to integrate FormationManager, FlightPathManager, enemy-missile collision resolution, score updates, and enemy rendering.
7. Write comprehensive unit tests in `tests/unit/enemy.test.ts` verifying all enemy types, points, formation slot allocation, breathing math, and Bézier curves.
8. Run `npm run typecheck`, `npm run build`, and `npm test`. Ensure 100% pass with 0 errors.
9. Commit changes: `git add . && git commit -m "feat(enemies): implement Enemy hierarchy, Formation grid, Bézier flight curves, AI diving, and SpriteRenderer caching"`.

Output requirements:
Write your progress to `/Users/user/src/galog/.agents/m4_worker/progress.md` and handoff report to `/Users/user/src/galog/.agents/m4_worker/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
</USER_REQUEST>
