# Milestone 11 Technical Architecture Report: Upgrades & Dual Fighter Synergy

**Explorer**: `m11_explorer_2` (Upgrades & Dual Fighter Synergy Explorer)  
**Date**: 2026-09-03  
**Working Directory**: `/Users/user/src/galog/.agents/m11_explorer_2`  
**Target Codebase**: Galaga Arcade Web Game (`/Users/user/src/galog`)  
**Status**: Architecture & Integration Specification Complete  

---

## 1. Executive Summary & Mission Objective

Milestone 11 expands the combat dynamics of the 50-round Galaga expansion by introducing a tactical player upgrade subsystem and harmonizing it with the iconic **Dual Fighter docking mechanism**. In classic Galaga, acquiring a Dual Fighter is the singular offensive enhancement; Milestone 11 deepens this core arcade fantasy by introducing 5 distinct procedural upgrade modules that stack multiplicatively with both Single and Dual Fighter modes:

1. **Rapid Fire**: Halves weapon firing cooldown (120ms $\to$ 60ms) and doubles active on-screen missile quotas (Single: 2 $\to$ 4; Dual: 4 $\to$ 8).
2. **Kinetic Deflector Shield**: Envelops the hull in an energetic cyan barrier that absorbs 1 fatal collision or bullet hit, protecting both hulls in Dual Fighter mode without hull loss.
3. **Scatter / Triple Shot**: Single Fighter fires a 3-way spread ($0^\circ, \pm 15^\circ$); Dual Fighter fires twin 3-way spreads (**6 simultaneous streams of devastation**).
4. **EMP Bomb**: Consumable or instant tactical smart bomb that obliterates all active enemy projectiles on screen, stuns diving aliens in mid-flight, and triggers an expanding particle shockwave.
5. **Engine Booster**: Elevates player lateral speed ($+50\%$ velocity scaling: $120 \to 180\text{ px/s}$ arcade baseline or $260 \to 390\text{ px/s}$ engine baseline) with sharpened lateral agility to evade late-round bullet storms.

This report establishes the complete mathematical, mechanical, and architectural blueprints for integrating these upgrades into `src/entities/Player.ts`, `src/entities/Bullet.ts`, and `src/core/Game.ts`.

---

## 2. Architecture & Subsystem Design Overview

```
                          +-------------------------------------------------+
                          |             Game.ts (Coordinator)               |
                          +------------------------+------------------------+
                                                   |
                   +-------------------------------+-------------------------------+
                   |                               |                               |
                   v                               v                               v
    +------------------------------+  +---------------------------+  +----------------------------+
    |        PowerUpManager        |  |         Player.ts         |  |      BulletManager.ts      |
    |  - Drops from enemies        |  |  - 7-State FSM            |  |  - Zero-GC ObjectPool      |
    |  - Lifetime/Drift Physics    |  |  - Active Buff Timers     |  |  - Dynamic Quota Engine    |
    |  - Collection Resolution     |  |  - Single / Dual Modes    |  |  - Directional Vectors     |
    +--------------+---------------+  +-------------+-------------+  +--------------+-------------+
                   |                                |                               |
                   |       applyUpgrade()           |     attemptFire()             |
                   +------------------------------->+------------------------------>+
                                                    |
                                      +-------------+-------------+
                                      |     Hit & Collision       |
                                      |     - Shield Deflect      |
                                      |     - Dual Asymmetry      |
                                      |     - EMP Projectile Wipe |
                                      +---------------------------+
```

### 2.1 Core Architectural Principles
- **Zero Runtime Allocations**: All projectiles and particle effects are leased from existing `ObjectPool<T>` instances. Upgrade state is maintained as contiguous scalar values on `Player.ts`.
- **Preservation of Classic Dual Fighter Mechanics**: The 7-state FSM (`normal`, `capturing`, `captured`, `docking`, `dual`, `destroyed`, `respawning`) remains uncompromised. Upgrades dynamically adapt their dimensions, quotas, and firing spreads as the player transitions between Single and Dual states.
- **Strict Invariant Safety**: All existing tests in `tests/unit/player.test.ts` (e.g. baseline 260 px/s speed, 2/4 missile quotas, asymmetrical left/right hull destruction) remain 100% green when upgrades are inactive.

---

## 3. Upgrade Module Specifications & Mathematics

### 3.1 Rapid Fire (Overclocked Pulse Cannons)
- **Concept**: Overclocks the weapon capacitors, doubling fire cadence and expanding on-screen missile allowances.
- **Cadence / Cooldown Math**:
  - Baseline Cooldown: $t_{\text{cd}} = 0.12\text{ s}$ (120ms, $\approx 8.33\text{ volleys/s}$).
  - Rapid Fire Cooldown: $t_{\text{cd, rapid}} = 0.06\text{ s}$ (60ms, $\approx 16.67\text{ volleys/s}$).
  $$\text{Effective Fire Delay} = \frac{t_{\text{base}}}{2.0}$$
