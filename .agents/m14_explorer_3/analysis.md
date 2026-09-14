# Milestone 14: Test Infrastructure & Verification Strategy — Comprehensive Analysis

**Agent**: `m14_explorer_3`  
**Working Directory**: `/Users/user/teamwork_projects/galaga_game/.agents/m14_explorer_3`  
**Milestone**: Milestone 14: Procedural Audio & VFX Shaders  
**Baseline State**: 52 test files, 953 passing tests (100% pass rate, 0 failures, ~13.1s execution time)  
**Date**: 2026-09-04  

---

## 1. Executive Summary & Baseline Test Matrix Audit

### 1.1 Baseline Health & Inventory
The Galaga Arcade Web Game repository currently demonstrates remarkable stability with **52 test files and 953 passing unit/adversarial tests** across Milestones 1 through 13.

Empirical verification via `npx vitest run`:
```
Test Files  52 passed (52)
     Tests  953 passed (953)
  Duration  13.10s (transform 7.72s, setup 0ms, collect 55.32s, tests 36.08s)
```

### 1.2 Categorical Test Matrix Breakdown (52 Test Files)
| Domain | File Count | Test Count | Key Invariants Verified |
|---|---|---|---|
| **Core Math & Kinematics** | 3 | 65 | Vector2 operations, Bézier $B(t)$ LUT monotonic arc-lengths, AABB/Circle collisions |
| **Core Engine & Lifecycle** | 6 | 108 | 60 FPS fixed accumulator loop, ObjectPool zero-GC lifecycle, state machine transitions, letterbox scaling |
| **Player & Projectiles** | 6 | 136 | Single/Dual fighter mechanics, 2/4 bullet quotas, point-blank recycling, tractor beam capture/rescue |
| **Enemy Formation & Diving** | 5 | 124 | 40-alien 5-row breathing grid, dynamic swoop ingress, 50-round scaling curves, bonus stage bullet suppression |
| **Stellaris Crisis Subsystem** | 3 | 81 | 11 cosmic crises lifecycle, factory creation, physics inversion, time dilation field |
| **Power-Ups & Upgrades** | 4 | 70 | 32-capacity bounded pool invariants, drop tables, rapid overclock, kinetic shield deflector |
| **Epic Multi-Phase Bosses** | 10 | 97 | 5 bosses (Stages 10, 20, 30, 40, 50), phase transitions, bullet rings, gravitational tears, nanite goo, psionic stun, dark matter beam |
| **Allies & Special Moves (M13)** | 6 | 89 | 3 Drones (Escort, Aegis, Bomber), 3 Specials (Nova Barrage, Chrono Freeze, Warp Ram), energy gauge, 10k-tick stress |
| **Audio, Particles & HUD** | 7 | 149 | Web Audio context unlock, procedural sound synth, Fourier pulse waves, 250 particle pool bounds, HUD layout |
| **Build & Platform Security** | 2 | 34 | Vercel CSP security headers, clean URLs, ES2022 bundle size (<150KB), 0 untracked files |
| **Total** | **52** | **953** | **100% Pass Rate Across All Subsystems** |

---

## 2. Milestone 14 Verification Architecture

Milestone 14 introduces **Procedural Web Audio API Synthesis** and **Canvas 2D VFX Shaders & Screen Effects**.  
To ensure 100% coverage, zero regressions, and strict adherence to project constraints (0 external files, zero-GC, headless compatibility), four specialized test suites must be created:

```
tests/unit/
├── m14_audio_synthesis.test.ts          # Procedural Web Audio API node graphs & SFX matrix
├── m14_zero_assets_audit.test.ts        # Automated filesystem & AST scan (0 .png/.jpg/.mp3/.wav)
├── m14_vfx_shaders_particles.test.ts    # Screen shake decay, flash timers, 250 particle cap, render safety
├── m14_zerogc_saturation_stress.test.ts # 1,000-frame extreme audiovisual saturation benchmark
└── m14_regression_guard.test.ts         # Full backward-compatibility regression guard against 953 tests
```

---

## 3. Detailed Verification Strategy by Subsystem

### 3.1 Procedural Web Audio API Synthesis Test Suite (`m14_audio_synthesis.test.ts`)

