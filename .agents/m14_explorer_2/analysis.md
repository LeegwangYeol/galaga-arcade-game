# Milestone 14: Canvas 2D VFX Shaders, Screen Effects & Particle Systems Analysis

## 1. Executive Summary

This investigation establishes the technical architecture, mathematical specifications, procedural rendering algorithms, and Zero-GC contracts for **Milestone 14: Canvas 2D VFX Shaders & Visual Effects** in the Galaga Ultimate Arcade Game.

All effects are designed to execute strictly on the HTML5 Canvas 2D rendering context within the fixed virtual coordinate space ($224 \times 288$ native, $448 \times 576$ internal buffer) with **zero external assets** (no PNG/JPG/WebP sprites, no WebGL/GLSL dependencies) and **zero runtime Garbage Collection (GC) allocations** during active 60 FPS gameplay.

The expansion encompasses five core visual domains:
1. **Chrono Freeze Visuals**: Full-screen ice frost vignette overlay (`CHRONO_FROST_CORNER` bit-matrices at four corners), pale cyan atmospheric tint, and complete starfield kinematic freeze and desaturation.
2. **Dimensional Warp Ram Visuals**: Hyper-speed radial speed lines, blue-shifted relativistic Doppler particle wake, and high-frequency camera micro-shake ($\pm 1.5\text{px}$).
3. **Nova Barrage Visuals**: Neon cyan missile exhaust trails via zero-allocation ring-buffered positional histories, 4-corner targeting reticle brackets around locked targets, and radial particle impact bursts.
4. **Boss Visual Tells & Tells**:
   - Stage 50 Aeternum Core: 60% canvas width ($134\text{px}$) warning laser guides with central focus oscillator and radiant multi-layer energy beam with plasma turbulence.
   - Stage 40 Psionic Harbinger: Phantom clone shimmer effect featuring high-frequency chromatic aberration jitter, silhouette after-images, and sinusoidal alpha breathing.
   - Stage 30 Nanite Colossus: Particulate gray goo swarm cloud with stochastic Brownian micro-nanite motes, undulating amorphous haze, electric micro-arcs, and bullet dissolution sizzle.
5. **Crisis Visual Atmosphere**:
   - The Contingency: Rolling CRT scanline pulse with vertical sync bar sweep, phosphor raster lines, and occasional single-frame horizontal glitch displacement.
   - The Unbidden: Jagged violet spacetime rift tear with multi-layered warp aura and outward gravitational lensing ripples.
   - Hyperspace Storm: Multi-branch cosmic lightning arcs with primary trunk, fractal forks, chromatic glow sheaths, and pre-discharge lane ionization.

---

## 2. Rendering Pipeline Audit & Layering Architecture

### 2.1 Current Pipeline Layout (`src/core/Game.ts`)
The master render pipeline executes sequentially in `Game.ts:render()` with pixelated letterbox scaling managed by `ScreenManager.ts`:

```
┌────────────────────────────────────────────────────────────┐
│                  Game.ts Render Sequence                   │
├────┬─────────────────────────────┬─────────────────────────┤
│ #  │ Layer / Subsystem           │ Current Implementation  │
├────┼─────────────────────────────┼─────────────────────────┤
│ 1  │ Background Clear            │ ctx.fillRect(0,0,224,288) black
│ 2  │ Starfield Layer (z=0)       │ Starfield.render(ctx)   │
│ 3  │ HUD Header (z=6)            │ HUD.renderHeader(ctx)   │
│ 4  │ Playing Screen Entities:    │                         │
│    │  4.1 Formation Grid         │ FormationManager.render │
│    │  4.2 Tractor Beam Cone      │ TractorBeam.render      │
│    │  4.3 Power-Up Capsules      │ PowerUpManager.render   │
│    │  4.4 Allies Support Fleet   │ AlliesManager.render    │
│    │  4.5 Projectiles            │ BulletManager.render    │
│    │  4.6 Special Moves          │ SpecialMovesManager.render
│    │  4.7 Particle Explosions    │ ParticleSystem.render   │
│    │  4.8 Player Ship & Escorts  │ Player.render           │
│    │  4.9 Crisis Atmosphere      │ CrisisEventManager.render
│    │  4.10 Boss Entities & Tells │ BossManager.render      │
│ 5  │ HUD Footer (z=6)            │ HUD.renderFooter(ctx)   │
└────┴─────────────────────────────┴─────────────────────────┘
```

