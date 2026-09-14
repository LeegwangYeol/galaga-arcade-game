# Technical Investigation Report: Requirement 1 (R1) 50-Round Progressive Scaling System

- **Author**: `survey_p2_explorer_1` (Stage Scaling & Formation Explorer)
- **Date**: 2026-09-03
- **Project**: Galaga Arcade Web Game (Phase 2 Expansion)
- **Target Scope**: Requirement 1 (50-Round Progressive Scaling System, Formation Layouts, Difficulty Curve, Stage Badges, Challenging Stages)

---

## 1. Executive Summary

Phase 1 established an authentic 1981 Galaga arcade base engine with procedural pixel art, Web Audio API synthesis, a 60 FPS deterministic game loop, and zero-allocation object pools. However, the existing implementation is structurally bounded to early arcade loops (stages 1–5):
1. Enemy HP is static (`ZAKO = 1`, `GOEI = 1`, `BOSS = 2`).
2. Firing speed scales linearly as `180 + stage * 15`, which at Stage 50 reaches an unplayable **930 px/s** (crossing the entire 288px canvas in 0.3s).
3. Dive intervals clamp at Stage 6 (`Math.max(1.8, ...)`) and concurrent divers clamp at 4 (`Math.min(4, ...)`), causing rounds 6–50 to feel flat and repetitive.
4. Challenging Stages (Stages 3, 7, 11, etc.) currently spawn the standard 40 enemies into stationary formation grid slots rather than executing authentic 5-wave acrobatic target-practice trajectories.

This report establishes the complete architectural blueprint for **Requirement 1 (R1)**:
- **Stateless Difficulty Curve Calculator (`DifficultyCalculator.ts`)** computing non-linear parameters across 3 distinct tiers: Classic (Stages 1–10), Elite (Stages 11–25), and Dreadnought (Stages 26–50).
- **Multi-Hit Kinetic Energy Shields & Armored Palettes** for Elite and Dreadnought variants.
- **Clamped Ballistic Scaling & Multi-Shot Dive Salvos** capping bullet speeds at a playable 320 px/s with multi-shot volleys and formation sniper fire.
- **12 Challenging Stages Scheduling & 5 Acrobatic Target Waves** ensuring zero enemy fire and clean off-screen deactivation.
- **HUD Stage Badge Verification (Stages 1–50)** with visual differentiation for `FLAG_20` and guaranteed non-overlapping layout budget.

---

## 2. Codebase Investigation & Forensic Observations

### 2.1 `src/core/Game.ts`
- **Stage Progression**: In `updateStageClear` (lines 620–631):
  ```typescript
  const clearDuration = this.isChallengingStage(this.stage) ? 2.8 : 1.8;
  if (this.stateTimer >= clearDuration) {
    this.scoreManager.advanceStage();
    this.bulletManager.clear();
    this.formationManager.spawnStage(this.stage);
    this.tractorBeam.reset();
    this.soundSynth.stopTractorBeam();
    this.setState('STAGE_INTRO');
  }
  ```
  The transition seamlessly increments `stage` via `ScoreManager.advanceStage()` and delegates spawning to `FormationManager.spawnStage(stage)`.
- **Challenging Stage Predicate**: Line 480–482:
  ```typescript
  public isChallengingStage(stageNum: number = this.stage): boolean {
    return stageNum >= 3 && stageNum % 4 === 3;
  }
  ```
  Observation: For stages 1–50, this evaluates `true` exactly for:
  `[3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47]`. Exactly 12 stages.
- **Collision Resolution Gap**: In `resolveCollisions()` (lines 680–757), damage is applied via `enemy.takeDamage(1)`. If `takeDamage` returns `destroyed: false`, it checks `enemy.type === EnemyType.BOSS` for deflection sparks. It currently assumes only Boss Galagas can survive a hit; Zako and Goei surviving 1 hit in Elite/Dreadnought tiers would trigger no visual hit feedback.

