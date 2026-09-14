# Milestone 13 Technical Analysis: 3 Special Moves (고유 필살기) & Energy Gauge Subsystem

- **Author**: `m13_explorer_2`
- **Working Directory**: `/Users/user/teamwork_projects/galaga_game/.agents/m13_explorer_2`
- **Target Subsystem**: Special Moves (`SpecialMoveManager`), Energy Gauge (`HUD.ts`), Input Controls (`InputHandler.ts`), Procedural Sprites (`SpriteRenderer.ts`), Game Integration (`Game.ts`)
- **Verified Baseline**: 46 test files, 863 tests passing (M1–M12 certified)

---

## Executive Summary

This specification defines the architecture, kinematics, mathematical equations, procedural pixel art bit-matrices, and zero-runtime-GC pooling strategy for Milestone 13's **3 Special Moves (고유 필살기)** and the **Energy Gauge Accumulation Subsystem**.

The 3 Special Moves provide high-impact tactical options that invert adverse situations:
1. **Nova Barrage (초신성 일제사격)**: 16-beam swarm homing laser salvo utilizing Proportional Navigation Guidance to track and annihilate all active on-screen enemies and deliver massive concentrated burst trauma to Epic Bosses.
2. **Chrono Freeze (시공간 동결)**: Absolute 3.0-second time dilation field setting $\Delta t_{\text{enemy}} = 0$ for all enemy movement, diving trajectories, and enemy projectiles, while preserving unconstrained player maneuverability and continuous firing.
3. **Dimensional Warp Ram (차원 도약 돌파)**: Hyper-speed ($800\text{ px/s}$) invulnerable tachyonic surge up the screen clearing an entire flight corridor, vaporizing enemy projectiles, and ramming through enemy formations and boss shields.

All components adhere strictly to the **Zero-External-Asset Principle** (100% pure Canvas 2D procedural pixel art and Web Audio API synthesis) and the **Zero Runtime GC Invariant** ($0$ dynamic allocations during 60 FPS fixed-timestep gameplay).

---

## 1. Energy Gauge Accumulation & Triggering Mechanism

### 1.1 Gauge Capacity & Quantization
- **Maximum Energy**: $E_{\max} = 100.0$
- **Trigger Threshold**: $E \ge 100.0$ (single-use full-discharge) or tiered $100\%$ stock
- **Decay Rate**: $0$ (energy persists across waves and stages, but resets to $0$ on Player Death/Respawn unless preserved by bonus upgrades)

### 1.2 Energy Generation Rates (Loot & Combat Economy)
Energy accumulates via two primary channels: **Direct Enemy Destruction** and **Energy Spark Pickups**.

#### A. Direct Enemy Destruction Yields
| Enemy Type | Formation Kill | Diving Kill (2x Risk Multiplier) | Boss Sub-Unit Kill |
|---|---|---|---|
| **Zako** (Blue Bug) | $+2.0\%$ | $+4.0\%$ | — |
| **Goei** (Red Butterfly) | $+3.5\%$ | $+7.0\%$ | — |
| **Boss Galaga** (Green/Blue) | $+6.0\%$ | $+12.0\%$ | — |
| **Captured Fighter / Escort** | $+4.0\%$ | $+8.0\%$ | — |
| **Boss Sub-Unit** (Turret/Satellite) | — | — | $+10.0\%$ |
| **Epic Boss Phase Break** | — | — | $+25.0\%$ |

*Design Rationale*: Diving enemies reward double energy, heavily incentivizing offensive play against aggressive diving aliens rather than passive formation sniping. In a typical wave of 40 aliens, shooting diving enemies builds 40–60% energy per stage, granting roughly one Special Move every 1.5 to 2 stages, perfectly aligned with arcade pacing.

#### B. Energy Spark Pickups (에너지 스파크)
When enemies are destroyed, they roll a drop chance for an **Energy Spark** (`ITEM_ENERGY_SPARK`).
- **Drop Probability**:
  - Formation enemy: $15\%$
  - Diving enemy: $35\%$
  - Boss Galaga: $50\%$
  - Epic Boss Sub-Unit: $100\%$ (guaranteed drop)
- **Energy Value**: $+15.0\%$ instant meter gain upon collection + 300 score points.
- **Physics & Kinematics**:
  The spark drops with smooth gravity and harmonic floating motion:
  $$\begin{aligned}
    y(t) &= y_0 + v_y \cdot t \quad (v_y = 54\text{ px/s}) \\
    x(t) &= x_0 + A \cdot \sin(\omega t + \phi) \quad (A = 10\text{ px}, \omega = 3.5\text{ rad/s})
  \end{aligned}$$
