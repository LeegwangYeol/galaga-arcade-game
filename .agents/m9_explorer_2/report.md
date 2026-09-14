# Milestone 9 Technical Investigation Report: Enemy Tiers, Kinetic Shields & Procedural Visual Palettes

- **Author**: `m9_explorer_2` (Role: Enemy Tiers & Shield Explorer)
- **Date**: 2026-09-03
- **Project**: Galaga Arcade Web Game (Phase 2 Expansion)
- **Scope**: Milestone 9 — Enemy Tiers, Kinetic Shields, Procedural Visual Palettes, and HUD Stage Badge 20 Enhancement

---

## 1. Executive Summary

In the Phase 1 base game, enemy units were constrained to authentic 1981 base values:
- Zako: 1 HP, fixed Yellow/Blue palette.
- Goei: 1 HP, fixed Red/Yellow palette.
- Boss Galaga: 2 HP, Green (healthy) -> Blue (damaged).
- Zero shields, zero tier mechanics, and `BADGE_20_MATRIX` was aliased directly to `BADGE_30_MATRIX`.

Furthermore, forensic inspection revealed that `damageFlashTimer` (declared as 80ms in `src/entities/Enemy.ts:68`) was updated every frame but **never rendered** by `SpriteRenderer.ts`, leaving hit feedback incomplete.

This technical report delivers the complete architectural specification for Milestone 9 (F15 & F17):
1. **Tiered Defense Architecture in `src/entities/Enemy.ts`**:
   - Discrete tiers: `CLASSIC` (Stages 1–10), `ELITE` (Stages 11–25, +1 HP), and `DREADNOUGHT` (Stages 26–50, multi-hit kinetic shields).
   - Upgraded `takeDamage(amount: number)` with shield absorption priority, overflow damage handling, and rich `EnemyDamageResult` contract (`shieldAbsorbed`, `remainingShield`, `remainingHealth`).
   - Dedicated `shieldFlashTimer` and active wiring of `damageFlashTimer`.
2. **Procedural Pixel Art & GPU-Accelerated Offscreen Shaders in `src/renderer/SpriteRenderer.ts`**:
   - Deterministic palette remapping utility (`remapMatrixColors`) creating `ELITE_ZAKO`, `ELITE_GOEI`, and `BOSS_ELITE` (3 HP golden command flagship).
   - High-throughput procedural 80ms white damage flash bit-matrices pre-baked at startup (`createFlashMatrix`).
   - Rotating hexagonal/circular dual-layer kinetic shield aura with reactive impact flash and orbital energy nodes.
3. **Dedicated `FLAG_20` Badge Matrix in `src/ui/HUD.ts`**:
   - Replaced aliased `BADGE_20_MATRIX = BADGE_30_MATRIX` with an authentic 8x12 dual-stripe red pennant matrix, visually distinct from 10 and 30 while guaranteeing zero HUD overlap.
4. **Zero-GC & Memory Safety Invariants**:
   - All animations and shield paths execute with 0 heap allocations per frame, preserving Vitest/Playwright memory leak test invariants.

---

## 2. Forensic Codebase Observations & Gap Analysis

### 2.1 `src/entities/Enemy.ts`
- **Lines 66–70**: Health and flash properties:
  ```typescript
  public maxHealth: number = 1;
  public health: number = 1;
  public damageFlashTimer: number = 0;
  public deathTimer: number = 0;
  ```
  *Gap*: No representation of `tier`, `shield`, `maxShield`, or `shieldFlashTimer`.
- **Lines 136–144 (`init`) & Lines 179–181 (`reset`)**:
  Health is hardcoded based solely on `EnemyType.BOSS`:
  ```typescript
  if (type === EnemyType.BOSS) {
    this.maxHealth = 2;
    this.health = 2;
  } else {
    this.maxHealth = 1;
    this.health = 1;
  }
  ```
  *Gap*: No hook for stage tier scaling or external HP/shield injection from `DifficultyCalculator`.
