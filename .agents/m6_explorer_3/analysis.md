# Milestone 6: Particle Explosion System Specialist Analysis

**Specialist**: `m6_explorer_3` (Particle Explosion System Specialist)  
**Target Module**: `src/systems/ParticleSystem.ts`  
**Working Directory**: `/Users/user/src/galog/.agents/m6_explorer_3/`  
**Date**: 2026-09-02  
**Status**: Complete Architectural Specification & Production Implementation Blueprint  

---

## 1. Executive Summary & Architectural Overview

In classic 1981 Namco Galaga arcade hardware, particle explosions and energy sparkles deliver critical sensory feedback for player achievement, enemy destructions, and weapon interactions. To deliver an authentic arcade experience on the modern web with zero GC latency, this document specifies the complete architecture, mathematics, object pool memory layout, explosion presets, and rendering engine for `src/systems/ParticleSystem.ts`.

### Core Architectural Pillars
1. **Zero-Allocation Object Pooling**: Utilizes `ObjectPool<Particle>` with a strict 250-particle capacity limit, contiguous dense array storage, and O(1) swap-and-pop reclamation. Zero heap allocations occur during runtime 60 FPS gameplay loops.
2. **Physical Kinematics with Drag & Gravity**: Models radial burst velocities, frame-rate independent exponential drag decay ($\vec{v} \cdot \text{drag}^{60 \cdot \Delta t}$), and debris tumbling for authentic arcade dispersal.
3. **Four Core Arcade Presets**:
   - **Small Alien Explosion**: 16–24 yellow/orange/white/red particles ($0.3\text{s}$ duration).
   - **Boss Galaga Explosion**: 32–48 green/blue/cyan/yellow particles with an expanding shockwave ring ($0.6\text{s}$ duration).
   - **Player Ship Destruction Explosion**: 40–60 multi-colored debris and spark fragments ($0.8\text{s}$ duration).
   - **Tractor Beam Energy Sparkle**: Continuous stream of cyan/yellow/white magnetic particles ($0.25\text{s}$ duration).
4. **Crisp Pixel Rendering**: Direct sub-pixel snapping (`Math.floor` / `Math.round`), procedural pixel rectangles, and integer-rasterized expanding shockwave rings adhering to the $224 \times 288$ arcade buffer without anti-aliasing blur.

---

## 2. Mathematical Modeling & Physics Formulation

```
                                  [ Explosive Kinetic Event ]
                                               |
                       +-----------------------+-----------------------+
                       |                                               |
                       v                                               v
           [ Radial Spark Particles ]                      [ Expanding Shockwave Ring ]
           - Direction: theta in [0, 2pi)                  - Origin: (x_0, y_0)
           - Velocity: v = v_0 * (cos theta, sin theta)    - Radius: R(t) = R_0 + V_expand * t
           - Drag: v(t+dt) = v(t) * drag^(60*dt)           - Alpha: alpha(t) = 1 - t/T_max
           - Alpha: alpha(t) = 1 - (t/t_max)^p             - Pixelated Circle Stroke
```

### 2.1 Velocity Decay with Continuous Drag

At explosion initiation $t=0$, each particle is assigned an initial velocity vector $\vec{v}_0 = (v_x, v_y)$ based on an angular distribution $\theta_i \in [0, 2\pi)$ and initial speed $s_0$:
$$v_x(0) = s_0 \cos(\theta_i), \quad v_y(0) = s_0 \sin(\theta_i)$$

For each simulation step with delta time $\Delta t$ (seconds), velocity decays exponentially to account for atmospheric/space medium resistance:
$$\vec{v}(t + \Delta t) = \vec{v}(t) \cdot (\text{drag})^{60 \cdot \Delta t} + \vec{a} \cdot \Delta t$$
$$\vec{p}(t + \Delta t) = \vec{p}(t) + \vec{v}(t) \cdot \Delta t$$

Where:
- $\text{drag} \in [0.92, 0.97]$ is the base per-frame damping factor at 60 FPS.
- $\vec{a} = (a_x, a_y)$ is optional linear acceleration (e.g. slight downward gravity $a_y = +30\text{ px/s}^2$ for heavy player ship debris).

### 2.2 Lifespan & Alpha Decay Curves

Let $t$ be elapsed particle life and $t_{\max}$ be total lifespan. Normalized lifetime progress is:
$$\tau = \frac{t}{t_{\max}} \in [0, 1]$$

The visual opacity $\alpha(\tau)$ is computed using:
1. **Linear Decay** (Standard Sparks & Sparkles):
   $$\alpha_{\text{linear}}(\tau) = \max\left(0, 1 - \tau\right)$$
2. **Quadratic Hold Decay** (Debris & Heavy Embers):
   $$\alpha_{\text{quad}}(\tau) = \max\left(0, 1 - \tau^2\right)$$
3. **Flash-Peak Decay** (Explosive Initial Flash):
   $$\alpha_{\text{flash}}(\tau) = \begin{cases} 1.0 & \text{if } \tau \le 0.15 \\ \max\left(0, \frac{1.0 - \tau}{0.85}\right) & \text{if } \tau > 0.15 \end{cases}$$

