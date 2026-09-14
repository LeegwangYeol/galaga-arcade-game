# Milestone 14: Procedural Audio Synthesis Analysis & Architecture Report

> **Agent**: `m14_explorer_1`  
> **Mission**: Comprehensive investigation of existing procedural Web Audio engine and detailed mathematical design of synthesis graphs for 5 Epic Bosses, 11 Crisis Events, Allies Support Drones, and Special Moves.  
> **Timestamp**: 2026-09-04T10:40:00Z  
> **Compliance**: Zero external audio files (`0` .mp3 / .wav / .ogg), pure Web Audio API synthesis primitives (`OscillatorNode`, `GainNode`, `BiquadFilterNode`, `AudioBufferSourceNode`, `PeriodicWave`), bounded voice channels, leak-free node lifecycle.

---

## 1. Baseline Architectural Survey

### 1.1 Existing Audio Subsystem Overview
The Galaga Arcade Web Game audio engine consists of three core components located in `src/audio/`:
1. **`AudioContextManager`** (`src/audio/AudioContextManager.ts`):
   - Central Web Audio API coordinator and routing hierarchy:
     $$\text{Source Node} \longrightarrow \text{SFX / Music Sub-Bus Gain} \longrightarrow \text{Master Gain} \longrightarrow \text{AudioDestination}$$
   - Handles automatic browser gesture unlock across `['pointerdown', 'touchstart', 'keydown', 'mousedown']`.
   - Anti-click parameter smoothing using `linearRampToValueAtTime` over 20–25ms.
   - Headless test environment safety: safely returns `null` or mock stubs when `AudioContext` is absent in Node.js/Vitest.
2. **`SoundSynth`** (`src/audio/SoundSynth.ts`):
   - Procedural sound effect synthesizer featuring zero-allocation pre-rendered 2.0s white noise buffer (`whiteNoiseBuffer`).
   - Voice concurrency tracking (`activeVoiceCount` bounded by `MAX_CONCURRENT_VOICES = 12`).
   - Discrete node disconnection on `osc.onended` callbacks to eliminate memory leaks.
   - Existing sound catalog:
     - `playLaser()`: Sawtooth $880\text{ Hz} \to 120\text{ Hz}$ exponential pitch dive over $0.12\text{ s}$.
     - `playLaserDual()`: Detuned dual chirp ($0.98\times$ and $1.04\times$ pitch).
     - `playAlienDive(type)`: Sawtooth carrier with sinusoidal FM pitch dive ($12.0\text{--}16.5\text{ Hz}$ LFO, depth $120\text{--}170\text{ Hz}$) over $0.60\text{--}0.75\text{ s}$.
     - `playTractorBeam(active)`: Continuous dual detuned oscillators ($64\text{ Hz}$ saw + $70\text{ Hz}$ square) with resonant lowpass ($340\text{ Hz}$, $Q=4.5$) and $7.0\text{ Hz}$ AM tremolo pulse.
     - `playExplosion(type)`: White noise buffer source with resonant lowpass filter decay ($2200\text{ Hz} \to 40\text{ Hz}$ for boss, $1100\text{ Hz} \to 30\text{ Hz}$ for large, $1500\text{ Hz} \to 50\text{ Hz}$ for small) + sub-bass triangle/sine oscillator ($140\text{--}180\text{ Hz} \to 28\text{--}32\text{ Hz}$).
     - `playBossHit()`: Square wave $1200\text{ Hz} \to 750\text{ Hz}$ in $0.06\text{ s}$.
3. **`MusicJingles`** (`src/audio/MusicJingles.ts`):
   - Authentic 1981 Namco WSG emulation using custom 12.5% and 25% pulse waves calculated via Fourier synthesis and cached in `PulseWaveCache`.
   - Polyphonic dual-track scheduler: Lead + Bass with equal-temperament frequency calculation ($f = 440 \times 2^{(n-69)/12}$), ADSR envelopes, and cancellation handles.

### 1.2 Zero External Asset Audit
- Local filesystem query for audio file extensions (`.mp3`, `.wav`, `.ogg`, `.aac`, `.flac`, `.m4a`, `.weba`) returned **0 matches**.
- The entire project runs on code-synthesized Web Audio nodes, strictly meeting the Zero-External-Asset invariant.

---