- **Lines 251–275 (`takeDamage`)**:
  ```typescript
  public takeDamage(amount: number = 1): EnemyDamageResult {
    if (!this.active || this.state === EnemyState.EXPLODING || this.state === EnemyState.INACTIVE) {
      return { destroyed: false, points: 0, wasDamaged: false };
    }
    this.health -= amount;
    this.damageFlashTimer = Enemy.DAMAGE_FLASH_DURATION;
    ...
  ```
  *Gap*: Does not account for shields. Bullet immediately subtracts hull health.
- **Lines 542–551 (`render`)**:
  ```typescript
  SpriteRenderer.drawEnemy(
    ctx,
    this.type,
    this.x,
    this.y,
    this.animFrame,
    this.health,
    this.rotation
  );
  ```
  *Gap*: Neither `this.damageFlashTimer`, `this.shield`, `this.tier`, nor `this.animTimer` are forwarded to the renderer.

### 2.2 `src/renderer/SpriteRenderer.ts`
- **Lines 670–708 (`drawEnemy`)**:
  Sprite ID selection only handles standard types and Boss healthy (2 HP) vs damaged (1 HP):
  ```typescript
  case EnemyType.BOSS:
    spriteId = health > 1 ? 'BOSS_HEALTHY' : 'BOSS_DAMAGED';
    break;
  ```
  *Gap*: No sprite IDs or palette shifts for Elite Zako/Goei or 3 HP Boss Galaga. No shield aura drawing.
- **Offscreen Canvas Pre-Baking Pipeline**:
  `SpriteRenderer.definitions` and `SpriteRenderer.cache` pre-render frames at startup with zero runtime GC. Adding new sprite definitions conforms 100% to this architecture.

### 2.3 `src/ui/HUD.ts`
- **Line 149**:
  ```typescript
  export const BADGE_20_MATRIX: string[][] = BADGE_30_MATRIX;
  ```
  *Gap*: `BADGE_20_MATRIX` is literally the exact same object reference as `BADGE_30_MATRIX`. A player reaching Stage 20 sees the triple-stripe badge instead of the arcade-authentic double-stripe badge.

### 2.4 `src/core/Game.ts`
- **Lines 748–757 (`resolveCollisions`)**:
  ```typescript
  // Case C: Standard Enemies (Zako, Goei, Transform)
  else {
    const isDiving = enemy.state === EnemyState.DIVING_SOLO || enemy.state === EnemyState.DIVING_ESCORT;
    const damageResult = enemy.takeDamage(1);
    if (damageResult.destroyed) {
      this.soundSynth.playExplosion('small');
      this.particleSystem.spawnSmallAlienExplosion(enemy.x, enemy.y);
      this.scoreManager.addScoreForEnemy(enemy.type, isDiving);
    }
  }
  ```
  *Gap*: If an Elite Zako/Goei (2 HP) or Dreadnought with shield survives a shot, `damageResult.destroyed` is false, and `Game.ts` executes **nothing**. No hit sound, no deflection sparks. Players would perceive bullets "passing through" or "swallowed silently".

---

## 3. Detailed Technical Design

### 3.1 `src/entities/Enemy.ts` Modifications

#### 3.1.1 Type & Interface Additions
```typescript
import type { StageTier } from '../types';

export interface EnemyConfig {
  id?: number | string;
  type?: EnemyType;
  row?: number;
  col?: number;
  x?: number;
  y?: number;
  tier?: StageTier;
  health?: number;
  maxHealth?: number;
  shield?: number;
  maxShield?: number;
}

export interface EnemyDamageResult {
  destroyed: boolean;
  points: number;
  wasDamaged: boolean;
  shieldAbsorbed?: boolean;
  remainingShield?: number;
  remainingHealth?: number;
}
```