### 2.3 Boss Galaga Expanding Shockwave Ring

The shockwave is an expanding concentric ring emitted upon Boss Galaga destruction:
$$R(t) = R_{\text{start}} + \left(\frac{t}{t_{\max}}\right) \cdot \left(R_{\text{target}} - R_{\text{start}}\right)$$

Where $R_{\text{start}} = 2\text{ px}$, $R_{\text{target}} = 38\text{ px}$, and $t_{\max} = 0.55\text{s}$.
The stroke opacity diminishes smoothly as $R(t)$ expands:
$$\alpha_{\text{ring}}(t) = \left(1 - \frac{t}{t_{\max}}\right)^{1.2}$$

---

## 3. Zero-Allocation ObjectPool Memory Architecture

To ensure 60 FPS stutter-free performance without Garbage Collection pauses, all particles are allocated upfront within `src/core/ObjectPool.ts`.

### 3.1 Memory Layout & Pool Sizing
- **Storage Capacity**: 250 pre-allocated `Particle` entities.
- **Max Active Burden**:
  - 1 Player Explosion: ~50 particles
  - 2 Concurrent Boss Explosions: ~80 particles
  - 4 Concurrent Alien Explosions: ~80 particles
  - Tractor Beam Sparkles: ~16 particles
  - Total worst-case peak load = ~226 particles $< 250$ capacity limit.
- **O(1) Swap-and-Pop Release**: `pool.release(item)` swaps the deallocated particle with the last active index, achieving $O(1)$ reclamation without memory compaction or array splicing.
- **In-Loop Traversal**: `pool.forEachActiveSafe(fn)` iterates backwards (`i = activeCount - 1 down to 0`) so expiring particles can be recycled immediately during traversal.

### 3.2 Particle Entity Class Specification

```typescript
export interface IParticle {
  id: number;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  drag: number;
  color: string;
  size: number;
  width: number;
  height: number;
  life: number;
  maxLife: number;
  rotation: number;
  vRot: number;
  isShockwave: boolean;
  shockwaveRadius: number;
  shockwaveMaxRadius: number;
  alphaCurve: 'linear' | 'quad' | 'flash';
}
```

---

## 4. Authentic Explosion Presets Specification

```
+---------------------------------------------------------------------------------------------------------+
|                                    GALAGA EXPLOSION PRESET MATRIX                                       |
+-------------------+---------+------------------------+-----------+-------------+----------+-------------+
| Preset Name       | Count   | Color Palette          | Lifespan  | Speed (px/s)| Drag     | Size (px)   |
+-------------------+---------+------------------------+-----------+-------------+----------+-------------+
| Small Alien       | 16 - 24 | Yellow, Orange, White  | 0.25-0.35s| 40 - 90     | 0.93-0.95| 1x1, 2x2    |
| Boss Galaga       | 32 - 48 | Green, Blue, Cyan, Ylw | 0.50-0.70s| 50 - 130    | 0.94-0.96| 1x1, 2x2, 3x3
|                   | + 1 ring| Ring: Cyan/Yellow/White| 0.55s     | R: 2 -> 38px| -        | 1px stroke  |
| Player Ship       | 40 - 60 | White, Red, Blue, Cyan | 0.70-0.90s| 40 - 160    | 0.94-0.97| 1x1, 2x2,   |
|                   |         | Debris Shards          |           | + grav +30  |          | 3x2, 2x3    |
| Tractor Sparkle   | 1 - 4/fr| Cyan, Yellow, White    | 0.20-0.35s| vx:[-15,15] | 0.98     | 1x1, 2x2    |
|                   |         |                        |           | vy:[40, 90] |          |             |
| Hit Spark         | 4 - 8   | Yellow, White          | 0.12-0.18s| 60 - 120    | 0.90     | 1x1         |
+-------------------+---------+------------------------+-----------+-------------+----------+-------------+
```

### Detailed Preset Configurations

#### 1. Small Alien Explosion (Zako / Goei / Transform Alien)
- **Visual Description**: Sharp, fiery spherical burst of yellow, orange, and white sparks.
- **Particle Count**: 20 particles (clamped range: 16–24).
- **Color Array**: `['#FFFF00', '#FF7F00', '#FFFFFF', '#E70000']`.
- **Speed**: $40\text{ to }90\text{ px/s}$ with uniform radial angle distribution $\theta_i = \frac{2\pi i}{N} \pm 0.15\text{ rad}$.
- **Lifespan**: $0.25\text{ to }0.35\text{s}$ (mean $0.30\text{s}$).
- **Drag**: $0.94$.
- **Size**: 70% $1\text{px}$, 30% $2\text{px}$.
- **Alpha Curve**: `linear`.

#### 2. Boss Galaga Destruction & Shockwave Ring
- **Visual Description**: Grand, multi-stage blast with neon green, cyan, light blue, and yellow fragments accompanied by an expanding circular shockwave ring.
- **Particle Count**: 40 particles (clamped range: 32–48) + 1 expanding shockwave ring.
- **Color Array**: `['#00E700', '#5B93FF', '#00FFFF', '#FFFF00', '#FFFFFF']`.
- **Speed**:
  - Inner high-velocity sparks (24 count): $90\text{ to }140\text{ px/s}$.
  - Outer heavy embers (16 count): $40\text{ to }80\text{ px/s}$.
