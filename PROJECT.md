# Project: Galaga Arcade Web Game

## Architecture
- **Rendering & Display**: Fixed virtual resolution ($224 \times 288$ native / $448 \times 576$ logical buffer) rendered on HTML5 Canvas 2D with CSS `image-rendering: pixelated` letterbox scaling.
- **Game Engine**: Fixed-timestep accumulator loop ($16.6667\text{ ms}$, 60 FPS) with `requestAnimationFrame` and zero-allocation object pools for bullets, enemies, and particles.
- **Audio Engine**: Pure procedural Web Audio API synthesis graph (`OscillatorNode`, `GainNode`, `BiquadFilterNode`, `AudioBufferSourceNode`) with zero external audio assets.
- **Math & Physics**: Vector2D primitives, Cubic Bézier curve interpolator $B(t)$ with tangent angle orientation $\theta(t)$, AABB / Circle collision detection.
- **State Machine**: Title $\to$ Stage Intro $\to$ Flight Entry $\to$ Formation Dogfight $\to$ Challenging Stage $\to$ Player Captured / Rescued $\to$ Game Over.
- **Build & Platform**: Vite 6 + TypeScript 5.7 strict compilation, clean static build output to `dist/`, zero-config Vercel deployment.
- **Test Infrastructure**: Vitest unit test suite + Playwright headless browser E2E test harness (0 JavaScript runtime errors, canvas DOM attachment, game loop tick validation).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---|---|---|---|
| F1 | Build Tooling & Vercel Config | Vite + TypeScript + vercel.json + build script to `dist/` | M1 | Survey (spec_miner_3) |
| F2 | Git Version Control & GitHub Automation | .gitignore, semantic milestone commits, GitHub push | M1 | Survey (spec_miner_3) |
| F3 | Core Game Loop & Fixed Timestep Engine | 60 FPS accumulator loop, object pooling, tick orchestration | M2 | Survey (explorer_2) |
| F4 | Parallax Starfield & Virtual Canvas Scaling | 3-Layer twinkling starfield, responsive aspect-ratio letterboxing | M2 | Survey (explorer_2) |
| F5 | Multi-Input System | Keyboard (Arrow/WASD/Space/Z/K), Mouse cursor + click, Mobile touch virtual controls | M2 | Survey (explorer_2) |
| F6 | Player Single & Dual Fighter Ship System | 1D movement, bounds clamping, 2-bullet/4-bullet limits, dual fighter side-by-side docking | M3 | Survey (explorer_1) |
| F7 | Enemy Hierarchy & Formation Manager | Zako, Goei, Boss Galaga, 40-alien 5-row grid formation, breathing oscillation | M4 | Survey (explorer_1) |
| F8 | Bézier Flight Curves & Dynamic AI Diving | Cubic Bézier equations $B(t)$, velocity tangent angles $\theta(t)$, 5 sub-wave entry loops, diving attacks | M4 | Survey (explorer_1) |
| F9 | Boss Galaga Tractor Beam & Capture/Rescue Mechanics | Tractor beam cone emission, ship spinning capture, red escort docking, rescue via shooting diving Boss, turncoat hostile logic | M5 | Survey (explorer_1) |
| F10 | Pure Procedural Web Audio Synthesizer | Laser chirp, alien dive warble, tractor beam oscillation, explosion noise, stage start fanfare, challenging stage jingle, docking chime, game over | M6 | Survey (explorer_2) |
| F11 | Procedural Pixel Art Sprites & Particle Engine | Procedural canvas pixel sprites (0 image assets), arcade explosion sparks and debris particles | M6 | Survey (explorer_2) |
| F12 | UI / HUD, Scoring, High Score & Challenging Stage Flow | HUD score/high-score/lives/stage badges, LocalStorage persistence, Challenging Stage bonus flow, Game Over & Restart | M7 | Survey (explorer_1) |
| F13 | End-to-End Test Suite, Browser Automation & Adversarial Hardening | Vitest 100% unit tests, Playwright headless browser 0-console-error verification, Tier 1-5 test coverage | M8 & E2E Track | Survey (spec_miner_3) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Project Setup, Build & Git Infrastructure | Vite, TypeScript, ESLint, vercel.json, package.json, .gitignore, Git repo initialization | none | DONE |
| M2 | Core Engine, Canvas Scaling, Starfield & Input | Game loop, fixed timestep, screen manager, 3-layer parallax starfield, keyboard/mouse/touch input | M1 | DONE |
| M3 | Player Fighter & Dual Fighter Docking System | Player ship entity, single/dual states, missile firing limits, collision boundaries | M2 | DONE |
| M4 | Enemy Formation, Bézier Flight Paths & AI Diving | Zako/Goei/Boss Galaga entities, formation grid manager, cubic Bézier entry paths, dive attacks | M2, M3 | DONE |
| M5 | Boss Galaga Tractor Beam & Capture/Rescue Mechanics | Tractor beam ray casting/cone, player capture animation, escort fighter, rescue docking / turncoat handling | M4 | DONE |
| M6 | Procedural Web Audio Synth & Pixel Particle System | Web Audio API synthesizer (all 8+ SFX/jingles), procedural sprite matrix baking, explosion particle system | M2 | DONE |
| M7 | UI/UX, Scoring, LocalStorage & Mobile Controls | HUD overlay, score manager, high score local storage, stage badges, touch virtual D-pad/fire button, game over screen | M3, M4, M5, M6 | DONE |
| M8 | Final Integration, E2E Test Suite & Adversarial Hardening | Full game integration, 100% E2E test pass (Tiers 1-4), Tier 5 adversarial hardening, production build & GitHub push | M1-M7, TEST_READY | DONE |
| M9 | 50-Round Non-Linear Scaling Engine | Progressive HP scaling, speed multipliers, dynamic stage badges 1-50, 12 challenging stages | M8 | DONE |
| M10 | 11 Stellaris Crisis Events | CrisisEventFactory & CrisisEventManager, 11 cosmic disasters, HUD warnings | M9 | DONE |
| M11 | Power-Up Subsystem & Bounded Pools | Drop tables, Rapid Overclock, Shield Deflector, Spread Blaster, Hyper Drive, ObjectPool invariant | M10 | DONE |
| M12 | 5 Epic Multi-Phase Boss Encounters | BaseBoss, Cyber Dreadnought (10), Dimensional Leviathan (20), Nanite Colossus (30), Psionic Harbinger (40), Aeternum Core (50) | M11 | DONE |
| M13 | Allies Support System & 3 Special Moves | 3 Drones (Escort, Aegis, Bomber), 3 Specials (Nova Barrage, Chrono Freeze, Warp Ram), Energy Gauge | M12 | DONE |
| M14 | Procedural Audio & VFX Shaders | Web Audio procedural sound synthesis for bosses/crises/specials, Canvas 2D VFX shaders, screen flash | M13 | DONE |
| M15 | 50-Round Memory Bot & QA Controller | __GALAGA_CHEAT__, automated 50-round Playwright simulation bot, < 5MB net heap drift verification | M14 | DONE |
| M16 | Swarm Adversarial Hardening & Final Victory Audit | 50+ subagent red team hardening, 100% test pass, zero-leak certification, Sentinel completion handoff | M15 | DONE |
| M17 | Dynamic Difficulty Adjustment (DDA) Engine | Real-time proficiency tracking (accuracy, damage avoidance, clear time), 4 dynamic tuning actuators (dive speed, bullet density, attack aggression, boss HP), bounded multiplier clamping | M16 | DONE |
| M18 | Glitch Visual & Kinematic Event System | Glitch sectors (13, 26, 38) & random anomalies, 5 scratch canvas raster shaders (scanline tear, chromatic aberration, XOR corrupt, HUD hex scramble), anomalous AI & phantom clones | M17 | DONE |
| M19 | 5+ Creative Power-Up & Utility Items | Chrono Field (bullet time dilation), Reflection Shield (projectile deflection), EMP Collector (energy conversion), Phase Drive (quantum warp dash), Antimatter Plasma Blaster (piercing beam), bounded pool invariants | M18 | DONE |
| M20 | QA Cheat Controller Extension & Automated Playwright E2E Simulation | __GALAGA_CHEAT__ extension (glitch triggers, power-up testing, DDA telemetry), automated 50-round Playwright soak test with CDP heap profiling (< 5MB drift) | M19 | DONE |
| M21 | 40+ Swarm Hardening & Final Victory Audit | 40+ subagent adversarial red team hardening, combinatorial saturation testing, long-session soak validation, 100% test pass, forensic victory audit attestation | M20 | DONE |
| M22 | Forensic Bug Analysis & Warp Detection Test Suite | Forensic bug analysis across 4 warp archetypes, automated warp detection harness (WarpDetector), empirical thresholding (<= 3.0 px/frame upon docking) | M21 | DONE |
| M23 | Kinematic Smoothing & Root Cause Elimination | Dynamic formation slot tracking, exponential docking controller, decoupling of tractor altitude & kinetic inversion wraps, zero-GC bounds | M22 | DONE |
| M24 | Autonomous Swarm QA & Multi-Bug Polishing | Hitbox precision, WebAudio voice headroom/cleanup, HUD relocation, pool flush invariants, 27 polish fixes | M23 | DONE |
| M25 | Swarm Hardening, Zero-GC Verification, Dual Sync & Victory Audit | 50-round soak test (<5MB drift), 100% test pass (1,608 unit tests), bitwise parity sync, independent victory audit attestation | M24 | DONE |
| M26 | OpenGraph Metadata & Procedural OG Banner Engine | Social metadata in index.html, procedural 1200x630 banner generator, unit parsing tests | M25 | DONE |
| M27 | Fullscreen Controller & Viewport Synchronization | FullscreenManager API, toggle button, F/F11 shortcut, viewport resize listeners | M26 | DONE |
| M28 | Modernized Bottom HUD & Dashboard Panel | Bottom dashboard, score/lives/items/special gauge, controls guide, compact mode | M27 | DONE |
| M29 | Universal Responsive Layout & Cross-Device Integration | Universal 7:9 letterbox scaling, safe-area insets, mobile touch ergonomics, desktop keyboard | M28 | DONE |
| M30 | 60+ Swarm Hardening, Multi-Device E2E & Victory Audit | 60+ subagent swarm, cross-browser/viewport Playwright E2E suite, zero-leak verification, final victory audit | M29 | DONE |


