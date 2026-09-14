# Milestone 11 Fix 2 Forensic Investigation Report

**Agent**: `m11_fix2_explorer_2`  
**Role**: Explorer (Read-Only Investigation & Synthesis)  
**Date**: 2026-09-04T01:56:00+09:00  
**Target Repository**: `/Users/user/src/galog`  
**Status**: Investigation Complete  

---

## 1. Executive Summary

During the previous Milestone 11 remediation cycle, adversarial challenger `m11_rem_challenger_1` issued a **REJECT** verdict due to an unhandled runtime crash during headless canvas rendering:
```
TypeError: ctx.quadraticCurveTo is not a function
    at ThePrethorynScourgeEvent.render (src/core/crisis/events/ThePrethorynScourgeEvent.ts:153:9)
    at CrisisEventManager.render (src/core/crisis/CrisisEventManager.ts:197:26)
    at Game.renderPlayingScreen (src/core/Game.ts:1018:29)
    at Game.render (src/core/Game.ts:974:14)
```

This investigation conducted a comprehensive, read-only forensic analysis across the entire codebase to:
1. Identify the root cause in `src/core/Game.ts` lines 150–210.
2. Perform an exhaustive regex search for all `ctx.*` methods and properties in `src/` to uncover every missing property in the fallback mock context.
3. Analyze upcoming milestone architecture (M12 Multi-Phase Bosses, M13 Allies & Special Moves, M14 Procedural Audio & VFX) to anticipate all Canvas 2D primitives required to prevent future headless render crashes.
4. Empirically verify pool capacity clamping and zero-GC guarantees in `src/core/powerups/PowerUpManager.ts`.
5. Deliver production-ready code recommendations and an exact unified diff for `src/core/Game.ts`.

---

## 2. Examination of `src/core/Game.ts` (Lines 150–210) Headless Canvas Mock

### 2.1 Current Implementation State
In `src/core/Game.ts` lines 158–199, the engine handles headless environments (such as Vitest or Node where `HTMLCanvasElement.prototype.getContext` returns `null` or is stubbed) by creating a fallback mock `CanvasRenderingContext2D`:

```typescript
    if (!ctx) {
      // Mock 2D context fallback for test environments
      this.ctx = {
        canvas: this.canvas,
        fillStyle: '#000000',
        strokeStyle: '#FFFFFF',
        font: '8px monospace',
        textAlign: 'center',
        textBaseline: 'middle',
        globalAlpha: 1.0,
        lineWidth: 1,
        shadowBlur: 0,
        shadowColor: '#000000',
        imageSmoothingEnabled: false,
        fillRect: () => {},
        fillText: () => {},
        strokeRect: () => {},
        clearRect: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        fill: () => {},
        ellipse: () => {},
        save: () => {},
        restore: () => {},
        drawImage: () => {},
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        arc: () => {},
        stroke: () => {},
        setLineDash: () => {},
        getLineDash: () => [],
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        measureText: () => ({ width: 0 }),
      } as unknown as CanvasRenderingContext2D;
    } else {
      this.ctx = ctx;
      this.ctx.imageSmoothingEnabled = false;
    }
```

### 2.2 Root Cause Analysis
Although `m11_rem_worker/DISPATCH.md` line 34 instructed the remediation worker to add `quadraticCurveTo: () => {}`, the worker omitted it from the object literal. 

When `ThePrethorynScourgeEvent.ts` renders organic cosmic tendrils at lines 151–156:
```typescript
ctx.beginPath();
ctx.moveTo(0, 0);
ctx.quadraticCurveTo(8, 144, 0, 288);
ctx.moveTo(224, 0);
ctx.quadraticCurveTo(216, 144, 224, 288);
ctx.stroke();
```
Calling `game.render()` when `ThePrethorynScourgeEvent` is active triggers `TypeError: ctx.quadraticCurveTo is not a function`.

---

## 3. Exhaustive Regex Audit of `\bctx\.[a-zA-Z0-9_]+\b` in `src/`

An exhaustive AST and regex scan across all 45 TypeScript source files in `src/` identified 30 distinct properties/methods accessed on `CanvasRenderingContext2D`:

| # | Canvas Context Property / Method | Files Utilizing in `src/` | Present in Current `Game.ts` Mock? | Status |
|---|---|---|---|---|
| 1 | `arc` | 8 files (`NaniteCloudEvent`, `TheContingencyEvent`, `ThePrethorynScourgeEvent`, `Enemy`, `ParticleSystem`, etc.) | YES | OK |
| 2 | `beginPath` | 12 files (`HyperspaceStormEvent`, `PhysicsInversionEvent`, `Enemy`, `TractorBeam`, `SpriteRenderer`, etc.) | YES | OK |
| 3 | `closePath` | 3 files (`ShieldOverloadEvent`, `TractorBeam`, `SpriteRenderer`) | YES | OK |
| 4 | `createLinearGradient` | 1 file (`TractorBeam`) | YES | OK |
| 5 | `createRadialGradient` | 1 file (`TheUnbiddenEvent`) | YES | OK |
| 6 | `drawImage` | 2 files (`SpriteRenderer`, `HUD`) | YES | OK |
| 7 | `ellipse` | 1 file (`NaniteCloudEvent`) | YES | OK |
| 8 | `fill` | 5 files (`NaniteCloudEvent`, `TheUnbiddenEvent`, `Enemy`, `TractorBeam`, `ParticleSystem`) | YES | OK |
| 9 | `fillRect` | 18 files (`CrisisEventManager`, `DevouringSwarmFrenzyEvent`, `HyperspaceStormEvent`, `Screens`, etc.) | YES | OK |
| 10 | `fillStyle` | 20 files (`CrisisEventManager`, `Screens`, `HUD`, etc.) | YES | OK |
| 11 | `fillText` | 4 files (`CrisisEventManager`, `PhysicsInversionEvent`, `Screens`, `main.ts`) | YES | OK |
| 12 | `font` | 3 files (`CrisisEventManager`, `Screens`, `main.ts`) | YES | OK |
| 13 | `globalAlpha` | 6 files (`NaniteCloudEvent`, `PsionicResonanceEvent`, `TractorBeam`, `ParticleSystem`, etc.) | YES | OK |
| 14 | `imageSmoothingEnabled` | 5 files (`Game.ts`, `ScreenManager.ts`, `SpriteRenderer.ts`) | YES | OK |
| 15 | `lineTo` | 6 files (`HyperspaceStormEvent`, `PhysicsInversionEvent`, `ShieldOverloadEvent`, `TractorBeam`, `SpriteRenderer`) | YES | OK |
| 16 | `lineWidth` | 13 files (`CrisisEventManager`, `HyperspaceStormEvent`, `PhysicsInversionEvent`, `SpriteRenderer`, etc.) | YES | OK |
| 17 | `moveTo` | 7 files (`HyperspaceStormEvent`, `PhysicsInversionEvent`, `ThePrethorynScourgeEvent`, `TractorBeam`, `SpriteRenderer`) | YES | OK |
| 18 | **`quadraticCurveTo`** | **1 file (`src/core/crisis/events/ThePrethorynScourgeEvent.ts:153, 155`)** | **NO (MISSING)** | **CRITICAL DEFECT** |
| 19 | `restore` | 18 files (`CrisisEventManager`, `ParticleSystem`, `SpriteRenderer`, etc.) | YES | OK |
| 20 | `rotate` | 2 files (`ParticleSystem`, `SpriteRenderer`) | YES | OK |
| 21 | `save` | 18 files (`CrisisEventManager`, `ParticleSystem`, `SpriteRenderer`, etc.) | YES | OK |
| 22 | `scale` | 1 file (`SpriteRenderer`) | YES | OK |
| 23 | `shadowBlur` | 1 file (`SpriteRenderer`) | YES | OK |
| 24 | `shadowColor` | 1 file (`SpriteRenderer`) | YES | OK |
| 25 | `stroke` | 10 files (`HyperspaceStormEvent`, `PhysicsInversionEvent`, `ThePrethorynScourgeEvent`, `ShieldOverloadEvent`, etc.) | YES | OK |
| 26 | `strokeRect` | 4 files (`CrisisEventManager`, `HyperspaceStormEvent`, `PsionicResonanceEvent`) | YES | OK |
| 27 | `strokeStyle` | 13 files (`CrisisEventManager`, `HyperspaceStormEvent`, `PhysicsInversionEvent`, `SpriteRenderer`, etc.) | YES | OK |
| 28 | `textAlign` | 3 files (`CrisisEventManager`, `Screens`, `main.ts`) | YES | OK |
| 29 | `textBaseline` | 3 files (`CrisisEventManager`, `Screens`, `main.ts`) | YES | OK |
| 30 | `translate` | 2 files (`ParticleSystem`, `SpriteRenderer`) | YES | OK |

