# Authentic Arcade Galaga Game Mechanics: Comprehensive Technical Specification

**Document Version**: 1.0.0  
**Author**: `survey_explorer_1` (Arcade Galaga Game Mechanics Specialist)  
**Target Platform**: HTML5 Canvas 2D / TypeScript / Vite / Web Audio API  

---

## Executive Summary

This document provides an exhaustive, authoritative technical specification of authentic Namco *Galaga* (1981) arcade game mechanics. It translates arcade hardware behaviors, timing sequences, coordinate systems, state machines, Bézier curve flight paths, scoring logic, and audio-visual cues into actionable, modern TypeScript/Canvas software designs.

---

## 1. Coordinate System & Screen Space Layout

### 1.1 Virtual Resolution & Aspect Ratio
The authentic Galaga arcade cabinet operates on a vertical (TATE) aspect ratio of **3:4** (or **4:3 vertical**, native CRT resolution: $224 \times 288$ pixels). For modern desktop and mobile browsers, the engine standardizes on an internal virtual canvas coordinate space:

- **Virtual Width ($W$)**: `448 px` (Scaled $2\times$ from $224$)
- **Virtual Height ($H$)**: `576 px` (Scaled $2\times$ from $288$)
- **Canvas Scaling**: Aspect-fit with integer/crisp pixel scaling (`imageRendering: 'pixelated'`) and black side-pillarboxing.
- **Coordinate Origin $(0, 0)$**: Top-left corner of the playable area.

### 1.2 Screen Zones

| Screen Zone | Y Range (Virtual Px) | Description |
|---|---|---|
| **HUD / Score Bar** | $0 \le Y < 32$ | 1UP score, HIGH SCORE, 2UP score |
| **Upper Staging / Formation** | $32 \le Y < 220$ | 5 rows $\times$ 10 columns grid for idle & breathing enemies |
| **Mid-Air Combat Zone** | $220 \le Y < 480$ | Dive flight paths, loop-de-loops, tractor beam activation |
| **Player Baseline** | $480 \le Y \le 520$ | Player ship movement baseline ($Y_{\text{player}} = 500\text{px}$) |
| **Bottom Status Bar** | $520 < Y \le 576$ | Remaining lives icons (bottom-left), Stage badges (bottom-right) |

---

## 2. Enemy Types, Hierarchy & Behaviors

The classic Galaga formation consists of **40 enemies** arranged in a $5$-row grid:

```
Row 0 (Top):     [B] [B] [B] [B]                 (4 Boss Galaga)
Row 1:         [G] [G] [G] [G] [G] [G] [G] [G]   (8 Goei - Red Butterfly)
Row 2:         [G] [G] [G] [G] [G] [G] [G] [G]   (8 Goei - Red Butterfly)
Row 3:       [Z] [Z] [Z] [Z] [Z] [Z] [Z] [Z] [Z] [Z] (10 Zako - Blue Bug)
Row 4:       [Z] [Z] [Z] [Z] [Z] [Z] [Z] [Z] [Z] [Z] (10 Zako - Blue Bug)
```

### 2.1 Enemy Type Specifications

```typescript
export enum EnemyType {
  ZAKO = 'ZAKO',           // Blue Bug (Bottom 2 rows)
  GOEI = 'GOEI',           // Red Butterfly (Middle 2 rows)
  BOSS = 'BOSS',           // Green/Blue Galaga Commander (Top row)
  TRANSFORM = 'TRANSFORM', // Morph sub-bosses (Stage 4+)
  CAPTURED_FIGHTER = 'CAPTURED_FIGHTER' // Hostile red fighter under alien control
}

export enum EnemyState {
  IN_FORMATION = 'IN_FORMATION',
  ENTERING = 'ENTERING',
  DIVING_SOLO = 'DIVING_SOLO',
  DIVING_ESCORT = 'DIVING_ESCORT',
  TRACTOR_BEAM_ACTIVE = 'TRACTOR_BEAM_ACTIVE',
  RETURNING_TO_FORMATION = 'RETURNING_TO_FORMATION',
  EXPLODING = 'EXPLODING',
  CAPTURED_HOSTILE = 'CAPTURED_HOSTILE'
}
```

