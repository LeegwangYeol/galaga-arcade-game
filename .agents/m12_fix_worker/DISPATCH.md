## 2026-09-04T09:36:11Z

You are m12_fix_worker.
Your working directory is `/Users/user/teamwork_projects/galaga_game/.agents/m12_fix_worker`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You MUST read:
- `/Users/user/teamwork_projects/galaga_game/.agents/ORIGINAL_REQUEST.md`
- `/Users/user/teamwork_projects/galaga_game/PROJECT.md`
- `/Users/user/teamwork_projects/galaga_game/COLLABORATION.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/teamwork_preview_orchestrator_6/DISPATCH.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/m12_auditor_1/handoff.md` (AUDIT EVIDENCE - MANDATORY)
- `/Users/user/teamwork_projects/galaga_game/.agents/m12_reviewer_2/handoff.md` (REVIEWER DEFECTS - MANDATORY)
- `/Users/user/teamwork_projects/galaga_game/.agents/m12_fix_explorer_1/handoff.md` and `analysis.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/m12_fix_explorer_2/handoff.md` and `analysis.md`
- `/Users/user/teamwork_projects/galaga_game/.agents/m12_fix_explorer_3/handoff.md` and `analysis.md`

Your Objective: Implement all required remediations for Milestone 12:
1. Zero-GC Heap Allocation Fix:
   - In `src/core/boss/bosses/NaniteColossus.ts`: Replace per-frame `anchors` allocation (lines 124–130) with `static readonly ANCHORS`. Cache salvo fire angles with `static readonly SALVO_ANGLES`.
   - In `src/core/boss/bosses/AeternumCore.ts`: In `updatePhase3()` (lines 236–242), eliminate the 4 `{ x, y }` Point allocations per frame by inlining scalar Bézier polynomial calculations. Cache shotgun angles with `static readonly SHOTGUN_ANGLES`.
2. Sub-Unit Lifecycle & Stage 30 Softlock Fix:
   - In `src/core/Game.ts`: In `onSpawnBoss`, return `[boss, ...boss.subUnits]` so all sub-units (including initially inactive ones like NaniteColossus mini-constructs) are registered in `formationManager.enemies`.
   - In `src/core/boss/BaseBoss.ts`: Remove the duplicate sub-unit update and render loops in `updateBoss` and `renderBoss` so `FormationManager` serves as the Single Source of Truth, preventing double-update (120Hz) and double-rendering.
3. Stage 10 Escort Drone Sprite Registration:
   - In `src/renderer/SpriteRenderer.ts`: Register `'ZAKO_WING_0'` using `[ZAKO_FRAME_0_MATRIX, ZAKO_FRAME_1_MATRIX]` and ensure `draw(ctx, 'ZAKO_WING_0', ...)` renders cleanly.
4. Test Suite Integrity Fix:
   - In `tests/unit/boss_stage40_psionic.test.ts`: Apply the remediation from `m12_fix_explorer_3` (lines 91–96). Call `game.setState('PLAYING')` before testing player movement; assert genuine movement reduction (~1.08px vs ~4.33px) without vacuous assertions.
   - In `tests/unit/adversarial_boss_hazards.test.ts`: In Area 2, ensure `tear[0]` singularity test isolates `tear[0]` (`tear[1].active = false`); in Area 4, set `game.setState('PLAYING')` and verify bounds against single-fighter range [12, 212].
5. Verification:
   - Run `npm test` and ensure all 45 test files and 848+ tests pass with 0 failures.
   - Run `npm run build` and ensure production compilation succeeds with code 0.
6. Documentation:
   - Deliver comprehensive handoff report to `/Users/user/teamwork_projects/galaga_game/.agents/m12_fix_worker/handoff.md` and message parent when complete.
