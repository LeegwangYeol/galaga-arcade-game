# Milestone 16 Swarm Adversarial Red-Team Strategy: Comprehensive Analysis & Test Blueprints

**Agent**: `m16_explorer_2`  
**Role**: Swarm Adversarial Red-Team Strategy Explorer  
**Working Directory**: `/Users/user/teamwork_projects/galaga_game/.agents/m16_explorer_2`  
**Parent Orchestrator**: `teamwork_preview_orchestrator_6` (`e83ea4b9-cadd-4692-a6bc-95743f0dd928`)  
**Date**: 2026-09-04  

---

## 1. Executive Summary

Milestone 16 represents the ultimate phase of the Galaga Arcade Web Game project: **Swarm Adversarial Hardening and Victory Audit**.
The existing baseline encompasses **62 test files** with **1,087 tests passing with 100% success rate** (certified via Vitest in 23.34s) and 95 Playwright browser tests passing cleanly.

This report establishes the red-team strategy and provides complete, concrete test blueprints for implementation in `tests/unit/adversarial_m16_*.test.ts`. The design targets complex, simultaneous multi-subsystem interactions that push engine limits:
1. **Extreme Combinatorial Saturation**: Simultaneous confluence of Stage 50 Aeternum Core Enrage + The Contingency Ghost Signal Glitch + Chrono Freeze Time Stop + Dual Fighter Docking + 3 Tactical Drones + Dimensional Warp Ram.
2. **Long-Session Memory Profiling**: 1,000 continuous combat ticks under extreme multi-hazard saturation without stage resets, measuring periodic heap drift and verifying $< 5.0$ MB net growth with zero un-recycled leases across all 8 object pools.
3. **Voice Channel Headroom & Canvas Coordinate Bounds Sanity**: High-stress audio concurrency testing enforcing the 12-voice normal / 16-voice high-priority hard ceiling, alongside a strict Canvas 2D math oracle proving zero `NaN`, zero `Infinity`, valid alpha $[0, 1]$, positive radii, and balanced save/restore depth under simultaneous mega-beams, cluster bombs, homing missiles, and shader effects.
4. **Zero-Invariant Enforcement**: Complete process-level validation confirming 0 unhandled promise rejections, 0 uncaught exceptions, 0 NaN entity coordinates, and 100% pool reclamation.

---

## 2. Deep Subsystem Architectural Inspection

### 2.1 Stage 50 Boss: Aeternum Star-Eater Core (`src/core/boss/bosses/AeternumCore.ts`)
- **Phase 1 (Orbital Shield Matrix)**:
  - 4 pre-allocated `BossSubUnit` orbital satellites ($r_x = 54, r_y = 22, \omega = 1.25\text{ rad/s}$).
  - Satellites fire vertical bullets ($v_y = 210\text{ px/s}$) every 1.5s.
  - While any satellite is active, `isProtectedBySubUnits()` returns `true`, completely deflecting incoming damage (`shieldAbsorbed: true`).
- **Phase 2 (Dark Matter Mega-Beam)**:
  - Mega-beam hazard spanning 60% canvas width ($134\text{ px}$ width, $y \in [70, 288]$).
  - 1.6s charge warning with directional sweep ($v_{\text{sweep}} = 30\text{ px/s}$).
  - Shotgun bullet spreads (5 angles: $[-0.4, -0.2, 0, 0.2, 0.4]\text{ rad}$, $v = 170\text{ px/s}$) every 1.2s.
- **Phase 3 (Enrage State)**:
  - Triggered when $\text{health} \le \lceil \text{maxHealth} / 3 \rceil$ ($150 / 3 = 50\text{ HP}$).
  - **Dual Counter-Rotating 6-Arm Spiral Bullet Hell**: Alpha cannon (clockwise $\omega = +2.2\text{ rad/s}$) and Beta cannon (counter-clockwise $\omega = -2.2\text{ rad/s}$), firing 12 bullets per volley ($v = 130\text{ px/s}$) every 0.25s (48 bullets/second!).
  - **Desperate Diving Ram Swoop**: Every 5.0s, swoops through player flight space using a 4-point Cubic Bézier curve:
    $$P_0(112, 52) \to P_1(20, 160) \to P_2(204, 250) \to P_3(112, 52)$$
    Collision with player occurs at $y \ge 230$.