- **Missile Quota Math**:
  - In baseline Galaga, a player cannot shoot if their on-screen bullets reach quota. Rapid Fire doubles these limits:
    - **Single Fighter**: Quota expands from $2 \to 4$ active missiles.
    - **Dual Fighter**: Quota expands from $4 \to 8$ active missiles.
- **Volley Capacity**:
  - Single Fighter: 4 consecutive single shots before recycling.
  - Dual Fighter: 4 consecutive twin-missile volleys (8 missiles total) in flight simultaneously.
- **Duration**: 15.0 seconds (timed buff).

---

### 3.2 Kinetic Deflector Shield (Energetic Barrier)
- **Concept**: A high-density plasma bubble shielding the vessel from a single fatal impact (enemy projectile or alien hull collision).
- **Single Fighter Protection**:
  - Creates a cyan hexagonal/circular force field centered at $(x, y)$.
  - Hitbox: $20\text{ px} \times 20\text{ px}$ circular barrier ($R = 10\text{ px}$).
  - Capacity: Absorbs 1 fatal threat.
- **Dual Fighter Synergy**:
  - **Single hit protecting both hulls**: The barrier expands to $38\text{ px} \times 20\text{ px}$ ($R_x = 19\text{ px}, R_y = 10\text{ px}$), encompassing both docked hulls.
  - Upon impact with either the left hull, right hull, or center, the shield absorbs $100\%$ of incoming damage:
    1. Shield is consumed (`shieldHp = 0`).
    2. Deflection particle sparks burst radially (`spawnShieldDeflect(x, y)`).
    3. Resonant crystalline ping plays (`SoundSynth.playShieldDeflect()`).
    4. Grants 0.25s grace invulnerability (`invulnerableTimer = 0.25s`) to prevent multi-projectile overlap wiping the hull on the same frame.
    5. **Neither hull is lost!** Dual Fighter configuration is completely preserved!
  - **Dual Hit Capacity Option**: If picked up while already in Dual Fighter mode, the shield can optionally grant `shieldHp = 2` (1 energy charge per hull), allowing two distinct hits before catastrophic hull damage occurs.
- **Duration**: Persistent until depleted by damage, or timed (e.g. 20.0s).

---

### 3.3 Scatter / Triple Shot (Trident & Sextuple Devastation Streams)
- **Concept**: Equips multi-directional divergent emitters angled at $0^\circ$ and $\pm 15^\circ$ off the vertical axis.
- **Ballistics Vector Math**:
  - Projectile speed: $V = 480\text{ px/s}$.
  - Spread Angle: $\theta = 15^\circ = \frac{15 \times \pi}{180} \approx 0.2618\text{ rad}$.
  - Velocity components:
    - Center Stream ($0^\circ$):
      $$v_x = 0,\quad v_y = -V = -480.0\text{ px/s}$$
    - Left Stream ($-15^\circ$):
      $$v_x = -V \cdot \sin(15^\circ) = -480 \times 0.258819 = -124.23\text{ px/s}$$
      $$v_y = -V \cdot \cos(15^\circ) = -480 \times 0.965926 = -463.64\text{ px/s}$$
    - Right Stream ($+15^\circ$):
      $$v_x = +V \cdot \sin(15^\circ) = +124.23\text{ px/s}$$
      $$v_y = -V \cdot \cos(15^\circ) = -463.64\text{ px/s}$$
- **Single Fighter Volley**:
  - Origin: $(x, y - 8)$
  - 3 simultaneous projectiles: Left ($-15^\circ$), Center ($0^\circ$), Right ($+15^\circ$).
- **Dual Fighter Volley (6 Streams of Devastation)**:
  - Left Cannon Origin: $(x - 8, y - 8)$
    - Stream 1: $-15^\circ$ ($vx = -124.23, vy = -463.64$)
    - Stream 2: $0^\circ$ ($vx = 0, vy = -480.0$)
    - Stream 3: $+15^\circ$ ($vx = +124.23, vy = -463.64$)
  - Right Cannon Origin: $(x + 8, y - 8)$
    - Stream 4: $-15^\circ$ ($vx = -124.23, vy = -463.64$)
    - Stream 5: $0^\circ$ ($vx = 0, vy = -480.0$)
    - Stream 6: $+15^\circ$ ($vx = +124.23, vy = -463.64$)
  - Total: **6 streams per trigger pull**, saturating an angular cone from $-15^\circ$ to $+15^\circ$ across a 48px front.
- **Quota Accommodation**:
  - To enable Scatter Shot without artificial throttling:
    - Single + Scatter: Quota = 6 (allows 2 full 3-shot volleys).
    - Single + Scatter + Rapid: Quota = 8 (allows rapid burst spreads).
    - Dual + Scatter: Quota = 12 (allows 2 full 6-shot volleys).
    - Dual + Scatter + Rapid: Quota = 16 (unleashes an impenetrable curtain of fire).
- **Duration**: 15.0 seconds.

---

