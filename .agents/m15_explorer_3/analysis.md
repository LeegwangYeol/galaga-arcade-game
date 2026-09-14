# Milestone 15: Test Infrastructure & Verification Strategy Analysis

**Agent**: `m15_explorer_3`  
**Working Directory**: `/Users/user/teamwork_projects/galaga_game/.agents/m15_explorer_3`  
**Date**: 2026-09-04  
**Status**: COMPLETE (Read-Only Investigation & Synthesis)

---

## 1. Executive Summary & Certified Baseline

A complete audit of the test infrastructure and codebase was executed.
The current baseline is **100% passing with zero regressions**:
- **Test Files**: 58 passed (100%)
- **Total Tests**: 1,035 passed (100%)
- **Test Duration**: ~2.87 seconds across multi-threaded Vitest workers.
- **Production Build**: Clean Vite 6 + TypeScript 5.7 compilation (`tsc --noEmit && vite build`) targeting `dist/` with 0 external image or audio asset dependencies.

Milestone 15 focuses on constructing the **Test Infrastructure & Verification Strategy** for automated 50-round headless traversal, memory leak profiling, and developer QA tooling:
1. **QA Cheat Controller** (`window.__GALAGA_CHEAT__`): Complete runtime interface enabling fine-grained stage jumping, crisis triggering, boss spawning, drone unlocking, energy manipulation, and god-mode toggle.
2. **Headless 50-Round Memory Benchmark** (`tests/unit/m15_50round_memory.test.ts`): Vitest automated traversal through all 50 stages with strict `< 5MB` net heap growth assertion and bounded pool capacities (`bulletPool`, `enemyPool`, `particlePool`, `missilePool`).
3. **Playwright E2E Memory Bot** (`tests/e2e/memory_bot_50round.spec.ts`): Rapid real-browser simulation through all 50 rounds verifying 0 uncaught exceptions, 0 console errors, clean DOM attachment, and intact canvas rendering context.
4. **Regression Safeguards**: Exhaustive analysis against all 58 existing test suites to prevent state pollution, broken mock expectations, or timing flakes.

---

## 2. QA Cheat Controller (`window.__GALAGA_CHEAT__`) Architecture

### 2.1 Interface Definition Contract

```typescript
export interface IGalagaCheatAPI {
  /**
   * Skips immediately to the specified stage (1..50).
   * Safely disposes current stage entities, tears down active crisis events,
   * resets boss encounters, clears projectiles, and spawns the target stage.
   * @param stage Target stage integer [1..50].
   * @returns true if skipped successfully, false if input is out of bounds or invalid state.
   */
  skipToStage(stage: number): boolean;

  /**
   * Triggers or forces immediate activation of a Stellaris Crisis event by ID or alias.
   * Supports all 11 crisis events.
   * @param crisisId Crisis event identifier (case-insensitive enum or shorthand string).
   * @returns true if crisis was activated, false if invalid ID or disallowed state.
   */
  triggerCrisis(crisisId: string): boolean;

  /**
   * Spawns a multi-phase Epic Boss encounter by stage number (10, 20, 30, 40, 50) or name.
   * Cleans up standard wave formation and registers the boss into the combat loop.
   * @param bossIdOrStage Stage number or canonical boss name string.
   * @returns true if boss spawned, false if invalid boss identifier.
   */
  spawnBoss(bossIdOrStage: number | string): boolean;

  /**
   * Immediately triggers a Special Move, automatically charging energy if depleted.
   * @param moveId 'NOVA_BARRAGE' | 'CHRONO_FREEZE' | 'WARP_RAM' (or shorthands 'nova', 'chrono', 'warp').
   * @returns true if triggered, false if unknown move ID.
   */
  triggerSpecialMove(moveId: string): boolean;

  /**
   * Sets player invincibility status (God Mode).
   * In god mode, player cannot be damaged by bullets/collisions, lose shields, die, or be captured.
   * Normal ship rendering is preserved without intrusive respawn blinking.
   * @param enabled true to enable god mode, false to disable.
   * @returns Current invincibility state boolean.
   */
  setInvincible(enabled: boolean): boolean;

  /**
   * Unlocks and summons a wingman drone to aid the player.
   * @param droneType 'ESCORT' | 'AEGIS' | 'BOMBER' | 'ALL'.
   * @returns true if summoned, false if unknown drone type.
   */
  unlockDrone(droneType: string): boolean;

  /**
   * Fills the player's Special Move energy meter to 100% (maxEnergy).
   * Plays docking chime SFX if available.
   * @returns true.
   */
  fillEnergy(): boolean;

  /**
   * Instantly destroys all active enemies in formation and/or defeats the active boss.
   * Triggers stage clear sequence safely without hanging state machine.
   * @returns true if targets were eliminated, false if none active.
   */
  killAllEnemies(): boolean;
}
```

