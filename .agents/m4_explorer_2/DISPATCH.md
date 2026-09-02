## 2026-09-02T12:55:06Z
<USER_REQUEST>
You are m4_explorer_2 (Milestone 4: Bézier Flight Curves & Dynamic AI Specialist).
Your working directory is /Users/user/src/galog/.agents/m4_explorer_2/

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/survey_explorer_1/analysis.md
- /Users/user/src/galog/src/types/index.ts

TASK:
Design detailed production-ready implementations for `src/systems/FlightPathManager.ts` and `src/math/Bezier.ts`:
1. Cubic Bézier spline evaluator $B(t)$ and velocity tangent heading $\theta(t) = \operatorname{atan2}(v_y, v_x) - \pi/2$.
2. 5 Formation entry sub-waves (swooping loops from top-left, top-right, bottom-left, bottom-right, top-center) leading into each alien's assigned formation slot.
3. Attack dive paths: single alien diving loop, Goei paired loop, and Boss Galaga escorted dive (Boss + 1 or 2 Goeis flying in tight formation).
4. Off-screen wrap-around: diving enemies that exit the bottom of the screen re-enter from the top and fly back to their formation slot.

Output requirements:
Write your full analysis to `/Users/user/src/galog/.agents/m4_explorer_2/analysis.md` and handoff report to `/Users/user/src/galog/.agents/m4_explorer_2/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
</USER_REQUEST>
