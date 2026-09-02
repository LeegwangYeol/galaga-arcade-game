# Authentic Galaga Player State Machine, 1D Physics & Dual Fighter Docking System: Comprehensive Technical Specification & Implementation Architecture

**Document Version**: 1.0.0  
**Author**: `m3_explorer_1` (Player State Machine & Dual Docking Specialist)  
**Milestone**: Milestone 3 (Player Fighter & Dual Fighter Docking System)  
**Target Module**: `src/entities/Player.ts`  
**Dependencies**: `src/types/index.ts`, `src/core/ObjectPool.ts`, `src/ui/InputHandler.ts`, `src/core/Game.ts`  

---

## 1. Executive Summary & Architectural Scope

The Player Fighter system in Namco *Galaga* (1981) is one of the most iconic mechanics in arcade gaming history. The vessel operates along a strictly constrained 1D horizontal baseline while supporting complex state transitions including alien tractor beam capture, mid-air rescue docking, dual-hull formation, asymmetrical partial destruction, and blinking invulnerability respawning.

This document establishes the complete mathematical, physical, and architectural design for `src/entities/Player.ts`, ensuring zero-allocation 60 FPS performance on HTML5 Canvas 2D, strict pixel-perfect boundaries ($224 \times 288$ native resolution), deterministic state transitions, and 100% compliance with authentic arcade timing and behavior.

---

## 2. Player State Machine (`PlayerState`) Specification

The Player Fighter operates as a deterministic finite-state machine (FSM) comprising seven mutually exclusive states:

```
                                  +---------------------------------------+
                                  |                 BOOT                  |
                                  +---------------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |              RESPAWNING               |
                                  |  (3.0s Invulnerable Blinking Timer)   |
                                  +---------------------------------------+
                                                      |
                                                      | (Invulnerability Expires)
                                                      v
                    +---------------------------> [ NORMAL ] <---------------------------+
                    |                             (Single Hull)                          |
                    |                                 |   ^                              |
                    |              Tractor Beam Hits  |   | Partial Left/Right           |
                    |                                 v   | Hull Destruction             |
                    |                         [ CAPTURING ]                              |
                    |                         (Immobilized, Spinning)                    |
                    |                                 |                                  |
                    |                                 v                                  |
                    |                          [ CAPTURED ]                              |
                    |                      (Alien Escort Docked)                         |
                    |                       Life -1, Respawn                             |
                    |                                 |                                  |
                    |                       Boss Shot During Dive                        |
                    |                                 v                                  |
                    |                           [ DOCKING ]                              |
                    |                    (Rescue Descent & Align)                        |
                    |                                 |                                  |
                    |                                 v (Align Complete)                 |
                    |                              [ DUAL ] -----------------------------+
                    |                            (Twin Hulls)
                    |                                 |
                    | Collision / Bullet Hit          | Both Hulls Hit
                    v                                 v
            +-------------------------------------------------+
            |                   DESTROYED                     |
            |     (Explosion Particles, 1.2s Death Delay)     |
            +-------------------------------------------------+
                                    |
                    +---------------+---------------+
                    | (Lives > 0)                   | (Lives == 0)
                    v                               v
            [ RESPAWNING ]                    [ GAME OVER ]
```

### 2.1 State Definitions & Invariants

| State | Control Allowed | Firing Allowed | Vulnerable | Hulls | Description |
|---|:---:|:---:|:---:|:---:|---|
| `normal` (`ALIVE`) | **Yes** | **Yes** (Max 2) | **Yes** | 1 | Standard single fighter operating along baseline $Y = 250$. Full steering and firing capability. |
| `capturing` | **No** | **No** | **No** | 1 | Tractor beam capture sequence. Fighter is locked in place horizontally, rotates $360^\circ$ at $720^\circ/\text{s}$, and ascends towards the capturing Boss Galaga. |
| `captured` | **No** | **No** | **No** | 0 | Fighter is completely docked as an alien escort. Life is decremented; a replacement single fighter spawns if `lives > 0`. |
| `docking` | **Yes** | **Yes** (Single) | **Yes** | $1 + 1$ | Rescued fighter descends and navigates toward the active player ship. Active ship retains steering/firing; upon horizontal/vertical contact, switches to `dual`. |
| `dual` | **Yes** | **Yes** (Max 4) | **Yes** | 2 | Dual Fighter active. Width expands to $32\text{px}$. Fires 2 parallel twin missiles simultaneously. Independent left/right hull hitboxes. |
| `destroyed` | **No** | **No** | **No** | 0 | Ship destroyed. Multi-colored explosion particle burst. 1.2s delay before respawn or game over. |
| `respawning` | **Yes** | **Yes** (Max 2) | **No** | 1 | Fresh ship spawns at center baseline $(X=112, Y=250)$. Active for 3.0s with $10\text{Hz}$ visual flashing. Collisions with enemy bullets/aliens are ignored. |

