# Galaga Arcade Web Game — Phase 2 Testing, Verification & Cheat Architecture Specification

- **Author**: `survey_p2_spec_miner_3` (Testing & Cheat Architecture Spec Miner)
- **Status**: Complete Technical Specification
- **Target Milestones**: M9 (50-Round Scaling), M10 (Crisis Events), M11 (Power-Ups), M12 (HUD/Audio), M13 (Cheat Bot & Memory Stress), M14 (Integration & Victory Audit)
- **Authoritative Sources**: `/Users/user/src/galog/.agents/ORIGINAL_REQUEST.md`, `/Users/user/src/galog/COLLABORATION.md`, `/Users/user/src/galog/TEST_INFRA.md`

---

## 1. Executive Summary & Verification Objectives

This specification defines the testing and verification architecture for Galaga Phase 2:
1. **Developer & Automated Bot Cheat Controller (`window.__GALAGA_CHEAT__`)**: A type-safe runtime interface embedded into the master engine, permitting deterministic stage jumping, crisis triggering, entity despawning, power-up spawning, and state inspection.
2. **50-Round Memory & Stress Bot**: Headless Playwright and Vitest runners capable of executing 50 consecutive rounds, validating zero memory leaks (bounded heap growth $< 8\text{ MB}$, zero detached DOM nodes, bounded `ObjectPool` allocations), and 0 unhandled JavaScript exceptions.
3. **Crisis Event Verification Matrix (11 Events)**: Comprehensive unit and integration test specifications for all 11 Stellaris-inspired crisis mechanics, verifying trigger preconditions, active physics modifiers, visual/audio alerts, combat collision rules, and teardown cleanup.
4. **Player Upgrade & Power-Up Verification**: Rigorous test suites for all 5 power-up types (Rapid Fire, Kinetic Deflector, Scatter Shot, EMP Bomb, Engine Booster) and their seamless integration with the classic Dual Fighter docking mechanic.
5. **50-Round Difficulty Scaling Suite**: Mathematical invariant testing for HP scaling across tiers (Classic, Elite, Dreadnought), diving speed multiplier ($1.0\times \to 1.8\times$), firing aggression, challenging stage bonus rounds, and greedy stage badge decomposition for stages 1–50.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Cheat Controller | `skipToStage(n)` | Immediately advances game state to stage `n`, reinitializing wave layout, scaling parameters, and clearing active projectiles | `stage: number` (integer 1–50) | State transition to `STAGE_INTRO` on target stage | Throws `RangeError` or clamps if `n < 1` or `n > 50` | `ORIGINAL_REQUEST.md` §R1, `COLLABORATION.md` §5 |
| 2 | Cheat Controller | `setInvincible(bool)` | Toggles god mode; prevents player ship death from enemy missiles, dive collisions, and hazards | `enabled: boolean` | Updates `player.isInvulnerable()` override | Ignores non-boolean; defaults to toggle | `COLLABORATION.md` §5 |
| 3 | Cheat Controller | `triggerCrisis(type)` | Manually instantiates and activates any of the 11 crisis events bypassing stage 10 threshold | `type: string \| CrisisType` | Dispatches crisis warning banner, audio SFX, and active event mechanics | Logs warning if event already active or invalid type | `ORIGINAL_REQUEST.md` §R2, `COLLABORATION.md` §2 |
| 4 | Cheat Controller | `clearCrisis()` | Aborts current active crisis event, reverting physics and visual effects to normal | None | Destroys active event, restores base engine rules | Safe no-op if no crisis active | `COLLABORATION.md` §2 |
| 5 | Cheat Controller | `spawnPowerUp(type, x, y)` | Spawns specific power-up capsule at coordinates falling towards baseline | `type: PowerUpType`, optional `x, y: number` | Leases `PowerUp` from pool, initiates descent | Rejects unknown type; returns `null` if pool exhausted | `ORIGINAL_REQUEST.md` §R3, `COLLABORATION.md` §3 |
| 6 | Cheat Controller | `clearEnemies()` | Instantly destroys all living active enemies, triggering immediate stage clear transition | None | Marks all enemies inactive, triggers `onStageClear` | Safe no-op if formation empty | `COLLABORATION.md` §5 |
| 7 | Cheat Controller | `setDualFighter(bool)` | Immediately transforms player into Dual Fighter or Single Fighter without tractor beam sequence | `enabled: boolean` | Re-anchors player width, resets missile quota | None; idempotent state assignment | `src/entities/Player.ts:120`, `COLLABORATION.md` §3 |
| 8 | Cheat Controller | `setLives(lives)` | Directly sets player reserve lives | `lives: number` ($\ge 0$) | Updates `scoreManager.lives` and `player.lives` | Clamps negative input to 0 | `src/core/Game.ts:335` |
| 9 | Cheat Controller | `addScore(points)` | Adds score points and triggers extra life checks | `points: number` | Increments score, evaluates milestone life thresholds | Ignores negative points | `src/systems/ScoreManager.ts:150` |
| 10 | Cheat Controller | `getState()` / `getDiagnostics()` | Returns comprehensive engine telemetry snapshot for automated test assertions | None | JSON object with stage, score, lives, pools, crisis, FPS | None (read-only) | `TEST_INFRA.md` §Pass/Fail |
| 11 | Stress Testing | 50-Round E2E Bot | Automated Playwright bot executing 50-round hop with zero leaks and 0 errors | Headless browser execution | Test pass/fail report with heap metrics | Fails if memory grows monotonically or console errors occur | `ORIGINAL_REQUEST.md` Acceptance Criteria |
| 12 | Stress Testing | Pool Allocation Bounds | Enforces strict capacity limits on `ObjectPool` instances during rapid churn | Churn workloads (10,000 ops) | Pool capacity remains $\le \text{maxSize}$ | Returns `null` on exhaustion; rejects double-free | `src/core/ObjectPool.ts:70`, `tests/unit/stress_m2.test.ts` |
| 13 | Crisis Testing | The Contingency | Tests Ghost Signal: player fire rate glitch and predictive/homing enemy missiles | Stage 10+ activation roll | Modifies bullet trajectory vector to intercept player | Clamps fire rate penalty to prevent lockup | `COLLABORATION.md` §2 (Event 1) |
| 14 | Crisis Testing | The Unbidden | Tests Dimensional Tear: canvas ripple shader and gravitational bullet deflection | Active tear coordinate | Curvature applied to player missile `Vector2D` | Bounds gravity magnitude to prevent NaN | `COLLABORATION.md` §2 (Event 2) |
| 15 | Crisis Testing | The Prethoryn Scourge | Tests Infestation Swarm: burst micro-spores on enemy death and chitin regenerative shields | Enemy death event | Spawns radial spore projectiles into bullet pool | Reuses bullet pool; no runaway allocation | `COLLABORATION.md` §2 (Event 3) |
| 16 | Crisis Testing | Shield Overload | Tests Energy Matrix Overdrive: 2-hit kinetic barrier on all living enemies | Incoming player bullet collision | Absorbs 2 hits before decremented to core HP | Barrier flashes cyan; does not drop score | `COLLABORATION.md` §2 (Event 4) |
| 17 | Crisis Testing | Physics Inversion | Tests Singularity Shift: reversed starfield velocity and inverted dive curves | Event lifecycle pulse | Inverts `starfield.speedState` and flight path Y deltas | Clamps entity positions within canvas bounds | `COLLABORATION.md` §2 (Event 5) |
| 18 | Crisis Testing | Hyperspace Storm | Tests Hyperlane Tempest: periodic lightning arcs and 1.4x enemy dive speeds | Periodic interval timer | Movement lane hazards and velocity multiplier | Audio warning before lightning strike | `COLLABORATION.md` §2 (Event 6) |
| 19 | Crisis Testing | Nanite Cloud | Tests Gray Tempest: visual nanite occlusion and stray bullet dissolution into shrapnel | Shrapnel particle spawn | Degrades bullet lifetime; spawns micro-sparks | Bounded within `ParticleSystem` pool | `COLLABORATION.md` §2 (Event 7) |
| 20 | Crisis Testing | Psionic Resonance | Tests Shroud Incursion: translucent phantom enemies in formation | Wave formation spawn | Spawns dummy targets; only real grant score/hit | Hits on phantoms do not increment score/stats | `COLLABORATION.md` §2 (Event 8) |
| 21 | Crisis Testing | Devouring Swarm Frenzy | Tests Hive Fleet Blitz: all formation enemies immediately dive in continuous stream | Event activation | Sets dive interval to 0.2s, removes formation state | Caps concurrent active divers to prevent overflow | `COLLABORATION.md` §2 (Event 9) |
| 22 | Crisis Testing | Nemesis Star-Eater | Tests Dark Matter Ignition: violet ambient lighting and Boss Galaga sweep laser beam | Boss attack state | Wide raycast sweep across playfield | Beam warning flash before continuous damage | `COLLABORATION.md` §2 (Event 10) |
| 23 | Crisis Testing | Time Dilation Field | Tests Chrono Anomaly: fluctuating bullet-time scaling $\tau(t) \in [0.4, 1.8]$ | Timestep accumulator $\tau(t)$ | Modulates enemy update deltas while keeping input crisp | Ensures $\Delta t$ never negative or zero | `COLLABORATION.md` §2 (Event 11) |
| 24 | PowerUp Testing | Rapid Fire (Overclock) | Doubles projectile quota (4 single / 8 dual) and halves cooldown (60ms) | PowerUp collision | Modifies `player.fireCooldown` and bullet limit | Reverts on timer expiration | `COLLABORATION.md` §3 |
| 25 | PowerUp Testing | Kinetic Deflector (Shield) | Absorbs 1 fatal hit from enemy bullet or collision; plays shield shatter SFX | Damage resolution event | Decrements shield hit; keeps player alive | Triggers 1.0s brief invulnerability post-break | `COLLABORATION.md` §3 |
| 26 | PowerUp Testing | Scatter Shot (Multi-Blaster) | Fires 3-way spread projectiles $(-15^\circ, 0^\circ, +15^\circ)$ | Fire action trigger | 3 bullets acquired from pool simultaneously | Recycles all 3 safely on bounds exit | `COLLABORATION.md` §3 |
| 27 | PowerUp Testing | EMP Bomb (Screen Clear) | Consumable item; clears all active enemy bullets and stuns diving enemies | Keypress (`KeyE` / `KeyX`) | Clears `bulletManager`, freezes enemies for 2.0s | Audio boom trigger; screen flash | `COLLABORATION.md` §3 |
| 28 | PowerUp Testing | Engine Booster (Hyper Drive) | Increases lateral velocity to $1.5\times$ (390 px/s) | PowerUp collection | Modifies `player.speed` | Enforces strict [12, 212] boundary clamping | `COLLABORATION.md` §3 |
| 29 | PowerUp Testing | Dual Fighter Stack | Stacks all power-ups onto Dual Fighter (dual shields, 8-missile rapid, twin scatter) | Dual fighter + power-up pickup | Symmetric upgrade render across twin hulls | Asymmetrical destruction drops dual state | `src/entities/Player.ts:240`, `COLLABORATION.md` §3 |
| 30 | Scaling Testing | 50-Stage HP Progression | Verifies HP curves across Classic (1-10), Elite (11-25), Dreadnought (26-50) tiers | Stage index 1–50 | Calculates expected enemy health and armor | Verifies correct bullet hits required per enemy type | `COLLABORATION.md` §1 |
| 31 | Scaling Testing | Speed Multiplier Curve | Verifies diving speed multiplier scales monotonically up to $1.8\times$ baseline | Stage index 1–50 | Speed multiplier $v \in [1.0, 1.8]$ | Smooth clamping prevents numerical overflow | `COLLABORATION.md` §1 |
| 32 | Scaling Testing | Challenging Stage Schedule | Verifies bonus stages at 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47 | Stage index 1–50 | Boolean `isChallengingStage` | Enforces 0 bullets fired, 40 enemies, perfect bonus | `src/core/Game.ts:480`, `COLLABORATION.md` §1 |
| 33 | Scaling Testing | Greedy Badge Decomposition | Verifies greedy badge breakdown (50, 30, 20, 10, 5, 1) for all stages 1–50 | Stage integer 1–50 | Array of `BadgeType` | Mathematical equivalence: $\sum \text{values} = \text{stage}$ | `src/ui/HUD.ts:485` |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | `skipToStage` | `skipToStage(0)` or `skipToStage(-5)` | Input rejected or clamped to stage 1; no negative stage index or undefined badge lookup |
| 2 | `skipToStage` | `skipToStage(51)` or `skipToStage(999)` | Clamped to stage 50 or capped cleanly; stage badge decomposition does not overflow canvas width ($x \ge 96$) |
| 3 | `skipToStage` | Skipping while player is currently in `capturing` or `docking` state | Forces cancel of tractor beam capture; resets player to `normal` or `dual` state; prevents stuck floating player |
| 4 | `setInvincible` | Player in invulnerable mode takes direct hit from Boss Galaga tractor beam | Decoupled: invincibility protects against fatal damage; tractor beam capture can be bypassed or blocked when god mode is active |
| 5 | `triggerCrisis` | Calling `triggerCrisis('THE_UNBIDDEN')` while `THE_CONTINGENCY` is already active | Gracefully disposes active crisis (cleans up hooks/shaders) before initializing new crisis, or returns error code |
| 6 | `spawnPowerUp` | Spawning power-up when `ObjectPool<PowerUp>` is completely full (32 leased) | Returns `null` without throwing exception; does not crash game loop |
| 7 | `clearEnemies` | Calling `clearEnemies()` during sub-wave entry while enemies are mid-Bézier flight | Immediately deactivates all enemies; cancels remaining sub-waves; cleanly triggers stage clear transition |
| 8 | 50-Round Bot | Rapidly clearing 50 stages in < 5 seconds | Object pools maintain partition invariants; zero orphaned active items; garbage collector handles transient telemetry |
| 9 | Memory Profiling | Browser running without `--enable-precise-memory-info` flag | Fallback to `performance.memory` estimation or Playwright CDP session metrics without test failure |
| 10 | Crisis Event | The Unbidden gravitational vortex with bullet at distance $r \approx 0$ | Formula includes epsilon denominator clamp: $\frac{G}{r^2 + 100}$; prevents `Infinity` or `NaN` velocity |
| 11 | Crisis Event | Psionic Resonance phantom enemy destroyed simultaneously with real enemy | Bullet swept collision tests real enemy first; score awarded once; phantom despawns with 0 score |
| 12 | Power-Up | Player collects Shield while already possessing an active Shield | Shield hit points refreshed to max (1 hit); does not stack to 2; plays recharge sound |
| 13 | Power-Up | EMP Bomb triggered on Challenging Stage | Safely clears screen; all 40 flying targets counted as destroyed/hit; awards full bonus score without crash |
| 14 | Scaling | Stage 47 (Challenging Stage) following Dreadnought Stage 46 | Stage 47 correctly suppresses high-speed dreadnought bullets; enemies follow predictable flight curves |

