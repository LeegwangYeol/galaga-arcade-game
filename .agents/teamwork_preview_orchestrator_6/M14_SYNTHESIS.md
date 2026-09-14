# Milestone 14 Synthesis: Procedural Audio & Canvas 2D VFX Shaders

## 1. Executive Summary & Consensus
All three Milestone 14 Explorers (`m14_explorer_1`, `m14_explorer_2`, `m14_explorer_3`) have completed their investigations and concurred on a unified, zero-GC, zero-external-asset architecture for procedural Web Audio sound synthesis and Canvas 2D VFX shaders.

### Core Unanimous Principles:
1. **100% Pure Procedural Assets**: Zero external audio (`.mp3`, `.wav`, `.ogg`) or visual (`.png`, `.jpg`, `.svg`, `.webp`) dependencies. All sound is synthesized via Web Audio API node graphs; all visuals are rendered via Canvas 2D scalar drawing and bit-matrices.
2. **Zero-GC Invariant at 60 FPS**: All dynamic VFX (speed lines, exhaust trails, nanite swarm motes, lightning vertices, spacetime fissure coordinates) utilize pre-allocated `Float32Array` buffers. Drawing operations use scalar properties (`ctx.globalAlpha = scalar; ctx.fillStyle = PALETTE.CONSTANT;`) to eliminate dynamic string interpolations.
3. **Screen Shake Separation**: Playfield layers (starfield, entities, boss, crisis) are wrapped in a translated context (`ctx.translate(shakeX, shakeY)`), leaving HUD score headers and footers stable in screen space.
4. **Leak-Free Web Audio Lifecycle**: Expanded voice limit to 16 with priority tiers, debouncing, and dual-cleanup (`onended` event + watchdog `setTimeout`) preventing detached audio node memory leaks.

---

## 2. Technical Architecture & Component Specifications

### 2.1 Procedural Web Audio Synthesis Engine (`src/audio/`)
- **Voice Allocation**: Expanded max simultaneous voices to 16 with priority-based preemption:
  - Priority 3 (Critical): Boss mega-beam, Chrono Freeze bass drop, Warp Ram sonic boom, Crisis alert.
  - Priority 2 (Standard): Special move salvos, boss attack sounds, drone abilities, explosion sounds.
  - Priority 1 (Background): Bullet chirps, particle pops, star ambient hum.
- **Node Graph Designs**:
  - **Boss SFX**:
    - Cyber Dreadnought: Square wave laser pulse (180Hz -> 60Hz, 0.25s) with resonant low-pass filter (800Hz).
    - Dimensional Leviathan: Frequency-modulated sine wave (40Hz carrier, 6Hz LFO vibrato) + filtered pink noise black-hole vortex rumble.
    - Nanite Colossus: Dual detuned saw waves (600Hz & 608Hz) with band-pass filter sweep (2kHz -> 400Hz) for split shimmer; high-pass white noise hiss for bullet dissolve.
    - Psionic Harbinger: Dual triangle wave warble with fast exponential vibrato (12Hz) for phantoms; frequency sweep (2400Hz -> 300Hz, 0.4s) for telekinetic stun.
    - Aeternum Core: Exponential frequency ramp (60Hz -> 1800Hz, 1.0s) + sub-bass rumble for mega-beam charge; broadband white noise + 80Hz saw roar (2.5s) for beam firing; 2-tone alternating enrage siren (440Hz / 880Hz).
  - **Crisis Soundscapes**:
    - Ambient klaxon alert: Dual saw-tooth interval chime (330Hz / 495Hz).
    - Rogue AI glitch: Rapid square wave frequency hopping (400 - 1600Hz) with 50Hz amplitude modulation.
    - Cosmic lightning: High-pass filtered noise burst (decay 0.12s) with crackle pitch sweeps.
    - Dark matter ignition: Multi-oscillator cluster boom with sub-bass drop (120Hz -> 20Hz).
  - **Allies & Special Moves**:
    - Escort Drone: High-pitch plasma chirp (980Hz -> 420Hz, 0.08s).
    - Aegis Drone: Harmonic crystalline triad chime (523Hz, 659Hz, 784Hz) + high-frequency flak ping (1800Hz).
    - Bomber Drone: Low drone rumble (85Hz) + heavy cluster bomb thud with exponential decay (70Hz -> 30Hz, 0.35s).
    - Nova Barrage: 3-tone arpeggiated lock chime (C5-E5-G5) + 16 staggered missile launch whooshes.
    - Chrono Freeze: Sub-bass drop (120Hz -> 30Hz) with sudden low-pass gate (200Hz cutoff) + ticking clock freeze echo.
    - Dimensional Warp Ram: Hyper-speed sonic boom (80Hz punch + 2400Hz white noise Doppler sweep).

### 2.2 Canvas 2D VFX Shaders & Rendering (`src/renderer/`, `src/core/`)
- **Screen Shake System (`ScreenShake`)**:
  - Properties: `shakeIntensity = 1.5`, `shakeDuration`, `shakeTimer`, `shakeOffsetX`, `shakeOffsetY`.
  - Micro-shake ($\pm 1.5\text{px}$) for Warp Ram; heavy rumble ($\pm 2.0\text{px}$) for Aeternum mega-beam.
  - World render pass in `Game.ts` wrapped in `ctx.save()`, `ctx.translate(shakeOffsetX, shakeOffsetY)`, `ctx.restore()`.
