# Milestone 13: Test Infrastructure & Verification Strategy — Comprehensive Analysis

> **Author**: `m13_explorer_3` (Test Infrastructure & Verification Strategy Explorer)  
> **Date**: 2026-09-04  
> **Working Directory**: `/Users/user/teamwork_projects/galaga_game/.agents/m13_explorer_3`  
> **Scope**: Test Suite Audit (46 files, 863 tests), Milestone 13 Test Suite Formulation (Allies Drones, Special Moves, Zero-GC Invariants), Regression Risk Analysis, and Verification Blueprint.

---

## 1. Executive Summary

Milestone 13 expands the Galaga Ultimate Arcade Engine with two game-changing combat subsystems:
1. **Allies Support Subsystem (3 Tactical Drones)**:
   - **Escort Wingman Drone (`DRONE_ESCORT`)**: Orbits player ship at fixed radius $R = 20\text{px}$, autofiring forward plasma bolts ($v_y = -400\text{ px/s}$) at fixed cadence ($0.4\text{s}$ interval).
   - **Kinetic Aegis Drone (`DRONE_AEGIS`)**: Orbits or tethers with opposite phase, periodically generating repair pulses ($6.0\text{s}$ interval) that restore the player's Kinetic Deflector barrier (`shieldHp = 1`) without overflow.
   - **Bomber Support Wing Drone (`DRONE_BOMBER`)**: Sweeps across the top screen during intense swarms or boss battles ($v_{\text{sweep}} = 120\text{ px/s}$), dropping 6 cluster bombs in a parabolic trajectory with a $16\text{px}$ blast radius AoE.
2. **Special Moves Subsystem (3 Game-Changing Moves)**:
   - **Meter Accumulation**: $[0, 100]$ energy gauge building via enemy kills and energy spark pickups; triggered via `KeyX` / touch button with single-pulse consumption; enforced cooldown ($5.0\text{s}$).
   - **Nova Barrage (`NOVA_BARRAGE`)**: Full-screen target acquisition scanning all living enemies; allocates lethal damage to normal aliens and massive burst damage ($25\text{ HP}$) to stage bosses.
   - **Chrono Freeze (`CHRONO_FREEZE`)**: Absolute $3.0\text{s}$ time freeze invariant where enemy $\Delta t = 0$ (formation, diving, bullets, bosses frozen) while player $\Delta t = \text{normal}$ (uninhibited steering, firing, projectile flight, and hit resolution).
   - **Dimensional Warp Ram (`WARP_RAM`)**: Absolute invulnerability window ($1.0\text{s}$); hyper-speed vertical ram ($-600\text{ px/s}$); swept-lane collision clearing the vertical column; safe re-entry with a $0.5\text{s}$ grace period.
3. **Zero-GC Invariant**:
   - Zero dynamic heap allocation in the 60 FPS loop across active drone flight, autofire, cluster bombing, and repeated special move cycles via pre-allocated bounded pools.

All new functionality must integrate seamlessly into `Game.ts`, `Player.ts`, `Bullet.ts`, and `FormationManager.ts` while maintaining **100% pass rate across the existing 46 test files and 863 tests**.

---

## 2. Audit of Existing Test Infrastructure (46 Files, 863 Tests)

The test suite is driven by **Vitest v3.2.7** in a simulated Node environment with mock DOM and Canvas 2D contexts. The full test execution completes in **~1.99s**, demonstrating exceptional determinism and execution speed.

### Test Domain Breakdown

