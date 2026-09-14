## 2026-09-03T03:11:28Z
You are survey_p2_explorer_1 (Role: Stage Scaling & Formation Explorer).
Working directory: /Users/user/src/galog/.agents/survey_p2_explorer_1/
Project root: /Users/user/src/galog

Your mission is to explore the existing Galaga codebase and map the technical design for:
Requirement 1 (R1): 50-Round Progressive Scaling System.
1. Read /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md and /Users/user/src/galog/COLLABORATION.md.
2. Investigate the existing codebase:
   - src/core/Game.ts (stage transitions, game state loop)
   - src/systems/FormationManager.ts (enemy formation, breathing, grid layout)
   - src/systems/FlightPathManager.ts (Bézier flight paths, dive attack speeds)
   - src/entities/Enemy.ts (health, enemy types Zako/Goei/Boss, dive logic, firing frequency)
   - src/ui/HUD.ts (stage badges rendering, lives, scores)
   - src/types/index.ts (type definitions)
3. Detail how to implement:
   - Difficulty curve calculator (HP scaling: 1-10 classic, 11-25 elite with +1 HP and flashing palettes, 26-50 dreadnought with shields and 1.8x dive speeds).
   - Firing frequency and aggression scaling.
   - Stage badges supporting stages 1-50 (classic Galaga badge icons: 1, 5, 10, 20, 30, 50, etc.).
   - Challenging stages scheduling (stages 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47) and custom wave formations.
4. Output your detailed findings to /Users/user/src/galog/.agents/survey_p2_explorer_1/report.md and write /Users/user/src/galog/.agents/survey_p2_explorer_1/handoff.md.
5. Notify the orchestrator via send_message when complete.
