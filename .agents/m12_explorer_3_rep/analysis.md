# Milestone 12 Test Infrastructure, Verification & Regression Analysis: 5 Epic Boss Encounters

## Executive Summary

This investigation establishes the comprehensive testing infrastructure, test suite blueprints, memory invariants, and regression prevention strategy for **Milestone 12: 5 Epic Multi-Phase Boss Encounters** in the Galaga Arcade Web Game.

The current project baseline is certified with **36 test files and 764 passing unit/adversarial tests** across Milestones 1–11. Milestone 12 introduces five monumental boss battles at Stages 10, 20, 30, 40, and 50:
1. **Stage 10: Cyber Dreadnought (사이버 전함)** — Twin turrets, escort drones, exposed core, rotating spiral rings.
2. **Stage 20: Dimensional Leviathan (차원수 레비아탄)** — Materialized/Void phase-shift, gravitational tears, black-hole suction vortex, radial shockwaves.
3. **Stage 30: Nanite Swarm Colossus (나노머신 거신)** — Voxel cluster, 4 mini-construct split, reassembly, nanite gray goo bullet dissolution.
4. **Stage 40: Psionic Shroud Harbinger (장막의 사자)** — 3-body phantom shell game, dive-bombs, telekinetic thruster stun wave, aimed psychic lances.
5. **Stage 50: Aeternum Star-Eater Core (항성 포식자 - 파이널 레이드)** — 4 orbital satellite generators, planetary shield, 60% canvas mega-beam sweep, dual counter-rotating bullet hell enrage, ramming pass, campaign victory.

This report formulates a complete testing blueprint spanning **8 dedicated Milestone 12 test suites (over 65 distinct test cases)**, verifies strict ObjectPool and zero-GC memory bounds, and maps every potential regression across the existing 764 tests with concrete prevention mechanisms.

---

## 1. Existing Test Infrastructure & Milestone Analysis

### 1.1 Test Runner & Environment Configuration (`vite.config.ts`, `package.json`)

- **Test Framework**: Vitest v3.0.5 running on Node.js runtime (`environment: 'node'`).
- **Execution Script**: `npm test` (`vitest run`).
- **Headless Node Environment Characteristics**:
  - No native browser DOM, `window`, `document`, or `HTMLCanvasElement`.
  - Global DOM mocks provided dynamically or mocked via `createMockCanvasContext()` and `createMockGameEnvironment()`.
  - Canvas 2D rendering methods (`arc`, `stroke`, `fill`, `fillRect`, `beginPath`, `drawImage`) must be fully mocked with `vi.fn()` spies.
  - `localStorage` is mocked or stubbed; tests handle `--localstorage-file` warnings defensively.

### 1.2 Previous Milestone Testing Patterns (M9, M10, M11)

An in-depth review of `tests/unit/difficulty.test.ts` (M9), `tests/unit/crisis.test.ts` (M10), `tests/unit/powerups.test.ts` (M11), and their adversarial counterparts (`m10_challenger_1_adversarial.test.ts`, `m11_fix2_challenger_2_adversarial.test.ts`) reveals key testing patterns:

| Milestone | Key Systems Tested | Pattern & Techniques | Critical Invariants Enforced |
|---|---|---|---|
| **M9** | 50-Round Scaling Engine, HUD Badges | Monotonicity checks across $s \in [1, 50]$, coin-change DP oracles for badges | Monotonic dive speed, decay of dive intervals, step-ladder concurrent divers [1..6], bullet speed [180..320] px/s |
| **M10** | 11 Stellaris Crisis Events | Mock game environments, lifecycle hooks (`onWarningStart`, `onActiveStart`, `onEnd`), simulated 100-stage runs | Gating: no crisis stages 1–10; guaranteed triggers on Stages 12, 25, 50; cooldown between crises; 0 state leaks |
| **M11** | Power-Up System & Invariant Fixes | Strict ObjectPool capacity (32), drop weight distributions, active duration timers (15s) | Zero-heap allocation under rapid saturation leasing (attempting 60 spawns), double-free & foreign object protection, 10k random endurance cycles |

### 1.3 Playwright E2E Test Suite (`tests/e2e/`)

- Configuration in `playwright.config.ts`: Cross-browser (Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari), 60 FPS loop tick detection, zero JS console errors.
- Tests in `tests/e2e/browser.test.ts` & `tests/e2e/gameplay.test.ts`:
  - Canvas element DOM attachment with $224 \times 288$ native / $448 \times 576$ buffer (3:4 aspect ratio).
  - Continuous game loop execution over 2.5s with zero uncaught exceptions or error events.
  - Frame delivery rate $\ge 5$ FPS under headless throttling.

---

## 2. Milestone 12 Comprehensive Test Suite Blueprint

Milestone 12 requires eight primary test suites organized into unit, integration, mathematical validation, and stress suites:

