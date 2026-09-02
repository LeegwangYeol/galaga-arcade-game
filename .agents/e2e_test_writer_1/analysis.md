# Unit & Math Test Specification & Mathematical Derivations
**Agent**: `e2e_test_writer_1` (E2E Testing Track: Unit & Math Test Architect)  
**Date**: 2026-09-02  
**Target Suites**:
- `tests/unit/math.test.ts` (Vector2D, Bézier Curves, Collision Algorithms)
- `tests/unit/state.test.ts` (Game State Machine & Stage Sequencing)
- `tests/unit/score.test.ts` (Score Matrix, Extra Life Thresholds, LocalStorage Persistence)

---

## 1. Executive Summary & Test Philosophy

The Galaga Arcade Game unit test architecture enforces deterministic, opaque-box validation of core mathematical primitives, game state transitions, scoring mechanics, and persistence layers.

### Test Design Principles
1. **Authoritative Ground Truth**: All expected values for vector operations, Bézier interpolation polynomials, collision intersections, arcade point values, and life thresholds are derived from analytical mathematics and authentic Namco Galaga (1981) arcade specifications.
2. **Deterministic & Isolated**: Every test runs in memory without shared global state, resetting mock timers and storage before each test.
3. **Adversarial & Fault-Tolerant Coverage**:
   - Zero-length vectors and normalization singularities ($\| \mathbf{v} \| = 0$).
   - Bézier parameter clamp boundaries ($t < 0, t > 1$) and zero-derivative cusps.
   - Touching boundary collisions (distance $= r_1 + r_2$, AABB edges coincident).
   - LocalStorage corruption (malformed JSON, `"NaN"`, negative values, quota exceptions).
   - Massive score leaps crossing multiple extra-life milestones in a single event.

---

## 2. Mathematical Derivations & Ground Truth Specifications

### 2.1 Vector2D Algebra
Let $\mathbf{u} = (u_x, u_y)$, $\mathbf{v} = (v_x, v_y) \in \mathbb{R}^2$ and scalar $s \in \mathbb{R}$.

1. **Addition**: $\mathbf{u} + \mathbf{v} = (u_x + v_x, u_y + v_y)$
2. **Subtraction**: $\mathbf{u} - \mathbf{v} = (u_x - v_x, u_y - v_y)$
3. **Scalar Multiplication**: $s\mathbf{u} = (s \cdot u_x, s \cdot u_y)$
4. **Dot Product**: $\mathbf{u} \cdot \mathbf{v} = u_x v_x + u_y v_y$
5. **Euclidean Length**: $\| \mathbf{u} \| = \sqrt{u_x^2 + u_y^2}$
6. **Squared Length**: $\| \mathbf{u} \|^2 = u_x^2 + u_y^2$
7. **Distance**: $d(\mathbf{u}, \mathbf{v}) = \| \mathbf{u} - \mathbf{v} \| = \sqrt{(u_x - v_x)^2 + (u_y - v_y)^2}$
8. **Normalization**:
   $$\hat{\mathbf{u}} = \begin{cases} \left(\frac{u_x}{\| \mathbf{u} \|}, \frac{u_y}{\| \mathbf{u} \|}\right) & \text{if } \| \mathbf{u} \| > 0 \\ (0, 0) & \text{if } \| \mathbf{u} \| = 0 \end{cases}$$
9. **Linear Interpolation (Lerp)**:
   $$\text{lerp}(\mathbf{u}, \mathbf{v}, t) = (1 - t)\mathbf{u} + t\mathbf{v} = \mathbf{u} + t(\mathbf{v} - \mathbf{u})$$
   - Boundary checks: $\text{lerp}(\mathbf{u}, \mathbf{v}, 0) = \mathbf{u}$, $\text{lerp}(\mathbf{u}, \mathbf{v}, 1) = \mathbf{v}$, $\text{lerp}(\mathbf{u}, \mathbf{v}, 0.5) = \frac{\mathbf{u} + \mathbf{v}}{2}$.

### 2.2 Cubic Bézier Spline Evaluator & Tangent Angles
Given 4 control points $P_0, P_1, P_2, P_3 \in \mathbb{R}^2$:

1. **Cubic Bézier Formula**:
   $$B(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t) t^2 P_2 + t^3 P_3, \quad t \in [0, 1]$$
   - Boundary properties:
     $$B(0) = P_0, \quad B(1) = P_3$$
   - Midpoint $t = 0.5$:
     $$B(0.5) = \frac{1}{8} P_0 + \frac{3}{8} P_1 + \frac{3}{8} P_2 + \frac{1}{8} P_3 = \frac{P_0 + 3P_1 + 3P_2 + P_3}{8}$$

