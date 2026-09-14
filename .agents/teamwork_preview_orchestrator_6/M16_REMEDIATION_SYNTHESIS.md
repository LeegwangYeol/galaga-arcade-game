# Synthesis: Milestone 16 Iteration 2 Remediation Blueprint

**Date**: 2026-09-04T21:12:00+09:00  
**Author**: `teamwork_preview_orchestrator_6`  
**Sources**: 
- `m16_rem_explorer_1`: Kinematic conflict in `Player.clampPosition()` vs `SpecialMovesManager.update()`
- `m16_rem_explorer_2`: Masked assertion analysis and multi-hit duplicate collision defect
- `m16_rem_explorer_3`: Forensic audit of `m16_challenger_1_adversarial.test.ts` and regression risk evaluation

---

## 1. Problem Synthesis & Root Causes

### 1.1 Kinematic Clamping in `Player.clampPosition()`
- In `Player.ts:691`, `clampPosition()` unconditionally executes `this.y = Player.BASELINE_Y` (250) on every tick of `updateControllable`.
- In `Game.ts:837`, `this.player.update(dt, input)` runs before `this.specialMovesManager.update(dt)` (line 869).
- When Warp Ram surges at 800 px/s (13.33 px/frame), `player.y` is immediately reset to 250 on the following frame by `clampPosition()`.
- The ship oscillates between 250 and 236.67, never ascending to $y < -30$, never clearing the flight lane, and never reaching the boss at $y = 52$.

### 1.2 Test Masking in `adversarial_m16_combinatorial_saturation.test.ts`
- In lines 181–203, `expect(boss.health).toBeLessThan(preRamBossHp)` passed only because active Escort Drone bolts and Bomber Drone cluster shockwaves dealt 6 damage to the boss concurrently during the 60 frames.
- Post-loop sampling of `player.y === 250` was blind because at frame 60 `warpRamTimer <= 0` resets `player.y = 250` regardless of whether the ship moved.

### 1.3 Hidden Multi-Hit Defect in `SpecialMovesManager.ts`
- Once vertical ascent is unblocked, `SpecialMovesManager.resolveCollisions()` encounters the boss twice in the same frame (once in `enemies` and once in `bossManager.activeBoss`), dealing 240 damage per frame.
- Over the 3–4 frames the 32px `ramBox` overlaps the 48px boss hitbox, without a per-activation debounce set, it deals 480–720 damage.
- An exact hit-tracking set (`warpRamHitTargetIds = new Set<any>()`) is required so each entity is damaged at most once per activation.

---

## 2. Coordinated Remediation Specifications

### Target File 1: `src/entities/Player.ts`
1. Expand `PlayerConfig`: add `game?: any;`.
2. Add fields to `Player`:
   ```typescript
   public isWarpRamActive: boolean = false;
   public game?: any;
   ```
3. In `constructor`: store `this.game = config?.game;`.
4. In `reset()`: set `this.isWarpRamActive = false;`.
5. In `clampPosition()`:
   ```typescript
   public clampPosition(): void {
     const isDual = this.isDual;
     const minX = isDual ? 16 : 12;
     const maxX = isDual ? 208 : 212;
     this.x = Math.max(minX, Math.min(maxX, this.x));

     const isWarpRam = this.isWarpRamActive || (this.game?.specialMovesManager?.isWarpRamActive?.() ?? false);
     if (!isWarpRam) {
       this.y = Player.BASELINE_Y;
     }
   }
   ```

### Target File 2: `src/core/Game.ts`
In `Game.ts` constructor line 296, pass `game: this` to `new Player({ ... })`.

### Target File 3: `src/core/specials/SpecialMovesManager.ts`
1. Add property:
   ```typescript
   private warpRamHitTargetIds = new Set<any>();
   ```
