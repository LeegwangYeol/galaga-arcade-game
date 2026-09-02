# Milestone 5: Capture, Rescue, Turncoat & Dual Docking Mechanics — Architecture & State Machine Specification

**Author**: `m5_explorer_2` (Milestone 5: Capture & Rescue State Machine Specialist)  
**Target Platform**: HTML5 Canvas 2D / TypeScript 5.7+ / Vite 6  
**Document Version**: 1.0.0  
**Date**: 2026-09-02  

---

## Executive Summary

The Tractor Beam, Capture, Turncoat, and Dual Fighter Rescue system represents the central strategic signature of Namco's *Galaga* (1981). This document provides an exhaustive, mathematically rigorous specification and concrete architectural blueprint for implementing all four core operational flows:

1. **Capture Flow**: Trapezoidal beam projection, player immobilization, $4\text{ rot/s}$ ($8\pi\text{ rad/s}$) continuous rotation, ascension along the central beam axis, escort docking to Boss Galaga, life deduction, and active fighter respawning / game over.
2. **Rescue & Dual Docking Flow**: Boss destruction during active dive, escort conversion to freed white fighter, spiral/sinusoidal descent to baseline $Y=250$, seamless flank docking, dual fighter mode activation ($32\text{px}$ twin hulls, 4-missile capacity), and $+1000\text{ pts}$ rescue bonus.
3. **Turncoat Hostile Flow**: Boss destruction *in formation*, trapped escort transformation into an aggressive hostile enemy (`CAPTURED_HOSTILE`), peeling off from formation, and diving at the player (+1000 pts when destroyed).
4. **Accidental Destruction Flow**: Direct player projectile hits on the captured escort (either attached to Boss or diving), instant escort destruction (+500 pts in formation / +1000 pts in dive), permanent loss of the reserve fighter, and Boss escort count synchronization.

---

## 1. System Architecture & Component Interactions

```
+----------------------------------------------------------------------------------------------------+
|                                         GAME LOOP (60 FPS)                                         |
+----------------------------------------------------------------------------------------------------+
       |                                       |                                      |
       v                                       v                                      v
+------------------+                 +---------------------+                +---------------------+
|  TractorBeam     |                 |  Player Entity      |                |  Enemy & Formation  |
|  - Trapezoid Cone| <============== |  - Single/Dual FSM  | <============> |  - Boss Galaga FSM  |
|  - Wave Bands FX | (Trapped Event) |  - Docking FSM      | (Rescue/Damage)|  - Escort Fighter   |
|  - Siren Audio FX|                 |  - 4-Missile Limit  |                |  - Turncoat AI Dive |
+------------------+                 +---------------------+                +---------------------+
                                               |                                      |
                                               v                                      v
                                     +---------------------+                +---------------------+
                                     |  BulletManager      |                |  ScoreManager & HUD |
                                     |  - Swept CCD Hitbox |                |  - 1000 pts Rescue  |
                                     |  - Quota 2 vs 4     |                |  - Extend Checks    |
                                     +---------------------+                +---------------------+
```

### 1.1 Key Subsystem Responsibilities

| Subsystem / File | Responsibilities in Milestone 5 |
|---|---|
| `src/types/index.ts` | Type contracts for `TractorBeamState`, `TractorBeamConfig`, `PlayerState`, `EnemyState`, `EnemyType`, `BulletData`. |
| `src/entities/Player.ts` | Single/Dual state machine, capture spinning ($4\text{ rot/s}$), ascension interpolation, docking convergence, asymmetric hull destruction, 4-missile limit. |
| `src/entities/Enemy.ts` | Boss Galaga tractor dive mode, escort attachment offsets, 2-hit state, `CAPTURED_FIGHTER` entity behaviors (escort vs turncoat vs rescue). |
| `src/entities/TractorBeam.ts` | Trapezoid ray-cast/cone geometry, multi-frequency wave band rendering, pulsing cycle timers, point/box intersection testing. |
| `src/systems/FormationManager.ts` | Escort slot anchoring (Row 0 Boss offset), dive scheduler tractor beam triggers, turncoat peel-off dive initiation. |
| `src/core/Game.ts` | Collision matrix orchestration (bullet vs boss vs escort, beam vs player), score dispatch, life tracking, stage transitions. |

---

