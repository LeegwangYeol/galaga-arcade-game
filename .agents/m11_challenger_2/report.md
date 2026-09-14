# Milestone 11 Challenger 2: Upgrades Combat & Dual Fighter Invariant Adversarial Report

**Challenger**: `m11_challenger_2`  
**Role**: Upgrades Combat & Dual Fighter Invariant Challenger  
**Project Root**: `/Users/user/src/galog`  
**Test Suite**: `tests/unit/m11_challenger_2_adversarial.test.ts` (21 tests)  
**Date**: 2026-09-03T13:43:40+09:00  
**Overall Risk Assessment**: LOW  
**Verdict**: **APPROVE**  

---

## 1. Executive Summary
As the empirical challenger for Milestone 11 combat mechanics and Dual Fighter invariants, `m11_challenger_2` designed, implemented, and executed an adversarial test harness (`tests/unit/m11_challenger_2_adversarial.test.ts`) comprising 21 empirical simulation tests. 

All 4 critical combat invariant dimensions mandated by the orchestrator were subjected to edge-case and boundary stress testing:
1. **Kinetic Shield on Dual Fighter**: Lethal collision on left hull, right hull, and center overlap; confirmed shield absorption, $\ge 1.0$s invulnerability window, and preservation of the `'dual'` state with both hulls intact.
2. **Scatter Shot on Dual Fighter**: Confirmed exactly 6 bullet spawn requests per volley, twin cannon origins ($x - 8$ and $x + 8$), angles at $0^\circ, \pm 15^\circ$, and velocity magnitude $\sqrt{vx^2 + vy^2} = 480$ px/s for all 6 missiles.
3. **EMP Bomb Cleansing**: Confirmed 20/20 active enemy projectiles recycled to pool (active count dropping to 0), selective immunity for player missiles, 1-HP damage to diving aliens, and immunity for in-formation aliens.
4. **Rapid Fire**: Confirmed exact $0.06$s ($60$ms) cooldown duration, quota expansion to 4 (Single) and 8 (Dual) without premature blocking, and atomic volley preservation preventing partial asymmetric streams.
5. **Combined Combat Endurance**: Confirmed 600 fixed frames (10.0s) of continuous multi-upgrade combat with zero NaN values, zero memory leaks, and bounded projectile pooling.

---

## 2. Detailed Empirical Verification Results

### Dimension 1: Kinetic Shield on Dual Fighter
- **Left Hull Lethal Collision**:
  - *Simulation*: Dual Fighter ($x = 112, y = 250$) equipped with Kinetic Shield (`hasShield: true, shieldHp: 1`). Lethal threat placed at $(100, 248, 6 \times 6)$ directly intersecting left hull AABB ($[96, 111] \times [244, 256]$).
  - *Observed*: `hitTestAndDamage()` returned `false`. `hasShield` toggled to `false`, `shieldHp = 0`, `shieldFlashTimer = 0.3`, `invulnerableTimer = 1.0`. `player.isDual` remained `true` and `player.state` remained `'dual'`. `onExplode` was NOT invoked.
- **Right Hull Lethal Collision**:
  - *Simulation*: Threat placed at $(120, 248, 6 \times 6)$ intersecting right hull AABB ($[113, 128] \times [244, 256]$).
  - *Observed*: Absorbed cleanly, 1.0s invulnerability granted, player remained `'dual'`.
- **Center Catastrophic Threat**:
  - *Simulation*: Wide threat ($x: 102, y: 246, 20 \times 8$) spanning both left and right hulls simultaneously.
  - *Observed*: Absorbed by shield without triggering double-hull catastrophe.
- **Post-Invulnerability Asymmetrical Splitting**:
  - *Simulation*: After $1.05$s elapsed (invulnerability expired), a subsequent projectile struck the left hull.
  - *Observed*: Damage was sustained (`hitTestAndDamage() === true`), left hull was destroyed (`onExplode(104, 250, true)`), player cleanly split into single fighter (`isDual === false`, `state === 'normal'`), and position shifted $+8$px ($x = 120$) to center the surviving right hull.

### Dimension 2: Scatter Shot on Dual Fighter Ballistics
- **Spawn Request Quota & Coordinates**:
  - *Simulation*: Dual Fighter with Scatter Shot triggers `attemptFire()`.
  - *Observed*: Exactly 6 bullet spawn requests generated. Indices 0, 1, 2 emitted from Left Cannon $(x - 8, y - 8) = (104, 242)$. Indices 3, 4, 5 emitted from Right Cannon $(x + 8, y - 8) = (120, 242)$.