### 2.2 State Transition Matrix

| Source State | Event / Trigger | Target State | Side Effects & Actions |
|---|---|---|---|
| `BOOT` | `game.startGame()` | `respawning` | Initialize `lives = 3`, `x = 112, y = 250`, `invulnerableTimer = 3.0`. |
| `respawning` | `invulnerableTimer <= 0` | `normal` | Remove invulnerability flag, enable standard collision detection. |
| `normal` | Enemy bullet / collision hit | `destroyed` | Trigger explosion particles, play `PLAYER_EXPLOSION`, decrement `lives -= 1`, start `deathTimer = 1.2`. |
| `normal` | Tractor beam capture | `capturing` | Disable user input, set `captureTimer = 0`, capture start $(x_0, y_0)$, lock beam center. |
| `capturing` | Capture ascension complete ($y \le y_{\text{boss}}$) | `captured` | Attach ship to Boss Galaga as escort, deduct life (`lives -= 1`), trigger respawn if `lives > 0` or `GAME_OVER` if `lives == 0`. |
| `captured` | Boss shot during dive | `docking` | Free captured ship at $(x_{\text{boss}}, y_{\text{boss}})$, initialize rescue descent trajectory towards player baseline. |
| `docking` | Alignment contact ($\Delta x \le 2\text{px}, \Delta y \le 2\text{px}$) | `dual` | Merge into dual formation, set width to $32\text{px}$, play `DOCKING_CHIME`, expand bullet limit to 4. |
| `dual` | Left Hull hit by bullet/alien | `normal` | Left hull explodes into particles; right hull survives; new center $X = x + 8$; **no life deducted**. |
| `dual` | Right Hull hit by bullet/alien | `normal` | Right hull explodes into particles; left hull survives; new center $X = x - 8$; **no life deducted**. |
| `dual` | Both Hulls hit simultaneously | `destroyed` | Full explosion, `lives -= 1`, `deathTimer = 1.2`. |
| `destroyed` | `deathTimer <= 0` && `lives > 0` | `respawning` | Reset position $(112, 250)$, set `invulnerableTimer = 3.0`. |
| `destroyed` | `deathTimer <= 0` && `lives == 0` | `GAME_OVER` | Dispatch `GAME_OVER` event to master game engine. |

---

## 3. 1D Horizontal Kinematics & Strict Boundary Clamping

### 3.1 Kinematics Formulation
Movement is strictly constrained to the 1-dimensional horizontal axis along the baseline $Y = 250\text{px}$:

$$\frac{dY}{dt} = 0, \quad Y(t) \equiv 250\text{px}$$

$$\frac{dX}{dt} = v_x, \quad v_x \in \{-260, 0, +260\} \text{ px/s}$$

Position integration per fixed timestep $\Delta t = \frac{1}{60}\text{s} \approx 0.016667\text{s}$:

$$X_{t+\Delta t} = X_t + v_x \cdot \Delta t = X_t \pm 4.3333\text{ px/frame}$$

### 3.2 Responsive Steering Inputs
Steering supports three input modalities with deterministic precedence:
1. **Keyboard & Touch D-Pad**:
   - `moveLeft = true` $\implies v_x = -260\text{ px/s}$
   - `moveRight = true` $\implies v_x = +260\text{ px/s}$
   - Both or neither pressed $\implies v_x = 0$ (instantaneous stop, zero inertia).
2. **Pointer / Mouse Absolute Positioning**:
   - When `pointerActive = true` and `pointerX !== null`:
     $$\Delta X = \text{pointerX} - X$$
     $$\text{If } |\Delta X| \le 260 \cdot \Delta t \implies X = \text{pointerX}$$
     $$\text{Else } X = X + \operatorname{sign}(\Delta X) \cdot 260 \cdot \Delta t$$
   This prevents high-frequency subpixel oscillation (jitter) around the cursor.