## 2. Coordinate System & Geometry Specifications

The game engine operates on a fixed virtual resolution of **$224 \times 288$ pixels** ($3:4$ TATE aspect ratio):

- **Player Baseline**: $Y_{\text{baseline}} = 250\text{px}$.
- **Single Fighter Dimensions**: $16\text{px} \times 16\text{px}$ (Hitbox: $12\text{px} \times 12\text{px}$, centered at $(X, 250)$).
- **Dual Fighter Dimensions**: $32\text{px} \times 16\text{px}$ (Hitbox: Left hull $[X-16, X-1]$, Right hull $[X+1, X+16]$, height $12\text{px}$).
- **Single Fighter Bounds**: $X \in [12, 212]$.
- **Dual Fighter Bounds**: $X \in [16, 208]$.
- **Boss Hover Altitude during Tractor Beam**: $Y_{\text{hover}} = 80\text{px}$.
- **Tractor Beam Cone Geometry**:
  - Top Origin: $(X_{\text{boss}}, Y_{\text{boss}} + 8)$ at $Y_{\text{top}} = 88\text{px}$.
  - Top Width: $W_{\text{top}} = 16\text{px}$ (left: $X_{\text{boss}} - 8$, right: $X_{\text{boss}} + 8$).
  - Bottom Extent: $Y_{\text{bottom}} = 256\text{px}$ (reaches slightly below player baseline).
  - Bottom Width: $W_{\text{bottom}} = 64\text{px}$ (left: $X_{\text{boss}} - 32$, right: $X_{\text{boss}} + 32$).
  - Total Height: $H_{\text{beam}} = 168\text{px}$.

---

## 3. Flow 1: Tractor Beam Capture Mechanics

```
 [Player: 'normal'] 
         |
         | (Enters Beam Trapezoid & not Invulnerable)
         v
 [Player: 'capturing']
   - Control & Weapons: DISABLED
   - Rotation: 4 rot/s (8π rad/s)
   - Ascension: (X_player, 250) -> (X_boss, Y_boss + 12) over 2.0s
         |
         | (Reaches Boss)
         v
 [Player: 'captured']
   - Lives: lives -= 1
   - Escort Entity Spawned: EnemyType.CAPTURED_FIGHTER docked on Boss
   - Active Player Action:
         |-- If lives > 0: Player enters 'respawning' at baseline (X=112, Y=250) after 1.5s delay
         \-- If lives == 0: Immediate 'GAME_OVER'
```

### 3.1 Tractor Beam Activation & Preconditions

Boss Galaga attempts tractor beam deployment when the following conditions are satisfied:
1. **Stage Difficulty**: $\text{Stage} \ge 2$.
2. **Boss Qualification**: Boss is alive, in `IN_FORMATION` state, does **not** already possess a captured fighter (`capturedEscort === null`), and has $\ge 1\text{ HP}$.
3. **Player Qualification**: Player is currently in `normal` / `ALIVE` state (not dual, not respawning/invulnerable, not destroyed, not already capturing).
4. **Concurrency Limit**: Exactly **one** active tractor beam emission across the entire game screen at any instant.
5. **Dive Progression**: Boss peels off, swoops down to $Y_{\text{hover}} = 80\text{px}$, halts vertical translation, and begins beam emission.

### 3.2 Beam Geometry & Intersection Math

The beam is an isosceles trapezoid defined between $Y_{\text{top}}$ and $Y_{\text{bottom}}$. At any given altitude $y \in [Y_{\text{top}}, Y_{\text{bottom}}]$, the horizontal beam half-width $w(y)$ is given by linear interpolation:

$$w(y) = \frac{W_{\text{top}}}{2} + \left( \frac{W_{\text{bottom}} - W_{\text{top}}}{2} \right) \cdot \left( \frac{y - Y_{\text{top}}}{Y_{\text{bottom}} - Y_{\text{top}}} \right)$$

At the player baseline $Y_{\text{player}} = 250$:

$$w(250) = 8 + (32 - 8) \cdot \left( \frac{250 - 88}{168} \right) = 8 + 24 \cdot \frac{162}{168} \approx 31.14\text{ px}$$

The intersection condition for the player ship with core hitbox half-width $h_w = 6\text{px}$:

$$|X_{\text{player}} - X_{\text{boss}}| \le w(Y_{\text{player}}) - h_w$$