#### 3.1.2 Property Additions in `Enemy`
```typescript
export class Enemy implements Poolable {
  // Static Timing Constants
  public static readonly WING_FRAME_DURATION = 0.25; // 250ms per animation frame
  public static readonly DAMAGE_FLASH_DURATION = 0.08; // 80ms white/color flash
  public static readonly SHIELD_FLASH_DURATION = 0.10; // 100ms shield impact flash
  public static readonly EXPLOSION_DURATION = 0.30; // 300ms explosion delay
  public static readonly BASE_WIDTH = 16;
  public static readonly BASE_HEIGHT = 16;
  public static readonly CORE_HITBOX_SIZE = 12;

  // Tier & Kinetic Shield Defense
  public tier: StageTier = 'CLASSIC';
  public shield: number = 0;
  public maxShield: number = 0;
  public shieldFlashTimer: number = 0;

  // Aggression Tracking
  public shotsRemainingInDive: number = 1;
  ...
```

#### 3.1.3 Initialization & Pooling Lifecycle
```typescript
  public init(
    id: number | string,
    type: EnemyType,
    row: number,
    col: number,
    x: number,
    y: number,
    tier: StageTier = 'CLASSIC',
    health?: number,
    shield?: number
  ): this {
    this.id = id;
    this.type = type;
    this.row = row;
    this.col = col;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.rotation = 0;
    this.active = true;
    this.state = EnemyState.IN_FORMATION;
    this.tier = tier;

    // 1. Health Initialization (Supports explicit override or tier default)
    if (health !== undefined) {
      this.maxHealth = health;
      this.health = health;
    } else {
      const extraHp = tier === 'ELITE' || tier === 'DREADNOUGHT' ? 1 : 0;
      if (type === EnemyType.BOSS) {
        this.maxHealth = 2 + extraHp;
        this.health = 2 + extraHp;
      } else {
        this.maxHealth = 1 + extraHp;
        this.health = 1 + extraHp;
      }
    }

    // 2. Shield Initialization (Supports explicit override or tier default)
    if (shield !== undefined) {
      this.maxShield = shield;
      this.shield = shield;
    } else {
      if (tier === 'DREADNOUGHT') {
        this.maxShield = type === EnemyType.BOSS ? 2 : 1;
        this.shield = this.maxShield;
      } else {
        this.maxShield = 0;
        this.shield = 0;
      }
    }

    this.damageFlashTimer = 0;
    this.shieldFlashTimer = 0;
    this.deathTimer = 0;
    this.animTimer = Math.random() * Enemy.WING_FRAME_DURATION;
    this.animFrame = 0;
    this.escortCount = 0;
    this.escortBossId = null;
    this.escortBoss = null;
    this.hasCapturedFighter = false;
    this.capturedFighterEnemy = null;
    this.diveTimer = 0;
    this.diveSpeed = 160;
    this.flightPath = null;
    this.pathElapsedMs = 0;
    this.canShoot = true;
    this.fireCooldownTimer = 0;
    this.shotsRemainingInDive = tier === 'DREADNOUGHT' ? 3 : tier === 'ELITE' ? 2 : 1;

    return this;
  }

  public reset(): void {
    this.id = 0;
    this.type = EnemyType.ZAKO;
    this.state = EnemyState.INACTIVE;
    this.active = false;
    this.row = 0;
    this.col = 0;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.rotation = 0;
    this.tier = 'CLASSIC';
    this.maxHealth = 1;
    this.health = 1;
    this.maxShield = 0;
    this.shield = 0;
    this.damageFlashTimer = 0;
    this.shieldFlashTimer = 0;
    this.deathTimer = 0;
    this.animTimer = 0;
    this.animFrame = 0;
    this.escortCount = 0;
    this.escortBossId = null;
    this.escortBoss = null;
    this.hasCapturedFighter = false;
    this.capturedFighterEnemy = null;
    this.diveTimer = 0;
    this.diveSpeed = 160;
    this.returnSlotX = 0;
    this.returnSlotY = 0;
    this.flightPath = null;
    this.pathElapsedMs = 0;
    this.canShoot = true;
    this.fireCooldownTimer = 0;
    this.shotsRemainingInDive = 1;
  }
```

