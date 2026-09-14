# Milestone 15 Investigation & Architecture Analysis: QA Controller & Cheat System

**Author**: `m15_explorer_1`  
**Date**: 2026-09-04  
**Target Architecture**: Milestone 15 — 50-Round Memory Bot & QA Controller (`window.__GALAGA_CHEAT__`)  
**Scope**: Codebase Entry Points, Controller Design, Subsystem Teardown & Pool Recycling Invariants, TypeScript Strict Global Declarations.

---

## 1. Executive Summary

Milestone 15 introduces the global QA controller and automated memory verification bot required to prove zero-leak runtime stability across all 50 stages. To allow headless automation (Playwright), manual testing via the browser developer console, and automated stress testing, the engine must expose an ergonomic, strongly typed cheat API on `window.__GALAGA_CHEAT__`.

This investigation evaluates:
1. **Entry Points & Subsystem Wiring**: Where and how the cheat controller is mounted and synchronized with `Game.ts` and `main.ts`.
2. **Interface & Method Architecture**: Complete architectural design of `GalagaCheatController` implementing all 10 required operations (`skipToStage`, `triggerCrisis`, `spawnBoss`, `triggerSpecialMove`, `setInvincible`, `unlockDrone`, `fillEnergy`, `killAllEnemies`, `setScore`, `addLives`) plus diagnostic getters.
3. **State Cleanup & Zero-GC Pool Recycling Invariants**: Guaranteeing that skipping stages (e.g. 1 -> 10 -> 20 -> 30 -> 40 -> 50) releases 100% of leased entities back to their respective `ObjectPool` instances, preventing unbounded heap accumulation and ensuring `< 5MB` net heap drift.
4. **TypeScript Strict Mode Compatibility**: Declaring the global `Window` interface without requiring `(window as any)` workarounds while maintaining 100% pass on `tsc --noEmit` under `"strict": true`, `"noImplicitAny": true`, and `"isolatedModules": true`.

---

## 2. Entry Point Analysis & Mounting Strategy

### 2.1 Codebase Entry Points
The game initialization pipeline spans three core locations:

1. **`src/main.ts` (Application Entry Point)**:
   - Contains the browser bootstrap lifecycle (`bootstrap()`).
   - Instantiates `gameInstance = new Game(CANVAS_ID)` and starts the 60fps game loop.
   - Provides utility getters: `getGame()`, `getCanvas()`, `getCanvasContext()`.
   - Listens to DOM ready states (`DOMContentLoaded` / immediate bootstrap).
2. **`src/core/Game.ts` (Master Engine Coordinator)**:
   - Coordinates all 12 subsystems: `screenManager`, `gameLoop`, `starfield`, `inputHandler`, `player`, `bulletManager`, `formationManager`, `tractorBeam`, `crisisEventManager`, `powerUpManager`, `bossManager`, `alliesManager`, `specialMovesManager`, `soundSynth`, `particleSystem`, `scoreManager`, `hud`.
   - Manages state machine (`TITLE`, `STAGE_INTRO`, `PLAYING`, `CHALLENGING_STAGE`, `STAGE_CLEAR`, `GAME_OVER`, `PAUSED`).
   - Contains lifecycle hooks: `start()`, `stop()`, `pause()`, `resume()`, `destroy()`, `resetGame()`, `setState()`.
3. **`src/types/index.ts` (Type Definitions & Contracts)**:
   - Central contract repository consumed across `src/` and `tests/`.

### 2.2 Recommended Mounting Location
To ensure the cheat controller is available in **both** normal browser execution (`main.ts`) and headless unit/integration test harnesses (which instantiate `new Game()` directly without calling `main.ts`):
- Implement `GalagaCheatController` in a dedicated module: `src/core/qa/GalagaCheatController.ts`.
- In `Game.ts`:
  - Add property: `public cheatController: GalagaCheatController;`
  - In `Game` constructor: instantiate `this.cheatController = new GalagaCheatController(this);`.
  - In constructor, mount to window:
    ```ts
    if (typeof window !== 'undefined') {
      window.__GALAGA_CHEAT__ = this.cheatController;
    }
    ```
  - In `Game.destroy()`, safely unmount to prevent test pollution or memory leaks:
    ```ts
    if (typeof window !== 'undefined' && window.__GALAGA_CHEAT__ === this.cheatController) {
      delete window.__GALAGA_CHEAT__;
    }
    ```
  - Expose getter: `public getCheatController(): GalagaCheatController { return this.cheatController; }`.