### 2.2 Critical Architecture Deficiencies & Required Hooks

1. **Screen Shake Placement**:
   - Currently, there is NO screen shake implementation anywhere in the codebase.
   - To achieve camera micro-shake ($\pm 1.5\text{px}$) without shaking the fixed HUD (Score, Lives, Stage Badges), the world rendering pass (Steps 2 and 4) must be enveloped in a transform matrix:
     ```typescript
     ctx.save();
     if (this.screenShakeActive) {
       ctx.translate(this.shakeOffsetX, this.shakeOffsetY);
     }
     // Render Starfield + World Entities (Steps 2 & 4)
     ctx.restore();
     // Render HUD (Header & Footer) in unshifted screen space
     ```
2. **Starfield Freeze Invariant**:
   - In `Game.ts:692`, `this.starfield.update(dt)` is called unconditionally.
   - When Chrono Freeze is active (`specialMovesManager.isChronoFrozen()`), `starfield.update()` continues scrolling stars at normal velocity.
   - In Milestone 14, `Starfield` must accept a frozen state: `effectiveDt = this.specialMovesManager.getEnemyDeltaTime(dt)` or `starfield.setFrozen(true)`.
3. **Z-Index Layering for Atmosphere vs HUD**:
   - Full-screen atmosphere shaders (CRT scanlines, frost vignette) currently render inside entity render functions, which can improperly bleed under or over HUD elements.
   - Atmosphere shaders must be layered deliberately:
     - World-space atmospheric effects (lightning arcs, rift tears, gray goo clouds) render in world space under screen shake.
     - Screen-space post-processing shaders (CRT scanline pulse, full-screen ice frost vignette) render immediately before the HUD or over the entire frame with controlled alpha.

---

## 3. Special Moves Procedural VFX Designs

### 3.1 Chrono Freeze Visuals (시공간 동결)

#### A. Requirements & Aesthetics
- Full-screen ice frost vignette overlay.
- `CHRONO_FROST_CORNER` procedural bit-matrix at all four screen corners.
- Ambient pale cyan atmospheric tint.
- Starfield velocity freeze & ice desaturation.

#### B. Algorithmic Specification
1. **Four-Corner Frost Matrices**:
   - The matrix `CHRONO_FROST_CORNER_MATRIX` ($16 \times 16$) is already pre-baked in `SpriteRenderer.ts:1277` with colors `WHITE`, `BLUE_CYAN`, `BLUE_LIGHT`.
   - In Milestone 14, corner placement utilizes `SpriteRenderer.draw()` with corner anchoring and subtle harmonic breathing:
     - Top-Left: $(8, 8)$, normal orientation.
     - Top-Right: $(224 - 8, 8)$, `flipX: true`.
     - Bottom-Left: $(8, 288 - 8)$, `flipY: true`.
     - Bottom-Right: $(224 - 8, 288 - 8)$, `flipX: true, flipY: true`.
     - Breathing pulse: Scale oscillates $s(t) = 1.0 + 0.08 \sin(12 t)$ or alpha modulates $\alpha(t) = 0.85 + 0.15 \cos(10 t)$.
2. **Full-Screen Ice Frost Vignette Gradient**:
   - Rather than allocating dynamic gradients per frame, four linear border gradients (Top, Bottom, Left, Right) or a pre-baked offscreen vignette canvas can be used.
   - Using Canvas 2D scalar drawing:
     ```typescript
     // Edge Frost Bars (12px depth) with pre-cached color stops
     ctx.fillStyle = PALETTE.BLUE_CYAN;
     ctx.globalAlpha = 0.12 + 0.04 * Math.sin(this.stateTimer * 8);
     ctx.fillRect(0, 0, 224, 6);        // Top rim
     ctx.fillRect(0, 288 - 6, 224, 6);    // Bottom rim
     ctx.fillRect(0, 0, 6, 288);        // Left rim
     ctx.fillRect(224 - 6, 0, 6, 288);    // Right rim
     ```
3. **Starfield Freeze & Desaturation**:
   - When Chrono Freeze is active:
     - `starfield.update(0)` freezes position integration ($\Delta y = 0$).
     - Twinkling phase integration is frozen ($\Delta \phi = 0$).
     - In `Starfield.render(ctx)`, when `isFrozen = true`, star colors are mapped to pale crystalline ice: `#FFFFFF`, `#C0F0FF`, `#00FFFF`, stripping out warm red/orange hues.

