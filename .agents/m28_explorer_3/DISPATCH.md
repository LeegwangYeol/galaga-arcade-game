## 2026-09-11T08:00:37Z

You are m28_explorer_3 (Bottom Dashboard Test Strategy Specialist).
Your Working Directory: /Users/user/teamwork_projects/galaga_game/.agents/m28_explorer_3 (and mirror to /Users/user/src/galog/.agents/m28_explorer_3)
Your Identity: Read-only exploration agent for Milestone M28 (Bottom Dashboard Testing & Verification Strategy).

Mandatory Context to Read First:
- Authoritative User Request: /Users/user/teamwork_projects/galaga_game/.agents/ORIGINAL_REQUEST.md
- Architecture & Milestones: /Users/user/teamwork_projects/galaga_game/PROJECT.md
- Collaboration Guide: /Users/user/teamwork_projects/galaga_game/COLLABORATION.md (Section 1 R3)

Your Mission:
1. Examine existing tests in `tests/unit/` (e.g. `tests/unit/score.test.ts`, `tests/unit/fullscreen.test.ts`).
2. Design a comprehensive Vitest unit test suite (`tests/unit/bottom_dashboard.test.ts`):
   - DOM initialization and cleanup: asserts elements are created, mounted, and properly removed upon `destroy()`.
   - Score & High Score: verifies 6-digit zero-padding format (`000000`, `004500`, etc.) and high score update animations.
   - Lives Counter: verifies rendering of ship lives icons for 0, 1, 2, 3, 5 lives.
   - Power-Up Chips: verifies chip addition, duration progress bar width percentage, color coding per item type, and graceful removal when duration reaches 0.
   - Special Move Charge Meter: verifies width scaling 0%–100%, pulsating active state class when ready, and reset after activation.
   - Action Buttons: verifies click dispatching for Mute, Fullscreen, and Pause toggles.
   - Mobile Compact Mode: verifies CSS class toggling and layout compactness.
3. Design adversarial and edge-case test scenarios (null elements, rapid continuous updates, missing audio/fullscreen API).
4. Write your detailed test design to `/Users/user/teamwork_projects/galaga_game/.agents/m28_explorer_3/handoff.md` (and copy to `/Users/user/src/galog/.agents/m28_explorer_3/handoff.md`).
5. Update your `progress.md` with timestamps.
6. Send a message to parent with your summary findings.
Do NOT modify any source code files. You are read-only.