#### Detailed Breakdown:

1. **Zako (Blue Bug / Yellow Tips)**:
   - **Visuals**: Blue carapace with yellow antennas and wings. In formation, wings flutter. When diving, turns yellow/orange accented.
   - **Hit Points**: $1\text{ HP}$.
   - **Dive Behavior**: Peels off formation, executes a small loop, swoops downward while targeting the player ship's horizontal position, fires $1\text{--}2$ red bullets. If reaching bottom of screen ($Y > H$), wraps around to top ($Y < 0$) and re-enters formation slot.
   - **Points**: $50\text{ pts}$ in formation, $100\text{ pts}$ during dive.

2. **Goei (Red/Yellow Butterfly)**:
   - **Visuals**: Red body with wide yellow-tipped wings.
   - **Hit Points**: $1\text{ HP}$.
   - **Dive Behavior**: Performs high-speed acrobatics. Often dives in synchronized pairs. Executes mid-screen spiral loops ($360^\circ$ corkscrew flip) while spraying bullets downward.
   - **Morph Capability (Stage 4+)**: When diving in later stages, Goei can split/morph into 3 bonus alien shapes (Scorpion, Bosconian Spy Ship, Galaxian Flagship) which award $160\text{ to }3,000\text{ pts}$ when all 3 are destroyed.
   - **Points**: $80\text{ pts}$ in formation, $160\text{ pts}$ during dive.

3. **Boss Galaga (Green/Blue Flagship)**:
   - **Visuals**: Large green horned commander with pulsating blue core.
   - **Hit Points**: $2\text{ HP}$.
     - Hit 1: Changes color from **Green** to **Navy Blue / Dark Blue** with hit flash.
     - Hit 2: Fully destroyed with major explosion animation ($4\times4$ expanding blast).
   - **Dive Behavior**:
     - *Solo Dive*: Peels off and swoops down, firing aimed dual bullets.
     - *Escort Dive*: Dives flanked by $1$ or $2$ Goei fighters. Goei protect the Boss and fire outward.
     - *Tractor Beam Dive*: Dives to $Y \approx 180\text{--}240\text{px}$, halts vertical progression, expands tractor beam downwards.
   - **Points**:
     - In Formation: $150\text{ pts}$
     - Diving Solo: $400\text{ pts}$
     - Diving with 1 Escort (Boss destroyed): $800\text{ pts}$
     - Diving with 2 Escorts (Boss destroyed): $1,600\text{ pts}$

---

## 3. Tractor Beam & Dual Fighter System

The Tractor Beam and Dual Fighter rescue system is the defining strategic mechanic of Galaga.

```
+-------------------------------------------------------------+
|               BOSS GALAGA (Diving State)                    |
|             Halts at Y ≈ 200px, emits Beam                  |
+-------------------------------------------------------------+
                              \  /
                               \/ (Expanding Pulsating Beam)
                              /  \
                             /    \
                            /      \
                           /        \
+-------------------------/----------\------------------------+
|                      [PLAYER SHIP]                          |
|                  Trapped inside beam cone                   |
+-------------------------------------------------------------+
                              |
                              v (Trapped Event)
+-------------------------------------------------------------+
| 1. Control disabled; Ship rotates 360° continuously.         |
| 2. Ascends into Boss; Sprite turns Red (Alien Controlled).  |
| 3. If Extra Lives > 0: Life deducted, new ship spawns.      |
|    If Extra Lives == 0: Immediate GAME OVER.                |
| 4. Boss returns to formation carrying the Captured Fighter. |
+-------------------------------------------------------------+
```

### 3.1 Tractor Beam Mechanics & Geometry