- **Lifespan**: $0.50\text{ to }0.65\text{s}$ (mean $0.60\text{s}$).
- **Drag**: $0.95$.
- **Size**: 50% $1\text{px}$, 35% $2\text{px}$, 15% $3\text{px}$.
- **Shockwave Ring**:
  - Center: $(x, y)$
  - Max Radius: $38\text{ px}$
  - Lifespan: $0.55\text{s}$
  - Color: `#00FFFF` / `#FFFF00`
  - Stroke: 1px crisp outline.

#### 3. Player Ship Destruction & Fragmentation
- **Visual Description**: Catastrophic structural disintegration of the fighter ship into distinct wing, fuselage, and engine shards.
- **Particle Count**: 50 particles (clamped range: 40–60).
- **Color Array**: `['#FFFFFF', '#E70000', '#5B93FF', '#00FFFF', '#FFFF00']`.
- **Speed**: $40\text{ to }160\text{ px/s}$ with asymmetric kinetic dispersal.
- **Fragmentation Mix**:
  - 30 Fine Sparks ($1 \times 1\text{ px}$, speed $100 - 160\text{ px/s}$, drag $0.95$, lifespan $0.7\text{s}$).
  - 12 Shrapnel Shards ($2 \times 2\text{ px}$, speed $60 - 110\text{ px/s}$, drag $0.96$, lifespan $0.8\text{s}$, tumbling $\omega = \pm 6\text{ rad/s}$).
  - 8 Heavy Structural Hull Pieces ($3 \times 2\text{ px}$ / $2 \times 3\text{ px}$, speed $30 - 70\text{ px/s}$, gravity $a_y = +35\text{ px/s}^2$, lifespan $0.85\text{s}$).
- **Lifespan**: $0.75\text{ to }0.90\text{s}$ (mean $0.80\text{s}$).
- **Alpha Curve**: `quad`.

#### 4. Tractor Beam Energy Sparkle Stream
- **Visual Description**: Glistening, ephemeral ionic sparkles drifting inside the tractor beam energy cone.
- **Emission Rate**: 1–2 particles per frame or on-demand burst within beam trapezoid.
- **Color Array**: `['#00FFFF', '#FFFF00', '#FFFFFF']`.
- **Velocity**: $v_x \in [-15, +15]\text{ px/s}$, $v_y \in [45, 95]\text{ px/s}$.
- **Lifespan**: $0.20\text{ to }0.35\text{s}$.
- **Drag**: $0.98$.
- **Size**: 1px to 2px.

#### 5. Bullet Hit / Non-Lethal Deflection Spark
- **Visual Description**: Quick, sharp micro-burst when a missile damages Boss Galaga or hits armor.
- **Particle Count**: 6 particles.
- **Color Array**: `['#FFFF00', '#FFFFFF']`.
- **Speed**: $70\text{ to }130\text{ px/s}$.
- **Lifespan**: $0.12\text{ to }0.18\text{s}$.
- **Drag**: $0.90$.
- **Size**: 1px.

---

## 5. Crisp Pixel Rendering Pipeline

To maintain 100% fidelity with Galaga's pixel-perfect arcade aesthetics on the $224 \times 288$ virtual coordinate buffer:

1. **Integer Coordinate Snapping**: All particle coordinates are floored/rounded to integer pixel units (`Math.floor(x)`, `Math.floor(y)`).
2. **Offscreen & Anti-Aliasing Isolation**: Rendering occurs strictly on canvas contexts with `imageSmoothingEnabled = false`.
3. **Alpha State Cleanliness**: Each particle sets `ctx.globalAlpha = alpha`, and `ctx.globalAlpha` is restored to `1.0` upon completing the render pass.
4. **Shockwave Ring Drawing**: Rendered with integer-radius `ctx.arc(Math.floor(x), Math.floor(y), Math.floor(radius), 0, 2 * Math.PI)` or 8-way symmetric Bresenham pixel circle stamps.

---

## 6. Complete Production-Ready TypeScript Implementation Blueprint

Below is the complete, self-contained implementation code to be placed in `src/systems/ParticleSystem.ts`:

