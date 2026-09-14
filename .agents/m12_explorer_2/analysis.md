# Milestone 12 Technical Analysis & Specification: 5 Epic Multi-Phase Boss Encounters

## Executive Summary

Milestone 12 introduces **5 Epic Multi-Phase Boss Encounters** to the Galaga Arcade Web Game, stationed strategically at major milestone stages:
- **Stage 10**: Cyber Dreadnought (사이버 전함)
- **Stage 20**: Dimensional Leviathan (차원수 레비아탄)
- **Stage 30**: Nanite Swarm Colossus (나노머신 거신)
- **Stage 40**: Psionic Shroud Harbinger (장막의 사자)
- **Stage 50**: Aeternum Star-Eater Core (항성 포식자 - 파이널 레이드)

This document establishes the authoritative mathematical, mechanical, memory, and rendering specifications for each encounter. Every boss is designed around the game's core architectural tenets:
1. **Zero External Assets**: 100% procedural HTML5 Canvas pixel matrices and procedural Web Audio API synthesis.
2. **Zero-GC Invariant**: Fixed 60 FPS update loops utilizing pre-allocated `ObjectPool` buffers without mid-battle heap allocation.
3. **Deterministic State Machines**: Rigorous discrete operational states, unambiguous HP/timer thresholds, and bounded collision hitboxes.
4. **Complete Backward Compatibility**: Preserves all existing 764 unit/E2E test invariants while extending the game loop.

---

## 1. Architectural Baseline & Boss State Machine Framework

### 1.1 Discrete Boss Lifecycle State Machine

Each boss instance conforms to a deterministic hierarchical state machine:

```
[INACTIVE]
    │
    ▼ (Stage Reached: 10, 20, 30, 40, or 50)
[INTRO / DESCENDING] ─── (2.5s Entrance Swoop & Boss Warning Banner)
    │
    ▼
[PHASE_1] ─── (Combat loop, sub-entities, defense matrix)
    │
    ▼ (HP <= Threshold 1, e.g. 50%)
[TRANSITION_1_2] ─── (1.5s Invulnerable Overload / Explosion / Reconfig)
    │
    ▼
[PHASE_2] ─── (Exposed Core, Desperation Attacks, Hazards)
    │
    ├─── (Stages 10, 20, 30, 40: HP <= 0)
    │
    ▼ (Stage 50 Only: HP <= 33%)
[TRANSITION_2_3] ─── (2.0s Hyper-Critical Reactor Meltdown)
    │
    ▼
[PHASE_3_ENRAGE] ─── (Stage 50 Only: Bullet Hell + Ramming)
    │
    ▼ (HP <= 0)
[DEFEATED / EXPLODING] ─── (3.0s Multi-Stage Particle Cascade & Audio Fanfare)
    │
    ▼
[STAGE_CLEAR] ─── (Advances to Stage N + 1)
```

### 1.2 Core Data Contracts & Interfaces

```typescript
export type BossPhaseId = 'INTRO' | 'PHASE_1' | 'TRANSITION_1_2' | 'PHASE_2' | 'TRANSITION_2_3' | 'PHASE_3' | 'DEFEATED';

export interface IBossEntity {
  readonly id: string;
  readonly name: string;
  readonly stage: number;
  readonly maxHealth: number;
  health: number;
  shield: number;
  phase: BossPhaseId;
  active: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  invulnerableTimer: number;
  stateTimer: number;
  
  isInvulnerable(): boolean;
  takeDamage(amount: number): { destroyed: boolean; damageDealt: number; phaseChanged: boolean };
  update(dt: number, playerX: number, playerY: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  reset(): void;
}
```

### 1.3 Game Loop Integration Hooks

- **Stage Trigger Hook (`Game.ts: updateStageIntro`)**:
  When `this.stage` equals 10, 20, 30, 40, or 50, standard 40-alien grid formation spawning is superseded by the dedicated `BossManager.spawnBoss(this.stage)`.
- **Collision Resolution (`Game.ts: resolveCollisions`)**:
  1. `Player Missiles vs Boss Core & Sub-parts`: Swept AABB checks against active vulnerable parts.
  2. `Boss Projectiles vs Player`: Tested through `BulletManager` or dedicated `BossProjectilePool` against player ship hitbox.
  3. `Boss Environmental Hazards vs Player`: Evaluates gravitational pull on player velocity $v_x$, beam line intersections, and status effects.
- **Victory & Progression Hook**:
  When Boss `health <= 0` and `phase === 'DEFEATED'`, upon completion of the explosion sequence (`stateTimer >= 3.0s`), `Game.onBossDefeated(boss)` is invoked:
  - Grants milestone score bonus:
    - Stage 10: 10,000 pts
    - Stage 20: 20,000 pts
    - Stage 30: 30,000 pts
    - Stage 40: 40,000 pts
    - Stage 50: 50,000 pts (Campaign Victory)
  - Drops guaranteed rare Power-Up capsules (Kinetic Deflector + Rapid Overclock).
  - Triggers `onStageClear()` and advances to next stage.

---

## 2. Stage 10: Cyber Dreadnought (사이버 전함)

### 2.1 Concept & Narrative Role
The Cyber Dreadnought is the frontline flagship of the invading fleet encountered at Stage 10 (the finale of the Classic Tier). It is an imposing, heavily armored battlecruiser featuring twin kinetic rail-turrets and automated escort hangars.

### 2.2 Numerical Stats & Thresholds
- **Total HP**: 80 HP
  - Phase 1 (Armored Chassis): 80 HP down to 40 HP (Threshold = 50%)
  - Left Twin-Laser Turret: 15 HP (Sub-entity)
  - Right Twin-Laser Turret: 15 HP (Sub-entity)
  - 2 Escort Fighter Drones: 5 HP each
  - Phase 2 (Exposed Plasma Core): 40 HP down to 0 HP
- **Dimensions**: $48 \times 32$ pixels.
- **Base Position**: Centered at $(112, 54)$, hovering horizontally with amplitude $\pm 35\text{ px}$ at frequency $0.25\text{ Hz}$.

### 2.3 Phase 1: Dual Twin-Laser Turrets & Escort Drones
1. **Shielded Core**:
   While both Left and Right Turrets are operational, the central core is covered by reinforced blast bulkheads. Any direct hit on the chassis deals only 50% damage ($0.5\text{ dmg}$, rounded or absorbing alternate hits) or zero damage until turrets are disabled.
2. **Turret Attack Pattern**:
   - Turrets are situated at offsets $(-16, +8)$ and $(+16, +8)$ relative to boss center.
   - Every $\tau_{turret} = 1.4\text{ s}$, the turrets alternate firing parallel twin laser bolts:
     $$\vec{v}_{laser} = [0, 220] \text{ px/s}$$
   - Turret tracking: When player moves rapidly, turrets rotate $\pm 15^\circ$ toward player:
     $$\theta_{aim} = \text{atan2}(y_{player} - y_{turret}, x_{player} - x_{turret})$$