This approach guarantees that:
- Any browser session has `window.__GALAGA_CHEAT__` immediately ready upon boot.
- Headless unit and integration tests can access `game.cheatController` or `window.__GALAGA_CHEAT__`.
- Multi-game test scenarios do not leak stale game references.

---

## 3. Interface Design: `GalagaCheatController`

### 3.1 TypeScript Contract

```typescript
import type { Game } from '../Game';
import type { GameState } from '../../types';
import type { ICrisisEvent, CrisisEventType } from '../crisis/types';
import type { BaseBoss } from '../boss/BaseBoss';
import type { SpecialMoveType } from '../specials/types';
import type { DroneType } from '../allies/types';
import type { BaseDrone } from '../allies/BaseDrone';

export interface IGalagaCheatController {
  /**
   * Cleanly tears down current stage entities (enemies, bullets, boss, crisis),
   * updates stage number, initializes the new stage, and resets state.
   */
  skipToStage(stage: number): void;

  /**
   * Immediately forces activation of a specific Stellaris crisis event via CrisisEventManager.
   * Supports case-insensitive and kebab/snake aliases (e.g. 'THE_CONTINGENCY', 'unbidden', 'gray-tempest').
   */
  triggerCrisis(crisisId: string | CrisisEventType): ICrisisEvent | null;

  /**
   * Immediately transitions to designated Boss fight (Stages 10, 20, 30, 40, 50).
   * Supports stage numbers (10, 20, 30, 40, 50) and boss names (e.g. 'dreadnought', 'leviathan', 'nanite', 'psionic', 'aeternum').
   */
  spawnBoss(bossId: string | number): BaseBoss | null;

  /**
   * Forces instant activation of Nova Barrage, Chrono Freeze, or Warp Ram.
   * Bypasses energy gauge requirements and cooldown timers.
   */
  triggerSpecialMove(moveId: SpecialMoveType | string): boolean;

  /**
   * Toggles player invulnerability for QA testing.
   * Prevents bullet collision damage, alien crash destruction, and tractor beam capture.
   */
  setInvincible(invincible: boolean): void;

  /**
   * Summons designated wingman Drone via AlliesManager.
   * Supports 'ESCORT', 'AEGIS', 'BOMBER'.
   */
  unlockDrone(droneType: DroneType | string): BaseDrone | null;

  /**
   * Sets special energy meter to 100% (or custom amount).
   */
  fillEnergy(amount?: number): void;

  /**
   * Destroys all active enemy entities on screen.
   * Returns count of destroyed enemies.
   */
  killAllEnemies(): number;

  /**
   * Updates score for milestone testing (e.g. triggering extra life or drone unlock thresholds).
   */
  setScore(score: number): void;

  /**
   * Adjusts player lives count.
   * Returns updated lives count.
   */
  addLives(n: number): number;

  // Diagnostic Getters
  getGame(): Game;
  getStage(): number;
  getScore(): number;
  getLives(): number;
  isInvincible(): boolean;
  getEnergy(): number;
  getActiveBoss(): BaseBoss | null;
  getActiveCrisis(): ICrisisEvent | null;
  getActiveEnemiesCount(): number;
  destroy(): void;
}
```

---

## 4. Concrete Method Implementation Logic

### 4.1 Method 1: `skipToStage(stage: number)`
- **Validation**:
  ```ts
  const targetStage = Math.max(1, Math.min(50, Math.floor(stage)));
  ```
- **Execution Pipeline**:
  1. **Crisis Teardown**: `this.game.crisisEventManager.clearCrisis()` restores normal starfield, formation fire rates, and clears active shaders/timers.
  2. **Boss Teardown**: `this.game.bossManager.reset()` deactivates and clears `activeBoss` and `playerStunTimer`.
  3. **Projectile Recycling**: `this.game.bulletManager.clear()` recycles all player, enemy, and drone bullets into `bulletPool`.
  4. **Particle Clearing**: `this.game.particleSystem.clear()` resets the 250-particle pool.
  5. **Power-Up Reset**: `this.game.powerUpManager.reset()` recycles all dropped capsules and clears temporary buffs.
  6. **Allies Munitions Recycling**: `this.game.alliesManager.getBombPool().clear()` and `getExplosionPool().clear()`.
  7. **Special Moves Reset**: `this.game.specialMovesManager.reset()` clears `missilePool`, `sparkPool`, resets `chronoFreezeTimer`, `warpRamTimer`, and cancels active states.
  8. **Tractor Beam Reset**: `this.game.tractorBeam.reset()`.
  9. **Audio Stop**: `this.game.soundSynth.stopAll()`, `this.game.soundSynth.stopTractorBeam()`, `MusicJingles.stopAll()`.
  10. **Player Stabilization**:
      - Keep player lives and persistent upgrades intact, but reset kinematics:
      - `this.game.player.x = 112;`
      - `this.game.player.y = Player.BASELINE_Y;`
      - `this.game.player.vx = 0;`
      - `this.game.player.vy = 0;`
      - `this.game.player.activeMissileCount = 0;`
      - `this.game.player.fireCooldownTimer = 0;`
      - `this.game.player.deathTimer = 0;`
      - `this.game.player.captureTimer = 0;`
      - `this.game.player.rescuedFighter.active = false;`
  11. **Stage Number & Formation Assignment**:
      - `this.game.scoreManager.setStage(targetStage);`
      - `this.game.stage = targetStage;`
      - If `DifficultyCalculator.isChallengingStage(targetStage)`, call `this.game.scoreManager.resetChallengingHits();`.
      - Call `this.game.formationManager.spawnStage(targetStage);`.
  12. **State Transition**:
      - Set `this.game.setState('STAGE_INTRO');` to trigger standard stage entry fanfares and smooth wave entrances.