#### 3.1.1 Architectural Contracts
The audio system must support two interface access patterns:
1. `SoundSynth` / `SoundSynthesizer`: Core procedural synthesis engine providing direct sound effect methods.
2. `AudioManager`: Central unified facade coordinating `AudioContextManager`, `SoundSynth`, and `MusicJingles`.

#### 3.1.2 Web Audio Mock Engine Requirements
Because Vitest runs in Node.js (`environment: 'node'`), all Web Audio API primitives must be simulated via an enhanced Mock Engine:
- **`MockAudioParam`**: Implements `setValueAtTime`, `linearRampToValueAtTime`, `exponentialRampToValueAtTime`, `cancelScheduledValues`. Must assert that exponential ramps never receive target values $\le 0$ (Web Audio spec throws `RangeError` if value $\le 0$).
- **`MockOscillatorNode`**: Simulates `type` (`sine`, `square`, `sawtooth`, `triangle`, `custom`), `frequency`, `setPeriodicWave()`, `start(time)`, `stop(time)`, `onended()`.
- **`MockGainNode`**: Simulates `gain` AudioParam, `connect()`, `disconnect()`.
- **`MockBiquadFilterNode`**: Simulates `type` (`lowpass`, `highpass`, `bandpass`, `notch`), `frequency`, `Q`, `gain`.
- **`MockAudioBufferSourceNode`**: Simulates `buffer`, `loop`, `playbackRate`, `start()`, `stop()`, `onended()`.
- **`MockAudioContext`**: Simulates `currentTime`, `sampleRate` (44100), `state` (`suspended` | `running` | `closed`), `destination`, node factory methods, `resume()`, `close()`.

#### 3.1.3 Sound Effect Synthesis Matrix Verification
Every single procedural SFX method across all expansion features must be verified for:
1. **Node Graph Topology**: Correct node creation and connection path to destination sub-bus (`sfxGain` or `masterGain`).
2. **AudioParam Bounds**: Finite, positive frequencies and valid gain scales in $[0.0, 1.0]$.
3. **No-Throw Guarantee**: Does not throw in:
   - Full mock environment (`window.AudioContext = MockAudioContext`)
   - Headless environment (`window.AudioContext = undefined`)
   - Suspended/Muted environment (`isMuted = true` or `state = 'suspended'`)
4. **Lifecycle & Node Teardown**: Calling `osc.stop()` or `source.stop()` triggers `onended` which invokes `disconnect()` and decrements active voice count.

