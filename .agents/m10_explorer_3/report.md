# Milestone 10 Technical Architecture Report: Crisis Events 7–11 & Comprehensive Testing Framework

- **Author**: `m10_explorer_3` (Role: Crisis Events 7–11 & Testing Explorer)
- **Target Working Directory**: `/Users/user/src/galog/.agents/m10_explorer_3/`
- **Project Root**: `/Users/user/src/galog`
- **Status**: Exploration & Architecture Specification Complete
- **Date**: 2026-09-03
- **Authoritative References**:
  - `/Users/user/src/galog/.agents/ORIGINAL_REQUEST.md`
  - `/Users/user/src/galog/.agents/teamwork_preview_orchestrator_2/SCOPE.md`
  - `/Users/user/src/galog/.agents/survey_p2_explorer_2/report.md`
  - `/Users/user/src/galog/.agents/survey_p2_spec_miner_3/report.md`
  - `/Users/user/src/galog/COLLABORATION.md`

---

## 1. Executive Summary & Scope Boundary

The Galaga Phase 2 expansion introduces 11 endgame Crisis Events post-Round 10 inspired by Stellaris mechanics, requiring non-linear difficulty progression, rich procedural audiovisual feedback, zero external assets, and zero runtime garbage collection.

This report delivers:
1. **Exhaustive Architectural Specifications and Complete TypeScript Reference Implementations for Crisis Events 7 through 11**:
   - **Event 7: `NaniteCloudEvent.ts`** (*Gray Tempest / Gray Goo Disruption*): Procedural drifting particle smog occluding vision; stray bullets passing through dissolve into secondary shrapnel bursts.
   - **Event 8: `PsionicResonanceEvent.ts`** (*Shroud Breach / Dimensional Mirages*): Translucent phantom illusion enemies interleaved into formation grid; real vs phantom damage arbitration (0 score, 0 hull damage, no stage clear impact).
   - **Event 9: `DevouringSwarmFrenzyEvent.ts`** (*Hive Fleet Blitz*): Instant formation dissolution into continuous, rapid dive-bomb runs (dive interval reduced to 0.25s, concurrent divers increased to 8, dive speed boosted 1.25x, pulsing blood-red vignette).
   - **Event 10: `NemesisStarEaterEvent.ts`** (*Dark Matter Ignition*): Ambient playfield darkens to deep violet; Boss Galaga units charge and fire devastating sweeping vertical and horizontal energy beams with lethal hit detection and Kinetic Shield absorption.
   - **Event 11: `TimeDilationFieldEvent.ts`** (*Chrono Anomaly*): Alternating temporal pulses between Hyper-Speed (1.5x) and Bullet-Time (0.5x) every 3.5 seconds; player control and missile speed unhindered; expanding golden chrono-ripple rings.
2. **Comprehensive Headless Testing Architecture for `tests/unit/crisis.test.ts`**:
   - Rigorous 5-phase lifecycle test suite (Registration, Warning, Activation, Mechanical Modifier, Teardown) parameterized across **all 11 crisis events**.
   - Zero memory leak and zero leftover state verification (bounded `ObjectPool` allocations, zero dangling event listeners or modifiers across 50 consecutive crisis cycles).

---

## 2. Shared Subsystem Architecture & Interface Contracts

The crisis subsystem is located under `src/core/crisis/` and adheres to the following unified contracts harmonized with `m10_explorer_1` and `m10_explorer_2`:

### 2.1 Core Types (`src/core/crisis/types.ts`)

```typescript
export enum CrisisEventType {
  THE_CONTINGENCY = 'THE_CONTINGENCY',
  THE_UNBIDDEN = 'THE_UNBIDDEN',
  THE_PRETHORYN_SCOURGE = 'THE_PRETHORYN_SCOURGE',
  SHIELD_OVERLOAD = 'SHIELD_OVERLOAD',
  PHYSICS_INVERSION = 'PHYSICS_INVERSION',
  HYPERSPACE_STORM = 'HYPERSPACE_STORM',
  NANITE_CLOUD = 'NANITE_CLOUD',
  PSIONIC_RESONANCE = 'PSIONIC_RESONANCE',
  DEVOURING_SWARM_FRENZY = 'DEVOURING_SWARM_FRENZY',
  NEMESIS_STAR_EATER = 'NEMESIS_STAR_EATER',
  TIME_DILATION_FIELD = 'TIME_DILATION_FIELD',
}

export type CrisisState = 'IDLE' | 'WARNING' | 'ACTIVE' | 'COOLDOWN' | 'COMPLETED';

export interface CrisisEventContext {
  game: any;
  player: any;
  bulletManager: any;
  formationManager: any;
  starfield: any;
  particleSystem: any;
  soundSynth?: any;
  scoreManager?: any;
  stage: number;
}

export interface ICrisisEvent {
  readonly type: CrisisEventType;
  readonly name: string;
  readonly flavorText: string;
  readonly warningDuration: number;
  readonly activeDuration: number;
  readonly state: CrisisState;

  init(context: CrisisEventContext): void;
  onWarningStart(): void;
  onActivate(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  onDeactivate(): void;
  reset(): void;
  isComplete(): boolean;

  // Ergonomic compatibility aliases
  startWarning?(): void;
  activate?(): void;
  deactivate?(): void;
  isFinished?(): boolean;
}
```

### 2.2 Base Crisis Event Abstract Class (`src/core/crisis/events/BaseCrisisEvent.ts`)

To eliminate boilerplate across all 11 event implementations and guarantee strict lifecycle safety:

```typescript
import { CrisisEventType, CrisisState, type CrisisEventContext, type ICrisisEvent } from '../types';

export abstract class BaseCrisisEvent implements ICrisisEvent {
  public abstract readonly type: CrisisEventType;
  public abstract readonly name: string;
  public abstract readonly flavorText: string;
  public abstract readonly warningDuration: number;
  public abstract readonly activeDuration: number;

  public state: CrisisState = 'IDLE';
  public elapsedTime: number = 0;
  public warningTimer: number = 0;
  protected context!: CrisisEventContext;

  public init(context: CrisisEventContext): void {
    this.context = context;
    this.state = 'IDLE';
    this.elapsedTime = 0;
    this.warningTimer = 0;
    this.onInit();
  }

  public onWarningStart(): void {
    this.state = 'WARNING';
    this.warningTimer = 0;
    this.onWarningStarted();
  }

  public onActivate(): void {
    this.state = 'ACTIVE';
    this.elapsedTime = 0;
    this.onActivated();
  }

  public update(dt: number): void {
    if (this.state === 'WARNING') {
      this.warningTimer += dt;
      this.onWarningUpdate(dt);
      if (this.warningTimer >= this.warningDuration) {
        this.onActivate();
      }
      return;
    }

    if (this.state === 'ACTIVE') {
      this.elapsedTime += dt;
      this.onActiveUpdate(dt);
      if (this.activeDuration > 0 && this.elapsedTime >= this.activeDuration) {
        this.onDeactivate();
      }
    }
  }

  public abstract render(ctx: CanvasRenderingContext2D): void;

  public onDeactivate(): void {
    if (this.state === 'COMPLETED') return;
    this.onDeactivated();
    this.state = 'COMPLETED';
  }

  public reset(): void {
    this.onDeactivate();
    this.state = 'IDLE';
    this.elapsedTime = 0;
    this.warningTimer = 0;
    this.onReset();
  }

  public isComplete(): boolean {
    return this.state === 'COMPLETED';
  }

  // Interoperability aliases
  public startWarning(): void { this.onWarningStart(); }
  public activate(): void { this.onActivate(); }
  public deactivate(): void { this.onDeactivate(); }
  public isFinished(): boolean { return this.isComplete(); }

  // Subclass extension hooks
  protected virtual onInit(): void {}
  protected virtual onWarningStarted(): void {}
  protected virtual onWarningUpdate(_dt: number): void {}
  protected virtual onActivated(): void {}
  protected abstract onActiveUpdate(dt: number): void;
  protected virtual onDeactivated(): void {}
  protected virtual onReset(): void {}
}
```

