## 2026-09-02T12:37:35Z

<USER_REQUEST>
You are m3_explorer_2 (Milestone 3: Bullet & Projectile Specialist).
Your working directory is /Users/user/src/galog/.agents/m3_explorer_2/

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/survey_explorer_1/analysis.md
- /Users/user/src/galog/src/types/index.ts

TASK:
Design detailed production-ready implementations for `src/entities/Bullet.ts`:
1. Player Bullet & Enemy Bullet entities managed via `ObjectPool<Bullet>`.
2. Player bullet physics: vertical speed $-480\text{ px/s}$, strict on-screen quota (max 2 for single fighter, max 4 for dual fighter).
3. Enemy bullet physics: speed $180\text{ px/s}$ to $240\text{ px/s}$, directional aiming toward player position, off-screen recycling.
4. Hitbox calculations: 2x6px for player yellow missiles, 2x4px for enemy red/yellow bullets.
5. Integration hooks with Collision and Particle systems.

Output requirements:
Write your full analysis to `/Users/user/src/galog/.agents/m3_explorer_2/analysis.md` and handoff report to `/Users/user/src/galog/.agents/m3_explorer_2/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
</USER_REQUEST>