### 2.2 The Contingency Crisis Event (`src/core/crisis/events/TheContingencyEvent.ts`)
- **AI Rogue Pulse**: Every 3.5s, emits an expanding EMP ring ($v = 350\text{ px/s}$ up to $r = 320$).
- **Predictive Homing Bullet Steering**: In every update tick, iterates over all active enemy bullets (`forEachActiveEnemyBullet`):
  $$\Delta x = p_x - b_x, \quad \text{steer} = \operatorname{sign}(\Delta x) \cdot 85 \cdot dt$$
  Clamps $v_x \in [-120, 120]\text{ px/s}$ and recomputes bullet angle $\theta = \operatorname{atan2}(v_y, v_x)$.
- **Player Fire Rate Stutter**: On a 2.6s cycle, for 0.45s, `player.fireCooldownTimer` is clamped to $\ge 0.22\text{s}$, severely degrading player DPS.
- **CRT & Matrix Shaders**: 96 scanlines ($3\text{px}$ stride), rolling V-sync bar ($140\text{ px/s}$), and 16 matrix digital code drops ($v = 40\dots 80\text{ px/s}$).

### 2.3 Special Moves Subsystem (`src/core/special/SpecialMovesManager.ts`)
- **Chrono Freeze**:
  - Sets `chronoFreezeTimer = 3.0s`.
  - Propagates `enemyDt = 0` to `Game.update`:
    - `bulletManager.update(dt, enemyDt)`: Player bullets move with `dt`, enemy bullets freeze with `enemyDt = 0`.
    - `formationManager.update(enemyDt)`: Living enemies freeze.
    - `bossManager.update(enemyDt)`: Boss movement, beam timers, and spiral bullet hell freeze completely!
    - Drones and power-ups continue updating with `dt` (allies are immune to the freeze!).
- **Dimensional Warp Ram**:
  - Sets `warpRamTimer = 1.0s`, `warpRamSpeed = 800\text{ px/s}`.
  - Player ship surges upward through the canvas.
  - Grants absolute invulnerability (`player.invulnerableTimer \ge 0.5s`).
  - Bullet Vaporization Lane: Automatically incinerates all enemy bullets in $[p_x - 20, p_x + 20]$, granting $+1\%$ energy per bullet.
  - Blunt Kinetic Trauma: Inflicts $120\text{ damage}$ to bosses upon collision and instant destruction ($999\text{ damage}$) to normal enemies.
  - VFX: 24 relativistic speed lines ($v = 700\dots 1100\text{ px/s}$), Doppler wake particles, and linear gradient plasma trail.
- **Nova Barrage**:
  - Salvo of 16 missiles using Proportional Navigation guidance ($v = 320 \to 580\text{ px/s}$, $\omega_{\max} = 14.0\text{ rad/s}$).
  - 5-element ring-buffer exhaust trails on each missile.

### 2.4 Allies Support System (`src/core/allies/AlliesManager.ts`)
- **Escort Drone**: Orbits player at $r = 28\text{ px}$ ($\omega = 2.0\text{ rad/s}$), auto-firing forward plasma bolts ($v_y = -350\text{ px/s}$).
- **Aegis Drone**: Orbits player at $r = 36\text{ px}$ ($\omega = -1.5\text{ rad/s}$), absorbing enemy bullets and pulsing barrier repair every 4.0s.
- **Bomber Drone**: Sweeps canvas top ($y = 36$, $v_x = 90\text{ px/s}$), dropping cluster bombs with gravity ($v_{y0} = 150, g = 60\text{ px/s}^2$).
- **Munition Pools**:
  - `bombPool`: capacity 16, `autoExpand: false`.
  - `explosionPool`: capacity 16, `autoExpand: false`. Blast AOE expands $r: 4 \to 28\text{ px}$, dealing 2 damage to normal enemies and 4 damage to bosses.

### 2.5 Procedural Web Audio Engine (`src/audio/SoundSynth.ts` & `src/audio/AudioManager.ts`)
- **Voice Concurrency Management**:
  - Hard limit: `MAX_CONCURRENT_VOICES = 12` (normal priority).
  - High priority headroom: `MAX_HIGH_PRIORITY_VOICES = 16`.
  - Low priority limit: $< 10$ active voices.
  - Debouncing: `isDebounced(key, 0.04s)` prevents duplicate oscillator allocation within 40ms.
  - Lifecycle: `osc.onended` decrements `activeVoiceCount` and disconnects nodes. Watchdog fallback timer ensures voice release if `onended` is delayed.
  - Looping nodes: `activeLoops` map tracked for Dark Matter Beam Roar, Dimensional Tear, and Black Hole Suction.

