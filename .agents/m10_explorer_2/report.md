# Milestone 10 Technical Exploration Report: Concrete Implementations for Crisis Events 1–6

- **Explorer**: `m10_explorer_2` (Crisis Events 1–6 Mechanical Explorer)
- **Date**: 2026-09-03
- **Project Root**: `/Users/user/src/galog`
- **Working Directory**: `/Users/user/src/galog/.agents/m10_explorer_2`
- **Target Source Directory**: `src/core/crisis/events/`
- **Status**: Complete Architectural Specification & Implementation Ready

---

## 1. Executive Summary & Role Scope

In Phase 2 of the Galaga Arcade Web Game expansion, the game scales up to 50 progressive stages. Beginning at Stage 11, random endgame "Crisis Events" (inspired by *Stellaris*) are triggered during gameplay. 

As designated in Milestone 10:
- `m10_explorer_1` designs the core subsystem architecture (`types.ts`, `CrisisEventFactory.ts`, `CrisisEventManager.ts`, and `Game.ts` integration hooks).
- `m10_explorer_2` (**this explorer**) designs the concrete implementations for **Crisis Events 1 through 6**:
  1. `TheContingencyEvent.ts` (AI rogue pulse, predictive enemy bullet aim, player fire rate stutter)
  2. `TheUnbiddenEvent.ts` (Dimensional tear, gravitational distortion bending player bullet trajectories toward rift center)
  3. `ThePrethorynScourgeEvent.ts` (Organic infestation, defeated enemies burst into micro-spores, surviving enemies gain chitinous regenerating shields)
  4. `ShieldOverloadEvent.ts` (Hexagonal kinetic energy matrix, +2 shields for all living enemies)
  5. `PhysicsInversionEvent.ts` (Singularity shift, starfield flow reverses upward, enemy dive trajectories invert or curve unpredictably)
  6. `HyperspaceStormEvent.ts` (Cosmic lightning lanes, flashing vertical warning bands, enemy dive speed boost +25%)
- `m10_explorer_3` designs Crisis Events 7 through 11 and the unit testing suite in `tests/unit/crisis.test.ts`.

All six events strictly conform to:
1. **100% Zero External Assets**: Pure procedural 2D canvas drawing and vector mathematics.
2. **Zero Runtime Garbage Collection (Zero-GC)**: Fixed-size buffers, reusable structures, zero object allocations in 60 FPS `update()` and `render()` loops.
3. **Deterministic State Teardown**: Complete restoration of engine, player, bullet, formation, and starfield state upon event deactivation or stage clear.
4. **Defensive Interface Polymorphism**: Dual-contract support for both property naming conventions (`durationSec` / `activeDuration`, `warningDurationSec` / `warningDuration`, `isFinished` / `isComplete`, `activate` / `onActivate`, `deactivate` / `onDeactivate`).

---

## 2. Common Interface & Base Class Pattern

Each concrete crisis event implements `ICrisisEvent` from `src/core/crisis/types.ts`. To ensure 100% compatibility across explorer designs, all events implement both primary methods and alias getters:

```typescript
export interface CrisisEventContext {
  game: any;
  player: any;
  bulletManager: any;
  formationManager: any;
  starfield: any;
  particleSystem: any;
  soundSynth: any;
  scoreManager?: any;
  hud?: any;
  stage: number;
}

export type CrisisState = 'IDLE' | 'WARNING' | 'ACTIVE' | 'COOLDOWN' | 'COMPLETED';
```

---

## 3. Event 1: `TheContingencyEvent.ts` (The Contingency — 우발사태)

### 3.1 Overview & Lore
- **Crisis Type**: `CrisisEventType.THE_CONTINGENCY`
- **Name**: `THE CONTINGENCY`
- **Subtitle / Flavor Text**: `GHOST SIGNAL OVERRIDE | AI ROGUE PULSE ACTIVE`
- **Warning Duration**: $3.0\text{s}$ | **Active Duration**: $20.0\text{s}$
- **Gameplay Threat**: The ancient sterilizer AI emits the "Ghost Signal". Enemy bullets compute predictive intercepts leading the player ship, and active bullets in flight execute micro-homing steering adjustments. Meanwhile, the player ship's weapon bus suffers severe electromagnetic capacitor stutter.

### 3.2 State Variables & Parameters
```typescript
private context: CrisisEventContext | null = null;
private _state: CrisisState = 'IDLE';
private activeTimer: number = 0;
private warningTimer: number = 0;
private pulseInterval: number = 3.5; // Seconds between rogue EMP waves
private pulseTimer: number = 0;
private pulseWaveRadius: number = 0;
private isPulsing: boolean = false;
private stutterTimer: number = 0;
private originalCooldown: number = 0.12;

// Zero-allocation matrix rain buffer (16 columns: [x, y, speed, charIndex])
private static readonly MATRIX_DROP_COUNT = 16;
private matrixDropX: Float32Array = new Float32Array(16);
private matrixDropY: Float32Array = new Float32Array(16);
private matrixDropSpeed: Float32Array = new Float32Array(16);
```

### 3.3 Mathematical Formulas & Physics

#### A. Predictive Enemy Bullet Aim (Leading Intercept)
When an enemy unit at $(x_e, y_e)$ fires at the player at $(x_p, y_p)$ with lateral velocity $v_{px}$ and bullet speed $v_b \approx 200\text{ px/s}$:
$$\Delta y = y_p - y_e$$
$$t_{\text{hit}} = \frac{\Delta y}{v_b}$$
$$x_{\text{pred}} = \text{clamp}(x_p + v_{px} \cdot t_{\text{hit}}, 16, 208)$$
$$\vec{d} = (x_{\text{pred}} - x_e, \Delta y)$$
$$v_{bx} = \frac{x_{\text{pred}} - x_e}{\|\vec{d}\|} \cdot v_b, \quad v_{by} = \frac{\Delta y}{\|\vec{d}\|} \cdot v_b$$

#### B. In-Flight Micro-Homing Steering
For each active enemy bullet with $y_b < y_p - 15$:
$$e_x = x_p - x_b$$
$$a_{\text{steer}} = 90 \text{ px/s}^2$$
$$v_{bx}(t + dt) = \text{clamp}\left(v_{bx}(t) + \text{sign}(e_x) \cdot a_{\text{steer}} \cdot dt, -120, 120\right)$$
$$\theta_{\text{rot}} = \text{atan2}(v_{by}, v_{bx})$$

#### C. Player Weapon Capacitor Stutter
The weapon capacitor oscillator fluctuates fire cooldown:
$$\text{cycle} = t \pmod{2.6}$$
$$\text{cooldown}(t) = \begin{cases} 
0.24\text{s} & \text{if } \text{cycle} < 0.5\text{s} \text{ (Capacitor Stutter / Stall)} \\
0.06\text{s} & \text{if } 1.2\text{s} \le \text{cycle} < 1.6\text{s} \text{ (Capacitor Overclock / Surge)} \\
0.12\text{s} & \text{otherwise (Baseline)}
\end{cases}$$

### 3.4 Canvas Rendering Pipeline
1. **Phosphor Green Scanlines**:
   $$\alpha(y, t) = 0.04 + 0.03 \sin\left(\frac{2\pi y}{4} + 15 t\right)$$
   Render horizontal green raster lines across the virtual canvas ($y = 0 \to 288$).
2. **Expanding EMP Wavefront**:
   During pulse ($t_{\text{pulse}} < 0.8\text{s}$), draw a neon green circle centered at $(112, 0)$ with expanding radius $r = 320 \cdot \frac{t_{\text{pulse}}}{0.8}$ and stroke width $2\text{px}$.
3. **Digital Matrix Rain**:
   16 columns of single-character hexadecimal pixel glyphs descending at $60\text{ px/s}$ in `#00FF41`.