```
tests/unit/
├── boss_base.test.ts         # Suite 1: Base boss lifecycle, health scaling & state machine
├── boss_stage10.test.ts      # Suite 2: Stage 10 Cyber Dreadnought (Turrets, Core, Spiral)
├── boss_stage20.test.ts      # Suite 3: Stage 20 Dimensional Leviathan (Phase Shift, Gravity, Shockwave)
├── boss_stage30.test.ts      # Suite 4: Stage 30 Nanite Colossus (Split, Reassembly, Gray Goo)
├── boss_stage40.test.ts      # Suite 5: Stage 40 Psionic Harbinger (Phantom Clones, Stun Wave)
├── boss_stage50.test.ts      # Suite 6: Stage 50 Aeternum Core (Satellites, Beam, Enrage Hell)
├── boss_progression.test.ts  # Suite 7: Stage clear, victory flow & power-up rewards
└── boss_adversarial.test.ts  # Suite 8: Memory, ObjectPool bounds & 1,000-cycle endurance
```

---

### Suite 1: Base Boss Lifecycle, Health Scaling & State Transitions (`boss_base.test.ts`)

#### Objectives
Verify abstract `BaseBoss` contracts, discrete lifecycle phases (`INACTIVE` $\to$ `INTRO` $\to$ `PHASE_1` $\to$ `TRANSITION_1_2` $\to$ `PHASE_2` $\to$ `DEFEATED` $\to$ `STAGE_CLEAR`), monotonic HP scaling across stages 10–50, invulnerability windows, and zero-allocation resets.

#### Test Cases

1. **TC-B1-01: Discrete Lifecycle State Machine Transitions**
   - **Pre-condition**: Boss initialized at Stage 10.
   - **Step 1**: Initial state is `INACTIVE` (`active = false`).
   - **Step 2**: Call `spawn()`. Phase transitions to `INTRO` (`active = true`, `stateTimer = 0`).
   - **Step 3**: Simulate $\Delta t = 2.5\text{ s}$ entrance swoop. Phase transitions to `PHASE_1`.
   - **Step 4**: Apply damage reducing HP to threshold ($HP \le 50\%$). Phase transitions to `TRANSITION_1_2` (`invulnerableTimer = 1.5\text{ s}`).
   - **Step 5**: Advance time by $1.5\text{ s}$. Phase transitions to `PHASE_2`.
   - **Step 6**: Apply damage reducing HP to 0. Phase transitions to `DEFEATED` (`stateTimer = 0`).
   - **Step 7**: Advance time by $3.0\text{ s}$ explosion duration. Triggers `onBossDefeated` callback.

2. **TC-B1-02: Monotonic Health Scaling Across All 5 Bosses**
   - Assert max health values:
     $$\text{HP}_{10} = 80 < \text{HP}_{20} = 120 < \text{HP}_{30} = 150 < \text{HP}_{40} = 180 < \text{HP}_{50} = 300$$
   - Each boss must initialize with `health === maxHealth` and `shield >= 0`.

3. **TC-B1-03: Invulnerability Window Enforcement**
   - When `phase === 'INTRO'`, `isInvulnerable()` returns `true`. Direct call to `takeDamage(10)` deals 0 damage and returns `{ damageDealt: 0, destroyed: false }`.
   - When `phase === 'TRANSITION_1_2'`, `isInvulnerable()` returns `true`. `takeDamage(10)` deals 0 damage.
   - When `phase === 'PHASE_1'`, `isInvulnerable()` returns `false`. `takeDamage(10)` reduces HP by 10.

4. **TC-B1-04: Sub-Entity Damage Routing & Shield Absorption**
   - If boss has shields ($S > 0$), incoming damage depletes shield first:
     $$\text{damage} \to \Delta S = \min(S, D), \quad \Delta HP = \max(0, D - S)$$
   - Damage exceeding shield overflows into health.

5. **TC-B1-05: Clean Teardown & Reset**
   - Call `reset()` on an active mid-battle boss.
   - Assert `active === false`, `phase === 'INACTIVE'`, `health === maxHealth`, all active sub-entities deactivated, all active projectiles recycled to pool.

---

### Suite 2: Stage 10 Cyber Dreadnought (`boss_stage10.test.ts`)

#### Objectives
Verify turret health and damage absorption, twin laser targeting, escort drone figure-8 kinematics, core exposure transition, 4-arm rotating spiral rings, and precision railgun firing.

#### Test Cases

1. **TC-S10-01: Dual Turret Defense Matrix & Core Shielding**
   - **Setup**: Spawn Cyber Dreadnought (80 HP total). Left Turret: 15 HP, Right Turret: 15 HP.
   - **Assertion 1**: While both turrets are active, player missile hitting central chassis deals 50% damage or 0 damage (bulkhead shielding).
   - **Assertion 2**: Hit left turret directly: left turret takes full damage. At 15 damage, left turret `destroyed === true` and deactivates.
   - **Assertion 3**: When both Left and Right turrets are destroyed, boss immediately triggers Phase 2 transition regardless of remaining chassis HP.

2. **TC-S10-02: Turret Firing Cadence & Tracking Angle**
   - Advance time by $\Delta t = 1.4\text{ s}$.
   - Verify twin laser projectile emission at offsets $(-16, +8)$ and $(+16, +8)$ relative to boss center.
   - Set player position at $(160, 250)$. Assert turret tracking angle rotates toward player:
     $$\theta_{aim} = \text{atan2}(250 - 62, 160 - 96) \approx 71.2^\circ$$
     Clamped within $\pm 15^\circ$ of vertical ($90^\circ \pm 15^\circ$).