### 3.4 EMP Bomb (Tactical Projectile Nullifier & Kinetic Shockwave)
- **Concept**: A deployable or instant smart bomb that clears tactical airspace and disrupts enemy command links.
- **Trigger Modes**:
  1. **Instant Trigger (Arcade Mode)**: Detonates automatically upon capsule collection.
  2. **Consumable Trigger (Tactical Mode)**: Stored in inventory (`empBombCount`, max 3), triggered on demand by pressing `KeyB`, `KeyX`, or on-screen touch bomb button.
- **Effects Lifecycle**:
  1. **Projectile Nullification**:
     - Scans `BulletManager.forEachActiveEnemyBullet()`.
     - Recycles every active enemy bullet back to the `ObjectPool<Bullet>`.
     - Spawns an explosion spark (`ParticleSystem.spawnHitSpark(x, y)`) at each neutralized bullet's position.
     - Decrements `activeEnemyBulletCount` to 0.
  2. **Enemy Diving Stun**:
     - Scans `FormationManager` active enemies.
     - Any enemy in `DIVING_SOLO` or `DIVING_ESCORT` state receives `stunTimer = 3.0s`.
     - While stunned, kinematic velocity is zeroed, dive path progression is paused, weapon firing is inhibited, and sprite alternates cyan/yellow electrical flicker.
  3. **Particle Shockwave Expansion**:
     - Leases shockwave particle from `ParticleSystem`.
     - Radiates from player position $(x, y)$ or screen center $(112, 144)$.
     - Initial radius $r_0 = 4\text{ px}$, expanding to $r_{\max} = 220\text{ px}$ over $t = 0.5\text{ s}$ with easing curve:
       $$r(t) = r_{\max} \cdot \sqrt{\frac{t}{0.5}},\quad \alpha(t) = 1.0 - \left(\frac{t}{0.5}\right)^2$$
  4. **Acoustic Signature**:
     - `SoundSynth.playEmpBlast()`: Deep resonant 50Hz sub-bass sine drop + 0.6s filtered noise burst.

---

### 3.5 Engine Booster (Lateral Velocity Scaling & Agility)
- **Concept**: Overclocks the player's lateral thrusters, increasing responsiveness to dodge high-density bullet patterns in stages 11–50.
- **Velocity Calibration**:
  - In original arcade specifications, player lateral speed corresponds to $120\text{ px/s} \to 180\text{ px/s}$ ($+50\%$ scaling).
  - In the project's current baseline (`Player.ts:63`), speed is established at $260\text{ px/s}$.
  - **Resolution**: Engine Booster applies a strict $+50\%$ multiplier ($1.5\times$ speed scalar):
    $$v_{\text{boosted}} = v_{\text{base}} \times 1.5$$
    - If baseline is $260\text{ px/s}$, boosted speed is $390\text{ px/s}$.
    - If baseline is configured as $120\text{ px/s}$, boosted speed is $180\text{ px/s}$.
- **Agility & Anti-Jitter Tuning**:
  - Pointer steering deadzone scales with speed ($v \times dt$), guaranteeing zero jitter when tracking mouse/touch pointer.
  - Horizontal boundary clamp adjusts instantaneously to prevent out-of-bounds wall penetration.
- **Dual Fighter Benefit**:
  - Dual Fighter has a 32px wide profile, making it $2.67\times$ more vulnerable to enemy bullets than Single Fighter (12px hitbox).
  - The $+50\%$ lateral speed boost directly counteracts this weakness, allowing high-speed flanking maneuvers.
- **Visuals**: Twin cyan/blue ion thruster particles emit from engine nozzles at $(x \pm 6, y + 8)$.
- **Duration**: 15.0 seconds.

---

## 4. Integration with `src/entities/Player.ts`

### 4.1 Interface Extensions & State Model

```typescript
// Proposed extensions in src/entities/Player.ts

export interface ActiveUpgradeState {
  rapidFireTimer: number;       // Remaining duration in seconds
  scatterShotTimer: number;     // Remaining duration in seconds
  engineBoosterTimer: number;   // Remaining duration in seconds
  shieldHp: number;             // Remaining shield charges (0 = inactive, 1 = single, 2 = dual)
  empBombCount: number;         // Consumable bomb inventory (0..3)
}

export interface PlayerConfig {
  x?: number;
  y?: number;
  speed?: number;
  lives?: number;
  empBombCount?: number;
}
```

### 4.2 Property Additions in `Player` Class

```typescript
export class Player {
  // Existing constants ...
  public static readonly BASE_SPEED = 260; // Baseline lateral speed
  public static readonly BOOSTED_SPEED_MULTIPLIER = 1.5; // Engine Booster scalar

  // Active Upgrade State
  public rapidFireTimer: number = 0;
  public scatterShotTimer: number = 0;
  public engineBoosterTimer: number = 0;
  public shieldHp: number = 0;
  public empBombCount: number = 0;

  // Visual FX Hooks
  public onShieldDeflect?: (x: number, y: number) => void;
  public onEmpTriggered?: (x: number, y: number) => void;

  // Getter Helpers
  public get hasRapidFire(): boolean {
    return this.rapidFireTimer > 0;
  }

  public get hasScatterShot(): boolean {
    return this.scatterShotTimer > 0;
  }

  public get hasEngineBooster(): boolean {
    return this.engineBoosterTimer > 0;
  }

  public get hasShield(): boolean {
    return this.shieldHp > 0;
  }

  public get currentSpeed(): number {
    return this.hasEngineBooster
      ? Player.BASE_SPEED * Player.BOOSTED_SPEED_MULTIPLIER
      : Player.BASE_SPEED;
  }
}
```

