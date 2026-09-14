# Empirical Adversarial Challenge Report: Power-Up ObjectPool & Drop Probability

- **Challenger**: `m11_challenger_1` (Role: Power-Up ObjectPool & Drop Probability Challenger)
- **Target Subsystem**: Milestone 11 Power-Up Subsystem (`src/core/powerups/PowerUpManager.ts`, `PowerUpItem.ts`, `types.ts`)
- **Test Suite**: `tests/unit/m11_challenger_1_adversarial.test.ts` (13 test cases across 3 dimensions)
- **Execution Date**: 2026-09-03
- **Verdict**: **CHALLENGE_FAILED**
- **Overall Risk Assessment**: **HIGH**

---

## 1. Executive Summary

As `m11_challenger_1`, an empirical adversarial test suite was authored and executed against the Milestone 11 Power-Up subsystem. The challenge evaluated pool saturation and bounded capacity invariants under rapid spawn bursts, statistical drop probability distributions across 10,000 simulated enemy kills, and physical kinematics (drift, sway, viewport clamping, and despawn thresholds).

Empirical testing yielded **11 PASSES and 2 FAILURES** out of 13 adversarial test cases in `tests/unit/m11_challenger_1_adversarial.test.ts`.
A critical invariant failure was empirically confirmed in **Dimension 1 (Pool Saturation & Zero-GC Bounded Capacity)**:
`PowerUpManager` was implemented with `maxSize: 128` and `autoExpand: true` instead of enforcing a strict bounded pool capacity of 32 items with zero GC reallocations. Spawning 40 items causes the pool to dynamically allocate 32 new heap instances and double capacity to 64, violating the 60 FPS zero-allocation performance mandate.

Because this violation was empirically reproduced via executable tests, the verdict is **`CHALLENGE_FAILED`**. A precise remediation is documented below for `m11_fix_worker`.

---

## 2. Adversarial Challenges & Findings

### Challenge Dimension 1: Pool Saturation & Bounded Zero-GC Capacity (VERDICT: FAILED)
- **Assumption Challenged**:
  The Power-Up ObjectPool must have a strict bounded capacity of 32 pre-allocated entities. Spawning beyond 32 items (e.g. 40 items in rapid burst) must handle overflow gracefully without throwing exceptions and with **zero GC reallocations** (capacity strictly clamped at 32, overflow requests returning `null`).
- **Attack Scenario**:
  1. Inspected `manager.getPool().getMaxSize()` at initialization.
  2. Executed a rapid saturation loop attempting to spawn 40 power-ups:
     `manager.spawnPowerUp(x, y, PowerUpType.RAPID_FIRE)` for $i \in [0, 39]$.
  3. Asserted `manager.getPoolSize() === 32` and verified overflow items $i \in [32, 39]$ returned `null`.
- **Blast Radius**:
  Under heavy combat or cheat execution where many enemies die simultaneously, the pool dynamically instantiates new `PowerUpItem` objects and grows internal storage arrays on the V8 heap. This causes Garbage Collection pressure, micro-stutters, and unbounded memory consumption, violating the core zero-allocation arcade engine architecture.
- **Empirical Result**: **FAILED** (2 failed test cases).
  - Test 1 (`initializes with bounded pool capacity of exactly 32 pre-allocated entities`):
    `manager.getPool().getMaxSize()` returned `128` instead of `32`.
    ```
    AssertionError: expected 128 to be 32
    - Expected: 32
    + Received: 128
    ```
  - Test 2 (`handles pool saturation gracefully: spawning 40 power-ups rapidly maintains bounded capacity 32`):
    Upon spawning 40 items, `manager.getPoolSize()` expanded from 32 to `64`!
    ```
    AssertionError: expected 64 to be 32
    - Expected: 32
    + Received: 64
    ```
    The pool dynamically instantiated 32 new objects on the heap via `autoExpand: true`. Items 33–40 were returned as newly allocated objects rather than handling overflow gracefully by returning `null`.

---

### Challenge Dimension 2: Drop Probability Statistical Test (10,000 Kills) (VERDICT: PASS)
- **Assumption Challenged**:
  Drop probabilities must strictly enforce:
  1. Strictly 0% drops on Challenging Stages ($s \ge 3 \land s \pmod 4 \equiv 3$).
  2. 12% ± 1.5% baseline on regular non-diving enemies (Stage 1).
  3. 18% ± 2.0% on diving enemies (Stage 1).
  4. 30%–40% on Boss Galagas (30% in formation, 40% diving).
  5. Deterministic tier scaling: +3% in Elite tier (Stages 11–25) and +6% in Dreadnought tier (Stages 26–50).