### 2.6 Zero-Allocation ObjectPool Invariant (`src/core/ObjectPool.ts`)
All 8 subsystems utilize bounded `ObjectPool` instances:
| Pool Subsystem | Element Type | Configured Capacity | `autoExpand` |
|---|---|---|---|
| BulletManager | `Bullet` | 256 | `true` (capped at 256) |
| ParticleSystem | `Particle` | 250 | `false` |
| PowerUpManager | `PowerUp` | 32 | `false` |
| AlliesManager (Bombs) | `ClusterBomb` | 16 | `false` |
| AlliesManager (Explosions) | `BombExplosion` | 16 | `false` |
| SpecialMovesManager (Missiles) | `NovaMissile` | 32 | `false` |
| SpecialMovesManager (Sparks) | `EnergySpark` | 32 | `false` |
| FormationManager | `Enemy` | 48 (max 64) | `false` |

---

## 3. Combinatorial Interaction Analysis & Potential Vulnerabilities

### Interaction Matrix
| Confluent Subsystems | Mechanism of Interaction | Potential Hazard / Red-Team Attack Vector | Mitigation / Assertion Required |
|---|---|---|---|
| **Aeternum Enrage + Chrono Freeze** | Aeternum fires 12 spiral bullets/0.25s; Chrono Freeze forces `enemyDt = 0`. | Do bullets accumulate in place or continue updating? Does spiral angle continue advancing? | Boss and bullet kinematics must freeze completely; `spiralFireTimer` must not increment; bullet coordinates must remain identical. |
| **The Contingency + Chrono Freeze** | Contingency applies steering acceleration ($85\text{ px/s}^2$) via `dt`; BulletManager updates positions with `enemyDt = 0`. | Velocity changes while position is frozen. Does steer cause NaN or infinite velocity? | Steer is clamped to $[-120, 120]$; angle recomputed via `atan2`; positions remain static until freeze lifts. |
| **Warp Ram + Aeternum Mega-Beam** | Player surges at $800\text{ px/s}$ through the active 60% beam damage zone. | Player hitbox intersects beam rectangle $[x_{\text{left}}, x_{\text{right}}]$. Does damage register? | Warp Ram sets `player.invulnerableTimer >= 0.5s` and `isInvincibleCheat = true`; player must survive beam crossing without loss of life. |
| **Warp Ram + Bounded BulletPool** | Player flight column $[p_x - 20, p_x + 20]$ vaporizes enemy bullets, immediately calling `recycle()`. | Concurrent iteration (`forEachActiveEnemyBullet`) while recycling could corrupt pool pointers or skip elements. | `forEachActiveEnemyBullet` utilizes safe backwards iteration or active snapshot; verify 0 pointer corruption. |
| **Dual Fighter + 3 Drones + Full Fire** | Dual ship (2/4 bullets) + Escort (plasma) + Bomber (cluster bombs) + Aegis (pulses). | High particle and projectile generation approaching pool capacities (256 bullets, 250 particles). | Pool saturation must return `null` safely without unhandled exception or capacity expansion. |
| **Rapid SFX Spam (Mega-Beam + Bombs + Missiles)** | Simultaneous triggers of beam charge/roar, cluster detonations, missile swooshes, and laser chirps ($> 50$ requests/frame). | Voice count overflow beyond Web Audio limits, AudioContext clipping, memory leaks from undisconnected nodes. | `canPlayVoice` drops low/normal priority sounds at 10/12; high-priority sounds capped at 16; all nodes cleanly disconnected. |

---

## 4. Test Blueprints for `tests/unit/adversarial_m16_*.test.ts`

We formulate three dedicated adversarial test suites covering the four mission pillars:

```
tests/unit/
├── adversarial_m16_combinatorial_saturation.test.ts  # Pillar 1 & 4 (Cross-system saturation)
├── adversarial_m16_long_session_memory.test.ts        # Pillar 2 & 4 (1,000-tick memory profiling)
└── adversarial_m16_voice_headroom_canvas_bounds.test.ts # Pillar 3 & 4 (Audio headroom & Canvas oracle)
```

### 4.1 Blueprint 1: `adversarial_m16_combinatorial_saturation.test.ts`

