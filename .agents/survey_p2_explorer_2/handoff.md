# Handoff Report: Crisis Events (R2), Player Upgrades (R3) & Warning HUD (R4) Architecture

- **Agent**: `survey_p2_explorer_2` (Crisis & Upgrade System Explorer)
- **Role**: Crisis & Upgrade System Explorer
- **Date**: 2026-09-03
- **Working Directory**: `/Users/user/src/galog/.agents/survey_p2_explorer_2/`
- **Milestone**: Survey & Architecture Phase 2

---

## 1. Observation

1. **Existing Test Suite Baseline**:
   - Executed `npm test` via Vitest (`v3.2.7`).
   - Observed: `Test Files 26 passed (26)`, `Tests 546 passed (546)`.
   - Verified that all core engines, state machines, math routines, and adversarial suites are 100% green and stable.

2. **Core Engine Architecture (`src/core/Game.ts`)**:
   - `Game.ts:41-71`: Subsystems include `ScreenManager`, `GameLoop`, `Starfield`, `InputHandler`, `Player`, `BulletManager`, `FormationManager`, `TractorBeam`, `AudioContextManager`, `SoundSynth`, `ParticleSystem`, `ScoreManager`, and `HUD`.
   - `Game.ts:488-538`: Fixed timestep update method `update(dt)` sequentially updates `starfield`, `particleSystem`, `bulletManager`, `player`, and state machine handlers (`updatePlaying(dt)`).
   - `Game.ts:655-830`: Collision resolution pipeline `resolveCollisions()` checks player missiles vs living enemies (lines 658–761), tractor beam capture (lines 763–784), and enemy bullets/ramming vs player (lines 786–830).
   - `Game.ts:836-946`: Double-buffered rendering pipeline clears canvas, renders `starfield`, `hud.renderHeader`, entities, and `hud.renderFooter`.

3. **Object Pooling Architecture (`src/core/ObjectPool.ts`)**:
   - `ObjectPool.ts:25-57`: Pre-allocates objects in a contiguous dense array (`storage: T[]`), using `activeCount` partition pointer.
   - `ObjectPool.ts:99-125`: Uses O(1) swap-and-pop release mechanism (`release(item: T)`), guaranteeing zero runtime GC allocations during 60 FPS gameplay.
   - `ObjectPool.ts:149-160`: Provides `forEachActiveSafe()` reverse-iteration allowing safe item deactivation during traversal.

4. **Player Hull & Dual Docking FSM (`src/entities/Player.ts`)**:
   - `Player.ts:21-35`: 7-state machine (`normal`, `capturing`, `captured`, `docking`, `dual`, `destroyed`, `respawning`).
   - `Player.ts:161-181`: Missile quota limits: Single Fighter max 2 missiles, Dual Fighter max 4 missiles.
   - `Player.ts:377-402`: Weapon firing (`attemptFire()`) creates `BulletSpawnRequest` array. Single fires at $x$, Dual fires at $x-8$ and $x+8$ with $vy = -480\text{ px/s}$.
   - `Player.ts:433-467`: Asymmetrical hit testing on Dual Fighter allows left or right hull destruction with reversion to single fighter (`this._state = 'normal'`).

5. **Bullet Management (`src/entities/Bullet.ts`)**:
   - `Bullet.ts:28-52`: Config constants define `PLAYER_SPEED = 480`, `ENEMY_MIN_SPEED = 180`, `ENEMY_MAX_SPEED = 240`.
   - `Bullet.ts:186-205`: Swept Continuous Collision Detection (`getSweptHitbox()`) spans from previous frame to current frame, preventing tunneling.
   - `Bullet.ts:299-346`: Spawns single and dual missiles, tracking `activePlayerBulletCount`.

6. **Web Audio Synthesis & Jingles (`src/audio/`)**:
   - `AudioContextManager.ts:120-137`: Routing graph connects `destination <- masterGain <- (sfxGain, musicGain)`.
   - `SoundSynth.ts:65-82`: Shared 2-second white noise buffer (`AudioBuffer`) cached for zero GC explosion synthesis.
   - `SoundSynth.ts:88-148`: `playLaser()` uses sawtooth sweep $880\text{Hz} \to 120\text{Hz}$ over $0.12\text{s}$.
   - `SoundSynth.ts:271-375`: `playTractorBeam()` uses detuned oscillators ($64\text{Hz}$ saw, $70\text{Hz}$ square), $340\text{Hz}$ resonant lowpass filter, and $7\text{Hz}$ AM tremolo pulse.
   - `MusicJingles.ts:95-132`: `PulseWaveCache` pre-computes 64-harmonic Fourier series for authentic $12.5\%$ and $25\%$ Namco pulse waves.