### 4.2 Method 2: `triggerCrisis(crisisId: string)`
- **Normalization Map**:
  Matches user/test input strings against `CrisisEventType`:
  - `THE_CONTINGENCY` | `contingency` | `ghost_signal` | `ai` -> `CrisisEventType.THE_CONTINGENCY`
  - `THE_UNBIDDEN` | `unbidden` | `dimensional_tear` | `rift` -> `CrisisEventType.THE_UNBIDDEN`
  - `THE_PRETHORYN_SCOURGE` | `prethoryn` | `scourge` | `swarm` -> `CrisisEventType.THE_PRETHORYN_SCOURGE`
  - `SHIELD_OVERLOAD` | `shield` | `energy_matrix` -> `CrisisEventType.SHIELD_OVERLOAD`
  - `PHYSICS_INVERSION` | `physics` | `singularity` -> `CrisisEventType.PHYSICS_INVERSION`
  - `HYPERSPACE_STORM` | `storm` | `hyperspace` | `lightning` -> `CrisisEventType.HYPERSPACE_STORM`
  - `NANITE_CLOUD` | `nanite` | `gray_tempest` | `gray_goo` -> `CrisisEventType.NANITE_CLOUD`
  - `PSIONIC_RESONANCE` | `psionic` | `shroud` -> `CrisisEventType.PSIONIC_RESONANCE`
  - `DEVOURING_SWARM_FRENZY` | `frenzy` | `devouring_swarm` -> `CrisisEventType.DEVOURING_SWARM_FRENZY`
  - `NEMESIS_STAR_EATER` | `nemesis` | `star_eater` | `dark_matter` -> `CrisisEventType.NEMESIS_STAR_EATER`
  - `TIME_DILATION_FIELD` | `time` | `time_dilation` | `chrono_anomaly` -> `CrisisEventType.TIME_DILATION_FIELD`
- **Execution**:
  - If the game is in `TITLE` or `GAME_OVER`, call `this.game.startGame()`.
  - Invoke `this.game.crisisEventManager.forceActivate(resolvedType, this.game.stage)`.
  - Returns the activated `ICrisisEvent`.

### 4.3 Method 3: `spawnBoss(bossId: string | number)`
- **Boss Stage Resolution**:
  - Stage 10: `10`, `'10'`, `'CYBER_DREADNOUGHT'`, `'DREADNOUGHT'`, `'CYBER'`
  - Stage 20: `20`, `'20'`, `'DIMENSIONAL_LEVIATHAN'`, `'LEVIATHAN'`, `'DIMENSIONAL'`
  - Stage 30: `30`, `'30'`, `'NANITE_COLOSSUS'`, `'NANITE'`, `'COLOSSUS'`
  - Stage 40: `40`, `'40'`, `'PSIONIC_HARBINGER'`, `'PSIONIC'`, `'HARBINGER'`
  - Stage 50: `50`, `'50'`, `'AETERNUM_CORE'`, `'AETERNUM'`, `'CORE'`, `'STAR_EATER'`
- **Execution**:
  - Calls `this.skipToStage(resolvedStage)`.
  - Sets `this.game.setState('PLAYING')` to bypass intro wait and engage the boss encounter immediately.
  - Returns `this.game.bossManager.activeBoss`.

### 4.4 Method 4: `triggerSpecialMove(moveId: SpecialMoveType | string)`
- **Move Resolution**:
  - `SpecialMoveType.NOVA_BARRAGE` | `'NOVA_BARRAGE'` | `'nova'` | `'barrage'`
  - `SpecialMoveType.CHRONO_FREEZE` | `'CHRONO_FREEZE'` | `'chrono'` | `'freeze'`
  - `SpecialMoveType.WARP_RAM` | `'WARP_RAM'` | `'warp'` | `'ram'`