2. **First Derivative (Velocity / Tangent Vector)**:
   $$B'(t) = 3(1-t)^2 (P_1 - P_0) + 6(1-t)t (P_2 - P_1) + 3t^2 (P_3 - P_2)$$
   - At $t = 0$: $B'(0) = 3(P_1 - P_0)$
   - At $t = 1$: $B'(1) = 3(P_3 - P_2)$

3. **Heading Angle (Orientation)**:
   $$\theta(t) = \operatorname{atan2}\left(B'_y(t), B'_x(t)\right)$$
   - Controls sprite rotation along trajectory: $\theta = 0$ corresponds to vector $(1, 0)$ (rightward), $\theta = \pi/2$ corresponds to $(0, 1)$ (downward).

4. **Quadratic Bézier Formula** (for short arcs / dives):
   $$Q(t) = (1-t)^2 P_0 + 2(1-t)t P_1 + t^2 P_2$$
   $$Q'(t) = 2(1-t)(P_1 - P_0) + 2t(P_2 - P_1)$$

### 2.3 Collision Detection Algorithms

1. **Circle vs Circle**:
   Given Circle $A = (x_A, y_A, r_A)$ and Circle $B = (x_B, y_B, r_B)$:
   $$\text{overlap} \iff (x_B - x_A)^2 + (y_B - y_A)^2 \le (r_A + r_B)^2$$
   - Avoids $\sqrt{\cdot}$ computation for high-frequency collision loops.
   - Exact tangent contact (distance equal to $r_A + r_B$) counts as collision (`true`).

2. **Axis-Aligned Bounding Box (AABB) vs AABB**:
   Given Box $A = (x_A, y_A, w_A, h_A)$ and Box $B = (x_B, y_B, w_B, h_B)$ where $(x, y)$ is top-left:
   $$\text{overlap} \iff x_A < x_B + w_B \land x_A + w_A > x_B \land y_A < y_B + h_B \land y_A + h_A > y_B$$
   - Touching edges without overlap ($x_A + w_A = x_B$) returns `false` (disjoint open intervals).

3. **Point vs AABB / Circle**:
   $$\text{pointInAABB}(P, \text{Box}) \iff P_x \ge x \land P_x \le x + w \land P_y \ge y \land P_y \le y + h$$
   $$\text{pointInCircle}(P, \text{Circle}) \iff (P_x - x)^2 + (P_y - y)^2 \le r^2$$

---

## 3. Game State Machine & Stage Progression

### 3.1 State Graph & Transitions
```
                [BOOT]
                   │
                   ▼
               [TITLE] ◄──────────────┐
                   │ (Start Key)      │
                   ▼                  │ (Game Over Timeout
             [STAGE_INTRO]            │  or Restart)
                   │ (Timer ~2.5s)    │
         ┌─────────┴─────────┐        │
         │ isChallenging     │ normal │
         ▼                   ▼        │
[CHALLENGING_STAGE]      [PLAYING] ───┼──► [PAUSED]
         │ (Timer/Clear)     │        │      │ (Unpause)
         │                   │ (Clear)│ ◄────┘
         └─────────┬─────────┘        │
                   ▼                  │
             [STAGE_CLEAR]            │
                   │ (Next Wave)      │
                   ▼                  │
             [STAGE_INTRO]            │
                                      │
           (Lives == 0)               │
             [PLAYING] ───────────────┴──► [GAME_OVER]
```

### 3.2 Stage Counter & Challenging Stage Rule
Galaga features special Challenging Stages at predictable intervals:
- **First Challenging Stage**: Stage 3
- **Subsequent Challenging Stages**: Every 4 stages thereafter (Stage 7, 11, 15, 19, 23, 27, 31, ...)
- **Mathematical Condition**:
  $$\text{isChallengingStage}(S) \iff S \ge 3 \land (S \bmod 4 == 3)$$

| Stage Number $S$ | Stage Type | $S \bmod 4$ | Challenging Stage? |
|---|---|---|:---:|
| 1 | Normal Dogfight | 1 | No |
| 2 | Normal Dogfight | 2 | No |
| **3** | **Challenging Stage 1** | **3** | **YES** |
| 4 | Normal Dogfight | 0 | No |
| 5 | Normal Dogfight | 1 | No |
| 6 | Normal Dogfight | 2 | No |
| **7** | **Challenging Stage 2** | **3** | **YES** |
| 8 | Normal Dogfight | 0 | No |
| 9 | Normal Dogfight | 1 | No |
| 10 | Normal Dogfight | 2 | No |
| **11** | **Challenging Stage 3** | **3** | **YES** |
| 12 | Normal Dogfight | 0 | No |