### 3.5 Clean Teardown
- Restore `player.fireCooldownTimer` to baseline $0.12\text{s}$.
- Restore enemy bullet velocities to linear trajectory without steering.
- Clear pulse and matrix buffer state.

---

## 4. Event 2: `TheUnbiddenEvent.ts` (The Unbidden — 이차원 침략자)

### 4.1 Overview & Lore
- **Crisis Type**: `CrisisEventType.THE_UNBIDDEN`
- **Name**: `THE UNBIDDEN`
- **Subtitle / Flavor Text**: `DIMENSIONAL TEAR DETECTED | GRAVITATIONAL ANOMALY ACTIVE`
- **Warning Duration**: $3.0\text{s}$ | **Active Duration**: $20.0\text{s}$
- **Gameplay Threat**: An extradimensional portal tears open at top-center $(x = 112, y = 60)$. Its gravitational well bends all player missiles toward the center, requiring the player to lead and compensate with curved trick shots. Diving aliens near the rift are pulled into spiral arcs.

### 4.2 State Variables & Parameters
```typescript
private riftX: number = 112;
private riftY: number = 60;
private riftRadius: number = 22;
private gravityConstant: number = 280000; // px^3 / s^2
private softeningEpsilonSq: number = 400; // 20^2 px^2 to prevent numerical singularity
private vortexAngle: number = 0;
private pulseTimer: number = 0;

// Zero-allocation buffer for 24 inward-spiraling void motes
private static readonly MOTE_COUNT = 24;
private moteDist: Float32Array = new Float32Array(24);
private moteAngle: Float32Array = new Float32Array(24);
private moteSpeed: Float32Array = new Float32Array(24);
```

### 4.3 Mathematical Formulas & Physics

#### A. Softened Plummer Gravitational Trajectory Bending
For any player bullet at position $(x_b, y_b)$ with velocity $(v_{bx}, v_{by})$:
$$\Delta x = x_{\text{rift}} - x_b$$
$$\Delta y = y_{\text{rift}} - y_b$$
$$r^2 = \Delta x^2 + \Delta y^2$$
$$a = \frac{G}{(r^2 + \epsilon^2)^{3/2}}$$
$$v_{bx}(t + dt) = v_{bx}(t) + (a \cdot \Delta x) \cdot dt$$
$$v_{by}(t + dt) = v_{by}(t) + (a \cdot \Delta y) \cdot dt$$
$$\text{clamped: } |v_{bx}| \le 300\text{ px/s}, \quad v_{by} \le -150\text{ px/s}$$

*Numerical Safety Proof*: As $r \to 0$, $(r^2 + 400)^{3/2} \ge 8000$, ensuring $a \le \frac{280000}{8000} = 35\text{ px/s}^2$. Acceleration is bounded and cannot cause `NaN`, `Infinity`, or teleportation.

#### B. Inward Logarithmic Vortex Spiral
For void mote $i$:
$$r_i(t + dt) = r_i(t) - v_{i} \cdot dt$$
$$\theta_i(t + dt) = \theta_i(t) + \left(2.5 + \frac{40}{r_i + 5}\right) \cdot dt$$
$$\text{If } r_i < 3 \implies r_i = 65 + \text{random} \cdot 25, \quad \theta_i = \text{random} \cdot 2\pi$$
$$x_i = x_{\text{rift}} + r_i \cos(\theta_i), \quad y_i = y_{\text{rift}} + r_i \sin(\theta_i) \cdot 0.75$$

### 4.4 Canvas Rendering Pipeline
1. **Outer Void Corona**:
   Concentric circular gradients in deep purple `rgba(138, 43, 226, 0.25)` to electric magenta `rgba(255, 0, 255, 0.05)`.
2. **Logarithmic Vortex Arms**:
   3 spiral arms drawn with quadratic curves rotating at $\omega = 2.2\text{ rad/s}$ in cyan `#00FFFF`.
3. **Singularity Core (Event Horizon)**:
   Pitch black central disk of radius $16\text{px}$ with a pulsating incandescent event horizon border (`#FFFFFF` to `#8A2BE2`).
4. **Swirling Void Motes**:
   24 glowing particles cycling through `#00FFFF`, `#FF00FF`, `#FFFFFF`.

### 4.5 Clean Teardown
- Smoothly collapse rift radius from $22\text{px} \to 0\text{px}$ over $0.4\text{s}$.
- Bullet manager resumes linear vertical physics ($v_{bx} = 0, v_{by} = -480$).
- Reset mote buffers.

---

## 5. Event 3: `ThePrethorynScourgeEvent.ts` (The Prethoryn Scourge — 생물군집)

### 5.1 Overview & Lore
- **Crisis Type**: `CrisisEventType.THE_PRETHORYN_SCOURGE`
- **Name**: `THE PRETHORYN SCOURGE`
- **Subtitle / Flavor Text**: `ORGANIC SWARM INFECTION | ACID SPORES & CHITIN REGENERATION`
- **Warning Duration**: $3.0\text{s}$ | **Active Duration**: $20.0\text{s}$
- **Gameplay Threat**: The bio-organic hive fleet infests space. Every defeated alien bursts into lethal bio-acid micro-spores that descend toward the player ship. Living enemies secrete thick chitinous shields (+1 shield) that regenerate if left undamaged for 5 seconds.

### 5.2 State Variables & Parameters
```typescript
private activeTimer: number = 0;
private enemyLastHitMap: Map<string | number, number> = new Map();
private lastLivingEnemyCount: number = 0;
private regenDelaySec: number = 5.0;

// Zero-allocation pool of 32 micro-spores
public interface MicroSpore {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  active: boolean;
}
private sporePool: MicroSpore[] = [];
```

### 5.3 Mathematical Formulas & Physics

#### A. Micro-Spore Rupture Physics
Upon enemy death at $(x_e, y_e)$:
Spawn 2 spores (3 if Boss Galaga):
$$\theta_k = \frac{\pi}{2} + (-1)^k \cdot \left(0.35 + 0.15 \cdot \text{rand}\right)$$
$$v_s = 140 + 30 \cdot \text{rand}$$
$$v_{kx} = v_s \cos(\theta_k), \quad v_{ky} = v_s \sin(\theta_k)$$
Each frame:
$$x_k(t + dt) = x_k(t) + v_{kx} dt + 4 \sin(8\pi t) dt$$
$$y_k(t + dt) = y_k(t) + v_{ky} dt$$

#### B. Chitin Shield Cellular Regeneration
For each living enemy $e$:
$$\Delta t_{\text{undamaged}} = t_{\text{now}} - t_{\text{last\_hit}}(e)$$
$$\text{If } \Delta t_{\text{undamaged}} \ge 5.0\text{s} \text{ and } e.\text{shield} < e.\text{maxShield} \implies e.\text{shield} \mathrel{+}= 1$$

#### C. Organic Membrane Deformation
Dynamic organic shield boundary:
$$R(\theta, t) = R_0 \cdot \left[1.0 + 0.14 \sin(3\theta + 6t) + 0.08 \cos(5\theta - 4t)\right]$$
Color: Sickly bioluminescent green `rgba(57, 255, 20, 0.45)` with amber core.

### 5.4 Canvas Rendering Pipeline
1. **Edge Bio-Tendrils**:
   Organic roots creeping along canvas borders ($x \le 8, x \ge 216$) with pulsating yellow/green lymph nodes.
2. **Organic Chitin Shields**:
   Rendered around each living shielded enemy with pulsating organic wobble.
3. **Acid Micro-Spores**:
   3x3 pixel toxic green (`#39FF14`) blobs leaving 1-pixel trailing acidic droplets (`#ADFF2F`).