3. **Escort Drones**:
   - 2 Escort Drones launch from lateral bays at $t = 2.0\text{ s}$.
   - Flight trajectory: Parametric infinity loop / figure-8 around the Dreadnought:
     $$x_{drone}(t) = x_{boss} \pm \left(32 + 12 \cos(2.0 t)\right)$$
     $$y_{drone}(t) = y_{boss} + 18 + 8 \sin(4.0 t)$$
   - Drones fire periodic single red needles ($v = 190\text{ px/s}$) aimed at player.

### 2.4 Transition 1 $\to$ 2
- **Condition**: Both turrets destroyed OR Boss Core HP $\le 40$ (50% max HP).
- **Invulnerability Window**: $1.5\text{ s}$.
- **FX**: Secondary hull explosions at turret coordinates, flashing white silhouette, siren sound effect (`playBossHit()` rapid sequence), core blast doors slide open.

### 2.5 Phase 2: Core Exposed & Rotating Spiral Bullet Rings
1. **Vulnerable Plasma Core**:
   Chassis bulkheads retract, exposing the glowing crimson antimatter core ($12 \times 12\text{ px}$ central hitbox). Takes 100% true damage.
2. **Rotating Spiral Bullet Rings**:
   The exposed core emits continuous radial bullet rings with an evolving angular offset.
   - Number of spiral arms: $M = 4$ arms spaced by $\frac{\pi}{2}$ radians ($90^\circ$).
   - Base angle evolution:
     $$\theta_0(t + \Delta t) = \theta_0(t) + \omega_{spiral} \cdot \Delta t$$
     $$\omega_{spiral} = 1.75 \text{ rad/s} \quad (\approx 100^\circ/\text{s})$$
   - Fire interval: Emits a wave every $\Delta t_{fire} = 0.35\text{ s}$ (total 4 bullets per wave).
   - Radial velocity of spiral projectiles:
     $$v_{ix} = V_{spiral} \cos\left(\theta_0(t) + i \frac{\pi}{2}\right)$$
     $$v_{iy} = V_{spiral} \sin\left(\theta_0(t) + i \frac{\pi}{2}\right)$$
     where $V_{spiral} = 140\text{ px/s}$.
   - Every $3.0\text{ s}$, the rotation direction inverts ($\omega \to -\omega$) preceded by a $0.4\text{ s}$ pause, creating an intersecting cross-spiral pattern.
3. **Targeted Precision Railgun**:
   Every $2.8\text{ s}$, while the spiral continues, the core charges for $0.6\text{ s}$ (yellow blinking indicator) and fires a high-velocity aimed shot directly at the player:
   $$\vec{v}_{aim} = 260 \cdot \frac{\vec{p}_{player} - \vec{p}_{core}}{|\vec{p}_{player} - \vec{p}_{core}|}$$

---

## 3. Stage 20: Dimensional Leviathan (차원수 레비아탄)

### 3.1 Concept & Narrative Role
Stationed at Stage 20 (Elite Tier apex), the Dimensional Leviathan is an eldritch, serpentine cosmic entity that swims through folds in hyperspace. It manipulates local spacetime geometry, causing dimensional rifts and gravitational distortion.

### 3.2 Numerical Stats & Thresholds
- **Total HP**: 120 HP
  - Phase 1 (Phase Shifter): 120 HP down to 60 HP (Threshold = 50%)
  - Phase 2 (Singularity Vortex): 60 HP down to 0 HP
- **Dimensions**: $48 \times 36$ pixels (serpentine bio-mechanical hull with undulating tail segments).
- **Base Position**: Sinusoidal floating path across upper screen:
  $$x(t) = 112 + 50 \sin(0.9 t)$$
  $$y(t) = 48 + 14 \cos(1.8 t)$$

### 3.3 Phase 1: Phase-Shift Invulnerability & Gravitational Tears
1. **Phase-Shift Timing**:
   The Leviathan oscillates between Real-Space (Materialized) and the Void Shroud (Dematerialized):
   - **Materialized Window**: $3.5\text{ s}$. Hull is fully opaque ($\alpha = 1.0$), vulnerable to player missiles.
   - **Dematerialized Window**: $2.0\text{ s}$. Hull turns into a shimmering translucent violet outline ($\alpha = 0.25$, chromatic aberration offset $\pm 2\text{ px}$).
   - **Invulnerability Guarantee**: In Dematerialized state, player missiles pass completely through the boss hitbox without registering collision or being consumed.
2. **Gravitational Dimensional Tears**:
   - While submerged in the Void Shroud, the Leviathan leaves behind $K = 2$ Dimensional Tears on the canvas:
     $$\vec{p}_{tear1} = (60, 110), \quad \vec{p}_{tear2} = (164, 110)$$
   - Tears persist for $6.0\text{ s}$, rendering as swirling violet/cyan gravity wells ($R_{core} = 8\text{ px}, R_{aurora} = 28\text{ px}$).
   - **Softened Gravitational Trajectory Bending**:
     Every active player missile has its velocity deflected by the tears using the softened gravity law:
     $$\vec{a}_{bullet} = \sum_{k=1}^{2} \frac{G_{tear} \cdot (\vec{p}_{tear, k} - \vec{p}_{bullet})}{\left(|\vec{p}_{tear, k} - \vec{p}_{bullet}|^2 + \epsilon^2\right)^{3/2}}$$
     where $G_{tear} = 320,000 \text{ px}^3/\text{s}^2$, and softening parameter $\epsilon = 18\text{ px}$.
   - This deflects vertical player missiles away from the boss, requiring players to compensate and shoot through narrow parabolic ballistic arcs!

### 3.4 Transition 1 $\to$ 2
- **Condition**: Boss HP $\le 60$ (50% max HP).
- **Invulnerability Window**: $1.8\text{ s}$.
- **FX**: The Leviathan collapses its dimensional tears in a thunderous spatial implosion, canvas starfield inverts color palette for 200ms, and its central maw opens into a black-hole singularity.

### 3.5 Phase 2: Radial Shockwaves & Black-Hole Gravity Suction Vortex
1. **Black-Hole Gravity Suction Vortex**:
   The Leviathan anchors at center $(112, 60)$ and ignites a continuous gravity suction vortex pulling the player ship toward the center:
   - Player is constrained to baseline $y_{player} = 250$.
   - Horizontal displacement: $\Delta x = x_{boss} - x_{player} = 112 - x_{player}$.
   - Gravitational suction force applied to player horizontal velocity:
     $$v_{x, player}(t + \Delta t) = v_{input} + v_{suction}$$
     $$v_{suction} = \text{sign}(\Delta x) \cdot \min\left(110, \frac{G_{vortex}}{|\Delta x| + d_0}\right)$$
     where $G_{vortex} = 4500 \text{ px}^2/\text{s}$, and damping offset $d_0 = 35\text{ px}$.
   - When player is near center ($|\Delta x| < 10$), $v_{suction} \approx 0$ (unstable equilibrium).
   - When player evades to the left or right edges ($x \approx 20$ or $x \approx 204$), suction exerts a strong pull ($\approx 65\text{ px/s}$) pulling them toward center, directly into the path of incoming boss fire!
