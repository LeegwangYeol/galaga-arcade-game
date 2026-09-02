# Milestone 1: Package & Boilerplate Architecture Analysis

**Agent**: `m1_explorer_3` (Package & Boilerplate Specialist)  
**Milestone**: Milestone 1 (Project Setup & Foundation)  
**Date**: 2026-09-02  
**Target Platform**: Vite 6 / TypeScript 5.7+ / HTML5 Canvas 2D / Web Audio API / Vercel  

---

## 1. Executive Summary & Objective

The primary objective of this investigation is to provide a complete, robust, and zero-defect architectural blueprint for:
1. **The Project Directory Layout**: Standardized directory structure across `src/` and `tests/` matching `PROJECT.md`.
2. **The Core Type System (`src/types/index.ts`)**: Exhaustive, fully typed TypeScript contracts covering all 8 subsequent milestones (math, geometry, game state machine, player single/dual fighter, enemy formation/diving, Bézier flight curves, tractor beam capture, procedural Web Audio synth, HUD/scoring, input handling, and zero-allocation object pools).
3. **The Application Entry Point (`src/main.ts`)**: Production-ready initialization script that mounts the HTML5 Canvas, establishes the fixed virtual resolution coordinate pipeline ($224 \times 288$ native portrait arcade format), attaches dynamic letterbox/pillarbox responsive scaling, renders an authentic arcade startup state, and logs diagnostic messages for automated browser testing.
4. **Build & Typecheck Guarantee**: Ensuring that upon executing the Milestone 1 implementation, both `npm run build` (`vite build`) and `npm run typecheck` (`tsc --noEmit`) will succeed with 0 errors and 0 warnings under strict TypeScript compiler rules (`strict: true`, `noUncheckedIndexedAccess: true`).

---

## 2. Directory Architecture & Layout Verification

### 2.1 Complete Directory Hierarchy

The project structure strictly adheres to the specifications defined in `PROJECT.md`:

```
/Users/user/src/galog/
├── index.html                   # HTML entry with viewport & styling
├── package.json                 # Project scripts and dependencies
├── tsconfig.json                # Strict TypeScript configuration
├── vite.config.ts               # Vite static build configuration
├── vercel.json                  # Vercel deployment & security headers
├── .gitignore                   # Git ignore rules
├── src/
│   ├── main.ts                  # Canvas bootstrap, letterbox scaling & lifecycle
│   ├── types/
│   │   └── index.ts             # Comprehensive global type system
│   ├── core/
│   │   ├── Game.ts              # Master game coordinator & state transitions
│   │   ├── GameLoop.ts          # Fixed-timestep accumulator loop (60 FPS)
│   │   ├── ScreenManager.ts     # Canvas virtual resolution & letterbox manager
│   │   └── ObjectPool.ts        # Zero-allocation generic memory pool
│   ├── math/
│   │   ├── Vector2.ts           # 2D vector primitives & operations
│   │   ├── Bezier.ts            # Cubic Bézier spline evaluator & tangent angles
│   │   └── Collision.ts         # AABB and circular collision detection
│   ├── entities/
│   │   ├── Player.ts            # Single & dual fighter entity logic
│   │   ├── Bullet.ts            # Player missiles & enemy projectiles
│   │   ├── Enemy.ts             # Zako, Goei, Boss Galaga entities
│   │   └── TractorBeam.ts       # Boss tractor beam cone & capture logic
│   ├── systems/
│   │   ├── FormationManager.ts  # 5-row grid formation, breathing oscillation
│   │   ├── FlightPathManager.ts # Entry swoops & dynamic attack dive paths
│   │   ├── Starfield.ts         # 3-layer parallax twinkling starfield
│   │   ├── ParticleSystem.ts    # Explosion sparks and debris particles
│   │   └── ScoreManager.ts      # Score, high score localStorage, extra lives
│   ├── audio/
│   │   ├── AudioContextManager.ts # Web Audio API unlock & master gain
│   │   ├── SoundSynth.ts        # Procedural SFX oscillators & noise generators
│   │   └── MusicJingles.ts      # Procedural chiptune melodies & fanfares
│   └── ui/
│       ├── HUD.ts               # 1UP, HIGH SCORE, lives & stage badge rendering
│       ├── InputHandler.ts      # Keyboard, mouse, and mobile touch virtual controls
│       └── Screens.ts           # Title, Pause, Challenging Stage & Game Over screens
├── tests/
│   ├── unit/
│   │   ├── math.test.ts         # Vector2, Bézier curves, collision tests
│   │   ├── state.test.ts        # Game state machine transition tests
│   │   ├── score.test.ts        # Scoring & localStorage persistence tests
│   │   └── entities.test.ts     # Player single/dual, tractor beam tests
│   └── e2e/
│       ├── browser.test.ts      # Headless browser load, 0 console error tests
│       └── gameplay.test.ts     # Game loop tick & user interaction tests
└── .agents/                     # Multi-agent coordination metadata only
```

