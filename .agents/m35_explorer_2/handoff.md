# Milestone M35 Exploration Report: Zero-GC Heap Profiling & Dual Workspace Mirror Parity Sync

**Agent**: `m35_explorer_2`  
**Working Directory**: `/Users/user/src/galog/.agents/m35_explorer_2`  
**Parent Conversation ID**: `0236827c-a7d2-4115-a374-2f5c45ed8134`  
**Timestamp**: 2026-09-14T20:34:00+09:00  

---

## 1. Observation

### 1.1 Existing Soak & Memory Profiling Test Harnesses
Direct code inspection of existing memory profiling suites revealed the following patterns:
1. **`tests/unit/m25_soak_pool_invariants.test.ts` (Lines 8–13, 56–72, 382–539)**:
   - Simulates 7,000+ combat ticks across Stages 1..50.
   - Employs `v8.setFlagsFromString('--expose_gc')` with `vm.runInNewContext('gc')` for deterministic V8 garbage collection.
   - Measures `process.memoryUsage().heapUsed` before and after long sessions.
   - Strictly enforces net heap drift $< 5.0\text{ MB}$ (empirically achieves $< 0.85\text{ MB}$).
   - Asserts capacity bounds and zero active leases (`getActiveCount() === 0`, `getFreeCount() === getCapacity()`) across all 9 object pools at stage teardown boundaries.
2. **`tests/unit/m21_challenger_2_long_session_leak.test.ts` (Lines 268–407)**:
   - Simulates 10,700+ game engine update ticks across two full 50-round loops.
   - Verifies zero heap growth over 10,000 continuous uninterrupted ticks with checkpointing every 2,500 frames.
   - Verifies finite coordinates and zero NaNs (`assertZeroNaN`).
3. **`tests/e2e/memory_bot_50round.spec.ts` (Lines 17–127)**:
   - Uses Playwright CDP (`HeapProfiler.collectGarbage`, `Performance.getMetrics` -> `JSHeapUsedSize`) across 50 continuous rounds in Chromium.
   - Demonstrates 0 console errors and continuous active canvas rendering.

### 1.2 Co-op Subsystems Memory & Allocation Profile
Inspection of the newly added co-op multiplayer systems revealed:
1. **`src/systems/PlayerManager.ts` (Lines 24–68, 105–109, 174–218, 321–345)**:
   - `p1` (Classic) and `p2` (Crimson) are instantiated once at constructor time or when `setMode('coop')` is invoked.
   - `update(dt, inputs)` updates both players sequentially without allocating temporary state wrappers.
   - `donateLife(donorId)` decrements donor lives, restores recipient lives, invokes `recipient.respawn()`, and spawns particles via `particleSystem.spawnReviveSparkles(donor.x, donor.y, recipient.x, recipient.y)`.
2. **`src/entities/Bullet.ts` (Lines 250–276, 313–360)**:
   - `BulletManager` manages `bulletPool` (`ObjectPool<Bullet>`, initial 32, max 256, `autoExpand: true` up to 256).
   - Projectile allocation supports `ownerId: 'p1' | 'p2'`, tracking `activeP1BulletCount` and `activeP2BulletCount` independently.
   - When bullets expire or leave the screen, `b.reset()` clears `ownerId` and returns the instance to `bulletPool`.
3. **`src/ui/InputHandler.ts` (Lines 292–298)**:
   - `getDualInputState()` returns `this.dualState` (a pre-allocated object `{ p1: this.p1State, p2: this.p2State }`). Zero allocations per tick.
4. **`src/ui/BottomDashboard.ts` (Lines 26–120, 480–560)**:
   - Zero-GC dirty checking engine. Uses pre-allocated frozen lookup tables `PERCENT_STRINGS` ('0%'..'100%') and `REVIVE_COUNTDOWN_STRINGS` ('REVIVE: 0S'..'REVIVE: 15S').
   - State comparisons prevent DOM writes when telemetry has not changed.
5. **`src/systems/ParticleSystem.ts` (Lines 458–484)**:
   - `spawnReviveSparkles` acquires particles from `this.pool` (`particlePool`, max 256, initial 250, `autoExpand: false`). If capacity is saturated, `acquire()` returns null gracefully (`if (!p) break;`). Expired particles naturally recycle.

