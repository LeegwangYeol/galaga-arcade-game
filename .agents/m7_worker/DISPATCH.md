## 2026-09-02T13:49:14Z

You are m7_worker (Milestone 7 Implementation Worker).
Your working directory is /Users/user/src/galog/.agents/m7_worker/

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/m7_explorer_1/analysis.md
- /Users/user/src/galog/.agents/m7_explorer_2/analysis.md
- /Users/user/src/galog/.agents/m7_explorer_3/analysis.md
- /Users/user/src/galog/src/types/index.ts

SCOPE OF WORK & EXCLUSIVE FILE OWNERSHIP:
You exclusively own:
- `/Users/user/src/galog/src/systems/ScoreManager.ts`
- `/Users/user/src/galog/src/ui/HUD.ts`
- `/Users/user/src/galog/src/ui/Screens.ts`
- `/Users/user/src/galog/src/ui/InputHandler.ts`
- `/Users/user/src/galog/src/core/Game.ts`
- `/Users/user/src/galog/index.html`
- `/Users/user/src/galog/tests/unit/hud_screens.test.ts`

EXECUTION INSTRUCTIONS:
1. Implement `src/systems/ScoreManager.ts` (Score tracking, LocalStorage persistence with fallback, extra life extends at 20k/70k/+70k with life audio event dispatch, shot accuracy telemetry, challenging stage bonus calculations).
2. Implement `src/ui/HUD.ts` (procedural 8x8 arcade bitmap font atlas, 1UP/HIGH SCORE top headers, bottom-left reserve lives icons, bottom-right greedy stage badges: 50, 30, 20, 10, 5, 1).
3. Implement `src/ui/Screens.ts` (Title Screen with blinking prompt, Stage Intro banner, Challenging Stage intro & results screen, Pause overlay, Game Over screen with accuracy statistics).
4. Update `src/ui/InputHandler.ts` and `index.html` to provide seamless mobile touch virtual controls and keyboard/mouse handling.
5. Update `src/core/Game.ts` to connect HUD, Screens, ScoreManager, and state machine flow into the master loop.
6. Write comprehensive unit tests in `tests/unit/hud_screens.test.ts` verifying all HUD elements, badge math, score storage recovery, hit-miss ratio, and screen transitions.
7. Run `npm run typecheck`, `npm run build`, and `npm test`. Ensure 100% pass with 0 errors.
8. Commit changes: `git add . && git commit -m "feat(ui): implement HUD, bitmap font atlas, ScoreManager with LocalStorage, game screens, and mobile touch UX"`.