### 2.2 Global Registration & Environment Compatibility

To prevent `ReferenceError: window is not defined` in headless Node / Vitest environments while ensuring immediate availability in browser runtime, registration must check both `window` and `globalThis`:

```typescript
// Registration pattern in src/core/qa/CheatController.ts
export class CheatController implements IGalagaCheatAPI {
  constructor(private game: Game) {
    this.registerGlobal();
  }

  public registerGlobal(): void {
    if (typeof window !== 'undefined') {
      (window as any).__GALAGA_CHEAT__ = this;
    }
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).__GALAGA_CHEAT__ = this;
    }
  }

  // Implementation of all 8 methods...
}
```

### 2.3 Boundary Condition Matrix

| Method | Valid Inputs | Out-of-Bounds Inputs | Expected Behavior on Invalid Input |
|---|---|---|---|
| `skipToStage(stage)` | Integers `1` through `50` | `<= 0`, `> 50`, `NaN`, `Infinity`, `null`, `undefined`, floats (e.g. `12.5`) | Returns `false`. No state mutation, no crash. Current stage remains intact. |
| `triggerCrisis(id)` | 11 canonical enum keys, lowercase aliases (`'contingency'`, `'unbidden'`, `'scourge'`, `'shield'`, `'physics'`, `'storm'`, `'nanite'`, `'psionic'`, `'frenzy'`, `'star_eater'`, `'chrono'`) | `''`, `'INVALID'`, `'BOSS'`, numbers, `null` | Returns `false`. No crisis triggered, warning banner untouched. |
| `spawnBoss(id)` | Stages `10, 20, 30, 40, 50` or names `'CYBER_DREADNOUGHT'`, `'DIMENSIONAL_LEVIATHAN'`, `'NANITE_COLOSSUS'`, `'PSIONIC_HARBINGER'`, `'AETERNUM_CORE'` | `0, 15, 49, 99`, `-10`, `'UNKNOWN'` | Returns `false`. Existing formation untouched. |
| `triggerSpecialMove(id)` | `'NOVA_BARRAGE'`, `'CHRONO_FREEZE'`, `'WARP_RAM'` (and aliases `'nova'`, `'chrono'`, `'warp'`) | `''`, `'SPECIAL_X'`, `123` | Returns `false`. Meter and active specials unchanged. |
| `setInvincible(bool)` | `boolean` (`true` / `false`) | Non-boolean (truthy/falsy coerced safely) | Sets `player.isInvincibleCheat = Boolean(enabled)`. Returns state. |
| `unlockDrone(type)` | `'ESCORT'`, `'AEGIS'`, `'BOMBER'`, `'ALL'` | `'UNKNOWN_DRONE'`, `''` | Returns `false`. No drone state altered. |
| `fillEnergy()` | (no args) | (any args ignored) | Energy set to `100.0`. Returns `true`. |
| `killAllEnemies()` | (no args) | (any args ignored) | Kills all active formation enemies and defeats active boss. Returns `true`. |

### 2.4 State Transition Safety & Teardown Invariants