| Category | File Count | Test Count | Key Coverage & System Contracts |
|---|---|---|---|
| **Math & Physics Primitives** | 1 | 37 | Vector2 algebra, Cubic Bézier splines $B(t)$, velocity tangents $\theta(t)$, AABB / Circle collision. |
| **Core Engine & GameLoop** | 4 | 77 | 60 FPS fixed-timestep accumulator, spiral-of-death clamp ($\le 100\text{ms}$), ObjectPool O(1) swap-and-pop, ScreenManager 224x288 letterbox, Starfield 3-layer parallax, InputHandler discrete pulse consumption, Game master coordinator. |
| **Entities & Combat Mechanics** | 4 | 119 | Player 7-state FSM, 1D steering ($260\text{ px/s}$), missile quotas (2 single / 4 dual), dual docking descent ($120\text{ px/s}$), asymmetrical partial destruction, $3.0\text{s}$ invulnerability; Enemy hierarchy (Zako, Goei, Boss Galaga); Tractor beam cone geometry ($16\text{px} \to 64\text{px}$); Procedural Web Audio synthesis & particle explosions. |
| **Scoring, Difficulty & HUD** | 3 | 80 | LocalStorage high score persistence, extra life thresholds (20k/70k); 50-round scaling engine (Classic/Elite/Dreadnought); HUD header, footer, 6-tier stage badges, screen overlays. |
| **Crisis Events & Power-Ups** | 3 | 79 | 11 Stellaris Crisis Events (Contingency, Unbidden, Prethoryn, Shield Overload, Singularity Shift, Tempest, Nanite Storm, Shroud Incursion, Hive Fleet, Star-Eater, Chrono Anomaly); 5 PowerUp types, drop tables, descent kinematics, collection hitboxes, pool capacity bounded strictly to 32 (10,000-cycle stress tested). |
| **Multi-Phase Boss Fights** | 6 | 53 | Stages 10 (Cyber Dreadnought), 20 (Dimensional Leviathan), 30 (Nanite Colossus), 40 (Psionic Harbinger), 50 (Aeternum Star-Eater Core); BaseBoss FSM, multi-phase transitions, health bars, attack hazards. |
| **Adversarial & Stress Suites** | 25 | 418 | Challenger, reviewer, and stress suites covering edge cases, race conditions, rapid key rollovers, saturation leasing, and Vercel build audits. |
| **Total Baseline** | **46** | **863** | **100% Passing (0 failures, 0 flakiness)** |

---

## 3. Milestone 13 Test Suite Architecture & Formulation

To achieve exhaustive coverage and bulletproof verification of Milestone 13, four specialized test suites must be created in `tests/unit/`:

```
tests/unit/
├── m13_allies_drones.test.ts          # Drone lifecycle, kinematics, autofire, aegis repair, bomber carpet-bomb
├── m13_special_moves.test.ts          # Meter accumulation, input triggers, cooldown, Nova Barrage, Chrono Freeze, Warp Ram
├── m13_zerogc_stress.test.ts          # Zero-GC invariant verification, pool clamping, 10k-tick gameplay stress
└── m13_regression_guard.test.ts       # Full integration & regression guards against core, player, boss, and crisis
```

---

### 3.1 Allies Support Subsystem Test Formulation (`m13_allies_drones.test.ts`)

#### Suite A: AlliesManager & Drone Lifecycle
- **Test 1: Initial Inactive State**:
  - `AlliesManager` initializes with exactly 3 pre-allocated drone entities (`ESCORT`, `AEGIS`, `BOMBER`).
  - All drones initialize with `active === false`, `x === 0`, `y === 0`.
- **Test 2: Spawning / Summoning Contract**:
  - `alliesManager.spawnDrone(DroneType.ESCORT, playerX, playerY)` activates Escort drone.
  - Returns drone reference; sets state to `ACTIVE` (or `SPAWNING`).
  - Calling spawn on an already active drone resets its position/timers without allocating a new object.
- **Test 3: Despawn on Player Destruction & Stage Clear**:
  - When `player.destroy()` occurs, drones transition to `STANDBY` or `DESPAWNING`.
  - When `game.onStageClear()` triggers, drones dock or persist cleanly into the next round.
  - On `game.reset()`, all drones deactivate and active bullet references are recycled.

#### Suite B: Escort Wingman Drone Kinematics & Autofire
- **Test 4: Orbit Kinematics Equation**:
  - The orbit coordinates must satisfy:
    $$x(t) = x_p + R \cos(\omega t)$$
    $$y(t) = y_p + R \sin(\omega t)$$
    where $R = 20\text{px}$, $\omega = \pi\text{ rad/s}$ ($2.0\text{s}$ orbital period).
  - Assert drone coordinates at $t = 0.0\text{s}, 0.5\text{s}, 1.0\text{s}, 1.5\text{s}, 2.0\text{s}$:
    - $t = 0.0\text{s} \implies (x_p + 20, y_p)$
    - $t = 0.5\text{s} \implies (x_p, y_p + 20)$
    - $t = 1.0\text{s} \implies (x_p - 20, y_p)$
    - $t = 1.5\text{s} \implies (x_p, y_p - 20)$
    - $t = 2.0\text{s} \implies (x_p + 20, y_p)$