2. **Radial Shockwaves with Safe-Sector Gaps**:
   - The Leviathan periodically releases expanding energetic shockwave rings at interval $\Delta t = 2.4\text{ s}$.
   - Shockwave expansion:
     $$R_{ring}(t) = v_{shock} \cdot (t - t_{fire}), \quad v_{shock} = 110\text{ px/s}$$
     Ring thickness $\delta = 6\text{ px}$.
   - **Safe-Sector Opening**:
     The ring is NOT a solid unbroken circle; it features an angular opening (safe sector) of width $\Delta \theta_{safe} = 40^\circ$ ($0.70\text{ rad}$):
     $$\theta_{safe}(t) = \theta_{base} + \omega_{ring} \cdot t$$
     The player ship at $(x_p, y_p)$ relative to boss center has angle $\phi_p = \text{atan2}(y_p - y_{boss}, x_p - x_{boss})$.
     If distance $|r_p - R_{ring}| \le \delta / 2$ and $|\phi_p - \theta_{safe}| > \Delta \theta_{safe} / 2$, player suffers damage!
   - Player must use their thrusters—fighting against the gravity vortex—to align with the rotating safe gap as the shockwave sweeps past baseline!

---

## 4. Stage 30: Nanite Swarm Colossus (나노머신 거신)

### 4.1 Concept & Narrative Role
At Stage 30 (entry to the Dreadnought Tier), players encounter the Nanite Swarm Colossus. Unlike monolithic ships, it is a sentient mega-cluster of billions of self-replicating nanobots able to deconstruct into multiple combat drones and deploy bullet-dissolving gray goo clouds.

### 4.2 Numerical Stats & Thresholds
- **Total HP**: 150 HP
  - Phase 1 (Colossus Cluster): 150 HP down to 75 HP (Threshold = 50%)
  - Split Sub-Entities (4 Mini-Constructs): $4 \times 18\text{ HP} = 72\text{ HP}$ total
  - Phase 2 (Overclocked Reassembled Titan): 75 HP down to 0 HP
- **Dimensions**: $48 \times 40$ pixels (shifting metallic voxel matrix).
- **Base Position**: $(112, 56)$ with periodic stepped lateral shifts.

### 4.3 Phase 1: Massive Pixel Cluster & 4 Mini-Construct Split
1. **Colossus Cluster Attacks**:
   - Fires alternating 3-way spread salvos of nanite cluster needles:
     $$\theta_k = -\frac{\pi}{2} + k \cdot 18^\circ, \quad k \in \{-1, 0, 1\}, \quad v = 180\text{ px/s}$$
   - When struck by player missiles, metallic nanite debris particles burst outward.
2. **Sub-Entity Splitting Mechanics**:
   - At $HP \le 75$, the Colossus detonates into a cloud of micro-particles and reforms into **4 autonomous Mini-Constructs**:
     - **Construct 1 (Alpha - Top Left)**: Anchored at $(50, 45)$, strafes horizontally.
     - **Construct 2 (Beta - Top Right)**: Anchored at $(174, 45)$, strafes horizontally.
     - **Construct 3 (Gamma - Mid Left)**: Anchored at $(75, 90)$, performs shallow diving swoops.
     - **Construct 4 (Delta - Mid Right)**: Anchored at $(149, 90)$, performs shallow diving swoops.
   - Each Mini-Construct has $18\text{ HP}$ and independent $16 \times 16\text{ px}$ hitboxes.
   - Kinematics of Mini-Constructs (Lissajous curves):
     $$x_k(t) = X_{anchor, k} + 25 \sin(\omega_k t + \phi_k)$$
     $$y_k(t) = Y_{anchor, k} + 10 \cos(2 \omega_k t)$$
   - Each construct fires rapid twin micro-plasma needles ($v = 200\text{ px/s}$).
   - The player must destroy all 4 Mini-Constructs to force Phase 2 reassembly!

### 4.4 Transition 1 $\to$ 2
- **Condition**: All 4 Mini-Constructs destroyed (or cumulative sub-entity HP reduced to 0).
- **Invulnerability Window**: $2.0\text{ s}$.
- **FX**: Nanite particles magnetically stream toward canvas center $(112, 56)$ with high-speed inward particle vectors, sound of rising resonant synthetic oscillation, reforming into the Overclocked Titan form.

### 4.5 Phase 2: Reassembly & Nanite Gray Goo Clouds
1. **Overclocked Nanite Titan**:
   - Reassembled form features glowing lime/amber energy veins across dark gunmetal armor.
   - Core fires high-speed downward nanite lances ($v = 240\text{ px/s}$).
2. **Nanite Gray Goo Clouds (Bullet Dissolution Hazard)**:
   - Every $4.0\text{ s}$, the Titan expels $N = 2$ dense Nanite Gray Goo Clouds drifting down toward the player's firing corridor:
     $$\vec{p}_{cloud1}(t) = (65 + 15 \sin(0.8 t), 150 + 20 \cos(0.5 t))$$
     $$\vec{p}_{cloud2}(t) = (155 + 15 \cos(0.8 t), 170 + 18 \sin(0.6 t))$$
   - Cloud radius: $R_{cloud} = 22\text{ px}$.
   - Duration: Each cloud remains active for $6.0\text{ s}$.
   - **Bullet Dissolution Law**:
     When any active player missile enters the cloud boundary:
     $$\text{dist}(\vec{p}_{missile}, \vec{p}_{cloud}) < R_{cloud}$$
     The missile is instantly dissolved and neutralized:
     - Player missile is returned immediately to the zero-allocation `ObjectPool`.
     - Dissolved effect: Spawns 4 micro silver sparkle particles at dissolution coordinates.
     - Deal 0 damage to boss.
   - Tactical Requirement: The player must maneuver horizontally to find line-of-sight gaps between the drifting clouds, timing their shots through dynamic firing windows!

---

## 5. Stage 40: Psionic Shroud Harbinger (장막의 사자)

### 5.1 Concept & Narrative Role
Stationed at Stage 40 (late Dreadnought Tier), the Psionic Shroud Harbinger is an extraterrestrial psionic entity attuned to the Shroud. It attacks the player's mind and ship guidance electronics through optical illusions, phantom clones, and telekinetic thruster disruption.

### 5.2 Numerical Stats & Thresholds
- **Total HP**: 180 HP
  - Phase 1 (Phantom Shell Game): 180 HP down to 90 HP (Threshold = 50%)
  - Phase 2 (Psionic Overdrive): 90 HP down to 0 HP
- **Dimensions**: $44 \times 36$ pixels (flowing psychic cowl, ethereal hovering mantle).
- **Base Position**: Coordinates updated dynamically by shell game shuffling.

### 5.3 Phase 1: Illusory Phantom Clones & Shell Game Dive-Bombs
1. **The 3-Body Formation**:
   - The Harbinger manifests **2 Illusory Phantom Clones**.
   - At the beginning of each attack cycle, the 3 entities occupy slots:
     $$\text{Slot } 0: (48, 50), \quad \text{Slot } 1: (112, 50), \quad \text{Slot } 2: (176, 50)$$
   - One slot is randomly assigned to the **True Core**; the other two are **Phantoms**.
