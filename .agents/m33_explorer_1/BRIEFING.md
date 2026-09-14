# BRIEFING — 2026-09-14T10:02:00Z

## Mission
Investigate and architect the Co-op Dynamic Difficulty & Boss Health Scaling Engine for Milestone M33.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: /Users/user/src/galog/.agents/m33_explorer_1
- Original parent: 0236827c-a7d2-4115-a374-2f5c45ed8134
- Milestone: M33: Co-op Balance, Dynamic Scaling & Cooperative Revive Mechanics

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- ALWAYS wait for explicit user approval before proceeding with implementation
- Communicate with Claude via Rule Guide (Markdown) / COLLABORATION.md
- Zero-GC invariants & backward compatibility across all 115 test files
- 100% preservation of classic arcade stats in Single-Player Mode

## Current Parent
- Conversation ID: 0236827c-a7d2-4115-a374-2f5c45ed8134
- Updated: not yet

## Investigation State
- **Explored paths**: `src/entities/Enemy.ts`, `src/systems/DifficultyCalculator.ts`, `src/systems/DynamicDifficultyManager.ts`, `src/systems/FormationManager.ts`, `src/core/boss/` (BaseBoss, BossFactory, BossManager, 5 concrete bosses), `src/core/Game.ts`, `src/renderer/SpriteRenderer.ts`, `src/entities/Bullet.ts`.
- **Key findings**:
  1. Boss Galaga base HP is 2 (Classic), 3 (Elite), 3+2 shield (Dreadnought). Co-op +50% scales to 3 HP, 5 HP, 5 HP. SpriteRenderer already handles HP >= 3.
  2. 5 Stage Bosses have base HP 80, 120, 150, 180, 300 in BOSS_CONFIGS. Co-op +60% scales to 128, 192, 240, 288, 480 HP. All 5 bosses evaluate phase transitions via relative fractions (e.g. `<= 0.5 * maxHealth`), so scaling maxHealth automatically scales phase transitions!
  3. Wave attack aggression and bullet density (+25%) maps to dividing diveInterval by 1.25, dividing formation sniper fire interval by 1.25, scaling maxConcurrentDivers by min(8, round(base * 1.25)), and faster burst firing.
  4. Composes multiplicatively with DDA (Dynamic Difficulty Adjustment).
  5. Strict exemption for 12 Challenging stages (always 1 HP, 0 shield, 0 shots) preserving 40-hit bonus invariant.
  6. Single-player mode preserves 100% classic arcade stats with bitwise parity; all 115 test files (2,089 tests) pass.
- **Unexplored areas**: None for dynamic scaling engine.

## Key Decisions Made
- Designed Co-op Dynamic Scaling Engine in `handoff.md` with complete mathematical equations and code modification points for `DifficultyCalculator.ts`, `BossFactory.ts`, `FormationManager.ts`, and `Game.ts`.

## Artifact Index
- handoff.md — Final 5-component handoff report (Observations, Logic Chain, Caveats, Conclusion, Verification Method)
- progress.md — Liveness heartbeat
- DISPATCH.md — Incoming message log
