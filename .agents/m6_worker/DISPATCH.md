# Dispatch Assignment — Milestone 6 Implementation Worker

## 2026-09-02T13:35:00Z

<USER_REQUEST>
You are m6_worker (Milestone 6 Implementation Worker).
Your working directory is /Users/user/src/galog/.agents/m6_worker/

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/m6_explorer_1/analysis.md
- /Users/user/src/galog/.agents/m6_explorer_2/analysis.md
- /Users/user/src/galog/.agents/m6_explorer_3/analysis.md
- /Users/user/src/galog/src/types/index.ts

SCOPE OF WORK & EXCLUSIVE FILE OWNERSHIP:
You exclusively own:
- `/Users/user/src/galog/src/audio/AudioContextManager.ts`
- `/Users/user/src/galog/src/audio/SoundSynth.ts`
- `/Users/user/src/galog/src/audio/MusicJingles.ts`
- `/Users/user/src/galog/src/systems/ParticleSystem.ts`
- `/Users/user/src/galog/src/core/Game.ts`
- `/Users/user/src/galog/tests/unit/audio_particles.test.ts`

EXECUTION INSTRUCTIONS:
1. Implement `src/audio/AudioContextManager.ts` (Web Audio API context unlock on first user gesture, master gain node, mute toggle, headless test mock safety).
2. Implement `src/audio/SoundSynth.ts` (pure procedural synthesis: laser chirp, dual laser, alien dive warble, continuous tractor beam oscillation, explosion noise buffers with low-pass filters, Boss hit ticks).
3. Implement `src/audio/MusicJingles.ts` (procedural note scheduling and pulse waves for Stage Start Fanfare, Challenging Stage theme & 10k perfect fanfare, Dual Docking chime, Game Over tune).
4. Implement `src/systems/ParticleSystem.ts` (zero-allocation ObjectPool with 250 capacity, Small Alien, Boss Galaga shockwave ring, Player multi-color debris, and tractor sparkles).
5. Update `src/core/Game.ts` to trigger audio and particle effects on laser firing, enemy dive attacks, alien explosions, tractor beam activation, player destruction, docking, and stage changes.
6. Write comprehensive unit tests in `tests/unit/audio_particles.test.ts` verifying AudioContext unlock, frequency math, note scheduler, and ParticleSystem physics / pooling.
7. Run `npm run typecheck`, `npm run build`, and `npm test`. Ensure 100% pass with 0 errors.
8. Commit changes: `git add . && git commit -m "feat(audio-particles): implement procedural Web Audio API synthesizer, chiptune fanfares, and particle explosion engine"`.

Output requirements:
Write your progress to `/Users/user/src/galog/.agents/m6_worker/progress.md` and handoff report to `/Users/user/src/galog/.agents/m6_worker/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
</USER_REQUEST>