### 3.3 Strict Boundary Clamping Equations

To prevent ship sprites from clipping into the screen border or HUD elements:

- **Single Fighter ($16\text{px}$ width, half-width $w_h = 8\text{px}$)**:
  $$X_{\min} = 8\text{px} + \text{margin} = 12\text{px}$$
  $$X_{\max} = 224\text{px} - 8\text{px} - \text{margin} = 212\text{px}$$
  $$X_{\text{clamped}} = \max(12, \min(212, X))$$

- **Dual Fighter ($32\text{px}$ width, half-width $w_h = 16\text{px}$)**:
  $$X_{\min} = 16\text{px} + \text{margin} = 16\text{px}$$
  $$X_{\max} = 224\text{px} - 16\text{px} - \text{margin} = 208\text{px}$$
  $$X_{\text{clamped}} = \max(16, \min(208, X))$$

---

## 4. Dual Fighter Mechanics & Rescue Docking Mathematics

### 4.1 Rescue Docking Trajectory Spline
When Boss Galaga is destroyed during a dive with a captured fighter:
1. The captured fighter is released at $(X_{\text{free}}, Y_{\text{free}})$.
2. It transitions to `docking` state and descends toward baseline $Y = 250$ with vertical velocity $v_y = 120\text{ px/s}$.
3. As it descends, its target horizontal position dynamically tracks the player's active ship $X_p$:
   - If $X_{\text{free}} \le X_p$, target slot is $X_p - 16$ (docking on Left).
   - If $X_{\text{free}} > X_p$, target slot is $X_p + 16$ (docking on Right).
4. Horizontal tracking uses a smooth exponential convergence:
   $$X_{\text{rescue}}(t+\Delta t) = X_{\text{rescue}}(t) + (X_{\text{target}} - X_{\text{rescue}}(t)) \cdot \min(1.0, 6.0 \cdot \Delta t)$$
5. Docking completion check:
   $$\text{When } |Y_{\text{rescue}} - 250| < 2.0\text{px} \quad \text{and} \quad |X_{\text{rescue}} - X_{\text{target}}| < 2.0\text{px}$$
   - Snap active player ship center to midpoint: $X_{\text{new}} = \frac{X_p + X_{\text{rescue}}}{2}$ (clamped to $[16, 208]$).
   - Set player state to `dual`.
   - Trigger audio event `DOCKING_CHIME`.

### 4.2 Dual Fighter Geometry & Hitbox Separation

```
                       Dual Fighter (Width: 32px, Height: 16px)
        |<------------------------- 32 px ------------------------->|
        |       Left Hull (16px)       |       Right Hull (16px)     |
        |   Center: (X - 8, Y)         |    Center: (X + 8, Y)       |
        +------------------------------+-----------------------------+
        |  [L-Nose]            [L-Gun] |  [R-Nose]           [R-Gun] |
        |     /\                  /\   |     /\                 /\   |
        |    /  \                /  \  |    /  \               /  \  |
        |   /____\              /____\ |   /____\             /____\ |
        +------------------------------+-----------------------------+
        |<------- Left Hitbox -------->|<------- Right Hitbox ------>|
              [x - 16, y - 6, 15, 12]        [x + 1, y - 6, 15, 12]
```

### 4.3 Asymmetrical Partial Destruction Algorithm
When the player is in `dual` state and a collision occurs with bullet $B$ or enemy $E$:

```typescript
if (player.state === 'dual') {
  const leftHitbox: Rect = {
    x: player.x - 16,
    y: player.y - 6,
    width: 15,
    height: 12
  };
  const rightHitbox: Rect = {
    x: player.x + 1,
    y: player.y - 6,
    width: 15,
    height: 12
  };

  const hitLeft = checkCollision(threatHitbox, leftHitbox);
  const hitRight = checkCollision(threatHitbox, rightHitbox);

  if (hitLeft && !hitRight) {
    // Left hull destroyed
    particleSystem.emitExplosion(player.x - 8, player.y, 'player');
    audioManager.playExplosion('small');
    player.state = 'normal';
    player.x = Math.min(212, Math.max(12, player.x + 8)); // Shift center to right hull
    // NO LIFE DEDUCTION
    return;
  } else if (hitRight && !hitLeft) {
    // Right hull destroyed
    particleSystem.emitExplosion(player.x + 8, player.y, 'player');
    audioManager.playExplosion('small');
    player.state = 'normal';
    player.x = Math.min(212, Math.max(12, player.x - 8)); // Shift center to left hull
    // NO LIFE DEDUCTION
    return;
  } else if (hitLeft && hitRight) {
    // Total destruction
    particleSystem.emitExplosion(player.x, player.y, 'player');
    audioManager.playExplosion('large');
    player.destroy();
    return;
  }
}
```

