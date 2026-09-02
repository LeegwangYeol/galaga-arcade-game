# Milestone 3 (Player & Dual Fighter) Quality & Adversarial Review Analysis

**Reviewer**: `m3_reviewer_1` (Reviewer & Adversarial Critic)  
**Date**: 2026-09-02  
**Target Files**:
- `src/entities/Player.ts`
- `src/entities/Bullet.ts`
- `src/renderer/SpriteRenderer.ts`
- `src/core/Game.ts`
- `tests/unit/player.test.ts`
- `tests/unit/m3_challenger_1_adversarial.test.ts`
- `tests/unit/m3_challenger_2_adversarial.test.ts`

---

## 1. Executive Summary

**Verdict**: **REQUEST_CHANGES**

- **Correctness & Architecture**: Milestone 3 implementation delivers high-quality procedural offscreen sprite rendering (`SpriteRenderer.ts`), a zero-allocation pooled projectile subsystem (`Bullet.ts`), and rich 7-state Player FSM kinematics (`Player.ts`).
- **Build Status**:
  - `npm run typecheck`: **PASS** (0 errors)
  - `npm run build`: **PASS** (Vite production bundle generated in `dist/`)
  - `npx playwright test --workers=1 --project=chromium`: **PASS** (15/15 tests passing)
- **Test Failure**:
  - `npm test`: **FAIL** (1 test failed out of 247 tests in `tests/unit/m3_challenger_2_adversarial.test.ts`).
- **Primary Finding**: `Player.ts` `canFire` and `attemptFire()` do not guard against non-controllable states (`capturing`, `captured`, `destroyed`), permitting weapon firing while the ship is destroyed or being tractor-beamed.

---

## 2. Review Dimensions & Detailed Findings

### [Major] Finding 1: Unrestricted Weapon Firing in Non-Controllable States (`capturing`, `captured`, `destroyed`)

- **Location**: `src/entities/Player.ts` (lines 160–167, lines 365–378)
- **Observed Behavior**:
  - `player.canFire` only checks `fireCooldownTimer <= 0` and `activeMissileCount`.
  - `player.attemptFire()` only checks `fireCooldownTimer > 0` and `activeMissileCount`.
  - When `player.state` is set to `'capturing'`, `'captured'`, or `'destroyed'`, calling `player.attemptFire()` returns `true` and dispatches `onFire` requests.
- **Why this is a problem**:
  - Violates the 7-state FSM interface contract: a ship undergoing tractor beam capture or exploding into debris should not be able to fire missiles.
  - Causes test failure in `tests/unit/m3_challenger_2_adversarial.test.ts`:
    `AssertionError: expected true to be false` on `expect(player.attemptFire()).toBe(false)` for non-controllable states.
- **Suggested Fix**:
  In `src/entities/Player.ts`:
  1. In `canFire`:
     ```typescript
     public get canFire(): boolean {
       const s = this._state;
       if (
         s === 'capturing' ||
         s === 'CAPTURING' ||
         s === 'captured' ||
         s === 'CAPTURED' ||
         s === 'destroyed' ||
         s === 'DESTROYED'
       ) {
         return false;
       }
       const isDual = this.isDual;
       const maxMissiles = isDual ? 4 : 2;
       if (isDual) {
         return this.fireCooldownTimer <= 0 && this.activeMissileCount <= maxMissiles - 2;
       }
       return this.fireCooldownTimer <= 0 && this.activeMissileCount < maxMissiles;
     }
     ```
  2. In `attemptFire()`:
     ```typescript
     public attemptFire(): boolean {
       if (!this.canFire) {
         return false;
       }
       ...
     ```

---

## 3. Verification of Requirements & Claims

| Requirement / Claim | Specification | Verification Method | Status | Notes |
|---|---|---|---|---|
| **7-State FSM** | `normal`, `capturing`, `captured`, `docking`, `dual`, `destroyed`, `respawning` | Code inspection & unit tests | **PASS (with Finding 1)** | States and lifecycle transitions correctly implemented; uppercase/lowercase normalization supported. |
| **Dual Fighter Docking** | Rescued fighter descends at 120 px/s, converges to slot, merges into dual | Unit test + simulation test | **PASS** | Smooth $6.0\cdot dt$ lerp, transitions cleanly to dual, fires `onDocked`. |
| **Twin Hulls (32px)** | Single 16px ($[12, 212]$), Dual 32px ($[16, 208]$) | Clamping unit tests | **PASS** | Strict clamping prevents off-screen clipping. |
| **Missile Quota** | Single: max 2, Dual: max 4 twin missiles | `BulletManager` & `Player` tests | **PASS** | Synchronous active count tracking with `ObjectPool<Bullet>`. |
| **Asymmetrical Partial Destruction** | Left hull hit $\to$ $+8\text{px}$, Right hull hit $\to$ $-8\text{px}$, lives preserved | Unit tests in `player.test.ts` & `m3_challenger_1` | **PASS** | Lives preserved on single-hull loss; full destruction decrements life. |
| **3.0s Invulnerability** | 3.0s timer, 10Hz blinking, collision immunity | Timer tests & visual render check | **PASS** | Properly ignores threats and tractor beam while active. |
| **Life Deduction** | Normal destroy: $-1$, Catastrophic dual: $-1$, Captured: $-1$, Partial dual: $0$ | Exhaustive state tests | **PASS** | Correctly respawns if lives > 0 or triggers `onGameOver` if lives == 0. |
| **Build & Typecheck** | `tsc --noEmit` & `vite build` | CLI execution | **PASS** | Clean build, 0 type errors. |
| **Unit Test Suite** | `npm test` | Vitest execution | **FAIL (1 test)** | 246 passed, 1 failed (`m3_challenger_2_adversarial.test.ts`). |
| **Integrity Audit** | Check for facades, hardcoded answers, bypasses | Codebase audit | **PASS** | Genuine procedural math, zero GC pooling, no hardcoded cheating. |

---

## 4. Adversarial Stress-Test Findings

1. **Simultaneous Multi-State Docking Interruption**:
   - Stress-tested lethality during docking: If player ship is destroyed during docking, rescued fighter is immediately deactivated and player respawns as single fighter.
   - Stress-tested tractor beam attempt during docking: `startCapture` is correctly rejected while docking.
2. **Extreme Edge Docking**:
   - Rescued ship docking when player is at extreme left edge ($x=12$): clamps cleanly to $x=16$ upon dual transition without NaN or out-of-bounds glitch.
3. **Swept CCD Against Tunneling**:
   - Bullet swept AABB correctly spans $[y_{\text{prev}}, y_{\text{curr}}]$ covering the full $8\text{px}$ single-frame step at $480\text{ px/s}$.
4. **Pool Integrity & Anti-Leak**:
   - Defensive double-release in `BulletManager` prevents counter underflow.
   - Out-of-bounds recycling safely handles all 4 screen quadrants.

---

## 5. Conclusion & Action Items

To achieve full approval and milestone completion:
1. Apply the state check fix in `src/entities/Player.ts` for `canFire` / `attemptFire()` to block weapon firing during `capturing`, `captured`, and `destroyed` states.
2. Re-run `npm test` to confirm all 247 tests pass.