### 2.2 `src/systems/FormationManager.ts`
- **Difficulty Tuning Logic** (lines 208–209):
  ```typescript
  this.diveInterval = Math.max(1.8, 3.5 - (stage - 1) * 0.3);
  this.maxConcurrentDivers = Math.min(4, 1 + Math.floor(stage / 2));
  ```
  Observation: At Stage 6, `3.5 - 5 * 0.3 = 2.0`, and at Stage 7, it hits `1.8` clamp. `maxConcurrentDivers` hits 4 at Stage 6. For 44 of the 50 stages (Stages 7–50), difficulty parameters remain completely frozen!
- **Enemy Bullet Spawning** (line 613):
  ```typescript
  if (enemy.y > 60 && enemy.y < 220) {
    enemy.attemptFire(playerX, playerY, 180 + this.stage * 15);
  }
  ```
  Observation: Bullet velocity increases without bound. At Stage 50: `180 + 750 = 930 px/s`. At 930 px/s, a bullet traverses the entire 288px vertical canvas in 18.5 frames (309ms), resulting in unavoidable deaths.
- **Missing Challenging Stage Wave Trajectories**: `spawnStage(stage)` always populates the standard 5-row, 10-column stationary grid slots and launches the standard 5 ingress sub-waves.

### 2.3 `src/systems/FlightPathManager.ts`
- **Static Dive & Entry Velocity** (lines 31–33):
  ```typescript
  public static readonly ENTRY_SPEED = 160;  // Pixels/second
  public static readonly DIVE_SPEED = 175;   // Pixels/second
  public static readonly RETURN_SPEED = 140; // Pixels/second
  ```
  Observation: Dive paths use hardcoded speed scalars (`FlightPathManager.DIVE_SPEED * 0.9`, `1.15`, etc.). They do not accept a speed scaling multiplier parameter.

### 2.4 `src/entities/Enemy.ts`
- **Hardcoded Health** (lines 137–143):
  ```typescript
  if (type === EnemyType.BOSS) {
    this.maxHealth = 2;
    this.health = 2;
  } else {
    this.maxHealth = 1;
    this.health = 1;
  }
  ```
  Observation: No knowledge of round number or difficulty tier. No shield attributes.
- **Firing Cooldown** (line 494):
  ```typescript
  this.fireCooldownTimer = 1.5 + Math.random() * 2.0; // 1.5s - 3.5s cooldown
  ```
  Because a dive swoop lasts ~1.8–2.2s, each enemy can fire at most once per dive, preventing high-difficulty multi-shot aggression.

### 2.5 `src/ui/HUD.ts`
- **Decomposition Algorithm**: `HUD.decomposeStage(stage)` successfully breaks down stages using greedy denominations `[50, 30, 20, 10, 5, 1]`.
- **Screen Budget**: Available width on bottom-right is $216 - 96 = 120\text{ px}$.
  Maximum possible width for any stage $\le 50$ occurs at Stage 49:
  1x `FLAG_30` (8px) + 1x `FLAG_10` (7px) + 1x `FLAG_5` (5px) + 4x `FLAG_1` (16px) + 12px margins = **48 px**.
  $48\text{ px} \ll 120\text{ px}$, proving stage badges 1–50 are mathematically guaranteed not to collide with lives icons.
- **Asset Detail**: `BADGE_20_MATRIX` is currently aliased to `BADGE_30_MATRIX` (`BADGE_20_MATRIX = BADGE_30_MATRIX`).

---

## 3. Technical Design: 50-Round Progressive Scaling Engine

### 3.1 Difficulty Curve Calculator (`DifficultyCalculator.ts`)

Create `src/systems/DifficultyCalculator.ts` as a pure, deterministic mathematical calculator.

#### 3.1.1 Tier Architecture
```
Stage 1 ----------> Stage 10 | Stage 11 ---------> Stage 25 | Stage 26 ---------> Stage 50
+--------------------------+ +--------------------------+ +--------------------------+
|       CLASSIC TIER       | |        ELITE TIER        | |     DREADNOUGHT TIER     |
| - Zako: 1 HP             | | - Zako: 2 HP (+1 HP)     | | - Zako: 2 HP + 1 Shield  |
| - Goei: 1 HP             | | - Goei: 2 HP (+1 HP)     | | - Goei: 2 HP + 1 Shield  |
| - Boss: 2 HP             | | - Boss: 3 HP (+1 HP)     | | - Boss: 3 HP + 2 Shields |
| - Dive Speed: 1.0x-1.18x | | - Dive Speed: 1.2x-1.45x | | - Dive Speed: 1.48x-1.8x |
| - Diver Limit: 2-3       | | - Diver Limit: 4-5       | | - Diver Limit: 6-8       |
| - 1 Shot / Dive          | | - 2 Shots / Dive         | | - 3 Shots / Dive (Burst) |
| - Classic Palette        | | - Flashing Amber Palette | | - Void Shields & Violet  |
+--------------------------+ +--------------------------+ +--------------------------+
```

