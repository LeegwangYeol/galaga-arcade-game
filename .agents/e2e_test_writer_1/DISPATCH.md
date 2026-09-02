## 2026-09-02T12:04:12Z
You are e2e_test_writer_1 (E2E Testing Track: Unit & Math Test Architect).
Your working directory is /Users/user/src/galog/.agents/e2e_test_writer_1/

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/COLLABORATION.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/TEST_INFRA.md

TASK:
Design and write comprehensive Vitest unit test suites for math, physics, collision detection, game state machine, and scoring:
1. `tests/unit/math.test.ts`:
   - Vector2D (addition, subtraction, scaling, length, normalization, zero-vector handling).
   - Cubic Bézier curve evaluator (boundary $t=0, t=1$, midpoint interpolation, tangent heading calculation).
   - Collision detection (AABB vs AABB overlap, Circle vs Circle overlap, non-overlapping boundary cases).
2. `tests/unit/state.test.ts`:
   - State machine transitions: TITLE -> STAGE_INTRO -> PLAYING -> CHALLENGING_STAGE -> GAME_OVER.
   - Stage counter incrementation and challenging stage frequency (every 4 stages: 3, 7, 11...).
3. `tests/unit/score.test.ts`:
   - Point matrix for Zako, Goei, Boss Galaga (in formation vs diving).
   - Extra life threshold logic (first at 20,000 pts, second at 70,000 pts, every 70k thereafter).
   - High score LocalStorage saving and loading recovery.

Output requirements:
Write your analysis & test designs to `/Users/user/src/galog/.agents/e2e_test_writer_1/analysis.md` and your handoff report to `/Users/user/src/galog/.agents/e2e_test_writer_1/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