- **Activation Condition**: Boss Galaga initiates dive. When reaching $Y \approx 200\text{px}$, it checks if no other Boss is currently projecting a beam and player is alive.
- **Beam Geometry**: An inverted pulsating trapezoid:
  - Top Width: $24\text{px}$ (centered on Boss $X$).
  - Bottom Width: $120\text{px}$ (reaches baseline $Y = 500\text{px}$).
  - Height: $300\text{px}$.
  - Visual: Cycling vertical blue/cyan/white horizontal energy bands (3-frame animation) accompanied by a rising/falling frequency audio tone (`440Hz -> 880Hz` siren sweep).
- **Beam Duration**: $4.5\text{ seconds}$. If player evades, beam collapses and Boss continues dive downward.

### 3.2 Capture Sequence State Machine

```
[Player Normal] ---> (Intersects Beam Cone) ---> [Player Immobilized & Spinning]
                                                          |
                                                          v (Pulls up to Boss)
                                                 [Docked as Red Escort]
                                                          |
                      +-----------------------------------+-----------------------------------+
                      | (Boss in Formation)                                                   | (Boss Dives)
                      v                                                                       v
          [Shooting Boss in Formation]                                           [Shooting Boss during Dive]
                      |                                                                       |
                      v                                                                       v
[Captured Fighter turns HOSTILE "Turncoat"]                             [Captured Fighter FREED / RESCUED]
[Dives to ram player; 1000 pts if shot]                                [Spins down to baseline, docks side-by-side]
                                                                                              |
                                                                                              v
                                                                                    [DUAL FIGHTER MODE ACTIVATED]
```

### 3.3 Complete Rescue & Outcome Rules

| Event Scenario | Result & Gameplay Impact | Points Awarded |
|---|---|---|
| **Boss shot while diving with captured fighter** | **SUCCESSFUL RESCUE**: Boss destroyed. Captured fighter displays "RESCUE", slowly drifts down to player baseline ($Y=500$), and docks side-by-side with active ship $\to$ **DUAL FIGHTER ACTIVATED**. | $800\text{--}1,600\text{ pts}$ for Boss |
| **Captured fighter shot by player during dive** | **TRAGIC LOSS**: Captured ship is destroyed by player fire. Player loses the extra ship permanently. | $1,000\text{ pts}$ |
| **Boss shot in formation while holding fighter** | **ENEMY CONVERSION**: Boss destroyed ($150\text{ pts}$). Captured fighter turns completely hostile ("Alien Fighter"), remains in formation, and later dives as an enemy. | $150\text{ pts}$ (Boss) + $1,000\text{ pts}$ (if hostile fighter destroyed) |
| **Player ship captured when having 0 extra lives** | **GAME OVER**: No backup fighter available to continue the mission. | $0\text{ pts}$ |
| **Dual Fighter hit by enemy/bullet** | **PARTIAL DAMAGE**: Only the side that suffered collision is destroyed. The surviving ship continues as a normal Single Fighter. | N/A |

### 3.4 Dual Fighter Specifications
- **Dimensions**: Width $48\text{px}$ (Single fighter $24\text{px} \times 2$).
- **Firepower**: Fires **2 parallel bullets simultaneously** on each trigger press.
- **Max Bullets on Screen**: **4 bullets** (Single fighter limit is 2).
- **Hitbox**: $44\text{px} \times 24\text{px}$ (higher firepower balanced by doubled exposure to enemy bullets and ramming).

---

## 4. Flight Paths & Bézier Curve Mathematics

In authentic Galaga, all entry maneuvers and dive attacks follow smooth mathematical splines using **Cubic Bézier Curves** linked with $C^1$ derivative continuity.

### 4.1 Cubic Bézier Formulation

A cubic Bézier curve segment is defined by 4 control points $P_0, P_1, P_2, P_3 \in \mathbb{R}^2$:

$$B(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t) t^2 P_2 + t^3 P_3, \quad t \in [0, 1]$$

