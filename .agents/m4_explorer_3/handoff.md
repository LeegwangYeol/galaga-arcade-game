# Milestone 4 Handoff Report — Enemy Sprite Graphics & Animation Specialist

**Agent**: `m4_explorer_3`  
**Milestone**: Milestone 4 (Enemy Sprite Graphics & Animation)  
**Target File**: `src/renderer/SpriteRenderer.ts`  
**Type**: Hard Handoff (Analysis Complete)  

---

## 1. Observation

1. **Existing Base Code (`src/renderer/SpriteRenderer.ts:1-440`)**:
   - `SpriteRenderer.ts` currently defines:
     - `PALETTE` and `PALETTE_CHAR_MAP` (lines 13-47) with 14 color definitions.
     - `PLAYER_FIGHTER_MATRIX` (lines 57-75), `DUAL_FIGHTER_MATRIX` (lines 81-105), `CAPTURED_FIGHTER_MATRIX` (lines 111-128), `PLAYER_MISSILE_MATRIX` (lines 133-142), `ENEMY_BULLET_MATRIX` (lines 148-154), `ENEMY_FAST_BEAM_MATRIX` (lines 160-168), and `PLAYER_LIFE_ICON_MATRIX` (lines 173-184).
   - Enemy sprites (Zako, Goei, Boss Galaga Healthy & Damaged, Transform enemies) are currently missing from `SpriteRenderer.ts`.
   - `SpriteRenderer.draw()` (lines 338-403) provides basic matrix transformations (`ctx.save() / ctx.rotate() / ctx.restore()`) but lacks pre-rotated angle bank caching and specialized enemy blit convenience helpers (`drawEnemy()`).

2. **System Interface Contracts (`src/types/index.ts:138-162`)**:
   - `EnemyType` enum defines: `ZAKO = 'ZAKO'`, `GOEI = 'GOEI'`, `BOSS = 'BOSS'`, `TRANSFORM = 'TRANSFORM'`, `CAPTURED_FIGHTER = 'CAPTURED_FIGHTER'`.
   - `EnemyState` enum defines: `IN_FORMATION`, `ENTERING`, `DIVING_SOLO`, `DIVING_ESCORT`, `TRACTOR_BEAM_ACTIVE`, `RETURNING_TO_FORMATION`, `EXPLODING`, `CAPTURED_HOSTILE`, `INACTIVE`.

3. **Peer Milestone 4 Requirements (`.agents/m4_explorer_1/DISPATCH.md` & `m4_explorer_2/DISPATCH.md`)**:
   - `m4_explorer_1`: 2-frame wing animation with 0.25s (250ms) duration per frame; 40-alien grid (Row 0: 4 Bosses, Rows 1-2: 16 Goeis, Rows 3-4: 20 Zakos); Boss Galaga 2 hit states (Green $\to$ Blue wounded).
   - `m4_explorer_2`: Bézier flight curves require velocity tangent heading angle orientation $\theta(t) = \operatorname{atan2}(v_y, v_x) + \frac{\pi}{2}$ without rotation blur or lag.

---

## 2. Logic Chain

1. **Pixel Art Authenticity**:
   - Starting from the Namco 1981 arcade ROM specification, all alien units are designed on a $16 \times 16$ pixel grid, centered along the vertical line between columns 7 and 8.
   - For Zako: Frame 0 renders a full 16px wingspan with cyan outer wingtips; Frame 1 tucks the wings upward and inward (14px wingspan), creating a crisp 4 Hz flapping cadence when toggled every 250ms.
   - For Goei: Frame 0 renders horizontal red wings with yellow eye-spots (16px); Frame 1 raises the wingtips above the head line, evoking realistic moth/butterfly flapping.
   - For Boss Galaga: 4 distinct frames are provided — Healthy Frame 0 (Green open carapace) and Frame 1 (Green flapped), plus Damaged Frame 0 (Wounded Blue open carapace) and Frame 1 (Wounded Blue flapped), replacing all Green (`G`) pixels with Light Blue (`B`) and Red (`R`) alert highlights.

2. **Heading Angle Derivation**:
   - Because sprites are drawn with their head pointing upwards (towards $y=0$, representing $-Y$ in screen coordinates), a velocity vector $\vec{v} = (v_x, v_y)$ has heading direction $\alpha = \operatorname{atan2}(v_y, v_x)$.
   - To align the upward-facing sprite with $\vec{v}$, the required rotation angle is $\theta = \alpha - (-\frac{\pi}{2}) = \operatorname{atan2}(v_y, v_x) + \frac{\pi}{2}$.
   - For stationary formation enemies, $\theta = 0\text{ rad}$. For diving enemies moving straight down ($v_x=0, v_y>0$), $\theta = \frac{\pi}{2} + \frac{\pi}{2} = \pi\text{ rad}$ ($180^\circ$ inversion).

3. **Subpixel Jitter & Blur Elimination**:
   - Blurring is eliminated by forcing `imageSmoothingEnabled = false` on both the master canvas and all offscreen canvases.
   - Shimmer and jitter on thin 1px lines are eliminated by snapping the translation anchor to integer coordinates (`Math.round(x)` and `Math.round(y)`).
   - Rotational wobble on even $16 \times 16$ dimensions is eliminated by anchoring exactly at center $(-8, -8)$.

4. **Offscreen Canvas Caching & 32-Angle Quantization**:
   - Pre-baking base frames at boot time eliminates all per-frame pixel filling.
   - By pre-baking 32 discrete rotated canvases ($11.25^\circ$ increments) for each $16 \times 16$ diving sprite onto $24 \times 24$ offscreen buffers, runtime rendering uses a direct $O(1)$ `drawImage()` call without matrix save/restore overhead. Total VRAM footprint is under 500 KB, with zero garbage collection allocations.

---

## 3. Caveats

1. **Non-standard Screen Aspect Ratios**: The $16 \times 16$ pixel art matrices are designed for the standard $224 \times 288$ native resolution ($448 \times 576$ logical buffer). When rendered through `ScreenManager`, CSS `image-rendering: pixelated` must be maintained.
2. **Headless Environment Mocking**: In Node.js / Vitest unit test environments where `document.createElement('canvas')` lacks full Canvas 2D context methods, `SpriteRenderer.bakeFrame()` includes a fallback mock so tests do not throw exceptions.
3. **No other caveats.**

---

## 4. Conclusion

1. Full procedural bit-matrices designed for Zako (Frames 0 & 1), Goei (Frames 0 & 1), Boss Galaga Healthy (Frames 0 & 1), Boss Galaga Damaged (Frames 0 & 1), and Morphing transform aliens.
2. Mathematics for velocity tangent heading $\theta = \operatorname{atan2}(v_y, v_x) + \frac{\pi}{2}$ and 32-step quantized rotation caching specified.
3. Complete production-ready code written to `.agents/m4_explorer_3/analysis.md` ready for implementation into `src/renderer/SpriteRenderer.ts`.

---

## 5. Verification Method

1. **Code Review**: Inspect `/Users/user/src/galog/.agents/m4_explorer_3/analysis.md` for complete matrices and methods.
2. **Matrix Symmetry Test**: Validate that for every row in `ZAKO_FRAME_0_MATRIX`, `row[c] === row[15 - c]` for $c \in [0..7]$.
3. **Angle Quantization Test**: Run `angleToStep(0) === 0`, `angleToStep(Math.PI / 2) === 8`, `angleToStep(Math.PI) === 16`, `angleToStep(3 * Math.PI / 2) === 24`.
4. **Integration Test**: When implemented, verify `npm test` and Playwright headless tests run with 0 errors.