#### 3.1.2 Mathematical Formulations

1. **Dive Speed Scaling**:
   $$SpeedMultiplier(stage) = 1.0 + 0.8 \times \left( \frac{stage - 1}{49} \right)^{0.85}$$
   - Stage 1: $1.00\times$ (175 px/s)
   - Stage 10: $1.18\times$ (206 px/s)
   - Stage 25: $1.43\times$ (250 px/s)
   - Stage 40: $1.66\times$ (290 px/s)
   - Stage 50: $1.80\times$ (315 px/s)

2. **Dive Attack Interval**:
   $$Interval(stage) = \max\left(0.60, 3.50 \times e^{-0.035 \times (stage - 1)}\right)$$
   - Stage 1: 3.50s
   - Stage 10: 2.56s
   - Stage 25: 1.51s
   - Stage 40: 0.89s
   - Stage 50: 0.62s

3. **Maximum Concurrent Divers**:
   $$MaxDivers(stage) = \min\left(8, 2 + \left\lfloor \frac{stage - 1}{7} \right\rfloor\right)$$
   - Stages 1–7: 2 divers
   - Stages 8–14: 3 divers
   - Stages 15–21: 4 divers
   - Stages 22–28: 5 divers
   - Stages 29–35: 6 divers
   - Stages 36–42: 7 divers
   - Stages 43–50: 8 divers

4. **Clamped Bullet Velocity**:
   $$Speed_{bullet}(stage) = \min\left(320, 180 + 140 \times \left(\frac{stage - 1}{49}\right)^{0.75}\right)$$
   - Stage 1: 180 px/s (1.60s travel time across screen)
   - Stage 10: 216 px/s (1.33s travel time)
   - Stage 25: 263 px/s (1.09s travel time)
   - Stage 50: 320 px/s (0.90s travel time — fast, challenging, yet fully dodgeable)

5. **Salvo Capacity & Firing Cooldown**:
   - Stages 1–10: `shotsPerDive = 1`, cooldown $1.5\text{s} - 3.0\text{s}$.
   - Stages 11–25: `shotsPerDive = 2`, cooldown $0.6\text{s} - 1.2\text{s}$.
   - Stages 26–50: `shotsPerDive = 3`, cooldown $0.35\text{s} - 0.7\text{s}$.

#### 3.1.3 Interface Contract (`src/types/index.ts`)
```typescript
export type StageTier = 'CLASSIC' | 'ELITE' | 'DREADNOUGHT';

export interface StageDifficultyConfig {
  stage: number;
  tier: StageTier;
  // Health & Defense
  zakoHp: number;
  goeiHp: number;
  bossHp: number;
  shieldHp: number; // Applied to Dreadnought tier
  // Kinematics
  diveSpeedMultiplier: number; // [1.0 .. 1.8]
  entrySpeedMultiplier: number; // [1.0 .. 1.3]
  bulletSpeed: number; // [180 .. 320 px/s]
  // Aggression
  diveInterval: number; // [3.5s .. 0.6s]
  maxConcurrentDivers: number; // [2 .. 8]
  shotsPerDive: number; // 1, 2, or 3
  formationFireInterval: number; // Seconds between sniper shots from formation
  // Visuals
  paletteFlashing: boolean;
  hasShieldAura: boolean;
}
```

---

### 3.2 Enemy Entity Scaling & Kinetic Energy Shield Mechanics

#### 3.2.1 Entity Additions (`src/entities/Enemy.ts`)
Add the following properties to `Enemy`:
- `public shield: number = 0;`
- `public maxShield: number = 0;`
- `public tier: StageTier = 'CLASSIC';`
- `public shotsRemainingInDive: number = 1;`
- `public eliteFlashTimer: number = 0;`

