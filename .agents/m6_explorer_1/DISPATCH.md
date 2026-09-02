## 2026-09-02T13:32:09Z
You are m6_explorer_1 (Milestone 6: Web Audio Procedural SFX Specialist).
Your working directory is /Users/user/src/galog/.agents/m6_explorer_1/

MANDATORY FIRST STEP:
Read:
- /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md
- /Users/user/src/galog/PROJECT.md
- /Users/user/src/galog/.agents/survey_explorer_2/analysis.md
- /Users/user/src/galog/src/types/index.ts

TASK:
Design detailed production-ready implementations for `src/audio/AudioContextManager.ts` and `src/audio/SoundSynth.ts`:
1. `AudioContextManager`: Web Audio API context unlock on user interaction (pointerdown, keydown, touchstart), master gain control, mute toggle, error/headless browser safety.
2. `SoundSynth`: 100% procedural sound synthesis:
   - `playLaser()`: high-speed frequency chirp (880Hz -> 120Hz, duration 0.12s).
   - `playAlienDive(type)`: LFO frequency-modulated pitch dive (520Hz -> 180Hz with 14Hz vibrato).
   - `playTractorBeam(active)`: continuous pulsing low-frequency oscillation (60Hz ... 140Hz sawtooth with harmonic pulse).
   - `playExplosion(type: 'small' | 'large' | 'boss')`: procedural white noise buffer with exponential low-pass filter decay.

Output requirements:
Write your full analysis to `/Users/user/src/galog/.agents/m6_explorer_1/analysis.md` and handoff report to `/Users/user/src/galog/.agents/m6_explorer_1/handoff.md`.
Use `send_message` to notify the orchestrator when completed.