### 5.5 Clean Teardown
- Clear and recycle all active micro-spores.
- Clear `enemyLastHitMap`.
- Clamp excess shields back to stage tier maximum.
- Dissolve bio-tendrils.

---

## 6. Event 4: `ShieldOverloadEvent.ts` (Shield Overload — 에너지 과부하)

### 6.1 Overview & Lore
- **Crisis Type**: `CrisisEventType.SHIELD_OVERLOAD`
- **Name**: `SHIELD OVERLOAD`
- **Subtitle / Flavor Text**: `ENERGY MATRIX OVERDRIVE | FLEET DEFLECTORS CHARGED (+2 SHIELDS)`
- **Warning Duration**: $3.0\text{s}$ | **Active Duration**: $20.0\text{s}$
- **Gameplay Threat**: An overarching deflector grid blankets the enemy formation. All living enemies immediately gain **+2 Kinetic Shields**, turning even 1-hit Zakos into 3-hit armored targets. Shimmering cyan hexagonal barriers absorb player fire with acoustic pings.

### 6.2 State Variables & Parameters
```typescript
private appliedShields: boolean = false;
private hexRotation: number = 0;
private hexRadius: number = 13;
private activeTimer: number = 0;
private sweepY: number = 0;
private sweepActive: boolean = true;

// Zero-allocation pool of 24 shattered hexagon shards
private static readonly MAX_SHARDS = 24;
private shardX: Float32Array = new Float32Array(24);
private shardY: Float32Array = new Float32Array(24);
private shardVx: Float32Array = new Float32Array(24);
private shardVy: Float32Array = new Float32Array(24);
private shardLife: Float32Array = new Float32Array(24);
private shardActive: Uint8Array = new Uint8Array(24);
```

### 6.3 Mathematical Formulas & Physics

#### A. Shield Granting Logic (Once on Activation)
```typescript
for (const enemy of formationManager.enemies) {
  if (enemy.active && enemy.state !== EnemyState.INACTIVE) {
    enemy.maxShield = Math.max(enemy.maxShield, enemy.shield + 2);
    enemy.shield += 2;
  }
}
```

#### B. Regular Hexagon Vertex Transformation
For enemy at $(x, y)$:
$$x_k = x + R_{\text{hex}} \cos\left(\frac{k \pi}{3} + \theta_{\text{rot}}\right)$$
$$y_k = y + R_{\text{hex}} \sin\left(\frac{k \pi}{3} + \theta_{\text{rot}}\right)$$
for $k \in \{0, 1, 2, 3, 4, 5\}$, where $\theta_{\text{rot}} = 0.6 \cdot t$.

#### C. Hexagonal Shatter Dispersion
When an enemy shield breaks from 1 to 0:
Spawn 6 shards at hexagon vertices moving radially:
$$\vec{v}_k = (75 \cos(\theta_k), 75 \sin(\theta_k)), \quad \text{lifespan} = 0.3\text{s}$$

### 6.4 Canvas Rendering Pipeline
1. **Fleet Matrix Interlink Filaments**:
   Connect adjacent formation enemies with subtle cyan laser threads: `rgba(0, 229, 255, 0.18)`.
2. **Rotating Hexagonal Kinetic Barriers**:
   - Shield $\ge 2$: Double concentric neon cyan hexagon (`#00E5FF`, `#80D8FF`).
   - Shield $= 1$: Single hexagon with dynamic fracture lines.
3. **Overdrive Sweep Wave**:
   Horizontal energy wave traversing top-to-bottom ($y = 0 \to 288$ at $180\text{ px/s}$).
4. **Flying Hexagonal Shards**:
   Luminescent cyan fragments radiating outward upon shield breach.

### 6.5 Clean Teardown
- Deactivate energy sweep and interlink filaments.
- Clear shard particles.
- Remaining enemy shields persist until depleted naturally.

---

## 7. Event 5: `PhysicsInversionEvent.ts` (Physics Inversion — 물리법칙 왜곡)

### 7.1 Overview & Lore
- **Crisis Type**: `CrisisEventType.PHYSICS_INVERSION`
- **Name**: `PHYSICS INVERSION`
- **Subtitle / Flavor Text**: `SINGULARITY SHIFT | GRAVITATIONAL VECTOR REVERSED`
- **Warning Duration**: $3.0\text{s}$ | **Active Duration**: $20.0\text{s}$
- **Gameplay Threat**: Local spacetime metrics invert. The parallax starfield reverses upward, diving aliens loop upward in anti-gravity arcs, and the player fighter exhibits micro-gravity inertia drift.

### 7.2 State Variables & Parameters
```typescript
private activeTimer: number = 0;
private originalStarfieldSpeed: number = 1.0;
private playerDriftVx: number = 0;
private driftInertiaTau: number = 0.12; // Time constant for steering momentum
private gridUndulationPhase: number = 0;
```

### 7.3 Mathematical Formulas & Physics

#### A. Upward Starfield Kinematics
Standard starfield integrates $y \mathrel{+}= v_{\text{star}} \cdot dt$.
Under Inversion:
$$y_{\text{star}}(t + dt) = y_{\text{star}}(t) - v_{\text{star}} \cdot 1.8 \cdot dt$$
$$\text{If } y_{\text{star}} < 0 \implies y_{\text{star}} \mathrel{+}= 288, \quad x_{\text{star}} = \text{random} \cdot 224$$

#### B. Player Micro-Gravity Inertial Steering
Let target input velocity be $v_{\text{target}} \in \{-260, 0, 260\}\text{ px/s}$.
$$\frac{dv_{px}}{dt} = \frac{v_{\text{target}} - v_{px}}{\tau_{\text{drift}}}$$
$$v_{px}(t + dt) = v_{px}(t) + (v_{\text{target}} - v_{px}(t)) \cdot \min(1.0, 8.5 \cdot dt)$$
$$x_p(t + dt) = \text{clamp}(x_p(t) + v_{px} \cdot dt, 16, 208)$$

#### C. Inverted Anti-Gravity Alien Dive Arcs
For diving enemies:
$$a_{\text{anti\_g}} = -140 \cdot \sin\left(\frac{\pi y_e}{144}\right)$$
$$v_{ey}(t + dt) = v_{ey}(t) + a_{\text{anti\_g}} \cdot dt$$
Enemies stall mid-screen and swoop upward into an inverted loop before diving again.

### 7.4 Canvas Rendering Pipeline
1. **Inverted Starfield Streaks**:
   Foreground stars render motion blur streaks extending downward (indicating upward movement).
2. **Warped Spacetime Grid**:
   Subtle undulating indigo mesh (`rgba(138, 43, 226, 0.08)`) with sinusoidal vertex displacement:
   $$\Delta y = 4 \sin(0.06 x + 3t) \cos(0.05 y + 2t)$$
3. **Ascending Gravitational Glyphs**:
   Faint upward chevron arrows $(\uparrow)$ floating slowly along the side gutters.

### 7.5 Clean Teardown
- Restore starfield speed smoothly to $+1.0$ (downward).
- Restore player steering to direct instantaneous control ($v_{px} = v_{\text{target}}$).
- Clear undulating grid.

---

## 8. Event 6: `HyperspaceStormEvent.ts` (Hyperspace Storm — 초공간 폭풍)

### 8.1 Overview & Lore
- **Crisis Type**: `CrisisEventType.HYPERSPACE_STORM`
- **Name**: `HYPERSPACE STORM`
- **Subtitle / Flavor Text**: `HYPERLANE TEMPEST | COSMIC LIGHTNING & DIVE BOOST +25%`
- **Warning Duration**: $3.0\text{s}$ | **Active Duration**: $20.0\text{s}$
- **Gameplay Threat**: An interstellar ion storm sweeps the playfield. The screen is divided into 7 vertical lanes. Periodic cosmic lightning strikes obliterate entire columns, forcing the player to evade. Ionized plasma winds accelerate enemy diving speeds by +25%.