3. **TC-S10-03: Escort Drone Figure-8 Lissajous Kinematics**
   - Drones launch at $t = 2.0\text{ s}$ with 5 HP each.
   - Evaluate coordinates at $t = 1.0\text{ s}$ and $t = 2.0\text{ s}$ against parametric formulation:
     $$x_{drone}(t) = x_{boss} \pm (32 + 12\cos(2.0t)), \quad y_{drone}(t) = y_{boss} + 18 + 8\sin(4.0t)$$
   - Assert drone positions remain within canvas boundaries $X \in [10, 214]$ and $Y \in [40, 120]$.
   - Drone destruction triggers small explosion particle and removes drone from active list.

4. **TC-S10-04: Phase 2 Rotating Spiral Bullet Rings Mathematical Formulation**
   - Force transition to Phase 2 (Core Exposed). Central $12 \times 12\text{ px}$ core hitbox takes 100% true damage.
   - **Wave Emission**: Advance time by $\Delta t = 0.35\text{ s}$.
   - Assert exactly $M = 4$ bullets are leased from pool with speed $V_{spiral} = 140\text{ px/s}$.
   - Assert velocity vectors conform to:
     $$v_{ix} = 140 \cos\left(\theta_0 + i \frac{\pi}{2}\right), \quad v_{iy} = 140 \sin\left(\theta_0 + i \frac{\pi}{2}\right)$$
   - Advance time by $1.0\text{ s}$. Verify base angle has evolved by $\Delta\theta = 1.75\text{ rad}$.
   - At $t = 3.0\text{ s}$, assert rotation direction inverts ($\omega \to -1.75\text{ rad/s}$) after $0.4\text{ s}$ pause.

5. **TC-S10-05: Precision Railgun Target Acquisition**
   - At $t = 2.8\text{ s}$, boss core begins $0.6\text{ s}$ charge (railgun warning active).
   - At $t = 3.4\text{ s}$, fires high-speed projectile ($v = 260\text{ px/s}$) directly along unit vector:
     $$\vec{u} = \frac{\vec{p}_{player} - \vec{p}_{core}}{|\vec{p}_{player} - \vec{p}_{core}|}$$

---

### Suite 3: Stage 20 Dimensional Leviathan (`boss_stage20.test.ts`)

#### Objectives
Verify Materialized/Void phase-shift timing, complete projectile pass-through during Void Shroud, softened gravitational deflection of player bullets, black-hole suction vortex velocity math, and radial shockwave safe-sector gap collision.

#### Test Cases

1. **TC-S20-01: Phase-Shift Oscillation & Missiles Pass-Through**
   - **Cycle**: Materialized ($3.5\text{ s}$, $\alpha = 1.0$) $\to$ Dematerialized Void Shroud ($2.0\text{ s}$, $\alpha = 0.25$). Total period = $5.5\text{ s}$.
   - **Materialized Test ($t = 1.0\text{ s}$)**: Player fires bullet at boss hitbox $(x_{boss}, y_{boss})$. Collision registers; boss takes damage; bullet is recycled.
   - **Dematerialized Test ($t = 4.5\text{ s}$)**: Player fires bullet at boss hitbox. `isInvulnerable()` is true. Bullet passes completely through boss without registering collision, without decrementing boss HP, and without being recycled!

2. **TC-S20-02: Softened Gravitational Tear Deflection Math**
   - During Void Shroud, 2 tears exist at $\vec{p}_{tear1} = (60, 110)$ and $\vec{p}_{tear2} = (164, 110)$ with lifespan $6.0\text{ s}$.
   - Spawn player missile at $(65, 180)$ traveling upward ($v_y = -480, v_x = 0$).
   - Compute theoretical deflection acceleration:
     $$\vec{a}_{bullet} = \sum_{k=1}^{2} \frac{G_{tear} \cdot (\vec{p}_{tear, k} - \vec{p}_{bullet})}{\left(|\vec{p}_{tear, k} - \vec{p}_{bullet}|^2 + \epsilon^2\right)^{3/2}}$$
     with $G_{tear} = 320,000$, $\epsilon = 18$.
   - For tear 1 at $(60, 110)$: $\Delta x = 60 - 65 = -5$, $\Delta y = 110 - 180 = -70$.
   - $r^2 + \epsilon^2 = (-5)^2 + (-70)^2 + 18^2 = 25 + 4900 + 324 = 5249$. Denominator = $5249^{1.5} \approx 380,314$.
   - $a_x \approx \frac{320,000 \times (-5)}{380,314} \approx -4.21\text{ px/s}^2$.
   - Step bullet physics over $\Delta t = 0.1\text{ s}$. Assert $v_x < 0$ (bullet curved leftward toward gravity well).