- **Test 5: Player Translation Tracking**:
  - When player translates $x_p$ from $112 \to 50$ over $0.2\text{s}$ ($260\text{ px/s}$):
  - Drone orbit center moves instantaneously with player without phase loss.
- **Test 6: Boundary Clamping Protection**:
  - When player is at left boundary $x_p = 12$, drone orbit is clamped so $x_{\text{drone}} \ge 4$.
  - When player is at right boundary $x_p = 212$, drone orbit is clamped so $x_{\text{drone}} \le 220$.
- **Test 7: Autofire Interval & Quota Isolation**:
  - Autofire cadence: $T_{\text{cadence}} = 0.40\text{s}$.
  - Over $1.20\text{s}$ with player active, drone fires exactly 3 plasma bolts.
  - Plasma bolt velocity: $v_x = 0, v_y = -400\text{ px/s}$.
  - **CRITICAL INVARIANT**: Drone plasma bolts MUST NOT increment `player.activeMissileCount`. The player must still be able to fire their full 2 missiles (single) or 4 missiles (dual)!
- **Test 8: Firing Inhibition during Non-Controllable States**:
  - When player state is `capturing`, `captured`, or `destroyed`, autofire is completely suppressed.

#### Suite C: Kinetic Aegis Drone Shield Restoration
- **Test 9: Periodic Pulse Timing**:
  - Pulse interval: $T_{\text{pulse}} = 6.0\text{s}$.
  - With player shield down (`hasShield = false`):
    - Update $5.9\text{s} \implies$ `player.hasShield === false`.
    - Update $0.1\text{s}$ (total $6.0\text{s}$) $\implies$ `player.hasShield === true`, `player.shieldHp === 1`, `player.shieldFlashTimer === 0.3`.
    - Aegis pulse timer resets to 0.
- **Test 10: Non-Wasting Pulse on Active Shield**:
  - When player already has an intact shield (`player.hasShield === true`):
    - At $t = 6.0\text{s}$, pulse does not overwrite or stack `shieldHp` beyond 1.
    - Timer holds or cycles cleanly without generating redundant particles.
- **Test 11: Immediate Recovery After Shield Break**:
  - Player shield absorbs an enemy bullet at $t = 2.0\text{s}$ (shield depleted).
  - Next pulse restores shield at the scheduled cycle time.

#### Suite D: Bomber Support Wing Drone Carpet-Bomb Trajectory
- **Test 12: Horizontal Sweeping Kinematics**:
  - Spawns at $x = -24, y = 36$ with $v_x = 120\text{ px/s}, v_y = 0$.
  - Reaches canvas center ($x = 112$) in $1.13\text{s}$.
  - Exits right ($x > 248$) in $2.27\text{s}$ and deactivates automatically.
- **Test 13: Cluster Bomb Drop Trajectory & Parabolic Fall**:
  - Drops bombs every $\Delta t = 0.3\text{s}$ while $x \in [16, 208]$ (total 6 bombs).
  - Bomb kinematics:
    $$x_{\text{bomb}}(t) = x_{\text{drop}}$$
    $$y_{\text{bomb}}(t) = y_0 + v_{y0} t + \frac{1}{2} g t^2$$
    where $v_{y0} = 40\text{ px/s}, g = 240\text{ px/s}^2$.
- **Test 14: AoE Detonation & Collision Radius**:
  - Bomb detonates upon reaching $y \ge 130$ or on contact with an enemy AABB.
  - Detonation AoE radius: $R_{\text{blast}} = 16\text{px}$.
  - Any enemy whose center distance $d \le 16\text{px}$ from blast center receives explosive damage.
  - Multi-kill assertion: a single bomb destroys 3 tightly clustered formation Goeis.

---

### 3.2 Special Moves Subsystem Test Formulation (`m13_special_moves.test.ts`)

#### Suite A: Meter Accumulation, Triggering & Cooldown
- **Test 1: Meter Accumulation Invariants**:
  - Energy meter strictly in $[0, 100]$.
  - Enemy destruction rewards:
    - Zako/Goei: $+3$ energy.
    - Boss Galaga: $+10$ energy.
    - Boss Sub-Unit: $+5$ energy.
    - Energy Spark Capsule: $+15$ energy.
  - Clamping: adding 50 energy when meter is at 80 clamps strictly to 100 (no overflow).