---

## 2. Technical Specification: `window.__GALAGA_CHEAT__` Controller

### 2.1 Interface Definition

The cheat controller must be declared globally on `window` and adhere to the following TypeScript contract:

```typescript
export interface PoolDiagnostics {
  bulletPool: { active: number; capacity: number; free: number; maxSize: number };
  particlePool: { active: number; capacity: number; free: number; maxSize: number };
  powerUpPool?: { active: number; capacity: number; free: number; maxSize: number };
}

export interface CheatGameStateSnapshot {
  stage: number;
  score: number;
  highScore: number;
  lives: number;
  state: string;
  isDual: boolean;
  isInvincible: boolean;
  livingEnemies: number;
  activeCrisis: string | null;
  activePowerUps: string[];
  pools: PoolDiagnostics;
  fps: number;
  tickCount: number;
}

export interface GalagaCheatController {
  // Stage Hopping & Flow Control
  skipToStage(stage: number): void;
  clearEnemies(): void;
  restartGame(): void;

  // Invincibility & Health
  setInvincible(enabled: boolean): void;
  isInvincible(): boolean;
  setLives(lives: number): void;
  addScore(points: number): void;

  // Stellaris Crisis Event Injection
  triggerCrisis(crisisType: string): boolean;
  clearCrisis(): void;
  getActiveCrisis(): string | null;

  // Power-Up & Upgrades
  spawnPowerUp(powerUpType: string, x?: number, y?: number): boolean;
  clearPowerUps(): void;
  setDualFighter(enabled: boolean): void;
  setRapidFire(enabled: boolean): void;
  setShield(enabled: boolean): void;

  // Diagnostic Telemetry
  getGameState(): CheatGameStateSnapshot;
  getPoolStats(): PoolDiagnostics;
}

declare global {
  interface Window {
    __GALAGA_CHEAT__?: GalagaCheatController;
    getGame?: () => any;
  }
}
```

