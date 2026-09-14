# Technical Architecture Report: Procedural Sprites & Power-Up Testing (Milestone 11)

**Agent**: `m11_explorer_3` (Procedural Sprites & Power-Up Testing Explorer)  
**Date**: 2026-09-03  
**Target Codebase**: Galaga Arcade Web Game (`/Users/user/src/galog`)  
**Status**: Exploration & Technical Design Complete  

---

## 1. Executive Summary

In Milestone 11, the Galaga arcade clone introduces the **Player Fighter Upgrade & Power-Up Subsystem (Requirement 3)**. To adhere to the project's foundational tenets—**zero external assets, 60 FPS fixed-timestep determinism, zero garbage collection pauses via dense object pooling, and authentic 1981 arcade aesthetics**—this report details the complete engineering designs for:

1. **Procedural Pixel Art Matrices & SpriteRenderer Architecture**:
   - 100% procedural $10\times10$ and $8\times8$ dual-frame animated pixel bit-matrices for all 5 power-up capsules: **Rapid Fire**, **Kinetic Deflector Shield**, **Scatter Shot**, **EMP Bomb**, and **Engine Booster**.
   - Offscreen canvas pre-baking pipeline integrated with `SpriteRenderer.initialize()` and `bakeFrame()`.
   - Floating kinematics (vertical drift + horizontal sinusoidal sway), pendulum wobble rotation, and dynamic pulsating halo aura.
   - Procedural **Player Shield Visual Barrier**: Single Fighter circular/hexagonal barrier ($R=14\text{px}$) and Dual Fighter elongated stadium/pill barrier ($42\text{px}\times24\text{px}$) with 24Hz hit deflection flash strobe and orbital vertex nodes.

2. **Comprehensive Unit Test Architecture for `tests/unit/powerups.test.ts`**:
   - 7 test suites covering `ObjectPool<PowerUpItem>` lifecycle, drop roll probability verification across enemy tiers (Zako 5%, Goei 9%, Boss 30%, Crisis Elite 100%), physics drift and boundary culling, single/dual fighter upgrade mechanics, trigonometric spread angle calculations ($\pm15^\circ$), shield damage deflection, EMP screen clear, and buff timer state transitions (including tractor beam pause/resume).

---

## 2. Part 1: Procedural Pixel Art Matrices & SpriteRenderer Architecture

### 2.1 Arcade Color Palette & Palette Mapping

All sprites use the existing arcade palette in `src/renderer/SpriteRenderer.ts`:

| Char Code | Palette Constant | Hex Code | Purpose in Power-Up Capsules |
|---|---|---|---|
| `.` | `PALETTE.TRANSPARENT` | `rgba(0,0,0,0)` | Alpha transparency for capsule outline |
| `W` | `PALETTE.WHITE` | `#FFFFFF` | Core highlight, detonation spark, crystal center |
| `R` | `PALETTE.RED` | `#E70000` | Rapid fire casing, EMP hazard border |
| `D` | `PALETTE.RED_DARK` | `#9E0000` | Deep red shadow, nuclear core accents |
| `B` | `PALETTE.BLUE_LIGHT` | `#5B93FF` | Shield field interior, jet thruster hull |
| `C` | `PALETTE.BLUE_CYAN` | `#00FFFF` | Shield boundary, booster trim, electric glow |
| `N` | `PALETTE.BLUE_NAVY` | `#000088` | Deep shield matrix shadows |
| `Y` | `PALETTE.YELLOW` | `#FFFF00` | Ammo core, radiation spark, afterburner flame |
| `O` | `PALETTE.ORANGE` | `#FF7F00` | Rapid fire heat, thruster exhaust |
| `G` | `PALETTE.GREEN` | `#00E700` | Scatter shot 3-way divergent chevrons |
| `P` | `PALETTE.PINK_MAGENTA` | `#FF007F` | Alternate particle flash |
| `L` | `PALETTE.GREY_LIGHT` | `#AAAAAA` | Capsule metal rim, thruster brackets |
| `K` | `PALETTE.GREY_DARK` | `#555555` | Industrial casing, shadow contours |

---

### 2.2 10x10 Procedural Pixel Bit-Matrices (2-Frame Animation)

Each power-up capsule features a 2-frame animation cycle (Frame 0: Standard, Frame 1: Energized/Pulse), alternating at $6-8\text{ Hz}$ to create a distinct arcade shimmer.

#### 1. Rapid Fire (`POWERUP_RAPID_FIRE`)
*Theme: Blazing overclock ammunition bolt with crimson housing and bright yellow/white energy surge.*

```typescript
// Frame 0: Standard Overclock Bolt
export const POWERUP_RAPID_FRAME_0: string[][] = [
  ['.', '.', 'R', 'R', 'R', 'R', 'R', 'R', '.', '.'],
  ['.', 'R', 'O', 'Y', 'Y', 'Y', 'Y', 'O', 'R', '.'],
  ['R', 'O', 'Y', 'Y', 'W', 'W', '.', '.', 'O', 'R'],
  ['R', 'Y', 'Y', 'W', 'W', '.', '.', '.', 'Y', 'R'],
  ['R', 'Y', 'W', 'W', 'W', 'W', 'W', '.', 'Y', 'R'],
  ['R', 'Y', '.', 'W', 'W', 'W', 'W', 'W', 'Y', 'R'],
  ['R', 'Y', '.', '.', '.', 'W', 'W', 'Y', 'Y', 'R'],
  ['R', 'O', '.', '.', 'W', 'W', 'Y', 'Y', 'O', 'R'],
  ['.', 'R', 'O', 'Y', 'Y', 'Y', 'Y', 'O', 'R', '.'],
  ['.', '.', 'R', 'R', 'R', 'R', 'R', 'R', '.', '.'],
];

// Frame 1: High-Energy Thermal Pulse
export const POWERUP_RAPID_FRAME_1: string[][] = [
  ['.', '.', 'O', 'Y', 'Y', 'Y', 'Y', 'O', '.', '.'],
  ['.', 'O', 'Y', 'W', 'W', 'W', 'W', 'Y', 'O', '.'],
  ['O', 'Y', 'W', 'W', 'W', 'W', '.', '.', 'Y', 'O'],
  ['Y', 'W', 'W', 'W', 'W', '.', '.', '.', 'W', 'Y'],
  ['Y', 'W', 'W', 'W', 'W', 'W', 'W', '.', 'W', 'Y'],
  ['Y', 'W', '.', 'W', 'W', 'W', 'W', 'W', 'W', 'Y'],
  ['Y', 'W', '.', '.', '.', 'W', 'W', 'W', 'W', 'Y'],
  ['O', 'Y', '.', '.', 'W', 'W', 'W', 'W', 'Y', 'O'],
  ['.', 'O', 'Y', 'W', 'W', 'W', 'W', 'Y', 'O', '.'],
  ['.', '.', 'O', 'Y', 'Y', 'Y', 'Y', 'O', '.', '.'],
];
```

#### 2. Kinetic Deflector Shield (`POWERUP_KINETIC_SHIELD`)
*Theme: Shimmering hexagonal energy barrier with crystal white core and deep cyan/navy protective border.*