*(Note: AudioContext references such as `ctx.createGain`, `ctx.createOscillator`, etc., are scoped strictly to `AudioContext` in `src/audio/` and do not belong to `CanvasRenderingContext2D`.)*

### 2.3 Verdict on Current Codebase
Across all existing files in `src/`, exactly **one** method is missing from the mock: `quadraticCurveTo`.

---

## 4. Forward-Looking Requirements Analysis (M12, M13, M14)

Reviewing the architectural roadmap for upcoming milestones in `.agents/teamwork_preview_orchestrator_5/DISPATCH.md`:
- **M12: 5 Epic Multi-Phase Boss Encounters** (Stages 10, 20, 30, 40, 50):
  * Cyber Dreadnought (Turrets & escorts $\to$ core spiral bullet rings)
  * Dimensional Leviathan (Phase-shifting invulnerability $\to$ black hole suction vortex)
  * Nanite Swarm Colossus (Quad split-constructs $\to$ nanite gray goo bullet-dissolving cloud)
  * Psionic Shroud Harbinger (Illusion clones $\to$ telekinetic stun wave)
  * Aeternum Star-Eater Core (Planetary satellite shields $\to$ dark matter beam sweep $\to$ enrage overdrive)
- **M13: Allies Support System & 3 Special Moves**:
  * Escort Wingman Drone, Kinetic Aegis Drone, Bomber Support Wing
  * Nova Barrage, Chrono Freeze, Dimensional Warp Ram
- **M14: Procedural Audio & VFX**:
  * Procedural pixel matrices (zero external image assets)
  * Dynamic screen flash, chromatic aberration, additive glow shaders, composite blending

### 4.1 Anticipated Canvas 2D Primitives for M12–M14
To guarantee that newly implemented renderers in M12–M14 do not trigger recurring mock-related crashes in headless test runners, the mock context should comprehensively provide:

1. **Curvature & Geometric Paths**:
   - `quadraticCurveTo(cpx, cpy, x, y): void` (Needed now for Prethoryn Scourge; also Leviathan tentacles, warp ram trails)
   - `bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y): void` (Bézier flight paths, organic alien curves, energy arcs)
   - `arcTo(x1, y1, x2, y2, radius): void` (Rounded boss HUD meters, shield capsules)
   - `rect(x, y, w, h): void` (Rectangular path sub-primitives, composite clipping regions)
   - `roundRect(x, y, w, h, radii?): void` (Modern rounded rectangle standard for boss health bars)
   - `clip(fillRule?): void` (Black hole vortex mask, viewport clipping, laser beam bounds)
   - `isPointInPath(x, y): boolean` & `isPointInStroke(x, y): boolean` (Hit-testing queries)

2. **Compositing & Shading**:
   - `globalCompositeOperation: string` (`'source-over'`, `'lighter'` for additive particle glow, `'destination-out'` for masking)
   - `filter: string` (`'none'`, `'blur(2px)'`, `'brightness(150%)'` for screen flashes and crisis distortions)

3. **Line Styles & Outlines**:
   - `lineCap: CanvasLineCap` (`'butt'`, `'round'`, `'square'`)
   - `lineJoin: CanvasLineJoin` (`'miter'`, `'round'`, `'bevel'`)
   - `lineDashOffset: number` (Animated laser targeting reticles)
   - `miterLimit: number`
   - `strokeText(text, x, y, maxWidth?): void` (Boss encounter intro typography)

4. **Transformations**:
   - `transform(a, b, c, d, e, f): void`
   - `setTransform(a?, b?, c?, d?, e?, f?): void`
   - `resetTransform(): void`
   - `getTransform(): DOMMatrix` (Mock returning identity matrix)

5. **Gradients, Patterns & Pixel Data**:
   - `createConicGradient(startAngle, x, y): CanvasGradient` (Spiral bullet patterns, radar sweeps)
   - `createPattern(image, repetition): CanvasPattern | null` (Procedural tiling)
   - `createImageData(w, h): ImageData`
   - `getImageData(sx, sy, sw, sh): ImageData`
   - `putImageData(imagedata, dx, dy): void`