### 2.2 Detailed Method Contracts

1. `skipToStage(stage: number): void`:
   - **Preconditions**: Game engine is instantiated (`gameInstance !== null`).
   - **Parameters**: `stage` clamped to $[1, 50]$. If `stage` is non-finite or $< 1$, default to 1; if $> 50$, clamp to 50.
   - **Behavior**:
     - Cancels any active tractor beam or capture animations.
     - Resets active projectiles in `bulletManager.clear()`.
     - Clears particle effects via `particleSystem.clear()`.
     - Clears any active crisis via `crisisEventManager.clearCrisis()`.
     - Sets `scoreManager.setStage(stage)`.
     - Invokes `formationManager.spawnStage(stage)`.
     - Transitions engine state to `STAGE_INTRO`.
   - **Postconditions**: Engine stage matches target; all pools partitioned to 0 active items.

2. `setInvincible(enabled: boolean): void`:
   - **Behavior**: Sets internal flag `player.godMode = enabled`.
   - **Collision Behavior**: When `godMode === true`, `resolveCollisions()` bypasses lethal damage routines, bullet hits, and dive collision checks against the player.

3. `triggerCrisis(crisisType: string): boolean`:
   - **Behavior**: Passes string identifier (e.g. `'THE_CONTINGENCY'`, `'THE_UNBIDDEN'`, `'SHIELD_OVERLOAD'`) to `CrisisEventManager.triggerEvent(type)`.
   - **Return**: `true` if event successfully instantiated and started; `false` if unrecognized or another crisis is already active.
   - **Side Effects**: Sets HUD alert banner state, triggers Web Audio procedural alarm SFX.