- **Test 2: Insufficient Energy Rejection**:
  - Attempting to activate special move with meter $= 99$ returns `false`.
  - Meter remains 99; no special move triggered.
- **Test 3: Input Trigger Consumption**:
  - Triggering with meter $= 100$:
    - Returns `true`.
    - Meter immediately drains to $0$.
    - Cooldown timer set to $5.0\text{s}$.
  - Discrete action: subsequent trigger calls in the same frame return `false` (single-pulse consumption).
- **Test 4: Cooldown Enforcement**:
  - After triggering, force meter back to 100 via cheat/gain.
  - Attempting to trigger at $t = 2.5\text{s}$ (during cooldown) returns `false`.
  - At $t = 5.0\text{s}$ (cooldown expired), trigger succeeds.

#### Suite B: Nova Barrage Target Acquisition & Damage Allocation
- **Test 5: Target Acquisition Filtering**:
  - Queries `formationManager.getLivingEnemies()` and `bossManager.activeBoss`.
  - Filters out:
    - `enemy.active === false`
    - `enemy.state === EnemyState.EXPLODING`
    - `enemy.state === EnemyState.INACTIVE`
  - Targets both formation enemies, diving enemies, and boss sub-units.
- **Test 6: Zero Enemies On-Screen Edge Case**:
  - When canvas is completely clear of enemies (e.g. wave transition):
    - Nova Barrage executes upward fan salvo.
    - Consumes meter cleanly.
    - **Zero exceptions thrown** (no null pointer dereferences).
- **Test 7: Damage Allocation Hierarchy**:
  - Normal enemies (Zako, Goei, Escorts): dealt 99 damage (instant obliteration).
  - Boss Galaga (2 HP): dealt 2 damage (instant destruction).
  - Epic Stage Boss (e.g. Cyber Dreadnought): dealt 25 damage via `boss.takeDamage(25)`.
  - Verifies score attribution: `scoreManager.score` increases by total points of all destroyed ships.

#### Suite C: Chrono Freeze 3-Second Time Freeze Invariant
- **Test 8: The 3.0s Absolute Invariant Definition**:
  - Special move triggers Chrono Freeze: `freezeTimer = 3.0`.
  - For all $t \in (0, 3.0]$:
    - `enemyDt === 0`
    - `playerDt === dt` (normal $16.6667\text{ms}$)
- **Test 9: Enemy Frozen Invariants**:
  - Formation harmonic oscillation: `formationManager.elapsedTime` does not advance. Enemy $x, y$ coordinates remain identical across 60 frames.
  - Diving enemy: path parameter $t_{\text{dive}}$ does not advance.
  - Sub-wave entry timer does not advance.
  - Dive peeling scheduler does not advance.
  - Enemy bullet positions: all active enemy bullets have $\Delta x = 0, \Delta y = 0$.
  - Boss attack timers: spiral bullet emission, dark matter beam charge timers hold static.
- **Test 10: Player Normal Operation Invariants**:
  - Player ship responds to `moveLeft` / `moveRight` at full $260\text{ px/s}$.
  - Player weapon firing responds to `fire`, spawning player missiles.
  - Player missiles travel upward at normal $-480\text{ px/s}$.
  - Collision resolution remains active: player missiles collide with frozen enemies, destroying them.
- **Test 11: Seamless Resumption at $t = 3.0\text{s}$**:
  - At $t = 3.0\text{s}$, `freezeTimer` expires.
  - Enemy updates resume with normal $dt$.
  - Diving enemies continue along Bézier curves without teleportation or velocity spikes.

#### Suite D: Dimensional Warp Ram Invulnerability & Swept Lane Collision
- **Test 12: Invulnerability Window**:
  - During the $1.0\text{s}$ Warp Ram:
    - `player.isInvulnerable()` strictly returns `true`.
    - `player.hitTestAndDamage(threat)` returns `false` against all enemy bullets and craft collisions.
    - Shield is not depleted.
- **Test 13: Kinematics & Swept Lane Broadphase**:
  - Player ship charges vertically from $y = 250 \to y = -20$ at $v_y = -600\text{ px/s}$.
  - Swept AABB covers $[x_p - 8, x_p + 8]$ across $y \in [-20, 250]$.
  - All enemies intersecting this lane take 99 damage and explode.
  - Pierces and destroys boss kinetic barriers.
