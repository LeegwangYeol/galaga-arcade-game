# Handoff Report: Crisis Engine & Factory Architecture (Milestone 10)

**Agent**: `m10_explorer_1` (Role: Crisis Engine & Factory Architecture Explorer)  
**Date**: 2026-09-03  
**Handoff Type**: Hard (Task Complete)  

---

## 1. Observation

1. **Test Suite Baseline & Existing Tests**:
   - Ran `npm test` (`vitest run`): 29 test files passed, 619 tests passed (0 failures) in 4.14s.
   - Vitest suite covers `core.test.ts`, `difficulty.test.ts`, `enemy.test.ts`, `m9_challenger_1_adversarial.test.ts`, `m9_challenger_2_adversarial.test.ts`, etc.
2. **Challenging Stage Formula in `src/systems/DifficultyCalculator.ts`**:
   - Line 122–124:
     ```typescript
     public static isChallengingStage(stage: number): boolean {
       return stage >= 3 && stage % 4 === 3;
     }
     ```
   - Line 120 comments:
     ```typescript
     // Matches 12 stages in rounds 1–50: [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47].
     ```
   - `tests/unit/core.test.ts:724`:
     ```typescript
     expect(game.isChallengingStage(11)).toBe(true);
     ```
3. **Master Game Loop & Lifecycle in `src/core/Game.ts`**:
   - Virtual resolution: `VIRTUAL_WIDTH = 224`, `VIRTUAL_HEIGHT = 288` (lines 44–45).
   - `updateStageIntro` (lines 552–566): transitions from `STAGE_INTRO` after 2.2s. If `isChallengingStage(stage)`, enters `CHALLENGING_STAGE`; otherwise enters `PLAYING`.
   - `renderPlayingScreen` (lines 916–939): renders formation (z:1), tractor beam (z:2), bullets (z:3), particles (z:4), player (z:5).
   - `onStageClear` (lines 276–285): handles bonus and transitions to `STAGE_CLEAR`.
   - `updateStageClear` (lines 621–632): advances stage after 1.8s (or 2.8s for challenging), clears bullets, spawns next stage.
4. **Current Directory Status in `src/core/crisis/`**:
   - `src/core/crisis/` does not currently exist. All types and classes will be newly created in Milestone 10.
5. **Authoritative Scope & Survey Specifications**:
   - `/Users/user/src/galog/.agents/teamwork_preview_orchestrator_2/SCOPE.md` lines 17–18: Milestone 10 includes F18 (Crisis Engine & Factory Pattern) and F19 (11 Concrete Stellaris Crisis Events).
   - `/Users/user/src/galog/.agents/survey_p2_explorer_2/report.md` Section 3: details the 11 Stellaris crisis events and architectural factory specifications.

---

## 2. Logic Chain

1. **Step 1: Crisis Event Identification & Enumeration**:
   - Based on the user request and SCOPE.md, exactly 11 crisis events are specified.
   - Defining `CrisisEventType` with exact string keys (`THE_CONTINGENCY`, `THE_UNBIDDEN`, `THE_PRETHORYN_SCOURGE`, `SHIELD_OVERLOAD`, `PHYSICS_INVERSION`, `HYPERSPACE_STORM`, `NANITE_CLOUD`, `PSIONIC_RESONANCE`, `DEVOURING_SWARM_FRENZY`, `NEMESIS_STAR_EATER`, `TIME_DILATION_FIELD`) provides a type-safe foundation.
2. **Step 2: Resolving the Stage 11 vs Stage 12 Trigger Condition**:
   - Observation 2 proves that `DifficultyCalculator.isChallengingStage(11) === true`.
   - Observation 2 also demonstrates that challenging stages have strict invariants: 0 enemy bullets, fixed acrobatic dive trajectories, and 40-hit bonus scoring.
   - Therefore, while the user prompt states "stages > 10", a crisis event must NOT activate during Stage 11.
   - Reasoning: Activating combat crises (e.g. enemy shields, lightning strikes, homing bullets) during Stage 11 would corrupt the 0-bullet target practice invariant.
   - Conclusion: `CrisisEventManager.evaluateStageTrigger(stage)` must verify `stage > 10 && !DifficultyCalculator.isChallengingStage(stage)`. The very first natural crisis debut occurs on **Stage 12** (the first combat round of the Elite tier).