---

## 4. Scoring, Extra Lives & LocalStorage Specifications

### 4.1 Authentic Galaga Score Matrix
| Alien / Event | State / Condition | Point Value |
|---|---|---|
| **Zako (Bee)** | In Formation Grid | 50 pts |
| **Zako (Bee)** | In Diving Attack | 100 pts |
| **Goei (Butterfly)** | In Formation Grid | 80 pts |
| **Goei (Butterfly)** | In Diving Attack | 160 pts |
| **Boss Galaga** | In Formation Grid | 150 pts |
| **Boss Galaga** | In Diving Attack (Solo, 0 Escorts) | 400 pts |
| **Boss Galaga** | In Diving Attack (with 1 Escort) | 800 pts |
| **Boss Galaga** | In Diving Attack (with 2 Escorts) | 1,600 pts |
| **Captured Fighter** | Destroyed while Boss in formation | 500 pts |
| **Captured Fighter** | Rescued while Boss is diving | 1,000 pts (triggers Dual Fighter) |
| **Challenging Stage** | Partial hits ($N < 40$) | $N \times 100$ pts |
| **Challenging Stage** | Perfect 40/40 hits | 10,000 pts (SPECIAL BONUS) |

### 4.2 Extra Life Threshold Recurrence
- Default starting lives: 3 (1 active ship + 2 reserve badges).
- **1st Extra Life**: At $20,000\text{ pts}$.
- **2nd Extra Life**: At $70,000\text{ pts}$.
- **$k$-th Extra Life** ($k \ge 3$): At $70,000 + (k - 2) \times 70,000\text{ pts}$ ($140\text{k}, 210\text{k}, 280\text{k}, \dots$).

**Multi-Threshold Crossing In Single Score Event**:
If score jumps from $15,000$ to $85,000$ (e.g. from bonus + boss kill), player crosses BOTH $20,000$ and $70,000$ thresholds $\implies +2$ extra lives awarded.

### 4.3 LocalStorage Persistence & Fault-Tolerant Fallback
1. **Key**: `galaga_high_score`
2. **Default High Score**: `20000` (or `30000`)
3. **Save Rule**: Whenever `currentScore > highScore`, `highScore = currentScore` and `localStorage.setItem('galaga_high_score', String(highScore))`.
4. **Load Recovery**:
   - Valid integer string `"54200"` $\to 54,200$.
   - Malformed/corrupted string `"null"`, `"NaN"`, `"-500"`, `"abc"`, `"{foo: 1}"` $\to$ safely resets to default `20000`.
   - Security / Private Window exception on `localStorage.getItem` / `setItem` $\to$ catch exception, fall back to in-memory store without crashing game loop.

---

## 5. Comprehensive Unit Test Case Inventory

### Suite 1: `tests/unit/math.test.ts`
- **Vector2D Operations**:
  - `Vector2D.add(v1, v2)` and `v1.add(v2)`: positive, negative, float vectors.
  - `Vector2D.subtract(v1, v2)` and `v1.sub(v2)`.
  - `Vector2D.scale(v, s)` and `v.scale(s)`.
  - `v.length()` and `v.lengthSquared()` (3-4-5 triangle $\implies 5$, $5^2=25$).
  - `v.distance(v2)` and `Vector2D.distance(v1, v2)`.
  - `v.normalize()`: converts $(3, 4) \to (0.6, 0.8)$, $\| \hat{\mathbf{v}} \| = 1.0$.
  - **Zero-vector normalization**: $(0, 0) \to (0, 0)$ without `NaN` or `Infinity`.
  - `v.dot(v2)`: orthogonal vectors $(1, 0) \cdot (0, 1) = 0$; parallel $(2, 0) \cdot (3, 0) = 6$.
  - `Vector2D.lerp(v1, v2, t)`: at $t=0$, $t=1$, $t=0.5$, $t=0.25$.
  - `v.clone()`, `v.copy(v2)`, `v.set(x, y)`.

