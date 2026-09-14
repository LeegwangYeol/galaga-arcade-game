# Milestone 12 Architectural Analysis: 5 Epic Multi-Phase Boss Encounters
**Author**: `m12_explorer_1`  
**Date**: 2026-09-04  
**Project**: Galaga Arcade Web Game — Ultimate Arcade Edition  
**Repository**: `/Users/user/teamwork_projects/galaga_game` (mirrored at `/Users/user/src/galog`)  
**Baseline Test Status**: 36 test files, 764 passed (0 failures)

---

## 1. Executive Summary

This investigation establishes the complete technical and architectural blueprint for **Milestone 12: 5 Epic Multi-Phase Boss Encounters (Stages 10, 20, 30, 40, 50)**.

Through comprehensive static analysis of the existing codebase (`Game.ts`, `FormationManager.ts`, `DifficultyCalculator.ts`, `Enemy.ts`, `Bullet.ts`, `CrisisEventManager.ts`, `PowerUpManager.ts`, and test suites), we have identified the exact integration touchpoints, lifecycle state transitions, and memory allocation invariants required to deliver the 5 multi-phase boss battles without breaking any of the 764 certified tests.

### Key Architectural Findings:
1. **State Machine Invariant**: In `tests/unit/adversarial_challenger_3.test.ts` (lines 190–230), an adversarial simulation loop executes from Stage 1 to 100. On all non-challenging stages (including Stages 10, 20, 30, 40, 50), the test strictly asserts `expect(game.state).toBe('PLAYING')` and `expect(game.getFormationManager().enemies.length).toBeGreaterThan(0)`. Therefore, Boss Encounters must run within `game.state === 'PLAYING'`, with `BossManager` orchestrating boss-specific behaviors, rendering, and HUD overlays.
2. **Enemy Hierarchy Synergy**: By designing `BaseBoss extends Enemy`, any active boss naturally participates in the existing `FormationManager.enemies` registry and swept AABB collision pipeline (`Game.resolveCollisions()`). This guarantees:
   - Zero duplication of projectile collision math.
   - Full compatibility with `formationManager.getLivingCount()`.
   - Natural triggering of `onStageClear()` upon boss destruction.
3. **Zero Runtime GC Guarantee**: All boss-fired projectiles (spiral rings, radial shockwaves, aimed darts) will be leased through `BulletManager`'s existing `ObjectPool<Bullet>`. All boss sub-units (Cyber Turrets, Escort Drones, Orbital Satellites, Phantom Clones, Mini-Constructs) will be pre-allocated in fixed, bounded arrays with zero dynamic heap allocations during 60 FPS gameplay ticks.

---

## 2. Examination of Existing Systems

### 2.1 `src/core/Game.ts`
- **Role**: Master coordinator integrating all engine systems, managing the fixed-timestep loop, input consumption, audio triggers, state transitions, and collision resolution.
- **State Flow**:
  - `BOOT` $\to$ `TITLE` $\to$ `STAGE_INTRO` (2.2s) $\to$ `PLAYING` / `CHALLENGING_STAGE` $\to$ `STAGE_CLEAR` (1.8s–2.8s) $\to$ `STAGE_INTRO` (next stage).
  - During `STAGE_INTRO` (lines 677–692), `updateStageIntro` checks:
    ```typescript
    if (this.stateTimer >= 2.2) {
      this.player.respawn();
      if (this.formationManager.enemies.length === 0) {
        this.formationManager.spawnStage(this.stage);
      }
      if (this.isChallengingStage(this.stage)) {
        this.scoreManager.resetChallengingHits();
        this.setState('CHALLENGING_STAGE');
      } else {
        this.setState('PLAYING');
        this.crisisEventManager.evaluateStageTrigger(this.stage);
      }
    }
    ```
- **Collision Resolution (`resolveCollisions`, lines 783–967)**:
  - 1. Player Missiles vs Living Enemies (`livingEnemies = this.formationManager.getLivingEnemies()`).
  - 2. Tractor Beam vs Player.
  - 3. Enemy Bullets vs Player (`this.bulletManager.forEachActiveEnemyBullet`).
  - 4. Kamikaze Enemy Craft Collision vs Player.
  - 5. Collectible Power-Up Capsules vs Player.