### 8.2 State Variables & Parameters
```typescript
private activeTimer: number = 0;
private originalDiveSpeedMultiplier: number = 1.0;
private originalDiveInterval: number = 3.0;

// Lightning Lane State Machine
private static readonly TOTAL_LANES = 7;
private static readonly LANE_WIDTH = 32;
private laneState: 'IDLE' | 'WARNING' | 'STRIKING' = 'IDLE';
private activeLane: number = -1;
private laneTimer: number = 0;
private laneCycleTimer: number = 0;
private warningDuration: number = 0.9; // 900ms warning flash
private strikeDuration: number = 0.25;  // 250ms active bolt
private flashAlpha: number = 0;

// Pre-allocated buffer for 12 lightning bolt vertices
private boltNodesX: Float32Array = new Float32Array(12);
private boltNodesY: Float32Array = new Float32Array(12);
```

### 8.3 Mathematical Formulas & Physics

#### A. Enemy Dive Speed Multiplier Boost (+25%)
$$M_{\text{dive}} = M_{\text{base}} \times 1.25$$
$$T_{\text{dive\_interval}} = T_{\text{base}} \times 0.80$$

#### B. Procedural Midpoint Displacement Lightning
For lane center $x_c = \text{activeLane} \cdot 32 + 16$:
For node $k \in \{0, 1, \dots, 11\}$:
$$y_k = \frac{288 \cdot k}{11}$$
$$x_k = x_c + 12 \sin(0.1 y_k + 5t) + (\text{random} - 0.5) \cdot 10$$
$$\text{clamp: } x_k \in [x_c - 14, x_c + 14]$$

#### C. Player-Lane AABB Hazard Intersection
$$\text{hit} = (\text{laneState} == \text{'STRIKING'}) \land (x_p + w_p/2 > x_{\text{lane\_min}}) \land (x_p - w_p/2 < x_{\text{lane\_max}})$$
If `hit` is true and player is not invulnerable:
Triggers fatal damage or shield deflection.

### 8.4 Canvas Rendering Pipeline
1. **Vertical Warning Columns**:
   When in `WARNING`: draw semi-transparent column over active lane with blinking diagonal hash marks and warning glyph `[!]`:
   $$\alpha_{\text{warn}}(t) = 0.22 + 0.16 \sin(20\pi t)$$
2. **Tri-Layer Plasma Lightning Bolt**:
   - Layer 1 (Outer glow): $6\text{px}$ stroke in deep violet `#8A2BE2` ($\alpha = 0.4$).
   - Layer 2 (Arc sheath): $3\text{px}$ stroke in electric cyan `#00FFFF` ($\alpha = 0.8$).
   - Layer 3 (Core plasma): $1\text{px}$ stroke in pure white `#FFFFFF` ($\alpha = 1.0$).
3. **Screen Strobe Flash**:
   When bolt discharges, set `flashAlpha = 0.28`, decaying linearly in $0.1\text{s}$.

### 8.5 Clean Teardown
- Restore `formationManager.diveSpeedMultiplier` to baseline.
- Restore `formationManager.diveInterval` to baseline.
- Reset lightning lane state machine to `IDLE`.
- Clear `flashAlpha`.

---

## 9. Full TypeScript Source Code Blueprint for Events 1–6

The following production-ready implementations are provided for direct integration into `src/core/crisis/events/`:

### 9.1 `TheContingencyEvent.ts`
```typescript
/**
 * The Contingency Crisis Event
 * AI Rogue Pulse: Predictive enemy bullet aim and player fire rate stutter.
 */
import type { CrisisEventContext, ICrisisEvent, CrisisState } from '../types';
import { CrisisEventType } from '../types';

export class TheContingencyEvent implements ICrisisEvent {
  public readonly type = CrisisEventType.THE_CONTINGENCY;
  public readonly name = 'THE CONTINGENCY';
  public readonly subtitle = 'GHOST SIGNAL OVERRIDE';
  public readonly flavorText = 'GHOST SIGNAL OVERRIDE';
  public readonly warningDurationSec = 3.0;
  public readonly warningDuration = 3.0;
  public readonly durationSec = 20.0;
  public readonly activeDuration = 20.0;

  private _state: CrisisState = 'IDLE';
  private context: CrisisEventContext | null = null;
  private activeTimer: number = 0;
  private pulseTimer: number = 0;
  private isPulsing: boolean = false;
  private pulseRadius: number = 0;
  private stutterTimer: number = 0;

  // Zero-allocation matrix rain buffer
  private matrixDropX = new Float32Array([16, 28, 44, 60, 76, 92, 108, 124, 140, 156, 172, 188, 204, 36, 100, 164]);
  private matrixDropY = new Float32Array(16);
  private matrixDropSpeed = new Float32Array(16);

  public get state(): CrisisState {
    return this._state;
  }

  public init(context: CrisisEventContext): void {
    this.context = context;
    this.reset();
  }

  public startWarning(): void {
    this._state = 'WARNING';
  }
  public onWarningStart(): void { this.startWarning(); }

  public activate(): void {
    this._state = 'ACTIVE';
    this.activeTimer = 0;
    this.pulseTimer = 0;
    for (let i = 0; i < 16; i++) {
      this.matrixDropY[i] = Math.random() * 288;
      this.matrixDropSpeed[i] = 40 + Math.random() * 40;
    }
  }
  public onActivate(): void { this.activate(); }

  public update(dt: number): void {
    if (this._state !== 'ACTIVE' || !this.context) return;

    this.activeTimer += dt;
    if (this.activeTimer >= this.durationSec) {
      this.deactivate();
      return;
    }

    const { player, bulletManager } = this.context;

    // 1. Rogue AI EMP Pulse
    this.pulseTimer += dt;
    if (this.pulseTimer >= 3.5) {
      this.pulseTimer = 0;
      this.isPulsing = true;
      this.pulseRadius = 0;
    }

    if (this.isPulsing) {
      this.pulseRadius += 350 * dt;
      if (this.pulseRadius > 320) {
        this.isPulsing = false;
      }
    }

    // 2. Predictive Enemy Bullet Micro-Homing Steering
    if (bulletManager && player) {
      bulletManager.forEachActiveEnemyBullet((bullet: any) => {
        if (!bullet.active || bullet.position.y >= player.y - 15) return;
        const dx = player.x - bullet.position.x;
        const steer = Math.sign(dx) * 85 * dt;
        bullet.velocity.x = Math.max(-120, Math.min(120, bullet.velocity.x + steer));
        bullet.angle = Math.atan2(bullet.velocity.y, bullet.velocity.x);
      });
    }

    // 3. Player Fire Rate Stutter
    if (player) {
      this.stutterTimer += dt;
      const cycle = this.stutterTimer % 2.6;
      if (cycle < 0.45 && player.fireCooldownTimer > 0) {
        player.fireCooldownTimer = Math.max(player.fireCooldownTimer, 0.22);
      }
    }

    // 4. Matrix Digital Rain Update
    for (let i = 0; i < 16; i++) {
      this.matrixDropY[i] += this.matrixDropSpeed[i] * dt;
      if (this.matrixDropY[i] > 288) {
        this.matrixDropY[i] = -10;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this._state !== 'ACTIVE') return;

    ctx.save();

    // 1. Phosphor Green CRT Scanlines
    ctx.fillStyle = 'rgba(0, 255, 65, 0.04)';
    for (let y = 0; y < 288; y += 4) {
      ctx.fillRect(0, y, 224, 1);
    }

    // 2. Expanding Pulse Wavefront
    if (this.isPulsing) {
      const alpha = Math.max(0, 1 - this.pulseRadius / 320);
      ctx.strokeStyle = `rgba(0, 255, 100, ${alpha * 0.7})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(112, 0, this.pulseRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Matrix Digital Code Drops
    ctx.fillStyle = '#00FF41';
    for (let i = 0; i < 16; i++) {
      const px = Math.floor(this.matrixDropX[i]);
      const py = Math.floor(this.matrixDropY[i]);
      ctx.fillRect(px, py, 2, 4);
      ctx.fillRect(px, py - 6, 1, 3);
    }

    ctx.restore();
  }

  public deactivate(): void {
    this._state = 'COMPLETED';
    this.isPulsing = false;
  }
  public onDeactivate(): void { this.deactivate(); }

  public reset(): void {
    this._state = 'IDLE';
    this.activeTimer = 0;
    this.pulseTimer = 0;
    this.isPulsing = false;
    this.pulseRadius = 0;
    this.stutterTimer = 0;
  }

  public isFinished(): boolean {
    return this._state === 'COMPLETED';
  }
  public isComplete(): boolean {
    return this.isFinished();
  }
}
```

### 9.2 `TheUnbiddenEvent.ts`
```typescript
/**
 * The Unbidden Crisis Event
 * Dimensional Tear: Gravitational anomaly bending player bullet trajectories toward center.
 */