2. **Subtle Visual Tell**:
   - The sprites of the True Core and Phantoms are nearly identical.
   - **Visual Tell**: The True Core possesses a faint $12\text{ Hz}$ pulsating central third-eye pixel (coded with `#00FFFF` cyan highlight), whereas the Phantoms have a solid deep-purple center (`#550088`).
   - Discerning players who spot the cyan pulse can avoid wasting ammunition on phantoms!
3. **Coordinated Dive-Bombing**:
   - All 3 units launch into diving swoops simultaneously along mirrored Cubic Bézier curves.
   - While diving, all 3 units fire identical red psionic bolts.
4. **Hit Resolution**:
   - **Hitting a Phantom**: Player missile passes through or bursts with a translucent purple ripple. Deals 0 damage.
   - **Hitting the True Core**: Triggers standard hit spark, damage sound, and decrements boss HP.
5. **The Shell Game Shuffle**:
   - At the end of each dive ($6.0\text{ s}$ cycle), all 3 units return to top of screen.
   - They converge at center $(112, 45)$ and perform a rapid $1.5\text{ s}$ circular rotation swap:
     $$\theta_k(t) = \theta_{start, k} + 4\pi \cdot \frac{t}{1.5}$$
   - The True Core slot index is re-randomized, forcing the player to re-acquire the true target!

### 5.4 Transition 1 $\to$ 2
- **Condition**: Boss HP $\le 90$ (50% max HP).
- **Invulnerability Window**: $1.8\text{ s}$.
- **FX**: The two Phantom Clones shatter into psionic glass shards, the Harbinger's cowl burns with magenta flames, and the screen borders pulse with a deep violet vignette.

### 5.5 Phase 2: Telekinetic Stun Pulses & Thruster Disruption
1. **Telekinetic Stun Pulse**:
   - Every $3.8\text{ s}$, the Harbinger channels psychic energy for $0.8\text{ s}$ (visible magenta contracting energy ring).
   - Unleashes a wide telekinetic distortion wave traveling down the screen:
     $$y_{wave}(t) = y_{boss} + v_{wave} \cdot t, \quad v_{wave} = 220\text{ px/s}$$
     Wave spans the entire canvas width ($X \in [0, 224]$, height $8\text{ px}$).
2. **Thruster Disruption (Player EMP Stun)**:
   - When the wave collides with the player ship:
     - Player is NOT destroyed (unless already on 0 lives / without shield).
     - Player enters **Thruster Stun / Disruption** for $\tau_{stun} = 1.25\text{ s}$.
   - **Mechanics of Thruster Disruption**:
     - Player horizontal movement speed is cut by 75%:
       $$v_{effective} = 0.25 \times v_{normal} = 0.25 \times 260 = 65\text{ px/s}$$
     - Player ship renders with flickering electric-blue static sparks (`#00FFFF` and `#FFFFFF` spark particles).
     - Weapon fire rate is halved for the duration of the stun.
3. **Aimed Psychic Lances**:
   - Immediately following the stun wave, while the player is sluggish and struggling to move, the Harbinger fires a salvo of 3 rapid aimed psychic lances ($v = 280\text{ px/s}$) aimed at the player's anticipated position!
   - Surviving requires pre-positioning and micro-tapping thrusters to slide out of the firing line!

---

## 6. Stage 50: Aeternum Star-Eater Core (항성 포식자 - 파이널 레이드)

### 6.1 Concept & Narrative Role
The ultimate climax of the entire 50-round Galaga campaign! The Aeternum Star-Eater Core is a colossal Dyson-scale cosmic superweapon designed to harvest entire stars. It features an impenetrable planetary defense shield powered by orbital satellites, a screen-annihilating dark matter beam, and a desperate terminal enrage phase.

### 6.2 Numerical Stats & Thresholds
- **Total HP**: 300 HP across 3 Distinct Phases ($100\text{ HP} \to 100\text{ HP} \to 100\text{ HP}$):
  - **Phase 1 (Planetary Shield Matrix)**: Core is 100% immune; 4 Orbital Satellite Generators ($4 \times 25\text{ HP} = 100\text{ HP}$).
  - **Phase 2 (Dark Matter Beam Cannon)**: Core HP $200 \to 100$ (100 HP consumed).
  - **Phase 3 (Terminal Reactor Enrage)**: Core HP $100 \to 0$ (Final 100 HP).
- **Dimensions**: $56 \times 48$ pixels (giant geometric cosmic core surrounded by coronal plasma loops).
- **Base Position**: Anchored at $(112, 52)$.

### 6.3 Phase 1: Planetary Shield Matrix & 4 Orbital Satellite Generators
1. **Invulnerable Planetary Shield**:
   - The central core is encased in a shimmering hexagonal forcefield bubble ($R = 38\text{ px}$).
   - Any player bullet striking the shield deflects with an electric chime and zero damage.
2. **4 Orbital Satellite Generators**:
   - 4 autonomous shield satellites orbit the core along an elliptical trajectory:
     $$x_k(t) = x_{core} + R_x \cos\left(\omega_{orbit} t + k \frac{\pi}{2}\right)$$
     $$y_k(t) = y_{core} + R_y \sin\left(\omega_{orbit} t + k \frac{\pi}{2}\right)$$
     where $R_x = 46\text{ px}$, $R_y = 22\text{ px}$, and $\omega_{orbit} = 1.1\text{ rad/s}$ ($k \in \{0, 1, 2, 3\}$).
   - Each satellite has $25\text{ HP}$ and an independent $12 \times 12\text{ px}$ hitbox.
   - Energy tether beams: Glowing cyan laser lines continuously connect each living satellite to the central core.
   - Attacks: Each satellite fires downward vertical pulse lasers ($v = 210\text{ px/s}$).
3. **Shield Collapse Progression**:
   - As each satellite is destroyed:
     - Core shield opacity drops by 25% ($\alpha_{shield} = 0.8 \to 0.6 \to 0.4 \to 0.2$).
     - Core emits an energy feedback pulse.
   - When the 4th satellite is eliminated, the Planetary Shield shatters in a full-screen white flash, transitioning to Phase 2!

### 6.4 Transition 1 $\to$ 2
- **Condition**: All 4 Satellites destroyed.
- **Invulnerability Window**: $2.0\text{ s}$.
- **FX**: Shield explosion, siren SFX, core outer armor plates pivot downward, exposing the colossal Dark Matter Focusing Lens.

### 6.5 Phase 2: Dark Matter Beam Sweep Spanning 60% of Canvas Width
1. **The Mega-Beam Cannon**:
   - Canvas width is $W_{canvas} = 224\text{ px}$.
   - Beam width is $W_{beam} = 0.60 \times 224 \approx 134\text{ px}$!
   - This beam covers nearly two-thirds of the screen, representing an apocalyptic hazard.
2. **Charging Sequence**:
   - Charge Duration: $1.6\text{ s}$.
   - Warning Line: A thin, high-contrast red tracer laser ($2\text{ px}$ wide) tracks the impending center of the beam.
   - Sound: Pitch-rising sub-bass charge oscillator (`SoundSynth`).
   - Visual: Ambient canvas stars dim to deep purple; energy motes coalesce into the lens.
