# Milestone 4 Enemy Hierarchy, Formation Grid & Bézier Math Review Analysis

**Reviewer**: `m4_reviewer_1` (Enemy, Formation & Math Reviewer)  
**Date**: 2026-09-02  
**Verdict**: **`APPROVE`**  
**Integrity Status**: **CLEAN / NO INTEGRITY VIOLATIONS**

---

## Executive Summary

Milestone 4 delivers the foundational flight mathematics, entity hierarchies, procedural grid layout, breathing oscillations, and dive attack scheduler for Galaga Arcade Web Game.

An independent, rigorous review and adversarial challenge was conducted across all core modules:
1. `src/math/Bezier.ts` (Cubic and Quadratic Bézier equations, analytical first derivatives, normalized tangent headings, 32-sample arc-length Look-Up Table parameterization, and multi-segment composite paths).
2. `src/entities/Enemy.ts` (7-state finite-state machine, 2-hit Boss Galaga state transitions, 4Hz wing flutter, complete 10-permutation arcade point scoring matrix, and zero-allocation object pool lifecycle).
3. `src/systems/FormationManager.ts` (40-alien 5-row grid layout, sinusoidal breathing expansion $\pm 18\%$ and horizontal sway $\pm 12\text{px}$, 5 entry sub-waves, and dive attack peeling scheduler).
4. `src/systems/FlightPathManager.ts` (5 canonical entry trajectories, solo and paired Goei dives, and Boss escort dive formations).
5. `src/renderer/SpriteRenderer.ts` (Procedural 16x16 bit-matrices, offscreen pre-baking, and rotated blitting).
6. Build and test verification (`npm run typecheck`, `npm run build`, `npm test`).

---

## Detailed Review Dimensions

### 1. Bézier Curves & Kinematics (`src/math/Bezier.ts`)

- **Cubic Bézier Interpolation**:
  Evaluates analytical Bernstein polynomials:
  $$B(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t) t^2 P_2 + t^3 P_3$$
  Exact boundary evaluations verified: $B(0) = P_0$, $B(1) = P_3$.
  Midpoint evaluated at $t=0.5$ verified.

- **First Derivative & Tangent Headings**:
  Computes velocity derivative:
  $$B'(t) = 3(1-t)^2(P_1 - P_0) + 6(1-t)t(P_2 - P_1) + 3t^2(P_3 - P_2)$$
  Includes chord fallback guard when $|B'(t)| < 10^{-6}$ to prevent division by zero or NaN.
  Tangent heading calculation:
  $$\theta(t) = \operatorname{atan2}(v_y, v_x) + \frac{\pi}{2}$$
  The $+\frac{\pi}{2}$ orientation offset maps derivative vector $(0, -v)$ (upward motion) to $\theta = 0\text{ rad}$, matching the upright orientation of Galaga pixel sprites.

- **Arc-Length LUT & Constant Linear Speed Mapping**:
  Pre-computes a 32-interval cumulative chord LUT at initialization.
  `distanceToT(d)` implements $O(\log N)$ binary search to find the bounding interval, followed by linear interpolation to return $t(d)$.
  Enables constant speed sampling $d = V \cdot t_{\text{elapsed}}$ without trajectory warping or slowdowns on sharp turns.

- **Quadratic Bézier & Composite Paths**:
  `QuadraticBezier` implements 3-control-point Bézier with dedicated 32-sample LUT.
  `CompositeBezierPath` chains multiple curve segments together with speed/duration gating and seamless segment advancement.

---

### 2. Enemy Entity Hierarchy & Mechanics (`src/entities/Enemy.ts`)

- **7-State FSM**:
  Supports `IN_FORMATION`, `ENTERING`, `DIVING_SOLO`, `DIVING_ESCORT`, `TRACTOR_BEAM_ACTIVE`, `RETURNING_TO_FORMATION`, `EXPLODING`, `INACTIVE`.

- **Boss Galaga 2-Hit Mechanics**:
  - Initial Health: 2 HP.
  - **Hit 1**: Takes 1 damage $\to$ Health reduced to 1, triggers 80ms damage flash (`damageFlashTimer = 0.08s`), state remains alive, awards 0 points, switches visual palette to `BOSS_DAMAGED` (Navy Blue/Red).
  - **Hit 2**: Takes 1 damage $\to$ Health reduced to 0, triggers 300ms explosion delay (`deathTimer = 0.30s`), state switches to `EXPLODING`, awards points based on state/escort count.

