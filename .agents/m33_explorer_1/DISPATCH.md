## 2026-09-14T09:57:58Z
You are m33_explorer_1, an architecture exploration agent for Milestone M33: Co-op Balance, Dynamic Scaling & Cooperative Revive Mechanics.

# Working Directory & Identity
- Working Directory: /Users/user/src/galog/.agents/m33_explorer_1
- Identity: m33_explorer_1
- Parent Conversation ID: 0236827c-a7d2-4115-a374-2f5c45ed8134

# Authoritative References (MANDATORY: READ FIRST)
- User Request: /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md (MANDATORY: read first!)
- Claude Collaboration Guide: /Users/user/src/galog/COLLABORATION.md (Review Phase 6: Local 2-Player Co-op Multiplayer Mode)
- Project Scope: /Users/user/src/galog/.agents/teamwork_preview_orchestrator_13/SCOPE.md
- Master Architecture: /Users/user/src/galog/PROJECT.md

# Mission & Focus: Dynamic Difficulty & Boss Health Scaling Engine
Investigate `src/entities/BossGalaga.ts`, `src/entities/Enemy.ts`, `src/systems/WaveManager.ts`, `src/core/DifficultyScaling.ts`, `src/types/index.ts`, and related combat systems:
1. Analyze how Boss Galaga health, stage boss health, wave sizes, dive aggressiveness, and enemy firing rates are currently computed and stored.
2. Design the Co-op Dynamic Scaling Engine:
   - In 2-Player Co-op Mode (`game.isCoop() === true`):
     - Boss Galaga base HP scaled by +50% (e.g. 2 hits -> 3 hits).
     - Stage Bosses (alien queens / motherships) HP scaled by +60%.
     - Wave attack aggression and bullet density scaled by +25%.
   - In Single-Player Mode: 100% preservation of classic arcade stats and difficulty progression.
3. Ensure zero-GC invariants and backward compatibility across all 115 test files.
4. Output your architectural findings, mathematical scaling equations, code modification points, and step-by-step implementation recommendations into `/Users/user/src/galog/.agents/m33_explorer_1/handoff.md`.
5. Update your `progress.md` with timestamps and send a completion message to parent when finished.