## Parallel Track: E2E Testing Track
| Track | Name | Scope | Status |
|---|---|---|---|
| E2E Track | E2E Testing Suite & Harness | Opaque-box test harness, Vitest test suites, Playwright headless browser test (0 JS errors, loop tick), publishes `TEST_READY.md` | DONE |

## Interface Contracts
### `math` $\leftrightarrow$ `engine` / `entities`
- `Vector2D`: `{ x: number, y: number }`, `add`, `sub`, `scale`, `length`, `normalize`, `distance`
- `BezierCurve`: `evaluate(t: number): Vector2D`, `tangent(t: number): Vector2D`, `heading(t: number): number`
- `Collision`: `checkAABB(a: Rect, b: Rect): boolean`, `checkCircle(a: Circle, b: Circle): boolean`

### `input` $\leftrightarrow$ `entities` / `engine`
- `InputState`: `{ moveLeft: boolean, moveRight: boolean, fire: boolean, pause: boolean, restart: boolean, pointerX: number | null }`

### `audio` $\leftrightarrow$ `game events`
- `AudioManager`:
  - `playLaser()`
  - `playExplosion(type: 'small' | 'large' | 'boss')`
  - `playAlienDive(alienType: 'zako' | 'goei' | 'boss')`
  - `playTractorBeam(active: boolean)`
  - `playStageStartFanfare()`
  - `playChallengingStageJingle()`
  - `playDockingChime()`
  - `playGameOverJingle()`

