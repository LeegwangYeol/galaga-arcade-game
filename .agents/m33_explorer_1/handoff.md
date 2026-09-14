# Architecture Exploration Report: Co-op Dynamic Difficulty & Boss Health Scaling Engine

**Milestone**: M33 — Co-op Balance, Dynamic Scaling & Cooperative Revive Mechanics  
**Agent**: `m33_explorer_1` (Architecture Exploration & Dynamic Scaling Engine)  
**Parent Conversation ID**: `0236827c-a7d2-4115-a374-2f5c45ed8134`  
**Target Scope**: Dynamic difficulty scaling for 2-Player Co-op mode across Boss Galaga, Stage Bosses, Wave Aggression, and Bullet Density while strictly preserving 100% single-player classic arcade behavior.

---

## 1. Observation

Direct code observations from the live codebase (`branch feature/coop-multiplayer`):

### 1.1 Boss Galaga Health Initialization & Scaling
- In `src/entities/Enemy.ts:172–179`:
  ```typescript
  } else if (type === EnemyType.BOSS) {
    this.maxHealth = 2;
    this.health = 2;
  } else {
    this.maxHealth = 1;
    this.health = 1;
  }
  ```
  By default, `EnemyType.BOSS` (Boss Galaga) initializes with 2 HP.
- In `src/systems/DifficultyCalculator.ts:143–170`:
  ```typescript
  const tier = DifficultyCalculator.getStageTier(stage);

  switch (tier) {
    case 'CLASSIC':
      if (type === EnemyType.BOSS) {
        return { health: 2, shield: 0 };
      }
      return { health: 1, shield: 0 };

    case 'ELITE':
      if (type === EnemyType.BOSS) {
        return { health: 3, shield: 0 };
      }
      if (type === EnemyType.CAPTURED_FIGHTER) {
        return { health: 1, shield: 0 };
      }
      return { health: 2, shield: 0 };

    case 'DREADNOUGHT':
      if (type === EnemyType.BOSS) {
        return { health: 3, shield: 2 };
      }
      if (type === EnemyType.CAPTURED_FIGHTER) {
        return { health: 1, shield: 0 };
      }
      return { health: 2, shield: 1 };
  }
  ```
- In `src/systems/FormationManager.ts:337–338`:
  ```typescript
  const { health, shield } = DifficultyCalculator.getEnemyHealthAndShield(stage, slot.type);
  enemy.setDifficulty(health, shield, this.stageConfig.tier, this.getEffectiveDiveSpeedMultiplier());
  ```
  FormationManager applies `health` from `DifficultyCalculator` to every spawned enemy slot.
- In `src/renderer/SpriteRenderer.ts:1829–1837`:
  ```typescript
  case EnemyType.BOSS:
    if (health >= 3) {
      spriteId = 'BOSS_ELITE';   // Imperial Golden Flagship
    } else if (health === 2) {
      spriteId = 'BOSS_HEALTHY'; // Standard Green Carapace
    } else {
      spriteId = 'BOSS_DAMAGED'; // Wounded Blue Carapace
    }
    break;
  ```
  `SpriteRenderer.drawEnemy` is already fully equipped to render Boss Galaga with `health >= 3`!

### 1.2 Stage Boss Health & Phase Transitions (Stages 10, 20, 30, 40, 50)
- In `src/core/boss/types.ts:108–154`:
  ```typescript
  export const BOSS_CONFIGS = {
    STAGE_10: { type: 'CYBER_DREADNOUGHT', maxHealth: 80, ... },
    STAGE_20: { type: 'DIMENSIONAL_LEVIATHAN', maxHealth: 120, ... },
    STAGE_30: { type: 'NANITE_COLOSSUS', maxHealth: 150, ... },
    STAGE_40: { type: 'PSIONIC_HARBINGER', maxHealth: 180, ... },
    STAGE_50: { type: 'AETERNUM_CORE', maxHealth: 300, ... },
  } as const;
  ```
