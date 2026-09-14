# Handoff Report: Power-Up Subsystem & Drop Architecture (M11)

**Agent**: `m11_explorer_1` (Role: Power-Up Subsystem & Drop Architecture Explorer)  
**Recipient**: Parent Orchestrator / Milestone 11 Implementers  
**Working Directory**: `/Users/user/src/galog/.agents/m11_explorer_1/`  
**Handoff Type**: Hard (Task Complete)  

---

## 1. Observation

Direct examination of the Galaga codebase established the following baseline parameters and integration anchor points:

1. **Object Pooling Architecture (`src/core/ObjectPool.ts`)**:
   - `ObjectPool<T>` (lines 25–57) implements a dense contiguous array buffer with swap-and-pop release (lines 101–125), `forEachActiveSafe` for reverse-safe traversal during item deactivation (lines 151–160), and configurable `initialSize` / `maxSize`.
   - Bounded pool capacity without `autoExpand` guarantees zero heap allocations during 60 FPS gameplay.

2. **Enemy Destruction Hook (`src/entities/Enemy.ts` & `src/core/Game.ts`)**:
   - `Enemy.takeDamage(amount)` (lines 307–395) returns `EnemyDamageResult` containing `destroyed: boolean`, `points: number`, `wasDamaged: boolean`, and `shieldAbsorbed: boolean`.
   - In `Game.ts` lines 700–792, `takeDamage(1)` is evaluated in `resolveCollisions()`. When `damageResult.destroyed === true`, score is credited and explosions trigger. This is the exact site for the drop rate lottery.
   - Diving enemies are identified via `enemy.state === EnemyState.DIVING_SOLO || enemy.state === EnemyState.DIVING_ESCORT || enemy.state === EnemyState.TRACTOR_BEAM_ACTIVE || enemy.state === EnemyState.CAPTURED_HOSTILE`.

3. **Player Collision & Hitbox Metrics (`src/entities/Player.ts`)**:
   - Player baseline $y = 250$ (`Player.BASELINE_Y`).
   - Single fighter hitbox is $12 \times 12$ ($[x - 6, y - 6, 12, 12]$) (lines 475–479, 547–550).
   - Dual fighter hitbox is $32 \times 12$ ($[x - 16, y - 6, 32, 12]$) (lines 540–545).
   - Lateral movement speed is $260\text{ px/s}$ (`Player.SPEED`, line 63).
   - In `hitTestAndDamage(threat: Rect)` (lines 422–488), the player checks invulnerability and processes damage or hull separation.

4. **Projectile Quotas & Management (`src/entities/Bullet.ts`)**:
   - `BulletManager` maintains `activePlayerBulletCount` (lines 236–265) and enforces quotas: 2 for Single Fighter, 4 for Dual Fighter.
   - `forEachActiveEnemyBullet(callback)` (lines 462–468) safely traverses active enemy projectiles using `forEachActiveSafe`, allowing immediate in-place recycling via `recycle(bullet)`.

5. **Difficulty Tiers & Challenging Stages (`src/systems/DifficultyCalculator.ts`)**:
   - `DifficultyCalculator.getStageTier(stage)` (lines 52–60) yields `'CLASSIC'`, `'ELITE'`, or `'DREADNOUGHT'`.
   - `DifficultyCalculator.isChallengingStage(stage)` identifies stages 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47 where enemy projectiles and drops must be suspended.

6. **Procedural Sprite Renderer (`src/renderer/SpriteRenderer.ts`)**:
   - Pre-bakes $8 \times 8$ and $16 \times 16$ pixel art matrices onto offscreen canvases via `SpriteRenderer.registerDefinition()` (lines 600–626) and blits via fast-path `SpriteRenderer.draw()` (lines 680–725).

---

## 2. Logic Chain

1. **Zero-Allocation Power-Up Pool**:
   - From Observation 1, `ObjectPool<PowerUpItem>` with `initialSize: 32, maxSize: 32, autoExpand: false` pre-allocates all 32 `PowerUpItem` instances at game launch.
   - Because maximum simultaneous on-screen drops rarely exceed 4–6, a 32-capacity pool guarantees that neither pool exhaustion nor dynamic resizing will trigger GC pauses during 60 FPS rendering.