- **Arcade Scoring Matrix**:
  | Enemy Type | Formation State | Diving Solo | Diving Escort (1) | Diving Escort (2) | Tractor Beam |
  |---|---|---|---|---|---|
  | **Zako** (Yellow Bug) | 50 pts | 100 pts | 100 pts | 100 pts | 100 pts |
  | **Goei** (Red Butterfly) | 80 pts | 160 pts | 160 pts | 160 pts | 160 pts |
  | **Boss Galaga** | 150 pts | 400 pts | 800 pts | 1600 pts | 400 pts |
  | **Captured Fighter** | 1000 pts | 1000 pts | 1000 pts | 1000 pts | 1000 pts |
  | **Transform Alien** | 160 pts | 160 pts | 160 pts | 160 pts | 160 pts |

  All values verified against 1981 Namco Galaga specifications.

- **Wing Flutter Animation**:
  `WING_FRAME_DURATION = 0.25` (250ms per frame, 4Hz toggle rate).
  Frame index alternates between 0 and 1.
  Initialization includes phase offset staggering (`Math.random() * WING_FRAME_DURATION`) to create natural fluttering variations across the formation swarm.

- **Object Pooling**:
  Implements `Poolable` interface with clean `init()` and `reset()` zero-allocation recycling.

---

### 3. Formation Grid & Attack Scheduler (`src/systems/FormationManager.ts`)

- **40-Alien 5-Row Layout**:
  - **Row 0** ($Y=52$): 4 Boss Galagas (Cols 3..6)
  - **Row 1** ($Y=68$): 8 Red Goeis (Cols 1..8)
  - **Row 2** ($Y=84$): 8 Red Goeis (Cols 1..8)
  - **Row 3** ($Y=100$): 10 Yellow Zakos (Cols 0..9)
  - **Row 4** ($Y=116$): 10 Yellow Zakos (Cols 0..9)
  Total: $4 + 8 + 8 + 10 + 10 = 40$ alien slots.
  Column pitch: 16px, Row pitch: 16px. Grid Center: $X=112$.

- **Harmonic Breathing Oscillation Mathematics**:
  $$\text{Sway}(t) = 12 \cdot \sin(2\pi \cdot 0.333 \cdot t)$$
  $$\text{Expansion}(t) = 1.0 + 0.18 \cdot \sin(2\pi \cdot 0.500 \cdot t)$$
  $$\text{RowWave}(r, t) = 2.0 \cdot \sin(2\pi \cdot 0.500 \cdot t + 0.4 \cdot r)$$
  $$X_{\text{slot}}(r, c, t) = 112 + \text{Sway}(t) + (c - 4.5) \cdot 16 \cdot \text{Expansion}(t)$$
  $$Y_{\text{slot}}(r, c, t) = 52 + 16 \cdot r + \text{RowWave}(r, t)$$
  Symmetry verified across all rows. Numerical stability confirmed up to $t = 10^7\text{s}$.

- **5 Ingress Sub-Waves**:
  - Wave 1 (Top Center): 4 Bosses + 4 Goeis (Row 1 Cols 3..6)
  - Wave 2 (Top Right): 8 Goeis (Row 1 Cols 1,2,7,8 + Row 2 Cols 3..6)
  - Wave 3 (Top Left): 4 Goeis + 4 Zakos (Row 2 Cols 1,2,7,8 + Row 3 Cols 3..6)
  - Wave 4 (Bottom Left): 8 Zakos (Row 3 Cols 0..2 + Row 4 Cols 0..4)
  - Wave 5 (Bottom Right): 8 Zakos (Row 3 Cols 7..9 + Row 4 Cols 5..9)
  Account for all 40 slots with zero duplicates and zero missing assignments.

- **Dynamic Attack Dive Scheduler**:
  - Periodically peels formation enemies off based on stage tuning ($3.5 - (\text{stage}-1)\times 0.3 \ge 1.8\text{s}$).
  - Attack archetypes: Solo Zako (40%), Paired Goei synchronized crossfire (35%), Boss Galaga with up to 2 Goei escorts (25%).
  - Bottom wrap-around at $Y > 304$ with smooth docking descent into dynamic slot coordinates.