#### 3.1.4 Comprehensive SFX Inventory
| Category | Method | Node Graph Description | Verification Target |
|---|---|---|---|
| **Boss 1 (Stage 10)** | `playHeavyLaser()` | Dual detuned sawtooth oscillators (180Hz $\to$ 40Hz) + resonant lowpass | Frequency sweep, finite ramps |
| | `playSpiralBulletWhoosh()` | Modulated bandpass filter sweep on white noise buffer | Filter frequency sweep |
| **Boss 2 (Stage 20)** | `playDimensionalTear()` | 55Hz square wave + 8Hz LFO FM modulation + high Q notch | LFO $\to$ Oscillator frequency connection |
| | `playVortexSuction()` | Triangle wave downward chirp (90Hz $\to$ 24Hz) + exponential gain swell | Sub-bass gain envelope |
| **Boss 3 (Stage 30)** | `playNaniteSplit()` | Arpeggiated square burst (880Hz, 1174Hz, 1480Hz, 1760Hz in 60ms) | Fast timer scheduling |
| | `playGrayGooDissolve()` | High-pass filtered white noise with rapid decay (0.25s) | Noise buffer source looping & stop |
| **Boss 4 (Stage 40)** | `playPhantomDive()` | Sinusoidal vibrato FM carrier (440Hz with 18Hz LFO) | Vibrato modulation depth |
| | `playPsionicStun()` | Square wave high-pitch squeal (1500Hz $\to$ 2200Hz) with ring mod | Gain ramp & pitch bend |
| **Boss 5 (Stage 50)** | `playOrbitalShield()` | Resonant bandpass hum at 220Hz + periodic phase pulse | Harmonic stability |
| | `playDarkMatterBeamCharge()` | Rising exponential pitch sweep (60Hz $\to$ 960Hz over 1.2s) | Exponential ramp timing |
| | `playDarkMatterBeamSweep()` | Massive white noise + 40Hz sub-bass triangle + lowpass filter | Dual-layer impact |
| | `playEnrageSiren()` | Alternating two-tone pitch (440Hz / 660Hz square waves at 4Hz) | Periodic frequency oscillation |
| **Crisis Events** | `playCrisisKlaxon()` | Authentic arcade double-beep klaxon (784Hz / 587Hz) | Tone burst sequence |
| | `playAIGlitch()` | Randomized frequency stepped burst (bitcrush style) | Stepped pitch intervals |
| | `playLightningCrackle()` | White noise burst with randomized transient clicks | Transient envelope |
| | `playDarkMatterIgnition()` | Sub-bass rumble (30Hz) + reverberant noise decay | Lowpass cutoff decay |
| **Allies Drones** | `playPlasmaBolt()` | High-speed chirp (1200Hz $\to$ 300Hz in 0.08s) | Escort drone autofire |
| | `playShieldRepairChime()` | Ascending major arpeggio chime (C5-E5-G5-C6) | Harmonic chimes |
| | `playFlakPing()` | Metallic high-Q bandpass ping (2400Hz, 0.04s) | Point-defense flak |
| | `playBomberFlyby()` | Low-frequency stereo panning pink noise sweep | Flyby envelope |
| | `playClusterBombThud()` | Deep low-frequency percussive thud (80Hz $\to$ 20Hz) | Bass drop impact |
| **Special Moves** | `playTargetLockChime()` | Dual sine ping (880Hz + 1760Hz) | Lock-on confirmation |
| | `playNovaMissileSwoosh()` | Filtered noise sweep + high-speed pitch dive | Salvo projectile swoosh |
| | `playChronoFreezeDrop()` | Deep 35Hz sub-bass drop + high-frequency clock tick | Time-freeze whoosh |
| | `playWarpRamBoom()` | Explosive kinetic sonic boom (white noise + 60Hz sawtooth) | Lane clear sonic boom |
| **Baseline SFX** | `playLaser()`, `playExplosion()`, `playAlienDive()`, `playTractorBeam()`, etc. | Core 1981 Galaga acoustic signatures | Backward compatibility |

#### 3.1.5 Voice Concurrency & Throttling
- Hard invariant: `MAX_CONCURRENT_VOICES = 12`.
- Test: Spamming 30 simultaneous sound triggers within 1 frame must drop excess voices cleanly without throwing, leaving exactly $\le 12$ active voices.
- When existing voices finish (`onended`), newly queued sounds must play without starvation.

---

### 3.2 Zero External Audio & Image Assets Verification (`m14_zero_assets_audit.test.ts`)