### 4.3 Weapon Firing Pipeline Modifications

#### Dynamic Quota & CanFire Evaluation
```typescript
public getMaxMissileQuota(): number {
  if (this.isDual) {
    if (this.hasScatterShot) {
      return this.hasRapidFire ? 16 : 12;
    }
    return this.hasRapidFire ? 8 : 4;
  } else {
    if (this.hasScatterShot) {
      return this.hasRapidFire ? 8 : 6;
    }
    return this.hasRapidFire ? 4 : 2;
  }
}

public get canFire(): boolean {
  const s = this._state;
  const isControllable =
    s === 'normal' || s === 'ALIVE' ||
    s === 'dual' || s === 'DUAL' ||
    s === 'respawning' || s === 'RESPAWNING';

  if (!isControllable) return false;

  const quota = this.getMaxMissileQuota();
  const volleySize = (this.isDual ? 2 : 1) * (this.hasScatterShot ? 3 : 1);

  // Must have room for at least one complete volley and cooldown must be zero
  return this.fireCooldownTimer <= 0 && (this.activeMissileCount + volleySize <= quota);
}
```

#### AttemptFire Implementation
```typescript
public attemptFire(): boolean {
  if (!this.canFire) return false;

  // Set fire cooldown: 0.06s (Rapid Fire) vs 0.12s (Baseline)
  this.fireCooldownTimer = this.hasRapidFire
    ? Player.FIRE_COOLDOWN * 0.5
    : Player.FIRE_COOLDOWN;

  const spawns: BulletSpawnRequest[] = [];
  const V = 480;
  const sin15 = 0.258819;
  const cos15 = 0.965926;
  const vxSpread = V * sin15; // ~124.23 px/s
  const vySpread = -V * cos15; // ~-463.64 px/s

  if (this.isDual) {
    const leftX = this.x - 8;
    const rightX = this.x + 8;
    const gunY = this.y - 8;

    if (this.hasScatterShot) {
      // Twin 3-way spreads (6 streams total)
      // Left Cannon
      spawns.push({ x: leftX, y: gunY, vx: -vxSpread, vy: vySpread });
      spawns.push({ x: leftX, y: gunY, vx: 0, vy: -V });
      spawns.push({ x: leftX, y: gunY, vx: vxSpread, vy: vySpread });
      // Right Cannon
      spawns.push({ x: rightX, y: gunY, vx: -vxSpread, vy: vySpread });
      spawns.push({ x: rightX, y: gunY, vx: 0, vy: -V });
      spawns.push({ x: rightX, y: gunY, vx: vxSpread, vy: vySpread });
    } else {
      // Standard Twin Parallel Missiles
      spawns.push({ x: leftX, y: gunY, vx: 0, vy: -V });
      spawns.push({ x: rightX, y: gunY, vx: 0, vy: -V });
    }
  } else {
    const gunX = this.x;
    const gunY = this.y - 8;

    if (this.hasScatterShot) {
      // Single Fighter 3-way spread
      spawns.push({ x: gunX, y: gunY, vx: -vxSpread, vy: vySpread });
      spawns.push({ x: gunX, y: gunY, vx: 0, vy: -V });
      spawns.push({ x: gunX, y: gunY, vx: vxSpread, vy: vySpread });
    } else {
      // Standard Single Missile
      spawns.push({ x: gunX, y: gunY, vx: 0, vy: -V });
    }
  }

  this.onFire?.(spawns);
  return true;
}
```

### 4.4 Damage Resolution & Kinetic Deflector Interception