- In `src/core/boss/BossFactory.ts:38–44`:
  ```typescript
  if (boss && game && game.dynamicDifficultyManager) {
    const mult = game.dynamicDifficultyManager.getBossHealthMultiplier();
    if (mult !== 1.0) {
      boss.maxHealth = Math.round(boss.maxHealth * mult);
      boss.health = boss.maxHealth;
    }
  }
  ```
- Phase Transition Thresholds in concrete boss classes:
  - `CyberDreadnought.ts:54`: `if (this.phase === 'PHASE_1' && this.health <= this.maxHealth * 0.5)`
  - `DimensionalLeviathan.ts:48`: `if (this.phase === 'PHASE_1' && this.health <= this.maxHealth * 0.5)`
  - `NaniteColossus.ts:77`: `if (this.phase === 'PHASE_1' && !this.isSplit && this.health <= this.maxHealth * 0.5)`
  - `PsionicHarbinger.ts:56`: `if (this.phase === 'PHASE_1' && this.health <= this.maxHealth * 0.5)`
  - `AeternumCore.ts:89`: `else if (this.phase === 'PHASE_2' && this.health <= Math.ceil(this.maxHealth / 3))`
  **Key Observation**: All 5 stage bosses evaluate phase transitions strictly via relative fractions (`0.5 * maxHealth` or `ceil(maxHealth / 3)`). None use hardcoded scalar HP thresholds.

### 1.3 Wave Attack Aggression & Bullet Density
- In `src/systems/DifficultyCalculator.ts:77–83`:
  ```typescript
  public static getDiveInterval(stage: number): number {
    const s = Math.max(DifficultyCalculator.MIN_STAGE, Math.min(DifficultyCalculator.MAX_STAGE, Math.floor(stage)));
    const t = (s - 1) / 49;
    const ratio = DifficultyCalculator.MIN_DIVE_INTERVAL / DifficultyCalculator.MAX_DIVE_INTERVAL;
    const raw = DifficultyCalculator.MAX_DIVE_INTERVAL * Math.pow(ratio, t);
    return Math.round(raw * 100) / 100;
  }
  ```
- In `src/systems/DifficultyCalculator.ts:94–102`:
  ```typescript
  public static getMaxConcurrentDivers(stage: number): number {
    const s = Math.max(DifficultyCalculator.MIN_STAGE, Math.min(DifficultyCalculator.MAX_STAGE, Math.floor(stage)));
    if (s <= 1) return 1;
    if (s <= 5) return 2;
    if (s <= 14) return 3;
    if (s <= 26) return 4;
    if (s <= 39) return 5;
    return 6;
  }
  ```
- In `src/systems/FormationManager.ts:664–668`:
  ```typescript
  this.diveTimer += dt;
  const effectiveDiveInterval = this.diveInterval / Math.max(0.1, this.getEffectiveBulletDensityMultiplier());
  if (this.diveTimer < effectiveDiveInterval) {
    return;
  }
  ```
- In `src/systems/FormationManager.ts:123–128`:
  ```typescript
  public getEffectiveBulletDensityMultiplier(): number {
    if (this.isChallengingStage) {
      return 1.0;
    }
    return this.dynamicDifficultyManager ? this.dynamicDifficultyManager.getBulletDensityMultiplier() : 1.0;
  }
  ```
- In `src/systems/FormationManager.ts:936–944`:
  ```typescript
  if (this.stageConfig && this.stageConfig.formationFireInterval < Infinity) {
    this.formationFireTimer += dt;
    const effectiveSniperInterval =
      this.stageConfig.formationFireInterval / Math.max(0.1, this.getEffectiveBulletDensityMultiplier());
    if (this.formationFireTimer >= effectiveSniperInterval) {
      this.formationFireTimer = 0;
      this.triggerFormationSniperShot(playerX, playerY);
    }
  }
  ```
