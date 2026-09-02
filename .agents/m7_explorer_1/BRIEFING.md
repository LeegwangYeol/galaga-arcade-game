# BRIEFING — 2026-09-02T13:46:40Z

## Mission
Design detailed production-ready implementations for `src/ui/HUD.ts` (top header score/1UP/high score, lives indicator, stage indicator badges, authentic arcade layout and fonts).

## 🔒 My Identity
- Archetype: explorer
- Roles: Milestone 7: HUD, Stage Badges & Arcade Fonts Specialist
- Working directory: /Users/user/src/galog/.agents/m7_explorer_1
- Original parent: a47fd167-cbab-4c4b-bc2b-cc7faa3d92f7
- Milestone: Milestone 7 (HUD, Stage Badges & Arcade Fonts)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement / modify source code directly
- Must adhere to authentic Galaga arcade specifications (224x288 virtual canvas)
- Complete evidence chain and self-contained 5-component handoff report

## Current Parent
- Conversation ID: a47fd167-cbab-4c4b-bc2b-cc7faa3d92f7
- Updated: 2026-09-02T13:48:55Z

## Investigation State
- **Explored paths**:
  - `PROJECT.md`, `src/types/index.ts`, `src/core/Game.ts`, `src/core/ScreenManager.ts`, `src/renderer/SpriteRenderer.ts`, `tests/unit/score.test.ts`.
- **Key findings**:
  - Virtual screen is $224 \times 288$ ($28 \times 36$ tiles of $8 \times 8$).
  - System fonts cause browser-dependent blurring; procedural $8 \times 8$ bitmask font pre-baked on offscreen canvases guarantees pixel-perfect rendering with zero runtime GC overhead.
  - Authentic Namco stage badge decomposition algorithm rigorously extracts $50 \to 30 \to 20 \to 10 \to 5 \to 1$ badges and aligns rightward ending at $X = 216$.
  - Reserve lives calculation $\max(0, \text{lives} - 1)$ caps at 5 icons with $14\text{ px}$ stride.
  - 1UP blinks at $2\text{ Hz}$ in red during gameplay while score numbers remain solidly displayed in white.
- **Unexplored areas**: None for M7 HUD scope.

## Key Decisions Made
- Pre-bake 9-color font atlases using Namco 2843 character generator bitmasks.
- Embed full pixel bit-matrices for `BADGE_50`, `BADGE_30`, `BADGE_10`, `BADGE_5`, `BADGE_1` and pre-bake onto offscreen canvases.
- Provide comprehensive unit test suite in `tests/unit/hud.test.ts`.

## Artifact Index
- /Users/user/src/galog/.agents/m7_explorer_1/DISPATCH.md — Dispatch log
- /Users/user/src/galog/.agents/m7_explorer_1/BRIEFING.md — Persistent memory
- /Users/user/src/galog/.agents/m7_explorer_1/analysis.md — Comprehensive M7 analysis
- /Users/user/src/galog/.agents/m7_explorer_1/handoff.md — 5-component handoff report
