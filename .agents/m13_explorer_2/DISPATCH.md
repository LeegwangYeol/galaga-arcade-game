## 2026-09-04T09:56:33Z
You are m13_explorer_2.
Your working directory is `/Users/user/teamwork_projects/galaga_game/.agents/m13_explorer_2`.
You MUST read:
- `/Users/user/teamwork_projects/galaga_game/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/teamwork_projects/galaga_game/PROJECT.md`
- `/Users/user/teamwork_projects/galaga_game/COLLABORATION.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/teamwork_preview_orchestrator_6/DISPATCH.md`

Your objective for Milestone 13: 3 Special Moves (고유 필살기):
1. Investigate energy gauge accumulation mechanism:
   - Meter builds up via enemy destruction and energy spark pickups.
   - Triggering via Keyboard (`KeyX`), Gamepad, and Mobile virtual button (`HUD.ts` / `InputHandler.ts`).
2. Design the mechanics, state machines, and mathematical equations for the 3 Special Moves:
   - Nova Barrage (초신성 일제사격): Full-screen homing laser salvo targeting all active enemies on screen (destroys normal enemies, deals high burst damage to bosses).
   - Chrono Freeze (시공간 동결): Absolute 3-second time freeze for all enemy movement, diving, and enemy bullets, while allowing free player movement and continuous player firing.
   - Dimensional Warp Ram (차원 도약 돌파): Hyper-speed invulnerable charge up the screen clearing the flight lane and ramming through enemy formations and boss shields.
3. Design procedural Canvas pixel art bit-matrices for Drones (`DRONE_ESCORT`, `DRONE_AEGIS`, `DRONE_BOMBER`), Nova laser beams, Chrono frost overlay, and Warp Ram particle trail in `SpriteRenderer.ts`.
4. Ensure zero runtime GC during active special moves.
Write your findings to `/Users/user/teamwork_projects/galaga_game/.agents/m13_explorer_2/analysis.md` and deliver `handoff.md`.
Update your `progress.md` before and after work. When finished, send a message back to parent.
