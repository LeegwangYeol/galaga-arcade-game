# Milestone 4 Handoff Report: Enemy Hierarchy & Formation Grid Design

## 1. Observation

- **Virtual Coordinate Standard**: `PROJECT.md` line 4, `src/core/Game.ts` lines 20-21, `src/core/ScreenManager.ts` lines 21-22, and `src/entities/Player.ts` line 62 establish the virtual screen standard as $224 \times 288\text{ px}$ with player baseline at $Y = 250\text{ px}$.
- **Formation Grid Capacity**: `.agents/survey_explorer_1/analysis.md` lines 39-47 and `src/types/index.ts` lines 138-176 specify exactly 40 enemies in 5 rows (Row 0: 4 Bosses, Rows 1-2: 16 Goeis, Rows 3-4: 20 Zakos).
- **Enemy States & Types**: `src/types/index.ts` lines 141-162 define `EnemyType` (`ZAKO`, `GOEI`, `BOSS`, `TRANSFORM`, `CAPTURED_FIGHTER`) and `EnemyState` (`IN_FORMATION`, `ENTERING`, `DIVING_SOLO`, `DIVING_ESCORT`, `TRACTOR_BEAM_ACTIVE`, `RETURNING_TO_FORMATION`, `EXPLODING`, `CAPTURED_HOSTILE`, `INACTIVE`).
- **ObjectPool & Pooling Interface**: `src/core/ObjectPool.ts` lines 25-218 and `src/types/index.ts` lines 403-406 define `Poolable` interface with `active: boolean` and `reset(): void`.
- **Procedural Sprite Renderer**: `src/renderer/SpriteRenderer.ts` lines 13-48 define the arcade color palette (`WHITE`, `RED`, `RED_DARK`, `BLUE_LIGHT`, `BLUE_CYAN`, `BLUE_NAVY`, `YELLOW`, `ORANGE`, `GREEN`, `PINK_MAGENTA`, `GREY_LIGHT`, `GREY_DARK`, `PURPLE`) and pre-bakes 16x16 pixel bit-matrices onto offscreen canvases.
- **Test Baseline**: Executing `npm test` verified 10 test files and 214 tests passing across the codebase.

## 2. Logic Chain

1. **State Machine Design**: Based on observation of `EnemyType` and `EnemyState`, `Enemy.ts` must implement 7 operational states (`entering`, `formation`, `diving`, `tractor_beam`, `captured_escort`, `destroyed`, `inactive`).
2. **Hit Points & Visuals**: Zako and Goei have 1 HP. Boss Galaga has 2 HP. On Hit 1, Boss Galaga's health decreases from 2 to 1 and changes sprite from `BOSS_GREEN` to `BOSS_BLUE` (Navy blue) with a $0.08\text{s}$ damage flash. Hit 2 reduces health to 0 and triggers explosion.
3. **Scoring Logic**:
   - Zako: 50 in formation, 100 diving.
   - Goei: 80 in formation, 160 diving.
   - Boss Galaga: 150 in formation, 400 diving solo, 800 diving with 1 escort, 1600 diving with 2 escorts.
   - Captured Fighter: 1000 points.
4. **Wing Animation**: Using an accumulator timer `animTimer` modulo $0.25\text{s}$ provides authentic $4\text{ Hz}$ wing flutter across Frame 0 and Frame 1.
5. **Grid Math & Oscillations**:
   - Centerline $X_0 = 112\text{ px}$, top margin $Y_0 = 52\text{ px}$, $\Delta X = 16\text{ px}$, $\Delta Y = 16\text{ px}$.
   - Horizontal sway $X_{\text{sway}}(t) = 12 \sin(2\pi \cdot 0.333 \cdot t)$ translates the formation by $\pm 12\text{ px}$.
   - Radial expansion $E(t) = 1.0 + 0.18 \sin(2\pi \cdot 0.500 \cdot t)$ stretches column spacing by $\pm 18\%$.
   - Vertical accordion wave $Y_{\text{wave}}(r, t) = 2 \sin(2\pi \cdot 0.500 \cdot t + r \cdot 0.4)$.
6. **Dive Scheduling**:
   - Periodic timer ($1.6\text{s}\text{--}3.5\text{s}$ based on stage) selects 1 to 3 concurrent divers with weighted probabilities: 40% Zako solo, 35% Goei pair, 25% Boss escort dive.
   - When diving enemies pass the bottom of screen ($Y > 304\text{ px}$), they wrap around to $Y = -16\text{ px}$ and fly down back to their home slots.
   - When all 40 enemies are destroyed, `STAGE_CLEAR` callback is fired.

## 3. Caveats

- Tractor beam player capture animation mechanics and tractor beam cone geometry are fully outlined here for state transitions, but complete beam particle raycasting and player docking will be integrated in Milestone 5 (`TractorBeam.ts`).
- Bézier entry swoop flight splines (5 sub-waves) will be coordinated with `FlightPathManager.ts`.

## 4. Conclusion

The designs and production-ready source code for `src/entities/Enemy.ts` and `src/systems/FormationManager.ts`, along with complete procedural sprite bit-matrices for `SpriteRenderer.ts`, are complete and documented in `/Users/user/src/galog/.agents/m4_explorer_1/analysis.md`. The implementer can directly integrate these classes and run the unit test suite.

## 5. Verification Method

To independently verify the implementation:
1. Inspect design analysis file:
   ```bash
   cat /Users/user/src/galog/.agents/m4_explorer_1/analysis.md
   ```
2. Verify all current unit tests pass:
   ```bash
   npm test
   ```
3. Once implemented, run Vitest on the new enemy and formation test suite:
   ```bash
   npx vitest run tests/unit/enemy_formation.test.ts
   ```
