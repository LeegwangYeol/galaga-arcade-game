# Milestone 9 Adversarial Challenge Report: Difficulty Scaling & Boundary Stress

**Agent**: `m9_challenger_1` (Role: Difficulty Scaling & Boundary Stress Challenger)  
**Date**: 2026-09-03  
**Project**: Galaga Arcade Web Game (`/Users/user/src/galog`)  
**Verdict**: **`APPROVE`**

---

## 1. Executive Summary

As the empirical challenger specializing in Difficulty Scaling, Boundary Stress, and Stage Badging for Milestone 9, I conducted exhaustive stress testing, edge-case mining, and mathematical oracle verification across `src/systems/DifficultyCalculator.ts` and `src/ui/HUD.ts`.

All requirements from the dispatch and authoritative architecture documents were verified empirically:
1. **Every single stage from 1 to 50** was individually evaluated:
   - `getDiveSpeedMultiplier(s)` satisfies **strict monotonic increase** from 1.000x to 1.800x.
   - `getDiveInterval(s)` satisfies **strict monotonic exponential decay** from 3.50s down to 0.80s.
   - `getMaxConcurrentDivers(s)` satisfies **monotonic integer step progression** from 1 to 6.
   - `getEnemyBulletSpeed(s)` satisfies **monotonic velocity scaling** clamped in [180, 320] px/s.
   - **Zero NaN, zero undefined**, and zero non-finite values across all 50 stages.
2. **Extreme Stage Stress Testing**:
   - For stages $s \in \{51, 60, 100, 500, 1000, 10000, 1000000\}$, bullet speed **never exceeds 320 px/s** (strictly clamped at 320 px/s).
   - Dive speed multiplier is strictly clamped to $\le 1.800$, dive interval is clamped to $\ge 0.80$s, and concurrent divers is clamped to $\le 6$.
   - Lower out-of-bounds stages ($s \le 0$, negative infinity) safely clamp to Stage 1 baselines.
3. **Greedy Stage Badge Decomposition Oracle**:
   - For all integers $1 \le s \le 50$, the sum of badge values **strictly equals the stage number** ($\sum \text{value}(b) \equiv s$).
   - The maximum badge width is **48 px** (at Stage 49: 1x30, 1x10, 1x5, 4x1 = 7 badges), fitting safely within the HUD budget ($< 120$ px).
   - The screen clearance to the reserve lives barrier ($x = 81$) is **$\ge 87$ px** for all stages 1–50, with leftmost badge coordinate at $x \ge 168$ px (well above the $96$ px crowding guard).
   - An independent dynamic programming coin-change oracle proved that greedy decomposition produces the mathematically minimal badge count for all integers 1 to 50.

All 24 adversarial unit tests in `tests/unit/m9_challenger_1_adversarial.test.ts` pass with 100% success rate, and production build compiles cleanly with zero TypeScript errors.

---

## 2. Empirical Verification Table (Stages 1–50)

The table below reflects raw empirical data harvested via runtime script execution of `DifficultyCalculator` and `HUD` across all 50 campaign stages:

