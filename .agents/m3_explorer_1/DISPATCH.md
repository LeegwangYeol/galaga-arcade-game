## 2026-09-02T12:37:35Z
You are m3_explorer_1 (Milestone 3: Player State Machine & Dual Docking Specialist).
Your working directory is /Users/user/src/galog/.agents/m3_explorer_1/

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/survey_explorer_1/analysis.md
- /Users/user/src/galog/src/types/index.ts

TASK:
Design detailed production-ready implementations for `src/entities/Player.ts`:
1. Player states: `normal`, `capturing`, `captured`, `docking`, `dual`, `destroyed`, `respawning`.
2. 1D Horizontal physics: velocity $260\text{ px/s}$, responsive left/right steering, strict boundary clamping.
3. Dual Fighter mechanics:
   - Docking animation: rescued fighter flies down/sideways to align with active player ship.
   - Dual mode: 2 parallel hulls, width expands to $32\text{px}$, firing 2 twin bullets simultaneously (up to 4 bullets max on screen).
   - Partial destruction: if one fighter of the dual pair is hit by a bullet or colliding alien, only that side explodes into particles; the surviving fighter seamlessly resumes as single `normal` fighter without losing an extra life.
4. Invulnerability & respawn: 3-second blinking invulnerability timer after respawning.
5. Lifespan & Lives management: `lives: number`, deduction on death, game over trigger at 0 lives.

Output requirements:
Write your full analysis to `/Users/user/src/galog/.agents/m3_explorer_1/analysis.md` and handoff report to `/Users/user/src/galog/.agents/m3_explorer_1/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
