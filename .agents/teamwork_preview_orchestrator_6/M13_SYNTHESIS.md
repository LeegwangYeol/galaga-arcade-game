# Milestone 13 Synthesis: Allies Support System & 3 Special Moves

## 1. System Overview & Scope
Milestone 13 delivers:
1. **Allies Support System (3 Tactical Wingmen Drones)**:
   - **Escort Drone (호위 드론)**: Orbits player ship at fixed radius $R = 24\text{ px}$, autofires forward plasma bolts ($V_y = -460\text{ px/s}$, 0.35s cadence) without starving player single/dual missile quotas.
   - **Kinetic Aegis Drone (쉴드 수복기)**: Defensive wingman monitoring player shield; upon breakage, charges 2.5s and emits radiant repair pulse restoring `player.hasShield = true`, `player.shieldHp = 1`, and synchronizing with `powerUpManager.buffState.hasShield = true`.
   - **Bomber Support Drone (폭격 지원기)**: Sweeps upper canvas ($Y = 36\text{ px}$, $V_x = 140\text{ px/s}$), dropping 4 cluster bombs that detonate with $28\text{ px}$ radius AOE shockwaves.
2. **3 Special Moves (고유 필살기)**:
   - **Energy Gauge System**: $E \in [0, 100]$, gained on enemy kills ($+2\%$ to $+12\%$) and energy spark pickups ($+15\%$, magnetic attraction $< 42\text{ px}$). Rendered in HUD center-bottom ($X = 72, Y = 278, 60\text{ px} \times 6\text{ px}$) with flashing 'SP READY' banner.
   - **Trigger Controls**: Keyboard (`KeyX`, cycle `KeyC`), Gamepad API, and mobile touch button (`#btn-special`).
   - **Nova Barrage (초신성 일제사격)**: 16-missile homing salvo with Proportional Navigation Guidance ($\omega_{\max} = 14\text{ rad/s}$), instant-killing regular aliens and dealing 64 burst damage to bosses.
   - **Chrono Freeze (시공간 동결)**: 3.0s absolute time stop for all enemies and enemy bullets ($\Delta t_{\text{enemy}} = 0$) while player moves and fires normally.
   - **Dimensional Warp Ram (차원 도약 돌파)**: Hyper-speed ($v_y = -800\text{ px/s}$) invulnerable charge with $36\text{ px} \times 32\text{ px}$ swept hitbox clearing flight lane and ramming for 120 kinetic damage.
3. **Zero-GC Mandate**:
   - `ObjectPool<ClusterBomb>` (16), `ObjectPool<BombExplosion>` (16), `ObjectPool<NovaMissile>` (32), `ObjectPool<EnergySpark>` (32).
   - Singleton drone entities in `AlliesManager`.
4. **Procedural Pixel Bit-Matrices**:
   - `DRONE_ESCORT`, `DRONE_AEGIS`, `DRONE_BOMBER`, `NOVA_LASER_BEAM`, `ITEM_ENERGY_SPARK`, `CHRONO_FROST_CORNER` baked offscreen in `SpriteRenderer.ts`.

## 2. Implementation Blueprint
- `src/core/allies/`:
  - `types.ts`: Drone types, states, bomb and explosion data structures.
  - `BaseDrone.ts`: Abstract base drone class.
  - `drones/EscortDrone.ts`
  - `drones/AegisDrone.ts`
  - `drones/BomberDrone.ts`
  - `AlliesManager.ts`: Master allies coordinator, drone summoning channels (score milestones 15k, 35k, 60k; powerup drops; cheat hooks).
  - `index.ts`
- `src/core/specials/`:
  - `types.ts`: Special move enums, state interfaces, missile descriptors.
  - `SpecialMovesManager.ts`: Energy meter, gauge accumulation, trigger execution, Chrono Freeze timer, Warp Ram kinematics, Nova Barrage missile homing loop.
  - `index.ts`
- Integration files:
  - `src/renderer/SpriteRenderer.ts`: Add procedural bit-matrices for drones and special moves.
  - `src/ui/HUD.ts`: Render special meter at center bottom.
  - `src/ui/InputHandler.ts`: Add `KeyX` handling and `consumeAction('special')`.
  - `src/entities/Bullet.ts`: Ensure drone bullets don't increment player missile count.
  - `src/core/Game.ts`: Initialize `AlliesManager` and `SpecialMovesManager`, split `enemyDt` during Chrono Freeze, hook energy rewards on enemy kills, resolve drone and special move collisions.
- Tests in `tests/unit/`:
  - `m13_allies_drones.test.ts`
  - `m13_special_moves.test.ts`
  - `m13_zerogc_stress.test.ts`
  - `m13_regression_guard.test.ts`