- **Rendering Pipeline (`render`, lines 973–1048)**:
  - Z-Order:
    1. Virtual Canvas Clear (`#000000`)
    2. Starfield (z: 0)
    3. HUD Header (z: 6)
    4. Playing Screen / Overlay (z: 7):
       - `formationManager.render(ctx)`
       - `tractorBeam.render(ctx)`
       - `powerUpManager.render(ctx)`
       - `bulletManager.render(ctx)`
       - `particleSystem.render(ctx)`
       - `player.render(ctx)`
       - `crisisEventManager.render(ctx)`
    5. HUD Footer (Lives & Badges)

### 2.2 `src/systems/DifficultyCalculator.ts`
- Computes non-linear difficulty curves across Stages 1–50:
  - `getStageTier(stage)`: `CLASSIC` (1–10), `ELITE` (11–25), `DREADNOUGHT` (26–50).
  - `isChallengingStage(stage)`: `stage >= 3 && stage % 4 === 3` (Stages 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47).
- Note: Stages 10, 20, 30, 40, and 50 are **never** challenging stages:
  - $10 \pmod 4 = 2$ (Classic Capstone)
  - $20 \pmod 4 = 0$ (Elite Mid-boss)
  - $30 \pmod 4 = 2$ (Dreadnought Entry)
  - $40 \pmod 4 = 0$ (Dreadnought Apex)
  - $50 \pmod 4 = 2$ (Final Cosmic Raid)
- Adding `DifficultyCalculator.isBossStage(stage)` returning `stage === 10 || stage === 20 || stage === 30 || stage === 40 || stage === 50` seamlessly complements this design.

### 2.3 `src/systems/FormationManager.ts`
- Manages 40-alien grid slots across 5 rows, harmonic breathing oscillations, 5 sub-wave entry swoops, and attack dive peeling.
- **Stage Spawn (`spawnStage`, lines 219–261)**:
  - If challenging stage: calls `spawnChallengingStage()`.
  - Otherwise: populates `this.enemies` with 40 enemy instances (Row 0: 4 Bosses, Rows 1–2: 16 Goeis, Rows 3–4: 20 Zakos).
- **Stage Clear Detection (lines 861–865)**:
  ```typescript
  if (livingCount === 0 && !this.isEntryWaveActive && this.enemies.length > 0) {
    this.onStageClear?.();
  }
  ```
  When `livingCount === 0`, it invokes `onStageClear?.()`, which signals `Game.ts` to enter `STAGE_CLEAR`.

### 2.4 `src/entities/Enemy.ts`
- Implements `Poolable`. Contains `takeDamage(amount: number): EnemyDamageResult`.
- Properties: `x, y, vx, vy, rotation, health, maxHealth, shield, maxShield, damageFlashTimer, shieldFlashTimer`.
- `getHitbox(): Rect` returns AABB centered on `(x, y)` with dimensions `CORE_HITBOX_SIZE = 12`.
- `render(ctx)` calls `SpriteRenderer.drawEnemy(...)`.

### 2.5 `src/entities/Bullet.ts` & `BulletManager`
- Manages `ObjectPool<Bullet>` (pre-allocated 32, max 128).
- Has `firePlayerBullet(...)`, `firePlayerBulletWithVector(...)`, and `fireEnemyBullet(originX, originY, targetX, targetY, speed, type)`.
- Adding `fireEnemyBulletWithVector(originX, originY, vx, vy, type)` directly enables circular spiral bullet rings and radial shockwaves with zero trigonometry overhead during trajectory dispatch.

### 2.6 `src/core/crisis/CrisisEventManager.ts` (M10 Pattern)
- Uses an extensible Factory + Event hierarchy:
  - `CrisisEventFactory.create(type, context)`
  - `BaseCrisisEvent` with `onWarningStart()`, `onActivate()`, `onDeactivate()`, `update(dt)`, `render(ctx)`.
- Self-contained, robust, handles HUD warnings and canvas shaders cleanly.

### 2.7 `src/core/powerups/PowerUpManager.ts` (M11 Pattern)
- Uses `ObjectPool<PowerUpItem>` bounded to 32 items with zero-allocation guarantees.
- Integrates drop tables based on enemy type and dive state. When bosses are destroyed, high-tier drops (Dual Fighter rescue item, Kinetic Shield, Rapid Fire) are awarded.

---

## 3. Dedicated Boss Encounter State & Stage Transition Architecture