```typescript
public hitTestAndDamage(threat: Rect): boolean {
  if (
    this.isInvulnerable() ||
    this._state === 'capturing' || this._state === 'CAPTURING' ||
    this._state === 'captured' || this._state === 'CAPTURED'
  ) {
    return false;
  }

  if (this.isDual) {
    const leftHull: Rect = { x: this.x - 16, y: this.y - 6, width: 15, height: 12 };
    const rightHull: Rect = { x: this.x + 1, y: this.y - 6, width: 15, height: 12 };

    const hitLeft = this.checkAABB(threat, leftHull);
    const hitRight = this.checkAABB(threat, rightHull);

    if (hitLeft || hitRight) {
      // 1. Kinetic Deflector Shield Interception
      if (this.hasShield) {
        this.shieldHp = Math.max(0, this.shieldHp - 1);
        this.onShieldDeflect?.(this.x, this.y);
        // Brief grace invulnerability to prevent multi-hit pierce
        this.invulnerableTimer = Math.max(this.invulnerableTimer, 0.25);
        // Both hulls protected! Zero damage sustained!
        return false;
      }

      // 2. Asymmetrical Damage Processing (Shield Depleted)
      if (hitLeft && !hitRight) {
        // Left hull destroyed
        this.onExplode?.(this.x - 8, this.y, true);
        this._state = 'normal';
        this.x = Math.min(212, Math.max(12, this.x + 8));
        return true;
      } else if (hitRight && !hitLeft) {
        // Right hull destroyed
        this.onExplode?.(this.x + 8, this.y, true);
        this._state = 'normal';
        this.x = Math.min(212, Math.max(12, this.x - 8));
        return true;
      } else if (hitLeft && hitRight) {
        // Catastrophic dual destruction
        this.destroy();
        return true;
      }
    }
    return false;
  } else if (
    this._state === 'normal' || this._state === 'ALIVE' ||
    this._state === 'docking' || this._state === 'DOCKING'
  ) {
    const singleHitbox: Rect = { x: this.x - 6, y: this.y - 6, width: 12, height: 12 };
    if (this.checkAABB(threat, singleHitbox)) {
      if (this.hasShield) {
        this.shieldHp = Math.max(0, this.shieldHp - 1);
        this.onShieldDeflect?.(this.x, this.y);
        this.invulnerableTimer = Math.max(this.invulnerableTimer, 0.25);
        return false;
      }
      this.destroy();
      return true;
    }
  }

  return false;
}
```

### 4.5 Kinematics & Upgrade Timers in `update()`

```typescript
public update(dt: number, input?: InputState): void {
  // 1. Tick Upgrade Durations
  if (this.rapidFireTimer > 0) {
    this.rapidFireTimer = Math.max(0, this.rapidFireTimer - dt);
  }
  if (this.scatterShotTimer > 0) {
    this.scatterShotTimer = Math.max(0, this.scatterShotTimer - dt);
  }
  if (this.engineBoosterTimer > 0) {
    this.engineBoosterTimer = Math.max(0, this.engineBoosterTimer - dt);
  }

  // 2. Existing Timers (fireCooldown, invulnerability)
  if (this.fireCooldownTimer > 0) {
    this.fireCooldownTimer = Math.max(0, this.fireCooldownTimer - dt);
  }
  if (this.invulnerableTimer > 0) {
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    if (this.invulnerableTimer === 0 && (this._state === 'respawning' || this._state === 'RESPAWNING')) {
      this._state = 'normal';
    }
  }

  // 3. Controllable Kinematics with Dynamic Speed
  const s = this._state;
  if (s === 'normal' || s === 'ALIVE' || s === 'dual' || s === 'DUAL' || s === 'respawning' || s === 'RESPAWNING') {
    this.updateControllable(dt, input);
  } else if (s === 'docking' || s === 'DOCKING') {
    this.updateDocking(dt, input);
  } else if (s === 'capturing' || s === 'CAPTURING') {
    this.updateCapturing(dt);
  } else if (s === 'destroyed' || s === 'DESTROYED') {
    this.updateDestroyed(dt);
  }
}
```

In `updateControllable`:
```typescript
const speed = this.currentSpeed; // 260 px/s or 390 px/s with Engine Booster
if (left && !right) {
  targetVx = -speed;
} else if (right && !left) {
  targetVx = speed;
} else if (input.pointerActive && input.pointerX !== null) {
  const dx = input.pointerX - this.x;
  if (Math.abs(dx) <= speed * dt) {
    this.x = input.pointerX;
    targetVx = 0;
  } else {
    targetVx = Math.sign(dx) * speed;
  }
}
```

### 4.6 Rendering Extensions (Shield & Thruster Aura)

```typescript
public render(ctx: CanvasRenderingContext2D): void {
  // Existing destruction/capture/invulnerable checks ...

  // Draw Base Ship Sprite
  this.renderShipSprite(ctx);

  // Draw Kinetic Deflector Shield
  if (this.hasShield) {
    ctx.save();
    const time = performance.now() / 1000;
    const pulseAlpha = 0.35 + 0.15 * Math.sin(time * 8);
    ctx.strokeStyle = '#00FFFF';
    ctx.fillStyle = `rgba(0, 220, 255, ${pulseAlpha})`;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    if (this.isDual) {
      // Expanded oval encompassing both hulls (38px x 20px)
      ctx.ellipse(this.x, this.y, 20, 10, 0, 0, Math.PI * 2);
    } else {
      // Circular bubble encompassing single hull (22px x 18px)
      ctx.ellipse(this.x, this.y, 11, 9, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Draw Engine Booster Ion Trails
  if (this.hasEngineBooster) {
    ctx.save();
    ctx.fillStyle = '#00E5FF';
    if (this.isDual) {
      ctx.fillRect(this.x - 8 - 1, this.y + 8, 2, 4);
      ctx.fillRect(this.x + 8 - 1, this.y + 8, 2, 4);
    } else {
      ctx.fillRect(this.x - 1, this.y + 8, 2, 4);
    }
    ctx.restore();
  }
}
```

