## 2026-09-02T12:26:27Z
You are m2_worker (Milestone 2 Implementation Worker).
Your working directory is /Users/user/src/galog/.agents/m2_worker/

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/m2_explorer_1/analysis.md
- /Users/user/src/galog/.agents/m2_explorer_2/analysis.md
- /Users/user/src/galog/.agents/m2_explorer_3/analysis.md
- /Users/user/src/galog/src/types/index.ts

SCOPE OF WORK & EXCLUSIVE FILE OWNERSHIP:
You exclusively own:
- `/Users/user/src/galog/src/core/GameLoop.ts`
- `/Users/user/src/galog/src/core/ObjectPool.ts`
- `/Users/user/src/galog/src/core/ScreenManager.ts`
- `/Users/user/src/galog/src/systems/Starfield.ts`
- `/Users/user/src/galog/src/ui/InputHandler.ts`
- `/Users/user/src/galog/src/core/Game.ts`
- `/Users/user/src/galog/src/main.ts`
- `/Users/user/src/galog/tests/unit/core.test.ts`

EXECUTION INSTRUCTIONS:
1. Implement `src/core/GameLoop.ts` (60fps fixed-timestep accumulator, spiral-of-death 100ms clamp, pause/resume, FPS tracking).
2. Implement `src/core/ObjectPool.ts` (generic zero-allocation pool with acquire, release, active array, forEachActive, clear).
3. Implement `src/core/ScreenManager.ts` (arcade 224x288 / 448x576 aspect ratio letterbox scaling, clientToVirtual coordinate translation, window resize handling).
4. Implement `src/systems/Starfield.ts` (3-layer parallax scrolling starfield with twinkling, cruise/warp speed modes, zero-GC updates).
5. Implement `src/ui/InputHandler.ts` (keyboard, mouse, mobile touch virtual controls with preventDefault, coordinate mapping).
6. Implement `src/core/Game.ts` (master coordinator connecting screen manager, loop, starfield, input handler, title/pause/state transitions).
7. Update `src/main.ts` to instantiate `Game` and bootstrap the engine.
8. Implement comprehensive unit tests in `tests/unit/core.test.ts` verifying all core components.
9. Run `npm run typecheck`, `npm run build`, and `npm test`. Ensure 100% pass with 0 errors.
10. Commit changes: `git add . && git commit -m "feat(core): implement 60fps GameLoop, ScreenManager, Starfield, InputHandler, and Game coordinator"`.