---

## Adversarial Stress Test Results

A dedicated adversarial test suite (`tests/unit/m4_reviewer_1_adversarial.test.ts`) was authored and executed:

| Test Group | Scenario | Outcome |
|---|---|---|
| **Bézier Curves** | Point-singularity degenerate curve ($P_0=P_1=P_2=P_3$) fallback | **PASS** |
| **Bézier Curves** | Extreme $t < 0$ and $t > 1$ parameter clamping | **PASS** |
| **Bézier Curves** | Extreme distance $d < 0$ and $d > \text{length}$ clamping in `distanceToT` | **PASS** |
| **Bézier Curves** | Arc-length LUT parameterization precision and monotonicity | **PASS** |
| **Bézier Curves** | Empty `CompositeBezierPath` evaluation | **PASS** |
| **Enemy Unit** | Lethal over-damage (5 damage on 2 HP Boss Galaga) | **PASS** |
| **Enemy Unit** | Damage rejection on INACTIVE and EXPLODING enemies | **PASS** |
| **Enemy Unit** | Full 10-point scoring matrix permutations | **PASS** |
| **Enemy Unit** | ObjectPool reset/init lifecycle integrity | **PASS** |
| **Formation Grid** | Bilateral breathing symmetry across $t \in [0, 10]$ | **PASS** |
| **Formation Grid** | Numerical stability under extreme timestamps ($t = 10^7\text{s}$) | **PASS** |
| **Formation Grid** | 40-slot uniqueness and 5-subwave completeness ($8 \times 5 = 40$) | **PASS** |

---

## Integrity Verification

- **Hardcoded test responses in source code**: None. All math and state logic are computed analytically and dynamically.
- **Dummy / facade implementations**: None. All subsystems fully operational with fixed timestep physics and canvas rendering.
- **Task shortcuts / external cheats**: None. Pure TypeScript with zero external game engine dependencies.
- **Fabricated verification outputs**: None. Independently verified via CLI tools.

---

## Verified Claims Matrix

| Milestone Claim | Evidence | Verification Method | Status |
|---|---|---|---|
| Cubic Bézier evaluate & derivative | `src/math/Bezier.ts:55-90` | `tests/unit/enemy.test.ts`, `tests/unit/m4_reviewer_1_adversarial.test.ts` | **PASS** |
| Tangent heading $\theta = \operatorname{atan2} + \frac{\pi}{2}$ | `src/math/Bezier.ts:108-111` | `tests/unit/enemy.test.ts:83-89` | **PASS** |
| Arc-length LUT constant speed mapping | `src/math/Bezier.ts:123-149` | `tests/unit/enemy.test.ts:92-129` | **PASS** |
| Boss Galaga 2-hit state transition | `src/entities/Enemy.ts:242-260` | `tests/unit/enemy.test.ts:248-271` | **PASS** |
| 4Hz wing flutter ($0.25\text{s}$ per frame) | `src/entities/Enemy.ts:277-282` | `tests/unit/enemy.test.ts:275-287` | **PASS** |
| Complete point scoring matrix | `src/entities/Enemy.ts:198-232` | `tests/unit/enemy.test.ts:194-233` | **PASS** |
| 40-alien 5-row grid layout | `src/systems/FormationManager.ts:74-141` | `tests/unit/enemy.test.ts:329-354` | **PASS** |
| Harmonic breathing ($\pm 18\%$, $\pm 12\text{px}$) | `src/systems/FormationManager.ts:150-178` | `tests/unit/enemy.test.ts:356-379` | **PASS** |
| 5 Ingress Sub-Waves & Dive Scheduler | `src/systems/FormationManager.ts:254-329` | `tests/unit/enemy.test.ts:401-438` | **PASS** |
| TypeScript strict compilation | `npm run typecheck` | CLI command output (0 errors) | **PASS** |
| Production build bundle | `npm run build` | Vite build output (`dist/assets/index-CHwJAzMr.js` 90.18 kB) | **PASS** |

---

## Verdict

**`APPROVE`** — Milestone 4 Enemy hierarchy, Formation grid, and Bézier mathematics are thoroughly verified, robust against edge cases, mathematically sound, and fully ready for Milestone 5 integration.