---

## 5. Integration with `src/entities/Bullet.ts` & `BulletManager`

### 5.1 Bullet Class Velocity & Angle Fixes
Currently, `Bullet.init()` hardcodes `angle = -Math.PI / 2` for player missiles:
```typescript
// Proposed Enhancement in Bullet.ts:123
if (owner === 'PLAYER') {
  this.width = BULLET_CONFIG.PLAYER_WIDTH;
  this.height = BULLET_CONFIG.PLAYER_HEIGHT;
  // Calculate angle from actual velocity vectors (supports scatter shot)
  this.angle = Math.atan2(vy, vx);
}
```
And in `Bullet.render()`:
```typescript
if (this.owner === 'PLAYER') {
  const rot = this.angle + Math.PI / 2;
  if (Math.abs(rot) > 0.01) {
    SpriteRenderer.draw(ctx, 'PLAYER_MISSILE', this.position.x, this.position.y, {
      rotation: rot,
    });
  } else {
    SpriteRenderer.draw(ctx, 'PLAYER_MISSILE', this.position.x, this.position.y);
  }
}
```

### 5.2 BulletManager Spawning & Quota Adaptations

```typescript
public firePlayerBulletWithVector(
  x: number,
  y: number,
  vx: number,
  vy: number,
  maxQuota: number = BULLET_CONFIG.PLAYER_SINGLE_MAX_BULLETS
): Bullet | null {
  if (this.activePlayerBulletCount >= maxQuota) {
    return null;
  }

  const bullet = this.bulletPool.acquire();
  if (!bullet) return null;

  bullet.init(x, y, vx, vy, 'PLAYER', 'PLAYER_MISSILE');
  this.activePlayerBulletCount++;

  if (this.callbacks.onPlayerFire) {
    this.callbacks.onPlayerFire(bullet);
  }

  return bullet;
}
```

### 5.3 BulletManager EMP Clearing Routine

```typescript
public clearEnemyBulletsWithEffect(
  onBulletNeutralized?: (x: number, y: number) => void
): number {
  let clearedCount = 0;
  this.bulletPool.forEachActiveSafe((bullet) => {
    if (bullet.active && bullet.owner === 'ENEMY') {
      onBulletNeutralized?.(bullet.position.x, bullet.position.y);
      this.recycle(bullet);
      clearedCount++;
    }
  });
  this.activeEnemyBulletCount = 0;
  return clearedCount;
}
```

---

## 6. Classic Galaga Dual Fighter Synergy & State Machine Integrity

### 6.1 The 7-State FSM Interaction Matrix

| FSM State | Player Condition | Weapon Capabilities | Upgrade State Preservation |
|---|---|---|---|
| `normal` | Single hull, $16\times16$ | 1 stream, base quota 2 (or 4/6/8 with buffs) | Timers tick down normally; buffs active. |
| `capturing` | Spinning ($1440^\circ/\text{s}$), ascending | Firing inhibited | Timers **freeze** during tractor ascension; buffs preserved. |
| `captured` | Escort atop Boss Galaga | Firing inhibited; lives $-1$ | Buffs held in stasis on active player ship. |
| `docking` | Rescued ship descending, active ship maneuvering | Active single ship can fire with active buffs! | Docking ship synchronizes with active ship's upgrades. |
| `dual` | Twin locked hulls, $32\times16$ | Twin streams (or 6 streams with Scatter), base quota 4 (up to 16 with Rapid/Scatter) | Upgrades apply to **both hulls** simultaneously! |
| `destroyed` | Exploding (1.2s delay) | Firing inhibited | Temporary buff timers cleared upon death; EMP count retained. |
| `respawning` | 3.0s blinking invulnerability | Firing enabled; immune to damage | Starts clean single fighter state. |

---

### 6.2 Asymmetrical Damage Preservation & Shield Stacking

```
                          Threat Collides with Dual Fighter
                                         |
                                         v
                         +-------------------------------+
                         | Is Kinetic Shield Active?     |
                         | (player.shieldHp > 0)         |
                         +---------------+---------------+
                                         |
                    YES                  |                  NO
                     |                   |                   |
                     v                   |                   v
       +---------------------------+     |     +---------------------------+
       | Consume 1 Shield Charge   |     |     | Check Colliding Hull(s)   |
       | shieldHp--                |     |     +-------------+-------------+
       | Trigger Shield Ping SFX   |     |                   |
       | Spawn Deflection Sparks   |     |     +-------------+-------------+
       | Grant 0.25s Grace Frame   |     |     |             |             |
       +-------------+-------------+     |     v             v             v
                     |                   |  Left Only   Right Only    Both (Center)
                     v                   |     |             |             |
       +---------------------------+     |     v             v             v
       | BOTH HULLS PRESERVED!     |     |  Explode L    Explode R     Catastrophic
       | Dual Fighter stays intact |     |  Shift X +8   Shift X -8    Dual Loss
       | Upgrades Stay Full Dual   |     |  State=NORMAL State=NORMAL  destroy()
       +---------------------------+     |  Lives Intact Lives Intact  Lives -1
                                         |  Buffs Kept   Buffs Kept    Respawn
```