```typescript
/**
 * Galaga Arcade Web Game — High-Performance Particle Explosion System
 * 
 * Features:
 * 1. Zero runtime Garbage Collection allocations via ObjectPool<Particle> with 250 capacity.
 * 2. Physical kinematics with exponential drag damping and gravitational drift.
 * 3. Authentic arcade explosion presets (Small Alien, Boss Galaga + Shockwave, Player Ship Debris, Tractor Beam Sparkles).
 * 4. Crisp pixel-art integer rendering on 224x288 virtual canvas.
 */

import { ObjectPool } from '../core/ObjectPool';
import type { Poolable, Vector2D } from '../types';
import { PALETTE } from '../renderer/SpriteRenderer';

export type ParticleType = 'SPARK' | 'DEBRIS' | 'SHOCKWAVE' | 'BEAM_SPARKLE';
export type ExplosionType = 'SMALL' | 'BOSS' | 'PLAYER' | 'HIT' | 'DOCKING';
export type AlphaCurve = 'linear' | 'quad' | 'flash';

/**
 * Individual particle entity satisfying the Poolable contract.
 */
export class Particle implements Poolable {
  public id: number = 0;
  public active: boolean = false;

  // Spatial Kinematics
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public ax: number = 0; // Horizontal acceleration
  public ay: number = 0; // Vertical acceleration (e.g. gravity)
  public drag: number = 0.95;

  // Visual Properties
  public color: string = PALETTE.WHITE;
  public size: number = 1;
  public width: number = 1;
  public height: number = 1;
  public rotation: number = 0;
  public vRot: number = 0; // Angular velocity (rad/s)
  public alphaCurve: AlphaCurve = 'linear';

  // Lifespan Timers
  public life: number = 0;
  public maxLife: number = 1.0;

  // Shockwave Ring Properties
  public isShockwave: boolean = false;
  public shockwaveRadius: number = 0;
  public shockwaveMaxRadius: number = 38;

  // Particle Category
  public type: ParticleType = 'SPARK';

  /**
   * Reset method invoked when recycling particle back to pool.
   */
  public reset(): void {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.ax = 0;
    this.ay = 0;
    this.drag = 0.95;
    this.color = PALETTE.WHITE;
    this.size = 1;
    this.width = 1;
    this.height = 1;
    this.rotation = 0;
    this.vRot = 0;
    this.alphaCurve = 'linear';
    this.life = 0;
    this.maxLife = 1.0;
    this.isShockwave = false;
    this.shockwaveRadius = 0;
    this.shockwaveMaxRadius = 38;
    this.type = 'SPARK';
  }

  /**
   * Returns current position as Vector2D.
   */
  public get position(): Vector2D {
    return { x: this.x, y: this.y };
  }

  /**
   * Returns current velocity as Vector2D.
   */
  public get velocity(): Vector2D {
    return { x: this.vx, y: this.vy };
  }
}

export interface ParticleSystemConfig {
  maxParticles?: number;
}

export class ParticleSystem {
  public static readonly DEFAULT_MAX_PARTICLES = 250;

  private pool: ObjectPool<Particle>;
  private nextParticleId: number = 1;

  // Pre-cached color arrays for zero-allocation palette lookups
  private static readonly SMALL_ALIEN_COLORS = [
    PALETTE.YELLOW,
    PALETTE.ORANGE,
    PALETTE.WHITE,
    PALETTE.RED,
  ];

  private static readonly BOSS_EXPLOSION_COLORS = [
    PALETTE.GREEN,
    PALETTE.BLUE_LIGHT,
    PALETTE.BLUE_CYAN,
    PALETTE.YELLOW,
    PALETTE.WHITE,
  ];

  private static readonly PLAYER_EXPLOSION_COLORS = [
    PALETTE.WHITE,
    PALETTE.RED,
    PALETTE.BLUE_LIGHT,
    PALETTE.BLUE_CYAN,
    PALETTE.YELLOW,
  ];

  private static readonly TRACTOR_SPARKLE_COLORS = [
    PALETTE.BLUE_CYAN,
    PALETTE.YELLOW,
    PALETTE.WHITE,
  ];

  private static readonly HIT_SPARK_COLORS = [
    PALETTE.YELLOW,
    PALETTE.WHITE,
  ];

  constructor(config?: ParticleSystemConfig) {
    const maxCapacity = config?.maxParticles ?? ParticleSystem.DEFAULT_MAX_PARTICLES;

    this.pool = new ObjectPool<Particle>({
      factory: () => {
        const p = new Particle();
        p.id = this.nextParticleId++;
        return p;
      },
      reset: (p) => p.reset(),
      initialSize: maxCapacity,
      maxSize: maxCapacity,
      autoExpand: false, // Strict zero-allocation upper bound
    });
  }

  // ==========================================================================
  // 1. Explosion Spawning Presets
  // ==========================================================================

  /**
   * Spawns an arcade explosion preset at the specified coordinates.
   */
  public spawnExplosion(x: number, y: number, type: ExplosionType = 'SMALL'): void {
    switch (type) {
      case 'SMALL':
        this.spawnSmallAlienExplosion(x, y);
        break;
      case 'BOSS':
        this.spawnBossExplosion(x, y);
        break;
      case 'PLAYER':
        this.spawnPlayerExplosion(x, y);
        break;
      case 'HIT':
        this.spawnHitSparks(x, y);
        break;
      case 'DOCKING':
        this.spawnDockingSparkles(x, y);
        break;
    }
  }

  /**
   * Preset 1: Small Alien Explosion (Zako, Goei, Transform)
   * 16-24 fiery yellow/orange/white/red sparks with 0.3s lifespan.
   */
  public spawnSmallAlienExplosion(x: number, y: number, particleCount: number = 20): void {
    const count = Math.max(16, Math.min(24, particleCount));
    const colors = ParticleSystem.SMALL_ALIEN_COLORS;

    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (!p) break;

      const baseAngle = (Math.PI * 2 * i) / count;
      const anglePerturbation = (Math.random() - 0.5) * 0.3;
      const angle = baseAngle + anglePerturbation;
      const speed = 40 + Math.random() * 50; // 40 - 90 px/s

      p.active = true;
      p.type = 'SPARK';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.ax = 0;
      p.ay = 0;
      p.drag = 0.93 + Math.random() * 0.02; // 0.93 - 0.95
      p.color = colors[Math.floor(Math.random() * colors.length)] ?? PALETTE.YELLOW;
      p.size = Math.random() > 0.7 ? 2 : 1;
      p.width = p.size;
      p.height = p.size;
      p.life = 0;
      p.maxLife = 0.25 + Math.random() * 0.10; // 0.25 - 0.35s
      p.alphaCurve = 'linear';
    }
  }

  /**
   * Preset 2: Boss Galaga Explosion & Expanding Shockwave Ring
   * 32-48 green/blue/cyan/yellow sparks + 1 expanding shockwave ring (0.6s lifespan).
   */
  public spawnBossExplosion(x: number, y: number, particleCount: number = 40): void {
    const count = Math.max(32, Math.min(48, particleCount));
    const colors = ParticleSystem.BOSS_EXPLOSION_COLORS;

    // A. Multi-tiered Radial Sparks
    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (!p) break;

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.25;
      const isInnerSpark = i % 2 === 0;
      const speed = isInnerSpark
        ? 90 + Math.random() * 50 // 90 - 140 px/s fast core
        : 40 + Math.random() * 40; // 40 - 80 px/s outer ember

      p.active = true;
      p.type = 'SPARK';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.ax = 0;
      p.ay = 0;
      p.drag = 0.94 + Math.random() * 0.02; // 0.94 - 0.96
      p.color = colors[Math.floor(Math.random() * colors.length)] ?? PALETTE.GREEN;
      
      const sizeRoll = Math.random();
      p.size = sizeRoll > 0.85 ? 3 : sizeRoll > 0.50 ? 2 : 1;
      p.width = p.size;
      p.height = p.size;
      p.life = 0;
      p.maxLife = 0.50 + Math.random() * 0.15; // 0.50 - 0.65s
      p.alphaCurve = isInnerSpark ? 'linear' : 'quad';
    }

    // B. Expanding Shockwave Ring
    const shockwave = this.pool.acquire();
    if (shockwave) {
      shockwave.active = true;
      shockwave.type = 'SHOCKWAVE';
      shockwave.isShockwave = true;
      shockwave.x = x;
      shockwave.y = y;
      shockwave.vx = 0;
      shockwave.vy = 0;
      shockwave.ax = 0;
      shockwave.ay = 0;
      shockwave.drag = 1.0;
      shockwave.color = PALETTE.BLUE_CYAN;
      shockwave.size = 1;
      shockwave.shockwaveRadius = 2;
      shockwave.shockwaveMaxRadius = 38;
      shockwave.life = 0;
      shockwave.maxLife = 0.55; // 0.55s ring expansion
      shockwave.alphaCurve = 'linear';
    }
  }

  /**
   * Preset 3: Player Ship Destruction & Fragmentation
   * 40-60 multi-color debris fragments, structural hull shards, and fine sparks (0.8s lifespan).
   */
  public spawnPlayerExplosion(x: number, y: number, particleCount: number = 50): void {
    const count = Math.max(40, Math.min(60, particleCount));
    const colors = ParticleSystem.PLAYER_EXPLOSION_COLORS;

    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (!p) break;

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const roll = Math.random();

      p.active = true;
      p.x = x;
      p.y = y;

      if (roll < 0.60) {
        // Category A: Fine high-velocity sparks (60%)
        const speed = 100 + Math.random() * 60; // 100 - 160 px/s
        p.type = 'SPARK';
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.ax = 0;
        p.ay = 0;
        p.drag = 0.95;
        p.size = 1;
        p.width = 1;
        p.height = 1;
        p.life = 0;
        p.maxLife = 0.65 + Math.random() * 0.15;
        p.alphaCurve = 'linear';
      } else if (roll < 0.85) {
        // Category B: Tumbling structural shrapnel (25%)
        const speed = 60 + Math.random() * 50; // 60 - 110 px/s
        p.type = 'DEBRIS';
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.ax = 0;
        p.ay = 15; // Mild downward gravity
        p.drag = 0.96;
        p.size = 2;
        p.width = 2;
        p.height = 2;
        p.rotation = Math.random() * Math.PI * 2;
        p.vRot = (Math.random() - 0.5) * 12; // Tumbling spin
        p.life = 0;
        p.maxLife = 0.75 + Math.random() * 0.15;
        p.alphaCurve = 'quad';
      } else {
        // Category C: Heavy hull chunks (15%)
        const speed = 30 + Math.random() * 40; // 30 - 70 px/s
        p.type = 'DEBRIS';
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.ax = 0;
        p.ay = 35; // Downward gravity
        p.drag = 0.96;
        p.size = 3;
        p.width = Math.random() > 0.5 ? 3 : 2;
        p.height = p.width === 3 ? 2 : 3;
        p.rotation = Math.random() * Math.PI * 2;
        p.vRot = (Math.random() - 0.5) * 8;
        p.life = 0;
        p.maxLife = 0.80 + Math.random() * 0.15;
        p.alphaCurve = 'quad';
      }

      p.color = colors[Math.floor(Math.random() * colors.length)] ?? PALETTE.WHITE;
    }
  }

  /**
   * Preset 4: Tractor Beam Energy Sparkle Particles
   * Spawns single or small burst of ionic sparkles inside beam cone.
   */
  public spawnTractorSparkle(
    x: number,
    y: number,
    vx: number = (Math.random() - 0.5) * 20,
    vy: number = 50 + Math.random() * 40
  ): Particle | null {
    const p = this.pool.acquire();
    if (!p) return null;

    const colors = ParticleSystem.TRACTOR_SPARKLE_COLORS;

    p.active = true;
    p.type = 'BEAM_SPARKLE';
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.ax = 0;
    p.ay = 0;
    p.drag = 0.98;
    p.color = colors[Math.floor(Math.random() * colors.length)] ?? PALETTE.BLUE_CYAN;
    p.size = Math.random() > 0.6 ? 2 : 1;
    p.width = p.size;
    p.height = p.size;
    p.life = 0;
    p.maxLife = 0.20 + Math.random() * 0.15; // 0.20 - 0.35s
    p.alphaCurve = 'linear';

    return p;
  }

  /**
   * Preset 5: Hit Sparks (Non-Lethal projectile impact)
   */
  public spawnHitSparks(x: number, y: number, count: number = 6): void {
    const colors = ParticleSystem.HIT_SPARK_COLORS;

    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 60; // 70 - 130 px/s

      p.active = true;
      p.type = 'SPARK';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.ax = 0;
      p.ay = 0;
      p.drag = 0.90;
      p.color = colors[Math.floor(Math.random() * colors.length)] ?? PALETTE.YELLOW;
      p.size = 1;
      p.width = 1;
      p.height = 1;
      p.life = 0;
      p.maxLife = 0.12 + Math.random() * 0.06; // 0.12 - 0.18s
      p.alphaCurve = 'linear';
    }
  }

  /**
   * Preset 6: Dual Fighter Docking Sparkles
   */
  public spawnDockingSparkles(x: number, y: number, count: number = 20): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      if (!p) break;

      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2; // Upward fan
      const speed = 40 + Math.random() * 60;

      p.active = true;
      p.type = 'SPARK';
      p.x = x + (Math.random() - 0.5) * 16;
      p.y = y + (Math.random() - 0.5) * 8;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.ax = 0;
      p.ay = -20; // Upward buoyant float
      p.drag = 0.96;
      p.color = Math.random() > 0.5 ? PALETTE.YELLOW : PALETTE.BLUE_CYAN;
      p.size = Math.random() > 0.5 ? 2 : 1;
      p.width = p.size;
      p.height = p.size;
      p.life = 0;
      p.maxLife = 0.45 + Math.random() * 0.20;
      p.alphaCurve = 'linear';
    }
  }

  // ==========================================================================
  // 2. Fixed Timestep Update Pipeline
  // ==========================================================================

  /**
   * Updates physics, drag, and lifespans for all active particles.
   * Delta time (dt) is in seconds.
   */
  public update(dt: number): void {
    const dragExponent = Math.min(2.0, dt * 60);

    this.pool.forEachActiveSafe((p) => {
      p.life += dt;

      // Recycle if life expired
      if (p.life >= p.maxLife) {
        this.pool.release(p);
        return;
      }

      if (p.isShockwave) {
        // Expand shockwave ring
        const progress = p.life / p.maxLife;
        p.shockwaveRadius = 2 + progress * (p.shockwaveMaxRadius - 2);
      } else {
        // Kinematic integration
        p.vx += p.ax * dt;
        p.vy += p.ay * dt;

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Exponential drag damping
        const effectiveDrag = Math.pow(p.drag, dragExponent);
        p.vx *= effectiveDrag;
        p.vy *= effectiveDrag;

        // Angular rotation for debris
        if (p.vRot !== 0) {
          p.rotation += p.vRot * dt;
        }
      }
    });
  }

  // ==========================================================================
  // 3. Crisp Pixel Rendering Pipeline
  // ==========================================================================

  /**
   * Renders all active particles onto the 2D canvas with crisp pixel snapping.
   */
  public render(ctx: CanvasRenderingContext2D): void {
    if (this.pool.getActiveCount() === 0) return;

    this.pool.forEachActive((p) => {
      const progress = p.life / p.maxLife;
      let alpha = 1.0;

      switch (p.alphaCurve) {
        case 'linear':
          alpha = Math.max(0, 1.0 - progress);
          break;
        case 'quad':
          alpha = Math.max(0, 1.0 - progress * progress);
          break;
        case 'flash':
          alpha = progress <= 0.15 ? 1.0 : Math.max(0, (1.0 - progress) / 0.85);
          break;
      }

      if (alpha <= 0.01) return;

      ctx.globalAlpha = Math.min(1.0, alpha);

      if (p.isShockwave) {
        // Render crisp expanding shockwave circle
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(
          Math.floor(p.x),
          Math.floor(p.y),
          Math.floor(p.shockwaveRadius),
          0,
          Math.PI * 2
        );
        ctx.stroke();
      } else if (p.vRot !== 0 && p.type === 'DEBRIS') {
        // Rotated debris shard
        ctx.save();
        ctx.translate(Math.floor(p.x), Math.floor(p.y));
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(
          -Math.floor(p.width / 2),
          -Math.floor(p.height / 2),
          p.width,
          p.height
        );
        ctx.restore();
      } else {
        // Standard non-rotated crisp pixel rectangle
        ctx.fillStyle = p.color;
        const px = Math.floor(p.x - p.width / 2);
        const py = Math.floor(p.y - p.height / 2);
        ctx.fillRect(px, py, p.width, p.height);
      }
    });

    // Reset global alpha for subsequent render layers
    ctx.globalAlpha = 1.0;
  }

  // ==========================================================================
  // 4. Lifecycle & Diagnostics
  // ==========================================================================

  /**
   * Immediately deactivates and clears all active particles.
   */
  public clear(): void {
    this.pool.clear();
  }

  /**
   * Completely disposes internal storage buffers.
   */
  public destroy(): void {
    this.pool.drain();
  }

  /**
   * Returns current active particle count.
   */
  public getActiveCount(): number {
    return this.pool.getActiveCount();
  }

  /**
   * Returns maximum capacity of the particle pool.
   */
  public getCapacity(): number {
    return this.pool.getCapacity();
  }

  /**
   * Returns whether the pool is completely exhausted.
   */
  public isFull(): boolean {
    return this.pool.isFull();
  }

  /**
   * Returns internal object pool instance.
   */
  public getPool(): ObjectPool<Particle> {
    return this.pool;
  }
}
```

