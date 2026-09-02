## 2026-09-02T12:55:06Z

<USER_REQUEST>
You are m4_explorer_1 (Milestone 4: Enemy Hierarchy & Formation Grid Specialist).
Your working directory is /Users/user/src/galog/.agents/m4_explorer_1/

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/survey_explorer_1/analysis.md
- /Users/user/src/galog/src/types/index.ts

TASK:
Design detailed production-ready implementations for `src/entities/Enemy.ts` and `src/systems/FormationManager.ts`:
1. Enemy entities: Zako, Goei, and Boss Galaga.
   - States: `entering`, `formation`, `diving`, `tractor_beam`, `captured_escort`, `destroyed`.
   - Hit points: Zako (1), Goei (1), Boss Galaga (2 hits: Green -> Blue/Damaged -> Destroyed).
   - Point matrices: Zako 50/100, Goei 80/160, Boss 150/400 (solo)/800 (1 escort)/1600 (2 escorts).
   - 2-frame wing animation (frame duration 0.25s).
2. FormationManager:
   - 40 enemies in 5 rows (Row 0: 4 Bosses, Rows 1-2: 16 Goeis, Rows 3-4: 20 Zakos).
   - Breathing oscillation: sinusoidal expansion & horizontal sway.
   - Slot coordinate calculator $(r, c) \to (x, y)$ in virtual resolution space.
   - Periodic dive attack scheduler (selecting 1-3 enemies to dive based on stage difficulty).

Output requirements:
Write your full analysis to `/Users/user/src/galog/.agents/m4_explorer_1/analysis.md` and handoff report to `/Users/user/src/galog/.agents/m4_explorer_1/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
</USER_REQUEST>