If true, the player is trapped inside the tractor beam.

### 3.3 Trapped & Ascension State Physics

Once trapped:
- **Input Gating**: `InputState` is completely ignored (`canFire = false`, `vx = 0`).
- **Rotation Speed**: Exactly $4.0\text{ rotations/second}$ ($1440^\circ/\text{s}$):
  $$\theta(t) = \theta_0 + 8\pi \cdot t \quad (\text{rad})$$
- **Ascension Trajectory**: Duration $T_{\text{ascend}} = 2.0\text{ seconds}$.
  $$\alpha(t) = \min\left(1.0, \frac{t_{\text{capture}}}{T_{\text{ascend}}}\right)$$
  Smooth Hermite ease-in-out interpolation:
  $$s(\alpha) = 3\alpha^2 - 2\alpha^3$$
  $$X(t) = X_{\text{origin}} + (X_{\text{boss}} - X_{\text{origin}}) \cdot s(\alpha)$$
  $$Y(t) = Y_{\text{origin}} + (Y_{\text{boss}} + 12 - Y_{\text{origin}}) \cdot s(\alpha)$$
- **Sprite Rendering**: Rendered using `SpriteRenderer.draw(ctx, 'CAPTURED_FIGHTER', x, y, { rotation: theta })` to show the ship transitioning to alien control.

### 3.4 Docking to Boss & Active Player Respawn