## 2. Procedural Synthesis Graph Designs for Expansion Mechanics

### 2.1 5 Epic Boss Encounters (Milestone 12)

#### 1. Stage 10: Cyber Dreadnought (사이버 전함)
##### A. Heavy Laser Cannon Blast (`playHeavyLaserBlast`)
- **Gameplay Trigger**: Fired during precision railgun shots (`CyberDreadnought.updatePhase2`, line 163) and heavy turret salvos.
- **Acoustic Goal**: High-energy industrial laser blast with metallic resonance and deep bass punch.
- **Synthesis Graph**:
  ```
  Osc1 (Sawtooth, 540->75Hz) ──┐
                               ├──> BiquadFilter (Lowpass 3200->180Hz, Q=5.5) ──> Gain1 (ADSR) ──┐
  Osc2 (Square, 270->45Hz)   ──┘                                                                 ├──> SFX Bus
                                                                                                 │
  NoiseSource (White) ───────────> BiquadFilter (Highpass 2400Hz, Q=1.0) ────────> Gain2 (0.06s) ──┘
  ```
- **Envelope & Modulation**:
  - `Osc1`: Sawtooth, $540\text{ Hz} \to 75\text{ Hz}$ exponential ramp over $0.35\text{ s}$.
  - `Osc2`: Square sub-octave, $270\text{ Hz} \to 45\text{ Hz}$ exponential ramp over $0.35\text{ s}$.
  - `Filter1`: Lowpass, cutoff $3200\text{ Hz} \to 180\text{ Hz}$ exponential ramp, $Q = 5.5$.
  - `Gain1`: Attack $0.003\text{ s}$ to peak $0.38 \times \text{vol}$, decay to $0.15$ at $0.15\text{ s}$, release to $0.0001$ at $0.35\text{ s}$.
  - `NoiseSource`: White noise buffer, highpass filtered at $2400\text{ Hz}$ for muzzle snap transient (duration $0.06\text{ s}$, peak $0.30 \times \text{vol}$).
  - Total Duration: $0.35\text{ s}$.

##### B. Spiral Bullet Ring Whoosh (`playSpiralRingWhoosh`)
- **Gameplay Trigger**: Emitted during 4-arm rotating spiral bullet bursts (`CyberDreadnought.updatePhase2`, line 140).
- **Acoustic Goal**: Swirling rotary aerodynamic whoosh with Doppler phasing.
- **Synthesis Graph**:
  ```
  NoiseSource (White) ──> BiquadFilter (Bandpass 380->1050->420Hz, Q=4.2) ──> Tremolo Gain ──> Master Gain ──> SFX Bus
                                                                                    ▲
  LFO (Triangle 7.5Hz) ─────────────────────────────────────────────────────────────┘
  ```
- **Envelope & Modulation**:
  - `NoiseSource`: Cached white noise buffer source.
  - `Bandpass Filter`: Center frequency sweeps $380\text{ Hz} \to 1050\text{ Hz}$ at $t = 0.12\text{ s}$, then returns to $420\text{ Hz}$ at $t = 0.28\text{ s}$. $Q = 4.2$.
  - `LFO`: Triangle wave at $7.5\text{ Hz}$ modulating tremolo gain depth by $0.45$.
  - `Master Gain`: Attack $0.03\text{ s}$ to $0.24 \times \text{vol}$, sustain $0.18$, exponential release to $0.0001$ at $0.28\text{ s}$.
  - Total Duration: $0.28\text{ s}$. Debounced to minimum 120ms interval to prevent voice saturation.

---

#### 2. Stage 20: Dimensional Leviathan (차원수 레비아탄)
##### A. Gravitational Dimensional Tear Hum (`playDimensionalTearHum`)
- **Gameplay Trigger**: Void Shroud phase shifting and dimensional tear formation (`DimensionalLeviathan.updatePhase1`, line 80).
- **Acoustic Goal**: Ominous, otherworldly gravitational resonance with binaural sub-harmonic beating.
- **Synthesis Graph**:
  ```
  Osc1 (Sine, 58.5Hz)     ──┐
                            ├──> BiquadFilter (Bandpass 175Hz, Q=4.0) ──> Master Gain ──> SFX Bus
  Osc2 (Triangle, 63.2Hz) ──┘                  ▲
              ▲                                │
  LFO1 (Sine, 3.5Hz, depth 6Hz) ───────────────┘
  ```
