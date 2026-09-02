# Milestone 7: HUD, Stage Badges & Arcade Fonts — Handoff Report

## 1. Observation

- **Core Engine Resolution**: `src/core/ScreenManager.ts:21-23` and `src/core/Game.ts:39-40` establish a fixed virtual canvas resolution of $224 \times 288$ ($3:4$ aspect ratio) matching authentic Namco *Galaga* (1981) arcade CRT dimensions.
- **Existing Inline HUD**: `src/core/Game.ts:828-877` currently contains placeholder `renderHUD` and `renderHUDFooter` functions using generic browser Canvas monospace fonts (`ctx.font = '8px monospace'`), hardcoded string labels, and simple numeric text `STAGE ${this.stage}` instead of authentic Namco pixel-art stage badges.
- **Existing Procedural Sprite System**: `src/renderer/SpriteRenderer.ts:149-160` exports `PLAYER_LIFE_ICON_MATRIX` ($11 \times 10\text{ px}$) and palette constants `PALETTE` and `PALETTE_CHAR_MAP`, supporting pre-baked offscreen canvas rendering.
- **Existing Test Coverage**: 438 unit tests across 20 test suites are currently passing (`npm test` exited 0).
- **Score Subsystem State**: `tests/unit/score.test.ts:29-180` includes a full in-memory `ScoreManager` specification with extra life thresholds (20,000, 70,000, and every 70,000 thereafter) and LocalStorage persistence.

## 2. Logic Chain

1. **Step 1 (Font Rendering Inconsistency)**: Relying on system `ctx.font = '8px monospace'` causes cross-platform differences in glyph shapes, baseline alignments, and antialiasing blur. A procedural $8 \times 8$ bitmask font atlas (reproducing the Namco 2843 PROM character generator) pre-baked into offscreen canvases guarantees 100% deterministic, zero-latency, crisp pixel rendering across all browsers.
2. **Step 2 (Top Header Authenticity)**: In authentic Galaga, `1UP` is in Red (`#E70000`) and blinks at $\approx 2\text{ Hz}$ during active single-player gameplay, while score digits in White (`#FFFFFF`) remain solid. Zero score is displayed as `00`, and high score is right-aligned under `HIGH SCORE`.
3. **Step 3 (Reserve Lives Indicator)**: The active player ship on screen represents the active life. The bottom status bar must display reserve lives ($\text{reserve} = \max(0, \text{lives} - 1)$) up to a maximum of 5 mini-fighter icons ($11 \times 10\text{ px}$) at stride $14\text{ px}$.
4. **Step 4 (Stage Badge Greedy Decomposition)**: Namco *Galaga* displays stage progression at bottom-right using 5 distinct milestone badges (50, 30/20, 10, 5, 1). A greedy extraction algorithm ($N_{50} = \lfloor \text{stage} / 50 \rfloor \to N_{30} \to N_{20} \to N_{10} \to N_{5} \to N_{1}$) produces the minimal canonical sequence.
5. **Step 5 (Right-Aligned Layout & Anti-Crowding)**: Badges render from right margin $X = 216$ leftwards with $2\text{ px}$ spacing, with bounds clamping to prevent overlap with the lives icons at bottom-left.

## 3. Caveats

- **Two-Player Mode**: The HUD specification includes support for `2UP` rendering and 2-player score display; currently the core game is single-player with 2UP attract mode display.
- **Challenging Stage Banner**: In Challenging Stages, the center overlay displays "CHALLENGING STAGE", which coordinates with `HUD.ts` and `Screens.ts`.

## 4. Conclusion

`src/ui/HUD.ts` is fully designed with:
- Procedural $8 \times 8$ bitmask font atlas across 9 palette colors.
- Top score header (`1UP` blinking, formatted scores, `HIGH SCORE`, `2UP`).
- Bottom-left reserve lives indicator (max 5 icons).
- Bottom-right stage badges with 5 pixel matrices (`BADGE_50`, `BADGE_30`, `BADGE_10`, `BADGE_5`, `BADGE_1`) and greedy decomposition.
- Comprehensive unit test suite in `tests/unit/hud.test.ts`.

All design details and full source implementations are documented in `/Users/user/src/galog/.agents/m7_explorer_1/analysis.md`.

## 5. Verification Method

1. **Unit Test Verification**:
   ```bash
   npm test
   ```
   Ensures all 438+ unit tests (including new `tests/unit/hud.test.ts`) pass with 0 errors.
2. **Build Verification**:
   ```bash
   npm run build
   ```
   Verifies TypeScript strict compilation and Vite static bundle output in `dist/`.
3. **Visual Verification**:
   Inspect canvas at $224 \times 288$ virtual resolution to verify:
   - Top header: `1UP` blinks in red, score in white, `HIGH SCORE` centered in red with score in white.
   - Bottom-left: Correct reserve ship icons corresponding to player lives.
   - Bottom-right: Proper stage badges decomposing current stage (e.g. Stage 1 $\to$ 1 blue chevron, Stage 5 $\to$ 1 yellow banner, Stage 10 $\to$ 1 red pennant, Stage 50 $\to$ 1 giant red flag).