---

## 3. Concrete Specifications for Crisis Events 7 through 11

### 3.1 Event 7: `NaniteCloudEvent.ts` (Gray Goo Disruption)

#### 3.1.1 Thematic Lore & Gameplay Philosophy
In Stellaris lore, the **Gray Tempest** consists of uncontrollable, self-replicating nanite swarms that blanket star systems, forming dense smog-like clouds that dismantle incoming projectiles at the atomic level. In Galaga, this manifests as swirling grey/silver particle smog floating across the upper-middle playfield. Bullets passing through these clusters are eaten away and dissolve into harmless or secondary metal shrapnel, preventing easy vertical projectile spam.

#### 3.1.2 Mathematical Specifications & Kinematics
- **Cloud Cluster Formation**:
  - Exactly 4 procedural nanite clusters are simulated with bounded radii:
    $$\text{Cluster } i: \quad \vec{C}_i(t) = \left( x_{0,i} + v_{x,i} t + A_i \sin(\omega_i t + \phi_i), \; y_{0,i} + v_{y,i} t + B_i \cos(\omega_i t) \right)$$
  - Radii: $r_{x,i} \in [34, 44]\text{ px}$, $r_{y,i} \in [18, 26]\text{ px}$.
  - Bounds clamping: Clouds softly reverse horizontal velocity upon reaching screen edges ($x \in [16, 208]$) and oscillate vertically within $y \in [45, 180]$.
- **Elliptical Bullet Dissolution Test**:
  - For any active player bullet at position $(x_b, y_b)$, the normalized elliptical distance $D_i$ to cloud $i$ is:
    $$D_i = \frac{(x_b - C_{x,i})^2}{r_{x,i}^2} + \frac{(y_b - C_{y,i})^2}{r_{y,i}^2}$$
  - If $D_i \le 1.0$, the bullet has penetrated the nanite cloud.
  - **Dissolution Probability & Mechanics**:
    - If $D_i \le 0.70$ (deep cloud core), the bullet dissolves instantly.
    - If $0.70 < D_i \le 1.0$ (cloud boundary), the bullet dissolves after $0.06\text{s}$ exposure.
    - Upon dissolution:
      1. Recycled via `bulletManager.recycle(bullet)`.
      2. Emits 4–6 secondary micro-shrapnel sparks radiating at angles $\theta_k = \frac{2\pi k}{N} + \delta$ with speed $v_s \in [60, 110]\text{ px/s}$ and lifespan $0.20\text{s}$.
      3. Invokes `soundSynth?.playLaserFire?.({ pitch: 1.8, volume: 0.2 })` or noise hiss.

#### 3.1.3 Complete TypeScript Reference Implementation
```typescript
import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType } from '../types';

interface NaniteCluster {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  rx: number;
  ry: number;
  vx: number;
  vy: number;
  wobbleSpeed: number;
  wobblePhase: number;
}

interface NaniteShrapnel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

export class NaniteCloudEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.NANITE_CLOUD;
  public readonly name = 'NANITE CLOUD';
  public readonly flavorText = 'GRAY TEMPEST: NANITE SMOG OCCLUDING PLAYFIELD';
  public readonly warningDuration = 3.0;
  public readonly activeDuration = 25.0;

  private clusters: NaniteCluster[] = [];
  private shrapnelPool: NaniteShrapnel[] = [];
  private static readonly MAX_SHRAPNEL = 32;

  protected onInit(): void {
    this.clusters = [
      { x: 50, y: 75, baseX: 50, baseY: 75, rx: 38, ry: 22, vx: 12, vy: 2, wobbleSpeed: 1.2, wobblePhase: 0 },
      { x: 165, y: 95, baseX: 165, baseY: 95, rx: 42, ry: 25, vx: -14, vy: -2, wobbleSpeed: 0.9, wobblePhase: 1.5 },
      { x: 80, y: 140, baseX: 80, baseY: 140, rx: 36, ry: 20, vx: 15, vy: 3, wobbleSpeed: 1.4, wobblePhase: 3.1 },
      { x: 145, y: 175, baseX: 145, baseY: 175, rx: 40, ry: 24, vx: -11, vy: -1, wobbleSpeed: 1.1, wobblePhase: 4.5 },
    ];
    this.shrapnelPool = [];
    for (let i = 0; i < NaniteCloudEvent.MAX_SHRAPNEL; i++) {
      this.shrapnelPool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 1, maxLife: 0.25, color: '#CBD5E1' });
    }
  }

  protected onActiveUpdate(dt: number): void {
    // 1. Update cloud clusters
    for (const c of this.clusters) {
      c.wobblePhase += c.wobbleSpeed * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt + Math.sin(c.wobblePhase) * 4 * dt;

      // Soft bounce on margins
      if (c.x - c.rx < 10) { c.x = 10 + c.rx; c.vx = Math.abs(c.vx); }
      if (c.x + c.rx > 214) { c.x = 214 - c.rx; c.vx = -Math.abs(c.vx); }
      if (c.y - c.ry < 40) { c.y = 40 + c.ry; c.vy = Math.abs(c.vy); }
      if (c.y + c.ry > 195) { c.y = 195 - c.ry; c.vy = -Math.abs(c.vy); }
    }

    // 2. Dissolve player bullets passing through clouds
    if (this.context.bulletManager) {
      const bulletsToRecycle: any[] = [];
      this.context.bulletManager.forEachPlayerBullet?.((bullet: any) => {
        if (!bullet.active) return;
        const bx = bullet.position.x;
        const by = bullet.position.y;

        for (const c of this.clusters) {
          const dx = bx - c.x;
          const dy = by - c.y;
          const distNorm = (dx * dx) / (c.rx * c.rx) + (dy * dy) / (c.ry * c.ry);

          if (distNorm <= 1.0) {
            bulletsToRecycle.push(bullet);
            this.spawnShrapnel(bx, by);
            break;
          }
        }
      });

      for (const b of bulletsToRecycle) {
        this.context.bulletManager.recycle(b);
      }
    }

    // 3. Update shrapnel particles
    for (const s of this.shrapnelPool) {
      if (s.life < s.maxLife) {
        s.life += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
    }
  }

  private spawnShrapnel(x: number, y: number): void {
    const colors = ['#F8FAFC', '#E2E8F0', '#94A3B8', '#64748B'];
    const sparkCount = 4;
    for (let i = 0; i < sparkCount; i++) {
      const spark = this.shrapnelPool.find(s => s.life >= s.maxLife);
      if (!spark) break;
      const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.5;
      const speed = 70 + Math.random() * 40;
      spark.x = x;
      spark.y = y;
      spark.vx = Math.cos(angle) * speed;
      spark.vy = Math.sin(angle) * speed;
      spark.life = 0;
      spark.maxLife = 0.20 + Math.random() * 0.10;
      spark.color = colors[i % colors.length];
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE' && this.state !== 'WARNING') return;

    ctx.save();
    // Render drifting nanite cloud ellipses
    for (const c of this.clusters) {
      // Outer stippled haze
      ctx.fillStyle = 'rgba(71, 85, 105, 0.32)';
      ctx.beginPath();
      ctx.ellipse(Math.floor(c.x), Math.floor(c.y), Math.floor(c.rx), Math.floor(c.ry), 0, 0, Math.PI * 2);
      ctx.fill();

      // Inner dense nanite core
      ctx.fillStyle = 'rgba(148, 163, 184, 0.48)';
      ctx.beginPath();
      ctx.ellipse(Math.floor(c.x), Math.floor(c.y), Math.floor(c.rx * 0.65), Math.floor(c.ry * 0.65), 0, 0, Math.PI * 2);
      ctx.fill();

      // Nanite active motes (stippling)
      ctx.fillStyle = '#F1F5F9';
      for (let j = 0; j < 5; j++) {
        const px = c.x + (Math.sin(c.wobblePhase + j * 1.3) * c.rx * 0.5);
        const py = c.y + (Math.cos(c.wobblePhase + j * 1.7) * c.ry * 0.5);
        ctx.fillRect(Math.floor(px), Math.floor(py), 1, 1);
      }
    }

    // Render shrapnel sparks
    for (const s of this.shrapnelPool) {
      if (s.life < s.maxLife) {
        const alpha = Math.max(0, 1.0 - s.life / s.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1);
      }
    }
    ctx.restore();
  }

  protected onDeactivated(): void {
    for (const s of this.shrapnelPool) {
      s.life = s.maxLife;
    }
  }

  protected onReset(): void {
    this.onInit();
  }
}
```