4. `clearCrisis(): void`:
   - **Behavior**: Invokes `CrisisEventManager.abortCurrentEvent()`, restoring base gravity, starfield speed, and weapon parameters.

5. `spawnPowerUp(powerUpType: string, x?: number, y?: number): boolean`:
   - **Behavior**: Acquires `PowerUp` from `PowerUpManager.pool`, initializes type to `powerUpType`, positions at `(x ?? 112, y ?? 20)`, velocity $v_y = 60\text{ px/s}$.
   - **Return**: `true` on successful spawn; `false` if pool is exhausted or type is invalid.

6. `clearEnemies(): void`:
   - **Behavior**: Iterates all enemies in `formationManager.enemies`; sets `active = false` and `state = EnemyState.INACTIVE`.
   - **Transition**: Triggers `formationManager.onStageClear?.()` if all enemies cleared.

7. `setDualFighter(enabled: boolean): void`:
   - **Behavior**: Directly sets `player.isDual = enabled`, updates player sprite width (`16` vs `32`), adjusts hitbox, and updates missile quota limit.

8. `getGameState(): CheatGameStateSnapshot`:
   - **Return**: Atomic JSON-serializable snapshot of game telemetry for test assertions.

### 2.3 Security & Runtime Gating

To protect production performance and bundle integrity:
- Controller attached during `main.ts:bootstrap()`.
- Always active in test environments (`process.env.NODE_ENV !== 'production' || window.location.search.includes('cheat=1') || true` in development).

---

## 3. Technical Specification: Automated 50-Round Stress & Memory Bot

### 3.1 Test Runners Architecture

We establish two complementary testing layers for 50-round verification:
1. **Vitest Headless Fast Simulation (`tests/unit/stress_50_rounds.test.ts`)**:
   - Executes full 50-round game loop updates in Node.js environment via mock canvas/audio.
   - Verifies mathematical invariants, state transitions, ObjectPool bounding, and garbage collection behavior over 15,000+ physics ticks.
   - Runtime duration: $\approx 5\text{ seconds}$.
2. **Playwright Browser E2E Memory Bot (`tests/e2e/stress-memory-bot.test.ts`)**:
   - Runs in real headless Chromium browser across actual canvas rendering, Web Audio API, and DOM lifecycle.
   - Uses `page.evaluate()` to call `window.__GALAGA_CHEAT__` methods.
   - Measures heap memory via Chrome DevTools Protocol (`Performance.getMetrics` and `HeapProfiler.takeHeapSnapshot`).
   - Asserts 0 console errors, 0 unhandled rejections, and bounded memory growth.

### 3.2 Memory Leak Verification Criteria

| Metric | Target / Threshold | Measurement Method | Failure Condition |
|---|---|---|---|
| **JS Heap Delta** | $< 8.0\text{ MB}$ net increase after GC between Stage 1 and Stage 50 | CDP `Performance.getMetrics` (`JSHeapUsedSize`) after `window.gc()` | Growth rate $\ge 8.0\text{ MB}$ or continuous monotonic growth |
| **DOM Node Count** | Exactly 1 canvas element (`#game-canvas`), 0 leaked wrapper nodes | `page.evaluate(() => document.querySelectorAll('*').length)` | DOM node count increases during stage transitions |
| **Event Listeners** | Constant count on `window` and `#game-canvas` (input, resize, visibility) | CDP `DOMDebugger.getEventListeners` | Listener count increases after stage hops |
| **Pool Capacities** | `BulletPool` $\le 128$<br>`ParticlePool` $\le 256$<br>`PowerUpPool` $\le 32$ | Read via `__GALAGA_CHEAT__.getPoolStats()` | Any pool capacity expands beyond configured `maxSize` |
| **Orphaned Entities** | 0 living enemies, 0 bullets, 0 particles between wave clears | Inspected during `STAGE_CLEAR` and `STAGE_INTRO` | Leaked active entities floating off-screen |
| **Runtime Errors** | **0** page errors, 0 console errors, 0 unhandled rejections | Playwright `page.on('pageerror')` and `page.on('console')` | Any uncaught exception thrown during 50 rounds |