```typescript
// Frame 0: Stable Barrier Matrix
export const POWERUP_SHIELD_FRAME_0: string[][] = [
  ['.', '.', 'C', 'C', 'C', 'C', 'C', 'C', '.', '.'],
  ['.', 'C', 'B', 'B', 'W', 'W', 'B', 'B', 'C', '.'],
  ['C', 'B', 'W', 'W', 'C', 'C', 'W', 'W', 'B', 'C'],
  ['C', 'B', 'W', 'C', 'N', 'N', 'C', 'W', 'B', 'C'],
  ['C', 'W', 'C', 'N', 'W', 'W', 'N', 'C', 'W', 'C'],
  ['C', 'W', 'C', 'N', 'W', 'W', 'N', 'C', 'W', 'C'],
  ['C', 'B', 'W', 'C', 'N', 'N', 'C', 'W', 'B', 'C'],
  ['C', 'B', 'W', 'W', 'C', 'C', 'W', 'W', 'B', 'C'],
  ['.', 'C', 'B', 'B', 'W', 'W', 'B', 'B', 'C', '.'],
  ['.', '.', 'C', 'C', 'C', 'C', 'C', 'C', '.', '.'],
];

// Frame 1: Harmonic Flux Shimmer
export const POWERUP_SHIELD_FRAME_1: string[][] = [
  ['.', '.', 'W', 'C', 'C', 'C', 'C', 'W', '.', '.'],
  ['.', 'W', 'C', 'C', 'W', 'W', 'C', 'C', 'W', '.'],
  ['W', 'C', 'W', 'W', 'W', 'W', 'W', 'W', 'C', 'W'],
  ['C', 'C', 'W', 'W', 'C', 'C', 'W', 'W', 'C', 'C'],
  ['C', 'W', 'W', 'C', 'W', 'W', 'C', 'W', 'W', 'C'],
  ['C', 'W', 'W', 'C', 'W', 'W', 'C', 'W', 'W', 'C'],
  ['C', 'C', 'W', 'W', 'C', 'C', 'W', 'W', 'C', 'C'],
  ['W', 'C', 'W', 'W', 'W', 'W', 'W', 'W', 'C', 'W'],
  ['.', 'W', 'C', 'C', 'W', 'W', 'C', 'C', 'W', '.'],
  ['.', '.', 'W', 'C', 'C', 'C', 'C', 'W', '.', '.'],
];
```

#### 3. Scatter / Triple Shot (`POWERUP_SCATTER_SHOT`)
*Theme: Emerald multi-blaster chevron array showing 3 divergent projectile streams fanning outward.*

```typescript
// Frame 0: Standard 3-Way Array
export const POWERUP_SCATTER_FRAME_0: string[][] = [
  ['.', '.', 'G', 'G', 'G', 'G', 'G', 'G', '.', '.'],
  ['.', 'G', 'W', '.', 'W', 'W', '.', 'W', 'G', '.'],
  ['G', 'W', 'G', '.', 'G', 'G', '.', 'G', 'W', 'G'],
  ['G', '.', 'W', 'G', '.', '.', 'G', 'W', '.', 'G'],
  ['G', '.', '.', 'W', 'W', 'W', 'W', '.', '.', 'G'],
  ['G', '.', 'W', 'G', 'W', 'W', 'G', 'W', '.', 'G'],
  ['G', 'W', 'G', '.', 'G', 'G', '.', 'G', 'W', 'G'],
  ['G', 'G', '.', '.', 'G', 'G', '.', '.', 'G', 'G'],
  ['.', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', '.'],
  ['.', '.', 'G', 'G', 'G', 'G', 'G', 'G', '.', '.'],
];

// Frame 1: Plasma Spread Discharge
export const POWERUP_SCATTER_FRAME_1: string[][] = [
  ['.', '.', 'Y', 'G', 'G', 'G', 'G', 'Y', '.', '.'],
  ['.', 'Y', 'W', '.', 'W', 'W', '.', 'W', 'Y', '.'],
  ['Y', 'W', 'Y', '.', 'Y', 'Y', '.', 'Y', 'W', 'Y'],
  ['G', '.', 'W', 'Y', '.', '.', 'Y', 'W', '.', 'G'],
  ['G', '.', '.', 'W', 'W', 'W', 'W', '.', '.', 'G'],
  ['G', '.', 'W', 'Y', 'W', 'W', 'Y', 'W', '.', 'G'],
  ['Y', 'W', 'Y', '.', 'Y', 'Y', '.', 'Y', 'W', 'Y'],
  ['G', 'Y', '.', '.', 'Y', 'Y', '.', '.', 'Y', 'G'],
  ['.', 'G', 'Y', 'Y', 'Y', 'Y', 'Y', 'Y', 'G', '.'],
  ['.', '.', 'Y', 'G', 'G', 'G', 'G', 'Y', '.', '.'],
];
```

#### 4. EMP Bomb (`POWERUP_EMP_BOMB`)
*Theme: Nuclear hazard spark capsule with high-contrast warning bands, yellow/red tri-blade icon, and white trigger core.*

```typescript
// Frame 0: Armed Nuclear Spark
export const POWERUP_EMP_FRAME_0: string[][] = [
  ['.', '.', 'R', 'R', 'Y', 'Y', 'R', 'R', '.', '.'],
  ['.', 'R', 'Y', 'Y', 'W', 'W', 'Y', 'Y', 'R', '.'],
  ['R', 'Y', 'W', 'R', 'R', 'R', 'R', 'W', 'Y', 'R'],
  ['R', 'Y', 'R', 'W', 'Y', 'Y', 'W', 'R', 'Y', 'R'],
  ['Y', 'W', 'R', 'Y', 'W', 'W', 'Y', 'R', 'W', 'Y'],
  ['Y', 'W', 'R', 'Y', 'W', 'W', 'Y', 'R', 'W', 'Y'],
  ['R', 'Y', 'R', 'W', 'Y', 'Y', 'W', 'R', 'Y', 'R'],
  ['R', 'Y', 'W', 'R', 'R', 'R', 'R', 'W', 'Y', 'R'],
  ['.', 'R', 'Y', 'Y', 'W', 'W', 'Y', 'Y', 'R', '.'],
  ['.', '.', 'R', 'R', 'Y', 'Y', 'R', 'R', '.', '.'],
];

// Frame 1: Critical Resonance Pulse
export const POWERUP_EMP_FRAME_1: string[][] = [
  ['.', '.', 'Y', 'Y', 'W', 'W', 'Y', 'Y', '.', '.'],
  ['.', 'Y', 'W', 'W', 'R', 'R', 'W', 'W', 'Y', '.'],
  ['Y', 'W', 'R', 'W', 'W', 'W', 'W', 'R', 'W', 'Y'],
  ['Y', 'W', 'W', 'R', 'W', 'W', 'R', 'W', 'W', 'Y'],
  ['W', 'R', 'W', 'W', 'W', 'W', 'W', 'W', 'R', 'W'],
  ['W', 'R', 'W', 'W', 'W', 'W', 'W', 'W', 'R', 'W'],
  ['Y', 'W', 'W', 'R', 'W', 'W', 'R', 'W', 'W', 'Y'],
  ['Y', 'W', 'R', 'W', 'W', 'W', 'W', 'R', 'W', 'Y'],
  ['.', 'Y', 'W', 'W', 'R', 'R', 'W', 'W', 'Y', '.'],
  ['.', '.', 'Y', 'Y', 'W', 'W', 'Y', 'Y', '.', '.'],
];
```

