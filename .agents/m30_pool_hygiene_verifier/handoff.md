# Milestone M30 Verification Handoff Report

**Agent**: `m30_pool_hygiene_verifier` (Object Pool Lifecycle & Bounded Capacity Verifier)  
**Role**: EMPIRICAL CHALLENGER / critic, specialist  
**Working Directory**: `/Users/user/teamwork_projects/galaga_game/.agents/m30_pool_hygiene_verifier`  
**Date**: 2026-09-11  
**Milestone**: M30 — 60+ Swarm Hardening, Multi-Device E2E & Final Victory Audit  
**Definitive Verdict**: `REQUEST_CHANGES`

---

## 1. Observation

### Obs 1: Missing Test File Entrypoints for Commanded Suites
When executing the commanded verification commands in the project directory:
```bash
$ npx vitest run tests/unit/pool.test.ts
$ npx vitest run tests/unit/m11_powerup_pool.test.ts
```
Both commands fail immediately with exit code 1:
```
RUN v3.2.7 /Users/user/src/galog

No test files found, exiting with code 1

filter: tests/unit/pool.test.ts, tests/unit/m11_powerup_pool.test.ts
include: tests/unit/**/*.test.ts
```
Neither `tests/unit/pool.test.ts` nor `tests/unit/m11_powerup_pool.test.ts` exists on disk.
The actual pool tests are located in:
- `tests/unit/core.test.ts` (Section 2: `describe('ObjectPool Subsystem')`, lines 200–350)
- `tests/unit/powerups.test.ts` and `tests/unit/powerups_m19.test.ts`
- `tests/unit/m11_challenger_1_adversarial.test.ts`, `tests/unit/m11_challenger_2_adversarial.test.ts`, `tests/unit/m11_fix2_challenger_2_adversarial.test.ts`
- `tests/unit/m25_soak_pool_invariants.test.ts`

### Obs 2: `bulletPool` Configured with `autoExpand: true`
In `src/entities/Bullet.ts`, lines 261–267:
```typescript
    this.bulletPool = new ObjectPool<Bullet>({
      factory: () => new Bullet(this.nextBulletId++),
      reset: (b: Bullet) => b.reset(),
      initialSize: BULLET_CONFIG.POOL_INITIAL_SIZE, // 32
      maxSize: BULLET_CONFIG.POOL_MAX_SIZE,         // 256
      autoExpand: true,
    });
```
Direct empirical test in Node runtime:
```typescript
const bp = game.bulletManager.getPool();
console.log(bp.getCapacity()); // 32
for (let i = 0; i < 33; i++) bp.acquire();
console.log(bp.getCapacity()); // 64 (auto-expanded!)
```
`bulletPool` expands dynamically from 32 to 64, 128, and 256 upon exhaustion. It is NOT `autoExpand: false`.

### Obs 3: Configuration of Other 7 Pools (+ Phantom Pool)
Inspection of all object pool constructors across the codebase revealed:
1. `bulletPool` (`src/entities/Bullet.ts:266`): `autoExpand: true`, initialCapacity: 32, maxSize: 256
2. `particlePool` (`src/systems/ParticleSystem.ts:155`): `autoExpand: false`, initialCapacity: 250, maxSize: 250
3. `powerUpPool` (`src/core/powerups/PowerUpManager.ts:71`): `autoExpand: false`, initialCapacity: 32, maxSize: 32
4. `bombPool` (`src/core/allies/AlliesManager.ts:63`): `autoExpand: false`, initialCapacity: 16, maxSize: 16
5. `explosionPool` (`src/core/allies/AlliesManager.ts:71`): `autoExpand: false`, initialCapacity: 16, maxSize: 16
6. `missilePool` (`src/core/specials/SpecialMovesManager.ts:82`): `autoExpand: false`, initialCapacity: 32, maxSize: 32
7. `sparkPool` (`src/core/specials/SpecialMovesManager.ts:90`): `autoExpand: false`, initialCapacity: 32, maxSize: 32
8. `enemyPool` (`src/systems/FormationManager.ts:99`): `autoExpand: false`, initialCapacity: 48, maxSize: 64
9. `phantomPool` (`src/systems/FormationManager.ts:107`): `autoExpand: false`, initialCapacity: 8, maxSize: 8