1. **Left Hull Hit with Shield Active**:
   - The shield absorbs the laser or diving alien entirely.
   - Result: `shieldHp = 0`. Left hull is **not destroyed**. Dual Fighter remains docked, maintaining dual firepower.
2. **Left Hull Hit with Shield Inactive**:
   - Classic Galaga asymmetrical destruction:
   - Left hull explodes (`onExplode(x - 8, y, true)`).
   - Surviving Right Hull becomes a Single Fighter.
   - Center shifts by $+8\text{ px}$ ($x = x + 8$).
   - **Crucial Invariant**: Active buffs (Rapid Fire, Scatter Shot, Engine Booster) are **NOT lost**! The pilot retains all active upgrade timers, which gracefully adapt to single-fighter parameters (e.g. 6 streams $\to$ 3 streams; quota 8 $\to$ 4).
3. **Rescued Fighter Convergence & Docking**:
   - When a rescued fighter completes its descent and docks (`Player.onDocked()`):
   - The state transitions from `docking` to `dual`.
   - If Single Fighter had Scatter Shot active, the newly formed Dual Fighter immediately unlocks **6-stream volleys**.
   - If Single Fighter had Kinetic Deflector active, the shield bubble dynamically expands to encapsulate both hulls ($38\text{ px} \times 20\text{ px}$).

---

### 6.3 Stacking Synergy Matrix (All 5 Upgrades $\times$ Dual Fighter)

| Active Upgrades | Single Fighter Performance | Dual Fighter Performance (Docked) |
|---|---|---|
| **Baseline (None)** | 1 stream, 120ms CD, Quota = 2, Speed = 260 px/s | 2 parallel streams, 120ms CD, Quota = 4, Speed = 260 px/s |
| **Rapid Fire** | 1 stream, 60ms CD, Quota = 4 | 2 parallel streams, 60ms CD, Quota = 8 (Devastating burst) |
| **Scatter Shot** | 3-way spread ($-15^\circ, 0^\circ, +15^\circ$), Quota = 6 | **Twin 3-way spreads (6 streams)**, Quota = 12 (Screen blanket) |
| **Rapid Fire + Scatter** | 3-way spread, 60ms CD, Quota = 8 | **6 streams at 60ms cadence**, Quota = 16 (Extreme firepower) |
| **Engine Booster** | Speed = 390 px/s ($+50\%$), agile dodging | Speed = 390 px/s, offsets double-width vulnerability |
| **Kinetic Deflector** | Absorbs 1 hit (Single $20\text{px}$ bubble) | Absorbs hit protecting both hulls ($38\text{px}$ oval) |
| **EMP Bomb** | Clears bullets, stuns divers, shockwave | Clears bullets, stuns divers, protects wide dual hull |
| **FULL STACK (All 5)** | 3-way 60ms spray, 390 px/s, 1-hit shield, EMP stored | **6-stream 60ms barrage, 390 px/s, shielded dual hull, EMP stored** |

---

## 7. Cross-System Integration & Event Wiring

### 7.1 Wiring into `src/core/Game.ts`

1. **`Game.resolveCollisions()` Extension**:
   - Check player bounding box vs active falling `PowerUpItem`s:
     ```typescript
     this.powerUpManager.update(dt, this.player);
     // Handled in PowerUpManager collision check
     ```
2. **`Player.onFire` Handler Extension**:
   - Update `Game.ts:227`:
     ```typescript
     this.player.onFire = (spawns) => {
       const quota = this.player.getMaxMissileQuota();
       for (const s of spawns) {
         this.bulletManager.firePlayerBulletWithVector(
           s.x,
           s.y,
           s.vx,
           s.vy,
           quota
         );
         this.scoreManager.recordShotFired(1);
       }
       this.player.activeMissileCount = this.bulletManager.getPlayerBulletCount();

       if (this.player.isDual) {
         this.soundSynth.playLaserDual();
       } else {
         this.soundSynth.playLaser();
       }
     };
     ```
3. **Shield Deflection Audio & Particle Wire**:
   - In `Game.ts` constructor / player init:
     ```typescript
     this.player.onShieldDeflect = (x, y) => {
       this.soundSynth.playShieldDeflect();
       this.particleSystem.spawnShieldDeflect(x, y);
     };
     ```
