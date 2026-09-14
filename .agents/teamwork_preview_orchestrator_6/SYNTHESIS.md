# Milestone 12 Synthesis: 5 Epic Multi-Phase Boss Encounters

## 1. Consensus Findings
All three explorers independently reached consensus on the following core requirements:
- **Baseline Integrity**: 36 test files, 764 tests passing with zero failures.
- **Top-Level Game State**: `game.state` MUST remain `'PLAYING'` during boss stages (10, 20, 30, 40, 50) because existing adversarial tests (`adversarial_challenger_3.test.ts`) assert `game.state === 'PLAYING'` for all non-challenging stages 1..100.
- **Entity Model**: `BaseBoss extends Enemy` registered in `formation.enemies` allows existing swept AABB collision detection in `Game.ts` to hit the Boss naturally without code duplication, and enables natural `onStageClear?.()` invocation when the boss health reaches 0.
- **Zero-GC Mandate**: All boss projectiles must be leased from `BulletManager` via an enhanced `fireEnemyBulletWithVector(originX, originY, vx, vy, type, damage, color)` with pool size expanded to 256. All sub-units (turrets, drones, satellites, constructs, phantoms) and hazards (tears, goo clouds) pre-allocated in static arrays.
- **100% Pure Procedural Graphics**: 10 Canvas pixel bit-matrices baked offscreen in `SpriteRenderer.ts` using `PALETTE_CHAR_MAP` (zero external images).

## 2. Boss Specifications
1. **Stage 10: Cyber Dreadnought (사이버 전함)**:
   - Phase 1: 80 HP total. Shielded core with 2 Twin Turrets (15 HP each) + 2 orbiting Escort Drones (5 HP each).
   - Phase 2: Core exposed at <= 50% HP (40 HP). 1.5s blast door invulnerability. Emits 4-arm rotating spiral bullet rings ($\omega = 1.75\text{ rad/s}, v = 140\text{ px/s}$) + aimed railgun shots.
2. **Stage 20: Dimensional Leviathan (차원수 레비아탄)**:
   - Phase 1: 120 HP total. Phase-shifts between Materialized (3.5s) and Void Shroud (2.0s, projectile invulnerable). Opens 2 Gravitational Dimensional Tears that deflect player bullets using softened gravity:
     $$\vec{a} = \frac{G (\vec{r}_{tear} - \vec{r}_{bullet})}{(r^2 + \epsilon^2)^{3/2}} \quad (G = 320,000, \epsilon = 18\text{ px})$$
   - Phase 2: Core at <= 50% HP (60 HP). Central Black-Hole Gravity Suction Vortex pulls player ship horizontally ($v_{suction} = \text{sign}(\Delta x) \cdot \min(110, 4500/(|\Delta x|+35))$) while pulsing radial shockwaves with a $40^\circ$ safe-sector gap.
3. **Stage 30: Nanite Swarm Colossus (나노머신 거신)**:
   - Phase 1: 150 HP total. Quad-burst spread salvo. At <= 50% HP (75 HP), splits into 4 autonomous Mini-Constructs (18 HP each) moving in Lissajous figure-8 paths with twin micro-plasma fire.
   - Phase 2: When mini-constructs are defeated, reassembles into Overclocked Titan. Deploys drifting Nanite Gray Goo Clouds ($R = 22\text{ px}$) that dissolve and neutralize incoming player bullets.
4. **Stage 40: Psionic Shroud Harbinger (장막의 사자)**:
   - Phase 1: 180 HP total. Deploys 2 Illusory Phantom Clones mimicking dive-bombs (0 damage taken). True Core has a subtle cyan third-eye pulse. 1.5s shell-game circular shuffle re-randomizes positions periodically.
   - Phase 2: Core at <= 50% HP (90 HP). Phantoms dissolve into psionic mist. Channels full-screen Telekinetic Stun Pulses ($v = 220\text{ px/s}$) cutting player thrusters by 75% for 1.25s, followed by rapid aimed psychic lances ($v = 280\text{ px/s}$).
5. **Stage 50: Aeternum Star-Eater Core (항성 포식자 - 파이널 레이드)**:
   - Phase 1: 300 HP total. Core 100% immune, protected by Planetary Shield Matrix powered by 4 Orbital Satellite Generators (25 HP each) along elliptical orbits ($R_x = 46\text{ px}, R_y = 22\text{ px}, \omega = 1.1\text{ rad/s}$).
   - Phase 2: At 200 HP, opens Dark Matter Focusing Lens; charges for 1.6s, fires Dark Matter Mega-Beam spanning 60% of canvas width ($W = 134.4\text{ px}$) sweeping laterally at $30\text{ px/s}$ with a $45\text{ px}$ safe evasion pocket.
   - Phase 3 (Enrage): At <= 33% HP (100 HP), reactor meltdown. Dual 6-arm counter-rotating spiral bullet hell ($\omega = \pm 2.2\text{ rad/s}, v = 130\text{ px/s}$) + desperate high-speed diving ram swoop ($v = 260\text{ px/s}$).
   - Defeat: Campaign victory score (+50,000 pts) and seamless transition into Stage 51 (Prestige loop).

## 3. Implementation Plan for Worker
- Files to create:
  - `src/core/boss/types.ts`: Boss interfaces, phase enums, projectile descriptors, sub-unit structures.
  - `src/core/boss/BaseBoss.ts`: Abstract base boss extending `Enemy`, handling phases, HP thresholds, invulnerability timers, sub-unit arrays, and rendering.
  - `src/core/boss/BossFactory.ts`: Factory instantiating boss for stages 10, 20, 30, 40, 50.
  - `src/core/boss/BossManager.ts`: Master boss coordinator managed by `Game.ts`.
  - `src/core/boss/bosses/CyberDreadnought.ts` (Stage 10)
  - `src/core/boss/bosses/DimensionalLeviathan.ts` (Stage 20)
  - `src/core/boss/bosses/NaniteColossus.ts` (Stage 30)
  - `src/core/boss/bosses/PsionicHarbinger.ts` (Stage 40)
  - `src/core/boss/bosses/AeternumCore.ts` (Stage 50)
- Files to update:
  - `src/entities/Bullet.ts`: Add `fireEnemyBulletWithVector(...)`, increase `POOL_MAX_SIZE` to 256.
  - `src/systems/DifficultyCalculator.ts`: Add `isBossStage(stage: number): boolean` returning `stage === 10 || stage === 20 || stage === 30 || stage === 40 || stage === 50`.
  - `src/systems/FormationManager.ts`: In `spawnStage(stage)`, if `isBossStage(stage)`, delegate to `bossManager.spawnBoss(stage)` to populate `this.enemies`.
  - `src/renderer/SpriteRenderer.ts`: Add the 10 procedural pixel bit-matrices for bosses and sub-units.
  - `src/core/Game.ts`: Integrate `BossManager` update, render, collision, and cleanup.
  - `tests/unit/boss_*.test.ts`: Write comprehensive unit & integration tests covering all 5 bosses, phase transitions, mechanics, and zero-GC bounds.