When `skipToStage(n)` is executed, the game may be in any arbitrary phase:
1. **Mid-Boss Phase Transition**:
   - Cyber Dreadnought with escort drones active.
   - Dimensional Leviathan with gravitational tears or black hole vortex active.
   - Nanite Colossus split into 4 mini-constructs.
   - Psionic Harbinger with 2 dive-bombing phantoms and telekinetic stun active.
   - Aeternum Core in Phase 2 with 60% canvas Mega-Beam charging.
   - **Safety Action**:
     - Invoke `this.bossManager.reset()`.
     - Reset `this.bossManager.activeBoss = null`.
     - Clear `this.bossManager.playerStunTimer = 0`.
     - Clear `this.bulletManager.clear()`.
     - Clear `this.particleSystem.clear()`.
2. **Active Crisis Event In-Flight**:
   - Time Dilation Field running with altered delta time multiplier.
   - The Contingency with predictive bullet trajectory hooks.
   - Physics Inversion with inverted starfield kinematic velocity.
   - Hyperspace Storm with active lightning bolt hazard rectangles.
   - Nanite Cloud with Brownian motes and projectile dissolving.
   - **Safety Action**:
     - Invoke `this.crisisEventManager.onStageClear()` or `this.crisisEventManager.reset()`.
     - Ensure `this.crisisEventManager.state = 'IDLE'`.
     - Restore `this.starfield.setSpeedState('NORMAL')`.
3. **Player Animation / Tractor Beam Capture**:
   - Player spinning along tractor beam cone (`state === 'capturing'`).
   - Rescued fighter descending in docking convergence (`state === 'docking'`).
   - Player destroyed during explosion timer (`state === 'destroyed'`).
   - **Safety Action**:
     - Reset tractor beam: `this.tractorBeam.reset()`.
     - Reset sound synth tractor beam: `this.soundSynth.stopTractorBeam()`.
     - Reset player position and state: `this.player.respawn()` or `this.player.reset(112, Player.BASELINE_Y, this.player.lives > 0 ? this.player.lives : 3)`.
4. **Game Over / Paused States**:
   - If game is in `GAME_OVER`:
     - Restore lives to 3 if `lives <= 0`.
     - Transition state: `this.setState('STAGE_INTRO')`.
   - If game is in `PAUSED`:
     - Unpause and transition to `STAGE_INTRO`.

---

## 3. Unit Test Suite Specification: `tests/unit/m15_qa_cheat.test.ts`

### 3.1 Test Suite Structure

```
tests/unit/m15_qa_cheat.test.ts
├── 1. Cheat API Attachment & Initialization
│   ├── attaches to window.__GALAGA_CHEAT__ in browser / mocked environments
│   ├── exposes all 8 required methods
│   └── reflects clean initial state
├── 2. skipToStage Method & Stage Boundaries
│   ├── successfully skips to valid stages (1, 10, 20, 27, 30, 40, 50)
│   ├── rejects stage 0 and negative stage numbers (-1, -100) with false
│   ├── rejects stage numbers exceeding 50 (51, 100, 9999) with false
│   ├── rejects non-integer and NaN inputs (3.14, NaN, Infinity) with false
│   ├── correctly identifies and spawns Boss encounters on Stages 10, 20, 30, 40, 50
│   └── correctly identifies and spawns Challenging Stages (e.g. 3, 7, 11, 27)
├── 3. State Transition Safety during skipToStage
│   ├── skips cleanly during active Boss encounter without orphaned sub-units or lasers
│   ├── skips cleanly during active Crisis event tearing down shaders and timers
│   ├── recovers from GAME_OVER state, resetting lives and entering STAGE_INTRO
│   ├── breaks tractor beam capture animation without freezing player entity
│   └── clears all active player/enemy projectiles and particles
├── 4. triggerCrisis Method & Boundaries
│   ├── triggers all 11 Crisis events by exact enum string
│   ├── triggers Crisis events using case-insensitive shorthand aliases
│   ├── rejects invalid crisis IDs ('INVALID_CRISIS', '', 'xyz') with false
│   └── safely replaces existing active crisis with new crisis
├── 5. spawnBoss Method & Boundaries
│   ├── spawns each of the 5 Bosses by stage number (10, 20, 30, 40, 50)
│   ├── spawns each Boss by string name
│   ├── rejects invalid boss stages (1, 15, 25, 49) with false
│   ├── rejects invalid boss names ('UNKNOWN_BOSS') with false
│   └── clears normal wave formation when boss is spawned
├── 6. triggerSpecialMove Method & Boundaries
│   ├── triggers NOVA_BARRAGE, launching homing salvo
│   ├── triggers CHRONO_FREEZE, freezing enemy movement
│   ├── triggers WARP_RAM, initiating invulnerable charge
│   ├── auto-fills energy meter if 0 when triggered via cheat
│   └── rejects invalid move IDs with false
├── 7. setInvincible (God Mode) Invariants
│   ├── makes player immune to enemy bullet damage
│   ├── makes player immune to enemy collision damage
│   ├── immune to tractor beam capture
│   ├── does NOT cause continuous respawn blinking in normal flight
│   └── restores normal vulnerability when disabled
├── 8. unlockDrone Method & Boundaries
│   ├── summons Escort Drone
│   ├── summons Aegis Drone
│   ├── summons Bomber Drone
│   ├── summons all 3 drones with 'ALL'
│   └── rejects unknown drone types with false
├── 9. fillEnergy & killAllEnemies
│   ├── fillEnergy sets meter to 100% and triggers chime
│   ├── killAllEnemies destroys all active formation enemies and advances stage
│   └── killAllEnemies destroys active boss and triggers defeat transition
```