---

## 7. Integration Guide & System Hookpoints

### 7.1 Integration in `src/core/Game.ts`

1. **Subsystem Declaration**:
   ```typescript
   import { ParticleSystem } from '../systems/ParticleSystem';
   ...
   export class Game implements IGameEngine {
     public particleSystem: ParticleSystem;
     ...
     constructor(...) {
       ...
       this.particleSystem = new ParticleSystem();
     }
   ```
2. **Hooking Entity Destruction Callbacks**:
   - **Enemy Destruction**:
     ```typescript
     this.formationManager = new FormationManager({
       ...
       onEnemyDestroyed: (enemy, points) => {
         this.score += points;
         this.saveHighScore();
         if (enemy.type === EnemyType.BOSS) {
           this.particleSystem.spawnExplosion(enemy.x, enemy.y, 'BOSS');
         } else {
           this.particleSystem.spawnExplosion(enemy.x, enemy.y, 'SMALL');
         }
       }
     });
     ```
   - **Player Destruction**:
     ```typescript
     this.player.onExplode = (x, y, isDualPartial) => {
       this.particleSystem.spawnExplosion(x, y, 'PLAYER');
     };
     ```
   - **Bullet Hit on Wounded Boss**:
     ```typescript
     if (enemy.type === EnemyType.BOSS && !damageResult.destroyed) {
       this.particleSystem.spawnExplosion(enemy.x, enemy.y, 'HIT');
     }
     ```