- **Magnetic Attraction (Near-Field Funnel)**:
  If distance $\|\vec{p}_{\text{player}} - \vec{p}_{\text{spark}}\| \le R_{\text{magnet}} = 42\text{ px}$:
  $$\vec{a}_{\text{magnet}} = \frac{\vec{p}_{\text{player}} - \vec{p}_{\text{spark}}}{\|\vec{p}_{\text{player}} - \vec{p}_{\text{spark}}\|} \cdot 380\text{ px/s}^2$$
  The spark accelerates smoothly into the player's ship, preventing frustrating near-misses.

### 1.3 Multi-Modal Control Triggers (`InputHandler.ts`)
The special move trigger must be accessible seamlessly across Keyboard, Gamepad, and Mobile Touch:

1. **Keyboard Trigger**:
   - Key: `KeyX`, `'x'`, `'X'`
   - Added to `PREVENT_DEFAULT_KEYS` in `InputHandler.ts`
   - Cycle Active Special Key: `KeyC` (switches between Nova Barrage $\to$ Chrono Freeze $\to$ Warp Ram)
2. **Gamepad API Integration**:
   - Polled in `InputHandler` during `getState()`:
   - Standard mapping:
     - `gamepad.buttons[2].pressed` (X / Square button) $\to$ Special Move trigger
     - `gamepad.buttons[1].pressed` (B / Circle button) $\to$ Special Move trigger
     - `gamepad.buttons[4].pressed` / `[5].pressed` (L1/R1 bumpers) $\to$ Cycle Special Move
3. **Mobile Virtual Button (`index.html` & Touch Zones)**:
   - Dedicated DOM Touch Element in `#touch-controls`:
     ```html
     <button id="btn-special" class="touch-btn special-btn" aria-label="Trigger Special Move">SP</button>
     ```
   - CSS Styling:
     ```css
     .special-btn {
       width: 62px;
       height: 62px;
       background: rgba(0, 255, 255, 0.25);
       border: 2px solid #00ffff;
       color: #00ffff;
       font-size: 11px;
       font-weight: bold;
       box-shadow: 0 0 12px rgba(0, 255, 255, 0.4);
     }
     .special-btn.ready {
       background: rgba(255, 255, 0, 0.5);
       border-color: #ffff00;
       color: #ffffff;
       animation: specialPulse 0.6s infinite alternate;
     }
     @keyframes specialPulse {
       from { transform: scale(1.0); box-shadow: 0 0 8px #ffff00; }
       to { transform: scale(1.08); box-shadow: 0 0 20px #ffff00; }
     }
     ```
   - Bound in `InputHandler.attachDomTouchControls()` with `touchstart` / `mousedown` listeners, firing `consumeAction('special')`.
   - Direct Canvas Touch Fallback: Tapping the gauge area ($X \in [80, 144], Y \in [260, 280]$) on touchscreen triggers the move.

### 1.4 HUD Energy Meter Rendering (`HUD.ts`)
- **Location on $224 \times 288$ Canvas**:
  Positioned centrally at the bottom, nestled between the Reserve Lives (left) and Stage Badges (right):
  - $X = 72$, $Y = 278$, $\text{Width} = 60\text{ px}$, $\text{Height} = 6\text{ px}$.
- **Rendering Specification**:
  - Outer Frame: $1\text{px}$ boundary in `#AAAAAA` (Grey Light).
  - Background: Solid Black `#000000`.
  - Fill Progression (10 discrete segments, 5px width + 1px gap):
    - $0\% - 49\%$: Cyan (`#00FFFF`)
    - $50\% - 99\%$: Yellow (`#FFFF00`)
    - $100\%$ (FULL): Flashing White/Gold at 8Hz (`#FFFFFF` $\leftrightarrow$ `#FFFF00`)
  - Label: When energy $< 100$, displays tiny 4x6 text `"EX"` or `"SP"`.
  - When $E = 100$: Flashing banner `"SP READY"` or `"EX READY"` displayed above the bar at $Y = 270$ with audio chime.

---

## 2. Mathematical Equations & State Machines for the 3 Special Moves

```
                    ┌────────────────────────┐
                    │     IDLE / CHARGING    │
                    └───────────┬────────────┘
                                │ Input 'X' & Energy >= 100
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
    ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
    │ NOVA BARRAGE  │   │ CHRONO FREEZE │   │   WARP RAM    │
    │  (1.8s Salvo) │   │  (3.0s arrest)│   │ (1.5s charge) │
    └───────┬───────┘   └───────┬───────┘   └───────┬───────┘
            │                   │                   │
            └───────────────────┼───────────────────┘
                                ▼
                    ┌────────────────────────┐
                    │  COOLDOWN & RESIDUAL   │
                    │      INVULNERABILITY   │
                    └────────────────────────┘
```