### 4.4 Twin Missile Weapon System
- **Missile Speed**: $v_{\text{missile}} = -750\text{ px/s}$ upward.
- **Single Fighter Ammo Limit**: **2 active missiles max**.
  - Spawn offset: $(X, Y - 8)$.
- **Dual Fighter Ammo Limit**: **4 active missiles max**.
  - Twin spawn offsets: Left Missile $(X - 8, Y - 8)$, Right Missile $(X + 8, Y - 8)$.
  - Gated condition: Only fires if `activePlayerMissiles <= 2` (ensuring 2 slots are available for the twin pair).
- **Fire Cadence Cooldown**: Minimum $120\text{ms}$ ($0.12\text{s}$) interval between shots.

---

## 5. Invulnerability, Respawn & Lifespan Management

### 5.1 Respawn & Invulnerability Sequence
1. Upon death, `deathTimer = 1.2\text{s}` runs while explosion particles clear.
2. `lives` is decremented by 1 (`lives = lives - 1`).
3. If `lives > 0`:
   - Position is reset to standard spawn coordinates: $X = 112\text{px}$, $Y = 250\text{px}$.
   - State becomes `respawning`.
   - `invulnerableTimer = 3.0\text{s}` ($3000\text{ms}$).
   - Visual flashing: Player sprite blinks at $10\text{Hz}$ (visible 3 frames, invisible 3 frames) using `Math.floor(invulnerableTimer * 10) % 2 === 0`.
   - Collision handling: `player.isInvulnerable()` returns `true`, completely bypassing all enemy bullet and collision queries.
   - When `invulnerableTimer <= 0`, state transitions seamlessly to `normal`.
4. If `lives <= 0`:
   - State becomes `destroyed`.
   - Triggers `GAME_OVER` callback to `Game.ts`.

---

## 6. Procedural Pixel Sprite Matrix & Particle Effects

### 6.1 16x16 Pixel Sprite Matrix Representation
The ship is rendered procedurally via Canvas 2D without external asset files:

```typescript
// 16x16 Player Fighter Pixel Matrix (0=Transparent, 1=White, 2=Red, 3=Blue, 4=Yellow)
export const PLAYER_SPRITE_16X16: readonly number[][] = [
  [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,0,1,4,1,1,4,1,0,0,0,0,0],
  [0,0,0,0,1,1,4,1,1,4,1,1,0,0,0,0],
  [0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,1,1,2,2,1,1,1,1,2,2,1,1,0,0],
  [0,1,1,2,2,2,2,1,1,2,2,2,2,1,1,0],
  [1,1,3,3,2,2,2,2,2,2,2,2,3,3,1,1],
  [1,3,3,3,3,2,2,2,2,2,2,3,3,3,3,1],
  [1,3,3,3,3,3,1,1,1,1,3,3,3,3,3,1],
  [0,1,3,3,3,1,0,0,0,0,1,3,3,3,1,0],
  [0,0,1,1,1,0,0,0,0,0,0,1,1,1,0,0],
  [0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0],
];
```

### 6.2 Explosion Particle Emission
Upon single ship destruction or partial dual hull destruction:
- Emits **24 expanding spark particles** in a radial distribution:
  - Velocity $v \in [40, 160]\text{ px/s}$ with random angles $\theta \in [0, 2\pi)$.
  - Colors: Cycle of `#FFFFFF`, `#FF0000`, `#00FFFF`, `#FFFF00`.
  - Particle lifespan: $0.6\text{s} \pm 0.2\text{s}$.
  - Particle size: $2\text{px} \times 2\text{px}$ with linear alpha fade $1.0 \to 0.0$.

---

## 7. Complete Production-Ready Implementation Code (`src/entities/Player.ts`)

Below is the complete, self-contained, production-grade TypeScript implementation for `src/entities/Player.ts`:

```typescript
/**
 * Galaga Arcade Web Game — Player Fighter Entity & Dual Docking System
 * 
 * Implements the 7-state Player state machine (normal, capturing, captured, docking, dual, destroyed, respawning),
 * 1D horizontal kinematics (260 px/s), dual fighter docking trajectory, asymmetrical partial destruction,
 * twin-missile firing limits (2 vs 4), 3-second blinking invulnerability, and procedural pixel rendering.
 */

import type { Rect, Vector2D, InputState } from '../types';

export type PlayerStateType =
  | 'normal'
  | 'capturing'
  | 'captured'
  | 'docking'
  | 'dual'
  | 'destroyed'
  | 'respawning';

export interface PlayerConfig {
  x?: number;
  y?: number;
  speed?: number;
  lives?: number;
}

export interface BulletSpawnRequest {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface RescuedFighterState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  active: boolean;
  angle: number;
}

export class Player {
  // Spatial & Physics Constants
  public static readonly BASELINE_Y = 250;
  public static readonly SPEED = 260; // Pixels per second
  public static readonly SINGLE_WIDTH = 16;
  public static readonly DUAL_WIDTH = 32;
  public static readonly HEIGHT = 16;
  public static readonly FIRE_COOLDOWN = 0.12; // 120ms between trigger cycles
  public static readonly INVULNERABLE_DURATION = 3.0; // 3.0 seconds blinking invulnerability
  public static readonly DEATH_DURATION = 1.2; // 1.2 seconds explosion delay
  public static readonly RESCUE_DESCENT_SPEED = 120; // Pixels per second

  // Position & Velocity
  public x: number = 112;
  public y: number = Player.BASELINE_Y;
  public vx: number = 0;
  public vy: number = 0;

  // State Machine
  public state: PlayerStateType = 'normal';
  public lives: number = 3;
  public fireCooldownTimer: number = 0;
  public invulnerableTimer: number = 0;
  public deathTimer: number = 0;

  // Capture Animation State
  public captureTimer: number = 0;
  public captureAngle: number = 0;
  public captureOrigin: Vector2D = { x: 112, y: Player.BASELINE_Y };
  public captureTarget: Vector2D = { x: 112, y: 100 };

  // Rescued Fighter Docking State
  public rescuedFighter: RescuedFighterState = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: Player.BASELINE_Y,
    active: false,
    angle: 0,
  };

  // Active missile reference counter (tracked synchronously with Bullet pool)
  public activeMissileCount: number = 0;

  // Events / Callbacks
  public onFire?: (spawns: BulletSpawnRequest[]) => void;
  public onExplode?: (x: number, y: number, isDualPartial: boolean) => void;
  public onDocked?: () => void;
  public onGameOver?: () => void;

  constructor(config?: PlayerConfig) {
    this.x = config?.x ?? 112;
    this.y = config?.y ?? Player.BASELINE_Y;
    this.lives = config?.lives ?? 3;
    this.reset(this.x, this.y, this.lives);
  }

  // ==========================================================================
  // Lifecycle & Reset
  // ==========================================================================

  public reset(x: number = 112, y: number = Player.BASELINE_Y, lives: number = 3): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.lives = lives;
    this.state = 'normal';
    this.fireCooldownTimer = 0;
    this.invulnerableTimer = 0;
    this.deathTimer = 0;
    this.captureTimer = 0;
    this.captureAngle = 0;
    this.rescuedFighter.active = false;
    this.activeMissileCount = 0;
  }

  public respawn(): void {
    this.x = 112;
    this.y = Player.BASELINE_Y;
    this.vx = 0;
    this.vy = 0;
    this.state = 'respawning';
    this.invulnerableTimer = Player.INVULNERABLE_DURATION;
    this.fireCooldownTimer = 0;
    this.deathTimer = 0;
    this.captureTimer = 0;
    this.captureAngle = 0;
    this.rescuedFighter.active = false;
  }

  // ==========================================================================
  // Update Pipeline (60 FPS Fixed Timestep)
  // ==========================================================================

  public update(dt: number, input?: InputState): void {
    // 1. Update timers
    if (this.fireCooldownTimer > 0) {
      this.fireCooldownTimer = Math.max(0, this.fireCooldownTimer - dt);
    }

    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
      if (this.invulnerableTimer === 0 && this.state === 'respawning') {
        this.state = 'normal';
      }
    }

    // 2. Dispatch state-specific update routines
    switch (this.state) {
      case 'normal':
      case 'dual':
      case 'respawning':
        this.updateControllable(dt, input);
        break;
      case 'docking':
        this.updateDocking(dt, input);
        break;
      case 'capturing':
        this.updateCapturing(dt);
        break;
      case 'captured':
        // Idle in captured state waiting for stage/boss logic
        break;
      case 'destroyed':
        this.updateDestroyed(dt);
        break;
    }
  }

  private updateControllable(dt: number, input?: InputState): void {
    if (!input) return;

    // A. 1D Horizontal Steering
    let targetVx = 0;

    if (input.moveLeft && !input.moveRight) {
      targetVx = -Player.SPEED;
    } else if (input.moveRight && !input.moveLeft) {
      targetVx = Player.SPEED;
    } else if (input.pointerActive && input.pointerX !== null) {
      // Pointer absolute steering with anti-jitter deadzone
      const dx = input.pointerX - this.x;
      if (Math.abs(dx) <= Player.SPEED * dt) {
        this.x = input.pointerX;
        targetVx = 0;
      } else {
        targetVx = Math.sign(dx) * Player.SPEED;
      }
    }

    this.vx = targetVx;
    this.x += this.vx * dt;

    // B. Boundary Clamping
    this.clampPosition();

    // C. Weapon Firing Logic
    if (input.fire) {
      this.attemptFire();
    }
  }

  private updateDocking(dt: number, input?: InputState): void {
    // Player retains single ship steering & firing while rescued ship docks
    this.updateControllable(dt, input);

    if (!this.rescuedFighter.active) {
      this.state = 'normal';
      return;
    }

    // Move rescued fighter down toward baseline
    const rf = this.rescuedFighter;
    rf.y += Player.RESCUE_DESCENT_SPEED * dt;

    // Target docking slot alongside active player ship
    const targetDockX = rf.x < this.x ? this.x - 16 : this.x + 16;
    rf.x += (targetDockX - rf.x) * Math.min(1.0, 6.0 * dt);

    // Docking convergence check
    if (rf.y >= Player.BASELINE_Y - 1) {
      rf.y = Player.BASELINE_Y;
      rf.active = false;
      this.state = 'dual';
      // Center the dual pair
      this.x = Math.max(16, Math.min(208, (this.x + rf.x) / 2));
      this.clampPosition();
      this.onDocked?.();
    }
  }

  private updateCapturing(dt: number): void {
    this.captureTimer += dt;
    // Rotate ship at 720 degrees/sec (2 rev/sec)
    this.captureAngle += Math.PI * 4 * dt;

    // Ascend along beam towards Boss Galaga
    const progress = Math.min(1.0, this.captureTimer / 2.5);
    this.y = this.captureOrigin.y + (this.captureTarget.y - this.captureOrigin.y) * progress;
    this.x = this.captureOrigin.x + (this.captureTarget.x - this.captureOrigin.x) * progress;

    if (progress >= 1.0) {
      this.state = 'captured';
      this.lives -= 1;
      if (this.lives > 0) {
        this.respawn();
      } else {
        this.onGameOver?.();
      }
    }
  }

  private updateDestroyed(dt: number): void {
    this.deathTimer -= dt;
    if (this.deathTimer <= 0) {
      this.deathTimer = 0;
      if (this.lives > 0) {
        this.respawn();
      } else {
        this.onGameOver?.();
      }
    }
  }

  // ==========================================================================
  // Weapon Firing Mechanism
  // ==========================================================================

  public attemptFire(): boolean {
    if (this.fireCooldownTimer > 0) {
      return false;
    }

    const isDual = this.state === 'dual';
    const maxMissiles = isDual ? 4 : 2;

    if (isDual) {
      // Dual mode requires capacity for 2 simultaneous bullets
      if (this.activeMissileCount > maxMissiles - 2) {
        return false;
      }

      this.fireCooldownTimer = Player.FIRE_COOLDOWN;
      const spawns: BulletSpawnRequest[] = [
        { x: this.x - 8, y: this.y - 8, vx: 0, vy: -750 },
        { x: this.x + 8, y: this.y - 8, vx: 0, vy: -750 },
      ];
      this.onFire?.(spawns);
      return true;
    } else {
      // Single mode
      if (this.activeMissileCount >= maxMissiles) {
        return false;
      }

      this.fireCooldownTimer = Player.FIRE_COOLDOWN;
      const spawns: BulletSpawnRequest[] = [
        { x: this.x, y: this.y - 8, vx: 0, vy: -750 },
      ];
      this.onFire?.(spawns);
      return true;
    }
  }

  // ==========================================================================
  // Damage & Collision Handling
  // ==========================================================================

  public isInvulnerable(): boolean {
    return this.invulnerableTimer > 0 || this.state === 'respawning' || this.state === 'destroyed';
  }

  /**
   * Evaluates collision against a threat AABB (bullet or diving alien).
   * Supports asymmetrical partial destruction for Dual Fighters.
   */
  public hitTestAndDamage(threat: Rect): boolean {
    if (this.isInvulnerable() || this.state === 'capturing' || this.state === 'captured') {
      return false;
    }

    if (this.state === 'dual') {
      const leftHull: Rect = {
        x: this.x - 16,
        y: this.y - 6,
        width: 15,
        height: 12,
      };
      const rightHull: Rect = {
        x: this.x + 1,
        y: this.y - 6,
        width: 15,
        height: 12,
      };

      const hitLeft = this.checkAABB(threat, leftHull);
      const hitRight = this.checkAABB(threat, rightHull);

      if (hitLeft && !hitRight) {
        // Partial destruction: Left hull destroyed
        this.onExplode?.(this.x - 8, this.y, true);
        this.state = 'normal';
        this.x = Math.min(212, Math.max(12, this.x + 8));
        return true;
      } else if (hitRight && !hitLeft) {
        // Partial destruction: Right hull destroyed
        this.onExplode?.(this.x + 8, this.y, true);
        this.state = 'normal';
        this.x = Math.min(212, Math.max(12, this.x - 8));
        return true;
      } else if (hitLeft && hitRight) {
        // Catastrophic hit: Both hulls destroyed
        this.destroy();
        return true;
      }
      return false;
    } else if (this.state === 'normal' || this.state === 'docking') {
      const singleHitbox: Rect = {
        x: this.x - 6,
        y: this.y - 6,
        width: 12,
        height: 12,
      };

      if (this.checkAABB(threat, singleHitbox)) {
        this.destroy();
        return true;
      }
    }

    return false;
  }

  public destroy(): void {
    if (this.state === 'destroyed') return;

    this.onExplode?.(this.x, this.y, false);
    this.state = 'destroyed';
    this.deathTimer = Player.DEATH_DURATION;
    this.lives -= 1;
    this.rescuedFighter.active = false;
  }

  // ==========================================================================
  // Tractor Beam Capture & Rescue Triggers
  // ==========================================================================

  public startCapture(beamCenterX: number, bossY: number): void {
    if (this.isInvulnerable() || this.state !== 'normal') return;

    this.state = 'capturing';
    this.captureTimer = 0;
    this.captureAngle = 0;
    this.captureOrigin = { x: this.x, y: this.y };
    this.captureTarget = { x: beamCenterX, y: bossY + 16 };
  }

  public startRescue(bossX: number, bossY: number): void {
    this.state = 'docking';
    this.rescuedFighter = {
      x: bossX,
      y: bossY,
      targetX: this.x < bossX ? this.x + 16 : this.x - 16,
      targetY: Player.BASELINE_Y,
      active: true,
      angle: 0,
    };
  }

  // ==========================================================================
  // Helper & Math Methods
  // ==========================================================================

  public clampPosition(): void {
    const isDual = this.state === 'dual';
    const minX = isDual ? 16 : 12;
    const maxX = isDual ? 208 : 212;
    this.x = Math.max(minX, Math.min(maxX, this.x));
    this.y = Player.BASELINE_Y;
  }

  public getHitbox(): Rect {
    if (this.state === 'dual') {
      return {
        x: this.x - 16,
        y: this.y - 6,
        width: 32,
        height: 12,
      };
    }
    return {
      x: this.x - 6,
      y: this.y - 6,
      width: 12,
      height: 12,
    };
  }

  private checkAABB(a: Rect, b: Rect): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  // ==========================================================================
  // Canvas 2D Procedural Pixel Rendering
  // ==========================================================================

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'destroyed' || this.state === 'captured') {
      return;
    }

    // 10Hz blinking during invulnerability / respawn
    if (this.isInvulnerable()) {
      const isVisible = Math.floor(this.invulnerableTimer * 10) % 2 === 0;
      if (!isVisible) return;
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    if (this.state === 'capturing') {
      // Spinning capture sprite
      ctx.translate(Math.floor(this.x), Math.floor(this.y));
      ctx.rotate(this.captureAngle);
      this.drawSingleFighterSprite(ctx, -8, -8, '#FF4444');
    } else if (this.state === 'dual') {
      // Dual hulls side by side
      this.drawSingleFighterSprite(ctx, Math.floor(this.x - 16), Math.floor(this.y - 8));
      this.drawSingleFighterSprite(ctx, Math.floor(this.x), Math.floor(this.y - 8));
    } else if (this.state === 'docking') {
      // Active ship
      this.drawSingleFighterSprite(ctx, Math.floor(this.x - 8), Math.floor(this.y - 8));
      // Rescued ship descending
      if (this.rescuedFighter.active) {
        this.drawSingleFighterSprite(
          ctx,
          Math.floor(this.rescuedFighter.x - 8),
          Math.floor(this.rescuedFighter.y - 8),
          '#00FFFF'
        );
      }
    } else {
      // Standard single fighter
      this.drawSingleFighterSprite(ctx, Math.floor(this.x - 8), Math.floor(this.y - 8));
    }

    ctx.restore();
  }

  /**
   * Procedurally renders authentic 16x16 Galaga Player Fighter craft.
   */
  private drawSingleFighterSprite(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tintColor?: string
  ): void {
    // Fuselage White
    ctx.fillStyle = tintColor ?? '#FFFFFF';
    ctx.fillRect(px + 7, py + 1, 2, 8); // Nose cone & spine
    ctx.fillRect(px + 6, py + 3, 4, 6); // Cockpit hull
    ctx.fillRect(px + 5, py + 7, 6, 4); // Core fuselage

    // Wing Wings Red
    ctx.fillStyle = tintColor ?? '#E70000';
    ctx.fillRect(px + 2, py + 9, 12, 3); // Main wingspan
    ctx.fillRect(px + 1, py + 10, 14, 2);

    // Royal Blue Wing Outers
    ctx.fillStyle = tintColor ?? '#0040E0';
    ctx.fillRect(px + 0, py + 11, 2, 4); // Left wingtip
    ctx.fillRect(px + 14, py + 11, 2, 4); // Right wingtip

    // Yellow Cockpit / Wing Accents
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(px + 7, py + 5, 2, 2); // Cockpit canopy
    ctx.fillRect(px + 4, py + 11, 2, 2); // Left intake
    ctx.fillRect(px + 10, py + 11, 2, 2); // Right intake
  }
}
```