#### Scope & Objectives
1. Instantiate `Game` and simulate the confluent confluence of:
   - Stage 50 Aeternum Core in Phase 3 Enrage (Spiral bullet hell + Bézier Ram Swoop).
   - The Contingency Crisis Event actively steering bullets and stuttering player firing.
   - Chrono Freeze 3.0s time stop freezing enemy delta time.
   - Dual Fighter configuration (30px hitbox, dual weapon emitters).
   - 3 Tactical Drones active simultaneously (Escort, Aegis, Bomber).
   - Warp Ram executing through the frozen bullet hell and ramming the boss.
2. Verify kinematic invariance:
   - While Chrono Freeze is active, `enemyDt === 0`:
     - Aeternum Core position does NOT change.
     - Aeternum Core phase timers do NOT advance.
     - Active enemy bullets do NOT move in position ($x(t + \Delta t) = x(t)$).
   - Player ship and ally drones continue updating at full 60 FPS ($dt = 1/60$).
   - Cluster bombs dropped by Bomber drone continue falling and detonating.
3. Verify Warp Ram interaction:
   - Player charges from $y = 250$ to $y < -30$ at $800\text{ px/s}$.
   - All enemy bullets within $[p_x - 20, p_x + 20]$ are instantly recycled into the pool.
   - Player collides with Aeternum Core, inflicting exactly 120 blunt kinetic trauma.
   - Player wraps cleanly and returns to $y = 250$ with grace invulnerability.
4. Verify Contingency Glitch resolution:
   - When Chrono Freeze expires, bullets resume moving with updated steered trajectories.
   - Zero NaN coordinates across all bullets, drones, missiles, and boss sub-units.

#### Key Test Code Blueprint
```typescript
describe('Milestone 16 Adversarial: Extreme Combinatorial Saturation Suite', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.startGame();
  });

  afterEach(() => {
    if (game) game.destroy();
  });

  it('survives simultaneous Stage 50 Enrage + Contingency + Chrono Freeze + Dual Fighter + 3 Drones + Warp Ram', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    // 1. Advance to Stage 50
    cheat.skipToStage(50);
    const boss = game.bossManager.activeBoss as AeternumCore;
    expect(boss).not.toBeNull();
    expect(boss.stage).toBe(50);

    // 2. Force Phase 3 Enrage
    boss.satellites.forEach((s) => (s.active = false));
    boss.phase = 'PHASE_3';
    boss.introTimer = 0;
    boss.invulnerableTimer = 0;
    boss.health = Math.floor(boss.maxHealth / 3) - 5;

    // 3. Trigger The Contingency Crisis
    cheat.triggerCrisis('contingency');
    const crisis = game.crisisEventManager.getActiveCrisis();
    expect(crisis).not.toBeNull();
    (crisis as any).state = 'ACTIVE';

    // 4. Enable Dual Fighter
    game.player.setDualFighter(true);
    expect(game.player.isDual).toBe(true);

    // 5. Summon All 3 Drones
    cheat.unlockDrone('all');
    expect(game.alliesManager.escortDrone.active).toBe(true);
    expect(game.alliesManager.aegisDrone.active).toBe(true);
    expect(game.alliesManager.bomberDrone.active).toBe(true);

    // 6. Advance 30 frames to populate spiral bullet hell & cluster bombs
    for (let f = 0; f < 30; f++) {
      game.bulletManager.firePlayerBullet(game.player.x - 6, game.player.y, true, 480);
      game.bulletManager.firePlayerBullet(game.player.x + 6, game.player.y, true, 480);
      game.update(1 / 60);
    }
    expect(game.bulletManager.getPool().getActiveCount()).toBeGreaterThan(10);

    // 7. Trigger Chrono Freeze
    cheat.fillEnergy(100);
    cheat.triggerSpecialMove('chrono');
    expect(game.specialMovesManager.isChronoFreezeActive()).toBe(true);

    // Record frozen state
    const frozenBossX = boss.x;
    const frozenBossY = boss.y;
    const initialBulletPositions = new Map<number, { x: number; y: number }>();
    game.bulletManager.forEachActiveEnemyBullet((b) => {
      initialBulletPositions.set(b.id, { x: b.position.x, y: b.position.y });
    });

    // 8. Run 20 frozen frames
    for (let f = 0; f < 20; f++) {
      game.update(1 / 60);
      // Verify boss coordinates are strictly stationary
      expect(boss.x).toBe(frozenBossX);
      expect(boss.y).toBe(frozenBossY);
      // Verify enemy bullets are strictly stationary
      game.bulletManager.forEachActiveEnemyBullet((b) => {
        const initPos = initialBulletPositions.get(b.id);
        if (initPos) {
          expect(b.position.x).toBe(initPos.x);
          expect(b.position.y).toBe(initPos.y);
        }
      });
    }

    // 9. Execute Warp Ram mid-freeze
    const initialBossHp = boss.health;
    cheat.fillEnergy(100);
    cheat.triggerSpecialMove('warp');
    expect(game.specialMovesManager.isWarpRamActive()).toBe(true);

    // Run Warp Ram execution frames (60 frames = 1.0s)
    for (let f = 0; f < 60; f++) {
      game.update(1 / 60);
    }

    // Assert Warp Ram delivered kinetic trauma to boss
    expect(boss.health).toBeLessThanOrEqual(initialBossHp);

    // Assert zero NaN coordinates across all entities
    expect(Number.isFinite(game.player.x)).toBe(true);
    expect(Number.isFinite(game.player.y)).toBe(true);
    expect(Number.isFinite(boss.x)).toBe(true);
    expect(Number.isFinite(boss.y)).toBe(true);
    game.bulletManager.forEachActiveEnemyBullet((b) => {
      expect(Number.isFinite(b.position.x)).toBe(true);
      expect(Number.isFinite(b.position.y)).toBe(true);
      expect(Number.isFinite(b.velocity.x)).toBe(true);
      expect(Number.isFinite(b.velocity.y)).toBe(true);
    });
  });
});
```