### 2.1 Nova Barrage (초신성 일제사격)

#### A. Operational Concept
Releases 16 high-velocity plasma micro-missiles in a curved arc from the player fighter. Each missile acquires targets via a deterministic priority queue, accelerates, and tracks enemies using Proportional Navigation Guidance.

#### B. Phased Lifecycle State Machine
| Phase | Time Window | Behavioral Description |
|---|---|---|
| **IGNITION** | $t \in [0, 0.20\text{s}]$ | Player ship flashes white/cyan at 20Hz. Screen flashes white for 2 frames ($33\text{ms}$). Background starfield dims to $20\%$ alpha. Audio sweep: $200\text{Hz} \to 1800\text{Hz}$. |
| **SALVO LAUNCH** | $t \in [0.20\text{s}, 0.60\text{s}]$ | 16 missiles spawn in 4 rapid staggered volleys (4 missiles every $100\text{ms}$) alternating from left and right hull hardpoints. |
| **HOMING** | $t \in [0.60\text{s}, 1.50\text{s}]$ | Missiles track targets using kinematic equations below, curving through the playfield. |
| **DETONATION** | Instant on Hit | Circular shockwave ($R = 14\text{px}$) + 6 explosion spark particles. |
| **RECOVERY** | $t \in [1.50\text{s}, 1.80\text{s}]$ | Starfield returns to 100% speed. Heat-dissipation particles vent from ship wings. |

#### C. Homing Kinematic Equations (Proportional Navigation)
For missile $i \in [0, 15]$:
1. **Initial Ejection Velocity**:
   Initial angle spread fan:
   $$\theta_i = -\frac{\pi}{2} + \left(\frac{i - 7.5}{8}\right) \cdot \frac{\pi}{3.5}$$
   $$\vec{v}_0 = \left(v_0 \sin \theta_i, \; -v_0 \cos \theta_i\right), \quad v_0 = 320\text{ px/s}$$

2. **Target Assignment (Zero-Allocation Algorithm)**:
   - Retrieve `livingEnemies` from `FormationManager`.
   - Target selection order:
     1. If Epic Boss or Boss Galaga exists: Assign $50\%$ of missiles ($8$ missiles) to the Boss core.
     2. Assign remaining missiles round-robin across diving aliens first (highest threat), then formation aliens.
     3. If an assigned target is destroyed while missiles are in flight, the missile retargets the nearest active enemy within $120\text{px}$, or flies straight off-screen if no enemies remain.

3. **Steering & Angular Tracking Acceleration**:
   Let current position be $\vec{p} = (x, y)$, current heading angle be $\theta$, velocity magnitude be $v(t)$, and target position be $\vec{p}_T = (x_T, y_T)$:
   $$\vec{d} = \vec{p}_T - \vec{p} = (x_T - x, \; y_T - y)$$
   $$\theta_{\text{desired}} = \text{atan2}(d_y, d_x)$$
   $$\Delta \theta = \text{normalizeAngle}(\theta_{\text{desired}} - \theta) \in [-\pi, \pi]$$
   $$\theta(t + \Delta t) = \theta(t) + \text{clamp}(\Delta \theta, \; -\omega_{\max} \Delta t, \; \omega_{\max} \Delta t)$$
   $$\omega_{\max} = 14.0\text{ rad/s} \quad (\approx 800^\circ/\text{s})$$
   Linear speed accelerates over flight duration:
   $$v(t) = 320 + 260 \cdot \min\left(1.0, \; \frac{t - 0.2}{0.8}\right) \implies v_{\max} = 580\text{ px/s}$$
   $$\vec{v}(t + \Delta t) = (v(t) \cos \theta, \; v(t) \sin \theta)$$

#### D. Damage Allocation
- **Zako / Goei / Transform / Captured Fighter**: Instant destruction ($99\text{ damage}$).
- **Boss Galaga**: $2\text{ damage}$ (destroys green healthy Boss Galaga in 1 hit).
- **Epic Bosses (Stages 10, 20, 30, 40, 50)**:
  - Each missile deals $8\text{ damage}$.
  - Concentrated salvo of 8 missiles deals $64\text{ damage}$ (stripping $25\% - 35\%$ of a boss phase HP).