### 3.1 Seamless Integration Without Breaking Existing Tests
In `tests/unit/adversarial_challenger_3.test.ts`, the stage loop asserts:
```typescript
for (let st = 1; st <= 100; st++) {
  ...
  expect(game.state).toBe('PLAYING');
  const enemies = game.getFormationManager().enemies;
  expect(enemies.length).toBeGreaterThan(0);
  for (const e of enemies) {
    expect(Number.isFinite(e.x)).toBe(true);
    expect(Number.isFinite(e.y)).toBe(true);
  }
  game.setState('STAGE_CLEAR');
  game.stateTimer = 3.0;
  game.update(1 / 60);
}
```
To satisfy this test and all related integration tests:
1. `game.state` remains `'PLAYING'` on Stages 10, 20, 30, 40, and 50.
2. `FormationManager.spawnStage(stage)` on boss stages clears normal grid slots and populates `this.enemies` with the Boss instance and its sub-units/escorts.
3. Every entity in `this.enemies` has valid, finite `(x, y)` coordinates at all times.
4. When `game.setState('STAGE_CLEAR')` is manually called by tests, `bossManager.onStageClear()` cleanly resets the active boss without hanging.

### 3.2 Stage Clear & Victory Handling
- **Stages 10, 20, 30, 40**:
  - Depleting Boss final phase HP triggers:
    1. Multi-stage explosion particle cascade (`particleSystem.spawnBossExplosion`).
    2. Massive score award (`15,000` to `45,000` points).
    3. Guaranteed power-up drop (`PowerUpType.KINETIC_SHIELD` / `RAPID_FIRE`).
    4. `Boss` state transitions to `EnemyState.EXPLODING` $\to$ `EnemyState.INACTIVE`.
    5. `FormationManager.update` detects `livingCount === 0`, firing `this.onStageClear?.()`.
    6. `Game.setState('STAGE_CLEAR')` displays "STAGE CLEAR" and advances to Stage 11, 21, 31, or 41.
- **Stage 50: Aeternum Star-Eater Core (Final Victory)**:
  - Depleting Phase 3 Enrage HP triggers:
    1. Epic cosmic detonation sequence (canvas flash, multi-colored particle shockwave).
    2. Grand score award: `100,000` points.
    3. `Game.setState('STAGE_CLEAR')` displays "GALAXY SAVED! FINAL VICTORY".
    4. To satisfy infinite simulation tests (`adversarial_challenger_3.test.ts`), subsequent stage advance transitions cleanly into Stage 51 (Prestige / Endless loop).

---

## 4. Specifications for the 5 Epic Multi-Phase Bosses

### Boss 1: Stage 10 — Cyber Dreadnought (사이버 전함)
- **Visual Matrix**: 32x24 pixel heavy mechanical battlecruiser, dual hull, metallic cyan/silver plating (`#00FFFF`, `#AAAAAA`), blinking red optics (`#E70000`).
- **Health**: Phase 1: 40 HP, Phase 2: 50 HP. Total: 90 HP.
- **Score Award**: 15,000 PTS.
- **Phase 1: Twin Turrets & Escort Drones**:
  - Two wing-mounted laser turrets fire alternating twin cyan beam pulses towards the player.
  - Two Cyber Drones flank the dreadnought in synchronized sine-wave escort patterns.
  - Destroying drones removes flanking harassment; damaging turrets/core transitions to Phase 2 at 50% total HP.
- **Phase 2: Exposed Core & Rotating Spiral Bullet Hell**:
  - Dreadnought armor slides open, exposing a pulsing yellow/red energy core.
  - Fires rotating 12-way spiral bullet rings ($\Delta\theta = 0.25\text{ rad/salvo}$, interval: 0.8s).
  - Sweeps horizontally across $x \in [48, 176]$.

### Boss 2: Stage 20 — Dimensional Leviathan (차원수 레비아탄)
- **Visual Matrix**: 40x28 cosmic void serpent, dark violet chitin (`#9900EE`, `#550088`), glowing neon cyan crest (`#00FFFF`).
- **Health**: Phase 1: 60 HP, Phase 2: 70 HP. Total: 130 HP.
- **Score Award**: 25,000 PTS.
- **Phase 1: Phase-Shifting & Dimensional Gravity Tears**:
  - Phase-shifts every 4.0s: enters ethereal translucent state (`globalAlpha = 0.35`, invulnerable to damage for 1.8s).
  - Opens 2 drifting Dimensional Tears on the canvas ($r = 14\text{ px}$): gravitationally distorts player missiles passing nearby.