- **Bézier Curves (`BezierCurve` / `CubicBezier`)**:
  - Boundary: $B(0) = P_0$, $B(1) = P_3$.
  - Midpoint interpolation: $P_0=(0,0), P_1=(0,100), P_2=(100,100), P_3=(100,0) \implies B(0.5) = (50, 75)$.
  - Tangent vector calculation: $B'(0) = 3(P_1 - P_0)$, $B'(1) = 3(P_3 - P_2)$.
  - Heading angle: horizontal flight $(1, 0) \implies \theta = 0$, downward dive $(0, 1) \implies \theta = \pi/2$ (or $90^\circ$).
  - Clamping outside $[0, 1]$: $t = -0.5 \implies P_0$, $t = 1.5 \implies P_3$.
  - Quadratic Bézier evaluation & derivative.

- **Collision Detection**:
  - `checkAABB`:
    - Overlapping rectangles.
    - Non-overlapping rectangles (separated on X, separated on Y, diagonal).
    - Contained rectangle (one inside another).
    - Edge-touching (abutting without overlap) $\implies$ returns `false`.
  - `checkCircle`:
    - Overlapping circles ($d < r_1 + r_2$).
    - Concentric circles ($d = 0$).
    - Tangent touching circles ($d = r_1 + r_2$) $\implies$ returns `true`.
    - Separated circles ($d > r_1 + r_2$) $\implies$ returns `false`.
  - `pointInAABB` and `pointInCircle`:
    - Center point, boundary points, outside points.
  - `checkCircleAABB`:
    - Circle intersecting box side, corner, contained inside, completely outside.

### Suite 2: `tests/unit/state.test.ts`
- **Game State Machine**:
  - Initial state is `TITLE` (or `BOOT`).
  - Transitions:
    - `TITLE` $\to$ `STAGE_INTRO` on `startGame()`.
    - `STAGE_INTRO` $\to$ `PLAYING` for normal stage (e.g. Stage 1, Stage 2).
    - `STAGE_INTRO` $\to$ `CHALLENGING_STAGE` for Stage 3, 7, 11...
    - `PLAYING` $\to$ `STAGE_CLEAR` when wave cleared.
    - `STAGE_CLEAR` $\to$ `STAGE_INTRO` with incremented stage counter.
    - `PLAYING` $\to$ `GAME_OVER` when player lives reach 0.
    - `PLAYING` $\to$ `PAUSED` $\to$ `PLAYING` on pause/resume toggle.
    - `GAME_OVER` $\to$ `TITLE` on restart.
  - Guard conditions: cannot transition directly from `TITLE` to `STAGE_CLEAR` or `CHALLENGING_STAGE` without going through intro.
- **Stage Progression & Challenging Frequency**:
  - Stages 1 to 20 evaluated against `isChallengingStage(stage)`:
    - Stage 3: true
    - Stage 7: true
    - Stage 11: true
    - Stage 15: true
    - Stage 19: true
    - Stages 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 18, 20: false.
  - Stage wrapping / high stage counters ($S = 99$, $S = 255$).

### Suite 3: `tests/unit/score.test.ts`
- **Enemy Scoring**:
  - Zako: in formation = 50, diving = 100.
  - Goei: in formation = 80, diving = 160.
  - Boss Galaga: in formation = 150, solo diving = 400, diving with 1 escort = 800, diving with 2 escorts = 1600.
  - Rescuing captured fighter: diving = 1000, formation = 500.
  - Challenging stage bonus: 40 hits = 10,000, 39 hits = 3,900, 0 hits = 0.
- **Extra Life Logic**:
  - Starting with 3 lives at 0 score.
  - Reaching 19,990 pts $\implies 3$ lives.
  - Reaching 20,000 pts $\implies 4$ lives (1st extra life).
  - Reaching 69,990 pts $\implies 4$ lives.
  - Reaching 70,000 pts $\implies 5$ lives (2nd extra life).
  - Reaching 140,000 pts $\implies 6$ lives (3rd extra life).
  - Reaching 210,000 pts $\implies 7$ lives (4th extra life).
  - Jump from 10,000 directly to 150,000 pts $\implies$ awards 3 extra lives (crosses 20k, 70k, 140k).
  - Reset score resets extra life thresholds tracking.
- **LocalStorage Persistence**:
  - Sets and gets high score.
  - Updating score above high score writes to LocalStorage.
  - Updating score below high score does not mutate high score.
  - Corrupted storage recovery:
    - LocalStorage holds `"invalid_json"` $\implies$ high score defaults to 20,000.
    - LocalStorage holds `"-100"` $\implies$ high score clamped/reset to 20,000.
    - LocalStorage throws error (e.g. `SecurityError` or `QuotaExceededError`) $\implies$ gracefully handled without unhandled exception.