---

### 3.2 Event 8: `PsionicResonanceEvent.ts` (Shroud Breach)

#### 3.2.1 Thematic Lore & Gameplay Philosophy
The Shroud is an alternate psychic dimension from Stellaris. When a Shroud breach occurs, psionic mirages of enemy fighters manifest alongside living ones. These phantoms mirror formation breathing and perform diving runs. However, being incorporeal, **phantoms take no hull damage, award 0 score, and do not contribute to stage clear progress**. Shooting them causes them to disperse into violet astral dust.

#### 3.2.2 Mathematical Specifications & Mechanics
- **Phantom Instantiation**:
  - Generates 6–8 `PhantomEnemy` instances in formation slots unoccupied by living enemies.
  - Sways synchronously with `FormationManager.SWAY_AMPLITUDE` and `EXPAND_AMPLITUDE`.
- **Dive Execution**:
  - Every $2.5\text{s}$, 1 phantom is chosen to dive along a parabolic flight curve:
    $$x_p(t) = x_{\text{slot}} + 40 \sin(3.5 t), \quad y_p(t) = y_{\text{start}} + 150 t$$
  - When reaching $y > 290$, loops back to formation or despawns.
- **Real vs Phantom Collision Matrix**:
  | Interaction | Target: Real Enemy | Target: Phantom Enemy |
  |---|---|---|
  | Player Bullet Hit | Decrements HP/Shield, triggers explosion, awards score | Bullet recycled, phantom dissipates, **0 score, 0 stats** |
  | Player Ship Collision | Lethal (player destroyed unless shielded) | **Non-lethal** (phantom dispels, player unharmed) |
  | Stage Clear Evaluation | Counted in `livingCount` | **Ignored** (`livingCount` strictly tracks real enemies) |

#### 3.2.3 Complete TypeScript Reference Implementation
```typescript
import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType, EnemyType } from '../types';

export interface PhantomUnit {
  id: string;
  type: EnemyType;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  state: 'FORMATION' | 'DIVING' | 'DISSIPATING';
  diveTimer: number;
  alpha: number;
  active: boolean;
}

export class PsionicResonanceEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.PSIONIC_RESONANCE;
  public readonly name = 'PSIONIC RESONANCE';
  public readonly flavorText = 'SHROUD BREACH: DIMENSIONAL PHANTOMS MANIFEST';
  public readonly warningDuration = 3.0;
  public readonly activeDuration = 25.0;

  public phantoms: PhantomUnit[] = [];
  private diveIntervalTimer: number = 0;

  protected onActivated(): void {
    this.phantoms = [];
    const types = [EnemyType.ZAKO, EnemyType.GOEI, EnemyType.BOSS];

    // Spawn 6 phantoms positioned in auxiliary slots
    for (let i = 0; i < 6; i++) {
      const col = 2 + (i % 6);
      const row = 1 + Math.floor(i / 3);
      const homeX = 112 + (col - 4.5) * 16;
      const homeY = 52 + row * 16;

      this.phantoms.push({
        id: `phantom_${i}`,
        type: types[i % types.length],
        x: homeX,
        y: homeY,
        homeX,
        homeY,
        vx: 0,
        vy: 0,
        state: 'FORMATION',
        diveTimer: 0,
        alpha: 0.45,
        active: true,
      });
    }
  }

  protected onActiveUpdate(dt: number): void {
    this.diveIntervalTimer += dt;

    // Trigger periodic phantom dive
    if (this.diveIntervalTimer >= 2.6) {
      this.diveIntervalTimer = 0;
      const readyPhantom = this.phantoms.find(p => p.active && p.state === 'FORMATION');
      if (readyPhantom) {
        readyPhantom.state = 'DIVING';
        readyPhantom.vy = 135;
      }
    }

    // Update phantoms
    for (const p of this.phantoms) {
      if (!p.active) continue;

      if (p.state === 'FORMATION') {
        const breathingOffset = this.context.formationManager?.elapsedTime ?? this.elapsedTime;
        p.x = p.homeX + Math.sin(breathingOffset * 2.0) * 8;
        p.y = p.homeY;
      } else if (p.state === 'DIVING') {
        p.diveTimer += dt;
        p.x += Math.sin(p.diveTimer * 4.0) * 45 * dt;
        p.y += p.vy * dt;

        if (p.y > 295) {
          p.state = 'FORMATION';
          p.x = p.homeX;
          p.y = p.homeY;
          p.diveTimer = 0;
        }
      }
    }

    // Check bullet collisions with phantoms (0 score, bullet consumed)
    if (this.context.bulletManager) {
      const bulletsToRecycle: any[] = [];

      this.context.bulletManager.forEachPlayerBullet?.((bullet: any) => {
        if (!bullet.active) return;
        const bx = bullet.position.x;
        const by = bullet.position.y;

        for (const p of this.phantoms) {
          if (!p.active) continue;
          if (Math.abs(bx - p.x) <= 8 && Math.abs(by - p.y) <= 8) {
            bulletsToRecycle.push(bullet);
            p.active = false; // Phantom dispels with 0 score!
            this.context.particleSystem?.spawnExplosion?.(p.x, p.y, 'HIT');
            break;
          }
        }
      });

      for (const b of bulletsToRecycle) {
        this.context.bulletManager.recycle(b);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE') return;

    ctx.save();
    for (const p of this.phantoms) {
      if (!p.active) continue;

      ctx.globalAlpha = p.alpha + Math.sin(this.elapsedTime * 6.0) * 0.15;
      // Draw ethereal violet phantom outline
      ctx.strokeStyle = '#C084FC';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(Math.floor(p.x - 7), Math.floor(p.y - 7), 14, 14);

      // Draw phantom core glyph
      ctx.fillStyle = '#E879F9';
      ctx.fillRect(Math.floor(p.x - 4), Math.floor(p.y - 4), 8, 8);
    }
    ctx.restore();
  }

  protected onDeactivated(): void {
    this.phantoms = [];
  }

  protected onReset(): void {
    this.phantoms = [];
    this.diveIntervalTimer = 0;
  }
}
```