---

### 3.2 Dimensional Warp Ram Visuals (차원 도약 돌파)

#### A. Requirements & Aesthetics
- Hyper-speed radial speed lines streaming across the canvas.
- Blue-shifted relativistic Doppler particle wake trailing behind player fighter.
- Camera micro-shake ($\pm 1.5\text{px}$).
- Invulnerable swept plasma shock cone & forward motion blur.

#### B. Algorithmic Specification
1. **Hyper-Speed Radial Speed Lines**:
   - Data structure: Pre-allocated typed arrays for 24 streaming speed lines:
     ```typescript
     private speedLineX = new Float32Array(24);
     private speedLineY = new Float32Array(24);
     private speedLineLength = new Float32Array(24);
     private speedLineSpeed = new Float32Array(24);
     ```
   - Kinematics:
     - Speeds range from $700$ to $1100\text{ px/s}$ downward.
     - Lengths range from $24$ to $64\text{ px}$.
     - When $y > 288$, wraps to $y = -64$ with randomized $x \in [8, 216]$.
   - Rendering:
     - Rendered with `ctx.lineWidth = 1` using `PALETTE.BLUE_CYAN` ($\alpha = 0.6$) and `PALETTE.WHITE` ($\alpha = 0.9$).
2. **Blue-Shifted Particle Wake**:
   - Relativistic Doppler progression: From intense ultraviolet purple (`#9900EE`), to deep azure (`#5B93FF`), to radiant cyan (`#00FFFF`), to pure white thermal core (`#FFFFFF`).
   - During Warp Ram active frames ($t \in [0, 1.2\text{s}]$), every 2 frames ($30\text{ Hz}$), spawn 2-4 wake particles from player engine thrusters:
     - Hardpoints: $(x - 6, y + 8)$ and $(x + 6, y + 8)$ (or center $(x, y + 8)$ for single fighter).
     - Velocity: $v_x \in [-25, 25]\text{ px/s}$, $v_y \in [40, 90]\text{ px/s}$ (trailing downward relative to upward rocket).
     - Lifetime: $0.20\text{s} - 0.35\text{s}$, linear alpha decay.
3. **Camera Micro-Shake ($\pm 1.5\text{px}$)**:
   - State variables:
     ```typescript
     private shakeIntensity: number = 1.5;
     private shakeDuration: number = 0;
     private shakeTimer: number = 0;
     public shakeOffsetX: number = 0;
     public shakeOffsetY: number = 0;
     ```
   - Update:
     ```typescript
     if (this.shakeTimer < this.shakeDuration) {
       this.shakeTimer += dt;
       const decay = 1.0 - (this.shakeTimer / this.shakeDuration);
       const amp = this.shakeIntensity * decay;
       // High-frequency deterministic or pseudo-random integer offset
       this.shakeOffsetX = Math.round((Math.random() - 0.5) * 2 * amp);
       this.shakeOffsetY = Math.round((Math.random() - 0.5) * 2 * amp);
     } else {
       this.shakeOffsetX = 0;
       this.shakeOffsetY = 0;
     }
     ```

---

### 3.3 Nova Barrage Visuals (초신성 일제사격)

#### A. Requirements & Aesthetics
- Neon cyan missile exhaust trails streaming from all 16 salvo projectiles.
- Procedural HUD targeting reticle brackets around acquired enemy/boss targets.
- Radial particle impact bursts and micro-shockwave rings on missile strike.

#### B. Algorithmic Specification
1. **Missile Exhaust Trails via Positional Ring Buffers**:
   - Inside `NovaMissile` entity:
     ```typescript
     public static readonly TRAIL_LENGTH = 5;
     public trailX = new Float32Array(NovaMissile.TRAIL_LENGTH);
     public trailY = new Float32Array(NovaMissile.TRAIL_LENGTH);
     public trailHead: number = 0;
     public trailCount: number = 0;
     ```
   - Update integration:
     - On each `update(dt)`, write current $(x, y)$ into `trailX[trailHead]`, `trailY[trailHead]`.
     - Advance `trailHead = (trailHead + 1) % TRAIL_LENGTH`, increment `trailCount = Math.min(TRAIL_LENGTH, trailCount + 1)`.
   - Zero-allocation render pass:
     - Traverse the ring buffer backward from `trailHead - 1` to `0`.
     - Draw connected line segments with decreasing `ctx.lineWidth` ($2.5 \to 0.8\text{px}$) and decreasing `ctx.globalAlpha` ($0.7 \to 0.1$).
     - Palette: Outer trail in `PALETTE.BLUE_CYAN` (`#00FFFF`), inner core in `PALETTE.WHITE` (`#FFFFFF`).