3. **TC-S20-03: Black-Hole Gravity Suction Vortex Math (Phase 2)**
   - HP reduced to $\le 60$. Enters Phase 2.
   - Vortex centered at $x_{boss} = 112$. Player baseline $y_{player} = 250$.
   - Horizontal velocity modification:
     $$v_{suction} = \text{sign}(112 - x_{player}) \cdot \min\left(110, \frac{4500}{|112 - x_{player}| + 35}\right)$$
   - **Case A: Player at Left Flank ($x_p = 20$)**:
     $\Delta x = 92 > 0$. $v_{suction} = +1 \cdot \min(110, 4500 / 127) = +35.43\text{ px/s}$.
     When player holds right, $v_{eff} = 260 + 35.43 = 295.43\text{ px/s}$.
     When player holds left, $v_{eff} = -260 + 35.43 = -224.57\text{ px/s}$.
   - **Case B: Player at Right Flank ($x_p = 204$)**:
     $\Delta x = -92 < 0$. $v_{suction} = -35.43\text{ px/s}$ (pulling inward to the left).
   - **Case C: Player at Dead Center ($x_p = 112$)**:
     $\Delta x = 0 \implies v_{suction} = 0$.

4. **TC-S20-04: Radial Shockwave Expanding Ring & Safe-Sector Gap**
   - Shockwave expands at $v_{shock} = 110\text{ px/s}$, thickness $\delta = 6\text{ px}$.
   - Safe sector width $\Delta\theta_{safe} = 40^\circ$ ($0.70\text{ rad}$) at angle $\theta_{gap}(t)$.
   - At $t = 1.7\text{ s}$, radius $R = 187\text{ px}$, intersecting player baseline ($y = 250, y_{boss} = 60 \implies \Delta y = 190$).
   - **Scenario A (Inside Safe Gap)**: Place player at angle $\phi_p$ where $|\phi_p - \theta_{gap}| < 15^\circ$. Assert collision returns `false` (no damage).
   - **Scenario B (Outside Safe Gap)**: Place player at angle $\phi_p$ where $|\phi_p - \theta_{gap}| = 60^\circ > 20^\circ$. Assert collision returns `true` (player struck by shockwave).

---

### Suite 4: Stage 30 Nanite Swarm Colossus (`boss_stage30.test.ts`)

#### Objectives
Verify Phase 1 spread attacks, clean splitting into 4 autonomous Mini-Constructs at 50% HP, independent Lissajous movement, 4-construct elimination transition, and Phase 2 Gray Goo bullet dissolution zones.

#### Test Cases

1. **TC-S30-01: Phase 1 Colossus Salvos & Damage Accumulation**
   - Colossus HP = 150. Emits 3-way spread salvos ($v = 180\text{ px/s}$ at $-90^\circ \pm 18^\circ$).
   - Deal 75 damage. Assert HP reaches exactly 75 and triggers `TRANSITION_1_2` splitting sequence.

2. **TC-S30-02: 4 Mini-Construct Splitting & Lissajous Trajectories**
   - At HP $\le 75$, main cluster deconstructs and spawns 4 Mini-Constructs:
     - Construct Alpha (50, 45), Beta (174, 45), Gamma (75, 90), Delta (149, 90).
   - Each construct has 18 HP ($18 \times 4 = 72\text{ HP}$) and dimensions $16 \times 16\text{ px}$.
   - Verify Lissajous movement:
     $$x_k(t) = X_{anchor, k} + 25\sin(\omega_k t + \phi_k), \quad y_k(t) = Y_{anchor, k} + 10\cos(2\omega_k t)$$
   - Assert all 4 positions remain within bounds $X \in [10, 214], Y \in [30, 140]$.

3. **TC-S30-03: Independent Sub-Entity Elimination Tracking**
   - Deal 18 damage to Construct Alpha: Alpha is destroyed, emits metallic sparks, `active === false`.
   - Remaining active construct count is 3. Phase remains `PHASE_1_SPLIT`.
   - Deal 18 damage to Beta, Gamma, and Delta sequentially.
   - Upon destroying the 4th construct (remaining count = 0), transition to Phase 2 Reassembly immediately triggers.

4. **TC-S30-04: Overclocked Titan Reassembly (Phase 2)**
   - Reassembly window = $2.0\text{ s}$ (`isInvulnerable() === true`).
   - Boss HP re-initialized to remaining 75 HP down to 0.
   - Fires downward nanite lances ($v = 240\text{ px/s}$).

5. **TC-S30-05: Nanite Gray Goo Bullet Dissolution Zone Invariant**
   - Titan deploys 2 Gray Goo clouds with radius $R_{cloud} = 22\text{ px}$ at $(65, 160)$ and $(155, 160)$. Lifespan = $6.0\text{ s}$.
   - **Dissolution Test**: Player fires bullet directly upward from $(65, 230)$.
     When bullet reaches $y = 175$ ($\text{dist} = |160 - 175| = 15\text{ px} < 22\text{ px}$):
     - Bullet is instantly dissolved: `bullet.active` becomes `false`.
     - Bullet is returned to `ObjectPool<Bullet>` via `recycle()`.
     - `BulletManager.getPlayerBulletCount()` decrements by 1.
     - Boss takes 0 damage.
     - 4 silver sparkle particles spawned at $(65, 175)$.
   - **Clean Passage Test**: Player fires bullet from $x = 110$ (between the two clouds, distance to nearest cloud = $|110 - 65| = 45\text{ px} > 22\text{ px}$).
     Bullet passes through unobstructed and hits Titan core for damage.

