## 2026-09-02T12:23:24Z
You are m2_explorer_3 (Milestone 2: Input Handler & Game Coordinator Specialist).
Your working directory is /Users/user/src/galog/.agents/m2_explorer_3/

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/survey_explorer_2/analysis.md
- /Users/user/src/galog/src/types/index.ts

TASK:
Design detailed production-ready implementations for:
1. `src/ui/InputHandler.ts`:
   - Keyboard listener: ArrowLeft, ArrowRight, ArrowUp, ArrowDown, A, D, W, S, Space, Z, K, P, Enter, R.
   - Mouse listener: `mousemove`, `mousedown`, `mouseup` translated to virtual canvas coordinates via `ScreenManager`.
   - Touch listener: `touchstart`, `touchmove`, `touchend`, `touchcancel` with `e.preventDefault()` to prevent scrolling/zooming.
   - On-screen virtual joystick / left-right touch zones + virtual Fire button for mobile devices.
   - `getState(): InputState`, `consumeAction(action: 'fire' | 'pause' | 'restart'): boolean`.
2. `src/core/Game.ts`:
   - Master coordinator tying `ScreenManager`, `GameLoop`, `Starfield`, `InputHandler`.
   - Clear canvas rendering pipeline with double-buffering / crisp pixel drawing.
   - Boot sequence: initializes canvas, attaches input handlers, starts loop, displays initial arcade starfield and title screen.

Output requirements:
Write your full analysis to `/Users/user/src/galog/.agents/m2_explorer_3/analysis.md` and handoff report to `/Users/user/src/galog/.agents/m2_explorer_3/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