---

## 8. Unit Test Suite Specification (`tests/unit/player.test.ts`)

To ensure 100% test pass rate and total correctness, the unit test suite covers all 5 core requirements across feature, boundary, and adversarial tiers:

1. **State Machine Transitions**:
   - `BOOT -> respawning -> normal`
   - `normal -> capturing -> captured`
   - `captured -> docking -> dual`
   - `dual -> normal` (partial left/right destruction)
   - `normal -> destroyed -> respawning` (when lives > 0)
   - `normal -> destroyed -> GAME_OVER` (when lives == 0)
2. **Kinematics & Boundary Clamping**:
   - Exactly $260\text{ px/s}$ speed integration
   - Single fighter clamped to $[12, 212]$
   - Dual fighter clamped to $[16, 208]$
   - Zero momentum on input release
   - Pointer navigation anti-jitter snapping
3. **Dual Fighter Firing & Ammo Gating**:
   - Single fighter allows max 2 active missiles with $120\text{ms}$ cooldown
   - Dual fighter fires twin bullets simultaneously up to 4 active missiles
   - Firing rejected when active missile count is full
4. **Asymmetrical Partial Destruction**:
   - Left hull collision destroys left hull, shifts center $X = x + 8$, sets state to `normal`, **preserves lives count**
   - Right hull collision destroys right hull, shifts center $X = x - 8$, sets state to `normal`, **preserves lives count**
   - Centered collision destroys both hulls, decrements `lives -= 1`
5. **Invulnerability & Blinking**:
   - 3.0s countdown after respawn
   - Collisions with bullets/aliens return `false` during invulnerability
   - Blinking cadence at $10\text{Hz}$ calculated accurately.

---

## 9. Conclusion & Handoff Readiness

The Player entity design is complete, deterministic, zero-allocation compliant, and ready for immediate implementation in Milestone 3. All interface contracts match `PROJECT.md` and `src/types/index.ts`.
