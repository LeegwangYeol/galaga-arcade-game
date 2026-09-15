## 2026-09-15T07:35:39Z

You are m38_player_worker (Role: Player & Kinematics Remediation Worker).
Working directory: /Users/user/src/galog/.agents/m38_player_worker
Project root: /Users/user/src/galog

Read ORIGINAL_REQUEST.md and COLLABORATION.md first.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVELY OWNED FILES (You may ONLY modify these files):
- `src/entities/Player.ts`
- `src/systems/PlayerManager.ts`

TASKS:
1. `src/entities/Player.ts`:
   - In `clampPosition()`: Check `if (!Number.isFinite(this.x))`. If true, reset `this.x = this.id === 'p2' ? 144 : (minX + maxX) / 2; this.vx = 0;`. Otherwise, clamp between `minX` and `maxX`.
   - In `update(dt: number, input?: InputState)`: Sanitize `dt`: `const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);` and use `safeDt`. Unconditionally call `this.clampPosition()` at the end of `update()`, even if `!input`.
   - In `updateControllable()`: Guard pointer input: `if (input.pointerActive && input.pointerX !== null && Number.isFinite(input.pointerX))`.
   - In phase warp consumption: Change `this.game.inputHandler.consumePhaseWarp();` to `this.game.inputHandler.consumePhaseWarp(this.id);`.
   - In `updateCapturing()`: When capture completes and `this.lives <= 0`, if in co-op mode, transition to `this._state = 'captured'` and trigger `this.onCapturedComplete?.()`. Ensure player remains valid for rescue/donation.
   - Weapon discharge zero-GC (M37-D5): Use a preallocated buffer `private static readonly _spawnBuffer: BulletSpawnRequest[] = [];` to avoid creating array and object literals on every shot.

2. `src/systems/PlayerManager.ts`:
   - Zero-GC `getPlayers()` (M37-D1): Preallocate cached arrays `private readonly p1Array = [this.p1];` and `private readonly coopArray = [this.p1, this.p2];`. Return the cached array based on mode/p2 rather than creating `[this.p1, this.p2]` every frame.
   - Zero-GC `getLivingPlayers()` (M37-D2): Preallocate `private readonly livingPlayersBuffer: Player[] = [];`. Reset with `.length = 0` and populate in-place with a for-loop without allocating closures or arrays.
   - Donor-Aware Game Over Detection in `areAllPlayersDead()`:
     Check if any player has reserve lives available to donate (`players.some(p => p.lives > 1 && p.isAlive())`). If all players have `lives <= 0` and no player has reserve lives to donate, do NOT wait for the 10s `reviveTimer` — immediately return `true`.
   - Tractor beam 0-life donation in `canDonateLife()`:
     Allow donation if recipient is in `'captured'` with `lives <= 0`:
     `((s === 'destroyed' || s === 'eliminated' || s === 'captured') && recipient.lives <= 0)`.

VERIFICATION:
Run the following commands and ensure all pass cleanly:
`npx vitest run tests/unit/adversarial_chaos_boundary_revive.test.ts` (All 29 tests must pass, 0 failures!)
`npx vitest run tests/unit/m31_player_manager.test.ts tests/unit/m33_revive.test.ts`
`npx tsc --noEmit` (0 errors!)

Write `handoff.md` in your working directory documenting the exact changes, test outputs, and verification commands. Notify parent when done.