- In `src/entities/Enemy.ts:889–896`:
  ```typescript
  if (this.tier === 'DREADNOUGHT') {
    this.fireCooldownTimer = 0.45;
  } else if (this.tier === 'ELITE') {
    this.fireCooldownTimer = 0.75;
  } else {
    this.fireCooldownTimer = 1.5 + Math.random() * 2.0; // 1.5s - 3.5s cooldown
  }
  ```

### 1.4 Co-op Mode State Detection & Current Baseline
- In `src/systems/PlayerManager.ts:74–76`:
  ```typescript
  public isCoop(): boolean {
    return this.mode === 'coop';
  }
  ```
- In `src/core/Game.ts:100–102`:
  ```typescript
  public isCoop(): boolean {
    return this.playerManager.isCoop();
  }
  ```
- Current Test Suite: 115 test files passed, 2,089 tests passed (100%), with 0 failures and 0 skipped.

---

## 2. Logic Chain

From the direct observations above, here is the step-by-step reasoning leading to the Co-op Dynamic Scaling Engine:

```
[Observation 1.1: Boss Galaga base HP = 2]
    + [Observation 1.4: game.isCoop() indicates 2P mode]
    --> Step 1: Scale Boss Galaga HP by +50% in 2P mode (2 * 1.50 = 3 HP).
        Classic: 2 -> 3 HP. Elite: 3 -> 5 HP. Dreadnought: 3 -> 5 HP (+ 2 shield).

[Observation 1.2: Stage Bosses base HP defined in BOSS_CONFIGS (80, 120, 150, 180, 300)]
    + [Observation 1.2: BossFactory multiplies HP by DDA mult]
    + [Observation 1.2: Boss phase transitions use relative health fractions (e.g. <= 0.5 * maxHealth)]
    --> Step 2: Scale Stage Boss base HP by +60% in 2P mode:
        Cyber Dreadnought: 80 -> 128 HP
        Dimensional Leviathan: 120 -> 192 HP
        Nanite Colossus: 150 -> 240 HP
        Psionic Harbinger: 180 -> 288 HP
        Aeternum Core: 300 -> 480 HP
        Phase transitions scale automatically without altering concrete boss logic!

[Observation 1.3: effectiveDiveInterval = diveInterval / effectiveBulletDensityMultiplier]
    + [Observation 1.3: effectiveSniperInterval = formationFireInterval / effectiveBulletDensityMultiplier]
    + [Observation 1.3: maxConcurrentDivers bounds simultaneous dive attacks]
    --> Step 3: Scale Attack Aggression and Bullet Density by +25%:
        Cadence multiplier = 1.25x in co-op.
        effectiveDiveInterval = diveInterval / (1.25 * DDA_density)  (25% more frequent dives)
        maxConcurrentDivers = min(8, round(base * 1.25))            (25% more simultaneous divers)
        effectiveSniperInterval = sniperInterval / (1.25 * DDA_density) (25% faster formation sniper fire)
        burst fireCooldownTimer = baseCooldown / 1.25               (25% faster burst interval)

[Observation 1.1 & 1.3: Single-player mode sets isCoop = false]
    --> Step 4: When isCoop is false, all multipliers evaluate to strictly 1.000x.
        100% bitwise and algorithmic preservation of single-player arcade statistics and difficulty.

[Observation 1.3 & 1.4: Zero memory allocations in update loops]
    --> Step 5: Multiplier calculations use static numerical constants and pre-allocated scalar math.
        Zero object or array allocations per frame, strictly maintaining Zero-GC invariant.
```

### Mathematical Scaling Formulations

#### 1. Boss Galaga Health Scaling Equation
$$\text{HP}_{\text{BossGalaga}}(\text{stage}, \text{isCoop}) = \begin{cases}
1, & \text{if isChallengingStage}(\text{stage}) \\
\text{round}\left(\text{BaseHP}(\text{stage}) \times 1.50\right), & \text{if isCoop} \\
\text{BaseHP}(\text{stage}), & \text{if Single-Player}
\end{cases}$$