#### 3.2.1 Automated Filesystem Asset Audit
An automated test traversing the entire project repository (excluding `.git`, `node_modules`, and `.agents` metadata):
- **Image Extension Blacklist**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.tiff`, `.svg`, `.ico`, `.avif`.
- **Audio Extension Blacklist**: `.mp3`, `.wav`, `.ogg`, `.flac`, `.aac`, `.m4a`, `.wma`, `.opus`.
- **Target Directories**: `src/`, `public/`, `dist/assets/`, root directory.
- **Assertion**: `prohibitedFiles.length === 0`. If any file matches, test fails with file path and extension.

#### 3.2.2 Codebase AST / String Pattern Audit
A static scan of all source code (`src/**/*.ts`, `index.html`) ensuring:
1. No `new Image()` with external URL.
2. No `new Audio(...)` instantiations.
3. No `createImageBitmap(...)` calls.
4. No `.src = ...` pointing to external graphic/audio URLs or assets.
5. No dynamic `fetch(...)` loading `.png`, `.jpg`, `.mp3`, `.wav`.
6. No ES6 `import` statements referencing audio/image file extensions.

#### 3.2.3 Pure Procedural Sprite Architecture Verification
- Verifies that `SpriteRenderer.ts` registers all game sprites (Zako, Goei, Boss Galaga, Player single/dual, Drones, Bosses, Powerups, Crisis icons, Badges) exclusively as 2D bit matrices (`string[][]`).
- Verifies that `PALETTE` contains only canonical 1981 arcade hex color strings and `.` for transparency.

---

### 3.3 Canvas 2D VFX Shaders and Particle Engine Tests (`m14_vfx_shaders_particles.test.ts`)

#### 3.3.1 Screen Shake Decay Kinematics
- **Mathematical Specification**:
  - Intensity $I_0 \in [0, 8]\text{ px}$.
  - Duration $D \in [0.1, 0.8]\text{ s}$.
  - Timer $T(t) = \max(0, T_0 - dt)$.
  - Offset calculation: $(x_{offset}, y_{offset}) = (\text{random}(-1, 1) \cdot I(t), \text{random}(-1, 1) \cdot I(t))$.
  - Decay model: linear or exponential ($I(t) = I_0 \cdot \frac{T(t)}{D}$ or $I(t) = I_0 \cdot e^{-\lambda t}$).
- **Test Invariants**:
  1. Clamping: offsets must strictly satisfy $|x_{offset}| \le 8$ and $|y_{offset}| \le 8$.
  2. Monotonic decay: average displacement decays toward 0 over time.
  3. Absolute zero termination: when $T(t) \le 0$, $x_{offset} = 0$ and $y_{offset} = 0$ exactly.
  4. Reset integrity: `resetShake()` immediately zeros all offsets and cancels shake timer.

#### 3.3.2 Screen Flash Timer & Decay
- **Visual Feedback Types**:
  - White Damage Flash: player hit or boss armor damage (duration 80ms).
  - Cyan Shield Flash: kinetic deflector or Aegis pulse (duration 150ms).
  - Red Boss Alert Flash: boss enrage or crisis trigger (duration 300ms).
  - Violet Dark Matter Flash: Aeternum mega-beam firing (duration 400ms).
- **Test Invariants**:
  1. Alpha curve: $\alpha(t) = \alpha_0 \cdot \frac{T(t)}{D} \in [0.0, 1.0]$.
  2. Termination: when $T(t) \le 0$, flash is inactive ($\alpha = 0$).
  3. Color validity: hex color string format `#RRGGBB` or `rgba(...)`.
  4. Canvas State Isolation: flash overlay render must use `ctx.save()` and `ctx.restore()` to ensure `globalAlpha` and `fillStyle` are never leaked to subsequent render passes.

#### 3.3.3 Particle Pool Allocation Bounds (`ParticleSystem`)
- **Capacity**: Strict upper bound of 250 (`DEFAULT_MAX_PARTICLES = 250`).
- **Zero-GC Invariant**: `autoExpand: false`.
- **Test Invariants**:
  1. Burst exhaustion: requesting 820 particles (20 simultaneous boss explosions) acquires exactly 250 particles; remaining requests return `null` without throwing.
  2. Active count tracking: `getActiveCount() + getPool().getFreeCount() === 250`.
  3. Lifespan expiration: advancing time past maximum particle life ($t \ge 0.75\text{s}$) recycles all 250 particles back to the free pool (`activeCount === 0`, `freeCount === 250`).
  4. Preset integrity: all 6 presets (`SMALL`, `BOSS`, `PLAYER`, `HIT`, `DOCKING`, `BEAM_SPARKLE`) spawn valid particles with finite spatial coordinates ($x, y, v_x, v_y, drag, life, maxLife$).

#### 3.3.4 Procedural VFX Shaders Render Safety
- **VFX Shaders Tested**:
  - Chrono Freeze frost vignette: corner procedural frost bit-matrices (`CHRONO_FROST_CORNER`) and pale cyan overlay.
  - Warp Ram speed lines: radial streaks drawn with scalar canvas paths (`beginPath`, `moveTo`, `lineTo`, `stroke`).
  - Nova Barrage target reticles: corner bracket vector calculations.
  - Aeternum Mega-Beam: $60\%$ canvas width linear gradient sweep (`createLinearGradient`).
  - Psionic Shimmer: Sinusoidal horizontal displacement $x + \sin(\omega t) \cdot A$.
  - Nanite Particulate Cloud: Micro-sparks drawn from the particle pool.
  - The Contingency CRT scanlines: Horizontal scanline grid overlay.
- **Test Invariants**:
  1. **No-Throw Guarantee**: Renders cleanly on mock 2D canvas without DOM or WebGL.
  2. **Stack Symmetry**: `ctx.save()` count strictly equals `ctx.restore()` count in every single frame.
  3. **No Numerical Anomalies**: 0 `NaN`, 0 `Infinity`, 0 `-Infinity` passed to any canvas context method (`arc`, `fillRect`, `lineTo`, `translate`).

