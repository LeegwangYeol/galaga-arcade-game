# Milestone 4 Handoff Report: Bézier Flight Curves & Dynamic AI Specialist

**Document Version**: 1.0.0  
**Author**: `m4_explorer_2` (Milestone 4: Bézier Flight Curves & Dynamic AI Specialist)  
**Target Files**: `src/math/Bezier.ts` & `src/systems/FlightPathManager.ts`  
**Working Directory**: `/Users/user/src/galog/.agents/m4_explorer_2/`

---

## 1. Observation

1. **Coordinate System & Viewport Contract**:
   - `src/core/ScreenManager.ts` (lines 21-23):
     ```typescript
     public static readonly DEFAULT_VIRTUAL_WIDTH = 224;
     public static readonly DEFAULT_VIRTUAL_HEIGHT = 288;
     ```
   - `src/entities/Player.ts` (lines 62-63, 73):
     ```typescript
     public static readonly BASELINE_Y = 250;
     public static readonly SPEED = 260; // Pixels per second
     public x: number = 112;
     ```
   - Native Galaga virtual resolution is $224 \times 288$ (screen center $X = 112$).

2. **Types & Curve Interfaces**:
   - `src/types/index.ts` (lines 48-51, 194-220):
     ```typescript
     export interface Point2D { x: number; y: number; }
     export interface CubicBezier { p0: Point2D; p1: Point2D; p2: Point2D; p3: Point2D; }
     export interface FlightPathSegment { bezier: CubicBezier; durationMs: number; speed: number; rotationOffsetRad?: number; }
     export interface FlightPathData { id: string; name: string; segments: FlightPathSegment[]; loop: boolean; }
     ```

3. **Sprite Orientation & Rendering**:
   - `src/renderer/SpriteRenderer.ts` (lines 57-128, 199, 393-396):
     Sprite matrices are drawn upright (facing UP, toward $-Y$). In `draw()`, rotation is applied via `ctx.rotate(rotation)`.
   - Therefore, moving in velocity direction $(v_x, v_y)$, the orientation angle required is $\theta = \operatorname{atan2}(v_y, v_x) + \frac{\pi}{2}$.

4. **Arcade Movement Dynamics**:
   - Original Namco Galaga requires 5 distinct entry sub-waves (40 total enemies in groups of 8) with swoops and loops, 3 attack dive styles (Solo peel-off, Goei synchronized pair, Boss escort with 1-2 Goeis), and bottom-to-top screen wrap-around.

---

## 2. Logic Chain

1. **From Observation 1 & 2 (Coordinate Space & Curves)**:
   - All Bézier control points must be defined in the $224 \times 288$ virtual coordinate system so that entry paths, loops, dive sweeps, and off-screen wrap-arounds align seamlessly with the player baseline ($Y=250$) and formation grid ($Y \in [52, 108]$).
2. **From Observation 3 (Sprite Heading Math)**:
   - Because canvas $+Y$ is downwards and sprites are drawn facing UP ($-Y$), an unrotated sprite ($\theta=0$) points upwards.
   - For travel along tangent vector $(v_x, v_y)$, the heading angle formula is $\theta = \operatorname{atan2}(v_y, v_x) + \frac{\pi}{2}$.
   - We implement analytical derivative $B'(t)$ with a singularity guard for $P_1 = P_0$ or zero velocities, ensuring clean non-NaN rotations.
3. **From Observation 2 & Speed Regularity**:
   - Standard Bézier evaluation along parameter $t$ produces variable speed. By introducing an arc-length Look-Up Table (LUT) with 32 samples and binary search + lerp inverse mapping $t(s)$, enemies fly along curved loops at uniform linear speed (e.g. $160\text{ px/s}$).
4. **From Observation 4 (5 Entry Sub-Waves & Breathing Grid)**:
   - Fixed entry loops end in a dynamic approach segment whose endpoint $P_3$ is anchored directly to the alien's assigned formation slot coordinate $(x_{\text{slot}}(t), y_{\text{slot}}(t))$, eliminating visual popping when connecting into the breathing grid.
5. **From Observation 4 (Escort Transformation & Detachment)**:
   - Boss Galaga serves as path leader. Escort Goeis calculate local flank offsets $(\Delta x, \Delta y)$ transformed by the Boss's tangent and normal unit vectors. If the Boss is destroyed, Goeis detach cleanly and transition to solo dive trajectories.
6. **From Observation 4 (Off-Screen Wrap-Around)**:
   - Diving enemies exiting $Y \ge 295$ trigger a wrap-around transition: reappear at $Y = -16$ above the slot's column, and follow a 2-segment return spline that docks smoothly back into the formation slot.

---

## 3. Caveats

1. **Formation Breathing Dynamic Updates**:
   - The entry path and return path approach segments dynamically read the current slot coordinate $(x_s, y_s)$ at generation time. If high-amplitude breathing occurs during docking, the final step snaps to the exact slot position when distance $< 2\text{px}$.
2. **Challenging Stage Custom Paths**:
   - In Challenging Stages (Stages 3, 7, 11...), enemies fly across the screen in unarmed acrobatic paths without entering formation. The `CompositeBezierPath` architecture fully supports these continuous crossing trajectories.

---

## 4. Conclusion

The mathematical models and production-ready designs for `src/math/Bezier.ts` and `src/systems/FlightPathManager.ts` are fully specified and ready for implementation. They provide:
- High-precision Cubic Bézier evaluations, analytical tangents, and sprite heading calculations.
- Arc-length parameterization for constant-speed flight.
- 5 Formation entry sub-waves connecting smoothly into breathing formation slots.
- 3 Dynamic dive path generators (Solo dive, Goei synchronized pair, Boss escorted dive with rigid local-frame transformation).
- Off-screen wrap-around and return-to-formation docking.

Full design specifications and production TypeScript source code are documented in `/Users/user/src/galog/.agents/m4_explorer_2/analysis.md`.

---

## 5. Verification Method

1. **Inspect Analysis and Specification**:
   - View `/Users/user/src/galog/.agents/m4_explorer_2/analysis.md` for the complete implementation code and coordinate tables.
2. **Unit Test Verification** (when implemented in Milestone 4 Worker step):
   - Run Vitest suite:
     ```bash
     npm test tests/unit/math.test.ts
     ```
   - Mathematical checks:
     - $B(0) = P_0$, $B(1) = P_3$, $B(0.5)$ analytical accuracy.
     - Tangent derivative $B'(0) = 3(P_1 - P_0)$, $B'(1) = 3(P_3 - P_2)$.
     - Heading angle $\theta$ for right ($+\pi/2$), down ($\pi$), left ($-\pi/2$), up ($0$).
     - Escort distance preservation under full $360^\circ$ rotation.
     - Arc-length LUT monotonicity and constant velocity sampling.
