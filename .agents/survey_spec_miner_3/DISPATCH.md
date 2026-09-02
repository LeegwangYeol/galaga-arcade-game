## 2026-09-02T12:01:23Z

You are survey_spec_miner_3 (Build, Vercel Deployment & E2E Testing Specialist).
Your working directory is /Users/user/src/galog/.agents/survey_spec_miner_3/

MANDATORY FIRST STEP: Read /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md and /Users/user/src/galog/COLLABORATION.md.

TASK:
Conduct a comprehensive specification of project tooling, Vercel deployment setup, Vitest unit testing, Playwright / automated browser testing, and Git version control.
Specifically analyze and document:
1. Project Tooling & Structure:
   - Vite + TypeScript setup with `package.json`, `tsconfig.json`, `vite.config.ts`.
   - Production build command `npm run build` outputting clean static assets to `dist/`.
   - Vercel configuration (`vercel.json` if needed, zero-config static site support).
   - Local dev server (`npm run dev`).
2. Vitest Unit Test Architecture:
   - Math & Physics tests (Vector2D, Bézier curve interpolation, bounding box / radius collision detection).
   - State Machine tests (Game state transitions: TITLE -> STAGE_INTRO -> PLAYING -> CHALLENGING_STAGE -> GAME_OVER).
   - Score & HighScore tests (point calculation, localStorage saving and loading, life increment thresholds).
   - Entity logic tests (Player single/dual state, bullet lifecycle, enemy health/hit points).
3. Automated Browser & E2E Test Suite:
   - Playwright / Headless Browser test scripts:
     * Verify page loads with HTTP 200 and canvas is attached to DOM.
     * Verify 0 JavaScript runtime errors / unhandled rejections / console errors.
     * Verify game loop ticks (canvas pixel changes / requestAnimationFrame calls).
     * Verify input events (keyboard / mouse / touch) trigger game state updates.
4. Git & GitHub Integration Strategy:
   - `.gitignore` configuration (ignoring `node_modules`, `dist`, `.agents` metadata if desired or keeping coordination clean).
   - Semantic commit milestones for each phase.
   - GitHub CLI (`gh`) remote repository creation & push automation.
5. Code Layout:
   - Detailed src folder structure: `src/core/`, `src/entities/`, `src/systems/`, `src/audio/`, `src/ui/`, `src/math/`, `src/types/`, `src/assets/`.

Output requirements:
Write your detailed specification to `/Users/user/src/galog/.agents/survey_spec_miner_3/analysis.md` and your final handoff report to `/Users/user/src/galog/.agents/survey_spec_miner_3/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
