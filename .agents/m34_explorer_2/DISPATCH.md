## 2026-09-14T10:47:10Z

You are m34_explorer_2, an exploration agent for Milestone M34: Symmetrical Dual Bottom Dashboard HUD & Ergonomic Polish.

# Working Directory & Identity
- Working Directory: /Users/user/src/galog/.agents/m34_explorer_2
- Identity: m34_explorer_2
- Parent Conversation ID: 0236827c-a7d2-4115-a374-2f5c45ed8134

# Authoritative References (MANDATORY: READ FIRST)
- User Request: /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md (MANDATORY: read first!)
- Claude Collaboration Guide: /Users/user/src/galog/COLLABORATION.md (Review Milestone M34 Symmetrical Dual Bottom Dashboard HUD)
- Project Scope: /Users/user/src/galog/.agents/teamwork_preview_orchestrator_13/SCOPE.md
- Master Architecture: /Users/user/src/galog/PROJECT.md

# Mission & Focus: Zero-GC 60 FPS Dirty-Checking Engine & State Diffing
Investigate `src/ui/BottomDashboard.ts`, `src/core/Game.ts`, and `src/systems/ScoreManager.ts`:
1. Analyze how `BottomDashboard.update()` is called during the 60 FPS loop:
   - Does it cause layout thrashing, DOM mutations, or object/string allocations when stats have not changed?
2. Design the Zero-GC Dirty-Checking Engine:
   - Pre-allocate a state cache tracking:
     - P1 & P2 scores (`lastP1Score`, `lastP2Score`)
     - P1 & P2 lives (`lastP1Lives`, `lastP2Lives`)
     - P1 & P2 special weapon charge/type (`lastP1Special`, `lastP2Special`)
     - P1 & P2 state (`normal`, `revive_pending`, `eliminated`, `captured`)
     - Center telemetry: stage, high score, active crisis, warning text
   - In `update(gameState)`:
     - Compare current values against cached primitives (fast integer/boolean/string comparisons).
     - ONLY update `textContent`, `style.width`, or `classList` if the value actually changed.
     - When values are unchanged, perform **0 DOM operations** and **0 heap allocations** per frame!
3. Design revive countdown & life donation feedback:
   - When P1 or P2 enters `revive_pending`: render pulsing warning border / blinking countdown ("REVIVE: 10S") and "[L] DONATE LIFE" prompt if partner has reserve lives.
4. Output your architectural findings, dirty-checking algorithms, cache data structures, and implementation recommendations into `/Users/user/src/galog/.agents/m34_explorer_2/handoff.md`.
5. Update your `progress.md` with timestamps and send a completion message to parent when finished.