| Stage Range | Tier | Single-Player HP | 2-Player Co-op HP (+50%) | Kinetic Shield |
|---|---|---|---|---|
| Stages 1–10 (excl. 3, 7) | CLASSIC | 2 HP | **3 HP** | 0 |
| Stages 11–25 (excl. bonus) | ELITE | 3 HP | **5 HP** ($\text{round}(4.5)$) | 0 |
| Stages 26–50 (excl. bonus) | DREADNOUGHT | 3 HP | **5 HP** ($\text{round}(4.5)$) | 2 (Unchanged) |
| Bonus Rounds (3, 7, 11...) | CHALLENGING | 1 HP | **1 HP** (Strict Invariant) | 0 |

#### 2. Stage Boss Health Scaling Equation
$$\text{maxHealth}_{\text{Boss}}(\text{stage}, \text{isCoop}, \sigma) = \text{round}\left(\text{ConfigMaxHealth}(\text{stage}) \times M_{\text{coop}} \times M_{\text{DDA}}(\sigma)\right)$$
Where:
- $M_{\text{coop}} = 1.60$ if `isCoop`, else $1.00$.
- $M_{\text{DDA}}(\sigma) \in [0.90, 1.25]$ from `DynamicDifficultyManager.getBossHealthMultiplier()`.

| Milestone Stage | Boss Name | Single-Player Baseline HP | 2-Player Co-op Base HP (+60%) | Co-op + DDA Range ($\sigma \in [0.0, 1.0]$) |
|---|---|---|---|---|
| Stage 10 | Cyber Dreadnought | 80 HP | **128 HP** | 115 HP – 160 HP |
| Stage 20 | Dimensional Leviathan | 120 HP | **192 HP** | 173 HP – 240 HP |
| Stage 30 | Nanite Colossus | 150 HP | **240 HP** | 216 HP – 300 HP |
| Stage 40 | Psionic Harbinger | 180 HP | **288 HP** | 259 HP – 360 HP |
| Stage 50 | Aeternum Star-Eater Core | 300 HP | **480 HP** | 432 HP – 600 HP |

*Phase Transition Invariance Proof*:
Because Cyber Dreadnought triggers Phase 2 at $\text{health} \le 0.5 \times \text{maxHealth}$, in 2P co-op the core exposes at $\text{health} \le 64$ (instead of 40). In Aeternum Core, Phase 3 enrage triggers at $\text{health} \le \text{ceil}(480 / 3) = 160$ (instead of 100). The relative phase durations remain perfectly balanced against dual-player DPS!

#### 3. Wave Attack Aggression & Bullet Density Scaling Equations
Let $M_{\text{coop\_aggression}} = 1.25$ and $M_{\text{coop\_density}} = 1.25$ when `isCoop === true` (and $1.00$ when `false`).

1. **Dive Cadence / Interval**:
   $$T_{\text{dive}} = \frac{\text{diveInterval}}{M_{\text{coop\_aggression}} \times M_{\text{DDA\_density}}}$$
   For Stage 1 baseline ($\text{diveInterval} = 3.50\text{s}$), co-op interval is $3.50 / 1.25 = 2.80\text{s}$. At Stage 50 ($\text{diveInterval} = 0.80\text{s}$), co-op interval is $0.80 / 1.25 = 0.64\text{s}$.
2. **Concurrent Divers Ceiling**:
   $$N_{\text{divers}} = \min\left(8, \text{round}\left(N_{\text{base}} \times M_{\text{coop\_aggression}}\right)\right)$$
   - Stage 1: $1 \to 1$ (or 2)
   - Stages 2–5: $2 \to 3$
   - Stages 6–14: $3 \to 4$
   - Stages 15–26: $4 \to 5$
   - Stages 27–39: $5 \to 6$
   - Stages 40–50: $6 \to 8$ (capped at 8)