---

### 3.4 Zero-GC Invariant Under Extreme Audiovisual Saturation (`m14_zerogc_saturation_stress.test.ts`)

#### 3.4.1 Saturation Simulation Scenario
To rigorously prove the Zero-GC invariant, the test simulates **1,000 consecutive frames** ($16.6667\text{ ms}$ fixed timestep, 60 FPS, $\approx 16.67$ seconds of game time) with all high-intensity systems active simultaneously:
1. **Stage 50 Aeternum Core Dark Matter Mega-Beam**: Screen-wide $60\%$ width beam sweeping across canvas, active damage hitboxes, continuous beam particles.
2. **Dimensional Warp Ram**: Player ship executing hyper-speed invulnerable charge, sweeping lanes, speed lines rendering, particle wake emission.
3. **Chrono Freeze**: 3.0s time stop active, enemy $dt = 0$, frost vignette active, bullet time handling.
4. **50 Continuous Active Particles**: ParticleSystem continuously cycling 50–250 particles through spawn, drag update, and lifespan recycling.
5. **3 Allies Support Drones**: Escort autofiring plasma bolts, Aegis pulse active, Bomber cluster bombs exploding with 28px AOE shockwaves.
6. **Active Stellaris Crisis Event**: Ambient warning banner, CRT scanlines or rift distortion shaders active.

#### 3.4.2 Measured Invariants
1. **ObjectPool Bounds**:
   - `ParticleSystem`: exactly 250 (never expands).
   - `NovaMissilePool`: exactly 32 (never expands).
   - `ClusterBombPool`: exactly 16 (never expands).
   - `BombExplosionPool`: exactly 16 (never expands).
   - `EnergySparkPool`: exactly 32 (never expands).
   - `PowerUpPool`: exactly 32 (never expands).
   - `BulletPool`: bounded to max capacity.
2. **Heap Drift Measurement**:
   - Execute 100 warm-up frames to allow V8 JIT compilation and pool initializations to stabilize.
   - Record initial heap usage: `startHeap = process.memoryUsage().heapUsed`.
   - Execute 1,000 extreme saturation frames.
   - Record final heap usage: `endHeap = process.memoryUsage().heapUsed`.
   - Assert net heap growth: `(endHeap - startHeap) < 1.5 MB` (empirically negligible, zero systematic heap leak).
3. **Audio Voice Saturation Stability**:
   - Total active audio voices $\le 12$ at all times.
   - 0 accumulated un-reclaimed event listeners or disconnected nodes.
4. **Canvas State Balance**:
   - Canvas `save()` and `restore()` calls remain 100% matched across all 1,000 frames.

---

## 4. Regression Analysis Against Existing 953 Tests

### 4.1 Regression Hazard Matrix