- **Boss Sub-Units**: $6\text{ damage}$ (destroys or severely compromises secondary turrets).

---

### 2.2 Chrono Freeze (시공간 동결)

#### A. Operational Concept
Generates an all-encompassing temporal singularity arresting time for exactly $3.0\text{ seconds}$. Enemy AI, formation breathing, flight path integration, and enemy projectile translations are held at a complete standstill ($\Delta t_{\text{enemy}} = 0$), while player movement, aiming, and firing proceed in uninhibited real-time ($\Delta t_{\text{player}} = \Delta t$).

#### B. Phased Lifecycle State Machine
| Phase | Duration | System Behavior |
|---|---|---|
| **WARP-IN** | $0.15\text{s}$ | Temporal shockwave expands from player center. Web Audio: Low frequency resonance drop $400\text{Hz} \to 50\text{Hz}$ with heavy reverb. |
| **TEMPORAL STASIS** | $3.00\text{s}$ | $\Delta t_{\text{enemy}} = 0$. Enemy bullets frozen in mid-air. Player ship full 100% speed. Continuous firing permitted. |
| **SHATTER-OUT** | $0.35\text{s}$ | Frost crystalline cracks spread across canvas. Glass fracture SFX. Enemies resume movement smoothly. |
| **POST-COOLDOWN** | $0.50\text{s}$ | Gauge locked at $0\%$. Starfield returns to standard scrolling. |

#### C. Exact Engine Integration Invariants
1. **Game Loop Timestep Splitting**:
   In `Game.update(dt)`:
   ```typescript
   const enemyDt = this.specialMoveManager.isChronoFreezeActive() ? 0 : dt;
   const playerDt = dt;

   // Player updates normally
   this.player.update(playerDt, input);

   // Player missiles update normally
   this.bulletManager.updatePlayerBullets(playerDt);

   // Enemy subsystems receive frozen dt = 0
   this.formationManager.update(enemyDt, this.player.x, this.player.y, this.player.isDual);
   this.bulletManager.updateEnemyBullets(enemyDt);
   if (this.bossManager) {
     this.bossManager.update(enemyDt, this.player.x, this.player.y);
   }
   ```
2. **Collision Invariants During Freeze**:
   - Player missiles collide with frozen enemies as usual (allowing the player to pick off high-value diving aliens or dismantle boss armor).
   - Enemy bullets and enemy ships cannot harm the player if touched, OR contact damage is disabled during stasis. Recommended: Enemy hitboxes remain hazardous only if the player directly runs into a frozen enemy hull, but static enemy bullets are made non-lethal or absorbable!
3. **Starfield Dilation**:
   - Parallax scrolling velocity scaled by $0.10\times$. Star palette shifts to cyan/ice blue (`#00FFFF`, `#5B93FF`).

---

### 2.3 Dimensional Warp Ram (차원 도약 돌파)

#### A. Operational Concept
Overdrives the ship's warp manifold to launch an ultra-relativistic charge straight up the screen ($v_y = -800\text{ px/s}$). The player becomes completely invulnerable, carving an impenetrable swath through formation grids, vaporizing enemy bullets, and delivering massive ramming kinetic damage to boss units.

#### B. Phased Lifecycle State Machine
| Phase | Duration | Ship Kinematics | Collision & Visual State |
|---|---|---|---|
| **PRE-IGNITION** | $0.25\text{s}$ | $Y$ compresses from $250 \to 258$. Ship vibrates horizontally: $x = x_0 + 2 \sin(80 \pi t)$. | Invulnerability activated. Violet/Cyan plasma thrust cone ignites behind hulls. |
| **HYPER RAM** | $0.45\text{s}$ | Surges straight up: $y(t) = 258 - 800 \cdot t$. Velocity $v_y = -800\text{ px/s}$. | Broad Swept Ram Hitbox active ($36\text{px} \times 32\text{px}$). 6 motion blur ghost afterimages. All bullets & small enemies pulverized. |
| **WARP LOOP** | $0.35\text{s}$ | Ship exits screen top ($y < -40$), wraps through hyperspace. | Canvas flashes cyan. Full-screen sonic boom clears remaining enemy projectiles. |
| **RE-ENTRY** | $0.30\text{s}$ | Materializes back at baseline $Y = 250$ with warp iris animation. | Residual $1.5\text{s}$ blinking invulnerability to protect against spawn collisions. |

