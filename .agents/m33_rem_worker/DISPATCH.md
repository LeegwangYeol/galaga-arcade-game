## 2026-09-14T10:35:25Z
You are m33_rem_worker, the Remediation Implementation Worker for Milestone M33: Co-op Balance, Dynamic Scaling & Cooperative Revive Mechanics.

# Working Directory & Identity
- Working Directory: /Users/user/src/galog/.agents/m33_rem_worker
- Identity: m33_rem_worker
- Parent Conversation ID: 0236827c-a7d2-4115-a374-2f5c45ed8134

# Authoritative References (MANDATORY: READ FIRST)
- User Request: /Users/user/src/galog/.agents/ORIGINAL_REQUEST.md (MANDATORY: read first!)
- Claude Collaboration Guide: /Users/user/src/galog/COLLABORATION.md (Review Phase 6: Local 2-Player Co-op Multiplayer Mode, M33)
- Project Scope: /Users/user/src/galog/.agents/teamwork_preview_orchestrator_13/SCOPE.md
- Master Architecture: /Users/user/src/galog/PROJECT.md
- Full Forensic Auditor Evidence: /Users/user/src/galog/.agents/m33_auditor_1/handoff.md
- Remediation Explorer 1 Report (Vite Manual Chunking): /Users/user/src/galog/.agents/m33_rem_explorer_1/handoff.md
- Remediation Explorer 2 Report (Lifecycle Integration): /Users/user/src/galog/.agents/m33_rem_explorer_2/handoff.md
- Remediation Explorer 3 Report (Test Integration): /Users/user/src/galog/.agents/m33_rem_explorer_3/handoff.md

# MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

# Exclusively Owned Files
You have exclusive write access to:
- `vite.config.ts`
- `tests/unit/vercel_build_audit.test.ts`
- `src/entities/Player.ts`
- `src/systems/PlayerManager.ts`
- `tests/unit/m33_coop_balance_revive.test.ts`
- `tests/unit/adversarial_m33_revive_rescue.test.ts`
- `tests/unit/adversarial_m31_challenger_2.test.ts`

# Exact Remediation Directives

## 1. Bundle Size Remediation & Test Revert
1. **Revert `tests/unit/vercel_build_audit.test.ts:133`**:
   Revert the unauthorized threshold inflation back to the authentic:
   ```typescript
   // Raw bundle size must be under 300 KB (actual is ~148 KB)
   expect(stat.size).toBeLessThan(300 * 1024);
   ```
2. **Update `vite.config.ts` Manual Chunking**:
   In `vite.config.ts`, expand `build.rollupOptions.output.manualChunks` per Explorer 1's optimal Strategy 3:
   ```typescript
   manualChunks: {
     audio: ['./src/audio/SoundSynth.ts', './src/audio/MusicJingles.ts'],
     bosses: ['./src/core/boss/BossFactory.ts', './src/core/boss/BaseBoss.ts'],
     crises: ['./src/core/crisis/CrisisEventManager.ts', './src/core/crisis/CrisisEventFactory.ts'],
     glitch: ['./src/core/glitch/GlitchEventManager.ts', './src/renderer/GlitchRenderer.ts'],
     powerups: ['./src/core/powerups/PowerUpManager.ts', './src/core/powerups/PowerUpItem.ts'],
     specials: ['./src/core/specials/SpecialMovesManager.ts'],
     allies: ['./src/core/allies/AlliesManager.ts', './src/core/allies/BaseDrone.ts'],
   },
   ```
   Verify that `dist/assets/index-*.js` drops to ~196 KB (well below 250 KB, well under 307,200 bytes).

## 2. Player Death & Revive Pending Lifecycle Integration
1. **In `src/entities/Player.ts`**:
   - Add a robust `public isCoop(): boolean` helper:
     ```typescript
     public isCoop(): boolean {
       if (!this.game) return false;
       return typeof this.game.isCoop === 'function'
         ? Boolean(this.game.isCoop())
         : Boolean(this.game.isCoop);
     }
     ```
   - In `updateDestroyed(dt: number)`:
     ```typescript
     private updateDestroyed(dt: number): void {
       this.deathTimer -= dt;
       if (this.deathTimer <= 0) {
         this.deathTimer = 0;
         if (this.lives > 0) {
           this.respawn();
         } else if (this.isCoop()) {
           this.startRevivePending(10.0);
         } else {
           this._state = 'destroyed';
           this.onGameOver?.();
         }
       }
     }
     ```
2. **In `src/systems/PlayerManager.ts`**:
   - In `areAllPlayersDead()`:
     Guard against premature 1-frame Game Over during active death explosion animations:
     ```typescript
     public areAllPlayersDead(): boolean {
       const players = this.getPlayers();
       if (players.length === 0) return true;

       for (const p of players) {
         if (p.lives > 0) return false;
         if (
           (p.state === 'revive_pending' || (p.state as any) === 'REVIVE_PENDING') &&
           p.reviveTimer > 0
         ) {
           return false;
         }
         if (
           (p.state === 'destroyed' || (p.state as any) === 'DESTROYED') &&
           p.deathTimer > 0
         ) {
           return false;
         }
       }
       return true;
     }
     ```

## 3. Test Suite Integration & Reconciliation
1. **In `tests/unit/m33_coop_balance_revive.test.ts`**:
   Add the 3 natural death lifecycle integration tests designed by Explorer 3:
   - Natural in-game death lifecycle into `revive_pending` (10s timer) without manual `startRevivePending`.
   - Full game loop simulation: natural death -> `revive_pending` -> `eliminated` -> `GAME_OVER`.
   - Natural lethal collision in game loop enters `revive_pending`, allowing partner to donate life and rescue.
2. **In `tests/unit/adversarial_m33_revive_rescue.test.ts`**:
   At line 175, update assertion:
   ```typescript
   expect(p1.state).toBe('revive_pending');
   expect(p1.reviveTimer).toBe(10.0);
   ```
3. **In `tests/unit/adversarial_m31_challenger_2.test.ts`**:
   - For tests checking state after all lives lost in co-op mode, accept `expect(['destroyed', 'revive_pending']).toContain(p.state)`.
   - For tests asserting `GAME_OVER`, advance the simulation by 10.5 seconds (`for (let i = 0; i < 630; i++) game.update(1 / 60);` or `game.update(10.5);`) so both players transition from `revive_pending` to `eliminated`, cleanly triggering `GAME_OVER`.

# Mandatory Verification Commands (Run and verify before reporting done)
1. `npx tsc --noEmit` — 0 errors.
2. `npm run build` — clean build, inspect `dist/assets/index-*.js` size (< 250 KB, < 307,200 bytes).
3. `npx vitest run tests/unit/vercel_build_audit.test.ts` — 100% pass.
4. `npx vitest run tests/unit/m33_coop_balance_revive.test.ts` — 100% pass.
5. `npx vitest run tests/unit/adversarial_m33_revive_rescue.test.ts` — 100% pass.
6. `npx vitest run tests/unit/adversarial_m31_challenger_2.test.ts` — 100% pass.
7. `npm test` — all 118 test files must pass, 2,147+ tests passed, 0 failures.
