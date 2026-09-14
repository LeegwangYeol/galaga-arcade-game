# Investigation Report: Milestone 11 Headless Canvas Mock Crash & System Audit

**Agent**: `m11_fix2_explorer_3`  
**Working Directory**: `/Users/user/src/galog/.agents/m11_fix2_explorer_3`  
**Date**: 2026-09-04  
**Target Repository**: `/Users/user/src/galog`  
**Status**: COMPLETE (Read-Only Exploration)  

---

## Executive Summary

An unhandled runtime error was identified in `m11_rem_challenger_1/handoff.md` during headless simulation of the Galaga game engine: `TypeError: ctx.quadraticCurveTo is not a function`.

This investigation conducted a complete empirical and source-code audit across:
1. **The Root Cause**: `src/core/Game.ts` provides a fallback `CanvasRenderingContext2D` mock for headless/test environments where `HTMLCanvasElement.getContext('2d')` returns null. This fallback mock omitted `quadraticCurveTo`.
2. **All 11 Crisis Events Render Methods**: Exhaustive analysis and empirical execution of `render(ctx)` across all 11 crisis events (`TheContingency`, `TheUnbidden`, `ThePrethorynScourge`, `ShieldOverload`, `PhysicsInversion`, `HyperspaceStorm`, `NaniteCloud`, `PsionicResonance`, `DevouringSwarmFrenzy`, `NemesisStarEater`, `TimeDilationField`) and `CrisisEventManager`. Exactly 1 event (`ThePrethorynScourgeEvent`) utilizes `ctx.quadraticCurveTo(8, 144, 0, 288)` to render biological tendrils. All other 10 events' canvas method requirements are already satisfied by `Game.ts`.
3. **PowerUpManager Zero-GC & 32-Item Clamping Audit**: Thorough verification of `src/core/powerups/PowerUpManager.ts`, `ObjectPool.ts`, and test suites `m11_challenger_1_adversarial.test.ts` and `powerups.test.ts`. Confirmed 100% compliance with zero-GC invariants: fixed 32 pre-allocated entities, `autoExpand: false`, O(1) swap-and-pop release, zero heap allocation at runtime, and graceful `null` return on saturation.
4. **Exact Fix Formulation**: Defined the precise code replacement chunk for `src/core/Game.ts` lines 178–195 and proposed a regression test to prevent future mock desynchronization.

---

## 1. Examination of the Failure Case

### 1.1 Trigger Conditions & Stack Trace
When `game.render()` is invoked in a headless environment (Node.js, Vitest, Playwright without GPU, or `tsx`) while `ThePrethorynScourgeEvent` is active (in either `STAGE_INTRO` or `PLAYING` game states):

```
/Users/user/src/galog/src/core/crisis/events/ThePrethorynScourgeEvent.ts:153
    ctx.quadraticCurveTo(8, 144, 0, 288);
        ^
TypeError: ctx.quadraticCurveTo is not a function
    at ThePrethorynScourgeEvent.render (/Users/user/src/galog/src/core/crisis/events/ThePrethorynScourgeEvent.ts:153:9)
    at CrisisEventManager.render (/Users/user/src/galog/src/core/crisis/CrisisEventManager.ts:197:26)
    at Game.render (/Users/user/src/galog/src/core/Game.ts:970:33)
```

### 1.2 Underlying Mechanism
- **File**: `src/core/crisis/events/ThePrethorynScourgeEvent.ts`, lines 151–156:
  ```ts
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(8, 144, 0, 288);
  ctx.moveTo(224, 0);
  ctx.quadraticCurveTo(216, 144, 224, 288);
  ctx.stroke();
  ```
- **Fallback Mock**: In `src/core/Game.ts`, lines 158–195:
  ```ts
  if (!ctx) {
    this.ctx = {
      canvas: this.canvas,
      fillStyle: '#000000',
      strokeStyle: '#FFFFFF',
      font: '8px monospace',
      textAlign: 'center',
      textBaseline: 'middle',
      globalAlpha: 1.0,
      lineWidth: 1,
      shadowBlur: 0,
      shadowColor: '#000000',
      imageSmoothingEnabled: false,
      fillRect: () => {},
      fillText: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      fill: () => {},
      ellipse: () => {},
      save: () => {},
      restore: () => {},
      drawImage: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      arc: () => {},
      stroke: () => {},
      setLineDash: () => {},
      getLineDash: () => [],
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 0 }),
    } as unknown as CanvasRenderingContext2D;
  }
  ```