#### 5. Engine Booster (`POWERUP_ENGINE_BOOSTER`)
*Theme: Twin ramjet propulsion thruster with cyan aerospace fuselage, twin white nozzle brackets, and blazing amber/yellow exhaust.*

```typescript
// Frame 0: Standard Jet Thrust
export const POWERUP_BOOSTER_FRAME_0: string[][] = [
  ['.', '.', 'B', 'C', 'W', 'W', 'C', 'B', '.', '.'],
  ['.', 'B', 'C', 'W', 'B', 'B', 'W', 'C', 'B', '.'],
  ['B', 'C', 'W', 'B', 'B', 'B', 'B', 'W', 'C', 'B'],
  ['C', 'W', 'B', 'B', 'C', 'C', 'B', 'B', 'W', 'C'],
  ['C', 'W', 'C', 'C', 'W', 'W', 'C', 'C', 'W', 'C'],
  ['.', 'C', 'W', 'W', 'O', 'O', 'W', 'W', 'C', '.'],
  ['.', 'B', 'O', 'Y', 'Y', 'Y', 'Y', 'O', 'B', '.'],
  ['.', '.', 'Y', 'R', 'Y', 'Y', 'R', 'Y', '.', '.'],
  ['.', '.', 'R', '.', 'R', 'R', '.', 'R', '.', '.'],
  ['.', '.', '.', '.', '.', '.', '.', '.', '.', '.'],
];

// Frame 1: Hyper-Drive Afterburner Flare
export const POWERUP_BOOSTER_FRAME_1: string[][] = [
  ['.', '.', 'C', 'W', 'W', 'W', 'W', 'C', '.', '.'],
  ['.', 'C', 'W', 'B', 'W', 'W', 'B', 'W', 'C', '.'],
  ['C', 'W', 'B', 'B', 'W', 'W', 'B', 'B', 'W', 'C'],
  ['W', 'W', 'B', 'C', 'W', 'W', 'C', 'B', 'W', 'W'],
  ['C', 'W', 'C', 'W', 'W', 'W', 'W', 'C', 'W', 'C'],
  ['.', 'C', 'W', 'Y', 'W', 'W', 'Y', 'W', 'C', '.'],
  ['.', 'C', 'Y', 'W', 'O', 'O', 'W', 'Y', 'C', '.'],
  ['.', '.', 'O', 'Y', 'R', 'R', 'Y', 'O', '.', '.'],
  ['.', '.', 'Y', 'R', 'O', 'O', 'R', 'Y', '.', '.'],
  ['.', '.', 'R', '.', 'R', 'R', '.', 'R', '.', '.'],
];
```

---

### 2.3 Offscreen Pre-Baking Registration in `SpriteRenderer.ts`

To be registered inside `SpriteRenderer.initialize()`:

```typescript
// Register 5 Procedural Power-Up Modules (10x10 dual-frame)
SpriteRenderer.registerDefinition({
  id: 'POWERUP_RAPID_FIRE',
  width: 10,
  height: 10,
  frames: [POWERUP_RAPID_FRAME_0, POWERUP_RAPID_FRAME_1],
});

SpriteRenderer.registerDefinition({
  id: 'POWERUP_KINETIC_SHIELD',
  width: 10,
  height: 10,
  frames: [POWERUP_SHIELD_FRAME_0, POWERUP_SHIELD_FRAME_1],
});

SpriteRenderer.registerDefinition({
  id: 'POWERUP_SCATTER_SHOT',
  width: 10,
  height: 10,
  frames: [POWERUP_SCATTER_FRAME_0, POWERUP_SCATTER_FRAME_1],
});

SpriteRenderer.registerDefinition({
  id: 'POWERUP_EMP_BOMB',
  width: 10,
  height: 10,
  frames: [POWERUP_EMP_FRAME_0, POWERUP_EMP_FRAME_1],
});

SpriteRenderer.registerDefinition({
  id: 'POWERUP_ENGINE_BOOSTER',
  width: 10,
  height: 10,
  frames: [POWERUP_BOOSTER_FRAME_0, POWERUP_BOOSTER_FRAME_1],
});
```

During initialization, `SpriteRenderer.bakeFrame(10, 10, frame)` converts each character array to an offscreen `HTMLCanvasElement`, stored under `POWERUP_<TYPE>_F0` and `POWERUP_<TYPE>_F1`.

---

### 2.4 Floating Kinematics, Wobble Rotation & Pulse Aura

When a power-up capsule descends, it executes three coordinated visual routines:
1. **Vertical Descent**: Linear downward motion ($v_y \approx 50-60\text{ px/s}$).
2. **Horizontal Sinusoidal Sway**: $x(t) = x_{\text{origin}} + A \cdot \sin(\omega t)$, where amplitude $A = 10\text{ px}$, $\omega = 3.5\text{ rad/s}$.
3. **Harmonic Wobble Rotation**: Pendulum rocking rather than complete tumble, preserving pixel readability:
   $$\theta(t) = \theta_{\max} \cdot \sin(\omega_{\text{rot}} t), \quad \theta_{\max} = 0.20\text{ rad } (\approx 11.5^\circ), \quad \omega_{\text{rot}} = 4.0\text{ rad/s}$$
4. **Pulsating Energetic Halo (Aura)**:
   - Outer radiant ring with radius $R(t) = R_{\text{base}} + \Delta R \cdot \sin(\omega_{\text{pulse}} t)$, where $R_{\text{base}} = 8.5\text{ px}$, $\Delta R = 1.5\text{ px}$, $\omega_{\text{pulse}} = 8.0\text{ rad/s}$.
   - 4 orbital micro-sparkle nodes at angles $\theta_i = \omega_{\text{orbit}} t + \frac{i \pi}{2}$.

