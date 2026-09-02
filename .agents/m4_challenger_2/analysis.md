# Milestone 4 Adversarial Analysis: Bézier Kinematics & Dive AI

**Agent**: `m4_challenger_2` (Empirical Challenger)  
**Date**: 2026-09-02T13:08:00Z  
**Scope**: `src/math/Bezier.ts`, `src/systems/FlightPathManager.ts`, `src/systems/FormationManager.ts`, `src/entities/Enemy.ts`, `tests/unit/`

---

## 1. Executive Summary

We conducted comprehensive adversarial stress-testing of Milestone 4 (Bézier Splines, Arc-Length LUT Constant Velocity, Enemy Formation, and AI Diving).

### Verdict: **FAIL**
While core Bézier interpolation and 40-alien formation layouts demonstrate solid mathematical structure, critical bugs were discovered in:
1. **Escorted Dive Formation Coherence & Trajectory Desynchronization**: Goei escorts desynchronize and drift away from the Boss Galaga because uncoupled, different speed profiles and path geometries are assigned.
2. **Asynchronous Screen Wrap-Around Separation**: Boss wraps around the bottom screen at a different timestep than escorts, resulting in an extreme $> 300\text{ px}$ spatial separation across screen bounds.
3. **Escort Destruction Scoring Staleness**: Destroying escorting Goeis mid-dive fails to decrement `boss.escortCount`, incorrectly awarding 1600 pts (2 escorts) even after both escorts have been shot down (arcade rule: 400 pts for 0 escorts, 800 pts for 1 escort).
4. **Out-of-Bounds Distance Clamping in `sampleAtDistance`**: Negative distance inputs are not clamped to $\ge 0$ in the returned `.distance` field.
5. **Failing Unit Tests in `npm test`**: `tests/unit/m4_challenger_1_adversarial.test.ts` has 3 test failures related to dive scheduler state transitions and return docking coordinate snapping.

---

## 2. Challenge Dimensions & Empirical Findings

### Dimension 1: Bézier Curve Math & Degenerate Control Points
- **Zero-Length Point Curves ($P_0 = P_1 = P_2 = P_3$)**:
  - *Observation*: Evaluation across $t \in [0, 1]$ yields exact point $(x, y)$. Singularity guard catches zero derivatives and falls back safely to chord direction. Tangent returns default $(0, 1)$ without division-by-zero.
  - *Caveat*: Floating-point arithmetic during chord summation produces $L = 2.84 \times 10^{-13}$, causing `distanceToT(100)` to return `1.0` instead of `0.0`. Handled safely by clamped evaluation.
- **Collinear Control Points (Horizontal, Vertical, Diagonal)**:
  - *Observation*: Arc-length matches Euclidean chord distance ($100\text{ px}, 200\text{ px}, 100\sqrt{2}\text{ px}$). Tangent vectors and sprite headings remain strictly constant along the segment.
- **Coincident Control Points ($P_0 = P_1 \ne P_2 = P_3$)**:
  - *Observation*: Derivative at $t=0$ and $t=1$ is 0; singularity fallback in `BezierCurve.derivative` successfully substitutes $(P_3 - P_0)$ chord vector, avoiding NaN tangent vectors.
- **Out-of-Bounds Distance Clamping Defect**:
  - *Observation*: In `BezierCurve.sampleAtDistance(distance)`:
    ```typescript
    distance: Math.min(distance, this.lutLength)
    ```
    When `distance = -500`, `.distance` evaluates to `-500` rather than clamping to `0`.
  - *Mitigation*: Change to `Math.max(0, Math.min(distance, this.lutLength))`.

---

### Dimension 2: Arc-Length Look-Up Table (LUT) Parameterization & Invariants
- **Monotonicity**: Tested 1,000 equidistant points along cubic curves; `distanceToT` is strictly monotonic non-decreasing with zero inversions.
- **Extreme Parameter Clamping**: $t < 0$ clamps to $t=0$ ($P_0$), $t > 1$ clamps to $t=1$ ($P_3$).
- **High-Speed Kinematics**:
  - Tested extreme speed $V = 100,000\text{ px/s}$ across `CompositeBezierPath`. Total duration drops to $< 10\text{ ms}$, path completion flag `isComplete` sets properly on boundary without index out-of-bounds.
  - Tested microsecond sub-steps ($\Delta t = 10^{-6}\text{ s}$); cumulative error $< 10^{-6}\text{ px}$.

---

### Dimension 3: Boss Galaga Escorted Dive Formation & Wingman Rigidity (CRITICAL DEFECTS)