- Notice that `moveTo: () => {}` and `lineTo: () => {}` are present, but `quadraticCurveTo` was accidentally omitted during previous remediation.

### 1.3 Why Did Unit Tests Pass Previously?
In `tests/unit/crisis.test.ts` (lines 63–88), the test file created its own private mock:
```ts
function createMockCanvasContext(): CanvasRenderingContext2D {
  return {
    ...
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    quadraticCurveTo: vi.fn(), // <--- Defined in the isolated test mock!
    ...
  } as unknown as CanvasRenderingContext2D;
}
```
Because the unit test injected its own mock into `event.render(mockCtx)`, it masked the fact that `Game.ts`'s internal engine mock was missing `quadraticCurveTo`. When any integration test or simulation initialized `new Game()` and called `game.render()`, the missing method surfaced immediately.

---

## 2. Comprehensive Audit of All 11 Crisis Events and their Render Methods

An exhaustive line-by-line audit of `src/core/crisis/events/*.ts` and `CrisisEventManager.ts` was performed.

### 2.1 Crisis Render Methods & Canvas 2D API Usage Matrix

| # | Crisis Event File | Methods & Properties Invoked on `ctx` | Covered by `Game.ts` Mock? | Status |
|---|---|---|---|---|
| 1 | `DevouringSwarmFrenzyEvent.ts` | `save`, `fillStyle`, `fillRect`, `restore` | YES | PASS |
| 2 | `HyperspaceStormEvent.ts` | `save`, `fillStyle`, `fillRect`, `strokeStyle`, `lineWidth`, `strokeRect`, `beginPath`, `moveTo`, `lineTo`, `stroke`, `restore` | YES | PASS |
| 3 | `NaniteCloudEvent.ts` | `save`, `fillStyle`, `beginPath`, `ellipse` (with `arc` fallback), `fill`, `fillRect`, `globalAlpha`, `restore` | YES | PASS |
| 4 | `NemesisStarEaterEvent.ts` | `save`, `fillStyle`, `fillRect`, `restore` | YES | PASS |
| 5 | `PhysicsInversionEvent.ts` | `save`, `strokeStyle`, `lineWidth`, `beginPath`, `moveTo`, `lineTo`, `stroke`, `fillStyle`, `fillText`, `restore` | YES | PASS |
| 6 | `PsionicResonanceEvent.ts` | `save`, `globalAlpha`, `strokeStyle`, `lineWidth`, `strokeRect`, `fillStyle`, `fillRect`, `restore` | YES | PASS |
| 7 | `ShieldOverloadEvent.ts` | `save`, `strokeStyle`, `lineWidth`, `beginPath`, `moveTo`, `lineTo`, `stroke`, `closePath`, `fillStyle`, `fillRect`, `restore` | YES | PASS |
| 8 | `TheContingencyEvent.ts` | `save`, `fillStyle`, `fillRect`, `strokeStyle`, `lineWidth`, `beginPath`, `arc`, `stroke`, `restore` | YES | PASS |
| 9 | `ThePrethorynScourgeEvent.ts` | `save`, `strokeStyle`, `lineWidth`, `beginPath`, `moveTo`, `quadraticCurveTo`, `stroke`, `fillStyle`, `fillRect`, `arc`, `restore` | **NO** (`quadraticCurveTo` missing) | **FAIL** |
| 10 | `TheUnbiddenEvent.ts` | `save`, `createRadialGradient`, `addColorStop`, `fillStyle`, `beginPath`, `arc`, `fill`, `strokeStyle`, `lineWidth`, `moveTo`, `lineTo`, `stroke`, `fillRect`, `restore` | YES | PASS |
| 11 | `TimeDilationFieldEvent.ts` | `save`, `strokeStyle`, `lineWidth`, `beginPath`, `arc`, `stroke`, `restore` | YES | PASS |
| — | `CrisisEventManager.ts` (Warning Banner) | `save`, `fillStyle`, `fillRect`, `strokeStyle`, `lineWidth`, `strokeRect`, `font`, `textAlign`, `textBaseline`, `fillText`, `restore` | YES | PASS |