3. **Firing & Horizontal Sweep**:
   - Fire Duration: $1.8\text{ s}$.
   - Hitbox: Vertical column of width $134\text{ px}$ extending from $y = 70$ to $y = 288$:
     $$x_{left}(t) = X_{beam}(t) - \frac{W_{beam}}{2}, \quad x_{right}(t) = X_{beam}(t) + \frac{W_{beam}}{2}$$
   - **Horizontal Sweep Kinematics**:
     During the $1.8\text{ s}$ firing cycle, the beam sweeps laterally by $45\text{ px}$:
     $$X_{beam}(t) = X_{start} \pm v_{sweep} \cdot t, \quad v_{sweep} = 30\text{ px/s}$$
   - **Safe Evasion Pocket**:
     Because $W_{beam} = 134\text{ px}$, there remains a $90\text{ px}$ safe corridor partitioned across the canvas edges.
     If the beam sweeps toward the right ($X_{beam} \in [90, 140]$), the left edge ($X \in [0, 45]$) is completely safe!
     The player MUST read the warning tracer during the charge phase and dash to the correct canvas flank!
4. **Accompanying Hazard**:
   - While the beam is cooling down between cycles ($\tau_{cooldown} = 2.5\text{ s}$), the core fires twin 5-way spread shotgun bursts ($v = 170\text{ px/s}$).

### 6.6 Transition 2 $\to$ 3 (Terminal Reactor Enrage)
- **Condition**: Boss Core HP $\le 100$ (33% max HP).
- **Invulnerability Window**: $2.0\text{ s}$.
- **FX**: Core reactor breaches containment! Ambient music warps into hyper-tempo sirens, canvas starfield accelerates into warp streaks ($4.0\times$ speed), and the core emits massive orange/crimson plasma flares.

### 6.7 Phase 3 (Enrage): Overdrive Bullet Hell Barrage & Desperate Swarm Ramming
1. **Dual Interlocking Overdrive Bullet Hell**:
   - The Core deploys dual simultaneous counter-rotating spiral cannons:
     - **Cannon Alpha (Clockwise)**: $M = 6$ arms, $\omega_A = +2.2\text{ rad/s}$, fires crimson plasma spheres ($v = 130\text{ px/s}$).
     - **Cannon Beta (Counter-Clockwise)**: $M = 6$ arms, $\omega_B = -2.2\text{ rad/s}$, fires amber plasma spheres ($v = 130\text{ px/s}$).
   - Density: Emits a wave every $0.25\text{ s}$. Over 48 concurrent bullets on screen, forming an interlocking geometric lattice with dynamic diamond-shaped safe pockets!
2. **Desperate Swarm Ramming Pass**:
   - Every $5.0\text{ s}$, the Core detaches from its top anchor and conducts a high-speed diving ram pass directly across the player baseline!
   - Trajectory: Smooth Cubic Bézier swooping from top-center to lower-left, sweeping baseline horizontally, and looping back to top-right:
     $$P_0 = (112, 52), \quad P_1 = (20, 160), \quad P_2 = (204, 250), \quad P_3 = (112, 52)$$
     Swoop duration: $2.2\text{ s}$, velocity peaking at $260\text{ px/s}$.
   - Player must slip between the bullet hell lattice while evading the massive hull of the descending core!
3. **Grand Finale Destruction**:
   - When HP reaches 0:
     - All on-screen enemy bullets instantly vaporize into golden bonus stars.
     - Multi-stage cascading explosions across the Core ($3.5\text{ s}$ duration, 120+ explosion spark particles).
     - Canvas flashes bright white for $150\text{ ms}$.
     - Final Campaign Victory Fanfare plays (`MusicJingles`).
     - Awards 50,000 pts and displays the Ultimate Galaga Champion victory screen!

---

## 7. Mathematical Equations Reference Table

| Hazard / Attack | Mathematical Formulation | Parameters & Constants |
|---|---|---|
| **Rotating Spiral Bullet Ring** (Stages 10, 50) | $\theta_i(t) = \theta_0 + \omega t + i \frac{2\pi}{M}$<br>$\vec{v}_i = [V_b \cos\theta_i, V_b \sin\theta_i]$ | Stage 10: $M=4, \omega=1.75\text{ rad/s}, V_b=140\text{ px/s}$<br>Stage 50: $M=6, \omega=\pm 2.20\text{ rad/s}, V_b=130\text{ px/s}$ |
| **Softened Gravitational Deflection** (Stage 20 Tear) | $\vec{a} = \frac{G (\vec{p}_{tear} - \vec{p}_{bullet})}{(r^2 + \epsilon^2)^{3/2}}$ | $G = 320,000\text{ px}^3/\text{s}^2, \epsilon = 18\text{ px}$ |
| **Black-Hole Vortex Horizontal Pull** (Stage 20 Vortex) | $v_{pull} = \text{sign}(\Delta x) \cdot \min\left(V_{max}, \frac{G_{vortex}}{\|\Delta x\| + d_0}\right)$ | $G_{vortex} = 4500\text{ px}^2/\text{s}, d_0 = 35\text{ px}, V_{max} = 110\text{ px/s}$ |
| **Expanding Radial Shockwave** (Stage 20) | $R(t) = v_{shock} \cdot t$<br>Hit if $\|r_p - R\| \le \frac{\delta}{2} \land \|\phi_p - \theta_{gap}\| > \frac{\Delta\theta_{safe}}{2}$ | $v_{shock} = 110\text{ px/s}, \delta = 6\text{ px}, \Delta\theta_{safe} = 40^\circ$ |
| **Lissajous Mini-Constructs** (Stage 30) | $x(t) = X_0 + A_x \sin(\omega t + \phi)$<br>$y(t) = Y_0 + A_y \cos(2\omega t)$ | $A_x = 25\text{ px}, A_y = 10\text{ px}, \omega = 1.4\text{ rad/s}$ |
| **Nanite Gray Goo Dissolution** (Stage 30) | $\|\vec{p}_{bullet} - \vec{p}_{cloud}\| < R_{cloud} \implies \text{Recycle bullet}$ | $R_{cloud} = 22\text{ px}, \tau_{cloud} = 6.0\text{ s}$ |
| **Telekinetic Stun Wave** (Stage 40) | $y_{wave}(t) = y_{boss} + v_{wave} t$<br>$v_{player, eff} = 0.25 \times v_{normal}$ | $v_{wave} = 220\text{ px/s}, \tau_{stun} = 1.25\text{ s}$ |
| **Orbital Satellites Path** (Stage 50) | $x_k = x_c + R_x \cos(\omega t + k \frac{\pi}{2})$<br>$y_k = y_c + R_y \sin(\omega t + k \frac{\pi}{2})$ | $R_x = 46\text{ px}, R_y = 22\text{ px}, \omega = 1.1\text{ rad/s}$ |
| **Mega-Beam Sweep Hitbox** (Stage 50) | $X \in [X_{beam} - \frac{W_b}{2}, X_{beam} + \frac{W_b}{2}], Y \in [70, 288]$<br>$W_b = 0.60 \times 224 = 134.4\text{ px}$ | $W_{beam} = 134\text{ px}, v_{sweep} = 30\text{ px/s}, \tau_{fire} = 1.8\text{ s}$ |

---

## 8. Zero-GC Object Pooling Architecture