### 1.3 Dual Workspace Mirror Parity Audit
A comprehensive filesystem comparison between `/Users/user/src/galog` (branch `feature/coop-multiplayer`) and `/Users/user/teamwork_projects/galaga_game` was performed using Python `filecmp` and `rsync -avun`.

Direct tool output:
```
Total identical files: 226
Differing files: 5
  - COLLABORATION.md
  - index.html
  - src/core/Game.ts
  - src/types/index.ts
  - src/ui/BottomDashboard.ts
Files only in /Users/user/src/galog (4 files):
  - tests/unit/adversarial_m34_dashboard_stress.test.ts
  - tests/unit/adversarial_m34_layout_reflow.test.ts
  - tests/unit/adversarial_m34_rem_challenge.test.ts
  - tests/unit/m34_dual_dashboard.test.ts
Files only in /Users/user/teamwork_projects/galaga_game: 0
```

Current Test Suite Execution Status:
- `/Users/user/src/galog`: **123 test files passed**, **2,238 tests passed (100%)**
- `/Users/user/teamwork_projects/galaga_game`: **119 test files passed**, **2,166 tests passed (100%)**
- Delta: Exactly **4 test files** and **72 tests** (the M34 test suite added in `galog`).

---

## 2. Logic Chain

1. **Memory Invariant Analysis**:
   - The Galaga game engine relies on a strict zero-allocation architecture during the 60 FPS animation loop.
   - Long sessions (e.g. 5,000 frames $\approx 83.3\text{ seconds}$) in 2-player co-op present increased memory pressure:
     - 2 active players moving and firing concurrently doubling projectile traffic.
     - Periodic co-op life donation transfers triggering sparkle particle bursts (`spawnReviveSparkles`).
     - Dying players entering `REVIVE_PENDING` (10s countdown) and respawning.
     - Dual-HUD telemetry updates synchronizing both P1 and P2 metrics every tick.
   - Inspection of `PlayerManager`, `BulletManager`, `ParticleSystem`, `InputHandler`, and `BottomDashboard` confirms that:
     - All 9 pools (`bulletPool`, `particlePool`, `powerUpPool`, `enemyPool`, `phantomPool`, `bombPool`, `explosionPool`, `missilePool`, `sparkPool`) enforce hard maximum capacity caps.
     - `InputHandler.getDualInputState()` reuses `this.dualState` without object instantiation.
     - `BottomDashboard` dirty checking diffs existing primitives and reuses frozen string tables.
   - Therefore, an automated 5,000-frame co-op soak test (`tests/unit/m35_coop_zero_gc_soak.test.ts`) can run continuously at 60 FPS while asserting $< 5.0\text{ MB}$ net heap drift, bounded capacities, zero un-recycled leases, and finite coordinates.

2. **Mirror Parity Analysis**:
   - Phase 5 (M26–M30) completed with both workspaces bitwise identical.
   - Milestones M31–M33 (multi-entity players, dual inputs, co-op dynamic scaling/revive) were mirrored to `/Users/user/teamwork_projects/galaga_game` earlier during development.
   - Milestone M34 (symmetrical bottom dashboard, 3-zone layout, zero-GC dirty checking) was implemented in `/Users/user/src/galog`.
   - Consequently, `/Users/user/teamwork_projects/galaga_game` currently lacks the M34 UI code (`src/ui/BottomDashboard.ts`, `src/types/index.ts`, `src/core/Game.ts`, `index.html`, `COLLABORATION.md`) and the 4 M34 test files.
   - A single deterministic `rsync` command excluding ephemeral folders (`node_modules`, `dist`, `.git`, `.agents`, etc.) will bring `/Users/user/teamwork_projects/galaga_game` into 100% bitwise parity with `/Users/user/src/galog`.

---

## 3. Caveats

1. **Node V8 Heap Measurement**:
   - `process.memoryUsage().heapUsed` reflects V8 engine internals (including JIT compilation buffers and IC cache). Calling `forceGC()` before baseline and after final measurement is essential to eliminate young-generation garbage noise.
2. **Vitest JIT Warm-up**:
   - The first 60–120 frames in any benchmark trigger JIT deoptimizations and function inline compiling. A pre-warmup loop of 120 ticks before capturing `baselineHeap` ensures true runtime drift measurement.
3. **Workspace Write Restriction**:
   - Per **RULE[user_global]**, this report is read-only exploration. No source files or mirror synchronizations have been executed without explicit user approval.

---

## 4. Conclusion & Architectural Blueprints