---

### Suite 5: Stage 40 Psionic Shroud Harbinger (`boss_stage40.test.ts`)

#### Objectives
Verify 3-body phantom formation, subtle visual tell (cyan vs purple), phantom hit immunity vs core vulnerability, shell game rotation shuffle, Phase 2 telekinetic stun pulse, and 75% thruster penalty math.

#### Test Cases

1. **TC-S40-01: 3-Body Formation & Visual Tell Differentiation**
   - Harbinger spawns 1 True Core + 2 Illusory Phantom Clones at slots:
     $$\text{Slot } 0: (48, 50), \quad \text{Slot } 1: (112, 50), \quad \text{Slot } 2: (176, 50)$$
   - Assert exactly 1 entity has `isTrueCore === true` with cyan third eye (`#00FFFF`), and exactly 2 have `isTrueCore === false` with purple center (`#550088`).

2. **TC-S40-02: Phantom Hit Immunity vs True Core Vulnerability**
   - **Phantom Hit**: Player missile collides with Slot holding Phantom.
     - Deals 0 damage. Boss HP does not change.
     - Translucent purple ripple effect triggered.
   - **True Core Hit**: Player missile collides with Slot holding True Core.
     - Deals damage, decrementing boss HP (180 base).
     - Standard hit sound and white hit flash triggered.

3. **TC-S40-03: Coordinated Dive-Bombing & Shell Game Shuffle**
   - All 3 units dive simultaneously along Cubic Bézier paths over $6.0\text{ s}$.
   - At end of dive, all 3 units return to top $(112, 45)$ and perform $1.5\text{ s}$ rotation swap.
   - After shuffle, slot assignments are shuffled. Total entities remain 1 True Core + 2 Phantoms.

4. **TC-S40-04: Phase 2 Telekinetic Stun Wave Propagation**
   - HP reduced to $\le 90$. Phantoms shatter. Enters Phase 2.
   - Harbinger channels energy for $0.8\text{ s}$, then releases stun wave traveling down at $v_{wave} = 220\text{ px/s}$.
   - Stun wave spans full screen width $X \in [0, 224]$, height $8\text{ px}$.
   - Wave hits player at $y_{player} = 250$ when $t = (250 - 50) / 220 \approx 0.91\text{ s}$.

5. **TC-S40-05: Player Thruster Disruption Speed & Firing Penalty**
   - Upon wave collision, player enters Stun state for $\tau_{stun} = 1.25\text{ s}$.
   - Player speed drops by 75%:
     $$v_{effective} = 0.25 \times 260\text{ px/s} = 65\text{ px/s}$$
   - Simulate input `moveLeft = true` for $\Delta t = 0.5\text{ s}$.
   - Assert $\Delta x = 65 \times 0.5 = 32.5\text{ px}$ (rather than normal $130\text{ px}$).
   - Advance time past $1.25\text{ s}$. Assert stun expires and player velocity restores to $260\text{ px/s}$.

---

### Suite 6: Stage 50 Aeternum Star-Eater Core (`boss_stage50.test.ts`)

#### Objectives
Verify 3 distinct phases ($100 \to 100 \to 100\text{ HP}$), Phase 1 4-satellite generator shield invulnerability, Phase 2 60% canvas mega-beam sweep and safe corridor evasion, Phase 3 terminal enrage bullet hell lattice, desperate ramming pass, and campaign victory.

#### Test Cases

1. **TC-S50-01: Phase 1 Planetary Shield & 4 Satellite Generators**
   - Core has 300 HP total, shielded by hexagonal barrier ($R = 38\text{ px}$).
   - 4 Satellites orbit core along ellipse:
     $$x_k(t) = 112 + 46\cos(1.1t + k\pi/2), \quad y_k(t) = 52 + 22\sin(1.1t + k\pi/2)$$
   - Each satellite has 25 HP ($4 \times 25 = 100\text{ HP}$).
   - Direct missiles hitting core barrier deal 0 damage.
   - Destroying Satellite 1 reduces shield opacity from 0.8 to 0.6; destroying Satellite 2 to 0.4; Satellite 3 to 0.2; Satellite 4 to 0 (shield shatters, white flash).

2. **TC-S50-02: Phase 2 Mega-Beam Cannon 60% Canvas Width & Evasion Corridor**
   - Beam width $W_{beam} = 0.60 \times 224 = 134.4\text{ px}$ (hitbox width $134\text{ px}$).
   - **Charge Phase ($1.6\text{ s}$)**: Thin red warning tracer ($2\text{ px}$) rendered at beam center $X_{beam}$.
   - **Firing Phase ($1.8\text{ s}$)**: Beam active from $y = 70$ to $y = 288$. Sweeps laterally by $45\text{ px}$ ($v_{sweep} = 30\text{ px/s}$).
   - **Fatal Collision Test**: Player at $x = 112$ (inside beam corridor $[X_{beam} - 67, X_{beam} + 67]$) suffers fatal damage.
   - **Safe Flank Test**: Player moves to left canvas margin $x = 25 \in [0, 45]$. Beam sweeps across $[75, 209]$. Assert player takes 0 damage!

