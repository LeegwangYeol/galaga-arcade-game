## 2026-09-02T13:46:40Z
You are m7_explorer_1 (Milestone 7: HUD, Stage Badges & Arcade Fonts Specialist).
Your working directory is /Users/user/src/galog/.agents/m7_explorer_1/

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/survey_explorer_1/analysis.md
- /Users/user/src/galog/src/types/index.ts

TASK:
Design detailed production-ready implementations for `src/ui/HUD.ts`:
1. Top header: `1UP`, score, `HIGH SCORE`, high score value (authentic red/white arcade text rendering).
2. Bottom-left: Remaining lives indicators (mini player ship icons, max 5 displayed).
3. Bottom-right: Stage indicator badges:
   - Red large pennant (50 stages or 30/20) / 10-stage badge (thick pennant).
   - 5-stage badge (yellow triangle/banner).
   - 1-stage badge (blue/white chevron).
   - Exact mathematical decomposition of current `stage` into optimal badge icons.
4. Crisp pixel rendering on $224 \times 288$ virtual canvas.

Output requirements:
Write your full analysis to `/Users/user/src/galog/.agents/m7_explorer_1/analysis.md` and handoff report to `/Users/user/src/galog/.agents/m7_explorer_1/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
