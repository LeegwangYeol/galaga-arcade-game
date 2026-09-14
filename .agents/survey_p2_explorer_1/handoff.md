# Handoff Report: Requirement 1 (R1) 50-Round Progressive Scaling System

- **Agent**: `survey_p2_explorer_1` (Role: Stage Scaling & Formation Explorer)
- **Recipient**: `parent` (bf29cd37-1b7c-490e-88eb-9cd8e2b57a6f)
- **Timestamp**: 2026-09-03T12:15:00+09:00
- **Report Document**: `/Users/user/src/galog/.agents/survey_p2_explorer_1/report.md`
- **Handoff Type**: Hard (Task Complete)

---

## 1. Observation

1. **`src/core/Game.ts`**:
   - Line 480–482:
     ```typescript
     public isChallengingStage(stageNum: number = this.stage): boolean {
       return stageNum >= 3 && stageNum % 4 === 3;
     }
     ```
     Accurately identifies challenging stages for Stage 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47 across the 1–50 domain.
   - Line 620–631: Stage progression in `updateStageClear` advances stage via `scoreManager.advanceStage()` and calls `formationManager.spawnStage(this.stage)`.
   - Line 680–757: `resolveCollisions` only handles non-fatal hit deflection logic for `EnemyType.BOSS`.
2. **`src/systems/FormationManager.ts`**:
   - Lines 208–209:
     ```typescript
     this.diveInterval = Math.max(1.8, 3.5 - (stage - 1) * 0.3);
     this.maxConcurrentDivers = Math.min(4, 1 + Math.floor(stage / 2));
     ```
     `diveInterval` clamps to 1.8s at Stage 7; `maxConcurrentDivers` clamps to 4 at Stage 6. For Stages 7–50, dive frequency is static.
   - Line 613:
     ```typescript
     enemy.attemptFire(playerX, playerY, 180 + this.stage * 15);
     ```
     At Stage 50, bullet speed equals 930 px/s (crossing the 288px canvas in 0.3s), which is unreactable.
   - Lines 239–256: `spawnStage` always spawns stationary formation grid slots regardless of whether the stage is a Challenging Stage.
3. **`src/entities/Enemy.ts`**:
   - Lines 137–143:
     ```typescript
     if (type === EnemyType.BOSS) {
       this.maxHealth = 2;
       this.health = 2;
     } else {
       this.maxHealth = 1;
       this.health = 1;
     }
     ```
     Enemy health has no stage or difficulty tier dependency.
   - Line 494: `this.fireCooldownTimer = 1.5 + Math.random() * 2.0;` prevents multi-shot salvos during a 2-second dive run.
4. **`src/ui/HUD.ts`**:
   - Lines 494–532: `HUD.decomposeStage(stage)` successfully calculates greedy badge decompositions for 50, 30, 20, 10, 5, 1.
   - Line 481: Crowding boundary `if (x < 96) break;`. Worst-case badge width at Stage 49 is 48 px, fitting safely within the available 120 px.
   - Line 149: `export const BADGE_20_MATRIX: string[][] = BADGE_30_MATRIX;` is an alias to 30.
5. **Project Test Suite**:
   - Command: `npm test` (`vitest run`). Result: 26 test files passed, 546 tests passed (0 failures).

---

## 2. Logic Chain

1. From Observation 2 (dive interval and max diver clamping at Stage 6/7) and Observation 3 (static HP in Enemy.ts):
   - Without an external scaling engine, rounds 7–50 play with identical enemy durability and dive frequency.
   - Therefore, a dedicated `DifficultyCalculator` module is required to supply non-linear curves for HP, speeds, intervals, and diver quotas up to Stage 50.
2. From Observation 2 (linear bullet speed formula yielding 930 px/s at Stage 50):
   - Linear scaling without clamping produces unplayable projectile velocity.
   - An asymptotic sub-linear formula capping bullet velocity at 320 px/s preserves arcade reflexes and fairness while ramping up pressure.
3. From Observation 3 (Enemy.ts has no shield or multi-hit Zako/Goei logic):
   - To achieve the requirement of Elite Tier (11–25, +1 HP) and Dreadnought Tier (26–50, multi-hit shields), `Enemy` requires `shield: number` and `tier: StageTier`.
   - `takeDamage` must absorb hits through shields before depleting hull health, and `SpriteRenderer.drawEnemy` must render shield auras and flashing damage indicators.
4. From Observation 1 & 2 (Challenging Stage predicate works, but `spawnStage` creates a standard grid):
   - Challenging stages need a dedicated wave execution branch in `FormationManager` that runs 5 waves of 8 enemies along continuous Bézier paths, forbids firing, and auto-deactivates enemies as they exit off-screen.
5. From Observation 4 (badge decomposition fits within 48 px < 120 px budget):
   - Stage badge system is mathematically sound for Stages 1–50 and will not collide with lives icons; only `BADGE_20_MATRIX` requires a distinct visual pattern.

---

## 3. Caveats

1. **Phase 2 Scope Boundary**: This report focuses strictly on Requirement 1 (Stage Scaling & Formations). It does not implement Requirement 2 (Crisis Events) or Requirement 3 (Player Upgrades), though it designs hooks (e.g. `shield`, `speedMultiplier`) that Crisis Events and Power-Ups can naturally leverage.
2. **Zero Code Changes in `src/`**: In accordance with explorer read-only constraints and the project approval rule, no production source code has been altered during this turn. All designs are preserved in `report.md`.
3. **Audio / SFX Assets**: Sound effects for shield impact and shield breakage can reuse existing synthesized Web Audio noise/frequencies in `SoundSynth.ts` without introducing external WAV/MP3 files.

---

## 4. Conclusion

Requirement 1 (50-Round Progressive Scaling System) is thoroughly analyzed, mapped, and architected. The system will introduce:
1. `src/systems/DifficultyCalculator.ts` providing deterministic scaling for Classic (1–10), Elite (11–25), and Dreadnought (26–50) tiers.
2. Multi-hit kinetic energy shields and colored/flashing palettes for enemies in Elite and Dreadnought tiers.
3. Non-linear, dodgeable ballistic velocity capped at 320 px/s with multi-shot dive bursts.
4. 12 Challenging Stages (3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47) featuring 5 distinct acrobatic flight waves with zero bullet emission and perfect-clear bonus tracking.
5. Distinct `FLAG_20` badge and verified badge decomposition across all 50 stages.

---

## 5. Verification Method

To independently verify the facts and designs presented in this report:

1. **Verify Existing Tests**:
   ```bash
   npm test
   ```
   Ensures all 546 baseline tests pass.
2. **Inspect Formations & Speeds**:
   Check `src/systems/FormationManager.ts:208-209` and `src/systems/FormationManager.ts:613` to confirm the clamping and bullet velocity issues.
3. **Inspect Badges Math**:
   Check `src/ui/HUD.ts:494-532` and run `npx vitest tests/unit/hud_screens.test.ts` to confirm badge decomposition up to Stage 50 and beyond.
4. **Review Technical Specification**:
   Read `/Users/user/src/galog/.agents/survey_p2_explorer_1/report.md` for full implementation details, math equations, and class blueprints.