3. **TC-S50-03: Phase 3 Hyper-Critical Reactor Meltdown Transition**
   - Core HP reaches $\le 100$ (Phase 2 depleted).
   - $2.0\text{ s}$ invulnerability window. Starfield speed accelerates to $4.0\times$ warp streaks. Music tempo doubles.

4. **TC-S50-04: Phase 3 Dual Counter-Rotating Bullet Hell Lattice**
   - Dual spiral cannons:
     - Cannon Alpha (Clockwise): $M = 6$ arms, $\omega = +2.2\text{ rad/s}$, crimson bullets ($v = 130\text{ px/s}$).
     - Cannon Beta (Counter-Clockwise): $M = 6$ arms, $\omega = -2.2\text{ rad/s}$, amber bullets ($v = 130\text{ px/s}$).
   - Emits a dual wave every $0.25\text{ s}$ (12 bullets per wave).
   - Over 4 frames ($1.0\text{ s}$), creates 48 active bullets on screen forming interlocking geometric diamonds.
   - Assert all 48 bullets are leased from `BossProjectilePool` without exceeding pool capacity or throwing.

5. **TC-S50-05: Desperate Swarm Ramming Pass & Final Victory**
   - Every $5.0\text{ s}$, Core swoops along Cubic Bézier curve ($P_0=(112,52), P_1=(20,160), P_2=(204,250), P_3=(112,52)$) across player baseline at $v = 260\text{ px/s}$.
   - When HP reaches 0:
     - All active boss bullets instantly convert to bonus star particles.
     - Cascading explosion sequence ($3.5\text{ s}$, 120+ particles).
     - Full screen white flash ($150\text{ ms}$).
     - Score awarded = +50,000 pts.
     - Game triggers Campaign Victory screen (`state === 'VICTORY'` or completed game loop).

---

### Suite 7: Stage Clear & Progression Verification (`boss_progression.test.ts`)

#### Objectives
Verify score awards, rare power-up drops, clean stage transitions, and stage increment across all 5 milestone stages (10, 20, 30, 40, 50).

#### Test Cases

| Stage | Expected Boss Defeated | Score Bonus Awarded | Power-Up Drop Generated | Next Stage Target | Tier After Progression |
|---|---|---|---|---|---|
| **10** | Cyber Dreadnought | +10,000 pts | Guaranteed Rare (Shield or Rapid) | Stage 11 | ELITE |
| **20** | Dimensional Leviathan | +20,000 pts | Guaranteed Rare (Shield or Rapid) | Stage 21 | ELITE |
| **30** | Nanite Swarm Colossus | +30,000 pts | Guaranteed Rare (Scatter or Booster) | Stage 31 | DREADNOUGHT |
| **40** | Psionic Shroud Harbinger | +40,000 pts | Guaranteed Rare (EMP or Shield) | Stage 41 | DREADNOUGHT |
| **50** | Aeternum Star-Eater Core | +50,000 pts | None (Campaign Concluded) | Victory Screen | CAMPAIGN COMPLETE |

1. **TC-P-01: Milestone Score Accumulation & Extra Life Thresholds**
   - Defeating Stage 10 boss with base score 15,000: score becomes $15,000 + 10,000 = 25,000$.
   - Crosses 20,000 extra life threshold $\implies$ player lives increment by 1.
2. **TC-P-02: Clean Projectile Neutralization on Stage Clear**
   - Active enemy bullets on screen at moment of boss defeat are immediately neutralized and recycled back to pool (`activeEnemyBulletCount === 0`).
3. **TC-P-03: Stage Progression Continuity**
   - Advancing past Stage 10 loads Stage 11 difficulty configuration:
     $$\text{tier} = \text{ELITE}, \quad \text{diveSpeedMult} \ge 1.25, \quad \text{bulletSpeed} \ge 220\text{ px/s}$$

---

### Suite 8: Memory & ObjectPool Bounds Verification (`boss_adversarial.test.ts`)

#### Objectives
Verify upper bound capacity clamping, zero heap allocation under rapid saturation leasing, O(1) swap-and-pop release integrity, double-free and foreign object safety, and 1,000-cycle endurance stress.

#### Test Cases

1. **TC-M-01: Strict Pool Capacity Upper Bound Clamping**
   - Boss projectile pool configured with:
     $$\text{initialSize} = 64, \quad \text{maxSize} = 160, \quad \text{autoExpand} = \text{true}$$
   - Attempt to lease 240 projectiles in a single frame (simulating Stage 50 enrage overload).
   - Assert:
     - Exactly 160 projectiles successfully acquired.
     - Requests 161 to 240 return `null` without throwing exceptions or crashing.
     - Pool capacity strictly clamped at 160: `pool.getCapacity() === 160`, `pool.getMaxSize() === 160`, `pool.isFull() === true`.
     - Zero additional heap arrays allocated.

