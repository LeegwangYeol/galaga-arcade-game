# BRIEFING — 2026-09-14T08:38:50Z

## Mission
Investigate projectile allocation (`Bullet.ts`, `ObjectPool.ts`), player attribution (`ownerId?: 'p1' | 'p2' | 'enemy'`), score attribution (`ScoreManager.ts`), and subsystem state isolation/coordination (`PowerUpManager`, `SpecialMovesManager`, `AlliesManager`) for Milestone M31 Local 2-Player Co-op.

## 🔒 My Identity
- Archetype: explorer
- Roles: Teamwork explorer (read-only investigation, synthesis, structured handoff)
- Working directory: /Users/user/src/galog/.agents/m31_explorer_2
- Original parent: 0236827c-a7d2-4115-a374-2f5c45ed8134
- Milestone: M31 (Multi-Entity Player Architecture & Independent State Engine)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify project source code
- Always preserve zero-GC object pool invariants (no extra allocations during gameplay, fixed capacities)
- Maintain backward compatibility with single-player mode
- Output findings and contracts in handoff.md; maintain progress.md heartbeat

## Current Parent
- Conversation ID: 0236827c-a7d2-4115-a374-2f5c45ed8134
- Updated: 2026-09-14T08:38:50Z

## Investigation State
- **Explored paths**:
  - `src/entities/Bullet.ts` & `src/core/ObjectPool.ts` (Projectile pooling, quota checks, recycling)
  - `src/entities/Player.ts` (Missile tracking, quotas, buff state, attemptFire)
  - `src/systems/ScoreManager.ts` (Single scalar score/lives/accuracy, extend milestones)
  - `src/core/powerups/` (PowerUpManager.ts, types.ts, PowerUpItem.ts, 40+ existing tests using buffState)
  - `src/core/specials/` (SpecialMovesManager.ts, EnergySpark.ts, NovaMissile.ts, gauge charging)
  - `src/core/allies/` (AlliesManager.ts, EscortDrone.ts, AegisDrone.ts, BomberDrone.ts)
  - `src/core/Game.ts` (Bullet firing hooks, collision detection loop, score/energy attribution)
  - `src/ui/HUD.ts` (1UP, HIGH SCORE, 2UP section at x=176)
- **Key findings**:
  - `BulletManager` must partition player missile quotas (`activeP1BulletCount`, `activeP2BulletCount`) to prevent P1 from starving P2.
  - `Bullet` must be tagged with `ownerId: 'p1' | 'p2' | 'enemy' | 'drone'`, while preserving `owner: 'PLAYER'` for 100% backward compatibility with existing tests.
  - `ScoreManager` must support multi-channel scoring via `addScore(points, playerId = 'p1')` and `recordShotFired/Hit(count, playerId)`.
  - `PowerUpManager`: Item pickups must isolate player-specific buffs (Rapid Fire, Shield, Scatter, Booster, Reflection, Phase, Plasma) to the collector, while EMP Bomb and Chrono Field provide shared tactical benefits. Retain `buffState` for P1 and add `p2BuffState` for P2.
  - `SpecialMovesManager`: Dual gauges, separate keys (`X` vs `M`/`Shift`), Nova Barrage launches from executing player, Chrono Freeze pauses globally, Warp Ram ascends executing player without locking the other. Max 32 Nova missiles fits 2x16 without pool exhaustion.
  - Zero-GC invariant: All 9 object pools maintain static or bounded capacities (bulletPool capped at 256) with zero runtime allocations.
- **Unexplored areas**: None for M31 subsystem contracts; ready for implementation handoff.

## Key Decisions Made
- Keep `bullet.owner: BulletOwner` as `'PLAYER' | 'ENEMY' | 'DRONE'` and add `bullet.ownerId: ProjectileOwnerId = 'p1' | 'p2' | 'enemy' | 'drone'`.
- Maintain `ScoreManager` default parameter `playerId = 'p1'` for all score/extend methods to preserve 1,930 unit test baseline.
- Maintain `PowerUpManager.buffState` as reference to P1 buffs to satisfy existing test suites, while adding P2 buff tracking.

## Artifact Index
- DISPATCH.md — Dispatch log
- BRIEFING.md — Persistent working memory
- progress.md — Heartbeat and step log
- handoff.md — Comprehensive M31 architecture contracts and exploration report