#### 3.1.4 Damage Pipeline: Shield Depletion Before Health
```typescript
  public takeDamage(amount: number = 1): EnemyDamageResult {
    if (!this.active || this.state === EnemyState.EXPLODING || this.state === EnemyState.INACTIVE) {
      return {
        destroyed: false,
        points: 0,
        wasDamaged: false,
        shieldAbsorbed: false,
        remainingShield: this.shield,
        remainingHealth: this.health,
      };
    }

    // Step 1: Kinetic Shield Absorption
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      const overflow = amount - absorbed;
      this.shieldFlashTimer = Enemy.SHIELD_FLASH_DURATION;
      this.damageFlashTimer = Enemy.DAMAGE_FLASH_DURATION;

      // Handle massive overflow damage (e.g. ship collision amount=99)
      if (overflow > 0) {
        this.health -= overflow;
        if (this.health <= 0) {
          const awardedPoints = this.getScoreValue();
          this.state = EnemyState.EXPLODING;
          this.deathTimer = Enemy.EXPLOSION_DURATION;
          this.onExplode?.(this.x, this.y, this.type);
          return {
            destroyed: true,
            points: awardedPoints,
            wasDamaged: true,
            shieldAbsorbed: true,
            remainingShield: 0,
            remainingHealth: 0,
          };
        }
      }

      return {
        destroyed: false,
        points: 0,
        wasDamaged: true,
        shieldAbsorbed: true,
        remainingShield: this.shield,
        remainingHealth: this.health,
      };
    }

    // Step 2: Hull Health Depletion (Shield was 0)
    this.health -= amount;
    this.damageFlashTimer = Enemy.DAMAGE_FLASH_DURATION;

    if (this.health <= 0) {
      const awardedPoints = this.getScoreValue();
      this.state = EnemyState.EXPLODING;
      this.deathTimer = Enemy.EXPLOSION_DURATION;

      // Escort boss notification
      if (this.escortBoss && this.escortBoss.active && this.escortBoss.escortCount > 0) {
        this.escortBoss.escortCount = Math.max(0, this.escortBoss.escortCount - 1);
      }

      this.onExplode?.(this.x, this.y, this.type);
      return {
        destroyed: true,
        points: awardedPoints,
        wasDamaged: true,
        shieldAbsorbed: false,
        remainingShield: 0,
        remainingHealth: 0,
      };
    }

    // Non-fatal hull hit (e.g. Boss 2->1 HP or Elite Zako/Goei 2->1 HP)
    return {
      destroyed: false,
      points: 0,
      wasDamaged: true,
      shieldAbsorbed: false,
      remainingShield: 0,
      remainingHealth: this.health,
    };
  }
```

#### 3.1.5 Updated Timers in `Enemy.update` & Forwarding in `Enemy.render`
```typescript
  public update(dt: number, playerX: number = 112, playerY: number = 250): void {
    if (!this.active || this.state === EnemyState.INACTIVE) return;

    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt);
    }
    if (this.shieldFlashTimer > 0) {
      this.shieldFlashTimer = Math.max(0, this.shieldFlashTimer - dt);
    }
    ...
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.active || this.state === EnemyState.INACTIVE) return;

    if (this.state === EnemyState.EXPLODING) {
      ctx.save();
      ctx.fillStyle = '#FFFF00';
      const rad = 6 * (1 - this.deathTimer / Enemy.EXPLOSION_DURATION) + 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    SpriteRenderer.drawEnemy(
      ctx,
      this.type,
      this.x,
      this.y,
      this.animFrame,
      this.health,
      this.rotation,
      1.0,
      this.tier,
      this.shield,
      this.damageFlashTimer,
      this.shieldFlashTimer,
      this.animTimer
    );
  }
```

---

### 3.2 `src/renderer/SpriteRenderer.ts` Visual Pipeline

#### 3.2.1 Procedural Bit-Matrix Transformation Helpers
To avoid manual transcription errors of 256-character arrays, define pure procedural transformers:
```typescript
/**
 * Procedurally remaps pixel codes in a sprite bit-matrix using a substitution map.
 */
export function remapMatrixColors(matrix: string[][], map: Record<string, string>): string[][] {
  return matrix.map(row => row.map(cell => map[cell] ?? cell));
}

/**
 * Creates a solid flash silhouette bit-matrix by replacing all non-transparent pixels.
 */
export function createFlashMatrix(matrix: string[][], flashChar: string = 'W'): string[][] {
  return matrix.map(row => row.map(cell => (cell === '.' ? '.' : flashChar)));
}
```