2. **Targeting Reticle Brackets**:
   - Rendered around each distinct target acquired by active missiles.
   - Bounding box: Target's hitbox padded by $3\text{px}$: $[x_{min}, y_{min}, x_{max}, y_{max}]$.
   - Procedural 4-corner brackets:
     - Bracket arm length: $4\text{px}$.
     - Top-Left: line $(x_{min}, y_{min} + 4) \to (x_{min}, y_{min}) \to (x_{min} + 4, y_{min})$.
     - Top-Right: line $(x_{max} - 4, y_{min}) \to (x_{max}, y_{min}) \to (x_{max}, y_{min} + 4)$.
     - Bottom-Left: line $(x_{min}, y_{max} - 4) \to (x_{min}, y_{max}) \to (x_{min} + 4, y_{max})$.
     - Bottom-Right: line $(x_{max} - 4, y_{max}) \to (x_{max}, y_{max}) \to (x_{max}, y_{max} - 4)$.
   - Styling:
     - Line width: $1.2\text{px}$.
     - Color: Pulsing `PALETTE.BLUE_CYAN` ($6\text{ Hz}$ breathing alpha $\alpha = 0.6 + 0.4 \sin(12 t)$).
     - Optional center crosshair tick dots for Boss targets.
3. **Particle Burst on Impact**:
   - When a `NovaMissile` impacts an enemy or boss:
     - Spawns 12-16 high-velocity radial sparks ($80 - 150\text{ px/s}$, lifespan $0.25\text{s}$) in `#00FFFF`, `#9900EE`, and `#FFFFFF`.
     - Spawns 1 expanding shockwave ring (radius $2 \to 16\text{px}$, lifespan $0.25\text{s}$, stroke `#00FFFF`).
     - Reuses existing `ParticleSystem` object pool with zero allocations!

---

## 4. Boss Visual Tells & Atmospheric Hazards

### 4.1 Stage 50: Aeternum Star-Eater Core (항성 포식자)

#### A. Mega-Beam Warning Laser Guide ($t \in [0, 1.0\text{s}]$)
- Problem: Existing implementation draws only a single thin red line down the center.
- Enhanced Milestone 14 Design:
  1. Danger Zone Boundary Guides:
     - Two vertical dashed/pulsing lines at $x = \text{centerX} - 67$ and $x = \text{centerX} + 67$ (total width $134\text{px}$, representing $59.8\%$ of the $224\text{px}$ canvas).
     - Color: Alternating red/orange/yellow stippling or high-frequency strobe ($20\text{ Hz}$).
  2. Concentrated Central Pre-Ignition Laser:
     - A vibrating core beam at $\text{centerX}$ that widens from $1\text{px}$ to $4\text{px}$ as $t \to 1.0\text{s}$.
     - Harmonic transverse jitter: $x = \text{centerX} + \sin(t \cdot 40) \cdot 1.5$.
  3. Emitter Convergence Motes:
     - 8 pre-allocated particle motes streaming inward toward the boss cannon nozzle at $(x, 52)$ with accelerating radial velocity.

#### B. 60% Canvas Width Radiant Energy Beam ($t \in [0, 2.5\text{s}]$)
- Problem: Existing implementation draws a flat translucent purple box.
- Enhanced Milestone 14 Design:
  1. Multi-Layer Energy Core Gradients:
     - Linear gradient across the $134\text{px}$ width:
       - Stop 0.00: `rgba(153, 0, 238, 0.0)`
       - Stop 0.15: `rgba(153, 0, 238, 0.5)` (Violet shroud)
       - Stop 0.35: `rgba(0, 255, 255, 0.8)` (Cyan sub-core)
       - Stop 0.48: `rgba(255, 255, 255, 0.95)` (Superheated white conduit)
       - Stop 0.52: `rgba(255, 255, 255, 0.95)`
       - Stop 0.65: `rgba(0, 255, 255, 0.8)`
       - Stop 0.85: `rgba(153, 0, 238, 0.5)`
       - Stop 1.00: `rgba(153, 0, 238, 0.0)`
     - This gradient can be created with scalar coordinates based on `centerX` and `width`.
  2. Longitudinal Plasma Turbulence:
     - Edge contours rendered with oscillating sinusoidal coordinates:
       $x_{edge}(y) = \text{centerX} \pm 67 + \sin(y \cdot 0.15 + t \cdot 25) \cdot 2.5$.
  3. Ground Impact Plasma Splash:
     - At $y = 288$, a blazing horizontal impact flare spanning $\text{width} + 20\text{px}$ with radiating upward sparks.
  4. Continuous Heavy Screen Rumble:
     - While beam is firing, `ScreenShake.setRumble(1.8px)`.