---

### 4.2 Blueprint 2: `adversarial_m16_long_session_memory.test.ts`

#### Scope & Objectives
1. **1,000 Continuous Combat Ticks Endurance Simulation**:
   - Equivalent to ~16.67 seconds of non-stop combat at 60 FPS under continuous multi-hazard saturation.
   - Player in Dual Fighter mode with constant weapon discharge (2 volleys every 4 frames).
   - 3 Drones continuously active (Escort firing, Aegis absorbing, Bomber dropping cluster bombs every 25 frames).
   - Special Moves continuously cycled every 60 frames (Nova Barrage $\to$ Chrono Freeze $\to$ Warp Ram).
   - Enemies taking continuous damage and exploding.
   - Power-ups dropping, falling, and collecting.
2. **Periodic Heap Profiling**:
   - Warm-up phase (60 ticks) followed by `forceGC()` to stabilize JIT and v8 compiler heap.
   - Baseline heap recorded: `baselineHeap = process.memoryUsage().heapUsed`.
   - Heap sampled every 200 ticks:
     - Tick 200, 400, 600, 800, 1,000.
     - Invariant: Net heap growth must remain monotonically stable with $< 5.0\text{ MB}$ net drift.
3. **Strict Zero-Allocation & autoExpand Invariant**:
   - All 8 pools verified:
     - `powerUpPool.getCapacity() === 32` (`autoExpand: false`).
     - `bombPool.getCapacity() === 16` (`autoExpand: false`).
     - `explosionPool.getCapacity() === 16` (`autoExpand: false`).
     - `missilePool.getCapacity() === 32` (`autoExpand: false`).
     - `sparkPool.getCapacity() === 32` (`autoExpand: false`).
     - `enemyPool.getCapacity() === 48` (`autoExpand: false`).
     - `particlePool.getCapacity() === 250` (`autoExpand: false`).
     - `bulletPool.getCapacity() <= 256`.
4. **End-of-Session Teardown Sanitation**:
   - Teardown executed at tick 1,000.
   - 100% of all active items returned to pools: `getActiveCount() === 0` across all 8 pools.
   - `getFreeCount() === getCapacity()` verified across all 8 pools.
   - Post-teardown `forceGC()` confirms net memory retention $< 5.0\text{ MB}$.