#### 3.2.2 Elite Tier Sprite Matrices
```typescript
// Elite Zako (Molten Vanguard: Orange Wings 'O', Violet Abdomen 'P', Cyan Visor 'C')
export const ELITE_ZAKO_FRAME_0_MATRIX = remapMatrixColors(ZAKO_FRAME_0_MATRIX, { 'C': 'O', 'B': 'P', 'R': 'C' });
export const ELITE_ZAKO_FRAME_1_MATRIX = remapMatrixColors(ZAKO_FRAME_1_MATRIX, { 'C': 'O', 'B': 'P', 'R': 'C' });

// Elite Goei (Royal Predator: Royal Purple Wings 'U', Crimson Abdomen 'D', Amber Antennae 'O')
export const ELITE_GOEI_FRAME_0_MATRIX = remapMatrixColors(GOEI_FRAME_0_MATRIX, { 'R': 'U', 'B': 'D', 'Y': 'O' });
export const ELITE_GOEI_FRAME_1_MATRIX = remapMatrixColors(GOEI_FRAME_1_MATRIX, { 'R': 'U', 'B': 'D', 'Y': 'O' });

// Boss Galaga Elite Tier (3 HP Imperial Flagship: Imperial Gold Carapace 'Y', Amber Mantle 'O', Crimson Eyes 'R')
export const BOSS_ELITE_FRAME_0_MATRIX = remapMatrixColors(BOSS_HEALTHY_FRAME_0_MATRIX, { 'G': 'Y', 'B': 'O', 'Y': 'R' });
export const BOSS_ELITE_FRAME_1_MATRIX = remapMatrixColors(BOSS_HEALTHY_FRAME_1_MATRIX, { 'G': 'Y', 'B': 'O', 'Y': 'R' });
```

#### 3.2.3 White Damage Flash Matrices (80ms Hit Feedback)
```typescript
export const ZAKO_FLASH_FRAME_0_MATRIX = createFlashMatrix(ZAKO_FRAME_0_MATRIX, 'W');
export const ZAKO_FLASH_FRAME_1_MATRIX = createFlashMatrix(ZAKO_FRAME_1_MATRIX, 'W');
export const GOEI_FLASH_FRAME_0_MATRIX = createFlashMatrix(GOEI_FRAME_0_MATRIX, 'W');
export const GOEI_FLASH_FRAME_1_MATRIX = createFlashMatrix(GOEI_FRAME_1_MATRIX, 'W');
export const BOSS_FLASH_FRAME_0_MATRIX = createFlashMatrix(BOSS_HEALTHY_FRAME_0_MATRIX, 'W');
export const BOSS_FLASH_FRAME_1_MATRIX = createFlashMatrix(BOSS_HEALTHY_FRAME_1_MATRIX, 'W');
```

These are registered in `SpriteRenderer.initialize()` alongside base definitions and baked at startup.