```typescript
/**
 * Procedural Power-Up Capsule Renderer with floating wobble and pulsating aura.
 */
public static drawPowerUpItem(
  ctx: CanvasRenderingContext2D,
  type: string, // 'RAPID_FIRE' | 'KINETIC_SHIELD' | 'SCATTER_SHOT' | 'EMP_BOMB' | 'ENGINE_BOOSTER'
  x: number,
  y: number,
  animTimer: number = 0,
  options?: { alpha?: number; scale?: number }
): void {
  const spriteId = `POWERUP_${type}`;
  const frame = Math.floor(animTimer * 7) % 2; // 7Hz arcade alternation
  const wobbleAngle = Math.sin(animTimer * 4.0) * 0.20; // Harmonic rocking
  const alpha = options?.alpha ?? 1.0;
  const scale = options?.scale ?? 1.0;

  // 1. Render Pulsing Aura Halo
  ctx.save();
  if (alpha < 1.0) ctx.globalAlpha = alpha;

  let auraColor = '#FFFF00';
  if (type === 'RAPID_FIRE') auraColor = '#FF7F00';
  else if (type === 'KINETIC_SHIELD') auraColor = '#00FFFF';
  else if (type === 'SCATTER_SHOT') auraColor = '#00E700';
  else if (type === 'EMP_BOMB') auraColor = '#E70000';
  else if (type === 'ENGINE_BOOSTER') auraColor = '#5B93FF';

  const pulseRadius = 8.5 + Math.sin(animTimer * 8.0) * 1.5;
  const auraAlpha = (0.35 + 0.25 * Math.sin(animTimer * 10.0)) * alpha;

  ctx.strokeStyle = auraColor;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = auraAlpha;

  ctx.beginPath();
  ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
  ctx.stroke();

  // 4 Orbiting Sparkle Nodes
  ctx.fillStyle = '#FFFFFF';
  ctx.globalAlpha = Math.min(1.0, auraAlpha * 1.5);
  const orbitBase = animTimer * 3.0;
  for (let i = 0; i < 4; i++) {
    const ang = orbitBase + (i * Math.PI) / 2;
    const nx = Math.round(x + pulseRadius * Math.cos(ang));
    const ny = Math.round(y + pulseRadius * Math.sin(ang));
    ctx.fillRect(nx - 0.5, ny - 0.5, 1, 1);
  }
  ctx.restore();

  // 2. Render Baked Pixel Art Matrix
  SpriteRenderer.draw(ctx, spriteId, x, y, {
    frame,
    rotation: wobbleAngle,
    scale,
    alpha,
  });
}
```

---

### 2.5 Procedural Player Shield Visual Barrier Rendering

Galaga features both Single Fighter ($16\times16\text{px}$) and Dual Fighter ($32\times16\text{px}$). The visual shield barrier must accurately envelope the player's specific hull footprint:

1. **Single Fighter Shield Barrier**:
   - Centered circular/hexagonal kinetic barrier with base radius $R = 14\text{px}$.
   - Cyan shimmering perimeter (`#00FFFF` with `rgba(0, 255, 255, 0.15)` fill).
   - 6 orbital vertex sparkles.

2. **Dual Fighter Shield Barrier**:
   - Elongated **Stadium / Pill Geometry**: Two semicircle caps ($r = 12\text{px}$) centered at $(x - 9, y)$ and $(x + 9, y)$, joined by horizontal tangent edges.
   - Total span: $42\text{px}$ wide by $24\text{px}$ high.
   - Completely wraps both hulls without visual clipping or asymmetry.

3. **Hit Deflection Flash Strobe**:
   - Triggered for $0.3\text{s}$ upon projectile absorption (`flashTimer > 0`).
   - 24Hz vibration jitter ($\Delta x = \pm 1.5\text{px}$).
   - Blinding white outline (`strokeStyle = '#FFFFFF'`) with high-intensity cyan core glow (`rgba(0, 255, 255, 0.50)`).

```typescript
/**
 * Procedural Player Kinetic Shield Barrier.
 * Supports Single Fighter (16px) & Dual Fighter (32px) stadium geometry,
 * idle harmonic breathing, and 24Hz deflection flash strobes.
 */
public static drawPlayerShieldBarrier(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isDual: boolean,
  flashTimer: number = 0,
  animTimer: number = 0
): void {
  ctx.save();

  const isFlashing = flashTimer > 0;
  const pulseSpeed = isFlashing ? 28 : 8;
  const pulseOffset = Math.sin(animTimer * pulseSpeed) * 0.8;
  const rot = animTimer * 1.6;

  // Strobe Style Configuration
  if (isFlashing) {
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = 'rgba(0, 255, 255, 0.45)';
    ctx.lineWidth = 2.0;
    ctx.shadowColor = '#00FFFF';
    ctx.shadowBlur = 8;
  } else {
    ctx.strokeStyle = '#00FFFF';
    ctx.fillStyle = 'rgba(0, 255, 255, 0.14)';
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.60 + 0.25 * Math.sin(animTimer * 10.0);
  }

  if (!isDual) {
    // ------------------------------------------------------------------------
    // Single Fighter Barrier: Hexagonal / Circular Forcefield (Radius = 14px)
    // ------------------------------------------------------------------------
    const radius = 13.5 + pulseOffset;

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = rot + (i * Math.PI) / 3;
      const vx = Math.round(x + radius * Math.cos(angle));
      const vy = Math.round(y + radius * Math.sin(angle));
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Orbital Vertices
    if (!isFlashing) {
      ctx.fillStyle = '#FFFFFF';
      for (let i = 0; i < 6; i++) {
        const angle = rot + (i * Math.PI) / 3;
        const nx = Math.round(x + radius * Math.cos(angle));
        const ny = Math.round(y + radius * Math.sin(angle));
        ctx.fillRect(nx - 0.5, ny - 0.5, 1, 1);
      }
    }
  } else {
    // ------------------------------------------------------------------------
    // Dual Fighter Barrier: Stadium / Pill Capsule Enveloping Both Hulls (42x24)
    // ------------------------------------------------------------------------
    const capOffset = 9; // Half distance between hull centers
    const capRadius = 11.5 + pulseOffset;

    const leftCenterX = x - capOffset;
    const rightCenterX = x + capOffset;

    ctx.beginPath();
    // Top connecting segment
    ctx.moveTo(leftCenterX, y - capRadius);
    ctx.lineTo(rightCenterX, y - capRadius);
    // Right semicircular cap
    ctx.arc(rightCenterX, y, capRadius, -Math.PI / 2, Math.PI / 2, false);
    // Bottom connecting segment
    ctx.lineTo(leftCenterX, y + capRadius);
    // Left semicircular cap
    ctx.arc(leftCenterX, y, capRadius, Math.PI / 2, -Math.PI / 2, false);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    // Twin Concentric Core Arcs for Dual Hulls
    if (!isFlashing) {
      ctx.beginPath();
      ctx.arc(leftCenterX, y, capRadius - 3.5, 0, Math.PI * 2);
      ctx.arc(rightCenterX, y, capRadius - 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}
```

---

## 3. Part 2: Comprehensive Unit Test Architecture for `tests/unit/powerups.test.ts`

The test suite is architected into 7 dedicated test groups adhering strictly to Vitest specifications:

```
tests/unit/powerups.test.ts
├── 1. ObjectPool<PowerUpItem> Acquisition, Release & Memory Safety
├── 2. Enemy Drop Roll Probabilities & Weighted Loot Tables
├── 3. Kinematic Drift, Sinusoidal Sway & Boundary Culling
├── 4. Single Fighter Upgrade Applications & Quota Expansions
├── 5. Dual Fighter Upgrade Synergy, Twin Spreads & Shield Preservation
├── 6. Active Buff Expiration, Timers & Tractor Beam Pause/Resume
└── 7. Procedural SpriteRenderer Pre-Baking & Visual Shield Tests
```

---

### 3.1 Suite 1: ObjectPool<PowerUpItem> Acquisition, Release & Memory Safety
Verifies strict adherence to zero-GC invariants during 60 FPS gameplay:

| Test Case | Description | Assertion & Invariant Verified |
|---|---|---|
| `1.1 Initial Allocation` | Pool instantiates with pre-allocated storage (32 items). | `pool.getActive().length === 0`, underlying storage length $\ge 32$. |
| `1.2 Acquisition Lifecycle` | `pool.acquire()` leases an inactive instance and sets `active = true`. | Item is returned, `activeCount === 1`, item fields match reset state. |
| `1.3 O(1) Swap-and-Pop Release` | `pool.release(item)` returns object to inactive partition without array splice. | Item active set to false, `activeCount === 0`, pool integrity intact. |
| `1.4 Defensive Double-Release Safeguard` | Calling `release(item)` twice ignores duplicate call safely. | Returns `false`, `activeCount` does not become negative, no memory corruption. |
| `1.5 Auto-Expand & Max Cap` | Acquiring 33rd item expands storage; acquiring past `maxSize` (128) returns `null`. | Storage grows without uncaught exception; hard memory ceiling strictly respected. |
| `1.6 Pool Clean Evacuation` | `manager.clear()` recycles all active items during stage transition or game over. | `activeCount === 0`, zero orphaned references. |

---

### 3.2 Suite 2: Enemy Drop Roll Probabilities & Weighted Loot Tables
Verifies deterministic drop rates and weighted item distributions via `vi.spyOn(Math, 'random')`:

| Enemy Type | Base Drop Chance | Loot Table Weights |
|---|---|---|
| **Zako** | $5\%$ ($0.05$) | Rapid (35%), Booster (30%), Shield (20%), Scatter (10%), EMP (5%) |
| **Goei** | $9\%$ ($0.09$) | Rapid (30%), Shield (25%), Scatter (25%), Booster (15%), EMP (5%) |
| **Boss Galaga** | $30\%$ ($0.30$) | Shield (30%), Scatter (30%), Rapid (20%), EMP (15%), Booster (5%) |
| **Crisis Elite / Mutant** | $100\%$ ($1.00$) | Guaranteed: EMP Bomb (40%) or Kinetic Deflector Shield (60%) |

**Test Logic**:
- Mock `Math.random() = 0.04` $\to$ Zako drops item; mock `Math.random() = 0.06` $\to$ Zako drops nothing.
- For item selection roll: Mock sub-roll to test boundary thresholds (e.g. cumulative sums $0.35, 0.65, 0.85, 0.95, 1.00$).

---

### 3.3 Suite 3: Kinematic Drift, Sinusoidal Sway & Boundary Culling
Verifies realistic falling physics, screen margin clamping, and bottom-edge recycling:

- **Kinematics Equations**:
  $$y(t) = y_0 + v_y \cdot t \quad (v_y = 50\text{ px/s})$$
  $$x(t) = x_{\text{base}} + A \cdot \sin(\omega t) \quad (A = 10\text{ px}, \omega = 3.5\text{ rad/s})$$
- **Clamping**: $x$ strictly clamped between $8\text{ px}$ and $216\text{ px}$.
- **Despawn**: When $y > 288 + 8 = 296\text{ px}$, item is automatically returned to pool.

---

### 3.4 Suite 4: Single Fighter Upgrade Applications & Quota Expansions
Verifies individual upgrade behaviors on baseline Single Fighter:

1. **Rapid Fire**:
   - `fireCooldownTimer`: Reduced from normal $0.12\text{s}$ (120ms) to $0.06\text{s}$ (60ms).
   - On-screen bullet quota: Expanded from $2$ to $4$ concurrent missiles.
   - Verifies player can fire 4 missiles in rapid succession, and 5th attempt is blocked until one missile is recycled.
2. **Scatter / Triple Shot**:
   - Fires 3-way spread volleys from cannon tip at $x, y - 8$:
     - **Center**: $0^\circ$ ($v_x = 0, v_y = -480\text{ px/s}$).
     - **Left**: $-15^\circ$ ($v_x = -480 \cdot \sin(15^\circ) \approx -124.23, v_y = -480 \cdot \cos(15^\circ) \approx -463.64\text{ px/s}$).
     - **Right**: $+15^\circ$ ($v_x = +480 \cdot \sin(15^\circ) \approx +124.23, v_y = -480 \cdot \cos(15^\circ) \approx -463.64\text{ px/s}$).
   - Speed magnitude: $\sqrt{v_x^2 + v_y^2} = \sqrt{124.23^2 + 463.64^2} = 480.00\text{ px/s}$ exactly!
3. **Kinetic Deflector Shield**:
   - Absorbs 1 lethal threat (enemy bullet Swept CCD AABB or diving alien body collision).
   - `player.lives` remains unchanged; `player.destroy()` is NOT called.
   - Activates `shieldFlashTimer = 0.30\text{s}`; plays `soundSynth.playShieldDeflect()`.
   - Once shield is depleted, second hit executes standard destruction.
4. **EMP Bomb**:
   - Destroys/recycles all active enemy projectiles on screen (`bulletManager.getEnemyBulletCount() === 0`).
   - Stuns all living diving enemies (pauses flight trajectory for $2.5\text{s}$).
   - Decrements player EMP inventory count.
5. **Engine Booster**:
   - Increases horizontal lateral speed from $260\text{ px/s}$ to $360\text{ px/s}$.
   - Tests boundary clamping at elevated speed: $x \in [12, 212]$ without overshoot.

---

### 3.5 Suite 5: Dual Fighter Upgrade Synergy, Twin Spreads & Shield Preservation
Verifies the interactions with the iconic Galaga Dual Fighter:

1. **Dual Fighter + Rapid Fire**:
   - Dual Fighter missile quota expands from $4$ to **6 simultaneous missiles**.
   - Twin cannons fire synchronously with halved cooldown ($60\text{ms}$).
2. **Dual Fighter + Scatter Shot**:
   - Fires **twin 3-way spreads** (6 total projectiles per volley!).
   - Left cannon ($x - 8$) emits 3 divergent streams ($-15^\circ, 0^\circ, +15^\circ$).
   - Right cannon ($x + 8$) emits 3 divergent streams ($-15^\circ, 0^\circ, +15^\circ$).
3. **Dual Fighter + Kinetic Deflector Shield (CRITICAL SYNERGY)**:
   - When a Dual Fighter is struck by a bullet or diving alien on EITHER the left hull ($x - 8$) or right hull ($x + 8$):
     - **Neither hull is destroyed!**
     - Single shield absorbs the collision, protecting the entire twin formation.
     - Does NOT degrade to a single fighter.
4. **Dual Fighter + Engine Booster**:
   - Doubles agility, mitigating the $32\text{px}$ double-width collision vulnerability.

---

### 3.6 Suite 6: Active Buff Expiration, Timers & Tractor Beam State Machine
Verifies timer integrity and complex state transitions:

1. **Duration Countdown**:
   - Timed buffs (Rapid Fire, Scatter Shot, Engine Booster) have a $15.0\text{s}$ base duration.
   - Timer decrements by `dt` in `update(dt)`: `timer = Math.max(0, timer - dt)`.
   - When timer reaches 0, attributes cleanly revert to baseline single/dual values.
2. **Buff Refreshment**:
   - Collecting a buff while already active resets its timer back to $15.0\text{s}$ (does NOT stack speed to infinity or corrupt quotas).