- **Envelope & Modulation**:
  - `Osc1` & `Osc2`: Detuned by $4.7\text{ Hz}$, generating continuous acoustic phase interference.
  - `LFO1`: Sine wave at $3.5\text{ Hz}$, modulates `Osc1` frequency by $\pm 6\text{ Hz}$.
  - `Filter`: Bandpass at $175\text{ Hz}$, $Q = 4.0$.
  - `Master Gain`: Attack $0.12\text{ s}$ to $0.30 \times \text{vol}$, sustain $0.24 \times \text{vol}$ for $0.35\text{ s}$, release to $0.0001$ at $0.75\text{ s}$.
  - Total Duration: $0.75\text{ s}$.

##### B. Black-Hole Vortex Suction Rumble (`playBlackHoleSuctionRumble`)
- **Gameplay Trigger**: Phase 2 central black-hole suction vortex actively pulling player fighter (`DimensionalLeviathan.updatePhase2`, line 115).
- **Acoustic Goal**: Low-frequency seismic implosion roar, matter collapsing into the singularity.
- **Synthesis Graph**:
  ```
  NoiseSource (White) ──> BiquadFilter (Lowpass 480->40Hz, Q=6.0) ──┐
                                                                    ├──> Tremolo Gain ──> Master Gain ──> SFX Bus
  SubOsc (Sine, 90->24Hz) ──────────────────────────────────────────┘          ▲
                                                                               │
  LFO (Sine, 11Hz) ────────────────────────────────────────────────────────────┘
  ```
- **Envelope & Modulation**:
  - `SubOsc`: Sine wave, pitch plunging exponentially from $90\text{ Hz}$ down to $24\text{ Hz}$ over $0.85\text{ s}$.
  - `NoiseSource`: Cached white noise, lowpass filtered with cutoff sweeping $480\text{ Hz} \to 40\text{ Hz}$, $Q = 6.0$.
  - `LFO`: $11\text{ Hz}$ sine wave modulating gain depth between $0.3$ and $1.0$.
  - `Master Gain`: Attack $0.08\text{ s}$, peak $0.38 \times \text{vol}$, sustain $0.32$, release to $0.0001$ at $0.85\text{ s}$.
  - Total Duration: $0.85\text{ s}$.

---

#### 3. Stage 30: Nanite Swarm Colossus (나노머신 거신)
##### A. Mini-Construct Split Shimmer (`playNaniteSplitShimmer`)
- **Gameplay Trigger**: Colossus splits into 4 autonomous Mini-Constructs at 50% HP (`NaniteColossus.checkPhaseTransitions`, line 66).
- **Acoustic Goal**: Crystalline metallic fission shimmer with high-frequency harmonic cascade.
- **Synthesis Graph**:
  ```
  Carrier (Sine, 1760Hz) ◄── FM ── Modulator (Sine, 880Hz, index 450->20) ──┐
                                                                            ├──> Highpass Filter (2kHz) ──> Gain ──> SFX Bus
  Cluster Tone 2 (Sine, 2640Hz) ────────────────────────────────────────────┤
  Noise Burst (White) ──> Bandpass (6200Hz, Q=5.0) ─────────────────────────┘
  ```
- **Envelope & Modulation**:
  - FM Pair: $1760\text{ Hz}$ carrier with $880\text{ Hz}$ modulator, modulation index decaying from $450\text{ Hz}$ to $20\text{ Hz}$ over $0.20\text{ s}$.
  - Overtone: $2640\text{ Hz}$ (E7) sine wave at $0.25$ amplitude.
  - High noise burst: $0.08\text{ s}$ bandpass burst at $6200\text{ Hz}$.
  - `Gain`: Attack $0.003\text{ s}$ to $0.30 \times \text{vol}$, decay to $0.12$ at $0.10\text{ s}$, exponential release to $0.0001$ at $0.28\text{ s}$.
  - Total Duration: $0.28\text{ s}$.

##### B. Gray Goo Dissolve Hiss (`playGrayGooDissolveHiss`)
- **Gameplay Trigger**: Nanite gray goo cloud dissolves incoming player missiles (`NaniteColossus.updatePhase2`, line 172).
- **Acoustic Goal**: Microscopic chemical sizzle and vaporizing hiss.
- **Synthesis Graph**:
  ```
  NoiseSource (White) ──> Highpass (3500Hz) ──> Bandpass (2800->6800Hz, Q=7.0) ──> Flutter Gain ──> SFX Bus
                                                                                          ▲
  Flutter LFO (32Hz) ─────────────────────────────────────────────────────────────────────┘
  ```