### 2.2 Empirical Verification Across All 11 Events
We executed an empirical headless runner iterating across every `CrisisEventType` in `STAGE_INTRO`, `PLAYING`, and `WARNING` states:
- **Baseline Run (Pre-fix)**:
  - `THE_CONTINGENCY`: PASS
  - `THE_UNBIDDEN`: PASS
  - `THE_PRETHORYN_SCOURGE`: **FAILED** (`TypeError: ctx.quadraticCurveTo is not a function`)
  - `SHIELD_OVERLOAD`: PASS
  - `PHYSICS_INVERSION`: PASS
  - `HYPERSPACE_STORM`: PASS
  - `NANITE_CLOUD`: PASS
  - `PSIONIC_RESONANCE`: PASS
  - `DEVOURING_SWARM_FRENZY`: PASS
  - `NEMESIS_STAR_EATER`: PASS
  - `TIME_DILATION_FIELD`: PASS
- **Run with `(game.ctx as any).quadraticCurveTo = () => {}`**:
  - All 11 events: **100% SUCCESS** in both `STAGE_INTRO` and `PLAYING` states.

---

## 3. Review of PowerUpManager: Zero-GC Invariants & 32-Item Clamping

### 3.1 Source Architecture Audit (`src/core/powerups/PowerUpManager.ts`)
- **Constants**:
  - `POOL_CAPACITY = 32`
  - `POOL_MAX_SIZE = 32`
- **ObjectPool Construction**:
  ```ts
  this.pool = new ObjectPool<PowerUpItem>({
    factory: () => new PowerUpItem(this.nextItemId++),
    reset: (item: PowerUpItem) => item.reset(),
    initialSize: PowerUpManager.POOL_CAPACITY, // 32
    maxSize: PowerUpManager.POOL_MAX_SIZE,     // 32
    autoExpand: false,                         // No dynamic expansion
  });
  ```
- **Lifecycle & Allocation Checks**:
  1. **Pre-allocation**: At instantiation, `ObjectPool.preallocate(32)` runs, filling the dense array `storage` with exactly 32 `PowerUpItem` instances.
  2. **Acquire**:
     - When `activeCount < 32`: Returns `storage[activeCount++]` in O(1) time.
     - When `activeCount >= 32`: Since `autoExpand` is `false`, immediately returns `null`. No heap expansion, no thrown exceptions, no memory leak.
  3. **Release**:
     - Swap-and-pop in O(1) time within the existing `storage` array: swaps released item with `storage[activeCount - 1]`, decrements `activeCount`, calls `item.reset()`.
     - No array resizing (`storage.length` remains permanently 32).
     - Defensive guard: checks `if (index === -1 || index >= this.activeCount) return false;` to protect against foreign objects and double-free calls.
  4. **Traversal**:
     - `forEachActive`: iterates `for (let i = 0; i < count; i++)` directly over `storage`.
     - `forEachActiveSafe`: reverse iteration `for (let i = this.activeCount - 1; i >= 0; i--)` allowing safe in-loop releases without allocating temporary arrays.
  5. **Reset**:
     - `pool.clear()` loops over active items, invokes `resetFn`, and sets `activeCount = 0`. Zero allocation.

### 3.2 Verification of Tests (`tests/unit/m11_challenger_1_adversarial.test.ts`)
- **13 of 13 tests PASSED (41ms)**:
  - Initial capacity: `manager.getPoolSize() === 32`, `manager.getActiveCount() === 0`, `manager.getPool().getMaxSize() === 32`.
  - Rapid 40-item spawn saturation: successfully leases 32 items; items 33–40 return `null` with 0 exceptions and 0 GC reallocations.
  - 100 saturation-despawn cycles: all 32 items recycle back to pool; capacity remains strictly clamped at 32.
  - Kinematics & boundary clamping: strictly clamped to [10, 214], vy = 60 px/s downward drift, sinusoidal sway.
- **Monte Carlo Drop Rates (10,000 trials per scenario)**:
  - Challenging stages: strictly 0% drop rate (0 / 10,000).
  - Regular Zako: 12% ± 1.5%.
  - Diving Zako: 18% ± 2.0%.
  - Boss Galaga: 30% formation, 40% diving.
  - Elite (+3%) and Dreadnought (+6%) tier bonuses confirmed.