- **Bypassing Invariant Checks for QA**:
  - In `SpecialMovesManager.ts`, `triggerSpecial()` checks `isReady()` which requires `energy >= maxEnergy && cooldownTimer <= 0 && !isActive`.
  - Cheat method forcibly clears cooldown and fills energy:
    ```ts
    const mgr = this.game.specialMovesManager;
    if (!mgr) return false;
    mgr.isActive = false;
    mgr.activeMove = null;
    mgr.cooldownTimer = 0;
    mgr.energy = mgr.maxEnergy; // 100%
    mgr.selectedMove = resolvedMove;
    return mgr.trigger(resolvedMove);
    ```

### 4.5 Method 5: `setInvincible(invincible: boolean)`
- **Architecture**:
  - Add property `public isCheatInvincible: boolean = false;` to `Player.ts`.
  - In `Player.isInvulnerable()`:
    ```ts
    public isInvulnerable(): boolean {
      return (
        this.isCheatInvincible ||
        this.invulnerableTimer > 0 ||
        this._state === 'respawning' ||
        this._state === 'RESPAWNING' ||
        this._state === 'destroyed' ||
        this._state === 'DESTROYED'
      );
    }
    ```
  - In `GalagaCheatController.setInvincible(invincible)`:
    ```ts
    this.invincible = invincible;
    if (this.game.player) {
      this.game.player.isCheatInvincible = invincible;
    }
    ```
  - Prevents all bullet damage, enemy ship kamikaze crashes, and tractor beam captures.

### 4.6 Method 6: `unlockDrone(droneType: DroneType | string)`
- **Resolution**:
  - `DroneType.ESCORT` | `'ESCORT'` | `'escort'`
  - `DroneType.AEGIS` | `'AEGIS'` | `'aegis'` | `'shield'`
  - `DroneType.BOMBER` | `'BOMBER'` | `'bomber'`
- **Execution**:
  - Calls `this.game.alliesManager.summonDrone(resolvedType, 0)`.
  - Duration `0` activates persistent Escort and Aegis drones, and triggers a full bombing pass for Bomber drone.
  - Returns the summoned `BaseDrone`.

### 4.7 Method 7: `fillEnergy(amount?: number)`
- **Execution**:
  ```ts
  const mgr = this.game.specialMovesManager;
  if (mgr) {
    const val = amount !== undefined ? Math.max(0, Math.min(100, amount)) : 100;
    mgr.energy = val;
    mgr.cooldownTimer = 0;
  }
  ```

### 4.8 Method 8: `killAllEnemies()`
- **Execution**:
  - Iterates through `this.game.formationManager.getLivingEnemies()`:
    ```ts
    for (const enemy of living) {
      if (enemy.active && enemy.state !== EnemyState.EXPLODING && enemy.state !== EnemyState.INACTIVE) {
        enemy.takeDamage(999);
        this.game.particleSystem.spawnSmallAlienExplosion(enemy.x, enemy.y);
        this.game.scoreManager.addScore(enemy.type === EnemyType.BOSS ? 150 : 80);
        killedCount++;
      }
    }
    ```
  - Destroys active boss if present:
    ```ts
    if (this.game.bossManager?.activeBoss?.active) {
      const boss = this.game.bossManager.activeBoss;
      boss.takeDamage(99999);
      this.game.particleSystem.spawnBossExplosion(boss.x, boss.y);
      this.game.soundSynth.playExplosion('boss');
      killedCount++;
    }
    ```
  - Clears `formationManager.isEntryWaveActive = false` so that the cleared wave transitions to `STAGE_CLEAR` on the next tick.
  - Returns `killedCount`.

### 4.9 Method 9: `setScore(score: number)`
- **Execution**:
  ```ts
  const s = Math.max(0, Math.floor(score));
  this.game.score = s;
  if (this.game.player) {
    this.game.player.score = s;
  }
  if (this.game.alliesManager) {
    this.game.alliesManager.checkMilestones(s, this.game.stage);
  }
  ```

### 4.10 Method 10: `addLives(n: number)`
- **Execution**:
  ```ts
  const newLives = Math.max(0, this.game.lives + n);
  this.game.lives = newLives;
  if (this.game.player) {
    this.game.player.lives = newLives;
  }
  return this.game.lives;
  ```

---

## 5. State Cleanup & Pool Recycling Invariants

Memory leak prevention during 50-round automated simulations requires that `skipToStage` releases leased entities back to pre-allocated buffers rather than creating orphaned references.

