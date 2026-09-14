## 2026-09-03T03:52:56Z

You are m10_worker (Role: Crisis Engine & 11 Stellaris Events Implementation Worker).
Working directory: /Users/user/src/galog/.agents/m10_worker/
Project root: /Users/user/src/galog

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY INPUTS:
Read these architectural reports before writing any code:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/.agents/teamwork_preview_orchestrator_2/SCOPE.md
- /Users/user/src/galog/.agents/m10_explorer_1/report.md
- /Users/user/src/galog/.agents/m10_explorer_2/report.md
- /Users/user/src/galog/.agents/m10_explorer_3/report.md

FILE OWNERSHIP (Exclusive):
You have exclusive write ownership over:
- src/core/crisis/types.ts (Create)
- src/core/crisis/CrisisEventFactory.ts (Create)
- src/core/crisis/CrisisEventManager.ts (Create)
- src/core/crisis/events/TheContingencyEvent.ts (Create)
- src/core/crisis/events/TheUnbiddenEvent.ts (Create)
- src/core/crisis/events/ThePrethorynScourgeEvent.ts (Create)
- src/core/crisis/events/ShieldOverloadEvent.ts (Create)
- src/core/crisis/events/PhysicsInversionEvent.ts (Create)
- src/core/crisis/events/HyperspaceStormEvent.ts (Create)
- src/core/crisis/events/NaniteCloudEvent.ts (Create)
- src/core/crisis/events/PsionicResonanceEvent.ts (Create)
- src/core/crisis/events/DevouringSwarmFrenzyEvent.ts (Create)
- src/core/crisis/events/NemesisStarEaterEvent.ts (Create)
- src/core/crisis/events/TimeDilationFieldEvent.ts (Create)
- src/core/Game.ts (Update: wire CrisisEventManager into Game constructor, update loop, render hook, and onStageClear)
- tests/unit/crisis.test.ts (Create: comprehensive unit test suite covering all 11 crises)

IMPLEMENTATION SPECIFICATIONS:
1. `src/core/crisis/types.ts`:
   - Enumerate all 11 `CrisisEventType` enums.
   - Define `CrisisState`, `CrisisEventContext`, `ICrisisEvent`, `CrisisMetadata`, `BaseCrisisEvent`.
2. `src/core/crisis/CrisisEventFactory.ts`:
   - Static registry with dynamic registration of all 11 crisis classes.
   - `create(type, context)`, `register(type, ctor, metadata)`, `getAllTypes()`, `getRandomType(exclude)`.
3. `src/core/crisis/CrisisEventManager.ts`:
   - Stage progression evaluation: activates on stages > 10, skipping challenging stages (`DifficultyCalculator.isChallengingStage`), 40% probability, stage cooldowns.
   - 3.0s warning timer (`WARNING` state) with warning info.
   - 20.0s active duration (`ACTIVE` state) with update and canvas render hooks.
   - Safe teardown: `onDeactivate()` called on completion, stage clear, or manual reset.
4. Implement all 11 concrete crisis classes in `src/core/crisis/events/`:
   - Zero external assets (pure procedural 2D canvas). Zero GC during 60 FPS update/render.
   - `TheContingencyEvent`: AI rogue pulse, predictive enemy bullet targeting, player fire rate glitch.
   - `TheUnbiddenEvent`: Dimensional tear, Plummer gravitational trajectory bending on player bullets, logarithmic spiral vortex.
   - `ThePrethorynScourgeEvent`: Organic hive infestation, defeated enemies burst into micro-spores, surviving enemies gain chitinous regenerating shields.
   - `ShieldOverloadEvent`: Kinetic energy overdrive (+2 shields to all living enemies, rotating hexagonal barrier).
   - `PhysicsInversionEvent`: Singularity shift (starfield flow reverses upward, inverted dive paths).
   - `HyperspaceStormEvent`: Cosmic lightning lanes (flashing vertical warning bands, enemy dive speed boost +25%).
   - `NaniteCloudEvent`: Gray goo particle cloud (procedural drifting particles, vision occlusion, bullet dissolution into shrapnel).
   - `PsionicResonanceEvent`: Shroud breach (phantom illusion enemies interleaved into formation; 0 score, 0 damage on phantoms).
   - `DevouringSwarmFrenzyEvent`: Hive fleet blitz (formation dissolves into continuous coordinated dive-bomb runs).
   - `NemesisStarEaterEvent`: Dark matter ignition (ambient canvas tint shifts to deep violet, boss ship energy beam sweeps).
   - `TimeDilationFieldEvent`: Chrono anomaly (alternating 3.5s pulses between 1.5x hyper-speed and 0.5x bullet-time).
5. Integrate into `src/core/Game.ts`:
   - Initialize `this.crisisEventManager = new CrisisEventManager(this)`.
   - Update in `update(dt)` during `PLAYING` and `STAGE_INTRO`.
   - Render in `render(ctx)` between player and HUD.
   - Hook `onStageClear()` to notify crisis manager.
6. Create `tests/unit/crisis.test.ts`:
   - 8 comprehensive test suites verifying all 11 crisis events across the 5-phase lifecycle (Registration, Warning, Activation, Mechanical Modifiers, Teardown), plus 50-cycle churn endurance test.

VERIFICATION REQUIRED:
- Run `npm run typecheck` (0 errors).
- Run `npm test` (all 619 existing tests + new crisis tests must pass 100%).
- Run `npm run build` (production build must succeed).
- Document all outputs in your handoff.md.

Write your report to `/Users/user/src/galog/.agents/m10_worker/report.md` and `/Users/user/src/galog/.agents/m10_worker/handoff.md`.
Notify orchestrator via send_message when done.