#### 3.2.4 Hexagonal Kinetic Shield Aura (`drawShieldAura`)
```typescript
  /**
   * Renders procedural hexagonal/circular energetic kinetic barrier for Dreadnought tier when shield > 0.
   */
  public static drawShieldAura(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    shield: number,
    shieldFlashTimer: number = 0,
    animTimer: number = 0
  ): void {
    if (shield <= 0) return;

    ctx.save();

    const isFlashing = shieldFlashTimer > 0;
    const pulseSpeed = isFlashing ? 24 : 8;
    const pulseOffset = Math.sin(animTimer * pulseSpeed);
    const baseRadius = 12 + pulseOffset * 0.8;
    const rot = animTimer * 1.5; // Smooth geometric rotation

    // 1. Strobe on projectile absorption vs idle shimmering
    if (isFlashing) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.fillStyle = 'rgba(0, 255, 255, 0.40)';
      ctx.lineWidth = 2.0;
      ctx.shadowColor = '#00FFFF';
      ctx.shadowBlur = 6;
    } else {
      ctx.strokeStyle = '#00FFFF';
      ctx.fillStyle = 'rgba(0, 255, 255, 0.12)';
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.65 + 0.25 * Math.sin(animTimer * 10);
    }

    // 2. Primary Hexagonal Kinetic Barrier
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = rot + (i * Math.PI) / 3;
      const vx = Math.round(x + baseRadius * Math.cos(angle));
      const vy = Math.round(y + baseRadius * Math.sin(angle));
      if (i === 0) {
        ctx.moveTo(vx, vy);
      } else {
        ctx.lineTo(vx, vy);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. Multi-Layer Concentric Barrier for Heavy Shields (shield >= 2)
    if (shield >= 2) {
      const innerRadius = baseRadius - 3.5;
      const innerRot = -rot * 1.2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = innerRot + (i * Math.PI) / 3;
        const vx = Math.round(x + innerRadius * Math.cos(angle));
        const vy = Math.round(y + innerRadius * Math.sin(angle));
        if (i === 0) {
          ctx.moveTo(vx, vy);
        } else {
          ctx.lineTo(vx, vy);
        }
      }
      ctx.closePath();
      ctx.stroke();
    }

    // 4. Orbital Energy Nodes at Hexagon Vertices
    if (!isFlashing) {
      ctx.fillStyle = '#FFFFFF';
      for (let i = 0; i < 6; i++) {
        const angle = rot + (i * Math.PI) / 3;
        const nx = Math.round(x + baseRadius * Math.cos(angle));
        const ny = Math.round(y + baseRadius * Math.sin(angle));
        ctx.fillRect(nx - 0.5, ny - 0.5, 1, 1);
      }
    }

    ctx.restore();
  }
```

#### 3.2.5 Upgraded `SpriteRenderer.drawEnemy`
```typescript
  public static drawEnemy(
    ctx: CanvasRenderingContext2D,
    type: EnemyType,
    x: number,
    y: number,
    animFrame: number = 0,
    health: number = 1,
    rotation: number = 0,
    alpha: number = 1.0,
    tier: StageTier = 'CLASSIC',
    shield: number = 0,
    damageFlashTimer: number = 0,
    shieldFlashTimer: number = 0,
    animTimer: number = 0
  ): void {
    let spriteId: string;
    const isElite = tier === 'ELITE' || tier === 'DREADNOUGHT';

    // 1. Resolve Sprite Definition by Type, Tier & Health State
    switch (type) {
      case EnemyType.ZAKO:
        if (isElite) {
          // If damaged (1 HP left of 2), flash between elite and alert amber/classic at 8Hz
          const isFractured = health === 1;
          const flashPhase = Math.floor(animTimer * 16) % 2 === 0;
          spriteId = isFractured && flashPhase ? 'ZAKO' : 'ELITE_ZAKO';
        } else {
          spriteId = 'ZAKO';
        }
        break;

      case EnemyType.GOEI:
        if (isElite) {
          const isFractured = health === 1;
          const flashPhase = Math.floor(animTimer * 16) % 2 === 0;
          spriteId = isFractured && flashPhase ? 'GOEI' : 'ELITE_GOEI';
        } else {
          spriteId = 'GOEI';
        }
        break;

      case EnemyType.BOSS:
        if (health >= 3) {
          spriteId = 'BOSS_ELITE';   // Imperial Golden Flagship
        } else if (health === 2) {
          spriteId = 'BOSS_HEALTHY'; // Standard Green Carapace
        } else {
          spriteId = 'BOSS_DAMAGED'; // Wounded Blue Carapace
        }
        break;

      case EnemyType.CAPTURED_FIGHTER:
        spriteId = 'CAPTURED_FIGHTER';
        break;

      case EnemyType.TRANSFORM:
        spriteId = 'TRANSFORM_SCORPION';
        break;

      default:
        spriteId = 'ZAKO';
        break;
    }

    // 2. 80ms Arcade Hit Flash Override
    if (damageFlashTimer > 0 && shield <= 0) {
      if (type === EnemyType.BOSS) {
        spriteId = 'BOSS_FLASH';
      } else if (type === EnemyType.GOEI) {
        spriteId = 'GOEI_FLASH';
      } else {
        spriteId = 'ZAKO_FLASH';
      }
    }

    // 3. Draw Core Sprite
    SpriteRenderer.draw(ctx, spriteId, x, y, {
      frame: animFrame % 2,
      rotation,
      alpha,
    });

    // 4. Render Kinetic Shield Aura (if active)
    if (shield > 0) {
      SpriteRenderer.drawShieldAura(ctx, x, y, shield, shieldFlashTimer, animTimer);
    }
  }
```