---

### 3.3 Event 9: `DevouringSwarmFrenzyEvent.ts` (Hive Fleet Blitz)

#### 3.3.1 Thematic Lore & Gameplay Philosophy
The **Devouring Swarm** is an all-consuming biological hive mind. When the frenzy triggers, all tactical cohesion is abandoned in favor of an overwhelming swarm blitz. Formation idling ceases: all living formation aliens break out and dive continuously in coordinated, relentless waves.

#### 3.3.2 Mechanical Overclocking & Parameter Restoration
- **Saved Baseline State**:
  $$\text{savedDiveInterval} = \text{formationManager.diveInterval}$$
  $$\text{savedMaxDivers} = \text{formationManager.maxConcurrentDivers}$$
  $$\text{savedDiveSpeedMult} = \text{formationManager.diveSpeedMultiplier}$$
- **Overclocked Values**:
  - $\text{diveInterval} = 0.25\text{s}$ (down from $1.5\text{s} - 3.0\text{s}$)
  - $\text{maxConcurrentDivers} = 8$ (maximum screen pressure)
  - $\text{diveSpeedMultiplier} = \text{savedDiveSpeedMult} \times 1.25$
- **Immediate Breakout Hook**:
  - In `onActivated()`, iterates `formationManager.getLivingEnemies()` and immediately commands any enemy in `EnemyState.IN_FORMATION` to peel off into a solo dive via `formationManager.peelOffSolo(enemy, player.x)`.
- **Visuals**:
  - Blood-red screen border vignette flashing at $4\text{Hz}$ ($A = 0.25 + 0.20 \sin(8\pi t)$ in `#DC2626`).
- **Teardown Contract**:
  - Must strictly restore `diveInterval`, `maxConcurrentDivers`, and `diveSpeedMultiplier` to baseline upon deactivation!

#### 3.3.3 Complete TypeScript Reference Implementation
```typescript
import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType } from '../types';

export class DevouringSwarmFrenzyEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.DEVOURING_SWARM_FRENZY;
  public readonly name = 'DEVOURING SWARM FRENZY';
  public readonly flavorText = 'HIVE FLEET BLITZ: FORMATION ABANDONED, CONTINUOUS DIVE-BOMBING';
  public readonly warningDuration = 3.0;
  public readonly activeDuration = 20.0;

  private savedDiveInterval: number = 3.0;
  private savedMaxDivers: number = 2;
  private savedDiveSpeedMult: number = 1.0;

  protected onActivated(): void {
    const fm = this.context.formationManager;
    if (!fm) return;

    // 1. Save original difficulty parameters
    this.savedDiveInterval = fm.diveInterval;
    this.savedMaxDivers = fm.maxConcurrentDivers;
    this.savedDiveSpeedMult = fm.diveSpeedMultiplier;

    // 2. Overclock dive scheduler
    fm.diveInterval = 0.25;
    fm.maxConcurrentDivers = 8;
    fm.diveSpeedMultiplier = this.savedDiveSpeedMult * 1.25;

    // 3. Immediately peel off living formation enemies
    const playerX = this.context.player?.x ?? 112;
    const living = fm.getLivingEnemies?.() ?? [];
    for (const enemy of living) {
      if (enemy.state === 'IN_FORMATION') {
        fm.peelOffSolo?.(enemy, playerX);
      }
    }
  }

  protected onActiveUpdate(_dt: number): void {
    const fm = this.context.formationManager;
    if (!fm) return;

    // Continuously enforce dive saturation
    if (fm.diveInterval > 0.3) {
      fm.diveInterval = 0.25;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE') return;

    // Pulsing blood-red perimeter vignette
    ctx.save();
    const pulse = 0.22 + 0.18 * Math.sin(this.elapsedTime * 8 * Math.PI);
    ctx.fillStyle = `rgba(220, 38, 38, ${pulse})`;

    const borderThick = 3;
    ctx.fillRect(0, 0, 224, borderThick); // Top
    ctx.fillRect(0, 288 - borderThick, 224, borderThick); // Bottom
    ctx.fillRect(0, 0, borderThick, 288); // Left
    ctx.fillRect(224 - borderThick, 0, borderThick, 288); // Right
    ctx.restore();
  }

  protected onDeactivated(): void {
    const fm = this.context.formationManager;
    if (!fm) return;

    // Strictly restore baseline parameters
    fm.diveInterval = this.savedDiveInterval;
    fm.maxConcurrentDivers = this.savedMaxDivers;
    fm.diveSpeedMultiplier = this.savedDiveSpeedMult;
  }

  protected onReset(): void {
    this.onDeactivated();
  }
}
```

---

### 3.4 Event 10: `NemesisStarEaterEvent.ts` (Dark Matter Ignition)