3. **Formation Sniper Fire Interval**:
   $$T_{\text{sniper}} = \frac{\text{formationFireInterval}}{M_{\text{coop\_density}} \times M_{\text{DDA\_density}}}$$
   Enemies in formation fire 25% faster in co-op mode.
4. **Dive Burst Cooldown**:
   $$T_{\text{burst}} = \frac{T_{\text{base\_cooldown}}}{M_{\text{coop\_density}}}$$
   - Dreadnought: $0.45\text{s} / 1.25 = 0.36\text{s}$
   - Elite: $0.75\text{s} / 1.25 = 0.60\text{s}$

---

## 3. Caveats

1. **Challenging Stages Perfection Bonus Immunity**:
   - In all 12 Challenging stages (Stages 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47), enemies must strictly remain at **1 HP and 0 shield**, with 0 bullets fired. Scaling HP in Challenging stages would break the authentic Namco 40-hit special perfection bonus (10,000 pts). The scaling engine explicitly checks `DifficultyCalculator.isChallengingStage(stage)` and exempts bonus rounds.
2. **Stage Boss Sub-Unit Durability**:
   - Sub-units (Cyber Dreadnought turrets: 15 HP, Nanite mini-constructs: 25 HP, Aeternum satellites: 30 HP) can either remain at base HP or scale by +60%.
   - *Recommendation*: Keep sub-units at baseline HP (or moderate +30% at most). This allows the 2-player team to coordinate breaking open the outer defenses in a satisfying burst, while the core body has the massive +60% HP pool to sustain intense dogfighting.
3. **Boss Galaga Carapace Palette at 3 HP**:
   - In `SpriteRenderer.ts:1830`, `health >= 3` currently resolves to `BOSS_ELITE` (Imperial Golden Flagship).
   - In Classic Tier co-op, starting at 3 HP will display the Golden/Flashing Flagship sprite, transitioning to Green (`BOSS_HEALTHY`) at 2 HP, then Blue (`BOSS_DAMAGED`) at 1 HP. This visually signals to both players that the co-op Boss Galaga has extra armor!
4. **Targeting Nearest Living Player**:
   - In single-player, enemies aim at `(player.x, player.y)`.
   - In 2P co-op, diving enemies and sniper shots should aim at the nearest living player (evaluated via Euclidean distance) or alternate targets. This ensures both players face active combat threats rather than all bullets focusing on Player 1.
5. **Multiplicative DDA Composition**:
   - The Co-op Scaling Engine and DDA (Dynamic Difficulty Adjustment) compose multiplicatively. Because both multipliers are bounded, the maximum boss health multiplier in co-op is $1.60 \times 1.25 = 2.00\times$, and minimum is $1.60 \times 0.90 = 1.44\times$. This prevents underflow or runaway difficulty.

---

## 4. Conclusion & Concrete Code Modification Blueprint

The Co-op Dynamic Scaling Engine is designed as a zero-overhead, backward-compatible extension to `DifficultyCalculator`, `BossFactory`, and `FormationManager`.

### 4.1 Modification Points in Code

#### Modification Point 1: `src/systems/DifficultyCalculator.ts`
Add co-op scaling constants and support an optional `isCoop: boolean = false` parameter in `getEnemyHealthAndShield`:

```typescript
// Add constants at top of DifficultyCalculator
public static readonly COOP_BOSS_HP_MULT = 1.50;        // +50%
public static readonly COOP_STAGE_BOSS_HP_MULT = 1.60;  // +60%
public static readonly COOP_WAVE_AGGRESSION_MULT = 1.25;// +25%
public static readonly COOP_BULLET_DENSITY_MULT = 1.25; // +25%

/**
 * Computes base health and kinetic shield for a given enemy type, stage, and game mode.
 */
public static getEnemyHealthAndShield(
  stage: number,
  type: EnemyType,
  isCoop: boolean = false
): EnemyHealthAndShield {
  // Challenging stages always have 1 HP and 0 shield (strict invariant)
  if (DifficultyCalculator.isChallengingStage(stage)) {
    return { health: 1, shield: 0 };
  }

  const tier = DifficultyCalculator.getStageTier(stage);

  switch (tier) {
    case 'CLASSIC':
      if (type === EnemyType.BOSS) {
        return { health: isCoop ? 3 : 2, shield: 0 };
      }
      return { health: 1, shield: 0 };

    case 'ELITE':
      if (type === EnemyType.BOSS) {
        return { health: isCoop ? 5 : 3, shield: 0 };
      }
      if (type === EnemyType.CAPTURED_FIGHTER) {
        return { health: 1, shield: 0 };
      }
      return { health: 2, shield: 0 };

    case 'DREADNOUGHT':
      if (type === EnemyType.BOSS) {
        return { health: isCoop ? 5 : 3, shield: 2 };
      }
      if (type === EnemyType.CAPTURED_FIGHTER) {
        return { health: 1, shield: 0 };
      }
      return { health: 2, shield: 1 };
  }
}

/**
 * Computes co-op scaled max concurrent divers (capped at 8).
 */
public static getCoopMaxConcurrentDivers(baseDivers: number): number {
  return Math.min(8, Math.round(baseDivers * DifficultyCalculator.COOP_WAVE_AGGRESSION_MULT));
}
```

#### Modification Point 2: `src/core/boss/BossFactory.ts`
Integrate co-op mode check with $+60\%$ scaling:

```typescript
// In BossFactory.createBoss(stage: number, game: Game): BaseBoss | null
if (boss && game) {
  const isCoop = typeof game.isCoop === 'function' ? game.isCoop() : false;
  const coopMult = isCoop ? 1.60 : 1.00;
  const ddaMult = game.dynamicDifficultyManager
    ? game.dynamicDifficultyManager.getBossHealthMultiplier()
    : 1.00;
  const totalMult = coopMult * ddaMult;

  if (totalMult !== 1.0) {
    boss.maxHealth = Math.round(boss.maxHealth * totalMult);
    boss.health = boss.maxHealth;
  }
}
```

#### Modification Point 3: `src/systems/FormationManager.ts`
Wire `isCoop` callback and scale wave aggression & bullet density:

```typescript
// 1. In FormationManagerConfig interface
export interface FormationManagerConfig {
  ...
  isCoop?: boolean | (() => boolean);
}

// 2. In FormationManager class
private _isCoop: boolean | (() => boolean) = false;

public isCoop(): boolean {
  if (typeof this._isCoop === 'function') {
    return this._isCoop();
  }
  return Boolean(this._isCoop);
}

public setCoop(coop: boolean | (() => boolean)): void {
  this._isCoop = coop;
}

// 3. In getEffectiveBulletDensityMultiplier()
public getEffectiveBulletDensityMultiplier(): number {
  if (this.isChallengingStage) {
    return 1.0;
  }
  const coopMult = this.isCoop() ? 1.25 : 1.0;
  const dda = this.dynamicDifficultyManager ? this.dynamicDifficultyManager.getBulletDensityMultiplier() : 1.0;
  return coopMult * dda;
}

// 4. In spawnStage(stage: number)
const { health, shield } = DifficultyCalculator.getEnemyHealthAndShield(stage, slot.type, this.isCoop());
enemy.setDifficulty(health, shield, this.stageConfig.tier, this.getEffectiveDiveSpeedMultiplier());

this.maxConcurrentDivers = this.isCoop()
  ? DifficultyCalculator.getCoopMaxConcurrentDivers(this.stageConfig.maxConcurrentDivers)
  : this.stageConfig.maxConcurrentDivers;
```

#### Modification Point 4: `src/core/Game.ts`
Pass `isCoop: () => this.isCoop()` when constructing `FormationManager`:

```typescript
// In Game.constructor line 377
this.formationManager = new FormationManager({
  dynamicDifficultyManager: this.dynamicDifficultyManager,
  isCoop: () => this.isCoop(),
  ...
});
```

#### Modification Point 5: `src/types/index.ts`
Export `CoopScalingConfig` contract:

```typescript
export interface CoopScalingConfig {
  bossHpMultiplier: number;           // 1.50 (+50%)
  stageBossHpMultiplier: number;      // 1.60 (+60%)
  waveAggressionMultiplier: number;   // 1.25 (+25%)
  bulletDensityMultiplier: number;    // 1.25 (+25%)
}
```

---

## 5. Verification Method

### 5.1 Independent Verification Plan

1. **Unit Test Suite 1: Single-Player Baseline Invariance (Regression Safety)**
   - Run Vitest on existing difficulty and boss suites:
     ```bash
     npx vitest run tests/unit/difficulty.test.ts
     npx vitest run tests/unit/boss_core_lifecycle.test.ts
     npx vitest run tests/unit/boss_stage10_dreadnought.test.ts
     ```
   - Invalidation Condition: Any failure in the 115 baseline test files invalidates the implementation.

2. **Unit Test Suite 2: Co-op Boss Galaga Health Scaling (+50%)**
   - File: `tests/unit/coop_dynamic_scaling.test.ts`
   - Test cases:
     - `DifficultyCalculator.getEnemyHealthAndShield(1, EnemyType.BOSS, false)` returns `health: 2`.
     - `DifficultyCalculator.getEnemyHealthAndShield(1, EnemyType.BOSS, true)` returns `health: 3` (+50%).
     - `DifficultyCalculator.getEnemyHealthAndShield(15, EnemyType.BOSS, true)` returns `health: 5` (Elite).
     - `DifficultyCalculator.getEnemyHealthAndShield(30, EnemyType.BOSS, true)` returns `health: 5`, `shield: 2` (Dreadnought).
     - `DifficultyCalculator.getEnemyHealthAndShield(3, EnemyType.BOSS, true)` returns `health: 1` (Challenging Stage invariant).

3. **Unit Test Suite 3: Co-op Stage Boss Health Scaling (+60%)**
   - Test cases:
     - Stage 10 (Cyber Dreadnought): Base 80 -> Co-op 128 HP. Phase transition occurs at 64 HP.
     - Stage 20 (Dimensional Leviathan): Base 120 -> Co-op 192 HP. Phase transition occurs at 96 HP.
     - Stage 30 (Nanite Colossus): Base 150 -> Co-op 240 HP.
     - Stage 40 (Psionic Harbinger): Base 180 -> Co-op 288 HP.
     - Stage 50 (Aeternum Core): Base 300 -> Co-op 480 HP. Phase 3 enrage occurs at 160 HP.
     - Verify multiplicative composition with DDA: if $\text{DDA} = 1.10$, Stage 10 HP is $\text{round}(80 \times 1.60 \times 1.10) = 141$ HP.

4. **Unit Test Suite 4: Co-op Wave Aggression & Bullet Density (+25%)**
   - Test cases:
     - `FormationManager` with `isCoop = true` yields `effectiveBulletDensityMultiplier` scaled by $1.25\times$.
     - `effectiveDiveInterval` decreases by $1 / 1.25 = 0.80\times$ (dive frequency +25%).
     - `maxConcurrentDivers` scaled by $+25\%$ (e.g. Stage 2: 2 -> 3; Stage 40: 6 -> 8).
     - Formation sniper fire interval decreases by $1 / 1.25 = 0.80\times$ in co-op mode.

5. **Full Suite Regression & Build Audit**:
   ```bash
   npx vitest run
   npm run build
   ```
   All 115+ test files and TypeScript compilation must pass with 0 errors, 0 warnings, and 0 memory leaks.