---

### 4.2 Stage 40: Psionic Shroud Harbinger (장막의 사자)

#### A. Psionic Phantom Shimmer Effect
- Problem: Phantom clones look identical to normal sprites without any ethereal tell.
- Enhanced Milestone 14 Design:
  1. High-Frequency Horizontal Jitter:
     - Position rendering applies a periodic psionic displacement:
       $x_{render} = x + \sin(t \cdot 35 + \text{phantomIndex} \cdot 2.1) \cdot 1.5$.
  2. Chromatic Silhouette Echoes:
     - Render two offset passes before the main sprite:
       - Magenta echo: $(x_{render} - 2, y)$, `ctx.globalAlpha = 0.30`, tinting in `PALETTE.PINK_MAGENTA`.
       - Violet echo: $(x_{render} + 2, y)$, `ctx.globalAlpha = 0.30`, tinting in `PALETTE.PURPLE`.
  3. Sinusoidal Opacity Breathing:
     - Overall alpha oscillates: $\alpha(t) = 0.60 + 0.25 \sin(t \cdot 10 + \text{phantomIndex})$.
  4. Concentric Psionic Distortion Ripples:
     - Expanding elliptical rings radiating outward from the phantom center ($r \in [10, 32]\text{px}$, stroke `rgba(255, 0, 127, 0.35)`).

---

### 4.3 Stage 30: Nanite Swarm Colossus (나노머신 거신)

#### A. Nanite Gray Goo Particulate Cloud
- Problem: Gray goo clouds in Phase 2 are static gray circles.
- Enhanced Milestone 14 Design:
  1. Pre-Allocated Swarm Buffer:
     - Each of the 2 clouds maintains a fixed typed buffer for 20 orbiting nanite motes:
       ```typescript
       private naniteR = [new Float32Array(20), new Float32Array(20)];
       private naniteTheta = [new Float32Array(20), new Float32Array(20)];
       private naniteSpeed = [new Float32Array(20), new Float32Array(20)];
       private naniteSize = [new Uint8Array(20), new Uint8Array(20)];
       ```
  2. Stochastic Swarm Dynamics:
     - Motes orbit around cloud center $(x, y)$ with Brownian radius fluctuation ($R \in [4, 22]\text{px}$).
     - Speeds range from $1.5$ to $4.5\text{ rad/s}$.
  3. Procedural Cloud Rendering:
     - Base amorphous haze: Overlapping translucent gray circles with undulating harmonic radii:
       $r(\theta) = \text{baseRadius} + \sin(\theta \cdot 3 + t \cdot 4) \cdot 2.0$.
     - Particulate motes: Drawn as crisp $1 \times 1$ and $2 \times 2$ squares using metallic palette: `PALETTE.GREY_LIGHT` (`#AAAAAA`), `PALETTE.GREY_DARK` (`#555555`), and `PALETTE.WHITE` (`#FFFFFF`).
     - Electric micro-arcs: 1px lightning segment drawn between any two nanite motes closer than $6\text{px}$.
  4. Bullet Dissolution Sizzle:
     - When a player projectile enters the cloud radius and is dissolved, trigger a burst of 4-6 gray/white sizzle sparks drifting upward.

---

## 5. Crisis Visual Atmosphere Shaders

### 5.1 The Contingency (우발사태 — Ghost Signal)