- **Envelope & Modulation**:
  - Cascaded filters: Highpass at $3500\text{ Hz}$ into sweeping resonant bandpass ($2800\text{ Hz} \to 6800\text{ Hz}$, $Q = 7.0$).
  - `Flutter LFO`: $32\text{ Hz}$ amplitude modulation providing particulate dissolution texture.
  - `Gain`: Instantaneous attack $0.002\text{ s}$, peak $0.26 \times \text{vol}$, exponential decay to $0.0001$ in $0.14\text{ s}$.
  - Total Duration: $0.14\text{ s}$.

---

#### 4. Stage 40: Psionic Shroud Harbinger (장막의 사자)
##### A. Phantom Clone Dive Warble (`playPhantomDiveWarble`)
- **Gameplay Trigger**: Illusory phantom clones dive-bomb player (`PsionicHarbinger.updatePhase1`, line 134).
- **Acoustic Goal**: Hallucinatory, ghost-like ethereal warble, distinctly distinguishable from regular alien dive squeals.
- **Synthesis Graph**:
  ```
  Osc1 (Sine, 720->210Hz) ◄── FM ── LFO (Sine, 22Hz, depth 95->30Hz) ──┐
                                                                       ├──> Lowpass (1500Hz, Q=3.5) ──> Gain ──> SFX Bus
  Osc2 (Sine, 728->218Hz) ─────────────────────────────────────────────┘
  ```
- **Envelope & Modulation**:
  - Carrier pair: Dual detuned sine waves ($720\text{ Hz}$ and $728\text{ Hz}$) sweeping down to $210\text{ Hz}$ and $218\text{ Hz}$ over $0.60\text{ s}$.
  - `LFO`: $22\text{ Hz}$ sine wave with pitch vibrato depth decaying from $\pm 95\text{ Hz}$ to $\pm 30\text{ Hz}$.
  - `Filter`: Lowpass at $1500\text{ Hz}$, $Q = 3.5$.
  - `Gain`: Attack $0.04\text{ s}$ to $0.28 \times \text{vol}$, sustain $0.22$, release to $0.0001$ at $0.60\text{ s}$.
  - Total Duration: $0.60\text{ s}$.

##### B. Telekinetic Stun Screech (`playTelekineticStunScreech`)
- **Gameplay Trigger**: Psionic Harbinger fires telekinetic stun distortion wave (`PsionicHarbinger.updatePhase2`, line 167).
- **Acoustic Goal**: Piercing neuro-electric psychic screech that accompanies player thruster disruption.
- **Synthesis Graph**:
  ```
  Osc1 (Square, 2200->780Hz) ◄── FM ── LFO (Sine, 45Hz, depth 380Hz) ──┐
                                                                       ├──> Bandpass (1650Hz, Q=8.0) ──> Gain ──> SFX Bus
  Osc2 (Sawtooth, 2240->810Hz) ────────────────────────────────────────┘
  ```
- **Envelope & Modulation**:
  - Primary oscillators: Square ($2200\text{ Hz} \to 780\text{ Hz}$) and Sawtooth ($2240\text{ Hz} \to 810\text{ Hz}$).
  - `LFO`: Extreme fast FM at $45\text{ Hz}$, depth $\pm 380\text{ Hz}$.
  - `Filter`: High-Q bandpass at $1650\text{ Hz}$, $Q = 8.0$.
  - `Gain`: Attack $0.004\text{ s}$, peak $0.32 \times \text{vol}$, release to $0.0001$ at $0.36\text{ s}$.
  - Total Duration: $0.36\text{ s}$.

---