| Risk ID | Hazard Description | Impacted Test Files | Severity | Mandatory Mitigation Strategy |
|---|---|---|---|---|
| **RH-01** | Replacing or renaming `SoundSynth` / `AudioContextManager` breaking existing call signatures | `tests/unit/audio_particles.test.ts` (32 tests)<br>`tests/unit/core.test.ts` (41 tests)<br>`tests/unit/m13_special_moves.test.ts` (14 tests) | **CRITICAL** | Milestone 14 must retain `SoundSynth` and `AudioContextManager` classes with all existing public methods (`playLaser`, `playLaserDual`, `playAlienDive`, `playTractorBeam`, `playExplosion`, `playBossHit`, `playEvent`, `stopAll`, `getInstance()`, `resetInstance()`). New classes like `AudioManager` or `SoundSynthesizer` should serve as unified facades or aliases. |
| **RH-02** | Screen shake or flash altering canvas transformation matrix without restoration | `tests/unit/hud_screens.test.ts` (36 tests)<br>`tests/unit/viewport.test.ts` (7 tests)<br>`tests/unit/adversarial_challenger_3.test.ts` (12 tests) | **HIGH** | All screen shake translations (`ctx.translate(shakeX, shakeY)`) and screen flash fills must be enclosed strictly in `ctx.save()` and `ctx.restore()` blocks. Tests checking HUD element coordinates will fail if the matrix remains translated. |
| **RH-03** | Modifying `ParticleSystem` default capacity from 250 or altering preset parameters | `tests/unit/m6_challenger_2_adversarial.test.ts` (18 tests)<br>`tests/unit/audio_particles.test.ts` (32 tests) | **HIGH** | `ParticleSystem.DEFAULT_MAX_PARTICLES = 250` and the exact method signatures (`spawnSmallAlienExplosion`, `spawnBossExplosion`, `spawnPlayerExplosion`, `spawnHitSparks`, `spawnDockingSparkles`) must remain unchanged. |
| **RH-04** | Introducing dynamic `new Canvas()` or gradient instantiations per frame causing GC allocation | `tests/unit/stress_m2.test.ts` (15 tests)<br>`tests/unit/m13_zerogc_stress.test.ts` (6 tests) | **HIGH** | Shaders and visual effects must use scalar canvas drawing commands or cached linear gradients. Never instantiate offscreen canvases dynamically inside `render()`. |
| **RH-05** | Introducing external audio or image dependencies breaking Vercel build audit | `tests/unit/vercel_build_audit.test.ts` (11 tests) | **CRITICAL** | Zero asset files permitted. All sound effects must remain purely procedural Web Audio graphs, and all graphics must remain pure canvas bit-matrices. |
| **RH-06** | Adding unhandled Web Audio API calls in headless test environments | All 52 test files invoking `new Game()` | **HIGH** | All new audio methods must verify context availability (`if (!ctx) return false;`) and catch any audio context exceptions safely, ensuring headless environments never crash. |
| **RH-07** | Incomplete mock Web Audio implementation causing `exponentialRampToValueAtTime` errors | `tests/unit/audio_particles.test.ts`<br>`tests/unit/m14_audio_synthesis.test.ts` | **MEDIUM** | In the Web Audio API spec, `exponentialRampToValueAtTime(0, time)` throws `RangeError: The float target value provided must be positive and non-zero`. All exponential gain ramps must target $\ge 0.0001$ or $0.001$, never $0.0$. |

---

## 5. Concrete Test Implementation Blueprints for Milestone 14

### 5.1 Suite 1: `tests/unit/m14_audio_synthesis.test.ts`
```typescript
/**
 * Test Structure Blueprint:
 * 1. Mock Audio Engine Setup:
 *    - Enhanced MockAudioContext with complete AudioParam, Oscillator, Gain, BiquadFilter, AudioBufferSource, PeriodicWave.
 * 2. Facade & Singleton Lifecycle:
 *    - SoundSynth and AudioManager singleton access, resetInstance(), getStatus().
 * 3. Boss SFX Procedural Synthesis (Stages 10, 20, 30, 40, 50):
 *    - Cyber Dreadnought heavy laser & spiral bullet whoosh.
 *    - Dimensional Leviathan dimensional tear & vortex suction.
 *    - Nanite Colossus mini-construct split & gray goo dissolve.
 *    - Psionic Harbinger phantom dive warble & psionic stun screech.
 *    - Aeternum Core orbital shield, dark matter mega-beam charge & sweep, enrage siren.
 * 4. Crisis Events Audio Cues:
 *    - Klaxon alert, AI glitch, lightning crackle, dark matter ignition.
 * 5. Allies & Special Moves SFX:
 *    - Plasma bolt, shield repair chime, flak ping, bomber flyby, cluster bomb thud.
 *    - Nova missile swoosh, chrono freeze drop, warp ram sonic boom.
 * 6. Concurrency & Voice Limiter Invariants:
 *    - Hard 12-voice ceiling.
 *    - Rapid firing of 30 sounds in 1 frame drops excess gracefully without throwing.
 * 7. Resource Disconnection & Teardown:
 *    - Verify all nodes call disconnect() on sound completion.
 */
```

### 5.2 Suite 2: `tests/unit/m14_zero_assets_audit.test.ts`
```typescript
/**
 * Test Structure Blueprint:
 * 1. Filesystem Recursive Scan:
 *    - Traverses project root excluding .git, node_modules, .agents.
 *    - Asserts 0 files matching: .png, .jpg, .jpeg, .gif, .webp, .bmp, .tiff, .svg, .ico, .avif.
 *    - Asserts 0 files matching: .mp3, .wav, .ogg, .flac, .aac, .m4a, .wma, .opus.
 * 2. Codebase Import & Constructor AST Scan:
 *    - Reads all files in src/ and index.html.
 *    - Asserts no occurrences of new Audio(), new Image(), createImageBitmap(), .src = ...
 * 3. Sprite Matrix Pure Procedural Integrity:
 *    - Validates SpriteRenderer bit-matrices and PALETTE color keys.
 */
```