#### A. CRT Scanline Pulse & V-Sync Roll
- Problem: Currently renders only static scanlines at `rgba(0, 255, 65, 0.04)`.
- Enhanced Milestone 14 Design:
  1. Phosphor Raster Scanlines:
     - Pre-rendered or scalar loop rendering fine horizontal lines at $y = 0, 3, 6, \dots, 288$ (stride 3px for optimal arcade raster density).
  2. Vertical Sync Bar Pulse (Rolling Refresh Beam):
     - A brightened phosphor sweep bar moving vertically down the screen:
       $y_{beam} = (t \cdot 140) \pmod{288}$.
     - Height: $32\text{px}$.
     - Inside this rolling band, scanlines brighten from $\alpha = 0.04$ up to $\alpha = 0.18$, simulating a high-voltage electron gun sweep.
  3. Single-Frame Horizontal Glitch Tear:
     - Low-probability glitch trigger ($P \approx 0.04$ per frame):
     - A $4 - 8\text{px}$ horizontal strip at random $y$ is displaced by $\pm 2 - 4\text{px}$ for a single frame, perfectly capturing the Rogue AI Ghost Signal corrupting the arcade CRT monitor.

---

### 5.2 The Unbidden (이차원 침략자 — Dimensional Tear)

#### A. Violet Spacetime Rift Tear Distortion
- Problem: Currently renders a smooth circle and 3 simple spiral arms.
- Enhanced Milestone 14 Design:
  1. Jagged Spacetime Fissure:
     - 10-vertex jagged vertical tear cutting through $(112, 60)$:
       ```typescript
       private tearX = new Float32Array(10);
       private tearY = new Float32Array(10);
       ```
     - Vertices span $y \in [30, 90]$ with erratic horizontal displacements:
       $x_i = 112 + \sin(i \cdot 1.8 + t \cdot 12) \cdot (8 - |i - 4.5| \cdot 1.6)$.
  2. Multi-Layered Violet / Magenta Halo:
     - Outer warp aura: Radial gradient from deep violet (`rgba(153, 0, 238, 0.45)`) to transparent.
     - Fissure border: $2\text{px}$ stroke in electric magenta (`#FF007F` / `#FF00FF`).
     - Core void: Pitch black interior with $1\text{px}$ glowing cyan fringe (`#00FFFF`).
  3. Outward Gravitational Distortion Ripples:
     - Concentric distortion ellipses radiating outward from the fissure at $50\text{ px/s}$, visually indicating gravitational pull on missiles.

---

### 5.3 Hyperspace Storm (초공간 폭풍 — Hyperlane Tempest)

#### A. Cosmic Lightning Arcs & Multi-Branching Forks
- Problem: Currently draws a single static 12-vertex line without branching.
- Enhanced Milestone 14 Design:
  1. Primary Lightning Trunk:
     - 12 jagged vertices spanning lane $y \in [0, 288]$ with erratic lateral displacements ($\pm 14\text{px}$).
  2. Fractal Branching Forks:
     - 2-3 secondary branch arcs splitting off at vertices 3, 6, and 8 into adjacent lanes:
       ```typescript
       private branch1X = new Float32Array(6);
       private branch1Y = new Float32Array(6);
       private branch2X = new Float32Array(6);
       private branch2Y = new Float32Array(6);
       ```
     - Branches extend $20 - 45\text{px}$ diagonally with rapid decay ($0.08\text{s}$).
  3. Chromatic Layering:
     - Outer glow sheath: $5\text{px}$ stroke in cosmic purple (`#8A2BE2`, $\alpha = 0.7$).
     - Secondary core: $2.5\text{px}$ stroke in electric cyan (`#00FFFF`).
     - Filament core: $1\text{px}$ stroke in blistering white (`#FFFFFF`).
  4. Pre-Discharge Lane Ionization:
     - During the $0.9\text{s}$ warning phase, faint micro-filaments ($1\text{px}$ jittery purple lines) flicker up and down the lane boundaries at $18\text{ Hz}$.

---

## 6. Zero Runtime GC Architecture & Canvas 2D Optimization

### 6.1 GC Elimination Strategy
In JavaScript engines (V8, JavaScriptCore, SpiderMonkey), creating objects or template strings during 60 FPS requestAnimationFrame loops triggers minor garbage collection cycles (Scavenge/Young Generation GC). At 60 FPS ($16.67\text{ ms}$ budget), GC pauses of even $2 - 5\text{ ms}$ introduce noticeable frame stutter.

