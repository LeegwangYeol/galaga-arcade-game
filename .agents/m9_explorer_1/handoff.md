# Milestone 9 Handoff Report: 50-Round Scaling Engine & Difficulty Architecture

- **Author**: `m9_explorer_1` (Role: Difficulty Engine Explorer)
- **Recipient**: `teamwork_preview_orchestrator_2` / Milestone 9 Implementers
- **Working Directory**: `/Users/user/src/galog/.agents/m9_explorer_1/`
- **Technical Report**: `/Users/user/src/galog/.agents/m9_explorer_1/report.md`
- **Date**: 2026-09-03

---

## 1. Observation

1. **`src/systems/FormationManager.ts` Lines 208–209 & Line 613**:
   ```typescript
   // Difficulty tuning
   this.diveInterval = Math.max(1.8, 3.5 - (stage - 1) * 0.3);
   this.maxConcurrentDivers = Math.min(4, 1 + Math.floor(stage / 2));
   ...
   if (enemy.y > 60 && enemy.y < 220) {
     enemy.attemptFire(playerX, playerY, 180 + this.stage * 15);
   }
   ```
   At Stage 6, `diveInterval` drops to `2.0s`, and at Stage 7 clamps at `1.8s`. `maxConcurrentDivers` clamps at `4` at Stage 6. Stages 7–50 have identical dive pacing.
   At Stage 50, bullet speed computes as `180 + 50 * 15 = 930 px/s`. At 930 px/s on a 288px vertical canvas, a bullet reaches the bottom in 309ms (18.5 frames at 60 FPS), resulting in unreactable deaths.

2. **`src/entities/Enemy.ts` Lines 137–143**:
   ```typescript
   if (type === EnemyType.BOSS) {
     this.maxHealth = 2;
     this.health = 2;
   } else {
     this.maxHealth = 1;
     this.health = 1;
   }
   ```
   Enemy health is statically hardcoded with no awareness of stage number or difficulty tier. No shield properties exist on `Enemy`.

3. **`tests/unit/enemy.test.ts` Lines 195–211**:
   ```typescript
   it('configures 1 HP for Zako and Goei', () => {
     const zako = new Enemy({ type: EnemyType.ZAKO });
     expect(zako.maxHealth).toBe(1);
     expect(zako.health).toBe(1);
     const goei = new Enemy({ type: EnemyType.GOEI });
     expect(goei.maxHealth).toBe(1);
     expect(goei.health).toBe(1);
   });
   it('configures 2 HP for Boss Galaga', () => {
     const boss = new Enemy({ type: EnemyType.BOSS });
     expect(boss.maxHealth).toBe(2);
     expect(boss.health).toBe(2);
   });
   ```
   Default instantiations without stage parameters are tested for 1 HP (Zako/Goei) and 2 HP (Boss).

4. **Test Suite Baseline Run**:
   Ran `npm test -- --run` via `run_command`:
   ```
   Test Files  26 passed (26)
        Tests  546 passed (546)
     Duration  1.10s
   ```
   Ran `npm run typecheck && npm run build`:
   ```
   tsc --noEmit && vite build -> built in 323ms (0 errors)
   ```

5. **Mathematical Verification of Proposed Curves**:
   Ran Node script verifying strictly monotonic curves across all 50 stages:
   ```
   Output: Strict monotonicity verified across all 50 stages!
   ```

---

## 2. Logic Chain

1. **Deficiency Identification**:
   From Observation 1, the current engine freezes difficulty scaling at stage 7 and makes late-game bullets impossibly fast (930 px/s). From Observation 2, enemies cannot scale in health or defense.

2. **Mathematical Curve Derivation**:
   - For **Dive Speed Multiplier**: A sub-linear power curve $M(s) = 1.0 + 0.8 \times \left(\frac{s - 1}{49}\right)^{0.85}$ yields $M(1) = 1.000$ and $M(50) = 1.800$. With first derivative $0.68 \cdot t^{-0.15} > 0$, it is strictly increasing for every integer stage $1 \le s \le 50$.
   - For **Dive Interval**: An exponential decay curve $I(s) = 3.5 \times (0.8 / 3.5)^{\frac{s - 1}{49}}$ scales from $3.50\text{s}$ at Stage 1 down to $0.80\text{s}$ at Stage 50. Since $0.8 / 3.5 < 1$, it is strictly decreasing with no flat plateaus.
   - For **Max Concurrent Divers**: Discrete tier-aligned steps $[1, 2, 2, 2, 2, 3, \dots, 6]$ ensure Stage 1 starts at 1 diver and Stage 50 reaches 6 divers, pacing from gentle tutorial to intense armada.
   - For **Bullet Speed**: $V(s) = \min(320, \max(180, \text{round}(180 + 140 \times ((s-1)/49)^{0.75})))$ scales smoothly from 180 px/s up to 320 px/s, strictly capped at 320 px/s max. At 320 px/s (0.90s screen transit time), player reaction time is fully respected.