- **Special Moves VFX**:
  - **Chrono Freeze**:
    - Full-screen edge frost bars (top, bottom, left, right 6px rims) with harmonic alpha breathing ($\alpha = 0.12 + 0.04\sin(8t)$).
    - Four-corner `CHRONO_FROST_CORNER` matrices ($16 \times 16$) with orientations and breathing scale/alpha.
    - Starfield update frozen ($\Delta t = 0$), warm star colors remapped to ice cyan/white (`#C0F0FF`, `#00FFFF`, `#FFFFFF`).
  - **Dimensional Warp Ram**:
    - 24 radial speed lines (`Float32Array`) streaming downward ($700 - 1100\text{px/s}$) in cyan/white.
    - Relativistic Doppler particle wake (purple -> cyan -> white) emitted from engine hardpoints every 2 frames.
    - Camera micro-shake ($\pm 1.5\text{px}$).
  - **Nova Barrage**:
    - 5-element ring-buffer (`trailX`, `trailY`) per `NovaMissile` rendering tapered neon cyan exhaust trails.
    - 4-corner targeting reticle brackets with pulsing alpha around acquired enemy and boss targets.
    - Radial impact spark bursts (12-16 particles) and shockwave rings on missile strikes.
- **Boss Tells & Atmospheric Shaders**:
  - **Aeternum Core Mega-Beam**:
    - Danger zone boundary guides: Two vertical dashed lines at $X = \text{centerX} \pm 67$ ($134\text{px}$ width = 60% canvas).
    - Core pre-ignition laser: Transverse jittering beam at $\text{centerX}$ widening from 1px to 4px.
    - Firing beam: Multi-stop linear gradient (violet outer shroud -> cyan sub-core -> white thermal core) with sinusoidal plasma turbulence edges and ground impact splash flare.
  - **Psionic Harbinger Phantoms**:
    - Ethereal tell: High-frequency horizontal jitter ($\pm 1.5\text{px}$), magenta/violet chromatic silhouette after-images, and sinusoidal alpha breathing ($\alpha \in [0.35, 0.85]$).
  - **Nanite Colossus Gray Goo**:
    - 20-mote Brownian swarm buffer (`Float32Array`) orbiting cloud center with electric micro-arcs between motes $< 6\text{px}$, and sizzle sparks on bullet dissolution.
  - **Crisis Atmosphere Shaders**:
    - The Contingency: Rolling CRT scanline pulse (3px stride) with vertical sync bar sweep and random single-frame horizontal glitch displacement.
    - The Unbidden: Jagged 10-vertex spacetime rift tear with electric magenta border and concentric gravitational lensing ripples.
    - Hyperspace Storm: Primary lightning trunk with 2-3 branching fractal forks and pre-discharge lane boundary ionization.

---

## 3. Write Ownership & File Boundaries

The Milestone 14 implementation Worker has exclusive write ownership over:
- `src/audio/SoundSynthesizer.ts` & `src/audio/AudioManager.ts` (audio synthesis graphs, 16-voice manager, debouncing)
- `src/renderer/SpriteRenderer.ts` (procedural VFX draw helpers: beam gradients, reticles, frost vignette, speed lines)
- `src/systems/ParticleSystem.ts` (nova impact, warp wake, nanite dissolve presets)
- `src/systems/Starfield.ts` (ice desaturation & freeze hook)
- `src/core/Game.ts` (screen shake camera transform, starfield freeze integration)
- `src/core/specials/pools/NovaMissile.ts` (exhaust trail ring buffer)
- `src/core/specials/SpecialMovesManager.ts` (speed lines, reticles, screen shake triggers)
- `src/core/boss/bosses/AeternumCore.ts`, `PsionicHarbinger.ts`, `NaniteColossus.ts` (enhanced visual tells)
- `src/core/crisis/events/TheContingencyEvent.ts`, `TheUnbiddenEvent.ts`, `HyperspaceStormEvent.ts` (crisis VFX shaders)
- `tests/unit/m14_*.test.ts` (unit & integration tests)

---

## 4. Test & Verification Plan
1. `tests/unit/m14_procedural_audio.test.ts`:
   - Verify every new sound effect method creates valid audio graphs without throwing in mock/headless AudioContext.
   - Verify 16-voice priority queue and debouncing logic.
   - Verify node disconnection cleanup.
2. `tests/unit/m14_canvas_vfx.test.ts`:
   - Verify screen shake translation, intensity clamping, and decay to 0.
   - Verify Chrono Freeze frost overlay, corner matrix placement, and starfield freeze state.
   - Verify Warp Ram speed lines kinematics, Doppler particle emission, and invulnerability.
   - Verify Nova Barrage trail buffer and target reticle rendering.
   - Verify Boss tells: Aeternum beam bounds, Psionic phantom jitter, Nanite swarm motes.
   - Verify Crisis shaders: CRT scanlines, Unbidden rift, Hyperspace lightning forks.
3. `tests/unit/m14_zerogc_stress.test.ts`:
   - 1,000-frame saturation stress test with simultaneous Warp Ram + Chrono Freeze + Mega-Beam + 50 particles.
   - Verify zero un-recycled pool entities and stable memory footprint.
4. `tests/unit/m14_asset_autonomy.test.ts`:
   - Filesystem scan verifying 0 `.png`, `.jpg`, `.mp3`, `.wav` files outside `node_modules`.
5. Full suite verification: `npm test` (all 52+ test files, 953+ tests passing, 0 failures) and `npm run build` (clean Vite build).
