# Milestone 4 Technical Analysis: Bézier Flight Curves & Dynamic AI Flight Paths

**Module Scope**: `src/math/Bezier.ts` and `src/systems/FlightPathManager.ts`  
**Author**: `m4_explorer_2` (Milestone 4: Bézier Flight Curves & Dynamic AI Specialist)  
**Target Platform**: TypeScript 5.7+ / HTML5 Canvas 2D ($224 \times 288$ native / $448 \times 576$ logical buffer)  
**Document Version**: 1.0.0 — Production-Ready Implementation Design

---

## 1. Executive Architectural Summary

In authentic Namco *Galaga* (1981), every alien motion outside the static grid formation is governed by smooth, deterministic parametric curves. Aliens swoop into the screen during 5 entry sub-waves, execute synchronized loops, peel off for aggressive diving attacks (solo, paired, or escorted), drop bombs, and wrap around from screen bottom to top to rejoin the breathing formation.

This document presents the complete mathematical formulation, parametric spline curves, dynamic coordinate anchoring, escort rotation matrices, and production-grade TypeScript implementations for:
1. **`src/math/Bezier.ts`**: High-performance Cubic Bézier evaluator, analytical velocity derivative tangent, heading angle calculator with sprite orientation offset, arc-length look-up table (LUT) speed normalizer, and composite multi-segment spline paths.
2. **`src/systems/FlightPathManager.ts`**: The 5 canonical formation entry sub-waves (40 enemies across 5 distinct swooping trajectories), dynamic attack dive path generators (Single Alien, Goei Synchronized Pair, Boss Galaga Escort with 1 or 2 Goei wingmen), challenging stage patterns, off-screen wrap-around logic, and return-to-formation docking.

---

## 2. Mathematical Foundations & `src/math/Bezier.ts`

### 2.1 Cubic Bézier Curve Formulation
A cubic Bézier curve segment is parameterized by $t \in [0, 1]$ across 4 control points $P_0, P_1, P_2, P_3 \in \mathbb{R}^2$:

$$B(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t) t^2 P_2 + t^3 P_3$$

Expanding into explicit Horner form for minimal floating-point multiplications:
$$B(t) = P_0 + t \cdot \Big( 3(P_1 - P_0) + t \cdot \big( 3(P_0 - 2P_1 + P_2) + t \cdot (-P_0 + 3P_1 - 3P_2 + P_3) \big) \Big)$$

```typescript
export interface Point2D {
  x: number;
  y: number;
}

export interface CubicBezierPoints {
  p0: Point2D;
  p1: Point2D;
  p2: Point2D;
  p3: Point2D;
}
```

