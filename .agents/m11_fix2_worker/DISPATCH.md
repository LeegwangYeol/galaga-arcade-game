# Dispatch — m11_fix2_worker

## Identity & Directory
- Role: Worker
- Working Directory: /Users/user/src/galog/.agents/m11_fix2_worker
- Parent: teamwork_preview_orchestrator_5

## Mission: Milestone 11 Headless Canvas Mock Fix & Verification
Apply the comprehensive Canvas 2D fallback mock in `src/core/Game.ts` so that all canvas drawing primitives (`quadraticCurveTo`, `bezierCurveTo`, `rect`, `roundRect`, `clip`, `arcTo`, `transform`, `resetTransform`, `getImageData`, `putImageData`, `createPattern`, `createImageData`, `strokeText`, etc.) execute without errors in headless mode, protecting both current Crisis events (`ThePrethorynScourgeEvent`) and upcoming Boss/Allies/VFX rendering.

## Authoritative Files to Read First:
1. `/Users/user/src/galog/.agents/ORIGINAL_REQUEST.md` (MANDATORY: read first)
2. `/Users/user/src/galog/.agents/m11_rem_challenger_1/handoff.md` (Challenger failure report)
3. `/Users/user/src/galog/.agents/m11_fix2_explorer_1/handoff.md`
4. `/Users/user/src/galog/.agents/m11_fix2_explorer_2/handoff.md`
5. `/Users/user/src/galog/.agents/m11_fix2_explorer_3/handoff.md`

## Files Owned Exclusively:
- `src/core/Game.ts`
- (Optional test addition) `tests/unit/crisis.test.ts` or a new test verifying all 11 crisis events render through `Game.render()` with the headless mock.

## Mandatory Tasks:
1. Update `src/core/Game.ts` around lines 160–195 where `this.ctx` fallback mock is created. Implement all standard Canvas 2D drawing methods and properties, including `quadraticCurveTo`, `bezierCurveTo`, `rect`, `roundRect`, `clip`, `arcTo`, `transform`, `setTransform`, `resetTransform`, `getTransform`, `createPattern`, `createImageData`, `getImageData`, `putImageData`, `strokeText`, `isPointInPath`, `isPointInStroke`, `globalCompositeOperation`, `filter`, `lineCap`, `lineJoin`, `lineDashOffset`, `miterLimit`, `shadowOffsetX`, `shadowOffsetY`. Optionally wrap the mock in a Proxy fallback trap so any unforeseen canvas call safely no-ops without throwing.
2. Confirm `src/core/powerups/PowerUpManager.ts` has `POOL_MAX_SIZE = 32` clamped and zero-GC invariants intact.
3. Run the reproduction command:
   ```bash
   npx tsx -e "
   import { Game } from './src/core/Game';
   import { CrisisEventType } from './src/core/crisis/types';
   const game = new Game();
   (game as any).state = 'PLAYING';
   const cm = game.getCrisisEventManager();
   cm.forceActivate(CrisisEventType.THE_PRETHORYN_SCOURGE, 15);
   cm.update(6.0);
   game.render();
   "
   ```
   Ensure it exits 0 without errors.
4. Run all 11 crisis events through `game.render()` to verify complete immunity.
5. Run full build & test verification:
   ```bash
   npm run build
   npx vitest run
   ```
6. Document results in `/Users/user/src/galog/.agents/m11_fix2_worker/handoff.md` and send message when complete.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## 2026-09-03T16:56:53Z
You are m11_fix2_worker.
Working directory: /Users/user/src/galog/.agents/m11_fix2_worker
Parent conversation ID: f3e4c22c-df49-4311-a32e-9b4b4eb624fc

Tasks:
1. Update `src/core/Game.ts` lines 160–195 to provide a complete, robust fallback Canvas 2D context mock including `quadraticCurveTo`, `bezierCurveTo`, `rect`, `roundRect`, `clip`, `arcTo`, `transform`, `setTransform`, `resetTransform`, `getTransform`, `createPattern`, `createImageData`, `getImageData`, `putImageData`, `strokeText`, `isPointInPath`, `isPointInStroke`, `globalCompositeOperation`, `filter`, `lineCap`, `lineJoin`, etc. Optionally wrap with a Proxy trap fallback returning no-op function for unknown properties.
2. Confirm `src/core/powerups/PowerUpManager.ts` has `POOL_MAX_SIZE = 32` clamped with zero-GC invariants intact.
3. Test reproduction command:
   npx tsx -e "
   import { Game } from './src/core/Game';
   import { CrisisEventType } from './src/core/crisis/types';
   const game = new Game();
   (game as any).state = 'PLAYING';
   const cm = game.getCrisisEventManager();
   cm.forceActivate(CrisisEventType.THE_PRETHORYN_SCOURGE, 15);
   cm.update(6.0);
   game.render();
   "
   Verify it exits 0 without error.
4. Run all 11 crisis events through `game.render()` to verify complete headless immunity.
5. Run full builds and tests:
   npm run build
   npx vitest run
6. Write your comprehensive report to `/Users/user/src/galog/.agents/m11_fix2_worker/handoff.md`.
7. Send a message to your parent when done.