#### C. Swept Collision & Damage Formulation
- **Swept Ram Bounding Box**:
  $$\begin{aligned}
    \text{Ram Box} &= \left\{
      x: x_{\text{player}} - 18, \quad
      y: y_{\text{player}} - 12, \quad
      \text{width}: 36, \quad
      \text{height}: 32
    \right\}
  \end{aligned}$$
  *Notice*: Width of $36\text{px}$ exceeds both single ($16\text{px}$) and dual ($32\text{px}$) fighters, guaranteeing clean flight lane clearance.
- **Collision Effects**:
  - Regular Enemies (Zako, Goei, Escorts): Instantly vaporized ($999\text{ damage}$).
  - Enemy Projectiles: Annihilated on contact and converted to $+1\%$ energy sparks.
  - Boss Galaga: Instantly killed ($999\text{ damage}$).
  - Epic Boss Encounters (Stages 10, 20, 30, 40, 50):
    - Deals massive blunt kinetic trauma: $120\text{ damage}$ directly to the active boss phase.
    - Shatters Phase 1 kinetic barriers immediately.
    - Triggers screen shake ($\Delta = \pm 6\text{px}$) and heavy boss explosion sound.

---

## 3. Procedural Canvas Pixel Art Bit-Matrices (`SpriteRenderer.ts`)

All sprites adhere strictly to the 1981 arcade 14-color palette defined in `SpriteRenderer.ts`:
- `.` = Transparent, `W` = White (`#FFFFFF`), `R` = Red (`#E70000`), `D` = Dark Red (`#9E0000`)
- `B` = Blue Light (`#5B93FF`), `C` = Blue Cyan (`#00FFFF`), `N` = Navy (`#000088`)
- `Y` = Yellow (`#FFFF00`), `O` = Orange (`#FF7F00`), `G` = Green (`#00E700`)
- `P` = Pink Magenta (`#FF007F`), `L` = Grey Light (`#AAAAAA`), `K` = Grey Dark (`#555555`), `U` = Purple (`#9900EE`)

### 3.1 Drones (Wingmen Allies Support)

#### A. `DRONE_ESCORT` (12x12, 2 frames)
High-agility escort interceptor drone equipped with dual micro-cannons.
```typescript
export const DRONE_ESCORT_FRAME_0: string[][] = [
  ['.','.','.','C','.','.','.','.','C','.','.','.'],
  ['.','.','C','W','C','.','.','C','W','C','.','.'],
  ['.','C','W','W','W','C','C','W','W','W','C','.'],
  ['.','C','W','B','B','W','W','B','B','W','C','.'],
  ['C','W','W','B','Y','W','W','Y','B','W','W','C'],
  ['C','W','W','W','W','W','W','W','W','W','W','C'],
  ['.','C','C','W','R','W','W','R','W','C','C','.'],
  ['.','.','C','W','R','W','W','R','W','C','.','.'],
  ['.','.','.','W','W','W','W','W','W','.','.','.'],
  ['.','.','.','C','C','W','W','C','C','.','.','.'],
  ['.','.','.','.','C','R','R','C','.','.','.','.'],
  ['.','.','.','.','.','Y','Y','.','.','.','.','.']
];

export const DRONE_ESCORT_FRAME_1: string[][] = [
  ['.','.','.','C','.','.','.','.','C','.','.','.'],
  ['.','.','C','W','C','.','.','C','W','C','.','.'],
  ['.','C','W','W','W','C','C','W','W','W','C','.'],
  ['.','C','W','B','B','W','W','B','B','W','C','.'],
  ['C','W','W','B','Y','W','W','Y','B','W','W','C'],
  ['C','W','W','W','W','W','W','W','W','W','W','C'],
  ['.','C','C','W','R','W','W','R','W','C','C','.'],
  ['.','.','C','W','R','W','W','R','W','C','.','.'],
  ['.','.','.','W','W','W','W','W','W','.','.','.'],
  ['.','.','.','C','C','W','W','C','C','.','.','.'],
  ['.','.','.','.','C','O','O','C','.','.','.','.'],
  ['.','.','.','.','.','W','W','.','.','.','.','.']
];
```