### 3.3 50-Round E2E Bot Algorithm

```typescript
test('TC-E2E-50R: Automated 50-Round Stress & Memory Bot Execution', async ({ page }) => {
  const errorCollector = createErrorCollector(page);
  await page.goto('/?cheat=1', { waitUntil: 'load' });
  await page.click('#game-canvas');
  await page.waitForTimeout(500);

  // 1. Verify Cheat Controller presence
  const cheatAvailable = await page.evaluate(() => typeof window.__GALAGA_CHEAT__ !== 'undefined');
  expect(cheatAvailable).toBe(true);

  // 2. Enable Invincibility for endurance run
  await page.evaluate(() => window.__GALAGA_CHEAT__?.setInvincible(true));

  // 3. Baseline Heap Snapshot (Stage 1)
  const baselineMetrics = await page.evaluate(() => window.__GALAGA_CHEAT__?.getGameState());
  const initialHeap = await getJSHeapSize(page);

  // 4. Iterate through all 50 rounds
  for (let targetStage = 1; targetStage <= 50; targetStage++) {
    // Skip to target stage
    await page.evaluate((stage) => {
      window.__GALAGA_CHEAT__?.skipToStage(stage);
    }, targetStage);

    // Allow wave entry to initialize
    await page.waitForTimeout(100);

    // Verify stage in game telemetry
    const telemetry = await page.evaluate(() => window.__GALAGA_CHEAT__?.getGameState());
    expect(telemetry.stage).toBe(targetStage);

    // Simulate crisis injection on milestone stages (10, 15, 20, 25, 30, 35, 40, 45, 50)
    if (targetStage >= 10 && targetStage % 5 === 0) {
      const crisisList = [
        'THE_CONTINGENCY', 'THE_UNBIDDEN', 'THE_PRETHORYN_SCOURGE',
        'SHIELD_OVERLOAD', 'PHYSICS_INVERSION', 'HYPERSPACE_STORM',
        'NANITE_CLOUD', 'PSIONIC_RESONANCE', 'DEVOURING_SWARM_FRENZY',
        'NEMESIS_STAR_EATER', 'TIME_DILATION_FIELD'
      ];
      const crisisType = crisisList[(targetStage / 5) % crisisList.length];
      await page.evaluate((c) => window.__GALAGA_CHEAT__?.triggerCrisis(c), crisisType);
      await page.waitForTimeout(100);
    }

    // Clear enemies to trigger stage completion
    await page.evaluate(() => window.__GALAGA_CHEAT__?.clearEnemies());
    await page.waitForTimeout(80);

    // Periodic Pool Capacity Invariant Checks
    const poolStats = await page.evaluate(() => window.__GALAGA_CHEAT__?.getPoolStats());
    expect(poolStats.bulletPool.capacity).toBeLessThanOrEqual(128);
    expect(poolStats.particlePool.capacity).toBeLessThanOrEqual(256);
  }

  // 5. Final Stage 50 Telemetry & Memory Assessment
  const finalTelemetry = await page.evaluate(() => window.__GALAGA_CHEAT__?.getGameState());
  expect(finalTelemetry.stage).toBe(50);

  const finalHeap = await getJSHeapSize(page);
  const netHeapGrowthMB = (finalHeap - initialHeap) / (1024 * 1024);
  console.log(`[50-Round Memory Profiling] Initial: ${(initialHeap/1024/1024).toFixed(2)} MB, Final: ${(finalHeap/1024/1024).toFixed(2)} MB, Net: ${netHeapGrowthMB.toFixed(2)} MB`);

  // Assert zero memory leak (threshold < 8.0 MB)
  expect(netHeapGrowthMB).toBeLessThan(8.0);

  // Assert zero runtime errors
  expect(errorCollector.getErrors()).toEqual([]);
});
```

---

## 4. Technical Specification: Crisis Event Unit & Integration Test Specifications

Each crisis event must have dedicated Vitest unit tests in `tests/unit/crisis/` verifying the 5 lifecycle phases:
1. **Factory Registration & Instantiation**: Registered in `CrisisEventFactory`, validates type enum.
2. **Activation & UI/Audio Alert**: Warning banner state active, siren sound triggered.
3. **Mechanical Modifiers**: Game logic alters as specified by the event.
4. **Collision & Entity Resolution**: Hits and interactions follow event-specific rules.
5. **Teardown & Cleanliness**: State, pools, and hooks cleanly restored on event completion.

### Event 1: The Contingency (우발사태 — Ghost Signal)
- **Identifier**: `CrisisType.THE_CONTINGENCY` ('THE_CONTINGENCY')
- **Mechanics Under Test**:
  - Ghost Signal pulses every 4.0s. During pulse, player input experiences transient fire lockup ($+0.15\text{s}$ cooldown).
  - Enemy diving missiles become predictive: bullet vector calculated with lead pursuit:
    $\vec{P}_{target} = \vec{P}_{player} + \vec{V}_{player} \times \frac{dist}{v_{bullet}}$.
- **Assertions**:
  - `expect(crisis.isActive()).toBe(true)`
  - `expect(player.fireCooldownTimer).toBeGreaterThan(Player.FIRE_COOLDOWN)`
  - Calculated enemy bullet trajectory angle differs from direct static angle by $> 0.05\text{ rad}$ when player has non-zero velocity.
  - On teardown: bullet trajectory reverts to baseline; cooldown restored to 120ms.