### 2.2 Shell Directory Creation Commands

To initialize the complete directory structure in a single deterministic command:

```bash
mkdir -p \
  src/core \
  src/math \
  src/entities \
  src/systems \
  src/audio \
  src/ui \
  src/types \
  tests/unit \
  tests/e2e
```

---

## 3. Core Type System Design (`src/types/index.ts`)

The type definitions in `src/types/index.ts` represent the authoritative data contracts for the entire game. They are designed with full strictness, explicit field types, and no circular dependencies.

### 3.1 Complete Proposed Content for `src/types/index.ts`

```typescript
/**
 * Galaga Arcade Web Game — Core Type Definitions & System Contracts
 * Standardized for Vite 6 / TypeScript 5.7+ strict compilation.
 */

// ============================================================================
// 1. Math & Geometry Types
// ============================================================================

/**
 * 2D vector interface representing coordinates, velocities, and dimensions.
 */
export interface Vector2D {
  x: number;
  y: number;
}

/**
 * Axis-Aligned Bounding Box (AABB) for rectangular collision detection.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Circular bounding area for radial collision detection.
 */
export interface Circle {
  x: number;
  y: number;
  radius: number;
}

/**
 * 2D size dimensions.
 */
export interface Size {
  width: number;
  height: number;
}

/**
 * 2D point for Bézier curves and path nodes.
 */
export interface Point2D {
  x: number;
  y: number;
}

// ============================================================================
// 2. Viewport & Canvas Resolution
// ============================================================================

/**
 * Internal virtual resolution specification.
 * Standard Galaga arcade resolution: 224 x 288 (3:4 aspect ratio).
 */
export interface VirtualResolution {
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number;
}

/**
 * Transformation parameters computed for letterbox / pillarbox canvas rendering.
 */
export interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  displayWidth: number;
  displayHeight: number;
  virtualWidth: number;
  virtualHeight: number;
}

// ============================================================================
// 3. Game State Machine Types
// ============================================================================

/**
 * High-level discrete states of the Galaga game loop.
 */
export type GameState =
  | 'BOOT'
  | 'TITLE'
  | 'STAGE_INTRO'
  | 'PLAYING'
  | 'CHALLENGING_STAGE'
  | 'STAGE_CLEAR'
  | 'PLAYER_CAPTURED'
  | 'PLAYER_RESCUED'
  | 'GAME_OVER'
  | 'PAUSED';

/**
 * Active game play modes.
 */
export type GameMode = 'SINGLE_PLAYER' | 'DEMO' | 'CHALLENGING_BONUS';

// ============================================================================
// 4. Player Types & States
// ============================================================================

/**
 * Discrete operational states for the player fighter craft.
 */
export type PlayerState =
  | 'ALIVE'
  | 'CAPTURING'
  | 'CAPTURED'
  | 'DUAL'
  | 'DESTROYED'
  | 'RESPAWNING'
  | 'DOCKING';

/**
 * Configuration and state representation for the player.
 */
export interface PlayerData {
  position: Vector2D;
  velocity: Vector2D;
  state: PlayerState;
  lives: number;
  isDual: boolean;
  canFire: boolean;
  respawnTimerMs: number;
  score: number;
}

// ============================================================================
// 5. Enemy Types, Hierarchy & Formation
// ============================================================================

/**
 * Categorical alien enemy types matching original arcade specifications.
 */
export enum EnemyType {
  ZAKO = 'ZAKO',                       // Blue Bug (Bottom 2 rows, 50/100 pts)
  GOEI = 'GOEI',                       // Red Butterfly (Middle 2 rows, 80/160 pts)
  BOSS = 'BOSS',                       // Green/Blue Galaga Commander (Top row, 150/400/800/1600 pts)
  TRANSFORM = 'TRANSFORM',             // Stage 4+ morphed bonus enemies
  CAPTURED_FIGHTER = 'CAPTURED_FIGHTER' // Hostile red player fighter under Boss command
}

/**
 * Behavioral state machine for individual enemy units.
 */
export enum EnemyState {
  IN_FORMATION = 'IN_FORMATION',
  ENTERING = 'ENTERING',
  DIVING_SOLO = 'DIVING_SOLO',
  DIVING_ESCORT = 'DIVING_ESCORT',
  TRACTOR_BEAM_ACTIVE = 'TRACTOR_BEAM_ACTIVE',
  RETURNING_TO_FORMATION = 'RETURNING_TO_FORMATION',
  EXPLODING = 'EXPLODING',
  CAPTURED_HOSTILE = 'CAPTURED_HOSTILE',
  INACTIVE = 'INACTIVE'
}

/**
 * Individual enemy formation grid slot definition.
 */
export interface FormationSlot {
  readonly row: number;
  readonly col: number;
  readonly type: EnemyType;
  homeX: number;
  homeY: number;
  occupied: boolean;
  enemyId: string | null;
}

/**
 * State parameters for the formation breathing / oscillating motion.
 */
export interface FormationBreathingState {
  offsetX: number;
  expansionFactor: number;
  cycleTimeMs: number;
  isExpanding: boolean;
}

// ============================================================================
// 6. Bézier Flight Curves & Paths
// ============================================================================

/**
 * Cubic Bézier curve definition comprising four control points.
 */
export interface CubicBezier {
  p0: Point2D;
  p1: Point2D;
  p2: Point2D;
  p3: Point2D;
}

/**
 * Individual trajectory segment along a composite flight path.
 */
export interface FlightPathSegment {
  bezier: CubicBezier;
  durationMs: number;
  speed: number;
  rotationOffsetRad?: number;
}

/**
 * Composite flight trajectory comprising multiple connected Bézier curves.
 */
export interface FlightPathData {
  id: string;
  name: string;
  segments: FlightPathSegment[];
  loop: boolean;
}

// ============================================================================
// 7. Projectiles & Weapons
// ============================================================================

/**
 * Identifies projectile ownership for collision filtering.
 */
export type BulletOwner = 'PLAYER' | 'ENEMY';

/**
 * Projectile type classifier.
 */
export type BulletType = 'PLAYER_MISSILE' | 'ENEMY_RED_BULLET' | 'ENEMY_FAST_BEAM';

/**
 * Active projectile state.
 */
export interface BulletData {
  id: number;
  position: Vector2D;
  velocity: Vector2D;
  owner: BulletOwner;
  type: BulletType;
  active: boolean;
  width: number;
  height: number;
}

// ============================================================================
// 8. Tractor Beam Mechanics
// ============================================================================

/**
 * Tractor beam operational phase.
 */
export type TractorBeamState =
  | 'INACTIVE'
  | 'EMITTING'
  | 'CAPTURING'
  | 'HOLDING'
  | 'RETRACTING';

/**
 * Tractor beam geometry and capture cone configuration.
 */
export interface TractorBeamConfig {
  origin: Vector2D;
  topWidth: number;
  bottomWidth: number;
  length: number;
  state: TractorBeamState;
  emissionTimerMs: number;
  capturedPlayerId: string | null;
}

// ============================================================================
// 9. Input System
// ============================================================================

/**
 * Unified input snapshot consumed by player and UI systems per frame.
 */
export interface InputState {
  moveLeft: boolean;
  moveRight: boolean;
  fire: boolean;
  pause: boolean;
  restart: boolean;
  pointerX: number | null;
  pointerActive: boolean;
  touchLeft: boolean;
  touchRight: boolean;
  touchFire: boolean;
}

/**
 * Touch virtual control button bounds for responsive mobile gameplay.
 */
export interface VirtualTouchControls {
  leftButton: Rect;
  rightButton: Rect;
  fireButton: Rect;
}

// ============================================================================
// 10. Starfield & Particle Systems
// ============================================================================

/**
 * Background star representation in the 3-layer parallax simulation.
 */
export interface Star {
  x: number;
  y: number;
  speed: number;
  layer: number;
  color: string;
  brightness: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

/**
 * Explosion spark and debris particle.
 */
export interface Particle {
  id: number;
  position: Vector2D;
  velocity: Vector2D;
  color: string;
  life: number;
  maxLife: number;
  size: number;
  active: boolean;
}

// ============================================================================
// 11. Audio Engine & SFX Events
// ============================================================================

/**
 * Discrete sound effect and jingle trigger events.
 */
export type AudioEventType =
  | 'LASER_FIRE'
  | 'ENEMY_DIVE'
  | 'ENEMY_EXPLOSION_SMALL'
  | 'ENEMY_EXPLOSION_LARGE'
  | 'BOSS_HIT'
  | 'BOSS_DESTROYED'
  | 'PLAYER_EXPLOSION'
  | 'TRACTOR_BEAM'
  | 'STAGE_START_FANFARE'
  | 'CHALLENGING_STAGE_START'
  | 'CHALLENGING_STAGE_PERFECT'
  | 'DOCKING_CHIME'
  | 'GAME_OVER_FANFARE'
  | 'EXTRA_LIFE';

/**
 * Audio playback options.
 */
export interface SoundOptions {
  volume?: number;
  pitch?: number;
  loop?: boolean;
}

// ============================================================================
// 12. Scoring, HUD & Persistence
// ============================================================================

/**
 * Persistent high score and game stats record.
 */
export interface ScoreRecord {
  score: number;
  highScore: number;
  stage: number;
  lives: number;
  shotsFired: number;
  hits: number;
}

/**
 * HUD display data bundle.
 */
export interface HUDState {
  score: number;
  highScore: number;
  lives: number;
  stage: number;
  stageBadges: number[];
}

// ============================================================================
// 13. Object Pooling Contracts
// ============================================================================

/**
 * Common contract for poolable, zero-allocation game entities.
 */
export interface Poolable {
  active: boolean;
  reset(): void;
}

// ============================================================================
// 14. Core Engine Lifecycle Contracts
// ============================================================================

/**
 * Master game engine coordinator contract.
 */
export interface IGameEngine {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  update(deltaTimeMs: number): void;
  render(ctx: CanvasRenderingContext2D): void;
}
```