### Obs 4: `enemyPool` Capacity Dead-Zone
In `src/systems/FormationManager.ts`, lines 94–100:
`enemyPool` is instantiated with `initialSize: 48`, `maxSize: 64`, `autoExpand: false`.
Because `autoExpand: false`, when 48 items are acquired from `enemyPool`, the 49th `acquire()` call returns `null`. The storage array never expands to 64. The extra 16 slots (`maxSize: 64 - initialSize: 48`) are completely unreachable.

### Obs 5: Teardown Lifecycle at Stage Boundaries & Game Over
- **Game Over**:
  In `src/core/Game.ts`, lines 787–807 (`case 'GAME_OVER'`):
  `this.bulletManager.clear()`, `this.particleSystem.clear()`, `this.formationManager.reset()`, `this.powerUpManager.reset()`, `this.alliesManager.reset()`, and `this.specialMovesManager.reset()` are all called. Every pool flushes to `getActiveCount() === 0`.
- **Natural Stage Clear**:
  In `src/core/Game.ts`, lines 450–467 (`FormationManagerOptions.onStageClear`):
  `powerUpManager.reset()`, `alliesManager.onStageClear()`, and `specialMovesManager.onStageClear()` are invoked, clearing `powerUpPool`, `bombPool`, `explosionPool`, `missilePool`, and `sparkPool` to 0.
  In `src/core/Game.ts`, lines 1089–1107 (`updateStageClear`):
  `bulletManager.clear()` (0), `particleSystem.clear()` (0), `alliesManager.onStageClear()` (0), `specialMovesManager.onStageClear()` (0), and `formationManager.spawnStage(this.stage)` (clears old enemies, then allocates 40 new stage enemies).
- **Defensive Omission in `updateStageClear()`**:
  In `src/core/Game.ts:1093–1105`, `this.powerUpManager.reset()` is NOT called in `updateStageClear()`.
  Empirical test in `tests/unit/m30_pool_hygiene_verifier_adversarial.test.ts`:
  If the game transitions to `STAGE_CLEAR` without invoking `formationManager.onStageClear()`, or if an item drops during stage intermission, `powerUpPool.getActiveCount()` remains `> 0` across the stage boundary into `STAGE_INTRO`.

---

## 2. Logic Chain

1. **Premise vs. Observation on autoExpand**:
   - The user dispatch and `COLLABORATION.md:178` state: *"Verify that all 8 object pools (`bulletPool`, `particlePool`, `powerUpPool`, `bombPool`, `explosionPool`, `missilePool`, `sparkPool`, `enemyPool`) enforce `autoExpand: false`"*.
   - Direct inspection of `src/entities/Bullet.ts:266` and empirical runtime inspection show `bulletPool` explicitly specifies `autoExpand: true` (Obs 2, Obs 3).
   - Therefore, the claim that all 8 pools enforce `autoExpand: false` is false in the current codebase.

2. **Premise vs. Observation on Commanded Test Suites**:
   - The dispatch specified running `npx vitest run tests/unit/pool.test.ts` and `npx vitest run tests/unit/m11_powerup_pool.test.ts`.
   - Running both commands exits with code 1 because neither file exists (Obs 1).
   - Any automated verification script or CI command relying on these exact paths will fail.

3. **Stage Boundary Teardown Invariance**:
   - While `onStageClear()` cleans up `powerUpManager`, `updateStageClear()` does not invoke `this.powerUpManager.reset()` before transitioning to `STAGE_INTRO` (Obs 5).
   - This creates an asymmetrical lifecycle where `bulletManager`, `particleSystem`, `alliesManager`, and `specialMovesManager` are double-cleared at the boundary, but `powerUpManager` is vulnerable to lingering active leases.