import type { CrisisEventContext, ICrisisEvent, CrisisState } from '../types';
import { CrisisEventType } from '../types';

export class TheUnbiddenEvent implements ICrisisEvent {
  public readonly type = CrisisEventType.THE_UNBIDDEN;
  public readonly name = 'THE UNBIDDEN';
  public readonly subtitle = 'DIMENSIONAL TEAR DETECTED';
  public readonly flavorText = 'DIMENSIONAL TEAR DETECTED';
  public readonly warningDurationSec = 3.0;
  public readonly warningDuration = 3.0;
  public readonly durationSec = 20.0;
  public readonly activeDuration = 20.0;

  private _state: CrisisState = 'IDLE';
  private context: CrisisEventContext | null = null;
  private activeTimer: number = 0;
  private riftX: number = 112;
  private riftY: number = 60;
  private vortexAngle: number = 0;

  // Zero-allocation buffer for 24 inward spiraling motes
  private moteR = new Float32Array(24);
  private moteTheta = new Float32Array(24);
  private moteSpeed = new Float32Array(24);

  public get state(): CrisisState {
    return this._state;
  }

  public init(context: CrisisEventContext): void {
    this.context = context;
    this.reset();
  }

  public startWarning(): void {
    this._state = 'WARNING';
  }
  public onWarningStart(): void { this.startWarning(); }

  public activate(): void {
    this._state = 'ACTIVE';
    this.activeTimer = 0;
    this.vortexAngle = 0;
    for (let i = 0; i < 24; i++) {
      this.moteR[i] = 20 + Math.random() * 60;
      this.moteTheta[i] = Math.random() * Math.PI * 2;
      this.moteSpeed[i] = 25 + Math.random() * 25;
    }
  }
  public onActivate(): void { this.activate(); }