- **Attack Scenario**:
  Executed Monte Carlo simulations with 10,000 independent simulated enemy kills per category using `manager.spawnDrop(x, y, stage, enemyType, isDiving)`. Evaluated drop frequency against binomial confidence intervals.
- **Blast Radius**:
  Deviation could break stage balance, reward undeserved items during acrobatic target practice, or starve players of upgrades during high-difficulty stages.
- **Empirical Result**: **PASS**.
  - **Challenging Stages**: 0 drops out of 10,000 kills (strictly 0.000%). Zero drop leakage across stages 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47.
  - **Regular Non-Diving Zako (Stage 1)**: 1,189 drops out of 10,000 kills (11.89%). Strictly within expected range $[10.5\%, 13.5\%]$ ($12.0\% \pm 1.5\%$).
  - **Diving Zako (Stage 1)**: 1,794 drops out of 10,000 kills (17.94%). Strictly within expected range $[16.0\%, 20.0\%]$ ($18.0\% \pm 2.0\%$).
  - **Formation Boss Galaga (Stage 1)**: 2,982 drops out of 10,000 kills (29.82%). Strictly within $[28.0\%, 32.0\%]$.
  - **Diving Boss Galaga (Stage 1)**: 4,015 drops out of 10,000 kills (40.15%). Strictly within $[38.0\%, 42.0\%]$.
  - **Elite Tier Bonus (Stage 12)**: Non-diving drop chance evaluated to exact theoretical $15.0\%$ ($12\% + 3\%$).
  - **Dreadnought Tier Bonus (Stage 26)**: Non-diving drop chance evaluated to exact theoretical $18.0\%$ ($12\% + 6\%$), diving Boss evaluated to $46.0\%$ ($40\% + 6\%$).
  - **Weighted Loot Distribution (50,000 rolls)**: `RAPID_FIRE` 30.1%, `KINETIC_SHIELD` 24.9%, `SCATTER_SHOT` 20.0%, `ENGINE_BOOSTER` 15.1%, `EMP_BOMB` 9.9%, conforming to configured ratio $30:25:20:15:10$.

---

### Challenge Dimension 3: Kinematics, Sway Physics & Boundary Clamping (VERDICT: PASS)
- **Assumption Challenged**:
  Collectible capsules must drift vertically downward at a constant $60$ px/s, exhibit horizontal sinusoidal sway ($A = 12$ px, $\omega = 3.0$ rad/s), remain strictly clamped within the viewport playfield bounds $x \in [10, 214]$ at all times, and reliably despawn and recycle to the pool when $y > 288$.
- **Attack Scenario**:
  1. Downward velocity tested by integrating $\Delta t = 0.5\text{s}, 1.0\text{s}, 2.0\text{s}$ asserting exact $y$ increments of $+30, +60, +120$ px.
  2. Sway evaluated against the analytical formula $x = \text{clamp}(10, 214, \text{baseX} + 12 \cdot \sin(3.0 \cdot t + \phi))$.
  3. Extreme boundary tests: spawned items with $\text{originX} = 10$, $\text{originX} = 214$, and adversarial out-of-bounds positions $\text{originX} = -100, 999$.
  4. Despawn threshold test: advanced item across boundary threshold $y = 286 \to 287.2 \to 288.4$ px.
- **Blast Radius**:
  Drifting items could float offscreen or clip beyond the HUD border, rendering items uncollectible or leaking memory if despawn triggers fail.
- **Empirical Result**: **PASS**.
  - Vertical drift verified at exactly $60.0$ px/s.
  - Sinusoidal sway verified with $A = 12.0$ px, $\omega = 3.0$ rad/s.
  - Clamping verified: across 200 frames of multi-cycle sway at $x = 10$ and $x = 214$, all coordinates remained bounded in $[10, 214]$. Adversarial out-of-bounds spawns ($x = -100, 999$) clamped immediately to $x = 10$ and $x = 214$.
  - At $y = 287.2 \le 288$, item remained active. At $y = 288.4 > 288$, item deactivated (`active === false`), active count dropped to 0, and `stats.totalDespawned` incremented.

---

## 3. Stress Test Results Table