#### Defect 3.1: Escort Trajectory Desynchronization & Path Duration Mismatch
- **Observation**:
  In `FormationManager.peelOffBossEscort`:
  - Boss path is generated via `FlightPathManager.createBossEscortedDivePath`:
    - Seg 1 Speed: $148.75\text{ px/s}$, Arc Length $\approx 202.9\text{ px}$, Duration $\approx 1364\text{ ms}$.
    - Seg 2 Speed: $183.75\text{ px/s}$.
  - Goei escort path is generated via `FlightPathManager.createSoloDivePath`:
    - Seg 1 Speed: $157.50\text{ px/s}$, Arc Length $\approx 131.6\text{ px}$, Duration $\approx 835\text{ ms}$.
    - Seg 2 Speed: $192.50\text{ px/s}$.
- **Consequence**:
  - Goei escort completes Segment 1 **$529\text{ ms}$ earlier** than the Boss!
  - Instead of flying in a synchronized V-formation/echelon flanking the Boss, the Goei shoots ahead and follows an uncoordinated solo trajectory.
- **Mitigation**:
  Create dedicated `FlightPathManager.createBossEscortWingmanPath(bossStart, wingmanIndex, playerX)` where the wingman's control points and speeds are parameterized to match the Boss's trajectory duration, or drive wingman positions dynamically as offset attachments from the Boss's live position during escorted dives.

#### Defect 3.2: Desynchronized Bottom Screen Wrap-Around Rupture
- **Observation**:
  - In `Enemy.updateDiving`:
    ```typescript
    if (sample.isComplete || this.y > 288 + Enemy.BASE_HEIGHT) {
      this.flightPath = null;
      this.pathElapsedMs = 0;
      this.y = -Enemy.BASE_HEIGHT;
      this.state = EnemyState.RETURNING_TO_FORMATION;
      this.vx = 0;
      this.vy = this.diveSpeed * 0.8;
      this.rotation = 0;
    }
    ```
  - Boss reaches $y > 304$ and wraps to $y = -16$ at $t \approx 2.4\text{ s}$.
  - The Goei escort (which started with `pathElapsedMs = -150`) reaches $y > 304$ at $t \approx 2.8\text{ s}$.
  - For $400\text{ ms}$, the Boss is at $y = -16$ (top of screen) while Goei is at $y \approx 280$ (bottom of screen), creating an impossible $\Delta y = 296\text{ px}$ separation.

#### Defect 3.3: Mid-Dive Escort Destruction Scoring Staleness
- **Observation**:
  - `boss.escortCount` is initialized to 2 (or 1) when peeling off from formation.
  - When the player shoots and destroys an escort Goei (`goei.takeDamage(1)`), `goei.state` becomes `EXPLODING`, but `boss.escortCount` is never decremented.
  - When the player subsequently shoots down the Boss, `boss.takeDamage(1)` calls `boss.getScoreValue()`, which reads the stale `boss.escortCount = 2` and awards 1600 pts instead of 400 pts (if both escorts were killed) or 800 pts (if 1 escort was killed).
- **Mitigation**:
  In `FormationManager` or `Enemy.takeDamage`, dynamically query active living escorts linked via `escort.escortBossId === boss.id`, or decrement `boss.escortCount` when a linked escort is destroyed.

---

## 3. Test & Build Status

| Command | Status | Details |
|---|---|---|
| `npm run typecheck` | PASS | 0 TypeScript compile errors |
| `npm run build` | PASS | Vite 6 production build succeeded (`dist/` generated) |
| `npx vitest run tests/unit/m4_challenger_2_adversarial.test.ts` | PASS | 16/16 tests passed |
| `npm test` (All 14 test suites) | **FAIL** | 13 passed, 1 failed (3 tests failed in `tests/unit/m4_challenger_1_adversarial.test.ts`) |

---

## 4. Required Fixes for `m4_worker`

1. **Synchronize Escort Dive Flight Paths**:
   Implement synchronized escort wingman paths in `FlightPathManager` whose segment durations and trajectories match the Boss Galaga escorted dive curve.
2. **Dynamic Escort Count Scoring**:
   Update `boss.escortCount` dynamically when linked Goei escorts are destroyed during a dive, ensuring accurate point awards (150 in formation, 400 solo dive, 800 with 1 escort, 1600 with 2 escorts).
3. **Clamp Negative Distance Queries**:
   In `src/math/Bezier.ts` (`BezierCurve.sampleAtDistance` and `QuadraticBezier.sampleAtDistance`), clamp `distance` to `Math.max(0, Math.min(distance, this.lutLength))`.
4. **Fix Return Docking Coordinate Glitch**:
   Ensure returning enemies smoothly transition into `IN_FORMATION` coordinates without 1-frame coordinate snapping.
