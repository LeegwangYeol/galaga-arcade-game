# Dispatch: teamwork_preview_orchestrator_6

## Mission
Resume and complete the Galaga Ultimate Expansion.
The project baseline is verified and certified:
- M1-M8 Core 1981 Galaga arcade engine
- M9 50-Round Non-linear Scaling Engine
- M10 11 Stellaris Crisis Events Engine
- M11 Player Upgrades & Power-Up System (PowerUpManager, ObjectPool bounded to 32, Canvas 2D fallback mocks)
- 36 test files, 764 tests passing with zero failures.

You are resuming from the state of `teamwork_preview_orchestrator_5`. Proceed directly with:
1. **Milestone 12**: 5 Epic Multi-Phase Boss Encounters (Stages 10, 20, 30, 40, 50)
   - Stage 10: Cyber Dreadnought (사이버 전함) - Phase 1: twin laser turrets & escort drones; Phase 2: rotating spiral bullet ring barrage.
   - Stage 20: Dimensional Leviathan (차원수 레비아탄) - Phase 1: phase-shift invulnerability & dimensional tears; Phase 2: radial shockwaves & black-hole gravity suction vortex.
   - Stage 30: Nanite Swarm Colossus (나노머신 거신) - Phase 1: 4 mini-construct split; Phase 2: reassembly & gray goo dissolving player bullets.
   - Stage 40: Psionic Shroud Harbinger (장막의 사자) - Phase 1: 2 phantom clones dive-bombing; Phase 2: telekinetic stun pulses disrupt player thrusters.
   - Stage 50: Aeternum Star-Eater Core (항성 포식자) - Phase 1: orbital satellite generators shield; Phase 2: dark matter beam sweep; Phase 3 (Enrage): bullet hell barrage.
2. **Milestone 13**: Allies Support System & 3 Special Moves (고유 필살기)
   - 3 Wingmen Drones: Escort Drone (autofire forward), Kinetic Aegis Drone (barrier regen pulse), Bomber Drone (carpet-bomb formations).
   - 3 Special Moves (`X` key / virtual button): Nova Barrage (full-screen homing laser), Chrono Freeze (3s enemy freeze), Dimensional Warp Ram (invulnerable hyper-speed ram).
3. **Milestone 14**: Procedural Audio & VFX
   - Web Audio SFX procedural oscillators & noise generators for boss attacks, crisis audio cues, drone weapons, and special moves.
   - Procedural Canvas pixel art matrices and shader effects (screen shake, flash, rift shaders).
4. **Milestone 15**: 50-Round Memory Bot & QA Controller
   - `window.__GALAGA_CHEAT__` controller (`skipToStage`, `triggerCrisis`, `spawnBoss`, `triggerSpecialMove`, `setInvincible`).
   - Headless Playwright 50-round continuous simulation ensuring 0 runtime errors and < 5MB net heap drift.
5. **Milestone 16**: Swarm Adversarial Hardening & Final Victory Audit
   - Full test suite passing 100%, comprehensive adversarial stress tests, and victory claim to Sentinel.

## Key Constraints
- Pure Canvas pixel matrices & Web Audio API procedural synthesis (zero external png/mp3/wav files).
- Zero-GC invariant during 60 FPS gameplay loops (utilize ObjectPool).
- Full backward compatibility with existing 764 Vitest tests.
- Working directory: `/Users/user/teamwork_projects/galaga_game` (mirrored at `/Users/user/src/galog`).
- Agent directory: `/Users/user/teamwork_projects/galaga_game/.agents/teamwork_preview_orchestrator_6`.
- Read authoritative specs in `COLLABORATION.md`, `PROJECT.md`, and `.agents/ORIGINAL_REQUEST.md`.
