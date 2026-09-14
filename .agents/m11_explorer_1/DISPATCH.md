## 2026-09-03T04:15:08Z

<USER_REQUEST>
You are m11_explorer_1 (Role: Power-Up Subsystem & Drop Architecture Explorer).
Working directory: /Users/user/src/galog/.agents/m11_explorer_1/
Project root: /Users/user/src/galog

Read the authoritative documents:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/.agents/teamwork_preview_orchestrator_2/SCOPE.md
- /Users/user/src/galog/.agents/survey_p2_explorer_2/report.md

Your mission for Milestone 11:
1. Design `src/core/powerups/`:
   - `types.ts`: `PowerUpType` ('RAPID_FIRE', 'KINETIC_SHIELD', 'SCATTER_SHOT', 'EMP_BOMB', 'ENGINE_BOOSTER'), `PowerUpConfig`, `PowerUpState`.
   - `PowerUpItem.ts`: Leased from `ObjectPool<PowerUpItem>`, position (x, y), downward drifting physics ($vy \approx 60$ px/s, subtle horizontal sine sway), lifetime/despawn on screen exit ($y > 288$), collection bounding box ($12 \times 12$).
   - `PowerUpManager.ts`: Zero-allocation object pool management (pool size 32), drop rate calculation on enemy kill in `Enemy.takeDamage` (e.g. 12% baseline, higher for diving enemies or Bosses), collection detection vs `Player` in `Game.resolveCollisions()`, active upgrade timer management (e.g. 15s duration for timed buffs).
2. Detail integration hooks into `src/core/Game.ts`.
3. Output your technical report to /Users/user/src/galog/.agents/m11_explorer_1/report.md and /Users/user/src/galog/.agents/m11_explorer_1/handoff.md.
4. Notify orchestrator via send_message when complete.
</USER_REQUEST>