4. **EMP Bomb Trigger Wire**:
   - In `Game.update(dt)` or `InputHandler`:
     ```typescript
     if (this.input.bomb || this.input.touchBomb) {
       this.triggerEmpBomb();
     }
     ```
   - When EMP triggers:
     ```typescript
     public triggerEmpBomb(): boolean {
       if (this.player.empBombCount <= 0) return false;
       this.player.empBombCount--;

       // 1. Clear enemy bullets
       this.bulletManager.clearEnemyBulletsWithEffect((x, y) => {
         this.particleSystem.spawnHitSpark(x, y);
       });

       // 2. Stun diving enemies
       this.formationManager.stunDivingEnemies(3.0);

       // 3. Shockwave FX & Sound
       this.particleSystem.spawnEmpShockwave(this.player.x, this.player.y);
       this.soundSynth.playEmpBlast();

       return true;
     }
     ```

### 7.2 Procedural Audio Contracts (`src/audio/SoundSynth.ts`)

```typescript
/**
 * Procedural Crystalline Ping for Kinetic Shield Deflection:
 * Frequency sweep 1400Hz -> 2400Hz (triangle wave) with fast exponential decay (0.15s).
 */
public playShieldDeflect(): boolean {
  const ctx = this.audioManager.getContext();
  const sfxBus = this.audioManager.getSfxGain();
  if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1400, now);
  osc.frequency.exponentialRampToValueAtTime(2400, now + 0.12);

  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc.connect(gain);
  gain.connect(sfxBus);

  osc.start(now);
  osc.stop(now + 0.15);
  return true;
}

/**
 * Procedural EMP Blast Shockwave:
 * Sub-sine drop 120Hz -> 35Hz + bandpassed noise crackle burst over 0.6s.
 */
public playEmpBlast(): boolean {
  const ctx = this.audioManager.getContext();
  const sfxBus = this.audioManager.getSfxGain();
  if (!ctx || !sfxBus || this.audioManager.getIsMuted()) return false;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(35, now + 0.6);

  oscGain.gain.setValueAtTime(0.6, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

  osc.connect(oscGain);
  oscGain.connect(sfxBus);

  osc.start(now);
  osc.stop(now + 0.6);
  return true;
}
```

---

## 8. Testing & Verification Plan

### 8.1 Vitest Unit Test Architecture (`tests/unit/upgrades_dual_synergy.test.ts`)

1. **Rapid Fire & Quotas**:
   - Single Fighter: Verifies `attemptFire()` allows 4 consecutive bullets with 60ms cadence.
   - Dual Fighter: Verifies `attemptFire()` allows 8 missiles (4 pairs) on screen simultaneously.
   - Cooldown timer decreases by exactly `dt` and throttles shots within 0.06s.
2. **Scatter / Triple Shot Ballistics**:
   - Single Fighter: Verifies `onFire` receives 3 spawn requests ($vx \approx \pm 124.23\text{ px/s}, vy \approx -463.64\text{ px/s}, 0\text{ px/s}$).
   - Dual Fighter: Verifies `onFire` receives exactly 6 spawn requests (3 originating at $x - 8$, 3 at $x + 8$).
   - Trigonometric vector normalization test: $\sqrt{vx^2 + vy^2} = 480 \pm 0.01$.
3. **Kinetic Deflector Shield & Asymmetrical Damage**:
   - Single Fighter: Hit with threat when `shieldHp = 1` $\to$ returns `false`, `shieldHp` becomes 0, ship is NOT destroyed (`lives = 3`). Next hit $\to$ ship destroyed (`lives = 2`).
   - Dual Fighter: Hit left hull when `shieldHp = 1` $\to$ returns `false`, `shieldHp = 0`, left hull is NOT destroyed! Dual Fighter state is preserved.
   - Dual Fighter: Hit left hull when `shieldHp = 0` $\to$ left hull destroyed, center shifts to $+8$, state becomes `normal`, lives preserved.
   - Dual Fighter: Large threat spanning both hulls when `shieldHp = 1` $\to$ shield absorbs, both hulls survive!
4. **Engine Booster Kinematics**:
   - Updates player with `moveRight: true` for 0.1s.
   - Baseline speed ($260\text{ px/s}$) $\to x$ advances $26.0\text{ px}$.
   - Boosted speed ($390\text{ px/s}$) $\to x$ advances $39.0\text{ px}$ (exact $1.5\times$ scaling).
5. **EMP Smart Bomb Mechanics**:
   - Spawns 10 enemy bullets in `BulletManager`.
   - Fires EMP $\to$ enemy bullet count drops to 0, callback triggers 10 hit spark notifications.
   - Stuns 3 diving enemies $\to$ enemies enter stun state for 3.0s, dive coordinates freeze.
6. **Classic Dual Fighter Docking Synergy**:
   - Single Fighter collects Rapid Fire + Scatter Shot.
   - Initiates tractor beam rescue docking $\to$ rescued ship converges and completes docking.
   - Resulting Dual Fighter immediately fires 6-stream volleys with 60ms cooldown up to 16-bullet quota!

---

## 9. Conclusion

This architecture provides an authentic, mathematically sound, zero-allocation upgrade subsystem that compounds naturally with Galaga's legendary Dual Fighter mechanic. The implementer has unambiguous blueprints for all state transitions, ballistics vectors, and defensive interception pipelines.