#### 3.2.2 Damage Resolution Logic
```typescript
public takeDamage(amount: number = 1): EnemyDamageResult {
  if (!this.active || this.state === EnemyState.EXPLODING || this.state === EnemyState.INACTIVE) {
    return { destroyed: false, points: 0, wasDamaged: false };
  }

  // 1. Kinetic Shield Absorption (Dreadnought Tier)
  if (this.shield > 0) {
    this.shield = Math.max(0, this.shield - amount);
    this.damageFlashTimer = Enemy.DAMAGE_FLASH_DURATION;
    return { destroyed: false, points: 0, wasDamaged: true, shieldAbsorbed: true };
  }

  // 2. Hull Health Depletion
  this.health -= amount;
  this.damageFlashTimer = Enemy.DAMAGE_FLASH_DURATION;

  if (this.health <= 0) {
    const awardedPoints = this.getScoreValue();
    this.state = EnemyState.EXPLODING;
    this.deathTimer = Enemy.EXPLOSION_DURATION;
    // Notify escorts, tractor beam collapse, etc.
    return { destroyed: true, points: awardedPoints, wasDamaged: true };
  }

  return { destroyed: false, points: 0, wasDamaged: true };
}
```

#### 3.2.3 Procedural Rendering for Elite & Dreadnought Variants
- **Elite Tier Palettes (Stages 11–25)**:
  - Zako: Invert yellow/blue to molten amber (`#FFAA00`) and glowing cyan wing tips. When damaged (1 HP remaining), flashes rapidly at 8Hz.
  - Goei: Carapace switches to deep purple/crimson (`#9900EE` and `#E70000`).
  - Boss: Tier 3 (3 HP) renders with an imposing golden crown; takes 1 hit $\to$ standard Green (2 HP) $\to$ takes 1 hit $\to$ Blue (1 HP) $\to$ Destroyed.
- **Dreadnought Tier Kinetic Shields (Stages 26–50)**:
  - When `enemy.shield > 0`: Draw a shimmering hexagonal forcefield surrounding the 16x16 sprite.
  - Procedural Canvas Arc:
    ```typescript
    if (this.shield > 0) {
      ctx.save();
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6 + 0.35 * Math.sin(this.animTimer * 12);
      ctx.beginPath();
      ctx.arc(this.x, this.y, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ```
  - When shield collapses: Trigger `particleSystem.spawnHitSparks(enemy.x, enemy.y)` with cyan sparks and trigger audio deflection sound `soundSynth.playBossHit()`.

---

### 3.3 Firing Frequency & Aggression Scaling

1. **Multi-Shot Salvo Counter**:
   When an enemy initiates a dive (`peelOffSolo`, `peelOffPairedGoeis`, `peelOffBossEscort`):
   - Set `enemy.shotsRemainingInDive = config.shotsPerDive;`
   - Set `enemy.fireCooldownTimer = 0.4 + Math.random() * 0.3;`
2. **Dive Fire Loop**:
   During dive (`updateDiving`):
   ```typescript
   if (this.shotsRemainingInDive > 0 && this.fireCooldownTimer <= 0 && this.y > 50 && this.y < 230) {
     if (this.attemptFire(playerX, playerY, config.bulletSpeed)) {
       this.shotsRemainingInDive--;
       this.fireCooldownTimer = config.tier === 'DREADNOUGHT' ? 0.45 : 0.8;
     }
   }
   ```
3. **Formation Sniper Fire (Stages 15+)**:
   To prevent stagnant safe zones at the baseline during later rounds, `FormationManager` will execute periodic formation sniper shots:
   - Every `config.formationFireInterval` (e.g. 3.0s at Stage 15, down to 1.5s at Stage 45):
   - Pick the lowest living enemy in a column near `playerX`.
   - Fire a single downward bullet toward player coordinates.
4. **Challenging Stage Fire Ban**:
   - In `FormationManager.update()`:
     ```typescript
     if (this.isChallengingStage) {
       // STRICT INVARIANT: 0 bullets discharged in challenging stages
       return;
     }
     ```

---

### 3.4 Stage Badges Supporting Stages 1–50 (`HUD.ts`)