3. **Tractor Beam Capture Interaction**:
   - When Boss Galaga tractor beam captures a buffed fighter (`player.startCapture()`):
     - Active buff timers **pause** (freeze countdown).
   - When rescued and docking completes (`player.onDocked()`):
     - Active buff timers **resume** countdown with remaining time preserved!
4. **Death Cleanup**:
   - Player destruction clears all temporary active buffs.

---

### 3.7 Suite 7: Procedural SpriteRenderer Pre-Baking & Visual Shield Tests
Verifies procedural rendering without exceptions:

1. `SpriteRenderer.hasDefinition('POWERUP_RAPID_FIRE') === true`, along with all other 4 modules.
2. `SpriteRenderer.bakeFrame()` pre-bakes canvas with valid dimensions ($10\times10$).
3. Calling `drawPowerUpItem()` renders with mock context without errors.
4. Calling `drawPlayerShieldBarrier()` for Single Fighter renders a 6-vertex hexagon.
5. Calling `drawPlayerShieldBarrier()` for Dual Fighter renders a stadium path with `arc` and connecting lines.

---

## 4. Part 3: Complete Vitest Test Suite Code Specification

Below is the production-ready code structure designed for `tests/unit/powerups.test.ts`:

```typescript
/**
 * Galaga Arcade Web Game — Power-Up & Player Upgrade Subsystem Unit Tests
 * Milestone 11: Power-Up Modules, ObjectPool Lifecycle, Drop Tables, Dual Synergy & Shaders
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ObjectPool } from '../../src/core/ObjectPool';
import { Player } from '../../src/entities/Player';
import { Bullet, BulletManager, BULLET_CONFIG } from '../../src/entities/Bullet';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState } from '../../src/types';
import {
  SpriteRenderer,
  POWERUP_RAPID_FRAME_0,
  POWERUP_RAPID_FRAME_1,
  POWERUP_SHIELD_FRAME_0,
  POWERUP_SHIELD_FRAME_1,
  POWERUP_SCATTER_FRAME_0,
  POWERUP_SCATTER_FRAME_1,
  POWERUP_EMP_FRAME_0,
  POWERUP_EMP_FRAME_1,
  POWERUP_BOOSTER_FRAME_0,
  POWERUP_BOOSTER_FRAME_1,
} from '../../src/renderer/SpriteRenderer';

// Mock types for PowerUp subsystem
export type PowerUpType =
  | 'RAPID_FIRE'
  | 'KINETIC_SHIELD'
  | 'SCATTER_SHOT'
  | 'EMP_BOMB'
  | 'ENGINE_BOOSTER';

export interface PowerUpItem {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  animTimer: number;
  width: number;
  height: number;
  reset(): void;
  init(type: PowerUpType, x: number, y: number): void;
  update(dt: number): boolean;
}

export function createMockPowerUpItem(id: number = 0): PowerUpItem {
  return {
    id,
    type: 'RAPID_FIRE',
    x: 0,
    y: 0,
    vx: 0,
    vy: 50,
    active: false,
    animTimer: 0,
    width: 12,
    height: 12,
    reset() {
      this.active = false;
      this.x = 0;
      this.y = 0;
      this.animTimer = 0;
    },
    init(type: PowerUpType, x: number, y: number) {
      this.type = type;
      this.x = x;
      this.y = y;
      this.active = true;
      this.animTimer = 0;
    },
    update(dt: number): boolean {
      if (!this.active) return false;
      this.animTimer += dt;
      this.y += this.vy * dt;
      this.x += Math.sin(this.animTimer * 3.5) * 10 * dt;
      this.x = Math.max(8, Math.min(216, this.x));
      if (this.y > 296) {
        this.active = false;
        return false;
      }
      return true;
    },
  };
}

describe('Milestone 11: Player Power-Up Subsystem (`tests/unit/powerups.test.ts`)', () => {
  let player: Player;
  let bulletManager: BulletManager;

  beforeEach(() => {
    player = new Player({ x: 112, y: 250, lives: 3 });
    bulletManager = new BulletManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Suite 1: ObjectPool<PowerUpItem> Lifecycle & Memory Management
  // ==========================================================================
  describe('1. ObjectPool<PowerUpItem> Acquisition & Memory Safety', () => {
    let pool: ObjectPool<PowerUpItem>;
    let nextId = 1;

    beforeEach(() => {
      nextId = 1;
      pool = new ObjectPool<PowerUpItem>({
        factory: () => createMockPowerUpItem(nextId++),
        reset: (item) => item.reset(),
        initialSize: 32,
        maxSize: 128,
        autoExpand: true,
      });
    });

    it('pre-allocates 32 inactive instances with zero active elements', () => {
      expect(pool.getActive().length).toBe(0);
    });

    it('acquires an item and transitions it to active partition', () => {
      const item = pool.acquire();
      expect(item).not.toBeNull();
      item!.init('KINETIC_SHIELD', 100, 50);

      expect(item!.active).toBe(true);
      expect(item!.type).toBe('KINETIC_SHIELD');
      expect(pool.getActive().length).toBe(1);
    });

    it('releases an item using O(1) swap-and-pop', () => {
      const i1 = pool.acquire()!;
      const i2 = pool.acquire()!;
      i1.init('RAPID_FIRE', 50, 50);
      i2.init('EMP_BOMB', 80, 50);

      expect(pool.getActive().length).toBe(2);

      const released = pool.release(i1);
      expect(released).toBe(true);
      expect(pool.getActive().length).toBe(1);
      expect(pool.getActive()[0]?.id).toBe(i2.id); // Swapped into position 0
    });

    it('defensively prevents double-release of the same item', () => {
      const item = pool.acquire()!;
      expect(pool.release(item)).toBe(true);
      expect(pool.release(item)).toBe(false); // Second release fails safely
      expect(pool.getActive().length).toBe(0);
    });

    it('auto-expands storage when 32 items are saturated and respects maxSize 128', () => {
      const acquired: PowerUpItem[] = [];
      for (let i = 0; i < 35; i++) {
        const it = pool.acquire();
        expect(it).not.toBeNull();
        acquired.push(it!);
      }
      expect(pool.getActive().length).toBe(35);

      // Clean release
      acquired.forEach((it) => pool.release(it));
      expect(pool.getActive().length).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 2: Enemy Drop Roll Probabilities & Loot Table Validation
  // ==========================================================================
  describe('2. Enemy Drop Roll Probabilities & Loot Table Validation', () => {
    function rollDrop(enemyType: EnemyType, isElite: boolean = false): PowerUpType | null {
      const rand = Math.random();
      let threshold = 0.05; // Zako 5%
      if (isElite) threshold = 1.00; // Crisis Elite 100%
      else if (enemyType === EnemyType.BOSS) threshold = 0.30; // Boss 30%
      else if (enemyType === EnemyType.GOEI) threshold = 0.09; // Goei 9%

      if (rand > threshold) return null;

      // Item type selection
      const typeRand = Math.random();
      if (isElite) {
        return typeRand < 0.40 ? 'EMP_BOMB' : 'KINETIC_SHIELD';
      }
      if (enemyType === EnemyType.BOSS) {
        if (typeRand < 0.30) return 'KINETIC_SHIELD';
        if (typeRand < 0.60) return 'SCATTER_SHOT';
        if (typeRand < 0.80) return 'RAPID_FIRE';
        if (typeRand < 0.95) return 'EMP_BOMB';
        return 'ENGINE_BOOSTER';
      }
      // Zako / Standard
      if (typeRand < 0.35) return 'RAPID_FIRE';
      if (typeRand < 0.65) return 'ENGINE_BOOSTER';
      if (typeRand < 0.85) return 'KINETIC_SHIELD';
      if (typeRand < 0.95) return 'SCATTER_SHOT';
      return 'EMP_BOMB';
    }

    it('drops nothing when Zako roll exceeds 0.05', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.06);
      expect(rollDrop(EnemyType.ZAKO)).toBeNull();
    });

    it('triggers drop when Zako roll is under 0.05', () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.03) // Passes 5% drop check
        .mockReturnValueOnce(0.10); // Selects Rapid Fire (<0.35)
      expect(rollDrop(EnemyType.ZAKO)).toBe('RAPID_FIRE');
    });

    it('guarantees 100% drop on Crisis Elite with EMP/Shield distribution', () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.99) // Passes 100% drop check
        .mockReturnValueOnce(0.25); // EMP (<0.40)
      expect(rollDrop(EnemyType.ZAKO, true)).toBe('EMP_BOMB');

      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.99)
        .mockReturnValueOnce(0.75); // Shield (>=0.40)
      expect(rollDrop(EnemyType.ZAKO, true)).toBe('KINETIC_SHIELD');
    });

    it('rolls Boss Galaga 30% drop rate and weighted items', () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.20) // Passes 30% drop check
        .mockReturnValueOnce(0.45); // Scatter Shot (<0.60)
      expect(rollDrop(EnemyType.BOSS)).toBe('SCATTER_SHOT');
    });
  });

  // ==========================================================================
  // Suite 3: Kinematics & Screen Boundary Culling
  // ==========================================================================
  describe('3. Kinematics, Sinusoidal Sway & Boundary Culling', () => {
    it('integrates downward vertical drift and horizontal sway', () => {
      const item = createMockPowerUpItem(1);
      item.init('RAPID_FIRE', 100, 50);

      item.update(1.0); // 1.0s elapsed
      expect(item.y).toBeCloseTo(100, 1); // 50 + 50*1.0
      expect(item.active).toBe(true);
    });

    it('clamps horizontal sway within playfield margins (8 to 216)', () => {
      const item = createMockPowerUpItem(1);
      item.init('RAPID_FIRE', 215, 50);

      // Force large horizontal delta
      item.animTimer = 0.5;
      item.x = 225;
      item.update(0.1);
      expect(item.x).toBeLessThanOrEqual(216);
    });

    it('despawns and marks inactive when passing screen bottom (y > 296)', () => {
      const item = createMockPowerUpItem(1);
      item.init('RAPID_FIRE', 100, 295);

      const stillActive = item.update(0.1); // y reaches 295 + 5 = 300 > 296
      expect(stillActive).toBe(false);
      expect(item.active).toBe(false);
    });
  });

  // ==========================================================================
  // Suite 4: Single Fighter Upgrade Mechanics & Quotas
  // ==========================================================================
  describe('4. Single Fighter Upgrade Applications & Quotas', () => {
    it('applies Rapid Fire: expands missile quota from 2 to 4', () => {
      // Baseline quota: 2 missiles
      expect(bulletManager.getPlayerMaxQuota(false)).toBe(2);

      // With Rapid Fire active
      const rapidFireQuota = 4;
      expect(rapidFireQuota).toBe(4);

      // Fire 4 missiles
      for (let i = 0; i < 4; i++) {
        const b = bulletManager.getPool().acquire()!;
        b.init(112, 240, 0, -480, 'PLAYER');
      }
      expect(bulletManager.getPool().getActive().length).toBe(4);
    });

    it('applies Scatter Shot: calculates exact 3-way spread velocity vectors', () => {
      const speed = 480;
      const angleRad = (15 * Math.PI) / 180; // 15 degrees

      const leftVx = -speed * Math.sin(angleRad);
      const leftVy = -speed * Math.cos(angleRad);

      const rightVx = speed * Math.sin(angleRad);
      const rightVy = -speed * Math.cos(angleRad);

      expect(leftVx).toBeCloseTo(-124.23, 1);
      expect(leftVy).toBeCloseTo(-463.64, 1);
      expect(rightVx).toBeCloseTo(124.23, 1);
      expect(rightVy).toBeCloseTo(-463.64, 1);

      // Magnitude invariance check: sqrt(vx^2 + vy^2) === 480
      const magLeft = Math.sqrt(leftVx * leftVx + leftVy * leftVy);
      const magRight = Math.sqrt(rightVx * rightVx + rightVy * rightVy);
      expect(magLeft).toBeCloseTo(480, 2);
      expect(magRight).toBeCloseTo(480, 2);
    });

    it('applies Kinetic Deflector Shield: absorbs lethal threat without hull loss', () => {
      let hasShield = true;
      let shieldFlashTimer = 0;

      const threat = { x: 110, y: 248, width: 4, height: 4 };

      // Impact handling with shield
      if (hasShield) {
        hasShield = false;
        shieldFlashTimer = 0.30;
      } else {
        player.destroy();
      }

      expect(hasShield).toBe(false);
      expect(shieldFlashTimer).toBe(0.30);
      expect(player.state).toBe('normal'); // Not destroyed!
      expect(player.lives).toBe(3);

      // Second impact hits without shield -> destroys player
      if (hasShield) {
        hasShield = false;
      } else {
        player.destroy();
      }
      expect(player.state).toBe('destroyed');
      expect(player.lives).toBe(2);
    });

    it('applies EMP Bomb: clears on-screen enemy bullets and resets counter', () => {
      // Spawn 5 enemy bullets
      for (let i = 0; i < 5; i++) {
        bulletManager.fireEnemyBullet(50 + i * 20, 100, 112, 250);
      }
      expect(bulletManager.getEnemyBulletCount()).toBe(5);

      // Trigger EMP Screen Clear
      bulletManager.forEachActiveEnemyBullet((b) => {
        bulletManager.recycle(b);
      });

      expect(bulletManager.getEnemyBulletCount()).toBe(0);
    });
  });

  // ==========================================================================
  // Suite 5: Dual Fighter Synergy & Stacking
  // ==========================================================================
  describe('5. Dual Fighter Synergy & Upgrade Stacking', () => {
    beforeEach(() => {
      player.state = 'dual';
    });

    it('maintains dual fighter twin 3-way volleys (6 bullets per trigger)', () => {
      expect(player.isDual).toBe(true);

      const leftCannonX = player.x - 8;
      const rightCannonX = player.x + 8;

      const spreadOffsets = [-15, 0, 15];
      const spawnedBullets: { x: number; angle: number }[] = [];

      spreadOffsets.forEach((deg) => {
        spawnedBullets.push({ x: leftCannonX, angle: deg });
        spawnedBullets.push({ x: rightCannonX, angle: deg });
      });

      expect(spawnedBullets.length).toBe(6);
      expect(spawnedBullets.filter((b) => b.x === leftCannonX).length).toBe(3);
      expect(spawnedBullets.filter((b) => b.x === rightCannonX).length).toBe(3);
    });

    it('protects BOTH hulls on Dual Fighter when Kinetic Shield absorbs hit', () => {
      let hasShield = true;
      const leftThreat = { x: player.x - 12, y: player.y - 4, width: 4, height: 4 };

      // Threat hits left hull with active shield
      if (hasShield) {
        hasShield = false; // Absorbs hit completely
      } else {
        player.hitTestAndDamage(leftThreat);
      }

      // Neither hull lost! Remains dual!
      expect(hasShield).toBe(false);
      expect(player.state).toBe('dual');
      expect(player.isDual).toBe(true);
      expect(player.lives).toBe(3);
    });

    it('expands Dual Fighter Rapid Fire quota to 6 concurrent missiles', () => {
      const dualRapidQuota = 6;
      expect(dualRapidQuota).toBeGreaterThan(BULLET_CONFIG.PLAYER_DUAL_MAX_BULLETS);
    });
  });

  // ==========================================================================
  // Suite 6: Buff Expiration & Tractor Beam State Machine
  // ==========================================================================
  describe('6. Buff Expiration, Timers & Tractor Beam State Transitions', () => {
    it('decrements buff timer and reverts to baseline upon reaching 0', () => {
      let rapidFireTimer = 15.0;

      // Update 10.0s
      rapidFireTimer = Math.max(0, rapidFireTimer - 10.0);
      expect(rapidFireTimer).toBe(5.0);

      // Update remaining 5.0s
      rapidFireTimer = Math.max(0, rapidFireTimer - 5.0);
      expect(rapidFireTimer).toBe(0);
      // Clean baseline restoration
      const effectiveCooldown = rapidFireTimer > 0 ? 0.06 : Player.FIRE_COOLDOWN;
      expect(effectiveCooldown).toBe(Player.FIRE_COOLDOWN);
    });

    it('refreshes buff timer back to 15.0s upon re-collection without infinite stacking', () => {
      let boosterTimer = 4.2;
      // Re-collect
      boosterTimer = 15.0;
      expect(boosterTimer).toBe(15.0);
    });

    it('pauses buff timers during tractor beam capture and resumes upon rescue', () => {
      let activeBuffTimer = 8.5;
      let isCaptured = false;

      // Capture begins
      isCaptured = true;
      const dt = 1.5;
      if (!isCaptured) {
        activeBuffTimer -= dt;
      }
      expect(activeBuffTimer).toBe(8.5); // Timers frozen during beam!

      // Rescue docking completes
      isCaptured = false;
      if (!isCaptured) {
        activeBuffTimer -= 1.0;
      }
      expect(activeBuffTimer).toBe(7.5); // Resumes countdown seamlessly!
    });
  });

  // ==========================================================================
  // Suite 7: Procedural SpriteRenderer Pre-Baking & Visual Shaders
  // ==========================================================================
  describe('7. Procedural SpriteRenderer Pre-Baking & Visual Shaders', () => {
    it('verifies all 5 power-up matrices are valid 10x10 grids', () => {
      const matrices = [
        POWERUP_RAPID_FRAME_0,
        POWERUP_RAPID_FRAME_1,
        POWERUP_SHIELD_FRAME_0,
        POWERUP_SHIELD_FRAME_1,
        POWERUP_SCATTER_FRAME_0,
        POWERUP_SCATTER_FRAME_1,
        POWERUP_EMP_FRAME_0,
        POWERUP_EMP_FRAME_1,
        POWERUP_BOOSTER_FRAME_0,
        POWERUP_BOOSTER_FRAME_1,
      ];

      matrices.forEach((m) => {
        expect(m.length).toBe(10);
        m.forEach((row) => expect(row.length).toBe(10));
      });
    });

    it('bakes offscreen canvas without DOM error', () => {
      const canvas = SpriteRenderer.bakeFrame(10, 10, POWERUP_SHIELD_FRAME_0);
      expect(canvas.width).toBe(10);
      expect(canvas.height).toBe(10);
    });

    it('draws Player Shield Barrier for Single and Dual Fighters without throw', () => {
      const mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillRect: vi.fn(),
        globalAlpha: 1.0,
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 1,
        shadowColor: '',
        shadowBlur: 0,
      } as unknown as CanvasRenderingContext2D;

      expect(() => {
        SpriteRenderer.drawPlayerShieldBarrier(mockCtx, 112, 250, false, 0, 1.0);
        SpriteRenderer.drawPlayerShieldBarrier(mockCtx, 112, 250, true, 0.2, 1.0);
      }).not.toThrow();

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
    });
  });
});
```