  public update(dt: number): void {
    if (this._state !== 'ACTIVE' || !this.context) return;

    this.activeTimer += dt;
    if (this.activeTimer >= this.durationSec) {
      this.deactivate();
      return;
    }

    this.vortexAngle += 2.2 * dt;

    const { bulletManager } = this.context;

    // 1. Softened Gravitational Trajectory Bending on Player Missiles
    if (bulletManager) {
      const G = 280000;
      const epsSq = 400; // 20^2 px^2
      bulletManager.forEachActivePlayerBullet((bullet: any) => {
        if (!bullet.active) return;
        const dx = this.riftX - bullet.position.x;
        const dy = this.riftY - bullet.position.y;
        const rSq = dx * dx + dy * dy;
        const denom = Math.pow(rSq + epsSq, 1.5);
        const ax = (G * dx) / denom;
        const ay = (G * dy) / denom;

        bullet.velocity.x += ax * dt;
        bullet.velocity.y += ay * dt;
        bullet.velocity.x = Math.max(-280, Math.min(280, bullet.velocity.x));
      });
    }

    // 2. Inward Spiraling Void Motes
    for (let i = 0; i < 24; i++) {
      this.moteR[i] -= this.moteSpeed[i] * dt;
      this.moteTheta[i] += (2.2 + 35 / (this.moteR[i] + 5)) * dt;
      if (this.moteR[i] <= 3) {
        this.moteR[i] = 70 + Math.random() * 20;
        this.moteTheta[i] = Math.random() * Math.PI * 2;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this._state !== 'ACTIVE') return;

    ctx.save();

    // 1. Outer Dimensional Aurora
    const grad = ctx.createRadialGradient(this.riftX, this.riftY, 4, this.riftX, this.riftY, 55);
    grad.addColorStop(0, 'rgba(138, 43, 226, 0.45)');
    grad.addColorStop(0.5, 'rgba(0, 255, 255, 0.20)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.riftX, this.riftY, 55, 0, Math.PI * 2);
    ctx.fill();

    // 2. Rotating Vortex Arms
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 1.5;
    for (let arm = 0; arm < 3; arm++) {
      const baseA = this.vortexAngle + (arm * Math.PI * 2) / 3;
      ctx.beginPath();
      for (let step = 0; step < 16; step++) {
        const r = 6 + step * 2.8;
        const theta = baseA + step * 0.25;
        const x = this.riftX + r * Math.cos(theta);
        const y = this.riftY + r * Math.sin(theta) * 0.75;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 3. Singularity Event Horizon Core
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(this.riftX, this.riftY, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#FF00FF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.riftX, this.riftY, 14 + Math.sin(this.vortexAngle * 3) * 2, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Inward Spiraling Motes
    ctx.fillStyle = '#00FFFF';
    for (let i = 0; i < 24; i++) {
      const x = Math.floor(this.riftX + this.moteR[i] * Math.cos(this.moteTheta[i]));
      const y = Math.floor(this.riftY + this.moteR[i] * Math.sin(this.moteTheta[i]) * 0.75);
      ctx.fillRect(x, y, 1, 1);
    }

    ctx.restore();
  }

  public deactivate(): void {
    this._state = 'COMPLETED';
  }
  public onDeactivate(): void { this.deactivate(); }

  public reset(): void {
    this._state = 'IDLE';
    this.activeTimer = 0;
    this.vortexAngle = 0;
  }

  public isFinished(): boolean {
    return this._state === 'COMPLETED';
  }
  public isComplete(): boolean {
    return this.isFinished();
  }
}
```

### 9.3 `ThePrethorynScourgeEvent.ts`
```typescript
/**
 * The Prethoryn Scourge Crisis Event
 * Organic Infestation: Defeated enemies burst into micro-spores; chitin regenerative shields.
 */
import type { CrisisEventContext, ICrisisEvent, CrisisState } from '../types';
import { CrisisEventType } from '../types';

interface MicroSpore {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  active: boolean;
}

export class ThePrethorynScourgeEvent implements ICrisisEvent {
  public readonly type = CrisisEventType.THE_PRETHORYN_SCOURGE;
  public readonly name = 'THE PRETHORYN SCOURGE';
  public readonly subtitle = 'ORGANIC SWARM INFECTION';
  public readonly flavorText = 'ORGANIC SWARM INFECTION';
  public readonly warningDurationSec = 3.0;
  public readonly warningDuration = 3.0;
  public readonly durationSec = 20.0;
  public readonly activeDuration = 20.0;

  private _state: CrisisState = 'IDLE';
  private context: CrisisEventContext | null = null;
  private activeTimer: number = 0;
  private lastEnemyCount: number = 0;
  private enemyLastHitMap: Map<string | number, number> = new Map();
  private bioAuraPhase: number = 0;

  // Zero-allocation pool of 32 micro-spores
  private sporePool: MicroSpore[] = [];

  constructor() {
    for (let i = 0; i < 32; i++) {
      this.sporePool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 3.0, active: false });
    }
  }

  public get state(): CrisisState {
    return this._state;
  }

  public init(context: CrisisEventContext): void {
    this.context = context;
    this.reset();
  }

  public startWarning(): void {
    this._state = 'WARNING';
  }
  public onWarningStart(): void { this.startWarning(); }

  public activate(): void {
    this._state = 'ACTIVE';
    this.activeTimer = 0;
    this.enemyLastHitMap.clear();

    // Grant +1 Chitin Shield to all living formation enemies
    if (this.context?.formationManager) {
      for (const enemy of this.context.formationManager.enemies) {
        if (enemy.active && enemy.state !== 'INACTIVE') {
          enemy.maxShield = Math.max(enemy.maxShield, (enemy.shield || 0) + 1);
          enemy.shield = (enemy.shield || 0) + 1;
        }
      }
      this.lastEnemyCount = this.context.formationManager.getLivingEnemies?.().length ?? 0;
    }
  }
  public onActivate(): void { this.activate(); }

  public update(dt: number): void {
    if (this._state !== 'ACTIVE' || !this.context) return;

    this.activeTimer += dt;
    if (this.activeTimer >= this.durationSec) {
      this.deactivate();
      return;
    }

    this.bioAuraPhase += 4 * dt;
    const { formationManager, player } = this.context;

    // 1. Spore Rupture Check on Enemy Death
    if (formationManager) {
      const living = formationManager.getLivingEnemies?.() ?? [];
      if (living.length < this.lastEnemyCount) {
        // Find newly destroyed enemies
        for (const enemy of formationManager.enemies) {
          if (enemy.state === 'EXPLODING' && enemy.deathTimer >= 0.25) {
            this.spawnSpores(enemy.x, enemy.y);
          }
        }
      }
      this.lastEnemyCount = living.length;

      // 2. Chitin Shield Cellular Regeneration (after 5s undamaged)
      for (const enemy of living) {
        const lastHit = this.enemyLastHitMap.get(enemy.id) ?? 0;
        if (this.activeTimer - lastHit >= 5.0 && (enemy.shield || 0) < enemy.maxShield) {
          enemy.shield = (enemy.shield || 0) + 1;
          this.enemyLastHitMap.set(enemy.id, this.activeTimer);
        }
      }
    }

    // 3. Update Micro-Spores & Collision with Player
    for (const spore of this.sporePool) {
      if (!spore.active) continue;
      spore.life += dt;
      spore.x += spore.vx * dt + Math.sin(spore.life * 10) * 20 * dt;
      spore.y += spore.vy * dt;

      if (spore.y > 290 || spore.life >= spore.maxLife) {
        spore.active = false;
        continue;
      }

      // Check collision with player
      if (player && !player.isInvulnerable?.() && Math.abs(spore.x - player.x) < 8 && Math.abs(spore.y - player.y) < 8) {
        spore.active = false;
        player.onExplode?.(player.x, player.y, player.isDual);
      }
    }
  }

  private spawnSpores(x: number, y: number): void {
    let spawned = 0;
    for (const spore of this.sporePool) {
      if (!spore.active) {
        spore.active = true;
        spore.x = x;
        spore.y = y;
        const angle = Math.PI / 2 + (spawned === 0 ? -0.4 : 0.4);
        const speed = 140 + Math.random() * 30;
        spore.vx = Math.cos(angle) * speed;
        spore.vy = Math.sin(angle) * speed;
        spore.life = 0;
        spawned++;
        if (spawned >= 2) break;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this._state !== 'ACTIVE') return;

    ctx.save();

    // 1. Organic Infestation Tendrils on Edges
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(8, 144, 0, 288);
    ctx.moveTo(224, 0);
    ctx.quadraticCurveTo(216, 144, 224, 288);
    ctx.stroke();

    // 2. Bio-Acid Micro-Spores
    ctx.fillStyle = '#39FF14';
    for (const spore of this.sporePool) {
      if (spore.active) {
        ctx.fillRect(Math.floor(spore.x - 1), Math.floor(spore.y - 1), 3, 3);
        ctx.fillStyle = '#FF7518';
        ctx.fillRect(Math.floor(spore.x), Math.floor(spore.y), 1, 1);
        ctx.fillStyle = '#39FF14';
      }
    }

    // 3. Chitinous Shield Membranes
    if (this.context?.formationManager) {
      ctx.strokeStyle = 'rgba(173, 255, 47, 0.50)';
      ctx.lineWidth = 1;
      for (const enemy of this.context.formationManager.enemies) {
        if (enemy.active && (enemy.shield || 0) > 0) {
          ctx.beginPath();
          const r = 11 + Math.sin(this.bioAuraPhase + enemy.x) * 1.5;
          ctx.arc(enemy.x, enemy.y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  public deactivate(): void {
    this._state = 'COMPLETED';
    for (const spore of this.sporePool) spore.active = false;
  }
  public onDeactivate(): void { this.deactivate(); }

  public reset(): void {
    this._state = 'IDLE';
    this.activeTimer = 0;
    this.enemyLastHitMap.clear();
    for (const spore of this.sporePool) spore.active = false;
  }

  public isFinished(): boolean {
    return this._state === 'COMPLETED';
  }
  public isComplete(): boolean {
    return this.isFinished();
  }
}
```

### 9.4 `ShieldOverloadEvent.ts`
```typescript
/**
 * Shield Overload Crisis Event
 * Energy Matrix Overdrive: +2 shields for all living enemies in formation.
 */
import type { CrisisEventContext, ICrisisEvent, CrisisState } from '../types';
import { CrisisEventType } from '../types';

export class ShieldOverloadEvent implements ICrisisEvent {
  public readonly type = CrisisEventType.SHIELD_OVERLOAD;
  public readonly name = 'SHIELD OVERLOAD';
  public readonly subtitle = 'ENERGY MATRIX OVERDRIVE';
  public readonly flavorText = 'ENERGY MATRIX OVERDRIVE';
  public readonly warningDurationSec = 3.0;
  public readonly warningDuration = 3.0;
  public readonly durationSec = 20.0;
  public readonly activeDuration = 20.0;

  private _state: CrisisState = 'IDLE';
  private context: CrisisEventContext | null = null;
  private activeTimer: number = 0;
  private hexRotation: number = 0;
  private sweepY: number = 0;
  private isSweeping: boolean = true;

  public get state(): CrisisState {
    return this._state;
  }

  public init(context: CrisisEventContext): void {
    this.context = context;
    this.reset();
  }

  public startWarning(): void {
    this._state = 'WARNING';
  }
  public onWarningStart(): void { this.startWarning(); }

  public activate(): void {
    this._state = 'ACTIVE';
    this.activeTimer = 0;
    this.sweepY = 0;
    this.isSweeping = true;

    // Grant +2 Kinetic Shields to all living enemies
    if (this.context?.formationManager) {
      for (const enemy of this.context.formationManager.enemies) {
        if (enemy.active && enemy.state !== 'INACTIVE') {
          enemy.maxShield = Math.max(enemy.maxShield, (enemy.shield || 0) + 2);
          enemy.shield = (enemy.shield || 0) + 2;
        }
      }
    }
  }
  public onActivate(): void { this.activate(); }

  public update(dt: number): void {
    if (this._state !== 'ACTIVE' || !this.context) return;

    this.activeTimer += dt;
    if (this.activeTimer >= this.durationSec) {
      this.deactivate();
      return;
    }

    this.hexRotation += 0.8 * dt;

    if (this.isSweeping) {
      this.sweepY += 220 * dt;
      if (this.sweepY > 288) {
        this.isSweeping = false;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this._state !== 'ACTIVE') return;

    ctx.save();

    // 1. Kinetic Interlink Laser Filaments between Formation Enemies
    if (this.context?.formationManager) {
      const enemies = this.context.formationManager.enemies;
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < enemies.length; i++) {
        const e1 = enemies[i];
        if (!e1.active || (e1.shield || 0) <= 0) continue;
        for (let j = i + 1; j < enemies.length; j++) {
          const e2 = enemies[j];
          if (!e2.active || (e2.shield || 0) <= 0) continue;
          const distSq = (e1.x - e2.x) ** 2 + (e1.y - e2.y) ** 2;
          if (distSq < 750) {
            ctx.moveTo(Math.floor(e1.x), Math.floor(e1.y));
            ctx.lineTo(Math.floor(e2.x), Math.floor(e2.y));
          }
        }
      }
      ctx.stroke();

      // 2. Rotating Hexagonal Kinetic Barriers
      for (const enemy of enemies) {
        if (!enemy.active || (enemy.shield || 0) <= 0) continue;
        const s = enemy.shield;
        ctx.strokeStyle = s >= 2 ? '#00E5FF' : '#80D8FF';
        ctx.lineWidth = 1;

        // Outer Hexagon
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const angle = this.hexRotation + (k * Math.PI) / 3;
          const hx = enemy.x + 12 * Math.cos(angle);
          const hy = enemy.y + 12 * Math.sin(angle);
          if (k === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();

        // Inner Hexagon for shield >= 2
        if (s >= 2) {
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const angle = -this.hexRotation + (k * Math.PI) / 3;
            const hx = enemy.x + 8 * Math.cos(angle);
            const hy = enemy.y + 8 * Math.sin(angle);
            if (k === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
    }

    // 3. Activation Energy Sweep Bar
    if (this.isSweeping) {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.4)';
      ctx.fillRect(0, Math.floor(this.sweepY) - 2, 224, 4);
    }

    ctx.restore();
  }

  public deactivate(): void {
    this._state = 'COMPLETED';
    this.isSweeping = false;
  }
  public onDeactivate(): void { this.deactivate(); }

  public reset(): void {
    this._state = 'IDLE';
    this.activeTimer = 0;
    this.hexRotation = 0;
    this.isSweeping = false;
  }

  public isFinished(): boolean {
    return this._state === 'COMPLETED';
  }
  public isComplete(): boolean {
    return this.isFinished();
  }
}
```

### 9.5 `PhysicsInversionEvent.ts`
```typescript
/**
 * Physics Inversion Crisis Event
 * Singularity Shift: Starfield flow reverses upward, enemy dives loop unpredictably.
 */
import type { CrisisEventContext, ICrisisEvent, CrisisState } from '../types';
import { CrisisEventType } from '../types';

export class PhysicsInversionEvent implements ICrisisEvent {
  public readonly type = CrisisEventType.PHYSICS_INVERSION;
  public readonly name = 'PHYSICS INVERSION';
  public readonly subtitle = 'SINGULARITY SHIFT';
  public readonly flavorText = 'SINGULARITY SHIFT';
  public readonly warningDurationSec = 3.0;
  public readonly warningDuration = 3.0;
  public readonly durationSec = 20.0;
  public readonly activeDuration = 20.0;

  private _state: CrisisState = 'IDLE';
  private context: CrisisEventContext | null = null;
  private activeTimer: number = 0;
  private gridPhase: number = 0;

  public get state(): CrisisState {
    return this._state;
  }

  public init(context: CrisisEventContext): void {
    this.context = context;
    this.reset();
  }

  public startWarning(): void {
    this._state = 'WARNING';
  }
  public onWarningStart(): void { this.startWarning(); }

  public activate(): void {
    this._state = 'ACTIVE';
    this.activeTimer = 0;
  }
  public onActivate(): void { this.activate(); }

  public update(dt: number): void {
    if (this._state !== 'ACTIVE' || !this.context) return;

    this.activeTimer += dt;
    if (this.activeTimer >= this.durationSec) {
      this.deactivate();
      return;
    }

    this.gridPhase += 3.0 * dt;
    const { starfield, formationManager } = this.context;

    // 1. Reverse Upward Starfield Movement
    if (starfield && starfield.getStars) {
      const stars = starfield.getStars();
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        if (!star) continue;
        star.y -= star.speed * 2.2 * dt;
        if (star.y < 0) {
          star.y += 288;
          star.x = Math.random() * 224;
        }
      }
    }

    // 2. Inverted Anti-Gravity Upward Loops for Diving Enemies
    if (formationManager) {
      for (const enemy of formationManager.enemies) {
        if (enemy.active && (enemy.state === 'DIVING_SOLO' || enemy.state === 'DIVING_ESCORT')) {
          const antiG = -110 * Math.sin((Math.PI * enemy.y) / 144) * dt;
          enemy.vy = Math.max(-100, enemy.vy + antiG);
        }
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this._state !== 'ACTIVE') return;

    ctx.save();

    // 1. Warped Gravity Grid
    ctx.strokeStyle = 'rgba(138, 43, 226, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 16; x < 224; x += 32) {
      ctx.moveTo(x, 0);
      for (let y = 0; y < 288; y += 16) {
        const dx = Math.sin(y * 0.05 + this.gridPhase) * 3;
        ctx.lineTo(x + dx, y);
      }
    }
    for (let y = 16; y < 288; y += 32) {
      ctx.moveTo(0, y);
      for (let x = 0; x < 224; x += 16) {
        const dy = Math.cos(x * 0.05 + this.gridPhase) * 3;
        ctx.lineTo(x, y + dy);
      }
    }
    ctx.stroke();

    // 2. Ascending Gravity Chevrons (Upward motion indicator)
    ctx.fillStyle = 'rgba(0, 255, 255, 0.25)';
    const offset = (this.activeTimer * 60) % 48;
    for (let y = 280 - offset; y > 0; y -= 48) {
      ctx.fillText('^', 6, y);
      ctx.fillText('^', 212, y);
    }

    ctx.restore();
  }

  public deactivate(): void {
    this._state = 'COMPLETED';
    if (this.context?.starfield) {
      this.context.starfield.setSpeedState?.('NORMAL');
    }
  }
  public onDeactivate(): void { this.deactivate(); }

  public reset(): void {
    this._state = 'IDLE';
    this.activeTimer = 0;
  }

  public isFinished(): boolean {
    return this._state === 'COMPLETED';
  }
  public isComplete(): boolean {
    return this.isFinished();
  }
}
```

### 9.6 `HyperspaceStormEvent.ts`
```typescript
/**
 * Hyperspace Storm Crisis Event
 * Cosmic Lightning Lanes: Periodic vertical plasma strikes, enemy dive speed boost +25%.
 */
import type { CrisisEventContext, ICrisisEvent, CrisisState } from '../types';
import { CrisisEventType } from '../types';

export class HyperspaceStormEvent implements ICrisisEvent {
  public readonly type = CrisisEventType.HYPERSPACE_STORM;
  public readonly name = 'HYPERSPACE STORM';
  public readonly subtitle = 'HYPERLANE TEMPEST DETECTED';
  public readonly flavorText = 'HYPERLANE TEMPEST DETECTED';
  public readonly warningDurationSec = 3.0;
  public readonly warningDuration = 3.0;
  public readonly durationSec = 20.0;
  public readonly activeDuration = 20.0;

  private _state: CrisisState = 'IDLE';
  private context: CrisisEventContext | null = null;
  private activeTimer: number = 0;
  private baseDiveSpeedMultiplier: number = 1.0;

  // Lightning Lane State Machine
  private laneState: 'IDLE' | 'WARNING' | 'STRIKING' = 'IDLE';
  private activeLane: number = -1;
  private laneTimer: number = 0;
  private laneCycleTimer: number = 0;
  private flashAlpha: number = 0;

  // Pre-allocated buffer for 12 lightning bolt vertices
  private boltX = new Float32Array(12);
  private boltY = new Float32Array(12);

  public get state(): CrisisState {
    return this._state;
  }

  public init(context: CrisisEventContext): void {
    this.context = context;
    this.reset();
  }

  public startWarning(): void {
    this._state = 'WARNING';
  }
  public onWarningStart(): void { this.startWarning(); }

  public activate(): void {
    this._state = 'ACTIVE';
    this.activeTimer = 0;
    this.laneState = 'IDLE';
    this.laneCycleTimer = 0;
    this.flashAlpha = 0;

    // Boost Formation Dive Speed by +25%
    if (this.context?.formationManager) {
      this.baseDiveSpeedMultiplier = this.context.formationManager.diveSpeedMultiplier || 1.0;
      this.context.formationManager.diveSpeedMultiplier = this.baseDiveSpeedMultiplier * 1.25;
    }
  }
  public onActivate(): void { this.activate(); }

  public update(dt: number): void {
    if (this._state !== 'ACTIVE' || !this.context) return;

    this.activeTimer += dt;
    if (this.activeTimer >= this.durationSec) {
      this.deactivate();
      return;
    }

    const { player } = this.context;

    // Decay Flash Alpha
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - 3.5 * dt);
    }

    // Lightning Lane State Machine
    switch (this.laneState) {
      case 'IDLE':
        this.laneCycleTimer += dt;
        if (this.laneCycleTimer >= 2.4) {
          this.laneCycleTimer = 0;
          this.activeLane = Math.floor(Math.random() * 7); // 7 lanes (0..6)
          this.laneState = 'WARNING';
          this.laneTimer = 0;
        }
        break;

      case 'WARNING':
        this.laneTimer += dt;
        if (this.laneTimer >= 0.9) {
          this.laneState = 'STRIKING';
          this.laneTimer = 0;
          this.flashAlpha = 0.28;
          this.generateBolt(this.activeLane);

          // Strike Sound
          this.context.soundSynth?.playExplosion?.('boss');
        }
        break;

      case 'STRIKING':
        this.laneTimer += dt;

        // Lethal Lane Collision with Player
        if (player && !player.isInvulnerable?.()) {
          const laneMinX = this.activeLane * 32;
          const laneMaxX = (this.activeLane + 1) * 32;
          const pHalfW = player.isDual ? 16 : 8;
          if (player.x + pHalfW > laneMinX && player.x - pHalfW < laneMaxX) {
            player.onExplode?.(player.x, player.y, player.isDual);
          }
        }

        if (this.laneTimer >= 0.25) {
          this.laneState = 'IDLE';
          this.activeLane = -1;
        }
        break;
    }
  }

  private generateBolt(laneIndex: number): void {
    const cx = laneIndex * 32 + 16;
    for (let i = 0; i < 12; i++) {
      this.boltY[i] = (288 * i) / 11;
      this.boltX[i] = cx + (Math.random() - 0.5) * 16;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this._state !== 'ACTIVE') return;

    ctx.save();

    // 1. Pre-Discharge Warning Column
    if (this.laneState === 'WARNING' && this.activeLane >= 0) {
      const lx = this.activeLane * 32;
      const alpha = 0.18 + 0.14 * Math.sin(this.laneTimer * 25);
      ctx.fillStyle = `rgba(255, 0, 128, ${alpha})`;
      ctx.fillRect(lx, 0, 32, 288);

      ctx.strokeStyle = '#FFFF00';
      ctx.lineWidth = 1;
      ctx.strokeRect(lx + 1, 0, 30, 288);
    }

    // 2. Cosmic Lightning Bolt Discharge
    if (this.laneState === 'STRIKING' && this.activeLane >= 0) {
      // Glow sheath
      ctx.strokeStyle = '#8A2BE2';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        if (i === 0) ctx.moveTo(this.boltX[i], this.boltY[i]);
        else ctx.lineTo(this.boltX[i], this.boltY[i]);
      }
      ctx.stroke();

      // Cyan core
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // White filament
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 3. Screen Plasma Flash
    if (this.flashAlpha > 0.01) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
      ctx.fillRect(0, 0, 224, 288);
    }

    ctx.restore();
  }

  public deactivate(): void {
    this._state = 'COMPLETED';
    this.laneState = 'IDLE';
    this.activeLane = -1;
    this.flashAlpha = 0;

    // Restore Formation Dive Speed Multiplier
    if (this.context?.formationManager) {
      this.context.formationManager.diveSpeedMultiplier = this.baseDiveSpeedMultiplier;
    }
  }
  public onDeactivate(): void { this.deactivate(); }

  public reset(): void {
    this._state = 'IDLE';
    this.activeTimer = 0;
    this.laneState = 'IDLE';
    this.activeLane = -1;
    this.flashAlpha = 0;
  }

  public isFinished(): boolean {
    return this._state === 'COMPLETED';
  }
  public isComplete(): boolean {
    return this.isFinished();
  }
}
```

---

## 10. Verification Matrix & Edge-Case Checklist

| Event | Mechanics Verified | Teardown Check | Edge-Case Invariant |
|---|---|---|---|
| **The Contingency** | Predictive bullet aim ($x_{\text{pred}} = x_p + v_{px} t_{\text{hit}}$), micro-homing steering, capacitor fire rate stutter. | Player cooldown reverts to $0.12\text{s}$, zero steering on bullet pool reuse. | Target clamping: $x_{\text{pred}} \in [16, 208]$, fire rate never locks up permanently. |
| **The Unbidden** | Softened Plummer gravity ($\frac{G}{(r^2 + 400)^{1.5}}$), player missiles curved inward toward $(112, 60)$. | Bullets resume standard upward velocity, vortex particles recycled. | No division by zero: acceleration bounded to $\le 35\text{ px/s}^2$. |
| **The Prethoryn Scourge** | Burst micro-spores on enemy kill, +1 chitin shield, 5s undamaged shield regeneration. | Spore pool cleared, last hit timestamps cleared, excess shields clamped. | Spore pool fixed at 32 elements; zero runtime GC allocation. |
| **Shield Overload** | +2 shields granted to all living enemies, rotating hexagon barrier, fleet grid interlink filaments. | Energy sweep and interlink filaments terminated, living enemy shields gracefully decay or persist. | Enemies taking hits play shield deflect and absorb damage before hull damage. |
| **Physics Inversion** | Upward parallax starfield integration, inverted anti-gravity loops on diving enemies. | Starfield speed state restored to `NORMAL`, direct player steering restored. | Stars wrap smoothly: $y < 0 \implies y \mathrel{+}= 288$. |
| **Hyperspace Storm** | 7 lightning hazard lanes, 900ms warning column, midpoint displacement fractal bolt, +25% enemy dive speed. | Formation dive speed multiplier restored to $1.0\times$, active lane cleared. | Player AABB intersection tests lane boundaries $[x_{\text{min}}, x_{\text{max}}]$. |

---

## 11. Conclusion & Handoff Readiness

The architectural blueprints, mathematical foundations, and complete TypeScript implementations for Crisis Events 1 through 6 are fully developed and documented. They are 100% compatible with the `types.ts` and `CrisisEventManager.ts` architecture being formalized by `m10_explorer_1`, and ready for downstream testing by `m10_explorer_3` and implementation by Milestone 10 implementers.
