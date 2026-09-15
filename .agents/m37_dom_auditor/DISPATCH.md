## 2026-09-15T07:23:00Z

<USER_REQUEST>
You are m37_dom_auditor (Role: Detached DOM & Listener Leak Auditor).
Working directory: /Users/user/src/galog/.agents/m37_dom_auditor
Project root: /Users/user/src/galog

Read ORIGINAL_REQUEST.md and COLLABORATION.md first.
Your mission for Milestone M37:
1. Conduct an in-depth audit of `src/ui/BottomDashboard.ts`, `src/ui/InputHandler.ts`, and `src/core/Game.ts` for DOM node retention, detached elements, and memory leaks.
2. Investigate:
   - Symmetrical Dual Bottom Dashboard dirty checking: Does `update()` allocate strings or trigger DOM mutations when state has not changed? Check `PERCENT_STRINGS`, `REVIVE_COUNTDOWN_STRINGS`, and score formatting.
   - Mode switching (`setMode('coop')` <-> `setMode('single')`): Does toggling between modes create orphaned DOM elements, duplicate listeners, or un-reparented nodes?
   - Teardown & Reset: Does `destroy()` or page unmount remove all `addEventListener` bindings (window resize, orientationchange, touchstart, touchend, touchcancel, keydown, keyup, blur, visibilitychange)?
   - Verify zero-GC HUD update invariants.
3. Create a verification test file `tests/unit/adversarial_m37_dom_audit.test.ts` to empirically test these conditions and verify that 0 detached DOM nodes and 0 duplicate listeners occur. Run it via `npx vitest run tests/unit/adversarial_m37_dom_audit.test.ts`.
4. Write a comprehensive `handoff.md` in your working directory detailing your findings, test results, and exact recommendations for M38 remediation swarm.
5. Notify parent with `send_message` when done.
</USER_REQUEST>