The velocity vector (first derivative) is:

$$B'(t) = 3(1-t)^2 (P_1 - P_0) + 6(1-t)t (P_2 - P_1) + 3t^2 (P_3 - P_2)$$

The sprite orientation angle $\theta(t)$ (pointing in direction of travel) is:

$$\theta(t) = \operatorname{atan2}(B'_y(t), B'_x(t)) + \frac{\pi}{2}$$

### 4.2 Entry Sub-Wave Trajectories (40 Enemies in 5 Sub-Waves)

At the beginning of each standard stage, enemies enter in 5 distinct groups of 8 ships:

```
Sub-Wave 1: 4 Boss Galaga + 4 Red Goei      --> Enters Top-Center, swoops left/right into loops
Sub-Wave 2: 8 Red Goei                      --> Enters Top-Right, sweeps down-left across screen
Sub-Wave 3: 8 Red Goei / Yellow Zako        --> Enters Top-Left, sweeps down-right across screen
Sub-Wave 4: 8 Yellow Zako                   --> Enters Bottom-Left, loops up into bottom rows
Sub-Wave 5: 8 Yellow Zako                   --> Enters Bottom-Right, loops up into bottom rows
```

#### Canonical Control Points for Entry Paths ($448 \times 576$ space):

```typescript
export interface BezierSpline {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
  duration: number; // in milliseconds (e.g. 1800ms)
}

// Example: Top-Right Entry Swoop & Loop
export const ENTRY_PATH_TOP_RIGHT: BezierSpline[] = [
  // Segment 1: High speed plunge across center
  {
    p0: { x: 380, y: -40 },
    p1: { x: 360, y: 180 },
    p2: { x: 120, y: 260 },
    p3: { x: 100, y: 380 },
    duration: 1200
  },
  // Segment 2: Bottom loop & ascent
  {
    p0: { x: 100, y: 380 },
    p1: { x: 80, y: 460 },
    p2: { x: 260, y: 480 },
    p3: { x: 280, y: 340 },
    duration: 1000
  },
  // Segment 3: Return to formation slot
  {
    p0: { x: 280, y: 340 },
    p1: { x: 300, y: 220 },
    p2: { x: 240, y: 120 },
    p3: { x: 224, y: 80 }, // target formation slot
    duration: 900
  }
];
```

### 4.3 Dive Attack Curves
When an enemy is selected to dive during gameplay:
1. **Peel-off**: The enemy lifts out of formation slot $(x_f, y_f)$, moves slightly upward $P_1 = (x_f, y_f - 24)$.
2. **Looping maneuver**: Executes a $180^\circ\text{ to }360^\circ$ circle to gain acceleration.
3. **Aimed trajectory**: Curve control points $P_2, P_3$ are dynamically computed based on the player's current $X$ position $X_{\text{player}}$:
   $$P_2 = \left( \frac{x_f + X_{\text{player}}}{2}, 320 \right), \quad P_3 = \left( X_{\text{player}} + \Delta, 600 \right)$$
4. **Bottom Wrap-around**: If $Y > 576$, the enemy repositions to $(x_f, -30)$ and descends linearly into its home formation slot.

---

## 5. Waves, Stages & Challenging Stage Progression

### 5.1 Stage Sequence Structure

Galaga follows a rhythmic 4-stage progression cycle:

| Stage # | Stage Type | Description |
|---|---|---|
| **Stage 1** | Standard Stage | Initial baseline difficulty, slow dive speed, low bullet frequency |
| **Stage 2** | Standard Stage | Increased aggression, tractor beam enabled |
| **Stage 3** | **Challenging Stage 1** | Bonus stage, 40 unarmed enemies in 5 flight patterns |
| **Stage 4** | Standard Stage | Introduction of enemy morphing (Goei transforms) |
| **Stage 5** | Standard Stage | Faster dive speeds, high bullet density |
| **Stage 6** | Standard Stage | Extreme aggression |
| **Stage 7** | **Challenging Stage 2** | Bonus stage with faster crossing flight paths |
| **Stage 8--10** | Standard Stages | Advanced enemy patterns |
| **Stage 11** | **Challenging Stage 3** | Bonus stage with figure-8 cross paths |
| **Rule** | **Every 4th Stage** | Stage 3, 7, 11, 15, 19, 23, 27, 31... are Challenging Stages |