| Operation | Poor Practice (Triggers GC) | Milestone 14 Pattern (Zero GC) |
|---|---|---|
| **Color String Generation** | `ctx.fillStyle = \`rgba(0, 255, 255, ${a.toFixed(2)})\`` (allocates strings) | Use `ctx.fillStyle = PALETTE.BLUE_CYAN; ctx.globalAlpha = a;` |
| **Coordinate Arrays** | `points.push({ x, y })` | Pre-allocated `Float32Array(N)` with index tracking |
| **Object Allocation** | `new Particle()`, `new Array()` in update/render | `ObjectPool<Particle>` with bounded capacity |
| **Array Filtering** | `list.filter(...)`, `list.map(...)` | In-place traversal or indexed loops `for (let i = 0; i < count; i++)` |
| **Offscreen Canvases** | `document.createElement('canvas')` per frame | Pre-baked at `SpriteRenderer.initialize()` boot time |

### 6.2 Pre-Allocated Typed Array Budget
All procedural VFX in Milestone 14 utilize fixed typed arrays allocated once during class construction:

```typescript
// Memory Footprint Summary:
- NovaMissile trails: 16 missiles x 5 positions x 8 bytes (Float32Array x 2) = 640 bytes
- Warp Ram speed lines: 24 lines x 4 attributes x 4 bytes = 384 bytes
- Nanite Colossus clouds: 2 clouds x 20 motes x 13 bytes = 520 bytes
- Hyperspace Storm lightning: 12 trunk + 12 branch vertices x 8 bytes = 192 bytes
- The Unbidden rift tear: 10 vertices x 8 bytes = 80 bytes
- Total typed array footprint: < 2 KB (zero heap churn per frame)
```

---

## 7. Concrete File Modification Plan

1. **`src/renderer/SpriteRenderer.ts`**:
   - Add procedural rendering helper methods:
     - `drawChronoFrostVignette(ctx, width, height, stateTimer)`
     - `drawTargetingReticle(ctx, x, y, width, height, isLocked, stateTimer)`
     - `drawWarpSpeedLines(ctx, lines, width, height)`
     - `drawAeternumMegaBeam(ctx, centerX, width, topY, bottomY, isCharging, isFiring, chargeProgress, stateTimer)`
     - `drawPsionicPhantom(ctx, spriteId, x, y, phantomIndex, stateTimer)`
     - `drawNaniteCloud(ctx, cloud, motes, stateTimer)`
2. **`src/systems/ParticleSystem.ts`**:
   - Add impact presets:
     - `spawnNovaImpact(x, y, count = 14)`
     - `spawnWarpWake(x, y, vx, vy)`
     - `spawnNaniteDissolve(x, y)`
3. **`src/core/specials/pools/NovaMissile.ts`**:
   - Add ring-buffered `trailX`, `trailY` typed arrays.
   - Update and render neon cyan exhaust trails.
4. **`src/core/specials/SpecialMovesManager.ts`**:
   - Integrate targeting reticle rendering for all locked enemies during Nova Barrage.
   - Integrate radial speed lines and blue-shifted wake emission during Warp Ram.
   - Trigger camera micro-shake ($\pm 1.5\text{px}$) during Warp Ram charge.
   - Enforce starfield freeze and desaturation during Chrono Freeze.
5. **`src/systems/Starfield.ts`**:
   - Add `isChronoFrozen: boolean` property and ice desaturation color palette during freeze.
6. **`src/core/ScreenManager.ts` or `src/core/Game.ts`**:
   - Introduce `ScreenShake` controller ($\pm 1.5\text{px}$ micro-shake for Warp Ram, heavy rumble for Aeternum Mega-Beam).
   - Wrap world rendering pass in translated context.
7. **`src/core/boss/bosses/AeternumCore.ts`**:
   - Replace flat beam box with multi-stop radiant energy beam and danger zone boundary guides.
8. **`src/core/boss/bosses/PsionicHarbinger.ts`**:
   - Add chromatic jitter, silhouette after-images, and alpha breathing to phantom clones.
9. **`src/core/boss/bosses/NaniteColossus.ts`**:
   - Replace static gray circles with Brownian nanite particulate swarm and electric micro-arcs.
10. **`src/core/crisis/events/TheContingencyEvent.ts`**:
    - Add rolling CRT scanline pulse and horizontal glitch tear strip.
11. **`src/core/crisis/events/TheUnbiddenEvent.ts`**:
    - Add jagged spacetime rift tear and outward warp ripples.
12. **`src/core/crisis/events/HyperspaceStormEvent.ts`**:
    - Add multi-branch fractal lightning forks and pre-discharge boundary ionization.