### Event 2: The Unbidden (이차원 침략자 — Dimensional Tear)
- **Identifier**: `CrisisType.THE_UNBIDDEN` ('THE_UNBIDDEN')
- **Mechanics Under Test**:
  - Generates a space-time rift entity at `(tearX, tearY)` (typically screen center `112, 120`).
  - Gravitational pull applied to all active player bullets within radius $R = 80$:
    $\vec{a} = \frac{G}{(r^2 + 100)} \hat{r}$.
  - Visual chromatic aberration post-process flag enabled on canvas context.
- **Assertions**:
  - Fired player missile passing near tear deviates along curved path ($v_x \ne 0$).
  - Missiles passing outside radius $R$ remain straight ($v_x = 0$).
  - Teardown: tear removed; no lingering acceleration on recycled bullets.

### Event 3: The Prethoryn Scourge (생물군집 — Infestation Swarm)
- **Identifier**: `CrisisType.THE_PRETHORYN_SCOURGE` ('THE_PRETHORYN_SCOURGE')
- **Mechanics Under Test**:
  - Enemies gain chitinous regenerative shield: `enemy.chitinShield = 1`.
  - When an enemy is destroyed, it bursts into 4 micro-spore projectiles ejected at $90^\circ$ increments into `bulletManager`.
- **Assertions**:
  - Zako requires 2 hits (Hit 1: breaks chitin shield; Hit 2: destroys Zako).
  - On enemy destruction, `bulletManager.getEnemyBulletCount()` increments by 4.
  - Spores recycled when exiting canvas boundaries ($y > 288$ or $x < 0$ or $x > 224$).

### Event 4: Shield Overload (에너지 과부하 — Energy Matrix Overdrive)
- **Identifier**: `CrisisType.SHIELD_OVERLOAD` ('SHIELD_OVERLOAD')
- **Mechanics Under Test**:
  - Living enemies gain hexagonal kinetic shields absorbing the first 2 hits without damage to health.
  - Visual shield flash: rendered with cyan hex outline.
- **Assertions**:
  - `enemy.takeDamage(1)` returns `{ destroyed: false, wasDamaged: false }` on hits 1 and 2.
  - Hit 3 inflicts actual health damage.
  - Boss Galaga requires 4 total hits (2 shield + 2 core HP).

### Event 5: Physics Inversion / Gravity Flip (물리법칙 왜곡 — Singularity Shift)
- **Identifier**: `CrisisType.PHYSICS_INVERSION` ('PHYSICS_INVERSION')
- **Mechanics Under Test**:
  - Starfield scroll direction inverts: `starfield.velocity = -baselineVelocity`.
  - Enemy diving trajectories invert vertical inflection: dive apex ascends or loops backwards.
  - Player controls inverted (Left moves Right, Right moves Left).
- **Assertions**:
  - `starfield.getStars()[0].speed < 0` or reverse scrolling flag set.
  - Pressing `ArrowLeft` produces positive velocity `player.vx > 0`.
  - Teardown: controls and starfield direction restored to normal.

### Event 6: Hyperspace Storm (초공간 폭풍 — Hyperlane Tempest)
- **Identifier**: `CrisisType.HYPERSPACE_STORM` ('HYPERSPACE_STORM')
- **Mechanics Under Test**:
  - Cosmic lightning columns strike periodically (e.g. 32px wide vertical band) warning 0.6s prior with faint blue ionization, then damaging player if touched.
  - Enemy dive velocity multiplied by $1.4\times$.
- **Assertions**:
  - Lightning column AABB intersects player hitbox: triggers player hit.
  - Player outside column: safe.
  - Enemy `diveSpeed` equals base $\times 1.4$.

### Event 7: Nanite Cloud / Gray Tempest (나노머신 폭풍 — Gray Goo Disruption)
- **Identifier**: `CrisisType.NANITE_CLOUD` ('NANITE_CLOUD')
- **Mechanics Under Test**:
  - Swarm of micro-nanite particles renders over the playfield.
  - Stray player bullets hitting nanite clusters dissolve with reduced lifespan and burst into 2 mini-shrapnel sparks.
- **Assertions**:
  - Particle pool active count increases during nanite storm.
  - Bullet lifespan or penetration is degraded upon cloud contact.
  - Pool bounding: `particlePool.getActiveCount() <= 200`.

### Event 8: Psionic Resonance / Shroud Breach (장막 침식 — Shroud Incursion)
- **Identifier**: `CrisisType.PSIONIC_RESONANCE` ('PSIONIC_RESONANCE')
- **Mechanics Under Test**:
  - Formation generates translucent phantom clones (`isPhantom = true`, alpha 0.45).
  - Phantom enemies perform dives alongside real enemies.
  - Hitting a phantom destroys phantom, yields 0 points, and does NOT count toward stage clear.
  - Hitting a real enemy awards normal score.
- **Assertions**:
  - `bullet vs phantom` collision destroys phantom with 0 score.
  - Stage clear only triggers when all real enemies are eliminated, regardless of active phantoms.

### Event 9: Devouring Swarm Frenzy (군체 광란 — Hive Fleet Blitz)
- **Identifier**: `CrisisType.DEVOURING_SWARM_FRENZY` ('DEVOURING_SWARM_FRENZY')
- **Mechanics Under Test**:
  - All enemies break formation immediately and begin continuous, rapid dive-bomb runs.
  - `diveInterval` reduced to 0.25s; `maxConcurrentDivers` increased to 8.
- **Assertions**:
  - `formationManager.getLivingEnemies().every(e => e.state !== EnemyState.IN_FORMATION)` within 2 seconds of trigger.
  - Diver count reaches maximum allowable concurrency without pool overflow.