---

## 5. Verification of `src/core/powerups/PowerUpManager.ts` Pool Capacity Clamping

### 5.1 Static Clamping & Initialization
Inspection of `src/core/powerups/PowerUpManager.ts`:
- Line 24: `public static readonly POOL_CAPACITY = 32;`
- Line 25: `public static readonly POOL_MAX_SIZE = 32;`
- Lines 60–66:
  ```typescript
  this.pool = new ObjectPool<PowerUpItem>({
    factory: () => new PowerUpItem(this.nextItemId++),
    reset: (item: PowerUpItem) => item.reset(),
    initialSize: PowerUpManager.POOL_CAPACITY, // 32
    maxSize: PowerUpManager.POOL_MAX_SIZE,     // 32
    autoExpand: false,
  });
  ```

### 5.2 Zero-GC Invariants & Empirical Verification
1. **Pre-allocation**:
   The pool initializes with 32 contiguous array elements.
2. **Auto-expansion Disabled**:
   `autoExpand: false` guarantees that when `activeCount >= storage.length`, `this.pool.acquire()` returns `null` immediately. No arrays are expanded, no new objects are allocated, and runtime GC overhead is 0.
3. **Graceful Saturation**:
   In `PowerUpManager.ts:224-228`:
   ```typescript
   const item = this.pool.acquire();
   if (!item) {
     return null;
   }
   ```
   Overflow spawn requests return `null` without throwing exceptions or degrading game loop performance.
4. **Recycling & Despawn**:
   Items that fall beyond `y > 288` or collide with the player ship are released back to the pool via O(1) swap-and-pop (`this.pool.release(item)`).
5. **Empirical Test Validation**:
   - `tests/unit/m11_challenger_1_adversarial.test.ts`:
     * Dimension 1 (Pool Saturation & Zero-GC Bounded Capacity): PASSED (spawning 40 items under saturation leases exactly 32 items, returns `null` for items 33–40, active count strictly 32).
     * 100 saturation-despawn cycles preserve pool size at 32 with 0 leakage.
     * All 13 tests passed in 39ms.
   - `tests/unit/powerups.test.ts`:
     * All 28 tests passed.
   - `tests/unit/m11_challenger_2_adversarial.test.ts`:
     * All 21 tests passed.

**Verdict**: The `PowerUpManager` pool capacity clamping is 100% compliant with zero-GC architecture.

---

## 6. Production-Ready Code Recommendations

### Proposed Replacement in `src/core/Game.ts`
Replace lines 158–199 of `src/core/Game.ts` with a comprehensive, robust fallback mock:

```typescript
    if (!ctx) {
      // Robust Mock 2D context fallback for test & headless environments
      this.ctx = {
        canvas: this.canvas,
        fillStyle: '#000000',
        strokeStyle: '#FFFFFF',
        font: '8px monospace',
        textAlign: 'center',
        textBaseline: 'middle',
        direction: 'ltr',
        globalAlpha: 1.0,
        globalCompositeOperation: 'source-over',
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        lineDashOffset: 0,
        miterLimit: 10,
        shadowBlur: 0,
        shadowColor: '#000000',
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
        filter: 'none',
        fillRect: () => {},
        fillText: () => {},
        strokeText: () => {},
        strokeRect: () => {},
        clearRect: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        quadraticCurveTo: () => {},
        bezierCurveTo: () => {},
        arc: () => {},
        arcTo: () => {},
        ellipse: () => {},
        rect: () => {},
        roundRect: () => {},
        fill: () => {},
        stroke: () => {},
        clip: () => {},
        isPointInPath: () => false,
        isPointInStroke: () => false,
        save: () => {},
        restore: () => {},
        drawImage: () => {},
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        transform: () => {},
        setTransform: () => {},
        resetTransform: () => {},
        getTransform: () => ({
          a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
          m11: 1, m12: 0, m13: 0, m14: 0,
          m21: 0, m22: 1, m23: 0, m24: 0,
          m31: 0, m32: 0, m33: 1, m34: 0,
          m41: 0, m42: 0, m43: 0, m44: 1,
          is2D: true, isIdentity: true,
        }),
        setLineDash: () => {},
        getLineDash: () => [],
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createConicGradient: () => ({ addColorStop: () => {} }),
        createPattern: () => null,
        createImageData: (w: number = 1, h: number = 1) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
        }),
        getImageData: (sx: number = 0, sy: number = 0, sw: number = 1, sh: number = 1) => ({
          width: sw,
          height: sh,
          data: new Uint8ClampedArray(Math.max(1, sw * sh * 4)),
        }),
        putImageData: () => {},
        measureText: () => ({
          width: 0,
          actualBoundingBoxAscent: 0,
          actualBoundingBoxDescent: 0,
          actualBoundingBoxLeft: 0,
          actualBoundingBoxRight: 0,
          fontBoundingBoxAscent: 0,
          fontBoundingBoxDescent: 0,
        }),
      } as unknown as CanvasRenderingContext2D;
    } else {
      this.ctx = ctx;
      this.ctx.imageSmoothingEnabled = false;
    }
```