| Subsystem | Pool Identifier | Max Size | Cleanup Call | Release Verification Invariant |
|---|---|---|---|---|
| **BulletManager** | `bulletPool` | 256 | `bulletManager.clear()` | `bulletPool.getActiveCount() === 0`, active bullet counts zeroed |
| **ParticleSystem** | `pool` | 250 | `particleSystem.clear()` | `pool.getActiveCount() === 0` |
| **PowerUpManager** | `pool` | 32 | `powerUpManager.reset()` | `pool.getActiveCount() === 0`, buff timers reset |
| **AlliesManager** | `bombPool` | 16 | `bombPool.clear()` | `bombPool.getActiveCount() === 0` |
| **AlliesManager** | `explosionPool` | 16 | `explosionPool.clear()` | `explosionPool.getActiveCount() === 0` |
| **SpecialMovesManager** | `missilePool` | 32 | `missilePool.clear()` | `missilePool.getActiveCount() === 0` |
| **SpecialMovesManager** | `sparkPool` | 32 | `sparkPool.clear()` | `sparkPool.getActiveCount() === 0` |
| **FormationManager** | `enemies[]` | N/A | `formationManager.reset()` | `enemies.length === 0`, `slotToEnemyMap.clear()` |
| **CrisisEventManager** | `currentCrisis` | 1 | `clearCrisis()` | `currentCrisis.onDeactivate()` executed, state = `IDLE` |
| **BossManager** | `activeBoss` | 1 | `bossManager.reset()` | `activeBoss = null`, stun timers zeroed |
| **Audio Nodes** | Priority Queue | 16 | `soundSynth.stopAll()` | All oscillator & gain nodes disconnected, 0 dangling timers |

Because each pool implements `clear()`:
```ts
public clear(): void {
  for (let i = 0; i < this.activeCount; i++) {
    const item = this.storage[i];
    if (item !== undefined) {
      this.resetFn(item);
    }
  }
  this.activeCount = 0;
}
```
All entity objects remain inside their respective `storage` arrays with `activeCount = 0`. No new objects are allocated on the JavaScript heap during stage transitions, keeping net heap growth strictly flat across all 50 rounds.

---

## 6. TypeScript Strict Mode & Global Window Declaration

To ensure global `window.__GALAGA_CHEAT__` works seamlessly under TypeScript strict compiler options (`"strict": true`, `"noImplicitAny": true`, `"isolatedModules": true`), the global declaration must be defined in an ambient module or global augmentation block.

In `src/types/index.ts`:

```typescript
import type { GalagaCheatController } from '../core/qa/GalagaCheatController';

export type { GalagaCheatController };

declare global {
  interface Window {
    __GALAGA_CHEAT__?: GalagaCheatController;
  }
}
```

### Key Compilation Rules:
1. **Module Scope**: Because `src/types/index.ts` contains top-level imports and exports, `declare global { ... }` augments the existing `Window` interface without overwriting standard DOM definitions.
2. **Optional Property**: Declaring `__GALAGA_CHEAT__?: GalagaCheatController` allows clean access in non-browser or uninitialized environments without strict null assertion errors.
3. **No `any` Casts**: Code in `main.ts`, `Game.ts`, or test files can write:
   ```ts
   if (typeof window !== 'undefined') {
     window.__GALAGA_CHEAT__ = this.cheatController;
   }
   ```
   without needing `(window as any)` or disabling ESLint rules.

---

## 7. Verification Strategy & Test Matrix

To independently verify the architecture when implemented:

1. **Static Type Validation**:
   - `npx tsc --noEmit` must pass with exit code 0 and zero warnings.
2. **Unit Test Suite (`tests/unit/qa_cheat_controller.test.ts`)**:
   - Verify `skipToStage(stage)` for normal, boss, and challenging stages.
   - Verify all 10 pool capacities and active counts remain 0 after `skipToStage`.
   - Verify all 11 crisis events can be triggered via aliases.
   - Verify all 5 boss encounters spawn on demand.
   - Verify all 3 special moves trigger instantly even with zero energy.
   - Verify `setInvincible(true)` suppresses damage from bullets and collisions.
   - Verify `killAllEnemies()` eliminates all aliens and triggers stage advancement.
   - Verify score milestones and lives manipulation.
3. **Automated 50-Round Memory Drift Test (`tests/unit/m15_50round_memory.test.ts` & Playwright bot)**:
   - Programmatically invoke `skipToStage(i)` for $i = 1 \dots 50$.
   - Assert zero unhandled exceptions, zero pool leaks, and memory stability.