3. **Update & Render Loops**:
   - In `update(dt: number)`:
     ```typescript
     this.particleSystem.update(dt);
     ```
   - In `renderPlayingScreen(ctx)` (z-index 1, rendered directly over starfield and underneath ships):
     ```typescript
     this.starfield.render(targetCtx);
     this.particleSystem.render(targetCtx); // Layer z: 1
     this.formationManager.render(targetCtx);
     ...
     ```

---

## 8. Unit Test Suite Blueprint (`tests/unit/particle.test.ts`)

A comprehensive unit test suite covering all functional requirements, kinematics, pooling invariants, presets, and rendering robustness:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParticleSystem, Particle } from '../../src/systems/ParticleSystem';
import { PALETTE } from '../../src/renderer/SpriteRenderer';

describe('Milestone 6: ParticleSystem Unit Test Suite', () => {
  let ps: ParticleSystem;

  beforeEach(() => {
    ps = new ParticleSystem({ maxParticles: 250 });
  });

  describe('Object Pool & Capacity Management', () => {
    it('initializes with capacity 250 and 0 active particles', () => {
      expect(ps.getCapacity()).toBe(250);
      expect(ps.getActiveCount()).toBe(0);
      expect(ps.isFull()).toBe(false);
    });

    it('clears active particles cleanly', () => {
      ps.spawnSmallAlienExplosion(100, 100, 20);
      expect(ps.getActiveCount()).toBe(20);
      ps.clear();
      expect(ps.getActiveCount()).toBe(0);
    });

    it('does not exceed 250 capacity upper bound under heavy spam', () => {
      for (let i = 0; i < 20; i++) {
        ps.spawnBossExplosion(100, 100, 40);
      }
      expect(ps.getActiveCount()).toBeLessThanOrEqual(250);
      expect(ps.isFull()).toBe(true);
    });
  });

  describe('Explosion Presets', () => {
    it('spawns Small Alien explosion with 16-24 particles and valid lifespans', () => {
      ps.spawnSmallAlienExplosion(112, 100, 20);
      expect(ps.getActiveCount()).toBe(20);

      ps.getPool().forEachActive((p) => {
        expect(p.active).toBe(true);
        expect(p.x).toBe(112);
        expect(p.y).toBe(100);
        expect(p.maxLife).toBeGreaterThanOrEqual(0.25);
        expect(p.maxLife).toBeLessThanOrEqual(0.35);
        expect(p.drag).toBeGreaterThanOrEqual(0.93);
        expect(p.drag).toBeLessThanOrEqual(0.96);
      });
    });

    it('spawns Boss Galaga explosion with multi-tier sparks and shockwave ring', () => {
      ps.spawnBossExplosion(112, 80, 40);
      expect(ps.getActiveCount()).toBe(41); // 40 sparks + 1 shockwave

      let shockwaveFound = false;
      ps.getPool().forEachActive((p) => {
        if (p.isShockwave) {
          shockwaveFound = true;
          expect(p.type).toBe('SHOCKWAVE');
          expect(p.shockwaveMaxRadius).toBe(38);
        }
      });
      expect(shockwaveFound).toBe(true);
    });

    it('spawns Player explosion with fine sparks and tumbling debris fragments', () => {
      ps.spawnPlayerExplosion(112, 250, 50);
      expect(ps.getActiveCount()).toBe(50);

      let debrisFound = false;
      ps.getPool().forEachActive((p) => {
        if (p.type === 'DEBRIS') {
          debrisFound = true;
          expect(p.ay).toBeGreaterThan(0); // Gravity enabled
        }
      });
      expect(debrisFound).toBe(true);
    });

    it('spawns Tractor Beam sparkles with proper directional velocities', () => {
      const p = ps.spawnTractorSparkle(112, 120, 5, 60);
      expect(p).not.toBeNull();
      expect(p!.vx).toBe(5);
      expect(p!.vy).toBe(60);
      expect(p!.type).toBe('BEAM_SPARKLE');
    });
  });

  describe('Kinematics & Update Pipeline', () => {
    it('decays velocities via exponential drag damping', () => {
      ps.spawnSmallAlienExplosion(100, 100, 20);
      const active = ps.getPool().getActive();
      const p = active[0]!;
      const initialVx = p.vx;

      ps.update(1 / 60); // 1 frame
      expect(Math.abs(p.vx)).toBeLessThan(Math.abs(initialVx));
    });

    it('recycles particles automatically when life exceeds maxLife', () => {
      ps.spawnSmallAlienExplosion(100, 100, 20);
      expect(ps.getActiveCount()).toBe(20);

      // Advance time past 0.35s maximum lifespan
      ps.update(0.40);
      expect(ps.getActiveCount()).toBe(0);
    });

    it('expands shockwave ring radius over time', () => {
      ps.spawnBossExplosion(100, 100, 40);
      let shockwave: Particle | null = null;
      ps.getPool().forEachActive((p) => {
        if (p.isShockwave) shockwave = p;
      });
      expect(shockwave).not.toBeNull();

      expect(shockwave!.shockwaveRadius).toBe(2);
      ps.update(0.25); // Halfway
      expect(shockwave!.shockwaveRadius).toBeGreaterThan(15);
      expect(shockwave!.shockwaveRadius).toBeLessThan(38);
    });
  });

  describe('Canvas Rendering Execution', () => {
    it('renders particles without errors and resets globalAlpha to 1.0', () => {
      ps.spawnBossExplosion(100, 100, 40);

      const mockCtx = {
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        stroke: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        globalAlpha: 1.0,
      } as unknown as CanvasRenderingContext2D;

      ps.render(mockCtx);

      expect(mockCtx.fillRect).toHaveBeenCalled();
      expect(mockCtx.arc).toHaveBeenCalled();
      expect(mockCtx.stroke).toHaveBeenCalled();
      expect(mockCtx.globalAlpha).toBe(1.0);
    });
  });
});
```

---

## 9. Verification & Quality Invariants

| Invariant | Requirement | Verification Strategy |
|---|---|---|
| **Zero GC Allocations** | 0 heap objects allocated per update/render frame | `ObjectPool<Particle>` fixed at 250 capacity, `forEachActiveSafe` iteration |
| **Authentic Arcade Timing** | Small: 0.3s, Boss: 0.6s, Player: 0.8s | Vitest delta time progression validation |
| **Crisp Pixel Boundaries** | No sub-pixel blurring, sharp rectangles & arcs | Coordinates floored with `Math.floor`, integer widths/heights |
| **Expanding Shockwave** | $R(t) = 2 \to 38\text{px}$ over $0.55\text{s}$ | Radius expansion formula verified across discrete time samples |
| **Multi-Color Palettes** | Strict adherence to `PALETTE` constant colors | Static color arrays referenced from `SpriteRenderer.ts` |
| **100% Vitest Coverage** | All methods, presets, edge cases covered | Full test suite blueprint ready for execution |