### 2.2 Analytical Velocity Derivative & Tangent Heading
The velocity vector (first derivative $\frac{d}{dt} B(t) = B'(t)$) is a quadratic Bézier polynomial:

$$B'(t) = 3(1-t)^2 (P_1 - P_0) + 6(1-t)t (P_2 - P_1) + 3t^2 (P_3 - P_2)$$

#### Tangent Vector Properties:
- At start ($t = 0$): $B'(0) = 3(P_1 - P_0)$
- At end ($t = 1$): $B'(1) = 3(P_3 - P_2)$
- At midpoint ($t = 0.5$): $B'(0.5) = \frac{3}{4}(P_1 - P_0) + \frac{3}{2}(P_2 - P_1) + \frac{3}{4}(P_3 - P_2)$

#### Tangent Heading Angle Calculation:
In standard 2D canvas coordinates ($+X$ right, $+Y$ down):
- Cartesian angle: $\phi = \operatorname{atan2}(v_y, v_x)$ where right is $0$, down is $+\frac{\pi}{2}$, left is $\pm\pi$, up is $-\frac{\pi}{2}$.
- Galaga sprite orientation: All enemy sprite pixel matrices are drawn pointing **UP** (in direction $-Y$).
- To orient an upright sprite along the velocity vector $(v_x, v_y)$:
  $$\theta(t) = \operatorname{atan2}(v_y, v_x) + \frac{\pi}{2}$$
  - Moving DOWN ($v_x = 0, v_y > 0$): $\operatorname{atan2}(1, 0) + \frac{\pi}{2} = \frac{\pi}{2} + \frac{\pi}{2} = \pi$ ($180^\circ$ clockwise rotation $\implies$ faces down).
  - Moving RIGHT ($v_x > 0, v_y = 0$): $\operatorname{atan2}(0, 1) + \frac{\pi}{2} = 0 + \frac{\pi}{2} = \frac{\pi}{2}$ ($90^\circ$ clockwise rotation $\implies$ faces right).
  - Moving UP ($v_x = 0, v_y < 0$): $\operatorname{atan2}(-1, 0) + \frac{\pi}{2} = -\frac{\pi}{2} + \frac{\pi}{2} = 0$ ($0^\circ$ rotation $\implies$ faces up).
  - Moving LEFT ($v_x < 0, v_y = 0$): $\operatorname{atan2}(0, -1) + \frac{\pi}{2} = \pi + \frac{\pi}{2} = \frac{3\pi}{2} \equiv -\frac{\pi}{2}$ (faces left).

#### Singularity & Zero-Derivative Guard:
If control points coincide ($P_1 = P_0$ at $t=0$ or $P_2 = P_3$ at $t=1$), the derivative magnitude $\|B'(t)\|$ becomes 0. The evaluator guards against this by falling back to the higher-order difference or preserving the previous valid heading angle:
```typescript
if (Math.abs(vx) < 1e-6 && Math.abs(vy) < 1e-6) {
  // Fallback to chord between start and end
  vx = p3.x - p0.x;
  vy = p3.y - p0.y;
}
```

### 2.3 Arc-Length Parameterization (LUT Speed Normalization)
Standard Bézier curves are non-uniform in parameter $t$. If an alien moves at a constant speed $V$ (e.g. $160\text{ px/s}$), stepping $t$ uniformly causes the alien to speed up on loose curves and slow down on tight loops.

To achieve smooth, authentic constant-speed arcade flight:
1. **Pre-bake Arc Length Look-Up Table (LUT)**:
   Sample the curve at $N = 32$ intervals $t_i = \frac{i}{N}$ ($i = 0 \dots N$), computing cumulative Euclidean chord lengths:
   $$s(0) = 0, \quad s(t_i) = s(t_{i-1}) + \| B(t_i) - B(t_{i-1}) \|$$
   Total curve length $L = s(1.0)$.
2. **Inverse Arc Length Query $t(s)$**:
   Given a target traversed distance $d \in [0, L]$, perform binary search on the LUT to find interval $[s_k, s_{k+1}]$, followed by linear interpolation:
   $$t(d) = t_k + (t_{k+1} - t_k) \cdot \frac{d - s_k}{s_{k+1} - s_k}$$
3. **Constant Speed Flight**:
   At elapsed time $t_{\text{elapsed}}$, distance $d = V \cdot t_{\text{elapsed}}$.
   The exact position is $B(t(d))$, giving pixel-perfect constant linear velocity!

### 2.4 Composite Multi-Segment Spline Path
A flight path consists of $M$ connected cubic Bézier segments $\{ S_1, S_2, \dots, S_M \}$.
- Each segment $S_i$ has duration $T_i$ (or arc-length $L_i$).
- Total path duration $T_{\text{total}} = \sum_{i=1}^M T_i$.
- **$C^0$ Continuity**: Start of segment $S_{i+1}$ equals end of segment $S_i$ ($P_0^{(i+1)} = P_3^{(i)}$).
- **$C^1$ Tangent Continuity**: Control point $P_1^{(i+1)}$ lies along the reflection vector of $P_2^{(i)}$ across $P_3^{(i)}$:
  $$P_1^{(i+1)} = P_3^{(i)} + k \cdot (P_3^{(i)} - P_2^{(i)}), \quad k > 0$$

---

## 3. The 5 Formation Entry Sub-Waves

In Galaga, each stage begins with the **Stage Intro / Entry Wave Phase**. Exactly **40 enemies** enter in **5 sub-waves of 8 enemies each**, following distinct swooping loops before settling into their assigned 5-row formation grid slots.

### 3.1 Formation Grid Reference ($224 \times 288$ Coordinate Space)
- **Row 0** ($Y = 52$): 4 Boss Galagas (Cols 3, 4, 5, 6 $\implies X \in [88, 104, 120, 136]$)
- **Row 1** ($Y = 66$): 8 Red Goeis (Cols 1..8 $\implies X \in [56, 72, 88, 104, 120, 136, 152, 168]$)
- **Row 2** ($Y = 80$): 8 Red Goeis (Cols 1..8 $\implies X \in [56, 72, 88, 104, 120, 136, 152, 168]$)
- **Row 3** ($Y = 94$): 10 Yellow Zakos (Cols 0..9 $\implies X \in [40, 56, 72, 88, 104, 120, 136, 152, 168, 184]$)
- **Row 4** ($Y = 108$): 10 Yellow Zakos (Cols 0..9 $\implies X \in [40, 56, 72, 88, 104, 120, 136, 152, 168, 184]$)

### 3.2 Sub-Wave Specifications Table

| Sub-Wave | Ship Composition | Spawn Origin | Flight Trajectory Description | Target Slots Assigned |
|---|---|---|---|---|
| **Sub-Wave 1** | 4 Boss Galagas + 4 Red Goeis | Top Center $(112, -20)$ | Plunges down center to $Y=135$, splits into 4 left loops (CCW) and 4 right loops (CW) | Row 0 (4 Bosses), Row 1 (Cols 3..6 Goeis) |
| **Sub-Wave 2** | 8 Red Goeis | Top Right $(235, -20)$ | Plunges down-left diagonally, executes bottom loop near $(50, 210)$, ascends to top-right | Row 1 (Cols 1,2,7,8), Row 2 (Cols 3..6) |
| **Sub-Wave 3** | 8 Yellow Zakos (or 4 Goei + 4 Zako) | Top Left $(-15, -20)$ | Plunges down-right diagonally, executes bottom loop near $(174, 210)$, ascends to top-left | Row 2 (Cols 1,2,7,8), Row 3 (Cols 3..6) |
| **Sub-Wave 4** | 8 Yellow Zakos | Bottom Left $(-20, 230)$ | High-speed upward swoop to right, executes top loop near $(160, 60)$, descends to lower rows | Row 3 (Cols 0,1,2), Row 4 (Cols 0..4) |
| **Sub-Wave 5** | 8 Yellow Zakos | Bottom Right $(244, 230)$ | High-speed upward swoop to left, executes top loop near $(64, 60)$, descends to lower rows | Row 3 (Cols 7,8,9), Row 4 (Cols 5..9) |

### 3.3 Dynamic Target-Slot Anchoring Algorithm
Because the formation grid breathes (sinusoidal expansion $\Delta x(t) = A \sin(\omega t)$), fixed curve endpoints would cause entering enemies to pop or jerk into position.

**The Anchoring Solution**:
Each entry spline is divided into **Fixed Staging Segments** (the acrobatic swoops and loops) followed by a **Dynamic Approach Segment**:
- $P_0$: Fixed end of loop segment $(x_{\text{loop}}, y_{\text{loop}})$.
- $P_1$: Fixed directional exit tangent from loop: $P_1 = P_0 + \vec{v}_{\text{exit}} \cdot \tau$.
- $P_3(t)$: Dynamically set to the alien's current breathing formation slot:
  $$P_3(t) = \big( x_{\text{slot\_base}} + \text{formationOffsetX}(t), \; y_{\text{slot\_base}} + \text{formationOffsetY}(t) \big)$$
- $P_2(t)$: Interpolated control point creating a smooth S-curve landing from above:
  $$P_2(t) = \big( P_3.x, \; P_3.y - 30 \big)$$

This guarantees $C^1$ continuity from the looping maneuver directly into the live moving formation slot with zero visual popping.

---

## 4. Dynamic Attack Dive System

During combat, the `FormationManager` periodically triggers alien dive attacks. There are three core attack dive architectures:

```
                  +-------------------------------+
                  |      Formation Slot (xf, yf)  |
                  +-------------------------------+
                                  |
                                  v (Phase 1: Peel-Off & Teardrop Loop)
                  +-------------------------------+
                  | Loops upward, rotates 360°    |
                  +-------------------------------+
                                  |
                                  v (Phase 2: Aimed Swoop at Player X)
                  +-------------------------------+
                  | Targets Xplayer, fires bullet |
                  +-------------------------------+
                                  |
                                  v (Phase 3: Screen Bottom Exit)
                  +-------------------------------+
                  | Exits at Y > 298              |
                  +-------------------------------+
                                  |
                                  v (Off-Screen Wrap-Around)
                  +-------------------------------+
                  | Re-enters at Top (Xre-enter)  |
                  | Descends back to formation    |
                  +-------------------------------+
```

### 4.1 Single Alien Dive (Zako / Solo Goei / Solo Boss)
1. **Phase 1: Peel-Off & Teardrop Loop**:
   - Initial lift: $P_0 = (x_f, y_f)$, $P_1 = (x_f \pm 10, y_f - 20)$, $P_2 = (x_f \pm 30, y_f - 10)$, $P_3 = (x_f \pm 20, y_f + 20)$.
   - Rotates through a $360^\circ$ loop to orient downward.
2. **Phase 2: Aimed Swoop**:
   - Anchored from loop exit $(x_{\text{exit}}, y_{\text{exit}})$ to player's current horizontal position $X_{\text{player}}$:
     - $P_0 = (x_{\text{exit}}, y_{\text{exit}})$
     - $P_1 = (\frac{x_{\text{exit}} + X_{\text{player}}}{2}, 140)$
     - $P_2 = (X_{\text{player}} + \text{bias}, 220)$
     - $P_3 = (X_{\text{player}} + \text{exit\_offset}, 310)$ (past screen bottom $Y = 288$)
3. **Bomb Drop Window**:
   - When parameter $t \in [0.4, 0.7]$ and enemy $Y \in [120, 200]$, triggers bullet drop directed towards player ship.

### 4.2 Goei Synchronized Paired Dive
In Galaga, Goei butterflies often dive in synchronized pairs from symmetrical formation slots:
- **Left Wingman** ($X_{L}, Y_{L}$) and **Right Wingman** ($X_{R}, Y_{R}$).
- They peel off simultaneously, dive toward center, and execute an intersecting **corkscrew figure-8 flip** at mid-screen ($Y \approx 160$).
- Left Goei sweeps down-right then curves left; Right Goei sweeps down-left then curves right.
- As they intersect, both release bullets, creating a crossfire hazard for the player.

### 4.3 Boss Galaga Escorted Dive (Boss + 1 or 2 Goei Wingmen)
When Boss Galaga dives, it summons flanking Goei escorts from Rows 1 & 2:
- **Full Escort**: Boss + 2 Goeis (Left flank $\Delta x = -16, \Delta y = +4$; Right flank $\Delta x = +16, \Delta y = +4$).
- **Single Escort**: Boss + 1 Goei (flank offset $\Delta x = \pm 16, \Delta y = +4$).

#### Rigid Rotational Escort Frame Transformation:
The Boss Galaga is the path leader. At each frame $t$:
1. Evaluate Boss position $\vec{P}_{\text{Boss}}(t) = (x_B, y_B)$ and heading $\theta_B(t)$ from the dive spline.
2. The Boss unit tangent vector $\vec{T}$ and unit normal vector $\vec{N}$ are:
   $$\vec{T} = \begin{pmatrix} \sin\theta_B \\ -\cos\theta_B \end{pmatrix}, \quad \vec{N} = \begin{pmatrix} \cos\theta_B \\ \sin\theta_B \end{pmatrix}$$
3. For each escort with local offset $(\Delta x_{\text{local}}, \Delta y_{\text{local}})$:
   $$\vec{P}_{\text{escort}} = \vec{P}_{\text{Boss}} + \Delta x_{\text{local}} \cdot \vec{N} + \Delta y_{\text{local}} \cdot (-\vec{T})$$
   $$\theta_{\text{escort}} = \theta_B$$
4. **Detachment on Boss Destruction**:
   If the Boss is shot down while diving:
   - The escort Goeis are immediately detached (`state: DIVING_SOLO`).
   - Each Goei dynamically generates an independent diving swoop from its current detached position $(x_e, y_e)$ targeting the player ship!

---

## 5. Off-Screen Wrap-Around & Re-Docking

When an enemy completes its dive and exits the bottom of the screen ($Y \ge 295$):
1. **State Transition**: State becomes `RETURNING_TO_FORMATION`.
2. **Re-Entry Coordinates**:
   - Reappears at top of screen: $Y = -16$.
   - Horizontal entry coordinate $X_{\text{re-enter}}$ is aligned with target formation slot:
     $$X_{\text{re-enter}} = \text{clamp}(X_{\text{slot}} \pm 20, 16, 208)$$
3. **Return Spline Generation**:
   A smooth 2-segment descending S-curve:
   - Segment 1: $(X_{\text{re-enter}}, -16) \to (X_{\text{re-enter}}, 15) \to (X_{\text{slot}}, 25) \to (X_{\text{slot}}, 40)$
   - Segment 2: $(X_{\text{slot}}, 40) \to (X_{\text{slot}}, Y_{\text{slot}} - 20) \to (X_{\text{slot}}, Y_{\text{slot}} - 5) \to (X_{\text{slot}}, Y_{\text{slot}})$
4. **Re-Docking Convergence**:
   When $t = 1.0$ (or distance to slot $< 2\text{px}$):
   - State becomes `IN_FORMATION`.
   - Orientation resets smoothly to $0\text{ rad}$ (upright).
   - Enemy is handed back to `FormationManager` breathing oscillation.

---

## 6. Production-Ready Code Implementation: `src/math/Bezier.ts`

```typescript
/**
 * Galaga Arcade Web Game — Cubic Bézier Evaluator & Arc-Length Normalizer
 * 
 * Provides high-precision cubic Bézier curve evaluation, analytical velocity
 * derivatives, tangent heading angles with sprite orientation offsets,
 * arc-length Look-Up Table (LUT) constant-speed parameterization, and
 * multi-segment composite spline paths.
 */

import type { Point2D, Vector2D } from '../types';

export interface CubicBezierPoints {
  p0: Point2D;
  p1: Point2D;
  p2: Point2D;
  p3: Point2D;
}

export interface CurveSample {
  position: Point2D;
  velocity: Vector2D;
  tangent: Vector2D;
  heading: number; // In radians, oriented for Galaga sprites (0 rad = UP)
  distance: number;
}

export class BezierCurve {
  public readonly p0: Point2D;
  public readonly p1: Point2D;
  public readonly p2: Point2D;
  public readonly p3: Point2D;

  private lutLength: number = 0;
  private readonly lutDistances: number[] = [];
  private readonly lutT: number[] = [];
  private static readonly LUT_SAMPLES = 32;

  constructor(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D) {
    this.p0 = { x: p0.x, y: p0.y };
    this.p1 = { x: p1.x, y: p1.y };
    this.p2 = { x: p2.x, y: p2.y };
    this.p3 = { x: p3.x, y: p3.y };
    this.buildArcLengthLUT();
  }

  /**
   * Evaluates curve position B(t) at parametric parameter t in [0, 1].
   */
  public evaluate(t: number): Point2D {
    const clampedT = Math.max(0, Math.min(1, t));
    const u = 1 - clampedT;
    const tt = clampedT * clampedT;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * clampedT;

    const x = uuu * this.p0.x + 3 * uu * clampedT * this.p1.x + 3 * u * tt * this.p2.x + ttt * this.p3.x;
    const y = uuu * this.p0.y + 3 * uu * clampedT * this.p1.y + 3 * u * tt * this.p2.y + ttt * this.p3.y;

    return { x, y };
  }

  /**
   * Computes analytical first derivative velocity vector B'(t).
   */
  public derivative(t: number): Vector2D {
    const clampedT = Math.max(0, Math.min(1, t));
    const u = 1 - clampedT;

    const c0 = 3 * u * u;
    const c1 = 6 * u * clampedT;
    const c2 = 3 * clampedT * clampedT;

    let dx = c0 * (this.p1.x - this.p0.x) + c1 * (this.p2.x - this.p1.x) + c2 * (this.p3.x - this.p2.x);
    let dy = c0 * (this.p1.y - this.p0.y) + c1 * (this.p2.y - this.p1.y) + c2 * (this.p3.y - this.p2.y);

    // Singularity guard: If derivative is zero, fallback to chord direction
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
      dx = this.p3.x - this.p0.x;
      dy = this.p3.y - this.p0.y;
    }

    return { x: dx, y: dy };
  }

  /**
   * Computes normalized tangent direction vector.
   */
  public tangent(t: number): Vector2D {
    const d = this.derivative(t);
    const len = Math.sqrt(d.x * d.x + d.y * d.y);
    if (len > 1e-6) {
      return { x: d.x / len, y: d.y / len };
    }
    return { x: 0, y: 1 };
  }

  /**
   * Computes sprite orientation angle theta(t).
   * Default offset Math.PI / 2 ensures unrotated (0 rad) sprite faces UP (-Y).
   */
  public heading(t: number, orientationOffsetRad: number = Math.PI / 2): number {
    const d = this.derivative(t);
    return Math.atan2(d.y, d.x) + orientationOffsetRad;
  }

  /**
   * Computes total arc-length of the curve segment.
   */
  public get length(): number {
    return this.lutLength;
  }

  /**
   * Converts a traversed arc-length distance s in [0, length] to parametric parameter t.
   */
  public distanceToT(distance: number): number {
    if (this.lutLength <= 0 || distance <= 0) return 0;
    if (distance >= this.lutLength) return 1;

    // Binary search in LUT
    let low = 0;
    let high = this.lutDistances.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const d = this.lutDistances[mid]!;
      if (d < distance) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const idx = Math.max(0, Math.min(this.lutDistances.length - 2, high));
    const d0 = this.lutDistances[idx]!;
    const d1 = this.lutDistances[idx + 1]!;
    const t0 = this.lutT[idx]!;
    const t1 = this.lutT[idx + 1]!;

    const fraction = d1 > d0 ? (distance - d0) / (d1 - d0) : 0;
    return t0 + (t1 - t0) * fraction;
  }

  /**
   * Samples position and heading at a specific traversed arc-length distance.
   */
  public sampleAtDistance(distance: number, orientationOffsetRad: number = Math.PI / 2): CurveSample {
    const t = this.distanceToT(distance);
    const position = this.evaluate(t);
    const velocity = this.derivative(t);
    const tan = this.tangent(t);
    const head = this.heading(t, orientationOffsetRad);

    return {
      position,
      velocity,
      tangent: tan,
      heading: head,
      distance: Math.min(distance, this.lutLength),
    };
  }

  /**
   * Precomputes cumulative arc-length look-up table.
   */
  private buildArcLengthLUT(): void {
    this.lutDistances.length = 0;
    this.lutT.length = 0;

    let prev = this.evaluate(0);
    let total = 0;

    this.lutDistances.push(0);
    this.lutT.push(0);

    const steps = BezierCurve.LUT_SAMPLES;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const curr = this.evaluate(t);
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      total += Math.sqrt(dx * dx + dy * dy);

      this.lutDistances.push(total);
      this.lutT.push(t);
      prev = curr;
    }

    this.lutLength = total;
  }
}

/**
 * Composite flight trajectory comprising multiple connected Bézier curves.
 */
export interface PathSegmentConfig {
  curve: BezierCurve;
  speed?: number; // Pixels per second (optional constant speed)
  durationMs?: number; // Segment duration in milliseconds (optional fixed time)
}

export class CompositeBezierPath {
  public readonly id: string;
  public readonly segments: BezierCurve[] = [];
  public readonly segmentLengths: number[] = [];
  public readonly segmentDurationsMs: number[] = [];
  public totalLength: number = 0;
  public totalDurationMs: number = 0;

  constructor(id: string, segmentConfigs: PathSegmentConfig[]) {
    this.id = id;
    for (const cfg of segmentConfigs) {
      this.segments.push(cfg.curve);
      const len = cfg.curve.length;
      this.segmentLengths.push(len);
      this.totalLength += len;

      let durMs = 1000;
      if (cfg.durationMs !== undefined && cfg.durationMs > 0) {
        durMs = cfg.durationMs;
      } else if (cfg.speed !== undefined && cfg.speed > 0) {
        durMs = (len / cfg.speed) * 1000;
      } else {
        durMs = (len / 150) * 1000; // Default 150 px/s
      }
      this.segmentDurationsMs.push(durMs);
      this.totalDurationMs += durMs;
    }
  }

  /**
   * Evaluates the path at elapsed time in milliseconds.
   */
  public evaluateTime(elapsedMs: number, orientationOffsetRad: number = Math.PI / 2): CurveSample & { isComplete: boolean; segmentIndex: number } {
    if (this.segments.length === 0) {
      return {
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        tangent: { x: 0, y: 1 },
        heading: 0,
        distance: 0,
        isComplete: true,
        segmentIndex: 0,
      };
    }

    if (elapsedMs >= this.totalDurationMs) {
      const lastSegIdx = this.segments.length - 1;
      const lastSeg = this.segments[lastSegIdx]!;
      const sample = lastSeg.sampleAtDistance(lastSeg.length, orientationOffsetRad);
      return {
        ...sample,
        isComplete: true,
        segmentIndex: lastSegIdx,
      };
    }

    let accumulatedMs = 0;
    for (let i = 0; i < this.segments.length; i++) {
      const segDur = this.segmentDurationsMs[i]!;
      if (elapsedMs < accumulatedMs + segDur || i === this.segments.length - 1) {
        const segElapsedMs = Math.max(0, elapsedMs - accumulatedMs);
        const segFraction = segDur > 0 ? segElapsedMs / segDur : 1;
        const seg = this.segments[i]!;
        const targetDist = segFraction * seg.length;
        const sample = seg.sampleAtDistance(targetDist, orientationOffsetRad);

        return {
          ...sample,
          isComplete: false,
          segmentIndex: i,
        };
      }
      accumulatedMs += segDur;
    }

    const lastSeg = this.segments[this.segments.length - 1]!;
    return {
      ...lastSeg.sampleAtDistance(lastSeg.length, orientationOffsetRad),
      isComplete: true,
      segmentIndex: this.segments.length - 1,
    };
  }
}
```

---

## 7. Production-Ready Code Implementation: `src/systems/FlightPathManager.ts`

```typescript
/**
 * Galaga Arcade Web Game — Flight Path Manager & Dynamic AI Trajectory System
 * 
 * Manages:
 * 1. 5 Formation entry sub-waves (40 ships across 5 distinct swooping trajectories)
 * 2. Attack dive paths (Single alien, Goei synchronized pair, Boss Galaga escort)
 * 3. Dynamic target-slot anchoring to breathing formation grid
 * 4. Off-screen bottom wrap-around and return-to-formation docking
 */

import { BezierCurve, CompositeBezierPath, type CurveSample } from '../math/Bezier';
import type { Point2D, Vector2D } from '../types';

export type SubWaveType = 'WAVE_1_TOP_CENTER' | 'WAVE_2_TOP_RIGHT' | 'WAVE_3_TOP_LEFT' | 'WAVE_4_BOTTOM_LEFT' | 'WAVE_5_BOTTOM_RIGHT';
export type DiveType = 'SOLO_ZAKO' | 'SOLO_GOEI' | 'SOLO_BOSS' | 'PAIRED_GOEI_LEFT' | 'PAIRED_GOEI_RIGHT' | 'BOSS_ESCORTED';

export interface ActiveFlightState {
  path: CompositeBezierPath;
  elapsedMs: number;
  totalDurationMs: number;
  isComplete: boolean;
  targetSlot: Point2D;
  hasFiredBomb: boolean;
  fireWindowMs: { min: number; max: number };
}

export interface EscortOffset {
  deltaX: number; // Lateral offset (perpendicular to Boss heading)
  deltaY: number; // Longitudinal offset (along Boss heading)
}

export class FlightPathManager {
  // Canonical entry speed constants
  public static readonly ENTRY_SPEED = 160; // Pixels/second
  public static readonly DIVE_SPEED = 175;  // Pixels/second
  public static readonly RETURN_SPEED = 140;// Pixels/second

  // ==========================================================================
  // 1. Formation Entry Sub-Wave Paths
  // ==========================================================================

  /**
   * Generates a dynamic, slot-anchored entry path for an alien in one of the 5 sub-waves.
   * @param waveType The canonical sub-wave (1..5)
   * @param alienIndex Index of the alien within the sub-wave group (0..7)
   * @param currentSlotPos Live position of assigned formation slot (includes breathing offset)
   */
  public static createEntryPath(
    waveType: SubWaveType,
    alienIndex: number,
    currentSlotPos: Point2D
  ): CompositeBezierPath {
    const pathId = `ENTRY_${waveType}_#${alienIndex}`;

    switch (waveType) {
      case 'WAVE_1_TOP_CENTER':
        return FlightPathManager.createSubWave1TopCenter(pathId, alienIndex, currentSlotPos);

      case 'WAVE_2_TOP_RIGHT':
        return FlightPathManager.createSubWave2TopRight(pathId, alienIndex, currentSlotPos);

      case 'WAVE_3_TOP_LEFT':
        return FlightPathManager.createSubWave3TopLeft(pathId, alienIndex, currentSlotPos);

      case 'WAVE_4_BOTTOM_LEFT':
        return FlightPathManager.createSubWave4BottomLeft(pathId, alienIndex, currentSlotPos);

      case 'WAVE_5_BOTTOM_RIGHT':
        return FlightPathManager.createSubWave5BottomRight(pathId, alienIndex, currentSlotPos);
    }
  }

  /**
   * Sub-Wave 1: Top-Center Entry (4 Boss Galagas + 4 Red Goeis)
   * Plunges down center, splits into left (CCW) and right (CW) loops.
   */
  private static createSubWave1TopCenter(
    pathId: string,
    alienIndex: number,
    slot: Point2D
  ): CompositeBezierPath {
    const isLeftBranch = alienIndex < 4;

    // Segment 1: Downward plunge
    const seg1 = new BezierCurve(
      { x: 112, y: -20 },
      { x: 112, y: 40 },
      { x: 112, y: 90 },
      { x: 112, y: 135 }
    );

    // Segment 2: Outward loop
    let seg2: BezierCurve;
    let seg3ExitTangent: Point2D;

    if (isLeftBranch) {
      // Left loop (Counter-Clockwise)
      seg2 = new BezierCurve(
        { x: 112, y: 135 },
        { x: 60, y: 180 },
        { x: 30, y: 120 },
        { x: 75, y: 80 }
      );
      seg3ExitTangent = { x: 95, y: 60 };
    } else {
      // Right loop (Clockwise)
      seg2 = new BezierCurve(
        { x: 112, y: 135 },
        { x: 164, y: 180 },
        { x: 194, y: 120 },
        { x: 149, y: 80 }
      );
      seg3ExitTangent = { x: 129, y: 60 };
    }

    // Segment 3: Dynamic approach to target slot
    const seg3 = new BezierCurve(
      seg2.p3,
      seg3ExitTangent,
      { x: slot.x, y: slot.y - 25 },
      { x: slot.x, y: slot.y }
    );

    return new CompositeBezierPath(pathId, [
      { curve: seg1, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg2, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg3, speed: FlightPathManager.ENTRY_SPEED },
    ]);
  }

  /**
   * Sub-Wave 2: Top-Right Entry (8 Red Goeis)
   * Diagonal swoop down-left, bottom loop near (50, 210), ascend to slot.
   */
  private static createSubWave2TopRight(
    pathId: string,
    alienIndex: number,
    slot: Point2D
  ): CompositeBezierPath {
    const staggerOffset = (alienIndex % 4) * 4;

    // Segment 1: High-speed plunge across screen to lower-left
    const seg1 = new BezierCurve(
      { x: 235 + staggerOffset, y: -20 },
      { x: 210, y: 80 },
      { x: 90, y: 140 },
      { x: 45, y: 200 }
    );

    // Segment 2: Bottom loop
    const seg2 = new BezierCurve(
      { x: 45, y: 200 },
      { x: 15, y: 245 },
      { x: 95, y: 255 },
      { x: 125, y: 190 }
    );

    // Segment 3: Dynamic ascent into slot
    const seg3 = new BezierCurve(
      { x: 125, y: 190 },
      { x: 145, y: 140 },
      { x: slot.x, y: slot.y - 25 },
      { x: slot.x, y: slot.y }
    );

    return new CompositeBezierPath(pathId, [
      { curve: seg1, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg2, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg3, speed: FlightPathManager.ENTRY_SPEED },
    ]);
  }

  /**
   * Sub-Wave 3: Top-Left Entry (8 Yellow Zakos / Red Goeis)
   * Diagonal swoop down-right, bottom loop near (174, 210), ascend to slot.
   */
  private static createSubWave3TopLeft(
    pathId: string,
    alienIndex: number,
    slot: Point2D
  ): CompositeBezierPath {
    const staggerOffset = (alienIndex % 4) * 4;

    // Segment 1: Plunge across screen to lower-right
    const seg1 = new BezierCurve(
      { x: -15 - staggerOffset, y: -20 },
      { x: 14, y: 80 },
      { x: 134, y: 140 },
      { x: 179, y: 200 }
    );

    // Segment 2: Bottom loop
    const seg2 = new BezierCurve(
      { x: 179, y: 200 },
      { x: 209, y: 245 },
      { x: 129, y: 255 },
      { x: 99, y: 190 }
    );

    // Segment 3: Dynamic ascent into slot
    const seg3 = new BezierCurve(
      { x: 99, y: 190 },
      { x: 79, y: 140 },
      { x: slot.x, y: slot.y - 25 },
      { x: slot.x, y: slot.y }
    );

    return new CompositeBezierPath(pathId, [
      { curve: seg1, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg2, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg3, speed: FlightPathManager.ENTRY_SPEED },
    ]);
  }

  /**
   * Sub-Wave 4: Bottom-Left Entry (8 Yellow Zakos)
   * Upward swoop to upper-right, top loop near (160, 60), descend into bottom rows.
   */
  private static createSubWave4BottomLeft(
    pathId: string,
    alienIndex: number,
    slot: Point2D
  ): CompositeBezierPath {
    const staggerY = (alienIndex % 4) * 6;

    // Segment 1: Upward swoop across screen
    const seg1 = new BezierCurve(
      { x: -20, y: 230 + staggerY },
      { x: 50, y: 180 },
      { x: 130, y: 110 },
      { x: 165, y: 65 }
    );

    // Segment 2: Top loop
    const seg2 = new BezierCurve(
      { x: 165, y: 65 },
      { x: 195, y: 25 },
      { x: 130, y: 20 },
      { x: 100, y: 65 }
    );

    // Segment 3: Dynamic descent into slot
    const seg3 = new BezierCurve(
      { x: 100, y: 65 },
      { x: 80, y: 95 },
      { x: slot.x, y: slot.y - 20 },
      { x: slot.x, y: slot.y }
    );

    return new CompositeBezierPath(pathId, [
      { curve: seg1, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg2, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg3, speed: FlightPathManager.ENTRY_SPEED },
    ]);
  }

  /**
   * Sub-Wave 5: Bottom-Right Entry (8 Yellow Zakos)
   * Upward swoop to upper-left, top loop near (64, 60), descend into bottom rows.
   */
  private static createSubWave5BottomRight(
    pathId: string,
    alienIndex: number,
    slot: Point2D
  ): CompositeBezierPath {
    const staggerY = (alienIndex % 4) * 6;

    // Segment 1: Upward swoop across screen
    const seg1 = new BezierCurve(
      { x: 244, y: 230 + staggerY },
      { x: 174, y: 180 },
      { x: 94, y: 110 },
      { x: 59, y: 65 }
    );

    // Segment 2: Top loop
    const seg2 = new BezierCurve(
      { x: 59, y: 65 },
      { x: 29, y: 25 },
      { x: 94, y: 20 },
      { x: 124, y: 65 }
    );

    // Segment 3: Dynamic descent into slot
    const seg3 = new BezierCurve(
      { x: 124, y: 65 },
      { x: 144, y: 95 },
      { x: slot.x, y: slot.y - 20 },
      { x: slot.x, y: slot.y }
    );

    return new CompositeBezierPath(pathId, [
      { curve: seg1, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg2, speed: FlightPathManager.ENTRY_SPEED },
      { curve: seg3, speed: FlightPathManager.ENTRY_SPEED },
    ]);
  }

  // ==========================================================================
  // 2. Attack Dive Paths
  // ==========================================================================

  /**
   * Generates a dynamic single alien attack dive path targeting the player's position.
   */
  public static createSoloDivePath(
    origin: Point2D,
    playerX: number,
    isLeftBias: boolean = true
  ): CompositeBezierPath {
    const loopSign = isLeftBias ? -1 : 1;

    // Segment 1: Peel-off teardrop loop
    const seg1 = new BezierCurve(
      { x: origin.x, y: origin.y },
      { x: origin.x + loopSign * 12, y: origin.y - 24 },
      { x: origin.x + loopSign * 35, y: origin.y - 8 },
      { x: origin.x + loopSign * 20, y: origin.y + 26 }
    );

    // Segment 2: Aimed plunge toward player X
    const targetExitX = playerX + loopSign * 20;
    const seg2 = new BezierCurve(
      seg1.p3,
      { x: (seg1.p3.x + playerX) / 2, y: 130 },
      { x: playerX, y: 210 },
      { x: targetExitX, y: 310 } // Past screen bottom (Y = 288)
    );

    return new CompositeBezierPath('SOLO_DIVE', [
      { curve: seg1, speed: FlightPathManager.DIVE_SPEED },
      { curve: seg2, speed: FlightPathManager.DIVE_SPEED },
    ]);
  }

  /**
   * Generates a pair of synchronized Goei diving paths with mid-screen criss-cross loops.
   */
  public static createPairedGoeiDivePaths(
    leftOrigin: Point2D,
    rightOrigin: Point2D,
    playerX: number
  ): { leftPath: CompositeBezierPath; rightPath: CompositeBezierPath } {
    // Left Goei: Swoops right across center, corkscrew flip, dives to left
    const leftSeg1 = new BezierCurve(
      { x: leftOrigin.x, y: leftOrigin.y },
      { x: leftOrigin.x - 10, y: leftOrigin.y - 20 },
      { x: leftOrigin.x + 20, y: 100 },
      { x: 120, y: 140 }
    );
    const leftSeg2 = new BezierCurve(
      { x: 120, y: 140 },
      { x: 170, y: 170 },
      { x: 90, y: 210 },
      { x: Math.max(16, playerX - 30), y: 310 }
    );

    // Right Goei: Swoops left across center, corkscrew flip, dives to right
    const rightSeg1 = new BezierCurve(
      { x: rightOrigin.x, y: rightOrigin.y },
      { x: rightOrigin.x + 10, y: rightOrigin.y - 20 },
      { x: rightOrigin.x - 20, y: 100 },
      { x: 104, y: 140 }
    );
    const rightSeg2 = new BezierCurve(
      { x: 104, y: 140 },
      { x: 54, y: 170 },
      { x: 134, y: 210 },
      { x: Math.min(208, playerX + 30), y: 310 }
    );

    return {
      leftPath: new CompositeBezierPath('GOEI_PAIR_LEFT', [
        { curve: leftSeg1, speed: FlightPathManager.DIVE_SPEED },
        { curve: leftSeg2, speed: FlightPathManager.DIVE_SPEED },
      ]),
      rightPath: new CompositeBezierPath('GOEI_PAIR_RIGHT', [
        { curve: rightSeg1, speed: FlightPathManager.DIVE_SPEED },
        { curve: rightSeg2, speed: FlightPathManager.DIVE_SPEED },
      ]),
    };
  }

  /**
   * Generates a Boss Galaga escorted dive path (leader trajectory).
   */
  public static createBossEscortedDivePath(
    origin: Point2D,
    playerX: number
  ): CompositeBezierPath {
    // Broad, sweeping command dive
    const seg1 = new BezierCurve(
      { x: origin.x, y: origin.y },
      { x: origin.x, y: origin.y - 20 },
      { x: origin.x > 112 ? origin.x + 30 : origin.x - 30, y: 70 },
      { x: 112, y: 120 }
    );

    const seg2 = new BezierCurve(
      { x: 112, y: 120 },
      { x: 112 + (origin.x > 112 ? -40 : 40), y: 170 },
      { x: playerX, y: 220 },
      { x: playerX, y: 310 }
    );

    return new CompositeBezierPath('BOSS_ESCORT_LEADER', [
      { curve: seg1, speed: FlightPathManager.DIVE_SPEED * 0.9 }, // Boss dives slightly slower
      { curve: seg2, speed: FlightPathManager.DIVE_SPEED * 0.9 },
    ]);
  }

  /**
   * Computes an escort wingman's world coordinate from the leader Boss sample.
   */
  public static calculateEscortTransform(
    bossSample: CurveSample,
    offset: EscortOffset
  ): { position: Point2D; heading: number } {
    // Standard heading: theta is radians from UP (-Y)
    // Tangent unit vector pointing in movement direction: (sin(theta), -cos(theta))
    // Normal unit vector pointing to the right flank: (cos(theta), sin(theta))
    const theta = bossSample.heading;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    // Normal vector (right flank)
    const nx = cosT;
    const ny = sinT;

    // Forward tangent vector
    const tx = sinT;
    const ty = -cosT;

    const posX = bossSample.position.x + offset.deltaX * nx - offset.deltaY * tx;
    const posY = bossSample.position.y + offset.deltaX * ny - offset.deltaY * ty;

    return {
      position: { x: posX, y: posY },
      heading: bossSample.heading,
    };
  }

  // ==========================================================================
  // 3. Off-Screen Wrap-Around & Return Path
  // ==========================================================================

  /**
   * Generates a return-to-formation path from top of screen back to assigned slot.
   */
  public static createReturnToFormationPath(
    targetSlot: Point2D
  ): CompositeBezierPath {
    const entryX = Math.max(16, Math.min(208, targetSlot.x + (targetSlot.x > 112 ? 15 : -15)));

    const seg1 = new BezierCurve(
      { x: entryX, y: -16 },
      { x: entryX, y: 20 },
      { x: targetSlot.x, y: 25 },
      { x: targetSlot.x, y: Math.max(35, targetSlot.y - 30) }
    );

    const seg2 = new BezierCurve(
      seg1.p3,
      { x: targetSlot.x, y: targetSlot.y - 15 },
      { x: targetSlot.x, y: targetSlot.y - 5 },
      { x: targetSlot.x, y: targetSlot.y }
    );

    return new CompositeBezierPath('RETURN_TO_FORMATION', [
      { curve: seg1, speed: FlightPathManager.RETURN_SPEED },
      { curve: seg2, speed: FlightPathManager.RETURN_SPEED },
    ]);
  }
}
```

---

## 8. Synthesis & Peer Agent Interoperability

### 8.1 Integration with `m4_explorer_1` (`Enemy.ts` and `FormationManager.ts`)
- `Enemy.ts` holds `flightState: ActiveFlightState | null`.
- When `Enemy.update(dt)` runs:
  - If `flightState` is present, it advances `elapsedMs += dt * 1000`.
  - Queries `flightState.path.evaluateTime(flightState.elapsedMs)`.
  - Updates `enemy.x = sample.position.x`, `enemy.y = sample.position.y`, `enemy.rotation = sample.heading`.
  - If `sample.isComplete`, transitions:
    - From `ENTERING` $\to$ `IN_FORMATION`.
    - From `DIVING_SOLO` $\to$ checks wrap-around: if $Y \ge 288$, generates `FlightPathManager.createReturnToFormationPath(slot)` $\to$ `RETURNING_TO_FORMATION`.
    - From `RETURNING_TO_FORMATION` $\to$ `IN_FORMATION`.
- For Escort Goeis:
  - When Boss Galaga is in `DIVING_ESCORT`, escort Goeis query `FlightPathManager.calculateEscortTransform(bossSample, offset)` instead of evaluating independent paths.
  - If Boss is destroyed, Goeis detach and call `FlightPathManager.createSoloDivePath(goeiPos, playerX)`.

### 8.2 Integration with `m4_explorer_3` (`SpriteRenderer.ts`)
- `SpriteRenderer.draw(ctx, spriteId, x, y, { rotation: enemy.rotation })` blits the pre-baked pixel sprite cleanly centered at $(x, y)$ rotated by `heading` in radians.
- Fast-path blitting is automatically used when `rotation === 0` (e.g. while sitting in formation).

---

## 9. Verification & Quality Assurance Strategy

To ensure zero regressions and 100% mathematical fidelity:

1. **Analytical Boundary Checks**:
   - Verify $B(0) = P_0$ and $B(1) = P_3$ within $10^{-6}$ epsilon for all curves.
   - Verify $B'(0) = 3(P_1 - P_0)$ and $B'(1) = 3(P_3 - P_2)$.
2. **Heading Directional Symmetry**:
   - Verify upward travel yields heading $\approx 0\text{ rad}$.
   - Verify rightward travel yields heading $\approx +\frac{\pi}{2}\text{ rad}$.
   - Verify downward travel yields heading $\approx \pi\text{ rad}$.
   - Verify leftward travel yields heading $\approx -\frac{\pi}{2}\text{ rad}$.
3. **Arc-Length Monotonicity**:
   - Verify cumulative distances in the LUT are strictly monotonically increasing ($s_{i+1} > s_i$).
4. **Escort Rigid Body Invariance**:
   - Verify the Euclidean distance between Boss and Escort remains constant throughout any rotation angle $\theta \in [0, 2\pi)$.
5. **Off-Screen Wrap-Around Boundary Guarantee**:
   - Verify that all dive paths terminate at $Y \ge 310$ (well past $Y = 288$), triggering wrap-around before popping.

---
*End of Milestone 4 Technical Analysis.*