- **Phase 2: Radial Shockwaves & Black-Hole Suction Vortex**:
  - Core destabilization: emits 8-way expanding plasma shockwave orbs every 1.2s.
  - Black-Hole Suction: activates an accretion vortex pulling the player ship laterally toward the boss center ($v_{\text{pull}} = 65\text{ px/s}$), requiring player active counter-steering.

### Boss 3: Stage 30 — Nanite Swarm Colossus (나노머신 거신)
- **Visual Matrix**: 36x36 shifting pixel cluster of interlocking nanite blocks, silver/gray palette (`#FFFFFF`, `#AAAAAA`, `#555555`).
- **Health**: Phase 1: 80 HP, Phase 2: 90 HP. Total: 170 HP.
- **Score Award**: 35,000 PTS.
- **Phase 1: Cluster Form & Quad-Construct Split**:
  - Upon reaching 50% Phase 1 HP, the Colossus splits into 4 independent Mini-Constructs (Quadrant Nodes, 16x16 each).
  - The 4 nodes swoop in cross-crossing Lissajous flight curves, firing coordinated aimed bursts.
- **Phase 2: Reassembly & Nanite Gray Goo Clouds**:
  - The nodes recombine into the central Colossus.
  - Deploys 3 drifting Gray Goo Nanite Clouds across $y \in [140, 200]$.
  - Any player missile intersecting a Gray Goo Cloud is dissolved/recycled instantly, forcing the player to shoot through gaps or reposition.

### Boss 4: Stage 40 — Psionic Shroud Harbinger (장막의 사자)
- **Visual Matrix**: 38x30 eldritch psionic avatar, deep indigo wings (`#000088`), glowing magenta corona (`#FF007F`), blinding white core eye (`#FFFFFF`).
- **Health**: Phase 1: 100 HP, Phase 2: 110 HP. Total: 210 HP.
- **Score Award**: 45,000 PTS.
- **Phase 1: Illusory Phantom Clones**:
  - Projects 2 identical Illusory Phantom Clones flanking the true core.
  - The clones and core perform synchronized dive-bomb runs.
  - Shooting phantom clones triggers psionic shimmer sparks but inflicts 0 HP damage; only shooting the true core depletes boss health.
- **Phase 2: Telekinetic Stun Pulses & Psionic Barrage**:
  - Emits expanding horizontal telekinetic stun wave rings downward.
  - Crossing the wave applies a 0.4s horizontal thruster disruption to the player (`player.vx` dampened by 60%).
  - Discharges high-speed fan-shaped 5-bullet psionic needle salvos.

### Boss 5: Stage 50 — Aeternum Star-Eater Core (항성 포식자 - 파이널 레이드)
- **Visual Matrix**: 48x36 massive celestial fortress, solar golden crown (`#FFFF00`, `#FF7F00`), obsidian armor (`#000000`, `#555555`), pulsing dark matter singularity (`#9900EE`).
- **Health**: Phase 1: 4 Satellites (25 HP each) + Core Impervious; Phase 2: 120 HP; Phase 3: 80 HP. Total: 300 HP.
- **Score Award**: 100,000 PTS.
- **Phase 1: Planetary Shield Matrix & 4 Orbital Satellites**:
  - Core is enveloped in an impenetrable hexagonal energy shield (`shield = 9999`).
  - 4 Orbital Satellite Generators revolve around the Core ($R = 36\text{ px}, \omega = 1.2\text{ rad/s}$).
  - Satellites fire rotating plasma bolts. Player must destroy all 4 satellites to collapse the planetary shield.
- **Phase 2: Dark Matter Annihilation Beam Sweep**:
  - Shield collapses; singularity reactor opens.
  - Charges and fires a screen-wide dark matter annihilation beam ($w = 134\text{ px}$, spanning 60% of virtual canvas width) sweeping across the screen horizontally.
  - Player must navigate into the safe 20% side margins while dodging secondary aimed laser fire.