---

## 4. 50-Round Memory Benchmark: `tests/unit/m15_50round_memory.test.ts`

### 4.1 Memory Profiling Architecture

1. **Warmup & JIT Stabilization**:
   - Initialize `Game`.
   - Run 120 ticks of Stage 1 with firing, collisions, particles, and starfield.
   - Invoke `if (typeof global.gc === 'function') global.gc()`.
   - Record baseline: `initialHeap = process.memoryUsage().heapUsed`.
2. **Automated 50-Round Headless Traversal**:
   - For `stage = 1` through `50`:
     - Jump to stage via `skipToStage(stage)`.
     - Execute 30 fixed-timestep update ticks (`game.update(1 / 60)`).
     - Every 5 stages, summon all drones and fire special moves.
     - Eliminate enemies via `killAllEnemies()`.
     - Assert pool capacities remain within upper bounds.
3. **Final Drift Measurement**:
   - Invoke `if (typeof global.gc === 'function') global.gc()`.
   - Record final: `finalHeap = process.memoryUsage().heapUsed`.
   - Compute drift: `netDriftMB = (finalHeap - initialHeap) / (1024 * 1024)`.
   - Assert `expect(netDriftMB).toBeLessThan(5.0)`.

### 4.2 Pool Capacity Invariant Integration

In the existing codebase, `FormationManager.ts` instantiated 40 `new Enemy(...)` objects on each `spawnStage()`. To achieve strict zero-allocation across 50 rounds, `FormationManager` should be upgraded with `ObjectPool<Enemy>`:
- `enemyPool = new ObjectPool<Enemy>({ factory: () => new Enemy(), reset: (e) => e.reset(), initialSize: 48, maxSize: 64, autoExpand: false })`
- `formationManager.enemies` draws from this pool, while maintaining full array compatibility for existing tests.

**Pool Bounds Verification Table**:

| Pool Name | Subsystem | Initial Size | Max Upper Bound | Drift Limit across 50 Rounds |
|---|---|---|---|---|
| `bulletPool` | `BulletManager` | 64 | 64 (or 128) | 0 expansion |
| `enemyPool` | `FormationManager` | 48 | 64 | 0 expansion |
| `particlePool` | `ParticleSystem` | 250 | 250 (or 256) | 0 expansion |
| `missilePool` | `SpecialMovesManager` | 32 | 32 | 0 expansion |
| `bombPool` | `AlliesManager` | 16 | 16 | 0 expansion |
| `explosionPool` | `AlliesManager` | 16 | 16 | 0 expansion |
| `sparkPool` | `SpecialMovesManager` | 32 | 32 | 0 expansion |
| `powerUpPool` | `PowerUpManager` | 32 | 32 | 0 expansion |

---

## 5. Playwright E2E Memory Bot: `tests/e2e/memory_bot_50round.spec.ts`

### 5.1 Verification Strategy & Flow