2. **TC-M-02: Swap-and-Pop O(1) Integrity & Active Count Invariant**
   - Lease 100 projectiles, then release them in random non-sequential order.
   - Continuous invariant assertions during all releases:
     $$0 \le \text{activeCount} \le \text{storage.length} \le 160$$
   - All active entities remain unique references with no duplicates or undefined slots.

3. **TC-M-03: Defensive Double-Free & Foreign Object Protection**
   - Releasing an already-released projectile returns `false` and does NOT decrement `activeCount`.
   - Releasing an unmanaged foreign object returns `false` without modifying pool state.
   - Releasing `null` or `undefined` returns `false` defensively.

4. **TC-M-04: 1,000-Cycle Rapid Spawn & Defeat Endurance Stress**
   - Execute 1,000 complete lifecycle cycles:
     `spawnBoss(stage)` $\to$ simulate 60 frames $\to$ deal fatal damage $\to$ simulate explosion $\to$ `clear()`.
   - Assert at end of every cycle:
     - `bossProjectilePool.getActiveCount() === 0`
     - `bulletManager.getEnemyBulletCount() === 0`
     - Storage buffer length remains constant (zero memory leak).

---

## 3. Potential Regression Analysis & Invariant Defense Matrix

The existing 764 Vitest tests across 36 files enforce strict behavioral, mathematical, and structural invariants. The table below details every potential regression risk introduced by Milestone 12 and the exact prevention strategy:

| # | Existing Test File | Tests | Key Invariants Enforced | Potential M12 Regression Risk | Prevention Mechanism |
|---|---|---|---|---|---|
| 1 | `tests/unit/core.test.ts` | 41 | `game.state` transitions (`TITLE` $\to$ `STAGE_INTRO` $\to$ `PLAYING`), fixed 60fps loop, canvas render without throwing | If `game.state` transitions to `'BOSS_BATTLE'` instead of `'PLAYING'`, tests expecting `'PLAYING'` on Stage 1 will fail | Keep `state === 'PLAYING'` as the top-level GameState, or gate boss state exclusively to stages 10, 20, 30, 40, 50 while Stage 1 unconditionally transitions to `'PLAYING'`. |
| 2 | `tests/unit/state.test.ts` | 14 | Local `GameStateMachine` transitions (`TITLE`, `STAGE_INTRO`, `PLAYING`, `CHALLENGING_STAGE`, `STAGE_CLEAR`, `GAME_OVER`, `PAUSED`) | None directly (uses local mock), but global `GameState` type contract must remain backward-compatible | Extend `GameState` union with `'BOSS_BATTLE'` or retain `'PLAYING'` with `BossManager` active flag. |
| 3 | `tests/unit/difficulty.test.ts` & `m9_challenger_1/2` | 73 | `DifficultyCalculator`: monotonic dive speed [1.0..1.8], dive interval [0.8..3.5], bullet speed [180..320], challenging stages ($s \ge 3 \land s \% 4 == 3$) | Adding boss stages must not mutate or alter standard calculations for normal stages | Keep all existing static methods of `DifficultyCalculator` 100% pure and untouched. Add separate `isBossStage(s): boolean` and `getBossConfig(s)` helpers. |
| 4 | `tests/unit/crisis.test.ts` & `m10_challenger_1/2` | 75 | Crises restricted to stages > 10; guaranteed triggers on Stages 12, 25, 50; cooldown between crises; zero state leaks | If Stage 50 is treated as a pure boss stage and disables `crisisEventManager.evaluateStageTrigger(50)`, `m10_challenger_1` line 258 WILL FAIL | Ensure `CrisisEventManager.evaluateStageTrigger(50)` remains fully functional and returns a valid crisis event. Allow crisis visual/gameplay modifiers to either harmonize with Stage 50 or execute without interference. |
| 5 | `tests/unit/powerups.test.ts` & `m11_challenger_1/2` & `m11_fix2_challenger_2` | 70 | `PowerUpManager` pool strictly 32 capacity, zero-heap expansion under 60 spawns, 5 powerup types, 15s durations | If boss parts spawn unbounded drops or expand powerup pool beyond 32, invariant tests will fail | All boss part drops must route through `PowerUpManager.spawnDrop()` or `spawnPowerUp()` which strictly clamps to max capacity 32 and returns null on saturation. |
| 6 | `tests/unit/enemy.test.ts` & `m4_challenger_1/2` | 89 | Normal enemies: Zako, Goei, Boss Galaga; 40-alien formation; dive swoop Bézier curves; tractor beam | If `FormationManager.spawnStage()` is bypassed naively on non-boss stages, formation tests will fail | Check `isBossStage(stage)` strictly inside `Game.ts: updateStageIntro` and `FormationManager`: only stages 10, 20, 30, 40, 50 suppress normal formation spawning. |
| 7 | `tests/unit/tractor_beam.test.ts` & `m5_challenger_1/2` | 67 | Boss Galaga tractor beam cone emission, player capture, escort fighter docking, rescue mechanics | Collision checks for Boss Galaga tractor beam must not conflict with M12 Boss entities | Keep `TractorBeam` bound to classic `EnemyType.BOSS` (Boss Galaga). M12 Epic Bosses use independent hazard systems. |
| 8 | `tests/unit/player.test.ts` & `m3_challenger_1/2` | 68 | Player horizontal velocity (260 px/s), screen clamping [16, 208], single/dual firing limits (2 / 4 bullets) | M12 Leviathan vortex suction and Harbinger stun wave must not permanently corrupt player base velocity | Suction and stun must be applied as transient velocity modifiers ($v_{effective} = 0.25 \times v_{base}$ or $v_x + v_{suction}$) without modifying the player's underlying `SPEED = 260` constant. |
| 9 | `tests/unit/score.test.ts` & `m7_challenger_1/2` | 47 | Score calculation, high score localStorage persistence, extra life thresholds at 20,000 and 70,000 | Boss bonus points (10k–50k) could cause unexpected score overflows if negative or non-integer | Pass positive integer constants directly to `ScoreManager.addScore(points)`. |
| 10 | `tests/unit/hud_screens.test.ts` | 36 | HUD rendering, greedy badge decomposition for stages 1–50, screen text centering | Boss health bar rendering on HUD must not overlap or corrupt stage badges or reserve life icons | Position boss health bar at top center ($X \in [56, 168], Y \in [14, 20]$), well away from top score ($Y=4$) and bottom badges ($Y=272$). |
| 11 | `tests/unit/audio_particles.test.ts` & `m6_challenger_1/2` | 68 | Web Audio API node creation, sound synthesis without audio files, ParticleSystem pool capacity (250) | Boss explosions spawning 120+ particles could exceed particle pool capacity and crash | ParticleSystem must use bounded leasing: if pool is exhausted, particle spawn drops gracefully without throwing. |
| 12 | `tests/unit/math.test.ts` | 37 | Vector2 arithmetic, Bézier cubic spline evaluation, AABB / Circle collision detection | Boss custom math functions must not alter core `math/` module contracts | Keep all math primitives pure. Implement boss-specific formulas (spiral angles, gravitational pull, safe sectors) as pure functions or methods within boss classes. |
| 13 | `tests/unit/viewport.test.ts` | 7 | ScreenManager letterbox/pillarbox coordinate transformations | None | Ensure Canvas rendering respects virtual $224 \times 288$ coordinates. |
| 14 | `tests/unit/vercel_build_audit.test.ts` | 11 | Static build output to `dist/`, zero-config Vercel deployment, TypeScript strict compilation | Type errors in new boss modules could break `tsc --noEmit` | Strict type checking on all M12 boss interfaces with zero `any` leaks. |