### 3.3 Verification of Combat Adversarial Tests (`tests/unit/m8_final_adversarial.test.ts`)
- Line 142 asserts:
  ```ts
  const playerBulletCount = game.getBulletManager().getPlayerBulletCount();
  expect(playerBulletCount).toBeLessThanOrEqual(p.getMaxMissileQuota());
  ```
- This dynamic check correctly accounts for `RAPID_FIRE` quota expansion (from 2 up to 4 missiles for Single Fighter, 4 up to 8 for Dual Fighter).
- 5 consecutive endurance runs passed 100% (95/95 test executions).

---

## 4. Exact Fix Formulation

### 4.1 Target File & Lines
- **Target File**: `/Users/user/src/galog/src/core/Game.ts`
- **Target Lines**: 176–195 (within `if (!ctx)` block)

### 4.2 Code Replacement

#### Before:
```ts
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        fill: () => {},
        ellipse: () => {},
        save: () => {},
        restore: () => {},
        drawImage: () => {},
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        arc: () => {},
        stroke: () => {},
        setLineDash: () => {},
        getLineDash: () => [],
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        measureText: () => ({ width: 0 }),
```

#### After:
```ts
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        quadraticCurveTo: () => {},
        bezierCurveTo: () => {},
        arcTo: () => {},
        rect: () => {},
        clip: () => {},
        fill: () => {},
        ellipse: () => {},
        save: () => {},
        restore: () => {},
        drawImage: () => {},
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        resetTransform: () => {},
        transform: () => {},
        arc: () => {},
        stroke: () => {},
        strokeText: () => {},
        setLineDash: () => {},
        getLineDash: () => [],
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createPattern: () => null,
        createImageData: () => ({ data: new Uint8ClampedArray(0), width: 0, height: 0 }),
        getImageData: () => ({ data: new Uint8ClampedArray(0), width: 0, height: 0 }),
        putImageData: () => {},
        measureText: () => ({ width: 0 }),
```

### 4.3 Automated Regression Test Recommendation
Add a new unit test into `tests/unit/crisis.test.ts` or `tests/unit/core.test.ts`:
```ts
it('renders all 11 crisis events using Game internal fallback canvas mock without errors', () => {
  for (const type of Object.values(CrisisEventType)) {
    const game = new Game();
    game.startGame();
    const cm = game.getCrisisEventManager();
    cm.forceActivate(type, 15);
    cm.update(6.0); // Transition to ACTIVE
    expect(() => game.render()).not.toThrow();
  }
});
```
This guarantees that any future changes to crisis render methods or `Game.ts`'s canvas mock will be immediately caught by `vitest run`.

---

## 5. Verification Commands

1. **Reproduction Test**:
   ```bash
   npx tsx -e "
   import { Game } from './src/core/Game';
   import { CrisisEventType } from './src/core/crisis/types';
   const game = new Game();
   game.startGame();
   const cm = game.getCrisisEventManager();
   cm.forceActivate(CrisisEventType.THE_PRETHORYN_SCOURGE, 15);
   cm.update(6.0);
   game.render();
   "
   ```
   - Pre-fix: Throws `TypeError: ctx.quadraticCurveTo is not a function` (exit code 1).
   - Post-fix: Exits code 0 with zero errors.

2. **All 11 Crisis Events Render Test**:
   ```bash
   npx tsx -e "
   import { Game } from './src/core/Game';
   import { CrisisEventType } from './src/core/crisis/types';
   for (const type of Object.values(CrisisEventType)) {
     const game = new Game();
     game.startGame();
     const cm = game.getCrisisEventManager();
     cm.forceActivate(type, 15);
     cm.update(6.0);
     game.render();
   }
   console.log('All 11 crisis events render passed!');
   "
   ```

3. **Full Vitest Suite Execution**:
   ```bash
   npx vitest run
   ```
   - Must pass 100% across all 35 test files and 755+ tests.

4. **Production Build & Typecheck**:
   ```bash
   npm run build
   ```
   - Must exit 0 with clean Vite bundle and zero TypeScript errors.