---

### 3.3 Distinct `FLAG_20` Badge Sprite Matrix in `src/ui/HUD.ts`

#### 3.3.1 Historical Arcade Specification vs Current Defect
In Namco Galaga arcade:
- `FLAG_10`: Single red chevron / triangular pennant.
- `FLAG_20`: Red rectangular flag with **TWO** vertical white bars.
- `FLAG_30`: Red rectangular flag with **THREE** vertical white bars.
- `FLAG_50`: Large red banner with yellow pole and blue/white Galaxian star emblem.

Currently, `BADGE_20_MATRIX` in `src/ui/HUD.ts:149` is an exact alias:
`export const BADGE_20_MATRIX: string[][] = BADGE_30_MATRIX;`

#### 3.3.2 Dedicated 8x12 `BADGE_20_MATRIX`
Replace line 149 with the following authentic bit-matrix:
```typescript
export const BADGE_20_MATRIX: string[][] = [
  ['Y','R','W','R','W','R','R','.'],
  ['Y','R','W','R','W','R','R','.'],
  ['Y','R','W','R','W','R','R','.'],
  ['Y','R','W','R','W','R','R','.'],
  ['Y','R','W','R','W','R','R','.'],
  ['Y','R','W','R','W','R','R','.'],
  ['Y','.','.','.','.','.','.','.'],
  ['Y','.','.','.','.','.','.','.'],
  ['Y','.','.','.','.','.','.','.'],
  ['Y','.','.','.','.','.','.','.'],
  ['Y','.','.','.','.','.','.','.'],
  ['Y','.','.','.','.','.','.','.']
];
```

#### 3.3.3 Visual Comparison
- `BADGE_20_MATRIX`: Red flag with 2 vertical white stripes at columns 2 and 4.
- `BADGE_30_MATRIX`: Red flag with 3 vertical white stripes across columns 2, 3, 4.
- `BADGE_10_MATRIX`: Red triangular pennant tapering down.
- Both 20 and 30 have identical dimensions `{ width: 8, height: 12 }`.
- `HUD.decomposeStage(20)` returns `[BadgeType.FLAG_20]`. Total width = 8px.
- Mathematically fits within the 120px bottom-right HUD budget for all stages 1–50 with zero collisions against reserve lives icons.

---

### 3.4 Integration with `src/core/Game.ts` Collision Pipeline

In `src/core/Game.ts:680–760`, modify the collision response so non-fatal shield and armor impacts produce immediate audio-visual feedback:

```typescript
// Case A: Boss Galaga
if (enemy.type === EnemyType.BOSS) {
  const damageResult = enemy.takeDamage(1);
  if (damageResult.destroyed) {
    this.soundSynth.playExplosion('boss');
    this.particleSystem.spawnBossExplosion(enemy.x, enemy.y);
    ...
  } else if (damageResult.shieldAbsorbed) {
    this.soundSynth.playBossHit();
    this.particleSystem.spawnHitSparks(enemy.x, enemy.y);
  } else {
    this.soundSynth.playBossHit();
    this.particleSystem.spawnHitSparks(enemy.x, enemy.y);
  }
}
// Case C: Standard Enemies (Zako, Goei, Transform)
else {
  const isDiving = enemy.state === EnemyState.DIVING_SOLO || enemy.state === EnemyState.DIVING_ESCORT;
  const damageResult = enemy.takeDamage(1);
  if (damageResult.destroyed) {
    this.soundSynth.playExplosion('small');
    this.particleSystem.spawnSmallAlienExplosion(enemy.x, enemy.y);
    this.scoreManager.addScoreForEnemy(enemy.type, isDiving);
  } else if (damageResult.shieldAbsorbed) {
    // Dreadnought shield absorbed player bullet
    this.soundSynth.playBossHit();
    this.particleSystem.spawnHitSparks(enemy.x, enemy.y);
  } else if (damageResult.wasDamaged) {
    // Elite Zako / Goei took 1st hit (2 HP -> 1 HP)
    this.soundSynth.playBossHit();
    this.particleSystem.spawnHitSparks(enemy.x, enemy.y);
  }
}
```

