# Technical Architecture Report: Crisis Events (R2), Player Upgrades (R3) & Warning HUD (R4)

**Explorer**: `survey_p2_explorer_2` (Crisis & Upgrade System Explorer)  
**Date**: 2026-09-03  
**Target Codebase**: Galaga Arcade Web Game (`/Users/user/src/galog`)  
**Status**: Exploration & Architecture Specification Complete  

---

## 1. Executive Summary & Architecture Overview

The Phase 1 Galaga web arcade game represents a strictly deterministic, zero-external-asset implementation featuring 100% procedurally synthesized Web Audio API soundscapes and canvas bit-matrices, running on a 60 FPS fixed-timestep loop (`GameLoop.ts`) with zero-allocation object pools (`ObjectPool<T>`).

This architectural blueprint provides the engineering specifications for the Phase 2 expansion:
1. **Requirement 2 (R2) — Stellaris-Inspired Crisis Events**: A pluggable, extensible Factory & Strategy architecture (`src/core/crisis/`) delivering **11 unique endgame crisis events** activated post-Round 10.
2. **Requirement 3 (R3) — Player Fighter Upgrade & Power-Up System**: A zero-allocation `PowerUpManager` supporting 5 tactical player upgrade modules that drop from enemies, render via procedural pixel matrices, and integrate seamlessly with the iconic Galaga Dual Fighter docking mechanics.
3. **Requirement 4 (R4) — Crisis Warning UI & Audio HUD System**: Real-time visual warning strobes, retro hazard banners, procedural FM-synthesis klaxon sirens, and dynamic tempo modulation layered into the Web Audio API audio graph.

```
                                  +---------------------------------------+
                                  |                Game.ts                |
                                  +-------------------+-------------------+
                                                      |
                 +------------------------------------+-----------------------------------+
                 |                                    |                                   |
                 v                                    v                                   v
    +-------------------------+          +-------------------------+          +-----------------------+
    |   CrisisEventManager    |          |     PowerUpManager      |          |       HUD / UI        |
    +------------+------------+          +------------+------------+          +-----------+-----------+
                 |                                    |                                   |
                 v                                    v                                   v
    +-------------------------+          +-------------------------+          +-----------------------+
    |   CrisisEventFactory    |          |   ObjectPool<PowerUp>   |          | Crisis Warning Banner |
    |   (11 Concrete Events)  |          |   (5 Upgrade Modules)   |          | Screen Edge Strobe    |
    +-------------------------+          +-------------------------+          +-----------------------+
                 |                                    |                                   |
                 +-----------------+                  +-----------------+                 |
                                   v                                    v                 v
                        +----------------------+             +------------------------------------+
                        |  Entities & Physics  |             |      Web Audio API Synthesis       |
                        |  (Player, Enemies,   |             | (SoundSynth Klaxon, MusicJingles   |
                        |   Bullets, Starfield)|             |  Tempo & Stem Modulation)          |
                        +----------------------+             +------------------------------------+
```

---

## 2. Codebase Baseline & Integration Analysis

Detailed exploration of the existing codebase verified the following integration anchor points:

| Component | File Path | Current Role | Phase 2 Extension Point |
|---|---|---|---|
| **Master Coordinator** | `src/core/Game.ts` | State machine, updates, collisions, rendering | Holds `CrisisEventManager` & `PowerUpManager`; invokes warning/active crisis updates, resolves power-up collection in `resolveCollisions()`. |
| **Object Pool** | `src/core/ObjectPool.ts` | Contiguous dense array, swap-and-pop, zero GC | Powers `PowerUpManager` pool (`ObjectPool<PowerUpItem>`) and Crisis particle pools. |
| **Player Fighter** | `src/entities/Player.ts` | 7-state FSM, Dual Fighter docking, asymmetrical damage | Receives power-up modifiers (fire rate, spread angles, shield deflect, lateral speed boost); preserves rescue docking synergy. |
| **Bullet Subsystem** | `src/entities/Bullet.ts` | Player/Enemy projectile pool, swept CCD, quotas | Extends player quota for Rapid Fire; supports directional spread vectors (`vx, vy`) for Scatter/Triple Shot; adds homing/drift for crises. |
| **Enemy Subsystem** | `src/entities/Enemy.ts` | Enemy hierarchy (Zako, Goei, Boss), flight paths | Adds shield HP bar/barrier, drop roll hook on death (`takeDamage`), and crisis flight behavior overrides. |
| **Starfield** | `src/systems/Starfield.ts` | 3-layer parallax, speed state (NORMAL, DIVING, WARP) | Modulated by Physics Inversion (reverse flow) and Hyperspace Storm (relativistic warping). |
| **Particle System** | `src/systems/ParticleSystem.ts` | 250-capacity pool, arcade explosions & sparkles | Adds shield deflection sparks, EMP blast rings, and bio-acid micro-spores. |
| **Audio Synthesizer** | `src/audio/SoundSynth.ts` | Laser, dive, tractor beam, explosion synthesis | Adds `playCrisisKlaxon()`, `playPowerUpCollect()`, `playShieldDeflect()`, and `playEmpBlast()`. |
| **Music Jingles** | `src/audio/MusicJingles.ts` | 2-channel chiptune synthesis, pulse waves | Adds crisis combat BGM tempo modulation and alert stems. |
| **Heads-Up Display** | `src/ui/HUD.ts` | Score header, stage flags, 8x8 font pre-baking | Adds crisis alert banner, flashing hazard stripes, and active power-up duration badges. |

---

## 3. Requirement 2 (R2): Stellaris-Inspired Crisis Event Subsystem

### 3.1 Subsystem Architecture & Factory Pattern

Located in `src/core/crisis/`:
- `types.ts`: Core type contracts, interfaces, enum descriptors.
- `CrisisEventFactory.ts`: Static registry and factory instantiation.
- `CrisisEventManager.ts`: Runtime coordinator managing trigger evaluation, warning countdowns, active event lifecycles, and stage resets.
- `events/`: Directory containing 11 self-contained crisis implementations.

#### Interface Definitions (`src/core/crisis/types.ts`)
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
  game: any; // Game engine reference
  player: any;
  bulletManager: any;
  formationManager: any;
  starfield: any;
  particleSystem: any;
  soundSynth: any;
  hud: any;
  stage: number;
}

export interface ICrisisEvent {
  readonly type: CrisisEventType;
  readonly name: string;
  readonly subtitle: string;
  readonly warningDurationSec: number;
  readonly durationSec: number;
  readonly state: CrisisState;

  init(context: CrisisEventContext): void;
  startWarning(): void;
  activate(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  deactivate(): void;
  reset(): void;
  isFinished(): boolean;
}
```

#### Factory Architecture (`src/core/crisis/CrisisEventFactory.ts`)
```typescript
export type CrisisConstructor = (context: CrisisEventContext) => ICrisisEvent;

export class CrisisEventFactory {
  private static registry: Map<CrisisEventType, CrisisConstructor> = new Map();

  public static register(type: CrisisEventType, ctor: CrisisConstructor): void {
    this.registry.set(type, ctor);
  }

  public static create(type: CrisisEventType, context: CrisisEventContext): ICrisisEvent {
    const ctor = this.registry.get(type);
    if (!ctor) {
      throw new Error(`[CrisisEventFactory] Unregistered crisis type: ${type}`);
    }
    const instance = ctor(context);
    instance.init(context);
    return instance;
  }

  public static getAllTypes(): CrisisEventType[] {
    return Array.from(this.registry.keys());
  }