### 4.1 5,000-Frame Co-op Soak Test Blueprint (`tests/unit/m35_coop_zero_gc_soak.test.ts`)

#### Full Architecture & Implementation Specification:
```typescript
/**
 * Milestone M35: Co-op Zero-GC Long-Session Soak & Object Pool Invariants (5,000 Frames)
 * File: tests/unit/m35_coop_zero_gc_soak.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';
import { Game } from '../../src/core/Game';
import { EnemyState, EnemyType } from '../../src/types';
import { DroneType } from '../../src/core/allies/types';

function forceGC(): void {
  if (typeof (globalThis as any).gc === 'function') {
    (globalThis as any).gc();
    (globalThis as any).gc();
    return;
  }
  try {
    v8.setFlagsFromString('--expose_gc');
    const gc = vm.runInNewContext('gc');
    if (typeof gc === 'function') {
      gc();
      gc();
    }
  } catch {
    // V8 sandbox fallback
  }
}

function teardownStageBoundary(game: Game): void {
  game.bulletManager.clear();
  game.particleSystem.clear();
  if (game.powerUpManager) game.powerUpManager.reset();
  if (game.alliesManager) game.alliesManager.onStageClear();
  if (game.specialMovesManager) game.specialMovesManager.onStageClear();
  if (game.formationManager) game.formationManager.reset();
  if (game.bossManager) game.bossManager.reset();
  if (game.crisisEventManager) {
    game.crisisEventManager.clearCrisis();
    game.crisisEventManager.onStageClear();
  }
  if (game.glitchEventManager) game.glitchEventManager.clearGlitch();
  if (game.playerManager) game.playerManager.onStageClear();
}

function assertAllPoolsHygiene(game: Game, context: string): void {
  const bulletPool = game.bulletManager.getPool();
  expect(bulletPool.getActiveCount(), `${context}: bulletPool activeCount`).toBe(0);
  expect(bulletPool.getCapacity(), `${context}: bulletPool capacity`).toBeLessThanOrEqual(256);

  const particlePool = game.particleSystem.getPool();
  expect(particlePool.getActiveCount(), `${context}: particlePool activeCount`).toBe(0);
  expect(particlePool.getCapacity(), `${context}: particlePool capacity`).toBeLessThanOrEqual(256);

  const powerUpPool = game.powerUpManager.getPool();
  expect(powerUpPool.getActiveCount(), `${context}: powerUpPool activeCount`).toBe(0);
  expect(powerUpPool.getCapacity(), `${context}: powerUpPool capacity`).toBeLessThanOrEqual(32);

  const enemyPool = game.formationManager.getEnemyPool();
  expect(enemyPool.getActiveCount(), `${context}: enemyPool activeCount`).toBe(0);
  expect(enemyPool.getCapacity(), `${context}: enemyPool capacity`).toBeLessThanOrEqual(64);

  const phantomPool = game.formationManager.getPhantomPool();
  expect(phantomPool.getActiveCount(), `${context}: phantomPool activeCount`).toBe(0);
  expect(phantomPool.getCapacity(), `${context}: phantomPool capacity`).toBeLessThanOrEqual(8);

  const bombPool = game.alliesManager.getBombPool();
  expect(bombPool.getActiveCount(), `${context}: bombPool activeCount`).toBe(0);
  expect(bombPool.getCapacity(), `${context}: bombPool capacity`).toBeLessThanOrEqual(16);

  const explosionPool = game.alliesManager.getExplosionPool();
  expect(explosionPool.getActiveCount(), `${context}: explosionPool activeCount`).toBe(0);
  expect(explosionPool.getCapacity(), `${context}: explosionPool capacity`).toBeLessThanOrEqual(16);

  const missilePool = game.specialMovesManager.getMissilePool();
  expect(missilePool.getActiveCount(), `${context}: missilePool activeCount`).toBe(0);
  expect(missilePool.getCapacity(), `${context}: missilePool capacity`).toBeLessThanOrEqual(32);

  const sparkPool = game.specialMovesManager.getSparkPool();
  expect(sparkPool.getActiveCount(), `${context}: sparkPool activeCount`).toBe(0);
  expect(sparkPool.getCapacity(), `${context}: sparkPool capacity`).toBeLessThanOrEqual(32);
}

function assertZeroNaN(game: Game, context: string): void {
  for (const p of game.playerManager.getPlayers()) {
    expect(Number.isFinite(p.x), `${context}: Player ${p.id} X must be finite`).toBe(true);
    expect(Number.isFinite(p.y), `${context}: Player ${p.id} Y must be finite`).toBe(true);
    expect(Number.isNaN(p.x), `${context}: Player ${p.id} X is NaN`).toBe(false);
    expect(Number.isNaN(p.y), `${context}: Player ${p.id} Y is NaN`).toBe(false);
  }
}

describe('Milestone M35: Co-op Zero-GC Long-Session Soak (5,000 Frames)', { timeout: 60000 }, () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.setCoopMode(true);
    game.startGame();
    game.setState('PLAYING');
  });

  afterEach(() => {
    if (game) game.destroy();
  });

  it('simulates 5,000 frames of intensive co-op combat with < 5.0 MB heap drift and 0 pool leaks', () => {
    const cheat = game.getCheatController();
    const p1 = game.playerManager.getPlayer('p1')!;
    const p2 = game.playerManager.getPlayer('p2')!;

    // Warmup JIT compiler and initial pool allocations (120 ticks)
    for (let t = 0; t < 120; t++) {
      game.update(1 / 60);
    }
    teardownStageBoundary(game);

    forceGC();
    const baselineHeap = process.memoryUsage().heapUsed;

    const TOTAL_FRAMES = 5000;
    const CHECKPOINT_INTERVAL = 1000;
    const heapCheckpoints: number[] = [];

    for (let frame = 1; frame <= TOTAL_FRAMES; frame++) {
      // 1. Independent Player Sweeping Kinematics
      p1.x = 80 + Math.sin(frame * 0.05) * 40;
      p2.x = 144 + Math.cos(frame * 0.05) * 40;

      // 2. Concurrent Alternating Missile Firing
      if (frame % 4 === 0) {
        game.bulletManager.firePlayerBullet(p1.x, p1.y - 10, false, 360, 0, undefined, undefined, 'p1');
      }
      if (frame % 4 === 2) {
        game.bulletManager.firePlayerBullet(p2.x, p2.y - 10, false, 360, 0, undefined, undefined, 'p2');
      }

      // 3. Enemy Formation Diving & Firing
      if (frame % 60 === 0) {
        const living = game.formationManager.getLivingEnemies();
        if (living.length > 0) {
          game.formationManager.peelOffSolo(living[0]!, p1.x);
        } else {
          game.formationManager.spawnStage(2);
        }
      }
      if (frame % 25 === 0) {
        game.bulletManager.fireEnemyBullet(112, 70, p2.x, p2.y, 180);
      }

      // 4. Co-op Revive Pending & Life Donation Cycling
      if (frame % 700 === 300) {
        p2.startRevivePending(10.0);
      }
      if (frame % 700 === 360) {
        if (p1.lives <= 1) p1.lives = 3; // Replenish reserve lives for test continuity
        if (game.playerManager.canDonateLife('p1')) {
          game.playerManager.donateLife('p1');
        }
      }

      // 5. Periodic Power-Up & Glitch Injection
      if (frame % 350 === 0) {
        cheat.spawnPowerUp('chrono_field', 100, 50);
      }
      if (frame % 500 === 0) {
        cheat.triggerGlitch('mirage');
        game.formationManager.spawnMirageClones(112, 90, EnemyType.GOEI);
      }

      // 6. Simulation Tick Update
      game.update(1 / 60);

      // 7. Checkpoint Heap Profiling every 1,000 frames
      if (frame % CHECKPOINT_INTERVAL === 0) {
        forceGC();
        const currentHeap = process.memoryUsage().heapUsed;
        const driftMB = (currentHeap - baselineHeap) / (1024 * 1024);
        heapCheckpoints.push(driftMB);
        expect(driftMB, `Frame ${frame} heap drift must be < 5.0 MB`).toBeLessThan(5.0);
        assertZeroNaN(game, `Frame ${frame}`);
      }
    }

    // Teardown & Verify Final State
    teardownStageBoundary(game);
    assertAllPoolsHygiene(game, 'Post-5000-Frame Soak Teardown');

    forceGC();
    const finalHeap = process.memoryUsage().heapUsed;
    const finalDriftMB = (finalHeap - baselineHeap) / (1024 * 1024);

    expect(heapCheckpoints).toHaveLength(5);
    expect(finalDriftMB, 'Final 5,000-frame net heap drift must be < 5.0 MB').toBeLessThan(5.0);
  });
});
```