| Stage | Tier | DiveSpeedMult | DiveInterval | MaxDivers | BulletSpeed | Challenging? | Greedy Badges | Total Badges | Total Width | Screen Clearance |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | CLASSIC | 1.000x | 3.50s | 1 | 180 px/s | NO | 1 | 1 | 4 px | 131 px |
| 2 | CLASSIC | 1.029x | 3.40s | 2 | 188 px/s | NO | 1+1 | 2 | 10 px | 125 px |
| 3 | CLASSIC | 1.053x | 3.30s | 2 | 193 px/s | YES | 1+1+1 | 3 | 16 px | 119 px |
| 4 | CLASSIC | 1.074x | 3.20s | 2 | 197 px/s | NO | 1+1+1+1 | 4 | 22 px | 113 px |
| 5 | CLASSIC | 1.095x | 3.10s | 2 | 201 px/s | NO | 5 | 1 | 5 px | 130 px |
| 6 | CLASSIC | 1.115x | 3.01s | 3 | 205 px/s | NO | 5+1 | 2 | 11 px | 124 px |
| 7 | CLASSIC | 1.134x | 2.92s | 3 | 209 px/s | YES | 5+1+1 | 3 | 17 px | 118 px |
| 8 | CLASSIC | 1.153x | 2.83s | 3 | 213 px/s | NO | 5+1+1+1 | 4 | 23 px | 112 px |
| 9 | CLASSIC | 1.171x | 2.75s | 3 | 216 px/s | NO | 5+1+1+1+1 | 5 | 29 px | 106 px |
| 10 | CLASSIC | 1.189x | 2.67s | 3 | 219 px/s | NO | 10 | 1 | 7 px | 128 px |
| 11 | ELITE | 1.207x | 2.59s | 3 | 223 px/s | YES | 10+1 | 2 | 13 px | 122 px |
| 12 | ELITE | 1.225x | 2.51s | 3 | 226 px/s | NO | 10+1+1 | 3 | 19 px | 116 px |
| 13 | ELITE | 1.242x | 2.44s | 3 | 229 px/s | NO | 10+1+1+1 | 4 | 25 px | 110 px |
| 14 | ELITE | 1.259x | 2.37s | 3 | 232 px/s | NO | 10+1+1+1+1 | 5 | 31 px | 104 px |
| 15 | ELITE | 1.276x | 2.30s | 4 | 235 px/s | YES | 10+5 | 2 | 14 px | 121 px |
| 16 | ELITE | 1.292x | 2.23s | 4 | 238 px/s | NO | 10+5+1 | 3 | 20 px | 115 px |
| 17 | ELITE | 1.309x | 2.16s | 4 | 240 px/s | NO | 10+5+1+1 | 4 | 26 px | 109 px |
| 18 | ELITE | 1.325x | 2.10s | 4 | 243 px/s | NO | 10+5+1+1+1 | 5 | 32 px | 103 px |
| 19 | ELITE | 1.342x | 2.04s | 4 | 246 px/s | YES | 10+5+1+1+1+1 | 6 | 38 px | 97 px |
| 20 | ELITE | 1.358x | 1.97s | 4 | 249 px/s | NO | 20 | 1 | 8 px | 127 px |
| 21 | ELITE | 1.374x | 1.92s | 4 | 251 px/s | NO | 20+1 | 2 | 14 px | 121 px |
| 22 | ELITE | 1.389x | 1.86s | 4 | 254 px/s | NO | 20+1+1 | 3 | 20 px | 115 px |
| 23 | ELITE | 1.405x | 1.80s | 4 | 257 px/s | YES | 20+1+1+1 | 4 | 26 px | 109 px |
| 24 | ELITE | 1.421x | 1.75s | 4 | 259 px/s | NO | 20+1+1+1+1 | 5 | 32 px | 103 px |
| 25 | ELITE | 1.436x | 1.70s | 4 | 262 px/s | NO | 20+5 | 2 | 15 px | 120 px |
| 26 | DREADNOUGHT | 1.452x | 1.65s | 4 | 265 px/s | NO | 20+5+1 | 3 | 21 px | 114 px |
| 27 | DREADNOUGHT | 1.467x | 1.60s | 5 | 267 px/s | YES | 20+5+1+1 | 4 | 27 px | 108 px |
| 28 | DREADNOUGHT | 1.482x | 1.55s | 5 | 270 px/s | NO | 20+5+1+1+1 | 5 | 33 px | 102 px |
| 29 | DREADNOUGHT | 1.497x | 1.51s | 5 | 272 px/s | NO | 20+5+1+1+1+1 | 6 | 39 px | 96 px |
| 30 | DREADNOUGHT | 1.512x | 1.46s | 5 | 274 px/s | NO | 30 | 1 | 8 px | 127 px |
| 31 | DREADNOUGHT | 1.527x | 1.42s | 5 | 277 px/s | YES | 30+1 | 2 | 14 px | 121 px |
| 32 | DREADNOUGHT | 1.542x | 1.38s | 5 | 279 px/s | NO | 30+1+1 | 3 | 20 px | 115 px |
| 33 | DREADNOUGHT | 1.557x | 1.33s | 5 | 282 px/s | NO | 30+1+1+1 | 4 | 26 px | 109 px |
| 34 | DREADNOUGHT | 1.572x | 1.30s | 5 | 284 px/s | NO | 30+1+1+1+1 | 5 | 32 px | 103 px |
| 35 | DREADNOUGHT | 1.586x | 1.26s | 5 | 286 px/s | YES | 30+5 | 2 | 15 px | 120 px |
| 36 | DREADNOUGHT | 1.601x | 1.22s | 5 | 289 px/s | NO | 30+5+1 | 3 | 21 px | 114 px |
| 37 | DREADNOUGHT | 1.616x | 1.18s | 5 | 291 px/s | NO | 30+5+1+1 | 4 | 27 px | 108 px |
| 38 | DREADNOUGHT | 1.630x | 1.15s | 5 | 293 px/s | NO | 30+5+1+1+1 | 5 | 33 px | 102 px |
| 39 | DREADNOUGHT | 1.645x | 1.11s | 5 | 296 px/s | YES | 30+5+1+1+1+1 | 6 | 39 px | 96 px |
| 40 | DREADNOUGHT | 1.659x | 1.08s | 6 | 298 px/s | NO | 30+10 | 2 | 17 px | 118 px |
| 41 | DREADNOUGHT | 1.673x | 1.05s | 6 | 300 px/s | NO | 30+10+1 | 3 | 23 px | 112 px |
| 42 | DREADNOUGHT | 1.688x | 1.02s | 6 | 302 px/s | NO | 30+10+1+1 | 4 | 29 px | 106 px |
| 43 | DREADNOUGHT | 1.702x | 0.99s | 6 | 305 px/s | YES | 30+10+1+1+1 | 5 | 35 px | 100 px |
| 44 | DREADNOUGHT | 1.716x | 0.96s | 6 | 307 px/s | NO | 30+10+1+1+1+1 | 6 | 41 px | 94 px |
| 45 | DREADNOUGHT | 1.730x | 0.93s | 6 | 309 px/s | NO | 30+10+5 | 3 | 24 px | 111 px |
| 46 | DREADNOUGHT | 1.744x | 0.90s | 6 | 311 px/s | NO | 30+10+5+1 | 4 | 30 px | 105 px |
| 47 | DREADNOUGHT | 1.758x | 0.88s | 6 | 314 px/s | YES | 30+10+5+1+1 | 5 | 36 px | 99 px |
| 48 | DREADNOUGHT | 1.772x | 0.85s | 6 | 316 px/s | NO | 30+10+5+1+1+1 | 6 | 42 px | 93 px |
| 49 | DREADNOUGHT | 1.786x | 0.82s | 6 | 318 px/s | NO | 30+10+5+1+1+1+1 | 7 | 48 px | 87 px |
| 50 | DREADNOUGHT | 1.800x | 0.80s | 6 | 320 px/s | NO | 50 | 1 | 10 px | 125 px |