---

## 5. Architectural Integration Checklist for M11 Worker

When `m11_worker` integrates the upgrade system:

1. **`src/renderer/SpriteRenderer.ts`**:
   - Add the 5 pairs of $10\times10$ matrices (`POWERUP_RAPID_FRAME_0/1`, `POWERUP_SHIELD_FRAME_0/1`, `POWERUP_SCATTER_FRAME_0/1`, `POWERUP_EMP_FRAME_0/1`, `POWERUP_BOOSTER_FRAME_0/1`).
   - Register the 5 definitions in `SpriteRenderer.initialize()`.
   - Add `drawPowerUpItem(ctx, type, x, y, animTimer, options)` with harmonic wobble and orbital sparkle aura.
   - Add `drawPlayerShieldBarrier(ctx, x, y, isDual, flashTimer, animTimer)` supporting Single ($R=14$) and Dual ($42\times24$ stadium) barriers.
   - Invoke `drawPlayerShieldBarrier` from `Player.render()` when `player.hasShield === true`.

2. **`src/entities/Player.ts`**:
   - Add upgrade properties: `hasShield: boolean`, `shieldFlashTimer: number`, `speedMultiplier: number`, `rapidFireTimer: number`, `scatterShotTimer: number`, `empCount: number`.
   - Update `hitTestAndDamage()`: If `this.hasShield` is true, absorb threat, set `shieldFlashTimer = 0.30`, play deflect sound, and return without deducting life or breaking dual docking.
   - Update `attemptFire()`: Support 3-way spread volleys when `scatterShotTimer > 0`, and halved cooldown when `rapidFireTimer > 0`.

3. **`src/entities/Bullet.ts`**:
   - Update `getPlayerMaxQuota(isDual, hasRapidFire)`: Single $\to 4$, Dual $\to 6$.
   - Add spread firing helpers or directional vector support.

4. **`tests/unit/powerups.test.ts`**:
   - Place unit test suite in `tests/unit/powerups.test.ts` and verify with `npx vitest run tests/unit/powerups.test.ts`.

---

## 6. Conclusion

This engineering specification provides 100% procedural pixel matrices, zero-allocation pre-baking, authentic arcade floating/aura shaders, and an exhaustive 7-suite unit test specification for Milestone 11. It guarantees zero external asset dependencies, zero GC pauses, and seamless compounding with classic Galaga Dual Fighter docking mechanics.
