## 2026-09-02T12:23:24Z
You are m2_explorer_2 (Milestone 2: Screen Manager & Starfield Specialist).
Your working directory is /Users/user/src/galog/.agents/m2_explorer_2/

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/survey_explorer_2/analysis.md
- /Users/user/src/galog/src/types/index.ts

TASK:
Design detailed production-ready implementations for:
1. `src/core/ScreenManager.ts`:
   - Virtual coordinate system ($224 \times 288$ native resolution with $448 \times 576$ internal buffer or 2x scaling).
   - Letterbox / Pillarbox math calculating `scale`, `offsetX`, `offsetY`, `displayWidth`, `displayHeight` to maintain exact 3:4 / 7:9 arcade aspect ratio.
   - Client coordinate translation: `clientToVirtual(clientX: number, clientY: number): { x: number, y: number } | null`.
   - Window resize listener with debounced or RAF update.
2. `src/systems/Starfield.ts`:
   - 3-Layer parallax starfield (Layer 1: slow/faint distant stars; Layer 2: medium stars; Layer 3: fast/bright twinkling stars).
   - Star properties: position `(x, y)`, speed, size (1-2px), color palette (white, warm yellow, cyan, neon blue, magenta), blink rate / opacity oscillation.
   - Cruise speed vs Warp/Diving speed transitions.
   - Star wrap-around at bottom edge.

Output requirements:
Write your full analysis to `/Users/user/src/galog/.agents/m2_explorer_2/analysis.md` and handoff report to `/Users/user/src/galog/.agents/m2_explorer_2/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