- **Phase 3 (Enrage Mode - Final 25% HP)**:
  - Ambient starfield inverts to red/violet alert.
  - Bullet Hell Barrage: continuous dual-stream counter-rotating spiral bullet salvos (24 bullets/cycle).
  - Desperate Swoop Ramming: Core periodically plunges downward in high-speed hyperbolic dive arcs before ascending back to top center.

---

## 5. Architectural Integration for `BossManager` & Class Hierarchy

### 5.1 File & Module Layout
```
src/
├── core/
│   └── boss/
│       ├── types.ts                     # BossType, BossPhase, IBoss, BossContext, BossStats
│       ├── BaseBoss.ts                  # Abstract Base Boss extending Enemy with multi-phase FSM
│       ├── BossFactory.ts               # Static registry mapping Stage -> Concrete Boss instance
│       ├── BossManager.ts               # Master coordinator, HUD health bar, VFX, zero-GC lifecycle
│       └── bosses/
│           ├── CyberDreadnought.ts      # Stage 10 Boss
│           ├── DimensionalLeviathan.ts  # Stage 20 Boss
│           ├── NaniteColossus.ts        # Stage 30 Boss
│           ├── PsionicHarbinger.ts      # Stage 40 Boss
│           └── AeternumCore.ts          # Stage 50 Boss
```

### 5.2 Type Definitions (`src/core/boss/types.ts`)
```typescript
export enum BossType {
  CYBER_DREADNOUGHT = 'CYBER_DREADNOUGHT',
  DIMENSIONAL_LEVIATHAN = 'DIMENSIONAL_LEVIATHAN',
  NANITE_COLOSSUS = 'NANITE_COLOSSUS',
  PSIONIC_HARBINGER = 'PSIONIC_HARBINGER',
  AETERNUM_CORE = 'AETERNUM_CORE'
}

export interface BossContext {
  game: Game;
  player: Player;
  bulletManager: BulletManager;
  soundSynth: SoundSynth;
  particleSystem: ParticleSystem;
  starfield: Starfield;
  scoreManager: ScoreManager;
  powerUpManager: PowerUpManager;
}

export interface BossPhaseConfig {
  phaseIndex: number;
  maxHealth: number;
  name: string;
}
```

### 5.3 `BaseBoss` Class Contract (`src/core/boss/BaseBoss.ts`)
```typescript
import { Enemy } from '../../entities/Enemy';
import { EnemyType, EnemyState, type EnemyDamageResult, type Rect } from '../../types';
import type { BossType, BossContext } from './types';

export abstract class BaseBoss extends Enemy {
  public abstract readonly bossType: BossType;
  public abstract readonly bossName: string;
  public abstract readonly stageNumber: number;
  public abstract readonly baseScoreAward: number;

  public currentPhase: number = 1;
  public abstract readonly maxPhases: number;
  public phaseHealth: number = 100;
  public maxPhaseHealth: number = 100;
  public isInvulnerable: boolean = false;
  public isPhaseTransitioning: boolean = false;
  public phaseTransitionTimer: number = 0;

  protected context!: BossContext;
  protected bossWidth: number = 32;
  protected bossHeight: number = 24;

  constructor() {
    super({ type: EnemyType.BOSS });
  }

  public initBoss(context: BossContext): void {
    this.context = context;
    this.currentPhase = 1;
    this.isPhaseTransitioning = false;
    this.active = true;
    this.state = EnemyState.IN_FORMATION;
    this.onInitBoss();
  }

  protected abstract onInitBoss(): void;
  public abstract updateBoss(dt: number, playerX: number, playerY: number): void;
  public abstract renderBoss(ctx: CanvasRenderingContext2D): void;
  public abstract renderOverlay(ctx: CanvasRenderingContext2D): void;

  public override getHitbox(): Rect {
    return {
      x: this.x - this.bossWidth / 2,
      y: this.y - this.bossHeight / 2,
      width: this.bossWidth,
      height: this.bossHeight,
    };
  }

  public override takeDamage(amount: number = 1): EnemyDamageResult {
    if (this.isInvulnerable || this.isPhaseTransitioning || !this.active) {
      return { destroyed: false, points: 0, wasDamaged: false, shieldAbsorbed: true };
    }
    // Phase health depletion and transition logic
    ...
  }
}
```