4. **Capacity Allocation Coherence**:
   - `enemyPool` is defined with `initialSize: 48, maxSize: 64, autoExpand: false` (Obs 4).
   - Because `autoExpand: false`, the pool caps at 48 items instead of 64. This represents either an unintended configuration contradiction or dead code.

5. **Deductive Conclusion**:
   - Per the empirical challenger mandate ("Never trust unverified claims", "find bugs", "If you cannot reproduce a bug empirically, it does not count"):
   - The reported invariant failures are reproducible, measurable, and documented in code.
   - Hence, the verdict must be `REQUEST_CHANGES` with concrete remediations.

---

## 3. Caveats

1. `bulletPool`'s bounded expansion (`autoExpand: true` up to `maxSize: 256`) does NOT cause unbounded memory growth; it strictly returns `null` once 256 bullets are active.
2. In natural gameplay without cheats, `formationManager.onStageClear()` is almost always invoked before `updateStageClear()`, mitigating common leaks of `powerUpPool`, though the defensive omission in `updateStageClear()` remains a latent hazard.
3. 107 test files and 1,974 existing unit tests pass 100%, and `npm run build` succeeds without warnings.

---

## 4. Conclusion & Actionable Remediations

**Verdict**: `REQUEST_CHANGES`

### Required Remediations for M30 Remediation Worker:

1. **Remediation 1 (Stage Boundary Lifecycle Hardening in `src/core/Game.ts`)**:
   Add `if (this.powerUpManager) this.powerUpManager.reset();` inside `updateStageClear()` (`src/core/Game.ts:1094`), guaranteeing that `powerUpPool` flushes to 0 at the exact moment of advancing stage, mirroring `bulletManager.clear()`, `particleSystem.clear()`, `alliesManager.onStageClear()`, and `specialMovesManager.onStageClear()`.

2. **Remediation 2 (Architectural Invariant & Documentation Alignment for `bulletPool`)**:
   - If `bulletPool` is intended to use bounded dynamic expansion:
     Update `COLLABORATION.md` and project verification documentation to state:
     *"7 of 8 object pools enforce `autoExpand: false` with hard pre-allocated bounds; `bulletPool` enforces bounded dynamic expansion (`autoExpand: true`) strictly capped at `maxSize: 256` to balance early-round low-footprint tests with late-round boss bullet hell density."*
   - If strict `autoExpand: false` is required across ALL 8 pools without exception:
     Configure `src/entities/Bullet.ts`: `initialSize: 256, maxSize: 256, autoExpand: false`, and update `tests/unit/m8_final_adversarial.test.ts:146` (which currently asserts `bulletPool.getCapacity() <= 128`).

3. **Remediation 3 (`enemyPool` Configuration Consistency in `src/systems/FormationManager.ts`)**:
   Set `initialSize: 64, maxSize: 64, autoExpand: false` (or `maxSize: 48`) in `FormationManager.ts:98` to resolve the dead-zone mismatch between `initialSize: 48` and `maxSize: 64`.

4. **Remediation 4 (Test Entrypoint Aliases)**:
   Provide test entrypoint wrappers `tests/unit/pool.test.ts` (re-exporting or testing `ObjectPool`) and `tests/unit/m11_powerup_pool.test.ts` (re-exporting or testing `PowerUpManager` pool invariants), ensuring standard verification commands succeed out-of-the-box.

---

## 5. Verification Method

To independently verify these empirical findings:

1. **Run the adversarial verification test suite**:
   ```bash
   npx vitest run tests/unit/m30_pool_hygiene_verifier_adversarial.test.ts
   ```
   *Expected*: 7/7 tests pass, confirming `bulletPool.autoExpand === true`, the `enemyPool` 48-cap, the `updateStageClear` omission, and total flushes at game over.

2. **Run the missing file verification**:
   ```bash
   npx vitest run tests/unit/pool.test.ts tests/unit/m11_powerup_pool.test.ts
   ```
   *Expected*: Exits with code 1 (`No test files found`).

3. **Verify full unit test regression safety and production build**:
   ```bash
   npx vitest run
   npm run build
   ```
   *Expected*: All 107 test files (1,974 tests) pass; build completes cleanly in < 1s.