#### B. `DRONE_AEGIS` (12x12, 2 frames)
Shield restoration and kinetic barrier drone with pulsating central reactor.
```typescript
export const DRONE_AEGIS_FRAME_0: string[][] = [
  ['.','.','.','C','C','C','C','C','C','.','.','.'],
  ['.','.','C','W','W','W','W','W','W','C','.','.'],
  ['.','C','W','C','C','C','C','C','C','W','C','.'],
  ['C','W','C','C','G','G','G','G','C','C','W','C'],
  ['C','W','C','G','G','W','W','G','G','C','W','C'],
  ['C','W','C','G','W','W','W','W','G','C','W','C'],
  ['C','W','C','G','W','W','W','W','G','C','W','C'],
  ['C','W','C','G','G','W','W','G','G','C','W','C'],
  ['C','W','C','C','G','G','G','G','C','C','W','C'],
  ['.','C','W','C','C','C','C','C','C','W','C','.'],
  ['.','.','C','W','W','W','W','W','W','C','.','.'],
  ['.','.','.','C','C','C','C','C','C','.','.','.']
];

export const DRONE_AEGIS_FRAME_1: string[][] = [
  ['.','.','.','C','C','C','C','C','C','.','.','.'],
  ['.','.','C','W','C','C','C','C','W','C','.','.'],
  ['.','C','W','C','W','W','W','W','C','W','C','.'],
  ['C','W','C','W','C','C','C','C','W','C','W','C'],
  ['C','C','W','C','C','W','W','C','C','W','C','C'],
  ['C','C','W','C','W','W','W','W','C','W','C','C'],
  ['C','C','W','C','W','W','W','W','C','W','C','C'],
  ['C','C','W','C','C','W','W','C','C','W','C','C'],
  ['C','W','C','W','C','C','C','C','W','C','W','C'],
  ['.','C','W','C','W','W','W','W','C','W','C','.'],
  ['.','.','C','W','C','C','C','C','W','C','.','.'],
  ['.','.','.','C','C','C','C','C','C','.','.','.']
];
```

#### C. `DRONE_BOMBER` (16x12, 2 frames)
Heavy support bomber with cluster ordnance bays and rear thrusters.
```typescript
export const DRONE_BOMBER_FRAME_0: string[][] = [
  ['.','.','.','.','.','.','.','Y','.','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','L','W','L','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','L','L','W','L','L','.','.','.','.','.','.'],
  ['.','.','.','.','L','K','K','W','K','K','L','.','.','.','.','.'],
  ['.','.','.','L','K','K','O','W','O','K','K','L','.','.','.','.'],
  ['.','.','L','K','K','O','R','W','R','O','K','K','L','.','.','.'],
  ['.','L','K','K','K','O','R','W','R','O','K','K','K','L','.','.'],
  ['L','K','K','K','K','K','K','W','K','K','K','K','K','K','L','.'],
  ['L','L','L','K','K','K','L','L','L','K','K','K','L','L','L','.'],
  ['Y','R','L','L','K','L','L','R','L','L','K','L','L','R','Y','.'],
  ['.','Y','R','L','L','L','.','R','.','L','L','L','R','Y','.','.'],
  ['.','.','Y','.','.','.','.','O','.','.','.','.','Y','.','.','.']
];

export const DRONE_BOMBER_FRAME_1: string[][] = [
  ['.','.','.','.','.','.','.','Y','.','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','L','W','L','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','L','L','W','L','L','.','.','.','.','.','.'],
  ['.','.','.','.','L','K','K','W','K','K','L','.','.','.','.','.'],
  ['.','.','.','L','K','K','O','W','O','K','K','L','.','.','.','.'],
  ['.','.','L','K','K','O','R','W','R','O','K','K','L','.','.','.'],
  ['.','L','K','K','K','O','R','W','R','O','K','K','K','L','.','.'],
  ['L','K','K','K','K','K','K','W','K','K','K','K','K','K','L','.'],
  ['L','L','L','K','K','K','L','L','L','K','K','K','L','L','L','.'],
  ['Y','O','L','L','K','L','L','O','L','L','K','L','L','O','Y','.'],
  ['.','Y','O','L','L','L','.','O','.','L','L','L','O','Y','.','.'],
  ['.','.','W','.','.','.','.','Y','.','.','.','.','W','.','.','.']
];
```

### 3.2 Special Move Visual Artifacts

#### A. `NOVA_LASER_BEAM` (6x10, 2 frames)
Diamond-head high-energy swarm projectile with plasma sheath.
```typescript
export const NOVA_LASER_BEAM_FRAME_0: string[][] = [
  ['.','.','W','W','.','.'],
  ['.','W','W','W','W','.'],
  ['.','C','W','W','C','.'],
  ['C','C','W','W','C','C'],
  ['C','B','W','W','B','C'],
  ['C','B','W','W','B','C'],
  ['.','C','W','W','C','.'],
  ['.','C','B','B','C','.'],
  ['.','.','C','C','.','.'],
  ['.','.','.','.','.','.']
];

export const NOVA_LASER_BEAM_FRAME_1: string[][] = [
  ['.','.','Y','Y','.','.'],
  ['.','Y','W','W','Y','.'],
  ['.','W','W','W','W','.'],
  ['C','W','W','W','W','C'],
  ['C','C','W','W','C','C'],
  ['C','C','W','W','C','C'],
  ['.','C','W','W','C','.'],
  ['.','C','C','C','C','.'],
  ['.','.','C','C','.','.'],
  ['.','.','B','B','.','.']
];
```