2. In `executeWarpRam()`:
   ```typescript
   this.warpRamHitTargetIds.clear();
   this.warpRamTimer = this.warpRamDuration;
   this.warpRamExitedTop = false;
   const player = this.game.player;
   if (player) {
     this.warpRamStartY = player.y || Player.BASELINE_Y;
     player.isWarpRamActive = true;
     player.invulnerableTimer = Math.max(player.invulnerableTimer, this.warpRamDuration + 0.5);
   }
   ```
3. In `update(dt)`:
   - During ascent (`!this.warpRamExitedTop`):
     ```typescript
     player.y -= this.warpRamSpeed * dt;
     if (player.y < -30) {
       this.warpRamExitedTop = true;
       player.invulnerableTimer = Math.max(player.invulnerableTimer, 1.0);
     }
     ```
   - When `warpRamExitedTop` is true: wrap `player.y = this.warpRamStartY;`
   - On conclusion (`this.warpRamTimer <= 0 && player`):
     ```typescript
     player.y = this.warpRamStartY;
     player.invulnerableTimer = 0.5;
     player.isWarpRamActive = false;
     ```
4. In `resolveCollisions()`:
   - For enemies:
     ```typescript
     const targetKey = (enemy as any).id ?? enemy;
     if (this.warpRamHitTargetIds.has(targetKey)) continue;
     this.warpRamHitTargetIds.add(targetKey);
     ```
   - For boss:
     ```typescript
     const bossKey = (boss as any).id ?? boss;
     if (!this.warpRamHitTargetIds.has(bossKey)) {
       this.warpRamHitTargetIds.add(bossKey);
       boss.takeDamage(120);
       ...
     }
     ```
5. In `onStageClear()` and `reset()`:
   - Call `this.warpRamHitTargetIds.clear();`
   - If `this.game?.player`: `this.game.player.isWarpRamActive = false; this.game.player.y = Player.BASELINE_Y;`

### Target File 4: `tests/unit/adversarial_m16_combinatorial_saturation.test.ts`
Unmask Test 1 lines 180–204:
1. Recycle active player bullets: `game.bulletManager.forEachActivePlayerBullet((b) => game.bulletManager.recycle(b));`
2. Clear ally bomb pools: `game.alliesManager.getBombPool().clear(); game.alliesManager.getExplosionPool().clear();`
3. Suspend drones: `game.alliesManager.escortDrone.active = false; game.alliesManager.bomberDrone.active = false; game.alliesManager.aegisDrone.active = false;`
4. Set `boss.health = 250; boss.maxHealth = 300;`
5. Position player `game.player.x = boss.x; game.player.y = 250;`
6. Trigger Warp Ram and execute 60 frames tracking:
   - `minPlayerY = Math.min(minPlayerY, game.player.y)`
   - `if (game.player.y < initialPlayerY - 100) reachedIntermediateAscent = true;`
   - `if (game.player.y <= -30) reachedTopScreenExit = true;`
7. Assertions:
   - `expect(reachedIntermediateAscent).toBe(true);`
   - `expect(reachedTopScreenExit).toBe(true);`
   - `expect(minPlayerY).toBeLessThanOrEqual(-30);`
   - `expect(boss.health).toBe(preRamBossHp - 120);`
   - `expect(game.player.y).toBe(250);`
   - `expect(game.player.invulnerableTimer).toBeGreaterThan(0);`
8. Restore drones: `game.alliesManager.escortDrone.active = true; ...`

### Target File 5: `tests/unit/m16_challenger_1_adversarial.test.ts`
Ensure Test 1 asserts `reachedTop === true`, `harbinger.health` decreases from kinetic trauma, and all 6 tests pass cleanly.

---

## 3. Worker Write Boundaries
Exclusive write ownership for `m16_rem_worker`:
- `src/entities/Player.ts`
- `src/core/Game.ts`
- `src/core/specials/SpecialMovesManager.ts`
- `tests/unit/adversarial_m16_combinatorial_saturation.test.ts`
- `tests/unit/m16_challenger_1_adversarial.test.ts`