---

### 4.2 Dual Workspace Mirror Synchronization Blueprint

#### 1. Exact Deterministic Synchronization Command
To achieve 100% bitwise parity between the primary development repository (`/Users/user/src/galog`) and the mirror repository (`/Users/user/teamwork_projects/galaga_game`):

```bash
rsync -av \
  --exclude="node_modules" \
  --exclude="dist" \
  --exclude=".git" \
  --exclude=".agents" \
  --exclude="playwright-report" \
  --exclude="test-results" \
  --exclude=".DS_Store" \
  --delete \
  /Users/user/src/galog/ /Users/user/teamwork_projects/galaga_game/
```

#### 2. Synchronized File Target Catalog:
The sync operation will propagate:
1. **Core UI/UX & Types (Milestone M34)**:
   - `src/ui/BottomDashboard.ts` (Symmetrical 3-zone layout, zero-GC dirty checking)
   - `src/types/index.ts` (Dashboard telemetry contracts)
   - `src/core/Game.ts` (Dual telemetry update wiring)
   - `index.html` (M34 symmetrical HUD CSS styling)
2. **M34 Unit Test Suites (4 files)**:
   - `tests/unit/adversarial_m34_dashboard_stress.test.ts`
   - `tests/unit/adversarial_m34_layout_reflow.test.ts`
   - `tests/unit/adversarial_m34_rem_challenge.test.ts`
   - `tests/unit/m34_dual_dashboard.test.ts`