### `entities` $\leftrightarrow$ `state` / `renderer`
- `Player`: `position`, `state: 'normal' | 'capturing' | 'captured' | 'dual' | 'destroyed'`, `missiles: Bullet[]`, `lives: number`
- `Enemy`: `type: 'zako' | 'goei' | 'boss'`, `health: number`, `state: 'entering' | 'formation' | 'diving' | 'tractor_beam' | 'captured_escort'`, `path: BezierPath | null`
- `GameState`: `'TITLE' | 'STAGE_INTRO' | 'PLAYING' | 'CHALLENGING_STAGE' | 'STAGE_CLEAR' | 'GAME_OVER'`

## Code Layout
```
/Users/user/src/galog/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vercel.json
├── .gitignore
├── src/
│   ├── main.ts                   # Entry point, canvas initialization & bootstrap
│   ├── core/
│   │   ├── Game.ts               # Master game coordinator & state machine
│   │   ├── GameLoop.ts           # 60fps fixed-timestep accumulator loop
│   │   ├── ScreenManager.ts      # Virtual canvas (224x288 / 448x576) letterbox scaling
│   │   └── ObjectPool.ts         # Zero-allocation generic memory pool
│   ├── math/
│   │   ├── Vector2.ts            # 2D vector mathematics
│   │   ├── Bezier.ts             # Cubic Bézier spline evaluator & tangent calculator
│   │   └── Collision.ts          # Hitbox & radius collision detection
│   ├── entities/
│   │   ├── Player.ts             # Single/Dual player ship entity
│   │   ├── Bullet.ts             # Player & enemy projectile entities
│   │   ├── Enemy.ts              # Zako, Goei, and Boss Galaga enemy entities
│   │   └── TractorBeam.ts        # Boss Galaga tractor beam particle/wave cone
│   ├── systems/
│   │   ├── FormationManager.ts   # 5-row grid formation, breathing oscillation, slot assignment
│   │   ├── FlightPathManager.ts  # 5 sub-wave entry swoops and dynamic attack dive paths
│   │   ├── Starfield.ts          # 3-layer parallax scrolling twinkling starfield
│   │   ├── ParticleSystem.ts     # Multi-colored explosion sparks and debris
│   │   └── ScoreManager.ts       # Score, high score localStorage, extra life thresholds
│   ├── audio/
│   │   ├── AudioContextManager.ts# Web Audio API context unlock & master gain
│   │   ├── SoundSynth.ts         # Procedural SFX oscillators & noise generators
│   │   └── MusicJingles.ts       # Procedural chiptune melodies & fanfares
│   ├── ui/
│   │   ├── HUD.ts                # Score, high score, remaining lives, stage badge rendering
│   │   ├── InputHandler.ts       # Keyboard, mouse, and mobile touch virtual controls
│   │   ├── Screens.ts            # Title, Pause, Challenging Stage results, Game Over screens
│   │   ├── FullscreenManager.ts  # Cross-browser Fullscreen API & viewport sync controller
│   │   └── BottomDashboard.ts    # Modernized cyber-arcade bottom HUD & dashboard component
│   ├── renderer/
│   │   ├── SpriteRenderer.ts     # Procedural pixel-art sprite matrix caching
│   │   ├── GlitchRenderer.ts     # Canvas 2D raster scanline, chromatic, XOR shader effects
│   │   └── og/                   # Pure procedural PNG encoder & 1200x630 social card banner generator
│   └── types/
│       └── index.ts              # Global TypeScript interfaces, enums & type contracts
├── tests/
│   ├── unit/
│   │   ├── math.test.ts          # Vector2, Bézier curves, collision unit tests
│   │   ├── state.test.ts         # Game state machine transition tests
│   │   ├── score.test.ts         # Scoring, high score localStorage tests
│   │   └── entities.test.ts      # Player single/dual, tractor beam state tests
│   └── e2e/
│       ├── browser.test.ts       # Playwright browser load, 0 console error, loop tick tests
│       └── gameplay.test.ts      # E2E user interaction & game loop execution tests
└── .agents/                      # Coordination metadata only (no source code)
```
