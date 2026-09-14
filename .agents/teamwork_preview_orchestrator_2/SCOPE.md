# Scope: Phase 2 Expansion (Milestones M9 – M14)

## Architecture
- **Stage Scaling Engine (`src/systems/DifficultyCalculator.ts`)**: Deterministic non-linear progression across 50 rounds (HP curves, dive speed scale up to 1.8x, bullet speed clamped at 320 px/s, 12 Challenging Stages, greedy stage badges 1–50).
- **Crisis System (`src/core/crisis/`)**: Extensible Factory Pattern with `CrisisEventManager`, `CrisisEventFactory`, and 11 distinct Stellaris-inspired crisis events altering gameplay, visuals, physics, and enemy behaviors post-Round 10.
- **Power-Up System (`src/core/powerups/`)**: ObjectPool-leased collectible items with procedural pixel matrices, 5 upgrade modules (Rapid Fire, Kinetic Deflector Shield, Scatter Shot, EMP Bomb, Engine Booster), and seamless Dual Fighter docking synergy.
- **Crisis Warning HUD & Procedural Audio**: Arcade pulsing warning banner, perimeter hazard strobe, Web Audio FM-synthesis klaxon siren, and tempo-escalated combat BGM.
- **Cheat & Testing Infrastructure**: Runtime cheat controller `window.__GALAGA_CHEAT__`, 50-round automated Playwright CDP heap-profiling bot (net heap growth < 8MB, zero leaks, zero crashes), Vitest 50-round headless simulation, and 11 individual crisis test suites.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F14 | 50-Round Difficulty Calculator | HP curve (Classic/Elite/Dreadnought), dive speed multiplier (1.0x-1.8x), bullet speed clamp (320 px/s) | M9 | Survey (explorer_1) |
| F15 | Enemy Tier Shields & Visual Palettes | Elite (+1 HP) and Dreadnought (kinetic shields) visual indicator & damage pipeline | M9 | Survey (explorer_1) |
| F16 | 12 Challenging Stages & Acrobatic Waves | 5 distinct flight paths, 0 bullets, 40-hit perfect bonus tracking for stages 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47 | M9 | Survey (explorer_1) |
| F17 | Stage Badges 1–50 | Greedy badge decomposition for flags 50, 30, 20, 10, 5, 1 with dedicated FLAG_20 sprite | M9 | Survey (explorer_1) |
| F18 | Crisis Engine & Factory Pattern | `CrisisEventManager`, `CrisisEventFactory`, `CrisisEvent` interface, stage hook post-round 10 | M10 | Survey (explorer_2) |
| F19 | 11 Concrete Stellaris Crisis Events | The Contingency, The Unbidden, Prethoryn Scourge, Shield Overload, Physics Inversion, Hyperspace Storm, Nanite Cloud, Psionic Resonance, Devouring Swarm Frenzy, Nemesis Star-Eater, Time Dilation | M10 | Survey (explorer_2) |
| F20 | Player Power-Up System | `PowerUpManager`, ObjectPool leasing, drop rates on enemy kill, drift physics | M11 | Survey (explorer_2) |
| F21 | 5 Upgrade Modules & Dual Fighter Synergy | Rapid Fire, Kinetic Shield, Scatter Shot, EMP Bomb, Engine Booster with dual docking stacking | M11 | Survey (explorer_2) |
| F22 | Crisis Warning HUD Banner & Visual Strobe | Hazard banner with event name/flavor text, perimeter red flash/strobe | M12 | Survey (explorer_2) |
| F23 | Procedural Web Audio Klaxon & Dynamic BGM | Real-time FM synthesis alarm siren, tempo modulation for combat BGM | M12 | Survey (explorer_2) |
| F24 | Runtime Cheat Controller | `window.__GALAGA_CHEAT__` (skipToStage, setInvincible, triggerCrisis, clearCrisis, spawnPowerUp, getGameState, getPoolStats) | M13 | Survey (spec_miner_3) |
| F25 | 50-Round Automated Memory & Stress Bot | Playwright CDP heap profiling (<8MB net growth), zero leaks, zero console errors, 50-round hop | M13 | Survey (spec_miner_3) |
| F26 | Vitest 11-Crisis & Power-Up Test Suite | 5-phase lifecycle tests for each crisis event, power-up mechanics, scaling formulas | M14 | Survey (spec_miner_3) |
| F27 | Full Integration, Typecheck & Victory Audit | npm run typecheck, npm run build, full test pass, forensic integrity verification | M14 | Survey (spec_miner_3) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|--------------|--------|
| M9 | 50-Round Scaling Engine & Stage Config | `DifficultyCalculator`, enemy shields/palettes, 12 challenging stages, stage badges 1–50 | none | DONE |
| M10 | Crisis Architecture & 11 Stellaris Events | `CrisisEventManager`, `CrisisEventFactory`, 11 concrete crisis implementations | M9 | DONE |
| M11 | Player Fighter Upgrade & Power-Up System | `PowerUpManager`, 5 procedural power-ups, Dual Fighter synergy | M9 | PLANNED |
| M12 | Crisis Warning HUD & Procedural Web Audio | Warning banner, hazard strobe, FM klaxon siren, BGM tempo modulation | M10 | PLANNED |
| M13 | 50-Round Cheat Script & Stress/Memory Bot | `window.__GALAGA_CHEAT__`, Playwright CDP heap bot, Vitest 50-round runner | M9, M10, M11, M12 | PLANNED |
| M14 | Full Integration, Adversarial Hardening & Audit | Vitest crisis/powerup suites, Playwright E2E suite, production build, forensic audit | M13 | PLANNED |

## Interface Contracts
### `DifficultyCalculator` $\leftrightarrow$ `Game` / `FormationManager` / `Enemy`
- `getStageTier(stage: number): 'CLASSIC' | 'ELITE' | 'DREADNOUGHT'`
- `getDiveSpeedMultiplier(stage: number): number` (1.0 to 1.8)
- `getDiveInterval(stage: number): number` (3.5s to 0.8s)
- `getMaxConcurrentDivers(stage: number): number` (1 to 6)
- `getEnemyBulletSpeed(stage: number): number` (min 180, clamped at 320 px/s)
- `getEnemyHealthAndShield(stage: number, type: EnemyType): { health: number, shield: number }`

### `CrisisEventManager` $\leftrightarrow$ `Game`
- `init(game: Game): void`
- `checkAndTriggerCrisis(stage: number): void`
- `update(dt: number): void`
- `render(ctx: CanvasRenderingContext2D): void`
- `getActiveCrisis(): ICrisisEvent | null`
- `triggerCrisis(id: string): void`
- `clearCrisis(): void`

### `PowerUpManager` $\leftrightarrow$ `Game` / `Player`
- `spawnDrop(x: number, y: number, stage: number): void`
- `update(dt: number, player: Player): void`
- `render(ctx: CanvasRenderingContext2D): void`
- `reset(): void`