---

## 4. Verification & Independent Execution Strategy

### 4.1 Vitest Unit & Adversarial Execution

1. **Full Baseline Verification**:
   ```bash
   npm test
   # Expected output: 36 test files passed, 764 tests passed (0 failures)
   ```

2. **Milestone 12 Test Execution**:
   ```bash
   npx vitest run tests/unit/boss_*.test.ts
   # Target: 8 new test suites, 65+ new tests passing with 100% success rate
   ```

3. **Cumulative Regression Check**:
   ```bash
   npm test
   # Expected output: 44 test files passed, 829+ tests passed (0 failures)
   ```

4. **TypeScript Strict Typecheck**:
   ```bash
   npm run typecheck
   # Target: 0 TypeScript diagnostic errors
   ```

### 4.2 Playwright Headless Browser E2E Execution

1. **Local Preview Build**:
   ```bash
   npm run build
   ```

2. **Run E2E Browser Suite**:
   ```bash
   npx playwright test tests/e2e/browser.test.ts
   # Verifies: 0 runtime JavaScript exceptions, canvas attached, 60 FPS tick
   ```

3. **Stage Skip / Cheat Bot Validation**:
   - Using `window.__GALAGA_CHEAT__.skipToStage(10)` $\to$ verify Stage 10 Cyber Dreadnought spawns with 0 console errors.
   - Using `window.__GALAGA_CHEAT__.skipToStage(20)` $\to$ verify Stage 20 Dimensional Leviathan.
   - Using `window.__GALAGA_CHEAT__.skipToStage(30)` $\to$ verify Stage 30 Nanite Colossus.
   - Using `window.__GALAGA_CHEAT__.skipToStage(40)` $\to$ verify Stage 40 Psionic Harbinger.
   - Using `window.__GALAGA_CHEAT__.skipToStage(50)` $\to$ verify Stage 50 Aeternum Core.

---

## 5. Summary & Hand-off Recommendation

The testing infrastructure and regression analysis for Milestone 12 is fully formulated. The core findings are:
1. **Zero-GC Invariant**: All boss bullets and sub-entities must reside in dedicated, pre-allocated `ObjectPool` structures strictly capped (e.g. 160 max projectiles) to prevent runaway memory leaks.
2. **Backward Compatibility**: `CrisisEventManager.evaluateStageTrigger(50)` must continue to return non-null, and `DifficultyCalculator` formulas must remain strictly untouched.
3. **Headless Node Compatibility**: All boss rendering and audio hooks must be fully decoupled and safe to execute in Node.js headless test environments with standard mocks.
4. **Complete Suite Blueprint**: 8 comprehensive test suites spanning 65+ unit, mathematical, state, and endurance test cases are specified and ready for implementation.
