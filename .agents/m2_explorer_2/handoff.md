# Milestone 2 Handoff Report: Screen Manager & Starfield Specialist

**Agent**: m2_explorer_2 (Milestone 2: Screen Manager & Starfield Specialist)  
**Date**: 2026-09-02  
**Handoff Type**: Hard Handoff (Design & Architectural Specification Complete)  

---

## 1. Observation

1. **Aspect Ratio & Resolution Specification**:
   - `src/types/index.ts` lines 58-79 defines:
     ```typescript
     export interface VirtualResolution {
       readonly width: number;
       readonly height: number;
       readonly aspectRatio: number;
     }
     export interface ViewportTransform {
       scale: number;
       offsetX: number;
       offsetY: number;
       displayWidth: number;
       displayHeight: number;
       virtualWidth: number;
       virtualHeight: number;
     }
     ```
   - `src/main.ts` lines 15-19 defines:
     ```typescript
     export const VIRTUAL_RESOLUTION: VirtualResolution = {
       width: 224,
       height: 288,
       aspectRatio: 224 / 288, // ~0.7778
     };
     ```
   - `tests/unit/viewport.test.ts` lines 22-62 tests `calculateViewportTransform` against 1080p (`1920x1080`), 720p (`1280x720`), and mobile portrait (`375x812`).

2. **Starfield Interface Definition**:
   - `src/types/index.ts` lines 312-321 defines:
     ```typescript
     export interface Star {
       x: number;
       y: number;
       speed: number;
       layer: number;
       color: string;
       brightness: number;
       twinklePhase: number;
       twinkleSpeed: number;
     }
     ```
   - `PROJECT.md` line 99 dictates `src/systems/Starfield.ts` as the 3-layer parallax scrolling twinkling starfield system.

3. **Coordinate Transformation Requirement**:
   - Touch controls, mouse aiming, and canvas alignment require exact mapping from viewport client $(X, Y)$ to internal virtual $(224 \times 288)$ coordinates without displacement or double-offset errors.

---

## 2. Logic Chain

1. **Aspect Ratio Formulation (Observation 1 $\to$ Conclusion)**:
   - For an authentic Galaga arcade feel, the game must render at $224 \times 288$ native resolution ($AR_{\text{target}} = 7/9 \approx 0.7778$).
   - When the window is wider than $AR_{\text{target}}$, Pillarboxing is applied: $H_{\text{display}} = H_{\text{window}}$, $W_{\text{display}} = \lfloor H_{\text{window}} \times AR_{\text{target}} \rfloor$, $O_x = \lfloor(W_{\text{window}} - W_{\text{display}})/2\rfloor$, $O_y = 0$.
   - When the window is narrower than $AR_{\text{target}}$, Letterboxing is applied: $W_{\text{display}} = W_{\text{window}}$, $H_{\text{display}} = \lfloor W_{\text{window}} / AR_{\text{target}} \rfloor$, $O_x = 0$, $O_y = \lfloor(H_{\text{window}} - H_{\text{display}})/2\rfloor$.
   - This exact math guarantees zero stretching across all display aspect ratios.

2. **Client-to-Virtual Coordinate Mapping (Observation 3 $\to$ Conclusion)**:
   - Using `canvas.getBoundingClientRect()` provides the live rendered bounding box $R$.
   - For any client coordinate $(X_{\text{client}}, Y_{\text{client}})$, local coordinates within the canvas are $X_{\text{local}} = X_{\text{client}} - R.\text{left}$ and $Y_{\text{local}} = Y_{\text{client}} - R.\text{top}$.
   - Virtual coordinates are computed as $X_{\text{virtual}} = (X_{\text{local}} / R.\text{width}) \times W_{\text{virtual}}$, $Y_{\text{virtual}} = (Y_{\text{local}} / R.\text{height}) \times H_{\text{virtual}}$.
   - This allows mouse clicks and touch events to seamlessly interact with in-game entities regardless of letterbox/pillarbox margins or CSS scaling.