```typescript
import { test, expect } from '@playwright/test';
import { createErrorCollector, getCanvasDimensions } from './helpers/test-utils';

test.describe('Milestone 15: Automated 50-Round Memory Bot & E2E QA Verification', () => {
  test.setTimeout(120000); // 2-minute test timeout for 50-stage traversal

  test('TC-M15-BOT: Automated 50-round traversal with 0 console errors and clean DOM/canvas', async ({ page }) => {
    const errorCollector = createErrorCollector(page);

    // 1. Navigate to application
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(500);

    // 2. Verify canvas element is attached, visible, and 7:9 aspect ratio
    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeAttached();
    await expect(canvas).toBeVisible();
    const dimensions = await getCanvasDimensions(page, '#game-canvas');
    expect(dimensions?.attrWidth).toBe(224);
    expect(dimensions?.attrHeight).toBe(288);

    // 3. Verify window.__GALAGA_CHEAT__ is exposed and all 8 methods exist
    const cheatApiMethods = await page.evaluate(() => {
      const cheat = (window as any).__GALAGA_CHEAT__;
      if (!cheat) return null;
      return {
        hasSkip: typeof cheat.skipToStage === 'function',
        hasCrisis: typeof cheat.triggerCrisis === 'function',
        hasBoss: typeof cheat.spawnBoss === 'function',
        hasSpecial: typeof cheat.triggerSpecialMove === 'function',
        hasInvincible: typeof cheat.setInvincible === 'function',
        hasDrone: typeof cheat.unlockDrone === 'function',
        hasEnergy: typeof cheat.fillEnergy === 'function',
        hasKill: typeof cheat.killAllEnemies === 'function',
      };
    });

    expect(cheatApiMethods).not.toBeNull();
    expect(cheatApiMethods?.hasSkip).toBe(true);
    expect(cheatApiMethods?.hasCrisis).toBe(true);
    expect(cheatApiMethods?.hasBoss).toBe(true);
    expect(cheatApiMethods?.hasSpecial).toBe(true);
    expect(cheatApiMethods?.hasInvincible).toBe(true);
    expect(cheatApiMethods?.hasDrone).toBe(true);
    expect(cheatApiMethods?.hasEnergy).toBe(true);
    expect(cheatApiMethods?.hasKill).toBe(true);

    // 4. Enable invincibility for bot traversal
    await page.evaluate(() => (window as any).__GALAGA_CHEAT__.setInvincible(true));

    // 5. Rapid 50-Round Traversal Loop
    for (let stage = 1; stage <= 50; stage++) {
      // Skip to stage
      const skipped = await page.evaluate((s) => (window as any).__GALAGA_CHEAT__.skipToStage(s), stage);
      expect(skipped).toBe(true);

      // Verify stage counter in HUD/game engine
      const currentStage = await page.evaluate(() => (window as any).getGame?.()?.stage);
      expect(currentStage).toBe(stage);

      // Brief tick delay for entity updates and render
      await page.waitForTimeout(20);

      // Check Boss presence on boss milestones
      if ([10, 20, 30, 40, 50].includes(stage)) {
        const isBossActive = await page.evaluate(() => {
          const game = (window as any).getGame?.();
          return game?.bossManager?.isBossActive() ?? false;
        });
        expect(isBossActive).toBe(true);
      }

      // Eliminate enemies
      await page.evaluate(() => (window as any).__GALAGA_CHEAT__.killAllEnemies());
      await page.waitForTimeout(20);
    }

    // 6. Zero JavaScript Runtime Errors Assertion
    const runtimeErrors = errorCollector.getErrors();
    if (runtimeErrors.length > 0) {
      console.error('Runtime errors captured during 50-round bot traversal:', runtimeErrors);
    }
    expect(runtimeErrors).toEqual([]);

    // 7. Clean DOM & Canvas Health Check
    await expect(canvas).toBeAttached();
    await expect(canvas).toBeVisible();

    // Verify no stray elements or detached nodes
    const orphanCanvases = await page.locator('canvas').count();
    expect(orphanCanvases).toBe(1); // Only the primary game canvas
  });
});
```

---

## 6. Regression Risk Assessment (1,035 Existing Tests)