#### 5. Stage 50: Aeternum Star-Eater Core (항성 포식자)
##### A. Satellite Orbital Shield Hum (`playOrbitalShieldHum`)
- **Gameplay Trigger**: Phase 1 planetary shield matrix active with 4 orbiting satellites (`AeternumCore.updatePhase1`, line 120).
- **Acoustic Goal**: Quad-harmonic forcefield hum pulsing at satellite orbital rate ($1.1\text{ rad/s}$).
- **Synthesis Graph**:
  ```
  Osc1 (Sine 110Hz, A2)  ──┐
  Osc2 (Sine 220Hz, A3)  ──┼──> Lowpass Filter (850Hz, Q=2.5) ──> Master Gain ──> SFX Bus
  Osc3 (Sine 330Hz, E4)  ──┤
  Osc4 (Sine 550Hz, C#5) ──┘
  ```
- **Envelope & Modulation**:
  - 4 additive harmonic sine waves tuned to the harmonic series: $110\text{ Hz}$, $220\text{ Hz}$, $330\text{ Hz}$, $550\text{ Hz}$.
  - Amplitude weighting: $1.0$, $0.6$, $0.35$, $0.20$.
  - Panning/AM tremolo oscillating at $1.1\text{ Hz}$ synchronized with satellite rotation.
  - `Gain`: Attack $0.15\text{ s}$, peak $0.28 \times \text{vol}$, release to $0.0001$ at $0.85\text{ s}$.
  - Total Duration: $0.85\text{ s}$.

##### B. Dark Matter Mega-Beam Charge & Sweeping Roar
###### 1. Charge (`playDarkMatterBeamCharge`)
- **Gameplay Trigger**: Mega-beam enters 1.6s charge phase (`AeternumCore.updatePhase2`, line 156).
- **Parameters**: Sawtooth wave exponentially rising from $65\text{ Hz}$ up to $1450\text{ Hz}$ over $1.55\text{ s}$. Filter cutoff sweeps from $200\text{ Hz}$ up to $3800\text{ Hz}$ ($Q = 5.0$). Tremolo pulse rate accelerates from $14\text{ Hz}$ to $42\text{ Hz}$. Total duration $1.55\text{ s}$.

###### 2. Sweeping Roar (`playDarkMatterBeamRoar`)
- **Gameplay Trigger**: Mega-beam fires and sweeps 60% of canvas width (`AeternumCore.updatePhase2`, line 179).
- **Parameters**: White noise through resonant bandpass sweeping $350\text{ Hz} \to 1800\text{ Hz} \to 450\text{ Hz}$ ($Q = 4.8$) combined with $55\text{ Hz}$ sawtooth sub-oscillator through lowpass at $180\text{ Hz}$ ($Q = 3.0$). Peak gain $0.42 \times \text{vol}$, duration $1.80\text{ s}$.

##### C. Enrage Siren (`playEnrageSiren`)
- **Gameplay Trigger**: Stage 50 Boss transitions to Phase 3 Enrage (`AeternumCore.checkPhaseTransitions`, line 95).
- **Parameters**: Two-tone square wave alarm: Tone A = $880\text{ Hz}$ ($0.14\text{ s}$), Tone B = $660\text{ Hz}$ ($0.14\text{ s}$), repeated 4 cycles (8 pulses total) through bandpass at $1200\text{ Hz}$ ($Q = 3.2$). Total duration $1.15\text{ s}$.

---

### 2.2 11 Stellaris-Inspired Crisis Events (Milestone 10)

| Crisis Event | Audio Method | Acoustic Character | Procedural Graph Specification |
|---|---|---|---|
| **All Crises (Warning Phase)** | `playCrisisKlaxon()` | Retro space emergency alert horn | Dual detuned saws ($370\text{ Hz}$ & $374\text{ Hz} \to 520\text{ Hz}$ & $526\text{ Hz}$) through lowpass at $1200\text{ Hz}$ ($Q=4.0$), pulsed twice over $0.95\text{ s}$. |
| **The Contingency (우발사태)** | `playDigitalGlitch()` | Rogue AI bitcrushed glitch | 8-step stepped square frequency cascade ($[1760, 440, 3520, 880, 2200, 330, 2640, 110]\text{ Hz}$ at $18\text{ ms}$/step) through highpass at $600\text{ Hz}$. Duration $0.15\text{ s}$. |
| **Hyperspace Storm (초공간 폭풍)** | `playLightningCrackle()` | Electrostatic arc snap & thunder roll | Stage 1: $0.02\text{ s}$ highpass noise snap ($4\text{ kHz}$). Stage 2: Bandpass noise ($3\text{ kHz} \to 400\text{ Hz}$) + saw sub-bass ($130 \to 30\text{ Hz}$) with $25\text{ Hz}$ spark flutter. Duration $0.45\text{ s}$. |
| **Nemesis Star-Eater (항성 포식자)** | `playDarkMatterIgnition()` | Cataclysmic cosmic implosion & blast | Stage 1: Reverse suction bandpass noise sweep ($2200 \to 100\text{ Hz}$, $0.22\text{ s}$). Stage 2: Super-detonation sine sub-bass ($42\text{ Hz}$) + resonant lowpass noise ($900 \to 25\text{ Hz}$, $Q=6.5$). Duration $1.35\text{ s}$. |