### 5.2 Challenging Stage (Bonus Stage) Rules
- **Enemies Total**: Exactly **40 enemies** (5 waves $\times$ 8 enemies).
- **Rules**:
  - Enemies **never fire bullets**.
  - Enemies fly through predetermined acrobatic curves across the screen and exit without entering formation.
  - Player ship is invincible (no collisions with enemies).
- **Scoring Breakdown**:
  - Regular Hit: $100\text{ pts}$ per destroyed enemy.
  - Less than 40 hits: Bonus = $\text{Hits} \times 100\text{ pts}$.
  - **Perfect 40/40 Hits**: **10,000 Points SPECIAL BONUS** + "SPECIAL" / "PERFECT" fanfare.

### 5.3 Stage Badges (Bottom-Right HUD)

The arcade displays milestone badges for the current stage:
- **1-Stage Badge**: Small Blue/White Chevron (1)
- **5-Stage Badge**: Yellow/Red Arrow Badge (5)
- **10-Stage Badge**: Red/Yellow Star or Large Crest (10)
- **20-Stage Badge**: Large Golden Banner (20)
- **30-Stage / 50-Stage Badges**: Composite crests.

---

## 6. Complete Scoring & High Score System

### 6.1 Point Reference Table

| Target Entity | In Formation | Diving Solo | Diving with 1 Escort | Diving with 2 Escorts |
|---|---|---|---|---|
| **Zako (Blue)** | 50 pts | 100 pts | N/A | N/A |
| **Goei (Red)** | 80 pts | 160 pts | N/A | N/A |
| **Boss Galaga (Green/Blue)** | 150 pts | 400 pts | 800 pts | 1,600 pts |
| **Hostile Alien Fighter** | 1,000 pts (dive) | 1,000 pts | N/A | N/A |
| **Transformed Sub-Boss (Morph)** | N/A | 160 -- 3,000 pts (combo) | N/A | N/A |
| **Challenging Stage Enemy** | 100 pts each | 10,000 pts (Perfect 40/40) | N/A | N/A |

### 6.2 Extra Life (Extend) Thresholds
- **1st Extra Life**: At **20,000 points**
- **2nd Extra Life**: At **70,000 points**
- **Subsequent Extra Lives**: Every **70,000 points** thereafter.

### 6.3 LocalStorage Persistence Schema
```typescript
export interface HighScoreRecord {
  highScore: number;
  lastUpdated: string; // ISO 8601 string
  shotsFired: number;
  numberHits: number;
  hitRatio: number; // percentage e.g. 84.5%
}

export const STORAGE_KEYS = {
  HIGH_SCORE: 'galaga_arcade_high_score',
  SETTINGS: 'galaga_arcade_settings'
};
```

---

## 7. Player Controls, Movement & Bullet Physics

### 7.1 Movement Specifications
- **Axis Constraint**: Strictly 1D horizontal movement along bottom baseline $Y = 500\text{px}$.
- **Horizontal Bounds**: $X \in [16, W - 16]$ ($16\text{px}$ margin from screen edges). For Dual Fighter, bounds are $X \in [24, W - 24]$.
- **Movement Speed**: $260\text{ pixels/second}$ (linear instantaneous response with zero momentum/ice-skating).