### Event 10: Nemesis Star-Eater Ignition (항성 포식자 점화 — Dark Matter Ignition)
- **Identifier**: `CrisisType.NEMESIS_STAR_EATER` ('NEMESIS_STAR_EATER')
- **Mechanics Under Test**:
  - Screen ambient light darkens to deep violet (`#120024`).
  - Surviving Boss Galagas enter charging stance (1.0s yellow beacon), then fire a sweeping continuous beam ray across the playfield bottom.
- **Assertions**:
  - Beam ray intersects player baseline `y = 250`: inflicts damage if unshielded.
  - Shield absorbs beam; player god mode prevents death.
  - Beam cleans up after 1.5s duration.

### Event 11: Time Dilation Field (시간 지연장 — Chrono Anomaly)
- **Identifier**: `CrisisType.TIME_DILATION_FIELD` ('TIME_DILATION_FIELD')
- **Mechanics Under Test**:
  - Global enemy time multiplier oscillates sinusoidally:
    $\tau(t) = 1.1 + 0.7 \sin(2\pi \cdot 0.25 \cdot t) \in [0.4, 1.8]$.
  - Player movement speed remains unscaled ($260\text{ px/s}$), creating bullet-time advantage/challenge windows.
- **Assertions**:
  - When $\tau < 0.8$, enemy velocity and animation timers advance in slow motion.
  - When $\tau > 1.3$, enemy dives accelerate.
  - $\tau(t)$ never drops $\le 0$; delta time remains strictly positive.

---

## 5. Technical Specification: PowerUp & Player Upgrade Test Specifications

### 5.1 PowerUp Item Architecture

`PowerUpManager` leases items from an `ObjectPool<PowerUp>` (capacity 32).

```typescript
export enum PowerUpType {
  RAPID_FIRE = 'RAPID_FIRE',
  KINETIC_SHIELD = 'KINETIC_SHIELD',
  SCATTER_SHOT = 'SCATTER_SHOT',
  EMP_BOMB = 'EMP_BOMB',
  ENGINE_BOOSTER = 'ENGINE_BOOSTER',
}

export interface PowerUpItem {
  type: PowerUpType;
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
}
```

### 5.2 Unit Test Specifications per Upgrade

1. **Rapid Fire (Overclock)**:
   - **Test**: Collect `PowerUpType.RAPID_FIRE`.
   - **Assertions**:
     - Single Fighter: `bulletManager.getMaxPlayerBullets()` returns 4 (normal: 2).
     - Fire cooldown: `player.fireCooldown` drops from 120ms to 60ms.
     - Spams fire key: 4 missiles co-exist simultaneously on screen.
     - Expiration: After 15.0s, cooldown and missile quota restore to normal.

2. **Kinetic Deflector (Shield)**:
   - **Test**: Collect `PowerUpType.KINETIC_SHIELD`.
   - **Assertions**:
     - `player.shieldHits` equals 1.
     - Enemy bullet hits player: bullet is recycled, `player.shieldHits` drops to 0, player remains in `'normal'` or `'dual'` state (not `'destroyed'`).
     - 1.0s temporary invulnerability triggers post-shatter.
     - Subsequent hit without shield destroys player normally.

3. **Scatter Shot (Multi-Blaster)**:
   - **Test**: Collect `PowerUpType.SCATTER_SHOT`.
   - **Assertions**:
     - Firing spawns 3 missiles simultaneously: center ($v_x = 0, v_y = -480$), left ($v_x = -120, v_y = -460$), right ($v_x = 120, v_y = -460$).
     - Swept CCD hitbox checks apply to all 3 missiles.
     - All 3 recycled upon screen boundary exit.

4. **EMP Bomb (Screen Clear)**:
   - **Test**: Collect `PowerUpType.EMP_BOMB`.
   - **Assertions**:
     - Player inventory: `player.empBombs = 1`.
     - Press `KeyE` / `KeyX`:
       - All active enemy bullets in `bulletManager` are instantly cleared (`activeEnemyBullets === 0`).
       - Diving enemies stun in place for 2.0s ($v_x = 0, v_y = 0$).
       - `particleSystem` triggers full-screen flash particle shockwave.

5. **Engine Booster (Hyper Drive)**:
   - **Test**: Collect `PowerUpType.ENGINE_BOOSTER`.
   - **Assertions**:
     - `player.speed` equals $390\text{ px/s}$ (base: $260\text{ px/s}$).
     - Moving left/right for 0.5s covers $195\text{ px}$ vs $130\text{ px}$.
     - Clamping at $x = 12$ and $x = 212$ remains impenetrable.

6. **Dual Fighter Rescue & Upgrade Stacking Integration**:
   - **Test**: Player acquires Dual Fighter via Boss Galaga tractor beam rescue, then acquires upgrades.
   - **Assertions**:
     - Dual Fighter + Shield: renders dual cyan aura circles; hit absorbs shield without splitting hulls.
     - Dual Fighter + Rapid Fire: max missiles becomes 8; dual cannons fire quad streams.
     - Dual Fighter + Scatter Shot: dual hulls fire twin 3-way spreads (6 simultaneous missiles).
     - Asymmetrical destruction: Dual Fighter (no shield) hit on left wing: left fighter destroyed, right fighter survives as Single Fighter; power-up status preserved.

---

## 6. Technical Specification: 50-Round Difficulty Scaling Verification Tests

### 6.1 Scaling Mathematical Invariants

The 50-round difficulty progression must adhere strictly to deterministic mathematical formulas:

1. **Enemy Health by Tier**:
   $$\text{Zako HP}(s) = \begin{cases} 1 & 1 \le s \le 10 \\ 2 & 11 \le s \le 50 \end{cases}$$
   $$\text{Goei HP}(s) = \begin{cases} 1 & 1 \le s \le 10 \\ 2 & 11 \le s \le 25 \\ 3 & 26 \le s \le 50 \end{cases}$$
   $$\text{Boss HP}(s) = \begin{cases} 2 & 1 \le s \le 10 \\ 3 & 11 \le s \le 25 \\ 4 & 26 \le s \le 50 \end{cases}$$

