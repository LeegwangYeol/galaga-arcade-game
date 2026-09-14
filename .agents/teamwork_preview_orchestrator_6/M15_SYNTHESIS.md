# Milestone 15 Synthesis: 50-Round Memory Bot & QA Controller (`window.__GALAGA_CHEAT__`)

**Date**: 2026-09-04  
**Orchestrator**: `teamwork_preview_orchestrator_6`  
**Inputs**:
- Explorer 1 (`m15_explorer_1`): Architecture & QA Cheat Controller (`window.__GALAGA_CHEAT__`)
- Explorer 2 (`m15_explorer_2`): 50-Round Continuous Simulation & Memory Heap Profiling (< 5MB Heap Drift)
- Explorer 3 (`m15_explorer_3`): Test Infrastructure & Playwright E2E Verification Strategy

---

## 1. Architectural Synthesis & Requirements

### 1.1 Global Cheat Interface (`window.__GALAGA_CHEAT__`)
The cheat controller must provide deterministic control over game state for testing, QA, and automated bots without polluting gameplay logic or degrading performance.

**Interface Contract** (`src/types/index.ts`):
```typescript
export interface IGalagaCheatController {
  skipToStage(stage: number): void;
  triggerCrisis(crisisId: string): void;
  spawnBoss(bossId: string | number): void;
  triggerSpecialMove(moveId: 'nova' | 'chrono' | 'warp' | string): void;
  setInvincible(invincible: boolean): void;
  unlockDrone(droneType: 'escort' | 'aegis' | 'bomber' | string): void;
  fillEnergy(amount?: number): void;
  killAllEnemies(): void;
  setScore(score: number): void;
  addLives(n: number): void;
  getGameState(): {
    stage: number;
    score: number;
    lives: number;
    state: string;
    energy: number;
    activeEnemies: number;
    isInvincible: boolean;
  };
}

declare global {
  interface Window {
    __GALAGA_CHEAT__?: IGalagaCheatController;
  }
}
```

### 1.2 Concrete Implementation (`src/core/qa/GalagaCheatController.ts`)
- Implements `IGalagaCheatController`.
- Mounts onto `window.__GALAGA_CHEAT__` (when `typeof window !== 'undefined'`) and optionally `(globalThis as any).__GALAGA_CHEAT__` for universal headless runtime support.
- Mounted in `Game` constructor; cleanly unmounted in `Game.destroy()`.
- Exposed via `game.getCheatController()`.
- Method behaviors:
  - `skipToStage(stage: number)`:
    - Clamp stage to `1..50` (or gracefully handle edge cases).
    - Teardown existing stage entities (boss, crisis, bullets, particles, drone munitions, special munitions).
    - Update `game.stage = targetStage`.
    - If `targetStage` is a Boss stage (10, 20, 30, 40, 50), invoke `bossManager.spawnBoss(targetStage)`.
    - Else if normal stage, trigger `formationManager.spawnStage(targetStage)` and initialize stage parameters.
    - Transition state cleanly to `PLAYING`.
  - `triggerCrisis(crisisId: string)`:
    - Map case-insensitive aliases (`'contingency'`, `'unbidden'`, `'prethoryn'`, etc.) to canonical `CrisisEventType`.
    - Invoke `game.crisisEventManager.forceActivate(type, game.stage)`.
  - `spawnBoss(bossId: string | number)`:
    - Support stage numbers (10, 20, 30, 40, 50) or boss names (`'dreadnought'`, `'leviathan'`, `'colossus'`, `'harbinger'`, `'aeternum'`).
    - Reset active enemies and bullets, transition game to boss battle mode.
  - `triggerSpecialMove(moveId: string)`:
    - Map aliases to `SpecialMoveType.NOVA_BARRAGE`, `CHRONO_FREEZE`, `DIMENSIONAL_WARP_RAM`.
    - Invoke `game.specialMovesManager.triggerSpecial(type)`.
  - `setInvincible(invincible: boolean)`:
    - Toggle `player.isInvincibleCheat = invincible`.
    - When `true`, `player.isInvulnerable()` returns `true` unconditionally without respawn blinking.
  - `unlockDrone(droneType: string)`:
    - Map aliases (`'escort'`, `'aegis'`, `'bomber'`) to `DroneType`.
    - Invoke `game.alliesManager.summonDrone(type, 999999)`.
  - `fillEnergy(amount: number = 100)`:
    - Set `game.specialMovesManager.energyMeter = Math.min(100, Math.max(0, amount))`.
  - `killAllEnemies()`:
    - Iterate all active enemies in `formationManager.enemies` and call `enemy.takeDamage(999999)` or `enemy.destroy()`.
    - Also damage active boss if present.
  - `setScore(score: number)`:
    - Update `game.score = score`.
  - `addLives(n: number)`:
    - Modify `game.lives = Math.max(0, game.lives + n)`.