---

### 2.3 Allies Support System & Special Moves (Milestone 13)

| Unit / Move | Audio Method | Acoustic Character | Procedural Graph Specification |
|---|---|---|---|
| **Escort Wingman Drone** | `playEscortPlasmaBolt()` | High-energy plasma laser bolt | Triangle wave ($1400 \to 380\text{ Hz}$) + 2nd harmonic sine ($2800 \to 760\text{ Hz}$) through lowpass ($3200\text{ Hz}$). Duration $0.08\text{ s}$, peak gain $0.22$. |
| **Kinetic Aegis Drone** | `playShieldRepairChime()` | Uplifting celestial arpeggio chord | 4-note ascending sine arpeggio (C6 $1046.5\text{ Hz}$, E6 $1318.5\text{ Hz}$, G6 $1567.9\text{ Hz}$, C7 $2093.0\text{ Hz}$) spaced by $45\text{ ms}$, each decaying over $0.25\text{ s}$. Total $0.45\text{ s}$. |
| **Kinetic Aegis Drone** | `playPointDefensePing()` | High-speed flak ballistic deflection | Square wave ($2800 \to 2200\text{ Hz}$) + noise transient through bandpass ($2600\text{ Hz}$, $Q=9.0$). Duration $0.045\text{ s}$. |
| **Bomber Support Wing** | `playBomberEngineSweep()` | Heavy jet/rocket flyby sweep | Lowpass white noise sweeping $160 \to 620 \to 180\text{ Hz}$ ($Q=3.6$) + dual detuned triangle sub-oscillators ($75\text{ Hz}$ & $79\text{ Hz}$). Total duration $1.60\text{ s}$. |
| **Cluster Bomb Munition** | `playClusterBombThud()` | Concussive kinetic shockwave impact | Sub-bass sine ($170 \to 26\text{ Hz}$) + resonant lowpass noise ($450 \to 35\text{ Hz}$, $Q=4.2$). Duration $0.24\text{ s}$. |
| **Nova Barrage (Target Lock)** | `playNovaLockChime()` | High-tech target acquisition blips | 3 ascending square blips at $1200\text{ Hz}$, $1600\text{ Hz}$, $2400\text{ Hz}$ ($20\text{ ms}$ each). Total duration $0.09\text{ s}$. |
| **Nova Barrage (Missile Salvo)** | `playNovaMissileSwoosh()` | Rocket booster acceleration whoosh | Sweeping bandpass noise ($500 \to 2200\text{ Hz}$, $Q=4.5$) + saw rocket tone ($380 \to 780\text{ Hz}$). Total duration $0.28\text{ s}$. |
| **Chrono Freeze (Sub Drop)** | `playChronoFreezeDrop()` | Cinematic time-dilation pitch drop | Sine sub-bass sweeping $180 \to 22\text{ Hz}$ over $0.65\text{ s}$ through lowpass at $240\text{ Hz}$. Total duration $0.70\text{ s}$. |
| **Chrono Freeze (Clock Stop)** | `playClockFreezeTick()` | Mechanical time-stopping click | High-Q bandpass filtered square pulse at $3200\text{ Hz}$ ($Q=14.0$). Duration $0.025\text{ s}$. |
| **Dimensional Warp Ram** | `playWarpRamSonicBoom()` | Supersonic barrier sonic boom | Stage 1: Shear chirp ($150 \to 2400\text{ Hz}$, $0.035\text{ s}$). Stage 2: Sonic shockwave sine ($240 \to 22\text{ Hz}$) + lowpass noise ($3500 \to 45\text{ Hz}$, $Q=5.2$). Total duration $0.70\text{ s}$. |

---

## 3. Concurrency Limits, Priority Tiers & Leak Prevention