#### 3.4.1 Validation of Decomposition Math
`HUD.decomposeStage(stage)` decomposes stages into:
- 50: `FLAG_50`
- 30: `FLAG_30`
- 20: `FLAG_20`
- 10: `FLAG_10`
- 5: `FLAG_5`
- 1: `FLAG_1`

Mathematical breakdown table across key milestone stages:

| Stage | Badge List | Badges Count | Pixel Width | Fits in 120px Budget? |
|---|---|---|---|---|
| **1** | `[FLAG_1]` | 1 | 4 px | YES |
| **5** | `[FLAG_5]` | 1 | 5 px | YES |
| **10** | `[FLAG_10]` | 1 | 7 px | YES |
| **11** | `[FLAG_10, FLAG_1]` | 2 | 13 px | YES |
| **20** | `[FLAG_20]` | 1 | 8 px | YES |
| **25** | `[FLAG_20, FLAG_5]` | 2 | 15 px | YES |
| **30** | `[FLAG_30]` | 1 | 8 px | YES |
| **40** | `[FLAG_30, FLAG_10]` | 2 | 17 px | YES |
| **48** | `[FLAG_30, FLAG_10, FLAG_5, FLAG_1 x3]` | 6 | 42 px | YES |
| **49** | `[FLAG_30, FLAG_10, FLAG_5, FLAG_1 x4]` | 7 | 48 px | YES (Maximum width) |
| **50** | `[FLAG_50]` | 1 | 10 px | YES |

#### 3.4.2 Visual Differentiation for `FLAG_20`
Currently, `BADGE_20_MATRIX` is aliased to `BADGE_30_MATRIX`. We will define an authentic distinct matrix for `FLAG_20`:
```typescript
export const BADGE_20_MATRIX: string[][] = [
  ['Y','R','R','W','W','R','R','.'],
  ['Y','R','R','W','W','R','R','.'],
  ['Y','R','R','W','W','R','R','.'],
  ['Y','R','R','W','W','R','R','.'],
  ['Y','R','R','W','W','R','R','.'],
  ['Y','R','R','W','W','R','R','.'],
  ['Y','.','.','.','.','.','.','.']
];
```
This renders two prominent vertical stripes on the red pennant for 20, clearly distinct from the triple white bar of 30.

---

### 3.5 Challenging Stages Scheduling & Custom Acrobatic Wave Formations

#### 3.5.1 Exact Schedule
Stages: **3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47** (12 total stages).
Formula: `stage >= 3 && stage % 4 === 3 && stage <= 50`.

#### 3.5.2 Challenging Stage Wave Architecture
In contrast to standard stages where enemies settle into a formation grid, Challenging Stages operate as pure target galleries:
- **Total Enemies**: 40 ships across 5 distinct waves (8 ships per wave).
- **Wave Ingress & Stagger**:
  - Enemies within a wave are spaced by 100ms.
  - Delay between waves: 2.2s.
- **Flight Mechanics**:
  - Enemies follow composite Bézier swoop paths that traverse the screen and exit off-screen.
  - If not destroyed before reaching path end, they deactivate (`enemy.active = false`).
  - Enemies **never enter formation** and **never fire bullets**.
- **Stage Completion Condition**:
  - When all 5 waves have completed and no enemies remain on screen (`livingCount === 0`), `onStageClear()` triggers.
  - Score summary displays hits out of 40:
    - 40/40 Perfect: Fanfare audio + `SPECIAL BONUS 10000 PTS`.
    - < 40: `hits * 100` PTS.

#### 3.5.3 Five Distinct Acrobatic Flight Patterns

```
Wave 1 (Zakos): Top-Center Split Loop
   (112,-20) ---> Dive to (112, 120) ---> Loop Left/Right (R=45) ---> Swoop Down & Exit (224, 310)

Wave 2 (Goeis): Intersecting Figure-8
   (-20, 40) ---> Sweeping Cross to (200, 140) ---> Figure-8 Inversion ---> Exit (-20, 260)

Wave 3 (Zakos): Expanding Sinusoidal Spiral
   (240, 60) ---> Triple-Apex Wave across center ---> Ascend & Dive ---> Exit (112, 310)

Wave 4 (Goeis): Double Crossing Swarm
   Left & Right Wingmen swoop simultaneously from opposite top corners, criss-cross at (112, 160)

Wave 5 (Boss + Escorts): The Grand Armada
   4 Boss Galagas flanked by 4 Goeis diving in synchronized formation from top-center, loop outward,
   cross through the player zone, and spiral outward off-screen.
```