- **Trigonometric Vector & Speed Invariants**:
  - *Mathematical Model*: Speed $V = 480$ px/s. $\sin(15^\circ) \approx 0.258819$, $\cos(15^\circ) \approx 0.965926$.
    - Left spread ($-15^\circ$): $vx = -124.23$ px/s, $vy = -463.64$ px/s.
    - Center ($0^\circ$): $vx = 0$ px/s, $vy = -480$ px/s.
    - Right spread ($+15^\circ$): $vx = +124.23$ px/s, $vy = -463.64$ px/s.
  - *Observed*: All 6 bullets matched expected velocity vectors within $0.01$ px/s precision. Magnitude $\sqrt{vx^2 + vy^2} = 480.0 \pm 0.1$ px/s verified for all 6 missiles.
- **Kinematic Flight Integration**:
  - *Simulation*: Integrated over 5 frames ($80$ms).
  - *Observed*: Left-angled missiles horizontally displaced leftward ($\Delta x < 0$), center missiles remained perfectly vertical ($\Delta x = 0$), right-angled missiles displaced rightward ($\Delta x > 0$), and all climbed vertically ($\Delta y < 0$).

### Dimension 3: EMP Bomb Projectile Cleansing
- **20-Bullet Cleansing**:
  - *Simulation*: 20 active enemy projectiles spawned at diverse screen coordinates and angles. Initial `getEnemyBulletCount() === 20`.
  - *Observed*: `detonateEmpBomb()` cleared all 20 bullets. Active count dropped to 0. All 20 bullet objects were reset and returned to the pool (`active === false`). `onEmpShockwave` event dispatched.
- **Selective Cleansing Invariant**:
  - *Simulation*: 4 player missiles and 20 enemy bullets active simultaneously.
  - *Observed*: EMP wiped 20 enemy bullets while leaving 4 player missiles 100% active and propagating upwards.
- **Diving Alien Damage vs Formation Immunity**:
  - *Simulation*: 1-HP diving zako, 2-HP diving boss, 1-HP formation goei.
  - *Observed*: Diving zako destroyed (`EXPLODING`). Diving boss took 1 damage ($HP: 2 \to 1$). In-formation enemy took 0 damage ($HP = 1, state = IN\_FORMATION$).

### Dimension 4: Rapid Fire Cooldown & Quotas
- **Exact Cooldown**:
  - Normal cooldown: $0.12$s. Rapid Fire cooldown: $0.06$s ($60$ms).
  - Verified at $t = 0.03$s (`canFire === false`) and $t = 0.06$s (`canFire === true`).
- **Quota Progression Without Premature Block**:
  - Single Fighter: Successfully fired 4 consecutive bullets (quota 4) at intervals of $0.06$s. 5th bullet rejected. Recycling 1 bullet immediately unlocked the next shot.
  - Dual Fighter: Successfully fired 4 twin-volleys (8 bullets total) at intervals of $0.06$s. 5th volley rejected. Recycling 2 bullets immediately unlocked the next twin volley.
- **Atomic Volley Preservation**:
  - Dual Fighter + Scatter + Rapid (quota 16, volley size 6). Volley 1 (6 bullets) $\to$ Volley 2 (12 bullets). Volley 3 requires 6 bullets ($12 + 6 = 18 > 16$). System cleanly rejected volley 3, preventing asymmetric partial fire.

### Dimension 5: High-Intensity Combined Combat Simulation
- *Simulation*: 600 fixed frames ($10.0$s) at 60 FPS under simultaneous Kinetic Shield, Rapid Fire, Scatter Shot, and Engine Booster. Continuous firing, boundary clamping, and mid-simulation hostile collision on left hull.
- *Observed*: Survived with 0 errors. Player remained in `'dual'` state. All coordinates remained finite ($x \in [16, 208]$). Bullet pool operated strictly within quota ($16$).

---

## 3. Stress Test Results Matrix