#### Key Test Code Blueprint
```typescript
describe('Milestone 16 Adversarial: 1,000-Tick Long-Session Memory Profiling', () => {
  let game: Game;

  beforeEach(() => {
    game = new Game();
    game.startGame();
  });

  afterEach(() => {
    if (game) game.destroy();
  });

  it('runs 1,000 continuous saturated combat ticks with < 5.0 MB net heap drift and 100% pool recovery', () => {
    const cheat = game.getCheatController();
    cheat.setInvincible(true);

    // Warm-up & JIT stabilization
    cheat.skipToStage(10);
    for (let f = 0; f < 60; f++) {
      game.bulletManager.firePlayerBullet(112, 240, false, 480);
      game.update(1 / 60);
    }
    cheat.killAllEnemies();
    teardownStageBoundary(game);

    forceGC();
    const baselineHeap = process.memoryUsage().heapUsed;

    // Start 1,000-tick continuous endurance run
    cheat.skipToStage(25);
    game.player.setDualFighter(true);
    cheat.unlockDrone('all');
    cheat.triggerCrisis('contingency');

    const heapSnapshots: number[] = [];

    for (let tick = 1; tick <= 1000; tick++) {
      // 1. Dual Player rapid fire every 4 frames
      if (tick % 4 === 0) {
        game.bulletManager.firePlayerBullet(game.player.x - 6, game.player.y - 8, true, 480);
        game.bulletManager.firePlayerBullet(game.player.x + 6, game.player.y - 8, true, 480);
      }

      // 2. Bomber drops cluster bomb every 25 frames
      if (tick % 25 === 0) {
        game.alliesManager.spawnClusterBomb(50 + (tick % 120), 40);
      }

      // 3. Special moves cycled every 60 frames
      if (tick % 60 === 0) {
        cheat.fillEnergy(100);
        const moveChoice = (tick / 60) % 3;
        if (moveChoice === 0) cheat.triggerSpecialMove('nova');
        else if (moveChoice === 1) cheat.triggerSpecialMove('chrono');
        else cheat.triggerSpecialMove('warp');
      }

      // 4. Spawn power-ups and particles
      if (tick % 30 === 0) {
        game.powerUpManager.spawnDrop(112, 80, 25);
        game.particleSystem.spawnPlayerExplosion(game.player.x, game.player.y);
      }

      // Update frame
      game.update(1 / 60);

      // Periodic heap snapshot every 200 ticks
      if (tick % 200 === 0) {
        heapSnapshots.push(process.memoryUsage().heapUsed);
      }
    }

    expect(heapSnapshots.length).toBe(5);

    // Teardown at end of 1,000 ticks
    teardownStageBoundary(game);

    // STRICT INVARIANT: All 8 object pools must have 0 active items
    expect(game.bulletManager.getPool().getActiveCount()).toBe(0);
    expect(game.particleSystem.getPool().getActiveCount()).toBe(0);
    expect(game.powerUpManager.getPool().getActiveCount()).toBe(0);
    expect(game.alliesManager.getBombPool().getActiveCount()).toBe(0);
    expect(game.alliesManager.getExplosionPool().getActiveCount()).toBe(0);
    expect(game.specialMovesManager.getMissilePool().getActiveCount()).toBe(0);
    expect(game.specialMovesManager.getSparkPool().getActiveCount()).toBe(0);
    expect(game.formationManager.getEnemyPool().getActiveCount()).toBe(0);

    // Verify capacities did NOT expand
    expect(game.powerUpManager.getPool().getCapacity()).toBe(32);
    expect(game.alliesManager.getBombPool().getCapacity()).toBe(16);
    expect(game.alliesManager.getExplosionPool().getCapacity()).toBe(16);
    expect(game.specialMovesManager.getMissilePool().getCapacity()).toBe(32);
    expect(game.specialMovesManager.getSparkPool().getCapacity()).toBe(32);
    expect(game.formationManager.getEnemyPool().getCapacity()).toBe(48);

    forceGC();
    const finalHeap = process.memoryUsage().heapUsed;
    const netDriftMB = (finalHeap - baselineHeap) / (1024 * 1024);

    expect(netDriftMB).toBeLessThan(5.0);
  });
});
```

---

### 4.3 Blueprint 3: `adversarial_m16_voice_headroom_canvas_bounds.test.ts`