#### 3.5.4 Custom Formation Layouts for Regular Stages (Every 5 Stages)
Every 5 regular stages (e.g. Stage 5, 10, 20, 25, 35, 40, 50), the standard formation grid can adopt tactical variations:
- **Stage 5, 15, 35 (Wedge / Arrowhead Formation)**:
  Bosses lead the vanguard at Row 0 Center, Goeis flank diagonally, Zakos form sweeping outer wings.
- **Stage 10, 30, 50 (Double Boss Armada)**:
  Row 0 and Row 1 both contain Boss Galagas (8 Boss Galagas total), requiring intense focus fire to break the command structure.
- **Stage 20, 40 (Phalanx / Shield Wall)**:
  Armored Dreadnought Goeis take the front rows (Rows 3 and 4), protecting the Bosses from baseline direct shots.

---

## 4. Integration Blueprint & Exact File Changes

| File Path | Nature of Change | Lines Affected | Rationale |
|---|---|---|---|
| `src/types/index.ts` | Type Extensions | ~150, ~390 | Add `StageTier`, `StageDifficultyConfig`, shield fields to `PlayerData`/`EnemyData` |
| `src/systems/DifficultyCalculator.ts` | New Module | New (~120 lines) | Pure functional difficulty calculator for tiers, HP, speeds, intervals |
| `src/entities/Enemy.ts` | Entity Enhancement | Lines 66–94, 137–143, 251–275, 484–505 | Add `shield`, `tier`, multi-shot salvo countdown, shield damage absorption |
| `src/systems/FlightPathManager.ts` | Parameterization | Lines 30–35, 298–450 | Accept `speedMultiplier` parameter in dive & challenging path constructors |
| `src/systems/FormationManager.ts` | Orchestration | Lines 204–235, 349–374, 558–622 | Integrate `DifficultyCalculator`, Challenging Stage wave runner, formation fire |
| `src/renderer/SpriteRenderer.ts` | Visual Feedback | Lines 668–708 | Draw kinetic shield aura, elite amber/violet tints, Boss HP crown |
| `src/ui/HUD.ts` | Asset Polish | Line 149 | Distinct `BADGE_20_MATRIX` procedural definition |
| `src/core/Game.ts` | Coordination | Lines 275–285, 655–760 | Shield spark particle trigger, challenging wave clear synchronization |

---

## 5. Verification Strategy & Test Plan

1. **Unit Test Suite (`tests/unit/difficulty_scaling.test.ts`)**:
   - Verify `DifficultyCalculator.getConfig(stage)` for every stage from 1 to 50:
     - Strict monotonic non-decreasing dive speeds ($1.00\times \to 1.80\times$).
     - Strict clamping of bullet speeds between 180 and 320 px/s (zero unreactable >320 px/s bullets).
     - Accurate tier assignment: Classic (1–10), Elite (11–25), Dreadnought (26–50).
     - Accurate HP: Zako (1 $\to$ 2 $\to$ 2+1s), Goei (1 $\to$ 2 $\to$ 2+1s), Boss (2 $\to$ 3 $\to$ 3+2s).
2. **Challenging Stage Scheduler Test (`tests/unit/challenging_stages.test.ts`)**:
   - Verify `isChallengingStage(stage)` returns true ONLY for stages 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47.
   - Verify 0 enemy bullets are spawned across all 40 enemies in challenging stages.
   - Verify 40 hits award 10,000 bonus points; verify partial hits award `hits * 100`.
3. **Stage Badge Visual Bounds Test**:
   - Test `HUD.decomposeStage(stage)` for all integers $1 \le stage \le 50$, verifying width $\le 48\text{ px}$ and $x \ge 96\text{ px}$.
4. **Zero-Allocation & Memory Leak Verification**:
   - Run Vitest 50-round simulated progression checking heap stability and object pool invariants.