- **Test 14: Safe Re-entry & Grace Window**:
  - Player returns to baseline $y = 250$.
  - Player receives a $0.5\text{s}$ post-warp invulnerability timer (`invulnerableTimer = 0.5`).
  - Standard 1D steering resumes immediately.

---

### 3.3 Zero-GC Invariant & Memory Profiling Strategy (`m13_zerogc_stress.test.ts`)

#### Suite A: Pre-Allocated Pool Capacities
- **Test 1: Pool Clamping Invariants**:
  - Drone pool: pre-allocated size $= 3$, max size $= 3$, `autoExpand = false`.
  - Drone Projectile pool: pre-allocated size $= 16$, max size $= 16$, `autoExpand = false`.
  - Cluster Bomb pool: pre-allocated size $= 16$, max size $= 16$, `autoExpand = false`.
  - Nova Barrage Beam buffer: fixed static array of 32 beam structures.
  - Warp Ram trail buffer: fixed circular buffer of 16 trail nodes.

#### Suite B: 10,000-Tick Continuous Gameplay Stress Test
- **Test 2: Multi-System Endurance Simulation**:
  - Setup Game with:
    - Escort Drone autofiring every $0.4\text{s}$.
    - Aegis Drone pulsing every $6.0\text{s}$.
    - Bomber Drone sweeping canvas every $10\text{s}$.
    - Special Moves triggered every 100 ticks (alternating Nova $\to$ Chrono $\to$ Warp Ram).
    - 40 enemies in formation with periodic attack dives.
  - Run 10,000 fixed-timestep update ticks ($16.6667\text{ms}$ each $\approx 166.7$ simulated seconds).
  - Invariant checks:
    - Pool capacities remain strictly constant (zero heap growth).
    - Active item counts never exceed pool capacities.
    - Zero uncaught exceptions, zero NaN coordinates, zero memory leaks.

---

## 4. In-Depth Regression Risk Matrix & Defensive Mitigation Plan

| # | Existing Test File | Tests | Potential Regression Scenario | Failure Mechanism | Defensive Mitigation Strategy |
|---|---|---|---|---|---|
| 1 | `tests/unit/core.test.ts` | 41 | Game coordinator update loop failure | If Chrono Freeze sets engine `stateTimer` or `gameLoop.fixedDt = 0`, state machine transitions (`STAGE_INTRO` $\to$ `PLAYING`) freeze permanently. | Chrono Freeze must ONLY scale enemy update delta (`enemyDt = freezeTimer > 0 ? 0 : dt`). Engine core `dt` must remain $1/60\text{s}$. |
| 2 | `tests/unit/player.test.ts` | 32 | Missile quota saturated by Escort Drone | If Escort Drone calls `player.onFire` or uses `bulletManager.firePlayerBullet`, it increments `player.activeMissileCount`, preventing the player from firing their own 2 missiles! | Drone projectiles must use `bullet.owner = 'DRONE'` or a dedicated pool, ensuring `player.activeMissileCount` is untouched. |
| 3 | `tests/unit/player.test.ts` | 32 | `PlayerStateType` enum contract broken | If Warp Ram introduces a new state `'warp_ram'` to `Player.state`, tests asserting `player.state === 'normal'` or `'ALIVE'` will fail. | Keep `Player.state` as `'normal'` or `'dual'`. Track Warp Ram via `player.isWarpRamActive: boolean` and incorporate into `isInvulnerable()`. |
| 4 | `tests/unit/enemy.test.ts` | 39 | Enemy update signature or state corruption | If `Enemy.update(dt)` is changed to require drone or special move references, existing enemy tests fail. | Keep `Enemy.update(dt, playerX, playerY)` signature intact. Special move effects are applied externally via damage or zero delta time. |
| 5 | `tests/unit/powerups.test.ts` & `m11_*` | 70 | PowerUp pool capacity invariant violated | `PowerUpManager` pool is strictly clamped to 32 items with `autoExpand = false`. If drones or special moves lease from this pool, it exhausts and fails stress tests. | Drones and special move entities must NEVER touch `PowerUpManager.pool`. Maintain completely separate, dedicated pools. |
| 6 | `tests/unit/boss_*` (6 files) | 53 | Boss phase transition skipped or crashed | If Nova Barrage or Warp Ram directly deducts `boss.health` without calling `boss.takeDamage(n)`, boss phase state machines won't trigger Phase 2 or explode. | Route all special move damage through `enemy.takeDamage(amount)`. |
| 7 | `tests/unit/hud_screens.test.ts` | 36 | HUD visual layout overlap | If Special Move energy bar overlaps HUD high score or stage badges, visual regression occurs. | Render Special Move bar at $y = 276$ (bottom border) or adjacent to the lives icons, away from header/footer text. |
| 8 | `tests/unit/tractor_beam.test.ts` | 28 | Player captured while Warp Ramming | If tractor beam captures player while Warp Ram is active, two conflicting movement controllers fight for $x, y$. | Warp Ram takes absolute priority: tractor beam is broken or cannot capture an invulnerable player. |