### 7.2 Bullet Firing Rules & Ammo Constraints
- **Single Fighter Limit**: **Maximum 2 active player missiles** on screen simultaneously.
- **Dual Fighter Limit**: **Maximum 4 active player missiles** on screen simultaneously.
- **Missile Speed**: $750\text{ pixels/second}$ straight up ($\Delta Y = -750 \times \Delta t$).
- **Firing Cooldown / Cadence**: Minimum interval $120\text{ms}$ between trigger presses (or auto-fire ticks), strictly gated by active on-screen missile count.
- **Why this constraint matters**: This creates the signature tactical rhythm of Galaga—players must position close to diving enemies to achieve rapid hits, as bullets recycle immediately upon hitting an enemy!

---

## 8. Web Audio API Procedural Sound Synthesis Architecture

To guarantee 100% reliability with zero missing asset errors, all sound effects and musical jingles are synthesized procedurally via the Web Audio API:

```typescript
export class SoundSynthesizer {
  private ctx: AudioContext;

  // 1. Player Laser Shot: Fast downward frequency ramp (1200Hz -> 300Hz, 80ms)
  playLaser(): void;

  // 2. Enemy Dive Sound: Frequency vibrato / downward pitch sweep
  playDiveTone(frequency: number): void;

  // 3. Tractor Beam Sweep: Cyclic LFO pitch modulation (440Hz <-> 880Hz)
  startTractorBeamSound(): void;
  stopTractorBeamSound(): void;

  // 4. Explosion: White noise buffer through bandpass filter + exponential gain decay
  playExplosion(isBoss: boolean): void;

  // 5. Stage Start Jingles & Perfect Fanfare: Sequence of square wave melody notes
  playStageStartJingle(): void;
  playChallengingStagePerfect(): void;
}
```

---

## 9. Visual Rendering: Procedural Pixel Sprites & Starfield

### 9.1 Multi-Layer Parallax Starfield
- **Total Stars**: 80 stars divided across 3 parallax depth layers:
  - Layer 1 (Distant): 40 dim stars, speed $30\text{ px/s}$, colors: dark blue, dark red.
  - Layer 2 (Mid): 25 medium stars, speed $70\text{ px/s}$, colors: cyan, yellow.
  - Layer 3 (Near): 15 bright stars, speed $140\text{ px/s}$, colors: pure white, blinking frequency $2\text{Hz}$.
- **Warp Effect**: During stage transitions, starfield speed increases $4\times$ to simulate hyperdrive warp.

### 9.2 Pixel-Perfect Entity Matrix Representation
Sprites are represented as binary/indexed color pixel matrices ($16 \times 16$ or $24 \times 16$) scaled up by integer pixel factor, guaranteeing authentic retro arcade visuals without external image loading dependencies.

---

## 10. Summary & Recommended Implementation Modules

| Module Path | Core Responsibility |
|---|---|
| `src/core/GameEngine.ts` | 60 FPS Canvas game loop, stage state machine, lifecycle management |
| `src/core/Starfield.ts` | 3-layer parallax starfield background simulation with warp effect |
| `src/entities/PlayerShip.ts` | Player ship movement, Dual Fighter docking, capture animation |
| `src/entities/MissileManager.ts`| Player/enemy bullet physics, on-screen capacity limit enforcement |
| `src/entities/Enemy.ts` | Base enemy class, hit points, formation breathing, sprite render |
| `src/entities/BossGalaga.ts` | 2-hit state, tractor beam projector, escort dive coordination |
| `src/systems/FlightPathSystem.ts`| Cubic Bézier curves evaluator, entry wave patterns, dive paths |
| `src/systems/TractorBeamSystem.ts`| Tractor beam cone intersection, capture & rescue state machine |
| `src/systems/CollisionSystem.ts`| AABB & circle hit detection, explosions, particle effects |
| `src/systems/ScoreManager.ts` | Point tabulation, bonus extends, LocalStorage persistence |
| `src/audio/SoundSynthesizer.ts` | Pure Web Audio API 8-bit procedural sound effects & music |
| `src/ui/HUD.ts` | 1UP/2UP scores, stage badges, lives icons, Challenging Stage banner |

---
*End of Technical Specification.*