---

## 4. File Modification Blueprint for Implementation

| Target File | Change Type | Specific Changes | Rationale |
|---|---|---|---|
| `src/types/index.ts` | Extension | Export `StageTier = 'CLASSIC' \| 'ELITE' \| 'DREADNOUGHT'`; add `tier`, `shield`, `maxShield` to `EnemyData` | Standardizes tier types across modules |
| `src/entities/Enemy.ts` | Enhancement | Add `tier`, `shield`, `maxShield`, `shieldFlashTimer`; update `init`, `reset`, `takeDamage`, `update`, `render` | Core entity tier scaling and shield depletion mechanics |
| `src/renderer/SpriteRenderer.ts` | Extension | Add `remapMatrixColors`, `createFlashMatrix`, Elite matrices, Flash matrices, `drawShieldAura`, updated `drawEnemy` | Procedural visuals, hit flashes, and shield forcefields |
| `src/ui/HUD.ts` | Fix | Replace `export const BADGE_20_MATRIX = BADGE_30_MATRIX;` with dedicated 8x12 dual-stripe matrix | Authentic arcade distinct `FLAG_20` badge |
| `src/core/Game.ts` | Integration | Add `shieldAbsorbed` and `wasDamaged` non-fatal hit audio/spark branches in `resolveCollisions` | Tactile feedback for multi-hit enemies and shields |

---

## 5. Verification & Test Plan

A new comprehensive test suite `tests/unit/enemy_tier_shield.test.ts` should be created to verify:
1. **Shield Absorption Logic**:
   - Given an enemy with `shield = 1, health = 2`:
     - Hit 1: `shieldAbsorbed === true`, `shield === 0`, `health === 2`, `destroyed === false`.
     - Hit 2: `shieldAbsorbed === false`, `health === 1`, `destroyed === false`.
     - Hit 3: `shieldAbsorbed === false`, `health === 0`, `destroyed === true`.
2. **Direct Collision Overkill**:
   - Given an enemy with `shield = 2, health = 1`:
     - Call `takeDamage(99)`:
     - `shield === 0`, `health === 0`, `destroyed === true`, `state === EnemyState.EXPLODING`.
3. **Boss Galaga 3-Stage HP Degradation**:
   - Boss at 3 HP: `SpriteRenderer.drawEnemy` resolves to `'BOSS_ELITE'`.
   - Boss at 2 HP: resolves to `'BOSS_HEALTHY'`.
   - Boss at 1 HP: resolves to `'BOSS_DAMAGED'`.
4. **Pool Reset Invariance**:
   - Acquire enemy from pool, set `tier = 'DREADNOUGHT', shield = 2, maxShield = 2`.
   - Call `reset()`:
   - Verify `tier === 'CLASSIC', shield === 0, maxShield === 0, damageFlashTimer === 0, shieldFlashTimer === 0`.
5. **HUD `BADGE_20_MATRIX` Verification**:
   - `expect(BADGE_20_MATRIX).not.toBe(BADGE_30_MATRIX)`.
   - Dimensions are 8 wide by 12 high.
   - Column 2 and 4 contain `'W'`; Column 3 contains `'R'`.
   - `HUD.decomposeStage(20).badges` is exactly `[BadgeType.FLAG_20]`.
6. **Regression Invariance**:
   - All 546 existing unit tests and `npm run build` must continue to pass 100%.