3. **Parallax Astronomy & Speed States (Observation 2 $\to$ Conclusion)**:
   - Distributing 100 stars across 3 depth layers (40% Layer 0 at 12–16 px/s, 35% Layer 1 at 28–36 px/s, 25% Layer 2 at 55–75 px/s) produces realistic depth perception.
   - Assigning each star an independent sinusoidal phase $\phi(t) = \phi_0 + \omega t$ and depth modulation creates organic twinkling without flicker.
   - Implementing exponential velocity lerp ($k_{\text{lerp}} = 4.5\text{ s}^{-1}$) across `NORMAL` ($1.0\times$), `DIVING` ($2.8\times$), `WARP` ($6.5\times$), and `PAUSED` ($0.0\times$) enables cinematic game state transitions.
   - When in `WARP` mode, rendering foreground stars as vertical streaks $\min(10, \lfloor M \times 1.5 \rfloor)$ accurately simulates hyperspace acceleration.

4. **Zero-Allocation Performance Architecture**:
   - `Starfield` allocates typed arrays (`Uint8Array` for star sizes, `Float32Array` for star twinkle depths) and fixed object pools once at initialization.
   - `update(dt)` and `render(ctx)` operate entirely in-place with zero GC heap allocations per frame, ensuring steady 60 FPS performance.

---

## 3. Caveats

1. **HiDPI / Subpixel Resolution**:
   - The default virtual resolution is $224 \times 288$. If subpixel bullet collision accuracy requires higher internal density, `ScreenManager` supports `bufferScale: 2` ($448 \times 576$), but rendering remains locked to integer pixel snapping to preserve arcade visuals.
2. **Browser Resize Event Throttling**:
   - `window.addEventListener('resize')` uses `requestAnimationFrame` debouncing. In headless unit testing environments (e.g. Vitest/jsdom where RAF or getBoundingClientRect might be mocked), `ScreenManager` includes synchronous `updateScalingImmediate()` and pure static `ScreenManager.calculateTransform()`.
3. **External Audio/Input Dependencies**:
   - `Starfield` speed state transitions can be triggered directly by `Game.ts` or `FormationManager.ts` during stage intros and dive attacks.

---

## 4. Conclusion

The architectural designs and complete TypeScript implementations for `src/core/ScreenManager.ts` and `src/systems/Starfield.ts` are fully specified in `/Users/user/src/galog/.agents/m2_explorer_2/analysis.md`.

Key deliverables:
1. `src/core/ScreenManager.ts`: Complete class supporting Letterbox/Pillarbox calculations, client-to-virtual coordinate mapping, resize observer subscriptions, full-screen toggle, and pixel-art rendering configuration.
2. `src/systems/Starfield.ts`: Complete class supporting 3-layer parallax scrolling (100 stars), multi-palette stellar colors, sinusoidal twinkling, exponential velocity lerp (`NORMAL`, `DIVING`, `WARP`, `PAUSED`), motion-blur streaks, and zero-allocation updates.
3. Vitest test specifications for both units (`tests/unit/ScreenManager.test.ts`, `tests/unit/Starfield.test.ts`).

---

## 5. Verification Method

1. **Unit Testing Commands**:
   - Run Vitest unit tests:
     ```bash
     npm test -- tests/unit/viewport.test.ts
     ```
   - When new unit test files are added:
     ```bash
     npm run test
     ```
2. **Code Inspection**:
   - Review `/Users/user/src/galog/.agents/m2_explorer_2/analysis.md` for full implementation code and mathematical derivations.
3. **Invalidation Conditions**:
   - If `calculateTransform(1920, 1080)` produces display dimensions other than `840 x 1080` (with 540px pillarbox margin).
   - If `clientToVirtual` on canvas midpoint differs from $(112, 144)$.
   - If `Starfield` generates garbage collector allocations during frame updates.