2. **Kinematic Drift Physics**:
   - From Observation 3, the virtual playfield is $224 \times 288$ px.
   - Downward drift velocity $vy = 60\text{ px/s}$ allows a power-up falling from formation ($y \approx 60$) to baseline ($y = 250$) to remain collectible for $\approx 3.16$ seconds, providing balanced tension.
   - Horizontal sinusoidal sway with $A = 12\text{ px}$ and $\omega = 3.0\text{ rad/s}$ ($f \approx 0.48\text{ Hz}$) creates organic arcade drift while clamping between $[10, 214]$ ensures items never leave the playable corridor.
   - Despawning at $y > 288$ automatically frees the leased object back to the pool in $O(1)$.

3. **Collection Bounding Box**:
   - From Observation 3, both single ($12 \times 12$) and dual ($32 \times 12$) player hitboxes are centered on $(x, y - 6)$.
   - A $12 \times 12$ AABB for `PowerUpItem` ($[x - 6, y - 6, 12, 12]$) guarantees robust AABB overlap without false misses during high-speed lateral sweeps.

4. **Drop Rate Matrix & Pacing**:
   - From Observations 2 and 5, dropping items during Challenging Stages would compromise the pure 40-hit accuracy challenge. Therefore, drop rate is strictly 0% when `DifficultyCalculator.isChallengingStage(stage)` is true.
   - For regular stages: baseline kill drop chance is set to 12%. Diving enemies (higher tactical risk) receive a $1.5\times$ multiplier ($18\%$). Boss Galaga provides a generous $30\text{--}40\%$ drop rate, rewarding players for targeting high-value threats.
   - Loot weighting (Rapid Fire: 30%, Kinetic Shield: 25%, Scatter Shot: 20%, Engine Booster: 15%, EMP Bomb: 10%) ensures defensive and offensive buffs are distributed fairly.

5. **Active Upgrade Lifecycles & Dual Fighter Synergy**:
   - From Observations 3 and 4, timed buffs (`RAPID_FIRE`, `SCATTER_SHOT`, `ENGINE_BOOSTER`) run for 15.0 seconds and stack or refresh on subsequent pickups.
   - `KINETIC_SHIELD` persists until an incoming collision occurs, where it absorbs the hit and grants 1.0s invulnerability, protecting both hulls of a Dual Fighter without separation.
   - `EMP_BOMB` invokes `bulletManager.forEachActiveEnemyBullet(...)` to recycle all hostile projectiles instantly and deals 1 damage to diving enemies, giving players an emergency escape option.

---

## 3. Caveats

1. **Player Speed Constant**:
   In `src/entities/Player.ts` line 63, `Player.SPEED` is defined as 260 px/s (not 120 px/s as noted in some preliminary survey memos). Engine Booster scales this by $\approx 1.38\times$ to 360 px/s.
2. **Audio SFX Delegation**:
   `SoundSynth.ts` currently lacks dedicated `playPowerUpCollect()` and `playShieldDeflect()` methods. Until M12 implements custom FM audio for upgrades, `PowerUpManager` should fall back to `playLaserDual()` or `playBossHit()`.
3. **No Direct Code Implementation**:
   In accordance with the explorer role, no production files were modified; this report provides the complete architectural design for the subsequent implementer agent.

---

## 4. Conclusion

The Power-Up Subsystem design is complete, fully specified, and ready for immediate implementation:
- `src/core/powerups/types.ts`: Enums, configs, `ActiveBuffState`, and loot tables.
- `src/core/powerups/PowerUpItem.ts`: Poolable entity with $vy = 60\text{ px/s}$ drift, sinusoidal sway ($A=12, \omega=3$), $12 \times 12$ hitbox, and despawn at $y > 288$.
- `src/core/powerups/PowerUpManager.ts`: Zero-allocation 32-capacity object pool, drop rate calculator, player collection resolution, 15s buff timer management, and EMP screen wipe.
- Integration specifications for `Game.ts`, `Player.ts`, `Enemy.ts`, and `SpriteRenderer.ts`.

---

## 5. Verification Method

To verify the architecture design:
1. **Inspect Architecture Report**:
   `view_file /Users/user/src/galog/.agents/m11_explorer_1/report.md`
2. **Inspect Codebase Alignment**:
   - Pool interface: `view_file /Users/user/src/galog/src/core/ObjectPool.ts` lines 25–57
   - Collision resolution: `view_file /Users/user/src/galog/src/core/Game.ts` lines 700–790
   - Player hitbox: `view_file /Users/user/src/galog/src/entities/Player.ts` lines 538–550
3. **Automated Test Validation** (once implemented):
   ```bash
   npm run test
   npm run typecheck
   ```