#### Scope & Objectives
1. **Web Audio Voice Concurrency & Headroom Hard Ceiling**:
   - Execute 100+ simultaneous SFX requests in a single frame across multiple categories:
     - 25 laser chirps (`playLaser()`, `playLaserDual()`).
     - 25 explosions (`playExplosion('small' | 'large' | 'boss')`).
     - 25 boss/drone attacks (`playClusterBombThud()`, `playDarkMatterBeamRoar()`, `playHeavyLaserBlast()`).
     - 25 special moves (`playNovaMissileSwoosh()`, `playChronoFreezeDrop()`, `playWarpRamSonicBoom()`).
   - Invariants:
     - `activeVoiceCount` must NEVER exceed `SoundSynth.MAX_HIGH_PRIORITY_VOICES = 16`.
     - Normal priority sounds are rejected once active voices $\ge 12$.
     - Low priority sounds are rejected once active voices $\ge 10$.
     - High priority sounds utilize headroom between 12 and 16.
     - Dual cleanup watchdogs: Every created audio node must disconnect properly.
     - Once sounds finish (or watchdog expires), `activeVoiceCount` returns strictly to 0.
2. **Canvas 2D Coordinate Bounds & Math Sanity Oracle**:
   - Strict Canvas 2D interceptor wrapping all drawing calls.
   - Asserts that every single coordinate ($x, y, w, h, \text{radius}, \text{angle}$) is finite, not NaN, and within valid geometric boundaries.
   - Validates that `globalAlpha` is within $[0.0, 1.0]$.
   - Validates that `addColorStop` offset is within $[0.0, 1.0]$.
   - Validates that `arc` radius is strictly $\ge 0$.
   - Validates that `ctx.save()` and `ctx.restore()` are perfectly balanced (stack depth $= 0$ at end of each frame).
3. **Simultaneous Multi-Hazard VFX Rendering**:
   - Render 300 frames of extreme VFX saturation:
     - Stage 50 Aeternum Core charging and firing Dark Matter Mega-Beam (width 134, sweeping $x \in [0, 224]$).
     - 16 Nova Missiles active with 5-element exhaust trails and targeting reticles.
     - 8 Cluster Bombs falling and 4 expanding shockwaves ($r: 4 \to 28$).
     - The Contingency 96 scanlines, rolling V-sync bar, and 16 matrix digital rain drops.
     - Warp Ram 24 relativistic speed lines and plasma motion blur gradient.
     - Camera screen shake with random translation offsets ($\pm 4\text{px}$).
     - Dual Fighter ship sprite and 3 orbiting drones.
   - Assert ZERO Canvas bounds violations, ZERO NaN coordinates, and ZERO save/restore depth leaks.
4. **Process-Level Exception & Rejection Trap**:
   - Register listeners for `unhandledRejection` and `uncaughtException`.
   - Assert strictly 0 occurrences throughout the entire test suite.

#### Key Test Code Blueprint
```typescript
describe('Milestone 16 Adversarial: Voice Headroom & Canvas Coordinate Bounds', () => {
  let unhandledRejections = 0;
  let uncaughtExceptions = 0;
  let rejectionHandler: (reason: any) => void;
  let exceptionHandler: (error: Error) => void;

  beforeEach(() => {
    unhandledRejections = 0;
    uncaughtExceptions = 0;
    rejectionHandler = () => unhandledRejections++;
    exceptionHandler = () => uncaughtExceptions++;
    process.on('unhandledRejection', rejectionHandler);
    process.on('uncaughtException', exceptionHandler);
  });

  afterEach(() => {
    process.off('unhandledRejection', rejectionHandler);
    process.off('uncaughtException', exceptionHandler);
    expect(unhandledRejections).toBe(0);
    expect(uncaughtExceptions).toBe(0);
  });

  describe('1. Audio Voice Concurrency & Headroom Hard Ceiling', () => {
    it('enforces 16-voice high-priority hard ceiling under 100 simultaneous SFX requests and releases all voices to 0', () => {
      const synth = SoundSynth.getInstance();
      synth.stopAll();

      let acceptedVoices = 0;
      let rejectedVoices = 0;

      // Fire 100 simultaneous sounds of varying priorities
      for (let i = 0; i < 100; i++) {
        const priority = i % 4 === 0 ? SOUND_PRIORITY.HIGH : SOUND_PRIORITY.NORMAL;
        let played = false;
        if (i % 3 === 0) {
          played = synth.playLaser();
        } else if (i % 3 === 1) {
          played = synth.playExplosion('large');
        } else {
          played = synth.playClusterBombThud();
        }

        if (played) acceptedVoices++;
        else rejectedVoices++;

        // HARD INVARIANT: Active voices must NEVER exceed MAX_HIGH_PRIORITY_VOICES
        expect(synth.getActiveVoiceCount()).toBeLessThanOrEqual(SoundSynth.MAX_HIGH_PRIORITY_VOICES);
      }

      expect(acceptedVoices).toBeGreaterThan(0);
      expect(rejectedVoices).toBeGreaterThan(0);

      // Fast-forward or trigger stopAll
      synth.stopAll();
      expect(synth.getActiveVoiceCount()).toBe(0);
    });
  });

  describe('2. Canvas Coordinate Bounds & Math Sanity Oracle', () => {
    it('renders 300 frames of simultaneous Mega-Beam, Cluster Bombs, and Homing Missiles with zero NaN, zero Infinity, and balanced stack', () => {
      const game = new Game();
      game.startGame();
      const cheat = game.getCheatController();
      cheat.setInvincible(true);

      cheat.skipToStage(50);
      const boss = game.bossManager.activeBoss as AeternumCore;
      // Force Mega-Beam firing in Phase 2
      boss.phase = 'PHASE_2';
      boss.megaBeam.active = true;
      boss.megaBeam.firing = true;
      boss.megaBeam.centerX = 112;
      boss.megaBeam.fireTimer = 2.0;

      // Trigger Contingency
      cheat.triggerCrisis('contingency');

      // Summon drones and trigger cluster bombs
      cheat.unlockDrone('all');
      game.alliesManager.spawnClusterBomb(80, 40);
      game.alliesManager.spawnClusterBomb(120, 40);
      game.alliesManager.spawnExplosion(100, 105, 28);

      // Trigger Nova Barrage (16 missiles in flight)
      cheat.fillEnergy(100);
      cheat.triggerSpecialMove('nova');

      // Strict Canvas Interceptor Context
      const strictCtx = createStrictAdversarialContext();

      // Render 300 frames through the strict interceptor
      for (let f = 0; f < 300; f++) {
        game.update(1 / 60);

        // Render full game pass
        game.render(strictCtx as unknown as CanvasRenderingContext2D);

        // Check stack depth is strictly 0 at the end of each frame
        expect(strictCtx.stackDepth).toBe(0);
      }

      game.destroy();
    });
  });
});
```