| # | Test Scenario | Dimension | Expected Behavior | Actual Behavior | Verdict |
|---|---|---|---|---|---|
| 1 | Bounded pool capacity initialization | D1: Pool Saturation | `getMaxSize() === 32` | Received `128` | **FAIL** |
| 2 | 40-item rapid spawn saturation | D1: Pool Saturation | Capacity stays 32, items 33–40 return null | Capacity grew to 64, items 33–40 allocated | **FAIL** |
| 3 | 100 saturation-despawn recycling cycles | D1: Pool Saturation | 0 active items, capacity 32 | Recycled 32 items to 0 active, capacity 32 | **PASS** |
| 4 | Challenging Stages 10,000-kill drop test | D2: Drop Probability | Strictly 0 drops (0.00%) | 0 drops / 10,000 kills (0.00%) | **PASS** |
| 5 | Regular enemy 10,000-kill baseline drop test | D2: Drop Probability | $12\% \pm 1.5\%$ ($[10.5\%, 13.5\%]$) | 1,189 / 10,000 (11.89%) | **PASS** |
| 6 | Diving enemy 10,000-kill drop test | D2: Drop Probability | $18\% \pm 2.0\%$ ($[16.0\%, 20.0\%]$) | 1,794 / 10,000 (17.94%) | **PASS** |
| 7 | Boss Galaga 10,000-kill formation & diving test | D2: Drop Probability | Formation 30%, Diving 40% (in $[30\%, 40\%]$) | Formation: 29.82%, Diving: 40.15% | **PASS** |
| 8 | Tier scaling bonuses (Elite +3%, Dreadnought +6%) | D2: Drop Probability | Stage 12: 15%, Stage 26: 18%, Dreadnought Boss: 46% | Exact formulas verified | **PASS** |
| 9 | 50,000-roll weighted loot distribution | D2: Drop Probability | Conforms to weights 30:25:20:15:10 | 30.1%, 24.9%, 20.0%, 15.1%, 9.9% | **PASS** |
| 10 | 60 px/s downward drift kinematics | D3: Kinematics | $\Delta y = 60 \cdot \Delta t$ | Exact linear vertical velocity | **PASS** |
| 11 | Horizontal sinusoidal sway formula | D3: Kinematics | $A = 12$ px, $\omega = 3.0$ rad/s | Exact analytical sway tracking | **PASS** |
| 12 | Viewport boundary clamping $[10, 214]$ | D3: Kinematics | $x \in [10, 214]$ under all edge spawns | Clamped strictly in $[10, 214]$ | **PASS** |
| 13 | Threshold despawn at $y > 288$ & pool reclamation | D3: Kinematics | Despawns when $y > 288$, recycled to pool | Deactivated at $y = 288.4$, recycled | **PASS** |

---

## 4. Root Cause Analysis & Remediation Plan

### Root Cause
In `src/core/powerups/PowerUpManager.ts`:
```typescript
24:   public static readonly POOL_CAPACITY = 32;
25:   public static readonly POOL_MAX_SIZE = 128;
...
60:   this.pool = new ObjectPool<PowerUpItem>({
61:     factory: () => new PowerUpItem(this.nextItemId++),
62:     reset: (item: PowerUpItem) => item.reset(),
63:     initialSize: PowerUpManager.POOL_CAPACITY,
64:     maxSize: PowerUpManager.POOL_MAX_SIZE,
65:     autoExpand: true,
66:   });
```
1. `maxSize` is set to `POOL_MAX_SIZE` (128) instead of `POOL_CAPACITY` (32).
2. `autoExpand` is set to `true` instead of `false`.

### Required Fix (for `m11_fix_worker`):
In `src/core/powerups/PowerUpManager.ts`:
1. Change `POOL_MAX_SIZE` to `32` (or set `maxSize: PowerUpManager.POOL_CAPACITY`).
2. Set `autoExpand: false`.

```diff
-  public static readonly POOL_MAX_SIZE = 128;
+  public static readonly POOL_MAX_SIZE = 32;

   this.pool = new ObjectPool<PowerUpItem>({
     factory: () => new PowerUpItem(this.nextItemId++),
     reset: (item: PowerUpItem) => item.reset(),
     initialSize: PowerUpManager.POOL_CAPACITY,
-    maxSize: PowerUpManager.POOL_MAX_SIZE,
-    autoExpand: true,
+    maxSize: PowerUpManager.POOL_CAPACITY,
+    autoExpand: false,
   });
```

With this fix:
- When 40 items are spawned, `acquire()` will lease the 32 pre-allocated items and return `null` for requests 33–40.
- Pool capacity remains strictly 32.
- Zero heap allocations will occur during gameplay.
- All 13 tests in `tests/unit/m11_challenger_1_adversarial.test.ts` will pass with 100% success rate.

---

## 5. Verification Method

To independently reproduce this finding, run:
```bash
npx vitest run tests/unit/m11_challenger_1_adversarial.test.ts
```

Expected output prior to fix:
`2 failed | 11 passed (13)` (Tests 1 & 2 fail on pool capacity assertions).