To guarantee zero Garbage Collection frame drops during intense 60 FPS bullet hell sequences, all boss projectiles, sub-entities, and hazards MUST be strictly pre-allocated.

### 8.1 Memory Budgets & Pool Sizing

```typescript
export const BOSS_POOL_CONFIG = {
  // Boss Projectiles (Dedicated pool to prevent starving regular enemy bullets)
  BOSS_PROJECTILE_POOL_INITIAL: 64,
  BOSS_PROJECTILE_POOL_MAX: 160,     // Sized for Stage 50 dual 6-arm spiral hell (48 active bullets)

  // Sub-Entities & Hazards
  MAX_TURRETS: 2,
  MAX_ESCORT_DRONES: 4,
  MAX_MINI_CONSTRUCTS: 4,
  MAX_PHANTOM_CLONES: 2,
  MAX_ORBITAL_SATELLITES: 4,
  MAX_GRAY_GOO_CLOUDS: 4,
  MAX_DIMENSIONAL_TEARS: 2,
} as const;
```

### 8.2 Entity Pooling Classes

1. **`BossBullet` (Poolable)**:
   - Fields: `x, y, vx, vy, prevX, prevY, radius, type, color, active, life`.
   - Hitbox: Swept Circle-to-AABB collision check to prevent tunneling through the player at high velocities.
   - Recycled automatically via `ObjectPool<BossBullet>` using O(1) swap-and-pop release.
2. **`BossHazard` (Poolable)**:
   - Pre-allocated statically within `BossManager`.
   - Reused across all 5 encounters without instantiating new objects at runtime.
   - For example, the 4 orbital satellites in Stage 50 and the 4 mini-constructs in Stage 30 share the same underlying sub-entity pool buffer!

---

## 9. Procedural Canvas Pixel Matrix Catalog

In accordance with the project's zero-external-asset mandate, all boss visual representations are pre-baked onto offscreen canvases via `SpriteRenderer` using ASCII color-mapped character matrices.

### Color Palette Legend
- `.` : Transparent (`rgba(0,0,0,0)`)
- `W` : White (`#FFFFFF`)
- `R` : Red (`#E70000`)
- `D` : Dark Red (`#9E0000`)
- `B` : Blue Light (`#5B93FF`)
- `C` : Blue Cyan (`#00FFFF`)
- `N` : Blue Navy (`#000088`)
- `Y` : Yellow (`#FFFF00`)
- `O` : Orange (`#FF7F00`)
- `G` : Green (`#00E700`)
- `P` : Pink / Magenta (`#FF007F`)
- `L` : Grey Light (`#AAAAAA`)
- `K` : Grey Dark (`#555555`)
- `U` : Purple (`#9900EE`)

---

### 9.1 Stage 10: Cyber Dreadnought Matrices

#### Matrix 1: `BOSS_DREADNOUGHT_ARMORED` (Phase 1, $24 \times 16$ scaled to $48 \times 32$)
```typescript
export const BOSS_DREADNOUGHT_ARMORED_MATRIX: string[][] = [
  ['.','.','.','.','.','K','L','L','L','L','K','.','.','K','L','L','L','L','K','.','.','.','.','.'],
  ['.','.','.','.','K','L','W','W','W','W','L','K','K','L','W','W','W','W','L','K','.','.','.','.'],
  ['.','.','.','K','L','W','R','R','R','R','W','L','L','W','R','R','R','R','W','L','K','.','.','.'],
  ['.','.','K','L','W','R','R','Y','Y','R','R','W','W','R','R','Y','Y','R','R','W','L','K','.','.'],
  ['.','K','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','K','.'],
  ['K','L','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','L','K'],
  ['L','L','K','C','C','C','K','K','K','K','L','L','L','L','K','K','K','K','C','C','C','K','L','L'],
  ['L','W','K','C','W','C','K','K','K','L','W','W','W','W','L','K','K','K','C','W','C','K','W','L'],
  ['L','W','K','C','C','C','K','K','L','W','W','K','K','W','W','L','K','K','C','C','C','K','W','L'],
  ['L','L','K','K','K','K','K','L','W','W','K','K','K','K','W','W','L','K','K','K','K','K','L','L'],
  ['.','L','L','L','L','L','L','W','W','K','K','K','K','K','K','W','W','L','L','L','L','L','L','.'],
  ['.','.','K','K','K','K','L','W','K','K','K','K','K','K','K','K','W','L','K','K','K','K','.','.'],
  ['.','.','.','K','L','L','W','W','K','K','K','K','K','K','K','K','W','W','L','L','K','.','.','.'],
  ['.','.','.','.','K','L','W','K','K','K','K','K','K','K','K','K','K','W','L','K','.','.','.','.'],
  ['.','.','.','.','.','K','L','K','K','O','O','K','K','O','O','K','K','L','K','.','.','.','.','.'],
  ['.','.','.','.','.','.','K','.','O','Y','Y','O','O','Y','Y','O','.','K','.','.','.','.','.','.']
];
```

#### Matrix 2: `BOSS_DREADNOUGHT_EXPOSED` (Phase 2 Core Exposed, $24 \times 16$)
```typescript
export const BOSS_DREADNOUGHT_EXPOSED_MATRIX: string[][] = [
  ['.','.','.','.','.','D','R','R','R','R','D','.','.','D','R','R','R','R','D','.','.','.','.','.'],
  ['.','.','.','.','D','R','O','Y','Y','O','R','D','D','R','O','Y','Y','O','R','D','.','.','.','.'],
  ['.','.','.','D','R','O','Y','W','W','Y','O','R','R','O','Y','W','W','Y','O','R','D','.','.','.'],
  ['.','.','K','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','K','.','.'],
  ['.','K','L','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','L','K','.'],
  ['K','L','K','D','D','D','K','K','R','R','R','R','R','R','R','R','K','K','D','D','D','K','L','K'],
  ['L','L','K','D','R','D','K','R','R','O','O','O','O','O','O','R','R','K','D','R','D','K','L','L'],
  ['L','W','K','D','D','D','K','R','O','O','Y','Y','Y','Y','O','O','R','K','D','D','D','K','W','L'],
  ['L','W','K','K','K','K','K','R','O','Y','Y','W','W','Y','Y','O','R','K','K','K','K','K','W','L'],
  ['L','L','L','L','L','L','K','R','O','Y','Y','W','W','Y','Y','O','R','K','L','L','L','L','L','L'],
  ['.','L','K','K','K','K','K','R','O','O','Y','Y','Y','Y','O','O','R','K','K','K','K','K','L','.'],
  ['.','.','K','L','L','K','K','R','R','O','O','O','O','O','O','R','R','K','K','L','L','K','.','.'],
  ['.','.','.','K','L','W','K','K','R','R','R','R','R','R','R','R','K','K','W','L','K','.','.','.'],
  ['.','.','.','.','K','L','W','K','K','K','K','K','K','K','K','K','K','W','L','K','.','.','.','.'],
  ['.','.','.','.','.','K','L','K','K','R','O','K','K','O','R','K','K','L','K','.','.','.','.','.'],
  ['.','.','.','.','.','.','K','.','R','O','Y','R','R','Y','O','R','.','K','.','.','.','.','.','.']
];
```