2. **Diving Velocity Scaling ($1.0\times \to 1.8\times$)**:
   $$v_{dive}(s) = \min\left(1.8, 1.0 + (s - 1) \times \frac{0.8}{49}\right) \times 160\text{ px/s}$$

3. **Dive Attack Interval**:
   $$T_{dive}(s) = \max(0.8\text{s}, 3.5\text{s} - (s - 1) \times 0.055\text{s})$$

4. **Maximum Concurrent Divers**:
   $$N_{divers}(s) = \min(8, 2 + \lfloor s / 7 \rfloor)$$

5. **Enemy Bullet Speed**:
   $$v_{bullet}(s) = \min(320\text{ px/s}, 180\text{ px/s} + s \times 2.8\text{ px/s})$$

### 6.2 Challenging Stage Schedule Invariants

Challenging stages occur at formula:
$$\text{Stage } s \text{ is challenging} \iff s \ge 3 \land (s - 3) \pmod 4 = 0$$
Valid challenging stages $\le 50$: **3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47**.

- **Unit Test Invariants for all 12 Challenging Stages**:
  - `game.isChallengingStage(s)` strictly returns `true`.
  - Enemies do not peel off into attack dives (`divers.length === 0`).
  - Enemies never fire bullets (`bulletManager.getEnemyBulletCount() === 0`).
  - Player ship cannot be captured or destroyed.
  - Perfect score (40 hits) awards 10,000 bonus points and triggers fanfare.

### 6.3 Stage Badge Greedy Decomposition (Stages 1–50)

The HUD renders stage badges right-to-left using denominations:
- `FLAG_50` (value 50)
- `FLAG_30` (value 30)
- `FLAG_20` (value 20)
- `FLAG_10` (value 10)
- `FLAG_5` (value 5)
- `FLAG_1` (value 1)

**Mathematical Verification Suite**:
```typescript
describe('50-Round HUD Stage Badge Decomposition Verification', () => {
  it('correctly decomposes every integer stage from 1 to 50 with exact sum matching', () => {
    const BADGE_VALUES: Record<BadgeType, number> = {
      [BadgeType.FLAG_50]: 50,
      [BadgeType.FLAG_30]: 30,
      [BadgeType.FLAG_20]: 20,
      [BadgeType.FLAG_10]: 10,
      [BadgeType.FLAG_5]: 5,
      [BadgeType.FLAG_1]: 1,
    };

    for (let stage = 1; stage <= 50; stage++) {
      const decomp = HUD.decomposeStage(stage);
      const sum = decomp.badges.reduce((acc, b) => acc + BADGE_VALUES[b], 0);

      expect(sum).toBe(stage);
      expect(decomp.totalWidth).toBeLessThan(128); // Ensure HUD fits without crowding reserve lives
    }
  });

  it('verifies milestone stage badge configurations', () => {
    expect(HUD.decomposeStage(1).badges).toEqual([BadgeType.FLAG_1]);
    expect(HUD.decomposeStage(5).badges).toEqual([BadgeType.FLAG_5]);
    expect(HUD.decomposeStage(10).badges).toEqual([BadgeType.FLAG_10]);
    expect(HUD.decomposeStage(20).badges).toEqual([BadgeType.FLAG_20]);
    expect(HUD.decomposeStage(30).badges).toEqual([BadgeType.FLAG_30]);
    expect(HUD.decomposeStage(50).badges).toEqual([BadgeType.FLAG_50]);
  });
});
```

---

## 7. Implementation Checklist & Verification Gates for Worker Agents

When implementing Phase 2 milestones, following verification gates must be satisfied:

1. **`M9` (50-Round Scaling Engine)**:
   - [ ] Difficulty formulas implemented in `src/systems/FormationManager.ts` & `src/entities/Enemy.ts`.
   - [ ] Vitest suite in `tests/unit/stage_scaling.test.ts` verifying all 50 stages pass mathematical invariant checks.
2. **`M10` (Crisis Architecture & 10+ Events)**:
   - [ ] `CrisisEventFactory.ts` & `CrisisEventManager.ts` registered with 11 concrete crisis handlers.
   - [ ] Vitest suite in `tests/unit/crisis_events.test.ts` validating each crisis event's 5 lifecycle phases.
3. **`M11` (Player Power-Up System)**:
   - [ ] `PowerUpManager.ts` with `ObjectPool<PowerUp>` (max 32).
   - [ ] 5 Power-up types operational and stackable with Dual Fighter.
   - [ ] Vitest suite in `tests/unit/powerup_system.test.ts`.
4. **`M12` (Crisis Warning HUD & Audio)**:
   - [ ] HUD pulsing warning banner and Web Audio procedural klaxon alarm operational.
   - [ ] Tests verifying HUD rendering and sound synth triggers without audio context crashes.
5. **`M13` (`window.__GALAGA_CHEAT__` & 50-Round Bot)**:
   - [ ] `__GALAGA_CHEAT__` exposed on `window` with full method suite.
   - [ ] Vitest headless runner `tests/unit/stress_50_rounds.test.ts` passing 50 rounds with zero leaks.
   - [ ] Playwright E2E bot `tests/e2e/stress-memory-bot.test.ts` running 50 rounds in headless Chromium with net heap growth $< 8\text{ MB}$ and 0 errors.
6. **`M14` (Final Integration & Audit)**:
   - [ ] Full regression: all 546 baseline unit tests + new Phase 2 test suites passing (target $> 700$ unit tests).
   - [ ] All cross-browser Playwright tests passing.