3. **M35 Deliverables** (upon implementation):
   - `tests/unit/m35_coop_zero_gc_soak.test.ts`
   - `tests/e2e/coop_dual_input_matrix.spec.ts`
4. **Project Guides**:
   - `COLLABORATION.md`
   - `PROJECT.md`

#### 3. Post-Sync Bitwise Verification Script:
```python
import os, filecmp

src_dir = '/Users/user/src/galog'
dst_dir = '/Users/user/teamwork_projects/galaga_game'
excludes = {'node_modules', 'dist', '.git', '.agents', 'playwright-report', 'test-results', '.DS_Store'}

diffs = []
for root, dirs, files in os.walk(src_dir):
    dirs[:] = [d for d in dirs if d not in excludes]
    rel_root = os.path.relpath(root, src_dir)
    if rel_root == '.': rel_root = ''
    for f in files:
        if f in excludes: continue
        rel_path = os.path.join(rel_root, f) if rel_root else f
        src_file = os.path.join(root, f)
        dst_file = os.path.join(dst_dir, rel_path)
        if not os.path.exists(dst_file) or not filecmp.cmp(src_file, dst_file, shallow=False):
            diffs.append(rel_path)

assert len(diffs) == 0, f"Unsynced files detected: {diffs}"
print("PARITY CONFIRMED: 100% bitwise parity across all tracked files!")
```

---

## 5. Verification Method

To independently verify these findings and blueprints:
1. **Run Parity Audit Script**:
   ```bash
   python3 -c "
   import os, filecmp
   s = '/Users/user/src/galog'
   d = '/Users/user/teamwork_projects/galaga_game'
   exc = {'node_modules', 'dist', '.git', '.agents', 'playwright-report', 'test-results', '.DS_Store'}
   for sub in ['src', 'tests', 'scripts']:
       sp = os.path.join(s, sub)
       for r, dirs, files in os.walk(sp):
           dirs[:] = [x for x in dirs if x not in exc]
           for f in files:
               if f in exc: continue
               rel = os.path.relpath(os.path.join(r, f), s)
               dp = os.path.join(d, rel)
               if not os.path.exists(dp): print('Missing:', rel)
               elif not filecmp.cmp(os.path.join(r, f), dp, False): print('Diff:', rel)
   "
   ```
2. **Verify Test Suite Invariance**:
   ```bash
   cd /Users/user/src/galog && npx vitest run
   ```
   Must pass 123/123 test files (2,238/2,238 tests).
3. **Verify Dry-Run Rsync Output**:
   ```bash
   rsync -avun \
     --exclude="node_modules" \
     --exclude="dist" \
     --exclude=".git" \
     --exclude=".agents" \
     --exclude="playwright-report" \
     --exclude="test-results" \
     --exclude=".DS_Store" \
     --delete \
     /Users/user/src/galog/ /Users/user/teamwork_projects/galaga_game/
   ```
   Confirms exact file delta without altering files.