---

### 9.2 Stage 20: Dimensional Leviathan Matrices

#### Matrix 1: `BOSS_LEVIATHAN_REAL` (Materialized State, $24 \times 16$)
```typescript
export const BOSS_LEVIATHAN_REAL_MATRIX: string[][] = [
  ['.','.','.','.','.','.','.','U','U','U','.','.','.','.','U','U','U','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','U','P','P','P','U','.','.','U','P','P','P','U','.','.','.','.','.','.'],
  ['.','.','.','.','.','U','P','W','W','P','P','U','U','P','P','W','W','P','U','.','.','.','.','.'],
  ['.','.','.','.','U','P','W','C','C','W','P','P','P','P','W','C','C','W','P','U','.','.','.','.'],
  ['.','.','.','U','P','P','W','C','N','C','W','P','P','W','C','N','C','W','P','P','U','.','.','.'],
  ['.','.','U','P','P','P','P','W','C','W','P','C','C','P','W','C','W','P','P','P','P','U','.','.'],
  ['.','U','P','C','C','P','P','P','W','P','C','W','W','C','P','W','P','P','P','C','C','P','U','.'],
  ['U','P','C','W','W','C','P','P','P','C','W','C','C','W','C','P','P','P','C','W','W','C','P','U'],
  ['U','P','C','W','W','C','P','P','C','W','C','N','N','C','W','C','P','P','C','W','W','C','P','U'],
  ['.','U','P','C','C','P','P','C','W','C','N','N','N','N','C','W','C','P','P','C','C','P','U','.'],
  ['.','.','U','P','P','P','C','W','C','N','N','N','N','N','N','C','W','C','P','P','P','U','.','.'],
  ['.','.','.','U','P','P','C','W','C','N','N','N','N','N','N','C','W','C','P','P','U','.','.','.'],
  ['.','.','.','.','U','P','P','C','W','C','N','N','N','N','C','W','C','P','P','U','.','.','.','.'],
  ['.','.','.','.','.','U','P','P','C','W','C','C','C','C','W','C','P','P','U','.','.','.','.','.'],
  ['.','.','.','.','.','.','U','P','P','C','W','W','W','W','C','P','P','U','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','U','P','P','C','C','C','C','P','P','U','.','.','.','.','.','.','.']
];
```

#### Matrix 2: `BOSS_LEVIATHAN_VOID` (Dematerialized Shroud State, $24 \times 16$)
Remapped with ethereal alpha codes: `P` $\to$ `U`, `W` $\to$ `C`, `C` $\to$ `N`, `N` $\to$ `.`.

---

### 9.3 Stage 30: Nanite Swarm Colossus Matrices

#### Matrix 1: `BOSS_NANITE_COLOSSUS` ($24 \times 16$)
```typescript
export const BOSS_NANITE_COLOSSUS_MATRIX: string[][] = [
  ['.','.','.','.','L','L','L','K','K','L','L','L','L','L','L','K','K','L','L','L','.','.','.','.'],
  ['.','.','.','L','W','W','L','L','K','L','G','G','G','G','L','K','L','L','W','W','L','.','.','.'],
  ['.','.','L','W','G','G','W','L','K','G','W','W','W','W','G','K','L','W','G','G','W','L','.','.'],
  ['.','L','W','G','C','C','G','W','L','G','W','C','C','W','G','L','W','G','C','C','G','W','L','.'],
  ['L','W','G','C','W','W','C','G','W','L','G','W','W','G','L','W','G','C','W','W','C','G','W','L'],
  ['L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L'],
  ['K','K','L','G','G','G','G','L','K','K','L','G','G','L','K','K','L','G','G','G','G','L','K','K'],
  ['K','L','G','W','C','C','W','G','L','K','L','G','G','L','K','L','G','W','C','C','W','G','L','K'],
  ['L','L','G','C','W','W','C','G','L','L','L','L','L','L','L','L','G','C','W','W','C','G','L','L'],
  ['L','G','W','C','C','C','C','W','G','L','K','L','L','K','L','G','W','C','C','C','C','W','G','L'],
  ['L','L','G','W','C','C','W','G','L','L','K','L','L','K','L','L','G','W','C','C','W','G','L','L'],
  ['.','L','L','G','G','G','G','L','L','K','K','K','K','K','K','L','L','G','G','G','G','L','L','.'],
  ['.','.','L','L','L','L','L','L','K','K','L','G','G','L','K','K','L','L','L','L','L','L','.','.'],
  ['.','.','.','K','K','K','K','K','K','L','G','W','W','G','L','K','K','K','K','K','K','.','.','.'],
  ['.','.','.','.','K','L','L','K','K','L','G','W','W','G','L','K','K','L','L','K','.','.','.','.'],
  ['.','.','.','.','.','K','K','.','.','K','L','G','G','L','K','.','.','K','K','.','.','.','.','.']
];
```

#### Matrix 2: `BOSS_NANITE_MINI_CONSTRUCT` ($12 \times 12$)
```typescript
export const BOSS_NANITE_MINI_CONSTRUCT_MATRIX: string[][] = [
  ['.','.','.','L','L','L','L','L','L','.','.','.'],
  ['.','.','L','W','G','G','G','G','W','L','.','.'],
  ['.','L','W','G','C','C','C','C','G','W','L','.'],
  ['L','W','G','C','W','W','W','W','C','G','W','L'],
  ['L','G','C','W','W','C','C','W','W','C','G','L'],
  ['L','G','C','W','C','G','G','C','W','C','G','L'],
  ['L','G','C','W','C','G','G','C','W','C','G','L'],
  ['L','G','C','W','W','C','C','W','W','C','G','L'],
  ['L','W','G','C','W','W','W','W','C','G','W','L'],
  ['.','L','W','G','C','C','C','C','G','W','L','.'],
  ['.','.','L','W','G','G','G','G','W','L','.','.'],
  ['.','.','.','L','L','L','L','L','L','.','.','.']
];
```

---

### 9.4 Stage 40: Psionic Shroud Harbinger Matrices