#### B. `ITEM_ENERGY_SPARK` (8x8, 2 frames)
Luminous pulsing cosmic orb dropped by enemies.
```typescript
export const ITEM_ENERGY_SPARK_FRAME_0: string[][] = [
  ['.','.','C','C','C','C','.','.'],
  ['.','C','W','W','W','W','C','.'],
  ['C','W','W','Y','Y','W','W','C'],
  ['C','W','Y','W','W','Y','W','C'],
  ['C','W','Y','W','W','Y','W','C'],
  ['C','W','W','Y','Y','W','W','C'],
  ['.','C','W','W','W','W','C','.'],
  ['.','.','C','C','C','C','.','.']
];

export const ITEM_ENERGY_SPARK_FRAME_1: string[][] = [
  ['.','.','.','C','C','.','.','.'],
  ['.','C','C','W','W','C','C','.'],
  ['.','C','W','W','W','W','C','.'],
  ['C','W','W','Y','Y','W','W','C'],
  ['C','W','W','Y','Y','W','W','C'],
  ['.','C','W','W','W','W','C','.'],
  ['.','C','C','W','W','C','C','.'],
  ['.','.','.','C','C','.','.','.']
];
```

#### C. `CHRONO_FROST_CORNER` (16x16, 1 frame)
Corner crystalline frost lattice blitted at the 4 screen corners during Chrono Freeze.
```typescript
export const CHRONO_FROST_CORNER_MATRIX: string[][] = [
  ['W','W','C','C','C','C','C','C','C','B','B','B','.','.','.','.'],
  ['W','W','W','C','C','C','C','C','B','B','B','.','.','.','.','.'],
  ['C','W','W','W','C','B','B','B','B','B','.','.','.','.','.','.'],
  ['C','C','W','W','W','W','C','B','B','.','.','.','.','.','.','.'],
  ['C','C','C','W','W','W','C','C','.','.','.','.','.','.','.','.'],
  ['C','C','B','W','C','W','W','C','B','.','.','.','.','.','.','.'],
  ['C','C','B','B','.','C','W','W','C','B','.','.','.','.','.','.'],
  ['C','B','B','.','.','.','C','W','W','C','B','.','.','.','.','.'],
  ['C','B','B','.','.','.','.','C','W','W','C','.','.','.','.','.'],
  ['B','B','.','.','.','.','.','.','C','W','W','C','.','.','.','.'],
  ['B','B','.','.','.','.','.','.','.','C','W','W','C','.','.','.'],
  ['B','.','.','.','.','.','.','.','.','.','C','W','C','.','.','.'],
  ['.','.','.','.','.','.','.','.','.','.','.','C','C','.','.','.'],
  ['.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','.','.','.','.','.','.','.','.','.']
];
```

---

## 4. Zero Runtime Garbage Collection (GC) Architecture

To preserve 60 FPS fluidity on mobile browsers and lower-end desktop devices without memory spikes, GC allocations are completely eliminated during combat:

### 4.1 Pool Capacities & Bounds
| Poolable Entity | Initial Capacity | Max Capacity | Auto-Expand | Allocation Lifetime |
|---|---|---|---|---|
| `NovaMissile` | 32 | 32 | `false` | Pre-allocated at startup |
| `EnergySpark` | 32 | 32 | `false` | Pre-allocated at startup |
| `Particle` | 250 | 250 | `false` | Reuses existing `ParticleSystem` |
| `Bullet` | 32 | 256 | `true` (bounded) | Reuses existing `BulletManager` |

### 4.2 Module-Level Static Scratch Variables
To avoid object creation (`{ x, y, width, height }`) inside per-frame hit tests and guidance steering:
```typescript
// Zero-allocation reusable math buffers
export const SCRATCH_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };
export const SCRATCH_POINT: Vector2D = { x: 0, y: 0 };
export const SCRATCH_VEC: Vector2D = { x: 0, y: 0 };
export const SCRATCH_TARGET_LIST: Enemy[] = new Array(64);
```

