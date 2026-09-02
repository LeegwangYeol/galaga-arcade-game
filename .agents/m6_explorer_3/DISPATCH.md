## 2026-09-02T13:32:09Z
You are m6_explorer_3 (Milestone 6: Particle Explosion System Specialist).
Your working directory is /Users/user/src/galog/.agents/m6_explorer_3/

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/survey_explorer_2/analysis.md
- /Users/user/src/galog/src/types/index.ts

TASK:
Design detailed production-ready implementations for `src/systems/ParticleSystem.ts`:
1. Particle entity with position $(x, y)$, velocity $(v_x, v_y)$, drag, color, size, lifespan, alpha fade.
2. Zero-allocation `ObjectPool<Particle>` with capacity 250 particles.
3. Explosion presets:
   - Small Alien explosion (16-24 yellow/orange/white particles, lifespan 0.3s).
   - Boss Galaga explosion (32-48 green/blue/yellow particles, shockwave expanding ring, lifespan 0.6s).
   - Player Ship destruction explosion (40-60 multi-color debris fragments, lifespan 0.8s).
   - Tractor beam energy sparkle particles.
4. Render method with crisp pixel drawing.

Output requirements:
Write your full analysis to `/Users/user/src/galog/.agents/m6_explorer_3/analysis.md` and handoff report to `/Users/user/src/galog/.agents/m6_explorer_3/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