  public static getRandomType(exclude?: CrisisEventType): CrisisEventType {
    const types = this.getAllTypes().filter(t => t !== exclude);
    return types[Math.floor(Math.random() * types.length)] ?? CrisisEventType.THE_CONTINGENCY;
  }
}
```

### 3.2 The 11 Stellaris Crisis Event Specifications

Each crisis event provides a distinct gameplay modifier, visual signature, and audio response:

| # | Event Name | Core Gameplay Mechanics | Visual Artifacts | Audio / Acoustic Shift |
|---|---|---|---|---|
| **1** | **The Contingency** *(우발사태 — Ghost Signal)* | AI pulse glitches player fire rate (cooldown fluctuates $\pm25\%$), enemy bullets gain slight predictive homing toward player $x$. | Green digital scanline glitch overlays, matrix jitter. | Dissonant electronic buzzing + distorted chirps. |
| **2** | **The Unbidden** *(이차원 침략자 — Dimensional Tear)* | Spatial tear at top center ($x=112, y=60$); gravitational well pulls player bullets and diving alien trajectories toward the singularity. | Pulsing cyan/violet dimensional vortex beneath starfield; RGB split chromatic distortion. | Ethereal phasing drone (flanger modulated saw wave). |
| **3** | **The Prethoryn Scourge** *(생물군집 — Infestation Swarm)* | Defeated aliens burst into 2 high-speed bio-acid spores traveling downward; living enemies regenerate 1 HP after 6 seconds undamaged. | Sickly green/amber slime particles, pulsing alien carapaces. | Wet acidic sizzle and organic screeches. |
| **4** | **Shield Overload** *(에너지 과부하 — Energy Matrix Overdrive)* | All formation enemies gain a 2-hit hexagonal kinetic deflector barrier before taking hull damage. | Shimmering cyan energy barrier polygons around enemies. | High-frequency glass ping upon shield absorption. |
| **5** | **Physics Inversion** *(물리법칙 왜곡 — Singularity Shift)* | Gravity flips: starfield travels upward; enemy dives loop inverted upward; player horizontal steering exhibits inertia/drift. | Inverted starfield streaks; subtle camera drift oscillation. | Reverse-pitch dive sweeps and low-pass filtered rumble. |
| **6** | **Hyperspace Storm** *(초공간 폭풍 — Hyperlane Tempest)* | Random vertical plasma lightning strikes restrict movement lanes; enemy dive speed accelerated by $35\%$. | Electric blue lightning bolts flashing down columns; ambient strobe flashes. | Heavy thunderous broadband noise crackles. |
| **7** | **Nanite Cloud** *(나노머신 폭풍 — Gray Goo Disruption)* | Drifting micro-nanite fog occludes visibility; player missiles passing through clouds dissipate early or fragment. | Swirling silver/grey procedural noise pixel dust clusters. | Static white noise fizzle when bullets touch fog. |
| **8** | **Psionic Resonance** *(장막 침식 — Shroud Incursion)* | Hallucinatory phantom enemies mirror formation and dives; phantoms take no damage and yield 0 points; only true aliens can be killed. | Translucent violet ghost outlines (`globalAlpha: 0.5`) with shimmering ethereal glow. | Phasing chorus tone with binaural detune. |
| **9** | **Devouring Swarm Frenzy** *(군체 광란 — Hive Fleet Blitz)* | Formation breaks immediately into coordinated rapid-fire dive-bombing runs; dive interval reduced by $65\%$, speed $+25\%$. | Blood-red screen border vignette flashing synchronously with dive waves. | Accelerated frantic tempo (180 BPM) + high-pitch squeals. |
| **10** | **Nemesis Star-Eater Ignition** *(항성 포식자 점화 — Dark Matter Ignition)* | Ambient playfield darkens into deep violet void; Boss Galaga units charge and unleash sweeping vertical dark matter beam sweeps. | Deep violet vignette, blinding white/purple vertical particle beams. | Deep bass rumble (40Hz sub-sine) + laser charge whine. |
| **11** | **Time Dilation Field** *(시간 지연장 — Chrono Anomaly)* | Fluctuating temporal pulse alternating between Hyper-Speed ($1.4\times$ delta) and Bullet-Time ($0.55\times$ delta) every 3.5 seconds. | Expanding golden ripple rings from center; motion blur after-images on ships. | Pitch-shifting pitch wheel bend (+4 semitones to -7 semitones). |

### 3.3 Trigger Logic & Stage Scaling (Post-Round 10)

1. **Activation Window**: Stage $\ge 11$.
2. **Scheduling Policy**:
   - Guaranteed crisis on milestone rounds: Stage 11, 20, 25, 30, 35, 40, 45, 50.
   - Dynamic probability on intervening stages: $25\%$ random trigger check on Stage 12–19, 21–24, etc., with a minimum 1-stage cooldown between consecutive crises.
3. **Lifecycle Phases**:
   - **Phase 1: WARNING (3.0s)**: Initiates during `STAGE_INTRO` or early `PLAYING`. Triggers the Crisis Warning Banner and FM Klaxon Siren.
   - **Phase 2: ACTIVE (15s–25s or until Stage Clear)**: Mechanics and visual shaders take full effect.
   - **Phase 3: RESOLUTION**: Stage Clear or timer expiry restores baseline physics and audio stems cleanly.

---

## 4. Requirement 3 (R3): Player Fighter Upgrade & Power-Up Subsystem

### 4.1 PowerUpManager Architecture

Located in `src/core/powerups/`:
- `types.ts`: Power-up types, configs, contracts.
- `PowerUpItem.ts`: Poolable entity descending down the screen ($40\text{ px/s}$ with sinusoidal drift).
- `PowerUpManager.ts`: Object pool manager, drop calculator, collision resolver, active buff tracker.

#### PowerUp Types (`src/core/powerups/types.ts`)
```typescript
export enum PowerUpType {
  RAPID_FIRE = 'RAPID_FIRE',           // Overclock: fire rate doubled, max missiles = 4 (single) / 6 (dual)
  KINETIC_DEFLECTOR = 'KINETIC_DEFLECTOR', // Shield: energetic barrier absorbing 1 fatal hit or collision
  SCATTER_SHOT = 'SCATTER_SHOT',       // Multi-Blaster: fires 3-way spread (-15°, 0°, +15°)
  EMP_BOMB = 'EMP_BOMB',               // Screen Clear: deployable consumable clearing all bullets & stunning
  ENGINE_BOOSTER = 'ENGINE_BOOSTER',   // Hyper Drive: speed increases 260 -> 360 px/s with enhanced agility
}

export interface ActiveBuffState {
  rapidFireTimer: number;
  scatterShotTimer: number;
  engineBoosterTimer: number;
  hasShield: boolean;
  empBombCount: number;
}
```

### 4.2 Procedural Pixel Matrices (Zero External Assets)

Each power-up is represented by an authentic $8\times8$ procedural pixel matrix pre-baked in `SpriteRenderer` using the arcade palette:

```typescript
// Rapid Fire: Red/Orange Ammo Bolt
export const POWERUP_RAPID_MATRIX: string[][] = [
  ['.','.','Y','Y','.','.','.','.'],
  ['.','Y','O','O','.','.','.','.'],
  ['Y','O','O','.','.','.','.','.'],
  ['Y','Y','Y','Y','Y','Y','.','.'],
  ['.','.','.','O','O','Y','.','.'],
  ['.','.','O','O','Y','.','.','.'],
  ['.','.','O','Y','.','.','.','.'],
  ['.','.','Y','.','.','.','.','.']
];

// Kinetic Deflector: Cyan Hexagonal Energy Shield
export const POWERUP_SHIELD_MATRIX: string[][] = [
  ['.','.','C','C','C','C','.','.'],
  ['.','C','W','W','W','W','C','.'],
  ['C','W','B','B','B','B','W','C'],
  ['C','W','B','C','C','B','W','C'],
  ['C','W','B','C','C','B','W','C'],
  ['C','W','B','B','B','B','W','C'],
  ['.','C','W','W','W','W','C','.'],
  ['.','.','C','C','C','C','.','.']
];

// Scatter / Triple Shot: Green 3-Way Divergent Rays
export const POWERUP_SCATTER_MATRIX: string[][] = [
  ['G','.','.','G','.','.','G','.'],
  ['.','G','.','G','.','G','.','.'],
  ['.','G','.','G','.','G','.','.'],
  ['.','.','W','W','W','.','.','.'],
  ['.','.','W','G','W','.','.','.'],
  ['.','.','G','G','G','.','.','.'],
  ['.','.','G','G','G','.','.','.'],
  ['.','.','.','G','.','.','.','.']
];

// EMP Bomb: Yellow/Red Nuclear Spark Capsule
export const POWERUP_EMP_MATRIX: string[][] = [
  ['.','.','R','R','R','R','.','.'],
  ['.','R','Y','Y','Y','Y','R','.'],
  ['R','Y','W','R','R','W','Y','R'],
  ['R','Y','R','W','W','R','Y','R'],
  ['R','Y','R','W','W','R','Y','R'],
  ['R','Y','W','R','R','W','Y','R'],
  ['.','R','Y','Y','Y','Y','R','.'],
  ['.','.','R','R','R','R','.','.']
];

// Engine Booster: Blue/Cyan Afterburner Thrust Icon
export const POWERUP_BOOSTER_MATRIX: string[][] = [
  ['.','.','.','W','.','.','.','.'],
  ['.','.','W','B','W','.','.','.'],
  ['.','W','B','B','B','W','.','.'],
  ['W','B','B','C','B','B','W','.'],
  ['.','W','C','C','C','W','.','.'],
  ['.','.','C','Y','C','.','.','.'],
  ['.','C','Y','R','Y','C','.','.'],
  ['.','.','R','.','R','.','.','.']
];
```

### 4.3 Drop Rates & Enemy Loot Table

Drop rolls trigger upon enemy death in `resolveCollisions()`:

| Enemy Hierarchy | Base Drop Chance | Drop Distribution Weights |
|---|---|---|
| **Zako** (Tier 1) | $5\%$ | Rapid (35%), Booster (30%), Shield (20%), Scatter (10%), EMP (5%) |
| **Goei** (Tier 2) | $9\%$ | Rapid (30%), Shield (25%), Scatter (25%), Booster (15%), EMP (5%) |
| **Boss Galaga** | $30\%$ | Shield (30%), Scatter (30%), Rapid (20%), EMP (15%), Booster (5%) |
| **Crisis Elite / Mutants** | $100\%$ | Guaranteed Drop: EMP Bomb (40%) or Kinetic Deflector (60%) |

### 4.4 Dual Fighter Docking Synergy Rules

The power-up system is architected to seamlessly compound with Galaga's iconic Dual Fighter:

1. **Kinetic Deflector + Dual Fighter**:
   - The shield creates an expanded $36\text{px}\times18\text{px}$ blue energy bubble enveloping **both hulls**.
   - When a collision or bullet hits the Dual Fighter while shielded, the shield absorbs the impact completely, playing `soundSynth.playShieldDeflect()`. **Neither hull is lost!**
2. **Rapid Fire + Dual Fighter**:
   - Single fighter quota rises from 2 to 4. Dual fighter quota rises from 4 to **6 simultaneous missiles**.
   - Fire cooldown drops from $120\text{ms}$ to $60\text{ms}$, creating a catastrophic twin-cannon barrage.
3. **Scatter Shot + Dual Fighter**:
   - Single fighter fires 3 spread missiles (Left $-15^\circ$, Center $0^\circ$, Right $+15^\circ$).
   - Dual fighter fires **twin 3-way spreads** (6 total projectiles per volley), blanketing the entire screen.
4. **Engine Booster + Dual Fighter**:
   - Increases Dual Fighter horizontal agility, mitigating the double-width collision vulnerability.
5. **Capture Interaction**:
   - If a buffed player is captured by Boss Galaga's tractor beam, active temporary buff timers pause and resume upon rescue.

---

## 5. Requirement 4 (R4): Crisis Warning UI & Audio HUD System

### 5.1 Crisis HUD Warning Banner & Perimeter Strobe

Integrated into the rendering pipeline between the game world and HUD overlays:

```
+-------------------------------------------------------------+
|  1UP   24500              HIGH SCORE   89200                |  <-- Top Score Header
|                                                             |
|   ///////////////////////////////////////////////////////   |  <-- Hazard Stripe Top
|   [!] WARNING: STELLARIS CRISIS DETECTED [!]                |  <-- Red 6Hz Blink
|   EVENT: THE CONTINGENCY (GHOST SIGNAL OVERRIDE)            |  <-- Yellow 8x8 Text
|   \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\   |  <-- Hazard Stripe Bottom
|                                                             |
|                                                             |
|                                                             |
|  [Fighter] [Fighter]                       [50] [20] [5] [1]|  <-- Bottom Lives & Badges
+-------------------------------------------------------------+
 * Screen borders flash with a 4Hz red strobe vignette *
```

1. **Warning Banner Metrics**:
   - Appears at $y = 100\text{px} - 148\text{px}$ for the duration of the $3.0\text{s}$ warning phase.
   - Dual hazard stripes with alternating yellow (`#FFFF00`) and black diagonal hash marks (`/ / / /`).
   - Event title rendered via `HUD.drawText()` with centered alignment and retro pulsing scale.
2. **Perimeter Strobe Shader**:
   - Red vignette strobe rendered using canvas `createRadialGradient()` or four edge `fillRect()` bands (`globalAlpha: 0.15 - 0.45` modulated by $A = 0.3 \times (0.5 + 0.5 \sin(8\pi t))$).
3. **Active Crisis Indicator**:
   - A persistent, compact status badge appears directly beneath the score header during active crisis stages (e.g. `CRISIS: CONTINGENCY [18s]`).

### 5.2 Web Audio Procedural Klaxon Siren & Music Modulation

All sounds are synthesized in real-time with zero external audio samples via `src/audio/SoundSynth.ts`:

#### Procedural FM-Synthesis Klaxon (`SoundSynth.playCrisisKlaxon()`)
```typescript
/**
 * Procedural FM-Synthesis Crisis Klaxon Siren:
 * Carrier: 580Hz Sawtooth / Modulator: 8Hz Sine wave with 220Hz modulation index,
 * shaped through a resonant bandpass filter sweeping from 800Hz to 2400Hz.
 */
public playCrisisKlaxon(options?: SoundOptions): boolean {
  const ctx = this.audioManager.getContext();
  const sfxBus = this.audioManager.getSfxGain();
  if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

  const now = ctx.currentTime;
  const duration = 2.8; // Duration of warning cycle

  const carrier = ctx.createOscillator();
  const modulator = ctx.createOscillator();
  const modGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const mainGain = ctx.createGain();

  carrier.type = 'sawtooth';
  carrier.frequency.setValueAtTime(580, now);

  modulator.type = 'sine';
  modulator.frequency.setValueAtTime(8.0, now); // 8Hz pulsing klaxon

  modGain.gain.setValueAtTime(220, now); // 220Hz pitch deviation
  modulator.connect(carrier.frequency);

  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.exponentialRampToValueAtTime(2400, now + duration);
  filter.Q.setValueAtTime(3.5, now);

  mainGain.gain.setValueAtTime(0.001, now);
  mainGain.gain.linearRampToValueAtTime(0.35 * (options?.volume ?? 1.0), now + 0.05);
  mainGain.gain.setValueAtTime(0.35, now + duration - 0.2);
  mainGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  carrier.connect(filter);
  filter.connect(mainGain);
  mainGain.connect(sfxBus);

  modulator.start(now);
  carrier.start(now);
  modulator.stop(now + duration);
  carrier.stop(now + duration);

  return true;
}
```

#### Dynamic Combat BGM Tempo & Stem Modulation
In `MusicJingles.ts`, when an active crisis is reported:
- The base tempo scales dynamically: $\text{BPM}_{\text{crisis}} = \text{BPM}_{\text{normal}} \times 1.25$ (e.g. 150 BPM $\to$ 188 BPM).
- The bass channel track shifts down 1 octave with higher staccato gating, injecting tension and urgency without clipping or restarting playback.

---

## 6. Implementation Roadmap & Architecture Changes

The implementation will occur in dedicated milestones without impacting Phase 1 stability:

```
[M9: 50-Round Scaling] ---> [M10: Crisis Engine (R2)] ---> [M11: Power-Up System (R3)]
                                       |                               |
                                       v                               v
                             [M12: Crisis HUD & Audio (R4)] ---------> [M13/M14: Bots & Audits]
```

### Planned File Additions & Modifications

```
src/
├── core/
│   ├── Game.ts                       # Integrate CrisisEventManager & PowerUpManager
│   ├── crisis/                       # [NEW] Crisis Subsystem
│   │   ├── types.ts                  # Enums, ICrisisEvent, context
│   │   ├── CrisisEventFactory.ts     # Factory registry
│   │   ├── CrisisEventManager.ts     # Lifecycle coordinator & trigger evaluation
│   │   └── events/                   # 11 Crisis implementations
│   │       ├── TheContingency.ts
│   │       ├── TheUnbidden.ts
│   │       ├── ThePrethorynScourge.ts
│   │       ├── ShieldOverload.ts
│   │       ├── PhysicsInversion.ts
│   │       ├── HyperspaceStorm.ts
│   │       ├── NaniteCloud.ts
│   │       ├── PsionicResonance.ts
│   │       ├── DevouringSwarmFrenzy.ts
│   │       ├── NemesisStarEater.ts
│   │       └── TimeDilationField.ts
│   └── powerups/                     # [NEW] PowerUp Subsystem
│       ├── types.ts                  # PowerUpType, buff definitions
│       ├── PowerUpItem.ts            # Poolable falling item entity
│       └── PowerUpManager.ts         # Pool, drop tables, collision, buff timers
├── entities/
│   ├── Player.ts                     # Apply buffs (fire rate, spread, shield, speed)
│   ├── Bullet.ts                     # Spread vectors, quota expansions
│   └── Enemy.ts                      # Shield HP, drop roll on death
├── renderer/
│   └── SpriteRenderer.ts             # Pre-bake 5 power-up matrices & crisis icons
├── audio/
│   ├── SoundSynth.ts                 # Add playCrisisKlaxon, playShieldDeflect, etc.
│   └── MusicJingles.ts               # Add crisis tempo & stem modulation
└── ui/
    ├── HUD.ts                        # Warning banner & active buff indicators
    └── CrisisHUD.ts                  # [NEW] Hazard tape & screen edge strobe renderer
```

---

## 7. Testing & Quality Verification Plan

### 7.1 Vitest Unit & Integration Suites
1. **Crisis Factory & Registration (`crisis_factory.test.ts`)**:
   - Verifies all 11 crisis events are registered.
   - Tests instantiation, initialization with context, and clean reset.
2. **Crisis Individual Execution (`crisis_events.test.ts`)**:
   - Executes each of the 11 crises through complete lifecycle (`init` $\to$ `startWarning` $\to$ `activate` $\to$ `update` $\to$ `deactivate`).
   - Verifies specific physics/modifiers (e.g. Gravity Inversion reverses starfield speed; Contingency alters fire cooldowns; Unbidden curves bullet trajectories).
3. **PowerUp Lifecycle & Stacking (`powerup_manager.test.ts`)**:
   - Tests drop rolls across Zako, Goei, Boss Galaga.
   - Tests player collection, timer countdowns, and expiration.
   - Tests **Dual Fighter stacking**: verifies 6-bullet quota, twin 3-way spreads, and shield absorption without hull loss.
4. **Crisis Warning HUD & Audio (`crisis_hud_audio.test.ts`)**:
   - Verifies 3-second warning timer countdown and hazard banner rendering.
   - Tests Web Audio API klaxon synthesis in headless/mocked environment with zero exceptions.

### 7.2 Cheat API & Automated 50-Round E2E Bot
Exposes `window.__GALAGA_CHEAT__` in development mode for automated testing:
- `window.__GALAGA_CHEAT__.triggerCrisis(type: string)`: Triggers any of the 11 crises on demand.
- `window.__GALAGA_CHEAT__.spawnPowerUp(type: string)`: Drops a specific power-up at player position.
- `window.__GALAGA_CHEAT__.setInvincible(enable: boolean)`: Toggles god mode for 50-round stress tests.
- `window.__GALAGA_CHEAT__.skipToStage(stage: number)`: Hopping to any stage from 1 to 50.

---

## 8. Conclusion

This architecture satisfies all constraints of R2, R3, and R4 while maintaining 100% adherence to the project's zero-external-asset policy, 60 FPS zero-allocation memory pool invariants, and authentic arcade aesthetics. The subagent team is fully equipped to execute Phase 2 upon user approval.
