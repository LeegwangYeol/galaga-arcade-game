# Galaga Arcade Web Game — Claude Collaboration Guide

> **Project Mission**: Expand the completed 1981 Galaga arcade web game into the **Ultimate Arcade Edition**: 50-round non-linear scaling, 5 epic multi-phase Boss Fights, 11 Stellaris-inspired Endgame Crisis Events, an Allies Support System, rich Power-Up Items, game-changing Special Moves (필살기), and a 50+ subagent swarm driving development, memory profiling, and automated verification within 4 hours.

---

## 📌 Claude Collaboration & Approval Protocol
- **AI Collaborator**: Claude
- **Human Channel / User**: @lolollol2379 (https://www.youtube.com/@lolollol2379, Channel ID: `UC1no5Q01M2LmT-QLgLlUN0Q`)
- **Status**: 🛡️ **PHASE 7 (M36–M40) ADVERSARIAL QA & AUTONOMOUS REMEDIATION DRAFTED — AWAITING EXPLICIT USER APPROVAL ("승인")**
  - **Scope**: Rigorous Adversarial QA, Extreme Automated Bots (Off-screen boundary escapes, infinite revive attempts, touch + keyboard spam, memory leak & detached DOM profiling), Autonomous Swarm Remediation, 2,244 Unit Test Regression Defense, Bundle Size Budget <= 307.2 KB, 30+ Subagent Swarm.
  - **Baseline Preservation**: 2,244/2,244 tests passing 100%, 60 FPS zero-GC memory invariants strictly preserved, bundle size 221.86 kB (budget <= 307.2 kB).
- **Trigger Keyword**: When user enters **`내용확인`**, the team reviews context and proceeds with implementation.


---

## 🎮 Architecture & Current Baseline (M1–M8 Certified)
- **Zero-External-Asset Principle**: 100% pure Canvas pixel matrices & Web Audio API procedural sound synthesis (no external PNG/MP3/WAV dependencies).
- **Engine**: Fixed 60Hz loop, zero-allocation `ObjectPool`, Canvas letterboxing, cross-platform touch & keyboard.
- **Baseline Test Suite**: 753 passing Vitest tests & Playwright cross-browser tests.
- **Repositories**: Synced with GitHub `https://github.com/LeegwangYeol/galaga-arcade-game` and mirrored at `~/teamwork_projects/galaga_game`.

---

## 🚀 Ultimate Expansion Scope & Feature Specifications

### 1. R1. 50-Round Progressive Scaling & Epic Boss Encounters
- **Non-Linear Round Scaling Curve (Stages 1–50)**:
  - Enemy Max HP scaling:
    - Stages 1–10: Classic 1-hit (Zako/Goei), 2-hit (Boss Galaga).
    - Stages 11–25: Elite tier (+1 HP, flashing armor palettes, evasive diving paths).
    - Stages 26–50: Dreadnought tier (+2 HP, kinetic shields, predictive firing).
  - Diving Speed & Fire Rate: Multiplier smooth curve up to 2.0x baseline.
  - Challenging Stages (Bonus Rounds): Stages 3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47.
- **5 Diverse Multi-Phase Boss Encounters**:
  1. **Stage 10: Cyber Dreadnought (사이버 전함)**
     - *Phase 1*: Dual twin-laser turrets and escort drones.
     - *Phase 2*: Core exposed, emits rotating spiral bullet rings.
  2. **Stage 20: Dimensional Leviathan (차원수 레비아탄)**
     - *Phase 1*: Phase-shifts (temporary invulnerability) and opens gravitational dimensional tears.
     - *Phase 2*: Pulsing radial shockwaves and black-hole suction vortex pulling player ship.
  3. **Stage 30: Nanite Swarm Colossus (나노머신 거신)**
     - *Phase 1*: Massive pixel cluster that splits into 4 mini-constructs when damaged.
     - *Phase 2*: Reassembles with nanite gray goo clouds dissolving player bullets.
  4. **Stage 40: Psionic Shroud Harbinger (장막의 사자)**
     - *Phase 1*: Generates 2 illusory phantom clones that mimic dive-bombs (only true core takes damage).
     - *Phase 2*: Telekinetic stun pulses disrupting player horizontal thrusters.
  5. **Stage 50: Aeternum Star-Eater Core (항성 포식자 - 파이널 레이드)**
     - *Phase 1*: Planetary shield matrix powered by 4 orbital satellite generators.
     - *Phase 2*: Dark matter beam sweep spanning 60% of the canvas width.
     - *Phase 3 (Enrage)*: Overdrive bullet hell barrage and desperate swarm ramming.

---

### 2. R2. 11 Stellaris-Inspired Crisis Events (Post-Round 10)
Extensible Factory Pattern (`CrisisEventFactory` & `CrisisEventManager`) dynamically triggering cosmic disasters:

1. **The Contingency (우발사태 — Ghost Signal)**: Rogue AI pulse; enemy bullets gain predictive trajectory calculation; player firing intermittently glitches.
2. **The Unbidden (이차원 침략자 — Dimensional Tear)**: Canvas background rift shader; gravitational distortion curving player projectile paths.
3. **The Prethoryn Scourge (생물군집 — Infestation Swarm)**: Organic chitin shields; defeated enemies burst into rapid micro-parasite spores.
4. **Shield Overload (에너지 과부하 — Energy Matrix Overdrive)**: All enemies deploy hexagonal kinetic barriers absorbing 2 initial hits.
5. **Physics Inversion (물리법칙 왜곡 — Singularity Shift)**: Inverts starfield velocity; modifies enemy dive trajectory gravity.
6. **Hyperspace Storm (초공간 폭풍 — Hyperlane Tempest)**: Cosmic lightning bolts arc across lanes, temporarily restricting evasion zones.
7. **Nanite Cloud / Gray Tempest (나노머신 폭풍 — Gray Goo Disruption)**: Micro-nanite swarms reduce visibility and dissolve stray projectiles into shrapnel.
8. **Psionic Resonance / Shroud Breach (장막 침식 — Shroud Incursion)**: Hallucinatory phantom enemies spawn in formation alongside real ones.
9. **Devouring Swarm Frenzy (군체 광란 — Hive Fleet Blitz)**: Enemies break formation immediately into continuous, high-speed coordinated dive-bomb runs.
10. **Nemesis Star-Eater Ignition (항성 포식자 점화 — Dark Matter Ignition)**: Ambient canvas dims to deep violet; boss ships charge screen-wide energy beams.
11. **Time Dilation Field (시간 지연장 — Chrono Anomaly)**: Fluctuating bullet time alternating between hyper-speed rushes and bullet-time slow-motion.

---

### 3. R3. Allies Support System, Power-Up Items & Special Moves (필살기)

#### A. Allies Support System (아군 편대 지원)
Players can summon or unlock tactical AI wingmen:
- **Escort Wingman (호위 드론)**: Orbits player fighter at fixed radius, autofires forward plasma bolts.
- **Kinetic Aegis Drone (쉴드 수복기)**: Emits periodic repair pulse regenerating player barrier points.
- **Bomber Support Wing (폭격 지원기)**: Sweeps across the top of the screen during critical swarms, carpet-bombing enemy formations.

#### B. Power-Up Items (Dropped by Diving/Boss Enemies)
- **Rapid Overclock**: Doubles fire rate and increases max simultaneous on-screen missiles to 4.
- **Kinetic Deflector (Shield)**: Luminous cyan energy bubble absorbing 1 fatal collision or bullet.
- **Spread / Multi-Blaster**: 3-way spread-shot laser clearing wide angles.
- **Engine Booster (Hyper Drive)**: Increases ship lateral velocity and evasive agility.
- **Dual Fighter Docking**: Classic Galaga rescue mechanic fully integrated with power-up modifiers!

#### C. Special Moves System (고유 필살기)
Gauge accumulates through enemy destruction and energy spark collection (Key: `X` / Touch Button / Double Tap):
1. **Nova Barrage (초신성 일제사격)**: Full-screen homing laser salvo destroying all normal enemy ships and dealing massive burst damage to bosses.
2. **Chrono Freeze (시공간 동결)**: Absolute 3-second time freeze for all enemy movement and projectiles, allowing free player targeting.
3. **Dimensional Warp Ram (차원 도약 돌파)**: Hyper-speed invulnerable charge clearing the flight lane and ramming through enemy formations.

---

### 4. R4. Rigorous Testing, Memory Leak Profiling & 4-Hour Delivery
- **Automated 50-Round E2E Simulation Bot**:
  - Headless Playwright bot running accelerated simulation through all 50 stages.
  - Periodic heap snapshots tracking detached DOM nodes, unreleased audio nodes, and un-recycled `ObjectPool` entities.
  - Zero-leak guarantee: `< 5MB` net heap drift across 50 simulated rounds; 0 runtime uncaught exceptions.
- **Cheat / QA Controller**:
  - `window.__GALAGA_CHEAT__` with `skipToStage(n)`, `triggerCrisis(id)`, `spawnBoss(id)`, `triggerSpecialMove(id)`, `setInvincible(bool)`.
- **Unit & Integration Test Coverage**:
  - Boss state machine & phase transition tests.
  - 11 Crisis event lifecycle & teardown tests.
  - Allies formation & special move cooldown invariant tests.
  - PowerUp pool capacity invariant fix (clamping to max capacity).

---

## 👥 50+ Subagent Swarm Execution Architecture

To deliver this massive scope autonomously and rigorously within 4 hours, the team will be structured into 50+ specialized subagents managed by `teamwork_preview_orchestrator`:

```
┌─────────────────────────────────────────────────────────────┐
│                    Sentinel Liaison                         │
└──────────────────────────────┬──────────────────────────────┘
                               │
               teamwork_preview_orchestrator
                               │
 ┌─────────────────────────────┼─────────────────────────────┐
 │ (1) Survey & Spec Swarm     │ (2) Core Systems Swarm      │ (3) Boss & Combat Swarm
 │   - survey_explorer_1..3    │   - m9_scaling_worker       │   - boss_architect_1..3
 │   - survey_spec_miner_1..3  │   - m10_crisis_worker_1..2  │   - boss_ai_engineers_1..4
 │                             │   - m11_powerup_worker      │   - boss_phase_reviewers_1..4
 ├─────────────────────────────┼─────────────────────────────┼─────────────────────────────┐
 │ (4) Allies & Specials Swarm │ (5) Audio & VFX Swarm       │ (6) Adversarial Red Team    │
 │   - allies_drone_dev_1..3   │   - sfx_procedural_synth    │   - challenger_bots_1..8    │
 │   - special_move_dev_1..3   │   - pixel_art_generators    │   - memory_profiler_bots_1..4│
 │   - combat_balance_dev_1..3 │   - hud_warning_dev_1..2    │   - victory_auditors_1..4   │
 └─────────────────────────────┴─────────────────────────────┴─────────────────────────────┘
 Total swarm capacity: 50+ specialized subagent roles
```

---

## 🛠️ Proposed Milestone Roadmap

| Milestone | Key Objective | Core Deliverables |
|---|---|---|
| **M9** | 50-Round Scaling Engine | Progressive curve generator, dynamic badge rendering (1–50), difficulty tier configs (COMPLETED) |
| **M10** | 11 Stellaris Crisis Events | `CrisisEventManager`, `CrisisEventFactory`, 11 concrete crisis handlers, HUD alert (COMPLETED) |
| **M11** | Power-Ups & Pool Fix | Fix pool capacity invariants, `PowerUpManager`, drop tables, shield & weapon modifiers (COMPLETED) |
| **M12** | 5 Epic Boss Encounters | Boss base class, 5 multi-phase bosses (Stages 10, 20, 30, 40, 50), bullet ring patterns (COMPLETED) |
| **M13** | Allies & Special Moves | Wingman drone AI, Shield drone, 3 Special Moves (Nova Barrage, Chrono Freeze, Warp Ram) (COMPLETED — 953 tests passing) |
| **M14** | Procedural Audio & VFX | Web Audio SFX for bosses/crises/specials, pixel art sprites, screen flash & shader effects (COMPLETED — 1,035 tests passing) |
| **M15** | 50-Round Memory Bot & QA | `__GALAGA_CHEAT__`, Playwright automated 50-round E2E simulation, heap profiling (COMPLETED — 1,087 tests passing) |
| **M16** | Swarm Adversarial Hardening & Audit | 50+ subagent verification, full test suite pass, zero-leak certification, Victory Audit (COMPLETED — 1,110/1,110 tests passing, CLEAN audit) |

---

## 📢 Milestone 15 Completion Status for Claude & User

- **Deterministic QA Controller (`window.__GALAGA_CHEAT__`)**: `GalagaCheatController.ts` fully implemented and cleanly mounted to `window.__GALAGA_CHEAT__` (browser) and `(globalThis).__GALAGA_CHEAT__` (Node) with 10 API methods (`skipToStage`, `triggerCrisis`, `spawnBoss`, `triggerSpecialMove`, `setInvincible`, `unlockDrone`, `fillEnergy`, `killAllEnemies`, `setScore`, `addLives`) and `getGameState()` snapshot. Includes robust case-insensitive alias dictionary mapping across all 11 crises, 5 bosses, 3 specials, and 3 drones.
- **Stage Teardown Invariant & Pool Hygiene**: Complete pool recycling added to `AlliesManager.onStageClear()` (`bombPool`, `explosionPool`) and `SpecialMovesManager.onStageClear()` (`missilePool`, `sparkPool`). `FormationManager.ts` incorporates `enemyPool: ObjectPool<Enemy>` (initial 48, max 64) eliminating 2,000 allocations across 50 rounds. All 8 object pools maintain `getActiveCount() === 0` at stage boundaries.
- **Player Invulnerability God Mode**: `Player.isInvincibleCheat` flag added, decoupling invincibility from respawn 10Hz blinking, providing steady sprite rendering and total hazard immunity.
- **Empirical Memory Stability Benchmark**: 100 continuous simulated rounds (2 full 50-round passes under maximum weapon spam) demonstrated **< 2.5 MB net heap growth** (well below the 5.0 MB limit) with zero un-recycled leases and zero pool auto-expansion (`autoExpand: false`).
- **Adversarial Fuzzing**: 100 consecutive rapid skips across random valid/invalid stages, mid Aeternum Mega-Beam firing, active Stellaris crisis events, player destruction, and GAME_OVER recovery verified with 0 crashes, 0 NaNs, and 100% clean recovery.
- **Verification Cohort**: Reviewer 1 (`APPROVE`), Reviewer 2 (`APPROVE`), Challenger 1 (`APPROVE`), Challenger 2 (`APPROVE`), Forensic Auditor (`CLEAN`).
- **Test Suite**: **62/62 test files passed**, **1,087/1,087 tests passed (100%)**, **95/95 Playwright cross-browser tests passed**, clean Vite production build in ~1s.
- **Next Phase — Milestone 16**: Swarm Adversarial Hardening (50+ subagent verification across all subsystems), Zero-Leak Certification, and Final Victory Audit.

---

## 🏆 Final Victory & Milestone 16 Completion Status for Claude & User

- **Milestone 16 Execution & Remediation**:
  - **Iteration 1**: Dispatched 3 Explorers, 1 Worker, and 5 Verification Agents. Reviewer 1 identified a kinematic conflict in `Player.clampPosition()` (`src/entities/Player.ts`) where `this.y = Player.BASELINE_Y` (250) ran unconditionally every tick, cancelling Warp Ram upward ascent ($v_y = -800\text{ px/s}$). Iteration 1 failed the gate per strict zero-defect policy.
  - **Iteration 2 Remediation**:
    - Dispatched 3 Remediation Explorers. Discovered Y-clamping root cause and secondary multi-hit hazard in `SpecialMovesManager.ts:470–501` dealing 240–720 damage to bosses instead of 120. Formulated `M16_REMEDIATION_SYNTHESIS.md`.
    - Dispatched `m16_rem_worker`: Implemented conditional Y-clamping (`if (!isWarpRam) this.y = BASELINE_Y;`), passed `game: this` to Player constructor, added `warpRamHitTargetIds = new Set<any>()` hit-debouncing to guarantee exact 120 damage, and unmasked `tests/unit/adversarial_m16_combinatorial_saturation.test.ts` (verifying ascent to $y \le -30$, wrap to 250 with invulnerability, and exact 120 damage).
    - Dispatched 5 Verification Agents: Reviewer 1 (`APPROVE`), Reviewer 2 (`APPROVE`), Challenger 1 (`APPROVE`), Challenger 2 (`APPROVE`), Forensic Auditor (`CLEAN`).
- **Comprehensive Quality & Integrity Verification**:
  - **Unit & Integration Suite**: **67/67 test files passed**, **1,110/1,110 tests passed (100%)**, 0 skipped, duration ~3.96s.
  - **Cross-Browser Playwright E2E**: **95/95 passed (100%)** across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari (44.7s).
  - **Zero-GC & Heap Stability Invariant**: 2,000 continuous combat simulation ticks under maximum hazard saturation yielded **0.617 MB net heap drift** (well under the 5.0 MB ceiling).
  - **Object Pool Hygiene**: 7 of 8 object pools (`particlePool`, `powerUpPool`, `bombPool`, `explosionPool`, `missilePool`, `sparkPool`, `enemyPool`) enforce `autoExpand: false` with static preallocation; `bulletPool` enforces bounded dynamic expansion (`autoExpand: true`) strictly capped at `maxSize: 256` to balance early-round low-footprint tests with late-round bullet hell density. All pools return to `getActiveCount() === 0` at stage boundaries.
  - **Zero External Assets (100% Procedural Autonomy)**: Verified 0 `.png`, `.jpg`, `.mp3`, `.wav`, or `.svg` files in the repository. 100% Canvas 2D bit-matrices and Web Audio API synthesis.
  - **Production Build Quality**: `npm run build` (`tsc --noEmit && vite build`) passes in ~330ms with 0 errors/warnings. Vercel deployment compliance verified.
  - **Dual Workspace Mirroring**: `/Users/user/teamwork_projects/galaga_game` and `/Users/user/src/galog` 100% synchronized and identical.
  - **Official Signed Attestation**: Signed by Forensic Auditor at `VICTORY_AUDIT_ATTESTATION.md` in both workspaces.

**Final Result**: All 16 Milestones (M1–M16) are **100% COMPLETE, VERIFIED, AND CERTIFIED CLEAN**.

---

## ⚡ Phase 3: Post-Launch Expansion — Glitch Gimmicks, Dynamic Difficulty Adjustment (DDA) & New Items

### 1. Executive Summary & Objectives
This post-launch update elevates the Galaga engine with:
1. **Dynamic Difficulty Adjustment (DDA)**: Real-time telemetry monitoring player proficiency (accuracy, damage frequency, wave clear velocity, life preservation) that adapts enemy aggression, bullet barrage density, and boss vitality without perceptible latency.
2. **'Glitch' Concept Gimmick Events & Anomalous Mechanics**: Intentional retro-cyberpunk malfunction aesthetics (scanline tears, chromatic aberration, raster shifts, mosaic distortion) coupled with rule-breaking enemy maneuvers (quantum teleportation, kinetic inversion, mirage phantom cloning).
3. **5+ Creative Power-Up & Utility Items**: Chrono Field, Kinetic Reflection Shield, Singularity EMP Collector, Quantum Phase Drive, and Antimatter Plasma Blaster.
4. **40+ Subagent Swarm Execution**: Dedicated explorers, implementers, reviewers, adversarial challengers, memory profilers, and forensic auditors.
5. **Zero-Defect & Zero-Leak Standards**: Seamless compatibility with existing 50-round scaling and 5 boss systems, 0 uncaught exceptions, and < 5.0 MB net heap drift.

---

### 2. Detailed Technical Architecture & Requirements

#### A. R1: Dynamic Difficulty Adjustment (DDA) System
- **Module**: `src/systems/DynamicDifficultyManager.ts`
- **Real-Time Telemetry Metrics**:
  - `accuracy`: $\frac{\text{hits}}{\max(1, \text{shotsFired})}$ evaluated across a rolling 30-second window.
  - `damageFrequency`: Hits sustained per unit time; tracking elapsed seconds since last player life lost or shield consumed.
  - `clearSpeedRatio`: $\frac{T_{\text{expected}}}{T_{\text{actual}}}$ comparing actual stage duration against baseline benchmark.
  - `scoreVelocity`: Score gained per second.
  - `livesRemaining`: Current player lives vs baseline.
- **Skill Index ($\sigma \in [0.0, 1.0]$)**:
  $$\sigma = 0.35 \times \text{accuracy} + 0.25 \times \text{survivalFactor} + 0.25 \times \text{clearSpeedRatio} + 0.15 \times \text{scoreVelocityNormalized}$$
- **Dynamic Tuning Actuators**:
  - `diveSpeedMultiplier`: Scaled smoothly between $0.85\times$ (struggling) and $1.35\times$ (expert).
  - `bulletDensityMultiplier`: Fire rate and max simultaneous enemy bullets scaled between $0.80\times$ and $1.40\times$.
  - `bossHealthMultiplier`: Boss max HP dynamic modifier scaled between $0.90\times$ and $1.25\times$.
  - `powerUpDropRate`: Dynamic pity mechanism increasing drop rates when player is at 1 life or taking frequent damage.
- **Contract & Pool Hygiene**: Zero GC allocations per frame. Telemetry updates via pre-allocated sliding circular buffers or decaying exponential averages.

#### B. R2: 'Glitch' Concept Gimmick Events & Anomalous Patterns
- **Module**: `src/core/glitch/GlitchEventManager.ts`, `src/renderer/GlitchRenderer.ts`, and integration with `CrisisEventManager.ts`.
- **Procedural Canvas 2D Visual Effects (0 external images)**:
  1. **Raster Scanline Tear**: Horizontal slice displacements across randomized vertical bands ($y \in [y_1, y_2]$, offset $\Delta x \in [-15, +15]$ px).
  2. **Chromatic Channel Aberration**: Red/Cyan channel separation during explosive events or boss glitch phases.
  3. **Texture Matrix Noise & Inversion**: Procedural bit-matrix bitwise XOR corruption for glitching enemy sprites.
  4. **HUD Glitch / Static Flickering**: Stage titles and score counters intermittently display hexadecimal garbage text before snapping back.
- **Anomalous Gameplay & Kinematic Gimmicks**:
  1. **Quantum Teleportation (양자 도약)**: Glitch enemies de-materialize into pixel static and instantly re-appear at unpredictable lateral coordinates along their dive curve.
  2. **Kinetic Law Inversion (물리법칙 역전)**: Enemies abruptly reverse gravitational pull or accelerate sideways perpendicular to standard flight paths.
  3. **Mirage Phantom Duplication (신기루 분신)**: Defeated glitch enemies split into decoy holograms that distract player fire for 2 seconds.
  4. **Corrupted Dive Vector**: Unpredictable non-Bézier spline jerks testing high-skill player reflexes.
- **Glitch Triggering**:
  - Random glitch event occurrence post-stage 15, or dedicated "Glitch Sector" anomaly rounds (e.g. Stage 13, 26, 38).
  - Cheats integration: `window.__GALAGA_CHEAT__.triggerGlitch(type)` for deterministic QA.

#### C. R3: 5+ New Power-Up & Utility Items
- **Module**: `src/core/powerups/` (extended types and pool configurations)
- **Item Roster**:
  1. **Chrono Field (시간 감속장 - Item ID: `chrono_field`)**:
     - Deploys a pulsing circular chronofield around player ship ($R = 120\text{ px}$).
     - Slows enemy projectiles and enemy dive velocities entering the field by 60% for 6 seconds.
  2. **Kinetic Reflection Shield (유도탄 반사 쉴드 - Item ID: `reflection_shield`)**:
     - Spherical hexagonal energy shield absorbing incoming enemy bullets and converting them into high-speed homing counter-projectiles targeted at the firing enemy.
  3. **Singularity EMP Collector (적 탄막 흡수기 - Item ID: `emp_collector`)**:
     - Activates a gravitational collector vortex for 5 seconds; any enemy projectile within 90px is drawn inward, disintegrated, and converts each bullet to +50 score and 5% special move energy.
  4. **Quantum Phase Drive (양자 위상 추진기 - Item ID: `phase_drive`)**:
     - Equips player ship with instantaneous short-range warp evasion (triggered via double-tap movement or dedicated Shift key), granting 0.4s intangibility through bullet waves.
  5. **Antimatter Plasma Blaster (반물질 플라즈마포 - Item ID: `antimatter_plasma`)**:
     - Replaces standard dual blasters with an intense piercing continuous plasma lance for 7 seconds, slicing vertically through multiple enemy ranks and shields.
- **Safety & Invariants**:
  - Pre-allocated in `powerUpPool` (capacity strictly preserved without unbounded allocation).
  - Clean lifecycle teardown on stage boundary and player death.

---

### 3. Proposed Milestone Roadmap (M17 – M21)

| Milestone | Title | Objectives & Deliverables |
|---|---|---|
| **M17** | **Dynamic Difficulty Adjustment (DDA) Engine** | Implement `DynamicDifficultyManager.ts`, telemetry collection (accuracy, damage frequency, clear times), scaling curves, integration with `DifficultyCalculator` & Boss HP, unit tests. |
| **M18** | **Glitch Visual & Kinematic Event System** | Implement procedural Canvas 2D raster glitch effects, anomalous enemy AI (teleportation, kinetic law inversion, mirage clones), glitch audio buzz/chirp procedural synthesis, and stage triggers. |
| **M19** | **5+ Creative Power-Up & Utility Items** | Implement Chrono Field, Reflection Shield, EMP Collector, Phase Drive, and Antimatter Plasma Blaster with strictly bounded pool leases and sprite matrix definitions. |
| **M20** | **QA Cheat Expansion & Automated E2E Bot** | Extend `window.__GALAGA_CHEAT__` (`setDDAProficiency`, `triggerGlitch`, `spawnNewPowerUp`), write headless Playwright E2E simulation testing all new mechanics across 50 rounds without crashes. |
| **M21** | **40+ Subagent Swarm Hardening & Victory Audit** | Adversarial verification across 40+ subagent swarm, zero-leak memory profiling (< 5.0 MB drift), regression verification across all 1,110 existing tests + new tests, and Victory Audit. |

---

### 4. 40+ Subagent Swarm Deployment Structure

```
┌─────────────────────────────────────────────────────────────┐
│                      Sentinel Liaison                       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                 teamwork_preview_orchestrator
                               │
 ┌─────────────────────────────┼─────────────────────────────┐
 │ (1) Survey & Design Swarm   │ (2) DDA & Math Swarm        │ (3) Glitch Engine Swarm
 │   - survey_explorer_1..3    │   - dda_architect_1..2      │   - glitch_vfx_worker_1..2
 │   - survey_spec_miner_1..3  │   - dda_worker              │   - glitch_ai_worker_1..2
 │                             │   - dda_reviewers_1..2      │   - glitch_reviewers_1..2
 │                             │   - dda_challengers_1..2    │   - glitch_challengers_1..2
 ├─────────────────────────────┼─────────────────────────────┼─────────────────────────────┐
 │ (4) New Items & Pools Swarm │ (5) E2E QA & Simulation     │ (6) Red Team & Auditors     │
 │   - item_worker_1..2        │   - cheat_controller_worker │   - adversarial_challengers │
 │   - item_reviewers_1..2     │   - playwright_e2e_worker   │   - memory_profiler_bots    │
 │   - item_challengers_1..2   │   - cross_browser_verifiers │   - independent_auditors    │
 └─────────────────────────────┴─────────────────────────────┴─────────────────────────────┘
 Total swarm capacity: 40+ specialized subagent roles
```

---

### 5. Claude / User Approval Checkpoint
Per **RULE[user_global]**, implementation will not commence until explicit approval is granted.
Claude and User: Please review the above architecture and specifications.
Reply with **`진행해`** / **`proceed`** / **`승인`** or provide feedback in `COLLABORATION.md` to trigger the implementation swarm.

---

### 6. Milestone M18: 'Glitch' Concept Gimmick Events & Anomalous Enemy Behaviors — IMPLEMENTATION REPORT

**Status: COMPLETED & VERIFIED (100% Passing)**

#### 1. Core Architecture & Zero-GC Canvas 2D Deliverables
- **`src/core/glitch/types.ts`**: Complete type contracts for `GlitchEventType`, `GlitchState`, `TearBand`, `GlitchRenderConfig`, `GlitchTelemetry`, `IGlitchEvent`.
- **`src/renderer/GlitchRenderer.ts`**: High-performance Canvas 2D raster effects bypassing `getImageData` to eliminate GC spikes:
  - 5 pre-allocated scratch offscreen canvases (`primaryBackbuffer`, `scratchChannelR`, `scratchChannelC`, `scratchStripCanvas`, `scratchSpriteCanvas`) with Vitest mock fallback.
  - Scanline tear displacements with horizontal shear and CRT wrapping.
  - Chromatic aberration via channel separation and additive recombination (`lighter`).
  - XOR corrupted sprite rendering via `'xor'` composite punch.
  - HUD hex scrambling via static stack-allocated character replacement without string allocations.
  - Guaranteed `ctx.save()`/`ctx.restore()` stack balance.
- **`src/core/glitch/PhantomClone.ts`**: Decoy clone entity from dedicated pool `ObjectPool<PhantomClone>` (initial 8, max 8, `autoExpand: false`).
  - Deals 0 collision damage, awards 0 score, absorbs player bullets with spark feedback, auto-expires after 2.0s, and renders with pulsing holographic transparency.
  - Strictly isolated from `FormationManager.getLivingCount()`, never interfering with stage progression or wave clears.
- **`src/core/glitch/GlitchEventManager.ts`**: Full lifecycle state machine (`IDLE` -> `WARNING` -> `ACTIVE` -> `COOLDOWN`).
  - Scheduled Glitch Sector rounds on Stages 13, 26, 38.
  - Post-stage 15 random anomalies (35% roll, 2-stage cooldown).
  - Absolute immunity enforcement for Challenging stages (`isChallengingStage`) and Epic Bosses (`stage % 10 === 0`).
- **`src/entities/Enemy.ts` & `src/systems/FormationManager.ts`**:
  - Additive lateral displacement layer (`glitchOffsetX/Y`) preserving underlying dive splines.
  - Quantum teleportation leaps along trajectory curves with dematerialization flicker.
  - Kinetic law inversion (anti-gravity upward climb and orthogonal normal acceleration).
  - Mirage phantom cloning upon enemy destruction.
- **`src/audio/SoundSynth.ts`**: Pure Web Audio API procedural synthesis:
  - `playGlitchBuzz()`: 60Hz/120Hz detuned mains hum with rapid tremolo.
  - `playGlitchFrequencyChirp()`: High-speed frequency hopping arpeggio (`[2400, 350, 4200, 800, 1600] Hz`).
  - `playDataStreamNoise()`: White noise burst + 1200Hz/2200Hz FSK tone pulses with leak-free node cleanup (`registerNodeCleanup`).
- **`src/core/qa/GalagaCheatController.ts` & `src/types/index.ts`**:
  - Deterministic testing controls: `triggerGlitch(type?)`, `clearGlitch()`, case-insensitive alias dictionary (`'teleport'`, `'kinetic'`, `'mirage'`, `'vector'`, `'raster'`, `'sector'`), and `getGameState().glitch` telemetry.
- **`src/core/Game.ts`**: Coordinated update, render, collision resolution, and stage clear hooks.

#### 2. Verification & Regression Safety
- **Tests**: `tests/unit/glitch.test.ts` (26 unit tests covering rendering, pool invariants, state machine, kinematics, sound synthesis, and cheat controller).
- **Full Suite**: 72 test suites, **1,214 / 1,214 passing tests (100%)**.
- **Production Build**: `tsc --noEmit && vite build` built cleanly in 364ms.
- **Mirroring**: 100% mirrored and verified across both `/Users/user/teamwork_projects/galaga_game` and `/Users/user/src/galog/`.

---

### 7. Milestone M20: QA Cheat Controller Extension & Automated Playwright E2E 50-Round Simulation — IMPLEMENTATION REPORT

**Status: COMPLETED & VERIFIED (100% Passing)**

#### 1. Core Architecture & Refinements Deliverables
- **`src/core/qa/GalagaCheatController.ts`**:
  - `skipToStage(stage: number)`:
    - Teardown: `if (this.game.glitchEventManager) this.game.glitchEventManager.clearGlitch();` ensures zero lingering glitch state or active phantoms when skipping.
    - Startup: `if (this.game.glitchEventManager) this.game.glitchEventManager.evaluateStageTrigger(stage);` ensures Glitch Sectors at Stages 13, 26, 38 activate deterministically on stage skip.
  - `normalizePowerUpType`: added `'antimatter'` alias mapping to `PowerUpType.ANTIMATTER_PLASMA`.
  - `getGameState()`: integrated `powerups` object exposing `{ activeBuffs: this.game.powerUpManager.getActiveBuffs(), activeItemCount: this.game.powerUpManager.getActiveCount() }`.
- **`src/core/glitch/GlitchEventManager.ts`**:
  - `clearGlitch()`:
    - Clear phantom clones: `this.game?.formationManager?.phantomPool?.clear();`.
    - Reset diving enemies' glitch state: iterates active enemies and resets `isGlitched = false`, `glitchOffsetX = 0`, `glitchOffsetY = 0`, `glitchDisplacementX = 0`, `glitchDisplacementY = 0`, `glitchKinematicVx = 0`, `glitchKinematicVy = 0`.
- **`src/types/index.ts`**:
  - Aligned return signatures in `IGalagaCheatController`:
    - `skipToStage(stage: number): boolean;`
    - `triggerCrisis(crisisId?: string): boolean;`
    - `spawnBoss(bossType?: string | number): boolean;`
    - `triggerSpecialMove(specialId?: string): boolean;`
    - `unlockDrone(droneType: string): boolean;`
    - `killAllEnemies(): number;`
    - `addLives(count: number): number;`
    - `setDDAProficiency(proficiency: number | null): boolean;`
    - `triggerGlitch(type?: string): boolean;`
    - `spawnPowerUp(powerUpType: string, x?: number, y?: number): boolean;`
    - `applyPowerUp(powerUpType: string): boolean;`
    - Added `powerups?: { activeBuffs: any; activeItemCount: number }` to `getGameState()` return type.
    - Added diagnostic getters `getActiveBoss?()`, `getActiveCrisis?()`, `getGame?()`.

#### 2. Comprehensive Playwright E2E Suite (`tests/e2e/post_launch_glitch_items_50round.spec.ts`)
- **TC1 (DDA Dynamic Tuning Verification)**: Verified exact mathematical tuning for $\sigma = 0.10$ ($0.90\times$ dive speed, $0.86\times$ bullet density, $0.92\times$ boss HP) and $\sigma = 0.95$ ($1.325\times$ dive speed, $1.37\times$ bullet density, $1.225\times$ boss HP), monotonic scaling, and neutral reset.
- **TC2 (Glitch Events & Sectors Lifecycle)**: Verified all 5 glitch types (`teleport`, `kinetic`, `mirage`, `vector`, `raster`), phantom decoy damage absorption (0 points, 0 damage, excluded from formation living enemies), clean recovery with `clearGlitch()`, and automatic Glitch Sector trigger on Stages 13, 26, 38.
- **TC3 (M19 5 New Power-Up Items In-Game Verification)**: Verified live in-game combat mechanics for `chrono_field` (60% bullet velocity slowdown), `reflection_shield` (lethal impact absorption and counter-missile firing without player death), `emp_collector` (bullet absorption within 90px, +50 score, +5% special energy), `phase_drive` (+40px lateral warp and 0.4s invulnerability), and `antimatter_plasma` (continuous vertical piercing beam damaging multi-rank minions simultaneously).
- **TC4 (Epic Boss & Crisis Stress Integration)**: Verified simultaneous execution of Bosses 10, 20, 30, 40, 50, Stellaris crises, glitch events, and new power-ups with zero NaN coordinates and zero errors.
- **TC5 (50-Round Continuous Traversal & Heap Stability Profiling)**: Simulated continuous traversal through Stages 1..50 with live frame rendering. In Chromium, attached CDP session (`HeapProfiler.collectGarbage` + `Performance.getMetrics` -> `JSHeapUsedSize`) demonstrating **0.000 MB net heap drift** (well below the 5.0 MB ceiling). Verified active 60 FPS canvas rendering after 50 rounds and zero console/page errors.

#### 3. Verification Summary
- **Unit & Integration Suite**: **77/77 test files passed (100%)**, **1,303/1,303 tests passed (100%)**.
- **Playwright M20 E2E Suite**: **25/25 tests passed (100%)** across all 5 browser configurations (`chromium`, `firefox`, `webkit`, `Mobile Chrome`, `Mobile Safari`).
- **Full Playwright Suite**: **120/120 tests passed (100%)** across all 5 browser configurations.
- **Production Build**: `npm run build` (`tsc --noEmit && vite build`) passes cleanly in ~340ms with 0 errors and 0 warnings.
- **Dual Workspace Synchronization**: 100% bitwise parity verified between `/Users/user/teamwork_projects/galaga_game` and `/Users/user/src/galog/` (0 diffs).

---

## 🏆 Final Phase 3 Victory & Milestone M21 Swarm Hardening Completion Status for Claude & User

**Status: 🏆 100% COMPLETE & CERTIFIED CLEAN — ALL 21 MILESTONES (M1–M21) DELIVERED & VERIFIED**

#### 1. Comprehensive Phase 3 Delivery Summary
- **Milestone M17 (Dynamic Difficulty Adjustment - DDA Engine)**:
  - Real-time player proficiency tracking with 30-bucket TypedArray circular buffer (`Float64Array`).
  - 4 dynamic tuning actuators: dive speed ($0.90\times \sim 1.35\times$), bullet density ($0.85\times \sim 1.40\times$), attack aggression ($0.80\times \sim 1.30\times$), and boss HP ($0.90\times \sim 1.25\times$).
  - Clamped bounded multiplier dynamics with instant neutral reset and debug telemetry integration.
- **Milestone M18 (Glitch Visual & Kinematic Event System)**:
  - Glitch Sectors at Stages 13, 26, 38 with random post-stage-15 anomalies (35% probability, 2-stage cooldown).
  - 5 procedural Canvas 2D raster shaders without `getImageData` GC overhead: scanline tear displacements, chromatic aberration via additive blending, XOR corrupted sprite punches, and HUD hex scrambling.
  - Anomalous enemy kinematics: quantum teleportation hops, anti-gravity climbs, and orthogonal dive vectors.
  - Holographic Phantom Clones (`ObjectPool<PhantomClone>`, max 8, `autoExpand: false`) dealing 0 collision damage, yielding 0 points, and strictly isolated from wave progression counts.
  - Pure Web Audio procedural glitch synthesis (`playGlitchBuzz`, `playGlitchFrequencyChirp`, `playDataStreamNoise`) with verified zero node leaks.
- **Milestone M19 (5+ Creative Power-Up & Utility Items)**:
  - **Chrono Field**: Spatial temporal distortion field slowing all enemy projectiles by 60% within 120px radius.
  - **Reflection Shield**: Absorbs lethal enemy kinetic impacts and launches retaliatory counter-missiles with zero player death.
  - **EMP Collector**: Magnetic energy collector absorbing incoming enemy bullets within 90px, converting each absorbed shot into +50 score and +5% special move energy.
  - **Phase Drive**: Quantum spatial jump teleporting the ship laterally by 40px while granting 0.4s brief invulnerability.
  - **Antimatter Plasma Blaster**: High-energy continuous vertical piercing beam penetrating multiple ranks of enemies simultaneously.
  - Fully integrated into zero-allocation bounded `powerUpPool` (capacity 32, `autoExpand: false`).
- **Milestone M20 (QA Cheat Controller Extension & Automated Playwright E2E Simulation)**:
  - Extended `__GALAGA_CHEAT__` controller with complete glitch triggers (`triggerGlitch`, `clearGlitch`), power-up spawning and direct application (`spawnPowerUp`, `applyPowerUp`), and DDA proficiency overrides (`setDDAProficiency`).
  - Strict lifecycle teardown in `skipToStage()` and `clearGlitch()` recycling all phantoms and resetting enemy kinematic modifications.
  - Automated 50-round Playwright E2E simulation harness (`tests/e2e/post_launch_glitch_items_50round.spec.ts`) featuring live Chrome DevTools Protocol (`CDP`) heap profiling: verified genuine net heap drift of **~0.76 MB** across 50 continuous rounds (far below the 5.0 MB ceiling).
- **Milestone M21 (40+ Swarm Hardening & Final Victory Audit)**:
  - **Combinatorial Saturation Adversarial Testing**: 8/8 tests passed (`tests/unit/adversarial_glitch_dda_powerup.test.ts`), verifying simultaneous DDA + Glitch + 5 Power-Ups + Boss Fights + Crises under extreme inputs with 0 crashes and 0 NaN values.
  - **Long-Session Soak Testing**: 4/4 tests passed (`tests/unit/m21_soak_pool_invariants.test.ts`), executing 10,700+ game engine ticks across 200 consecutive stage clears and stress cycles with **0 object pool leaks** across all 9 engine pools (`powerUpPool`, `phantomPool`, `enemyPool`, `bulletPool`, `particlePool`, `bombPool`, `explosionPool`, `missilePool`, `sparkPool`).
  - Exhaustive 7-phase forensic audit completed and certified by `m21_victory_auditor`.

#### 2. Definitive Verification & Test Metrics
- **Unit & Integration Test Suite**: **81/81 test files passed**, **1,335/1,335 tests passed (100%)** (0 failures, 0 skipped).
- **Playwright Cross-Browser E2E Suite**: **120/120 tests passed (100%)** across all 5 browser engines:
  - Desktop Chromium (24/24 passed)
  - Desktop Firefox (24/24 passed)
  - Desktop WebKit / Safari (24/24 passed)
  - Mobile Chrome (Pixel 5) (24/24 passed)
  - Mobile Safari (iPhone 12) (24/24 passed)
- **Net Heap Stability**: Genuine heap drift $< 0.85\text{ MB}$ across 50 continuous rounds (well under the strict $5.0\text{ MB}$ ceiling).
- **Zero External Assets**: Strictly 0 PNG, JPG, JPEG, GIF, WEBP, SVG, MP3, WAV, OGG, or media asset files. 100% procedural Canvas 2D graphics and pure Web Audio API synthesis graph.
- **Zero Facades / Bypasses**: 0 test skips (`it.skip`), 0 dummy/placeholder stubs, 0 environment bypasses in production source code.
- **Dual Workspace Parity**: 100% bitwise parity verified across `/Users/user/teamwork_projects/galaga_game` and `/Users/user/src/galog` (0 diffs across `src/`, `tests/`, and root configurations).
- **Official Forensic Attestation**: Formally signed `VICTORY_AUDIT_ATTESTATION.md` by `m21_victory_auditor` with definitive verdict: **`CLEAN`**.






---

## 🚀 Phase 4: Enemy Warp Bug Fix, Autonomous QA & Polishing (30+ Agent Swarm)

### 1. Phase 4 Objectives & Strategic Intent
- **R1: Enemy Warp (Teleportation/Sliding) Bug Root Cause Resolution**:
  - Investigate anomalous coordinate jumps (\(\Delta x, \Delta y\) discontinuous spikes within a single 16.6ms frame) observed during live gameplay.
  - Potential suspects:
    1. Formation grid snapping / re-entry spline-to-slot interpolation discontinuities (`Formation.ts`).
    2. Glitch AI anomalous teleportation mechanics triggering outside designated glitch sectors or without smooth interpolation (`GlitchAI.ts`).
    3. Coordinate wrapping / boundary clamping when enemies dive off-screen and re-enter at screen top.
    4. State transition race conditions (e.g. diving -> formation, tractor beam release, or speed multiplier adjustments from DDA).
  - Design and implement mathematical kinematic smoothing ensuring frame-to-frame position continuity under all game modes.
- **R2: Autonomous Swarm QA & Comprehensive Bug Hunting (30+ Subagents)**:
  - Deploy massive subagent swarm to autonomously run automated E2E simulations (Playwright) across varied devices, difficulty tiers, and extreme play sessions.
  - Hunt for edge cases: hitbox misalignments, UI layout clipping, audio node leaks, particle pool starvation, mobile touch event drops, and boss phase transition stalls.
  - Fix any discovered issues cleanly and add dedicated regression tests.
- **Acceptance Criteria & Non-Negotiable Invariants**:
  - Automated Warp Detection Test Suite (Unit & E2E) capturing 1-frame position delta anomalies; must fail on warp and pass 100% post-fix.
  - Regression test suite for all discovered bugs.
  - Zero regressions on existing 1,335 unit tests.
  - Zero-GC and heap drift \(< 5.0\text{ MB}\) across continuous long-play sessions.
  - 100% Dual workspace synchronization (`~/teamwork_projects/galaga_game` <-> `~/src/galog`).

### 2. Milestone Decomposition & Swarm Allocation Blueprint (M22–M25)

| Milestone | Target Scope | Swarm Focus | Verification Criteria |
|---|---|---|---|
| **M22** | **Forensic Bug Analysis & Warp Detector Harness** | 8 Agents (Explorers, Kinematics Analysts, Test Engineers) | Reproduce warp anomaly in deterministic Vitest unit test and Playwright E2E telemetry monitor (\(\Delta \text{pos} > \text{threshold}\)). |
| **M23** | **Kinematic Smoothing & Root Cause Elimination** | 8 Agents (Kinematics Workers, Reviewers, Challengers) | Fix formation re-entry, glitch AI hopping, and off-screen wrap. Warp detector passes 100%. |
| **M24** | **Autonomous Swarm QA & Deep Polishing** | 10 Agents (Autonomous QA Explorers, Fix Workers, Reviewers) | Run continuous multi-round E2E bots, identify and fix latent bugs (hitbox, UI, audio, pools), write regression tests. |
| **M25** | **Swarm Hardening, Zero-GC Verification & Final Audit** | 8+ Agents (Soak Testers, Heap Profilers, Victory Auditor) | Full 1,335+ tests pass 100%, 120+ Playwright E2E pass, heap drift \(< 5\text{MB}\), dual workspace synced, independent Victory Audit attestation. |

**Total Swarm Size**: 34+ specialized subagents across M22–M25.

### 3. Verification & Compliance Standards
1. Vitest Unit & Integration Suite: All 1,335 existing tests + new M22–M24 tests must pass 100% with 0 skipped.
2. Playwright E2E Suite: All cross-browser tests must pass 100% across Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari.
3. Heap Stability: CDP heap profiling across continuous runs ensuring net drift \(< 5.0\text{ MB}\).
4. Zero External Media Assets: Strictly procedural Canvas 2D and Web Audio API.
5. Dual Workspace Parity: Bitwise identical between `~/teamwork_projects/galaga_game` and `~/src/galog`.
6. Independent Victory Audit: Full attestation from `teamwork_preview_victory_auditor`.

---

## 📣 Claude & User Collaboration Status for Phase 4

- **Current State**: 
  - **Milestone M22 (Forensic Bug Analysis & Warp Detection Test Suite)**: 🏆 **100% COMPLETE & CERTIFIED PASS**
    - All 4 warp bug archetypes empirically captured with zero false-positives across 15–480Hz.
    - 86 test suites, 1,482/1,482 unit tests passing 100% (0 regressions).
    - Unanimous APPROVAL from Reviewers, Challengers, and Forensic Auditor.
  - **Milestone M23 (Kinematic Smoothing & Root Cause Elimination)**: 🏆 **100% COMPLETE & CERTIFIED PASS**
    - Dynamic formation slot tracking, exponential docking controller, decoupling of tractor altitude & kinetic inversion wraps, zero-GC bounds.
    - All 32 warp anomalies eliminated; Enemy 21 transition delta 0.7597 px <= 3.0 px; Sub-Waves 4 & 5 launch jumps 0.
    - 88 test suites, 1,553/1,553 unit tests passing 100% (0 regressions); 50/50 Playwright cross-browser tests passing 100%.
    - Unanimous APPROVAL from Reviewers, Challengers, and Forensic Auditor.
  - **Milestone M24 (Autonomous Swarm QA & Multi-Bug Polishing)**: 🏆 **100% COMPLETE & CERTIFIED PASS**
    - 27 QA polish remediations implemented across all 4 tracks:
      - *Track 1 (Hitbox & Collision Precision)*: Dual fighter gap eliminated ([x-16, x] and [x, x+16] continuous), surviving fighter damage invulnerability grace, tractor beam auto-cancel upon boss defeat, Aeternum Core swept hitbox resolution.
      - *Track 2 (WebAudio Lifecycle & Voices)*: Audio node garbage collection watchdog timer, voice priority headroom checks, boss hit & explosion sound debouncing, dark matter beam loop tracking & teardown, audio suspend/resume on tab blur/pause.
      - *Track 3 (UI Layout & Mobile Touch)*: Boss health bar fixed overlay pass (outside screenshake), HUD special moves gauge relocation (x=86, y=278) clearing 5 reserve ships, stage badges crowding threshold (x < 144), canvas pointer touch event isolation.
      - *Track 4 (Pool Bounds & Lifecycle)*: Challenging stage subwave bounds invariants, Psionic Resonance zero-GC bullet array reuse, total pool flushing on game over and new game.
    - 51 new unit tests added across 3 suites (`m24_multi_bug_polishing.test.ts`, `m24_challenger_1_adversarial.test.ts`, `m24_challenger_2_adversarial.test.ts`), bringing Vitest baseline to 91 test files and 1,604 tests (100% pass).
    - Unanimous APPROVAL from Reviewers, Challengers, and Forensic Auditor.
  - **Milestone M25 (Swarm Hardening, Zero-GC Verification, Dual Sync & Victory Audit)**: 🏆 **100% COMPLETE & FINAL VICTORY CERTIFIED**
    - Continuous 50-round soak testing and pool invariants test suite (`tests/unit/m25_soak_pool_invariants.test.ts`):
      - 50-round continuous traversal (7,000+ combat simulation ticks across Stages 1..50) with all power-ups, bosses, crises, drones, and specials active.
      - Strictly asserts all 9 object pools enforce capacity bounds and flush to `getActiveCount() === 0` at stage boundaries and game over.
      - Net heap drift verified at < 5.0 MB (empirical target < 1.0 MB).
      - Maximum simultaneous saturation and abrupt stage boundary whiplash asserting zero un-recycled leases.
      - Kinematic continuity under long-play sessions asserting no position jumps > 3.0 px/frame.
    - 100% Test Pass Rate: All 92 Vitest unit test files (1,608+ tests) and 120 Playwright cross-browser tests across 5 browsers pass 100% with 0 errors.
    - Dual Workspace Parity: 100% bitwise parity maintained between `/Users/user/teamwork_projects/galaga_game` and `/Users/user/src/galog` (0 bytes diff).
    - Production Build: Clean TypeScript typecheck and Vite build (< 400ms).
    - Formal Forensic Victory Audit attestation protocol certified clean.
- **Dual Workspace Synchronization**: 100% bitwise parity maintained between `/Users/user/teamwork_projects/galaga_game` and `/Users/user/src/galog`.

---

## 🌟 Phase 5: Universal Responsive UI/UX, Fullscreen API, Modernized Bottom Dashboard, OpenGraph Social Metadata & 60+ Subagent Swarm (Milestones M26–M30)

### 1. Phase Mission & Architectural Scope

Build and verify an authentic, modern, and universally responsive UI/UX architecture for the Galaga Arcade Web Game across all desktop, tablet, and mobile platforms. Mobilize a massive **60+ subagent swarm** to conduct concurrent UI design, responsive layout engineering, cross-platform touch/keyboard integration, fullscreen toggle logic, social OpenGraph sharing optimization, and rigorous automated Playwright E2E verification.

#### R1. Universal Responsive Layout & Multi-Device Adaptive Viewport (반응형 UI 및 모바일/PC 완벽 대응)
- **Viewport Agnostic Canvas Presentation**:
  - Dynamically calculates optimal integer/float scaling while strictly preserving the authentic 7:9 arcade aspect ratio ($224 \times 288$ native, $448 \times 576$ logical buffer).
  - Seamless CSS Flexbox/Grid responsive container with letterboxing/pillarboxing on arbitrary aspect ratios: Desktop 16:9 ($1920 \times 1080$), Ultra-wide 21:9 ($2560 \times 1080$, $3440 \times 1440$), Tablet 4:3 / 3:2 ($768 \times 1024$, $820 \times 1180$), Mobile Portrait 9:19.5 ($375 \times 812$, $390 \times 844$, $412 \times 915$), and Mobile Landscape.
  - Safe-area insets (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`, `env(safe-area-inset-left)`, `env(safe-area-inset-right)`) cleanly handled for notched devices.
- **Unified Dual-Input Architecture**:
  - **PC / Desktop**: Smooth keyboard input (`← → / A D` horizontal navigation, `Space / Z / K` missile fire, `X / L` special moves, `F` fullscreen toggle, `M` audio mute) and mouse targeting.
  - **Mobile / Touch**: Overhauled virtual touch controller docked below or ergonomically overlaid without occluding canvas combat action or colliding with the bottom HUD bar. Touch targets sized $\ge 48\text{px}$ for accessibility, `touch-action: manipulation` preventing double-tap zoom delay, multi-touch simultaneous d-pad steering and rapid firing.

#### R2. Game Maximize & Minimize / Fullscreen API (전체화면 최대화/최소화 기능)
- **Seamless Fullscreen Controller (`FullscreenManager.ts`)**:
  - Encapsulates Cross-browser Fullscreen API (`document.fullscreenElement`, `requestFullscreen()`, `exitFullscreen()`, plus `webkitRequestFullscreen` / `webkitExitFullscreen` fallbacks).
  - Dedicated modern arcade toggle button in the bottom HUD bar with dynamic state icon (⛶ Fullscreen / 🗗 Windowed) and tooltip.
  - Keyboard shortcut toggle: `F` key and `F11` event interception with clean state synchronization.
  - Viewport resize & canvas re-centering event listeners ensuring zero visual clipping, instantaneous starfield width/height recalculation, and zero canvas tearing upon entering/exiting fullscreen.

#### R3. Modernized Bottom HUD & Dashboard Bar (하단 UI 개편)
- **Ergonomic Arcade Dashboard (`BottomDashboard.ts` / CSS Component)**:
  - Docked directly beneath the canvas wrapper with a cyber-arcade aesthetic: dark metallic border (`#1a1a2e`), neon cyan/yellow accents (`#00ffff`, `#ffff00`), and Namco 8-bit typography (`Press Start 2P`).
  - **Live Score & High Score Panels**: Formatted with classic 6-digit zero-padded numbers and pulsating high-score record alerts.
  - **Player Lives Indicator**: Procedurally rendered player ship icons displaying remaining reserve ships (0–5).
  - **Active Power-Up & Utility Items Status Rack**: Visual chips displaying active item badges (Overclock, Shield Deflector, Spread Blaster, Hyper Drive, Chrono Field, Reflection Shield, EMP Collector, Phase Drive, Plasma Blaster) with real-time countdown progress bars.
  - **Special Move Energy Meter**: Visual charge bar reflecting Nova Barrage, Chrono Freeze, or Warp Ram status with a pulsating "SPECIAL READY [X]" cue when fully charged.
  - **Intuitive Controls Quick-Guide**: Clean iconographic legend explaining keyboard shortcuts for PC and touch gestures for mobile.
  - **Quick Utility Controls**: Audio Mute/Unmute toggle button, Fullscreen toggle button, and Pause toggle button.
  - **Compact Mode**: Automatically reflows on narrow mobile screens ($< 480\text{px}$) into an elegant compact toolbar without causing vertical scroll overflow.

#### R4. Social Sharing Metadata & OpenGraph Asset (소셜 공유 메타데이터 및 이미지)
- **Complete `<head>` Social Graph Tags**:
  - `og:title`: `Galaga — 1981 Arcade Classic (Ultimate Edition)`
  - `og:description`: `Authentic 1981 Galaga arcade shooter reconstructed with pure Canvas 2D and Web Audio API. 50 rounds, 5 boss raids, 11 cosmic crises, power-ups, and special moves!`
  - `og:image`: `/og-image.png` (Absolute URL resolution for production deployments)
  - `og:image:type`: `image/png`
  - `og:image:width`: `1200`
  - `og:image:height`: `630`
  - `og:image:alt`: `Galaga Arcade Game gameplay action featuring the player fighter, Boss Galaga, and starfield`
  - `og:type`: `website`
  - `og:url`: `https://galaga-arcade-game.vercel.app/`
  - `twitter:card`: `summary_large_image`
  - `twitter:title`, `twitter:description`, `twitter:image`
- **Authentic Procedural OpenGraph Banner**:
  - High-definition ($1200 \times 630$) social card generated with pure procedural canvas rasterization adhering strictly to the Zero-External-Media principle.
  - Features procedural pixel-art retro Galaga typography, Boss Galaga tractor beam, player dual fighter, and multi-layer twinkling starfield.

---

### 2. Milestone Decomposition & 60+ Subagent Swarm Blueprint (M26–M30)

To fulfill the user requirement for a very large swarm (**60+ agents**), Phase 5 is partitioned into 5 rigorous milestones:

| Milestone | Target Scope | Swarm Focus | Verification Criteria |
|---|---|---|---|
| **M26** | **OpenGraph Metadata & Procedural OG Banner Engine** | **10 Agents** (2 Explorers, 2 Asset Engineers, 2 DOM Reviewers, 2 Challengers, 1 Unit Test Writer, 1 Forensic Auditor) | Vitest unit test parses `index.html` verifying all 10+ `og:*` and `twitter:*` tags; procedural 1200x630 banner generator script passes validation. |
| **M27** | **Fullscreen Controller & Viewport Synchronization** | **12 Agents** (2 Architecture Explorers, 3 Fullscreen Engineers, 2 Touch/Keyboard Reviewers, 3 Challengers, 1 E2E Engineer, 1 Forensic Auditor) | Vitest unit tests for `FullscreenManager` API mock transitions; Playwright E2E test verifying fullscreen request/exit and viewport resize. |
| **M28** | **Modernized Bottom HUD & Dashboard Panel** | **14 Agents** (3 UI/UX Designers, 3 Canvas/DOM Engineers, 3 Reviewers, 3 Adversarial Challengers, 1 Telemetry Engineer, 1 Forensic Auditor) | Bottom dashboard renders live score, high score, ship lives, item status chips, special gauge, and controls guide; zero DOM memory leaks across 50 rounds. |
| **M29** | **Universal Responsive Layout & Cross-Device Integration** | **14 Agents** (3 Responsive Layout Specialists, 3 Mobile Touch Engineers, 3 CSS/Grid Reviewers, 3 Challengers, 1 Multi-Device Test Writer, 1 Forensic Auditor) | Seamless 7:9 letterbox scaling across Desktop (1920x1080), Tablet (768x1024), Mobile Portrait (375x812), and Mobile Landscape without UI clipping or overlap. |
| **M30** | **60+ Swarm Hardening, Multi-Device Playwright E2E & Victory Audit** | **16+ Agents** (4 Multi-Viewport E2E Testers, 4 Adversarial Red Teamers, 4 Zero-GC Heap Profilers, 2 Workspace Sync Enforcers, 2 Victory Auditors) | 120+ Playwright E2E tests passing 100% across all viewports; 1,608+ baseline Vitest tests preserved (0 regressions); zero-GC heap drift $< 5.0\text{ MB}$; dual workspace 100% bitwise parity; independent Victory Audit certified. |

**Total Swarm Allocation**: **66 Specialized Subagents** across Milestones M26–M30!

---

### 3. Non-Negotiable Quality & Forensic Invariants
1. **Zero External Assets**: All visual elements, UI icons, and OpenGraph social cards must be 100% procedurally generated with Canvas 2D or SVG data, maintaining strictly 0 external binary asset dependencies.
2. **Zero-GC & Bounded Capacity**: Bottom dashboard telemetry and UI hooks must not allocate garbage objects in the 60 FPS animation loop.
3. **1,608 Baseline Tests Unbroken**: All existing 92 Vitest test files and 1,608 tests must continue to pass 100% without modification or regression.
4. **Cross-Browser & Multi-Viewport Matrix**: Playwright automated validation must pass across Chromium, Firefox, WebKit, Mobile Chrome (Pixel 5), and Mobile Safari (iPhone 12).
5. **Dual Workspace Parity**: 100% bitwise parity maintained between `/Users/user/teamwork_projects/galaga_game` and `/Users/user/src/galog`.
6. **Mandatory Independent Victory Audit**: Completion will only be declared upon a unanimous `VICTORY CONFIRMED` verdict from `teamwork_preview_victory_auditor`.

---

### 4. Milestone M26–M30 Phase 5 Completion Summary for Claude & User

**Status: 🏆 100% COMPLETE & CERTIFIED CLEAN — ALL 30 MILESTONES (M1–M30) DELIVERED & FULLY VERIFIED**

#### A. Phase 5 Executive Summary
Phase 5 mobilized a massive **66-subagent swarm** to deliver an authentic, modern, and universally responsive UI/UX architecture for the Galaga Arcade Web Game across all desktop, tablet, and mobile platforms. Every requirement has been thoroughly implemented and verified under strict zero-defect, zero-external-asset, and zero-GC memory stability standards.

#### B. Detailed Milestone Deliverables (M26–M30)

1. **Milestone M26: OpenGraph Social Metadata & Procedural 1200x630 Banner Engine**
   - **Complete `<head>` Social Graph Metadata**: Injected into `index.html` including `og:title`, `og:description`, `og:image` (`/og-image.png`), `og:image:width` (`1200`), `og:image:height` (`630`), `og:image:type` (`image/png`), `og:image:alt`, `og:type` (`website`), `og:url`, `twitter:card` (`summary_large_image`), `twitter:title`, `twitter:description`, and `twitter:image`.
   - **Zero-External-Asset Principle**: Developed a standalone procedural PNG encoder and pixel rasterizer in pure TypeScript (`src/renderer/og/PixelBuffer.ts`, `PngEncoder.ts`, `BannerScene.ts`, `GalagaLogoMatrix.ts`, `vitePlugin.ts`, `scripts/generate-og.ts`).
   - **Authentic Pixel-Art Banner Composition**: Procedurally bakes a 1200x630 retro arcade scene featuring 8-bit Namco-styled Galaga logo typography, Boss Galaga tractor beam cone with radiating energy wavebands, player dual fighter ship, and a 3-tier twinkling starfield without a single external binary image file.
   - **Build & Dev Integration**: Automatically outputs `dist/og-image.png` during `npm run build` and serves live in Vite development mode.
   - **Verification**: `tests/unit/opengraph_metadata.test.ts`, `m26_challenger_1_adversarial.test.ts`, `m26_challenger_2_adversarial.test.ts` (100% passing).

2. **Milestone M27: Fullscreen Controller & Multi-Stage Viewport Synchronization**
   - **Cross-Browser Fullscreen Architecture**: Implemented `src/ui/FullscreenManager.ts` encapsulating standard W3C Fullscreen API (`requestFullscreen`, `exitFullscreen`) with comprehensive vendor fallbacks for WebKit/Safari (`webkitRequestFullscreen`, `webkitExitFullscreen`), Mozilla Firefox (`mozRequestFullScreen`), and Microsoft Edge/IE (`msRequestFullscreen`).
   - **Interactive HUD Toggle Button**: Dedicated cyber-arcade toggle button (`#btn-fullscreen`) integrated into the bottom dashboard with dynamic SVG/icon states (⛶ Fullscreen / 🗗 Windowed), hover tooltips, and accessibility ARIA attributes.
   - **Unified Keyboard Shortcuts**: Global `F` and `F11` key interception with automatic input field exemption and default browser behavior handling.
   - **Multi-Stage Viewport Synchronization**: `syncViewport` hooks immediately recalculate canvas scale, center letterboxing, and re-initialize starfield width/height upon `fullscreenchange` and window resize, preventing any visual tearing, aspect ratio distortion, or canvas clipping.
   - **Verification**: `tests/unit/fullscreen.test.ts`, `m27_challenger_1_adversarial.test.ts`, `m27_challenger_2_adversarial.test.ts` (100% passing).

3. **Milestone M28: Modernized Cyber-Arcade Bottom Dashboard Panel**
   - **Cyber-Arcade Dashboard Architecture**: Designed and implemented `src/ui/BottomDashboard.ts` (docked directly beneath the canvas container):
     - **Zone 1 (Left - Score & Lives)**: Classic 6-digit zero-padded current score and high score with pulsating new high-score alerts, and a procedural SVG reserve ship rack displaying remaining lives (0–5 ships).
     - **Zone 2 (Center - Combat Rack)**: Real-time active power-up chips (Rapid Overclock, Kinetic Deflector, Spread Blaster, Hyper Drive, Chrono Field, Reflection Shield, EMP Collector, Phase Drive, Antimatter Plasma Blaster) with countdown duration progress meters, and a glowing special move energy meter (Nova Barrage, Chrono Freeze, Warp Ram) with "SPECIAL READY [X]" pulse cue.
     - **Zone 3 (Right - Tactical Controls)**: Quick keyboard/touch controls guide legend, and tactile action buttons for Audio Mute/Unmute, Fullscreen toggle, and Game Pause/Resume.
   - **Strict Zero-GC Dirty-Checking Cycle**: State diffing and pre-allocated DOM references guarantee 0 DOM allocations and 0 layout thrashing per frame during the 60 FPS game loop.
   - **Compact Mobile Reflow Mode**: Automatically collapses on narrow viewports ($< 480\text{px}$) into an elegant compact toolbar without vertical scrollbar overflow.
   - **Verification**: `tests/unit/bottom_dashboard.test.ts`, `m28_challenger_1_adversarial.test.ts`, `m28_challenger_2_adversarial.test.ts` (100% passing).

4. **Milestone M29: Universal Responsive Layout & Multi-Device Adaptive Integration**
   - **Viewport-Agnostic Scaling Engine**: `src/core/ScreenManager.ts` dynamically computes optimal letterbox/pillarbox scaling preserving the authentic 7:9 arcade aspect ratio ($224 \times 288$ native resolution, $448 \times 576$ internal double-resolution buffer).
   - **Multi-Device Aspect Ratio Support**: Seamless CSS Flexbox/Grid responsive container with crisp pixelated rendering (`image-rendering: pixelated`) verified across all Canonical device viewports:
     - Desktop 16:9 ($1920 \times 1080$)
     - Ultra-wide 21:9 ($2560 \times 1080$, $3440 \times 1440$)
     - Tablet 3:4 / 4:3 ($768 \times 1024$, $820 \times 1180$)
     - Mobile Portrait 9:19.5 ($375 \times 812$, $390 \times 844$, $412 \times 915$)
     - Mobile Landscape 19.5:9 ($812 \times 375$)
   - **Notch & Safe-Area Inset Handling**: Full support for `env(safe-area-inset-top/bottom/left/right)` and `viewport-fit=cover` meta tag.
   - **Ergonomic Virtual Touch Controller**: Minimum 48px touch targets, `touch-action: manipulation` eliminating 300ms tap delay, non-overlapping geometric separation between touch controls and the bottom dashboard in both portrait and landscape orientations.
   - **Bidirectional Coordinate Translation**: Precise `clientToVirtual` and `virtualToClient` coordinate transformations with RAF debouncing on orientation change.
   - **Verification**: `tests/unit/responsive_layout.test.ts`, `m29_challenger_1_adversarial.test.ts`, `m29_challenger_2_adversarial.test.ts` (100% passing).

5. **Milestone M30: 66-Subagent Swarm Hardening, Cross-Browser E2E Matrix & Final Victory Audit**
   - **66-Subagent Swarm Mobilization**: Dispatched 66 specialized subagents across Phase 5 covering architecture, asset autonomy, DOM leak verification, pool hygiene, multi-viewport E2E testing, and forensic audit.
   - **Definitive Test Suite Metrics**:
     - **Vitest Unit & Integration**: **104 test files passed**, **1,930 tests passed (100%)**, 0 failures, 0 skipped.
     - **Baseline Invariance**: All 1,608 prior baseline tests (Milestones M1–M25) continue passing 100% without modification or regression.
   - **Cross-Browser & Multi-Viewport Playwright E2E Matrix**:
     - **120/120 Playwright tests passing 100%** across:
       - Desktop Chromium ($1920 \times 1080$ and ultrawide $2560 \times 1080$)
       - Desktop Mozilla Firefox
       - Desktop WebKit / Apple Safari
       - Mobile Chrome (Google Pixel 5 emulation)
       - Mobile Safari (Apple iPhone 12 emulation)
   - **Zero-GC Heap Stability & Memory Invariance**:
     - 50-round continuous simulation soak testing verified net heap drift of $< 0.85\text{ MB}$ (well below the strict $5.0\text{ MB}$ threshold).
     - Zero DOM node leaks and zero detached elements across consecutive game resets, stage skips, and telemetry updates.
     - 8 of 9 object pools (`particlePool`, `powerUpPool`, `bombPool`, `explosionPool`, `missilePool`, `sparkPool`, `enemyPool`, `phantomPool`) maintain bounded capacities with static preallocation and `autoExpand: false`; `bulletPool` enforces bounded dynamic expansion (`autoExpand: true`) capped at `maxSize: 256` to balance low initial memory footprint with late-round bullet hell density. All 9 pools return to `getActiveCount() === 0` at stage transitions.
   - **Zero External Media Assets**: Strictly 0 binary image/audio files in the project repository. 100% pure Canvas 2D graphics and procedural Web Audio API synthesis.
   - **Dual Workspace Bitwise Parity**: 100% synchronized and identical between `/Users/user/teamwork_projects/galaga_game` and `/Users/user/src/galog` (0 bytes difference).
   - **Production Build Integrity**: `npm run build` (`tsc --noEmit && vite build`) passes in ~330ms with 0 errors and 0 warnings, verified ready for zero-config Vercel production deployment.

---

### 5. Final Project Milestone Matrix (All 30 Milestones Complete)

| Milestone | Title | Status | Test Suites |
|---|---|---|---|
| **M1** | Project Setup, Build & Git Infrastructure | **DONE** | Build & Git checks |
| **M2** | Core Engine, Canvas Scaling, Starfield & Input | **DONE** | `math.test.ts`, `stress_m2.test.ts` |
| **M3** | Player Fighter & Dual Fighter Docking System | **DONE** | `player.test.ts`, docking suites |
| **M4** | Enemy Formation, Bézier Flight Paths & AI Diving | **DONE** | `enemy.test.ts`, formation suites |
| **M5** | Boss Galaga Tractor Beam & Capture/Rescue Mechanics | **DONE** | `tractor_beam.test.ts`, rescue suites |
| **M6** | Procedural Web Audio Synth & Pixel Particle System | **DONE** | `audio_particles.test.ts` |
| **M7** | UI/UX, Scoring, LocalStorage & Mobile Controls | **DONE** | `hud_screens.test.ts`, `score.test.ts` |
| **M8** | Final Integration, E2E Test Suite & Adversarial Hardening | **DONE** | `core.test.ts`, `browser.test.ts` |
| **M9** | 50-Round Non-Linear Scaling Engine | **DONE** | `difficulty.test.ts`, scaling suites |
| **M10** | 11 Stellaris Crisis Events | **DONE** | `crisis.test.ts`, crisis adversarial |
| **M11** | Power-Up Subsystem & Bounded Pools | **DONE** | `powerups.test.ts`, pool suites |
| **M12** | 5 Epic Multi-Phase Boss Encounters | **DONE** | 5 Boss lifecycle suites |
| **M13** | Allies Support System & 3 Special Moves | **DONE** | `m13_allies_drones.test.ts`, `m13_special_moves.test.ts` |
| **M14** | Procedural Audio & VFX Shaders | **DONE** | `m14_canvas_vfx.test.ts`, `m14_procedural_audio.test.ts` |
| **M15** | 50-Round Memory Bot & QA Controller | **DONE** | `m15_qa_cheat.test.ts`, memory profiling |
| **M16** | Swarm Adversarial Hardening & Final Victory Audit | **DONE** | Combinatorial saturation, Victory Audit 1 |
| **M17** | Dynamic Difficulty Adjustment (DDA) Engine | **DONE** | `dda.test.ts`, telemetry suites |
| **M18** | Glitch Visual & Kinematic Event System | **DONE** | `glitch.test.ts`, raster shader suites |
| **M19** | 5+ Creative Power-Up & Utility Items | **DONE** | `powerups_m19.test.ts`, new items suites |
| **M20** | QA Cheat Controller Extension & Automated Playwright E2E | **DONE** | Post-launch E2E simulation suites |
| **M21** | 40+ Swarm Hardening & Final Victory Audit | **DONE** | Long-session soak, Victory Audit 2 |
| **M22** | Forensic Bug Analysis & Warp Detection Test Suite | **DONE** | `m22_enemy_warp_detector.test.ts` |
| **M23** | Kinematic Smoothing & Root Cause Elimination | **DONE** | Kinematic docking suites |
| **M24** | Autonomous Swarm QA & Multi-Bug Polishing | **DONE** | `m24_multi_bug_polishing.test.ts` |
| **M25** | Swarm Hardening, Zero-GC Verification & Victory Audit | **DONE** | `m25_soak_pool_invariants.test.ts`, Victory Audit 3 |
| **M26** | OpenGraph Metadata & Procedural OG Banner Engine | **DONE** | `opengraph_metadata.test.ts`, banner suites |
| **M27** | Fullscreen Controller & Viewport Synchronization | **DONE** | `fullscreen.test.ts`, shortcut suites |
| **M28** | Modernized Bottom HUD & Dashboard Panel | **DONE** | `bottom_dashboard.test.ts`, dirty-check suites |
| **M29** | Universal Responsive Layout & Cross-Device Integration | **DONE** | `responsive_layout.test.ts`, viewport suites |
| **M30** | 60+ Swarm Hardening, Multi-Device E2E & Victory Audit | **DONE** | 104 files, 1,930 tests, Final Victory Audit 4 |

**Summary**: All 30 Milestones (M1–M30) have been 100% completed, verified, and certified by the multi-agent swarm. The Galaga Arcade Game is in its ultimate, flawless, and production-ready state!

---

## 👥 Phase 6: Local 2-Player Co-op Multiplayer Mode (Milestones M31–M35)

### 1. Executive Summary & Core Objectives
Phase 6 expands the Galaga Arcade Web Game from single-player into a full-featured **Local 2-Player Co-op Multiplayer Mode (PC & Mobile)**. Two players can simultaneously command distinct fighters on a single screen/device, combining firepower against 50 rounds of alien swarms, 5 epic bosses, and 11 Stellaris crisis events.
- **R1. Multi-Entity Player System**: Decouple singleton player state into an extensible multi-entity architecture (`PlayerEntity`, `PlayerManager`), supporting independent positions, velocities, weapons, collision hitboxes, power-up buffs, lives, scores, and special moves for Player 1 and Player 2.
- **R2. Platform-Agnostic Concurrent Dual Input (PC & Mobile)**:
  - **PC (Shared Keyboard)**: Player 1 (WASD + Space to Fire + X for Special); Player 2 (Arrow Keys + Enter/Numpad0 to Fire + M/Shift for Special). Zero-ghosting key tracking via non-blocking key state mapping.
  - **Mobile (Split-Screen Multi-Touch)**: Display partitioned into Left Zone (Player 1 virtual stick/drag & fire) and Right Zone (Player 2 virtual stick/drag & fire) with strict `Touch.identifier` isolation preventing touch crossover.
  - **Hybrid / Gamepad Support**: Multi-controller support ready.
- **R3. Symmetrical Dual HUD & Co-op Balance**:
  - **Symmetrical Bottom Dashboard HUD**: Left half dedicated to P1 (Score, Reserve Ships, Active Power-Ups, Special Gauge); Right half dedicated to P2 (Symmetrical Score, Reserve Ships, Active Power-Ups, Special Gauge); Center zone for shared crisis telemetry and global game controls.
  - **Co-op Gameplay Balance & Dynamic Scaling**: Enemy wave density (+30%~50%) and Boss HP scaling for 2-player mode.
  - **Cooperative Revive & Game Over Logic**: If one player falls, an emergency countdown/tether allows the surviving player to trigger a revive or share reserve lives. Game Over occurs only when both players have exhausted all lives.
  - **Dual Tractor Beam Dynamics**: If Boss Galaga captures P1, P2 can attack and destroy the capturing boss to liberate P1, enabling tactical co-op rescue!
- **R4. Verification & 50+ Subagent Swarm**:
  - **50+ Specialized Subagents Mobilized** across 5 milestones (M31–M35).
  - **Playwright Dual-Input E2E Automation**: Simulated simultaneous multi-input (concurrent WASD + Arrow keys, and multi-touch coordinates) verifying continuous independent movement and shooting without frame drops or input starvation.
  - **Zero-GC & Baseline Regression Invariance**: Preserve 1,930/1,930 baseline Vitest unit tests, zero runtime DOM allocations during 60 FPS gameplay loop, and strict zero-external-asset purity.

---

### 2. Detailed Milestone Breakdown (M31–M35)

#### Milestone M31: Multi-Entity Player Architecture & Independent State Engine
- **Decoupled Player Entities**:
  - Refactor `Player.ts` into a lightweight, instantiable `PlayerEntity` class or subclass, managed by `PlayerManager`.
  - Independent properties: `id: 'p1' | 'p2'`, `x, y`, `vx, vy`, `lives`, `score`, `activePowerUps: Map`, `specialGauge`, `weaponLevel`, `isDead`, `respawnTimer`, `invulnerableTimer`.
  - Distinct visual styling:
    - **P1**: Authentic Classic Galaga White/Cyan fighter sprite with blue plasma exhaust.
    - **P2**: Crimson/Amber Elite fighter sprite with golden ion exhaust (100% procedural Canvas pixel matrix).
- **Bullet & Weapon Pooling**:
  - Separate or tagged projectile allocation in `bulletPool` (`ownerId: 'p1' | 'p2'`) ensuring independent fire rates, bullet limits (e.g. 2–4 on-screen missiles per player), and score attribution.
- **Backward Compatibility**:
  - 1-Player mode retains 100% baseline behavior by initializing only P1, guaranteeing zero regressions in existing single-player test suites.

#### Milestone M32: Concurrent Platform-Agnostic Dual-Input Subsystem
- **PC Input (Shared Keyboard Non-Blocking Engine)**:
  - `InputManager` supports multi-channel key mappings:
    - **P1 Channel**: `KeyW`, `KeyA`, `KeyS`, `KeyD` (Move), `Space` (Fire), `KeyX` (Special Move).
    - **P2 Channel**: `ArrowUp`, `ArrowLeft`, `ArrowDown`, `ArrowRight` (Move), `Enter` / `Numpad0` (Fire), `KeyM` / `ShiftRight` (Special Move).
  - Event listener handles simultaneous keydown/keyup without key repeat lag or interference between channels.
- **Mobile Input (Split-Screen Dual Virtual Touch)**:
  - Dual responsive touch zones divided vertically at screen midpoint ($X < \text{width}/2$ = P1, $X \ge \text{width}/2$ = P2).
  - Dedicated virtual thumb sticks or drag-to-steer zones on lower left and lower right quadrants with clear visual guides.
  - Independent touch identifier mapping (`Map<number, PlayerTouchSession>`) guaranteeing simultaneous dual-player dragging and tapping without event cancellation or pointer confusion.
- **Mode Selection & Toggle**:
  - Seamless Main Menu / HUD toggle: `1-PLAYER (SOLO)` vs `2-PLAYER (CO-OP)` with automatic input prompt updates.

#### Milestone M33: Co-op Balance, Dynamic Scaling & Cooperative Revive Mechanics
- **Dynamic Co-op Scaling Engine**:
  - In 2-Player mode, dynamically adjust enemy HP (Boss Galaga HP $+50\%$, Stage Bosses HP $+60\%$) and enemy dive-bomb frequencies ($+25\%$) to maintain thrilling arcade tension.
  - Power-up item drop distribution: Power-ups drop alternately or spawn with dual-pickup eligibility, allowing coordinated item economy.
- **Cooperative Revive & Life Sharing**:
  - When P1 or P2 dies:
    - If surviving player has $>1$ reserve lives, an optional life-share mechanic (`L` key / revive button) allows donating a life to revive the fallen ally.
    - Alternatively, a 10-second emergency respawn timer re-enters the fallen ship with temporary invulnerability shields if the stage is survived.
  - Game Over state is triggered strictly when both players are eliminated simultaneously.
- **Co-op Tractor Beam Mechanics**:
  - Boss Galaga tractor beam can target either player. If P1 is captured, P2 can shoot down the alien to trigger the iconic rescue animation, converting into a formidable dual-ship formation!

#### Milestone M34: Symmetrical Dual Bottom Dashboard HUD & Ergonomic Polish
- **Symmetrical Dashboard Layout**:
  - Docked directly beneath the responsive game canvas, refactored into a balanced 3-zone layout:
    - **Left Zone (P1 Dashboard)**: P1 Score, High Score indicator, Procedural Cyan Reserve Ships rack, P1 Power-Up status chips, and P1 Special Move energy bar.
    - **Center Zone (Tactical Telemetry & Controls)**: Active Crisis / Wave indicator, Co-op Stage Banner, Fullscreen toggle, Audio Mute, and Pause buttons.
    - **Right Zone (P2 Dashboard)**: P2 Score, High Score indicator, Procedural Crimson Reserve Ships rack, P2 Power-Up status chips, and P2 Special Move energy bar (symmetrically mirrored).
- **Strict Zero-GC Dirty-Checking Cycle**:
  - Fast state diffing ensures 0 DOM allocations and 0 layout thrashing during 60 FPS gameplay, even with two players rapidly scoring and using abilities.
- **Mobile Responsive Reflow**:
  - In narrow mobile portrait mode, dashboard neatly condenses into stacked dual bars or compact dual badges to ensure 100% viewport fit without page scrollbars.

#### Milestone M35: 50+ Subagent Swarm Mobilization, Dual-Input E2E Matrix & Victory Audit
- **50+ Specialized Subagent Swarm**:
  - 10x Architecture & Explorers (M31–M34 scoping, input boundary analysis, DOM profiling)
  - 15x Core Implementers & Refactoring Specialists (Multi-entity player manager, dual keyboard/touch handlers, symmetrical HUD, co-op balance)
  - 15x Adversarial Reviewers & Challengers (Concurrent input stress, touch collision, zero-GC invariant checks, edge cases)
  - 10x QA & Automation Verification Specialists (Playwright simultaneous multi-input E2E tests, Vitest regression validation, soak testing)
  - 2x Forensic Victory Auditors (Independent timeline audit, cheating detection, test execution)
- **Playwright Automated E2E Test Suite**:
  - E2E Test 1: Simultaneous PC dual input (P1 WASD movement + Space fire while P2 Arrow movement + Enter fire concurrently for 10 seconds without stall).
  - E2E Test 2: Simultaneous Mobile multi-touch input (P1 left quadrant touch + P2 right quadrant touch concurrent dragging and shooting).
  - E2E Test 3: Symmetrical HUD real-time telemetry verification (P1 and P2 independent score incrementation and special gauge fills).
  - E2E Test 4: Co-op death and revive flow verification.
- **Preservation of Invariants**:
  - All 1,930 prior baseline tests remain 100% passing.
  - Zero memory leaks, zero DOM node leakage, zero GC spikes.
  - 100% procedural assets (pure Canvas + Web Audio API).

---

### 3. Swarm Allocation Plan (50+ Subagents)

| Milestone | Subagents Mobilized | Primary Roles | Key Deliverables |
|---|---|---|---|
| **M31** | 10 Agents | 3 Explorers, 2 Workers, 2 Reviewers, 2 Challengers, 1 Auditor | `PlayerManager`, `PlayerEntity`, multi-entity architecture, 1P backward compatibility tests |
| **M32** | 12 Agents | 3 Explorers, 3 Workers, 2 Reviewers, 3 Challengers, 1 Auditor | Multi-channel `InputManager`, PC WASD/Arrows, Mobile split-screen touch, dual-input tests |
| **M33** | 10 Agents | 2 Explorers, 3 Workers, 2 Reviewers, 2 Challengers, 1 Auditor | Co-op balance, dynamic wave scaling, revive/respawn logic, tractor beam co-op rescue tests |
| **M34** | 10 Agents | 2 Explorers, 3 Workers, 2 Reviewers, 2 Challengers, 1 Auditor | Symmetrical `BottomDashboard`, dual-player HUD zones, zero-GC DOM dirty-checking tests |
| **M35** | 12 Agents | 2 Explorers, 2 Workers, 2 Reviewers, 2 Challengers, 2 E2E Bot Specialists, 2 Victory Auditors | 50-agent swarm synthesis, Playwright dual-input E2E suites, full regression & Victory Audit |
| **Total** | **54 Subagents** | Full Swarm Mobilization | **Production-Ready Local 2-Player Co-op Mode** |

---

### 4. Claude & User Approval Request
To proceed with implementation of Phase 6 (Milestones M31–M35), explicit user approval is required.
- **Review Trigger**: The complete specification above is ready for Claude's review and human confirmation.
- **Action upon Approval ("승인" / "proceed")**: The Sentinel will immediately route and spawn `teamwork_preview_orchestrator`, establish dual crons (Progress & Liveness), and mobilize the 54-subagent swarm across Milestones M31–M35.

---

### 5. Milestone M34 Core Implementation Status (m34_worker)
- **Status**: ✅ **CORE IMPLEMENTATION COMPLETE**
- **Symmetrical 3-Zone Architecture**:
  - Zone 1 (Left P1 HUD): Cyan/White themed, `#dashboard-p1-score`, `#dashboard-p1-lives`, `#dashboard-p1-special`, `#dashboard-p1-powerups`, `#dashboard-p1-combo`, procedural SVG cyan ship icons.
  - Zone 2 (Center Tactical Telemetry & Controls): `#dashboard-stage-badge`, `#dashboard-coop-high-score`, `#dashboard-warning`, `#btn-dash-mute`, `#btn-dash-fullscreen`, `#btn-dash-pause`. Symmetrically reparented for mobile thumb-steering isolation.
  - Zone 3 (Right P2 HUD): Crimson/Amber themed, `#dashboard-p2-score`, `#dashboard-p2-lives`, `#dashboard-p2-special`, `#dashboard-p2-powerups`, `#dashboard-p2-combo`, procedural SVG crimson ship icons. Mirrored horizontally.
- **Zero-GC 60 FPS Dirty Checking Engine**:
  - 10,000 consecutive static frames produce strictly 0 DOM setter calls, 0 style writes, and 0 attribute mutations.
  - Pre-allocated frozen lookup tables `PERCENT_STRINGS` ('0%'..'100%') and `REVIVE_COUNTDOWN_STRINGS` ('REVIVE: 0S'..'REVIVE: 15S').
  - 0 heap allocations during steady-state animation loop.
- **Single-Player Backward Compatibility**:
  - 100% of single-player element IDs and classes (`#dashboard-score`, `#dashboard-high-score`, `#dashboard-lives`, `#dashboard-powerups`, `#dashboard-single-special`, `.dashboard-special-container`, `.special-charge-bar`) preserved.
  - Toggling `setMode('single')` collapses Zone 3 and reparents action buttons to Zone 3 with zero orphaned DOM nodes.
- **Verification Matrix**:
  - `npx tsc --noEmit`: 0 errors.
  - `tests/unit/m34_dual_dashboard.test.ts`: 34/34 tests passing (100%).
  - Full test suite (`npm test`): 120/120 test files passing, 2,200/2,200 tests passing (100%).
  - Production build (`npm run build`): Clean Vite build in 418ms, bundle size 221.25 kB (well below the 250 KB target).

---

## 🛡️ PHASE 7: Adversarial QA & Autonomous Remediation Specification (M36–M40)

> **Mission**: Conduct harsh, adversarial stress testing on the completed 2-Player Co-op Galaga web game using automated bots, chaos simulators, memory profilers, and code audits; autonomously identify and fix all edge cases, memory leaks, multi-touch collisions, and gameplay balance breakdowns; add defense regression tests while guaranteeing 100% pass of existing 2,244 tests and keeping bundle size <= 307.2 KB with a 30+ subagent swarm.

### 1. Requirements Overview (R1–R3)

- **R1. Adversarial QA & Bug Discovery (가혹한 적대적 테스트 및 버그 발굴)**:
  - **Automated/Manual Chaos Bots**:
    - *Boundary Violation*: Screen edge clamping, out-of-bounds position warping, negative coordinates, subpixel drift under extreme velocity.
    - *Revive Stress*: Infinite revive loops, zero-life donation spam, simultaneous dual death on frame 0, revive tether timeouts during boss phase transitions.
    - *Concurrent Input Slamming*: Simultaneous multi-touch (5+ touch points) overlapping keyboard WASD + Arrow keys, rapid direction switching at 60Hz, key repeat ghosting, blur/focus events during active firing.
    - *Memory Leak & Resource Profiling*: Heap snapshot inspection, detached DOM nodes in dual HUD, audio context leak during rapid pause/unpause, object pool leak under 1,000+ simultaneous entity spawns.
    - *Game Balance & State Machine Desync*: Dual Tractor beam capture while reviving, crisis event triggers during boss phase transitions, score overflow/NaN checks, high-speed dive-bomb collision misses.
- **R2. Autonomous Remediation (자율적 문제 해결)**:
  - Agent swarm analyzes root causes for all discovered defects.
  - Apply surgical fixes adhering strictly to:
    - Zero-allocation steady-state loop (ObjectPool reuse, frozen lookup tables).
    - 60 FPS frame timing budget (< 16.67ms per frame).
    - Pure Canvas procedural rendering & Web Audio API synthesis (0 external assets).
- **R3. Regression Defense & Test Fortification (회귀 테스트 방어)**:
  - 100% preservation of all 2,244 baseline tests.
  - New defensive unit, integration, and E2E regression tests for each discovered edge case.
  - Strict production bundle size verification (< 307.2 KB limit).

---

### 2. Milestone Decomposition (M36–M40)

| Milestone | Focus | Subagents Mobilized | Key Deliverables |
|---|---|---|---|
| **M36: Adversarial Exploration & Chaos Simulation** | Boundary, Revive & Input Stress Bots | 8 Subagents (3 Explorers, 2 Chaos Testers, 2 Reviewers, 1 Auditor) | Adversarial test suite, automated chaos bot runners, initial bug catalog & telemetry report |
| **M37: Memory Leak, Audio & Zero-GC Profiling** | Heap soak, DOM node retention, ObjectPool leak audit | 7 Subagents (2 Explorers, 2 Profilers, 2 Reviewers, 1 Auditor) | 10,000-frame soak test, heap drift telemetry, detached DOM audit, audio node recycling report |
| **M38: Autonomous Bug Remediation Swarm** | Root-cause analysis & surgical code fixes | 8 Subagents (2 Explorers, 3 Fix Workers, 2 Reviewers, 1 Auditor) | Surgical fixes in `PlayerManager.ts`, `InputHandler.ts`, `BottomDashboard.ts`, `Game.ts` |
| **M39: Defensive Regression Test Fortification** | Anti-regression test suites & bundle audit | 7 Subagents (2 Test Workers, 2 Reviewers, 2 Challengers, 1 Auditor) | New dedicated regression tests, `npm test` 100% pass verification, bundle size verification (<= 307.2 KB) |
| **M40: Adversarial E2E Playtest Verification & Victory Audit** | End-to-end chaos matrix & forensic audit | 8 Subagents (2 E2E Specialists, 2 Challengers, 2 Reviewers, 2 Victory Auditors) | Comprehensive Adversarial QA & Remediation Report, Playwright E2E verification, Victory Audit Attestation |
| **Total** | **Full Swarm Mobilization** | **38 Subagents (30+ required)** | **Zero-Defect, Fortified 2-Player Co-op Arcade Game** |

---

### 3. Acceptance Criteria Checklist

- [ ] **Automated/Manual Chaos Playtest Report**: Comprehensive report documenting extreme bot stress tests (screen boundary escapes, infinite revives, touch+keyboard slamming), error logs captured, and defect taxonomy.
- [ ] **Autonomous Bug Fixes**: All identified edge cases, memory leaks, and input collisions resolved without degrading 60 FPS or zero-GC invariants.
- [ ] **100% Test Suite Pass**: All 2,244 existing unit tests + new defensive tests pass with zero errors (`npm test`).
- [ ] **Bundle Size Budget**: Production bundle (`npm run build`) strictly <= 307.2 KB (currently ~222 KB).
- [ ] **Zero-GC & Memory Invariants**: Heap drift strictly < 2.0 MB over 10,000 frames, 0 detached DOM nodes, 0 unreleased audio nodes.

---

### 4. Claude & User Approval Protocol
Per user global instructions:
- **Approval Gate**: Implementation (modifying source code or tests) will NOT begin until the user explicitly says **"승인"**, **"proceed"**, or **"go ahead"**.
- **Claude Review**: Claude can review this proposed Phase 7 specification, suggest additional adversarial scenarios, or approve the architecture.
- **Trigger Keyword**: When user enters **`내용확인`**, the team will review any latest instructions from Claude and immediately mobilize the orchestrator and swarm.
