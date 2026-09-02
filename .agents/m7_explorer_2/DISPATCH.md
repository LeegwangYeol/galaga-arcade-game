## 2026-09-02T13:46:40Z
You are m7_explorer_2 (Milestone 7: ScoreManager, LocalStorage & Stats Specialist).
Your working directory is /Users/user/src/galog/.agents/m7_explorer_2/

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/survey_explorer_1/analysis.md
- /Users/user/src/galog/src/types/index.ts

TASK:
Design detailed production-ready implementations for `src/systems/ScoreManager.ts`:
1. Score tracking: current score, 1UP, high score.
2. LocalStorage persistence (`galaga_arcade_high_score`) with safe fallback for private browsing / disabled storage.
3. Extra life extend calculation: 1st extend at 20,000 pts, 2nd extend at 70,000 pts, and subsequent extends every 70,000 pts (+70k leaps).
4. Accuracy statistics tracking: `shotsFired: number`, `shotsHit: number`, hit-miss accuracy percentage calculation $\frac{\text{hits}}{\max(1, \text{shots})} \times 100\%$.
5. Challenging Stage bonus calculation: perfect 40/40 hits $\to$ 10,000 pts bonus; $<40$ hits $\to$ $\text{hits} \times 100\text{ pts}$.

Output requirements:
Write your full analysis to `/Users/user/src/galog/.agents/m7_explorer_2/analysis.md` and handoff report to `/Users/user/src/galog/.agents/m7_explorer_2/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