---

## 4. Entry Point Architecture (`src/main.ts`)

### 4.1 Requirements & Responsibilities
The entry point `src/main.ts` serves as the root bootstrap script loaded by `index.html`. It must fulfill the following technical requirements:
1. **DOM Canvas Binding**: Locate `<canvas id="game-canvas">` or dynamically mount it within `<div id="app">`.
2. **Virtual Resolution Enforcement**: Initialize internal logical buffer dimensions ($224 \times 288$ native portrait resolution).
3. **Aspect Ratio Preservation (Letterboxing/Pillarboxing)**: Calculate the optimal scaling factor based on `window.innerWidth` and `window.innerHeight`, applying crisp integer/fractional CSS scaling and exact centering offsets.
4. **Pixelated Rendering**: Enforce `image-rendering: pixelated; image-rendering: crisp-edges;` via Canvas context settings and CSS styles.
5. **Initial Boot Frame Rendering**: Render an authentic retro black screen with twinkling star placeholders, arcade score header (`1UP  00`, `HIGH SCORE  20000`), and a "READY" start prompt.
6. **Diagnostic Logging**: Emit structured console logs to satisfy Playwright/browser automated validation tests (`0 JS runtime errors`, `engine initialized`).
7. **Modular Extensibility**: Export clear lifecycle functions (`bootstrap()`, `getCanvas()`, `getViewportTransform()`) for seamless integration with Milestone 2 core game loop modules.

