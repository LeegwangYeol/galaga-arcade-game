## 2026-09-15T07:36:00Z

<USER_REQUEST>
You are m38_engine_worker (Role: Core Engine & Zero-GC Remediation Worker).
Working directory: /Users/user/src/galog/.agents/m38_engine_worker
Project root: /Users/user/src/galog

Read ORIGINAL_REQUEST.md and COLLABORATION.md first.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVELY OWNED FILES (You may ONLY modify these files):
- `src/core/Game.ts`
- `src/systems/FormationManager.ts`
- `src/audio/SoundSynth.ts`
- `src/main.ts`

TASKS:
1. `src/core/Game.ts`:
   - Co-op Special Move & Cycle multiplexing in `updatePlaying()`:
     Loop over `['p1', 'p2'] as const` and check `this.inputHandler.consumeAction('special', pId) || this.inputHandler.consumeAction('specialMove', pId)` -> call `this.specialMovesManager?.trigger(undefined, pId)`. Also check `cycleSpecial` per player.
   - Symmetrical Telekinetic Stun in `updatePlaying()`:
     Store previous X coordinates for all players in `this.playerManager.getPlayers()` and apply the 25% damping to all players when `this.bossManager.playerStunTimer > 0`, rather than only `this.player.x`.
   - Zero-GC Chrono Field (M37-D3): Pre-allocate `private readonly _scratchChronoField = { x: 0, y: 0, radiusSq: 14400, slowFactor: 0.40 };` as a Game member and pass cached reference.
   - Zero-GC Render Context (M37-D4): Pre-allocate `_hudRenderState` and `_screenRenderCtx` on Game, updating properties in-place.
   - FullscreenManager unbind callback tracking: In `bindToggleButton`, store the unbinder callback in a private field and invoke it in `Game.destroy()`.
   - AudioContextManager auto-unlock cleanup: In `Game.destroy()`, call `this.audioContextManager?.detachAutoUnlockListeners();`.
   - Stage clear munition cleanup (M37-H1): In `Game.setState('STAGE_CLEAR')`, call `this.bulletManager.clear()` and `this.powerUpManager?.reset()`.
   - In `Game.destroy()`: Nullify `this.canvas`.

2. `src/systems/FormationManager.ts`:
   - Dive scheduler allocation (Zero-GC M37-D6): Single-pass enemy categorization using pre-allocated arrays/buffers (`_formationZakos`, `_formationGoeis`, `_formationBosses`) instead of chaining 7 `.filter()` calls.
   - Slot calculation (Zero-GC M37-D7): Pass `this.scratchSlotPos` as 4th argument to `getSlotPosition()`.

3. `src/audio/SoundSynth.ts`:
   - Immediate node disconnection in `stopAll()` (M37-H2): Disconnect all active voice nodes immediately upon `stopAll()`.

4. `src/main.ts`:
   - Export `teardown(): void` to cleanly invoke `gameInstance?.destroy(); gameInstance = null;`.

VERIFICATION:
Run the following commands and ensure all pass cleanly:
`npx vitest run tests/unit/adversarial_m37_memory_soak.test.ts` (All 12 tests must pass!)
`npx vitest run tests/unit/adversarial_chaos_input.test.ts tests/unit/adversarial_chaos_boundary_revive.test.ts`
`npx tsc --noEmit` (0 errors!)

Write `handoff.md` in your working directory documenting the exact changes, test outputs, and verification commands. Notify parent when done.
</USER_REQUEST>