### 5.4 `BossManager` Coordinator Contract (`src/core/boss/BossManager.ts`)
```typescript
export class BossManager {
  private readonly game: Game;
  private currentBoss: BaseBoss | null = null;
  private isBossEncounterActive: boolean = false;

  constructor(game: Game) {
    this.game = game;
  }

  public isBossStage(stage: number): boolean {
    return DifficultyCalculator.isBossStage(stage);
  }

  public spawnBoss(stage: number): BaseBoss | null {
    if (!this.isBossStage(stage)) return null;
    const context = this.buildContext();
    const boss = BossFactory.createBoss(stage, context);
    this.currentBoss = boss;
    this.isBossEncounterActive = true;
    return boss;
  }

  public update(dt: number): void {
    if (!this.isBossEncounterActive || !this.currentBoss) return;
    this.currentBoss.updateBoss(dt, this.game.player.x, this.game.player.y);
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.isBossEncounterActive || !this.currentBoss) return;
    this.currentBoss.renderOverlay(ctx);
  }

  public renderHUD(ctx: CanvasRenderingContext2D): void {
    if (!this.isBossEncounterActive || !this.currentBoss) return;
    // Renders sleek retro boss health bar, phase badges, and boss title
  }

  public onStageClear(): void {
    if (this.currentBoss) {
      this.currentBoss.active = false;
      this.currentBoss = null;
    }
    this.isBossEncounterActive = false;
  }
}
```

---

## 6. Zero Runtime Garbage Collection Strategy

To guarantee that 60 FPS gameplay runs with zero GC pauses and $< 5\text{MB}$ net heap drift:
1. **Bullet Pool Reuse**:
   - Spiral rings and radial bursts calculate velocities using pre-computed trigonometric arrays or direct vector dispatch.
   - Bullets are acquired from `this.bulletManager.bulletPool`. When bullets hit or travel off-screen, they are returned to the pool via `recycle()`.
   - Max enemy bullet pool expanded from 128 to 256 to support Stage 50 Enrage bullet hell without allocation.
2. **Pre-allocated Sub-Units**:
   - Cyber Turrets & Drones, Nanite Nodes, Psionic Phantom Clones, and Orbital Satellites are constructed once during boss instantiation and reused via `active = true/false` flags.
3. **Pre-allocated Math & Vector Scratchpads**:
   - Reusable `Vector2D` scratch objects for projectile trajectories and suction vortex forces avoid in-loop object instantiations.
4. **Offscreen Canvas Matrix Baking**:
   - Boss sprites and animations are drawn via direct procedural 2D canvas drawing calls or pre-baked pixel matrices, with zero image loads or dynamic textures.

---

## 7. Downstream Implementation Guide & Verification Protocol

### 7.1 Action Items for Workers
1. **Types**: Add `BossType` to `src/types/index.ts` and create `src/core/boss/types.ts`.
2. **Difficulty Calculator**: Add `DifficultyCalculator.isBossStage(stage: number): boolean` for stages 10, 20, 30, 40, 50.
3. **Bullet Manager**: Add `fireEnemyBulletWithVector(...)` to `src/entities/Bullet.ts`.
4. **Boss Hierarchy**: Implement `BaseBoss.ts`, `CyberDreadnought.ts`, `DimensionalLeviathan.ts`, `NaniteColossus.ts`, `PsionicHarbinger.ts`, and `AeternumCore.ts`.
5. **Boss Factory & Manager**: Implement `BossFactory.ts` and `BossManager.ts`.
6. **Game & Formation Integration**:
   - In `FormationManager.spawnStage(stage)`: If `DifficultyCalculator.isBossStage(stage)`, populate `this.enemies` with the active boss and its sub-units.
   - In `Game.ts`: Initialize `this.bossManager = new BossManager(this);`, call `bossManager.update(dt)` and `bossManager.render(ctx)`.
   - In `Game.resolveCollisions()`: Add `if (enemy instanceof BaseBoss)` branch for boss damage handling.

### 7.2 Verification Gates
- Verify all 764 baseline tests pass: `npm test`.
- Add comprehensive boss test suite (`tests/unit/boss.test.ts`):
  - Unit tests for all 5 boss instantiations, phase transitions, and HP scaling.
  - Multi-phase trigger invariants: Stage 10 core exposure, Stage 20 suction vortex, Stage 30 node splitting, Stage 40 phantom clones, Stage 50 orbital satellites.
  - Memory leak & 10,000 tick endurance stress testing with zero uncaught exceptions.