### Exact Unified Diff for `src/core/Game.ts`
```diff
--- a/src/core/Game.ts
+++ b/src/core/Game.ts
@@ -166,10 +166,20 @@ export class Game {
         textAlign: 'center',
         textBaseline: 'middle',
+        direction: 'ltr',
         globalAlpha: 1.0,
+        globalCompositeOperation: 'source-over',
         lineWidth: 1,
+        lineCap: 'butt',
+        lineJoin: 'miter',
+        lineDashOffset: 0,
+        miterLimit: 10,
         shadowBlur: 0,
         shadowColor: '#000000',
+        shadowOffsetX: 0,
+        shadowOffsetY: 0,
         imageSmoothingEnabled: false,
+        imageSmoothingQuality: 'low',
+        filter: 'none',
         fillRect: () => {},
         fillText: () => {},
+        strokeText: () => {},
         strokeRect: () => {},
         clearRect: () => {},
         beginPath: () => {},
         closePath: () => {},
         moveTo: () => {},
         lineTo: () => {},
+        quadraticCurveTo: () => {},
+        bezierCurveTo: () => {},
+        arc: () => {},
+        arcTo: () => {},
+        ellipse: () => {},
+        rect: () => {},
+        roundRect: () => {},
         fill: () => {},
-        ellipse: () => {},
+        stroke: () => {},
+        clip: () => {},
+        isPointInPath: () => false,
+        isPointInStroke: () => false,
         save: () => {},
         restore: () => {},
         drawImage: () => {},
         translate: () => {},
         rotate: () => {},
         scale: () => {},
-        arc: () => {},
-        stroke: () => {},
+        transform: () => {},
+        setTransform: () => {},
+        resetTransform: () => {},
+        getTransform: () => ({
+          a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
+          m11: 1, m12: 0, m13: 0, m14: 0,
+          m21: 0, m22: 1, m23: 0, m24: 0,
+          m31: 0, m32: 0, m33: 1, m34: 0,
+          m41: 0, m42: 0, m43: 0, m44: 1,
+          is2D: true, isIdentity: true,
+        }),
         setLineDash: () => {},
         getLineDash: () => [],
         createLinearGradient: () => ({ addColorStop: () => {} }),
         createRadialGradient: () => ({ addColorStop: () => {} }),
-        measureText: () => ({ width: 0 }),
+        createConicGradient: () => ({ addColorStop: () => {} }),
+        createPattern: () => null,
+        createImageData: (w: number = 1, h: number = 1) => ({
+          width: w,
+          height: h,
+          data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
+        }),
+        getImageData: (sx: number = 0, sy: number = 0, sw: number = 1, sh: number = 1) => ({
+          width: sw,
+          height: sh,
+          data: new Uint8ClampedArray(Math.max(1, sw * sh * 4)),
+        }),
+        putImageData: () => {},
+        measureText: () => ({
+          width: 0,
+          actualBoundingBoxAscent: 0,
+          actualBoundingBoxDescent: 0,
+          actualBoundingBoxLeft: 0,
+          actualBoundingBoxRight: 0,
+          fontBoundingBoxAscent: 0,
+          fontBoundingBoxDescent: 0,
+        }),
       } as unknown as CanvasRenderingContext2D;
     } else {
```