---

## 5. Concrete Vitest Implementation Blueprint for Milestone 13

Below are the exact test templates and assertions to be implemented by the test engineers and challenger bots:

### Test File 1: `tests/unit/m13_allies_drones.test.ts` (Target: ~25 tests)
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from '../../src/core/Game';
import { AlliesManager, DroneType } from '../../src/core/allies/AlliesManager';
import { EscortDrone } from '../../src/core/allies/EscortDrone';
import { AegisDrone } from '../../src/core/allies/AegisDrone';
import { BomberDrone } from '../../src/core/allies/BomberDrone';

describe('Milestone 13: Allies Support System (3 Tactical Drones)', () => {
  let game: Game;
  let allies: AlliesManager;

  beforeEach(() => {
    game = new Game();
    allies = new AlliesManager(game);
  });

  describe('1. Escort Wingman Drone', () => {
    it('orbits player at radius 20px with smooth parametric kinematics', () => {
      const drone = allies.spawnDrone(DroneType.ESCORT, 112, 250);
      expect(drone.active).toBe(true);

      // t = 0: (112 + 20, 250) = (132, 250)
      drone.update(0, 112, 250);
      expect(drone.x).toBeCloseTo(132, 1);
      expect(drone.y).toBeCloseTo(250, 1);

      // t = 0.5s (quarter period, angle = PI/2): (112, 250 + 20) = (112, 270)
      drone.update(0.5, 112, 250);
      expect(drone.x).toBeCloseTo(112, 1);
      expect(drone.y).toBeCloseTo(270, 1);
    });

    it('autofires forward plasma bolts every 0.4s without consuming player missile quota', () => {
      const drone = allies.spawnDrone(DroneType.ESCORT, 112, 250);
      expect(game.player.activeMissileCount).toBe(0);

      drone.update(0.4, 112, 250);
      // Drone fired 1 bolt
      expect(drone.shotsFired).toBe(1);
      // Player quota remains untouched!
      expect(game.player.activeMissileCount).toBe(0);
    });
  });

  describe('2. Kinetic Aegis Drone', () => {
    it('restores player shield every 6.0s when shield is depleted', () => {
      const drone = allies.spawnDrone(DroneType.AEGIS, 112, 250);
      game.player.hasShield = false;
      game.player.shieldHp = 0;

      drone.update(5.9, 112, 250);
      expect(game.player.hasShield).toBe(false);

      drone.update(0.1, 112, 250);
      expect(game.player.hasShield).toBe(true);
      expect(game.player.shieldHp).toBe(1);
    });

    it('does not overflow shieldHp beyond 1 when player already has a shield', () => {
      const drone = allies.spawnDrone(DroneType.AEGIS, 112, 250);
      game.player.hasShield = true;
      game.player.shieldHp = 1;

      drone.update(6.0, 112, 250);
      expect(game.player.shieldHp).toBe(1);
    });
  });

  describe('3. Bomber Support Wing Drone', () => {
    it('sweeps horizontally across screen and carpet-bombs formations', () => {
      const drone = allies.spawnDrone(DroneType.BOMBER, 0, 36);
      expect(drone.active).toBe(true);

      // Sweeps 120 px/s over 2.0s
      drone.update(2.0);
      expect(drone.bombsDropped).toBeGreaterThanOrEqual(5);

      // Exits screen
      drone.update(1.0);
      expect(drone.active).toBe(false);
    });
  });
});
```

### Test File 2: `tests/unit/m13_special_moves.test.ts` (Target: ~30 tests)
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../../src/core/Game';
import { SpecialMovesManager, SpecialMoveType } from '../../src/core/special/SpecialMovesManager';
import { Enemy } from '../../src/entities/Enemy';
import { EnemyType, EnemyState } from '../../src/types';

describe('Milestone 13: Special Moves Subsystem (3 Game-Changing Moves)', () => {
  let game: Game;
  let specials: SpecialMovesManager;

  beforeEach(() => {
    game = new Game();
    specials = new SpecialMovesManager(game);
  });

  describe('1. Meter Accumulation & Cooldown', () => {
    it('accumulates energy from kills up to 100 max', () => {
      expect(specials.energyMeter).toBe(0);
      specials.addEnergy(45);
      expect(specials.energyMeter).toBe(45);
      specials.addEnergy(70);
      expect(specials.energyMeter).toBe(100); // Clamped
    });

    it('rejects activation if energy < 100', () => {
      specials.addEnergy(99);
      expect(specials.trigger(SpecialMoveType.NOVA_BARRAGE)).toBe(false);
    });

    it('consumes 100 energy and initiates 5.0s cooldown on activation', () => {
      specials.addEnergy(100);
      expect(specials.trigger(SpecialMoveType.NOVA_BARRAGE)).toBe(true);
      expect(specials.energyMeter).toBe(0);
      expect(specials.cooldownTimer).toBe(5.0);
    });
  });

  describe('2. Chrono Freeze (3-Second Time Freeze Invariant)', () => {
    it('freezes enemy dt to 0 while player dt remains normal', () => {
      specials.addEnergy(100);
      specials.trigger(SpecialMoveType.CHRONO_FREEZE);
      expect(specials.isChronoFrozen()).toBe(true);

      const enemy = new Enemy({ id: 'test_enemy', type: EnemyType.ZAKO, x: 100, y: 100 });
      enemy.vx = 50;
      enemy.vy = 50;

      // During freeze: enemy updates with dt = 0
      const enemyDt = specials.getEnemyDeltaTime(1 / 60);
      expect(enemyDt).toBe(0);
      enemy.update(enemyDt, 112, 250);
      expect(enemy.x).toBe(100);
      expect(enemy.y).toBe(100);

      // Player updates with normal dt
      const prevPlayerX = game.player.x;
      game.player.update(1 / 60, { moveLeft: true, moveRight: false, fire: false, pause: false, restart: false, pointerX: null, pointerActive: false, touchLeft: false, touchRight: false, touchFire: false });
      expect(game.player.x).toBeLessThan(prevPlayerX);
    });
  });

  describe('3. Dimensional Warp Ram', () => {
    it('grants full invulnerability and clears flight lane', () => {
      specials.addEnergy(100);
      specials.trigger(SpecialMoveType.WARP_RAM);
      expect(specials.isWarpRamActive()).toBe(true);
      expect(game.player.isInvulnerable()).toBe(true);

      // Hit test returns false during warp
      const hit = game.player.hitTestAndDamage({ x: game.player.x, y: game.player.y, width: 10, height: 10 });
      expect(hit).toBe(false);
    });
  });
});
```

---

## 6. Recommendations for Swarm Implementation Workers

1. **Keep Subsystems Decoupled**: Place drone logic in `src/core/allies/` and special moves in `src/core/special/`.
2. **Quota Separation**: Escort Drone plasma bolts MUST use a dedicated bullet type (`'DRONE_PLASMA'`) or pool so they NEVER pollute `player.activeMissileCount`.
3. **Delta Time Scaling**: Chrono Freeze MUST be applied as an enemy delta multiplier (`enemyDt = specials.isChronoFrozen() ? 0 : dt`). Never modify the master `GameLoop` or `stateTimer`.
4. **Boss Integration**: Route all special move burst damage through `enemy.takeDamage(damage)` so that BaseBoss phase transitions and audio hooks execute cleanly.
5. **Zero-Allocation**: Pre-allocate all drone entities, projectile pools, cluster bombs, and laser beam arrays during manager instantiation.

---
*Document completed by `m13_explorer_3`. Ready for handoff to parent orchestrator and development workers.*