### 4.2 Complete Proposed Content for `src/main.ts`

```typescript
/**
 * Galaga Arcade Web Game — Main Application Entry Point
 * Handles canvas initialization, responsive letterbox scaling, and engine bootstrap.
 */

import type { ViewportTransform, VirtualResolution } from './types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Authentic Galaga vertical arcade virtual resolution (3:4 aspect ratio).
 */
export const VIRTUAL_RESOLUTION: VirtualResolution = {
  width: 224,
  height: 288,
  aspectRatio: 224 / 288, // ~0.7778
};

export const CANVAS_ID = 'game-canvas';
export const APP_CONTAINER_ID = 'app';

// ============================================================================
// State Management
// ============================================================================

let canvasElement: HTMLCanvasElement | null = null;
let canvasContext: CanvasRenderingContext2D | null = null;
let currentTransform: ViewportTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  displayWidth: VIRTUAL_RESOLUTION.width,
  displayHeight: VIRTUAL_RESOLUTION.height,
  virtualWidth: VIRTUAL_RESOLUTION.width,
  virtualHeight: VIRTUAL_RESOLUTION.height,
};

// ============================================================================
// Viewport & Letterbox Scaling
// ============================================================================

/**
 * Calculates the optimal letterbox/pillarbox viewport transformation.
 */
export function calculateViewportTransform(
  windowWidth: number,
  windowHeight: number,
  virtualWidth = VIRTUAL_RESOLUTION.width,
  virtualHeight = VIRTUAL_RESOLUTION.height
): ViewportTransform {
  const targetAspect = virtualWidth / virtualHeight;
  const windowAspect = windowWidth / windowHeight;

  let displayWidth: number;
  let displayHeight: number;

  if (windowAspect < targetAspect) {
    // Screen is narrower than game aspect ratio -> Letterbox top/bottom
    displayWidth = windowWidth;
    displayHeight = Math.floor(windowWidth / targetAspect);
  } else {
    // Screen is wider than game aspect ratio -> Pillarbox left/right
    displayHeight = windowHeight;
    displayWidth = Math.floor(windowHeight * targetAspect);
  }

  const scale = displayWidth / virtualWidth;
  const offsetX = Math.floor((windowWidth - displayWidth) / 2);
  const offsetY = Math.floor((windowHeight - displayHeight) / 2);

  return {
    scale,
    offsetX,
    offsetY,
    displayWidth,
    displayHeight,
    virtualWidth,
    virtualHeight,
  };
}

/**
 * Applies the calculated viewport transform to the canvas DOM element.
 */
export function applyCanvasScaling(canvas: HTMLCanvasElement, transform: ViewportTransform): void {
  canvas.style.width = `${transform.displayWidth}px`;
  canvas.style.height = `${transform.displayHeight}px`;
  canvas.style.left = `${transform.offsetX}px`;
  canvas.style.top = `${transform.offsetY}px`;
  canvas.style.position = 'absolute';
  canvas.style.imageRendering = 'pixelated';
}

/**
 * Handles window resize events to maintain aspect ratio and centering.
 */
export function handleResize(): void {
  if (!canvasElement) return;

  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  currentTransform = calculateViewportTransform(windowWidth, windowHeight);
  applyCanvasScaling(canvasElement, currentTransform);
}

// ============================================================================
// Rendering Initialization
// ============================================================================

/**
 * Renders the initial arcade boot screen frame onto the canvas.
 */
export function renderBootFrame(ctx: CanvasRenderingContext2D): void {
  const { width, height } = VIRTUAL_RESOLUTION;

  // Clear canvas with authentic deep black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // Render twinkling background stars placeholder
  const starColors = ['#FFFFFF', '#FF3333', '#33CCFF', '#FFFF33'];
  const starSeeds = [
    { x: 24, y: 35, c: 0 }, { x: 80, y: 72, c: 1 }, { x: 190, y: 48, c: 2 },
    { x: 140, y: 110, c: 3 }, { x: 50, y: 160, c: 0 }, { x: 210, y: 190, c: 1 },
    { x: 95, y: 220, c: 2 }, { x: 165, y: 250, c: 3 }, { x: 30, y: 270, c: 0 },
    { x: 115, y: 15, c: 1 }, { x: 175, y: 135, c: 2 }, { x: 65, y: 95, c: 3 },
  ];

  for (const s of starSeeds) {
    ctx.fillStyle = starColors[s.c] ?? '#FFFFFF';
    ctx.fillRect(s.x, s.y, 2, 2);
  }

  // Set up crisp arcade typography
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Score Header
  ctx.fillStyle = '#FF0000';
  ctx.fillText('1UP', 36, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('00', 36, 20);

  ctx.fillStyle = '#FF0000';
  ctx.fillText('HIGH SCORE', width / 2, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('20000', width / 2, 20);

  ctx.fillStyle = '#00FFFF';
  ctx.fillText('2UP', width - 36, 10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('00', width - 36, 20);

  // Galaga Title / Ready Banner
  ctx.fillStyle = '#FFFF00';
  ctx.font = '14px monospace';
  ctx.fillText('GALAGA', width / 2, height / 2 - 20);

  ctx.fillStyle = '#00FF00';
  ctx.font = '8px monospace';
  ctx.fillText('ARCADE WEB ENGINE', width / 2, height / 2);

  ctx.fillStyle = '#FF3333';
  ctx.fillText('PRESS ANY KEY TO START', width / 2, height / 2 + 30);

  // Copyright / Attribution
  ctx.fillStyle = '#888888';
  ctx.font = '6px monospace';
  ctx.fillText('© 1981 NAMCO BANDAI / WEB ADAPTATION', width / 2, height - 16);
}

// ============================================================================
// Engine Bootstrap Lifecycle
// ============================================================================

/**
 * Initializes the canvas, obtains 2D context, attaches event listeners, and renders the boot frame.
 */
export function bootstrap(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  console.info('[Galaga Arcade] Bootstrapping engine...');

  // Locate or create the canvas element
  let canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement | null;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;

    const appContainer = document.getElementById(APP_CONTAINER_ID);
    if (appContainer) {
      appContainer.appendChild(canvas);
    } else {
      document.body.appendChild(canvas);
    }
  }

  // Set internal resolution buffer
  canvas.width = VIRTUAL_RESOLUTION.width;
  canvas.height = VIRTUAL_RESOLUTION.height;

  // Obtain 2D rendering context with high performance settings
  const ctx = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
  });

  if (!ctx) {
    throw new Error('[Galaga Arcade] Fatal: Failed to acquire CanvasRenderingContext2D.');
  }

  // Disable image smoothing for razor-sharp pixel art scaling
  ctx.imageSmoothingEnabled = false;

  canvasElement = canvas;
  canvasContext = ctx;

  // Initial scaling calculation and attachment
  handleResize();
  window.addEventListener('resize', handleResize);

  // Render initial boot screen
  renderBootFrame(ctx);

  console.info(
    `[Galaga Arcade] Engine initialized. Virtual Resolution: ${VIRTUAL_RESOLUTION.width}x${VIRTUAL_RESOLUTION.height}, Aspect Ratio: 3:4.`
  );

  return { canvas, ctx };
}

// ============================================================================
// Getters for External System Integration (Milestones 2-8)
// ============================================================================

export function getCanvas(): HTMLCanvasElement | null {
  return canvasElement;
}

export function getCanvasContext(): CanvasRenderingContext2D | null {
  return canvasContext;
}

export function getViewportTransform(): ViewportTransform {
  return currentTransform;
}

// Auto-bootstrap on DOM ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bootstrap();
    });
  } else {
    bootstrap();
  }
}
```