| Risk ID | Potential Vulnerability | Root Cause | Impacted Existing Test Suites | Mitigation Strategy |
|---|---|---|---|---|
| **RR-01** | `window` is `undefined` in Node unit tests | Directly referencing `window.__GALAGA_CHEAT__` throws `ReferenceError` in Node environments without JSDOM. | `core.test.ts`, `state.test.ts`, `boss_*.test.ts`, 40+ unit test files. | Check `typeof window !== 'undefined'` and `typeof globalThis !== 'undefined'`. Expose `game.cheatAPI` directly on `Game` instance. |
| **RR-02** | `FormationManager.enemies` direct assignment/mutation broken | Existing tests manually assign `enemies = [customEnemy]` or do `enemies.push(...)`. | `m10_challenger_2_adversarial.test.ts`, `m11_challenger_2_adversarial.test.ts`, `adversarial_m13_specials.test.ts`. | Keep `enemies` as a public `Enemy[]` array. `enemyPool` leases objects for `spawnStage()`, but `enemies` remains fully mutable by external tests. |
| **RR-03** | Invincibility cheat causes persistent blinking | `player.isInvulnerable()` triggers `Math.floor(timer * 10) % 2 === 0` rendering skip. | `player.test.ts`, `m3_challenger_*.test.ts`. | Add `player.isInvincibleCheat: boolean`. Only apply blink skip in `render()` if `invulnerableTimer > 0` AND NOT `isInvincibleCheat`. |
| **RR-04** | Dangling Boss sub-units or hazards on `skipToStage` | Skipping while Nanite Colossus or Aeternum Core is mid-phase leaves active lasers or beam timers. | `boss_progression_integration.test.ts`, `adversarial_boss_hazards.test.ts`. | `skipToStage` unconditionally calls `bossManager.reset()`, `bulletManager.clear()`, `particleSystem.clear()`, and `crisisEventManager.onStageClear()`. |
| **RR-05** | Playwright test timeout on 50-round simulation | 50 rounds taking > 30 seconds triggers default 30s timeout. | Playwright runner. | Set `test.setTimeout(120000)` and optimize bot execution to ~20-40ms per stage, completing in under 4 seconds total. |
| **RR-06** | Flaky V8 heap measurement in Node | Node memory without GC can report temporary allocations. | `m15_50round_memory.test.ts`. | Pre-warm 1 round, optionally call `global.gc()`, assert `< 5MB` net drift AND assert strict object pool capacity ceilings. |

---

## 7. Concrete Implementation Plan for Implementer Swarm

1. **New Component: `src/core/qa/GalagaCheat.ts`**:
   - Implement `CheatController` conforming to `IGalagaCheatAPI`.
   - Wire all 8 methods with input sanitization, clamping, and defensive error handling.
2. **Modify `src/core/Game.ts`**:
   - Add `public cheatAPI: CheatController` and instantiate in constructor.
   - Add `public getEnemyPool(): ObjectPool<Enemy>` delegate.
   - Enhance `skipToStage(stage: number)` with atomic teardown and state transition safety.
3. **Modify `src/entities/Player.ts`**:
   - Add `public isInvincibleCheat: boolean = false`.
   - Update `isInvulnerable()` to include `isInvincibleCheat`.
   - Update `render()` to preserve solid visibility when `isInvincibleCheat` is true.
4. **Modify `src/systems/FormationManager.ts`**:
   - Add `public readonly enemyPool: ObjectPool<Enemy>`.
   - Update `spawnStage()` to lease from `enemyPool` instead of allocating 40 `new Enemy()`.
   - Update `reset()` to return leased enemies via `enemyPool.clear()`.
5. **Create Test Suites**:
   - `tests/unit/m15_qa_cheat.test.ts`: 40+ unit test scenarios covering all 8 methods, boundary cases, and state transitions.
   - `tests/unit/m15_50round_memory.test.ts`: 50-round traversal asserting `< 5MB` net heap growth and bounded pool capacities.
   - `tests/e2e/memory_bot_50round.spec.ts`: Playwright headless bot verifying 50 rounds, 0 errors, clean DOM.