#### 3.4.1 Thematic Lore & Gameplay Philosophy
In Stellaris, a player who chooses to **Become the Crisis** constructs the Aetherophasic Engine and unleashes **Star-Eaters** to harvest dark matter. In Galaga, the void ignites into a terrifying deep violet hue (`#0F051D`). Surviving Boss Galagas enter a focused charging stance and unleash sweeping vertical and horizontal dark matter beam sweeps across the playfield.

#### 3.4.2 Mathematical Specifications & Hazard Mechanics
- **Ambient Darkness Overlay**:
  $$\text{Canvas overlay: } \text{rgba}(15, 5, 29, 0.42) \quad \text{across } (0, 0, 224, 288)$$
- **Boss Galaga Beam Attack Cycle**:
  - Repeat cycle duration: $T_{\text{cycle}} = 4.5\text{s}$.
  - **Phase 1: Charge (1.2s)**:
    - Focuses on Boss Galaga position $(x_{\text{boss}}, y_{\text{boss}})$.
    - Draws thin tracking laser reticle (width 2px, white/cyan).
  - **Phase 2: Fire (1.5s)**:
    - Vertical beam sweep: width $W = 18\text{ px}$, spanning height $288\text{ px}$, sweeping laterally:
      $$x_{\text{beam}}(t) = x_{\text{target}} + 35 \sin(2\pi \cdot 0.8 \cdot t)$$
    - Player collision test: Swept AABB intersection with `player.x, player.y`.
    - **Lethality**:
      - If player possesses active Kinetic Shield: Shield absorbs the beam, plays deflection SFX, triggers 1.0s invulnerability, and breaks without player death!
      - If player is unshielded and not in god mode: Player is destroyed (`player.destroy()`).

#### 3.4.3 Complete TypeScript Reference Implementation
```typescript
import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType } from '../types';

export class NemesisStarEaterEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.NEMESIS_STAR_EATER;
  public readonly name = 'NEMESIS STAR-EATER';
  public readonly flavorText = 'DARK MATTER IGNITION: BOSS GALAGA BEAM CANNON CHARGING';
  public readonly warningDuration = 3.0;
  public readonly activeDuration = 25.0;

  public beamState: 'IDLE' | 'CHARGING' | 'FIRING' = 'IDLE';
  public beamTimer: number = 0;
  public beamX: number = 112;
  public beamWidth: number = 18;

  protected onActivated(): void {
    this.beamState = 'IDLE';
    this.beamTimer = 0;
    this.beamX = 112;
  }

  protected onActiveUpdate(dt: number): void {
    this.beamTimer += dt;

    if (this.beamState === 'IDLE') {
      if (this.beamTimer >= 1.5) {
        this.beamState = 'CHARGING';
        this.beamTimer = 0;
        this.beamX = this.context.player?.x ?? 112;
      }
    } else if (this.beamState === 'CHARGING') {
      if (this.beamTimer >= 1.2) {
        this.beamState = 'FIRING';
        this.beamTimer = 0;
      }
    } else if (this.beamState === 'FIRING') {
      // Horizontal beam sweep
      this.beamX += Math.sin(this.beamTimer * 4.0) * 40 * dt;

      // Check collision against player
      const player = this.context.player;
      if (player && player.state !== 'destroyed') {
        const halfWidth = this.beamWidth / 2;
        const playerLeft = player.x - 8;
        const playerRight = player.x + 8;

        if (playerRight >= this.beamX - halfWidth && playerLeft <= this.beamX + halfWidth) {
          if (player.hasShield || player.shieldHits > 0) {
            // Shield absorbs the beam
            player.shieldHits = 0;
            player.hasShield = false;
            player.invulnerableTimer = 1.0;
            this.context.particleSystem?.spawnExplosion?.(player.x, player.y, 'HIT');
          } else if (!player.isInvincible?.() && player.invulnerableTimer <= 0) {
            player.destroy?.();
          }
        }
      }

      if (this.beamTimer >= 1.5) {
        this.beamState = 'IDLE';
        this.beamTimer = 0;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE') return;

    ctx.save();
    // 1. Ambient dark matter void tint
    ctx.fillStyle = 'rgba(15, 5, 29, 0.40)';
    ctx.fillRect(0, 0, 224, 288);

    // 2. Beam Charge or Fire rendering
    if (this.beamState === 'CHARGING') {
      const chargeAlpha = 0.3 + Math.sin(this.beamTimer * 16.0) * 0.3;
      ctx.fillStyle = `rgba(192, 132, 252, ${chargeAlpha})`;
      ctx.fillRect(Math.floor(this.beamX - 1), 0, 2, 288);
    } else if (this.beamState === 'FIRING') {
      const halfW = this.beamWidth / 2;
      // Outer purple glow
      ctx.fillStyle = 'rgba(126, 34, 206, 0.45)';
      ctx.fillRect(Math.floor(this.beamX - halfW - 4), 0, this.beamWidth + 8, 288);

      // Core beam
      ctx.fillStyle = '#A855F7';
      ctx.fillRect(Math.floor(this.beamX - halfW), 0, this.beamWidth, 288);

      // Searing center ray
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(Math.floor(this.beamX - 2), 0, 4, 288);
    }
    ctx.restore();
  }

  protected onDeactivated(): void {
    this.beamState = 'IDLE';
    this.beamTimer = 0;
  }

  protected onReset(): void {
    this.onDeactivated();
  }
}
```

---

### 3.5 Event 11: `TimeDilationFieldEvent.ts` (Chrono Anomaly)

#### 3.5.1 Thematic Lore & Gameplay Philosophy
Inspired by **The Worm in Waiting** and temporal loop anomalies (*"What was, will be; what will be, was"*), the Time Dilation Field distorts the local flow of spacetime. The field oscillates between **Hyper-Speed Rush ($1.5\times$)** and **Bullet-Time Slow-Motion ($0.5\times$)** every $3.5\text{s}$. The player's steering speed ($260\text{ px/s}$) and projectile speed ($480\text{ px/s}$) remain crisp and unaffected, delivering tactical windows of bullet-time evasion contrasted against thrilling hyper-speed blitzes.

#### 3.5.2 Mathematical Specifications & Invariants
- **Temporal Phase Oscillation**:
  $$\text{Phase}(t) = \begin{cases} 
  \text{HYPER\_SPEED } (\tau_{\text{target}} = 1.5) & \text{if } (t \pmod 7.0) < 3.5 \\
  \text{BULLET\_TIME } (\tau_{\text{target}} = 0.5) & \text{if } (t \pmod 7.0) \ge 3.5 
  \end{cases}$$
- **Continuous Smoothing**:
  $$\tau(t + \Delta t) = \tau(t) + (\tau_{\text{target}} - \tau(t)) \cdot \min(1.0, 4.0 \cdot \Delta t)$$