---

## 5. Build, Typecheck & Verification Strategy

### 5.1 Strict Compiler Options Compatibility
The TypeScript configuration (`tsconfig.json`) designed in Milestone 1 mandates:
- `strict: true`
- `noUncheckedIndexedAccess: true`
- `target: "ES2022"`
- `moduleResolution: "bundler"`
- `noImplicitAny: true`

The proposed `src/types/index.ts` and `src/main.ts` files were meticulously checked against these rules:
1. **No Implicit `any`**: All function signatures, parameters, and variable declarations are explicitly annotated.
2. **Safe Indexed Access**: Array index lookups (e.g. `starColors[s.c] ?? '#FFFFFF'`) explicitly provide fallbacks for `undefined`.
3. **Null Safety**: All DOM access points (`getElementById`, `getContext`) include explicit type assertions and null checks.
4. **Clean Exports**: All interfaces and types are exported directly at the top level without ambiguous namespace nesting.

### 5.2 Verification Commands
When Milestone 1 implementation executes, the following commands will guarantee project health:

```bash
# 1. Verify directory layout
ls -la src/ src/types src/core src/math src/entities src/systems src/audio src/ui tests/unit tests/e2e

# 2. Verify strict typechecking
npm run typecheck # (tsc --noEmit)

# 3. Verify static production build
npm run build # (vite build -> outputs to dist/)

# 4. Verify development server spin-up
npm run dev # (vite dev server opens on port 3000)
```

---

## 6. Summary of Deliverables for Milestone 1 Implementation

| Component | Target Path | Responsibility |
|---|---|---|
| **Directory Tree** | `src/*`, `tests/*` | 9 core module directories created via `mkdir -p` |
| **Type Definitions** | `src/types/index.ts` | Complete data contracts (Vector2D, Rect, GameState, PlayerState, EnemyType, InputState, Audio, HUD, Poolable) |
| **Entry Point** | `src/main.ts` | Canvas 2D setup, $224 \times 288$ buffer, letterbox scaling, boot frame rendering, lifecycle exports |