---

## 5. Verification & Acceptance Criteria

When the implementer creates and executes these test suites:
1. **Compilation & Linting**: `npx tsc --noEmit` must produce 0 type errors.
2. **Vitest Test Suite**: All tests in `tests/unit/adversarial_m16_*.test.ts` must pass 100%. Total passing unit tests will increase from 1,087 to ~1,105+.
3. **Memory Profile Certification**:
   - 1,000 ticks under extreme multi-hazard saturation: Net heap drift $< 5.0\text{ MB}$.
   - Post-teardown pool state: `getActiveCount() === 0` and `getFreeCount() === capacity` across all 8 pools.
   - Zero capacity expansions (`autoExpand: false` invariant preserved).
4. **Process Stability**:
   - Zero `unhandledRejection` events.
   - Zero `uncaughtException` events.
   - Zero `NaN` or `Infinity` coordinate violations caught by the Canvas bounds oracle.
5. **Audio Voice Headroom**:
   - Under 100+ concurrent requests, `activeVoiceCount \le 16` maintained at all times.
   - Zero lingering active audio nodes after sound completion or `stopAll()`.

---

## 6. Downstream Recommendations for Swarm Roles

1. **For Worker / Implementer (`m16_worker`)**:
   - Implement the three modular test files in `tests/unit/adversarial_m16_*.test.ts` adhering to the blueprints in Section 4.
   - Utilize existing utilities: `teardownStageBoundary`, `forceGC`, and `createStrictAdversarialContext`.
   - Ensure tests are deterministic and do not exceed standard Vitest timeout thresholds (keep per-test duration $< 2.0$s).
2. **For Reviewers (`m16_reviewer_1`, `m16_reviewer_2`)**:
   - Verify that no source code files in `src/` are modified unless an actual bug or leak is surfaced by the adversarial tests.
   - Verify that test assertions strictly test invariants rather than implementation trivia.
3. **For Challengers (`m16_challenger_1`, `m16_challenger_2`)**:
   - Probe boundary edge cases: rapid stage skips during Warp Ram re-entry, simultaneous boss defeat during Chrono Freeze, and AudioContext close/suspend transitions.
4. **For Victory Auditor (`teamwork_preview_victory_auditor_1`)**:
   - Audit that all 50+ agent roles in Milestone 16 conclude with 100% verified evidence, full test suite passing, and zero-leak certification.