### 3.1 Bounded Voice Concurrency Architecture
Under heavy combat (e.g., 50 rounds, multiple bosses with spiral bullet hell, 16 Nova homing missiles, and 3 drones), unmanaged voice synthesis can cause audio dropouts, distortion, and high CPU usage.

1. **Expansion of `MAX_CONCURRENT_VOICES`**:
   - Currently set to 12. Recommend expanding to **16** in `SoundSynth.ts` to accommodate concurrent boss themes and drone autofire.
2. **Channel Priority Tiering**:
   - `PRIORITY_HIGH` (Special moves, boss phase transitions, mega-beam charge/roar, enrage siren, warp ram): Guaranteed playback. If `activeVoiceCount >= MAX_CONCURRENT_VOICES`, high-priority sounds will still execute.
   - `PRIORITY_NORMAL` (Player laser, drone plasma bolts, shield repair, boss attacks, crisis klaxon): Standard admission check against voice limit.
   - `PRIORITY_LOW` (Small bullet explosions, armor hit pings, spiral ring whooshes): Dropped if voice capacity exceeds 12 to preserve headroom.
3. **Debouncing & Rate Limiting**:
   - Sounds that can trigger multiple times per frame (e.g., Nova missile impacts, gray goo bullet dissolutions, spiral ring bullets) must have an internal `lastPlayTimestamp` map. If invoked within $40\text{--}80\text{ ms}$, subsequent triggers are suppressed.

### 3.2 Leak-Free Node Disconnection Lifecycle
To ensure zero net memory drift across 50 continuous rounds (satisfying Milestone 15 Playwright `< 5MB` net heap drift requirement):
- Every Web Audio node must be explicitly disconnected from the audio graph upon playback conclusion.
- Implementation pattern:
  ```typescript
  let isCleanedUp = false;
  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    this.activeVoiceCount = Math.max(0, this.activeVoiceCount - 1);
    try {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    } catch {
      // Ignored for headless / mock contexts
    }
  };

  source.onended = cleanup;
  // Safety watchdog timeout in case onended is delayed or muted context
  setTimeout(cleanup, Math.ceil((duration + 0.05) * 1000));
  ```
- For continuous / loop handles (such as `playTractorBeam`, `playDimensionalTearHum`, or `playDarkMatterBeamRoar`), an active handle object must be stored and cleanly torn down when `stop()` or `stopAll()` is invoked.

---

## 4. Proposed Code Modifications Index

| File Path | Proposed Changes |
|---|---|
| `src/types/index.ts` | Extend `AudioEventType` with all 24 new event constants for bosses, crises, allies, and special moves. |
| `src/audio/SoundSynth.ts` | Implement all 24 procedural synthesis methods with precise node graphs, ADSR envelopes, filter sweeps, debounce tracking, and dual `onended` + `setTimeout` node disconnection. |
| `src/core/boss/bosses/*.ts` | Integrate sound triggers into `CyberDreadnought.ts`, `DimensionalLeviathan.ts`, `NaniteColossus.ts`, `PsionicHarbinger.ts`, and `AeternumCore.ts`. |
| `src/core/crisis/CrisisEventManager.ts` & events | Connect `playCrisisKlaxon()`, `playDigitalGlitch()`, `playLightningCrackle()`, and `playDarkMatterIgnition()`. |
| `src/core/allies/drones/*.ts` | Connect `playEscortPlasmaBolt()`, `playShieldRepairChime()`, `playPointDefensePing()`, `playBomberEngineSweep()`, `playClusterBombThud()`. |
| `src/core/special/SpecialMovesManager.ts` | Connect `playNovaLockChime()`, `playNovaMissileSwoosh()`, `playChronoFreezeDrop()`, `playClockFreezeTick()`, `playWarpRamSonicBoom()`. |
| `tests/unit/audio_particles.test.ts` | Add comprehensive unit tests asserting voice bounds, node disconnection, and synthesis execution for all new sound methods. |

---

## 5. Verification & Test Strategy
1. **Unit Testing**: Run `npm test` to verify zero regression across existing 953 tests.
2. **Audio Synthesis Verification**: Verify each new method executes successfully with `MockAudioContext` in Vitest.
3. **Build Integrity**: Run `npm run build` to ensure clean TypeScript 5.7 strict compilation.