#### Matrix 1: `BOSS_HARBINGER_TRUE` (True Core — Note Cyan Eye 'C' in Center, $24 \times 16$)
```typescript
export const BOSS_HARBINGER_TRUE_MATRIX: string[][] = [
  ['.','.','.','.','.','.','.','.','U','P','P','P','P','P','P','U','.','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','U','P','W','W','W','W','W','W','P','U','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','.','U','P','W','P','P','P','P','P','P','W','P','U','.','.','.','.','.','.'],
  ['.','.','.','.','.','U','P','W','P','U','U','U','U','U','U','P','W','P','U','.','.','.','.','.'],
  ['.','.','.','.','U','P','W','P','U','U','P','P','P','P','U','U','P','W','P','U','.','.','.','.'],
  ['.','.','.','U','P','W','P','U','P','P','W','W','W','W','P','P','U','P','W','P','U','.','.','.'],
  ['.','.','U','P','W','P','U','U','P','W','C','C','C','C','W','P','U','U','P','W','P','U','.','.'],
  ['.','U','P','W','P','U','U','P','W','C','W','C','C','W','C','W','P','U','U','P','W','P','U','.'],
  ['U','P','W','P','U','U','U','P','W','C','W','C','C','W','C','W','P','U','U','U','P','W','P','U'],
  ['U','P','W','P','U','U','P','P','W','C','C','C','C','C','C','W','P','P','U','U','P','W','P','U'],
  ['.','U','P','W','P','U','P','P','P','W','C','C','C','C','W','P','P','P','U','P','W','P','U','.'],
  ['.','.','U','P','W','P','P','P','P','P','W','W','W','W','P','P','P','P','P','W','P','U','.','.'],
  ['.','.','.','U','P','W','P','P','P','P','P','P','P','P','P','P','P','P','W','P','U','.','.','.'],
  ['.','.','.','.','U','P','W','W','W','W','W','W','W','W','W','W','W','W','P','U','.','.','.','.'],
  ['.','.','.','.','.','U','P','P','P','P','P','P','P','P','P','P','P','P','U','.','.','.','.','.'],
  ['.','.','.','.','.','.','U','U','U','U','U','U','U','U','U','U','U','U','.','.','.','.','.','.']
];
```

#### Matrix 2: `BOSS_HARBINGER_PHANTOM` (Phantom Clone — Deep Purple 'U' in Center, $24 \times 16$)
Identical to `BOSS_HARBINGER_TRUE_MATRIX`, except rows 6–10 have the cyan `'C'` characters replaced with purple `'U'`.

---

### 9.5 Stage 50: Aeternum Star-Eater Core Matrices

#### Matrix 1: `BOSS_STAREATER_CORE` ($28 \times 20$ scaled to $56 \times 40$)
```typescript
export const BOSS_STAREATER_CORE_MATRIX: string[][] = [
  ['.','.','.','.','.','.','.','O','O','R','R','R','R','R','R','R','R','R','R','O','O','.','.','.','.','.','.','.'],
  ['.','.','.','.','.','O','O','Y','Y','O','R','R','R','R','R','R','R','R','O','Y','Y','O','O','.','.','.','.','.'],
  ['.','.','.','.','O','Y','W','W','Y','Y','O','R','R','R','R','R','R','O','Y','Y','W','W','Y','O','.','.','.','.'],
  ['.','.','.','O','Y','W','W','C','C','W','Y','O','R','R','R','R','O','Y','W','C','C','W','W','Y','O','.','.','.'],
  ['.','.','O','Y','W','C','C','C','C','C','W','Y','O','R','R','O','Y','W','C','C','C','C','C','W','Y','O','.','.'],
  ['.','O','Y','W','C','C','U','U','U','U','C','C','W','Y','Y','W','C','C','U','U','U','U','C','C','W','Y','O','.'],
  ['O','Y','W','C','C','U','U','P','P','U','U','C','C','W','W','C','C','U','U','P','P','U','U','C','C','W','Y','O'],
  ['O','Y','W','C','U','U','P','W','W','P','U','U','C','W','W','C','U','U','P','W','W','P','U','U','C','W','Y','O'],
  ['R','O','Y','W','U','P','W','W','W','W','P','U','W','R','R','W','U','P','W','W','W','W','P','U','W','Y','O','R'],
  ['R','R','O','Y','U','P','W','W','D','W','P','U','W','D','D','W','U','P','W','D','W','W','P','U','Y','O','R','R'],
  ['R','R','O','Y','U','P','W','D','D','D','P','U','W','D','D','W','U','P','D','D','D','W','P','U','Y','O','R','R'],
  ['R','O','Y','W','U','P','W','W','D','W','P','U','W','R','R','W','U','P','W','D','W','W','P','U','W','Y','O','R'],
  ['O','Y','W','C','U','U','P','W','W','P','U','U','C','W','W','C','U','U','P','W','W','P','U','U','C','W','Y','O'],
  ['O','Y','W','C','C','U','U','P','P','U','U','C','C','W','W','C','C','U','U','P','P','U','U','C','C','W','Y','O'],
  ['.','O','Y','W','C','C','U','U','U','U','C','C','W','Y','Y','W','C','C','U','U','U','U','C','C','W','Y','O','.'],
  ['.','.','O','Y','W','C','C','C','C','C','W','Y','O','R','R','O','Y','W','C','C','C','C','C','W','Y','O','.','.'],
  ['.','.','.','O','Y','W','W','C','C','W','Y','O','R','R','R','R','O','Y','W','C','C','W','W','Y','O','.','.','.'],
  ['.','.','.','.','O','Y','W','W','Y','Y','O','R','R','R','R','R','R','O','Y','Y','W','W','Y','O','.','.','.','.'],
  ['.','.','.','.','.','O','O','Y','Y','O','R','R','R','R','R','R','R','R','O','Y','Y','O','O','.','.','.','.','.'],
  ['.','.','.','.','.','.','.','O','O','R','R','R','R','R','R','R','R','R','R','O','O','.','.','.','.','.','.','.']
];
```

#### Matrix 2: `BOSS_ORBITAL_SATELLITE` ($12 \times 12$)
```typescript
export const BOSS_ORBITAL_SATELLITE_MATRIX: string[][] = [
  ['.','.','.','C','C','W','W','C','C','.','.','.'],
  ['.','.','C','C','W','W','W','W','C','C','.','.'],
  ['.','C','C','W','W','C','C','W','W','C','C','.'],
  ['C','C','W','W','C','N','N','C','W','W','C','C'],
  ['C','W','W','C','N','W','W','N','C','W','W','C'],
  ['W','W','C','N','W','Y','Y','W','N','C','W','W'],
  ['W','W','C','N','W','Y','Y','W','N','C','W','W'],
  ['C','W','W','C','N','W','W','N','C','W','W','C'],
  ['C','C','W','W','C','N','N','C','W','W','C','C'],
  ['.','C','C','W','W','C','C','W','W','C','C','.'],
  ['.','.','C','C','W','W','W','W','C','C','.','.'],
  ['.','.','.','C','C','W','W','C','C','.','.','.']
];
```

---

## 10. Summary & Recommended Implementation Roadmap

1. **File Structure Proposal**:
   - `src/core/boss/types.ts`: Type definitions (`BossPhaseId`, `IBossEntity`, `BossProjectileData`).
   - `src/core/boss/BaseBoss.ts`: Abstract base class handling timers, hitboxes, invulnerability, and sprite dispatch.
   - `src/core/boss/BossManager.ts`: Master boss lifecycle coordinator, collision delegator, and zero-GC pooling manager.
   - `src/core/boss/encounters/`:
     - `CyberDreadnought.ts` (Stage 10)
     - `DimensionalLeviathan.ts` (Stage 20)
     - `NaniteColossus.ts` (Stage 30)
     - `PsionicHarbinger.ts` (Stage 40)
     - `AeternumCore.ts` (Stage 50)
   - `src/renderer/SpriteRenderer.ts`: Add registration for the 10 procedural boss matrices.
2. **Deterministic Verification**:
   - Unit tests covering each boss's phase transitions, damage thresholds, zero-allocation pooling invariants, and clean teardown.
   - 0 heap allocations during active projectile loops verified by test suites.
