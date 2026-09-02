# Handoff Report: Milestone 4 Review (Enemy Hierarchy, Formation Grid & Bézier Math)

**Reviewer Agent**: `m4_reviewer_1`  
**Milestone**: Milestone 4 (Enemy Formation, Bézier Flight Curves & AI Diving)  
**Verdict**: **`APPROVE`**  
**Integrity**: **CLEAN / NO VIOLATIONS**

---

## 1. Observation

- **Source Modules Verified**:
  - `src/math/Bezier.ts`:
    - `BezierCurve.evaluate(t)`: Exact cubic polynomial evaluation $B(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t) t^2 P_2 + t^3 P_3$.
    - `BezierCurve.derivative(t)`: Exact analytical first derivative $B'(t) = 3(1-t)^2 (P_1 - P_0) + 6(1-t)t (P_2 - P_1) + 3t^2 (P_3 - P_2)$ with zero-magnitude singularity guard falling back to chord vector.
    - `BezierCurve.heading(t)`: Tangent angle $\theta(t) = \operatorname{atan2}(v_y, v_x) + \frac{\pi}{2}$, correctly aligning upward flight direction with Galaga's upright sprite basis ($0\text{ rad} = \text{UP / } -Y$).
    - `BezierCurve.distanceToT(d)`: 32-sample cumulative chord Look-Up Table (LUT) with $O(\log N)$ binary search interpolation for constant linear velocity $d = V \cdot t$.
    - `QuadraticBezier`: 3-control-point evaluator with dedicated LUT.
    - `CompositeBezierPath`: Multi-segment path chain with duration/speed gating.
  - `src/entities/Enemy.ts`:
    - 7-State FSM (`IN_FORMATION`, `ENTERING`, `DIVING_SOLO`, `DIVING_ESCORT`, `TRACTOR_BEAM_ACTIVE`, `RETURNING_TO_FORMATION`, `EXPLODING`, `INACTIVE`).
    - 2-Hit Boss Galaga State Machine: Hit 1 reduces health to 1, sets damage flash ($0.08\text{s}$), triggers `BOSS_DAMAGED` sprite rendering, awards 0 pts. Hit 2 destroys the boss, switches to `EXPLODING`, awards points based on state/escort count.
    - Point Matrix: Zako (50/100), Goei (80/160), Boss Galaga (150 in formation / 400 solo / 800 with 1 escort / 1600 with 2 escorts), Captured Fighter (1000), Transform (160).
    - 4Hz Wing Flutter: `WING_FRAME_DURATION = 0.25` ($250\text{ms}$ per frame) with random phase initialization to prevent monolithic fluttering.
    - Zero-allocation ObjectPool compliance with `init()` and `reset()`.
  - `src/systems/FormationManager.ts`:
    - 40 grid slots across 5 rows: Row 0 (4 Bosses), Row 1 (8 Goeis), Row 2 (8 Goeis), Row 3 (10 Zakos), Row 4 (10 Zakos).
    - Harmonic breathing: horizontal sway ($\pm 12\text{px}$ at $0.333\text{ Hz}$), expansion ($\pm 18\%$ at $0.500\text{ Hz}$), row waves ($\pm 2\text{px}$ with $0.4\text{ rad/row}$ phase offset).
    - 5 Ingress Sub-Waves (Top Center, Top Right, Top Left, Bottom Left, Bottom Right) mapping 8 ships each with slot anchoring.
    - Dive Attack Scheduler with Solo Zako, Paired Goei, and Boss escort peeling modes and bottom wrap-around ($Y > 304$).
- **Verification Outputs**:
  - `npm run typecheck`: Exited with code 0 (0 TypeScript errors).
  - `npm run build`: Exited with code 0 (`dist/index.html` 5.36 kB, `dist/assets/index-CHwJAzMr.js` 90.18 kB).
  - `npx vitest run tests/unit/enemy.test.ts tests/unit/m4_reviewer_1_adversarial.test.ts tests/unit/math.test.ts`: 3 test suites, 85 tests passed (100%).
  - Total test suite (excluding work-in-progress challenger draft): 13 test suites, 278 tests passed.

---

## 2. Logic Chain

1. **Mathematical Soundness**:
   - The Bernstein polynomial expansion and analytical derivative derivations in `src/math/Bezier.ts` are mathematically exact.
   - The $+\frac{\pi}{2}$ orientation offset bridges the standard Cartesian coordinate system ($+X$ right, $+Y$ down) with Galaga's pixel sprite coordinate system ($0\text{ rad} = \text{facing UP / } -Y$).
   - The arc-length LUT with 32 intervals and binary search interpolation guarantees linear parameterization $s(t) = v \cdot t$, preventing velocity distortion across variable curvature Bézier segments.
2. **State & Gameplay Fidelity**:
   - Boss Galaga's 2-hit lifecycle correctly models healthy green state $\to$ damaged navy blue state $\to$ explosion, adhering to classic arcade scoring rules.
   - The 40-slot formation grid symmetrically allocates 4 Bosses, 16 Goeis, and 20 Zakos with harmonic breathing oscillation and dynamic target-slot docking.
3. **Integrity & Robustness**:
   - Independent adversarial stress testing confirmed that degenerate curves ($P_0 = P_1 = P_2 = P_3$), out-of-bounds parameters ($t < 0$, $t > 1$, $d < 0$, $d > \text{length}$), lethal over-damage, and extreme timestamps ($t = 10^7\text{s}$) are safely handled without crashes, NaNs, or logic corruption.
   - No hardcoded test responses, dummy facades, or shortcuts exist in the codebase.

---

## 3. Caveats

- **Tractor Beam Capture & Rescue (Feature F9)**: Milestone 4 sets up the `TRACTOR_BEAM_ACTIVE` enemy state and escort scoring infrastructure. The full capture cone raycasting, beam particle animation, dual-fighter docking rescue flow, and turncoat hostile logic are scheduled for implementation in Milestone 5.
- **Web Audio SFX (Feature F10)**: Procedural SFX triggers for dive warbles, tractor beam oscillations, and laser chirps are stubbed and ready for synthesizer wiring in Milestone 6.

---

## 4. Conclusion

The Milestone 4 implementation is **fully verified, mathematically rigorous, robust against adversarial edge cases, and completely approved**.

**Verdict**: **`APPROVE`**

---

## 5. Verification Method

To independently reproduce and verify this assessment:

1. Run TypeScript type checker:
   ```bash
   npm run typecheck
   ```
2. Run production build:
   ```bash
   npm run build
   ```
3. Run Milestone 4 unit test suites and adversarial stress tests:
   ```bash
   npx vitest run tests/unit/enemy.test.ts tests/unit/m4_reviewer_1_adversarial.test.ts tests/unit/math.test.ts
   ```
4. Inspect reviewed files:
   - `src/math/Bezier.ts`
   - `src/entities/Enemy.ts`
   - `src/systems/FormationManager.ts`
   - `src/systems/FlightPathManager.ts`
   - `src/renderer/SpriteRenderer.ts`
   - `.agents/m4_reviewer_1/analysis.md`
