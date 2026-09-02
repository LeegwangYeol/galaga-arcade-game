## 2026-09-02T13:17:46Z
You are m5_explorer_2 (Milestone 5: Capture & Rescue State Machine Specialist).
Your working directory is /Users/user/src/galog/.agents/m5_explorer_2/

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/survey_explorer_1/analysis.md
- /Users/user/src/galog/src/types/index.ts

TASK:
Design detailed state transitions for Capture, Rescue, and Turncoat mechanics in `src/entities/Player.ts` and `src/entities/Enemy.ts`:
1. **Capture Flow**:
   - Player ship trapped in beam enters `capturing`: inputs disabled, spinning 360 deg ($4\text{ rot/s}$) while ascending along beam axis to Boss Galaga.
   - On reaching Boss, player ship becomes `captured_escort` attached to Boss, player loses 1 life, and a new ship respawns if lives $>0$.
2. **Rescue & Dual Docking Flow**:
   - When Boss Galaga with escort dives and player destroys the Boss:
     * Captured ship turns white, enters `docking` state, spirals/descends toward active player ship.
     * When docked, active ship transitions to `dual` mode with $32\text{px}$ twin hulls and 4-missile firing capability. +1000 pts rescue bonus.
3. **Turncoat Hostile Flow**:
   - If player destroys the Boss while still in formation:
     * Captured ship turns into a hostile enemy (`turncoat`), breaks formation, and dives at the player.
4. **Accidental Destruction Flow**:
   - If player shoots the captured ship directly: ship is destroyed (+500/1000 pts) and cannot be rescued.

Output requirements:
Write your full analysis to `/Users/user/src/galog/.agents/m5_explorer_2/analysis.md` and handoff report to `/Users/user/src/galog/.agents/m5_explorer_2/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