---

## 3. Mathematical Analysis & Monotonicity Proofs

### 3.1 Dive Speed Multiplier
- **Formula**: $v(s) = 1.000 + 0.800 \times \left(\frac{s - 1}{49}\right)^{0.85}$, rounded to 3 decimal places.
- **Empirical Check**:
  - $v(1) = 1.000\text{x}$.
  - $v(50) = 1.800\text{x}$.
  - $v(s+1) - v(s) \in [+0.014, +0.029]$ across every step $s \in [1, 49]$.
  - $\min_{s}(v(s+1) - v(s)) = +0.014 > 0$.
- **Result**: **Strictly increasing (100% PASS)**.

### 3.2 Dive Interval
- **Formula**: $I(s) = 3.50 \times \left(\frac{0.80}{3.50}\right)^{\frac{s - 1}{49}}$, rounded to 2 decimal places.
- **Empirical Check**:
  - $I(1) = 3.50\text{s}$.
  - $I(50) = 0.80\text{s}$.
  - $I(s+1) - I(s) \in [-0.10, -0.02]$ across every step $s \in [1, 49]$.
  - $\max_{s}(I(s+1) - I(s)) = -0.02 < 0$.
- **Result**: **Strictly decreasing exponential decay (100% PASS)**.

### 3.3 Max Concurrent Divers
- **Step Ladder**:
  - Stage 1: 1 diver
  - Stages 2–5: 2 divers
  - Stages 6–14: 3 divers
  - Stages 15–26: 4 divers
  - Stages 27–39: 5 divers
  - Stages 40–50: 6 divers