### 5.3 Suite 3: `tests/unit/m14_vfx_shaders_particles.test.ts`
```typescript
/**
 * Test Structure Blueprint:
 * 1. Screen Shake Subsystem:
 *    - triggerShake(intensity, duration).
 *    - Verify clamping within [-8, 8] px.
 *    - Verify monotonic decay over dt.
 *    - Verify offset strictly equals (0, 0) when duration expires.
 * 2. Screen Flash Subsystem:
 *    - triggerFlash(color, duration, alpha).
 *    - Verify alpha linear decay.
 *    - Verify expiration resets flash state.
 * 3. ParticleSystem Allocation Invariants:
 *    - Capacity strictly 250 with autoExpand: false.
 *    - 20 simultaneous boss explosions (820 requested) gracefully capped at 250.
 *    - Lifespan elapsed -> 100% recycling to free pool.
 * 4. Procedural Canvas 2D VFX Shaders Render Tests:
 *    - Chrono frost vignette render call without throwing.
 *    - Warp ram speed lines render call without throwing.
 *    - Aeternum mega-beam 60% sweep gradient render call without throwing.
 *    - Verify exact symmetry of ctx.save() and ctx.restore().
 *    - Assert 0 NaN or Infinity in canvas drawing coordinates.
 */
```

### 5.4 Suite 4: `tests/unit/m14_zerogc_saturation_stress.test.ts`
```typescript
/**
 * Test Structure Blueprint:
 * 1. Extreme Multi-System Saturation Setup:
 *    - Game state = 'PLAYING', Stage 50.
 *    - Active: Aeternum Mega-Beam + Warp Ram + Chrono Freeze + 50 particles + 3 Drones + Crisis overlay.
 * 2. 1,000-Frame Fixed Timestep Loop:
 *    - 1,000 ticks at dt = 1/60s.
 *    - Assert ObjectPool capacities remain strictly invariant:
 *      ParticleSystem: 250, NovaMissile: 32, ClusterBomb: 16, BombExplosion: 16, EnergySpark: 32, PowerUp: 32.
 * 3. Heap Drift Measurement:
 *    - Net heap growth < 1.5 MB over 1,000 frames.
 * 4. Concurrency & Canvas Stack Integrity:
 *    - Audio voice count <= 12.
 *    - Canvas save/restore delta === 0.
 */
```

### 5.5 Suite 5: `tests/unit/m14_regression_guard.test.ts`
```typescript
/**
 * Test Structure Blueprint:
 * 1. Backward Compatibility Contract Verification:
 *    - SoundSynth methods playLaser, playExplosion, playAlienDive, playTractorBeam, playBossHit behave identically.
 *    - ParticleSystem presets spawnSmallAlienExplosion, spawnBossExplosion, etc., remain intact.
 * 2. Integration with Game.ts Render Loop:
 *    - Calling game.render(ctx) with screen shake and flash active does not taint subsequent HUD or enemy rendering.
 * 3. Multi-Milestone Baseline Verification:
 *    - M1-M8 core loop, M9 50-round difficulty scaling, M10 11 crisis events, M11 powerups, M12 5 bosses, M13 allies & specials.
 */
```

---

## 6. Conclusion & Recommendation for Implementation Swarm
1. **Zero Breaking Changes**: Preserve existing `SoundSynth` and `AudioContextManager` classes to safeguard the existing 953 tests.
2. **Unified Facade Pattern**: Implement `AudioManager` as a high-level facade wrapping `AudioContextManager`, `SoundSynth`, and `MusicJingles`.
3. **Strict Zero-Allocation Rendering**: Pre-calculate or cache linear gradients and procedural matrices; do not allocate offscreen canvases per frame.
4. **Canvas State Encapsulation**: Enforce mandatory `ctx.save()` / `ctx.restore()` pairing across all screen shake, screen flash, and shader render functions.
5. **Node Environment Safety**: All Web Audio API calls must gracefully handle missing or suspended audio contexts in headless and SSR environments.