Upon $\alpha(t) \ge 1.0$:
1. The active `Player` entity decrements life: `lives -= 1`.
2. A `CAPTURED_FIGHTER` entity is instantiated/attached to the Boss Galaga:
   - Type: `EnemyType.CAPTURED_FIGHTER`.
   - State: `EnemyState.CAPTURED_ESCORT`.
   - Relative offset from Boss: $\Delta X = 0, \Delta Y = -14\text{px}$ (docked directly above the Boss Galaga's horns).
   - Boss Galaga reference: `boss.capturedEscort = escortEnemy`.
3. Boss Galaga transitions from `TRACTOR_BEAM_ACTIVE` to `RETURNING_TO_FORMATION`, ascending back to its Row 0 grid slot carrying the red fighter.
4. **Respawn Check**:
   - If `lives > 0`: `Player` triggers `respawn()` after a $1.2\text{s}$ delay, appearing at baseline $X=112, Y=250$ with $3.0\text{s}$ blinking invulnerability.
   - If `lives === 0`: `onGameOver?.()` is invoked immediately $\to$ Game State transitions to `GAME_OVER`.

---

## 4. Flow 2: Rescue & Dual Docking Mechanics

```
 [Boss with Escort Dives]
         |
         | (Player Bullet Destroys Boss)
         v
 [Boss Explodes: +800 / +1600 pts]
 [Escort Freed: Turns White, State = 'DOCKING']
         |
         | (Spiral / Gentle Descent: Speed = 100 px/s, Frequency = 1.5 Hz)
         v
 [Escort reaches Y = 250 near Active Player Ship]
         |
         | (Lateral Convergence: targetX = player.x ± 16)
         v
 [Flank Docking Completed]
   - Active Player transitions to 'dual'
   - Hulls: 32px Twin Hulls
   - Weapons: Dual twin-missile firing (4 active missiles max)
   - Bonus: +1000 pts RESCUE BONUS
   - Audio: Docking Chime Fanfare
```

### 4.1 Boss Dive with Escort

When a Boss Galaga holding a captured fighter initiates an attack dive:
- Boss state: `EnemyState.DIVING_ESCORT`.
- Captured Escort state: `EnemyState.DIVING_ESCORT`.
- The escort position is locked to Boss flight path with rigid coordinate transformation:
  $$X_{\text{escort}}(t) = X_{\text{boss}}(t) - 16 \cdot \sin(\theta_{\text{boss}})$$
  $$Y_{\text{escort}}(t) = Y_{\text{boss}}(t) - 16 \cdot \cos(\theta_{\text{boss}})$$
  $$\theta_{\text{escort}}(t) = \theta_{\text{boss}}(t)$$

### 4.2 Rescue Trigger Event (Destroying Diving Boss)

When a player missile hits and destroys the diving Boss Galaga:
1. **Boss Destruction**:
   - Boss health reaches 0 $\to$ `state = EnemyState.EXPLODING`.
   - Score awarded: $800\text{ pts}$ (1 escort) or $1600\text{ pts}$ (2 escorts).
2. **Escort Liberation**:
   - Escort is detached from Boss: `escort.escortBoss = null`.
   - Escort sprite changes from Red (`CAPTURED_FIGHTER`) to pure White (`PLAYER_FIGHTER`).
   - Escort state transitions to `DOCKING` / `RESCUING`.
   - Player receives `+1000 pts` Rescue Bonus immediately (or upon docking touchdown).
   - Audio triggered: `playDockingChime()`.

### 4.3 Rescued Fighter Descent & Docking Trajectory

The liberated fighter descends to baseline $Y=250$:
- **Descent Speed**: $v_y = 100\text{ px/s}$.
- **Harmonic Sway / Spiral**:
  $$X_{\text{sway}}(t) = 14 \cdot \sin(2\pi \cdot 1.5 \cdot t)$$
  $$X_{\text{escort}}(t) = X_{\text{anchor}} + X_{\text{sway}}(t)$$
  $$Y_{\text{escort}}(t) = Y_{\text{boss\_death}} + v_y \cdot t$$
- **Lateral Flank Convergence**:
  As $Y_{\text{escort}} \to 250$, the target slot is determined by active player $X_{\text{player}}$:
  $$\text{targetX} = \begin{cases} X_{\text{player}} - 16, & \text{if } X_{\text{escort}} \le X_{\text{player}} \\ X_{\text{player}} + 16, & \text{if } X_{\text{escort}} > X_{\text{player}} \end{cases}$$
  Smooth lateral convergence:
  $$X_{\text{escort}} \mathrel{+}= (\text{targetX} - X_{\text{escort}}) \cdot \min(1.0, 8.0 \cdot \Delta t)$$

### 4.4 Dual Fighter Docking Touchdown

When $|Y_{\text{escort}} - 250| < 2\text{px}$ and $|X_{\text{escort}} - \text{targetX}| < 4\text{px}$:
1. Rescued fighter entity is deactivated / recycled.
2. Active Player transitions to:
   - `_state = 'dual'`
   - `isDual = true`
   - Center position: $X_{\text{player}} = \text{clamp}((X_{\text{player}} + X_{\text{escort}}) / 2, 16, 208)$.
3. **Dual Fighter Capabilities Activated**:
   - **Width**: $32\text{px}$ ($16\text{px} \times 2$).
   - **Simultaneous Firing**: Every trigger press discharges **2 parallel missiles** at $(X - 8, Y - 8)$ and $(X + 8, Y - 8)$ with velocity $v_y = -480\text{ px/s}$.
   - **Max Missiles On-Screen**: **4 active missiles** (Single fighter limit is 2).
   - **Asymmetric Partial Destruction**: If either left or right hull is struck, the surviving hull continues as a single fighter without losing a life!

---

## 5. Flow 3: Turncoat Hostile Flow Mechanics

```
 [Boss in Formation with Escort]
         |
         | (Player Bullet Destroys Boss in Formation)
         v
 [Boss Destroyed: +150 pts]
 [Escort NOT Rescued -> Turns Hostile ("Turncoat")]
   - Sprite: Red CAPTURED_FIGHTER
   - State: EnemyState.CAPTURED_HOSTILE
   - Action: Breaks formation, dives aggressively toward player X
         |
         v
 [Turncoat Diving Behavior]
   - Dive Path: Aggressive cubic Bézier swoop targeting player X
   - Weapons: Discharges aimed enemy red bullets (180 px/s)
   - On Shot by Player: Destroyed with major blast -> +1000 pts
   - On Screen Wrap: Returns to top formation slot or repeats dive
```

### 5.1 Hostile Conversion Logic

If the player destroys a Boss Galaga *while it is in formation* (Row 0):
1. **Boss Event**: Boss takes fatal damage $\to$ destroys, awarding only formation score ($150\text{ pts}$).
2. **Turncoat Event**:
   - The captured escort is **not** freed because the Boss was not diving.
   - The captured fighter becomes an independent hostile enemy (`CAPTURED_HOSTILE`).
   - Sprite retains Red alien control color (`CAPTURED_FIGHTER`).
   - State changes to `EnemyState.CAPTURED_HOSTILE`.
   - Escort breaks out of the formation grid immediately.
3. **Attack Dive Execution**:
   - FormationManager schedules an immediate dive attack using `FlightPathManager.createSoloDivePath({ x, y }, playerX, isLeft)`.
   - The turncoat fighter fires aimed red bullets at the player during descent.
   - Points awarded if player destroys turncoat: Exactly **$1000\text{ pts}$**.

---

## 6. Flow 4: Accidental Destruction Flow Mechanics

```
 [Boss with Escort in Formation or Diving]
         |
         | (Player Bullet Hits Escort Directly instead of Boss)
         v
 [Accidental Destruction Event]
   - Escort Hitbox hit by Player Missile
   - Escort Explodes (Red/White explosion particles)
   - Score Awarded: +500 pts (in formation) / +1000 pts (during dive)
   - Permanent Loss: Ship cannot be rescued; reserve life permanently gone
   - Boss Galaga: Escort count decremented to 0; continues dive/formation normally
```

### 6.1 Collision Geometry & Priority Resolution

During an escorted dive or in formation, Boss Galaga and Captured Fighter have distinct hitboxes:
- **Boss Galaga Hitbox**: Center $(X_{\text{boss}}, Y_{\text{boss}})$, dimensions $12\text{px} \times 12\text{px}$.
- **Escort Fighter Hitbox**: Center $(X_{\text{escort}}, Y_{\text{escort}})$, dimensions $12\text{px} \times 12\text{px}$.

When a player missile moves upward:
1. If the bullet intersects the **Escort Fighter** hitbox first (or exclusively):
   - Escort is destroyed (`Enemy.takeDamage(1)`).
   - `onExplode` triggered.
   - Score awarded: $1000\text{ pts}$ (if diving) or $500\text{ pts}$ (if in formation).
   - Boss `escortCount` and `capturedEscort` reference are set to `null` / `0`.
   - Boss continues its mission untouched.
2. If the bullet intersects the **Boss Galaga** hitbox:
   - If Boss has 2 HP $\to$ drops to 1 HP (turns Navy Blue, damage flash).
   - If Boss has 1 HP $\to$ Boss destroyed $\to$ Triggers **Rescue Flow** (if diving) or **Turncoat Flow** (if in formation).

---

## 7. Complete State Transition Matrix

### 7.1 Player Entity State Machine

| Current State | Trigger Event | Next State | Actions & Side Effects |
|---|---|---|---|
| `normal` | Beam cone intersection | `capturing` | Inputs disabled, rotation timer reset, anchor origin/target locked. |
| `capturing` | $t_{\text{capture}} \ge 2.0\text{s}$ (reached Boss) | `captured` | `lives -= 1`, spawn `CAPTURED_ESCORT` on Boss. |
| `captured` | `lives > 0` | `respawning` | Respawn at $(112, 250)$ after $1.2\text{s}$, $3.0\text{s}$ invulnerability. |
| `captured` | `lives === 0` | `destroyed` | `onGameOver?.()` invoked $\to$ `GAME_OVER`. |
| `respawning` | $t_{\text{invuln}} \le 0$ | `normal` | Invulnerability expires, full collision enabled. |
| `normal` | Diving Boss destroyed | `docking` | `rescuedFighter.active = true`, white sprite descent, chime audio. |
| `docking` | Rescued fighter reaches baseline | `dual` | Twin hull width $32\text{px}$, 4 missiles max, $+1000\text{ pts}$ bonus. |
| `dual` | Single hull hit (Left/Right) | `normal` | Surviving hull recentered $(\pm 8\text{px})$, 0 lives lost. |
| `dual` | Catastrophic hit (Both hulls) | `destroyed` | `lives -= 1`, death timer $1.2\text{s}$, respawn single fighter. |
| `normal` | Direct threat collision | `destroyed` | `lives -= 1`, death timer $1.2\text{s}$, respawn if lives $>0$. |

### 7.2 Enemy / Escort Entity State Machine

| Enemy Type | Current State | Trigger Event | Next State | Points / Effects |
|---|---|---|---|---|
| `BOSS` | `IN_FORMATION` | Dive scheduler tractor trigger | `DIVING_TRACTOR` | Swoops to $Y=80\text{px}$. |
| `BOSS` | `DIVING_TRACTOR` | Reaches $Y=80\text{px}$ | `TRACTOR_BEAM_ACTIVE`| Emits beam for $4.5\text{s}$, siren SFX. |
| `BOSS` | `TRACTOR_BEAM_ACTIVE`| Player reaches boss | `RETURNING_TO_FORMATION`| Carries escort back to Row 0. |
| `BOSS` | `TRACTOR_BEAM_ACTIVE`| Beam timeout (no capture) | `DIVING_SOLO` | Continues dive downward and loops to formation. |
| `CAPTURED_FIGHTER`| `CAPTURED_ESCORT` | Boss dives | `DIVING_ESCORT` | Flanks Boss during dive attack. |
| `CAPTURED_FIGHTER`| `DIVING_ESCORT` | Boss destroyed during dive | `DOCKING` (Rescued) | Turns White, descends to baseline, docks $\to$ `DUAL`. |
| `CAPTURED_FIGHTER`| `CAPTURED_ESCORT` | Boss destroyed in formation | `CAPTURED_HOSTILE` (Turncoat)| Red sprite, breaks formation, dives at player ($1000\text{ pts}$). |
| `CAPTURED_FIGHTER`| Any | Player bullet hits escort directly | `EXPLODING` | Tragic loss ($500/1000\text{ pts}$), permanent destruction. |

---

## 8. TypeScript Code Blueprint & Interface Contracts

### 8.1 Proposed `src/types/index.ts` Enhancements

```typescript
// Add / Ensure exact tractor beam and capture contracts
export type TractorBeamState =
  | 'INACTIVE'
  | 'EXPANDING'
  | 'EMITTING'
  | 'CAPTURING'
  | 'RETRACTING';

export interface TractorBeamConfig {
  origin: Vector2D;
  topWidth: number;
  bottomWidth: number;
  length: number;
  state: TractorBeamState;
  emissionTimerMs: number;
  capturedPlayerId: string | null;
}

export type PlayerState =
  | 'ALIVE'
  | 'CAPTURING'
  | 'CAPTURED'
  | 'DUAL'
  | 'DESTROYED'
  | 'RESPAWNING'
  | 'DOCKING';

export enum EnemyType {
  ZAKO = 'ZAKO',
  GOEI = 'GOEI',
  BOSS = 'BOSS',
  TRANSFORM = 'TRANSFORM',
  CAPTURED_FIGHTER = 'CAPTURED_FIGHTER'
}

export enum EnemyState {
  IN_FORMATION = 'IN_FORMATION',
  ENTERING = 'ENTERING',
  DIVING_SOLO = 'DIVING_SOLO',
  DIVING_ESCORT = 'DIVING_ESCORT',
  DIVING_TRACTOR = 'DIVING_TRACTOR',
  TRACTOR_BEAM_ACTIVE = 'TRACTOR_BEAM_ACTIVE',
  RETURNING_TO_FORMATION = 'RETURNING_TO_FORMATION',
  EXPLODING = 'EXPLODING',
  CAPTURED_ESCORT = 'CAPTURED_ESCORT',
  CAPTURED_HOSTILE = 'CAPTURED_HOSTILE',
  DOCKING = 'DOCKING',
  INACTIVE = 'INACTIVE'
}
```

### 8.2 Proposed `src/entities/Player.ts` State Machine Implementation Snippets

```typescript
// In Player.ts:
public static readonly CAPTURE_SPIN_SPEED = Math.PI * 8; // 4.0 rotations/sec (8pi rad/s)
public static readonly CAPTURE_DURATION = 2.0; // 2.0s ascension
public static readonly RESCUE_DESCENT_SPEED = 100; // px/s

private updateCapturing(dt: number): void {
  this.captureTimer += dt;
  // Rotate at 4.0 rot/s = 8*PI rad/s
  this.captureAngle += Player.CAPTURE_SPIN_SPEED * dt;

  // Smooth ascension
  const rawProgress = Math.min(1.0, this.captureTimer / Player.CAPTURE_DURATION);
  // Hermite smoothstep: 3*t^2 - 2*t^3
  const smoothProgress = rawProgress * rawProgress * (3 - 2 * rawProgress);

  this.x = this.captureOrigin.x + (this.captureTarget.x - this.captureOrigin.x) * smoothProgress;
  this.y = this.captureOrigin.y + (this.captureTarget.y - this.captureOrigin.y) * smoothProgress;

  if (rawProgress >= 1.0) {
    this._state = 'captured';
    this.lives -= 1;
    this.onCapturedComplete?.();
    if (this.lives > 0) {
      this.respawn();
    } else {
      this.onGameOver?.();
    }
  }
}
```

### 8.3 Proposed `src/entities/TractorBeam.ts` Class Blueprint

```typescript
export class TractorBeam {
  public static readonly TOP_WIDTH = 16;
  public static readonly BOTTOM_WIDTH = 64;
  public static readonly BEAM_HEIGHT = 168; // Y: 88 to 256
  public static readonly DURATION = 4.5; // Seconds

  public x: number = 0;
  public y: number = 88;
  public state: TractorBeamState = 'INACTIVE';
  public timer: number = 0;
  public wavePhase: number = 0;

  public activate(originX: number, originY: number): void {
    this.x = originX;
    this.y = originY + 8;
    this.state = 'EMITTING';
    this.timer = 0;
    this.wavePhase = 0;
  }

  public update(dt: number): void {
    if (this.state === 'INACTIVE') return;

    this.timer += dt;
    this.wavePhase += dt * 8.0; // 8 Hz band animation

    if (this.timer >= TractorBeam.DURATION && this.state === 'EMITTING') {
      this.state = 'RETRACTING';
    }
  }

  public checkPlayerTrapped(playerX: number, playerY: number): boolean {
    if (this.state !== 'EMITTING') return false;
    if (playerY < this.y || playerY > this.y + TractorBeam.BEAM_HEIGHT) return false;

    const progress = (playerY - this.y) / TractorBeam.BEAM_HEIGHT;
    const halfWidth = (TractorBeam.TOP_WIDTH / 2) + 
      (TractorBeam.BOTTOM_WIDTH - TractorBeam.TOP_WIDTH) / 2 * progress;

    return Math.abs(playerX - this.x) <= halfWidth - 4;
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'INACTIVE') return;

    ctx.save();
    // Render multi-frequency pulsating horizontal cyan/white bands
    const bandCount = 14;
    for (let i = 0; i < bandCount; i++) {
      const bandY = this.y + (i / bandCount) * TractorBeam.BEAM_HEIGHT;
      const progress = (bandY - this.y) / TractorBeam.BEAM_HEIGHT;
      const w = TractorBeam.TOP_WIDTH + (TractorBeam.BOTTOM_WIDTH - TractorBeam.TOP_WIDTH) * progress;
      
      const alpha = 0.4 + 0.4 * Math.sin(this.wavePhase + i * 0.8);
      ctx.fillStyle = i % 2 === 0 ? `rgba(0, 255, 255, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
      ctx.fillRect(this.x - w / 2, bandY, w, 3);
    }
    ctx.restore();
  }
}
```

---

## 9. Verification & Test Plan

| Test ID | Target Flow | Test Description | Expected Assertion |
|---|---|---|---|
| `TEST-M5-01` | Capture Flow | Player intersects beam cone | Player state becomes `capturing`, $4\text{ rot/s}$ rotation, ascends to Boss. |
| `TEST-M5-02` | Capture Flow | Player reaches Boss | Lives decrease by 1, `captured` state, auto-respawn if lives $>0$, game over if lives $=0$. |
| `TEST-M5-03` | Rescue Flow | Player shoots diving Boss with escort | Boss explodes (+800/1600 pts), escort turns white, descends to baseline, docks $\to$ `dual`. |
| `TEST-M5-04` | Rescue Flow | Dual Fighter Firing | Fires 2 bullets per trigger at $(X-8, X+8)$, enforces 4-missile on-screen max. |
| `TEST-M5-05` | Turncoat Flow | Player shoots Boss in formation | Boss destroyed (+150 pts), escort becomes `CAPTURED_HOSTILE`, dives at player, $+1000\text{ pts}$ when shot. |
| `TEST-M5-06` | Accidental Loss | Player shoots escort directly | Escort explodes (+500/1000 pts), destroyed permanently, no rescue possible. |
| `TEST-M5-07` | Partial Damage | Left hull struck on Dual Fighter | Left hull explodes, right hull survives, state transitions to `normal`, 0 lives lost. |

---

*End of Milestone 5 Specification.*