- **Empirical Check**:
  - Discrete integer step function $m(s) \in \{1, 2, 3, 4, 5, 6\}$.
  - $m(s+1) \ge m(s)$ for all $s \in [1, 49]$.
- **Result**: **Monotonically non-decreasing (100% PASS)**.

### 3.4 Enemy Bullet Velocity
- **Formula**: $v_b(s) = \min\left(320, \max\left(180, \text{round}\left(180 + 140 \times \left(\frac{s - 1}{49}\right)^{0.75}\right)\right)\right)$.
- **Empirical Check**:
  - $v_b(1) = 180\text{ px/s}$.
  - $v_b(50) = 320\text{ px/s}$.
  - Non-decreasing step progression across stages 1..50.
- **Result**: **Monotonically non-decreasing, clamped to [180, 320] px/s (100% PASS)**.

---

## 4. Extreme Stage Testing & Invariant Hardening

Adversarial boundary stress tests were executed against non-standard stage inputs:

| Input Stage ($s$) | `getEnemyBulletSpeed(s)` | Cap Invariant ($\le 320$) | `getDiveSpeedMultiplier(s)` | `getDiveInterval(s)` | `getMaxConcurrentDivers(s)` |
|:---|:---:|:---:|:---:|:---:|:---:|
| 50 | 320 px/s | PASS | 1.800x | 0.80s | 6 |
| 51 | 320 px/s | PASS | 1.800x | 0.80s | 6 |
| 60 | 320 px/s | PASS | 1.800x | 0.80s | 6 |
| 100 | 320 px/s | PASS | 1.800x | 0.80s | 6 |
| 500 | 320 px/s | PASS | 1.800x | 0.80s | 6 |
| 1,000 | 320 px/s | PASS | 1.800x | 0.80s | 6 |
| 10,000 | 320 px/s | PASS | 1.800x | 0.80s | 6 |
| 1,000,000 | 320 px/s | PASS | 1.800x | 0.80s | 6 |
| 0 | 180 px/s | PASS ($\ge 180$) | 1.000x | 3.50s | 1 |
| -1 | 180 px/s | PASS ($\ge 180$) | 1.000x | 3.50s | 1 |
| -999 | 180 px/s | PASS ($\ge 180$) | 1.000x | 3.50s | 1 |
| -$\infty$ | 180 px/s | PASS ($\ge 180$) | 1.000x | 3.50s | 1 |
| 14.7 (float) | 232 px/s (= s=14) | PASS | 1.259x | 2.37s | 3 |

**Finding**: The implementation protects itself via internal clamping:
```typescript
const s = Math.max(DifficultyCalculator.MIN_STAGE, Math.min(DifficultyCalculator.MAX_STAGE, Math.floor(stage)));
```
This guarantees mathematical stability under all possible numeric inputs, preventing runaway velocity or degenerate state corruption.

---

## 5. Greedy Stage Badge Decomposition Oracle

### 5.1 Sum Equivalence Proof
For every integer $s \in [1, 50]$, `HUD.decomposeStage(s)` was evaluated. The sum of the evaluated denominations ($50, 30, 20, 10, 5, 1$) was computed:
$$\sum_{b \in \text{badges}} \text{value}(b) \equiv s \quad (\forall s \in [1, 50])$$
**Result**: 50/50 stages satisfied exact identity (0 mismatches).

### 5.2 HUD Layout Width & Clearance Proof
- **Badge Widths**:
  - `FLAG_50`: 10 px
  - `FLAG_30`: 8 px
  - `FLAG_20`: 8 px
  - `FLAG_10`: 7 px
  - `FLAG_5`: 5 px
  - `FLAG_1`: 4 px