- **Strict Invariant**:
  $$\tau(t) \in [0.45, 1.55], \quad \Delta t_{\text{enemy}} = \Delta t \cdot \tau(t) > 0 \quad \forall t$$
- **Chrono Ripple Wave Equation**:
  $$R_{\text{ripple}}(t) = 2 + 160 \cdot \left( \frac{t_{\text{phase}}}{3.5} \right), \quad \text{Center: } (112, 144)$$

#### 3.5.3 Complete TypeScript Reference Implementation
```typescript
import { BaseCrisisEvent } from './BaseCrisisEvent';
import { CrisisEventType } from '../types';

export class TimeDilationFieldEvent extends BaseCrisisEvent {
  public readonly type = CrisisEventType.TIME_DILATION_FIELD;
  public readonly name = 'TIME DILATION FIELD';
  public readonly flavorText = 'CHRONO ANOMALY: OSCILLATING TEMPORAL PULSE';
  public readonly warningDuration = 3.0;
  public readonly activeDuration = 24.0;

  public currentScale: number = 1.0;
  public targetScale: number = 1.5;
  public phase: 'HYPER_SPEED' | 'BULLET_TIME' = 'HYPER_SPEED';
  public phaseTimer: number = 0;
  public static readonly PHASE_DURATION = 3.5;

  protected onActivated(): void {
    this.phase = 'HYPER_SPEED';
    this.currentScale = 1.0;
    this.targetScale = 1.5;
    this.phaseTimer = 0;
  }

  protected onActiveUpdate(dt: number): void {
    this.phaseTimer += dt;

    // Switch phases every 3.5 seconds
    if (this.phaseTimer >= TimeDilationFieldEvent.PHASE_DURATION) {
      this.phaseTimer = 0;
      if (this.phase === 'HYPER_SPEED') {
        this.phase = 'BULLET_TIME';
        this.targetScale = 0.5;
      } else {
        this.phase = 'HYPER_SPEED';
        this.targetScale = 1.5;
      }
    }

    // Smooth interpolation of time scale
    this.currentScale += (this.targetScale - this.currentScale) * Math.min(1.0, 4.0 * dt);

    // Apply speed scale to formation and starfield
    const fm = this.context.formationManager;
    if (fm) {
      fm.diveSpeedMultiplier = this.currentScale;
    }

    const sf = this.context.starfield;
    if (sf) {
      sf.speedMultiplier = this.currentScale;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'ACTIVE') return;

    ctx.save();
    // Expanding golden chrono ripple ring
    const progress = this.phaseTimer / TimeDilationFieldEvent.PHASE_DURATION;
    const radius = 10 + progress * 140;
    const alpha = Math.max(0, 0.45 * (1.0 - progress));

    ctx.strokeStyle = this.phase === 'HYPER_SPEED' ? `rgba(245, 158, 11, ${alpha})` : `rgba(56, 189, 248, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(112, 144, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  protected onDeactivated(): void {
    this.currentScale = 1.0;
    this.targetScale = 1.0;

    const fm = this.context.formationManager;
    if (fm) {
      fm.diveSpeedMultiplier = 1.0;
    }

    const sf = this.context.starfield;
    if (sf) {
      sf.speedMultiplier = 1.0;
    }
  }

  protected onReset(): void {
    this.onDeactivated();
    this.phaseTimer = 0;
  }
}
```

---

## 4. Comprehensive Testing Architecture for `tests/unit/crisis.test.ts`

### 4.1 Testing Philosophy & Architectural Principles
1. **Zero External DOM/Audio Dependencies**: Leverages existing headless mocks in `Game.ts` and pure TypeScript math in entities.
2. **5-Phase Lifecycle Verification**: Every single one of the 11 events is verified against the 5 contractual stages:
   - **Phase 1: Registration**: Exists in factory registry with valid enum type.
   - **Phase 2: Warning**: Enters `'WARNING'` state, counts down `warningDuration`.
   - **Phase 3: Activation**: Enters `'ACTIVE'` state, initializes modifiers.
   - **Phase 4: Mechanical Modifier**: Confirms unique gameplay math and physics in action.
   - **Phase 5: Teardown & Cleanliness**: Enters `'COMPLETED'`, restores all modified engine properties to pre-event baselines.
3. **Hermetic Pool & Memory Leak Prevention**: Verifies zero orphaned objects in `bulletPool`, `particlePool`, and zero permanent coordinate/velocity drift across 50 consecutive crisis runs.

### 4.2 Complete `tests/unit/crisis.test.ts` Source Code Specification

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CrisisEventFactory } from '../../src/core/crisis/CrisisEventFactory';
import { CrisisEventType, type CrisisEventContext } from '../../src/core/crisis/types';
import { Player } from '../../src/entities/Player';
import { BulletManager } from '../../src/entities/Bullet';
import { FormationManager } from '../../src/systems/FormationManager';
import { Starfield } from '../../src/systems/Starfield';
import { ParticleSystem } from '../../src/systems/ParticleSystem';
import { DifficultyCalculator } from '../../src/systems/DifficultyCalculator';

// Concrete Event Imports
import { NaniteCloudEvent } from '../../src/core/crisis/events/NaniteCloudEvent';
import { PsionicResonanceEvent } from '../../src/core/crisis/events/PsionicResonanceEvent';
import { DevouringSwarmFrenzyEvent } from '../../src/core/crisis/events/DevouringSwarmFrenzyEvent';
import { NemesisStarEaterEvent } from '../../src/core/crisis/events/NemesisStarEaterEvent';
import { TimeDilationFieldEvent } from '../../src/core/crisis/events/TimeDilationFieldEvent';

function createMockContext(overrides: Partial<CrisisEventContext> = {}): CrisisEventContext {
  const player = new Player();
  const bulletManager = new BulletManager();
  const formationManager = new FormationManager();
  const starfield = new Starfield();
  const particleSystem = new ParticleSystem();

  return {
    game: { state: 'PLAYING' },
    player,
    bulletManager,
    formationManager,
    starfield,
    particleSystem,
    soundSynth: {
      playCrisisKlaxon: vi.fn(),
      playLaserFire: vi.fn(),
    },
    scoreManager: {
      score: 0,
      addScore: vi.fn(),
    },
    stage: 12,
    ...overrides,
  };
}

function createMockCanvasContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    ellipse: vi.fn(),
    createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
    globalAlpha: 1.0,
    fillStyle: '#FFFFFF',
    strokeStyle: '#FFFFFF',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe('Milestone 10: Stellaris Crisis Events & Testing Architecture (`tests/unit/crisis.test.ts`)', () => {
  let context: CrisisEventContext;
  let mockCtx: CanvasRenderingContext2D;

  beforeEach(() => {
    context = createMockContext();
    mockCtx = createMockCanvasContext();
  });

  // ==========================================================================
  // Suite 1: Factory Registration & Enumeration of all 11 Events
  // ==========================================================================
  describe('Suite 1: CrisisEventFactory Registration & Verification', () => {
    const allExpectedTypes: CrisisEventType[] = [
      CrisisEventType.THE_CONTINGENCY,
      CrisisEventType.THE_UNBIDDEN,
      CrisisEventType.THE_PRETHORYN_SCOURGE,
      CrisisEventType.SHIELD_OVERLOAD,
      CrisisEventType.PHYSICS_INVERSION,
      CrisisEventType.HYPERSPACE_STORM,
      CrisisEventType.NANITE_CLOUD,
      CrisisEventType.PSIONIC_RESONANCE,
      CrisisEventType.DEVOURING_SWARM_FRENZY,
      CrisisEventType.NEMESIS_STAR_EATER,
      CrisisEventType.TIME_DILATION_FIELD,
    ];

    it('registers exactly 11 distinct crisis events in CrisisEventFactory', () => {
      const registeredTypes = CrisisEventFactory.getAllTypes();
      for (const expected of allExpectedTypes) {
        expect(registeredTypes).toContain(expected);
      }
      expect(registeredTypes.length).toBe(11);
    });

    it('instantiates each of the 11 events with valid metadata and IDLE state', () => {
      for (const type of allExpectedTypes) {
        const event = CrisisEventFactory.create(type, context);
        expect(event.type).toBe(type);
        expect(event.name.length).toBeGreaterThan(0);
        expect(event.flavorText.length).toBeGreaterThan(0);
        expect(event.warningDuration).toBeGreaterThanOrEqual(2.0);
        expect(event.activeDuration).toBeGreaterThanOrEqual(10.0);
        expect(event.state).toBe('IDLE');
      }
    });
  });

  // ==========================================================================
  // Suite 2: 5-Phase Lifecycle Verification Across all 11 Events
  // ==========================================================================
  describe('Suite 2: 5-Phase Lifecycle Contract Verification', () => {
    const allTypes = CrisisEventFactory.getAllTypes();

    allTypes.forEach((type) => {
      describe(`Lifecycle for ${type}`, () => {
        it('executes Phase 1 (Init) -> Phase 2 (Warning) -> Phase 3 (Active) -> Phase 4 (Update/Render) -> Phase 5 (Teardown)', () => {
          const event = CrisisEventFactory.create(type, context);

          // Phase 1: Init
          expect(event.state).toBe('IDLE');

          // Phase 2: Warning
          event.onWarningStart();
          expect(event.state).toBe('WARNING');
          event.update(event.warningDuration * 0.5);
          expect(event.state).toBe('WARNING');
          event.update(event.warningDuration * 0.6);
          // Auto-transitions to ACTIVE upon warning expiry
          expect(event.state).toBe('ACTIVE');

          // Phase 3 & 4: Active Update and Render
          event.update(0.016);
          expect(() => event.render(mockCtx)).not.toThrow();

          // Phase 5: Teardown
          event.onDeactivate();
          expect(event.state).toBe('COMPLETED');
          expect(event.isComplete()).toBe(true);

          // Reset returns to IDLE
          event.reset();
          expect(event.state).toBe('IDLE');
        });
      });
    });
  });

  // ==========================================================================
  // Suite 3: Crisis Event 7 (NaniteCloudEvent) Deep Mechanical Verification
  // ==========================================================================
  describe('Suite 3: Crisis 7 — NaniteCloudEvent', () => {
    let event: NaniteCloudEvent;

    beforeEach(() => {
      event = new NaniteCloudEvent();
      event.init(context);
      event.onActivate();
    });

    it('dissolves player bullets that enter a nanite cloud cluster', () => {
      // Fire bullet directly inside Cluster 0 (x: 50, y: 75)
      context.bulletManager.firePlayerBullet(50, 75);
      expect(context.bulletManager.getPlayerBulletCount()).toBe(1);

      // Update event to detect collision and dissolve bullet
      event.update(0.016);
      expect(context.bulletManager.getPlayerBulletCount()).toBe(0);
    });

    it('leaves player bullets outside nanite clouds unharmed', () => {
      // Fire bullet in clear lane (x: 200, y: 240)
      context.bulletManager.firePlayerBullet(200, 240);
      expect(context.bulletManager.getPlayerBulletCount()).toBe(1);

      event.update(0.016);
      expect(context.bulletManager.getPlayerBulletCount()).toBe(1);
    });

    it('cleans up all shrapnel and cloud state on deactivation', () => {
      event.onDeactivate();
      expect(event.state).toBe('COMPLETED');
    });
  });

  // ==========================================================================
  // Suite 4: Crisis Event 8 (PsionicResonanceEvent) Deep Mechanical Verification
  // ==========================================================================
  describe('Suite 4: Crisis 8 — PsionicResonanceEvent', () => {
    let event: PsionicResonanceEvent;

    beforeEach(() => {
      event = new PsionicResonanceEvent();
      event.init(context);
      event.onActivate();
    });

    it('interleaves 6 phantom units into formation', () => {
      expect(event.phantoms.length).toBe(6);
      expect(event.phantoms.every((p) => p.active)).toBe(true);
    });

    it('awards 0 points and preserves living enemy count when a phantom is destroyed', () => {
      const initialLivingCount = context.formationManager.getLivingCount();
      const initialScore = context.scoreManager.score;
      const targetPhantom = event.phantoms[0];

      // Fire bullet directly at phantom
      context.bulletManager.firePlayerBullet(targetPhantom.x, targetPhantom.y);
      expect(context.bulletManager.getPlayerBulletCount()).toBe(1);

      event.update(0.016);

      // Phantom dispelled, bullet consumed, 0 score awarded, real count untouched
      expect(targetPhantom.active).toBe(false);
      expect(context.bulletManager.getPlayerBulletCount()).toBe(0);
      expect(context.scoreManager.score).toBe(initialScore);
      expect(context.formationManager.getLivingCount()).toBe(initialLivingCount);
    });
  });

  // ==========================================================================
  // Suite 5: Crisis Event 9 (DevouringSwarmFrenzyEvent) Deep Mechanical Verification
  // ==========================================================================
  describe('Suite 5: Crisis 9 — DevouringSwarmFrenzyEvent', () => {
    let event: DevouringSwarmFrenzyEvent;

    beforeEach(() => {
      context.formationManager.spawnStage(12);
      event = new DevouringSwarmFrenzyEvent();
      event.init(context);
    });

    it('overclocks dive interval, diver concurrency, and dive speed on activation', () => {
      const originalInterval = context.formationManager.diveInterval;
      const originalDivers = context.formationManager.maxConcurrentDivers;
      const originalSpeed = context.formationManager.diveSpeedMultiplier;

      event.onActivate();

      expect(context.formationManager.diveInterval).toBe(0.25);
      expect(context.formationManager.maxConcurrentDivers).toBe(8);
      expect(context.formationManager.diveSpeedMultiplier).toBeCloseTo(originalSpeed * 1.25, 2);

      // Teardown restores baseline parameters strictly
      event.onDeactivate();
      expect(context.formationManager.diveInterval).toBe(originalInterval);
      expect(context.formationManager.maxConcurrentDivers).toBe(originalDivers);
      expect(context.formationManager.diveSpeedMultiplier).toBe(originalSpeed);
    });
  });

  // ==========================================================================
  // Suite 6: Crisis Event 10 (NemesisStarEaterEvent) Deep Mechanical Verification
  // ==========================================================================
  describe('Suite 6: Crisis 10 — NemesisStarEaterEvent', () => {
    let event: NemesisStarEaterEvent;

    beforeEach(() => {
      event = new NemesisStarEaterEvent();
      event.init(context);
      event.onActivate();
    });

    it('progresses through IDLE -> CHARGING -> FIRING sequence', () => {
      expect(event.beamState).toBe('IDLE');
      event.update(1.6);
      expect(event.beamState).toBe('CHARGING');
      event.update(1.3);
      expect(event.beamState).toBe('FIRING');
    });

    it('destroys unshielded player caught in beam path', () => {
      event.beamState = 'FIRING';
      event.beamX = 112;
      context.player.x = 112;
      context.player.destroy = vi.fn();

      event.update(0.016);
      expect(context.player.destroy).toHaveBeenCalled();
    });

    it('absorbs beam without death when player has active kinetic shield', () => {
      event.beamState = 'FIRING';
      event.beamX = 112;
      context.player.x = 112;
      context.player.hasShield = true;
      context.player.shieldHits = 1;
      context.player.destroy = vi.fn();

      event.update(0.016);
      expect(context.player.shieldHits).toBe(0);
      expect(context.player.hasShield).toBe(false);
      expect(context.player.destroy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Suite 7: Crisis Event 11 (TimeDilationFieldEvent) Deep Mechanical Verification
  // ==========================================================================
  describe('Suite 7: Crisis 11 — TimeDilationFieldEvent', () => {
    let event: TimeDilationFieldEvent;

    beforeEach(() => {
      event = new TimeDilationFieldEvent();
      event.init(context);
      event.onActivate();
    });

    it('alternates between HYPER_SPEED (1.5x) and BULLET_TIME (0.5x)', () => {
      expect(event.phase).toBe('HYPER_SPEED');
      event.update(1.0);
      expect(event.currentScale).toBeGreaterThan(1.2);

      // Advance past 3.5s
      event.update(3.0);
      expect(event.phase).toBe('BULLET_TIME');
      event.update(1.0);
      expect(event.currentScale).toBeLessThan(0.8);
    });

    it('restores time scale to 1.0 on deactivation', () => {
      event.update(1.0);
      event.onDeactivate();
      expect(event.currentScale).toBe(1.0);
      expect(context.formationManager.diveSpeedMultiplier).toBe(1.0);
      expect(context.starfield.speedMultiplier).toBe(1.0);
    });
  });

  // ==========================================================================
  // Suite 8: Zero Memory Leak & Rapid Lifecycle Churn Endurance
  // ==========================================================================
  describe('Suite 8: Zero Memory Leak & Churn Invariant', () => {
    it('survives 50 rapid sequential crisis cycles with 0 pool growth and 0 leftover state', () => {
      const initialCapacity = context.bulletManager.getBulletPool?.().getCapacity?.() ?? 32;

      for (let i = 0; i < 50; i++) {
        const type = CrisisEventFactory.getRandomType();
        const event = CrisisEventFactory.create(type, context);
        event.onWarningStart();
        event.update(0.1);
        event.onActivate();
        event.update(0.5);
        event.render(mockCtx);
        event.onDeactivate();
        event.reset();
      }

      // Assert zero leaks
      expect(context.bulletManager.getPlayerBulletCount()).toBe(0);
      expect(context.bulletManager.getEnemyBulletCount()).toBe(0);
      expect(context.particleSystem.getActiveCount()).toBe(0);
      expect(context.formationManager.diveInterval).toBeGreaterThan(0);
      expect(context.starfield.speedMultiplier).toBe(1.0);
    });
  });
});
```

---

## 5. Implementation Roadmap & File Placement

When the worker agents implement Milestone 10, the files will be created in this exact layout:

```
src/core/crisis/
├── types.ts                         # Enums, ICrisisEvent, CrisisEventContext (m10_explorer_1)
├── CrisisEventFactory.ts            # Factory registration & creation (m10_explorer_1)
├── CrisisEventManager.ts            # Stage 10+ trigger coordinator (m10_explorer_1)
└── events/
    ├── BaseCrisisEvent.ts           # Abstract base class with template lifecycle
    ├── TheContingencyEvent.ts       # Event 1 (m10_explorer_2)
    ├── TheUnbiddenEvent.ts          # Event 2 (m10_explorer_2)
    ├── ThePrethorynScourgeEvent.ts  # Event 3 (m10_explorer_2)
    ├── ShieldOverloadEvent.ts       # Event 4 (m10_explorer_2)
    ├── PhysicsInversionEvent.ts     # Event 5 (m10_explorer_2)
    ├── HyperspaceStormEvent.ts      # Event 6 (m10_explorer_2)
    ├── NaniteCloudEvent.ts          # Event 7 (m10_explorer_3 spec)
    ├── PsionicResonanceEvent.ts     # Event 8 (m10_explorer_3 spec)
    ├── DevouringSwarmFrenzyEvent.ts # Event 9 (m10_explorer_3 spec)
    ├── NemesisStarEaterEvent.ts     # Event 10 (m10_explorer_3 spec)
    └── TimeDilationFieldEvent.ts    # Event 11 (m10_explorer_3 spec)

tests/unit/
└── crisis.test.ts                   # Comprehensive 11-event unit test suite
```

---

## 6. Reviewer & Auditor Verification Checklist

The future reviewer/auditor (`m10_reviewer_1`, `m10_auditor_1`) can verify the implementation against these criteria:
- [ ] `npm run typecheck` passes with zero compiler errors.
- [ ] All 11 crisis events are registered in `CrisisEventFactory`.
- [ ] `tests/unit/crisis.test.ts` passes with 100% success rate across all 8 suites.
- [ ] Bullets entering `NaniteCloud` dissolve into shrapnel; bullets outside pass freely.
- [ ] Phantoms in `PsionicResonance` yield 0 score, 0 damage, and don't count toward stage clear.
- [ ] `DevouringSwarmFrenzy` drops dive interval to 0.25s and strictly restores it on teardown.
- [ ] `NemesisStarEater` beam kills unshielded player, breaks shield safely, and clears on exit.
- [ ] `TimeDilationField` oscillates between 1.5x and 0.5x while keeping player input crisp.
- [ ] 50 consecutive crisis cycles produce zero object pool leaks and zero leftover state.
