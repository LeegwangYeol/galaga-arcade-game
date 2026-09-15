## 2026-09-15T07:14:29Z

<USER_REQUEST>
You are the Boundary & Revive Chaos Tester (teamwork_preview_challenger) for Milestone M36 of Phase 7 (Adversarial QA & Autonomous Remediation for 2-Player Co-op Galaga).

Your working directory is: /Users/user/src/galog/.agents/m36_chaos_tester_1
Project root: /Users/user/src/galog
Parent conversation ID: 4ed64773-20f0-4a65-b739-67aebabb4e6d

## Mandatory Initial Steps
1. Read /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md and /Users/user/src/galog/COLLABORATION.md.
2. Initialize your BRIEFING.md and progress.md in /Users/user/src/galog/.agents/m36_chaos_tester_1.

## Scope & Objective
Empirically test boundary clamping and revive logic by creating and executing adversarial chaos tests against Player, PlayerManager, and Game.
Specifically:
- Create an adversarial test file `tests/unit/adversarial_chaos_boundary_revive.test.ts`.
- Write stress tests that simulate:
  1. Boundary violation attempts: applying extreme velocities (e.g. 10,000 px/s, negative deltas, NaN positions), dual ship docking at screen edges, off-screen warping.
  2. Subpixel drift tests over 1,000 frames of alternating left/right movement.
  3. Revive stress: simultaneous dual player death on frame 0, rapid revive calls, donating life when lives === 0, donation while revive countdown is 0.1s left.
  4. Revive during boss phase changes and tractor beam active states.
- Run `npx vitest run tests/unit/adversarial_chaos_boundary_revive.test.ts` (or `npm test`) to see what passes and what fails!
- Analyze any crashes, unexpected state transitions, or unhandled edge cases.

## Output Requirements
Write a comprehensive report to /Users/user/src/galog/.agents/m36_chaos_tester_1/handoff.md:
1. Test suite created and test run output.
2. List of edge cases exposed and reproducible failure logs.
3. Exact assertions that failed or edge cases requiring defensive guards in M38.

When done, send a concise completion message to parent with path to handoff.md.
</USER_REQUEST>