7. **HUD & Procedural Fonts (`src/ui/HUD.ts`, `src/renderer/SpriteRenderer.ts`)**:
   - `HUD.ts:66-118`: Pre-baked $8\times8$ font bitmaps for numerals, uppercase alphabet, and symbols.
   - `HUD.ts:494-532`: Greedy stage badge decomposition algorithm (`decomposeStage(stage)`) supports flags $50, 30, 20, 10, 5, 1$.
   - `SpriteRenderer.ts:57-160`: Procedural pixel string arrays (`PLAYER_FIGHTER_MATRIX`, `DUAL_FIGHTER_MATRIX`, `ZAKO`, `GOEI`, `BOSS`) pre-baked to offscreen canvases with zero image assets.

---

## 2. Logic Chain

1. **Premise 1**: The user requirements demand 10+ Stellaris-inspired Crisis Events after Round 10 (R2), a Player Fighter Upgrade system with 5 power-up types (R3), and a Crisis Warning HUD/Audio system (R4), with zero external assets and zero memory leaks across 50 rounds.
2. **Premise 2**: The codebase's zero-allocation design (`ObjectPool<T>`), procedural sprite caching (`SpriteRenderer`), and Web Audio API synthesizer (`SoundSynth`) provide high-performance, modular foundations.
3. **Inference 1 (R2 Crisis Architecture)**: An extensible Factory Pattern (`CrisisEventFactory`) and Manager (`CrisisEventManager`) in `src/core/crisis/` decoupled from entity internals allows adding and testing 11 distinct crisis events independently without bloating `Game.ts`.
4. **Inference 2 (R3 PowerUp Architecture)**: Implementing `PowerUpManager` using `ObjectPool<PowerUpItem>` in `src/core/powerups/` enables drop calculation on enemy defeat, drifting descent physics, and collision detection within `Game.resolveCollisions()`. Because `Player.ts` already separates single and dual firing logic and asymmetrical damage, power-up buffs (Rapid Fire, Kinetic Deflector, Scatter Shot, EMP Bomb, Engine Booster) can augment weapon quota, fire vectors, and hull hitboxes while compounding with the Dual Fighter docking mechanic.
5. **Inference 3 (R4 Warning HUD & Audio)**: The existing `HUD.ts` and `SoundSynth.ts` allow adding a procedural FM-synthesis klaxon siren (`playCrisisKlaxon()`) and dynamic canvas strobe/hazard banner without adding any audio or image files, preserving 100% self-contained deployment.
6. **Inference 4 (Testing & Verification)**: Providing explicit unit tests for each crisis event and power-up, alongside a cheat interface `window.__GALAGA_CHEAT__`, enables automated 50-round Playwright/Vitest validation without flaky manual inputs.

---

## 3. Caveats

1. **Implementation Deferred**: In strict accordance with the Global Agent Rules and explorer role, no source files were modified in `src/` or `tests/`. All work is confined to architectural documentation in `.agents/survey_p2_explorer_2/`.
2. **R1 Stage Scaling Coordination**: R1 (50-Round Progressive Scaling) is investigated by peer explorer `survey_p1_explorer_1`. The crisis trigger logic (post-Round 10) and power-up drop rates are designed to accept dynamic stage numbers and difficulty multipliers from R1 without coupling.
3. **Audio Autoplay Policy**: Web Audio API requires user interaction to unlock; all procedural crisis audio hooks depend on `AudioContextManager` which already includes gesture listeners (`pointerdown`, `keydown`, `touchstart`).

---

## 4. Conclusion

The technical architecture for R2 (11 Stellaris Crisis Events), R3 (5 Player Power-Ups with Dual Fighter Docking Synergy), and R4 (Crisis Warning Banner, Strobe & FM Klaxon) is fully mapped, mathematically specified, and integrated with existing engine structures. The detailed specifications have been written to `report.md`.

---

## 5. Verification Method

To independently verify this investigation:
1. **Run Current Test Suite**:
   ```bash
   npm test
   ```
   *Expected Result*: All 26 test files and 546 unit tests pass.
2. **Inspect Architectural Artifacts**:
   - `file:///Users/user/src/galog/.agents/survey_p2_explorer_2/report.md`
   - `file:///Users/user/src/galog/.agents/survey_p2_explorer_2/BRIEFING.md`
   - `file:///Users/user/src/galog/.agents/survey_p2_explorer_2/progress.md`
3. **Invalidation Conditions**:
   - Invalidation occurs if any proposed interface violates `ObjectPool` zero-allocation invariants.
   - Invalidation occurs if proposed assets require external `.png` or `.mp3` files rather than procedural canvas bit-matrices and Web Audio API synthesis.
