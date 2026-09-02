# Handoff Report: Milestone 4 Implementation (Enemy Formation, Bézier Flight Curves & AI Diving)

## 1. Observation
- **Code Assets Implemented & Modified**:
  - `src/math/Bezier.ts`: Implements `BezierCurve` (Cubic Bézier), `QuadraticBezier`, `CompositeBezierPath`, analytical derivative calculations, normalized tangent headings with sprite orientation offsets ($\theta = \operatorname{atan2}(v_y, v_x) + \frac{\pi}{2}$), 32-interval cumulative chord length LUT precomputations, and inverse arc-length queries (`distanceToT`) for pixel-perfect constant speed traversal.
  - `src/entities/Enemy.ts`: Implements 3-tier hierarchy (`ZAKO`, `GOEI`, `BOSS`), Captured Fighter, and Morph sub-boss entities. Features 7-state finite-state machine (`IN_FORMATION`, `ENTERING`, `DIVING_SOLO`, `DIVING_ESCORT`, `TRACTOR_BEAM_ACTIVE`, `RETURNING_TO_FORMATION`, `EXPLODING`, `INACTIVE`), authentic 2-hit Boss Galaga mechanics (Green healthy $\to$ Navy Blue damaged on Hit 1 $\to$ Destroyed on Hit 2), 4Hz wing fluttering ($0.25\text{s}$ per frame), dynamic point matrix (Zako 50/100, Goei 80/160, Boss 150/400/800/1600), zero-allocation object pooling reuse (`init`, `reset`), and aimed bullet firing.
  - `src/systems/FormationManager.ts`: Implements authentic 40-alien grid formation across 5 rows (Row 0: 4 Bosses; Rows 1-2: 16 Goeis; Rows 3-4: 20 Zakos). Computes harmonic breathing expansion ($\pm 18\%$ at $0.5\text{ Hz}$), horizontal sway ($\pm 12\text{px}$ at $0.333\text{ Hz}$), and vertical row waves. Orchestrates 5 entry sub-waves and periodic dive attack peeling scheduler (Solo Zako, Paired Goei crossfire, Boss Galaga escort).
  - `src/systems/FlightPathManager.ts`: Implements 5 canonical formation entry sub-waves (Top Center, Top Right, Top Left, Bottom Left, Bottom Right) with dynamic $C^1$ target-slot anchoring, solo dive swoops, paired Goei figure-8 corkscrew dives, Boss escorted dive formations, and bottom-of-screen wrap-around return splines.
  - `src/renderer/SpriteRenderer.ts`: Pre-bakes 16x16 procedural pixel matrices for Zako (Frames 0 & 1), Goei (Frames 0 & 1), Boss Healthy (Frames 0 & 1), Boss Damaged (Frames 0 & 1), Scorpion (Frames 0 & 1), Bosconian Flagship, and Galaxian Flagship. Provides smooth rotated blitting with subpixel snapping and $O(1)$ fast-path blitting.
  - `src/core/Game.ts`: Integrates `FormationManager`, bullet-enemy swept AABB collision detection and resolution, score updates, high score LocalStorage persistence, stage transitions, and full scene rendering.
  - `tests/unit/enemy.test.ts`: 36 unit tests covering all mathematical formulas, state machine transitions, scoring points, slot layouts, breathing motions, dive trajectories, and collision resolutions.
- **Verification Outputs**:
  - `npm run typecheck`: 0 errors.
  - `npm run build`: Vite 6 production build succeeded (`dist/index.html` 5.36 kB, `dist/assets/index-CHwJAzMr.js` 90.18 kB).
  - `npm test`: 11 test files passed, 250 tests passed (100% pass rate).

## 2. Logic Chain
1. **Mathematical Accuracy & Constant-Speed Trajectories**:
   - In 2D canvas coordinates ($+X$ right, $+Y$ down), standard parametric evaluation $B(t)$ without speed mapping results in acceleration on wide arcs and deceleration on tight loops.
   - Pre-baking a 32-sample cumulative chord LUT enables $O(\log N)$ binary-searched inverse distance mapping $t(d)$ so that $d = V \cdot t_{\text{elapsed}}$ produces constant linear velocity.
   - Adding orientation offset $\frac{\pi}{2}$ directly translates mathematical derivative direction $\operatorname{atan2}(v_y, v_x)$ into Galaga's upright sprite coordinate system ($0\text{ rad} = \text{facing UP / } -Y$).
2. **Dynamic Slot-Anchoring & Breathing Grid**:
   - The formation grid breathes harmonically: $x_{\text{slot}}(r, c, t) = 112 + \text{Sway}(t) + (c - 4.5) \cdot 16 \cdot \text{Expansion}(t)$.
   - To eliminate visual popping when entering aliens land in formation, `FlightPathManager` anchors the final Bézier approach control points $P_2(t), P_3(t)$ to the dynamic moving slot position at scheduled touchdown time.
3. **Hierarchy, Hit Points & Scoring Integrity**:
   - Boss Galaga has $2\text{ HP}$. Hit 1 reduces health to 1, sets damage flash, and switches rendering to `BOSS_DAMAGED` palette without awarding score. Hit 2 destroys the boss and awards points based on whether it is in formation (150) or diving (400 solo / 800 with 1 escort / 1600 with 2 escorts).
   - All enemies integrate with `ObjectPool<Enemy>` lifecycle methods `init()` and `reset()`.
4. **Collision & Game Integration**:
   - `Game.ts` resolves collisions between active player missiles and living enemies using continuous swept AABB bounds, recycling bullets and applying damage.
   - Enemy projectiles and kamikaze collisions test against player hitboxes when the player is not invulnerable.

## 3. Caveats
- Boss Galaga tractor beam capture and rescue mechanics (F9) will be fully developed in Milestone 5; Milestone 4 establishes the `TRACTOR_BEAM_ACTIVE` enemy state, tractor beam sprite palette compatibility, and escort count scoring rules.
- Web Audio procedural sound effects (F10) for alien dive warbles and laser chirps will be connected in Milestone 6.

## 4. Conclusion
- Milestone 4 implementation is completely finished, production-ready, and strictly compliant with all requirements in `PROJECT.md` and `DISPATCH.md`.
- All 250 unit tests across 11 test suites pass with 0 errors. Build output is verified.

## 5. Verification Method
- Execute:
  ```bash
  npm run typecheck
  npm run build
  npm test
  ```
- Inspect:
  - `src/math/Bezier.ts`
  - `src/entities/Enemy.ts`
  - `src/systems/FormationManager.ts`
  - `src/systems/FlightPathManager.ts`
  - `src/renderer/SpriteRenderer.ts`
  - `src/core/Game.ts`
  - `tests/unit/enemy.test.ts`