| # | Test Scenario | Expected Result | Actual Result | Status |
|---|---------------|-----------------|---------------|:------:|
| 1 | Dual Fighter left hull collision with shield | Shield absorbs, 1.0s invuln, state remains 'dual' | Absorbed, invuln = 1.0s, state = 'dual' | **PASS** |
| 2 | Dual Fighter right hull collision with shield | Shield absorbs, 1.0s invuln, state remains 'dual' | Absorbed, invuln = 1.0s, state = 'dual' | **PASS** |
| 3 | Dual Fighter wide collision spanning both hulls | Shield absorbs without fatal explosion | Absorbed, state remains 'dual' | **PASS** |
| 4 | Threat during 1.0s invulnerability window | Zero damage sustained, state remains 'dual' | Zero damage, state = 'dual' | **PASS** |
| 5 | Post-invulnerability collision on left hull | Left hull destroyed, shifts +8px, single state | Damaged, x shifted to 120, state = 'normal' | **PASS** |
| 6 | Shield charges capping invariant | Applying shield multiple times caps shieldHp at 1 | shieldHp = 1, single hit depletes it | **PASS** |
| 7 | Dual Fighter Scatter Shot spawn count | Exactly 6 bullet spawn requests per volley | Exactly 6 requests returned | **PASS** |
| 8 | Dual Fighter Scatter Shot gun positions | 3 bullets from (x-8, y-8), 3 from (x+8, y-8) | Matched (104, 242) and (120, 242) | **PASS** |
| 9 | Dual Fighter Scatter Shot angle spreads | 0° center, ±15° left/right spreads | vx = 0, ±124.23; vy = -480, -463.64 | **PASS** |
| 10 | Scatter Shot total velocity magnitude | sqrt(vx^2 + vy^2) = 480 px/s for all 6 | Exact 480.0 px/s for all 6 missiles | **PASS** |
| 11 | Scatter Shot kinematic flight divergence | Diverges tangentially across frames | Left moves left, right moves right | **PASS** |
| 12 | 20 enemy bullets EMP detonation | 100% of 20 bullets recycled, count drops to 0 | Active count = 0, all 20 inactive | **PASS** |
| 13 | Selective EMP cleansing vs player missiles | Player missiles immune, enemy bullets cleared | 20 enemy cleared, 4 player intact | **PASS** |
| 14 | EMP detonation with 0 active bullets | Graceful no-op, no exceptions | Zero exceptions, count = 0 | **PASS** |
| 15 | High-density EMP detonation (50 bullets) | 100% recycled to pool without corruption | Active count = 0, pool consistent | **PASS** |
| 16 | EMP damage to diving vs formation enemies | Diving -1 HP, in-formation 0 HP damage | Diving took 1 damage, formation 0 | **PASS** |
| 17 | Rapid Fire cooldown duration | Exactly 0.06s (50% reduction from 0.12s) | Exactly 0.06s; ready at 60ms | **PASS** |
| 18 | Single Fighter Rapid Fire quota progression | Fires up to quota 4 without premature block | 4 bullets fired, 5th blocked, unlocks on recycle | **PASS** |
| 19 | Dual Fighter Rapid Fire quota progression | Fires up to quota 8 without premature block | 8 bullets fired, 9th blocked, unlocks on recycle | **PASS** |
| 20 | Atomic volley preservation | Rejects partial asymmetric volley (needs 6) | Volley 3 rejected (12+6 > 16) | **PASS** |
| 21 | Combined 600-frame combat simulation | No NaN, no state drift, dual preserved | 15+ volleys, shield absorbed, dual intact | **PASS** |

---

## 4. Build, Typecheck, and Regression Verification

1. **Adversarial Suite Execution**:
   ```bash
   npx vitest run tests/unit/m11_challenger_2_adversarial.test.ts
   # Output: 21 passed (21 tests), Duration: 421ms
   ```
2. **TypeScript Typecheck**:
   ```bash
   npm run typecheck
   # Output: tsc --noEmit (Exit code 0)
   ```
3. **Vite Production Build**:
   ```bash
   npm run build
   # Output: built in 609ms (dist/assets/index-BFegbMjh.js 213.17 kB)
   ```

---

## 5. Verdict

**FINAL VERDICT: APPROVE**

Milestone 11 combat mechanics, weapon ballistics, power-up systems, and Dual Fighter architectural invariants fully satisfy all empirical and adversarial criteria. All safety mechanisms, zero-allocation pooling guarantees, and state transitions operate flawlessly.