---

## 2. Stage Teardown & Munition Leak Fix (Critical Invariant)

Explorer 2 uncovered that `AlliesManager.onStageClear()` and `SpecialMovesManager` lacked complete pool teardown hooks. When skipping stages or clearing rounds rapidly:
1. `AlliesManager`:
   - Must expose / execute `this.bombPool.clear()` and `this.explosionPool.clear()`.
   - Neutralize any in-flight cluster bombs and explosions.
2. `SpecialMovesManager`:
   - Add `onStageClear()` hook:
     - `this.missilePool.clear()`
     - `this.sparkPool.clear()`
     - Reset active Chrono Freeze timer (`this.chronoFreezeTimer = 0`) and Warp Ram state.
3. `Game.ts` Teardown Protocol:
   - On stage clear or `skipToStage()`:
     - `bulletManager.clear()`
     - `particleSystem.clear()`
     - `crisisEventManager.onStageClear()`
     - `bossManager.reset()`
     - `alliesManager.onStageClear()`
     - `specialMovesManager.onStageClear()`
   - Guarantees `getActiveCount() === 0` across all 7 bounded pools.

---

## 3. 50-Round Memory Bot & Profiling Methodology

### 3.1 Accelerated 50-Round Traversal
- In normal play, intermission animations take ~200 seconds across 50 rounds (2.2s intro + 1.8s clear per round).
- The continuous simulation bot accelerates intermissions by advancing `game.stateTimer = 10.0` whenever `game.state === 'STAGE_INTRO'` or `game.state === 'STAGE_CLEAR'`, collapsing intermissions into 1 tick per stage.
- Real combat ticks (60Hz dt=1/60) run genuine entity updates, collisions, drone fire, and crisis processing.

### 3.2 Heap Drift Verification (< 5.0 MB Invariant)
- **Node / Vitest Memory Benchmark**:
  - Warmup: Run Stage 1 for 60 ticks to stabilize V8 JIT and initial module allocations.
  - Baseline Sample: Run `global.gc?.()` and sample `process.memoryUsage().heapUsed` at Stage 1.
  - Traverse Stages 1 through 50 (including 12 challenging stages, 5 boss stages, and 11 crisis events).
  - Final Sample: Run `global.gc?.()` and sample `heapUsed` at Stage 50.
  - Assert: `heapUsed_stage50 - heapUsed_stage1 < 5.0 * 1024 * 1024` (Empirically measured by Explorer 2 at ~0.998 MB).
  - Assert: All pool active counts == 0 at stage boundaries.
- **Playwright E2E Browser Test**:
  - Load `http://localhost:3000`.
  - Check `window.__GALAGA_CHEAT__` is defined and functional.
  - Use cheat API and automated combat ticks to rapidly traverse 50 stages.
  - Capture CDP heap metrics if supported, or verify `0 uncaught console/runtime errors` and DOM/canvas stability.

---

## 4. Test Suites to Implement

1. `tests/unit/m15_qa_cheat.test.ts`:
   - Mounting & Unmounting of `window.__GALAGA_CHEAT__`.
   - All 10 methods functioning as specified.
   - Boundary tests: negative stage numbers, stage numbers > 50, invalid crisis IDs, invalid boss IDs.
   - State transition safety: skipping during boss battles, active crisis, player death, and game over.
   - Idempotency & entity recycling.

2. `tests/unit/m15_50round_memory.test.ts`:
   - Headless 50-stage automated simulation bot.
   - Stage progression verification (stages 1..50 hit correctly).
   - Boss encounters triggered at 10, 20, 30, 40, 50.
   - Net heap drift assertion: `< 5.0 MB` across continuous 50-stage simulation.
   - Bounded pool capacities: verify all pools remain within capacity limits without auto-expanding.

3. `tests/e2e/memory_bot_50round.spec.ts`:
   - Playwright test running in headless browser.
   - Navigates through 50 rounds.
   - Verifies zero console errors, zero unhandled rejections, and clean canvas rendering.

---

## 5. Worker Assignment & Boundaries

- **Worker**: `m15_worker` (`teamwork_preview_worker`)
- **Write Ownership**:
  - `src/core/qa/GalagaCheatController.ts` (new)
  - `src/types/index.ts`
  - `src/core/Game.ts`
  - `src/entities/Player.ts`
  - `src/core/allies/AlliesManager.ts`
  - `src/core/specials/SpecialMovesManager.ts`
  - `src/systems/FormationManager.ts` (if adjusting enemy reuse/pool)
  - `tests/unit/m15_qa_cheat.test.ts` (new)
  - `tests/unit/m15_50round_memory.test.ts` (new)
  - `tests/e2e/memory_bot_50round.spec.ts` (new)
- **Zero Regressions**: All 1,035 existing tests must continue to pass cleanly!