3. **Tiered Defense & Kinetic Shields Architecture**:
   - Classic (Stages 1–10): Baseline arcade HP (Zako 1, Goei 1, Boss 2, Shield 0).
   - Elite (Stages 11–25): Armored HP (Zako 2, Goei 2, Boss 3, Shield 0).
   - Dreadnought (Stages 26–50): Armored HP + Kinetic Shields (Zako 2+1s, Goei 2+1s, Boss 3+2s).
   - Challenging Stage Invariant: When `isChallengingStage(stage)` is true (Stages 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47), all enemies are set to `{ health: 1, shield: 0 }` to ensure the 40/40 perfect bonus is achievable.

4. **Backwards Compatibility Guarantee**:
   From Observation 3, existing unit tests construct enemies without stage parameters. Introducing `enemy.setDifficulty(health, shield, tier, speedMultiplier)` leaves default constructor defaults (1 HP for Zako/Goei, 2 HP for Boss) intact, ensuring 0 regressions across all 546 tests.

---

## 3. Caveats

1. **Visual Asset Generation**:
   `DifficultyCalculator` computes mathematical data and config. Procedural rendering of the cyan hexagonal shield arc and the distinct `BADGE_20_MATRIX` in `SpriteRenderer` and `HUD.ts` must be applied alongside entity health wiring during implementation.
2. **Crisis Interaction (Milestone 10)**:
   In Milestone 10, Crisis Events (e.g. Shield Overload, Time Dilation) may temporarily alter or override difficulty multipliers. `DifficultyCalculator` is designed as a stateless baseline provider so crisis modifiers can compose cleanly on top.
3. **Assumptions Made**:
   Captured fighters under Boss control remain 1 HP across all tiers to preserve fair player rescue mechanics.

---

## 4. Conclusion

1. The exact mathematical curves for stages 1–50 are finalized, verified, and documented:
   - `getStageTier`: 'CLASSIC' (1–10), 'ELITE' (11–25), 'DREADNOUGHT' (26–50).
   - `getDiveSpeedMultiplier`: 1.000x to 1.800x (monotonic power curve $t^{0.85}$).
   - `getDiveInterval`: 3.50s to 0.80s (smooth exponential decay).
   - `getMaxConcurrentDivers`: 1 at stage 1 up to 6 at stage 50.
   - `getEnemyBulletSpeed`: 180 px/s to 320 px/s (strictly clamped at 320 max).
   - `getEnemyHealthAndShield`: Classic (1/0, Boss 2/0), Elite (2/0, Boss 3/0), Dreadnought (2/1, Boss 3/2), with Challenging Stage override (1/0).
2. The implementation blueprint for `DifficultyCalculator.ts`, `FormationManager.ts`, and `Enemy.ts` is fully formulated in `/Users/user/src/galog/.agents/m9_explorer_1/report.md`.

---

## 5. Verification Method

### 5.1 Project Test Command
Execute the project test command from project root:
```bash
npm test -- --run
```
Expected: All test suites pass (currently 546/546). When the new `tests/unit/difficulty_calculator.test.ts` is added, all assertions pass.

### 5.2 Build & Typecheck Verification
Execute:
```bash
npm run typecheck && npm run build
```
Expected: Zero TypeScript diagnostics and successful Vite production bundle.

### 5.3 Invalidation Conditions
- Any stage $s \in [1, 50]$ where `getEnemyBulletSpeed(s) > 320`.
- Any stage $s \in [1, 49]$ where `getDiveSpeedMultiplier(s + 1) <= getDiveSpeedMultiplier(s)`.
- Any stage $s \in [1, 49]$ where `getDiveInterval(s + 1) >= getDiveInterval(s)`.
- Any challenging stage where enemy shield $> 0$ or health $> 1$.
- Any failure in existing test suites due to `Enemy` constructor changes.