- **Inter-Badge Spacing**: 2 px between adjacent flags.
- **HUD Constraints**:
  - Total virtual width: 224 px.
  - Right margin anchor: $X = 216$ px.
  - Reserve lives barrier: 5 mini-fighters at $X = 12 + 4 \times 14 + 13 = 81$ px.
  - Crowding safety limit: $X < 96$ px.
  - Budget requirement: $\text{Total Width} < 120$ px.
- **Worst-Case Analysis**:
  - Occurs at **Stage 49**: Decomposes into `[FLAG_30, FLAG_10, FLAG_5, FLAG_1, FLAG_1, FLAG_1, FLAG_1]` (7 badges).
  - Width $= 8 + 2 + 7 + 2 + 5 + 2 + 4 + 2 + 4 + 2 + 4 + 2 + 4 = \mathbf{48\text{ px}}$.
  - $\mathbf{48\text{ px} \ll 120\text{ px}}$ (only 40% of budget consumed; 60% safety buffer).
  - Leftmost badge coordinate: $216 - 48 = \mathbf{168\text{ px}}$.
  - Screen clearance to lives barrier: $168 - 81 = \mathbf{87\text{ px}}$.
  - Screen clearance to crowding guard: $168 - 96 = \mathbf{72\text{ px}}$.
- **Result**: **HUD budget and clearance invariants strictly satisfied with large safety margins (100% PASS)**.

### 5.3 Independent Dynamic Programming Optimality Proof
An independent DP solver for minimum coins was constructed:
$$\text{DP}[n] = \min_{c \in \{50, 30, 20, 10, 5, 1\}} (1 + \text{DP}[n - c]), \quad \text{DP}[0] = 0$$
Across all integers $1 \le s \le 50$, `HUD.decomposeStage(s).totalBadges === minBadgesDP(s)`.
**Result**: Greedy decomposition achieves mathematically optimal badge counts across all 50 stages.

---

## 6. Test Suite & Build Verification

1. **Adversarial Test Suite (`tests/unit/m9_challenger_1_adversarial.test.ts`)**:
   - 24 tests covering monotonicity, boundary clamping, badge math, layout clearance, DP optimality, tier transitions, shot quotas, and health/shield quotas.
   - **Result**: `24 passed (24)` in 115ms.
2. **Worker Difficulty Test Suite (`tests/unit/difficulty.test.ts`)**:
   - 29 tests covering progression curves, acrobatic waves, 0-bullet suppression, kinetic shields, badge matrices, and procedural palettes.
   - **Result**: `29 passed (29)` in 379ms.
3. **Production Build (`npm run build`)**:
   - `tsc --noEmit && vite build` completed with clean exit code 0 in 5.93s.
   - Generated bundles: `dist/index.html` (5.60 kB), `dist/assets/index-wu4NoX3d.js` (161.07 kB).

---

## 7. Challenge Verdict

Based on direct empirical measurement and mathematical verification:

| Criterion | Expected | Observed | Status |
|---|---|---|:---:|
| Dive Speed Multiplier | Strictly increasing in [1.000, 1.800] | $+0.014$ to $+0.029$/stage, 0 NaN | PASS |
| Dive Interval Decay | Strictly decreasing in [0.80, 3.50] | $-0.02$ to $-0.10$/stage, 0 NaN | PASS |
| Max Concurrent Divers | Monotonic step ladder [1, 6] | Steps 1, 2, 3, 4, 5, 6 | PASS |
| Bullet Velocity Clamping | Monotonic in [180, 320] px/s | Clamped strictly at $\le 320$ px/s up to $s = 1,000,000$ | PASS |
| Badge Decomposition Sum | $\sum \text{value}(b) \equiv s$ for all $s \in [1, 50]$ | Exact match across all 50 stages | PASS |
| HUD Badge Width Budget | $\text{Width} < 120$ px | Max 48 px at Stage 49 (60% margin) | PASS |
| HUD Screen Clearance | $\text{Clearance} \ge 87$ px to lives | Minimum 87 px at Stage 49 | PASS |
| TypeScript & Vite Build | Clean compilation, 0 errors | Exit code 0, 161 kB bundle | PASS |

**FINAL VERDICT: `APPROVE`**