### 4.3 Safe Collection Iteration Patterns
Avoid array functional methods (`filter`, `map`, `forEach` with arrow callbacks creating closures). Instead, use indexed `for` loops or pre-allocated callback iterators:
```typescript
// ZERO-GC iteration pattern
const activeSparks = this.sparkPool.getActive();
const count = activeSparks.length;
for (let i = count - 1; i >= 0; i--) {
  const spark = activeSparks[i];
  if (!spark || !spark.active) continue;
  const alive = spark.update(dt);
  if (!alive) {
    this.sparkPool.release(spark);
  }
}
```

### 4.4 Web Audio Node Reuse & Voice Throttling
- The audio engine uses the pre-rendered white noise buffer (`SoundSynth.getWhiteNoiseBuffer`).
- Oscillators created for Special Move SFX are strictly bounded by `MAX_CONCURRENT_VOICES = 12` to prevent audio graph memory bloat.
- All Web Audio nodes register `.onended = () => { osc.disconnect(); gain.disconnect(); }` for deterministic cleanup.

---

## 5. Architectural Implementation Blueprint

### 5.1 File Directory Structure
```
src/
├── core/
│   └── special/
│       ├── types.ts                 # Enums, interfaces & contracts for Special Moves
│       ├── NovaMissile.ts           # Poolable homing micro-laser projectile
│       ├── EnergySpark.ts           # Poolable collectible energy pickup
│       └── SpecialMoveManager.ts    # Coordinator: energy gauge, active state machine, effects
├── entities/
│   └── Player.ts                    # Exposes warp ram kinematics & residual invulnerability
├── renderer/
│   └── SpriteRenderer.ts            # Registration & baking of Drones, Nova, Frost, Spark matrices
├── ui/
│   ├── HUD.ts                       # Energy gauge segmented bar & 'SP READY' rendering
│   └── InputHandler.ts              # 'KeyX', Gamepad button 1/2, '#btn-special' handling
└── core/
    └── Game.ts                      # Subsystem instantiation, collision hooks & Chrono Freeze dt wiring
```

### 5.2 Interface Contracts (`src/core/special/types.ts`)
```typescript
export enum SpecialMoveType {
  NOVA_BARRAGE = 'NOVA_BARRAGE',
  CHRONO_FREEZE = 'CHRONO_FREEZE',
  WARP_RAM = 'WARP_RAM',
}

export interface SpecialMoveState {
  energy: number;
  maxEnergy: number;
  selectedMove: SpecialMoveType;
  isActive: boolean;
  activeMove: SpecialMoveType | null;
  activeTimer: number;
  isReady: boolean;
}

export interface ISpecialMoveManager {
  readonly energy: number;
  readonly maxEnergy: number;
  selectedMove: SpecialMoveType;
  isReady(): boolean;
  addEnergy(amount: number): void;
  triggerSpecial(move?: SpecialMoveType): boolean;
  isChronoFreezeActive(): boolean;
  isWarpRamActive(): boolean;
  update(dt: number, player: Player): void;
  render(ctx: CanvasRenderingContext2D): void;
}
```

---

## 6. Verification Strategy & Edge Case Matrix

| Edge Case Scenario | Invariant Expectation | Mitigation Mechanism |
|---|---|---|
| **Trigger with Energy $< 100$** | Action ignored; returns `false`. Energy unaltered. | Strict precondition gate `if (this.energy < this.maxEnergy) return false;`. |
| **Player Captured during Active Move** | Move cancelled immediately or tractor beam deflected. | Active move grants invulnerability; tractor beam cannot latch onto player during Warp Ram. |
| **Chrono Freeze expires during Boss Transition** | Boss phase resumes without desynchronization. | BaseBoss state timers update with $\Delta t_{\text{enemy}} = 0$, freezing internal phase timers accurately. |
| **Nova Barrage fires with 0 living enemies** | Missiles curve upwards off-screen safely. | Target acquisition handles empty target array gracefully without throwing; bullets recycle at bounds. |
| **Rapid Key Spamming (`KeyX` held or mashed)** | Move triggers exactly once; discrete consumption. | Single-pulse action via `inputHandler.consumeAction('special')`. |
| **Warp Ram hits Boss Shield** | Absorbs damage, shatters shield, does not crash. | Checks `enemy.takeDamage(120)` with swept CCD. |
| **10,000 Special Trigger Endurance** | Zero memory growth ($< 1\text{MB}$ drift). | Verified with Vitest leak tests and ObjectPool capacity invariants. |

---

## Conclusion
The design provides deep tactical gameplay depth, visceral arcade audio-visual feedback, mathematical rigor, and guaranteed zero-GC performance, ready for implementation and testing.