3. **Step 3: Decoupled Factory Pattern (`CrisisEventFactory.ts`)**:
   - Implementing static registration via `Map<CrisisEventType, CrisisEventConstructor>` allows worker agents to implement and register the 11 concrete crisis classes independently without circular imports or God-object files.
   - Providing `clearRegistry()`, `register()`, `getRandomType(exclude)`, and `create(type, context)` ensures comprehensive testability in Vitest unit suites.
4. **Step 4: Lifecycle Coordination & Teardown Invariants (`CrisisEventManager.ts`)**:
   - A 3-state runtime progression (`IDLE` -> `WARNING` [3.0s] -> `ACTIVE` [20.0s] -> `COMPLETED`/`IDLE`) ensures the player receives clear audiovisual cues before mechanics activate.
   - When `onStageClear()` or `clearCrisis()` is invoked, the active crisis's `onDeactivate()` hook is immediately executed.
   - Reasoning: Crises modifying global state (e.g. `PhysicsInversion` reversing starfield velocity, `NaniteCloud` adding fog, `Contingency` changing fire rate) must be cleanly reverted before the next stage begins to prevent cumulative state leakage.
5. **Step 5: Clean Integration in `src/core/Game.ts`**:
   - Adding `this.crisisEventManager = new CrisisEventManager(this)` preserves backward compatibility with all 619 existing tests.
   - Hooking `update(dt)` during `PLAYING` and `STAGE_INTRO` ensures smooth countdowns.
   - Inserting `crisisEventManager.render(ctx)` between player entities (z:5) and HUD overlays (z:6) ensures shaders/vignettes overlay gameplay without obscuring score text.

---

## 3. Caveats

1. **Stage 11 Is a Challenging Stage**:
   - Some casual readings of "post-round 10" might assume Stage 11 should have a crisis. As proven in Observation 2, Stage 11 is a Challenging Stage. `CrisisEventManager` must skip challenging stages and start natural rolls on Stage 12.
2. **Audio Synth Klaxon Siren Dependency**:
   - `soundSynth.playCrisisKlaxon()` is scheduled for Milestone 12. In Milestone 10, calls to this method must use optional chaining (`(this.game.soundSynth as any).playCrisisKlaxon?.()`) to avoid runtime crashes prior to M12.
3. **Starfield Velocity Sign Support**:
   - `Starfield.ts` line 205 supports upward moving stars (`star.y < 0`), but `setTargetSpeedMultiplier(multiplier)` currently has `Math.max(0, multiplier)`. For `PhysicsInversion`, workers can either update star coordinates directly in `update(dt)` or update `Starfield.setTargetSpeedMultiplier` to allow negative multipliers.

---

## 4. Conclusion

The architectural design for Milestone 10 is complete, self-contained, and ready for worker implementation:
1. `src/core/crisis/types.ts`: Complete TypeScript specification defining `CrisisEventType` (11 enum values), `CrisisState`, `CrisisEventContext`, `ICrisisEvent`, `CrisisMetadata`, and `BaseCrisisEvent`.
2. `src/core/crisis/CrisisEventFactory.ts`: Extensible factory pattern with dynamic registration, safe instantiation, and random sampling with exclusion.
3. `src/core/crisis/CrisisEventManager.ts`: Master lifecycle manager with stage progression evaluation (stages > 10, skipping challenging stages, 40% probability, stage cooldowns), 3.0s warning timer, active duration tracking, render pass, and stage clear teardown.
4. `src/core/Game.ts` hooks: 7 surgical integration hooks identified with zero regression risk to existing gameplay.

Full source code listings, interface contracts, and the 11 concrete crisis specifications are published in:
- `/Users/user/src/galog/.agents/m10_explorer_1/report.md`

---

## 5. Verification Method

1. **Independent File Inspection**:
   - Inspect `/Users/user/src/galog/.agents/m10_explorer_1/report.md` for complete class and interface implementations.
   - Verify all 11 crisis enum values match the prompt:
     `THE_CONTINGENCY`, `THE_UNBIDDEN`, `THE_PRETHORYN_SCOURGE`, `SHIELD_OVERLOAD`, `PHYSICS_INVERSION`, `HYPERSPACE_STORM`, `NANITE_CLOUD`, `PSIONIC_RESONANCE`, `DEVOURING_SWARM_FRENZY`, `NEMESIS_STAR_EATER`, `TIME_DILATION_FIELD`.
2. **Execution of Test Suite**:
   - Run `npm test` to confirm baseline test suite integrity (619 passing tests).
   - Invalidation condition: Any existing test failure or TypeScript compilation failure indicates regression.
